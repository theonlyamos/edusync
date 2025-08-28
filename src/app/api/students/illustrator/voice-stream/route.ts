import { NextRequest } from 'next/server';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, MediaResolution, Modality, LiveServerMessage, Type, Behavior, FunctionResponseScheduling } from '@google/genai';
import { Schema } from 'zod';
import path from 'path';
import { promises as fs } from 'fs';

// Polyfill WebSocket for Node.js if it doesn't exist
if (typeof global !== 'undefined' && !global.WebSocket) {
    try {
        global.WebSocket = require('ws');
    } catch (error) {
        console.warn('WebSocket polyfill failed to load:', error);
    }
}

export const runtime = 'nodejs';

// In-memory store for active streaming sessions
const activeSessions = new Map<string, any>();
let wss: WebSocketServer | null = null;
const TOOL_CALLS_DIR = path.join(process.cwd(), 'public', 'tool-calls');

type ToolCallInfo = { id: string; name: string; args: unknown };

function sanitizeFilename(input: string): string {
    return input.replace(/[^a-z0-9-_]/gi, '_').slice(0, 64);
}

async function saveToolCall(sessionId: string, info: ToolCallInfo): Promise<void> {
    await fs.mkdir(TOOL_CALLS_DIR, { recursive: true });
    const timestamp = new Date();
    const safeSession = sanitizeFilename(sessionId);
    const safeName = sanitizeFilename(info.name || 'unknown');
    const file = `${timestamp.toISOString().replace(/[:.]/g, '-')}_${safeSession}_${safeName}.json`;
    const filePath = path.join(TOOL_CALLS_DIR, file);
    const payload = {
        sessionId,
        id: info.id,
        name: info.name,
        args: info.args,
        timestamp: timestamp.toISOString(),
    };
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

const systemPrompt = `You are a friendly, knowledgeable, and creative AI tutor. Your main goal is to have a natural, encouraging conversation with high school students to help them learn.

### Your Behavior

* **Be Conversational:** Chat with the student, explain concepts, and answer their questions in a clear, straightforward, and friendly manner.
* **Recognize Opportunities:** Your most important skill is to recognize when a student might be struggling with a concept that is best explained visually.
* **Create and Display Visuals:** You have a special ability to display visual aids using the \`display_visual_aid\` tool. To use it, you must first **create all the content yourself**. This includes:
    1.  A clear \`explanation\` text.
    2.  A runnable \`code\` snippet, following the rules below.
    3.  The correct \`library\` name (\`'p5'\`, \`'three'\`, or \`'react'\`).

    Once you have generated all three pieces of information, call the \`display_visual_aid\` tool to show it to the student.

### Explanation Rules

* Always aim your explanation at a high school student.
* Keep the focus on the educational concept.
* Explain how the interactive part of your visual helps with learning.
* **NEVER** use technical jargon like "React", "JavaScript", "useState", etc. Talk about the idea, not the code.

### Code Generation Rules

When you write the code snippet, you **must** follow these rules:

**1. p5.js / Three.js**
* The code must be pure, self-contained JavaScript.
* Do NOT include HTML or any surrounding boilerplate.

**2. React**
* Use modern React with hooks. The hooks \`useState\`, \`useEffect\`, \`useMemo\`, and \`useCallback\` are available directly.
* Use only the following available UI components: \`Button\`, \`Input\`, \`Card\`, \`CardContent\`, \`CardHeader\`, \`CardTitle\`, \`Badge\`, \`Textarea\`, \`Label\`, \`RadioGroup\`, \`RadioGroupItem\`, \`Checkbox\`, \`Select\`, \`SelectContent\`, \`SelectItem\`, \`SelectTrigger\`, \`SelectValue\`, \`Slider\`.
* Your main component must be named \`Component\`, \`App\`, \`Quiz\`, \`InteractiveComponent\`, \`Calculator\`, or \`Game\`.
* **MOST IMPORTANT:** You **MUST** use \`React.createElement()\` syntax. **NEVER** use JSX tags (e.g., \`<Card>\`).

* **\`React.createElement()\` Example:**
    \`\`\`javascript
    function Quiz() {
      const [currentQuestion, setCurrentQuestion] = useState(0);

      return React.createElement(Card, null,
        React.createElement(CardHeader, null,
          React.createElement(CardTitle, null, "Math Quiz")
        ),
        React.createElement(CardContent, null,
          React.createElement('p', null, 'Quiz content goes here...')
        )
      );
    }
    \`\`\`
`;

function initWebSocketServer() {
    if (wss) return wss;

    wss = new WebSocketServer({ port: 3001, path: '/voice-stream' });

    wss.on('connection', (ws) => {
        ws.on('message', async (data, isBinary) => {
            try {
                if (!isBinary) {
                    let messageStr: string;
                    if (typeof data === 'string') {
                        messageStr = data;
                    } else if (data instanceof Buffer) {
                        messageStr = data.toString('utf8');
                    } else {
                        messageStr = Buffer.from(data as ArrayBuffer).toString('utf8');
                    }
                    const message = JSON.parse(messageStr);
                    await handleWebSocketMessage(ws, message);
                } else {
                    const audioBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
                    await handleAudioData(ws, audioBuffer);
                }
            } catch (error) {
                console.error('Error handling WebSocket message:', error);
                ws.send(JSON.stringify({ type: 'error', error: 'Internal server error' }));
            }
        });

        ws.on('close', () => {
            // Clean up session associated with this WebSocket
            for (const [sessionId, sessionData] of Array.from(activeSessions.entries())) {
                if (sessionData.ws === ws) {
                    sessionData.session?.close();
                    activeSessions.delete(sessionId);
                    break;
                }
            }
        });

        ws.on('error', (error) => console.error('WebSocket error:', error));
    });

    console.log('WebSocket server initialized on port 3001');
    return wss;
}

// Handles control messages like 'start' and 'end'
async function handleWebSocketMessage(ws: any, message: { type: string; sessionId: string; sampleRate?: number }) {
    const { type, sessionId, sampleRate } = message;

    switch (type) {
        case 'start':
            if (!sampleRate) {
                ws.send(JSON.stringify({ type: 'error', error: 'Sample rate is required to start a session.' }));
                return;
            }
            await handleStartSession(ws, sessionId, sampleRate);
            break;
        case 'end':
            await handleEndSession(sessionId);
            break;
        default:
            console.warn('Unknown message type:', type);
            ws.send(JSON.stringify({ type: 'error', error: 'Unknown message type' }));
    }
}

// Forwards binary audio data to the Gemini API
async function handleAudioData(ws: any, audioData: Buffer) {
    let sessionData;
    for (const data of Array.from(activeSessions.values())) {
        if (data.ws === ws) {
            sessionData = data;
            break;
        }
    }

    if (!sessionData || sessionData.status !== 'ready') {
        // Don't send an error, as this can happen during session setup
        console.warn('Session not ready for audio data. Discarding.');
        return;
    }

    // Gemini native-audio expects 16-bit-PCM, 16-kHz, mono audio encoded as base64.
    const base64Audio = audioData.toString('base64');

    sessionData.session.sendRealtimeInput({
        audio: {
            data: base64Audio,
            mimeType: `audio/pcm;rate=${sessionData.sampleRate || 16000}`
        }
    });
}


// Starts a new voice streaming session with Gemini
async function handleStartSession(ws: any, sessionId: string, sampleRate: number) {
    if (activeSessions.has(sessionId)) {
        ws.send(JSON.stringify({ type: 'error', error: 'Session ID already exists.' }));
        return;
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY environment variable not set.');

        const ai = new GoogleGenAI({ apiKey });

        const responseQueue: LiveServerMessage[] = [];
        const audioParts: string[] = [];

        const model = 'models/gemini-live-2.5-flash-preview';

        const displayVisualAidFn = {
            name: 'display_visual_aid',
            description: "Call this function to display a visual illustration to the student. The AI must generate the explanation, code, and library name itself before calling this function.",
            parameters: {
                type: Type.OBJECT,
                properties: {
                    explanation: {
                        type: Type.STRING,
                        description: "The complete text explanation that will accompany the code."
                    },
                    code: {
                        type: Type.STRING,
                        description: "The complete, runnable code snippet for the chosen library (p5.js, Three.js, or React). Do not add any comments to the code. Add proper line breaks to the code."
                    },
                    library: {
                        type: Type.STRING,
                        description: "The name of the library used for the code. Must be one of 'p5', 'three', or 'react'."
                    }
                },
                required: ['explanation', 'code', 'library']
            },
            behaviour: Behavior.NON_BLOCKING
        };

        const config = {
            responseModalities: [Modality.AUDIO],
            systemInstruction: systemPrompt,
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
            },
            inputConfig: {
                audio: { sampleRateHz: sampleRate }
            },
            tools: [{ functionDeclarations: [displayVisualAidFn] }]
        };

        // Store session state before connecting
        activeSessions.set(sessionId, {
            session: null,
            status: 'creating',
            responseQueue,
            audioParts,
            ws,
            sampleRate, // Store for WAV conversion later
        });
        const geminiSession = await ai.live.connect({
            model,
            config,
            callbacks: {
                onopen: () => {
                    const sessionData = activeSessions.get(sessionId);
                    if (sessionData) {
                        sessionData.status = 'ready';
                        ws.send(JSON.stringify({ type: 'session-started', sessionId }));
                    }
                },
                onmessage: (message: LiveServerMessage) => {
                    // When Gemini sends a message, add it to the queue for processing
                    responseQueue.push(message);
                    processResponseQueue(sessionId);
                },
                onerror: (e: ErrorEvent) => {
                    console.error(`Gemini session error for ID ${sessionId}:`, e.message);
                    ws.send(JSON.stringify({ type: 'error', error: `Gemini error: ${e.message}` }));
                    activeSessions.delete(sessionId);
                },
                onclose: (e: CloseEvent) => {
                    try {
                        ws.send(
                            JSON.stringify({
                                type: 'session-ended',
                                sessionId,
                                reason: e.reason || 'closed'
                            })
                        );
                    } catch (err) {
                        console.warn('Failed to send session-ended message:', err);
                    }
                    activeSessions.delete(sessionId);
                },
            },
        });

        // Store the session object after successful connection
        const storedSessionData = activeSessions.get(sessionId);
        if (storedSessionData) {
            storedSessionData.session = geminiSession;
        }

    } catch (error: any) {
        console.error(`Failed to start session ${sessionId}:`, error);
        ws.send(JSON.stringify({ type: 'error', error: 'Failed to start session', details: error.message }));
        activeSessions.delete(sessionId);
    }
}

