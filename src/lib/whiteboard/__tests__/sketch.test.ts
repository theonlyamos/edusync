import { describe, expect, it } from 'vitest';
import { arrowHead, niceTicks, plotScale, PLOT_AREA, seededRandom, smoothPath, wobblyBox, wobblyCircle, wobblyLine } from '../sketch';
import { parseWhiteboardParam } from '../preference';

describe('hand-drawn paths', () => {
  it('draws the same wobble for the same seed', () => {
    const a = wobblyBox(10, 10, 40, 30, seededRandom('b1:0'));
    expect(wobblyBox(10, 10, 40, 30, seededRandom('b1:0'))).toBe(a);
    expect(wobblyBox(10, 10, 40, 30, seededRandom('b1:1'))).not.toBe(a);
  });

  it('keeps strokes close to where the tutor asked for them', () => {
    const numbers = (path: string) => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    const line = numbers(wobblyLine(0, 0, 100, 0, seededRandom('x')));
    expect(line.slice(0, 2)).toEqual([0, 0]);
    expect(line.slice(-2)).toEqual([100, 0]);
    expect(Math.abs(line[3])).toBeLessThanOrEqual(0.9);
    for (const value of numbers(wobblyCircle(50, 30, 10, seededRandom('c')))) expect(Number.isFinite(value)).toBe(true);
    expect(arrowHead(0, 0, 10, 0)).toMatch(/^M10 0 L/);
    expect(smoothPath([])).toBe('');
    expect(smoothPath([[0, 0], [1, 1]])).toBe('M0 0 L1 1');
  });

  it('picks round tick marks and maps values into the plot area', () => {
    expect(niceTicks(-4, 4)).toEqual([-4, -2, 0, 2, 4]);
    expect(niceTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(0, 1000)).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(niceTicks(5, 5)).toEqual([]);
    const scale = plotScale(0, 10, 0, 100);
    expect(scale.x(0)).toBe(PLOT_AREA.left);
    expect(scale.x(10)).toBe(PLOT_AREA.right);
    expect(scale.y(0)).toBe(PLOT_AREA.bottom);
    expect(scale.y(100)).toBe(PLOT_AREA.top);
  });
});

describe('embed whiteboard parameter', () => {
  it('reads on, off and not set', () => {
    expect(parseWhiteboardParam(null)).toBeUndefined();
    expect(parseWhiteboardParam('true')).toBe(true);
    expect(parseWhiteboardParam('1')).toBe(true);
    expect(parseWhiteboardParam('FALSE')).toBe(false);
    expect(parseWhiteboardParam('maybe')).toBeUndefined();
  });
});
