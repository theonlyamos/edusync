import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CodeEditor } from '@/components/lessons/CodeEditor';
import type { mountMonacoEditor } from './monaco-bootstrap';

type Bootstrap = { mountMonacoEditor: typeof mountMonacoEditor };
type Script = { src: string; onload: (() => void) | null; onerror: (() => void) | null; remove: ReturnType<typeof vi.fn> };

async function bootstrap() {
  const file = fileURLToPath(new URL('./monaco-bootstrap.ts', import.meta.url));
  const bootstrapModule = await vi.importActual<Bootstrap>(file).catch(() => null);
  expect(bootstrapModule, 'the guarded Monaco bootstrap is missing').not.toBeNull();
  return bootstrapModule!;
}

function environment() {
  const scripts: Script[] = [];
  const runtime: { require?: unknown; monaco?: unknown } = {};
  const document = {
    createElement: vi.fn(() => {
      const script: Script = { src: '', onload: null, onerror: null, remove: vi.fn() };
      scripts.push(script);
      return script;
    }),
    head: { appendChild: vi.fn() },
  };
  vi.stubGlobal('window', runtime);
  vi.stubGlobal('document', document);
  return { scripts, runtime, document };
}

function editorApi() {
  let value = '';
  let listener: (() => void) | undefined;
  const model = {
    getValue: () => value,
    setValue: vi.fn((next: string) => { value = next; listener?.(); }),
    dispose: vi.fn(),
  };
  const subscription = { dispose: vi.fn() };
  const editor = {
    onDidChangeModelContent: vi.fn((callback: () => void) => { listener = callback; return subscription; }),
    focus: vi.fn(),
    dispose: vi.fn(),
  };
  const api = { editor: {
    createModel: vi.fn((initial: string) => { value = initial; return model; }),
    create: vi.fn(() => editor),
  } };
  return { api, model, editor, subscription };
}

function amd(api: unknown) {
  const require = Object.assign(vi.fn((_ids: string[], success: (loaded: unknown) => void) => success(api)), { config: vi.fn() });
  return require;
}

