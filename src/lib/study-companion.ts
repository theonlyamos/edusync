import { z } from 'zod';

export const STUDY_MODES = ['companion', 'tutor'] as const;
export const STUDY_INTENTS = ['general', 'plan', 'hint', 'explain', 'quiz', 'review', 'walkthrough'] as const;

export type StudyMode = (typeof STUDY_MODES)[number];
export type StudyIntent = (typeof STUDY_INTENTS)[number];

export interface SuggestedAction {
    label: string;
    intent: StudyIntent;
    prompt: string;
}

export interface StudyMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    lessonId?: string;
    followUpQuestions?: string[];
    suggestedActions?: SuggestedAction[];
    mode?: StudyMode;
    intent?: StudyIntent;
    confidence?: 'shaky' | 'okay' | 'confident' | 'mastered';
}

export interface ChatRow {
    id: string;
    userid: string;
    lessonid?: string | null;
    title: string;
    messages?: unknown;
    createdat: string;
    updatedat: string;
}

export interface LessonContext {
    id: string;
    title: string;
    subject: string;
    objectives?: string | null;
    gradelevel?: string | null;
}

type SupabaseQueryClient = {
    from: (table: string) => any;
};

export const MAX_PROMPT_MESSAGES = 12;
export const MAX_STORED_MESSAGES = 20;
export const MAX_CONTENT_LENGTH = 4000;
const MAX_ACTION_TEXT_LENGTH = 160;
const MAX_PROMPT_TEXT_LENGTH = 500;

const trimForPrompt = (value: string, maxLength = MAX_CONTENT_LENGTH) =>
    value.replace(/\u0000/g, '').trim().slice(0, maxLength);

export const studyModeSchema = z.enum(STUDY_MODES);
export const studyIntentSchema = z.enum(STUDY_INTENTS);

export const suggestedActionSchema = z.object({
    label: z.string().trim().min(1).max(MAX_ACTION_TEXT_LENGTH),
    intent: studyIntentSchema.catch('general'),
    prompt: z.string().trim().min(1).max(MAX_PROMPT_TEXT_LENGTH),
});

export const studyMessageSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(MAX_CONTENT_LENGTH),
    timestamp: z.string().optional(),
    lessonId: z.string().uuid().optional().nullable(),
    followUpQuestions: z.array(z.string().trim().min(1).max(MAX_ACTION_TEXT_LENGTH)).max(4).optional(),
    suggestedActions: z.array(suggestedActionSchema).max(3).optional(),
    mode: studyModeSchema.optional(),
    intent: studyIntentSchema.optional(),
    confidence: z.enum(['shaky', 'okay', 'confident', 'mastered']).optional(),
});

export const tutorRequestSchema = z.object({
    chatId: z.string().uuid().optional().nullable(),
    content: z.string().trim().min(1).max(MAX_CONTENT_LENGTH),
    lessonId: z.string().uuid().optional().nullable(),
    mode: studyModeSchema.catch('companion'),
    intent: studyIntentSchema.catch('general'),
});

export const chatCreateSchema = z.object({
    lessonId: z.string().uuid().optional().nullable(),
    title: z.string().trim().min(1).max(120).optional(),
    messages: z.array(studyMessageSchema).max(MAX_STORED_MESSAGES).default([]),
});

export const chatUpdateSchema = z.object({
    title: z.string().trim().min(1).max(120).optional(),
    messages: z.array(studyMessageSchema).max(MAX_STORED_MESSAGES).optional(),
});

export class LessonAccessError extends Error {
    constructor() {
        super('Lesson not found or not accessible');
        this.name = 'LessonAccessError';
    }
}

export const normalizeMode = (mode: unknown): StudyMode =>
    studyModeSchema.safeParse(mode).success ? (mode as StudyMode) : 'companion';

export const normalizeIntent = (intent: unknown): StudyIntent =>
    studyIntentSchema.safeParse(intent).success ? (intent as StudyIntent) : 'general';

export const normalizeMessages = (messages: unknown, maxMessages = MAX_STORED_MESSAGES): StudyMessage[] => {
    if (!Array.isArray(messages)) return [];

    return messages
        .slice(-maxMessages)
        .map((message) => studyMessageSchema.safeParse(message))
        .filter((result): result is z.SafeParseSuccess<z.infer<typeof studyMessageSchema>> => result.success)
        .map((result) => ({
            role: result.data.role,
            content: trimForPrompt(result.data.content),
            timestamp: result.data.timestamp ?? new Date().toISOString(),
            lessonId: result.data.lessonId ?? undefined,
            followUpQuestions: result.data.followUpQuestions,
            suggestedActions: result.data.suggestedActions,
            mode: result.data.mode,
            intent: result.data.intent,
            confidence: result.data.confidence,
        }));
};

