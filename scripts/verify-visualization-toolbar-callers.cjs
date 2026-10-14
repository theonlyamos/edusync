#!/usr/bin/env node
/* global document, window, getComputedStyle */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const repo = path.resolve(__dirname, '..');
const localRequire = name => require(require.resolve(name, { paths: [repo] }));
const sizes = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }];
const callers = {
  tutor: 'src/components/learn/tutor/TutorExperience.tsx',
  lesson: 'src/app/learn/[id]/page.tsx',
  card: 'src/components/students/study-companion/InteractiveElementCard.tsx',
};

function optionsFrom(args) {
  const result = {};
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === '--empty-history') { result.emptyHistory = true; continue; }
    assert(['--playwright-package', '--chromium', '--output-dir'].includes(name), `Unknown option: ${name}`);
    const value = args[++index];
    assert(value && !value.startsWith('--'), `Missing value for ${name}`);
    result[name.slice(2)] = value;
  }
  return result;
}

function actualHeader(ts, file) {
  const source = fs.readFileSync(path.join(repo, file), 'utf8');
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches = [];
  const named = (node, name) => ts.isJsxElement(node) && node.openingElement.tagName.getText(syntax) === name;
  function visit(node) {
    if (named(node, 'CardHeader') && node.getText(syntax).includes('Regenerate visualization')) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  assert.equal(matches.length, 1, `${file}: expected one actual visualization CardHeader`);
  const header = matches[0];
  const ancestor = name => {
    for (let node = header.parent; node; node = node.parent) if (named(node, name)) return node;
    throw Error(`${file}: actual header has no ${name} ancestor`);
  };
  let neutralizedHandlers = 0;
  const transformed = ts.transform(header, [context => {
    const walk = node => {
      if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.getText(syntax))) {
        neutralizedHandlers++;
        const callback = ts.factory.createArrowFunction(undefined, undefined, [], undefined, ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.factory.createBlock([], true));
        return ts.factory.updateJsxAttribute(node, node.name, ts.factory.createJsxExpression(undefined, callback));
      }
      return ts.visitEachChild(node, walk, context);
    };
    return walk;
  }]);
  const printer = ts.createPrinter();
  const jsx = printer.printNode(ts.EmitHint.Unspecified, transformed.transformed[0], syntax);
  transformed.dispose();
  const card = ancestor('Card'), provider = ancestor('LearningActivityToolbar');
  return {
    file, sourceHash: crypto.createHash('sha256').update(source).digest('hex'),
    headerLine: syntax.getLineAndCharacterOfPosition(header.getStart(syntax)).line + 1,
    neutralizedHandlers, jsx,
    cardOpen: card.openingElement.getText(syntax),
    providerOpen: provider.openingElement.getText(syntax),
  };
}

async function preparation() {
  const ts = localRequire('typescript');
  const cache = new Map();
  function loadConfig(file) {
    const absolute = path.resolve(repo, file);
    if (cache.has(absolute)) return cache.get(absolute);
    const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const loaded = { exports: {} };
    new Function('module', 'exports', 'require', output)(loaded, loaded.exports, name => name.startsWith('.') ? loadConfig(path.resolve(path.dirname(absolute), `${name}.ts`)) : localRequire(name));
    cache.set(absolute, loaded.exports);
    return loaded.exports;
  }
  const headers = Object.fromEntries(Object.entries(callers).map(([name, file]) => [name, actualHeader(ts, file)]));
  const cssFiles = [...Object.values(callers), 'src/components/lessons/ReactRenderer.tsx', 'src/components/lessons/LearningActivityView.tsx', 'src/components/ui/card.tsx', 'src/components/ui/button.tsx', 'src/components/ui/toggle-group.tsx'];
  const tailwind = { ...loadConfig('tailwind.config.ts').default, content: cssFiles.map(file => ({ raw: fs.readFileSync(path.join(repo, file), 'utf8'), extension: 'tsx' })) };
  const postcss = localRequire('postcss'), plugin = localRequire('tailwindcss');
  const css = (await postcss([plugin(tailwind)]).process(fs.readFileSync(path.join(repo, 'src/app/globals.css'), 'utf8'), { from: undefined })).css;
  const runtime = loadConfig('tailwind.lesson-runtime.config.ts').default;
  runtime.content = runtime.content.map(file => path.join(repo, file));
  const runtimeCss = (await postcss([plugin(runtime)]).process(fs.readFileSync(path.join(repo, 'src/styles/lesson-runtime.css'), 'utf8'), { from: undefined })).css;
  const assets = {
    '/lesson-runtime/react-18.3.1.production.min.js': fs.readFileSync(path.join(repo, 'public/lesson-runtime/react-18.3.1.production.min.js'), 'utf8'),
    '/lesson-runtime/react-dom-18.3.1.production.min.js': fs.readFileSync(path.join(repo, 'public/lesson-runtime/react-dom-18.3.1.production.min.js'), 'utf8'),
    '/lesson-runtime/tailwind.generated.css': runtimeCss,
  };
  const vite = require.resolve('vite', { paths: [path.dirname(require.resolve('vitest', { paths: [repo] }))] });
  const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(vite)] }));
  return { headers, css, assets, esbuild, fixture: JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/readable-learning-activity.json'), 'utf8')) };
}

