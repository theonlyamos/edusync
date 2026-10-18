import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, FunctionResponseScheduling } from '@google/genai';
import type { StudyIntent, StudyMode } from '@/lib/study-companion';
import { extractServerTranscriptions, mergeStreamingTranscript } from '@/lib/audio/transcription';
import { PcmPlaybackQueue } from '@/lib/audio/pcm-playback-queue';
import { emitLiveInputDiagnostic } from '@/lib/audio/live-input-diagnostics';
import { VoiceTokenRequestError } from '@/lib/audio/ephemeral-token-error';
import { buildLiveTokenRequest, isRetryableRenewalError, LIVE_TOKEN_RENEW_RETRY_MS, liveTokenRenewDelay, type LiveTokenResponse } from '@/lib/live-tutor/live-token-request';
import { createQuizFeedbackDelivery, createTutorTurnTracker, matchesQuizFeedbackScope, QUIZ_FEEDBACK_EVENT } from '@/lib/lesson-artifacts/quiz-feedback-delivery';
import { createVisualStatusDelivery, isVisualToolName, VISUAL_PENDING_TOOL_RESPONSE, type VisualStatusReport } from '@/lib/visual-status';

export type UseAudioStreamingLiveOptions = {
    variant?: 'tutor' | 'studyCompanion';
    gradeLevel?: string | null;
    studyMode?: StudyMode;
    studyIntent?: StudyIntent;
};

/**
 * Tool call handler. For visual tools, return a promise that resolves once the
 * visual has rendered or failed; the result is passed back to the tutor as a
 * VISUAL_STATUS message. Returning nothing keeps the old fire-and-forget behaviour.
 */
export type ToolCallListener = (name: string, args: any, callId?: string) => void | Promise<VisualStatusReport | void>;

export type VoiceCreditsUpdate = {
    /** Balance after the server charged (or reused) the current voice block. */
    remainingCredits: number;
    /** Minutes charged by this token request; 0 when an already paid block was reused. */
    minutesCharged: number;
};

export type LiveTranscriptionPayload = {
    role: 'user' | 'assistant';
    text: string;
    finished: boolean;
};

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
    setToolCallListener: (cb: ToolCallListener) => void;
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
    setOnTranscription?: (cb: ((payload: LiveTranscriptionPayload) => void) | null) => void;
    setOnCreditsUpdate: (cb: ((update: VoiceCreditsUpdate) => void) | null) => void;
}

export interface LessonContext {
    lessonId?: string;
    title?: string;
    subject?: string;
    gradeLevel?: string;
    objectives?: string | string[];
    content?: string;
    learningRunId?: string;
    activeObjective?: { id: string; text: string; position: number; revision: number };
}

