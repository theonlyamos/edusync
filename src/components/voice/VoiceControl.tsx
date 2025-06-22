import { useAudioStreaming } from '@/hooks/useAudioStreaming';
import React, { useEffect } from 'react';

interface VoiceControlProps {
  /** Whether mic streaming should be active */
  active: boolean;
  onError?: (error: string) => void;
  onToolCall?: (name: string, args: any) => void;
}

export function VoiceControl({ active, onError, onToolCall }: VoiceControlProps) {
  const {
    isStreaming,
    isSpeaking,
    error: _streamingError,
    startStreaming,
    stopStreaming,
    setToolCallListener,
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

  return (
    <div className="flex flex-col gap-2 items-start">
      {/* Streaming indicator & equalizer */}
      {isStreaming && (
        <div className="flex items-center gap-2 text-xs text-red-500">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>Streaming…</span>
        </div>
      )}

      {isSpeaking && (
        <div className="relative w-20 h-20 flex items-center justify-center mt-2">
          {/* Ripple rings */}
          {[0,1,2].map((i) => (
            <span
              key={i}
              className="absolute inset-0 rounded-full border-2 border-green-400 animate-ripple"
              style={{ animationDelay: `${i * 0.4}s` }}
            />
          ))}
          {/* Inner equalizer */}
          <div className="relative flex items-end gap-[3px] h-8">
            {[0,1,2,3,4].map((i) => (
              <span
                key={i}
                className="w-[4px] bg-green-500 rounded-sm animate-equalizer"
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 