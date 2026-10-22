import { NextResponse } from 'next/server';
import { createSSRUserSupabase } from '@/lib/supabase.server';
import { generateAICompletion } from '@/lib/ai';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase.server';
import { normalizePublishedObjectives } from '@/lib/lesson-artifacts/student-learning';
import { getUserSchoolId, inActiveSchool } from '@/lib/school';
import { enforceDailyCap } from '@/lib/daily-caps';

async function publishedLessonForStudent(userId: string, lessonId: string, studentGrade: string | null) {
    const db = createServerSupabase();
    const [{ data: lesson, error }, schoolId] = await Promise.all([
        db.from('lessons')
            .select('id,gradelevel,current_publication_id,organization_id,archived_at')
            .eq('id', lessonId)
            .maybeSingle(),
        getUserSchoolId(db, userId),
    ]);
    if (error) throw error;
    const lessonGrade = lesson?.gradelevel?.trim().toLowerCase();
    if (
        !lesson || lesson.archived_at || !lesson.current_publication_id ||
        !inActiveSchool(schoolId, lesson.organization_id) ||
        !lessonGrade || lessonGrade !== studentGrade?.trim().toLowerCase()
    ) return null;
    const { data: publication, error: publicationError } = await db
        .from('lesson_publications')
        .select('manifest')
        .eq('id', lesson.current_publication_id)
        .maybeSingle();
    if (publicationError) throw publicationError;
    const snapshot = publication?.manifest?.lesson;
    if (!snapshot?.title || !snapshot?.subject) return null;
    const objectives = normalizePublishedObjectives(publication?.manifest?.objectives ?? []) ?? [];
    return {
        title: String(snapshot.title),
        subject: String(snapshot.subject),
        gradeLevel: String(snapshot.gradeLevel ?? lesson.gradelevel ?? ''),
        objectives: objectives.filter((objective) => objective.text).map((objective) => ({ id: objective.id, text: objective.text })),
    };
}

interface Question {
    question: string;
    type: 'multiple_choice' | 'multiple_select' | 'true_false' | 'short_answer';
    options: string[];
    correctAnswer: string | string[];
    explanation: string;
    points: number;
}

// Zod schema for individual questions using discriminated union
const questionSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('multiple_choice'),
        question: z.string().min(1),
        options: z.array(z.string()).length(4),
        correctAnswer: z.string().min(1),
        explanation: z.string().min(1),
        points: z.number().int().min(1).max(5)
    }),
    z.object({
        type: z.literal('multiple_select'),
        question: z.string().min(1),
        options: z.array(z.string()).length(4),
        correctAnswer: z.array(z.string()).min(1),
        explanation: z.string().min(1),
        points: z.number().int().min(1).max(5)
    }),
    z.object({
        type: z.literal('true_false'),
        question: z.string().min(1),
        options: z.tuple([z.literal("True"), z.literal("False")]),
        correctAnswer: z.enum(["True", "False"]),
        explanation: z.string().min(1),
        points: z.number().int().min(1).max(5)
    }),
    z.object({
        type: z.literal('short_answer'),
        question: z.string().min(1),
        // No options for short answer
        correctAnswer: z.string().min(1),
        explanation: z.string().min(1),
        points: z.number().int().min(1).max(5)
    })
]);

// Zod schema for the overall exercises object (uses the discriminated union)
const exercisesSchema = z.object({
    questions: z.array(questionSchema)
});

