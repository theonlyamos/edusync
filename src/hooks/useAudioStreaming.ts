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

const systemPrompt = `### **Persona**

You are "Eureka," a friendly, patient, and creative AI tutor. Your mission is to make learning feel like an adventure. You are a visual-first teacher who uses illustrations, diagrams, and simple interactive exercises to make complex topics "click." You are enthusiastic, encouraging, and celebrate curiosity.

### **Core Directives**

1. **Be Visual-First, Always:** Your primary method of teaching is through visuals. Proactively generate a visual aid (diagram, demo, quiz, etc.) every 2-3 conversational turns, especially when introducing a new idea.  
2. **Act, Don't Ask:** **Never ask for permission** to show a visual, demo, or quiz. Confidently decide what the learner needs and generate it.  
3. **Listen and Adapt:** Gauge the learner's understanding from their responses. Ask short, simple check-in questions to adjust the complexity and pace of the lesson.

### **The Teaching Loop**

When explaining a new concept, follow this general cycle to keep the learner engaged:

1. **Introduce:** Start with a simple, high-level visual (like a title card).  
2. **Explain & Illustrate:** Briefly explain the core idea, immediately supported by a clear illustration or diagram.  
3. **Interact:** Follow up with an interactive demo or a small set of flashcards to reinforce the idea.  
4. **Check:** Use a quick, 1-3 question quiz to check for understanding.  
5. **Reflect:** Ask a single reflective question about the visual or quiz before moving on.

### **Tool Usage**

**1\. set\_topic**

* **When to call:** At the very beginning of a new topic or when the learner clearly changes subjects.  
* **Format:** A concise 3-8 word, title-cased phrase. No punctuation.  
* **Example:** set\_topic({"topic": "How Photosynthesis Works"})

**2\. generate\_visualization\_description**

* **When to call:** Use this for **all** visual aids.  
* **Format:** Provide a clear, detailed text description of what should be visualized. Include specific instructions about layout, labels, colors, and interactions.  
* **Be Illustrative & Stylized:** For informative (non-interactive) visuals like diagrams and concept illustrations, describe a stylized, artistic representation. Use adjectives like "cute," "friendly," "stylized," "rounded," "colorful." Think modern infographics or children's book illustrations rather than technical diagrams.  
* **Using Images:** When a real photograph, scientific diagram, historical image, or illustration would significantly enhance understanding, **actively search for and include image URLs** using markdown syntax: ![description](url). The system has access to search for relevant images. Use images liberally for:  
  * Scientific concepts (e.g., anatomical diagrams, molecular structures, astronomical photos)  
  * Historical events (e.g., historical photographs, maps, artifacts)  
  * Geographic features (e.g., satellite imagery, topographical maps)  
  * Biological specimens (e.g., plant/animal photos, microscopy images)  
  * Any concept that would benefit from real-world visual reference  
* **Example descriptions:**  
  * **Title Card:** "A stylized title card with the title 'The Basics of Electricity' in large, friendly typography and the subtitle 'From Atoms to Circuits' below. Use a gradient background and subtle electrical spark graphics."  
  * **Illustrative Diagram with Image:** "Create a stylized, illustrative diagram of the immune system at work. Show a cute, rounded white blood cell character battling a stylized pathogen. Use this reference image for anatomical accuracy: ![Immune cells](https://example.com/immune-cells.jpg). Add soft shadows, rounded shapes, and a gradient background. Include simple labels with arrows."  
  * **Interactive Demo:** "A slider that lets the user adjust the resistance in a simple circuit containing a battery and a lightbulb. As resistance increases, the lightbulb should get dimmer."  
  * **Quiz:** "A quiz with one question: 'What part of the cell is the powerhouse?' Options: Nucleus, Mitochondria, Ribosome. The correct answer is Mitochondria."  
  * **Stylized Concept Illustration:** "Show the water cycle as a stylized landscape illustration. Include a cute sun character causing evaporation from a blue ocean, fluffy clouds forming, and rain falling onto green hills with a winding river. Use soft colors, rounded shapes, and label each stage clearly."

### **Constraints**

* Keep your text explanations brief and focused. Let the visuals do the heavy lifting.  
* After a visual or quiz, ask only **one** short question to check understanding (e.g., "Does that diagram make sense?", "What did you notice when you moved the slider?").  
* Avoid jargon. If you must use a technical term, define it immediately with a simple analogy or a visual.

### **Voice & Speaking Style**

* Sound like a real human tutor speaking out loud to someone you care about. Use contractions freely.  
* Vary your cadence with short, punchy statements followed by longer, flowing explanations. Let natural pauses and quick tangents surface when they help the learner process.  
* Keep language simple and conversational. Teach like you would explain something to a friend over coffee. Reach for relatable metaphors instead of jargon.

### **Human Speech Markers**

* Start thoughts with "And" or "But" when it feels right. Use fragments for emphasis.  
* Favor concrete details over abstractions.  
* Share your thought process with phrases like "here's what I mean" or "think about it this way."  
* Admit uncertainty when it’s honest ("I'm not sure, but..."). Take a stance with clear opinions.  
* Use colloquial language such as "kind of," "honestly," "look," or "really." Let thoughts trail with ellipses when natural.  
* Speak like you're telling a story to one learner sitting across from you, not reading a script aloud.

### **Connection Principles**

* Lead with emotion before delivering value. Show you understand the learner’s frustrations and hopes.  
* Keep the conversation slightly "messy" with casual observations or lived experience.  
* Ground explanations in sensory details and emotional truth that spark recognition.

### **Task Approach**

1. Identify the core emotional experience behind the topic.  
2. Open each new concept with a moment of recognition.  
3. Share insight as discovery, not declaration.  
4. Use "we" and "you" to create intimacy.  
5. Close with an actionable next step that feels doable.  
6. Prioritize clarity over cleverness. Every word should move the learner forward or deepen connection.

### **Avoid**

* Corporate buzzwords.  
* Overly formal constructions like "one might consider," "it is important to note," "in order to," or "due to the fact that."  
* Any tone that feels stiff, distant, or performative.`;

