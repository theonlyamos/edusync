import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, MediaResolution, Modality, LiveServerMessage, Type, Behavior, FunctionResponseScheduling } from '@google/genai';

interface AudioStreamingState {
    isStreaming: boolean;
    audioUrl: string | null;
    error: string;
    isSpeaking: boolean;
    connectionStatus: 'disconnected' | 'connecting' | 'connected';
}

interface AudioStreamingActions {
    startStreaming: () => Promise<void>;
    stopStreaming: () => void;
    clearError: () => void;
    setToolCallListener: (cb: (name: string, args: any) => void) => void;
    setOnAudioDataListener: (cb: (data: Float32Array<ArrayBufferLike>) => void) => void;
    setOnAiAudioDataListener: (cb: (data: Float32Array) => void) => void;
    sendText: (text: string) => void;
    sendMedia: (base64Data: string, mimeType: string) => void;
    sendViewport: (width: number, height: number, dpr: number) => void;
    getAnalyser: () => AnalyserNode | null;
}

export function useAudioStreaming(): AudioStreamingState & AudioStreamingActions {
    const [isStreaming, setIsStreaming] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Refs to hold mutable values that don't trigger re-renders
    const isStreamingRef = useRef(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<AudioWorkletNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const playbackCtxRef = useRef<AudioContext | null>(null);
    const nextPlaybackTimeRef = useRef<number>(0);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const toolCallListenerRef = useRef<((name: string, args: any) => void) | null>(null);
    const onAudioDataListenerRef = useRef<((data: Float32Array<ArrayBufferLike>) => void) | null>(null);
    const onAiAudioDataListenerRef = useRef<((data: Float32Array) => void) | null>(null);
    const lastAttemptTimeRef = useRef<number>(0);
    const geminiLiveSessionRef = useRef<any>(null);
    const sessionResumptionHandleRef = useRef<string | null>(null);
    const isResumingSessionRef = useRef<boolean>(false);

    // Centralized cleanup function
    const cleanupAudioResources = useCallback(() => {
        // Disconnect and stop the audio processor
        processorRef.current?.disconnect();
        processorRef.current = null;

        // Close the AudioContext if it exists and is not already closed
        if (audioContextRef.current?.state !== 'closed') {
            audioContextRef.current?.close();
            audioContextRef.current = null;
        }

        // Stop all tracks on the media stream
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;

        // Close Gemini Live session if it exists
        if (geminiLiveSessionRef.current) {
            try {
                geminiLiveSessionRef.current.close();
            } catch (e) {
                console.warn('Failed to close Gemini Live session:', e);
            }
            geminiLiveSessionRef.current = null;
        }
    }, []);

    // Function to handle stopping the stream
    const stopStreaming = useCallback(() => {
        setIsStreaming(false);
        isStreamingRef.current = false;
        setConnectionStatus('disconnected');

        // Clear resumption handle when manually stopping
        sessionResumptionHandleRef.current = null;
        isResumingSessionRef.current = false;

        // Close the Gemini Live session if it exists
        if (geminiLiveSessionRef.current) {
            try {
                geminiLiveSessionRef.current.close();
            } catch (e) {
                console.warn('Failed to close Gemini Live session during stop:', e);
            }
        }

        // Close playback context
        if (playbackCtxRef.current && playbackCtxRef.current.state !== 'closed') {
            playbackCtxRef.current.close();
        }
        playbackCtxRef.current = null;
        analyserRef.current = null;
        nextPlaybackTimeRef.current = 0;

        // Run the full cleanup for capture resources
        cleanupAudioResources();
    }, [cleanupAudioResources]);



    // Main function to start the streaming process
    const startStreaming = useCallback(async () => {
        if (isStreamingRef.current) return;

        // Reset state
        setError('');
        setAudioUrl(null);
        setIsStreaming(true);
        isStreamingRef.current = true;
        setConnectionStatus('connecting');
        let stream: MediaStream | null = null;

        try {
            const now = Date.now();
            if (now - lastAttemptTimeRef.current < 2500) {
                throw new Error('Retrying too quickly – waiting before next attempt');
            }
            lastAttemptTimeRef.current = now;
            // --- Step 1: Get microphone access and sample rate ---
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true }
            });
            streamRef.current = stream;

            // Gemini native-audio models currently require 16 kHz PCM input.
            const desiredSampleRate = 16000;
            const tempContext = new AudioContext({ sampleRate: desiredSampleRate });
            const sampleRate = desiredSampleRate;
            tempContext.close();

            // --- Step 2 & 3: Use browser-based Gemini Live connection ---
            await startGeminiLiveSession(stream, sampleRate);

        } catch (err: any) {
            console.error('Failed to start streaming:', err);
            setError(`Failed to start streaming: ${err.message}`);
            stopStreaming(); // Use stopStreaming for full cleanup on failure
            setConnectionStatus('disconnected');
        }
    }, [stopStreaming, cleanupAudioResources]);

    // Browser-based Gemini Live connection
    const startGeminiLiveSession = useCallback(async (stream: MediaStream, sampleRate: number) => {
        try {
            // Get ephemeral token
            const tokenResponse = await fetch('/api/genai/ephemeral', { method: 'POST' });
            if (!tokenResponse.ok) {
                throw new Error('Failed to get ephemeral token');
            }
            const { token } = await tokenResponse.json();

            const ai = new GoogleGenAI({
                apiKey: token,
                httpOptions: { apiVersion: 'v1alpha' }
            });

            // Configuration is locked server-side via liveConnectConstraints
            // No need to pass config since it's pre-configured in the ephemeral token

            const responseQueue: LiveServerMessage[] = [];
            const audioParts: string[] = [];

            const connectConfig: any = {
                model: 'models/gemini-live-2.5-flash-preview',
                callbacks: {
                    onopen: () => {
                        setConnectionStatus('connected');
                        isResumingSessionRef.current = false;
                    },
                    onmessage: (message: LiveServerMessage) => {
                        responseQueue.push(message);
                        processGeminiResponseQueue(responseQueue, audioParts);
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Gemini Live session error:', e.message);
                        setError(`Gemini error: ${e.message}`);
                        setConnectionStatus('disconnected');
                        // Clear resumption handle on error
                        sessionResumptionHandleRef.current = null;
                    },
                    onclose: (e: CloseEvent) => {
                        console.log('Gemini Live session closed:', e.reason);
                        setConnectionStatus('disconnected');

                        // Attempt to resume session if we have a handle and it's not a manual stop
                        if (sessionResumptionHandleRef.current && isStreamingRef.current && !isResumingSessionRef.current) {
                            console.log('Attempting to resume session with handle:', sessionResumptionHandleRef.current);
                            isResumingSessionRef.current = true;
                            // Delay resumption slightly to avoid immediate reconnection
                            setTimeout(() => {
                                if (isStreamingRef.current) {
                                    startGeminiLiveSession(streamRef.current!, 16000);
                                }
                            }, 1000);
                        }
                    }
                }
            };

            // Add session resumption config if we have a handle
            if (sessionResumptionHandleRef.current) {
                connectConfig.config = {
                    sessionResumption: { handle: sessionResumptionHandleRef.current }
                };
            }

            const geminiSession = await ai.live.connect(connectConfig);

            geminiLiveSessionRef.current = geminiSession;

            // Set up audio capture and send to Gemini
            const audioContext = new AudioContext({ sampleRate });
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);

            try {
                await audioContext.audioWorklet.addModule('/audio-processor.js');
            } catch (e) {
                console.error('Failed to add audio worklet module.', e);
                throw new Error('Failed to load audio processor.');
            }

            const workletNode = new AudioWorkletNode(audioContext, 'audio-stream-processor');

            workletNode.port.onmessage = (event) => {
                if (!isStreamingRef.current || !geminiLiveSessionRef.current) return;

                if (event.data.type === 'audioData') {
                    const float32Chunk = new Float32Array(event.data.data);
                    onAudioDataListenerRef.current?.(float32Chunk);

                    // Convert the raw float audio data to 16-bit PCM format
                    const pcmData = new Int16Array(float32Chunk.length);
                    for (let i = 0; i < float32Chunk.length; i++) {
                        const sample = Math.max(-1, Math.min(1, float32Chunk[i]));
                        pcmData[i] = sample < 0 ? sample * 32768 : sample * 32767;
                    }

                    // Convert to base64 for Gemini
                    const uint8Array = new Uint8Array(pcmData.buffer);
                    const base64Audio = btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));

                    geminiLiveSessionRef.current.sendRealtimeInput({
                        audio: {
                            data: base64Audio,
                            mimeType: `audio/pcm;rate=${sampleRate}`
                        }
                    });
                }
            };

            source.connect(workletNode);
            processorRef.current = workletNode;

            // Send initial hello
            geminiSession.sendRealtimeInput({ text: 'Hello' });

        } catch (error: any) {
            console.error('Failed to start Gemini Live session:', error);
            throw error;
        }
    }, []);

    // Process Gemini Live response queue
    const processGeminiResponseQueue = useCallback((responseQueue: LiveServerMessage[], audioParts: string[]) => {
        const FRAGMENT_PARTS = 3;

        while (responseQueue.length > 0) {
            const message = responseQueue.shift();

            // Handle session resumption updates
            if ((message as any)?.sessionResumptionUpdate) {
                const update = (message as any).sessionResumptionUpdate;
                if (update.resumable && update.newHandle) {
                    console.log('Received new session resumption handle:', update.newHandle);
                    sessionResumptionHandleRef.current = update.newHandle;
                }
                continue;
            }

            // Handle GoAway messages
            if ((message as any)?.goAway) {
                const goAway = (message as any).goAway;
                console.log('Received GoAway message, time left:', goAway.timeLeft);
                // The connection will be terminated soon, but we have the resumption handle
                continue;
            }

            if (message?.serverContent && (message as any).serverContent.interrupted) {
                audioParts.length = 0;
                setIsSpeaking(false);
                if (playbackCtxRef.current && playbackCtxRef.current.state !== 'closed') {
                    playbackCtxRef.current.close();
                }
                playbackCtxRef.current = null;
                analyserRef.current = null;
                nextPlaybackTimeRef.current = 0;
                continue;
            }

            // Handle tool calls
            if (message?.toolCall?.functionCalls && message.toolCall.functionCalls.length > 0) {
                for (const fn of message.toolCall.functionCalls) {
                    toolCallListenerRef.current?.(fn.name || '', fn.args);

                    // Send response back to Gemini
                    try {
                        geminiLiveSessionRef.current?.sendToolResponse({
                            functionResponses: [
                                {
                                    id: fn.id || '',
                                    name: fn.name || '',
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

            // Handle audio data
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
                playGeminiAudioChunks(audioParts.slice());
                audioParts.length = 0;
            }
        }
    }, []);

    // Play audio chunks from Gemini
    const playGeminiAudioChunks = useCallback(async (rawData: string[]) => {
        try {
            const pcmData = rawData.map(data => {
                const binaryString = atob(data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                return bytes;
            });

            const totalDataLength = pcmData.reduce((acc, buffer) => acc + buffer.length, 0);
            const wavBuffer = convertToWav(rawData, 24000);

            let ctx = playbackCtxRef.current;
            if (!ctx || ctx.state === 'closed') {
                ctx = new AudioContext({ sampleRate: 24000 });
                playbackCtxRef.current = ctx;
                nextPlaybackTimeRef.current = ctx.currentTime;
            }

            // Create or reuse analyser for visualization
            if (!analyserRef.current || analyserRef.current.context !== ctx) {
                analyserRef.current = ctx.createAnalyser();
                analyserRef.current.fftSize = 256;
                analyserRef.current.smoothingTimeConstant = 0.8;
                analyserRef.current.connect(ctx.destination);
            }

            const audioBuffer = await ctx.decodeAudioData(wavBuffer.buffer as ArrayBuffer);
            const float32Data = audioBuffer.getChannelData(0);
            onAiAudioDataListenerRef.current?.(float32Data);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;

            // Always connect through analyser for visualization
            source.connect(analyserRef.current);

            const startAt = Math.max(nextPlaybackTimeRef.current, ctx.currentTime + 0.05);
            source.start(startAt);
            nextPlaybackTimeRef.current = startAt + audioBuffer.duration;

            setIsSpeaking(true);
            // Clear any existing timeout to prevent premature stopping
            if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);

            // Calculate when this chunk will finish playing
            const endTime = (startAt + audioBuffer.duration - ctx.currentTime) * 1000 + 250;
            speakingTimeoutRef.current = setTimeout(() => {
                // Only stop speaking if we're not expecting more audio
                if (nextPlaybackTimeRef.current <= ctx.currentTime + 0.1) {
                    setIsSpeaking(false);
                }
            }, endTime);

        } catch (e) {
            console.error('Failed to play Gemini audio chunks:', e);
        }
    }, []);

    // Helper function to convert PCM to WAV (reused from existing implementation)
    const convertToWav = useCallback((rawData: string[], sampleRate: number): Buffer => {
        const pcmData = rawData.map(data => {
            const binaryString = atob(data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return Buffer.from(bytes);
        });
        const totalDataLength = pcmData.reduce((acc, buffer) => acc + buffer.length, 0);

        const options = {
            numChannels: 1,
            sampleRate: sampleRate,
            bitsPerSample: 16,
        };
        const wavHeader = createWavHeader(totalDataLength, options);
        return Buffer.concat([wavHeader, ...pcmData]);
    }, []);

    const createWavHeader = useCallback((dataLength: number, options: { numChannels: number; sampleRate: number; bitsPerSample: number }): Buffer => {
        const { numChannels, sampleRate, bitsPerSample } = options;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
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
    }, []);

    const setToolCallListener = useCallback((cb: (name: string, args: any) => void) => {
        toolCallListenerRef.current = cb;
    }, []);

    const setOnAudioDataListener = useCallback((cb: (data: Float32Array<ArrayBufferLike>) => void) => {
        onAudioDataListenerRef.current = cb;
    }, []);

    const setOnAiAudioDataListener = useCallback((cb: (data: Float32Array) => void) => {
        onAiAudioDataListenerRef.current = cb;
    }, []);

    const clearError = useCallback(() => setError(''), []);

    const sendText = useCallback((text: string) => {
        try {
            if (geminiLiveSessionRef.current) {
                geminiLiveSessionRef.current.sendRealtimeInput({ text });
            } else {
                setError('Not connected');
            }
        } catch (e: any) {
            console.error('sendText failed:', e);
            setError('Failed to send text');
        }
    }, []);

    const sendViewport = useCallback((width: number, height: number, dpr: number) => {
        const payload = `VISUAL_VIEWPORT ${JSON.stringify({ width, height, devicePixelRatio: dpr })}`;
        try {
            if (geminiLiveSessionRef.current) {
                geminiLiveSessionRef.current.sendRealtimeInput({ text: payload });
            }
        } catch (e) {
            console.error('sendViewport failed:', e);
        }
    }, []);

    const sendMedia = useCallback((base64Data: string, mimeType: string) => {
        try {
            if (geminiLiveSessionRef.current) {
                geminiLiveSessionRef.current.sendRealtimeInput({
                    media: { data: base64Data, mimeType }
                });
            }
        } catch (e) {
            console.error('sendMedia failed:', e);
        }
    }, []);

    const getAnalyser = useCallback(() => {
        return analyserRef.current;
    }, []);

    // Effect to ensure cleanup on component unmount
    useEffect(() => {
        return () => {
            if (isStreamingRef.current) {
                stopStreaming();
            }
        };
    }, [stopStreaming]);

    return { isStreaming, audioUrl, error, isSpeaking, connectionStatus, startStreaming, stopStreaming, clearError, setToolCallListener, setOnAudioDataListener, setOnAiAudioDataListener, sendText, sendMedia, sendViewport, getAnalyser };
}
