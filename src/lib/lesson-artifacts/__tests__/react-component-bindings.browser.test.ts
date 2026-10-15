import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { prepareReactComponentCode, REACT_COMPONENT_ARGUMENTS } from '../react-component-source';
import { renderReactSandboxScripts } from '../react-sandbox-runtime';
import { SANDBOX_RESPONSIVE_SCRIPT, SANDBOX_RESPONSIVE_STYLES } from '../sandbox-responsive';
import { codingEditorBridgeScript } from '../coding-editor-bridge';

const chromiumExecutable = process.env.CHROMIUM_EXECUTABLE_PATH;
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const nonce = 'offlineReactBindingRegression';
const editorToken = '0'.repeat(32);
const policy = `default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data:; frame-src 'self' about:; connect-src 'none'; worker-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;

const guardScript = `
  window.__offlineSecurity = { captureCalls: 0, networkCalls: 0, workerCalls: 0 };
  (function () {
    const lock = (target, name, value) => Object.defineProperty(target, name, { value, writable: false, configurable: false });
    const captureDenied = () => { window.__offlineSecurity.captureCalls++; throw new Error('OFFLINE_CAPTURE_PROHIBITED'); };
    const networkDenied = () => { window.__offlineSecurity.networkCalls++; throw new Error('OFFLINE_NETWORK_PROHIBITED'); };
    const workerDenied = () => { window.__offlineSecurity.workerCalls++; throw new Error('OFFLINE_WORKER_PROHIBITED'); };
    const media = navigator.mediaDevices;
    for (const name of ['getUserMedia', 'getDisplayMedia']) {
      if (window.MediaDevices) lock(MediaDevices.prototype, name, captureDenied);
      if (media) lock(media, name, captureDenied);
    }
    if (media) lock(media, 'enumerateDevices', () => Promise.resolve([]));
    const disabledMedia = media || Object.freeze({ getUserMedia: captureDenied, getDisplayMedia: captureDenied, enumerateDevices: () => Promise.resolve([]) });
    lock(navigator, 'mediaDevices', disabledMedia);
    for (const name of ['getUserMedia', 'webkitGetUserMedia', 'mozGetUserMedia', 'msGetUserMedia']) {
      lock(Navigator.prototype, name, captureDenied);
      lock(navigator, name, captureDenied);
    }
    lock(window, 'MediaRecorder', undefined);
    if (window.ServiceWorkerContainer) lock(ServiceWorkerContainer.prototype, 'register', workerDenied);
    Object.defineProperty(navigator, 'serviceWorker', { get: () => { throw new Error('OFFLINE_SERVICE_WORKER_PROHIBITED'); }, configurable: false });
    for (const name of ['Worker', 'SharedWorker']) lock(window, name, workerDenied);
    for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'open']) lock(window, name, networkDenied);
    lock(navigator, 'sendBeacon', networkDenied);
  })();
  function offlineGuardState() {
    const locked = (target, name) => {
      const descriptor = Object.getOwnPropertyDescriptor(target, name);
      return !!descriptor && descriptor.writable === false && descriptor.configurable === false;
    };
    let serviceWorkerInaccessible = false;
    let canReadParent = false;
    try { void navigator.serviceWorker; } catch { serviceWorkerInaccessible = true; }
    try { void parent.document; canReadParent = true; } catch {}
    return {
      ...window.__offlineSecurity,
      mediaLocked: locked(navigator, 'getUserMedia') && locked(navigator, 'mediaDevices') && locked(navigator.mediaDevices, 'getUserMedia') && locked(navigator.mediaDevices, 'getDisplayMedia') && locked(window, 'MediaRecorder'),
      serviceWorkerInaccessible,
      workersLocked: locked(window, 'Worker') && locked(window, 'SharedWorker'),
      canReadParent,
      origin: self.origin,
      documentUrl: document.URL,
      crossOriginIsolated: self.crossOriginIsolated,
      browserBindings: { DOMException: typeof DOMException, FormData: typeof FormData, HTMLInputElement: typeof HTMLInputElement, Audio: typeof Audio, AudioContext: typeof AudioContext, SharedArrayBuffer: typeof SharedArrayBuffer }
    };
  }