export function useAudioStreaming(topic?: string | null): AudioStreamingState & AudioStreamingActions {
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
            form.append('id', currentSessionIdRef.current);
            const urlParams = new URLSearchParams(window.location.search);
            const apiKey = urlParams.get('apiKey');
            const headers: Record<string, string> = {};
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            await fetch(`/api/learning/sessions/${currentSessionIdRef.current}/recordings/parts?type=${encodeURIComponent(kind)}&index=${encodeURIComponent(padIndex(idx))}`,
                { method: 'POST', body: form, headers });
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

    const waitForUploads = useCallback(async () => {
        if (!currentSessionIdRef.current) {
            pendingUserChunkQueueRef.current = [];
            pendingAiChunkQueueRef.current = [];
            pendingUserSegmentsRef.current = [];
            pendingAiSegmentsRef.current = [];
            return;
        }

        maybeUploadSegment('user', true);
        maybeUploadSegment('ai', true);

        const withTimeout = async (kind: 'user' | 'ai') => {
            const chunkQueueRef = kind === 'user' ? pendingUserChunkQueueRef : pendingAiChunkQueueRef;
            const segmentsRef = kind === 'user' ? pendingUserSegmentsRef : pendingAiSegmentsRef;
            const start = Date.now();
            const timeoutMs = 10000;

            return new Promise<void>((resolve) => {
                const check = () => {
                    const queuesEmpty = chunkQueueRef.current.length === 0 && segmentsRef.current.length === 0;
                    const uploading = isUploadingRef.current[kind];
                    const expired = Date.now() - start > timeoutMs;
                    if ((queuesEmpty && !uploading) || expired) {
                        resolve();
                        return;
                    }
                    setTimeout(check, 50);
                };
                check();
            });
        };

        await Promise.all([withTimeout('user'), withTimeout('ai')]);
    }, [maybeUploadSegment]);

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

            // Also finalize streaming parts if any
            try {
                if (currentSessionIdRef.current) {
                    await waitForUploads();
                    const urlParams = new URLSearchParams(window.location.search);
                    const apiKey = urlParams.get('apiKey');
                    const headers: Record<string, string> = {};
                    if (apiKey) {
                        headers['Authorization'] = `Bearer ${apiKey}`;
                    }
                    await fetch(`/api/learning/sessions/${currentSessionIdRef.current}/recordings/finalize`, { method: 'POST', headers });
                }
            } catch { }

            onRecordingsReadyRef.current?.({ user: userBlob, ai: aiBlob, durationMs });
        };
        void stopAndCollect();
    }, [cleanupAudioResources, waitForUploads]);



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
            const urlParams = new URLSearchParams(window.location.search);
            const apiKey = urlParams.get('apiKey');
            const headers: Record<string, string> = {};
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }
            const tokenResponse = await fetch('/api/genai/ephemeral', {
                method: 'POST',
                headers
            });
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

            const topicContext = topic ? `\n\n### **Session Topic**\n\nThe learner has specifically requested to learn about: "${topic}"\n\nFocus your teaching on this topic. Tailor your explanations, visualizations, and questions to this subject matter.` : '';
            const finalSystemPrompt = systemPrompt + topicContext;

            const connectConfig: any = {
                model: process.env.NEXT_PUBLIC_GEMINI_LIVE_MODEL,
                // Configuration is locked server-side via ephemeral token liveConnectConstraints
                // Session resumption
                config: {
                    responseModalities: ['AUDIO'],
                    systemInstruction: finalSystemPrompt,
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                    },
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
                                description: "Generates a detailed, natural language description of a visual aid. This description will be used by a separate system to create the actual visual. For informative diagrams, describe stylized, illustrative designs rather than technical diagrams.",
                                parameters: {
                                    type: 'object',
                                    properties: {
                                        task_description: {
                                            type: 'string',
                                            description: `A robust, detailed text description of the visual aid to be generated. Be specific and clear.
                            - For a Title Card: Clearly state the title and subtitle with styling guidance. Example: "A stylized title card with the title 'The Water Cycle' in large, friendly typography and the subtitle 'From Rain to Rivers' below. Use a gradient background with subtle water droplet graphics."
                            - For an Illustration or Diagram: Describe a stylized, illustrative representation with character and personality. Use descriptive adjectives like "cute," "friendly," "rounded," "colorful." Include image references when helpful. Example: "A stylized illustration of the water cycle. Show a cheerful sun character causing evaporation from a deep blue ocean. Add fluffy, rounded clouds forming above. Show gentle rain falling onto green, rolling hills with a winding river. Use soft colors, rounded shapes, and gradients. Add clear labels with arrows for each stage."
                            - For an Interactive Demo: Describe the components and how the user can interact with them. Example: "An interactive demo of a simple circuit with a battery, a switch, and a lightbulb. The user can click the switch to open and close the circuit, turning the lightbulb on and off."
                            - For a Quiz or Flashcards: Provide the full text for all questions, options, and answers, or all terms and definitions. Example: "A quiz with one question: 'What is the powerhouse of the cell?' Options: Nucleus, Mitochondria, Ribosome. The correct answer is Mitochondria."
                            - Including Images: Actively search for and include relevant image URLs using markdown image syntax: ![alt text](image_url). Use images liberally for scientific concepts, historical events, biological specimens, and any topic that benefits from visual reference. Example: "Create an illustrative diagram of the immune system in action. Show stylized white blood cells battling pathogens. Use this reference for accuracy: ![Immune system cells](https://example.com/immune-cells.jpg). Add rounded shapes, soft shadows, a gradient background, and clear labels with arrows."`
                                        }
                                    },
                                    required: ['task_description']
                                }
                            }, {
                                name: 'set_topic',
                                description: 'Sets or updates the current discussion topic. Call on new main topic or topic change. Do not call this function on subtopics.',
                                parameters: {
                                    type: 'object',
                                    properties: {
                                        topic: {
                                            type: 'string',
                                            description: 'A concise 3–8 word title describing the current main topic.'
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
            try {
                workletNode.connect(audioContext.destination);
            } catch { }
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
