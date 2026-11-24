import { describe, expect, it } from 'vitest';
import { BOARD_LIMITS, boardReducer, collectReviewCards, initialBoardState, lessonNotes, parseBoardItems, parseCheckpoint, parseReviewCards, type BoardItemBody, type BoardState } from '../board';
import { formatLearnerPhoto, isWhiteboardToolName } from '../board-tools';
import { fitWithin } from '../capture';

const write = (state: BoardState, items: BoardItemBody[]) =>
  boardReducer(state, { type: 'write', items, now: 1000 });

describe('review cards', () => {
  it('reads cards and drops ones missing a side', () => {
    expect(parseReviewCards({ cards: [{ front: ' What is 1/2 + 1/4? ', back: '3/4' }, { front: 'No answer' }, 'junk'] })).toEqual([
      { front: 'What is 1/2 + 1/4?', back: '3/4' },
    ]);
    expect(parseReviewCards({ question: 'Q', answer: 'A' })).toEqual([{ front: 'Q', back: 'A' }]);
    expect(parseReviewCards(null)).toEqual([]);
  });

  it('limits how many cards one call and one lesson can add', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ front: `Q${i}`, back: 'A' }));
    expect(parseReviewCards({ cards: many })).toHaveLength(BOARD_LIMITS.cardsPerCall);
    let state = initialBoardState;
    for (let i = 0; i < 30; i++) state = boardReducer(state, { type: 'addCards', cards: [{ front: `Q${i}`, back: 'A' }] });
    expect(state.cards).toHaveLength(BOARD_LIMITS.cards);
  });

  it('keeps a repeated question once', () => {
    let state = boardReducer(initialBoardState, { type: 'addCards', cards: [{ front: 'What is a half?', back: '1/2' }] });
    const again = boardReducer(state, { type: 'addCards', cards: [{ front: 'what is a HALF?', back: 'one of two equal parts' }] });
    expect(again).toBe(state);
    state = boardReducer(state, { type: 'addCards', cards: [{ front: 'New', back: 'Card' }] });
    expect(state.cards.map((card) => card.front)).toEqual(['What is a half?', 'New']);
  });

  it('adds tap-to-answer checkpoints with their right answer', () => {
    let state = boardReducer(initialBoardState, { type: 'addCards', cards: [{ front: 'Saved by the tutor', back: 'Yes' }] });
    state = write(state, [parseCheckpoint({ question: 'What is 1/2 + 1/4?', choices: ['2/6', '3/4'], correct: 1 })!]);
    state = write(state, [parseCheckpoint({ question: 'Spoken only?' })!]);
    expect(collectReviewCards(state)).toEqual([
      { front: 'Saved by the tutor', back: 'Yes' },
      { front: 'What is 1/2 + 1/4?', back: '3/4' },
    ]);
  });

  it('is cleared with the board', () => {
    const state = boardReducer(initialBoardState, { type: 'addCards', cards: [{ front: 'Q', back: 'A' }] });
    expect(boardReducer(state, { type: 'reset' }).cards).toEqual([]);
  });
});

describe('lesson notes', () => {
  it('is empty when nothing was written', () => {
    expect(lessonNotes(initialBoardState)).toBeNull();
  });

  it('keeps written boards, finished and without empty pages', () => {
    let state = write(initialBoardState, parseBoardItems({ items: [{ kind: 'heading', text: 'Fractions' }] }).items);
    state = boardReducer(state, { type: 'newBoard', title: 'Practice' });
    state = boardReducer(state, { type: 'newBoard', title: 'Unused' });
    state = boardReducer(state, { type: 'goto', index: 1 });
    state = write(state, [parseCheckpoint({ question: 'Half of 8?', choices: ['4', '2'], correct: 0 })!]);
    // Writing always lands on the newest board, so the middle one stays empty.
    const notes = lessonNotes(state)!;
    expect(notes.pages.map((page) => page.title)).toEqual([null, 'Unused']);
    expect(notes.pages.every((page) => page.items.every((item) => item.settled))).toBe(true);
    expect(notes.cards).toEqual([{ front: 'Half of 8?', back: '4' }]);
    expect(notes.score).toEqual({ correct: 0, answered: 0 });
  });

  it('exists when the tutor only saved cards', () => {
    const state = boardReducer(initialBoardState, { type: 'addCards', cards: [{ front: 'Q', back: 'A' }] });
    expect(lessonNotes(state)).toMatchObject({ pages: [], cards: [{ front: 'Q', back: 'A' }] });
  });
});

describe('learner photos', () => {
  it('cannot be written by the tutor', () => {
    expect(parseBoardItems({ items: [{ kind: 'photo', src: 'https://example.com/x.png', text: 'hi' }] }).items).toEqual([]);
  });

  it('tells the tutor with a system message and has a tool name of its own for cards', () => {
    expect(formatLearnerPhoto()).toMatch(/^LEARNER_PHOTO \{/);
    expect(isWhiteboardToolName('save_review_cards')).toBe(true);
  });

  it('shrinks large photos and leaves small ones alone', () => {
    expect(fitWithin(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(600, 400, 1280)).toEqual({ width: 600, height: 400 });
    expect(fitWithin(0, 0, 1280)).toEqual({ width: 1, height: 1 });
  });
});
