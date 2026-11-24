'use client';

import { memo, useEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { Patrick_Hand } from 'next/font/google';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ChevronLeft, ChevronRight, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DIAGRAM_HEIGHT,
  DIAGRAM_WIDTH,
  type BoardColor,
  type BoardItem,
  type BoardShape,
  type BoardState,
} from '@/lib/whiteboard/board';
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
  return (
    <text
      className="wb-fade wb-label"
      style={timing(delay)}
      x={Math.min(DIAGRAM_WIDTH - 2, Math.max(2, x))}
      y={Math.min(DIAGRAM_HEIGHT - 1.5, Math.max(LABEL_SIZE, y))}
      textAnchor="middle"
      dominantBaseline="middle"
      fill={ink(color)}
      stroke="var(--wb-paper)"
      strokeWidth={0.9}
      paintOrder="stroke"
    >
      {text}
    </text>
  );
}

function Shape({ shape, seed, delay, duration }: { shape: BoardShape; seed: string; delay: number; duration: number }) {
  const rand = seededRandom(seed);
  const stroke = { stroke: ink(shape.color), strokeWidth: 0.55, pathLength: 1 };
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
  const stroke = { strokeWidth: 0.45, pathLength: 1 };
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
        <path className="wb-stroke" style={timing(item.delay, axisTime)} stroke={ink('ink')} d={wobblyLine(PLOT_AREA.left, axisY, PLOT_AREA.right, axisY, rand)} {...stroke} />
        <path className="wb-stroke" style={timing(item.delay, axisTime)} stroke={ink('ink')} d={wobblyLine(axisX, PLOT_AREA.bottom, axisX, PLOT_AREA.top, rand)} {...stroke} />
        <g className="wb-fade wb-tick" style={timing(item.delay + axisTime * 0.6)} fill={ink('ink')} opacity={0.75}>
          {niceTicks(xMin, xMax).map((tick) => (
            <g key={`x${tick}`}>
              <line x1={scale.x(tick)} x2={scale.x(tick)} y1={axisY - 0.8} y2={axisY + 0.8} stroke={ink('ink')} strokeWidth={0.3} />
              {tick !== 0 && <text x={scale.x(tick)} y={Math.min(DIAGRAM_HEIGHT - 5, axisY + 3.6)} textAnchor="middle">{formatTick(tick)}</text>}
            </g>
          ))}
          {niceTicks(yMin, yMax).map((tick) => (
            <g key={`y${tick}`}>
              <line x1={axisX - 0.8} x2={axisX + 0.8} y1={scale.y(tick)} y2={scale.y(tick)} stroke={ink('ink')} strokeWidth={0.3} />
              {tick !== 0 && <text x={Math.max(6, axisX - 1.6)} y={scale.y(tick) + 1} textAnchor="end">{formatTick(tick)}</text>}
            </g>
          ))}
          {item.xLabel && <text x={PLOT_AREA.right} y={DIAGRAM_HEIGHT - 1.2} textAnchor="end" className="wb-axis-label">{item.xLabel}</text>}
          {item.yLabel && <text x={1} y={3.6} className="wb-axis-label">{item.yLabel}</text>}
        </g>
        <g clipPath={`url(#${clipId})`}>
          {curves.map((paths, index) => paths.map((d, part) => (
            <path
              key={`${index}:${part}`}
              className="wb-stroke"
              style={timing(item.delay + axisTime + index * curveTime, curveTime * 0.9)}
              stroke={ink(item.series[index].color)}
              d={d}
              strokeWidth={0.7}
              pathLength={1}
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

function ItemBody({ item }: { item: BoardItem }) {
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
  }
}

type WhiteboardProps = {
  board: BoardState;
  onGoto: (index: number) => void;
  /** Set on the drawn content, for pictures of the board sent to the tutor. */
  contentRef?: RefObject<HTMLDivElement | null>;
};

export const Whiteboard = memo(function Whiteboard({ board, onGoto, contentRef }: WhiteboardProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const page = board.pages[board.current] ?? board.pages[board.pages.length - 1];
  const onLastPage = board.current === board.pages.length - 1;
  const itemCount = page.items.length;

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

  return (
    <section aria-label="Whiteboard" className={`wb-root ${hand.className} flex min-h-0 flex-1 flex-col`}>
      {(board.pages.length > 1 || page.title) && (
        <header className="flex min-h-11 items-center justify-between gap-2 px-3 pt-2 font-sans sm:px-6">
          <p className="min-w-0 truncate text-sm font-medium opacity-70">{page.title ?? `Board ${board.current + 1}`}</p>
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
          <div ref={contentRef} className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-28 pt-4 sm:gap-5 sm:px-8 sm:pt-6">
            {page.items.map((item) => (
              <div
                key={item.id}
                data-board-item={item.id}
                data-highlighted={item.highlighted ? 'true' : 'false'}
                className={`wb-item -mx-2 px-2 py-0.5 ${item.settled ? '' : 'wb-animate'}`}
              >
                <ItemBody item={item} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
});
