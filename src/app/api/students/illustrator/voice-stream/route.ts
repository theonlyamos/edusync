import { NextRequest } from 'next/server';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, MediaResolution, Modality, TurnCoverage, LiveServerMessage } from '@google/genai';

// WebSocket polyfills for Node.js environment
if (typeof global !== 'undefined') {
    try {
        const WebSocket = require('ws');
        if (!global.WebSocket) {
            global.WebSocket = WebSocket;
        }
    } catch (error) {
        console.warn('WebSocket polyfill failed to load:', error);
    }
}

export const runtime = 'nodejs';

// Store active sessions
const activeSessions = new Map<string, any>();
let wss: WebSocketServer | null = null;

// Initialize WebSocket server
function initWebSocketServer() {
    if (wss) return wss;

    wss = new WebSocketServer({
        port: 3001,
        path: '/voice-stream'
    });

    wss.on('connection', (ws, req) => {
        console.log('WebSocket connection established');
        console.log('Connection details:', {
            url: req.url,
            headers: req.headers,
            remoteAddress: req.socket.remoteAddress
        });

        ws.on('message', async (data) => {
            try {
                console.log('WebSocket message received:', {
                    type: typeof data,
                    isBuffer: Buffer.isBuffer(data),
                    isArrayBuffer: data instanceof ArrayBuffer
                });

                // Check if it's a string message (JSON)
                if (typeof data === 'string') {
                    console.log('Processing string message:', data);
                    const message = JSON.parse(data);
                    await handleWebSocketMessage(ws, message);
                } else if (Buffer.isBuffer(data)) {
                    // Try to parse as string first (might be JSON sent as buffer)
                    try {
                        const stringData = data.toString('utf8');
                        console.log('Trying to parse buffer as string:', stringData);
                        const message = JSON.parse(stringData);
                        await handleWebSocketMessage(ws, message);
                    } catch (parseError) {
                        // If not JSON, treat as binary audio data
                        console.log('Treating as binary audio data, size:', data.length);
                        await handleAudioData(ws, data);
                    }
                } else {
                    // Handle other data types (ArrayBuffer, etc.)
                    let audioBuffer: Buffer;
                    if (data instanceof ArrayBuffer) {
                        audioBuffer = Buffer.from(data);
                    } else {
                        audioBuffer = Buffer.from(data as any);
                    }
                    console.log('Treating as binary audio data (converted), size:', audioBuffer.length);
                    await handleAudioData(ws, audioBuffer);
                }
            } catch (error) {
                console.error('Error handling WebSocket message:', error);
            }
        });

        ws.on('close', () => {
            console.log('WebSocket connection closed');
            // Cleanup any associated sessions
            for (const [sessionId, sessionData] of Array.from(activeSessions.entries())) {
                if (sessionData.ws === ws) {
                    console.log('Cleaning up session:', sessionId);
                    sessionData.session?.close();
                    activeSessions.delete(sessionId);
                    break;
                }
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });

    console.log('WebSocket server initialized on port 3001');
    return wss;
}

async function handleWebSocketMessage(ws: any, message: any) {
    const { type, sessionId, sampleRate } = message;
    console.log('Received WebSocket message:', { type, sessionId });

    switch (type) {
        case 'start':
            await handleStartSession(ws, sessionId);
            break;
        case 'end':
            await handleEndSession(sessionId);
            break;
        default:
            console.log('Unknown message type:', type);
            ws.send(JSON.stringify({ error: 'Unknown message type' }));
    }
}

async function handleAudioData(ws: any, audioData: Buffer) {
    // Find session associated with this WebSocket
    let sessionData = null;
    for (const [sessionId, data] of Array.from(activeSessions.entries())) {
        if (data.ws === ws) {
            sessionData = data;
            break;
        }
    }

    if (!sessionData) {
        console.error('No session found for WebSocket. Active sessions:', activeSessions.size);
        console.error('Available session IDs:', Array.from(activeSessions.keys()));
        return;
    }

    // Check if Gemini session is ready
    if (!sessionData.session) {
        console.error('Gemini session not ready yet for session:', sessionData.sessionId);
        return;
    }

    try {
        // Convert audio data to base64 for Gemini Live
        const audioBuffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);
        const audioBase64 = audioBuffer.toString('base64');

        console.log('Sending audio data to Gemini, size:', audioBuffer.length);

        // Send to Gemini Live
        sessionData.session.sendClientContent({
            turns: [{
                role: 'user',
                parts: [{
                    inlineData: {
                        mimeType: sessionData.contentType || 'audio/pcm;rate=44100',
                        data: audioBase64,
                    },
                }],
            }],
        });

        // Check for immediate response
        const responseAudio = await checkForResponseAudio(sessionData);
        if (responseAudio) {
            ws.send(responseAudio);
        }
    } catch (error) {
        console.error('Failed to process audio data:', error);
    }
}

async function handleStartSession(ws: any, sessionId: string) {
    try {
        console.log('=== Starting session creation process ===');
        console.log('Session ID:', sessionId);
        console.log('WebSocket state:', ws.readyState);

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('API key not configured');
            ws.send(JSON.stringify({
                type: 'error',
                error: 'API key not configured'
            }));
            return;
        }

        const ai = new GoogleGenAI({ apiKey });
        const model = 'models/gemini-2.0-flash-live-001';
        const responseQueue: LiveServerMessage[] = [];
        const audioParts: string[] = [];

        // Create session variable that will be set by the connection
        let geminiSession: any = null;

        // Create a placeholder session entry first
        console.log('Creating placeholder session entry...');
        activeSessions.set(sessionId, {
            session: null, // Will be set once Gemini session is ready
            responseQueue,
            audioParts,
            ws,
            contentType: 'audio/pcm;rate=44100',
            sessionId: sessionId,
            status: 'creating'
        });

        console.log('Placeholder created. Total sessions:', activeSessions.size);
        console.log('Session IDs:', Array.from(activeSessions.keys()));

        console.log('Connecting to Gemini Live API with model:', model);
        geminiSession = await ai.live.connect({
            model,
            callbacks: {
                onopen: () => {
                    console.log('=== Gemini session opened ===');
                    console.log('Session ID:', sessionId);
                    // Update the session with the actual Gemini session
                    const sessionData = activeSessions.get(sessionId);
                    if (sessionData) {
                        sessionData.session = geminiSession;
                        sessionData.status = 'ready';
                        console.log('Session updated with Gemini connection');
                        console.log('Session is now ready for audio data');
                    } else {
                        console.error('Session data not found when Gemini opened!');
                    }
                },
                onmessage: (message: LiveServerMessage) => {
                    console.log('Received message from Gemini');
                    responseQueue.push(message);
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Gemini session error:', e.message);
                    activeSessions.delete(sessionId);
                },
                onclose: (e: CloseEvent) => {
                    console.log('Gemini session closed:', e.reason);
                    activeSessions.delete(sessionId);
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Zephyr' },
                    },
                },
                realtimeInputConfig: {
                    turnCoverage: TurnCoverage.TURN_INCLUDES_ALL_INPUT,
                },
            },
        });

        console.log('Gemini Live connection established');

        // Update the session data with the connected session
        const sessionData = activeSessions.get(sessionId);
        if (sessionData) {
            sessionData.session = geminiSession;
            sessionData.status = 'ready';
            console.log('Session data fully updated');
        } else {
            console.error('Session data lost during connection!');
        }

        console.log('=== Session fully initialized ===');
        console.log('Sending session-started message to client');

        ws.send(JSON.stringify({
            type: 'session-started',
            sessionId
        }));

        console.log('Session-started message sent');

    } catch (error: any) {
        console.error('=== Failed to start session ===');
        console.error('Error:', error);
        console.error('Stack:', error.stack);
        activeSessions.delete(sessionId);
        ws.send(JSON.stringify({
            type: 'error',
            error: 'Failed to start session',
            details: error.message
        }));
    }
}

