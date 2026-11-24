/**
 * Whiteboard state for the voice tutor.
 *
 * The Gemini Live tutor calls small board tools (write, highlight, erase, new
 * board) while it talks. Tool arguments come from a model, so everything is
 * read defensively and clamped here before it reaches the screen. The reducer
 * also schedules when each item is drawn, so a burst of writes plays out one
 * after another instead of all at once.
 */

export const BOARD_COLORS = ['ink', 'blue', 'red', 'green', 'orange', 'purple'] as const;
export type BoardColor = (typeof BOARD_COLORS)[number];

/** Diagram shapes live on a 100 x 60 grid, x to the right and y down. */
export const DIAGRAM_WIDTH = 100;
export const DIAGRAM_HEIGHT = 60;

export type BoardShape =
  | { kind: 'line' | 'arrow'; x: number; y: number; x2: number; y2: number; color: BoardColor; text?: string }
  | { kind: 'box'; x: number; y: number; x2: number; y2: number; color: BoardColor; text?: string }
  | { kind: 'circle'; x: number; y: number; r: number; color: BoardColor; text?: string }
  | { kind: 'label'; x: number; y: number; color: BoardColor; text: string };

export type PlotSeries = {
  label?: string;
  color: BoardColor;
  /** A function of x such as "x^2 - 3" or "2*sin(x)". */
  fn?: string;
  /** Explicit points, used when there is no function. */
  points?: Array<[number, number]>;
};

export type BoardItemBody =
  | { kind: 'heading' | 'text' | 'bullet'; text: string; color: BoardColor }
  | { kind: 'formula'; latex: string; color: BoardColor; text?: string }
  | { kind: 'diagram'; shapes: BoardShape[]; text?: string }
  | {
      kind: 'plot';
      xMin: number;
      xMax: number;
      yMin: number;
      yMax: number;
      xLabel?: string;
      yLabel?: string;
      series: PlotSeries[];
      text?: string;
    };

export type BoardItem = BoardItemBody & {
  id: string;
  /** Milliseconds after it was added before drawing starts. */
  delay: number;
  /** How long the drawing takes, in milliseconds. */
  duration: number;
  highlighted?: boolean;
  /** Already on the board when the page was reopened: shown without animation. */
  settled?: boolean;
};

export type BoardPage = { id: string; title: string | null; items: BoardItem[] };

export type BoardState = {
  pages: BoardPage[];
  /** Index of the page on screen. */
  current: number;
  /** Bumps on every change to what is drawn. */
  revision: number;
  /** Epoch ms until which queued drawing is still playing. */
  busyUntil: number;
  nextId: number;
};

export const BOARD_LIMITS = {
  itemsPerCall: 8,
  itemsPerPage: 40,
  pages: 20,
  textChars: 280,
  latexChars: 400,
  shapes: 24,
  series: 3,
  points: 80,
  labelChars: 60,
} as const;

export const initialBoardState: BoardState = {
  pages: [{ id: 'p1', title: null, items: [] }],
  current: 0,
  revision: 0,
  busyUntil: 0,
  nextId: 1,
};

