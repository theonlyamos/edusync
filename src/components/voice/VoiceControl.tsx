import { useAudioStreaming, LessonContext } from '@/hooks/useAudioStreaming';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AudioVisualizer from './AudioVisualizer';
import { readVisualizationPanelDimensions } from '@/lib/visualization-viewport';

interface VoiceControlProps {
  /** Whether mic streaming should be active */
  active: boolean;
  viewportRef?: React.RefObject<HTMLElement | null>;
  sessionId?: string | null;
  topic?: string | null;
  lessonContext?: LessonContext;
  onError?: (error: string) => void;
  onStartupFailed?: () => void;
  onToolCall?: (name: string, args: any, callId?: string) => void;
  onConnectionStatusChange?: (status: 'disconnected' | 'connecting' | 'connected') => void;
  onCountdownEnd?: () => void;
  mobileMode?: boolean;
  onCountdownChange?: (countdown: number) => void;
  onFeedbackFormChange?: (show: boolean, trigger: 'manual_stop' | 'connection_reset' | 'error' | null) => void;
  onFeedbackSubmit?: (feedback: any) => Promise<void>;
  onFeedbackClose?: () => void;
  onRecordingsReady?: (payload: { user: Blob | null; ai: Blob | null; durationMs: number }) => void;
}

export function VoiceControl({ active, viewportRef, sessionId, topic, lessonContext, onError, onStartupFailed, onToolCall, onConnectionStatusChange, onCountdownEnd, mobileMode = false, onCountdownChange, onFeedbackFormChange, onFeedbackSubmit, onFeedbackClose, onRecordingsReady }: VoiceControlProps) {
  const {
    isStreaming,
    isSpeaking,
    connectionStatus,
    error: _streamingError,
    showFeedbackForm,
    feedbackTrigger,
    startStreaming,
    stopStreaming,
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
    setOnVadStateListener,
    setSaveOnlySpeech,
    closeFeedbackForm,
    submitFeedback,
  } = useAudioStreaming(topic, lessonContext);
  setSaveOnlySpeech?.(true);
  const [countdown, setCountdown] = useState(600);
  const countdownEndedRef = useRef(false);
  const activationAttemptedRef = useRef(false);
  const activationGenerationRef = useRef(0);
  const [audioData, setAudioData] = useState(new Float32Array(0));
  const [aiAudioData, setAiAudioData] = useState(new Float32Array(0));
  const [vadActive, setVadActive] = useState(false);
  const [vadRms, setVadRms] = useState(0);

  useEffect(() => {
    if (connectionStatus === 'connected') {
      countdownEndedRef.current = false;
      const timer = setInterval(() => {
        setCountdown(prevCountdown => {
          if (prevCountdown <= 1) {
            clearInterval(timer);
            stopStreaming();
            countdownEndedRef.current = true;
            onCountdownEnd?.();
            return 0;
          }
          return prevCountdown - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    } else {
      if (!countdownEndedRef.current) {
        setCountdown(600);
      }
    }
  }, [connectionStatus, stopStreaming, onCountdownEnd]);

  // React to `active` prop changes
  useEffect(() => {
    const manage = async () => {
      if (!active) {
        if (activationAttemptedRef.current) activationGenerationRef.current += 1;
        activationAttemptedRef.current = false;
        if (isStreaming) stopStreaming();
        return;
      }
      if (activationAttemptedRef.current) {
        if (!isStreaming && _streamingError) onStartupFailed?.();
        return;
      }
      activationAttemptedRef.current = true;
      const generation = ++activationGenerationRef.current;
      try {
        await startStreaming();
      } catch (err: any) {
        if (generation !== activationGenerationRef.current) return;
        console.error('VoiceControl streaming error:', err);
        onError?.(err.message || 'Voice streaming failed');
        onStartupFailed?.();
      }
    };
    void manage();
  }, [active, isStreaming, _streamingError, startStreaming, stopStreaming, onError, onStartupFailed]);

  // Register tool call listener
  useEffect(() => {
    setToolCallListener(onToolCall ?? (() => { }));
  }, [onToolCall, setToolCallListener]);

  useEffect(() => {
    if (!setOnRecordingsReady) return;
    setOnRecordingsReady((payload) => {
      if (typeof window !== 'undefined' && window?.navigator?.userAgent?.includes('Headless')) return;
      (onRecordingsReady as any)?.(payload);
    });
  }, [setOnRecordingsReady, onRecordingsReady]);

  useEffect(() => {
    if (!setSessionId) return;
    setSessionId(sessionId ?? null);
  }, [sessionId, setSessionId]);

  useEffect(() => {
    setOnAudioDataListener((data) => {
      // Create a new Float32Array to ensure it's backed by a standard ArrayBuffer
      const convertedData = new Float32Array(data);
      setAudioData(convertedData);
    });
  }, [setOnAudioDataListener]);

  useEffect(() => {
    if (setOnAiAudioDataListener) {
      setOnAiAudioDataListener((data: Float32Array) => {
        // Convert to ensure consistent ArrayBuffer type
        const convertedData = new Float32Array(data);
        setAiAudioData(convertedData);
      });
    }
  }, [setOnAiAudioDataListener]);

  useEffect(() => {
    setOnVadStateListener?.((active, rms) => {
      setVadActive(active);
      setVadRms(rms);
    });
  }, [setOnVadStateListener]);

  useEffect(() => {
    onConnectionStatusChange?.(connectionStatus);
  }, [connectionStatus, onConnectionStatusChange]);

  useEffect(() => {
    if (_streamingError) onError?.(_streamingError);
  }, [_streamingError, onError]);

  useEffect(() => {
    onCountdownChange?.(countdown);
  }, [countdown, onCountdownChange]);

  useEffect(() => {
    onFeedbackFormChange?.(showFeedbackForm, feedbackTrigger);
  }, [showFeedbackForm, feedbackTrigger, onFeedbackFormChange]);

  // Set up feedback callbacks
  useEffect(() => {
    if (onFeedbackSubmit) {
      // Override the submitFeedback function if parent provides one
      return;
    }
  }, [onFeedbackSubmit]);

  useEffect(() => {
    if (onFeedbackClose) {
      // Override the closeFeedbackForm function if parent provides one
      return;
    }
  }, [onFeedbackClose]);


  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    let previous = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const send = () => {
      const panel = viewportRef?.current?.querySelector('[data-visualization-panel]');
      const { width, height } = readVisualizationPanelDimensions(panel ?? viewportRef?.current);
      const dpr = window.devicePixelRatio || 1;
      const dimensions = `${width}:${height}:${dpr}`;
      if (dimensions === previous) return;
      previous = dimensions;
      sendViewport(width, height, dpr);
    };
    send();
    const resizeHandler = () => {
      clearTimeout(timer);
      timer = setTimeout(send, 300);
    };
    const observer = new ResizeObserver(resizeHandler);
    if (viewportRef?.current) observer.observe(viewportRef.current);
    let observedPanel: Element | null = null;
    const observePanel = () => {
      const panel = viewportRef?.current?.querySelector('[data-visualization-panel]') ?? null;
      if (panel === observedPanel) return;
      if (observedPanel) observer.unobserve(observedPanel);
      observedPanel = panel;
      if (panel) observer.observe(panel);
      resizeHandler();
    };
    observePanel();
    // Activity replacement can change its drawable area while the outer viewport stays fixed.
    const mutationObserver = new MutationObserver(observePanel);
    if (viewportRef?.current) mutationObserver.observe(viewportRef.current, { childList: true, subtree: true });
    window.addEventListener('resize', resizeHandler);
    window.visualViewport?.addEventListener('resize', resizeHandler);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', resizeHandler);
      window.visualViewport?.removeEventListener('resize', resizeHandler);
    };
  }, [connectionStatus, sendViewport, viewportRef]);

  useEffect(() => {
    const handler = (e: Event) => {
      const anyEvent = e as CustomEvent<string>;
      if (typeof anyEvent.detail === 'string' && anyEvent.detail.trim().length > 0) {
        sendText(anyEvent.detail);
      }
    };
    window.addEventListener('voice-send-text', handler as EventListener);
    return () => window.removeEventListener('voice-send-text', handler as EventListener);
  }, [sendText]);

  useEffect(() => {
    const handler = (e: Event) => {
      const anyEvent = e as CustomEvent<{ dataUrl: string; mimeType: string }>;
      const payload = anyEvent.detail;
      if (payload && typeof payload.dataUrl === 'string') {
        const [prefix, b64] = payload.dataUrl.split(',');
        const mime = payload.mimeType || (prefix?.match(/data:(.*?);base64/)
          ? prefix.match(/data:(.*?);base64/)![1]
          : 'image/png');
        if (b64) sendMedia(b64, mime);
      }
    };
    window.addEventListener('voice-send-media', handler as EventListener);
    return () => window.removeEventListener('voice-send-media', handler as EventListener);
  }, [sendMedia]);

  return (
    <div className="h-12 w-[500px] max-w-full relative">
      <AudioVisualizer audioData={aiAudioData} isActive={isSpeaking} analyser={getAnalyser()} variant="ai" />
      <div className="absolute inset-0 pointer-events-none mix-blend-plus-lighter">
        <AudioVisualizer audioData={audioData} isActive={vadActive} analyser={getMicAnalyser?.()} variant="mic" />
      </div>
    </div>
  );
}
