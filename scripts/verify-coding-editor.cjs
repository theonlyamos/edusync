const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const repo = path.resolve(__dirname, '..');
const taskRoot = path.dirname(repo);
const evidenceRoot = path.join(taskRoot, 'visualization-editor-evidence', 'browser');
const output = path.join(evidenceRoot, new Date().toISOString().replace(/[:.]/g, '-'));
const runtime = path.join(taskRoot, 'synthetic-only-harness-diagnostics-2026-10-15', 'service-worker-runtime.cjs');
const executable = process.env.CHROMIUM_EXECUTABLE_PATH || 'C:/Users/Ph4n70m/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const monacoBase = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs/';
const monacoRoot = path.join(repo, 'node_modules/.pnpm/monaco-editor@0.55.1/node_modules/monaco-editor/min/vs');
const localRequire = name => require(require.resolve(name, { paths: [repo] }));
const report = { startedUtc: new Date().toISOString(), passed: false, browserClosed: false, cases: [], requests: [], sockets: 0, pageErrors: [], stubs: ['Next dynamic adapter retains lazy React loading but does not verify Next chunk transport', 'VoiceControl boundary uses the actual PCM queue with a synthetic context; no provider, hook, microphone or audio hardware', 'Tutor data APIs and generated visualization are memory fixtures', 'html-to-image is replaced by an observer of the actual TutorExperience filter', 'Controlled Monaco fixture verifies lifecycle ownership; separate installed Monaco case verifies actual AMD/editor initialization'], limitations: ['No live CDN availability, provider semantics, microphone, real audio continuity, full Next navigation, or generated-program correctness is verified'] };
report.nodePid = process.pid;
report.resourceCounterScope = 'Models and editors created through the public API; subscription counts cover the first registration immediately after each editor is returned to mountMonacoEditor. Later Monaco internal registrations are recorded separately and all original event arguments are forwarded.';

function reactFixture(coding, revision = 0, automatic = false) {
  return `${automatic ? "window.__activationProbe=[{phase:'source',isActive:navigator.userActivation?.isActive===true}];openCodeEditor({code:'function automatic(){return 1}',language:'javascript'});window.__automaticAttempted=true;setTimeout(()=>{window.__activationProbe.push({phase:'timer',isActive:navigator.userActivation?.isActive===true});openCodeEditor({code:'function programmatic(){return 2}',language:'javascript'});window.__programmaticAttempted=true},0);" : ''}
function Component(){const [count,setCount]=React.useState(0);return React.createElement('div',null,
React.createElement('h1',null,'Synthetic photosynthesis ${revision}'),
React.createElement('button',{onClick:()=>setCount(count+1)},'Increment preview'),React.createElement('p',{'data-counter':true},'Preview count: '+count)
${coding ? ",React.createElement('button',{onClick:()=>openCodeEditor({code:'function lesson(){return 7}',language:'javascript'})},'Open coding editor'),React.createElement('button',{onClick:()=>parent.postMessage({type:'lesson-open-code-editor',token:'00000000000000000000000000000000',code:'forged',language:'javascript'},'*')},'Forge invalid token')" : ''});}`;
}

function initGuards() {
  const state = { ready: false, captureCalls: 0, messageListeners: 0, appMessageListeners: 0 };
  window.__guard = state;
  window.__monacoProbe = { configCalls: 0, requireCalls: 0, modelsCreated: 0, modelsDisposed: 0, modelsActive: 0, editorsCreated: 0, editorsDisposed: 0, editorsActive: 0, subscriptionsCreated: 0, subscriptionsDisposed: 0, subscriptionsActive: 0, internalSubscriptionsCreated: 0, internalSubscriptionsDisposed: 0, internalSubscriptionsActive: 0, disposalOrder: [] };
  const deny = () => { state.captureCalls++; throw Error('OFFLINE_CAPTURE_PROHIBITED'); };
  const lock = (target, name, value) => { if (target) Object.defineProperty(target, name, { value, writable: false, configurable: false }); };
  const media = navigator.mediaDevices;
  for (const name of ['getUserMedia', 'getDisplayMedia']) { lock(window.MediaDevices?.prototype, name, deny); lock(media, name, deny); }
  lock(navigator, 'mediaDevices', media || Object.freeze({ getUserMedia: deny, getDisplayMedia: deny }));
  for (const name of ['getUserMedia', 'webkitGetUserMedia', 'mozGetUserMedia', 'msGetUserMedia']) { lock(Navigator.prototype, name, deny); lock(navigator, name, deny); }
  lock(window, 'MediaRecorder', undefined);
  const add = window.addEventListener, remove = window.removeEventListener, listeners = new Set(), appListeners = new Set();
  const isAppListener = callback => typeof callback === 'function' && callback.name === 'handleMessage' && Function.prototype.toString.call(callback).includes('readCodingEditorRequest');
  window.addEventListener = function (name, callback, options) { if (name === 'message') { listeners.add(callback); if (isAppListener(callback)) appListeners.add(callback); state.messageListeners = listeners.size; state.appMessageListeners = appListeners.size; } return add.call(this, name, callback, options); };
  window.removeEventListener = function (name, callback, options) { if (name === 'message') { listeners.delete(callback); appListeners.delete(callback); state.messageListeners = listeners.size; state.appMessageListeners = appListeners.size; } return remove.call(this, name, callback, options); };
  window.__screenshotTimers = [];
  const interval = window.setInterval;
  window.setInterval = function (callback, duration, ...args) { if (duration === 5000) window.__screenshotTimers.push(() => callback(...args)); return interval.call(this, callback, duration, ...args); };
  state.ready = true;
}

