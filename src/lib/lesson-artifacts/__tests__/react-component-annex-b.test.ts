import { describe, expect, it } from 'vitest'
import { assertReactComponentBindings } from '../react-component-bindings'
import { assertReactComponentSyntax } from '../react-component-source'

describe('generated React legacy block function bindings', () => {
  it.each([
    ['the reported helper after an if block', 'function App(){ if (true) { function helper(){ return 42; } } return helper(); }', 42],
    ['a binding from a branch that does not run', 'function App(){ if (false) { function helper(){} } return helper; }', undefined],
    ['a switch helper', 'function App(){ switch (1) { case 1: function helper(){ return 42; } } return helper(); }', 42],
    ['nested blocks', 'function App(){ { { function helper(){ return 42; } } } return helper(); }', 42],
    ['a closure outside the declaring block', 'function App(){ const read = () => helper(); { function helper(){ return 42; } } return read(); }', 42],
    ['a helper with its own strict body', 'function App(){ { function helper(){ "use strict"; return 42; } } return helper(); }', 42],
    ['a binding in the renderer wrapper', '{ function helper(){ return 42; } } function App(){ return helper(); }', 42],
    ['an arrow function body', 'const App = () => { { function helper(){ return 42; } } return helper(); };', 42],
    ['a simple catch parameter', 'function App(){ try { throw 1; } catch (helper) { { function helper(){ return 42; } } } return helper(); }', 42],
    ['a labelled helper', 'function App(){ { label: function helper(){ return 42; } } return helper(); }', 42],
    ['a direct if declaration', 'function App(){ if (true) function helper(){ return 42; } return helper(); }', 42],
    ['duplicate block declarations', 'function App(){ { function helper(){ return 1; } function helper(){ return 42; } } return helper(); }', 42],
    ['a formal parameter with the same name', 'function App(helper = 42){ { function helper(){} } return helper; }', 42],
    ['an arrow using the outer arguments binding', 'const App = () => { { function arguments(){} } return arguments.length; };', 0],
    ['a helper inside a generator body', 'function* host(){ { function helper(){ return 42; } } yield helper(); } function App(){ return host().next().value; }', 42],
  ])('matches the renderer for %s', (_name, code, expected) => {
    expect(() => assertReactComponentSyntax(code)).not.toThrow()
    expect(new Function(code + '; return App();')()).toBe(expected)
    expect(() => assertReactComponentBindings(code)).not.toThrow()
  })

  it.each([
    ['explicit strict mode', 'function App(){ "use strict"; { function helper(){} } return helper; }'],
    ['inherited strict mode', '"use strict"; function App(){ { function helper(){} } return helper; }'],
    ['strict class methods', 'class Model { read(){ { function helper(){} } return helper; } } function App(){ return new Model().read(); }'],
    ['an async block helper', 'function App(){ { async function helper(){} } return helper; }'],
    ['a generator block helper', 'function App(){ { function* helper(){} } return helper; }'],
    ['an intervening lexical declaration', 'function App(){ { let helper; { function helper(){} } } return helper; }'],
    ['an intervening loop binding', 'function App(){ for (let helper of [1]) { { function helper(){} } } return helper; }'],
    ['a destructured catch parameter', 'function App(){ try { throw {}; } catch ({helper}) { { function helper(){} } } return helper; }'],
    ['a different function', 'function other(){ { function helper(){} } } function App(){ return helper; }'],
    ['a default parameter', 'function App(value = helper()){ { function helper(){} } return value; }'],
    ['a closure created in a default parameter', 'function App(read = () => helper()){ { function helper(){} } return read(); }'],
    ['another undeclared binding beside a valid helper', 'function App(){ { function helper(){} } return [helper, missing]; }'],
    ['a direct if declaration behind a lexical barrier', 'function App(){ { let helper; if (true) function helper(){} } return helper; }'],
    ['a direct if declaration behind a destructured catch', 'function App(){ try { throw {}; } catch ({helper}) { if (true) function helper(){} } return helper; }'],
    ['an undeclared name inside a valid helper', 'function App(){ { function helper(){ return missing; } } return helper(); }'],
  ])('still rejects %s', (_name, code) => {
    expect(() => assertReactComponentSyntax(code)).not.toThrow()
    expect(() => new Function(code + '; return App();')()).toThrow(ReferenceError)
    expect(() => assertReactComponentBindings(code)).toThrow('Generated React code has unresolved bindings: ' + (code.includes('missing') ? 'missing' : 'helper'))
  })

  it('supports ordinary helpers inside sloppy async functions', async () => {
    const code = 'async function App(){ { function helper(){ return 42; } } return helper(); }'
    expect(await new Function(code + '; return App();')()).toBe(42)
    expect(() => assertReactComponentBindings(code)).not.toThrow()
  })
})
