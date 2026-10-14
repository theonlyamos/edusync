import { parse } from 'acorn'
import { analyze } from 'eslint-scope'
import { prepareReactComponentCode, REACT_COMPONENT_ARGUMENTS } from './react-component-source'

const REACT_SANDBOX_GLOBALS = new Set([
  'Infinity', 'NaN', 'undefined', 'globalThis',
  'Object', 'Function', 'Boolean', 'Symbol', 'Number', 'BigInt', 'Math', 'Date', 'String', 'RegExp',
  'Array', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float16Array', 'Float32Array', 'Float64Array',
  'BigInt64Array', 'BigUint64Array', 'ArrayBuffer', 'SharedArrayBuffer', 'DataView', 'Atomics',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'FinalizationRegistry',
  'Error', 'AggregateError', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError',
  'Promise', 'Reflect', 'Proxy', 'JSON', 'Intl', 'Iterator', 'WebAssembly',
  'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent',
  'eval', 'escape', 'unescape', 'structuredClone',
  'window', 'self', 'document', 'navigator', 'location', 'screen', 'console',
  'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'devicePixelRatio', 'visualViewport',
  'scrollX', 'scrollY', 'pageXOffset', 'pageYOffset', 'lessonViewport',
  'localStorage', 'sessionStorage', 'performance', 'crypto',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'getComputedStyle', 'matchMedia',
  'ResizeObserver', 'MutationObserver', 'IntersectionObserver',
  'Event', 'CustomEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent', 'TouchEvent',
  'EventTarget', 'AbortController', 'AbortSignal',
  'Element', 'HTMLElement', 'SVGElement', 'Node', 'NodeList', 'DocumentFragment',
  'DOMRect', 'DOMPoint', 'DOMMatrix', 'DOMParser', 'XMLSerializer',
  'Image', 'ImageData', 'Path2D', 'HTMLCanvasElement', 'CanvasRenderingContext2D', 'OffscreenCanvas',
  'CSS', 'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'TextEncoder', 'TextDecoder',
  'atob', 'btoa', 'fetch', 'Headers', 'Request', 'Response',
  'ReactDOM', 'Recharts', 'ReactLeaflet',
])

function collectTypeofIdentifiers(node: unknown, identifiers: Set<object>): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach(child => collectTypeofIdentifiers(child, identifiers))
    return
  }
  const current = node as Record<string, unknown>
  const argument = current.argument as { type?: string } | undefined
  if (current.type === 'UnaryExpression' && current.operator === 'typeof' && argument?.type === 'Identifier') {
    identifiers.add(argument)
  }
  Object.values(current).forEach(child => collectTypeofIdentifiers(child, identifiers))
}

export function assertReactComponentBindings(code: string): void {
  const body = prepareReactComponentCode(code)
  let ast
  try {
    ast = parse('(function(' + REACT_COMPONENT_ARGUMENTS.join(',') + ') {\n' + body + '\n})', {
      ecmaVersion: 'latest',
      sourceType: 'script',
      ranges: true,
    })
  } catch {
    throw new Error('Generated React code has invalid JavaScript syntax')
  }
  const safeTypeof = new Set<object>()
  collectTypeofIdentifiers(ast, safeTypeof)
  const scope = analyze(ast as unknown as Parameters<typeof analyze>[0], {
    ecmaVersion: 2024,
    sourceType: 'script',
    ignoreEval: true,
  }).globalScope
  if (!scope) throw new Error('Generated React code bindings could not be analyzed')
  const unresolved = [...new Set(scope.through
    .filter(reference => !safeTypeof.has(reference.identifier) && !REACT_SANDBOX_GLOBALS.has(reference.identifier.name))
    .map(reference => reference.identifier.name))].sort()
  if (unresolved.length) {
    throw new Error('Generated React code has unresolved bindings: ' + unresolved.join(', '))
  }
}
