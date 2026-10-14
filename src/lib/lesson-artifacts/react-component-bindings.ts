import { parse } from 'acorn'
import { analyze, type ScopeManager } from 'eslint-scope'
import { prepareReactComponentCode, REACT_COMPONENT_ARGUMENTS } from './react-component-source'

const REACT_SANDBOX_GLOBALS = new Set([
  'Infinity', 'NaN', 'undefined', 'globalThis',
  'Object', 'Function', 'Boolean', 'Symbol', 'Number', 'BigInt', 'Math', 'Date', 'String', 'RegExp',
  'Array', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float16Array', 'Float32Array', 'Float64Array',
  'BigInt64Array', 'BigUint64Array', 'ArrayBuffer', 'DataView', 'Atomics',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'FinalizationRegistry',
  'Error', 'AggregateError', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError', 'DOMException',
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
  'Element', 'HTMLElement', 'HTMLInputElement', 'SVGElement', 'Node', 'NodeList', 'DocumentFragment',
  'DOMRect', 'DOMPoint', 'DOMMatrix', 'DOMParser', 'XMLSerializer',
  'Image', 'ImageData', 'Audio', 'AudioContext', 'Path2D', 'HTMLCanvasElement', 'CanvasRenderingContext2D', 'OffscreenCanvas',
  'CSS', 'URL', 'URLSearchParams', 'FormData', 'Blob', 'File', 'FileReader', 'TextEncoder', 'TextDecoder',
  'atob', 'btoa', 'fetch', 'Headers', 'Request', 'Response',
  'ReactDOM', 'Recharts', 'ReactLeaflet',
])

function prepareBindingAst(node: unknown, identifiers: Set<object>): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach(child => prepareBindingAst(child, identifiers))
    return
  }
  const current = node as Record<string, unknown>
  if (current.type === 'IfStatement') {
    for (const key of ['consequent', 'alternate']) {
      const clause = current[key] as { type?: string; range?: number[] } | null
      if (clause?.type === 'FunctionDeclaration') {
        current[key] = { type: 'BlockStatement', body: [clause], range: clause.range }
      }
    }
  }
  const argument = current.argument as { type?: string } | undefined
  if (current.type === 'UnaryExpression' && current.operator === 'typeof' && argument?.type === 'Identifier') {
    identifiers.add(argument)
  }
  Object.values(current).forEach(child => prepareBindingAst(child, identifiers))
}

function addLegacyFunctionBindings(source: string, manager: ScopeManager): boolean {
  let changed = false
  for (const scope of manager.scopes) {
    if (scope.isStrict || (scope.type !== 'block' && scope.type !== 'switch')) continue
    const owner = scope.variableScope
    const ownerNode = owner.block
    if (ownerNode.type !== 'FunctionDeclaration' && ownerNode.type !== 'FunctionExpression' && ownerNode.type !== 'ArrowFunctionExpression') continue
    if (ownerNode.body.type !== 'BlockStatement') continue
    for (const variable of scope.variables) {
      if (variable.name === 'arguments' || owner.set.get(variable.name)?.defs.some(definition => definition.type === 'Parameter')) continue
      const declarations = variable.defs.map(definition => definition.node)
        .filter(node => node.type === 'FunctionDeclaration' && node.id && !node.async && !node.generator)
        .sort((left, right) => right.range![0] - left.range![0])
      if (!declarations.length) continue
      let replacement = source
      for (const declaration of declarations) {
        const [start, end] = declaration.range!
        replacement = replacement.slice(0, start) + 'var ' + variable.name + ';' + replacement.slice(end)
      }
      try {
        parse(replacement, { ecmaVersion: 'latest', sourceType: 'script' })
      } catch {
        continue
      }
      const declaration = declarations[0]
      if (declaration.type !== 'FunctionDeclaration' || !declaration.id) continue
      ownerNode.body.body.push({
        type: 'VariableDeclaration', kind: 'var', range: declaration.range,
        declarations: [{ type: 'VariableDeclarator', id: { ...declaration.id }, init: null }],
      })
      changed = true
    }
  }
  return changed
}

export function assertReactComponentBindings(code: string): void {
  const body = prepareReactComponentCode(code)
  const source = '(function(' + REACT_COMPONENT_ARGUMENTS.join(',') + ') {\n' + body + '\n})'
  let ast
  try {
    ast = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      ranges: true,
    })
  } catch {
    throw new Error('Generated React code has invalid JavaScript syntax')
  }
  const safeTypeof = new Set<object>()
  prepareBindingAst(ast, safeTypeof)
  const options = {
    ecmaVersion: 2024,
    sourceType: 'script',
    ignoreEval: true,
  } as const
  const tree = ast as unknown as Parameters<typeof analyze>[0]
  let manager = analyze(tree, options)
  if (addLegacyFunctionBindings(source, manager)) manager = analyze(tree, options)
  const scope = manager.globalScope
  if (!scope) throw new Error('Generated React code bindings could not be analyzed')
  const unresolved = [...new Set(scope.through
    .filter(reference => !safeTypeof.has(reference.identifier) && !REACT_SANDBOX_GLOBALS.has(reference.identifier.name))
    .map(reference => reference.identifier.name))].sort()
  if (unresolved.length) {
    throw new Error('Generated React code has unresolved bindings: ' + unresolved.join(', '))
  }
}
