import { describe, expect, it } from 'vitest'
import { readCodingEditorRequest, codingEditorBridgeScript } from '../coding-editor-bridge'
import { assertReactComponentBindings } from '../react-component-bindings'
import { runInNewContext } from 'node:vm'

const token = '0123456789abcdef0123456789abcdef'
const frame = {} as Window
const payload = { type: 'lesson-open-code-editor', token, code: 'print("hello")', language: 'python' }
const event = (data: unknown = payload, source: Window | null = frame, origin = 'null') => ({ data, source, origin }) as MessageEvent

describe('sandbox coding editor capability', () => {
  it('accepts bounded text only from the active opaque iframe and current render token', () => {
    expect(readCodingEditorRequest(event(), frame, token, true)).toEqual({ code: 'print("hello")', language: 'python' })
    expect(readCodingEditorRequest(event(), frame, token)).toBeNull()
    expect(readCodingEditorRequest(event(), frame, token, false)).toBeNull()
    expect(readCodingEditorRequest(event(), frame, 'f'.repeat(32), true)).toBeNull()
    expect(readCodingEditorRequest(event(payload, {} as Window), frame, token, true)).toBeNull()
    expect(readCodingEditorRequest(event(payload, null), null, token, true)).toBeNull()
    expect(readCodingEditorRequest(event(payload, frame, 'https://example.test'), frame, token, true)).toBeNull()
  })

  it('rejects oversized or malformed requests, options, URLs and execution commands', () => {
    for (const data of [null, [], { ...payload, code: 'x'.repeat(50_001) }, { ...payload, language: 'unknown' },
      { ...payload, code: 1 }, { ...payload, options: {} }, { ...payload, execute: true },
      { ...payload, url: 'https://example.test' }, { ...payload, token: '' }]) {
      expect(readCodingEditorRequest(event(data), frame, token, true)).toBeNull()
    }
  })

  it('sends an explicit request to the parent without evaluating the provided code', () => {
    const messages: unknown[] = []
    const window = { parent: { postMessage: (data: unknown, target: string) => messages.push({ data, target }) } }
    const navigator = { userActivation: { isActive: false } }
    runInNewContext(codingEditorBridgeScript(token, 'https://lesson.test'), { window, navigator })
    expect(messages).toEqual([])
    ;(window as typeof window & { openCodeEditor: (request: unknown) => void }).openCodeEditor({ code: 'throw Error("must not execute")', language: 'javascript' })
    expect(messages).toEqual([])
    navigator.userActivation.isActive = true
    ;(window as typeof window & { openCodeEditor: (request: unknown) => void }).openCodeEditor({ code: 'throw Error("must not execute")', language: 'javascript' })
    expect(messages).toEqual([{ data: { type: 'lesson-open-code-editor', token, code: 'throw Error("must not execute")', language: 'javascript' }, target: 'https://lesson.test' }])
  })

  it('accepts the injected helper in generated React bindings without executing it', () => {
    expect(() => assertReactComponentBindings("function App(){return React.createElement(Button,{onClick:()=>openCodeEditor({code:'print(1)',language:'python'})},'Open coding editor');}")).not.toThrow()
  })
})
