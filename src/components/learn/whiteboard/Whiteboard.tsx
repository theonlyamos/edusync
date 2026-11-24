'use client';

import { createContext, memo, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { Patrick_Hand } from 'next/font/google';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Check, ChevronLeft, ChevronRight, CircleHelp, PenLine, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DIAGRAM_HEIGHT,
  DIAGRAM_WIDTH,
  type BoardColor,
  type BoardItem,
  type BoardShape,
  type BoardState,
  checkpointScore,
  itemSearchText,
} from '@/lib/whiteboard/board';
import type { FramedItem } from '@/lib/whiteboard/board-tools';
import { compileExpression, sampleFunction } from '@/lib/whiteboard/expression';
import {
  PLOT_AREA,
  arrowHead,
  formatTick,
  niceTicks,
  plotScale,
  seededRandom,
  smoothPath,
  wobblyBox,
  wobblyCircle,
  wobblyLine,
} from '@/lib/whiteboard/sketch';
import './whiteboard.css';

const hand = Patrick_Hand({ weight: '400', subsets: ['latin'], display: 'swap' });

const ink = (color: BoardColor) => `var(--wb-${color})`;

/**
 * The same pens as whiteboard.css, as plain colours. Drawings use these and
 * plain SVG attributes instead of CSS variables and classes, because the
 * pictures of the board sent to the tutor copy SVG markup without page styles.
 */
type Pens = Record<BoardColor | 'paper', string>;
const LIGHT_PENS: Pens = { paper: '#fdfcf7', ink: '#1f2937', blue: '#1d4ed8', red: '#dc2626', green: '#15803d', orange: '#c2410c', purple: '#7e22ce' };
const DARK_PENS: Pens = { paper: '#18222d', ink: '#f1f5f9', blue: '#93c5fd', red: '#fca5a5', green: '#86efac', orange: '#fdba74', purple: '#d8b4fe' };
const PensContext = createContext<Pens>(LIGHT_PENS);
const usePens = () => useContext(PensContext);

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
const isDarkNow = () => document.documentElement.classList.contains('dark');
const isDarkOnServer = () => false;

const STROKE_ATTRS = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', pathLength: 1 } as const;

/** Animation timing is passed to CSS through custom properties. */
const timing = (delay: number, duration?: number): CSSProperties =>
  ({ '--wb-delay': `${Math.round(delay)}ms`, ...(duration ? { '--wb-dur': `${Math.round(duration)}ms` } : {}) }) as CSSProperties;