export const mapChat = (chat: ChatRow) => ({
    id: chat.id,
    _id: chat.id,
    userId: chat.userid,
    lessonId: chat.lessonid ?? undefined,
    title: chat.title,
    messages: chat.messages === undefined ? undefined : normalizeMessages(chat.messages),
    createdAt: chat.createdat,
    updatedAt: chat.updatedat,
});

export const buildChatTitle = (content?: string) => {
    const trimmed = content?.trim();
    if (!trimmed) return 'Study session';
    return trimmed.length > 50 ? `${trimmed.slice(0, 50)}...` : trimmed;
};

export async function assertLessonAccess(
    supabase: SupabaseQueryClient,
    lessonId: string,
    grade: string | null | undefined,
): Promise<LessonContext> {
    if (!grade) throw new LessonAccessError();

    const { data, error } = await supabase
        .from('lessons')
        .select('id,title,subject,objectives,gradelevel')
        .eq('id', lessonId)
        .eq('gradelevel', grade)
        .maybeSingle();

    if (error || !data) throw new LessonAccessError();
    return data as LessonContext;
}

export const buildTrimmedPrompt = (messages: StudyMessage[], mode: StudyMode, intent: StudyIntent) => {
    const promptMessages = messages
        .filter((message, index) => {
            const isInitialWelcome =
                index === 0 &&
                message.role === 'assistant' &&
                message.content.toLowerCase().startsWith("hi, i'm your study companion");
            return !isInitialWelcome && message.content.trim().length > 0;
        })
        .slice(-MAX_PROMPT_MESSAGES)
        .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'Student'}: ${trimForPrompt(message.content)}`)
        .join('\n\n');

    return `Current mode: ${mode}
Current intent: ${intent}

Recent conversation:
${promptMessages || 'No prior messages.'}

Respond to the latest student message. Return only the JSON object requested by the system prompt.`;
};

export const parseAssistantContent = (content: string, mode: StudyMode, intent: StudyIntent) => {
    try {
        const parsed = JSON.parse(content);
        const rawActions: unknown[] = Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [];
        const actions = rawActions
            .flatMap((action) => {
                const result = suggestedActionSchema.safeParse(action);
                return result.success ? [result.data] : [];
            })
            .slice(0, 3);

        return {
            content: typeof parsed.content === 'string' ? trimForPrompt(parsed.content) : trimForPrompt(content),
            mode: normalizeMode(parsed.mode ?? mode),
            intent: normalizeIntent(parsed.intent ?? intent),
            followUpQuestions: Array.isArray(parsed.followUpQuestions)
                ? parsed.followUpQuestions
                    .filter((question: unknown) => typeof question === 'string')
                    .map((question: string) => trimForPrompt(question, MAX_ACTION_TEXT_LENGTH))
                    .filter(Boolean)
                    .slice(0, 4)
                : [],
            suggestedActions: actions,
        };
    } catch {
        const parts = content.split(/Follow-up Questions:/i);
        const mainResponse = trimForPrompt(parts[0] || content);
        const followUpQuestions = parts[1]
            ? parts[1]
                .trim()
                .split(/\d+\.\s+/)
                .map((question) => trimForPrompt(question, MAX_ACTION_TEXT_LENGTH))
                .filter(Boolean)
                .slice(0, 4)
            : [];

        return {
            content: mainResponse || trimForPrompt(content),
            mode,
            intent,
            followUpQuestions,
            suggestedActions: [
                { label: 'Quiz me', intent: 'quiz' as StudyIntent, prompt: 'Quiz me one question at a time on this topic.' },
                { label: 'Give me a hint', intent: 'hint' as StudyIntent, prompt: 'Give me a small hint without the full answer.' },
            ],
        };
    }
};

export const getSafeAIErrorCode = (error: unknown) => {
    if (!error || typeof error !== 'object') return 'provider_error';
    const maybeError = error as { code?: unknown; status?: unknown };
    if (typeof maybeError.code === 'string') return maybeError.code.slice(0, 80);
    if (typeof maybeError.status === 'number') return `status_${maybeError.status}`;
    return 'provider_error';
};