async function handleEndSession(sessionId: string) {
    const sessionData = activeSessions.get(sessionId);
    if (sessionData) {
        const finalAudio = await handleFinalTurn(sessionData);
        if (finalAudio) {
            sessionData.ws.send(finalAudio);
        }
        sessionData.session?.close();
        activeSessions.delete(sessionId);
    }
}

async function checkForResponseAudio(sessionData: any): Promise<Buffer | null> {
    const { responseQueue, audioParts } = sessionData;

    while (responseQueue.length > 0) {
        const message = responseQueue.shift();
        if (message?.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                    audioParts.push(part.inlineData.data);
                }
            }
        }

        if (message?.serverContent?.turnComplete && audioParts.length > 0) {
            const audioBuffer = convertToWav(audioParts, 'audio/pcm;rate=24000');
            audioParts.length = 0;
            return audioBuffer;
        }
    }

    return null;
}

async function handleFinalTurn(sessionData: any): Promise<Buffer | null> {
    const { responseQueue, audioParts } = sessionData;
    let done = false;

    while (!done) {
        if (responseQueue.length > 0) {
            const message = responseQueue.shift();
            if (message?.serverContent?.modelTurn?.parts) {
                for (const part of message.serverContent.modelTurn.parts) {
                    if (part.inlineData?.data) {
                        audioParts.push(part.inlineData.data);
                    }
                }
            }
            if (message?.serverContent?.turnComplete) {
                done = true;
            }
        } else {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    if (audioParts.length > 0) {
        return convertToWav(audioParts, 'audio/pcm;rate=24000');
    }

    return null;
}

function convertToWav(rawData: string[], mimeType: string): Buffer {
    const options = parseMimeType(mimeType);
    const dataLength = rawData.reduce((a, b) => a + b.length, 0);
    const wavHeader = createWavHeader(dataLength, options);
    const buffer = Buffer.concat(rawData.map(data => Buffer.from(data, 'base64')));
    return Buffer.concat([wavHeader, buffer]);
}

interface WavConversionOptions {
    numChannels: number;
    sampleRate: number;
    bitsPerSample: number;
}

function parseMimeType(mimeType: string): WavConversionOptions {
    const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
    const [_, format] = fileType.split('/');

    const options: Partial<WavConversionOptions> = {
        numChannels: 1,
        bitsPerSample: 16,
    };

    if (format && format.startsWith('L')) {
        const bits = parseInt(format.slice(1), 10);
        if (!isNaN(bits)) {
            options.bitsPerSample = bits;
        }
    }

    for (const param of params) {
        const [key, value] = param.split('=').map(s => s.trim());
        if (key === 'rate') {
            options.sampleRate = parseInt(value, 10);
        }
    }

    return options as WavConversionOptions;
}

function createWavHeader(dataLength: number, options: WavConversionOptions): Buffer {
    const { numChannels, sampleRate, bitsPerSample } = options;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const buffer = Buffer.alloc(44);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);

    return buffer;
}

// HTTP endpoint to initialize WebSocket server
export async function GET() {
    initWebSocketServer();
    return new Response(JSON.stringify({
        message: 'WebSocket server initialized',
        port: 3001,
        path: '/voice-stream'
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
} 