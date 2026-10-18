type Disposable = { dispose(): void };
type Model = Disposable & { getValue(): string; setValue(value: string): void };
type Editor = Disposable & { onDidChangeModelContent(callback: () => void): Disposable; focus(): void };
type MonacoApi = { editor: {
  createModel(value: string, language: string): Model;
  create(host: HTMLElement, options: Record<string, unknown>): Editor;
} };
type AmdRequire = ((ids: string[], success: (value: unknown) => void, failure: () => void) => void) & {
  config(options: { paths: { vs: string } }): void;
};
export type MountedMonacoEditor = { setValue(value: string): void; focus(): void; dispose(): void };

const MONACO_BASE = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs';
const unavailable = () => new Error('Code editor unavailable');
let ready: MonacoApi | undefined;
let loading: { controller: AbortController; promise: Promise<MonacoApi>; users: number } | undefined;

function isMonaco(value: unknown): value is MonacoApi {
  const api = value as MonacoApi | null;
  return !!api && typeof api.editor?.create === 'function' && typeof api.editor?.createModel === 'function';
}

function startRuntime(signal: AbortSignal): Promise<MonacoApi> {
  return new Promise((resolve, reject) => {
    let script: HTMLScriptElement | undefined;
    let settled = false;
    const finish = (api?: MonacoApi) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      if (script) { script.onload = null; script.onerror = null; script.remove(); }
      if (api) resolve(api); else reject(unavailable());
    };
    const abort = () => finish();
    const timeout = setTimeout(abort, 8000);
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) { finish(); return; }
      const runtime = window as unknown as { require?: AmdRequire; monaco?: unknown };
      if (isMonaco(runtime.monaco)) { finish(runtime.monaco); return; }
      const configure = () => {
        if (settled) return;
        try {
          const amd = runtime.require;
          if (typeof amd !== 'function' || typeof amd.config !== 'function') { finish(); return; }
          amd.config({ paths: { vs: MONACO_BASE } });
          amd(['vs/editor/editor.main'], loaded => {
            if (settled) return;
            try {
              const api = (loaded as { m?: unknown } | null)?.m || loaded;
              finish(isMonaco(api) ? api : undefined);
            } catch { finish(); }
          }, abort);
        } catch { finish(); }
      };
      if (typeof runtime.require === 'function' && typeof runtime.require.config === 'function') configure();
      else {
        script = document.createElement('script');
        script.src = MONACO_BASE + '/loader.js';
        script.onload = configure;
        script.onerror = abort;
        document.head.appendChild(script);
      }
    } catch { finish(); }
  });
}

function loadMonaco(signal: AbortSignal): Promise<MonacoApi> {
  if (signal.aborted) return Promise.reject(unavailable());
  if (ready) return Promise.resolve(ready);
  if (!loading) {
    const controller = new AbortController();
    const load = { controller, promise: startRuntime(controller.signal), users: 0 };
    loading = load;
    void load.promise.then(api => {
      ready = api;
      if (loading === load) loading = undefined;
    }, () => { if (loading === load) loading = undefined; });
  }
  const load = loading;
  load.users++;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (api?: MonacoApi) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      load.users--;
      if (load.users === 0 && loading === load) { loading = undefined; load.controller.abort(); }
      if (api) resolve(api); else reject(unavailable());
    };
    const abort = () => finish();
    signal.addEventListener('abort', abort, { once: true });
    void load.promise.then(api => finish(api), abort);
    if (signal.aborted) abort();
  });
}

export async function mountMonacoEditor(
  host: HTMLElement,
  options: { getValue(): string; language: string; onChange(value: string): void },
  signal: AbortSignal,
): Promise<MountedMonacoEditor> {
  const monaco = await loadMonaco(signal);
  if (signal.aborted) throw unavailable();
  let model: Model | undefined, editor: Editor | undefined, subscription: Disposable | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    for (const resource of [subscription, editor, model]) { try { resource?.dispose(); } catch { continue; } }
  };
  try {
    model = monaco.editor.createModel(options.getValue(), options.language);
    editor = monaco.editor.create(host, {
      model, automaticLayout: true, theme: 'vs-dark', minimap: { enabled: false }, fontSize: 14,
    });
    const ownedModel = model;
    subscription = editor.onDidChangeModelContent(() => { if (!disposed) options.onChange(ownedModel.getValue()); });
    signal.addEventListener('abort', dispose, { once: true });
    if (signal.aborted) throw unavailable();
    return {
      setValue(value) { if (!disposed && ownedModel.getValue() !== value) ownedModel.setValue(value); },
      focus() { if (!disposed) editor?.focus(); },
      dispose,
    };
  } catch { dispose(); throw unavailable(); }
}