`;

type SecurityState = {
  captureCalls: number;
  networkCalls: number;
  workerCalls: number;
  mediaLocked: boolean;
  serviceWorkerInaccessible: boolean;
  workersLocked: boolean;
  canReadParent: boolean;
  origin: string;
  documentUrl: string;
  crossOriginIsolated: boolean;
  browserBindings: Record<string, string>;
};

type FrameEvidence = {
  kind: string;
  messages: { type: string; error?: string }[];
  visibleError: string;
  messageOrigin: string;
  sandbox: string;
  permissions: string;
  phases: string[];
  probe?: {
    security: SecurityState;
    buttonCount: number;
    steps: { choice: string; text: string; enabled: boolean }[];
    failure?: string;
  };
};

function escapeAttribute(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function rendererTemplate(rendererSource: string) {
  const sourceFile = ts.createSourceFile('ReactRenderer.tsx', rendererSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let html: ts.Expression | undefined;
  let returnStatement: ts.Expression | undefined;
  let sandbox: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node)) {
      if (node.name.getText(sourceFile) === 'htmlContent') html = node.initializer;
      if (node.name.getText(sourceFile) === 'returnStatement') returnStatement = node.initializer;
    }
    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === 'sandbox' && node.initializer && ts.isStringLiteral(node.initializer)) sandbox = node.initializer.text;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!html || !ts.isTemplateExpression(html) || !returnStatement || !ts.isStringLiteral(returnStatement)) throw new Error('ReactRenderer HTML template contract changed');
  expect(sandbox).toBe('allow-scripts');
  const build = new Function(
    'needsLeaflet', 'needsRecharts', 'nonce', 'reactRuntimeScripts',
    'SANDBOX_RESPONSIVE_STYLES', 'SANDBOX_RESPONSIVE_SCRIPT', 'codeJson',
    'returnStatementJson', 'REACT_COMPONENT_ARGUMENTS', 'codingEditorBridgeScript', 'editorToken', 'window',
    `return (${html.getText(sourceFile)});`,
  ) as (...values: unknown[]) => string;
  return { build, returnStatement: returnStatement.text, sandbox: sandbox! };
}

function buildRendererHtml(template: ReturnType<typeof rendererTemplate>, source: string, runtime: string): string {
  return template.build(false, false, nonce, runtime, SANDBOX_RESPONSIVE_STYLES, SANDBOX_RESPONSIVE_SCRIPT, JSON.stringify(prepareReactComponentCode(source)), JSON.stringify(template.returnStatement), REACT_COMPONENT_ARGUMENTS, codingEditorBridgeScript, editorToken, { location: { origin: 'null' } });
}

function childProbe(kind: string): string {
  return `
    (function () {
      const kind = ${JSON.stringify(kind)};
      const steps = [];
      const root = () => document.getElementById('root');
      const buttons = () => Array.from(root().querySelectorAll('button'));
      const send = failure => parent.postMessage({ type: 'offline-binding-probe', kind, probe: { security: offlineGuardState(), buttonCount: buttons().length, steps, failure } }, '*');
      const phase = value => parent.postMessage({ type: 'offline-binding-phase', kind, phase: value }, '*');
      function run() {
        try {
          phase('dom-ready');
          if (kind === 'missing') {
            if (!window.__lessonRenderFailed && !root().querySelector('.error')) throw new Error('Missing fixture did not fail during actual renderer initialization');
          } else {
            if (buttons().length !== 2 || !window.ReactDOM) throw new Error('Stateful fixture did not render both answer buttons');
            for (const choice of ['Oxygen', 'Carbon Dioxide', 'Oxygen']) {
              phase('click:' + choice);
              const button = buttons().find(candidate => candidate.textContent.includes(choice));
              if (!button || button.disabled) throw new Error('Missing or disabled answer button: ' + choice);
              ReactDOM.flushSync(() => button.click());
              steps.push({ choice, text: root().innerText, enabled: buttons().length === 2 && buttons().every(candidate => !candidate.disabled) });
            }
          }
          phase('complete');
          send();
        } catch (error) {
          send(error.message || String(error));
        }
      }
      phase('registered');
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
      else run();
    })();
  `;
}

function parentDocument(children: { kind: string; html: string }[], sandbox: string): string {
  const permissions = "camera 'none'; microphone 'none'; display-capture 'none'";
  const records = children.map(({ kind }) => ({ kind, messages: [], visibleError: '', messageOrigin: '', sandbox, permissions, phases: [] }));
  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(policy)}"><script nonce="${nonce}">
    ${guardScript}
    const records = ${JSON.stringify(records)};
    function publish() {
      const evidence = JSON.stringify({ parent: offlineGuardState(), frames: records });
      document.getElementById('offline-progress').textContent = evidence;
      if (records.every(record => record.probe && record.messages.some(message => message.type === (record.kind === 'missing' ? 'react-render-error' : 'react-render-ready')))) document.getElementById('offline-result').textContent = evidence;
    }
    addEventListener('message', event => {
      const index = records.findIndex(record => document.getElementById(record.kind).contentWindow === event.source);
      if (index < 0 || !event.data || typeof event.data.type !== 'string') return;
      const record = records[index];
      record.messageOrigin = event.origin;
      if (event.data.type === 'react-render-error' || event.data.type === 'react-render-ready') {
        record.messages.push(event.data);
        if (event.data.type === 'react-render-error') {
          record.visibleError = 'Component Error: ' + event.data.error;
          document.getElementById(record.kind + '-error').textContent = record.visibleError;
        }
      }
      if (event.data.type === 'offline-binding-probe' && event.data.kind === record.kind) record.probe = event.data.probe;
      if (event.data.type === 'offline-binding-phase' && event.data.kind === record.kind) record.phases.push(event.data.phase);
      publish();
    });
  </script></head><body><pre id="offline-result"></pre><pre id="offline-progress"></pre>${children.map(({ kind, html }) => `<div id="${kind}-error"></div><iframe id="${kind}" title="${kind}" sandbox="${sandbox}" allow="${escapeAttribute(permissions)}" srcdoc="${escapeAttribute(html)}"></iframe>`).join('')}</body></html>`;
}

