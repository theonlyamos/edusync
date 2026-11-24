import { describe, expect, it } from 'vitest';
import { BOARD_LIMITS, boardReducer, collectReviewCards, initialBoardState, lessonNotes, notesWithoutPhotos, parseBoardItems, parseCheckpoint, parseReviewCards, sanitizeLessonNotes, type BoardItemBody, type BoardState } from '../board';
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

describe('stored lesson notes', () => {
  const build = () => {
    let state = write(initialBoardState, parseBoardItems({ items: [{ kind: 'heading', text: 'Fractions', id: 'title' }, { kind: 'formula', latex: 'a/b' }] }).items);
    state = write(state, [parseCheckpoint({ question: 'Half of 8?', choices: ['4', '2'], correct: 0 })!]);
    const checkpoint = state.pages[0].items[2];
    state = boardReducer(state, { type: 'answerCheckpoint', id: checkpoint.id, chosen: 1 });
    state = write(state, [{ kind: 'photo', src: 'data:image/jpeg;base64,AAAA', text: 'Your photo' }]);
    return boardReducer(state, { type: 'addCards', cards: [{ front: 'Q', back: 'A' }] });
  };

  it('leaves photos out', () => {
    const notes = notesWithoutPhotos(lessonNotes(build())!);
    expect(notes.pages[0].items.map((item) => item.kind)).toEqual(['heading', 'formula', 'checkpoint']);
  });

  it('survives a round trip through JSON with the score recomputed', () => {
    const saved = lessonNotes(build())!;
    const back = sanitizeLessonNotes(JSON.parse(JSON.stringify({ ...saved, score: { correct: 99, answered: 99 } })))!;
    expect(back.pages[0].items.map((item) => item.kind)).toEqual(['heading', 'formula', 'checkpoint']);
    expect(back.pages[0].items.every((item) => item.settled && item.delay === 0)).toBe(true);
    expect(back.pages[0].items[2]).toMatchObject({ kind: 'checkpoint', chosen: 1, result: 'incorrect', correct: 0 });
    expect(back.score).toEqual({ correct: 0, answered: 1 });
    expect(back.cards).toEqual([{ front: 'Q', back: 'A' }, { front: 'Half of 8?', back: '4' }]);
  });

  it('drops anything it does not recognise and caps sizes', () => {
    const long = 'x'.repeat(5000);
    const notes = sanitizeLessonNotes({
      pages: [
        { title: long, items: [{ kind: 'text', text: long }, { kind: 'photo', src: 'https://example.com/a.png' }, { kind: 'script', text: 'no' }, null, { kind: 'checkpoint', text: 'Q?', result: 'maybe', chosen: 7 }] },
        { items: [{ kind: 'photo', src: 'x' }] },
        'junk',
        ...Array.from({ length: 40 }, () => ({ items: [{ kind: 'text', text: 'page' }] })),
      ],
      cards: [...Array.from({ length: 40 }, (_, i) => ({ front: `Q${i}`, back: 'A' })), { front: 'no back' }],
    })!;
    expect(notes.pages.length).toBeLessThanOrEqual(BOARD_LIMITS.pages);
    expect(notes.pages[0].title).toHaveLength(80);
    expect(notes.pages[0].items).toHaveLength(2);
    expect(notes.pages[0].items[0]).toMatchObject({ kind: 'text' });
    expect((notes.pages[0].items[0] as { text: string }).text).toHaveLength(BOARD_LIMITS.textChars);
    expect(notes.pages[0].items[1]).not.toHaveProperty('result');
    expect(notes.pages[0].items[1]).not.toHaveProperty('chosen');
    expect(notes.cards).toHaveLength(BOARD_LIMITS.cards);
  });

  it('is null for junk or empty notes', () => {
    expect(sanitizeLessonNotes(null)).toBeNull();
    expect(sanitizeLessonNotes('notes')).toBeNull();
    expect(sanitizeLessonNotes({ pages: [{ items: [] }], cards: [] })).toBeNull();
  });
});
