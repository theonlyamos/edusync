/**
 * A small, safe evaluator for functions of x that the tutor plots, such as
 * "x^2 - 3", "2*sin(x)" or "sqrt(abs(x))". The text comes from a model, so it
 * is parsed here and never passed to eval or Function.
 */

type Node =
  | { t: 'num'; v: number }
  | { t: 'x' }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { t: 'call'; fn: (v: number) => number; a: Node };

const FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const MAX_LENGTH = 120;
const MAX_DEPTH = 40;

function tokenize(source: string): string[] | null {
  const tokens: string[] = [];
  const re = /\s*(\d+\.?\d*|\.\d+|[a-zA-Z]+|[-+*/^()])/y;
  let index = 0;
  const text = source.replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/\*\*/g, '^');
  while (index < text.length) {
    if (/^\s*$/.test(text.slice(index))) break;
    re.lastIndex = index;
    const match = re.exec(text);
    if (!match) return null;
    tokens.push(match[1]);
    index = re.lastIndex;
  }
  return tokens;
}

/** Compiles the text to a function of x, or returns null when it is not a plain formula. */
export function compileExpression(source: string): ((x: number) => number) | null {
  if (typeof source !== 'string' || source.length > MAX_LENGTH) return null;
  // Accept "y = x^2" and "f(x) = x^2" by keeping the right-hand side.
  const body = source.includes('=') ? source.slice(source.lastIndexOf('=') + 1) : source;
  const parsed = tokenize(body);
  if (!parsed || parsed.length === 0) return null;
  const tokens: string[] = parsed;
  let pos = 0;
  let depth = 0;
  let failed = false;

  const peek = () => tokens[pos];
  const startsValue = (token: string | undefined) => token !== undefined && (/^[\d.a-zA-Z(]/.test(token));

  function primary(): Node {
    if (++depth > MAX_DEPTH) { failed = true; return { t: 'num', v: NaN }; }
    try {
      const token = tokens[pos++];
      if (token === undefined) { failed = true; return { t: 'num', v: NaN }; }
      if (/^[\d.]/.test(token)) return { t: 'num', v: Number(token) };
      if (token === '(') {
        const inner = sum();
        if (tokens[pos++] !== ')') failed = true;
        return inner;
      }
      if (/^[a-zA-Z]+$/.test(token)) {
        const name = token.toLowerCase();
        if (name === 'x') return { t: 'x' };
        if (Object.hasOwn(CONSTANTS, name)) return { t: 'num', v: CONSTANTS[name] };
        if (Object.hasOwn(FUNCTIONS, name) && peek() === '(') {
          pos++;
          const arg = sum();
          if (tokens[pos++] !== ')') failed = true;
          return { t: 'call', fn: FUNCTIONS[name], a: arg };
        }
      }
      failed = true;
      return { t: 'num', v: NaN };
    } finally {
      depth--;
    }
  }

  function power(): Node {
    const base = primary();
    if (peek() === '^') {
      pos++;
      return { t: 'bin', op: '^', a: base, b: unary() };
    }
    return base;
  }

  function unary(): Node {
    if (peek() === '-') { pos++; return { t: 'neg', a: unary() }; }
    if (peek() === '+') { pos++; return unary(); }
    return power();
  }

  function product(): Node {
    let left = unary();
    for (;;) {
      const token = peek();
      if (token === '*' || token === '/') {
        pos++;
        left = { t: 'bin', op: token, a: left, b: unary() };
      } else if (startsValue(token) && !failed) {
        // Implicit multiplication: 2x, 3(x+1), x sin(x).
        left = { t: 'bin', op: '*', a: left, b: power() };
      } else {
        return left;
      }
    }
  }

  function sum(): Node {
    let left = product();
    for (;;) {
      const token = peek();
      if (token !== '+' && token !== '-') return left;
      pos++;
      left = { t: 'bin', op: token, a: left, b: product() };
    }
  }

  const tree = sum();
  if (failed || pos !== tokens.length) return null;

  const run = (node: Node, x: number): number => {
    switch (node.t) {
      case 'num': return node.v;
      case 'x': return x;
      case 'neg': return -run(node.a, x);
      case 'call': return node.fn(run(node.a, x));
      case 'bin': {
        const a = run(node.a, x);
        const b = run(node.b, x);
        if (node.op === '+') return a + b;
        if (node.op === '-') return a - b;
        if (node.op === '*') return a * b;
        if (node.op === '/') return a / b;
        return Math.pow(a, b);
      }
    }
  };
  return (x: number) => run(tree, x);
}

/**
 * Samples a function across [xMin, xMax]. The result is split into runs so a
 * curve breaks cleanly where the function is undefined or leaves the frame
 * (1/x at 0, tan(x) at its asymptotes).
 */
export function sampleFunction(
  fn: (x: number) => number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  steps = 96,
): Array<Array<[number, number]>> {
  const runs: Array<Array<[number, number]>> = [];
  let run: Array<[number, number]> = [];
  const margin = (yMax - yMin) * 0.5;
  for (let i = 0; i <= steps; i++) {
    const x = xMin + ((xMax - xMin) * i) / steps;
    const y = fn(x);
    if (!Number.isFinite(y) || y < yMin - margin || y > yMax + margin) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    run.push([x, y]);
  }
  if (run.length > 1) runs.push(run);
  return runs;
}
