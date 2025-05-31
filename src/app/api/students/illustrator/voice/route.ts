import { NextRequest } from 'next/server';
import { GoogleGenAI, MediaResolution, Modality, TurnCoverage, LiveServerMessage } from '@google/genai';

// WebSocket polyfills for Node.js environment
if (typeof global !== 'undefined') {
    try {
        // Import WebSocket dependencies for Node.js
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

export async function POST(req: NextRequest) {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const sessionId = url.searchParams.get('sessionId');

    if (action === 'start') {
        return handleStartSession(sessionId!);
    } else if (action === 'stream') {
        return handleStreamAudio(req, sessionId!);
    } else if (action === 'end') {
        return handleEndSession(sessionId!);
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
}

async function handleStartSession(sessionId: string) {
    try {
        // Check if API key is available
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return new Response(JSON.stringify({
                error: 'API key not configured',
                instructions: 'Create .env.local file with GEMINI_API_KEY=your_api_key_here. Get key from https://aistudio.google.com/app/apikey'
            }), { status: 500 });
        }

        const ai = new GoogleGenAI({
            apiKey: apiKey,
        });

        const model = 'models/gemini-2.0-flash-live-001';
        const responseQueue: LiveServerMessage[] = [];
        const audioParts: string[] = [];

        const session = await ai.live.connect({
            model,
            callbacks: {
                onopen: function () {
                    console.debug('Voice session opened for:', sessionId);
                },
                onmessage: function (message: LiveServerMessage) {
                    responseQueue.push(message);
                },
                onerror: function (e: ErrorEvent) {
                    console.error('Voice session error:', e.message);
                },
                onclose: function (e: CloseEvent) {
                    console.debug('Voice session closed:', e.reason);
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

        activeSessions.set(sessionId, {
            session,
            responseQueue,
            audioParts,
            audioChunks: []
        });

        return new Response(JSON.stringify({ success: true, sessionId }), { status: 200 });
    } catch (error: any) {
        console.error('Failed to start session:', error);

        // Provide more specific error messages
        let errorMessage = 'Failed to start session';
        if (error.message?.includes('API key')) {
            errorMessage = 'Invalid API key';
        } else if (error.message?.includes('quota')) {
            errorMessage = 'API quota exceeded';
        } else if (error.message?.includes('model')) {
            errorMessage = 'Model not available';
        } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
            errorMessage = 'Network connection error';
        }

        return new Response(JSON.stringify({
            error: errorMessage,
            details: error.message
        }), { status: 500 });
    }
}

async function handleStreamAudio(req: NextRequest, sessionId: string) {
    const sessionData = activeSessions.get(sessionId);
    if (!sessionData) {
        return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });
    }

    try {
        const contentType = req.headers.get('content-type') || 'audio/pcm;rate=16000';
        const audioChunk = Buffer.from(await req.arrayBuffer());

        // Store the chunk
        sessionData.audioChunks.push(audioChunk);

        // Convert PCM to base64 for Gemini Live
        let audioData: string;
        if (contentType.includes('pcm')) {
            // For PCM data, we can send it directly as base64
            audioData = audioChunk.toString('base64');
        } else {
            // For other formats, send as-is
            audioData = audioChunk.toString('base64');
        }

        // Send the audio chunk to Gemini Live
        sessionData.session.sendClientContent({
            turns: [
                {
                    role: 'user',
                    parts: [
                        {
                            inlineData: {
                                mimeType: contentType,
                                data: audioData,
                            },
                        },
                    ],
                },
            ],
        });

        // Check for any response audio
        const responseAudio = await checkForResponseAudio(sessionData);

        if (responseAudio) {
            return new Response(responseAudio, {
                status: 200,
                headers: {
                    'Content-Type': 'audio/wav',
                    'Content-Length': responseAudio.length.toString(),
                },
            });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error('Failed to stream audio:', error);
        return new Response(JSON.stringify({ error: 'Failed to stream audio' }), { status: 500 });
    }
}

async function handleEndSession(sessionId: string) {
    const sessionData = activeSessions.get(sessionId);
    if (!sessionData) {
        return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });
    }

    try {
        // Wait for final response
        const finalAudio = await handleFinalTurn(sessionData);

        // Close session
        sessionData.session.close();
        activeSessions.delete(sessionId);

        if (finalAudio) {
            return new Response(finalAudio, {
                status: 200,
                headers: {
                    'Content-Type': 'audio/wav',
                    'Content-Length': finalAudio.length.toString(),
                },
            });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (error) {
        console.error('Failed to end session:', error);
        return new Response(JSON.stringify({ error: 'Failed to end session' }), { status: 500 });
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
            audioParts.length = 0; // Clear the array
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

// Helper function to convert audio data to WAV (based on the docs)
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
    const {
        numChannels,
        sampleRate,
        bitsPerSample,
    } = options;

    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const buffer = Buffer.alloc(44);

    buffer.write('RIFF', 0);                      // ChunkID
    buffer.writeUInt32LE(36 + dataLength, 4);     // ChunkSize
    buffer.write('WAVE', 8);                      // Format
    buffer.write('fmt ', 12);                     // Subchunk1ID
    buffer.writeUInt32LE(16, 16);                 // Subchunk1Size (PCM)
    buffer.writeUInt16LE(1, 20);                  // AudioFormat (1 = PCM)
    buffer.writeUInt16LE(numChannels, 22);        // NumChannels
    buffer.writeUInt32LE(sampleRate, 24);         // SampleRate
    buffer.writeUInt32LE(byteRate, 28);           // ByteRate
    buffer.writeUInt16LE(blockAlign, 32);         // BlockAlign
    buffer.writeUInt16LE(bitsPerSample, 34);      // BitsPerSample
    buffer.write('data', 36);                     // Subchunk2ID
    buffer.writeUInt32LE(dataLength, 40);         // Subchunk2Size

    return buffer;
} 