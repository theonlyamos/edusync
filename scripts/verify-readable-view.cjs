#!/usr/bin/env node
/* global document, window, getComputedStyle, requestAnimationFrame */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const repo = path.resolve(__dirname, '..');
const sizes = [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }];

function optionsFrom(args) {
  const result = {};
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    assert(['--playwright-package', '--chromium', '--output-dir'].includes(name), `Unknown option: ${name}`);
    const value = args[++index];
    assert(value && !value.startsWith('--'), `Missing value for ${name}`);
    result[name.slice(2)] = value;
  }
  return result;
}

const localRequire = name => require(require.resolve(name, { paths: [repo] }));

async function harness() {
  const ts = localRequire('typescript');
  const configCache = new Map();
  function loadConfig(file) {
    const absolute = path.resolve(repo, file);
    if (configCache.has(absolute)) return configCache.get(absolute);
    const configJs = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const configModule = { exports: {} };
    configCache.set(absolute, configModule.exports);
    const configRequire = name => name.startsWith('.') ? loadConfig(path.resolve(path.dirname(absolute), `${name}.ts`)) : localRequire(name);
    new Function('module', 'exports', 'require', configJs)(configModule, configModule.exports, configRequire);
    configCache.set(absolute, configModule.exports);
    return configModule.exports;
  }
  const cssFiles = ['src/components/lessons/ReactRenderer.tsx', 'src/components/lessons/LearningActivityView.tsx', 'src/components/ui/button.tsx'];
  const config = { ...loadConfig('tailwind.config.ts').default, content: cssFiles.filter(file => fs.existsSync(path.join(repo, file))).map(file => ({ raw: fs.readFileSync(path.join(repo, file), 'utf8'), extension: 'tsx' })) };
  const css = (await localRequire('postcss')([localRequire('tailwindcss')(config)]).process(fs.readFileSync(path.join(repo, 'src/app/globals.css'), 'utf8'), { from: undefined })).css;
  const runtimeConfig = loadConfig('tailwind.lesson-runtime.config.ts').default;
  runtimeConfig.content = runtimeConfig.content.map(file => path.join(repo, file));
  const runtimeCss = (await localRequire('postcss')([localRequire('tailwindcss')(runtimeConfig)]).process(fs.readFileSync(path.join(repo, 'src/styles/lesson-runtime.css'), 'utf8'), { from: undefined })).css;
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/readable-learning-activity.json'), 'utf8'));
  const assets = Object.fromEntries([
    ['react', 'react-18.3.1.production.min.js'], ['reactDom', 'react-dom-18.3.1.production.min.js'],
  ].map(([key, file]) => [key, fs.readFileSync(path.join(repo, 'public/lesson-runtime', file), 'utf8')]));
  assets.tailwindCss = runtimeCss;
  const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ReactRenderer} from './src/components/lessons/ReactRenderer';
