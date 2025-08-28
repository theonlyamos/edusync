import { useAudioStreaming } from '@/hooks/useAudioStreaming';
import React, { useEffect } from 'react';

interface VoiceControlProps {
  /** Whether mic streaming should be active */
  active: boolean;
  onError?: (error: string) => void;
  onToolCall?: (name: string, args: any) => void;
  onConnectionStatusChange?: (status: 'disconnected' | 'connecting' | 'connected') => void;
}

export function VoiceControl({ active, onError, onToolCall, onConnectionStatusChange }: VoiceControlProps) {
  const {
    isStreaming,
    isSpeaking,
    connectionStatus,
    error: _streamingError,
    startStreaming,
    stopStreaming,
    setToolCallListener,
    sendText,
    sendMedia,
  } = useAudioStreaming();

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
    onConnectionStatusChange?.(connectionStatus);
  }, [connectionStatus, onConnectionStatusChange]);

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
        <div className="flex items-center gap-1 text-emerald-600">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Connected</span>
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
    <div className="flex flex-col gap-2 items-start">
      {statusBadge}
      <div className={`relative mt-2 ${isSpeaking ? 'animate-glow' : ''} rounded-full`}> 
        <div className="relative w-24 h-24 flex items-center justify-center">
          {isSpeaking && [0,1,2].map((i) => (
            <span
              key={i}
              className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ripple"
              style={{ animationDelay: `${i * 0.45}s` }}
            />
          ))}
          <div className={`flex items-end gap-[4px] h-10 ${isSpeaking ? '' : 'opacity-40'}`}>
            {[0,1,2,3,4,5].map((i) => (
              <span
                key={i}
                className={`w-[5px] rounded-sm ${isSpeaking ? 'bg-emerald-500 animate-equalizer' : 'bg-muted-foreground'}`}
                style={{ animationDelay: `${i * 0.08}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 