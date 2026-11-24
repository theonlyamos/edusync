/**
 * Hand-drawn SVG paths for the whiteboard. Lines bow slightly and circles do
 * not quite close, so diagrams look written by a person. The wobble is seeded
 * from the item id, which keeps a drawing identical between renders.
 */

import { DIAGRAM_HEIGHT, DIAGRAM_WIDTH } from './board';

export type Rand = () => number;

/** Small deterministic generator (mulberry32) seeded from a string. */
export function seededRandom(seed: string): Rand {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n = (value: number) => Math.round(value * 100) / 100;

/** A straight stroke with a slight bow, as a quadratic curve. */
export function wobblyLine(x1: number, y1: number, x2: number, y2: number, rand: Rand, move = true): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const bow = Math.min(0.9, length * 0.025) * (rand() * 2 - 1);
  const cx = (x1 + x2) / 2 + (-dy / length) * bow;
  const cy = (y1 + y2) / 2 + (dx / length) * bow;
  return `${move ? `M${n(x1)} ${n(y1)} ` : ''}Q${n(cx)} ${n(cy)} ${n(x2)} ${n(y2)}`;
}

export function wobblyBox(x: number, y: number, x2: number, y2: number, rand: Rand): string {
  const j = () => (rand() - 0.5) * 0.6;
  const corners: Array<[number, number]> = [
    [x + j(), y + j()],
    [x2 + j(), y + j()],
    [x2 + j(), y2 + j()],
    [x + j(), y2 + j()],
  ];
  let path = `M${n(corners[0][0])} ${n(corners[0][1])}`;
  for (let i = 1; i <= 4; i++) {
    const from = corners[i - 1];
    const to = corners[i % 4];
    path += ` ${wobblyLine(from[0], from[1], to[0], to[1], rand, false)}`;
  }
  return path;
}

/** A circle drawn in one stroke that overshoots its start a little. */
export function wobblyCircle(cx: number, cy: number, r: number, rand: Rand): string {
  const steps = 10;
  const start = rand() * Math.PI * 2;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps + 1; i++) {
    const angle = start + (i / steps) * Math.PI * 2;
    const radius = r * (1 + (rand() - 0.5) * 0.06);
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return smoothPath(points);
}

/** The two short strokes of an arrowhead at (x2, y2). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size = 3): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const wing = (offset: number) => `M${n(x2)} ${n(y2)} L${n(x2 - Math.cos(angle + offset) * size)} ${n(y2 - Math.sin(angle + offset) * size)}`;
  return `${wing(0.45)} ${wing(-0.45)}`;
}

/** A smooth curve through the points (Catmull-Rom converted to cubic segments). */
export function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return '';
  if (points.length < 3) return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`).join(' ');
  let path = `M${n(points[0][0])} ${n(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return path;
}

/** Where a plot's data area sits inside the 100 x 60 drawing. */
export const PLOT_AREA = { left: 11, right: DIAGRAM_WIDTH - 4, top: 5, bottom: DIAGRAM_HEIGHT - 9 } as const;

export function plotScale(xMin: number, xMax: number, yMin: number, yMax: number) {
  const { left, right, top, bottom } = PLOT_AREA;
  return {
    x: (value: number) => left + ((value - xMin) / (xMax - xMin)) * (right - left),
    y: (value: number) => bottom - ((value - yMin) / (yMax - yMin)) * (bottom - top),
  };
}

/** Round tick positions (steps of 1, 2 or 5 times a power of ten), about five per axis. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  const span = max - min;
  if (!(span > 0)) return [];
  const raw = span / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const fraction = raw / magnitude;
  const step = (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10) * magnitude;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
    ticks.push(Math.abs(value) < step * 1e-9 ? 0 : Number(value.toPrecision(12)));
    if (ticks.length > 20) break;
  }
  return ticks;
}

export function formatTick(value: number): string {
  return String(Number(value.toPrecision(4)));
}
