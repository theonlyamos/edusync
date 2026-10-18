import { describe, expect, it } from 'vitest';
import { buildLiveConnectConfig, liveTokenRequestSchema } from '../live-connect-config';
import { buildLiveTokenRequest } from '../live-token-request';
import { EUREKA_TUTOR_SYSTEM_PROMPT } from '@/lib/tutor-system-prompt';

const parse = (body: unknown) => liveTokenRequestSchema.parse(body);
const toolNames = (config: ReturnType<typeof buildLiveConnectConfig>) =>
    config.tools.flatMap((tool) => ('functionDeclarations' in tool ? (tool.functionDeclarations ?? []).map((d) => d.name) : ['googleSearch']));

describe('server-built Gemini Live config', () => {
    it('builds the Eureka tutor with search, visuals and topic tools by default', () => {
        const config = buildLiveConnectConfig(parse({}));
        expect(config.systemInstruction).toBe(EUREKA_TUTOR_SYSTEM_PROMPT);
        expect(toolNames(config)).toEqual(['googleSearch', 'generate_visualization_description', 'set_topic']);
        expect(config.responseModalities).toEqual(['AUDIO']);
        expect(config.sessionResumption).toEqual({});
        expect(config).not.toHaveProperty('inputAudioTranscription');
    });

    it('adds the topic or lesson as context but never takes a prompt, model or tools from the client', () => {
        const body = {
            topic: 'Photosynthesis',
            systemInstruction: 'You are a general assistant',
            model: 'some-other-model',
            tools: [{ codeExecution: {} }],
        };
        const config = buildLiveConnectConfig(parse(body));
        expect(config.systemInstruction.startsWith(EUREKA_TUTOR_SYSTEM_PROMPT)).toBe(true);
        expect(config.systemInstruction).toContain('"Photosynthesis"');
        expect(config.systemInstruction).not.toContain('general assistant');
        expect(toolNames(config)).toEqual(['googleSearch', 'generate_visualization_description', 'set_topic']);
        expect(JSON.stringify(config)).not.toContain('some-other-model');
    });

    it('uses the reviewed-artifact tool for an objective learning run', () => {
        const config = buildLiveConnectConfig(parse(buildLiveTokenRequest({
            grantId: null,
            sessionId: null,
            resumptionHandle: 'handle-1',
            variant: 'tutor',
            lesson: {
                title: 'Cells',
                subject: 'Biology',
                learningRunId: 'run-1',
                activeObjective: { text: 'Name the parts of a cell' },
                content: 'x'.repeat(5000),
            },
        })));
        expect(toolNames(config)).toEqual(['googleSearch', 'request_learning_artifact', 'set_topic']);
        expect(config.systemInstruction).toContain('Active objective: Name the parts of a cell');
        expect(config.sessionResumption).toEqual({ handle: 'handle-1' });
    });

    it('builds the study companion with only the visual tool and transcripts', () => {
        const config = buildLiveConnectConfig(parse({ variant: 'studyCompanion', gradeLevel: '7', studyIntent: 'quiz' }));
        expect(toolNames(config)).toEqual(['generate_visualization_description']);
        expect(config.systemInstruction).toContain('grade 7 learners');
        expect(config).toMatchObject({ inputAudioTranscription: {}, outputAudioTranscription: {} });
    });

    it('rejects oversized context instead of passing it into the prompt', () => {
        expect(liveTokenRequestSchema.safeParse({ topic: 'x'.repeat(301) }).success).toBe(false);
        expect(liveTokenRequestSchema.safeParse({ variant: 'freeform' }).success).toBe(false);
        expect(liveTokenRequestSchema.safeParse({ grantId: 'not-a-uuid' }).success).toBe(false);
    });

    it('keeps the browser request inside the server limits', () => {
        const body = buildLiveTokenRequest({
            grantId: 'nope',
            sessionId: 'also-nope',
            resumptionHandle: null,
            variant: 'tutor',
            topic: 't'.repeat(1000),
            lesson: { title: 'L'.repeat(1000), objectives: Array.from({ length: 100 }, () => 'o'.repeat(2000)), content: 'c'.repeat(10_000) },
        });
        expect(body.grantId).toBeNull();
        expect(body.sessionId).toBeNull();
        expect(liveTokenRequestSchema.safeParse(body).success).toBe(true);
    });
});
