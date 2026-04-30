import { NextRequest, NextResponse } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';
import { generateAICompletion } from '@/lib/ai';
import { rateLimit } from '@/lib/rate-limiter';
import {
    LessonAccessError,
    MAX_STORED_MESSAGES,
    assertLessonAccess,
    buildChatTitle,
    buildTrimmedPrompt,
    getSafeAIErrorCode,
    normalizeMessages,
    parseAssistantContent,
    tutorRequestSchema,
    type ChatRow,
    type LessonContext,
    type StudyIntent,
    type StudyMessage,
    type StudyMode,
} from '@/lib/study-companion';

const getSystemPrompt = (
    gradeLevel: string,
    mode: StudyMode,
    intent: StudyIntent,
    lesson?: LessonContext
) => {
    let prompt = `You are a study companion for a grade ${gradeLevel} student. Your default job is to help the learner plan, practice, recall, reflect, and stay active. You can switch into tutor mode on demand when the learner asks for explanation, a walkthrough, or deeper help.

Current mode: ${mode}
Current learner intent: ${intent}`;

    if (lesson) {
        prompt += `\n\nYou are specifically helping with the lesson "${lesson.title}" in the subject "${lesson.subject}".`;
        if (lesson.objectives) {
            prompt += `\nThe learning objectives for this lesson are:\n${lesson.objectives}`;
        }
    }

    prompt += `\n\nBehavior rules:
- Prefer active learning over answer dumping.
- Use the assistance ladder: clarify -> nudge -> hint -> partial step -> worked example -> direct solution.
- In companion mode, start with a short question or activity unless the learner clearly needs instruction.
- In tutor mode, explain clearly, check understanding, then give a similar practice task.
- For homework-like requests, ask for the learner's attempt first or give a similar example before a final answer.
- Refuse live cheating requests, then offer practice on the same concept.
- Keep responses concise and grade-appropriate. Use markdown inside the content string when useful.

Intent guidance:
- plan: create a realistic study plan and ask for missing goal/time information if needed.
- quiz: ask one question at a time and wait for the learner's answer.
- hint: give the smallest useful nudge, not a full answer.
- explain: teach the concept clearly, then ask one check-for-understanding question.
- walkthrough: guide step by step and pause for learner input.
- review: identify weak spots and turn them into a short review queue.

Return ONLY a JSON object with this shape:
{
  "content": "main response markdown",
  "mode": "companion" | "tutor",
  "intent": "general" | "plan" | "hint" | "explain" | "quiz" | "review" | "walkthrough",
  "followUpQuestions": ["short learner-facing question"],
  "suggestedActions": [
    { "label": "Quiz me", "intent": "quiz", "prompt": "Quiz me one question at a time on this topic." }
  ]
}

Use 2-3 suggestedActions at most.`;

    return prompt;
};

export async function POST(req: NextRequest) {
    try {
        const rateLimitResponse = await rateLimit(req, 'tutor');
        if (rateLimitResponse) {
            return rateLimitResponse;
        }

        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        // Verify user is a student
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        if (!userData || userData.role !== 'student') {
            return new NextResponse('Unauthorized - Student access required', { status: 403 });
        }

        // Get student's grade level
        const { data: student } = await supabase
            .from('students')
            .select('grade')
            .eq('user_id', user.id)
            .maybeSingle();

        const parsedBody = tutorRequestSchema.safeParse(await req.json());
        if (!parsedBody.success) {
            return NextResponse.json(
                { message: 'Invalid study companion request', issues: parsedBody.error.flatten() },
                { status: 400 }
            );
        }

        const { chatId, content, mode, intent } = parsedBody.data;
        const gradeLevel = student?.grade ?? "the student's current level";

        let existingChat: ChatRow | null = null;
        if (chatId) {
            const { data, error } = await supabase
                .from('chats')
                .select('id, userid, lessonid, title, messages, createdat, updatedat')
                .eq('id', chatId)
                .eq('userid', user.id)
                .maybeSingle();
            if (error) throw error;
            if (!data) {
                return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
            }
            existingChat = data as ChatRow;
        }

        const effectiveLessonId = existingChat?.lessonid ?? parsedBody.data.lessonId ?? null;
        let lesson: LessonContext | undefined;
        if (effectiveLessonId) {
            try {
                lesson = await assertLessonAccess(supabase, effectiveLessonId, student?.grade);
            } catch (error) {
                if (error instanceof LessonAccessError) {
                    return NextResponse.json({ message: 'Lesson not found or not accessible' }, { status: 403 });
                }
                throw error;
            }
        }

        const userMessage: StudyMessage = {
            role: 'user',
            content,
            timestamp: new Date().toISOString(),
            lessonId: effectiveLessonId ?? undefined,
            mode,
            intent,
        };

        const previousMessages = normalizeMessages(existingChat?.messages);
        const lastMessage = previousMessages.at(-1);
        const isRetryingSavedUserTurn = lastMessage?.role === 'user' && lastMessage.content === content;
        const messagesWithUser = (isRetryingSavedUserTurn ? previousMessages : [...previousMessages, userMessage]).slice(-MAX_STORED_MESSAGES);

        let persistedChatId = existingChat?.id;
        const now = new Date().toISOString();

        if (!persistedChatId) {
            const { data, error } = await supabase
                .from('chats')
                .insert({
                    userid: user.id,
                    lessonid: effectiveLessonId,
                    messages: messagesWithUser,
                    title: buildChatTitle(content),
                    createdat: now,
                    updatedat: now,
                })
                .select('id')
                .single();
            if (error) throw error;
            persistedChatId = data.id;
        } else {
            const { error } = await supabase
                .from('chats')
                .update({
                    messages: messagesWithUser,
                    updatedat: now,
                })
                .eq('id', persistedChatId)
                .eq('userid', user.id);
            if (error) throw error;
        }

        try {
            const content = await generateAICompletion(
                getSystemPrompt(gradeLevel, mode, intent, lesson),
                buildTrimmedPrompt(messagesWithUser, mode, intent),
                undefined,
                true
            );
            const parsedResponse = parseAssistantContent(content || '', mode, intent);

            const tutorMessage: StudyMessage = {
                role: 'assistant',
                content: parsedResponse.content,
                followUpQuestions: parsedResponse.followUpQuestions,
                suggestedActions: parsedResponse.suggestedActions,
                mode: parsedResponse.mode,
                intent: parsedResponse.intent,
                timestamp: new Date().toISOString()
            };

            const { error } = await supabase
                .from('chats')
                .update({
                    messages: [...messagesWithUser, tutorMessage].slice(-MAX_STORED_MESSAGES),
                    updatedat: new Date().toISOString(),
                })
                .eq('id', persistedChatId)
                .eq('userid', user.id);
            if (error) throw error;

            return NextResponse.json({
                message: tutorMessage,
                chatId: persistedChatId,
                aiStatus: 'ok',
            });
        } catch (error) {
            console.error('AI provider unavailable:', error);
            return NextResponse.json({
                chatId: persistedChatId,
                aiStatus: 'unavailable',
                errorCode: getSafeAIErrorCode(error),
            });
        }
    } catch (error) {
        console.error('Error in AI tutor:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
