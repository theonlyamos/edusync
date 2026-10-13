import { describe, expect, it } from 'vitest';
import { assertReactComponentSyntax, prepareReactComponentCode } from '../react-component-source';

describe('React component compilation contract', () => {
  it('prepares the legacy leading imports and injected hooks exactly as the renderer does', () => {
    const source = "import React from 'react';\nconst { useState } = React;\nfunction App() { return React.createElement('p', null, useState('Water')[0]); }";
    expect(prepareReactComponentCode(source)).toBe("function App() { return React.createElement('p', null, useState('Water')[0]); }");
    expect(() => assertReactComponentSyntax(source)).not.toThrow();
  });

  it('normalizes a bare element while preserving escaped text and template literals', () => {
    const source = 'React.createElement("p", null, `Plant\\\'s oxygen comes from water.`)';
    expect(prepareReactComponentCode(source)).toBe(`const Component = () => (${source});`);
    expect(() => assertReactComponentSyntax(source)).not.toThrow();
  });

  it('rejects invalid punctuation with a fixed error without returning the source', () => {
    const source = "function App() { return React.createElement('p', null, 'Plant's oxygen'); }";
    expect(() => assertReactComponentSyntax(source)).toThrow('Generated React code has invalid JavaScript syntax');
  });

  it('uses the actual injected namespace and rejects a conflicting constant', () => {
    expect(() => assertReactComponentSyntax('const Button = () => null; function App() { return null; }'))
      .toThrow('Generated React code has invalid JavaScript syntax');
  });

  it('compiles without running generated top-level statements', () => {
    const state = globalThis as typeof globalThis & { __componentSourceExecuted?: boolean };
    delete state.__componentSourceExecuted;
    assertReactComponentSyntax('globalThis.__componentSourceExecuted = true; function App() { return null; }');
    expect(state.__componentSourceExecuted).toBeUndefined();
  });
});
