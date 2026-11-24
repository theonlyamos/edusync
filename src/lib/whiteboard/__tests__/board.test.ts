import { describe, expect, it } from 'vitest';
import {
  BOARD_LIMITS,
  boardReducer,
  findBoardItem,
  initialBoardState,
  parseBoardItems,
  parseBoardTarget,
  parseBoardTitle,
  type BoardItemBody,
  type BoardState,
} from '../board';

const text = (value: string): BoardItemBody => ({ kind: 'text', text: value, color: 'ink' });
const write = (state: BoardState, items: BoardItemBody[], now = 1000, ids?: Array<string | undefined>) =>
  boardReducer(state, { type: 'write', items, ids, now });

describe('reading write_on_board arguments', () => {
  it('keeps well-formed items and drops anything it cannot draw', () => {
    const { items, ids } = parseBoardItems({
      items: [
        { kind: 'heading', text: '  Pythagoras   theorem ', id: 'title!' },
        { kind: 'formula', latex: 'a^2+b^2=c^2', color: 'blue' },
        { kind: 'text' },
        { kind: 'video', text: 'nope' },
        'not an item',
        { kind: 'diagram', shapes: [{ kind: 'arrow', x: 10, y: 10, x2: 50, y2: 10, text: 'force' }, { kind: 'box', x: 5 }] },
      ],
    });
    expect(items.map((item) => item.kind)).toEqual(['heading', 'formula', 'diagram']);
    expect(items[0]).toMatchObject({ text: 'Pythagoras theorem', color: 'ink' });
    expect(items[1]).toMatchObject({ latex: 'a^2+b^2=c^2', color: 'blue' });
    expect(items[2]).toMatchObject({ shapes: [{ kind: 'arrow', text: 'force' }] });
    expect(ids).toEqual(['title', undefined, undefined]);
  });

  it('clamps shapes to the grid and orders box corners', () => {
    const { items } = parseBoardItems({
      items: [{ kind: 'diagram', shapes: [
        { kind: 'box', x: 80, y: 50, x2: -20, y2: 10 },
        { kind: 'circle', x: 500, y: 30, r: 900 },
        { kind: 'label', x: 10, y: 10 },
      ] }],
    });
    expect(items[0]).toMatchObject({ shapes: [
      { kind: 'box', x: 0, y: 10, x2: 80, y2: 50 },
      { kind: 'circle', x: 100, y: 30, r: 30 },
    ] });
  });

  it('limits how much one call and one line can add', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ kind: 'text', text: `line ${i} ${'x'.repeat(1000)}` }));
    const { items } = parseBoardItems({ items: many });
    expect(items).toHaveLength(BOARD_LIMITS.itemsPerCall);
    expect((items[0] as { text: string }).text.length).toBe(BOARD_LIMITS.textChars);
  });

  it('reads plots, fixes a reversed range and needs a curve', () => {
    const { items } = parseBoardItems({ items: [
      { kind: 'plot', xMin: 4, xMax: -4, yMin: 0, yMax: 16, series: [{ fn: 'x^2', label: 'y = x²' }, { points: [[0, 0]] }] },
      { kind: 'plot', series: [] },
    ] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'plot', xMin: -5, xMax: 5, yMin: 0, yMax: 16, series: [{ fn: 'x^2', color: 'blue' }] });
  });

  it('accepts a single item passed without the items list, and falls back for unknown colours', () => {
    const { items } = parseBoardItems({ kind: 'bullet', text: 'Speed = distance / time', color: 'magenta' });
    expect(items).toEqual([{ kind: 'bullet', text: 'Speed = distance / time', color: 'ink' }]);
  });

  it('returns nothing for junk', () => {
    expect(parseBoardItems(null).items).toEqual([]);
    expect(parseBoardItems('draw a cat').items).toEqual([]);
    expect(parseBoardTarget({ nope: 1 })).toBe('');
    expect(parseBoardTitle({})).toBeNull();
    expect(parseBoardTitle({ title: ' Worked example ' })).toBe('Worked example');
  });
});

