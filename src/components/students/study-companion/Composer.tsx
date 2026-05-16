'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { LessonContext, LiveTranscriptionPayload, UseAudioStreamingLiveOptions } from '@/hooks/useAudioStreaming';
import { useAudioStreaming } from '@/hooks/useAudioStreaming';
import type { StudyIntent, StudyMessage, StudyMode } from './types';
import { LiveWaveformStrip } from './LiveWaveformStrip';

interface ComposerProps {
  value: string;
  disabled?: boolean;
  isLoading?: boolean;
  mode: StudyMode;
  intent: StudyIntent;
  gradeLevel: string | null;
  selectedLessonId: string | null;
  lessonVoiceContext: LessonContext | undefined;
  voiceLiveOptions: UseAudioStreamingLiveOptions;
  voiceSessionReady: boolean;
  /** When mic would otherwise be unavailable (no chat yet), create one before starting voice. */
  ensureChatForVoice?: () => Promise<boolean>;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onVoiceTranscript: (message: StudyMessage) => void;
  onVoiceError?: (message: string) => void;
}

const modeCopy: Record<StudyMode, string> = {
  companion: 'Study companion mode',
  tutor: 'Tutor mode',
};

const intentCopy: Record<StudyIntent, string> = {
  general: 'Ask, plan, practice, or get unstuck...',
  plan: 'Tell me what you need to study and how much time you have...',
  hint: 'Paste the problem or describe where you are stuck...',
  explain: 'What concept should I explain?',
  quiz: 'What topic should I quiz you on?',
  review: 'What should we review?',
  walkthrough: 'Paste the problem and where you got stuck...',
};