function Words({ text, delay, duration }: { text: string; delay: number; duration: number }) {
  const words = text.split(' ');
  const step = duration / Math.max(1, words.length);
  return (
    <>
      {words.map((word, index) => (
        <span key={index} className="wb-word" style={timing(delay + index * step)}>
          {word}{index < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

function Caption({ text, delay }: { text?: string; delay: number }) {
  if (!text) return null;
  return (
    <p className="wb-fade mt-1 text-center text-lg leading-snug opacity-80 sm:text-xl" style={timing(delay)}>
      {text}
    </p>
  );
}

function Formula({ item }: { item: Extract<BoardItem, { kind: 'formula' }> }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(item.latex, { displayMode: true, throwOnError: false, strict: 'ignore', trust: false, maxExpand: 200, maxSize: 20 });
    } catch {
      return null;
    }
  }, [item.latex]);
  return (
    <div style={{ color: ink(item.color) }}>
      <div className="wb-wipe max-w-full overflow-x-auto overflow-y-hidden py-1 text-xl sm:text-2xl" style={timing(item.delay, item.duration)}>
        {html
          ? <div dangerouslySetInnerHTML={{ __html: html }} />
          : <p className="text-center">{item.latex}</p>}
      </div>
      <Caption text={item.text} delay={item.delay + item.duration} />
    </div>
  );
}

const LABEL_SIZE = 4.2;

/** Space kept clear under the item being written (captions sit over the bottom of the board). */
const FOLLOW_MARGIN_PX = 96;

function ShapeLabel({ x, y, text, color, delay }: { x: number; y: number; text: string; color: BoardColor; delay: number }) {
  const pens = usePens();
  return (
    <text
      className="wb-fade wb-label"
      style={timing(delay)}
      x={Math.min(DIAGRAM_WIDTH - 2, Math.max(2, x))}
      y={Math.min(DIAGRAM_HEIGHT - 1.5, Math.max(LABEL_SIZE, y))}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={LABEL_SIZE}
      fill={pens[color]}
      stroke={pens.paper}
      strokeWidth={0.9}
      paintOrder="stroke"
    >
      {text}
    </text>
  );
}

function Shape({ shape, seed, delay, duration }: { shape: BoardShape; seed: string; delay: number; duration: number }) {
  const pens = usePens();
  const rand = seededRandom(seed);
  const stroke = { ...STROKE_ATTRS, stroke: pens[shape.color], strokeWidth: 0.55 };
  if (shape.kind === 'label') {
    return <ShapeLabel x={shape.x} y={shape.y} text={shape.text} color={shape.color} delay={delay} />;
  }
  if (shape.kind === 'circle') {
    return (
      <g>
        <path className="wb-stroke" style={timing(delay, duration)} d={wobblyCircle(shape.x, shape.y, shape.r, rand)} {...stroke} />
        {shape.text && <ShapeLabel x={shape.x} y={shape.y} text={shape.text} color={shape.color} delay={delay + duration * 0.6} />}
      </g>
    );
  }
  if (shape.kind === 'box') {
    return (
      <g>
        <path className="wb-stroke" style={timing(delay, duration)} d={wobblyBox(shape.x, shape.y, shape.x2, shape.y2, rand)} {...stroke} />
        {shape.text && <ShapeLabel x={(shape.x + shape.x2) / 2} y={(shape.y + shape.y2) / 2} text={shape.text} color={shape.color} delay={delay + duration * 0.6} />}
      </g>
    );
  }
  const lineTime = shape.kind === 'arrow' ? duration * 0.7 : duration;
  // Labels sit just off the line, on the side away from its direction of travel.
  const length = Math.hypot(shape.x2 - shape.x, shape.y2 - shape.y) || 1;
  const offX = (-(shape.y2 - shape.y) / length) * 3.2;
  const offY = ((shape.x2 - shape.x) / length) * 3.2;
  const flip = offY > 0 ? -1 : 1;
  return (
    <g>
      <path className="wb-stroke" style={timing(delay, lineTime)} d={wobblyLine(shape.x, shape.y, shape.x2, shape.y2, rand)} {...stroke} />
      {shape.kind === 'arrow' && (
        <path className="wb-stroke" style={timing(delay + lineTime, duration * 0.3)} d={arrowHead(shape.x, shape.y, shape.x2, shape.y2)} {...stroke} />
      )}
      {shape.text && (
        <ShapeLabel
          x={(shape.x + shape.x2) / 2 + offX * flip}
          y={(shape.y + shape.y2) / 2 + offY * flip}
          text={shape.text}
          color={shape.color}
          delay={delay + duration * 0.6}
        />
      )}
    </g>
  );
}

function describeDiagram(item: Extract<BoardItem, { kind: 'diagram' }>): string {
  const labels = item.shapes.map((shape) => shape.text).filter(Boolean);
  return [item.text, labels.length ? `Labels: ${labels.join(', ')}` : ''].filter(Boolean).join('. ') || 'Sketch';
}

function Diagram({ item }: { item: Extract<BoardItem, { kind: 'diagram' }> }) {
  const step = item.duration / item.shapes.length;
  return (
    <div>
      <svg
        viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`}
        className="mx-auto block w-full max-w-2xl"
        role="img"
        aria-label={describeDiagram(item)}
        style={{ fontFamily: 'inherit' }}
      >
        {item.shapes.map((shape, index) => (
          <Shape key={index} shape={shape} seed={`${item.id}:${index}`} delay={item.delay + index * step} duration={step * 0.9} />
        ))}
      </svg>
      <Caption text={item.text} delay={item.delay + item.duration} />
    </div>
  );
}

function Plot({ item }: { item: Extract<BoardItem, { kind: 'plot' }> }) {
  const { xMin, xMax, yMin, yMax } = item;
  const scale = plotScale(xMin, xMax, yMin, yMax);
  const curves = useMemo(() => item.series.map((series) => {
    const s = plotScale(xMin, xMax, yMin, yMax);
    const fn = series.fn ? compileExpression(series.fn) : null;
    const runs = fn
      ? sampleFunction(fn, xMin, xMax, yMin, yMax)
      : series.points ? [series.points] : [];
    return runs.map((run) => smoothPath(run.map(([x, y]) => [s.x(x), s.y(y)] as [number, number])));
  }), [item.series, xMin, xMax, yMin, yMax]);

  // Axes run through zero when zero is in view, otherwise along the edge.
  const axisY = scale.y(Math.min(yMax, Math.max(yMin, 0)));
  const axisX = scale.x(Math.min(xMax, Math.max(xMin, 0)));
  const rand = seededRandom(item.id);
  const axisTime = 500;
  const curveTime = (item.duration - axisTime) / Math.max(1, item.series.length);
  const pens = usePens();
  const stroke = { ...STROKE_ATTRS, strokeWidth: 0.45 };
  const clipId = `wb-clip-${item.id}`;
  const summary = [item.text, ...item.series.map((series) => series.label || series.fn || 'data')].filter(Boolean).join(', ');

  return (
    <div>
      <svg viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`} className="mx-auto block w-full max-w-2xl" role="img" aria-label={`Graph: ${summary}`} style={{ fontFamily: 'inherit' }}>
        <defs>
          <clipPath id={clipId}>
            <rect x={PLOT_AREA.left} y={PLOT_AREA.top - 1} width={PLOT_AREA.right - PLOT_AREA.left} height={PLOT_AREA.bottom - PLOT_AREA.top + 2} />
          </clipPath>
        </defs>
        <path className="wb-stroke" style={timing(item.delay, axisTime)} stroke={pens.ink} d={wobblyLine(PLOT_AREA.left, axisY, PLOT_AREA.right, axisY, rand)} {...stroke} />
        <path className="wb-stroke" style={timing(item.delay, axisTime)} stroke={pens.ink} d={wobblyLine(axisX, PLOT_AREA.bottom, axisX, PLOT_AREA.top, rand)} {...stroke} />
        <g className="wb-fade wb-tick" style={timing(item.delay + axisTime * 0.6)} fill={pens.ink} fontSize={2.8} opacity={0.75}>
          {niceTicks(xMin, xMax).map((tick) => (
            <g key={`x${tick}`}>
              <line x1={scale.x(tick)} x2={scale.x(tick)} y1={axisY - 0.8} y2={axisY + 0.8} stroke={pens.ink} strokeWidth={0.3} />
              {tick !== 0 && <text x={scale.x(tick)} y={Math.min(DIAGRAM_HEIGHT - 5, axisY + 3.6)} textAnchor="middle">{formatTick(tick)}</text>}
            </g>
          ))}
          {niceTicks(yMin, yMax).map((tick) => (
            <g key={`y${tick}`}>
              <line x1={axisX - 0.8} x2={axisX + 0.8} y1={scale.y(tick)} y2={scale.y(tick)} stroke={pens.ink} strokeWidth={0.3} />
              {tick !== 0 && <text x={Math.max(6, axisX - 1.6)} y={scale.y(tick) + 1} textAnchor="end">{formatTick(tick)}</text>}
            </g>
          ))}
          {item.xLabel && <text x={PLOT_AREA.right} y={DIAGRAM_HEIGHT - 1.2} textAnchor="end" className="wb-axis-label" fontSize={3.4}>{item.xLabel}</text>}
          {item.yLabel && <text x={1} y={3.6} className="wb-axis-label" fontSize={3.4}>{item.yLabel}</text>}
        </g>
        <g clipPath={`url(#${clipId})`}>
          {curves.map((paths, index) => paths.map((d, part) => (
            <path
              key={`${index}:${part}`}
              className="wb-stroke"
              style={timing(item.delay + axisTime + index * curveTime, curveTime * 0.9)}
              stroke={pens[item.series[index].color]}
              d={d}
              {...STROKE_ATTRS}
              strokeWidth={0.7}
            />
          )))}
        </g>
      </svg>
      {item.series.some((series) => series.label) && (
        <ul className="wb-fade mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-base sm:text-lg" style={timing(item.delay + item.duration)}>
          {item.series.map((series, index) => series.label && (
            <li key={index} className="flex items-center gap-1.5" style={{ color: ink(series.color) }}>
              <span aria-hidden className="inline-block h-0.5 w-5 rounded" style={{ backgroundColor: ink(series.color) }} />
              {series.label}
            </li>
          ))}
        </ul>
      )}
      <Caption text={item.text} delay={item.delay + item.duration} />
    </div>
  );
}

function Checkpoint({ item, onAnswer }: { item: Extract<BoardItem, { kind: 'checkpoint' }>; onAnswer?: (id: string, chosen: number) => void }) {
  const done = Boolean(item.result);
  const tappable = !done && item.correct !== undefined && Boolean(onAnswer);
  return (
    <div className="wb-fade rounded-xl border-2 border-dashed p-3 sm:p-4" style={{ ...timing(item.delay), borderColor: 'color-mix(in srgb, var(--wb-ink) 35%, transparent)' }}>
      <p className="flex items-center gap-2 font-sans text-xs font-semibold uppercase tracking-wide opacity-70">
        <CircleHelp className="h-4 w-4" aria-hidden /> Quick check
        {item.result === 'correct' && <span className="ml-auto flex items-center gap-1 normal-case" style={{ color: ink('green') }}><Check className="h-4 w-4" aria-hidden /> Got it</span>}
        {item.result === 'incorrect' && <span className="ml-auto normal-case" style={{ color: ink('orange') }}>Not yet</span>}
      </p>
      <p className="mt-1 text-2xl leading-snug sm:text-3xl">{item.text}</p>
      {item.choices ? (
        <div className="mt-3 grid gap-2 font-sans sm:grid-cols-2" role="group" aria-label="Answers">
          {item.choices.map((choice, index) => {
            const isRight = done && item.correct === index;
            const isWrongPick = done && item.chosen === index && item.correct !== index;
            return (
              <button
                key={index}
                type="button"
                disabled={!tappable}
                onClick={() => onAnswer?.(item.id, index)}
                className="min-h-11 rounded-lg border-2 px-3 py-2 text-left text-base transition-colors enabled:hover:bg-black/5 disabled:cursor-default dark:enabled:hover:bg-white/10"
                style={{
                  borderColor: isRight ? ink('green') : isWrongPick ? ink('orange') : 'color-mix(in srgb, var(--wb-ink) 25%, transparent)',
                  color: isRight ? ink('green') : isWrongPick ? ink('orange') : undefined,
                }}
              >
                {choice}
                {isRight && <span className="sr-only"> (right answer)</span>}
                {isWrongPick && <span className="sr-only"> (your answer)</span>}
              </button>
            );
          })}
        </div>
      ) : null}
      {!done && <p className="mt-2 font-sans text-sm opacity-70">{tappable ? 'Tap an answer or say it out loud.' : 'Say your answer out loud.'}</p>}
    </div>
  );
}

type Frame = { x: number; y: number; w: number; h: number };
export type BoardFrame = Frame & { items: FramedItem[] };

const MIN_FRAME_PX = 24;
const FRAME_FORM_HEIGHT = 62;

/**
 * Lets the learner drag a frame around part of the board, then ask about just
 * that part by voice or by typing. Sits over the drawn content.
 */
function FrameLayer({ items, onFrame, onQuestion, onClose }: {
  items: BoardItem[];
  onFrame: (frame: BoardFrame) => void;
  onQuestion: (question: string) => void;
  onClose: () => void;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState(false);
  const [formTop, setFormTop] = useState(0);

  const point = (event: ReactPointerEvent) => {
    const box = layerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(box.width, Math.max(0, event.clientX - box.left)),
      y: Math.min(box.height, Math.max(0, event.clientY - box.top)),
    };
  };
  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = point(event);
    startRef.current = at;
    setDrawn(false);
    setAsked(false);
    setFrame({ x: at.x, y: at.y, w: 0, h: 0 });
  };
  const onMove = (event: ReactPointerEvent) => {
    const start = startRef.current;
    if (!start) return;
    const at = point(event);
    setFrame({ x: Math.min(start.x, at.x), y: Math.min(start.y, at.y), w: Math.abs(at.x - start.x), h: Math.abs(at.y - start.y) });
  };
  const onUp = (event: ReactPointerEvent) => {
    const start = startRef.current;
    startRef.current = null;
    const layer = layerRef.current;
    if (!start || !layer) return;
    const at = point(event);
    const next = { x: Math.min(start.x, at.x), y: Math.min(start.y, at.y), w: Math.abs(at.x - start.x), h: Math.abs(at.y - start.y) };
    if (next.w < MIN_FRAME_PX || next.h < MIN_FRAME_PX) { setFrame(null); return; }
    // Which board items the frame touches, so the tutor knows what was picked even if the picture is unclear.
    const origin = layer.getBoundingClientRect();
    const inside: FramedItem[] = [];
    for (const item of items) {
      const el = layer.parentElement?.querySelector<HTMLElement>(`[data-board-item="${CSS.escape(item.id)}"]`);
      if (!el) continue;
      const box = el.getBoundingClientRect();
      const top = box.top - origin.top;
      const left = box.left - origin.left;
      if (left < next.x + next.w && left + box.width > next.x && top < next.y + next.h && top + box.height > next.y) {
        inside.push({ id: item.id, kind: item.kind, text: itemSearchText(item) });
      }
    }
    // The question box goes under the frame, or inside its bottom edge when there is no room below.
    const below = next.y + next.h + 8;
    setFormTop(below + FRAME_FORM_HEIGHT <= origin.height ? below : Math.max(8, origin.height - FRAME_FORM_HEIGHT - 8));
    setFrame(next);
    setDrawn(true);
    onFrame({ ...next, items: inside });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    onQuestion(text);
    setQuestion('');
    setAsked(true);
  };

  return (
    <div
      ref={layerRef}
      data-board-frame-ui
      className="absolute inset-0 z-10 cursor-crosshair touch-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => { startRef.current = null; if (!drawn) setFrame(null); }}
    >
      {!frame && (
        <p className="sticky top-2 mx-auto w-fit rounded-full bg-black/75 px-3 py-1.5 font-sans text-sm text-white shadow">
          Drag a box around the part you want to ask about
        </p>
      )}
      {frame && (
        <div
          className="pointer-events-none absolute rounded-md border-2 border-dashed"
          style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h, borderColor: ink('blue'), backgroundColor: 'color-mix(in srgb, var(--wb-blue) 10%, transparent)' }}
        />
      )}
      {frame && drawn && (
        <form
          onSubmit={submit}
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute left-2 right-2 z-10 mx-auto flex max-w-md cursor-auto items-center gap-2 rounded-xl border bg-background p-2 font-sans text-foreground shadow-lg"
          style={{ top: formTop }}
        >
          <label htmlFor="wb-frame-question" className="sr-only">Your question about this part</label>
          <input
            id="wb-frame-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={300}
            autoComplete="off"
            placeholder={asked ? 'Ask something else…' : 'Ask out loud, or type here…'}
            className="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={!question.trim()} aria-label="Send question">
            <Send className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-11 w-11 shrink-0" onClick={onClose} aria-label="Done asking">
            <X className="h-4 w-4" />
          </Button>
        </form>
      )}
    </div>
  );
}

