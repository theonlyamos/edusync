import { z } from 'zod';
import { buildStudyCompanionLiveVoiceSystemPrompt, studyIntentSchema, studyModeSchema } from '@/lib/study-companion';
import { EUREKA_TUTOR_SYSTEM_PROMPT } from '@/lib/tutor-system-prompt';
import { buildObjectiveTutorPromptContext } from '@/lib/lesson-artifacts/objective-learning-controller';

/**
 * Gemini Live session setup for the voice tutor and the voice study companion.
 *
 * This is built on the server and baked into the ephemeral token through
 * `liveConnectConstraints`, so a token can only ever open a session with this
 * model, system prompt and tool set. The browser only sends the inputs below.
 */

const LESSON_CONTENT_PROMPT_CHARS = 2000;

export const liveTokenRequestSchema = z.object({
    /** Grant returned by an earlier token for this voice session (reconnect or renewal). */
    grantId: z.string().uuid().nullish(),
    /** Learning session the voice time belongs to, when the page already has one. */
    sessionId: z.string().uuid().nullish(),
    /** Gemini session resumption handle from the previous connection. */
    resumptionHandle: z.string().min(1).max(4096).nullish(),
    variant: z.enum(['tutor', 'studyCompanion']).default('tutor'),
    topic: z.string().max(300).nullish(),
    gradeLevel: z.string().max(80).nullish(),
    studyMode: studyModeSchema.nullish(),
    studyIntent: studyIntentSchema.nullish(),
    lesson: z.object({
        title: z.string().max(300).nullish(),
        subject: z.string().max(200).nullish(),
        gradeLevel: z.string().max(80).nullish(),
        objectives: z.union([
            z.string().max(6000),
            z.array(z.string().max(1000)).max(40),
        ]).nullish(),
        content: z.string().max(LESSON_CONTENT_PROMPT_CHARS + 1).nullish(),
        learningRunId: z.string().max(100).nullish(),
        activeObjectiveText: z.string().max(1000).nullish(),
    }).nullish(),
});

export type LiveTokenRequest = z.infer<typeof liveTokenRequestSchema>;

export const visualizationToolDeclaration = {
    name: 'generate_visualization_description',
    description:
        'Generates an interactive visual or on-screen quiz for the learner. Call when a diagram, simulation, manipulable demo, or interactive/visual quiz would help more than voice alone.',
    parameters: {
        type: 'object',
        properties: {
            task_description: {
                type: 'string',
                description:
                    'Detailed description: type (illustration, simulation, visual quiz), layout, interactions, feedback, labels. For quizzes, specify prompts, choices, and correct-answer feedback.',
            },
        },
        required: ['task_description'],
    },
};

export const objectiveArtifactToolDeclaration = {
    name: 'request_learning_artifact',
    description: 'Shows the next teacher-reviewed visualization or quiz for the active objective, generating a fallback only after reviewed activities are exhausted.',
    parameters: {
        type: 'object',
        properties: {
            kind: { type: 'string', enum: ['visualization', 'quiz'] },
            taskDescription: { type: 'string', description: 'A short description of the concept or check the learner needs.' },
        },
        required: ['kind', 'taskDescription'],
    },
};

export const setTopicToolDeclaration = {
    name: 'set_topic',
    description:
        'Sets or updates the current discussion topic. Call on new main topic or topic change. Do not call this function on subtopics.',
    parameters: {
        type: 'object',
        properties: {
            topic: {
                type: 'string',
                description: 'A concise 3–8 word title describing the current main topic.',
            },
        },
        required: ['topic'],
    },
};

function objectivesText(objectives: string | string[] | null | undefined, bullet: boolean): string | null {
    if (!objectives) return null;
    if (Array.isArray(objectives)) {
        return bullet ? objectives.map((objective) => `- ${objective}`).join('\n') : objectives.join('\n');
    }
    return objectives;
}