// Process the queue of messages from Gemini
function processResponseQueue(sessionId: string) {
    const sessionData = activeSessions.get(sessionId);
    if (!sessionData) return;

    const { responseQueue, audioParts, ws, sampleRate } = sessionData;
    const FRAGMENT_PARTS = 3; // send after every 3 chunks (~120-150 ms)

    while (responseQueue.length > 0) {
        const message = responseQueue.shift();
        // Log any tool calls (function calling)
        if (message?.toolCall?.functionCalls && message.toolCall.functionCalls.length > 0) {
            for (const fn of message.toolCall.functionCalls) {
                const info = { id: fn.id, name: fn.name, args: fn.args };
                console.log('Gemini requested tool call:', info);

                // Forward the tool call to the corresponding browser client
                try {
                    ws.send(JSON.stringify({ type: 'tool-call', ...info }));
                } catch (err) {
                    console.warn('Failed to forward tool call to client:', err);
                }

                // Persist the tool call to disk as JSON
                saveToolCall(sessionId, info).catch((err) => {
                    console.warn('Failed to persist tool call:', err);
                });

                // Send an immediate stub response back to Gemini so it can continue
                try {
                    sessionData.session?.sendToolResponse({
                        functionResponses: [
                            {
                                id: fn.id,
                                name: fn.name,
                                response: {
                                    result: 'Tool is being called',
                                    scheduling: FunctionResponseScheduling.SILENT
                                }
                            }
                        ]
                    });
                } catch (err) {
                    console.warn('Failed to send tool response back to Gemini:', err);
                }
            }
        }

        if (message?.serverContent?.modelTurn?.parts) {
            const part = message.serverContent.modelTurn.parts[0];
            if (part?.inlineData?.data) {
                audioParts.push(part.inlineData.data);
            }
        }

        const shouldFlush =
            audioParts.length >= FRAGMENT_PARTS ||
            (message?.serverContent?.turnComplete && audioParts.length > 0);

        if (shouldFlush) {
            const wavBuffer = convertToWav(audioParts, 24000);
            ws.send(wavBuffer);
            audioParts.length = 0; // Clear parts buffer
        }
    }
}