import {vizReducer,initialVizState} from './src/reducers/visualizationReducer';
function App(){
 const [state,dispatch]=React.useReducer(vizReducer,initialVizState,s=>vizReducer(s,{type:'LOAD_VISUALIZATIONS',payload:[{...window.__fixture,id:'first'},{...window.__fixture,code:window.__fixture.code+'\\n',id:'second'}]}));
 window.__history=state;
 return React.createElement(React.Fragment,null,
 React.createElement('nav',{id:'history','aria-label':'Activity history'},
 React.createElement('button',{onClick:()=>dispatch({type:'SET_CURRENT_VIZ_INDEX',payload:state.currentVizIndex-1}),disabled:state.currentVizIndex===0},'Previous'),
 React.createElement('span',null,(state.currentVizIndex+1)+' / '+state.visualizations.length),
 React.createElement('button',{onClick:()=>dispatch({type:'SET_CURRENT_VIZ_INDEX',payload:state.currentVizIndex+1}),disabled:state.currentVizIndex===state.visualizations.length-1},'Next')),
 React.createElement('div',{id:'preview'},React.createElement(ReactRenderer,{code:state.code,onError:error=>window.__renderError=error,onReady:()=>window.__readyCount=(window.__readyCount||0)+1})));
}
createRoot(document.getElementById('app')).render(React.createElement(App));`;
  const vitePath = require.resolve('vite', { paths: [path.dirname(require.resolve('vitest', { paths: [repo] }))] });
  const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(vitePath)] }));
  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: repo, sourcefile: 'readable-view-harness.tsx', loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
    alias: { '@': path.join(repo, 'src') }, define: { 'process.env.NODE_ENV': '"production"' },
  });
  const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');
  const safeScript = value => value.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css.replace(/<\/style/gi, '<\\/style')}</style><style>
body{margin:0;font-family:Arial,sans-serif}#app{height:760px;margin:80px 24px 24px}#preview{height:100%;background:white;border-radius:8px}#history{position:absolute;top:20px;left:24px;display:flex;align-items:center;gap:16px}#history button{min-height:44px;padding:8px 12px;border:1px solid #bbb;border-radius:8px}
@media(max-width:639px){#app{height:620px;margin:80px 12px 24px}#history{left:12px}}
</style></head><body><div id="app"></div><script>
window.__fixture=${safeJson(fixture)};const assets=${safeJson(assets)};window.__blockedFetches=[];
window.fetch=async function(url){const key=Object.keys(assets).find(k=>({'react':'/lesson-runtime/react-18.3.1.production.min.js','reactDom':'/lesson-runtime/react-dom-18.3.1.production.min.js','tailwindCss':'/lesson-runtime/tailwind.generated.css'})[k]===url);if(!key){window.__blockedFetches.push(String(url));throw Error('Offline fixture blocked fetch: '+url);}return {ok:true,text:async()=>assets[key]};};
${safeScript(result.outputFiles[0].text)}</script></body></html>`;
}