export function useAudioStreaming(
    topic?: string | null,
    lessonContext?: LessonContext,
    liveOptions?: UseAudioStreamingLiveOptions,
): AudioStreamingState & AudioStreamingActions {
    const [isStreaming, setIsStreaming] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [showFeedbackForm, setShowFeedbackForm] = useState(false);
    const [feedbackTrigger, setFeedbackTrigger] = useState<'manual_stop' | 'connection_reset' | 'error' | null>(null);

    // Refs to hold mutable values that don't trigger re-renders
    const isStreamingRef = useRef(false);
    const sessionGenerationRef = useRef(0);
    const connectionGenerationRef = useRef(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<AudioWorkletNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const playbackCtxRef = useRef<AudioContext | null>(null);
    const playbackQueueRef = useRef<PcmPlaybackQueue | null>(null);
    const tutorTurnsRef = useRef(createTutorTurnTracker());
    const analyserRef = useRef<AnalyserNode | null>(null);
    const micAnalyserRef = useRef<AnalyserNode | null>(null);
    const toolCallListenerRef = useRef<ToolCallListener | null>(null);
    const visualStatusDeliveryRef = useRef<ReturnType<typeof createVisualStatusDelivery> | null>(null);
    const onAudioDataListenerRef = useRef<((data: Float32Array<ArrayBufferLike>) => void) | null>(null);
    const onAiAudioDataListenerRef = useRef<((data: Float32Array) => void) | null>(null);
    const onRecordingsReadyRef = useRef<((payload: { user: Blob | null; ai: Blob | null; durationMs: number }) => void) | null>(null);
    const onVadStateListenerRef = useRef<((active: boolean, rms: number) => void) | null>(null);
    const geminiLiveSessionRef = useRef<any>(null);
    const liveOptionsRef = useRef<UseAudioStreamingLiveOptions | undefined>(liveOptions);
    const lessonContextRef = useRef<LessonContext | undefined>(lessonContext);
    const topicRef = useRef(topic);
    // Sync latest props into refs from an effect (not during render) so the async Gemini
    // callbacks read current values without the compiler's no-ref-write-during-render error.
    useEffect(() => {
        liveOptionsRef.current = liveOptions;
        lessonContextRef.current = lessonContext;
        topicRef.current = topic;
    }, [liveOptions, lessonContext, topic]);
    const onTranscriptionListenerRef = useRef<((payload: LiveTranscriptionPayload) => void) | null>(null);
    // Indirection refs: these callbacks are declared further down but referenced by
    // earlier-declared callbacks. Calling through a ref avoids the temporal-dead-zone
    // forward reference the bundler rejects, and keeps the existing xRef.current?.(...) idiom.
    const startGeminiLiveSessionRef = useRef<((stream: MediaStream, sampleRate: number, forceRenewal?: boolean) => Promise<void>) | null>(null);
    const processGeminiResponseQueueRef = useRef<((responseQueue: LiveServerMessage[], acceptsEvents: () => boolean) => void) | null>(null);
    const playGeminiAudioChunksRef = useRef<((rawData: string[]) => void) | null>(null);
    /** Study Companion: buffer live transcripts; flush on turnComplete / finished / fallback (see processGeminiResponseQueue). */
    const liveUserTranscriptRef = useRef('');
    const liveAssistantTranscriptRef = useRef('');
    // Session resumption
    const sessionResumptionHandleRef = useRef<string | null>(null);
    const isResumingSessionRef = useRef<boolean>(false);
    const isManualDisconnectRef = useRef<boolean>(false);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Server-side voice billing: the prepaid grant behind the current token, and
    // the timer that asks for the next token shortly before this one expires.
    const voiceGrantIdRef = useRef<string | null>(null);
    const liveTokenRef = useRef<LiveTokenResponse | null>(null);
    const tokenRenewFailureRef = useRef<unknown>(null);
    const tokenRenewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const tokenExpireTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pendingLiveConnectionRef = useRef<{ generation: number; promise: Promise<void> } | null>(null);
    const stagedLiveResourcesRef = useRef<{ close: () => void } | null>(null);
    const onCreditsUpdateRef = useRef<((update: VoiceCreditsUpdate) => void) | null>(null);
    // Auto-resume loop guards: cap rapid reconnects so a socket that keeps
    // closing right after connecting (e.g. after a tool turn) can't thrash forever.
    const sessionOpenedAtRef = useRef<number | null>(null);
    const resumeAttemptsRef = useRef<number>(0);
    const MAX_RESUME_ATTEMPTS = 3;
    const RESUME_STABLE_MS = 15000; // a session open this long is "healthy" → reset the counter
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

    const sendLiveText = useCallback((text: string, source: 'user' | 'quiz' | 'initial' = 'user') => {
        if (!geminiLiveSessionRef.current) throw new Error('Not connected');
        geminiLiveSessionRef.current.sendRealtimeInput({ text });
        emitLiveInputDiagnostic({ event: 'sent', connectionGeneration: connectionGenerationRef.current, kind: 'text', source });
        tutorTurnsRef.current.sent();
    }, []);

    const feedbackRunId = lessonContext?.learningRunId;
    const feedbackObjectiveId = lessonContext?.activeObjective?.id;
    const feedbackRevision = lessonContext?.activeObjective?.revision;
    useEffect(() => {
        if (connectionStatus !== 'connected' || !feedbackRunId || !feedbackObjectiveId || !feedbackRevision) return;
        const scope = { runId: feedbackRunId, objectiveId: feedbackObjectiveId, objectiveRevision: feedbackRevision };
        const controller = new AbortController();
        let retryTimer: ReturnType<typeof setTimeout> | undefined;
        const delivery = createQuizFeedbackDelivery(scope, {
            load: async () => {
                const response = await fetch(`/api/learning-runs/${scope.runId}/quiz-feedback`, { cache: 'no-store', signal: controller.signal });
                if (!response.ok) throw new Error('Could not load saved quiz feedback');
                return response.json();
            },
            isIdle: () => {
                const current = lessonContextRef.current;
                return current?.learningRunId === scope.runId && current.activeObjective?.id === scope.objectiveId
                    && current.activeObjective.revision === scope.objectiveRevision && !!geminiLiveSessionRef.current
                    && !vadSpeechActiveRef.current && (!playbackQueueRef.current || playbackQueueRef.current.isIdle())
                    && tutorTurnsRef.current.isIdle();
            },
            send: (context) => {
                sendLiveText(context, 'quiz');
            },
        });
        const refresh = (attempt = 0) => {
            clearTimeout(retryTimer);
            void delivery.refresh().catch(() => {
                if (controller.signal.aborted) return;
                if (attempt < 2) retryTimer = setTimeout(() => refresh(attempt + 1), 2_000 * (attempt + 1));
                else setError('Your quiz is saved, but voice feedback could not be updated. Reconnect voice to retry.');
            });
        };
        const onQuiz = (event: Event) => {
            if (matchesQuizFeedbackScope((event as CustomEvent<unknown>).detail, scope)) refresh();
        };
        const onOnline = () => refresh();
        refresh();
        // Local idle checks only; no database polling. Failed socket sends remain queued.
        const timer = setInterval(() => { try { delivery.flush(); } catch { /* Reconnection will restore saved evidence. */ } }, 250);
        window.addEventListener(QUIZ_FEEDBACK_EVENT, onQuiz);
        window.addEventListener('online', onOnline);
        return () => {
            delivery.dispose(); controller.abort(); clearTimeout(retryTimer); clearInterval(timer);
            window.removeEventListener(QUIZ_FEEDBACK_EVENT, onQuiz);
            window.removeEventListener('online', onOnline);
        };
    }, [connectionStatus, feedbackRunId, feedbackObjectiveId, feedbackRevision, sendLiveText]);

    // Tell the tutor whether each visual actually reached the screen, once nobody is speaking.
    useEffect(() => {
        if (connectionStatus !== 'connected') return;
        const delivery = createVisualStatusDelivery({
            isIdle: () => {
                return !!geminiLiveSessionRef.current
                    && !vadSpeechActiveRef.current && (!playbackQueueRef.current || playbackQueueRef.current.isIdle())
                    && tutorTurnsRef.current.isIdle();
            },
            send: (text) => {
                sendLiveText(text);
            },
        });
        visualStatusDeliveryRef.current = delivery;
        const timer = setInterval(() => {
            try { delivery.flush(); } catch { /* Not connected right now; the message stays queued. */ }
        }, 250);
        return () => {
            clearInterval(timer);
            delivery.dispose();
            if (visualStatusDeliveryRef.current === delivery) visualStatusDeliveryRef.current = null;
        };
    }, [connectionStatus, sendLiveText]);

    // Audio batching to reduce main thread processing frequency
    const audioBatchRef = useRef<Float32Array[]>([]);
    const AUDIO_BATCH_SIZE = 2; // Accumulate 2 frames before sending (reduces processing by 50%)

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
        } catch (err) { console.error('Failed to upload recording segment', err); }
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
        stagedLiveResourcesRef.current?.close();
        stagedLiveResourcesRef.current = null;
        tutorTurnsRef.current.reset();
        const queue = playbackQueueRef.current;
        playbackQueueRef.current = null;
        queue?.stop();
        playbackDestinationRef.current = null;
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
            try { micAnalyserRef.current.disconnect(); } catch (e) { /* best-effort cleanup; failure is non-fatal */ }
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
        if (tokenRenewTimeoutRef.current) {
            clearTimeout(tokenRenewTimeoutRef.current);
            tokenRenewTimeoutRef.current = null;
        }
        if (tokenExpireTimeoutRef.current) {
            clearTimeout(tokenExpireTimeoutRef.current);
            tokenExpireTimeoutRef.current = null;
        }

        liveUserTranscriptRef.current = '';
        liveAssistantTranscriptRef.current = '';
    }, []);

    // Function to handle stopping the stream
    const stopStreaming = useCallback(() => {
        const stoppedGeneration = ++sessionGenerationRef.current;
        const userRecorder = userRecorderRef.current;
        const aiRecorder = aiRecorderRef.current;
        const userChunks = userChunksRef.current;
        const aiChunks = aiChunksRef.current;
        const stoppedSessionId = currentSessionIdRef.current;
        const durationMs = Date.now() - (sessionStartedAtRef.current || Date.now());
        sessionStartedAtRef.current = null;
        // Mark as manual disconnect to prevent automatic reconnection
        isManualDisconnectRef.current = true;

        setIsStreaming(false);
        isStreamingRef.current = false;
        setIsSpeaking(false);
        setConnectionStatus('disconnected');

        // Do not show feedback form on manual stop

        const tokenExpiresAt = Date.parse(liveTokenRef.current?.expireTime ?? '');
        if (!Number.isFinite(tokenExpiresAt) || tokenExpiresAt <= Date.now()) {
            sessionResumptionHandleRef.current = null;
            liveTokenRef.current = null;
            tokenRenewFailureRef.current = null;
        }
        isResumingSessionRef.current = false;

        // Run the full cleanup for capture resources
        cleanupAudioResources();

        const stopAndCollect = async () => {
            const stopRecorder = (rec: MediaRecorder | null, chunks: Blob[]) => new Promise<Blob | null>((resolve) => {
                if (!rec) return resolve(null);
                const handler = () => {
                    rec?.removeEventListener('stop', handler as any);
                    const blob = chunks.length > 0 ? new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) : null;
                    chunks.length = 0;
                    resolve(blob);
                };
                rec.addEventListener('stop', handler as any);
                try {
                    if (rec.state !== 'inactive') rec.stop();
                    else handler();
                } catch {
                    resolve(null);
                }
            });

            const [userBlob, aiBlob] = await Promise.all([
                stopRecorder(userRecorder, userChunks),
                stopRecorder(aiRecorder, aiChunks),
            ]);

            if (userRecorderRef.current === userRecorder) userRecorderRef.current = null;
            if (aiRecorderRef.current === aiRecorder) aiRecorderRef.current = null;

            // Also finalize streaming parts if any
            try {
                if (stoppedSessionId && stoppedGeneration === sessionGenerationRef.current) {
                    await waitForUploads();
                    const urlParams = new URLSearchParams(window.location.search);
                    const apiKey = urlParams.get('apiKey');
                    const headers: Record<string, string> = {};
                    if (apiKey) {
                        headers['Authorization'] = `Bearer ${apiKey}`;
                    }
                    if (stoppedGeneration === sessionGenerationRef.current) {
                        await fetch(`/api/learning/sessions/${stoppedSessionId}/recordings/finalize`, { method: 'POST', headers });
                    }
                }
            } catch (err) { console.error('Failed to finalize session recordings', err); }

            onRecordingsReadyRef.current?.({ user: userBlob, ai: aiBlob, durationMs });
        };
        void stopAndCollect();
    }, [cleanupAudioResources, waitForUploads]);



    const handleStreamingFailure = useCallback((err: unknown, action: 'start' | 'resume', generation: number) => {
        if (generation !== sessionGenerationRef.current) return;
        stopStreaming();
        setError(`Failed to ${action} streaming: ${err instanceof Error ? err.message : 'Voice connection failed'}`);
    }, [stopStreaming]);

    // Main function to start the streaming process
    const startStreaming = useCallback(async () => {
        if (isStreamingRef.current) return;
        const generation = ++sessionGenerationRef.current;
        userRecorderRef.current = null;
        aiRecorderRef.current = null;

        // Reset manual disconnect flag when starting
        isManualDisconnectRef.current = false;
        // Fresh manual start → reset the auto-resume loop guard.
        resumeAttemptsRef.current = 0;

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
            if (generation !== sessionGenerationRef.current) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            streamRef.current = stream;
            sessionStartedAtRef.current = Date.now();

            // Gemini native-audio models currently require 16 kHz PCM input.
            const desiredSampleRate = 16000;
            const tempContext = new AudioContext({ sampleRate: desiredSampleRate });
            const sampleRate = desiredSampleRate;
            tempContext.close();

            // --- Step 2 & 3: Use browser-based Gemini Live connection ---
            await startGeminiLiveSessionRef.current?.(stream, sampleRate);

        } catch (err: any) {
            if (generation !== sessionGenerationRef.current) return;
            console.error('Failed to start streaming:', err);
            handleStreamingFailure(err, 'start', generation);
            throw err;
        }
    }, [handleStreamingFailure]);

    // Browser-based Gemini Live connection
    const connectGeminiLiveSession = useCallback(async (stream: MediaStream, sampleRate: number, forceRenewal = false) => {
        const generation = sessionGenerationRef.current;
        let connectionGeneration: number | null = null;
        let connectionClosed = false;
        let connectionOpened = false;
        let setupError: Error | null = null;
        let stagedSession: any = null;
        let stagedContext: AudioContext | null = null;
        let stagedProcessor: AudioWorkletNode | null = null;
        let promoted = false;
        const ownsRequest = () => generation === sessionGenerationRef.current;
        const ownsConnection = () => ownsRequest() && connectionGeneration !== null && connectionGeneration === connectionGenerationRef.current;
        const acceptsEvents = () => ownsConnection() && !connectionClosed;
        const stagedResources = { close: () => {
            connectionClosed = true;
            try { stagedProcessor?.disconnect(); } catch (error) { console.warn('Failed to disconnect staged audio processor', error); }
            if (stagedContext && stagedContext.state !== 'closed') {
                void stagedContext.close().catch(error => console.warn('Failed to close staged audio context', error));
            }
            try { stagedSession?.close(); } catch (error) { console.warn('Failed to close staged live session', error); }
        } };
        stagedLiveResourcesRef.current = stagedResources;
        try {
            // Get an ephemeral token. The server builds the Live config (model,
            // system prompt, tools) and locks it into the token, and charges
            // voice time up front for billed users.
            const urlParams = new URLSearchParams(window.location.search);
            const apiKey = urlParams.get('apiKey');
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }
            const variant = liveOptionsRef.current?.variant ?? 'tutor';
            const isStudyCompanion = variant === 'studyCompanion';
            const lessonCtx = lessonContextRef.current;
            const cachedToken = liveTokenRef.current;
            const cachedExpiresAt = Date.parse(cachedToken?.expireTime ?? '');
            const reuseToken = !forceRenewal && cachedToken && cachedExpiresAt > Date.now()
                && (cachedToken.billing || sessionResumptionHandleRef.current);
            let liveToken: LiveTokenResponse;
            if (reuseToken) {
                if (!sessionResumptionHandleRef.current) {
                    throw new Error('The paid voice session cannot be resumed without its resumption handle. Please try again after this block ends.');
                }
                liveToken = cachedToken;
            } else {
                if (cachedToken && cachedExpiresAt <= Date.now()) {
                    liveTokenRef.current = null;
                    sessionResumptionHandleRef.current = null;
                    tokenRenewFailureRef.current = null;
                }
                const tokenResponse = await fetch('/api/genai/ephemeral', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(buildLiveTokenRequest({
                        grantId: voiceGrantIdRef.current,
                        sessionId: currentSessionIdRef.current,
                        resumptionHandle: sessionResumptionHandleRef.current,
                        variant,
                        topic: topicRef.current,
                        gradeLevel: liveOptionsRef.current?.gradeLevel,
                        studyMode: liveOptionsRef.current?.studyMode,
                        studyIntent: liveOptionsRef.current?.studyIntent,
                        lesson: lessonCtx,
                    })),
                });
                if (!ownsRequest()) return;
                if (!tokenResponse.ok) {
                    if (tokenResponse.status === 403) voiceGrantIdRef.current = null;
                    throw new VoiceTokenRequestError(tokenResponse.status);
                }
                liveToken = await tokenResponse.json() as LiveTokenResponse;
                if (!ownsRequest()) return;
                liveTokenRef.current = liveToken;
                tokenRenewFailureRef.current = null;
                if (liveToken.billing) {
                    voiceGrantIdRef.current = liveToken.billing.grantId;
                    onCreditsUpdateRef.current?.({
                        remainingCredits: liveToken.billing.remainingCredits,
                        minutesCharged: liveToken.billing.minutesCharged,
                    });
                }
            }
            const { token, model, config: lockedConfig, expireTime } = liveToken;
            const expiresAt = Date.parse(expireTime);
            const expireConnection = () => {
                tokenExpireTimeoutRef.current = null;
                handleStreamingFailure(tokenRenewFailureRef.current ?? new Error('The paid voice block has ended. Please reconnect to continue.'), 'resume', generation);
            };
            if (!tokenExpireTimeoutRef.current && Number.isFinite(expiresAt)) {
                tokenExpireTimeoutRef.current = setTimeout(expireConnection, Math.max(0, expiresAt - Date.now()));
            }

            const ai = new GoogleGenAI({
                apiKey: token,
                httpOptions: { apiVersion: 'v1alpha' }
            });

            const responseQueue: LiveServerMessage[] = [];

            const connectConfig: any = {
                model,
                config: reuseToken ? { ...lockedConfig, sessionResumption: { handle: sessionResumptionHandleRef.current } } : lockedConfig,
                callbacks: {
                    onopen: () => {
                        if (!ownsRequest() || connectionClosed) return;
                        connectionOpened = true;
                        if (!acceptsEvents()) return;
                        tutorTurnsRef.current.reset();
                        setConnectionStatus('connected');
                        isResumingSessionRef.current = false;
                        sessionOpenedAtRef.current = Date.now();
                    },
                    onmessage: (message: LiveServerMessage) => {
                        if (!ownsRequest() || connectionClosed) return;
                        if (connectionGeneration === null) {
                            responseQueue.push(message);
                            return;
                        }
                        if (!acceptsEvents()) return;
                        tutorTurnsRef.current.received(message);
                        responseQueue.push(message);
                        processGeminiResponseQueueRef.current?.(responseQueue, acceptsEvents);
                    },
                    onerror: (e: ErrorEvent) => {
                        if (!ownsRequest() || connectionClosed) return;
                        if (connectionGeneration === null) {
                            connectionClosed = true;
                            setupError = new Error(`Gemini error: ${e.message}`);
                            if (!geminiLiveSessionRef.current) handleStreamingFailure(setupError, 'resume', generation);
                            return;
                        }
                        if (!acceptsEvents() || isManualDisconnectRef.current) return;
                        console.error('Gemini Live session error:', e.message);
                        setError(`Gemini error: ${e.message}`);
                        setConnectionStatus('disconnected');
                        // Ensure we don't keep a stale session reference
                        geminiLiveSessionRef.current = null;

                        // Don't show feedback form for errors - let auto-resume handle it
                        if (!liveTokenRef.current?.billing) sessionResumptionHandleRef.current = null;
                    },
                    onclose: (e: CloseEvent) => {
                        if (!ownsRequest() || connectionClosed) return;
                        if (connectionGeneration === null) {
                            connectionClosed = true;
                            setupError = new Error('Live voice connection ended. Please try again.');
                            if (!geminiLiveSessionRef.current) {
                                stopStreaming();
                                setError(setupError.message);
                            }
                            return;
                        }
                        if (!acceptsEvents()) return;
                        connectionClosed = true;
                        // Surface the real close reason for diagnostics.
                        console.warn('[Gemini Live] socket closed', { code: e.code, reason: e.reason });

                        // Clear stale session to prevent sends to a closed socket
                        geminiLiveSessionRef.current = null;

                        const openedAt = sessionOpenedAtRef.current;
                        sessionOpenedAtRef.current = null;
                        // A session that stayed open a healthy while = a genuine mid-session
                        // drop; reset the rapid-reconnect counter so resumption can work.
                        if (openedAt && Date.now() - openedAt >= RESUME_STABLE_MS) {
                            resumeAttemptsRef.current = 0;
                        }
                        if (pendingLiveConnectionRef.current?.generation === generation && stagedLiveResourcesRef.current) {
                            setConnectionStatus('connecting');
                            return;
                        }

                        // Enter the resume path only when there's a handle (original
                        // behavior), or when we're already mid-recovery (so the bounded
                        // retry sequence continues even after we drop a stale handle).
                        const hasHandleOrRetrying =
                            !!sessionResumptionHandleRef.current || resumeAttemptsRef.current > 0;
                        const shouldTryResume =
                            isStreamingRef.current &&
                            !isManualDisconnectRef.current &&
                            e.code !== 1000 &&
                            hasHandleOrRetrying;

                        if (!shouldTryResume) {
                            stopStreaming();
                            setError('Live voice connection ended. Please try again.');
                            return;
                        }

                        // Give up after too many rapid reconnects to avoid an endless
                        // connect→close→resume loop (the previous behavior).
                        if (resumeAttemptsRef.current >= MAX_RESUME_ATTEMPTS) {
                            console.warn(
                                `[Gemini Live] giving up after ${resumeAttemptsRef.current} rapid reconnect attempts`,
                            );
                            sessionResumptionHandleRef.current = null;
                            resumeAttemptsRef.current = 0;
                            setError('Live session ended: the connection kept dropping. Please try again.');
                            stopStreaming();
                            return;
                        }

                        resumeAttemptsRef.current += 1;
                        // After the first rapid failure, drop a possibly-stale resumption
                        // handle so the next attempt is a clean fresh connect.
                        if (resumeAttemptsRef.current >= 2 && !liveTokenRef.current?.billing) {
                            sessionResumptionHandleRef.current = null;
                        }

                        // Exponential backoff: 1s, 2s, 4s … capped at 8s.
                        const delay = Math.min(1000 * 2 ** (resumeAttemptsRef.current - 1), 8000);
                        setConnectionStatus('connecting');
                        reconnectTimeoutRef.current = setTimeout(() => {
                            if (!ownsConnection() || !isStreamingRef.current || isManualDisconnectRef.current) return;
                            isResumingSessionRef.current = true;
                            void startGeminiLiveSessionRef.current?.(streamRef.current!, 16000).catch((err: unknown) => {
                                handleStreamingFailure(err, 'resume', generation);
                            });
                        }, delay);
                    }
                }
            };

            const geminiSession = await ai.live.connect(connectConfig);
            stagedSession = geminiSession;
            if (!ownsRequest()) return;
            if (setupError) throw setupError;
            const audioContext = new AudioContext({ sampleRate });
            stagedContext = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            let micAnalyser: AnalyserNode | null = null;
            try {
                micAnalyser = audioContext.createAnalyser();
                micAnalyser.fftSize = 256;
                micAnalyser.smoothingTimeConstant = 0.8;
                source.connect(micAnalyser);
            } catch { /* best-effort cleanup; failure is non-fatal */ }

            try {
                await audioContext.audioWorklet.addModule('/audio-processor.js');
            } catch (e) {
                console.error('Failed to add audio worklet module.', e);
                throw new Error('Failed to load audio processor.');
            }
            if (!ownsRequest()) return;
            if (setupError) throw setupError;

            const workletNode = new AudioWorkletNode(audioContext, 'audio-stream-processor');
            stagedProcessor = workletNode;

            workletNode.port.onmessage = (event) => {
                if (!acceptsEvents() || !isStreamingRef.current || !geminiLiveSessionRef.current) return;

                if (event.data.type === 'audioData') {
                    const float32Chunk = new Float32Array(event.data.data);
                    onAudioDataListenerRef.current?.(float32Chunk);

                    // Simple RMS-based VAD with hysteresis (still process every frame for responsiveness)
                    try {
                        let sumSquares = 0;
                        for (let i = 0; i < float32Chunk.length; i++) {
                            const s = float32Chunk[i];
                            sumSquares += s * s;
                        }
                        const rms = Math.sqrt(sumSquares / Math.max(1, float32Chunk.length));
                        if (rms >= vadStartThresholdRef.current) tutorTurnsRef.current.activity();

                        const ms = (float32Chunk.length / sampleRate) * 1000;
                        const startThresh = vadStartThresholdRef.current;
                        const stopThresh = vadStopThresholdRef.current;
                        if (!vadSpeechActiveRef.current) {
                            if (rms >= startThresh) {
                                vadSpeechAccumMsRef.current += ms;
                                if (vadSpeechAccumMsRef.current >= vadMinSpeechMsRef.current) {
                                    vadSpeechActiveRef.current = true;
                                    tutorTurnsRef.current.sent();
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
                        try { onVadStateListenerRef.current?.(vadSpeechActiveRef.current, rms); } catch { /* best-effort cleanup; failure is non-fatal */ }
                    } catch { /* best-effort cleanup; failure is non-fatal */ }

                    // Batch audio frames to reduce main thread processing frequency
                    audioBatchRef.current.push(float32Chunk);

                    // Only process when we have enough frames (reduces processing by 50%)
                    if (audioBatchRef.current.length < AUDIO_BATCH_SIZE) {
                        return; // Wait for more frames
                    }

                    // Combine batched frames
                    const totalLength = audioBatchRef.current.reduce((sum, arr) => sum + arr.length, 0);
                    const combinedFloat32 = new Float32Array(totalLength);
                    let offset = 0;
                    for (const chunk of audioBatchRef.current) {
                        combinedFloat32.set(chunk, offset);
                        offset += chunk.length;
                    }
                    audioBatchRef.current = []; // Clear batch

                    // Convert the combined audio data to 16-bit PCM format
                    const pcmData = new Int16Array(combinedFloat32.length);
                    for (let i = 0; i < combinedFloat32.length; i++) {
                        const sample = Math.max(-1, Math.min(1, combinedFloat32[i]));
                        pcmData[i] = sample < 0 ? sample * 32768 : sample * 32767;
                    }

                    // Convert to base64 for Gemini using chunked approach to avoid stack limits
                    const uint8Array = new Uint8Array(pcmData.buffer);
                    let binaryString = '';
                    const chunkSize = 8192; // Process in 8KB chunks to avoid call stack overflow
                    for (let i = 0; i < uint8Array.length; i += chunkSize) {
                        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
                        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
                    }
                    const base64Audio = btoa(binaryString);

                    try {
                        geminiLiveSessionRef.current.sendRealtimeInput({
                            audio: {
                                data: base64Audio,
                                mimeType: `audio/pcm;rate=${sampleRate}`
                            }
                        });
                        emitLiveInputDiagnostic({ event: 'sent', connectionGeneration: connectionGenerationRef.current, kind: 'audio', source: 'microphone', audioBytes: uint8Array.byteLength });
                    } catch (err) {
                        // Socket may be closing/closed; drop this frame
                    }
                }
            };

            source.connect(workletNode);
            try {
                workletNode.connect(audioContext.destination);
            } catch { /* best-effort cleanup; failure is non-fatal */ }
            const initialMessage = sessionResumptionHandleRef.current
                ? 'Continue'
                : isStudyCompanion
                    ? 'The student connected for live voice study companion help. Greet them briefly and ask what they want to work on.'
                    : 'Hello';
            geminiSession.sendRealtimeInput({ text: initialMessage });
            if (!ownsRequest()) return;
            if (setupError) throw setupError;
            const previousCaptureContext = audioContextRef.current;
            const previousProcessor = processorRef.current;
            const previousMicAnalyser = micAnalyserRef.current;
            connectionGeneration = ++connectionGenerationRef.current;
            promoted = true;
            if (stagedLiveResourcesRef.current === stagedResources) stagedLiveResourcesRef.current = null;
            geminiLiveSessionRef.current = geminiSession;
            audioContextRef.current = audioContext;
            micAnalyserRef.current = micAnalyser;
            processorRef.current = workletNode;
            try { previousProcessor?.disconnect(); } catch (error) { console.warn('Failed to disconnect previous audio processor', error); }
            try { previousMicAnalyser?.disconnect(); } catch (error) { console.warn('Failed to disconnect previous microphone analyser', error); }
            if (previousCaptureContext && previousCaptureContext.state !== 'closed') {
                void previousCaptureContext.close().catch(error => console.warn('Failed to close previous audio context', error));
            }
            if (connectionOpened) connectConfig.callbacks.onopen();
            const queuedMessages = responseQueue.splice(0);
            for (const message of queuedMessages) connectConfig.callbacks.onmessage(message);
            if (!acceptsEvents()) return;
            emitLiveInputDiagnostic({ event: 'sent', connectionGeneration, kind: 'text', source: 'initial' });
            tutorTurnsRef.current.sent();
            if (tokenExpireTimeoutRef.current) clearTimeout(tokenExpireTimeoutRef.current);
            tokenExpireTimeoutRef.current = Number.isFinite(expiresAt) ? setTimeout(expireConnection, Math.max(0, expiresAt - Date.now())) : null;
            // Renew shortly before the paid block ends. A renewal that fails for a
            // passing reason is retried while this block still has time left; one
            // the server refuses (no credits, access denied) lets the session run
            // until the block ends.
            const scheduleRenewal = (delay: number) => {
                if (tokenRenewTimeoutRef.current) clearTimeout(tokenRenewTimeoutRef.current);
                tokenRenewTimeoutRef.current = setTimeout(() => {
                    tokenRenewTimeoutRef.current = null;
                    if (!acceptsEvents() || !isStreamingRef.current || isManualDisconnectRef.current) return;
                    isResumingSessionRef.current = true;
                    // If the next block was already bought but its connection failed, reuse that token.
                    const nextBlockBought = () => Date.parse(liveTokenRef.current?.expireTime ?? '') > expiresAt;
                    void startGeminiLiveSessionRef.current?.(streamRef.current!, 16000, !nextBlockBought())
                        .then(() => {
                            try { geminiSession.close(); } catch (error) { console.warn('Failed to close replaced live session', error); }
                        })
                        .catch((err: unknown) => {
                            if (!ownsRequest() || !isStreamingRef.current || isManualDisconnectRef.current) return;
                            isResumingSessionRef.current = false;
                            const retryable = nextBlockBought() || isRetryableRenewalError(err);
                            if (acceptsEvents()) {
                                // The current block is still running: retry while it has time left.
                                if (retryable && expiresAt - Date.now() > LIVE_TOKEN_RENEW_RETRY_MS + 5_000) {
                                    scheduleRenewal(LIVE_TOKEN_RENEW_RETRY_MS);
                                } else {
                                    tokenRenewFailureRef.current = err;
                                }
                                return;
                            }
                            // The socket dropped meanwhile. A retryable failure leaves renewal
                            // on, so the resumed connection schedules it again.
                            if (!retryable) tokenRenewFailureRef.current = err;
                            if (sessionResumptionHandleRef.current && Date.parse(liveTokenRef.current?.expireTime ?? '') > Date.now()) {
                                isResumingSessionRef.current = true;
                                void startGeminiLiveSessionRef.current?.(streamRef.current!, 16000).catch((resumeError: unknown) => {
                                    handleStreamingFailure(resumeError, 'resume', generation);
                                });
                                return;
                            }
                            handleStreamingFailure(err, 'resume', generation);
                        });
                }, delay);
            };
            if (tokenRenewTimeoutRef.current) clearTimeout(tokenRenewTimeoutRef.current);
            tokenRenewTimeoutRef.current = null;
            const renewDelay = tokenRenewFailureRef.current ? null : liveTokenRenewDelay(expireTime);
            if (renewDelay !== null) scheduleRenewal(renewDelay);

            // Initialize MediaRecorder AFTER AudioWorklet is connected
            // This ensures VAD state is being updated before recording starts
            const pickType = () => {
                const candidates = [
                    'audio/webm;codecs=opus',
                    'audio/webm',
                    'audio/ogg;codecs=opus',
                    'audio/ogg',
                ];
                for (const t of candidates) {
                    if (typeof MediaRecorder !== 'undefined' && (MediaRecorder as any).isTypeSupported?.(t)) return t;
                }
                return 'audio/webm';
            };
            try {
                if (typeof MediaRecorder !== 'undefined') {
                    const mimeType = pickType();
                    const chunks: Blob[] = [];
                    userChunksRef.current = chunks;
                    const recorder = new MediaRecorder(stream, { mimeType });
                    userRecorderRef.current = recorder;
                    recorder.ondataavailable = (e: BlobEvent) => {
                        if (e.data && e.data.size > 0) {
                            // Gate saving by VAD if enabled
                            if (saveOnlySpeechRef.current && userRecorderRef.current === recorder) {
                                const include = vadSpeechSinceLastChunkRef.current || vadSpeechActiveRef.current;
                                vadSpeechSinceLastChunkRef.current = false;
                                if (!include) {
                                    return; // drop silent chunk
                                }
                            }
                            chunks.push(e.data);
                            if (userRecorderRef.current !== recorder) return;
                            pendingUserChunkQueueRef.current.push(e.data);
                            maybeUploadSegment('user');
                        }
                    };
                    userRecorderRef.current.start(1000);
                    lastUserSegmentStartRef.current = Date.now();
                }
            } catch { /* best-effort cleanup; failure is non-fatal */ }

        } catch (error: any) {
            if (!ownsRequest()) return;
            console.error('Failed to start Gemini Live session:', error);
            throw error;
        } finally {
            if (!promoted) stagedResources.close();
            if (stagedLiveResourcesRef.current === stagedResources) stagedLiveResourcesRef.current = null;
        }
    }, [maybeUploadSegment, sendLiveText, handleStreamingFailure, stopStreaming]);

    const startGeminiLiveSession = useCallback((stream: MediaStream, sampleRate: number, forceRenewal = false) => {
        const generation = sessionGenerationRef.current;
        if (pendingLiveConnectionRef.current?.generation === generation) return pendingLiveConnectionRef.current.promise;
        const promise = connectGeminiLiveSession(stream, sampleRate, forceRenewal);
        const pending = { generation, promise };
        pendingLiveConnectionRef.current = pending;
        const clearPending = () => {
            if (pendingLiveConnectionRef.current === pending) pendingLiveConnectionRef.current = null;
        };
        void promise.then(clearPending, clearPending);
        return promise;
    }, [connectGeminiLiveSession]);

    // Process Gemini Live response queue with chunked processing to prevent UI blocking
    const processGeminiResponseQueue = useCallback((responseQueue: LiveServerMessage[], acceptsEvents: () => boolean) => {
        const MAX_MESSAGES_PER_FRAME = 10; // Process max 10 messages per animation frame

        const processMessages = () => {
            if (!acceptsEvents()) {
                responseQueue.length = 0;
                return;
            }
            let messagesProcessed = 0;

            const flushUserTranscript = () => {
                const t = liveUserTranscriptRef.current.trim();
                if (!t) return;
                liveUserTranscriptRef.current = '';
                onTranscriptionListenerRef.current?.({ role: 'user', text: t, finished: true });
            };
            const flushAssistantTranscript = () => {
                const t = liveAssistantTranscriptRef.current.trim();
                if (!t) return;
                liveAssistantTranscriptRef.current = '';
                onTranscriptionListenerRef.current?.({ role: 'assistant', text: t, finished: true });
            };

            while (acceptsEvents() && responseQueue.length > 0 && messagesProcessed < MAX_MESSAGES_PER_FRAME) {
                messagesProcessed++;
                const message = responseQueue.shift();

                // Handle session resumption updates
                if ((message as any)?.sessionResumptionUpdate) {
                    const update = (message as any).sessionResumptionUpdate;
                    if (update.resumable && update.newHandle) {
                        sessionResumptionHandleRef.current = update.newHandle;
                    }
                    continue;
                }

                // Handle GoAway messages
                if ((message as any)?.goAway) {
                    // The connection will be terminated soon, but we have the resumption handle
                    continue;
                }

                if (message?.serverContent && (message as any).serverContent.interrupted) {
                    const connectionGeneration = connectionGenerationRef.current;
                    liveAssistantTranscriptRef.current = '';
                    setIsSpeaking(false);
                    playbackQueueRef.current?.interrupt();
                    emitLiveInputDiagnostic({ event: 'server-interrupted', connectionGeneration });
                    continue;
                }

                const serverContent = message?.serverContent as any;
                const isStudyCompanionLive = liveOptionsRef.current?.variant === 'studyCompanion';

                const extracted =
                    isStudyCompanionLive && serverContent ? extractServerTranscriptions(serverContent) : null;

                if (isStudyCompanionLive && extracted) {
                    const { input, output } = extracted;
                    if (input) {
                        liveUserTranscriptRef.current = mergeStreamingTranscript(liveUserTranscriptRef.current, input.text);
                        if (input.finished) {
                            flushUserTranscript();
                        }
                    }
                    if (output) {
                        if (liveUserTranscriptRef.current.trim()) {
                            flushUserTranscript();
                        }
                        liveAssistantTranscriptRef.current = mergeStreamingTranscript(
                            liveAssistantTranscriptRef.current,
                            output.text,
                        );
                        if (output.finished) {
                            flushAssistantTranscript();
                        }
                    }
                    if (serverContent?.turnComplete) {
                        flushAssistantTranscript();
                    }
                } else {
                    if (serverContent?.inputTranscription) {
                        const tr = serverContent.inputTranscription;
                        onTranscriptionListenerRef.current?.({
                            role: 'user',
                            text: tr.text ?? '',
                            finished: Boolean(tr.finished),
                        });
                    }
                    if (serverContent?.outputTranscription) {
                        const tr = serverContent.outputTranscription;
                        onTranscriptionListenerRef.current?.({
                            role: 'assistant',
                            text: tr.text ?? '',
                            finished: Boolean(tr.finished),
                        });
                    }
                }

                // Handle tool calls
                if (message?.toolCall?.functionCalls && message.toolCall.functionCalls.length > 0) {
                    for (const fn of message.toolCall.functionCalls) {
                        const toolName = fn.name || '';
                        let listenerResult: ReturnType<ToolCallListener> | undefined;
                        try {
                            listenerResult = toolCallListenerRef.current?.(toolName, fn.args, fn.id || undefined);
                        } catch (err) {
                            console.error('Tool call listener failed:', err);
                        }
                        // Visual handlers that return a promise report the real outcome later.
                        const tracksVisualStatus = isVisualToolName(toolName)
                            && !!listenerResult && typeof (listenerResult as Promise<unknown>).then === 'function';
                        if (tracksVisualStatus) {
                            (listenerResult as Promise<VisualStatusReport | void>)
                                .then((report) => { if (report) visualStatusDeliveryRef.current?.enqueue(report); })
                                .catch((err) => {
                                    visualStatusDeliveryRef.current?.enqueue({
                                        status: 'failed',
                                        reason: err instanceof Error ? err.message : 'The visual could not be prepared',
                                    });
                                });
                        }

                        // Answer Gemini right away so it keeps talking while the visual is prepared.
                        try {
                            const session = geminiLiveSessionRef.current;
                            if (!session) continue;
                            session.sendToolResponse({
                                functionResponses: [
                                    {
                                        id: fn.id || '',
                                        name: toolName,
                                        response: {
                                            result: tracksVisualStatus ? VISUAL_PENDING_TOOL_RESPONSE : 'Tool is being called',
                                            scheduling: FunctionResponseScheduling.SILENT
                                        }
                                    }
                                ]
                            });
                            emitLiveInputDiagnostic({ event: 'sent', connectionGeneration: connectionGenerationRef.current, kind: 'tool', source: 'tool' });
                        } catch (err) {
                            console.warn('Failed to send tool response back to Gemini:', err);
                        }
                    }
                }

                // Handle audio data
                const audioParts = message?.serverContent?.modelTurn?.parts?.flatMap(part => {
                    const audio = part.inlineData;
                    return audio?.data && (!audio.mimeType || audio.mimeType.startsWith('audio/pcm')) ? [audio.data] : [];
                });
                if (audioParts?.length && acceptsEvents()) playGeminiAudioChunksRef.current?.(audioParts);
                if (message?.serverContent?.turnComplete) {
                    playbackQueueRef.current?.completeTurn();
                } else if (message?.serverContent?.generationComplete) {
                    playbackQueueRef.current?.completeTurn('generation-complete');
                }
            }

            // If there are more messages, schedule processing for next animation frame
            if (acceptsEvents() && responseQueue.length > 0) {
                requestAnimationFrame(processMessages);
            }
        };

        // Start processing
        processMessages();
    }, []);

    // Play audio chunks from Gemini
    const playGeminiAudioChunks = useCallback((rawData: string[]) => {
        if (!isStreamingRef.current) return;
        try {
            let ctx = playbackCtxRef.current;
            if (!ctx || ctx.state === 'closed') {
                playbackQueueRef.current?.stop();
                playbackQueueRef.current = null;
                playbackDestinationRef.current = null;
                ctx = new AudioContext({ sampleRate: 24000 });
                playbackCtxRef.current = ctx;
            }

            if (!playbackDestinationRef.current) {
                try {
                    playbackDestinationRef.current = ctx.createMediaStreamDestination();
                } catch { /* best-effort cleanup; failure is non-fatal */ }
            }

            const ensureAiRecorder = () => {
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
                        if ((MediaRecorder as any).isTypeSupported?.(t)) return t;
                    }
                    return 'audio/webm';
                };
                const chunks: Blob[] = [];
                aiChunksRef.current = chunks;
                try {
                    const recorder = new MediaRecorder(playbackDestinationRef.current.stream, { mimeType: pickType() });
                    aiRecorderRef.current = recorder;
                    recorder.ondataavailable = (e: BlobEvent) => {
                        if (e.data && e.data.size > 0) {
                            chunks.push(e.data);
                            if (aiRecorderRef.current !== recorder) return;
                            pendingAiChunkQueueRef.current.push(e.data);
                            maybeUploadSegment('ai');
                        }
                    };
                    aiRecorderRef.current.start(1000);
                    lastAiSegmentStartRef.current = Date.now();
                } catch { /* best-effort cleanup; failure is non-fatal */ }
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

            if (!playbackQueueRef.current) {
                const context = ctx;
                const analyser = analyserRef.current;
                const destination = playbackDestinationRef.current;
                const generation = sessionGenerationRef.current;
                const queue: PcmPlaybackQueue = new PcmPlaybackQueue(context, {
                    connect: source => {
                        source.connect(analyser && analyser.context === context ? analyser : context.destination);
                        if (destination?.context === context) source.connect(destination);
                    },
                    onSamples: samples => {
                        if (playbackQueueRef.current === queue && generation === sessionGenerationRef.current) onAiAudioDataListenerRef.current?.(samples);
                    },
                    onPlayingChange: playing => {
                        if (playbackQueueRef.current === queue && generation === sessionGenerationRef.current) setIsSpeaking(playing);
                    },
                    onDiagnostic: detail => window.dispatchEvent(new CustomEvent('insyte-audio-playback', { detail })),
                });
                playbackQueueRef.current = queue;
            }
            for (const data of rawData) playbackQueueRef.current?.enqueue(data);
        } catch {
            console.error('Failed to play Gemini audio chunks');
        }
    }, [maybeUploadSegment]);

    // Point the indirection refs at the latest callbacks from an effect (not during render);
    // they're read only by async Gemini handlers that run after mount.
    useEffect(() => {
        startGeminiLiveSessionRef.current = startGeminiLiveSession;
        processGeminiResponseQueueRef.current = processGeminiResponseQueue;
        playGeminiAudioChunksRef.current = playGeminiAudioChunks;
    }, [startGeminiLiveSession, processGeminiResponseQueue, playGeminiAudioChunks]);

    const setToolCallListener = useCallback((cb: ToolCallListener) => {
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
                sendLiveText(text);
            } else {
                setError('Not connected');
            }
        } catch (e: any) {
            console.error('sendText failed:', e);
            setError('Failed to send text');
        }
    }, [sendLiveText]);

    const sendViewport = useCallback((width: number, height: number, dpr: number) => {
        const payload = `VISUAL_VIEWPORT ${JSON.stringify({ width, height, devicePixelRatio: dpr })}`;
        try {
            if (geminiLiveSessionRef.current) {
                geminiLiveSessionRef.current.sendRealtimeInput({ text: payload });
                emitLiveInputDiagnostic({ event: 'sent', connectionGeneration: connectionGenerationRef.current, kind: 'text', source: 'viewport' });
            }
        } catch (e) {
            console.error('sendViewport failed:', e);
        }
    }, []);

    const sendMedia = useCallback((base64Data: string, mimeType: string) => {
        try {
            if (geminiLiveSessionRef.current) {
                // Image frames (e.g. viz screenshots) must go via `video`. The old
                // `media` field maps to the deprecated realtime_input.media_chunks,
                // which Gemini Live rejects by closing the socket with code 1007.
                geminiLiveSessionRef.current.sendRealtimeInput({
                    video: { data: base64Data, mimeType }
                });
                emitLiveInputDiagnostic({ event: 'sent', connectionGeneration: connectionGenerationRef.current, kind: 'video', source: 'visual' });
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

    const setOnTranscription = useCallback((cb: ((payload: LiveTranscriptionPayload) => void) | null) => {
        onTranscriptionListenerRef.current = cb;
    }, []);

    const setOnVadStateListener = useCallback((cb: (active: boolean, rms: number) => void) => {
        onVadStateListenerRef.current = cb;
    }, []);

    const setOnCreditsUpdate = useCallback((cb: ((update: VoiceCreditsUpdate) => void) | null) => {
        onCreditsUpdateRef.current = cb;
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
        setOnVadStateListener,
        setOnTranscription,
        setOnCreditsUpdate,
    };
}
