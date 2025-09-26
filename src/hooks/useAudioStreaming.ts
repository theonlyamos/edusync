import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, MediaResolution, Modality, LiveServerMessage, Type, Behavior, FunctionResponseScheduling } from '@google/genai';

interface AudioStreamingState {
    isStreaming: boolean;
    audioUrl: string | null;
    error: string;
    isSpeaking: boolean;
    connectionStatus: 'disconnected' | 'connecting' | 'connected';
    showFeedbackForm: boolean;
    feedbackTrigger: 'manual_stop' | 'connection_reset' | 'error' | null;
}

interface AudioStreamingActions {
    startStreaming: () => Promise<void>;
    stopStreaming: () => void;
    clearError: () => void;
    setToolCallListener: (cb: (name: string, args: any) => void) => void;
    setOnAudioDataListener: (cb: (data: Float32Array<ArrayBufferLike>) => void) => void;
    setOnAiAudioDataListener: (cb: (data: Float32Array) => void) => void;
    setOnRecordingsReady: (cb: (payload: { user: Blob | null; ai: Blob | null; durationMs: number }) => void) => void;
    setSessionId: (id: string | null) => void;
    sendText: (text: string) => void;
    sendMedia: (base64Data: string, mimeType: string) => void;
    sendViewport: (width: number, height: number, dpr: number) => void;
    getAnalyser: () => AnalyserNode | null;
    getMicAnalyser?: () => AnalyserNode | null;
    closeFeedbackForm: () => void;
    submitFeedback: (feedback: any) => Promise<void>;
    setSaveOnlySpeech?: (enabled: boolean) => void;
    setOnVadStateListener?: (cb: (active: boolean, rms: number) => void) => void;
}

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
* **Set Topic:** On a new topic or when you detect a topic change, call \`set_topic\` with a concise 3–8 word title (no punctuation, title case when natural). Example: { "topic": "Photosynthesis Basics" }.
* **Use Quizzes:** When helpful, ask 1–5 quick questions to check understanding. If an interactive quiz is best, build it with \`generate_visualization_description\`.
* **Use Flashcards:** When memorization helps (terms, formulas, definitions), create a small set of flashcards with \`generate_visualization_description\`.

### Explanation Rules

* Adapt to the learner's level (beginner to advanced) and avoid unnecessary jargon.
* Keep the focus on the core idea and how the visual/quiz builds intuition.
`;

