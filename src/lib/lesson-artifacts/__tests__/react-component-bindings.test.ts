import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertReactComponentBindings } from '../react-component-bindings'
import { assertReactComponentSyntax } from '../react-component-source'

const fixture = (name: string) => readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8')

describe('generated React lexical bindings', () => {
  it('rejects the exact captured source which passes syntax validation', () => {
    const code = fixture('selected-missing.txt')
    expect(() => assertReactComponentSyntax(code)).not.toThrow()
    expect(() => assertReactComponentBindings(code))
      .toThrow('Generated React code has unresolved bindings: selected, setSelected')
  })

  it('accepts the exact stateful fixture without executing it', () => {
    expect(() => assertReactComponentBindings(fixture('selected-stateful.txt'))).not.toThrow()
  })

  it.each([
    ['nested destructuring and closures', "function App({items = [], settings: {label = 'Gas'} = {}, ...rest} = {}) { const [selected, setSelected] = useState(null); return items.map(({id, ...item}, index) => React.createElement(Button, {key: id, onClick: () => setSelected(index)}, label, selected, rest, item)); }"],
    ['function and block scopes', "function App() { const items = [1]; for (const item of items) { const value = item; console.log(value); } for (var index = 0; index < items.length; index++) {} return helper(index); function helper(value) { return React.createElement('span', null, value); } }"],
    ['catch and class scopes', "function App() { class Model { #value = 1; getValue() { return this.#value; } } try { throw new Error('example'); } catch ({message}) { return React.createElement('span', null, new Model().getValue(), message); } }"],
    ['object keys, member names, and labels', "function App() { const value = {selected: 1, setSelected() { return this.selected; }}; outer: for (const entry of [value]) { if (entry.selected) break outer; } return React.createElement('span', {selected: value.selected, 'aria-label': 'setSelected'}); }"],
    ['shorthand and computed properties', "function App() { const selected = 1, key = 'answer'; const object = {selected, [key]: selected}; return React.createElement('span', null, object[key]); }"],
    ['rest parameters and named expressions', "function App(...values) { const factorial = function inner(value) { return value ? value * inner(value - 1) : 1; }; return React.createElement('span', null, values.map(value => factorial(value))); }"],
    ['actual renderer namespace', "function App() { const value = useMemo(() => Math.max(1, 2), []); return React.createElement(Card, null, React.createElement(Button, null, value), React.createElement(ResponsiveContainer, null), L, Recharts, ReactLeaflet, ReactDOM); }"],
    ['browser viewport and storage helpers', "function App() { useEffect(() => { const observer = new ResizeObserver(() => { document.documentElement.style.setProperty('--width', String(window.lessonViewport?.width || 0)); }); observer.observe(document.body); const id = requestAnimationFrame(() => localStorage.setItem('value', JSON.stringify(performance.now()))); const timer = setTimeout(() => sessionStorage.clear(), 0); return () => { observer.disconnect(); cancelAnimationFrame(id); clearTimeout(timer); }; }, []); return React.createElement('canvas'); }"],
    ['legacy renderer preparation', "import React from 'react';\nconst { useState } = React;\nfunction App() { const [value] = useState(0); return React.createElement('span', null, value); }"],
    ['safe optional feature detection', "function App() { return React.createElement('span', null, typeof OptionalFeature === 'undefined' ? 'Unavailable' : 'Available'); }"],
    ['browser cloning and bare viewport dimensions', "function App() { const data = structuredClone({value: innerWidth + innerHeight}); return React.createElement('span', null, data.value, devicePixelRatio, visualViewport?.width, scrollX, scrollY); }"],
  ])('accepts %s', (_name, code) => {
    expect(() => assertReactComponentBindings(code)).not.toThrow()
  })

  it.each([
    ["function App() { return selected; }", 'selected'],
    ["function App() { return React.createElement('button', {onClick: () => setSelected(1)}); }", 'setSelected'],
    ["function App() { selected = 1; return null; }", 'selected'],
    ["function App() { { let selected = 1; } return selected; }", 'selected'],
    ["function App(value = helper()) { function helper() { return 1; } return value; }", 'helper'],
    ["const value = function hidden() { return hidden; }; function App() { return hidden; }", 'hidden'],
    ["function App() { const value = {selected}; return value; }", 'selected'],
    ["function App() { return { [selected]: 1 }; }", 'selected'],
    ["function App({value = selected} = {}) { return value; }", 'selected'],
    ["function App() { return process.version; }", 'process'],
    ["function App() { return require('node:fs'); }", 'require'],
    ["function App() { return Buffer.from('value'); }", 'Buffer'],
    ["function App() { return cn('selected'); }", 'cn'],
    ["function App() { return typeof selected === 'undefined' ? null : selected; }", 'selected'],
  ])('rejects unresolved references in %s', (code, name) => {
    expect(() => assertReactComponentBindings(code))
      .toThrow('Generated React code has unresolved bindings: ' + name)
  })

  it('never invokes top-level code, getters, or handlers while analyzing bindings', () => {
    const state = globalThis as typeof globalThis & { __bindingAnalysisExecuted?: boolean }
    delete state.__bindingAnalysisExecuted
    const code = "globalThis.__bindingAnalysisExecuted = true; const value = {get selected() { throw new Error('executed'); }}; function App() { return React.createElement('button', {onClick: () => { throw new Error('clicked'); }}, value.selected); }"
    expect(() => assertReactComponentBindings(code)).not.toThrow()
    expect(state.__bindingAnalysisExecuted).toBeUndefined()
  })

  it('keeps JSX under the existing syntax rejection contract', () => {
    expect(() => assertReactComponentSyntax('function App() { return <Button selected={true}><span>Gas</span></Button>; }'))
      .toThrow('Generated React code has invalid JavaScript syntax')
  })
})