async function settled(frame) {
  await frame.waitForFunction(() => window.lessonViewport?.width === document.documentElement.clientWidth);
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function measurements(page, frame) {
  const outer = await page.locator('iframe').evaluate(iframe => ({ scale: iframe.getBoundingClientRect().width / iframe.clientWidth, width: iframe.getBoundingClientRect().width }));
  const inner = await frame.evaluate(() => {
    const svg = document.querySelector('svg');
    const rect = svg.getBoundingClientRect();
    const labels = Array.from(svg.querySelectorAll('text')).map(text => {
      const box = text.getBoundingClientRect(), ctm = text.getScreenCTM();
      return { text: text.textContent, x: box.x - rect.x, y: box.y - rect.y, width: box.width, height: box.height, fontSize: parseFloat(getComputedStyle(text).fontSize) * Math.min(Math.hypot(ctm.a, ctm.b), Math.hypot(ctm.c, ctm.d)), transform: text.getAttribute('transform') };
    });
    return { labels, svgWidth: rect.width, svgHeight: rect.height, captionFont: parseFloat(getComputedStyle(document.querySelector('[data-caption]')).fontSize), documentWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth };
  });
  return { ...inner, parentScale: outer.scale, labels: inner.labels.map(label => ({ ...label, physicalFont: label.fontSize * outer.scale })), physicalCaptionFont: inner.captionFont * outer.scale };
}

function readable(result, stage) {
  assert.equal(result.labels.length, 3, `${stage}: expected three short diagram labels`);
  assert(result.physicalCaptionFont >= 13.99, `${stage}: HTML caption unreadable (${result.physicalCaptionFont}px)`);
  for (const label of result.labels) {
    assert(label.physicalFont >= 13.99, `${stage}: ${label.text} unreadable (${label.physicalFont}px)`);
    assert.equal(label.transform, null, `${stage}: authored label geometry changed`);
    assert(label.x >= -.5 && label.y >= -.5 && label.x + label.width <= result.svgWidth + .5 && label.y + label.height <= result.svgHeight + .5, `${stage}: clipped ${label.text}`);
  }
  for (let a = 0; a < result.labels.length; a++) for (let b = a + 1; b < result.labels.length; b++) {
    const first = result.labels[a], second = result.labels[b];
    assert(Math.min(first.x + first.width, second.x + second.width) <= Math.max(first.x, second.x) + .5 || Math.min(first.y + first.height, second.y + second.height) <= Math.max(first.y, second.y) + .5, `${stage}: authored fixture labels overlap`);
  }
  assert(result.scrollWidth <= result.documentWidth + 1, `${stage}: iframe horizontal overflow`);
}

async function unchanged(page, frame, history, stage) {
  assert(await page.evaluate(() => document.querySelector('iframe') === window.__originalFrame), `${stage}: iframe DOM was replaced`);
  assert.equal(await frame.evaluate(() => window.__fixtureIdentity), 'persistent-quiz', `${stage}: iframe document was reloaded`);
  assert.match(await frame.locator('[data-progress]').innerText(), /Correct! Answers: 1/, `${stage}: quiz progress was reset`);
  assert.deepEqual(await page.evaluate(() => ({ index: window.__history.currentVizIndex, code: window.__history.code, ids: window.__history.visualizations.map(item => item.id) })), history, `${stage}: activity history changed`);
  assert.equal(await page.evaluate(() => window.__readyCount), 1, `${stage}: activity rerendered from source`);
}

async function noBodyOverflow(page, stage) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${stage}: page horizontal overflow`);
}

async function viewportCase(context, html, size, report, outputDir) {
  const item = { name: `readable-${size.width}`, viewport: size, assertionsPassed: false };
  report.cases.push(item);
  const page = await context.newPage();
  await page.setViewportSize(size);
  await page.setContent(html);
  await page.waitForFunction(() => window.__readyCount === 1 || window.__renderError, null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__renderError), undefined, 'Renderer reported an error');
  const frame = page.frames().find(child => child.parentFrame());
  assert(frame, 'Renderer iframe missing');
  await frame.waitForSelector('svg text');
  await settled(frame);
  const expand = page.getByRole('button', { name: 'Expand learning activity', exact: true });
  assert.equal(await expand.count(), 1, 'Activity must provide an accessible Expand learning activity control');
  const expandRect = await expand.boundingBox();
  assert(expandRect && expandRect.width >= 43.99 && expandRect.height >= 43.99, 'Expand touch target smaller than 44px');
  assert.equal(await page.locator('iframe').getAttribute('sandbox'), 'allow-scripts', 'Sandbox permissions changed');
  await frame.getByRole('button', { name: 'Choose Sun', exact: true }).click();
  await frame.evaluate(() => { window.__fixtureIdentity = 'persistent-quiz'; });
  await page.evaluate(() => { window.__originalFrame = document.querySelector('iframe'); });
  const history = await page.evaluate(() => ({ index: window.__history.currentVizIndex, code: window.__history.code, ids: window.__history.visualizations.map(value => value.id) }));
  const initialBodyOverflow = await page.evaluate(() => document.body.style.overflow);
  item.inline = await measurements(page, frame);
  readable(item.inline, `${size.width}px inline`);
  await noBodyOverflow(page, 'inline');
  await expand.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Learning activity', exact: true });
  await dialog.waitFor({ state: 'visible' });
  assert(await dialog.evaluate(el => el.matches(':modal')), 'Expanded activity must be modal');
  assert(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), 'Expanded dialog did not receive focus');
  await page.evaluate(() => {
    window.postMessage({ type: 'lesson-viewer-escape' }, '*');
    return new Promise(resolve => setTimeout(resolve, 0));
  });
  assert(await dialog.evaluate(el => el.matches(':modal')), 'A forged Escape message from the parent closed the activity');
  await settled(frame);
  item.expandedFit = await measurements(page, frame);
  readable(item.expandedFit, `${size.width}px expanded Fit`);
  await unchanged(page, frame, history, 'expand');
  await noBodyOverflow(page, 'expanded Fit');
  for (const name of ['Fit', 'Zoom in', 'Zoom out', 'Close expanded activity']) {
    const rect = await dialog.getByRole('button', { name, exact: true }).boundingBox();
    assert(rect && rect.height >= 43.99 && rect.width >= 43.99, `${name}: touch target smaller than 44px`);
  }
  assert(await dialog.getByRole('button', { name: 'Zoom out', exact: true }).isDisabled(), 'Zoom out should stop at Fit');
  await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('dialog').innerText.includes('150%'));
  item.zoom150 = await measurements(page, frame);
  readable(item.zoom150, `${size.width}px 150%`);
  assert(item.zoom150.labels[0].physicalFont > item.expandedFit.labels[0].physicalFont * 1.45, 'Zoom did not enlarge the displayed diagram text');
  await unchanged(page, frame, history, 'zoom');
  await noBodyOverflow(page, 'zoom');
  for (let count = 0; count < 5; count++) await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click();
  assert(await dialog.getByRole('button', { name: 'Zoom in', exact: true }).isDisabled(), 'Zoom in should stop at 400%');
  assert.match(await dialog.innerText(), /400%/, 'Maximum zoom status missing');
  const zoomViewport = dialog.getByRole('region', { name: 'Learning activity, scroll to explore when zoomed', exact: true });
  await zoomViewport.evaluate(el => el.scrollTo({ left: 60, top: 40 }));
  assert(await zoomViewport.evaluate(el => el.scrollLeft > 0 && el.scrollTop > 0), 'Zoomed activity cannot be explored by scrolling');
  await dialog.getByRole('button', { name: 'Zoom out', exact: true }).click();
  assert.match(await dialog.innerText(), /350%/, 'Zoom out did not decrease zoom');
  await dialog.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('dialog').innerText.includes('100%'));
  assert.deepEqual(await zoomViewport.evaluate(el => ({ left: el.scrollLeft, top: el.scrollTop })), { left: 0, top: 0 }, 'Fit did not reset the viewport scroll position');
  const resize = sizes.find(value => value.width !== size.width);
  await page.setViewportSize(resize);
  await settled(frame);
  item.resized = await measurements(page, frame);
  readable(item.resized, `${size.width}px -> ${resize.width}px expanded resize`);
  await unchanged(page, frame, history, 'resize');
  await noBodyOverflow(page, 'resize');
  await page.setViewportSize(size);
  await settled(frame);
  await page.screenshot({ path: path.join(outputDir, `${item.name}-expanded-fit.png`), fullPage: true });
  await page.locator('iframe').evaluate(iframe => { iframe.style.visibility = 'hidden'; });
  await dialog.getByRole('button', { name: 'Close expanded activity', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  item.hiddenFrameFocus = await page.evaluate(() => ({ tag: document.activeElement.tagName, name: document.activeElement.getAttribute('aria-label'), inside: document.querySelector('dialog').contains(document.activeElement), ariaHidden: document.activeElement.getAttribute('aria-hidden'), visibility: getComputedStyle(document.activeElement).visibility }));
  assert(item.hiddenFrameFocus.inside && ['DIV', 'BUTTON'].includes(item.hiddenFrameFocus.tag) && item.hiddenFrameFocus.visibility === 'visible' && item.hiddenFrameFocus.ariaHidden !== 'true', `Hidden iframe left keyboard focus on an unavailable control: ${JSON.stringify(item.hiddenFrameFocus)}`);
  await page.locator('iframe').evaluate(iframe => { iframe.style.visibility = 'visible'; });
  await unchanged(page, frame, history, 'hidden-iframe focus fallback');
  for (const direction of [{ key: 'Tab', field: 'focusPath', start: 'Fit' }, { key: 'Shift+Tab', field: 'reverseFocusPath', start: 'Close expanded activity' }]) {
    await dialog.getByRole('button', { name: direction.start, exact: true }).focus();
    item[direction.field] = [];
    for (let index = 0; index < 10; index++) {
      await page.keyboard.press(direction.key);
      const focus = await page.evaluate(() => ({ tag: document.activeElement.tagName, name: document.activeElement.getAttribute('aria-label') || document.activeElement.textContent?.slice(0, 80), inside: document.querySelector('dialog').contains(document.activeElement), documentFocused: document.hasFocus() }));
      item[direction.field].push(focus);
      assert(focus.inside && focus.tag !== 'BODY', `${direction.key} focus escaped the expanded activity: ${JSON.stringify(focus)}`);
    }
  }
  await frame.getByRole('button', { name: 'Choose Sun', exact: true }).focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog').matches(':modal'));
  assert(await expand.evaluate(el => document.activeElement === el), 'Escape from iframe did not restore focus to Expand');
  assert.equal(await page.evaluate(() => document.body.style.overflow), initialBodyOverflow, 'Closing the activity left page scrolling locked');
  await settled(frame);
  await unchanged(page, frame, history, 'iframe Escape close');
  await expand.click();
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: 'Close expanded activity', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('dialog').matches(':modal'));
  await unchanged(page, frame, history, 'close button');
  await expand.click();
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: 'Fit', exact: true }).focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog').matches(':modal'));
  await unchanged(page, frame, history, 'parent Escape close');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForFunction(() => window.__history.currentVizIndex === 1 && window.__readyCount === 2);
  assert.match(await page.locator('#history').innerText(), /2 \/ 2/, 'Next history item unavailable after close');
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await page.waitForFunction(() => window.__history.currentVizIndex === 0 && window.__readyCount === 3);
  assert.match(await page.locator('#history').innerText(), /1 \/ 2/, 'Previous history item unavailable after close');
  assert.deepEqual(await page.evaluate(() => window.__blockedFetches), [], 'Unexpected harness fetch');
  item.assertionsPassed = true;
  await page.close();
}

async function run() {
  const options = optionsFrom(process.argv.slice(2));
  const outputDir = options['output-dir'] ? path.resolve(options['output-dir']) : fs.mkdtempSync(path.join(os.tmpdir(), 'readable-view-'));
  fs.mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, 'readable-view.json');
  const report = { utc: new Date().toISOString(), kind: 'offline actual ReactRenderer, LearningActivityView, and visualizationReducer', chromiumSandbox: true, externalNetworkBlocked: true, assertionsPassed: false, fixture: 'readable-learning-activity.json', scope: 'Authored source layout and viewer behavior; does not establish quality of new model output. Hidden-frame focus case styles the actual iframe visibility as used during renderer loading/errors; it verifies the viewer fallback without claiming a renderer error-flow test.', networkRequests: [], errors: [], cases: [] };
  report.sourceHashes = Object.fromEntries(['src/components/lessons/ReactRenderer.tsx', 'src/components/lessons/LearningActivityView.tsx', 'src/lib/lesson-artifacts/sandbox-responsive.ts', 'scripts/verify-readable-view.cjs', 'scripts/fixtures/readable-learning-activity.json'].filter(file => fs.existsSync(path.join(repo, file))).map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, file))).digest('hex')]));
  let browser;
  try {
    const html = await harness();
    const { chromium } = options['playwright-package'] ? require(options['playwright-package']) : localRequire('playwright');
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(options.chromium ? { executablePath: path.resolve(options.chromium) } : {}) });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => { report.networkRequests.push(route.request().url().split('?')[0]); return route.abort(); });
    context.on('page', page => page.on('pageerror', error => report.errors.push(error.message)));
    for (const size of sizes) await viewportCase(context, html, size, report, outputDir);
    assert.deepEqual(report.networkRequests, [], 'Unexpected network attempted');
    assert.deepEqual(report.errors, [], 'Browser errors');
    assert.equal(report.cases.length, 3, 'Missing viewport regression case');
    assert(report.cases.every(item => item.assertionsPassed), 'Incomplete viewport regression');
    report.assertionsPassed = true;
  } catch (error) {
    report.failure = { message: error.message, stack: error.stack };
    process.exitCode = 1;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (error) { report.assertionsPassed = false; report.closeFailure = error.message; process.exitCode = 1; }
    }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify({ assertionsPassed: report.assertionsPassed, cases: report.cases.length, report: reportPath, failure: report.failure?.message }));
  if (report.failure) console.error(report.failure.stack);
}

run().catch(error => { console.error(error.stack); process.exitCode = 1; });