async function fixtureHtml(prepared, scenario) {
  const selected = prepared.headers[scenario.caller];
  const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from './src/components/ui/card';
import {Button} from './src/components/ui/button';
import {ToggleGroup,ToggleGroupItem} from './src/components/ui/toggle-group';
import {RefreshCw,ChevronLeft,ChevronRight,ChevronUp,ChevronDown,PanelLeftClose,MessageSquare} from 'lucide-react';
import {LearningActivityToolbar,LearningActivityExpandSlot} from './src/components/lessons/LearningActivityView';
import {ReactRenderer} from './src/components/lessons/ReactRenderer';
function App(){
 const debugMode=false,show='render',showChatPanel=false,canPrev=false,canNext=false;
 const visualizations=${scenario.emptyHistory ? '[]' : '[window.__fixture]'};
 const explanation='A saved authored activity',showExplanation=true,isRegenerating=false;
 const onRegenerate=${scenario.noRegenerate ? 'null' : '()=>{}'};
 const getLibraryDisplayName=()=> 'React';
 return <main id="fixture-shell">${selected.providerOpen}${selected.cardOpen}
 ${selected.jsx}
 <CardContent><div style={{height:'460px',minWidth:0}}><ReactRenderer code={window.__fixture.code} onReady={()=>window.__readyCount=(window.__readyCount||0)+1} onError={error=>window.__renderError=error}/></div></CardContent>
 </Card></LearningActivityToolbar></main>;
}
createRoot(document.getElementById('app')).render(<App/>);`;
  const bundle = await prepared.esbuild.build({ stdin: { contents: entry, resolveDir: repo, sourcefile: 'actual-toolbar-header-probe.tsx', loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', alias: { '@': path.join(repo, 'src') }, define: { 'process.env.NODE_ENV': '"production"' } });
  const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
  const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${prepared.css.replace(/<\/style/gi, '<\\/style')}</style><style>body{margin:0}#fixture-shell{display:flex;flex-direction:column;min-width:0;margin:12px;min-height:600px}</style></head><body><div id="app"></div><script>window.__fixture=${json(prepared.fixture)};window.__blockedFetches=[];const assets=${json(prepared.assets)};window.fetch=async url=>{if(!Object.hasOwn(assets,url)){window.__blockedFetches.push(String(url));throw Error('OFFLINE_FETCH_PROHIBITED');}return {ok:true,text:async()=>assets[url]};};${script}</script></body></html>`;
}

function denyCapture() {
  const state = { ready: false, nativeCaptureCalls: 0 };
  window.__offlineCaptureGuard = state;
  const deny = () => { state.nativeCaptureCalls++; throw Error('OFFLINE_NATIVE_CAPTURE_PROHIBITED'); };
  const lock = (target, name, value) => { if (target) Object.defineProperty(target, name, { value, writable: false, configurable: false }); };
  const navigator = window.navigator, media = navigator.mediaDevices;
  for (const name of ['getUserMedia', 'getDisplayMedia']) { lock(window.MediaDevices?.prototype, name, deny); lock(media, name, deny); }
  lock(navigator, 'mediaDevices', media || { getUserMedia: deny, getDisplayMedia: deny });
  for (const name of ['getUserMedia', 'webkitGetUserMedia', 'mozGetUserMedia', 'msGetUserMedia']) { lock(window.Navigator.prototype, name, deny); lock(navigator, name, deny); }
  lock(window, 'MediaRecorder', undefined);
  state.ready = true;
}

