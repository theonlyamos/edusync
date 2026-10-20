import { describe, expect, it } from 'vitest';
import { compileReactComponentJsx } from '../react-component-jsx';
import { assertReactComponentSyntax } from '../react-component-source';
import { assertReactComponentBindings } from '../react-component-bindings';

describe('JSX in generated React components', () => {
  it('compiles a JSX component into code the sandbox contract accepts', () => {
    const code = compileReactComponentJsx(
      'function App() {\n  const [gas, setGas] = useState(null);\n  return <div className="p-4"><Button onClick={() => setGas("oxygen")}>Oxygen</Button>{gas && <p>{gas}</p>}</div>;\n}',
    );
    expect(code).toContain('React.createElement(Button');
    expect(code).not.toContain('<div');
    expect(() => assertReactComponentSyntax(code)).not.toThrow();
    expect(() => assertReactComponentBindings(code)).not.toThrow();
  });

  it('drops module syntax the sandbox cannot run', () => {
    const code = compileReactComponentJsx(
      "import React, { useState } from 'react';\nimport {\n  LineChart,\n  Line\n} from 'recharts';\n\nexport default function App() {\n  return <LineChart><Line dataKey=\"rate\" /></LineChart>;\n}",
    );
    expect(code).not.toMatch(/\bimport\b|\bexport\b/);
    expect(() => assertReactComponentSyntax(code)).not.toThrow();
    expect(() => assertReactComponentBindings(code)).not.toThrow();
  });

  it('compiles a bare JSX element into a component', () => {
    const code = compileReactComponentJsx('<p>Plants release oxygen.</p>');
    expect(() => assertReactComponentSyntax(code)).not.toThrow();
  });

  it('returns code that already runs unchanged', () => {
    const code = "function App() { return React.createElement('p', null, 'Water'); }";
    expect(compileReactComponentJsx(code)).toBe(code);
  });

  it('names the broken line in the cause so the next attempt can fix it', () => {
    let error: Error | undefined;
    try {
      compileReactComponentJsx("function App() {\n  return <p>{'Plant's oxygen'}</p>;\n}");
    } catch (caught) {
      error = caught as Error;
    }
    expect(error?.message).toBe('Generated React code has invalid JavaScript syntax');
    expect((error?.cause as Error).message).toMatch(/^line 2: .*Plant's oxygen/);
  });
});