function stopBrowser(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null) return Promise.resolve();
  if (process.platform !== 'win32') {
    child.kill('SIGTERM');
    return Promise.resolve();
  }
  return new Promise(resolveStopped => {
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => resolveStopped());
  });
}

async function runBrowser(executable: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string; failure?: string }>(resolveRun => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout!.setEncoding('utf8');
    child.stderr!.setEncoding('utf8');
    let stdout = '';
    let stderr = '';
    let failure: string | undefined;
    const timer = setTimeout(() => {
      failure = 'Chromium exceeded the offline regression timeout';
      void stopBrowser(child);
    }, 20000);
    child.stdout!.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.length > 8 * 1024 * 1024) {
        failure = 'Chromium DOM output exceeded the regression limit';
        void stopBrowser(child);
      }
    });
    child.stderr!.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', error => { failure = error.message; });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolveRun({ stdout, stderr, failure: failure || (code === 0 ? undefined : `Chromium exited with code ${code}, signal ${signal}`) });
    });
  });
}

function expectCaptureDisabled(state: SecurityState) {
  expect(state.captureCalls).toBe(0);
  expect(state.networkCalls).toBe(0);
  expect(state.workerCalls).toBe(0);
  expect(state.mediaLocked).toBe(true);
  expect(state.serviceWorkerInaccessible).toBe(true);
  expect(state.workersLocked).toBe(true);
}

