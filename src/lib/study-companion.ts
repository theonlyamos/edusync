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

export const INTERACTIVE_LIBRARIES = ['p5', 'three', 'react'] as const;
export type InteractiveLibrary = (typeof INTERACTIVE_LIBRARIES)[number];

export interface InteractiveElement {
    id: string;
    type: 'visualization';
    library: InteractiveLibrary;
    code: string;
    explanation?: string;
    taskDescription: string;
    status: 'ready';
}

export interface InteractiveElementRequest {
    kind: 'visualization';
    taskDescription: string;
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
    interactiveElements?: InteractiveElement[];
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
export const MAX_INTERACTIVE_CODE_LENGTH = 40_000;
export const MAX_INTERACTIVE_ELEMENTS_PER_MESSAGE = 1;
const MAX_ACTION_TEXT_LENGTH = 160;
const MAX_PROMPT_TEXT_LENGTH = 500;
const MAX_TASK_DESCRIPTION_LENGTH = 2_000;
export const MAX_EXPLANATION_LENGTH = 8_000;

const trimForPrompt = (value: string, maxLength = MAX_CONTENT_LENGTH) =>
    value.replace(/\u0000/g, '').trim().slice(0, maxLength);

export const studyModeSchema = z.enum(STUDY_MODES);
export const studyIntentSchema = z.enum(STUDY_INTENTS);

export const suggestedActionSchema = z.object({
    label: z.string().trim().min(1).max(MAX_ACTION_TEXT_LENGTH),
    intent: studyIntentSchema.catch('general'),
    prompt: z.string().trim().min(1).max(MAX_PROMPT_TEXT_LENGTH),
});

export const interactiveElementSchema = z.object({
    id: z.string().uuid(),
    type: z.literal('visualization'),
    library: z.enum(INTERACTIVE_LIBRARIES),
    code: z.string().min(1).max(MAX_INTERACTIVE_CODE_LENGTH),
    explanation: z.string().trim().max(MAX_EXPLANATION_LENGTH).optional(),
    taskDescription: z.string().trim().min(1).max(MAX_TASK_DESCRIPTION_LENGTH),
    status: z.literal('ready'),
});

export const interactiveElementRequestSchema = z.object({
    kind: z.literal('visualization'),
    taskDescription: z.string().trim().min(1).max(MAX_TASK_DESCRIPTION_LENGTH),
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
    interactiveElements: z.array(interactiveElementSchema).max(MAX_INTERACTIVE_ELEMENTS_PER_MESSAGE).optional(),
});

/** Core fields only; interactive elements validated separately so bad blobs don't drop whole messages */
export const studyMessageCoreSchema = studyMessageSchema.omit({ interactiveElements: true });
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
        .flatMap((message): StudyMessage[] => {
            if (!message || typeof message !== 'object') return [];
            const raw = message as Record<string, unknown>;
            const { interactiveElements: rawIe, ...rest } = raw;
            const core = studyMessageCoreSchema.safeParse(rest);
            if (!core.success) return [];

            let interactiveElements: InteractiveElement[] | undefined;
            if (Array.isArray(rawIe)) {
                const parsed = rawIe
                    .flatMap((el) => {
                        const r = interactiveElementSchema.safeParse(el);
                        return r.success ? [r.data as InteractiveElement] : [];
                    })
                    .slice(0, MAX_INTERACTIVE_ELEMENTS_PER_MESSAGE);
                if (parsed.length > 0) {
                    interactiveElements = parsed;
                }
            }

            return [
                {
                    role: core.data.role,
                    content: trimForPrompt(core.data.content),
                    timestamp: core.data.timestamp ?? new Date().toISOString(),
                    lessonId: core.data.lessonId ?? undefined,
                    followUpQuestions: core.data.followUpQuestions,
                    suggestedActions: core.data.suggestedActions,
                    mode: core.data.mode,
                    intent: core.data.intent,
                    confidence: core.data.confidence,
                    interactiveElements,
                },
            ];
        });
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

const formatMessageForPrompt = (message: StudyMessage) => {
    const prefix = message.role === 'assistant' ? 'Assistant' : 'Student';
    let body = trimForPrompt(message.content);
    if (
        message.role === 'assistant' &&
        message.interactiveElements &&
        message.interactiveElements.length > 0
    ) {
        const td = message.interactiveElements[0]?.taskDescription?.trim();
        if (td) {
            body += `\n(Assistant showed an interactive visualization: ${td.slice(0, 500)})`;
        }
    }
    return `${prefix}: ${body}`;
};

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
        .map(formatMessageForPrompt)
        .join('\n\n');

    return `Current mode: ${mode}
Current intent: ${intent}

Recent conversation:
${promptMessages || 'No prior messages.'}

Respond to the latest student message. Return only the JSON object requested by the system prompt.`;
};

export type ParsedAssistantContent = {
    content: string;
    mode: StudyMode;
    intent: StudyIntent;
    followUpQuestions: string[];
    suggestedActions: SuggestedAction[];
    interactiveElementRequest?: InteractiveElementRequest;
};

export const parseAssistantContent = (content: string, mode: StudyMode, intent: StudyIntent): ParsedAssistantContent => {
    try {
        const parsed = JSON.parse(content);
        const rawActions: unknown[] = Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [];
        const actions = rawActions
            .flatMap((action) => {
                const result = suggestedActionSchema.safeParse(action);
                return result.success ? [result.data] : [];
            })
            .slice(0, 3);

        let interactiveElementRequest: InteractiveElementRequest | undefined;
        const reqParsed = interactiveElementRequestSchema.safeParse(parsed.interactiveElementRequest);
        if (reqParsed.success) {
            interactiveElementRequest = reqParsed.data;
        }

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
            interactiveElementRequest,
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
            interactiveElementRequest: undefined,
        };
    }
};

/** Build task_description for visualize-ai-task from model request + lesson + latest user turn. */
export function buildVisualizationTaskDescription(args: {
    request: InteractiveElementRequest;
    gradeLevel: string;
    lesson?: LessonContext;
    latestUserContent: string;
}): string {
    const { request, gradeLevel, lesson, latestUserContent } = args;
    const parts = [
        `Grade context: ${gradeLevel}.`,
        lesson
            ? `Lesson: "${lesson.title}" (${lesson.subject}).${lesson.objectives ? ` Objectives: ${lesson.objectives}` : ''}`
            : null,
        `Student's latest message: ${trimForPrompt(latestUserContent, 1500)}`,
        `Visualization task: ${request.taskDescription}`,
    ].filter(Boolean);
    return parts.join('\n\n');
}

export const getSafeAIErrorCode = (error: unknown) => {
    if (!error || typeof error !== 'object') return 'provider_error';
    const maybeError = error as { code?: unknown; status?: unknown };
    if (typeof maybeError.code === 'string') return maybeError.code.slice(0, 80);
    if (typeof maybeError.status === 'number') return `status_${maybeError.status}`;
    return 'provider_error';
};