export type BoardAction =
  | { type: 'write'; items: BoardItemBody[]; ids?: Array<string | undefined>; now: number }
  | { type: 'highlight'; target: string }
  | { type: 'erase'; target: string }
  | { type: 'newBoard'; title: string | null }
  | { type: 'goto'; index: number }
  | { type: 'settle' }
  | { type: 'reset' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cleanText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const finite = (value: unknown): number | null => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const asColor = (value: unknown): BoardColor => {
  const name = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (name === 'black' || name === 'white') return 'ink';
  if (name === 'yellow') return 'orange';
  return (BOARD_COLORS as readonly string[]).includes(name) ? (name as BoardColor) : 'ink';
};

function parseShape(raw: unknown): BoardShape | null {
  if (!isRecord(raw)) return null;
  const kind = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : '';
  const color = asColor(raw.color);
  const text = cleanText(raw.text ?? raw.label, BOARD_LIMITS.labelChars) || undefined;
  const x = finite(raw.x);
  const y = finite(raw.y);
  if (x === null || y === null) return null;
  const px = clamp(x, 0, DIAGRAM_WIDTH);
  const py = clamp(y, 0, DIAGRAM_HEIGHT);
  if (kind === 'label' || kind === 'text') {
    return text ? { kind: 'label', x: px, y: py, color, text } : null;
  }
  if (kind === 'circle' || kind === 'ellipse') {
    const r = clamp(finite(raw.r) ?? 6, 1, DIAGRAM_HEIGHT / 2);
    return { kind: 'circle', x: px, y: py, r, color, text };
  }
  if (kind === 'line' || kind === 'arrow' || kind === 'box' || kind === 'rect' || kind === 'rectangle') {
    const x2 = finite(raw.x2);
    const y2 = finite(raw.y2);
    if (x2 === null || y2 === null) return null;
    const qx = clamp(x2, 0, DIAGRAM_WIDTH);
    const qy = clamp(y2, 0, DIAGRAM_HEIGHT);
    if (kind === 'line' || kind === 'arrow') return { kind, x: px, y: py, x2: qx, y2: qy, color, text };
    return { kind: 'box', x: Math.min(px, qx), y: Math.min(py, qy), x2: Math.max(px, qx), y2: Math.max(py, qy), color, text };
  }
  return null;
}

function parseSeries(raw: unknown): PlotSeries | null {
  if (!isRecord(raw)) return null;
  const color = asColor(raw.color ?? 'blue');
  const label = cleanText(raw.label, BOARD_LIMITS.labelChars) || undefined;
  const fn = cleanText(raw.fn ?? raw.expression, 120) || undefined;
  const points: Array<[number, number]> = [];
  if (Array.isArray(raw.points)) {
    for (const point of raw.points.slice(0, BOARD_LIMITS.points)) {
      const px = Array.isArray(point) ? finite(point[0]) : isRecord(point) ? finite(point.x) : null;
      const py = Array.isArray(point) ? finite(point[1]) : isRecord(point) ? finite(point.y) : null;
      if (px !== null && py !== null) points.push([px, py]);
    }
  }
  if (!fn && points.length < 2) return null;
  return { label, color, fn, points: points.length >= 2 ? points : undefined };
}

function parseItem(raw: unknown): BoardItemBody | null {
  if (!isRecord(raw)) return null;
  const kind = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : '';
  const color = asColor(raw.color);
  const text = cleanText(raw.text, BOARD_LIMITS.textChars);
  if (kind === 'heading' || kind === 'title' || kind === 'text' || kind === 'bullet') {
    if (!text) return null;
    return { kind: kind === 'title' ? 'heading' : kind, text, color };
  }
  if (kind === 'formula' || kind === 'equation' || kind === 'math') {
    const latex = typeof raw.latex === 'string' ? raw.latex.trim().slice(0, BOARD_LIMITS.latexChars) : '';
    if (!latex) return text ? { kind: 'text', text, color } : null;
    return { kind: 'formula', latex, color, text: text || undefined };
  }
  if (kind === 'diagram' || kind === 'drawing') {
    const shapes = (Array.isArray(raw.shapes) ? raw.shapes : [])
      .slice(0, BOARD_LIMITS.shapes)
      .map(parseShape)
      .filter((shape): shape is BoardShape => shape !== null);
    if (shapes.length === 0) return null;
    return { kind: 'diagram', shapes, text: text || undefined };
  }
  if (kind === 'plot' || kind === 'graph' || kind === 'chart') {
    const series = (Array.isArray(raw.series) ? raw.series : [])
      .slice(0, BOARD_LIMITS.series)
      .map(parseSeries)
      .filter((entry): entry is PlotSeries => entry !== null);
    if (series.length === 0) return null;
    let xMin = finite(raw.xMin) ?? -5;
    let xMax = finite(raw.xMax) ?? 5;
    let yMin = finite(raw.yMin) ?? -5;
    let yMax = finite(raw.yMax) ?? 5;
    if (xMax <= xMin) [xMin, xMax] = [-5, 5];
    if (yMax <= yMin) [yMin, yMax] = [-5, 5];
    return {
      kind: 'plot',
      xMin,
      xMax,
      yMin,
      yMax,
      xLabel: cleanText(raw.xLabel, 30) || undefined,
      yLabel: cleanText(raw.yLabel, 30) || undefined,
      series,
      text: text || undefined,
    };
  }
  return null;
}

/** Reads `write_on_board` arguments. Anything unusable is dropped rather than shown broken. */
export function parseBoardItems(args: unknown): { items: BoardItemBody[]; ids: Array<string | undefined> } {
  const list = isRecord(args) && Array.isArray(args.items) ? args.items : isRecord(args) && args.kind ? [args] : [];
  const items: BoardItemBody[] = [];
  const ids: Array<string | undefined> = [];
  for (const raw of list.slice(0, BOARD_LIMITS.itemsPerCall)) {
    const item = parseItem(raw);
    if (!item) continue;
    items.push(item);
    const id = isRecord(raw) ? cleanText(raw.id, 24).replace(/[^a-zA-Z0-9_-]/g, '') : '';
    ids.push(id || undefined);
  }
  return { items, ids };
}

export function parseBoardTarget(args: unknown): string {
  if (!isRecord(args)) return '';
  return cleanText(args.target ?? args.id ?? args.text, BOARD_LIMITS.textChars);
}

export function parseBoardTitle(args: unknown): string | null {
  return (isRecord(args) && cleanText(args.title, 80)) || null;
}

/** How long an item takes to draw, roughly matching the time it takes to say it. */
export function drawDuration(item: BoardItemBody): number {
  switch (item.kind) {
    case 'heading':
    case 'text':
    case 'bullet':
      return clamp(item.text.length * 45, 400, 3500);
    case 'formula':
      return clamp(item.latex.length * 40, 700, 2200);
    case 'diagram':
      return clamp(item.shapes.length * 450, 600, 5000);
    case 'plot':
      return 1200 + item.series.length * 800;
  }
}

/** Text used to find an item when the tutor names it instead of giving its id. */
export function itemSearchText(item: BoardItemBody): string {
  const parts: string[] = [];
  if ('text' in item && item.text) parts.push(item.text);
  if (item.kind === 'formula') parts.push(item.latex);
  if (item.kind === 'diagram') for (const shape of item.shapes) if (shape.text) parts.push(shape.text);
  if (item.kind === 'plot') for (const series of item.series) parts.push(series.label ?? '', series.fn ?? '');
  return parts.join(' ').toLowerCase();
}

/** Finds an item by id first, then by the words it contains. Newest match wins. */
export function findBoardItem(items: BoardItem[], target: string): BoardItem | null {
  const needle = target.trim().toLowerCase();
  if (!needle) return null;
  const byId = items.find((item) => item.id.toLowerCase() === needle);
  if (byId) return byId;
  for (let i = items.length - 1; i >= 0; i--) {
    if (itemSearchText(items[i]).includes(needle)) return items[i];
  }
  return null;
}

const settle = (page: BoardPage): BoardPage => ({
  ...page,
  items: page.items.map((item) => (item.settled ? item : { ...item, settled: true })),
});

const replaceLastPage = (state: BoardState, page: BoardPage): BoardPage[] => [...state.pages.slice(0, -1), page];

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'write': {
      if (action.items.length === 0) return state;
      const page = state.pages[state.pages.length - 1];
      const taken = new Set(page.items.map((item) => item.id));
      let nextId = state.nextId;
      let cursor = Math.max(action.now, state.busyUntil);
      const added: BoardItem[] = action.items.map((body, index) => {
        const wanted = action.ids?.[index];
        let id = wanted && !taken.has(wanted) ? wanted : '';
        while (!id || taken.has(id)) id = `b${nextId++}`;
        taken.add(id);
        const duration = drawDuration(body);
        const item: BoardItem = { ...body, id, delay: cursor - action.now, duration };
        cursor += duration + 150;
        return item;
      });
      // Keep the page a readable length: the oldest lines scroll off first.
      const items = [...page.items, ...added].slice(-BOARD_LIMITS.itemsPerPage);
      return {
        ...state,
        pages: replaceLastPage(state, { ...page, items }),
        current: state.pages.length - 1,
        revision: state.revision + 1,
        busyUntil: cursor,
        nextId,
      };
    }
    case 'highlight': {
      const page = state.pages[state.pages.length - 1];
      const found = findBoardItem(page.items, action.target);
      if (!found) return state;
      const items = page.items.map((item) =>
        item.id === found.id ? { ...item, highlighted: true } : item.highlighted ? { ...item, highlighted: false } : item,
      );
      return {
        ...state,
        pages: replaceLastPage(state, { ...page, items }),
        current: state.pages.length - 1,
        revision: state.revision + 1,
      };
    }
    case 'erase': {
      const page = state.pages[state.pages.length - 1];
      const found = findBoardItem(page.items, action.target);
      if (!found) return state;
      return {
        ...state,
        pages: replaceLastPage(state, { ...page, items: page.items.filter((item) => item.id !== found.id) }),
        current: state.pages.length - 1,
        revision: state.revision + 1,
      };
    }
    case 'newBoard': {
      const last = state.pages[state.pages.length - 1];
      // An untouched board just takes the title instead of leaving a blank page behind.
      if (last.items.length === 0) {
        return { ...state, pages: replaceLastPage(state, { ...last, title: action.title }), current: state.pages.length - 1, revision: state.revision + 1 };
      }
      const pages = [...state.pages.map(settle), { id: `p${state.nextId}`, title: action.title, items: [] }].slice(-BOARD_LIMITS.pages);
      return { ...state, pages, current: pages.length - 1, revision: state.revision + 1, busyUntil: 0, nextId: state.nextId + 1 };
    }
    case 'goto': {
      const index = clamp(Math.round(action.index), 0, state.pages.length - 1);
      if (index === state.current) return state;
      // Reopened pages show finished work instead of replaying the drawing.
      return { ...state, pages: state.pages.map(settle), current: index };
    }
    case 'settle': {
      // The board left the screen (the learner opened an activity). When it
      // comes back it shows finished work instead of replaying the drawing.
      if (state.pages.every((page) => page.items.every((item) => item.settled))) return state;
      return { ...state, pages: state.pages.map(settle), busyUntil: 0 };
    }
    case 'reset':
      return initialBoardState;
  }
}
