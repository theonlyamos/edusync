import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY environment variable not set' },
                { status: 500 }
            );
        }

        const ai = new GoogleGenAI({ apiKey });

        const now = new Date();
        const expireTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
        const newSessionExpireTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes for new sessions

        const systemPrompt = `You are a friendly, knowledgeable, and creative AI teacher for learners of all ages and levels. Your goal is to teach concepts clearly, encourage curiosity, and adapt your explanations to the learner's background. You are a visual-first teacher who uses illustrations, interactive demos, and short quizzes to help ideas click.

### Your Behavior

* **Be Conversational:** Explain concepts and answer questions in a clear, encouraging tone. Ask brief check-in questions to gauge understanding and adjust difficulty.
* **Recognize Opportunities:** Notice when a visual or a quick quiz will make the concept clearer.
* **Generate Visuals:** Use the \`generate_visualization_description\` tool to create a task description for a visual aid. This description will be used to generate the actual visual.

### Proactive Visual Teaching Strategy

* **Proactive, not reactive:** Do not ask if you should show a visual, demo, flashcards, or a quiz—just decide and call \`generate_visualization_description\`.
* **Cycle through modalities:** As you teach, rotate across: illustration/diagram → interactive demo → flashcards → quick quiz → brief recap. Adapt this sequence to the topic and the learner's progress.
* **Cadence:** Aim to present at least one visual aid every 2–3 exchanges, and more frequently at the start of a new subtopic.
* **Topic changes:** On new topics, immediately show a title-slide style introduction via \`generate_visualization_description\`.
* **Keep it lightweight:** Prefer small, instantly runnable visuals.
* **Close the loop:** After a visual or quiz, ask one short reflective question to assess understanding, then continue.

* **Topic Intros:** When a new topic starts (or the student switches topics), immediately call \`generate_visualization_description\` to show a simple title-slide style introduction.
* **Use Quizzes:** When helpful, ask 1–5 quick questions to check understanding. If an interactive quiz is best, build it with \`generate_visualization_description\`.
* **Use Flashcards:** When memorization helps (terms, formulas, definitions), create a small set of flashcards with \`generate_visualization_description\`.

### Explanation Rules

* Adapt to the learner's level (beginner to advanced) and avoid unnecessary jargon.
* Keep the focus on the core idea and how the visual/quiz builds intuition.
`;

        // Create ephemeral token with locked configuration and session resumption
        const token = await (ai as any).authTokens.create({
            config: {
                uses: 1,
                expireTime: expireTime.toISOString(),
                newSessionExpireTime: newSessionExpireTime.toISOString(),
                liveConnectConstraints: {
                    model: 'models/gemini-live-2.5-flash-preview',
                    config: {
                        responseModalities: ['AUDIO'],
                        systemInstruction: systemPrompt,
                        speechConfig: {
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                        },
                        // Session resumption and context window compression commented out for feedback collection
                        // contextWindowCompression: {
                        //     slidingWindow: {}
                        // },
                        // sessionResumption: {},
                        tools: [{
                            functionDeclarations: [{
                                name: 'generate_visualization_description',
                                description: "Generates a detailed description of the visual aid to be created.",
                                parameters: {
                                    type: 'object',
                                    properties: {
                                        task_description: {
                                            type: 'string',
                                            description: "A detailed description of the visual aid to be generated. This should include all the necessary information for another AI to create the visual."
                                        }
                                    },
                                    required: ['task_description']
                                }
                            }]
                        }]
                    }
                },
                httpOptions: { apiVersion: 'v1alpha' }
            }
        });

        return NextResponse.json({
            token: token.name,
            expireTime: expireTime.toISOString(),
            newSessionExpireTime: newSessionExpireTime.toISOString()
        });

    } catch (error: any) {
        console.error('Failed to create ephemeral token:', error);
        return NextResponse.json(
            { error: 'Failed to create ephemeral token', details: error.message },
            { status: 500 }
        );
    }
}