function buildTutorContextAddition(input: LiveTokenRequest): string {
    const lesson = input.lesson;
    if (lesson?.title && lesson.learningRunId && lesson.activeObjectiveText) {
        return `\n\n${buildObjectiveTutorPromptContext({
            lessonTitle: lesson.title,
            subject: lesson.subject ?? undefined,
            gradeLevel: lesson.gradeLevel ?? undefined,
            objectiveText: lesson.activeObjectiveText,
            lessonContent: lesson.content,
        })}`;
    }
    if (lesson?.title) {
        const content = lesson.content;
        return `

### **Lesson Context**

You are helping a student learn material from a specific lesson:
- **Lesson:** ${lesson.title}
- **Subject:** ${lesson.subject || 'Not specified'}
- **Grade Level:** ${lesson.gradeLevel || 'Not specified'}

**Learning Objectives:**
${objectivesText(lesson.objectives, true) || 'No specific objectives provided.'}

**Lesson Content:**
${content ? content.substring(0, LESSON_CONTENT_PROMPT_CHARS) + (content.length > LESSON_CONTENT_PROMPT_CHARS ? '...' : '') : 'No content provided.'}

Focus your teaching on these objectives. Use the lesson material as the foundation for explanations, visualizations, and quizzes. When the student asks questions, relate answers back to the lesson objectives.
`;
    }
    if (input.topic) {
        return `\n\n### **Session Topic**\n\nThe learner has specifically requested to learn about: "${input.topic}"\n\nFocus your teaching on this topic. Tailor your explanations, visualizations, and questions to this subject matter.`;
    }
    return '';
}

export function buildLiveSystemPrompt(input: LiveTokenRequest): string {
    if (input.variant === 'studyCompanion') {
        const lesson = input.lesson;
        const lessonHint = lesson?.title && lesson.title.trim().length > 0
            ? {
                title: lesson.title,
                subject: lesson.subject || 'general',
                objectives: objectivesText(lesson.objectives, false),
                content: lesson.content ?? null,
            }
            : undefined;
        return buildStudyCompanionLiveVoiceSystemPrompt(
            input.gradeLevel?.trim() || 'the learner',
            input.studyMode ?? 'companion',
            input.studyIntent ?? 'general',
            lessonHint,
        );
    }
    return EUREKA_TUTOR_SYSTEM_PROMPT + buildTutorContextAddition(input);
}

export function buildLiveTools(input: LiveTokenRequest) {
    if (input.variant === 'studyCompanion') {
        // Study Companion Live: function calls only (no Google Search); single viz/quiz tool.
        return [{ functionDeclarations: [visualizationToolDeclaration] }];
    }
    return [
        { googleSearch: {} },
        {
            functionDeclarations: [
                input.lesson?.learningRunId ? objectiveArtifactToolDeclaration : visualizationToolDeclaration,
                setTopicToolDeclaration,
            ],
        },
    ];
}

/** The Live model the tokens are locked to. Server env wins over the old public one. */
export function getLiveModel(): string | null {
    return process.env.GEMINI_LIVE_MODEL || process.env.NEXT_PUBLIC_GEMINI_LIVE_MODEL || null;
}

/**
 * JSON-safe LiveConnectConfig. Enum values are written as their wire strings
 * (Modality.AUDIO, StartSensitivity.START_SENSITIVITY_HIGH) so the same object
 * can be locked into the token and returned to the browser unchanged.
 */
export function buildLiveConnectConfig(input: LiveTokenRequest) {
    const isStudyCompanion = input.variant === 'studyCompanion';
    return {
        responseModalities: ['AUDIO'],
        proactivity: { proactiveAudio: true },
        realtimeInputConfig: {
            automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
            },
        },
        systemInstruction: buildLiveSystemPrompt(input),
        speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        contextWindowCompression: { slidingWindow: {} },
        sessionResumption: input.resumptionHandle ? { handle: input.resumptionHandle } : {},
        tools: buildLiveTools(input),
        ...(isStudyCompanion ? { inputAudioTranscription: {}, outputAudioTranscription: {} } : {}),
    };
}