describe('board state', () => {
  it('queues drawing so items appear one after another', () => {
    let state = write(initialBoardState, [text('First line of the board'), text('Second')]);
    const [first, second] = state.pages[0].items;
    expect(first.delay).toBe(0);
    expect(second.delay).toBeGreaterThanOrEqual(first.duration);
    // A write that lands while the pen is busy waits its turn.
    state = write(state, [text('Third')], 1100);
    const third = state.pages[0].items[2];
    expect(1100 + third.delay).toBe(1000 + second.delay + second.duration + 150);
    // Once the pen is idle, new writing starts straight away.
    state = write(state, [text('Later')], state.busyUntil + 5000);
    expect(state.pages[0].items[3].delay).toBe(0);
  });

  it('uses the tutor\'s ids when they are free and its own otherwise', () => {
    let state = write(initialBoardState, [text('a'), text('b')], 0, ['rule', 'rule']);
    expect(state.pages[0].items.map((item) => item.id)).toEqual(['rule', 'b1']);
    state = write(state, [text('c')], 0, ['b1']);
    expect(new Set(state.pages[0].items.map((item) => item.id)).size).toBe(3);
  });

  it('highlights one item at a time, by id or by its words', () => {
    let state = write(initialBoardState, [text('Area of a circle'), { kind: 'formula', latex: 'A = \\pi r^2', color: 'ink' }], 0, ['title', undefined]);
    state = boardReducer(state, { type: 'highlight', target: 'TITLE' });
    expect(state.pages[0].items.map((item) => Boolean(item.highlighted))).toEqual([true, false]);
    state = boardReducer(state, { type: 'highlight', target: 'pi r^2' });
    expect(state.pages[0].items.map((item) => Boolean(item.highlighted))).toEqual([false, true]);
    const before = state;
    expect(boardReducer(state, { type: 'highlight', target: 'not on the board' })).toBe(before);
  });

  it('erases the newest match', () => {
    let state = write(initialBoardState, [text('x = 3'), text('so x = 4')]);
    state = boardReducer(state, { type: 'erase', target: 'x =' });
    expect(state.pages[0].items.map((item) => (item as { text: string }).text)).toEqual(['x = 3']);
    expect(findBoardItem(state.pages[0].items, '')).toBeNull();
  });

  it('starts a new board, keeps the old one to page back to, and does not replay it', () => {
    let state = write(initialBoardState, [text('Old idea')]);
    state = boardReducer(state, { type: 'newBoard', title: 'Next idea' });
    expect(state.pages).toHaveLength(2);
    expect(state.current).toBe(1);
    expect(state.pages[0].items[0].settled).toBe(true);
    state = boardReducer(state, { type: 'goto', index: 0 });
    expect(state.current).toBe(0);
    state = boardReducer(state, { type: 'goto', index: 99 });
    expect(state.current).toBe(1);
    // Writing always lands on, and returns to, the newest board.
    state = boardReducer(state, { type: 'goto', index: 0 });
    state = write(state, [text('New line')]);
    expect(state.current).toBe(1);
    expect(state.pages[1].items).toHaveLength(1);
  });

  it('titles an empty board instead of leaving a blank page behind', () => {
    const state = boardReducer(initialBoardState, { type: 'newBoard', title: 'Fractions' });
    expect(state.pages).toHaveLength(1);
    expect(state.pages[0].title).toBe('Fractions');
  });

  it('caps the length of a board and the number of boards', () => {
    let state = initialBoardState;
    for (let i = 0; i < 12; i++) state = write(state, Array.from({ length: 8 }, (_, j) => text(`line ${i}-${j}`)), i * 10);
    expect(state.pages[0].items).toHaveLength(BOARD_LIMITS.itemsPerPage);
    expect((state.pages[0].items.at(-1) as { text: string }).text).toBe('line 11-7');
    for (let i = 0; i < 30; i++) {
      state = boardReducer(state, { type: 'newBoard', title: `Board ${i}` });
      state = write(state, [text('x')]);
    }
    expect(state.pages).toHaveLength(BOARD_LIMITS.pages);
    expect(state.current).toBe(BOARD_LIMITS.pages - 1);
  });

  it('ignores an empty write and resets cleanly', () => {
    expect(write(initialBoardState, [])).toBe(initialBoardState);
    const state = write(initialBoardState, [text('x')]);
    expect(boardReducer(state, { type: 'reset' })).toBe(initialBoardState);
  });
});