// Ends the session and cleans up resources
async function handleEndSession(sessionId: string) {
    const sessionData = activeSessions.get(sessionId);
    if (sessionData) {
        processResponseQueue(sessionId); // Process any remaining messages
        sessionData.session?.close();
        activeSessions.delete(sessionId);
    }
}


// Converts raw PCM audio chunks (base64) into a valid WAV file buffer
function convertToWav(rawData: string[], sampleRate: number): Buffer {
    // **FIX:** Correctly calculate total data length from base64 chunks
    const pcmData = rawData.map(data => Buffer.from(data, 'base64'));
    const totalDataLength = pcmData.reduce((acc, buffer) => acc + buffer.length, 0);

    const options = {
        numChannels: 1,
        sampleRate: sampleRate,
        bitsPerSample: 16,
    };
    const wavHeader = createWavHeader(totalDataLength, options);
    return Buffer.concat([wavHeader, ...pcmData]);
}

interface WavConversionOptions {
    numChannels: number;
    sampleRate: number;
    bitsPerSample: number;
}

// Creates a 44-byte WAV file header
function createWavHeader(dataLength: number, options: WavConversionOptions): Buffer {
    const { numChannels, sampleRate, bitsPerSample } = options;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const buffer = Buffer.alloc(44);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // PCM header size
    buffer.writeUInt16LE(1, 20);  // Audio format (1 for PCM)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);

    return buffer;
}


// The GET endpoint to ensure the WebSocket server is running
export async function GET() {
    initWebSocketServer();
    return new Response(JSON.stringify({
        message: 'WebSocket server is running',
        port: 3001,
        path: '/voice-stream'
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
