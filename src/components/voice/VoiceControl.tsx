import { useAudioStreaming } from '@/hooks/useAudioStreaming';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AudioVisualizer from './AudioVisualizer';

interface VoiceControlProps {
  /** Whether mic streaming should be active */
  active: boolean;
  sessionId?: string | null;
  topic?: string | null;
  onError?: (error: string) => void;
  onToolCall?: (name: string, args: any) => void;
  onConnectionStatusChange?: (status: 'disconnected' | 'connecting' | 'connected') => void;
  onCountdownEnd?: () => void;
  mobileMode?: boolean;
  onCountdownChange?: (countdown: number) => void;
  onFeedbackFormChange?: (show: boolean, trigger: 'manual_stop' | 'connection_reset' | 'error' | null) => void;
  onFeedbackSubmit?: (feedback: any) => Promise<void>;
  onFeedbackClose?: () => void;
  onRecordingsReady?: (payload: { user: Blob | null; ai: Blob | null; durationMs: number }) => void;
}

export function VoiceControl({ active, sessionId, topic, onError, onToolCall, onConnectionStatusChange, onCountdownEnd, mobileMode = false, onCountdownChange, onFeedbackFormChange, onFeedbackSubmit, onFeedbackClose, onRecordingsReady }: VoiceControlProps) {
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
  } = useAudioStreaming(topic);
  setSaveOnlySpeech?.(true);
  const [countdown, setCountdown] = useState(600);
  const countdownEndedRef = useRef(false);
  const [audioData, setAudioData] = useState(new Float32Array(0));
  const [aiAudioData, setAiAudioData] = useState(new Float32Array(0));
  const [vadActive, setVadActive] = useState(false);
  const [vadRms, setVadRms] = useState(0);
  const [mobileContainer, setMobileContainer] = useState<HTMLElement | null>(null);

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
      try {
        if (active && !isStreaming) {
          await startStreaming();
        } else if (!active && isStreaming) {
          stopStreaming();
        }
      } catch (err: any) {
        console.error('VoiceControl streaming error:', err);
        onError?.(err.message || 'Voice streaming failed');
      }
    };
    void manage();
  }, [active, isStreaming, startStreaming, stopStreaming, onError]);

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

  // Find mobile visualizer container - check when active and connected
  useEffect(() => {
    // Only look for container when it should exist (connected state)
    if (!active || connectionStatus !== 'connected') {
      // Clear container reference when not needed
      if (mobileContainer) {
        setMobileContainer(null);
      }
      return;
    }

    const checkForContainer = () => {
      const container = document.getElementById('mobile-visualizer-container');
      if (container) {
        setMobileContainer(container);
        return true;
      }
      return false;
    };

    // Check immediately
    checkForContainer();

    // Also check periodically in case the container is added later
    // This handles viewport resizing and delayed rendering
    const interval = setInterval(() => {
      checkForContainer();
    }, 100);

    // Cleanup
    return () => clearInterval(interval);
  }, [active, connectionStatus]);

  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    const send = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      sendViewport(width, height, dpr);
    };
    send();
    const resizeHandler = () => {
      clearTimeout((resizeHandler as any)._t);
      (resizeHandler as any)._t = setTimeout(send, 300);
    };
    window.addEventListener('resize', resizeHandler);
    return () => window.removeEventListener('resize', resizeHandler);
  }, [connectionStatus, sendViewport]);

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

  const statusBadge = (
    <div className="flex items-center gap-2 text-xs">
      {connectionStatus === 'disconnected' && (
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          <span>Disconnected</span>
        </div>
      )}
      {connectionStatus === 'connecting' && (
        <div className="flex items-center gap-1 text-amber-600">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Connecting…</span>
        </div>
      )}
      {connectionStatus === 'connected' && (
        <div className="flex items-center gap-2 text-emerald-600">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Connected</span>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
          </span>
        </div>
      )}
      {isStreaming && connectionStatus === 'connected' && (
        <div className="flex items-center gap-1 text-red-600 ml-3">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>Streaming mic</span>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop component - always render for status management, but hide on mobile */}
      <div className="flex flex-col gap-2 w-full">
        <div className="hidden lg:block">{statusBadge}</div>
        <div className="w-full max-w-md h-12 sm:h-16 hidden lg:block relative">
          <AudioVisualizer audioData={aiAudioData} isActive={isSpeaking} analyser={getAnalyser()} variant="ai" />
          <div className="absolute inset-0 pointer-events-none mix-blend-plus-lighter">
            <AudioVisualizer audioData={audioData} isActive={vadActive} analyser={getMicAnalyser?.()} variant="mic" />
          </div>
        </div>
      </div>

      {/* Mobile/tablet visualizer via portal - shows when bottom panel is visible */}
      {/* {mobileContainer && createPortal( */}
      <div className="w-full h-full relative">
        <AudioVisualizer audioData={aiAudioData} isActive={isSpeaking} analyser={getAnalyser()} variant="ai" />
        <div className="absolute inset-0 pointer-events-none mix-blend-plus-lighter">
          <AudioVisualizer audioData={audioData} isActive={vadActive} analyser={getMicAnalyser?.()} variant="mic" />
        </div>
      </div>,
      {/* mobileContainer
      )} */}
    </>
  );
} 