export async function POST(req: Request) {
    try {
        const supabase = await createSSRUserSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // Verify user is a student
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        if (!userData || userData.role !== 'student') {
            return NextResponse.json({ message: 'Unauthorized - Student access required' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const type = typeof body.type === 'string' ? body.type : 'standard';
        const difficulty = typeof body.difficulty === 'string' ? body.difficulty : 'medium';
        let subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 60) : '';
        let topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 100) : '';
        let gradeLevel = '';
        let objectives: string[] = [];

        const { data: student } = await supabase
            .from('students')
            .select('grade')
            .eq('user_id', user.id)
            .maybeSingle();
        gradeLevel = student?.grade ?? '';

        // Practice started from a lesson is built from what the student can
        // see: the published snapshot, with the same school and grade checks
        // as the student lesson page.
        if (typeof body.lessonId === 'string' && body.lessonId) {
            const published = await publishedLessonForStudent(user.id, body.lessonId, student?.grade ?? null);
            if (!published) {
                return NextResponse.json({ message: 'This lesson is not available for practice.' }, { status: 404 });
            }
            subject = published.subject;
            topic = published.title;
            gradeLevel = published.gradeLevel || gradeLevel;
            // "Practise this objective" narrows the set to one objective.
            const focus = typeof body.objectiveId === 'string'
                ? published.objectives.filter((objective) => objective.id === body.objectiveId)
                : [];
            objectives = (focus.length ? focus : published.objectives).map((objective) => objective.text);
        }

        if (!subject || !topic) {
            return NextResponse.json({ message: 'Choose a subject and topic to practise.' }, { status: 400 });
        }

        const capResponse = await enforceDailyCap('practice', user.id);
        if (capResponse) return capResponse;

        const lessonContent = [
            `Topic: ${topic}`,
            `Subject: ${subject}`,
            gradeLevel ? `Student grade level: ${gradeLevel.toUpperCase()}` : '',
            objectives.length ? `Lesson objectives:\n${objectives.map((o) => `- ${o}`).join('\n')}` : '',
            `Difficulty: ${difficulty}`,
            `Preferences: ${type}`,
        ].filter(Boolean).join('\n');

        const prompt = `Create a set of ${type === 'quick' ? '3' : '5'} multiple choice practice exercises for:
Based on the following context:
${lessonContent}

Please generate exactly ${type === 'quick' ? '3' : '5'} questions. Questions can be of type 'multiple_choice', 'multiple_select', 'true_false', or 'short_answer'.

The output MUST be a valid JSON object adhering strictly to the following structure:
{
  "questions": [
    // Example for type: 'multiple_choice'
    {
      "question": "string",
      "type": "multiple_choice",
      "options": ["string", "string", "string", "string"],
      "correctAnswer": "string", // Single correct option text
      "explanation": "string",
      "points": number // Integer 1-5
    },
    // Example for type: 'multiple_select'
    {
      "question": "string",
      "type": "multiple_select",
      "options": ["string", "string", "string", "string"],
      "correctAnswer": ["string", ...], // Array of all correct option texts
      "explanation": "string",
      "points": number // Integer 1-5
    },
    // Example for type: 'true_false'
    {
      "question": "string",
      "type": "true_false",
      "options": ["True", "False"], // Must be exactly these two options
      "correctAnswer": "True" or "False", // The correct string answer
      "explanation": "string",
      "points": number // Integer 1-5
    },
    // Example for type: 'short_answer'
    {
      "question": "string",
      "type": "short_answer",
      // No "options" field for this type
      "correctAnswer": "string", // The expected short answer
      "explanation": "string",
      "points": number // Integer 1-5
    }
    // ... ensure exactly ${type === 'quick' ? '3' : '5'} question objects total, mixing types is allowed
  ]
}

Requirements:
1. Output ONLY the JSON object. Do not include any other text, backticks, or explanations outside the JSON structure.
2. Ensure the JSON is valid and strictly follows the schema described above for ALL question types.
3. Critically, ensure the format of 'correctAnswer' (string, array, or "True"/"False") and the presence/absence/content of 'options' exactly matches the specified 'type' for each question.
4. For 'multiple_choice' and 'multiple_select', provide exactly 4 options.
5. For 'true_false', options MUST be ["True", "False"].
6. For 'short_answer', there MUST be no 'options' field.
7. Include detailed explanations for each answer.
8. Make questions challenging but appropriate for the student's grade level, subject, topic and difficulty. When lesson objectives are given, cover them.
9. Questions should be relevant to the subject and topic.`;

        const generatedContent = await generateAICompletion(
            "You are an AI assistant that generates educational practice exercises. You MUST output valid JSON conforming strictly to the user's requested schema. Do not add any extra text or explanations outside the JSON object.",
            prompt,
            undefined,
            true
        );

        // Try parsing the JSON content
        let rawExercises;
        try {
            rawExercises = JSON.parse(generatedContent || '{}');
        } catch (parseError) {
            console.error('Error parsing OpenAI JSON response:', parseError);
            return NextResponse.json({ message: 'Invalid JSON response from AI' }, { status: 500 });
        }

        // Validate the parsed content against the Zod schema (this will catch the errors)
        const validationResult = exercisesSchema.safeParse(rawExercises);

        if (!validationResult.success) {
            console.error('Zod validation failed:', validationResult.error.errors);
            return NextResponse.json(
                { message: 'Invalid data structure received from AI', errors: validationResult.error.flatten() },
                { status: 500 }
            );
        }

        // Use the validated data
        const exercises = validationResult.data;

        // Add unique IDs to each question (using validated data)
        exercises.questions = exercises.questions.map((question) => ({
            ...question,
            id: uuidv4()
        }));

        return NextResponse.json(exercises);
    } catch (error) {
        console.error('Error generating practice exercises:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
