import { describe, expect, it } from 'vitest';
import { boardReducer, checkpointScore, initialBoardState, parseCheckpoint, parseCheckpointResult, type BoardItemBody, type BoardState } from '../board';
import { formatBoardFrame, formatCheckpointResult, formatFrameQuestion, isWhiteboardToolName, WHITEBOARD_PROMPT, whiteboardToolDeclarations } from '../board-tools';
import { clampCrop, cropScale } from '../capture';

const ask = (state: BoardState, args: unknown, now = 0) =>
  boardReducer(state, { type: 'write', items: [parseCheckpoint(args) as BoardItemBody], now });
const last = (state: BoardState) => state.pages.at(-1)!.items.at(-1)!;

describe('checkpoint questions', () => {
  it('reads a question with choices and the right answer', () => {
    expect(parseCheckpoint({ question: ' What is 1/2 + 1/4? ', choices: ['2/6', '3/4', '', 7], correct: 1 }))
      .toEqual({ kind: 'checkpoint', text: 'What is 1/2 + 1/4?', choices: ['2/6', '3/4'], correct: 1 });
  });

  it('falls back to a spoken question when the choices are unusable', () => {
    expect(parseCheckpoint({ question: 'Why?', choices: ['only one'] })).toEqual({ kind: 'checkpoint', text: 'Why?' });
    expect(parseCheckpoint({ question: 'Pick', choices: ['a', 'b'], correct: 5 })).toMatchObject({ choices: ['a', 'b'], correct: undefined });
    expect(parseCheckpoint({ choices: ['a', 'b'] })).toBeNull();
    expect(parseCheckpoint('hi')).toBeNull();
  });

  it('marks a tapped answer once', () => {
    let state = ask(initialBoardState, { question: 'Q', choices: ['a', 'b'], correct: 1 });
    const id = last(state).id;
    state = boardReducer(state, { type: 'answerCheckpoint', id, chosen: 0 });
    expect(last(state)).toMatchObject({ chosen: 0, result: 'incorrect' });
    const again = boardReducer(state, { type: 'answerCheckpoint', id, chosen: 1 });
    expect(again).toBe(state);
    expect(checkpointScore(state)).toEqual({ correct: 0, answered: 1 });
  });

  it('ignores taps it cannot mark', () => {
    const state = ask(initialBoardState, { question: 'Q', choices: ['a', 'b'] });
    const id = last(state).id;
    expect(boardReducer(state, { type: 'answerCheckpoint', id, chosen: 0 })).toBe(state);
    const marked = ask(initialBoardState, { question: 'Q', choices: ['a', 'b'], correct: 0 });
    expect(boardReducer(marked, { type: 'answerCheckpoint', id: last(marked).id, chosen: 9 })).toBe(marked);
    expect(boardReducer(marked, { type: 'answerCheckpoint', id: 'nope', chosen: 0 })).toBe(marked);
  });

  it('lets the tutor mark a spoken answer on the newest open checkpoint', () => {
    let state = ask(initialBoardState, { question: 'First' });
    state = boardReducer(state, { type: 'markCheckpoint', result: 'incorrect' });
    state = ask(state, { question: 'Second try' });
    state = boardReducer(state, { type: 'markCheckpoint', result: 'correct' });
    expect(state.pages[0].items.map((item) => item.kind === 'checkpoint' && item.result)).toEqual(['incorrect', 'correct']);
    expect(checkpointScore(state)).toEqual({ correct: 1, answered: 2 });
    expect(boardReducer(state, { type: 'markCheckpoint', result: 'correct' })).toBe(state);
    expect(parseCheckpointResult({ result: 'Correct' })).toBe('correct');
    expect(parseCheckpointResult({ result: 'partial' })).toBe('incorrect');
    expect(parseCheckpointResult({ result: 'banana' })).toBeNull();
  });
});

describe('messages to the tutor', () => {
  it('reports a tapped answer, with the right answer only when it was missed', () => {
    const wrong = formatCheckpointResult({ question: 'Q', chosen: '2/6', correct: false, rightAnswer: '3/4' });
    expect(wrong.startsWith('CHECKPOINT_RESULT ')).toBe(true);
    expect(JSON.parse(wrong.slice(18))).toEqual({ question: 'Q', learnerChose: '2/6', correct: false, rightAnswer: '3/4' });
    expect(formatCheckpointResult({ question: 'Q', chosen: '3/4', correct: true, rightAnswer: '3/4' })).not.toContain('rightAnswer');
  });

  it('describes a frame and a typed question compactly', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, kind: 'text', text: 'x'.repeat(500) }));
    const frame = JSON.parse(formatBoardFrame(items).slice('BOARD_FRAME '.length));
    expect(frame.items).toHaveLength(8);
    expect(frame.items[0].text).toHaveLength(120);
    expect(JSON.parse(formatFrameQuestion('  why   is this\n 3/4? ').slice('BOARD_FRAME_QUESTION '.length))).toEqual({ question: 'why is this 3/4?' });
  });

  it('declares every tool the prompt mentions', () => {
    for (const declaration of whiteboardToolDeclarations) {
      expect(isWhiteboardToolName(declaration.name)).toBe(true);
      expect(WHITEBOARD_PROMPT).toContain(declaration.name);
    }
    for (const marker of ['CHECKPOINT_RESULT', 'BOARD_FRAME', 'BOARD_FRAME_QUESTION']) expect(WHITEBOARD_PROMPT).toContain(marker);
  });
});

describe('cropping the framed part', () => {
  it('keeps the crop inside the picture', () => {
    expect(clampCrop({ x: -10, y: 5.5, w: 50.2, h: 20 }, 100, 100)).toEqual({ x: 0, y: 5, w: 51, h: 20 });
    expect(clampCrop({ x: 90, y: 90, w: 50, h: 50 }, 100, 100)).toEqual({ x: 90, y: 90, w: 10, h: 10 });
    expect(clampCrop({ x: 200, y: 0, w: 50, h: 50 }, 100, 100)).toBeNull();
  });

  it('scales large frames down and never scales small ones up', () => {
    expect(cropScale({ x: 0, y: 0, w: 2048, h: 500 })).toBe(0.5);
    expect(cropScale({ x: 0, y: 0, w: 300, h: 200 })).toBe(1);
  });
});