function trackRealMonaco() {
  const amd = window.require;
  function tracked(ids, success, failure) {
    window.__monacoProbe.requireCalls++;
    return amd(ids, loaded => {
      const api = loaded?.m || loaded;
      if (api?.editor?.createModel && !api.__offlineTracked) {
        api.__offlineTracked = true;
        window.__actualMonaco = api;
        const stats = window.__monacoProbe;
        const createModel = api.editor.createModel, create = api.editor.create;
        const wrapDispose = (resource, kind) => { const original = resource.dispose.bind(resource); let disposed = false; resource.dispose = () => { if (!disposed) { disposed = true; stats[kind + 'Disposed']++; stats[kind + 'Active']--; stats.disposalOrder.push(kind.slice(0, -1)); original(); } }; return resource; };
        api.editor.createModel = function (...args) { stats.modelsCreated++; stats.modelsActive++; return wrapDispose(createModel.apply(this, args), 'models'); };
        api.editor.create = function (...args) {
          stats.editorsCreated++; stats.editorsActive++;
          const editor = wrapDispose(create.apply(this, args), 'editors');
          const listen = editor.onDidChangeModelContent.bind(editor);
          let firstRegistration = true;
          editor.onDidChangeModelContent = (...arguments_) => { const kind = firstRegistration ? 'subscriptions' : 'internalSubscriptions'; firstRegistration = false; stats[kind + 'Created']++; stats[kind + 'Active']++; return wrapDispose(listen(...arguments_), kind); };
          return editor;
        };
      }
      success(loaded);
    }, failure);
  }
  Object.setPrototypeOf(tracked, amd);
  tracked.config = options => { window.__monacoProbe.configCalls++; return amd.config(options); };
  window.require = tracked;
}

