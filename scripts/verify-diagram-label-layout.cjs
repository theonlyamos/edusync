#!/usr/bin/env node
/* global document, getComputedStyle, requestAnimationFrame, window */
/* Offline browser regression for the actual ReactRenderer and visualizationReducer.
 * Usage: node scripts/verify-diagram-label-layout.cjs
 *   [--playwright-package <module-or-package-directory>] [--chromium <executable>]
 *   [--output-dir <directory>]
 * Requires installed repository dependencies and Playwright with Chromium available.
 * No server, credentials, generation calls, or external network are used.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const repo = path.resolve(__dirname, '..');
const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }];

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === '--help') {
      console.log('node scripts/verify-diagram-label-layout.cjs [--playwright-package <module-or-directory>] [--chromium <executable>] [--output-dir <directory>]');
      return null;
    }
    assert(['--playwright-package', '--chromium', '--output-dir'].includes(name), `Unknown option: ${name}`);
    const value = args[++index];
    assert(value && !value.startsWith('--'), `Missing value for ${name}`);
    options[name.slice(2)] = value;
  }
  return options;
}

function loadPlaywright(options) {
  const packages = options['playwright-package'] ? [options['playwright-package']] : ['playwright', 'playwright-core'];
  for (const name of packages) {
    let resolved;
    try {
      resolved = require.resolve(name, { paths: [repo, process.cwd()] });
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
      continue;
    }
    return require(resolved);
  }
  throw new Error('Playwright is unavailable. Install playwright or pass --playwright-package <package-directory>.');
}

function loadHarness() {
  const ts = require(require.resolve('typescript', { paths: [repo] }));
  const assets = Object.fromEntries([
    ['react', 'react-18.3.1.production.min.js'],
    ['reactDom', 'react-dom-18.3.1.production.min.js'],
    ['tailwindCss', 'tailwind.generated.css'],
  ].map(([key, file]) => [key, fs.readFileSync(path.join(repo, 'public/lesson-runtime', file), 'utf8')]));
  const compile = relative => ts.transpileModule(fs.readFileSync(path.join(repo, relative), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React, esModuleInterop: true,
    },
  }).outputText;
  const sources = {
    '@/lib/lesson-artifacts/react-sandbox-runtime': compile('src/lib/lesson-artifacts/react-sandbox-runtime.ts'),
    '@/lib/lesson-artifacts/sandbox-responsive': compile('src/lib/lesson-artifacts/sandbox-responsive.ts'),
    renderer: compile('src/components/lessons/ReactRenderer.tsx'),
    reducer: compile('src/reducers/visualizationReducer.ts'),
  };
  const safe = value => JSON.stringify(value).replace(/</g, '\\u003c');
  const script = value => value.replace(/<\/script/gi, '<\\/script');
  return fixture => {
    assert.equal(fixture.library, 'react', 'Expected a saved React fixture');
    assert.equal(typeof fixture.code, 'string', 'Expected fixture code');
    return `<!doctype html><html><head><meta charset="utf-8"><style>${assets.tailwindCss.replace(/<\/style/gi, '<\\/style')}</style><style>
*{box-sizing:border-box}body{margin:0;background:#faf9f6;font-family:Arial,sans-serif}#app{height:780px;margin:116px 24px 24px}#preview{height:100%;background:white;border-radius:8px}button{font:inherit}#history{position:absolute;top:30px;right:24px;display:flex;gap:12px}
@media(max-width:639px){#app{height:664px;margin:80px 12px 24px}#history{top:24px;right:12px}}
</style><script>${script(assets.react)}</script><script>${script(assets.reactDom)}</script></head><body><div id="app"></div><script>
const assets=${safe(assets)}, sources=${safe(sources)}, fixture=${safe(fixture)};
window.__blockedFetches=[];
window.fetch=async function(url){const key=Object.keys(assets).find(k=>({'react':'/lesson-runtime/react-18.3.1.production.min.js','reactDom':'/lesson-runtime/react-dom-18.3.1.production.min.js','tailwindCss':'/lesson-runtime/tailwind.generated.css'})[k]===url);if(!key){window.__blockedFetches.push(String(url));throw Error('Offline fixture blocked fetch: '+url);}return {ok:true,text:async()=>assets[key]};};
const cache={react:React,'./VisualizationSkeleton':{VisualizationSkeleton:()=>React.createElement('div',null,'Loading')}};
function require(name){if(cache[name])return cache[name];if(!sources[name])throw Error('Unbundled harness module: '+name);const module={exports:{}};cache[name]=module.exports;new Function('module','exports','require',sources[name])(module,module.exports,require);return cache[name]=module.exports;}
const Renderer=require('renderer').ReactRenderer, {vizReducer,initialVizState}=require('reducer');
function App(){const [state,dispatch]=React.useReducer(vizReducer,initialVizState,s=>vizReducer(s,{type:'LOAD_VISUALIZATIONS',payload:[{...fixture,id:'photosynthesis'},{...fixture,code:fixture.code+String.fromCharCode(10),id:'second-visualization'}]}));window.__history=state;return React.createElement(React.Fragment,null,React.createElement('div',{id:'history'},React.createElement('button',{onClick:()=>dispatch({type:'SET_CURRENT_VIZ_INDEX',payload:state.currentVizIndex-1}),disabled:state.currentVizIndex===0},'Previous'),React.createElement('span',null,(state.currentVizIndex+1)+' / '+state.visualizations.length),React.createElement('button',{onClick:()=>dispatch({type:'SET_CURRENT_VIZ_INDEX',payload:state.currentVizIndex+1}),disabled:state.currentVizIndex===state.visualizations.length-1},'Next')),React.createElement('div',{id:'preview'},React.createElement(Renderer,{code:state.code,onError:error=>window.__renderError=error,onReady:()=>window.__readyCount=(window.__readyCount||0)+1})));}
ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(App));
</script></body></html>`;
  };
}

// Evaluated inside the renderer's opaque-origin iframe, using browser geometry.
function geometry() {
  return Array.from(document.querySelectorAll('svg')).filter(svg => !svg.closest('.recharts-wrapper,.leaflet-container')).map(svg => {
    const bounds = svg.getBoundingClientRect();
    const texts = Array.from(svg.querySelectorAll('text')).filter(el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden').map(el => {
      const rect = el.getBoundingClientRect();
      const ctm = el.getScreenCTM();
      const move = /^translate\(([-\d.e]+) ([-\d.e]+)\)$/.exec(el.getAttribute('transform') || '');
      return {
        text: el.textContent, authoredX: el.getAttribute('x'), authoredY: el.getAttribute('y'),
        movement: move ? Math.hypot(Number(move[1]) * ctm.a, Number(move[2]) * ctm.d) : 0,
        x: rect.x - bounds.x, y: rect.y - bounds.y, width: rect.width, height: rect.height,
        fontSize: parseFloat(getComputedStyle(el).fontSize) * Math.min(Math.hypot(ctm.a, ctm.b), Math.hypot(ctm.c, ctm.d)),
      };
    });
    const overlaps = [];
    const arrowTipsCovered = Array.from(svg.querySelectorAll('text')).flatMap(label => {
      const line = label.previousElementSibling;
      if (!line || line.tagName.toLowerCase() !== 'line' || !line.getAttribute('marker-end')) return [];
      const point = svg.createSVGPoint();
      point.x = line.x2.baseVal.value; point.y = line.y2.baseVal.value;
      const tip = point.matrixTransform(line.getScreenCTM());
      const rect = label.getBoundingClientRect();
      return tip.x > rect.left && tip.x < rect.right && tip.y > rect.top && tip.y < rect.bottom ? [label.textContent] : [];
    });
    for (let a = 0; a < texts.length; a++) for (let b = a + 1; b < texts.length; b++) {
      const left = Math.max(texts[a].x, texts[b].x), top = Math.max(texts[a].y, texts[b].y);
      const right = Math.min(texts[a].x + texts[a].width, texts[b].x + texts[b].width);
      const bottom = Math.min(texts[a].y + texts[a].height, texts[b].y + texts[b].height);
      if (right > left + .5 && bottom > top + .5) overlaps.push({ a: texts[a].text, b: texts[b].text, area: (right - left) * (bottom - top) });
    }
    const clipped = texts.filter(t => t.x < -.5 || t.y < -.5 || t.x + t.width > bounds.width + .5 || t.y + t.height > bounds.height + .5);
    return { width: bounds.width, height: bounds.height, texts, overlaps, clipped, arrowTipsCovered };
  });
}

async function settle(frame) {
  await frame.waitForFunction(() => window.lessonViewport?.width === document.documentElement.clientWidth);
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function openFixture(context, html, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.setContent(html);
  await page.waitForFunction(() => window.__readyCount === 1 || window.__renderError, null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__renderError), undefined, 'Renderer reported an error');
  assert.deepEqual(await page.evaluate(() => window.__blockedFetches), [], 'Unexpected harness fetch');
  const frame = page.frames().find(child => child.parentFrame());
  assert(frame, 'Renderer iframe missing');
  await frame.waitForSelector('svg text');
  await settle(frame);
  return { page, frame };
}

function assertGeometry(stage, width) {
  assert.equal(stage.length, 1, 'Collision fixture must render exactly one SVG');
  for (const svg of stage) {
    assert.deepEqual(svg.overlaps, [], `Overlapping SVG labels at ${width}px`);
    assert.deepEqual(svg.clipped, [], `Clipped SVG labels at ${width}px`);
    assert.deepEqual(svg.arrowTipsCovered, [], `Label covers its arrow tip at ${width}px`);
    assert.deepEqual(svg.texts.map(t => [t.authoredX, t.authoredY]), [['410', '57'], ['10', '135'], ['255', '318'], ['50', '325'], ['410', '60'], ['420', '82']], 'Authored anchors changed');
    for (const text of svg.texts) {
      assert(text.fontSize >= 13.99, `Unreadable SVG label ${text.text}: ${text.fontSize}px`);
      assert(text.movement <= 48.01, `Label moved too far: ${text.movement}px`);
    }
  }
}

async function collisionCases(context, html, report, outputDir) {
  for (const viewport of viewports) {
    const item = { name: `collision-${viewport.width}`, viewport, assertionsPassed: false };
    report.cases.push(item);
    const { page, frame } = await openFixture(context, html, viewport);
    item.before = await frame.evaluate(geometry);
    assertGeometry(item.before, viewport.width);
    await page.screenshot({ path: path.join(outputDir, `${item.name}.png`), fullPage: true });
    const beforeAnswer = await frame.locator('body').innerText();
    await frame.getByRole('button', { name: 'Carbon Dioxide', exact: true }).click();
    const feedback = await frame.locator('body').innerText();
    assert.notEqual(feedback, beforeAnswer, 'Quiz answer produced no feedback');
    await page.screenshot({ path: path.join(outputDir, `${item.name}-feedback.png`), fullPage: true });
    await frame.evaluate(() => { window.__fixtureIdentity = 'same-scene'; });
    const history = await page.evaluate(() => ({ index: window.__history.currentVizIndex, code: window.__history.code, ids: window.__history.visualizations.map(v => v.id) }));
    const opposite = viewports.find(size => size.width !== viewport.width);
    item.resizeTo = opposite;
    await page.setViewportSize(opposite);
    await settle(frame);
    item.after = await frame.evaluate(geometry);
    assertGeometry(item.after, opposite.width);
    item.statePreserved = await frame.evaluate(() => window.__fixtureIdentity === 'same-scene') && await frame.locator('body').innerText() === feedback && await page.evaluate(() => window.__readyCount) === 1;
    assert(item.statePreserved, 'Quiz scene reset during resize');
    assert.deepEqual(await page.evaluate(() => ({ index: window.__history.currentVizIndex, code: window.__history.code, ids: window.__history.visualizations.map(v => v.id) })), history, 'Visualization history changed during resize');
    await page.screenshot({ path: path.join(outputDir, `${item.name}-resized.png`), fullPage: true });
    for (let repeat = 0; repeat < 3; repeat++) {
      await page.setViewportSize(viewport);
      await settle(frame);
      assert.deepEqual(await frame.evaluate(geometry), item.before, 'SVG label positions drift after repeated resize');
      assert.equal(await frame.locator('body').innerText(), feedback, 'Quiz feedback reset on repeated resize');
      await page.setViewportSize(opposite);
      await settle(frame);
      assert.deepEqual(await frame.evaluate(geometry), item.after, 'SVG label positions drift after reciprocal resize');
      assert.equal(await frame.locator('body').innerText(), feedback, 'Quiz feedback reset on reciprocal resize');
    }
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__history.currentVizIndex), 1);
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__history.currentVizIndex), 0);
    Object.assign(item, { historyPreserved: true, historyNavigation: true, feedbackPresent: true, repeatedResizeDrift: false, assertionsPassed: true });
    await page.close();
  }
}

function readControls() {
  return Array.from(document.querySelectorAll('text[id]')).map(label => ({
    id: label.id, font: label.style.fontSize, transform: label.getAttribute('transform'), rotate: label.getAttribute('rotate'),
    x: label.getAttribute('x'), y: label.getAttribute('y'), authoredFont: label.getAttribute('font-size'),
    rect: label.getBoundingClientRect().toJSON(), computedTransform: getComputedStyle(label).transform,
  }));
}

function assertControls(values, stage) {
  for (const label of values) {
    if (label.id === 'visible-label') continue;
    assert.equal(label.font, '', `${label.id}: authored font changed ${stage}`);
    assert.equal(label.transform, label.id === 'svg-transform-label' ? 'translate(6 0)' : null, `${label.id}: authored transform changed ${stage}`);
    assert.equal(label.rotate, label.id === 'rotated-label' ? '20' : null, `${label.id}: authored rotation changed ${stage}`);
  }
  const visible = values.find(label => label.id === 'visible-label');
  assert(visible, 'Visible control is missing');
  assert.equal(visible.transform, null, 'Hidden text interfered with visible label');
  assert(parseFloat(visible.font) >= 14, 'Visible control not adapted');
}

async function guardCase(context, html, report, outputDir) {
  const item = { name: 'svg-label-controls', assertionsPassed: false, transitions: [] };
  report.cases.push(item);
  const { page, frame } = await openFixture(context, html, viewports[0]);
  await frame.waitForSelector('#infeasible-label');
  item.before = await frame.evaluate(readControls);
  assert(item.before.length > 20, 'Guard fixture did not render its controls');
  for (const id of ['animated-label', 'nested-label', 'crowded-first', 'crowded-second', 'css-text-label', 'chart-label', 'map-label']) {
    assert(item.before.some(label => label.id === id), `Guard fixture missing ${id}`);
  }
  assertControls(item.before, 'initially');
  item.htmlTimerMeasurements = await frame.evaluate(async () => {
    let measurements = 0;
    document.querySelectorAll('svg text').forEach(label => {
      const measure = label.getBoundingClientRect.bind(label);
      label.getBoundingClientRect = () => { measurements++; return measure(); };
    });
    const timer = document.createElement('span');
    timer.style.cssText = 'position:fixed;width:1px;height:1px';
    document.getElementById('root').append(timer);
    for (let i = 0; i < 20; i++) {
      timer.textContent = String(i);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return measurements;
  });
  assert.equal(item.htmlTimerMeasurements, 0, 'HTML timer relaid out static SVG labels');
  for (const transition of ['chart', 'viewBox', 'marker', 'rotation']) {
    await frame.evaluate(kind => {
      const svg = document.getElementById('hidden');
      if (kind === 'chart') svg.setAttribute('aria-label', 'chart');
      if (kind === 'viewBox') svg.removeAttribute('viewBox');
      if (kind === 'marker') svg.querySelector('line').removeAttribute('marker-end');
      if (kind === 'rotation') svg.style.transform = 'rotate(5deg)';
      window.dispatchEvent(new Event('resize'));
    }, transition);
    await settle(frame);
    assert.equal(await frame.locator('#visible-label').evaluate(label => label.style.fontSize), '', `${transition} transition retained injected font`);
    assert.equal(await frame.locator('#visible-label').getAttribute('transform'), null, `${transition} transition retained injected transform`);
    await frame.evaluate(() => {
      const svg = document.getElementById('hidden');
      svg.removeAttribute('aria-label'); svg.setAttribute('viewBox', '0 0 200 100');
      svg.querySelector('line').setAttribute('marker-end', 'url(#controlArrow)');
      svg.style.transform = ''; window.dispatchEvent(new Event('resize'));
    });
    await settle(frame);
    assert(parseFloat(await frame.locator('#visible-label').evaluate(label => label.style.fontSize)) >= 14, `${transition} supported transition did not restore label pass`);
    item.transitions.push({ kind: transition, authoredStateRestored: true, supportedPassRestored: true });
  }
  await page.setViewportSize(viewports[1]);
  await settle(frame);
  item.after = await frame.evaluate(readControls);
  assertControls(item.after, 'on resize');
  const authored = values => values.map(({ id, x, y, authoredFont, rotate }) => ({ id, x, y, authoredFont, rotate }));
  assert.deepEqual(authored(item.after), authored(item.before), 'Guard authored attributes changed on resize');
  await page.screenshot({ path: path.join(outputDir, `${item.name}-390.png`), fullPage: true });
  item.guardLabels = item.before.length - 1;
  item.assertionsPassed = true;
  await page.close();
}

async function run() {
  const options = parseOptions(process.argv.slice(2));
  if (!options) return;
  const outputDir = options['output-dir'] ? path.resolve(options['output-dir']) : fs.mkdtempSync(path.join(os.tmpdir(), 'diagram-label-layout-'));
  fs.mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, 'diagram-label-layout.json');
  const report = {
    utc: new Date().toISOString(), kind: 'offline actual ReactRenderer and visualizationReducer',
    chromiumSandbox: true, externalNetworkBlocked: true, assertionsPassed: false,
    fixtures: ['photosynthesis-label-collision.json', 'svg-label-controls.json'],
    omitted: ['Persisted sequence 808 (requires a test-only explicit Component wrapper for the existing renderer normalization issue)'],
    networkRequests: [], errors: [], cases: [],
  };
  let browser;
  try {
    const html = loadHarness();
    const fixtures = report.fixtures.map(file => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8')));
    const { chromium } = loadPlaywright(options);
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(options.chromium ? { executablePath: path.resolve(options.chromium) } : {}) });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => {
      report.networkRequests.push(route.request().url().split('?')[0]);
      return route.abort();
    });
    context.on('page', page => page.on('pageerror', error => report.errors.push(error.message)));
    await collisionCases(context, html(fixtures[0]), report, outputDir);
    await guardCase(context, html(fixtures[1]), report, outputDir);
    assert.equal(report.networkRequests.length, 0, 'Unexpected network attempted');
    assert.deepEqual(report.errors, [], 'Renderer errors');
    assert.equal(report.cases.length, 3, 'Missing regression case');
    assert(report.cases.every(item => item.assertionsPassed), 'Incomplete regression case');
    report.assertionsPassed = true;
  } catch (error) {
    report.failure = { message: error.message, stack: error.stack };
    process.exitCode = 1;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (error) {
        report.assertionsPassed = false;
        report.closeFailure = { message: error.message, stack: error.stack };
        process.exitCode = 1;
      }
    }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify({ assertionsPassed: report.assertionsPassed, cases: report.cases.length, report: reportPath, failure: report.failure?.message }));
  if (report.failure) console.error(report.failure.stack);
}

run().catch(error => { console.error(error.stack); process.exitCode = 1; });