export function Composer({
  value,
  disabled,
  isLoading,
  mode,
  intent,
  gradeLevel,
  selectedLessonId,
  lessonVoiceContext,
  voiceLiveOptions,
  voiceSessionReady,
  ensureChatForVoice,
  onChange,
  onSubmit,
  onVoiceTranscript,
  onVoiceError,
}: ComposerProps) {
  const [vadActive, setVadActive] = useState(false);
  const [ensuringChatForVoice, setEnsuringChatForVoice] = useState(false);
  const userTranscriptRef = useRef('');
  const assistantTranscriptRef = useRef('');

  const voice = useAudioStreaming(null, lessonVoiceContext, voiceLiveOptions);

  useEffect(() => {
    voice.setSaveOnlySpeech?.(true);
  }, [voice]);

  useEffect(() => {
    voice.setToolCallListener(() => {});
  }, [voice]);

  useEffect(() => {
    voice.setOnVadStateListener?.((active) => {
      setVadActive(active);
    });
  }, [voice]);

  useEffect(() => {
    voice.setOnTranscription?.((payload: LiveTranscriptionPayload) => {
      if (payload.role === 'user') {
        if (payload.text) userTranscriptRef.current = payload.text;
        if (payload.finished) {
          const content = userTranscriptRef.current.trim();
          userTranscriptRef.current = '';
          if (content) {
            onVoiceTranscript({
              role: 'user',
              content,
              timestamp: new Date().toISOString(),
              lessonId: selectedLessonId || undefined,
              mode,
              intent,
            });
          }
        }
        return;
      }
      if (payload.text) assistantTranscriptRef.current = payload.text;
      if (payload.finished) {
        const content = assistantTranscriptRef.current.trim();
        assistantTranscriptRef.current = '';
        if (content) {
          onVoiceTranscript({
            role: 'assistant',
            content,
            timestamp: new Date().toISOString(),
            lessonId: selectedLessonId || undefined,
            mode,
            intent: 'general',
          });
        }
      }
    });
  }, [voice, onVoiceTranscript, selectedLessonId, mode, intent]);

  useEffect(() => {
    if (!voice.error) return;
    onVoiceError?.(voice.error);
    voice.clearError();
  }, [voice.error, voice.clearError, onVoiceError]);

  const toggleMic = useCallback(async () => {
    let okToVoice = voiceSessionReady;
    if (!okToVoice && ensureChatForVoice) {
      setEnsuringChatForVoice(true);
      try {
        okToVoice = await ensureChatForVoice();
      } finally {
        setEnsuringChatForVoice(false);
      }
    }
    if (!okToVoice) return;
    try {
      if (voice.isStreaming) voice.stopStreaming();
      else await voice.startStreaming();
    } catch (e) {
      onVoiceError?.(e instanceof Error ? e.message : 'Voice connection failed');
    }
  }, [voice, voiceSessionReady, ensureChatForVoice, onVoiceError]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (voice.isStreaming && voice.connectionStatus === 'connected') {
      onVoiceTranscript({
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
        lessonId: selectedLessonId || undefined,
        mode,
        intent,
      });
      voice.sendText(trimmed);
      onChange('');
      return;
    }
    onSubmit();
  };

  const sendDisabled = disabled || isLoading || (!voice.isStreaming && !value.trim());
  const micBusy = voice.connectionStatus === 'connecting' || ensuringChatForVoice;
  const waveformActive = voice.isStreaming && (vadActive || voice.isSpeaking || voice.connectionStatus === 'connected');
  const micLiveConnected = voice.isStreaming && voice.connectionStatus === 'connected';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{modeCopy[mode]}</span>
        {intent !== 'general' && <span className="capitalize">{intent}</span>}
      </div>
      <div
        className={cn(
          'flex items-end gap-2 rounded-2xl border border-border/70 bg-muted/25 p-2 shadow-sm backdrop-blur-sm transition-[box-shadow,border-color] focus-within:border-primary/35 focus-within:shadow-md dark:bg-muted/15',
          voice.isStreaming && 'border-primary/30',
        )}
      >
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={intentCopy[intent]}
          disabled={disabled || isLoading}
          rows={1}
          className="max-h-[200px] min-h-[52px] min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border-0 bg-transparent px-3 py-2.5 text-[15px] leading-relaxed shadow-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden focus-visible:ring-0 focus-visible:ring-offset-0"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="flex shrink-0 items-center gap-1.5 pb-0.5 pr-0.5">
          {voice.isStreaming ? (
            <LiveWaveformStrip
              analyser={voice.getMicAnalyser?.() ?? null}
              active={waveformActive}
              aiAnalyser={voice.getAnalyser()}
              aiActive={voice.isSpeaking && voice.connectionStatus === 'connected'}
            />
          ) : null}
          <Button
            type="button"
            variant={voice.isStreaming ? 'default' : 'outline'}
            size="icon"
            disabled={disabled || isLoading || micBusy}
            className={cn(
              'h-11 w-11 shrink-0 rounded-full border-border/80 shadow-sm transition-[transform,background-color,color] active:scale-95',
              voice.isStreaming &&
                !micLiveConnected &&
                'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
              micLiveConnected &&
                'border-transparent bg-red-600 text-white hover:bg-red-600 hover:text-white dark:bg-red-600 dark:hover:bg-red-700',
            )}
            aria-pressed={voice.isStreaming}
            aria-label={voice.isStreaming ? 'Turn off microphone' : 'Turn on microphone'}
            title={
              voice.isStreaming
                ? 'Stop voice'
                : voiceSessionReady || ensureChatForVoice
                  ? 'Start voice'
                  : 'Start or open a study session to use voice'
            }
            onClick={() => void toggleMic()}
          >
            {micBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : voice.isStreaming ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Button
            type="button"
            size="icon"
            disabled={sendDisabled}
            className="h-11 w-11 shrink-0 rounded-full shadow-sm"
            aria-label="Send message"
            onClick={handleSend}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
      {voice.isStreaming && voice.connectionStatus === 'connected' ? (
        <p className="text-xs text-muted-foreground">Voice is on — speak naturally or type and send to add text to the live session.</p>
      ) : null}
    </div>
  );
}
