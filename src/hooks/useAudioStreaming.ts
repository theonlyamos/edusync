import { useState, useRef, useCallback } from 'react';

interface AudioStreamingState {
    isStreaming: boolean;
    audioUrl: string | null;
    error: string;
}

interface AudioStreamingActions {
    startStreaming: () => Promise<void>;
    stopStreaming: () => Promise<void>;
    clearError: () => void;
}

export function useAudioStreaming(): AudioStreamingState & AudioStreamingActions {
    const [isStreaming, setIsStreaming] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [error, setError] = useState('');

    const isStreamingRef = useRef(false);
    const sessionIdRef = useRef<string | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | AudioWorkletNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const cleanupAudioResources = useCallback(async () => {
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }

        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            await audioContextRef.current.close();
            audioContextRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        sessionIdRef.current = null;
    }, []);

    const initializeWebSocket = useCallback((): Promise<WebSocket> => {
        return new Promise((resolve, reject) => {
            // Initialize WebSocket server first
            fetch('/api/students/illustrator/voice-stream')
                .then(() => {
                    const ws = new WebSocket('ws://localhost:3001/voice-stream');
                    ws.binaryType = 'arraybuffer';

                    ws.onopen = () => {
                        console.log('WebSocket connected');
                        wsRef.current = ws;
                        resolve(ws);
                    };

                    ws.onmessage = (event) => {
                        if (typeof event.data === 'string') {
                            const message = JSON.parse(event.data);
                            if (message.type === 'session-started') {
                                sessionIdRef.current = message.sessionId;
                                console.log('Session started:', message.sessionId);
                            } else if (message.type === 'error') {
                                setError(message.error);
                            }
                        } else {
                            // Binary audio response
                            const audioBlob = new Blob([event.data], { type: 'audio/wav' });
                            const url = URL.createObjectURL(audioBlob);
                            setAudioUrl(url);
                        }
                    };

                    ws.onerror = (error) => {
                        console.error('WebSocket error:', error);
                        reject(new Error('WebSocket connection failed'));
                    };

                    ws.onclose = () => {
                        console.log('WebSocket disconnected');
                        wsRef.current = null;
                    };
                })
                .catch(reject);
        });
    }, []);

    const setupAudioWorklet = useCallback(async (stream: MediaStream, ws: WebSocket) => {
        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaStreamSource(stream);

        await audioContextRef.current.audioWorklet.addModule('/audio-processor.js');
        const workletNode = new AudioWorkletNode(audioContextRef.current, 'audio-stream-processor');

        workletNode.port.start();
        workletNode.port.onmessage = (event) => {
            if (!isStreamingRef.current || !ws || ws.readyState !== WebSocket.OPEN) return;

            if (event.data.type === 'audioData') {
                const inputData = event.data.data;
                const sampleRate = audioContextRef.current?.sampleRate || 44100;
                const pcmData = new Int16Array(inputData.length);

                for (let i = 0; i < inputData.length; i++) {
                    const sample = Math.max(-1, Math.min(1, inputData[i]));
                    pcmData[i] = sample * 32767;
                }

                // Send binary data directly via WebSocket
                ws.send(pcmData.buffer);
            }
        };

        source.connect(workletNode);
        workletNode.connect(audioContextRef.current.destination);
        processorRef.current = workletNode;
    }, []);

    const startStreaming = useCallback(async () => {
        try {
            setError('');
            setAudioUrl(null);
            setIsStreaming(true);
            isStreamingRef.current = true;

            // Initialize WebSocket connection
            const ws = await initializeWebSocket();

            // Start session
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log('Sending start session message:', sessionId);
            ws.send(JSON.stringify({ type: 'start', sessionId }));

            // Wait for session to be ready
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Session creation timeout'));
                }, 10000); // 10 second timeout

                const originalOnMessage = ws.onmessage;
                ws.onmessage = (event: MessageEvent) => {
                    if (typeof event.data === 'string') {
                        const message = JSON.parse(event.data);
                        if (message.type === 'session-started') {
                            sessionIdRef.current = message.sessionId;
                            console.log('Session started, waiting for Gemini to be ready...');
                            // Give Gemini a moment to fully initialize
                            setTimeout(() => {
                                clearTimeout(timeout);
                                ws.onmessage = originalOnMessage; // Restore original handler
                                resolve();
                            }, 1000); // 1 second delay
                        } else if (message.type === 'error') {
                            clearTimeout(timeout);
                            reject(new Error(message.error));
                        }
                    }
                    // Call original handler for other messages
                    if (originalOnMessage) {
                        originalOnMessage.call(ws, event);
                    }
                };
            });

            console.log('Session ready, starting microphone...');

            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });

            streamRef.current = stream;

            // Setup audio processing
            await setupAudioWorklet(stream, ws);

            console.log('Audio streaming started successfully');

        } catch (err: any) {
            console.error('Failed to start streaming:', err);
            setError(`Failed to start streaming: ${err.message}`);
            setIsStreaming(false);
            isStreamingRef.current = false;
            await cleanupAudioResources();
        }
    }, [initializeWebSocket, setupAudioWorklet, cleanupAudioResources]);

    const stopStreaming = useCallback(async () => {
        setIsStreaming(false);
        isStreamingRef.current = false;

        if (wsRef.current && sessionIdRef.current) {
            wsRef.current.send(JSON.stringify({
                type: 'end',
                sessionId: sessionIdRef.current
            }));
        }

        await cleanupAudioResources();
    }, [cleanupAudioResources]);

    const clearError = useCallback(() => {
        setError('');
    }, []);

    return {
        isStreaming,
        audioUrl,
        error,
        startStreaming,
        stopStreaming,
        clearError,
    };
} 