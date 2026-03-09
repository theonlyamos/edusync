import { WebSocketServer } from 'ws';
import { getServerSession } from '@/lib/auth'
import { GoogleGenAI, MediaResolution, Modality, LiveServerMessage, FunctionResponseScheduling } from '@google/genai';
import path from 'path';

import { LIVE_TUTOR_SYSTEM_PROMPT, getLiveToolDeclarations, handleToolCall } from '@/lib/agents/live-tutor-agent';

// Polyfill WebSocket for Node.js if it doesn't exist
if (typeof global !== 'undefined' && !global.WebSocket) {
    try {
        global.WebSocket = require('ws');
    } catch (error) {
        console.warn('WebSocket polyfill failed to load:', error);
    }
}

// In-memory store for active streaming sessions
const activeSessions = new Map<string, any>();
let wss: WebSocketServer | null = null;
const TOOL_CALLS_DIR = path.join(process.cwd(), 'public', 'tool-calls');

type ToolCallInfo = { id: string; name: string; args: unknown };

function sanitizeFilename(input: string): string {
    return input.replace(/[^a-z0-9-_]/gi, '_').slice(0, 64);
}

// async function saveToolCall(sessionId: string, info: ToolCallInfo): Promise<void> {
//     await fs.mkdir(TOOL_CALLS_DIR, { recursive: true });
//     const timestamp = new Date();
//     const safeSession = sanitizeFilename(sessionId);
//     const safeName = sanitizeFilename(info.name || 'unknown');
//     const file = `${timestamp.toISOString().replace(/[:.]/g, '-')}_${safeSession}_${safeName}.json`;
//     const filePath = path.join(TOOL_CALLS_DIR, file);
//     const payload = {
//         sessionId,
//         id: info.id,
//         name: info.name,
//         args: info.args,
//         timestamp: timestamp.toISOString(),
//     };
//     await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
// }

// Removed inline system prompt. Now imported from @/lib/agents/live-tutor-agent
function initWebSocketServer() {
    if (wss) return wss;

    wss = new WebSocketServer({ port: 3001, path: '/voice-stream' });

    wss.on('connection', (ws, req) => {
        // Basic auth: require a valid session on connect (best effort)
        // In production, switch to a signed token passed as a query param
        (async () => {
            try {
                const session = await getServerSession()
                if (!session?.user?.id) {
                    try { ws.close(1008, 'Unauthorized') } catch { }
                    return
                }
            } catch {
                try { ws.close(1011, 'Auth check failed') } catch { }
                return
            }
        })()
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
async function handleWebSocketMessage(ws: any, message: { type: string; sessionId: string; sampleRate?: number; text?: string; data?: string; mimeType?: string }) {
    const { type, sessionId, sampleRate, text, data, mimeType } = message;

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
        case 'text':
            if (!sessionId || typeof text !== 'string') {
                ws.send(JSON.stringify({ type: 'error', error: 'Text message requires sessionId and text string.' }));
                return;
            }
            try {
                const sessionData = activeSessions.get(sessionId);
                if (!sessionData || !sessionData.session) {
                    ws.send(JSON.stringify({ type: 'error', error: 'Session not found or not ready.' }));
                    return;
                }
                sessionData.session.sendRealtimeInput({ text });
                ws.send(JSON.stringify({ type: 'text-ack', sessionId }));
            } catch (err: any) {
                console.error('Failed to forward text to Gemini:', err);
                ws.send(JSON.stringify({ type: 'error', error: 'Failed to send text to session.' }));
            }
            break;
        case 'media':
            if (!sessionId || typeof data !== 'string' || typeof mimeType !== 'string') {
                ws.send(JSON.stringify({ type: 'error', error: 'Media message requires sessionId, data, and mimeType.' }));
                return;
            }
            try {
                const sessionData = activeSessions.get(sessionId);
                if (!sessionData || !sessionData.session) {
                    ws.send(JSON.stringify({ type: 'error', error: 'Session not found or not ready.' }));
                    return;
                }
                sessionData.session.sendRealtimeInput({ media: { data, mimeType } });
                ws.send(JSON.stringify({ type: 'media-ack', sessionId }));
            } catch (err: any) {
                console.error('Failed to forward media to Gemini:', err);
                ws.send(JSON.stringify({ type: 'error', error: 'Failed to send media to session.' }));
            }
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

        // Removed inline displayVisualAidFn tool declaration. Now imported from @/lib/agents/live-tutor-agent
        const config = {
            responseModalities: [Modality.AUDIO],
            systemInstruction: LIVE_TUTOR_SYSTEM_PROMPT,
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
            },
            inputConfig: {
                audio: { sampleRateHz: sampleRate }
            },
            tools: getLiveToolDeclarations()
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

        geminiSession.sendRealtimeInput({
            text: 'Hello'
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
        if (message?.serverContent && (message as any).serverContent.interrupted) {
            audioParts.length = 0;
            try {
                ws.send(JSON.stringify({ type: 'playback-interrupted', sessionId }));
            } catch { }
            continue;
        }
        // Log any tool calls (function calling)
        if (message?.toolCall?.functionCalls && message.toolCall.functionCalls.length > 0) {
            for (const fn of message.toolCall.functionCalls) {
                const info = { id: fn.id, name: fn.name, args: fn.args };

                // Forward the tool call to the corresponding browser client
                try {
                    ws.send(JSON.stringify({ type: 'tool-call', ...info }));
                } catch (err) {
                    console.warn('Failed to forward tool call to client:', err);
                }

                // Persist the tool call to disk as JSON
                // saveToolCall(sessionId, info).catch((err) => {
                //     console.warn('Failed to persist tool call:', err);
                // });

                // Delegate response creation to the shared handleToolCall
                const toolResponse = handleToolCall(info);

                try {
                    sessionData.session?.sendToolResponse({
                        functionResponses: [toolResponse as any] // Cast as any because @google/genai types are slightly different
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
