import { useAudioStreaming } from '@/hooks/useAudioStreaming';
import React, { useEffect, useRef, useState } from 'react';
import AudioVisualizer from './AudioVisualizer';

interface VoiceControlProps {
  /** Whether mic streaming should be active */
  active: boolean;
  onError?: (error: string) => void;
  onToolCall?: (name: string, args: any) => void;
  onConnectionStatusChange?: (status: 'disconnected' | 'connecting' | 'connected') => void;
  onCountdownEnd?: () => void;
}

export function VoiceControl({ active, onError, onToolCall, onConnectionStatusChange, onCountdownEnd }: VoiceControlProps) {
  const {
    isStreaming,
    isSpeaking,
    connectionStatus,
    error: _streamingError,
    startStreaming,
    stopStreaming,
    setToolCallListener,
    setOnAudioDataListener,
    sendText,
    sendMedia,
    sendViewport,
  } = useAudioStreaming();
  const [countdown, setCountdown] = useState(600);
  const countdownEndedRef = useRef(false);
  const [audioData, setAudioData] = useState(new Float32Array(0));

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
    setToolCallListener(onToolCall ?? (() => {}));
  }, [onToolCall, setToolCallListener]);

  useEffect(() => {
    setOnAudioDataListener((data: Float32Array<ArrayBufferLike>) => {
      // Convert to the expected type for our state
      const convertedData = new Float32Array(data);
      setAudioData(convertedData);
    });
  }, [setOnAudioDataListener]);

  useEffect(() => {
    onConnectionStatusChange?.(connectionStatus);
  }, [connectionStatus, onConnectionStatusChange]);

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
    <div className="flex flex-col gap-2 items-start w-full">
      {isSpeaking && <AudioVisualizer audioData={audioData} />}
      {statusBadge}
    </div>
  );
} 