describe('generated React bindings in the offline browser sandbox', () => {
  it('builds the current renderer template with its explicit coding bridge context without Chromium', async () => {
    const rendererSource = await readFile(join(repoRoot, 'src/components/lessons/ReactRenderer.tsx'), 'utf8');
    const template = rendererTemplate(rendererSource);
    const html = buildRendererHtml(template, 'const Component = () => null;', '');
    expect(html).toContain(codingEditorBridgeScript(editorToken, 'null'));
    expect(html).toContain('const Component = () => null;');
    expect(template.sandbox).toBe('allow-scripts');
  });

  it.skipIf(!chromiumExecutable)('reproduces missing selected and keeps stateful answers interactive without capture', async () => {
    const tempRoot = resolve(tmpdir());
    const directory = await mkdtemp(join(tempRoot, 'lesson-react-bindings-'));
    let passed = false;
    try {
      const [rendererSource, missing, stateful, react, reactDom, tailwindCss] = await Promise.all([
        readFile(join(repoRoot, 'src/components/lessons/ReactRenderer.tsx'), 'utf8'),
        readFile(new URL('./fixtures/selected-missing.txt', import.meta.url), 'utf8'),
        readFile(new URL('./fixtures/selected-stateful.txt', import.meta.url), 'utf8'),
        readFile(join(repoRoot, 'public/lesson-runtime/react-18.3.1.production.min.js'), 'utf8'),
        readFile(join(repoRoot, 'public/lesson-runtime/react-dom-18.3.1.production.min.js'), 'utf8'),
        readFile(join(repoRoot, 'public/lesson-runtime/tailwind.generated.css'), 'utf8'),
      ]);
      const template = rendererTemplate(rendererSource);
      const runtime = renderReactSandboxScripts(nonce, { react, reactDom, tailwindCss });
      const children = [{ kind: 'missing', source: missing }, { kind: 'stateful', source: stateful }].map(({ kind, source }) => {
        const html = buildRendererHtml(template, source, runtime);
        const guarded = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(policy)}"><script nonce="${nonce}">${guardScript}</script>`);
        expect(guarded).not.toBe(html);
        return { kind, html: guarded.replace('</body>', `<script nonce="${nonce}">${childProbe(kind)}</script></body>`) };
      });
      const harnessPath = join(directory, 'regression.html');
      await writeFile(harnessPath, parentDocument(children, template.sandbox));
      const args = [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
        '--disable-sync', '--disable-extensions', '--disable-domain-reliability',
        '--metrics-recording-only', '--use-fake-device-for-media-stream',
        '--host-resolver-rules=MAP * ~NOTFOUND', '--proxy-server=http://127.0.0.1:9',
        '--proxy-bypass-list=<-loopback>', `--user-data-dir=${join(directory, 'profile')}`,
        '--virtual-time-budget=5000', '--dump-dom', pathToFileURL(harnessPath).href,
      ];
      expect(args).not.toContain('--no-sandbox');
      expect(args).toContain('--use-fake-device-for-media-stream');
      const run = await runBrowser(chromiumExecutable!, args);
      await Promise.all([writeFile(join(directory, 'stdout.html'), run.stdout), writeFile(join(directory, 'stderr.txt'), run.stderr)]);
      expect(run.failure).toBeUndefined();
      const encoded = run.stdout.match(/<pre id="offline-result">([\s\S]*?)<\/pre>/)?.[1];
      const progress = run.stdout.match(/<pre id="offline-progress">([\s\S]*?)<\/pre>/)?.[1];
      expect(encoded, `${run.stderr}\nLast browser phases: ${progress || 'No frame messages received'}`).toBeTruthy();
      const decoded = encoded!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      const evidence = JSON.parse(decoded) as { parent: SecurityState; frames: FrameEvidence[]; timeout?: boolean };
      await writeFile(join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
      expect(evidence.timeout).toBeUndefined();
      expectCaptureDisabled(evidence.parent);
      expect(evidence.frames).toHaveLength(2);
      for (const frame of evidence.frames) {
        expect(frame.sandbox).toBe('allow-scripts');
        expect(frame.permissions).toContain("microphone 'none'");
        expect(frame.messageOrigin).toBe('null');
        expect(frame.probe?.failure).toBeUndefined();
        expect(frame.phases).toContain('complete');
        expect(frame.probe).toBeDefined();
        expectCaptureDisabled(frame.probe!.security);
        expect(frame.probe!.security.canReadParent).toBe(false);
        expect(frame.probe!.security.origin).toBe('null');
        expect(frame.probe!.security.documentUrl).toBe('about:srcdoc');
        expect(frame.probe!.security.crossOriginIsolated).toBe(false);
        expect(frame.probe!.security.browserBindings).toEqual({ DOMException: 'function', FormData: 'function', HTMLInputElement: 'function', Audio: 'function', AudioContext: 'function', SharedArrayBuffer: 'undefined' });
      }
      const broken = evidence.frames.find(frame => frame.kind === 'missing')!;
      expect(broken.messages).toContainEqual({ type: 'react-render-error', error: 'selected is not defined' });
      expect(broken.messages.some(message => message.type === 'react-render-ready')).toBe(false);
      expect(broken.visibleError).toBe('Component Error: selected is not defined');
      expect(broken.probe!.buttonCount).toBe(0);
      const working = evidence.frames.find(frame => frame.kind === 'stateful')!;
      expect(working.messages.some(message => message.type === 'react-render-ready')).toBe(true);
      expect(working.messages.some(message => message.type === 'react-render-error')).toBe(false);
      expect(working.visibleError).toBe('');
      expect(working.probe!.buttonCount).toBe(2);
      expect(working.probe!.steps.map(step => step.choice)).toEqual(['Oxygen', 'Carbon Dioxide', 'Oxygen']);
      expect(working.probe!.steps.every(step => step.enabled)).toBe(true);
      const [incorrect, correct, incorrectAgain] = working.probe!.steps;
      expect(incorrect.text).toContain('Not quite');
      expect(incorrect.text).toContain("that's what they RELEASE");
      expect(correct.text).toContain('Correct! Plants absorb CO');
      expect(correct.text).not.toContain('Not quite');
      expect(incorrectAgain.text).toContain('Not quite');
      expect(incorrectAgain.text).toContain("that's what they RELEASE");
      expect(incorrectAgain.text).not.toContain('Correct! Plants absorb CO');
      passed = true;
    } catch (error) {
      await writeFile(join(directory, 'failure.txt'), error instanceof Error ? error.stack || error.message : String(error));
      throw new Error(`Offline Chromium binding regression failed; evidence retained at ${directory}`, { cause: error });
    } finally {
      if (passed) {
        const descendant = relative(tempRoot, resolve(directory));
        if (!descendant || descendant.startsWith('..') || isAbsolute(descendant) || !basename(directory).startsWith('lesson-react-bindings-')) throw new Error('Refusing to remove an unexpected browser profile directory');
        await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    }
  }, 35000);
});