function ItemBody({ item, onAnswerCheckpoint }: { item: BoardItem; onAnswerCheckpoint?: (id: string, chosen: number) => void }) {
  switch (item.kind) {
    case 'heading':
      return (
        <h3 className="border-b-2 pb-1 text-3xl font-normal leading-tight sm:text-4xl" style={{ fontFamily: 'inherit', color: ink(item.color), borderColor: 'color-mix(in srgb, currentColor 35%, transparent)' }}>
          <Words text={item.text} delay={item.delay} duration={item.duration} />
        </h3>
      );
    case 'text':
      return (
        <p className="text-2xl leading-snug sm:text-3xl" style={{ color: ink(item.color) }}>
          <Words text={item.text} delay={item.delay} duration={item.duration} />
        </p>
      );
    case 'bullet':
      return (
        <p className="flex gap-3 pl-2 text-2xl leading-snug sm:text-3xl" style={{ color: ink(item.color) }}>
          <span aria-hidden className="wb-word" style={timing(item.delay)}>•</span>
          <span><Words text={item.text} delay={item.delay} duration={item.duration} /></span>
        </p>
      );
    case 'formula':
      return <Formula item={item} />;
    case 'diagram':
      return <Diagram item={item} />;
    case 'plot':
      return <Plot item={item} />;
    case 'checkpoint':
      return <Checkpoint item={item} onAnswer={onAnswerCheckpoint} />;
  }
}

