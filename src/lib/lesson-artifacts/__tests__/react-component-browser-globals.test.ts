import { describe, expect, it } from 'vitest'
import { assertReactComponentBindings } from '../react-component-bindings'

describe('generated React bindings in the non-isolated browser sandbox', () => {
  it.each(['DOMException', 'FormData', 'HTMLInputElement', 'Audio', 'AudioContext'])('accepts the available %s binding without invoking it', name => {
    expect(() => assertReactComponentBindings('function App(){ return ' + name + '; }')).not.toThrow()
  })

  it.each(['SharedArrayBuffer', 'new SharedArrayBuffer(8)', 'typeof SharedArrayBuffer.prototype'])('rejects unavailable %s', expression => {
    expect(() => assertReactComponentBindings('function App(){ return ' + expression + '; }'))
      .toThrow('Generated React code has unresolved bindings: SharedArrayBuffer')
  })

  it('still permits safe feature detection for unavailable bindings', () => {
    expect(() => assertReactComponentBindings('function App(){ return typeof SharedArrayBuffer; }')).not.toThrow()
  })

  it('still permits a locally declared binding with the same name', () => {
    expect(() => assertReactComponentBindings('function App(){ const SharedArrayBuffer = ArrayBuffer; return new SharedArrayBuffer(8); }')).not.toThrow()
  })
})
