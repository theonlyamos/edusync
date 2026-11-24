/**
 * Live captions for the tutor's voice. Gemini Live sends the transcript of what
 * it is saying in small pieces; this keeps the current turn and hands back the
 * last couple of lines of it to show under the board.
 */

import { mergeStreamingTranscript } from '@/lib/audio/transcription';

export type CaptionState = { text: string; turnOver: boolean };

export const initialCaptionState: CaptionState = { text: '', turnOver: false };

export type CaptionEvent =
  | { type: 'chunk'; text: string; finished: boolean }
  | { type: 'clear' };

export function captionReducer(state: CaptionState, event: CaptionEvent): CaptionState {
  if (event.type === 'clear') return state.text ? initialCaptionState : state;
  // The first words after a finished turn start a new caption.
  const base = state.turnOver ? '' : state.text;
  const text = event.text ? mergeStreamingTranscript(base, event.text) : base;
  if (text === state.text && event.finished === state.turnOver) return state;
  return { text, turnOver: event.finished };
}

/** The end of the caption that fits on screen, cut at a word so it never starts mid-word. */
export function captionTail(text: string, maxChars = 140): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const tail = clean.slice(clean.length - maxChars);
  const firstSpace = tail.indexOf(' ');
  return firstSpace >= 0 && firstSpace < tail.length - 1 ? tail.slice(firstSpace + 1) : tail;
}