type WhiteboardProps = {
  board: BoardState;
  onGoto: (index: number) => void;
  /** Set on the drawn content, for pictures of the board sent to the tutor. */
  contentRef?: RefObject<HTMLDivElement | null>;
  /** The learner tapped an answer on a checkpoint card. */
  onAnswerCheckpoint?: (id: string, chosen: number) => void;
  /** Frame-to-ask is on: the learner can drag a box over the board. */
  framing?: boolean;
  onFrame?: (frame: BoardFrame) => void;
  onFrameQuestion?: (question: string) => void;
  onFrameClose?: () => void;
};

export const Whiteboard = memo(function Whiteboard({ board, onGoto, contentRef, onAnswerCheckpoint, framing = false, onFrame, onFrameQuestion, onFrameClose }: WhiteboardProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const page = board.pages[board.current] ?? board.pages[board.pages.length - 1];
  const onLastPage = board.current === board.pages.length - 1;
  const itemCount = page.items.length;
  const score = checkpointScore(board);

  // Follow the pen: bring each item into view as its drawing starts, leaving
  // room below it for the captions and voice controls.
  const followedRef = useRef(new Set<string>());
  const followTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onLastPage) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    for (const item of page.items) {
      if (item.settled || followedRef.current.has(item.id)) continue;
      followedRef.current.add(item.id);
      followTimersRef.current.push(setTimeout(() => {
        const target = el.querySelector<HTMLElement>(`[data-board-item="${CSS.escape(item.id)}"]`);
        if (!target) return;
        const bottom = target.offsetTop + target.offsetHeight + FOLLOW_MARGIN_PX;
        if (bottom > el.scrollTop + el.clientHeight) {
          el.scrollTo({ top: bottom - el.clientHeight, behavior: reduced ? 'auto' : 'smooth' });
        }
      }, item.delay));
    }
    // No cleanup here: a later write must not cancel the scroll for an item still waiting its turn.
  }, [board.revision, onLastPage, page.items]);
  useEffect(() => {
    const timers = followTimersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const dark = useSyncExternalStore(subscribeToTheme, isDarkNow, isDarkOnServer);

  return (
    <PensContext.Provider value={dark ? DARK_PENS : LIGHT_PENS}>
    <section aria-label="Whiteboard" className={`wb-root ${hand.className} flex min-h-0 flex-1 flex-col`}>
      {(board.pages.length > 1 || page.title || score.answered > 0) && (
        <header className="flex min-h-11 items-center justify-between gap-2 px-3 pt-2 font-sans sm:px-6">
          <p className="min-w-0 truncate text-sm font-medium opacity-70">{page.title ?? `Board ${board.current + 1}`}</p>
          {score.answered > 0 && (
            <p className="ml-auto shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium" aria-label={`${score.correct} of ${score.answered} quick checks right`}>
              <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden />{score.correct}/{score.answered} checks
            </p>
          )}
          {board.pages.length > 1 && (
            <div className="flex shrink-0 items-center gap-1">
              <Button size="icon" variant="ghost" className="h-11 w-11" disabled={board.current === 0} onClick={() => onGoto(board.current - 1)} aria-label="Previous board">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs tabular-nums opacity-70" aria-live="polite">Board {board.current + 1} of {board.pages.length}</span>
              <Button size="icon" variant="ghost" className="h-11 w-11" disabled={onLastPage} onClick={() => onGoto(board.current + 1)} aria-label="Next board">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </header>
      )}
      <div ref={scrollRef} data-visualization-panel className="relative min-h-0 flex-1 overflow-y-auto">
        {itemCount === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-6 text-center opacity-60">
            <PenLine className="h-8 w-8" aria-hidden />
            <p className="text-2xl">Your tutor will write and draw here as it explains.</p>
          </div>
        ) : (
          <div ref={contentRef} className="relative mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-28 pt-4 sm:gap-5 sm:px-8 sm:pt-6">
            {page.items.map((item) => (
              <div
                key={item.id}
                data-board-item={item.id}
                data-highlighted={item.highlighted ? 'true' : 'false'}
                className={`wb-item -mx-2 px-2 py-0.5 ${item.settled ? '' : 'wb-animate'}`}
              >
                <ItemBody item={item} onAnswerCheckpoint={onAnswerCheckpoint} />
              </div>
            ))}
            {framing && onFrame && onFrameQuestion && onFrameClose && (
              <FrameLayer key={page.id} items={page.items} onFrame={onFrame} onQuestion={onFrameQuestion} onClose={onFrameClose} />
            )}
          </div>
        )}
      </div>
    </section>
    </PensContext.Provider>
  );
});