const appearance = button => button.evaluate(element => {
  const css = getComputedStyle(element), icon = element.querySelector('svg'), svg = icon && getComputedStyle(icon);
  return { button: Object.fromEntries(['width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'backgroundColor', 'color', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRadius', 'boxShadow', 'fontSize', 'fontWeight'].map(name => [name, css[name]])), icon: svg && { width: svg.width, height: svg.height, strokeWidth: svg.strokeWidth } };
});

async function checkCase(context, html, scenario, size, report, outputDir) {
  const name = `${scenario.name}-${size.width}`, item = { name, scenario, viewport: size, passed: false };
  report.cases.push(item);
  const page = await context.newPage();
  try {
    await page.setViewportSize(size);
    await page.setContent(html);
    await page.waitForFunction(() => window.__readyCount === 1 || window.__renderError, null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => window.__renderError), undefined, 'Real viewer failed');
    const header = page.locator('#fixture-shell > div > div').first();
    const expand = header.getByRole('button', { name: 'Expand learning activity', exact: true });
    await page.screenshot({ path: path.join(outputDir, `${name}-actual-header-activity.png`), fullPage: true });
    assert.equal(await expand.count(), 1, scenario.emptyHistory ? 'Displayed tutor activity with empty history must keep one Expand control in its actual header' : `${scenario.caller}: actual header must contain one Expand control`);
    assert.equal(await page.locator('button[aria-label="Expand learning activity"]').count(), 1, 'Duplicate Expand control');
    const expectedRegenerate = !scenario.noRegenerate && !scenario.emptyHistory;
    const regenerate = header.getByTitle('Regenerate visualization', { exact: true });
    assert.equal(await regenerate.count(), expectedRegenerate ? 1 : 0, 'Unexpected actual Regenerate availability');
    item.buttons = await header.locator('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent.trim()));
    item.expand = await appearance(expand);
    assert.equal(item.expand.icon.width, '16px', 'Expand icon width changed');
    assert.equal(item.expand.icon.height, '16px', 'Expand icon height changed');
    if (expectedRegenerate) {
      const regenerateIndex = item.buttons.indexOf('Regenerate visualization');
      assert.equal(item.buttons[regenerateIndex + 1], 'Expand learning activity', 'Actual header Expand must immediately follow Regenerate');
      item.regenerate = await appearance(regenerate);
      assert.deepEqual(item.expand, item.regenerate, 'Actual header Expand differs from neighboring Regenerate styling');
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Actual header fixture has horizontal page overflow');
    const bounds = await header.boundingBox();
    assert(bounds && bounds.x >= -.5 && bounds.x + bounds.width <= size.width + .5, 'Actual header extends outside viewport');
    item.headerGeometry = await header.evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, paddingRight: parseFloat(getComputedStyle(element).paddingRight) }));
    assert(item.headerGeometry.scrollWidth <= item.headerGeometry.clientWidth + 1, 'Actual header has horizontal overflow');
    let controlsRight = 0;
    for (const button of await header.locator('button').all()) {
      if (!await button.isVisible()) continue;
      const box = await button.boundingBox();
      assert(box && box.x >= bounds.x - .5 && box.x + box.width <= bounds.x + bounds.width + .5, 'Actual header control is horizontally clipped');
      controlsRight = Math.max(controlsRight, box.x + box.width);
    }
    item.headerGeometry.controlsRight = controlsRight;
    assert(Math.abs(controlsRight - (bounds.x + bounds.width - item.headerGeometry.paddingRight)) <= 1, 'Actual header controls must stay aligned to the right when wrapping');
    const frame = page.frames().find(child => child.parentFrame());
    assert(frame, 'Actual ReactRenderer iframe missing');
    await frame.getByRole('button', { name: 'Choose Sun', exact: true }).click();
    await frame.evaluate(() => { window.__probeIdentity = 'retained'; });
    await page.evaluate(() => { window.__originalFrame = document.querySelector('iframe'); });
    await expand.click();
    await page.waitForFunction(() => document.querySelector('dialog').matches(':modal'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog').matches(':modal'));
    assert(await expand.evaluate(element => element === document.activeElement), 'Actual header Expand did not regain focus');
    assert(await page.evaluate(() => window.__originalFrame === document.querySelector('iframe') && window.__readyCount === 1), 'Actual header expansion replaced or reloaded the iframe');
    assert.equal(await frame.evaluate(() => window.__probeIdentity), 'retained', 'Actual viewer document replaced');
    assert.match(await frame.locator('[data-progress]').innerText(), /Correct! Answers: 1/, 'Actual viewer quiz state lost');
    item.captureGuards = await Promise.all(page.frames().map(child => child.evaluate(() => window.__offlineCaptureGuard)));
    assert(item.captureGuards.every(guard => guard?.ready && guard.nativeCaptureCalls === 0), 'Capture guard missing or native capture attempted');
    assert.deepEqual(await page.evaluate(() => window.__blockedFetches), [], 'Unexpected fixture fetch');
    item.passed = true;
  } catch (error) {
    await page.screenshot({ path: path.join(outputDir, `${name}-failure.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally { await page.close(); }
}

async function run() {
  const options = optionsFrom(process.argv.slice(2));
  const outputDir = options['output-dir'] ? path.resolve(options['output-dir']) : fs.mkdtempSync(path.join(os.tmpdir(), 'actual-toolbar-headers-'));
  fs.mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, 'actual-toolbar-headers.json');
  const report = { utc: new Date().toISOString(), nodePid: process.pid, scope: 'AST-extracted actual CardHeader JSX and its Card/provider opening props, with event callbacks neutralized, paired with the real ReactRenderer. These are isolated actual-header/viewer probes, not full application page tests.', passed: false, browserClosed: false, chromiumSandbox: true, fakeMediaDevices: true, nativeCaptureDenied: true, networkRequests: [], socketRequests: 0, errors: [], cases: [] };
  let browser;
  try {
    const prepared = await preparation();
    report.headers = prepared.headers;
    const scenarios = options.emptyHistory ? [{ caller: 'tutor', name: 'tutor-empty-history', emptyHistory: true }] : [
      { caller: 'tutor', name: 'tutor-history' }, { caller: 'lesson', name: 'lesson-history' }, { caller: 'card', name: 'card-regenerate' }, { caller: 'card', name: 'card-without-regenerate', noRegenerate: true }, { caller: 'tutor', name: 'tutor-empty-history', emptyHistory: true },
    ];
    const fixtures = await Promise.all(scenarios.map(async scenario => ({ scenario, html: await fixtureHtml(prepared, scenario) })));
    const { chromium } = options['playwright-package'] ? require(options['playwright-package']) : localRequire('playwright');
    report.chromium = options.chromium || path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe');
    browser = await chromium.launch({ executablePath: report.chromium, headless: true, chromiumSandbox: true, args: ['--use-fake-device-for-media-stream'] });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(denyCapture);
    await context.route('**/*', route => { report.networkRequests.push(route.request().url().split('?')[0]); return route.abort(); });
    await context.routeWebSocket('**/*', socket => { report.socketRequests++; socket.close(); });
    context.on('page', page => page.on('pageerror', error => report.errors.push(error.message)));
    for (const { scenario, html } of fixtures) for (const size of sizes) await checkCase(context, html, scenario, size, report, outputDir);
    assert.deepEqual(report.networkRequests, [], 'External network attempted');
    assert.equal(report.socketRequests, 0, 'WebSocket attempted');
    assert.deepEqual(report.errors, [], 'Browser errors');
    report.passed = report.cases.every(item => item.passed);
  } catch (error) { report.failure = { message: error.message, stack: error.stack }; process.exitCode = 1; }
  finally {
    if (browser) try { await browser.close(); report.browserClosed = true; } catch (error) { report.closeFailure = error.message; report.passed = false; process.exitCode = 1; }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, report: reportPath, failure: report.failure?.message }));
}

run().catch(error => { console.error(error.stack); process.exitCode = 1; });
