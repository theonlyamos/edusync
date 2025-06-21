import { useState, useRef, useCallback, useEffect } from 'react';

interface AudioStreamingState {
    isStreaming: boolean;
    audioUrl: string | null;
    error: string;
}

interface AudioStreamingActions {
    startStreaming: () => Promise<void>;
    stopStreaming: () => void;
    clearError: () => void;
}

export function useAudioStreaming(): AudioStreamingState & AudioStreamingActions {
    const [isStreaming, setIsStreaming] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [error, setError] = useState('');

    // Refs to hold mutable values that don't trigger re-renders
    const isStreamingRef = useRef(false);
    const sessionIdRef = useRef<string | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<AudioWorkletNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

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

        // If the WebSocket is open, send an 'end' message to the server
        if (wsRef.current?.readyState === WebSocket.OPEN && sessionIdRef.current) {
            wsRef.current.send(JSON.stringify({ type: 'end', sessionId: sessionIdRef.current }));
        }

        // Run the full cleanup
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
                                resolve();
                            } else if (message.type === 'session-ended') {
                                console.log('Server signalled session end:', message.reason);
                                stopStreaming();
                            } else if (message.type === 'error') {
                                clearTimeout(timeout);
                                reject(new Error(message.error || 'Unknown server error during startup'));
                            }
                        } else {
                            const audioBlob = new Blob([event.data], { type: 'audio/wav' });
                            const url = URL.createObjectURL(audioBlob);
                            setAudioUrl(url);
                        }
                    };

                    newWs.onerror = (err) => {
                        clearTimeout(timeout);
                        reject(new Error('WebSocket connection failed'))
                    };

                    newWs.onclose = () => {
                        clearTimeout(timeout);
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
        }
    }, [setupAudioWorklet, stopStreaming, cleanupAudioResources]);

    const clearError = useCallback(() => setError(''), []);

    // Effect to ensure cleanup on component unmount
    useEffect(() => {
        return () => {
            if (isStreamingRef.current) {
                stopStreaming();
            }
        };
    }, [stopStreaming]);

    return { isStreaming, audioUrl, error, startStreaming, stopStreaming, clearError };
}