async function prepare() {
  const ts = localRequire('typescript');
  const modules = new Map();
  function load(file) {
    const absolute = path.resolve(repo, file);
    if (modules.has(absolute)) return modules.get(absolute);
    const js = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const loadedModule = { exports: {} };
    new Function('module', 'exports', 'require', js)(loadedModule, loadedModule.exports, name => name.startsWith('.') ? load(path.resolve(path.dirname(absolute), name + '.ts')) : localRequire(name));
    modules.set(absolute, loadedModule.exports);
    return loadedModule.exports;
  }
  const vite = require.resolve('vite', { paths: [path.dirname(require.resolve('vitest', { paths: [repo] }))] });
  const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(vite)] }));
  const dynamic = `import React from 'react';export default function dynamic(loader,options={}){const Lazy=React.lazy(()=>Promise.resolve(loader()).then(value=>({default:value.default||value})));return function Dynamic(props){return <React.Suspense fallback={options.loading?React.createElement(options.loading):null}><Lazy {...props}/></React.Suspense>}}`;
  const voice = `import React from 'react';import {PcmPlaybackQueue} from '@/lib/audio/pcm-playback-queue';export function VoiceControl(props){React.useEffect(()=>{window.__voiceBoundaryProps=props});React.useEffect(()=>{const state=window.__voiceProbe||(window.__voiceProbe={mounts:0,stops:0,diagnostics:[],starts:[]});state.mounts++;const context={state:'running',currentTime:0,createBuffer(channels,length,sampleRate){const data=new Float32Array(length);return{duration:length/sampleRate,getChannelData:()=>data}},createBufferSource(){return{buffer:null,onended:null,connect(){},disconnect(){},stop(){state.stops++},start(at){state.starts.push(at)}}}};const queue=new PcmPlaybackQueue(context,{connect(){},onDiagnostic:event=>state.diagnostics.push(event)});queue.enqueue(btoa(String.fromCharCode(...new Uint8Array(48000))));queue.completeTurn();state.queue=queue;return()=>queue.stop()},[]);return <span data-voice-boundary="synthetic"/>}`;
  const image = `export async function toPng(node,options){const workspace=document.querySelector('[data-lesson-coding-workspace]');const textarea=workspace?.querySelector('textarea');window.__screenshotCheck={workspacePresent:!!workspace,textareaPresent:!!textarea,workspaceExcluded:!!workspace&&options.filter(workspace)===false,textareaExcluded:!!textarea&&options.filter(textarea)===false,captureRootIncluded:options.filter(node)===true};return 'data:image/png;base64,AA=='}`;
  const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{ReactRenderer}from'./src/components/lessons/ReactRenderer';import{SafeCodeRunner}from'./src/components/lessons/SafeCodeRunner';import{TutorExperience}from'./src/components/learn/tutor/TutorExperience';function App(){const[mode,setMode]=React.useState(window.__scenario.mode);const[revision,setRevision]=React.useState(0);return <><nav><button onClick={()=>setMode('gone')}>Navigate away</button><button onClick={()=>setRevision(value=>value+1)}>Navigate preview</button></nav><main style={{height:'800px',position:'relative'}}>{mode==='tutor'?<TutorExperience variant="student" apiKey={null} getFeedback={false} debugMode={false} initialTopic="Synthetic photosynthesis"/>:mode==='safe'?<SafeCodeRunner code="synthetic safe fallback" library="react" onReady={()=>window.__ready=(window.__ready||0)+1}/>:mode==='react'?<ReactRenderer code={window.__codes[revision%window.__codes.length]} onReady={()=>window.__ready=(window.__ready||0)+1} onError={error=>window.__rendererError=error}/>:<p>Navigation complete</p>}</main></>};window.__messageListenerBaseline=window.__guard.messageListeners;createRoot(document.getElementById('app')).render(<App/>);`;
  const bundle = await esbuild.build({ stdin: { contents: entry, resolveDir: repo, sourcefile: 'coding-editor-browser-probe.tsx', loader: 'tsx' }, bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser', target: 'es2022', jsx: 'automatic', alias: { '@': path.join(repo, 'src') }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'offline-boundaries', setup(build) { build.onResolve({ filter: /^(next\/dynamic|html-to-image|@\/components\/voice\/VoiceControl)$/ }, args => ({ path: args.path, namespace: 'offline' })); build.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ contents: args.path === 'next/dynamic' ? dynamic : args.path === 'html-to-image' ? image : voice, loader: 'jsx', resolveDir: repo })); } }] });
  const bundledFiles = Object.keys(bundle.metafile.inputs).map(file => file.replace(/\\/g, '/'));
  report.bundleBoundary = { realVoiceControlAbsent: !bundledFiles.some(file => file.endsWith('src/components/voice/VoiceControl.tsx')), realAudioHookAbsent: !bundledFiles.some(file => file.endsWith('src/hooks/useAudioStreaming.ts')), actualPcmQueuePresent: bundledFiles.some(file => file.endsWith('src/lib/audio/pcm-playback-queue.ts')) };
  assert(Object.values(report.bundleBoundary).every(Boolean), 'The synthetic voice boundary was not isolated');
  const postcss = localRequire('postcss'), tailwind = localRequire('tailwindcss');
  const config = { ...load('tailwind.config.ts').default, content: [{ raw: entry, extension: 'tsx' }, ...Object.keys(bundle.metafile.inputs).filter(file => /\.tsx?$/.test(file) && fs.existsSync(path.resolve(repo, file))).map(file => ({ raw: fs.readFileSync(path.resolve(repo, file), 'utf8'), extension: 'tsx' }))] };
  const css = (await postcss([tailwind(config)]).process(fs.readFileSync(path.join(repo, 'src/app/globals.css'), 'utf8'), { from: undefined })).css;
  const runtimeConfig = load('tailwind.lesson-runtime.config.ts').default;
  runtimeConfig.content = runtimeConfig.content.map(file => path.join(repo, file));
  const runtimeCss = (await postcss([tailwind(runtimeConfig)]).process(fs.readFileSync(path.join(repo, 'src/styles/lesson-runtime.css'), 'utf8'), { from: undefined })).css;
  const assets = new Map([
    ['/lesson-runtime/react-18.3.1.production.min.js', fs.readFileSync(path.join(repo, 'public/lesson-runtime/react-18.3.1.production.min.js'), 'utf8')],
    ['/lesson-runtime/react-dom-18.3.1.production.min.js', fs.readFileSync(path.join(repo, 'public/lesson-runtime/react-dom-18.3.1.production.min.js'), 'utf8')],
    ['/lesson-runtime/tailwind.generated.css', runtimeCss],
  ]);
  const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  report.sourceHashes = Object.fromEntries(['src/components/learn/tutor/TutorExperience.tsx', 'src/components/lessons/ReactRenderer.tsx', 'src/components/lessons/SafeCodeRunner.tsx', 'src/components/lessons/CodeEditor.tsx', 'src/components/lessons/CodingWorkspace.tsx', 'src/lib/monaco-bootstrap.ts', 'src/lib/lesson-artifacts/coding-editor-bridge.ts', 'src/lib/audio/pcm-playback-queue.ts'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex')]));
  return { assets, html: scenario => `<!doctype html><html><head><meta charset="utf-8"><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="app"></div><script>window.__scenario=${JSON.stringify(scenario)};window.__codes=${JSON.stringify([reactFixture(true, 0, scenario.automatic), reactFixture(true, 1)])};${script}</script></body></html>` };
}

async function newCase(browser, prepared, scenario) {
  const item = { name: scenario.name, passed: false, requests: [], errors: [] };
  report.cases.push(item);
  console.log(JSON.stringify({ case: item.name, phase: 'starting' }));
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, viewport: { width: 1200, height: 950 } });
  await context.addInitScript(initGuards);
  await context.addInitScript(defer => { window.__deferControlledAmd = defer; }, scenario.runtime === 'controlled');
  await context.routeWebSocket('**/*', socket => { report.sockets++; socket.close(); });
  const page = await context.newPage();
  page.on('pageerror', error => { item.errors.push(error.message); report.pageErrors.push({ case: item.name, message: error.message }); });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const record = { case: item.name, url: url.origin + url.pathname, method: request.method(), disposition: 'blocked' };
    report.requests.push(record); item.requests.push(record);
    if (url.origin === 'https://lesson.test') {
      if (url.pathname === '/') { record.disposition = 'memory-page'; return route.fulfill({ contentType: 'text/html', body: prepared.html(scenario) }); }
      if (prepared.assets.has(url.pathname)) { record.disposition = 'local-react-runtime'; return route.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: prepared.assets.get(url.pathname) }); }
      if (url.pathname === '/api/genai/visualize') { record.disposition = 'synthetic-artifact-api'; return route.fulfill({ json: { code: reactFixture(!!scenario.coding), library: 'react', explanation: 'Synthetic fixture' } }); }
      if (url.pathname.startsWith('/api/')) { record.disposition = 'synthetic-data-api'; return route.fulfill({ json: { id: 'synthetic-session', items: [], credits: 100 } }); }
    }
    if (request.url().startsWith(monacoBase)) {
      if (scenario.runtime === 'controlled' && url.pathname.endsWith('/loader.js')) { record.disposition = 'controlled-amd'; return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, 'fixtures/coding-editor-monaco.js'), 'utf8') }); }
      if (scenario.runtime === 'missing-require' && url.pathname.endsWith('/loader.js')) { record.disposition = 'controlled-missing-amd'; return route.fulfill({ contentType: 'text/javascript', body: 'window.__loaderWithoutRequire = true;' }); }
      if (scenario.runtime === 'real') {
        const relativeName = decodeURIComponent(url.pathname.slice(new URL(monacoBase).pathname.length));
        const file = path.resolve(monacoRoot, relativeName), child = path.relative(monacoRoot, file);
        if (child && !child.startsWith('..') && !path.isAbsolute(child) && fs.existsSync(file) && fs.statSync(file).isFile()) {
          record.disposition = 'installed-monaco';
          let body = fs.readFileSync(file);
          if (relativeName === 'loader.js') body = Buffer.from(body.toString('utf8') + '\n(' + trackRealMonaco.toString() + ')();');
          const extension = path.extname(file);
          return route.fulfill({ contentType: extension === '.css' ? 'text/css' : extension === '.ttf' ? 'font/ttf' : extension === '.json' ? 'application/json' : 'text/javascript', body });
        }
      }
    }
    return route.abort('blockedbyclient');
  });
  await page.goto('https://lesson.test/', { waitUntil: 'load' });
  if (scenario.mode === 'tutor') {
    await page.waitForFunction(() => !!window.__voiceBoundaryProps);
    const loaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/learning/visualizations' && response.request().method() === 'GET');
    await page.getByRole('button', { name: 'Start Learning', exact: true }).click();
    await page.evaluate(() => window.__voiceBoundaryProps.onConnectionStatusChange('connected'));
    await (await loaded).finished();
    await page.waitForFunction(() => window.__voiceBoundaryProps.sessionId === 'synthetic-session');
    await page.evaluate(() => window.__voiceBoundaryProps.onToolCall('generate_visualization_description', { task_description: 'Synthetic offline lesson fixture' }));
  }
  const frameLocator = page.locator(`iframe[title="${scenario.mode === 'safe' ? 'Code Preview' : 'React Component Preview'}"]`);
  await frameLocator.waitFor();
  const frame = await (await frameLocator.elementHandle()).contentFrame();
  assert(frame);
  if (scenario.mode !== 'safe') await frame.getByRole('button', { name: 'Increment preview', exact: true }).waitFor();
  else await frame.getByText('Component code has been validated but not executed.').waitFor();
  assert.equal(await frameLocator.getAttribute('sandbox'), 'allow-scripts');
  item.messageListenerBaseline = await page.evaluate(() => window.__messageListenerBaseline);
  assert.equal(await page.evaluate(() => window.__guard.messageListeners), item.messageListenerBaseline + 1);
  assert.equal(await page.evaluate(() => window.__guard.appMessageListeners), 1);
  return { page, context, frame, frameLocator, item };
}

async function assertSafe(state) {
  state.item.guards = await Promise.all(state.page.frames().map(frame => frame.evaluate(() => window.__guard)));
  assert(state.item.guards.every(guard => guard?.ready && guard.captureCalls === 0));
  assert.deepEqual(state.item.errors, []);
  assert.equal(report.sockets, 0);
  assert(!state.item.requests.some(request => request.disposition === 'blocked'), 'Unexpected request attempted');
}

async function closeWorkspace(state, keyboard = false) {
  const close = state.page.getByRole('button', { name: 'Close coding editor', exact: true });
  if (keyboard) await state.page.keyboard.press('Escape'); else await close.click();
  await state.page.getByRole('region', { name: 'Coding workspace' }).waitFor({ state: 'detached' });
  await state.page.waitForFunction(() => { const frame = document.querySelector('iframe[title="React Component Preview"],iframe[title="Code Preview"]'); return frame && !frame.inert && document.activeElement === frame; });
}

async function resources(page, active) {
  try { await page.waitForFunction(expected => ['modelsActive', 'editorsActive', 'subscriptionsActive'].every(key => window.__monacoProbe[key] === expected), active); }
  catch (error) { error.message += '\nObserved resources: ' + JSON.stringify(await page.evaluate(() => ({ probe: window.__monacoProbe, status: Array.from(document.querySelectorAll('[role="status"]')).map(element => element.textContent), actualModels: window.__actualMonaco?.editor.getModels().length }))); throw error; }
  return page.evaluate(() => window.__monacoProbe);
}

async function voiceState(page) {
  return page.evaluate(() => ({ mounts: window.__voiceProbe.mounts, stops: window.__voiceProbe.stops, interrupted: window.__voiceProbe.diagnostics.some(event => event.event === 'interrupted'), playbackFailed: window.__voiceProbe.diagnostics.some(event => event.event === 'playback-failed'), scheduled: window.__voiceProbe.diagnostics.some(event => event.event === 'scheduled'), starts: window.__voiceProbe.starts, idle: window.__voiceProbe.queue.isIdle() }));
}

async function recordCaseFailure(state, error) {
  state.item.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
  try { await assertSafe(state); } catch (guardError) { state.item.guardFailure = guardError.message; }
  console.log(JSON.stringify({ case: state.item.name, phase: 'failed', message: error.message }));
}

async function runCases(browser, prepared) {
  const requestedCase = process.argv[2] || process.env.CODING_EDITOR_CASE;
  const selected = name => !requestedCase || requestedCase === name;
  report.requestedCase = requestedCase || null;
  if (selected('actual-tutor-noncoding-zero-monaco')) {
    const state = await newCase(browser, prepared, { name: 'actual-tutor-noncoding-zero-monaco', mode: 'tutor', runtime: 'controlled', coding: false });
    try {
      await state.frame.getByRole('button', { name: 'Increment preview', exact: true }).click();
      assert.match(await state.frame.locator('[data-counter]').innerText(), /1/);
      assert.equal(state.item.requests.filter(request => request.url.startsWith(monacoBase)).length, 0);
      assert.deepEqual(await state.page.evaluate(() => [window.__monacoProbe.configCalls, window.__monacoProbe.modelsCreated]), [0, 0]);
      state.item.voice = await voiceState(state.page);
      assert.deepEqual(state.item.voice, { mounts: 1, stops: 0, interrupted: false, playbackFailed: false, scheduled: true, starts: [0.1], idle: false });
      await assertSafe(state); state.item.passed = true;
    } catch (error) { await recordCaseFailure(state, error); } finally { await state.context.close(); }
  }
  if (selected('automatic-and-programmatic-open-rejected')) {
    const state = await newCase(browser, prepared, { name: 'automatic-and-programmatic-open-rejected', mode: 'react', runtime: 'controlled', automatic: true });
    try {
      await state.page.waitForTimeout(150);
      state.item.activationProbe = await state.frame.evaluate(() => ({ automaticAttempted: window.__automaticAttempted, programmaticAttempted: window.__programmaticAttempted, observations: window.__activationProbe }));
      assert.deepEqual(state.item.activationProbe, { automaticAttempted: true, programmaticAttempted: true, observations: [{ phase: 'source', isActive: false }, { phase: 'timer', isActive: false }] });
      assert.equal(await state.page.getByRole('region', { name: 'Coding workspace' }).count(), 0);
      assert.equal(state.item.requests.filter(request => request.url.startsWith(monacoBase)).length, 0);
      await assertSafe(state); state.item.passed = true;
    } catch (error) { await recordCaseFailure(state, error); } finally { await state.context.close(); }
  }
  for (const scenario of [{ name: 'actual-react-controlled-amd', mode: 'react', runtime: 'controlled' }, { name: 'actual-tutor-controlled-amd', mode: 'tutor', runtime: 'controlled', coding: true }, { name: 'actual-react-installed-monaco', mode: 'react', runtime: 'real' }]) {
    if (!selected(scenario.name)) continue;
    const state = await newCase(browser, prepared, scenario);
    try {
      await state.frame.getByRole('button', { name: 'Forge invalid token', exact: true }).click();
      const token = await state.frameLocator.evaluate(element => element.srcdoc.match(/token:"([a-f0-9]{32})"/)[1]);
      await state.page.evaluate(token => { const iframe = document.createElement('iframe'); iframe.title = 'Forged source'; iframe.sandbox = 'allow-scripts'; iframe.style.cssText = 'position:fixed;top:0;right:0;z-index:2147483647;width:260px;height:80px;background:white'; iframe.srcdoc = `<button onclick="parent.postMessage({type:'lesson-open-code-editor',token:'${token}',code:'forged-source',language:'javascript'},'*')">Forge source</button>`; document.body.append(iframe); }, token);
      const attacker = await (await state.page.locator('iframe[title="Forged source"]').elementHandle()).contentFrame();
      await attacker.getByRole('button', { name: 'Forge source' }).click();
      await state.page.evaluate(token => { const source = document.querySelector('iframe[title="React Component Preview"]').contentWindow; dispatchEvent(new MessageEvent('message', { source, origin: location.origin, data: { type: 'lesson-open-code-editor', token, code: 'forged-origin', language: 'javascript' } })); }, token);
      await state.page.waitForTimeout(100);
      assert.equal(await state.page.getByRole('region', { name: 'Coding workspace' }).count(), 0);
      assert.equal(state.item.requests.filter(request => request.url.startsWith(monacoBase)).length, 0);
      await state.page.locator('iframe[title="Forged source"]').evaluate(element => element.remove());
      await state.frame.getByRole('button', { name: 'Increment preview', exact: true }).click();
      await state.frame.evaluate(() => { window.__previewIdentity = 'retained'; });
      for (let index = 0; index < 3; index++) {
        await state.frame.getByRole('button', { name: 'Open coding editor', exact: true }).click();
        await state.page.getByRole('region', { name: 'Coding workspace' }).waitFor();
        assert.equal(await state.page.getByRole('button', { name: 'Run Tests', exact: true }).count(), 0);
        assert(await state.page.getByRole('button', { name: 'Close coding editor', exact: true }).evaluate(element => element === document.activeElement), 'Workspace did not focus Close on open');
        if (scenario.runtime === 'controlled' && index === 0) {
          await state.page.waitForFunction(() => typeof window.__resolveControlledMonaco === 'function');
          await closeWorkspace(state, true);
          await state.page.evaluate(() => window.__resolveControlledMonaco());
          await resources(state.page, 0);
          await state.frame.getByRole('button', { name: 'Open coding editor', exact: true }).click();
          await state.page.waitForFunction(() => window.__monacoProbe.requireCalls >= 2);
          const textarea = state.page.getByRole('textbox', { name: 'Code', exact: true });
          await textarea.fill('function typedWhileLoading(){return 8}');
          await state.page.evaluate(() => window.__resolveControlledMonaco());
        }
        await resources(state.page, 1);
        if (scenario.runtime === 'controlled' && index === 0) {
          assert.equal(await state.page.getByRole('textbox', { name: 'Controlled Monaco code' }).inputValue(), 'function typedWhileLoading(){return 8}');
          assert(await state.page.getByRole('textbox', { name: 'Controlled Monaco code' }).evaluate(element => element === document.activeElement), 'Loading textarea focus did not transfer to the editor');
        }
        if (scenario.mode === 'tutor' && index === 0) {
          await state.page.evaluate(() => window.__voiceBoundaryProps.onConnectionStatusChange('connected'));
          await state.page.waitForFunction(() => window.__screenshotTimers.length > 0);
          await state.page.evaluate(() => window.__screenshotTimers.at(-1)());
          await state.page.waitForFunction(() => window.__screenshotCheck?.workspacePresent);
          state.item.screenshotFilter = await state.page.evaluate(() => window.__screenshotCheck);
          assert.equal(state.item.screenshotFilter.workspaceExcluded, true);
          assert.equal(state.item.screenshotFilter.textareaExcluded, true);
          assert.equal(state.item.screenshotFilter.captureRootIncluded, true);
        }
        if (index > 0) {
          if (scenario.runtime === 'real') { await state.page.locator('.monaco-editor textarea').first().press('End'); await state.page.keyboard.type(' '); }
          else await state.page.getByRole('textbox', { name: 'Controlled Monaco code' }).fill('function changed(){return 9}');
        }
        await closeWorkspace(state, index === 0);
        await resources(state.page, 0);
        const messageListeners = await state.page.evaluate(() => window.__guard.messageListeners);
        if (index === 0) state.item.loadedMessageListenerBaseline = messageListeners;
        assert.equal(messageListeners, state.item.loadedMessageListenerBaseline);
        assert.equal(await state.page.evaluate(() => window.__guard.appMessageListeners), 1);
        assert.equal(await state.frame.evaluate(() => window.__previewIdentity), 'retained');
        assert.equal(await state.frame.locator('[data-counter]').innerText(), 'Preview count: 1');
      }
      state.item.resources = await resources(state.page, 0);
      assert.equal(state.item.resources.modelsCreated, 3); assert.equal(state.item.resources.modelsDisposed, 3);
      assert.equal(state.item.resources.editorsCreated, 3); assert.equal(state.item.resources.subscriptionsDisposed, 3);
      await assertSafe(state);
      state.item.frameGuardsBeforeNavigation = state.item.guards;
      if (scenario.mode === 'react') {
        await state.frame.getByRole('button', { name: 'Open coding editor', exact: true }).click(); await resources(state.page, 1);
        await state.page.getByRole('button', { name: 'Navigate preview', exact: true }).click();
        await state.frame.getByText('Synthetic photosynthesis 1', { exact: true }).waitFor(); await resources(state.page, 0);
        await state.frame.evaluate(token => { const button = document.createElement('button'); button.textContent = 'Replay stale token'; button.onclick = () => parent.postMessage({ type: 'lesson-open-code-editor', token, code: 'stale', language: 'javascript' }, '*'); document.body.append(button); }, token);
        await state.frame.getByRole('button', { name: 'Replay stale token', exact: true }).click(); await state.page.waitForTimeout(100);
        assert.equal(await state.page.getByRole('region', { name: 'Coding workspace' }).count(), 0);
      } else {
        state.item.voice = await voiceState(state.page);
        assert.deepEqual(state.item.voice, { mounts: 1, stops: 0, interrupted: false, playbackFailed: false, scheduled: true, starts: [0.1], idle: false });
      }
      await state.frame.getByRole('button', { name: 'Open coding editor', exact: true }).click(); await resources(state.page, 1);
      await state.page.getByRole('button', { name: 'Navigate away', exact: true }).click(); await resources(state.page, 0);
      await state.page.waitForFunction(baseline => window.__guard.appMessageListeners === 0 && window.__guard.messageListeners === baseline - 1, state.item.loadedMessageListenerBaseline);
      state.item.messageListenersAfterNavigation = await state.page.evaluate(() => window.__guard.messageListeners);
      if (scenario.runtime === 'real') assert.equal(await state.page.evaluate(() => window.__actualMonaco.editor.getModels().length), 0);
      await assertSafe(state); await state.page.screenshot({ path: path.join(output, scenario.name + '.png') }); state.item.passed = true;
    } catch (error) { await recordCaseFailure(state, error); } finally { await state.context.close(); }
  }
  for (const mode of ['react', 'safe']) {
    if (!selected(`${mode}-missing-require-editable-fallback`)) continue;
    const state = await newCase(browser, prepared, { name: `${mode}-missing-require-editable-fallback`, mode, runtime: 'missing-require' });
    try {
      if (mode === 'safe') await state.frame.evaluate(() => { const button = document.createElement('button'); button.textContent = 'Open coding editor'; button.onclick = () => window.openCodeEditor({ code: 'function safe(){return 2}', language: 'javascript' }); document.body.append(button); });
      await state.frame.getByRole('button', { name: 'Open coding editor', exact: true }).click();
      await state.page.getByText('Advanced editor unavailable. You can keep editing below.', { exact: true }).waitFor();
      assert(await state.page.getByRole('button', { name: 'Close coding editor', exact: true }).evaluate(element => element === document.activeElement), 'Fallback changed workspace open focus');
      assert.equal(await state.page.evaluate(() => window.require), undefined);
      const textarea = state.page.getByRole('textbox', { name: 'Code', exact: true });
      await textarea.fill('function fallback(){return 42}');
      assert.equal(await textarea.inputValue(), 'function fallback(){return 42}');
      await state.page.getByRole('button', { name: 'Close coding editor', exact: true }).focus();
      await closeWorkspace(state, true);
      assert.equal((await state.page.evaluate(() => window.__monacoProbe)).modelsCreated, 0);
      await assertSafe(state); state.item.passed = true;
    } catch (error) { await recordCaseFailure(state, error); } finally { await state.context.close(); }
  }
}

async function run() {
  fs.mkdirSync(output, { recursive: true });
  let browser;
  try {
    const prepared = await prepare();
    const { loadChromium, verifyServiceWorkerRuntime } = require(runtime);
    report.runtime = verifyServiceWorkerRuntime();
    browser = await loadChromium().launch({ executablePath: executable, headless: true, chromiumSandbox: true, ignoreDefaultArgs: ['--disable-client-side-phishing-detection', '--unsafely-disable-devtools-self-xss-warnings'], args: ['--use-fake-device-for-media-stream'], downloadsPath: path.join(output, 'downloads') });
    report.chromiumVersion = browser.version();
    const cdp = await browser.newBrowserCDPSession();
    const args = (await cdp.send('Browser.getBrowserCommandLine')).arguments;
    try { report.browserProcesses = (await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(info => ({ id: info.id, type: info.type })); } catch (error) { report.processInfoUnavailable = error.message; }
    assert(!args.includes('--no-sandbox')); assert(args.includes('--use-fake-device-for-media-stream'));
    report.security = { chromiumSandbox: true, noSandboxFlagAbsent: true, fakeDevices: true, permissionsGranted: false, allRequestsIntercepted: true, nativeCaptureDenied: true, serviceWorkersBlocked: true };
    await cdp.detach();
    await runCases(browser, prepared);
    assert(report.cases.length > 0, 'No matching coding editor case');
    assert.deepEqual(report.pageErrors, []); assert.equal(report.sockets, 0);
    report.passed = report.cases.every(item => item.passed);
  } catch (error) { report.failure = { message: error.message, stack: error.stack }; process.exitCode = 1; }
  finally {
    if (browser) {
      try { const cdp = await browser.newBrowserCDPSession(); report.browserProcessesBeforeClose = (await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(info => ({ id: info.id, type: info.type })); await cdp.detach(); } catch (error) { report.finalProcessInfoUnavailable = error.message; }
      await browser.close(); report.browserClosed = !browser.isConnected();
    }
    report.finishedUtc = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'coding-editor-browser.json'), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, failedCases: report.cases.filter(item => !item.passed).map(item => item.name), report: path.join(output, 'coding-editor-browser.json'), failure: report.failure?.message }));
}
run().catch(error => { console.error(error.stack); process.exitCode = 1; });
