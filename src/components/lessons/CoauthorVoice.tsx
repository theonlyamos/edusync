'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAudioStreaming, type LessonContext, type LiveTranscriptionPayload, type VoiceCreditsUpdate } from '@/hooks/useAudioStreaming';
import { mergeStreamingTranscript } from '@/lib/audio/transcription';
import { voiceErrorMessage } from '@/lib/live-tutor/voice-errors';

/** A forgotten open microphone must not keep spending the school's credits. */
const MAX_VOICE_SECONDS = 15 * 60;

/**
 * Voice mode for the lesson co-author. Gemini Live does the talking; every
 * real request goes through ask_coauthor to the same text co-author the chat
 * uses, so its proposal cards appear in the chat and still need a tap.
 */
export function CoauthorVoice({ lesson, onRequest, onStop }: {
  lesson: LessonContext;
  /** Runs one co-author turn and returns a short summary for the voice to speak. */
  onRequest: (request: string) => Promise<string>;
  onStop: () => void;
}) {
  const voice = useAudioStreaming(null, lesson, { variant: 'coauthor' });
  const { startStreaming, stopStreaming, sendText, setToolCallListener, setOnTranscription, setOnCreditsUpdate } = voice;
  const [caption, setCaption] = useState<{ role: 'user' | 'assistant'; text: string }>();
  const [credits, setCredits] = useState<VoiceCreditsUpdate>();
  const [startError, setStartError] = useState<string>();
  const [working, setWorking] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const connected = voice.connectionStatus === 'connected';
  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [connected]);
  useEffect(() => {
    if (seconds < MAX_VOICE_SECONDS) return;
    stopStreaming();
    onStop();
  }, [seconds, stopStreaming, onStop]);
  const onRequestRef = useRef(onRequest);
  useEffect(() => { onRequestRef.current = onRequest; }, [onRequest]);

  useEffect(() => {
    let cancelled = false;
    startStreaming().catch((error) => { if (!cancelled) setStartError(voiceErrorMessage(error, 'start')); });
    return () => { cancelled = true; stopStreaming(); };
    // Start once when voice mode opens; stop when it closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setToolCallListener((name, args) => {
      if (name !== 'ask_coauthor') return;
      const request = typeof args?.request === 'string' ? args.request.trim().slice(0, 4_000) : '';
      if (!request) return;
      setWorking(true);
      void onRequestRef.current(request)
        .then((summary) => { try { sendText(`COAUTHOR_RESULT ${summary}`); } catch { /* the call may have ended */ } })
        .catch((error) => { try { sendText(`COAUTHOR_RESULT The co-author could not answer: ${error instanceof Error ? error.message : 'unknown error'}`); } catch { /* ended */ } })
        .finally(() => setWorking(false));
    });
    return () => setToolCallListener(() => {});
  }, [sendText, setToolCallListener]);

  const onTranscription = useCallback((payload: LiveTranscriptionPayload) => {
    setCaption((current) => current?.role === payload.role
      ? { role: payload.role, text: mergeStreamingTranscript(current.text, payload.text) }
      : { role: payload.role, text: payload.text });
  }, []);
  useEffect(() => {
    setOnTranscription?.(onTranscription);
    return () => setOnTranscription?.(null);
  }, [onTranscription, setOnTranscription]);
  useEffect(() => {
    setOnCreditsUpdate(setCredits);
    return () => setOnCreditsUpdate(null);
  }, [setOnCreditsUpdate]);

  // The shared voice messages are written for students; point teachers back to typing.
  const error = (startError || voice.error)
    ?.replace('You can also type your questions in the Study Companion.', 'You can still type to the co-author.')
    .replace('The voice tutor could not connect', 'Voice could not connect');
  const connecting = voice.connectionStatus === 'connecting' || (!voice.isStreaming && !error);
  return <div role="region" aria-label="Voice mode" className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 font-medium">
        {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className={voice.isSpeaking ? 'h-4 w-4 text-primary' : 'h-4 w-4 animate-pulse text-primary'} />}
        {error ? 'Voice stopped' : connecting ? 'Connecting…' : working ? 'Working on it…' : voice.isSpeaking ? 'Speaking' : 'Listening'}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={() => { stopStreaming(); onStop(); }}><Square className="mr-2 h-3.5 w-3.5" />End voice</Button>
    </div>
    {caption?.text && !error && <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">{caption.role === 'user' ? 'You: ' : 'Co-author: '}</span>{caption.text}</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <p className="text-xs text-muted-foreground">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} of 15:00 · 1 credit a minute from your school&apos;s pool{credits ? ` · ${credits.remainingCredits} left` : ''}. Tap Apply on a card to use it.</p>
  </div>;
}