async function start(runtime: ReturnType<typeof environment>, signal = new AbortController().signal, code = 'const answer = () => 42;') {
  const { mountMonacoEditor } = await bootstrap();
  const onChange = vi.fn();
  const pending = mountMonacoEditor({} as HTMLElement, { getValue: () => code, language: 'javascript', onChange }, signal);
  void pending.catch(() => {});
  return { pending, onChange, runtime };
}

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('guarded Monaco bootstrap', () => {
  it('does not initialize or request scripts merely by importing the helper', async () => {
    const env = environment();
    await bootstrap();
    expect(env.document.createElement).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([undefined, {}, { config: () => {} }, Object.assign(() => {}, { config: undefined })])(
    'handles a fulfilled but empty loader without an escaping require.config TypeError (%s)', async (missing) => {
      const env = environment();
      const { pending } = await start(env);
      env.runtime.require = missing;
      expect(() => env.scripts[0].onload?.()).not.toThrow();
      await expect(pending).rejects.toThrow('Code editor unavailable');
      expect(env.scripts[0].remove).toHaveBeenCalledOnce();
      expect(env.scripts[0].onload).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    });

  it('uses the existing fixed loader URL and guards exceptions in AMD configuration', async () => {
    const env = environment();
    const { pending } = await start(env);
    expect(env.scripts[0].src).toBe('https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs/loader.js');
    env.runtime.require = Object.assign(() => {}, { config: () => { throw new Error('PRIVATE'); } });
    expect(() => env.scripts[0].onload?.()).not.toThrow();
    await expect(pending).rejects.toThrow(/^Code editor unavailable$/);
  });

  it('bounds both the script and AMD module wait and ignores late completion', async () => {
    const env = environment();
    const { pending } = await start(env);
    let complete!: (loaded: unknown) => void;
    env.runtime.require = Object.assign((_ids: string[], success: typeof complete) => { complete = success; }, { config: vi.fn() });
    env.scripts[0].onload?.();
    await vi.advanceTimersByTimeAsync(8000);
    await expect(pending).rejects.toThrow('Code editor unavailable');
    const { api } = editorApi();
    expect(() => complete(api)).not.toThrow();
    expect(api.editor.create).not.toHaveBeenCalled();
    expect(env.scripts[0].remove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects script failure without leaking its error and removes owned callbacks', async () => {
    const env = environment();
    const { pending } = await start(env);
    env.scripts[0].onerror?.();
    await expect(pending).rejects.toThrow(/^Code editor unavailable$/);
    expect(env.scripts[0].onload).toBeNull();
    expect(env.scripts[0].onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not begin a load for an already closed editor', async () => {
    const env = environment();
    const controller = new AbortController();
    controller.abort();
    const { pending } = await start(env, controller.signal);
    await expect(pending).rejects.toThrow('Code editor unavailable');
    expect(env.scripts).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('converts AMD module failures and invalid APIs into the unavailable result', async () => {
    const env = environment();
    const { pending } = await start(env);
    env.runtime.require = Object.assign((_ids: string[], _success: unknown, failure: (error: unknown) => void) => failure(new Error('PRIVATE')), { config: vi.fn() });
    env.scripts[0].onload?.();
    await expect(pending).rejects.toThrow(/^Code editor unavailable$/);
    env.runtime.require = amd({ editor: { create: 'not executable' } });
    const retryByExplicitReopen = await start(env);
    await expect(retryByExplicitReopen.pending).rejects.toThrow(/^Code editor unavailable$/);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts an unopened editor and cannot create one from a saved late script callback', async () => {
    const env = environment();
    const controller = new AbortController();
    const { pending } = await start(env, controller.signal);
    const onload = env.scripts[0].onload;
    controller.abort();
    await expect(pending).rejects.toThrow('Code editor unavailable');
    const { api } = editorApi();
    env.runtime.require = amd(api);
    onload?.();
    expect(api.editor.create).not.toHaveBeenCalled();
    expect(env.scripts[0].remove).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shares an in-flight runtime without one editor cancellation affecting another', async () => {
    const env = environment();
    const first = new AbortController(), second = new AbortController();
    const a = await start(env, first.signal), b = await start(env, second.signal);
    expect(env.scripts).toHaveLength(1);
    first.abort();
    await expect(a.pending).rejects.toThrow('Code editor unavailable');
    expect(env.scripts[0].remove).not.toHaveBeenCalled();
    const { api } = editorApi();
    env.runtime.require = amd({ m: api });
    env.scripts[0].onload?.();
    const instance = await b.pending;
    expect(api.editor.create).toHaveBeenCalledOnce();
    instance.dispose();
  });

  it('owns editable model data, disposes editor resources once, and reuses a loaded runtime on reopen', async () => {
    const env = environment();
    const { api, model, editor, subscription } = editorApi();
    env.runtime.require = amd(api);
    const controller = new AbortController();
    const { pending, onChange } = await start(env, controller.signal);
    const instance = await pending;
    expect(env.scripts).toHaveLength(0);
    instance.setValue('const edited = () => 7;');
    expect(model.getValue()).toBe('const edited = () => 7;');
    expect(onChange).toHaveBeenCalledWith('const edited = () => 7;');
    controller.abort();
    instance.dispose();
    expect(subscription.dispose).toHaveBeenCalledOnce();
    expect(editor.dispose).toHaveBeenCalledOnce();
    expect(model.dispose).toHaveBeenCalledOnce();
    const reopened = await start(env);
    const second = await reopened.pending;
    expect((env.runtime.require as ReturnType<typeof amd>)).toHaveBeenCalledOnce();
    second.dispose();
  });

  it('disposes an allocated model if editor creation throws', async () => {
    const env = environment();
    const { api, model } = editorApi();
    api.editor.create.mockImplementation(() => { throw new Error('PRIVATE'); });
    env.runtime.require = amd(api);
    const { pending } = await start(env);
    await expect(pending).rejects.toThrow(/^Code editor unavailable$/);
    expect(model.dispose).toHaveBeenCalledOnce();
  });

  it('starts from the latest fallback text after loading, without executing that text', async () => {
    const env = environment();
    const { mountMonacoEditor } = await bootstrap();
    const { api, model } = editorApi();
    let code = 'const first = () => 1;';
    const pending = mountMonacoEditor({} as HTMLElement, { getValue: () => code, language: 'javascript', onChange: vi.fn() }, new AbortController().signal);
    code = 'throw new Error("text only");';
    env.runtime.require = amd(api);
    env.scripts[0].onload?.();
    const instance = await pending;
    expect(model.getValue()).toBe(code);
    expect(api.editor.createModel).toHaveBeenCalledWith(code, 'javascript');
    instance.dispose();
  });

  it('forwards requested focus only while the owned editor remains mounted', async () => {
    const env = environment();
    const { api, editor } = editorApi();
    env.runtime.require = amd(api);
    const { pending } = await start(env);
    const instance = await pending;
    expect(editor.focus).not.toHaveBeenCalled();
    expect(typeof instance.focus).toBe('function');
    instance.focus();
    expect(editor.focus).toHaveBeenCalledOnce();
    instance.dispose();
    instance.focus();
    expect(editor.focus).toHaveBeenCalledOnce();
  });

  it('shows Run Tests only when the caller provides a submit callback', () => {
    const data = { initialCode: 'const exercise = () => 1;', language: 'javascript', tests: [] };
    const withoutSubmit = renderToStaticMarkup(createElement(CodeEditor, { data }));
    expect(withoutSubmit).not.toContain('Run Tests');
    const withSubmit = renderToStaticMarkup(createElement(CodeEditor, { data, onSubmit: vi.fn() }));
    expect(withSubmit).toContain('Run Tests');
  });
});
