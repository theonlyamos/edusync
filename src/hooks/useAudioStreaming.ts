import { useState, useRef, useCallback, useEffect } from 'react';

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
    sendText: (text: string) => void;
    sendMedia: (base64Data: string, mimeType: string) => void;
    sendViewport: (width: number, height: number, dpr: number) => void;
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
    const sessionIdRef = useRef<string | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<AudioWorkletNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const playbackCtxRef = useRef<AudioContext | null>(null);
    const nextPlaybackTimeRef = useRef<number>(0);
    const toolCallListenerRef = useRef<((name: string, args: any) => void) | null>(null);

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

        // Close the WebSocket connection if it's open
        if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
            wsRef.current.close();
        }
        wsRef.current = null;

        // Clear the session ID
        sessionIdRef.current = null;
        console.log('Cleaned up all audio resources.');
    }, []);

    // Function to handle stopping the stream
    const stopStreaming = useCallback(() => {
        console.log("Stopping stream...");
        setIsStreaming(false);
        isStreamingRef.current = false;
        setConnectionStatus('disconnected');

        // If the WebSocket is open, send an 'end' message to the server
        if (wsRef.current?.readyState === WebSocket.OPEN && sessionIdRef.current) {
            wsRef.current.send(JSON.stringify({ type: 'end', sessionId: sessionIdRef.current }));
        }

        // Close playback context
        if (playbackCtxRef.current && playbackCtxRef.current.state !== 'closed') {
            playbackCtxRef.current.close();
        }
        playbackCtxRef.current = null;
        nextPlaybackTimeRef.current = 0;

        // Run the full cleanup for capture resources
        cleanupAudioResources();
    }, [cleanupAudioResources]);

    // Sets up the AudioWorklet to process and send microphone data
    const setupAudioWorklet = useCallback(async (stream: MediaStream, ws: WebSocket, sampleRate: number) => {
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
            // Only send data if we are actively streaming and the WebSocket is open
            if (!isStreamingRef.current || ws.readyState !== WebSocket.OPEN) return;

            if (event.data.type === 'audioData') {
                // Convert the raw float audio data to 16-bit PCM format
                const float32Chunk = new Float32Array(event.data.data);
                const pcmData = new Int16Array(float32Chunk.length);
                for (let i = 0; i < float32Chunk.length; i++) {
                    const sample = Math.max(-1, Math.min(1, float32Chunk[i]));
                    pcmData[i] = sample < 0 ? sample * 32768 : sample * 32767;
                }
                ws.send(pcmData.buffer);
            } else {
                // Continuous playback of WAV fragment
                const arrayBuf = event.data as ArrayBuffer;

                const playChunk = async () => {
                    try {
                        let ctx = playbackCtxRef.current;
                        if (!ctx || ctx.state === 'closed') {
                            ctx = new AudioContext({ sampleRate: 24000 });
                            playbackCtxRef.current = ctx;
                            nextPlaybackTimeRef.current = ctx.currentTime;
                        }

                        // decode WAV to AudioBuffer
                        const audioBuffer = await ctx.decodeAudioData(arrayBuf.slice(0));

                        const source = ctx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(ctx.destination);

                        const startAt = Math.max(nextPlaybackTimeRef.current, ctx.currentTime + 0.05);
                        source.start(startAt);
                        nextPlaybackTimeRef.current = startAt + audioBuffer.duration;

                        // Mark assistant speaking
                        setIsSpeaking(true);
                        if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
                        speakingTimeoutRef.current = setTimeout(() => setIsSpeaking(false), audioBuffer.duration * 1000 + 100);
                    } catch (e) {
                        console.error('Failed to play audio chunk', e);
                    }
                };

                playChunk();
            }
        };

        source.connect(workletNode);
        processorRef.current = workletNode;
    }, []);

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

            // --- Step 2 & 3: Connect, send start, and wait for confirmation ---
            await new Promise<void>(async (resolve, reject) => {
                try {
                    const res = await fetch('/api/students/illustrator/voice-stream');
                    const data = await res.json();

                    const newWs = new WebSocket(`ws://localhost:${data.port}${data.path}`);
                    newWs.binaryType = 'arraybuffer';
                    wsRef.current = newWs;

                    const sessionId = `session_${Date.now()}`;
                    sessionIdRef.current = sessionId;

                    const timeout = setTimeout(() => {
                        reject(new Error('Session start timeout'));
                    }, 20000);

                    newWs.onopen = () => {
                        newWs.send(JSON.stringify({ type: 'start', sessionId, sampleRate }));
                    };

                    newWs.onmessage = async (event: MessageEvent) => {
                        if (typeof event.data === 'string') {
                            const message = JSON.parse(event.data);
                            if (message.type === 'session-started' && message.sessionId === sessionId) {
                                clearTimeout(timeout);
                                await setupAudioWorklet(stream as MediaStream, newWs, sampleRate);
                                setConnectionStatus('connected');
                                resolve();
                            } else if (message.type === 'session-ended') {
                                console.log('Server signalled session end:', message.reason);
                                stopStreaming();
                            } else if (message.type === 'tool-call') {
                                toolCallListenerRef.current?.(message.name, message.args);
                            } else if (message.type === 'playback-interrupted') {
                                if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
                                setIsSpeaking(false);
                                if (playbackCtxRef.current && playbackCtxRef.current.state !== 'closed') {
                                    playbackCtxRef.current.close();
                                }
                                playbackCtxRef.current = null;
                                nextPlaybackTimeRef.current = 0;
                            } else if (message.type === 'error') {
                                clearTimeout(timeout);
                                reject(new Error(message.error || 'Unknown server error during startup'));
                            }
                        } else {
                            // Continuous playback of WAV fragment
                            const arrayBuf = event.data as ArrayBuffer;

                            const playChunk = async () => {
                                try {
                                    let ctx = playbackCtxRef.current;
                                    if (!ctx || ctx.state === 'closed') {
                                        ctx = new AudioContext({ sampleRate: 24000 });
                                        playbackCtxRef.current = ctx;
                                        nextPlaybackTimeRef.current = ctx.currentTime;
                                    }

                                    // decode WAV to AudioBuffer
                                    const audioBuffer = await ctx.decodeAudioData(arrayBuf.slice(0));

                                    const source = ctx.createBufferSource();
                                    source.buffer = audioBuffer;
                                    source.connect(ctx.destination);

                                    const startAt = Math.max(nextPlaybackTimeRef.current, ctx.currentTime + 0.05);
                                    source.start(startAt);
                                    nextPlaybackTimeRef.current = startAt + audioBuffer.duration;

                                    // Mark assistant speaking
                                    setIsSpeaking(true);
                                    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
                                    speakingTimeoutRef.current = setTimeout(() => setIsSpeaking(false), audioBuffer.duration * 1000 + 100);
                                } catch (e) {
                                    console.error('Failed to play audio chunk', e);
                                }
                            };

                            playChunk();
                        }
                    };

                    newWs.onerror = (err) => {
                        clearTimeout(timeout);
                        setConnectionStatus('disconnected');
                        reject(new Error('WebSocket connection failed'))
                    };

                    newWs.onclose = () => {
                        clearTimeout(timeout);
                        setConnectionStatus('disconnected');
                        if (isStreamingRef.current) {
                            reject(new Error('Connection closed prematurely.'));
                        }
                    };

                } catch (err) {
                    reject(err);
                }
            });

        } catch (err: any) {
            console.error('Failed to start streaming:', err);
            setError(`Failed to start streaming: ${err.message}`);
            stopStreaming(); // Use stopStreaming for full cleanup on failure
            setConnectionStatus('disconnected');
        }
    }, [setupAudioWorklet, stopStreaming, cleanupAudioResources]);

    const setToolCallListener = useCallback((cb: (name: string, args: any) => void) => {
        toolCallListenerRef.current = cb;
    }, []);

    const clearError = useCallback(() => setError(''), []);

    const sendText = useCallback((text: string) => {
        try {
            if (wsRef.current?.readyState === WebSocket.OPEN && sessionIdRef.current) {
                wsRef.current.send(JSON.stringify({ type: 'text', sessionId: sessionIdRef.current, text }));
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
            if (wsRef.current?.readyState === WebSocket.OPEN && sessionIdRef.current) {
                wsRef.current.send(JSON.stringify({ type: 'text', sessionId: sessionIdRef.current, text: payload }));
            }
        } catch (e) {
            console.error('sendViewport failed:', e);
        }
    }, []);

    const sendMedia = useCallback((base64Data: string, mimeType: string) => {
        try {
            if (wsRef.current?.readyState === WebSocket.OPEN && sessionIdRef.current) {
                wsRef.current.send(JSON.stringify({ type: 'media', sessionId: sessionIdRef.current, data: base64Data, mimeType }));
            }
        } catch (e) {
            console.error('sendMedia failed:', e);
        }
    }, []);

    // Effect to ensure cleanup on component unmount
    useEffect(() => {
        return () => {
            if (isStreamingRef.current) {
                stopStreaming();
            }
        };
    }, [stopStreaming]);

    return { isStreaming, audioUrl, error, isSpeaking, connectionStatus, startStreaming, stopStreaming, clearError, setToolCallListener, sendText, sendMedia, sendViewport };
}
