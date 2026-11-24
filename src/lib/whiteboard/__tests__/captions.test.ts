import { describe, expect, it } from 'vitest';
import { captionReducer, captionTail, initialCaptionState } from '../captions';

const chunk = (text: string, finished = false) => ({ type: 'chunk' as const, text, finished });

describe('tutor captions', () => {
  it('joins the pieces of one turn', () => {
    let state = captionReducer(initialCaptionState, chunk('So a fraction'));
    state = captionReducer(state, chunk(' is a part of a whole.'));
    expect(state.text).toBe('So a fraction is a part of a whole.');
  });

  it('starts over when the next turn begins', () => {
    let state = captionReducer(initialCaptionState, chunk('First turn.', true));
    expect(state.text).toBe('First turn.');
    state = captionReducer(state, chunk('Second turn'));
    expect(state.text).toBe('Second turn');
  });

  it('clears on demand and keeps the same state when nothing changes', () => {
    const state = captionReducer(initialCaptionState, chunk('Hello'));
    expect(captionReducer(state, chunk(''))).toBe(state);
    expect(captionReducer(state, { type: 'clear' })).toEqual(initialCaptionState);
    expect(captionReducer(initialCaptionState, { type: 'clear' })).toBe(initialCaptionState);
  });

  it('shows the end of a long caption without cutting a word', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const tail = captionTail(long, 50);
    expect(tail.length).toBeLessThanOrEqual(50);
    expect(tail.endsWith('word59')).toBe(true);
    expect(tail.startsWith('word')).toBe(true);
    expect(captionTail('  short   one ')).toBe('short one');
  });
});