export function useAudioStreaming(): AudioStreamingState & AudioStreamingActions {
    const [isStreaming, setIsStreaming] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [showFeedbackForm, setShowFeedbackForm] = useState(false);
    const [feedbackTrigger, setFeedbackTrigger] = useState<'manual_stop' | 'connection_reset' | 'error' | null>(null);
    const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Refs to hold mutable values that don't trigger re-renders
    const isStreamingRef = useRef(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<AudioWorkletNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const playbackCtxRef = useRef<AudioContext | null>(null);
    const nextPlaybackTimeRef = useRef<number>(0);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const micAnalyserRef = useRef<AnalyserNode | null>(null);
    const toolCallListenerRef = useRef<((name: string, args: any) => void) | null>(null);
    const onAudioDataListenerRef = useRef<((data: Float32Array<ArrayBufferLike>) => void) | null>(null);
    const onAiAudioDataListenerRef = useRef<((data: Float32Array) => void) | null>(null);
    const onRecordingsReadyRef = useRef<((payload: { user: Blob | null; ai: Blob | null; durationMs: number }) => void) | null>(null);
    const onVadStateListenerRef = useRef<((active: boolean, rms: number) => void) | null>(null);
    const lastAttemptTimeRef = useRef<number>(0);
    const geminiLiveSessionRef = useRef<any>(null);
    // Session resumption
    const sessionResumptionHandleRef = useRef<string | null>(null);
    const isResumingSessionRef = useRef<boolean>(false);
    const isManualDisconnectRef = useRef<boolean>(false);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const sessionStartedAtRef = useRef<number | null>(null);
    const currentSessionIdRef = useRef<string | null>(null);

    const userRecorderRef = useRef<MediaRecorder | null>(null);
    const userChunksRef = useRef<Blob[]>([]);
    const aiRecorderRef = useRef<MediaRecorder | null>(null);
    const aiChunksRef = useRef<Blob[]>([]);
    const playbackDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const pendingUserChunkQueueRef = useRef<Blob[]>([]);
    const pendingAiChunkQueueRef = useRef<Blob[]>([]);
    const isUploadingRef = useRef<{ user: boolean; ai: boolean }>({ user: false, ai: false });
    const segmentSizeMsRef = useRef<number>(60000);
    const lastUserSegmentStartRef = useRef<number>(0);
    const lastAiSegmentStartRef = useRef<number>(0);
    const pendingUserSegmentsRef = useRef<Blob[]>([]);
    const pendingAiSegmentsRef = useRef<Blob[]>([]);
    const userSegmentIndexRef = useRef<number>(1);
    const aiSegmentIndexRef = useRef<number>(1);

    // VAD (Voice Activity Detection) state for microphone recording gating
    const saveOnlySpeechRef = useRef<boolean>(false);
    const vadSpeechActiveRef = useRef<boolean>(false);
    const vadSpeechSinceLastChunkRef = useRef<boolean>(false);
    const vadSpeechAccumMsRef = useRef<number>(0);
    const vadSilenceAccumMsRef = useRef<number>(0);
    const vadStartThresholdRef = useRef<number>(0.015); // RMS start threshold
    const vadStopThresholdRef = useRef<number>(0.007); // RMS stop threshold (hysteresis)
    const vadMinSpeechMsRef = useRef<number>(150);
    const vadMinSilenceMsRef = useRef<number>(300);

    const setSessionId = useCallback((id: string | null) => {
        currentSessionIdRef.current = id;
    }, []);

    const padIndex = (n: number) => n.toString().padStart(6, '0');

    const drainUploads = useCallback(async (kind: 'user' | 'ai') => {
        if (!currentSessionIdRef.current) return;
        const segmentsRef = kind === 'user' ? pendingUserSegmentsRef : pendingAiSegmentsRef;
        if (isUploadingRef.current[kind]) return;
        const next = segmentsRef.current.shift();
        if (!next) return;
        isUploadingRef.current[kind] = true;
        try {
            const indexRef = kind === 'user' ? userSegmentIndexRef : aiSegmentIndexRef;
            const idx = indexRef.current++;
            const form = new FormData();
            form.append('part', next);
            form.append('index', String(idx));
            form.append('type', kind);
            await fetch(`/api/learning/sessions/${currentSessionIdRef.current}/recordings/parts?type=${encodeURIComponent(kind)}&index=${encodeURIComponent(padIndex(idx))}`,
                { method: 'POST', body: form });
        } catch { }
        finally {
            isUploadingRef.current[kind] = false;
            // Drain next if any
            if ((kind === 'user' ? pendingUserSegmentsRef : pendingAiSegmentsRef).current.length > 0) {
                // Yield to event loop
                setTimeout(() => { void drainUploads(kind); }, 0);
            }
        }
    }, []);

    const maybeUploadSegment = useCallback((kind: 'user' | 'ai', force = false) => {
        const now = Date.now();
        const lastRef = kind === 'user' ? lastUserSegmentStartRef : lastAiSegmentStartRef;
        if (lastRef.current === 0) lastRef.current = now;
        const elapsed = now - lastRef.current;
        if (!force && elapsed < segmentSizeMsRef.current) return;
        const chunkQueueRef = kind === 'user' ? pendingUserChunkQueueRef : pendingAiChunkQueueRef;
        if (chunkQueueRef.current.length === 0) return;
        const blob = new Blob(chunkQueueRef.current, { type: 'audio/webm' });
        chunkQueueRef.current = [];
        lastRef.current = now;
        const segRef = kind === 'user' ? pendingUserSegmentsRef : pendingAiSegmentsRef;
        segRef.current.push(blob);
        void drainUploads(kind);
    }, [drainUploads]);

    // Centralized cleanup function
    const cleanupAudioResources = useCallback(() => {
        // Disconnect and stop the audio processor
        processorRef.current?.disconnect();
        processorRef.current = null;

        // Clean up analyser
        if (analyserRef.current) {
            try {
                analyserRef.current.disconnect();
            } catch (e) {
                // Ignore disconnect errors during cleanup
            }
            analyserRef.current = null;
        }
        // Clean up mic analyser
        if (micAnalyserRef.current) {
            try { micAnalyserRef.current.disconnect(); } catch (e) { }
            micAnalyserRef.current = null;
        }

        // Close the playback AudioContext if it exists and is not already closed
        if (playbackCtxRef.current?.state !== 'closed') {
            try {
                playbackCtxRef.current?.close();
            } catch (e) {
                console.warn('Failed to close playback context:', e);
            }
            playbackCtxRef.current = null;
        }

        // Close the recording AudioContext if it exists and is not already closed
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

        // Clear reconnect timeout
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        // Clear speaking timeout
        if (speakingTimeoutRef.current) {
            clearTimeout(speakingTimeoutRef.current);
            speakingTimeoutRef.current = null;
        }
    }, []);

    // Function to handle stopping the stream
    const stopStreaming = useCallback(() => {
        // Mark as manual disconnect to prevent automatic reconnection
        isManualDisconnectRef.current = true;

        setIsStreaming(false);
        isStreamingRef.current = false;
        setIsSpeaking(false);
        setConnectionStatus('disconnected');

        // Do not show feedback form on manual stop

        // Clear resumption handle when manually stopping
        sessionResumptionHandleRef.current = null;
        isResumingSessionRef.current = false;
        nextPlaybackTimeRef.current = 0;

        // Run the full cleanup for capture resources
        cleanupAudioResources();

        const stopAndCollect = async () => {
            const stopRecorder = (rec: MediaRecorder | null, chunksRef: React.MutableRefObject<Blob[]>) => new Promise<Blob | null>((resolve) => {
                if (!rec) return resolve(null);
                const handler = () => {
                    rec?.removeEventListener('stop', handler as any);
                    const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }) : null;
                    chunksRef.current = [];
                    resolve(blob);
                };
                rec.addEventListener('stop', handler as any);
                try {
                    if (rec.state !== 'inactive') rec.stop();
                } catch {
                    resolve(null);
                }
            });

            const [userBlob, aiBlob] = await Promise.all([
                stopRecorder(userRecorderRef.current, userChunksRef),
                stopRecorder(aiRecorderRef.current, aiChunksRef),
            ]);

            userRecorderRef.current = null;
            aiRecorderRef.current = null;

            const started = sessionStartedAtRef.current || Date.now();
            const durationMs = Date.now() - started;
            sessionStartedAtRef.current = null;

            onRecordingsReadyRef.current?.({ user: userBlob, ai: aiBlob, durationMs });

            // Also finalize streaming parts if any
            try {
                if (currentSessionIdRef.current) {
                    await fetch(`/api/learning/sessions/${currentSessionIdRef.current}/recordings/finalize`, { method: 'POST' });
                }
            } catch { }
        };
        void stopAndCollect();
    }, [cleanupAudioResources]);



    // Main function to start the streaming process
    const startStreaming = useCallback(async () => {
        if (isStreamingRef.current) return;

        // Reset manual disconnect flag when starting
        isManualDisconnectRef.current = false;

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
            sessionStartedAtRef.current = Date.now();

            const pickType = () => {
                const candidates = [
                    'audio/webm;codecs=opus',
                    'audio/webm',
                    'audio/ogg;codecs=opus',
                    'audio/ogg',
                ];
                for (const t of candidates) {
                    // @ts-ignore
                    if (typeof MediaRecorder !== 'undefined' && (MediaRecorder as any).isTypeSupported?.(t)) return t;
                }
                return 'audio/webm';
            };
            try {
                // @ts-ignore
                if (typeof MediaRecorder !== 'undefined') {
                    const mimeType = pickType();
                    userChunksRef.current = [];
                    userRecorderRef.current = new MediaRecorder(stream, { mimeType });
                    userRecorderRef.current.ondataavailable = (e: BlobEvent) => {
                        if (e.data && e.data.size > 0) {
                            // Gate saving by VAD if enabled
                            if (saveOnlySpeechRef.current) {
                                const include = vadSpeechSinceLastChunkRef.current || vadSpeechActiveRef.current;
                                vadSpeechSinceLastChunkRef.current = false;
                                if (!include) {
                                    return; // drop silent chunk
                                }
                            }
                            userChunksRef.current.push(e.data);
                            pendingUserChunkQueueRef.current.push(e.data);
                            maybeUploadSegment('user');
                        }
                    };
                    userRecorderRef.current.start(1000);
                    lastUserSegmentStartRef.current = Date.now();
                }
            } catch { }

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
                // Configuration is locked server-side via ephemeral token liveConnectConstraints
                // Session resumption
                config: {
                    responseModalities: ['AUDIO'],
                    systemInstruction: systemPrompt,
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                    },
                    // Session resumption and context window compression commented out for feedback collection
                    contextWindowCompression: {
                        slidingWindow: {}
                    },
                    sessionResumption: {
                        handle: sessionResumptionHandleRef.current || undefined
                    },
                    tools: [
                        { googleSearch: {} },
                        {
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
                            }, {
                                name: 'set_topic',
                                description: 'Sets or updates the current discussion topic. Call on new topic or topic change.',
                                parameters: {
                                    type: 'object',
                                    properties: {
                                        topic: {
                                            type: 'string',
                                            description: 'A concise 3–8 word title describing the current topic.'
                                        }
                                    },
                                    required: ['topic']
                                }
                            }]
                        }
                    ]
                },
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
                        // Ensure we don't keep a stale session reference
                        geminiLiveSessionRef.current = null;

                        // Don't show feedback form for errors - let auto-resume handle it
                        // Clear resumption handle on error
                        sessionResumptionHandleRef.current = null;
                    },
                    onclose: (e: CloseEvent) => {
                        // Session resumption - auto resume unless manual disconnect
                        console.log('close event', e)
                        console.log('sessionResumptionHandleRef.current', sessionResumptionHandleRef.current)
                        console.log('isStreamingRef.current', isStreamingRef.current)
                        // Clear stale session to prevent sends to a closed socket
                        geminiLiveSessionRef.current = null;
                        if (sessionResumptionHandleRef.current && isStreamingRef.current && !isManualDisconnectRef.current && e.code !== 1000) {
                            // Delay resumption slightly to avoid immediate reconnection
                            setConnectionStatus('connecting');
                            reconnectTimeoutRef.current = setTimeout(() => {
                                console.log('Attempting to resume session with handle:', sessionResumptionHandleRef.current);
                                isResumingSessionRef.current = true;
                                startGeminiLiveSession(streamRef.current!, 16000);
                            }, 1000);
                        }
                        else {
                            setConnectionStatus('disconnected');
                        }
                    }
                }
            };

            // Session resumption config is already set above in connectConfig

            const geminiSession = await ai.live.connect(connectConfig);

            geminiLiveSessionRef.current = geminiSession;

            // Set up audio capture and send to Gemini
            const audioContext = new AudioContext({ sampleRate });
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            // Create mic analyser for VAD visualization
            try {
                micAnalyserRef.current = audioContext.createAnalyser();
                micAnalyserRef.current.fftSize = 256;
                micAnalyserRef.current.smoothingTimeConstant = 0.8;
                source.connect(micAnalyserRef.current);
            } catch { }

            // Ensure we are not double-sending by disconnecting any previous processor
            if (processorRef.current) {
                try { processorRef.current.disconnect(); } catch { }
                processorRef.current = null;
            }

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

                    // Simple RMS-based VAD with hysteresis
                    try {
                        let sumSquares = 0;
                        for (let i = 0; i < float32Chunk.length; i++) {
                            const s = float32Chunk[i];
                            sumSquares += s * s;
                        }
                        const rms = Math.sqrt(sumSquares / Math.max(1, float32Chunk.length));

                        const ms = (float32Chunk.length / sampleRate) * 1000;
                        const startThresh = vadStartThresholdRef.current;
                        const stopThresh = vadStopThresholdRef.current;
                        if (!vadSpeechActiveRef.current) {
                            if (rms >= startThresh) {
                                vadSpeechAccumMsRef.current += ms;
                                if (vadSpeechAccumMsRef.current >= vadMinSpeechMsRef.current) {
                                    vadSpeechActiveRef.current = true;
                                    vadSpeechAccumMsRef.current = 0;
                                    vadSilenceAccumMsRef.current = 0;
                                    vadSpeechSinceLastChunkRef.current = true;
                                }
                            } else {
                                vadSpeechAccumMsRef.current = 0;
                            }
                        } else {
                            // speech active
                            if (rms < stopThresh) {
                                vadSilenceAccumMsRef.current += ms;
                                if (vadSilenceAccumMsRef.current >= vadMinSilenceMsRef.current) {
                                    vadSpeechActiveRef.current = false;
                                    vadSilenceAccumMsRef.current = 0;
                                    vadSpeechAccumMsRef.current = 0;
                                }
                            } else {
                                vadSilenceAccumMsRef.current = 0;
                            }
                            // mark that speech happened in this interval
                            vadSpeechSinceLastChunkRef.current = true;
                        }
                        try { onVadStateListenerRef.current?.(vadSpeechActiveRef.current, rms); } catch { }
                    } catch { }

                    // Convert the raw float audio data to 16-bit PCM format
                    const pcmData = new Int16Array(float32Chunk.length);
                    for (let i = 0; i < float32Chunk.length; i++) {
                        const sample = Math.max(-1, Math.min(1, float32Chunk[i]));
                        pcmData[i] = sample < 0 ? sample * 32768 : sample * 32767;
                    }

                    // Convert to base64 for Gemini
                    const uint8Array = new Uint8Array(pcmData.buffer);
                    const base64Audio = btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));

                    try {
                        geminiLiveSessionRef.current.sendRealtimeInput({
                            audio: {
                                data: base64Audio,
                                mimeType: `audio/pcm;rate=${sampleRate}`
                            }
                        });
                    } catch (err) {
                        // Socket may be closing/closed; drop this frame
                    }
                }
            };

            source.connect(workletNode);
            processorRef.current = workletNode;

            // Session resumption initial message
            const initialMessage = sessionResumptionHandleRef.current ? 'Continue' : 'Hello';
            geminiSession.sendRealtimeInput({ text: initialMessage });

        } catch (error: any) {
            console.error('Failed to start Gemini Live session:', error);
            throw error;
        }
    }, []);

    // Process Gemini Live response queue
    const processGeminiResponseQueue = useCallback((responseQueue: LiveServerMessage[], audioParts: string[]) => {
        const FRAGMENT_PARTS = 10;

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
                    console.log('Received AI audio chunk, total parts:', audioParts.length);
                }
            }

            const shouldFlush =
                audioParts.length >= FRAGMENT_PARTS ||
                (message?.serverContent?.turnComplete && audioParts.length > 0);

            if (shouldFlush) {
                console.log('Flushing AI audio chunks:', audioParts.length);
                playGeminiAudioChunks(audioParts.slice());
                audioParts.length = 0;
            }
        }
    }, []);

    // Play audio chunks from Gemini
    const playGeminiAudioChunks = useCallback(async (rawData: string[]) => {
        try {
            console.log('Playing AI audio chunks:', rawData.length, 'chunks');
            const pcmData = rawData.map(data => {
                const binaryString = atob(data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                return bytes;
            });

            const totalDataLength = pcmData.reduce((acc, buffer) => acc + buffer.length, 0);
            console.log('Total audio data length:', totalDataLength);
            const wavBuffer = convertToWav(rawData, 24000);

            let ctx = playbackCtxRef.current;
            if (!ctx || ctx.state === 'closed') {
                ctx = new AudioContext({ sampleRate: 24000 });
                playbackCtxRef.current = ctx;
                nextPlaybackTimeRef.current = ctx.currentTime;
            }

            if (!playbackDestinationRef.current) {
                try {
                    playbackDestinationRef.current = ctx.createMediaStreamDestination();
                } catch { }
            }

            const ensureAiRecorder = () => {
                // @ts-ignore
                if (typeof MediaRecorder === 'undefined') return;
                if (!playbackDestinationRef.current) return;
                if (aiRecorderRef.current) return;
                const pickType = () => {
                    const candidates = [
                        'audio/webm;codecs=opus',
                        'audio/webm',
                        'audio/ogg;codecs=opus',
                        'audio/ogg',
                    ];
                    for (const t of candidates) {
                        // @ts-ignore
                        if ((MediaRecorder as any).isTypeSupported?.(t)) return t;
                    }
                    return 'audio/webm';
                };
                aiChunksRef.current = [];
                try {
                    aiRecorderRef.current = new MediaRecorder(playbackDestinationRef.current.stream, { mimeType: pickType() });
                    aiRecorderRef.current.ondataavailable = (e: BlobEvent) => {
                        if (e.data && e.data.size > 0) {
                            aiChunksRef.current.push(e.data);
                            pendingAiChunkQueueRef.current.push(e.data);
                            maybeUploadSegment('ai');
                        }
                    };
                    aiRecorderRef.current.start(1000);
                    lastAiSegmentStartRef.current = Date.now();
                } catch { }
            };
            ensureAiRecorder();

            // Create or reuse analyser for visualization
            if (!analyserRef.current || analyserRef.current.context !== ctx || analyserRef.current.context.state === 'closed') {
                try {
                    analyserRef.current = ctx.createAnalyser();
                    analyserRef.current.fftSize = 256;
                    analyserRef.current.smoothingTimeConstant = 0.8;
                    analyserRef.current.connect(ctx.destination);
                } catch (e) {
                    console.error('Failed to create analyser:', e);
                    analyserRef.current = null;
                }
            }

            const audioBuffer = await ctx.decodeAudioData(wavBuffer.buffer as ArrayBuffer);
            console.log('Audio buffer decoded, duration:', audioBuffer.duration, 'seconds');
            const float32Data = audioBuffer.getChannelData(0);
            onAiAudioDataListenerRef.current?.(float32Data);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;

            // Connect through analyser for visualization if available
            try {
                if (analyserRef.current && analyserRef.current.context.state !== 'closed') {
                    source.connect(analyserRef.current);
                } else {
                    source.connect(ctx.destination);
                }
                if (playbackDestinationRef.current) {
                    try { source.connect(playbackDestinationRef.current); } catch { }
                }
            } catch (e) {
                console.error('Failed to connect audio source:', e);
                try {
                    source.connect(ctx.destination);
                } catch (fallbackError) {
                    console.error('Failed to connect to destination:', fallbackError);
                    throw new Error('Unable to connect audio source');
                }
            }

            const startAt = Math.max(nextPlaybackTimeRef.current, ctx.currentTime + 0.05);
            console.log('Starting audio playback at:', startAt, 'duration:', audioBuffer.duration);
            source.start(startAt);
            nextPlaybackTimeRef.current = startAt + audioBuffer.duration;

            setIsSpeaking(true);
            // Clear any existing timeout to prevent premature stopping
            if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);

            // Calculate when this chunk will finish playing
            const timeUntilEnd = (startAt + audioBuffer.duration - ctx.currentTime) * 1000;
            // A small buffer to ensure the audio has fully finished.
            const endTime = Math.max(0, timeUntilEnd) + 250;

            speakingTimeoutRef.current = setTimeout(() => {
                if (playbackCtxRef.current && nextPlaybackTimeRef.current <= playbackCtxRef.current.currentTime + 0.1) {
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

    const setOnRecordingsReady = useCallback((cb: (payload: { user: Blob | null; ai: Blob | null; durationMs: number }) => void) => {
        onRecordingsReadyRef.current = cb;
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
        // Return analyser only if it's valid and its context is not closed
        if (analyserRef.current && analyserRef.current.context.state !== 'closed') {
            return analyserRef.current;
        }
        return null;
    }, []);

    const getMicAnalyser = useCallback(() => {
        if (micAnalyserRef.current && micAnalyserRef.current.context.state !== 'closed') {
            return micAnalyserRef.current;
        }
        return null;
    }, []);

    const closeFeedbackForm = useCallback(() => {
        setShowFeedbackForm(false);
        setFeedbackTrigger(null);
    }, []);

    const submitFeedback = useCallback(async (feedback: any) => {
        try {
            // Submit feedback to your API endpoint
            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...feedback,
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to submit feedback');
            }

            console.log('Feedback submitted successfully');
        } catch (error) {
            console.error('Failed to submit feedback:', error);
            // Don't throw error to user - feedback is optional
        }
    }, []);

    const setSaveOnlySpeech = useCallback((enabled: boolean) => {
        saveOnlySpeechRef.current = enabled;
    }, []);

    const setOnVadStateListener = useCallback((cb: (active: boolean, rms: number) => void) => {
        onVadStateListenerRef.current = cb;
    }, []);

    // Effect to ensure cleanup on component unmount
    useEffect(() => {
        return () => {
            if (isStreamingRef.current) {
                stopStreaming();
            }
        };
    }, [stopStreaming]);

    return {
        isStreaming,
        audioUrl,
        error,
        isSpeaking,
        connectionStatus,
        showFeedbackForm,
        feedbackTrigger,
        startStreaming,
        stopStreaming,
        clearError,
        setToolCallListener,
        setOnAudioDataListener,
        setOnAiAudioDataListener,
        setOnRecordingsReady,
        setSessionId,
        sendText,
        sendMedia,
        sendViewport,
        getAnalyser,
        getMicAnalyser,
        closeFeedbackForm,
        submitFeedback,
        setSaveOnlySpeech,
        setOnVadStateListener
    };
}
