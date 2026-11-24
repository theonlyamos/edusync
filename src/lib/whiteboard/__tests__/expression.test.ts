import { describe, expect, it } from 'vitest';
import { compileExpression, sampleFunction } from '../expression';

const at = (source: string, x: number) => compileExpression(source)?.(x);

describe('plot expressions', () => {
  it('follows the usual order of operations', () => {
    expect(at('x^2 - 3', 4)).toBe(13);
    expect(at('-x^2', 3)).toBe(-9);
    expect(at('2^3^2', 0)).toBe(512);
    expect(at('2 + 3 * x', 2)).toBe(8);
    expect(at('(2 + 3) * x', 2)).toBe(10);
    expect(at('2^-1', 0)).toBe(0.5);
  });

  it('understands implicit multiplication, functions and constants', () => {
    expect(at('2x', 5)).toBe(10);
    expect(at('3(x + 1)', 1)).toBe(6);
    expect(at('2*sin(x)', Math.PI / 2)).toBeCloseTo(2);
    expect(at('sqrt(abs(x))', -9)).toBe(3);
    expect(at('pi', 0)).toBeCloseTo(Math.PI);
    expect(at('ln(e)', 0)).toBeCloseTo(1);
    expect(at('log(100)', 0)).toBeCloseTo(2);
  });

  it('accepts the ways a tutor might write it', () => {
    expect(at('y = x^2', 3)).toBe(9);
    expect(at('f(x) = 2x + 1', 3)).toBe(7);
    expect(at('x**2', 3)).toBe(9);
    expect(at('x × 2 − 1', 3)).toBe(5);
  });

  it('refuses anything that is not a plain formula', () => {
    for (const source of ['', 'alert(1)', 'x; y', 'constructor', 'window.location', 'x +', '(x', 'sin x', 'a + b', '1 2 3 )', 'x'.repeat(500)]) {
      expect(compileExpression(source), source).toBeNull();
    }
    expect(compileExpression('('.repeat(60) + 'x' + ')'.repeat(60))).toBeNull();
  });

  it('breaks a curve where the function is undefined or off the frame', () => {
    const runs = sampleFunction(compileExpression('1/x')!, -4, 4, -4, 4, 80);
    expect(runs.length).toBe(2);
    for (const run of runs) for (const [, y] of run) expect(Math.abs(y)).toBeLessThanOrEqual(8);
    expect(sampleFunction(compileExpression('sqrt(x)')!, -4, 4, -4, 4, 80)).toHaveLength(1);
  });
});
