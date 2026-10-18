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
    '@/lib/lesson-artifacts/react-component-source': compile('src/lib/lesson-artifacts/react-component-source.ts'),
    '@/lib/lesson-artifacts/coding-editor-bridge': compile('src/lib/lesson-artifacts/coding-editor-bridge.ts'),
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
const cache={react:React,'./VisualizationSkeleton':{VisualizationSkeleton:()=>React.createElement('div',null,'Loading')},'./LearningActivityView':{LearningActivityView:props=>React.createElement(React.Fragment,null,props.children)},'./CodingWorkspace':{CodingWorkspace:()=>null}};
function require(name){if(cache[name])return cache[name];if(!sources[name])throw Error('Unbundled harness module: '+name);const module={exports:{}};cache[name]=module.exports;new Function('module','exports','require',sources[name])(module,module.exports,require);return cache[name]=module.exports;}
const Renderer=require('renderer').ReactRenderer, {vizReducer,initialVizState}=require('reducer');
function App(){const [state,dispatch]=React.useReducer(vizReducer,initialVizState,s=>vizReducer(s,{type:'LOAD_VISUALIZATIONS',payload:[{...fixture,id:'photosynthesis'},{...fixture,code:fixture.code+String.fromCharCode(10),id:'second-visualization'}]}));window.__history=state;return React.createElement(React.Fragment,null,React.createElement('div',{id:'history'},React.createElement('button',{onClick:()=>dispatch({type:'SET_CURRENT_VIZ_INDEX',payload:state.currentVizIndex-1}),disabled:state.currentVizIndex===0},'Previous'),React.createElement('span',null,(state.currentVizIndex+1)+' / '+state.visualizations.length),React.createElement('button',{onClick:()=>dispatch({type:'SET_CURRENT_VIZ_INDEX',payload:state.currentVizIndex+1}),disabled:state.currentVizIndex===state.visualizations.length-1},'Next')),React.createElement('div',{id:'preview'},React.createElement(Renderer,{code:state.code,onError:error=>window.__renderError=error,onReady:()=>window.__readyCount=(window.__readyCount||0)+1})));}
ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(App));
</script></body></html>`;
  };
}

// Independent painted-arrowhead oracle: samples each visible marker's own path outline through DOMMatrix.
const PAINTED_MARKERS = `svg => Array.from(svg.querySelectorAll('line, path, polyline')).flatMap(edge => {
  if (edge.closest('defs, marker')) return [];
  for (let node = edge; node && node !== svg.parentElement; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return [];
  }
  const style = getComputedStyle(edge);
  const length = edge.getTotalLength();
  const ctm = edge.getScreenCTM();
  return ['start', 'end'].flatMap(side => {
    const value = style.getPropertyValue('marker-' + side) || edge.getAttribute('marker-' + side) || '';
    const id = /#([^"')]+)/.exec(value);
    const marker = id && document.getElementById(id[1]);
    if (!marker) return [];
    const at = side === 'start' ? 0 : length;
    const point = edge.getPointAtLength(at);
    const before = edge.getPointAtLength(Math.max(0, at - .01)), after = edge.getPointAtLength(Math.min(length, at + .01));
    const orient = marker.getAttribute('orient') || '0';
    let angle = orient.startsWith('auto') ? Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI : Number(orient);
    if (orient === 'auto-start-reverse' && side === 'start') angle += 180;
    const scale = marker.getAttribute('markerUnits') === 'userSpaceOnUse' ? 1 : parseFloat(style.strokeWidth);
    const matrix = new DOMMatrix([ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f]).translate(point.x, point.y).rotate(angle).scale(scale)
      .translate(-marker.refX.baseVal.value, -marker.refY.baseVal.value);
    return Array.from(marker.querySelectorAll('path')).flatMap(shape => {
      const total = shape.getTotalLength();
      return Array.from({ length: 81 }, (_, index) => {
        const sample = shape.getPointAtLength(total * index / 80);
        const mapped = new DOMPoint(sample.x, sample.y).matrixTransform(matrix);
        return { edge: edge.id || edge.tagName.toLowerCase(), side, x: mapped.x, y: mapped.y };
      });
    });
  });
})`;

// Evaluated inside the renderer's opaque-origin iframe, using browser geometry.
function geometry(painted) {
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
    const paint = painted(svg);
    const arrowheadsCovered = Array.from(svg.querySelectorAll('text')).flatMap(label => {
      const rect = label.getBoundingClientRect();
      const hits = [...new Set(paint.filter(point => point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom).map(point => point.edge + ':' + point.side))];
      return hits.length ? [{ label: label.textContent, hits }] : [];
    });
    const clipped = texts.filter(t => t.x < -.5 || t.y < -.5 || t.x + t.width > bounds.width + .5 || t.y + t.height > bounds.height + .5);
    return { width: bounds.width, height: bounds.height, texts, overlaps, clipped, arrowTipsCovered, arrowheadsCovered, paintedPoints: paint.length };
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
    assert(svg.paintedPoints > 0, `Arrowhead oracle sampled no marker paint at ${width}px`);
    assert.deepEqual(svg.arrowheadsCovered, [], `Label covers a painted arrowhead at ${width}px`);
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
    item.before = await frame.evaluate(`(${geometry})(${PAINTED_MARKERS})`);
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
    item.after = await frame.evaluate(`(${geometry})(${PAINTED_MARKERS})`);
    assertGeometry(item.after, opposite.width);
    item.statePreserved = await frame.evaluate(() => window.__fixtureIdentity === 'same-scene') && await frame.locator('body').innerText() === feedback && await page.evaluate(() => window.__readyCount) === 1;
    assert(item.statePreserved, 'Quiz scene reset during resize');
    assert.deepEqual(await page.evaluate(() => ({ index: window.__history.currentVizIndex, code: window.__history.code, ids: window.__history.visualizations.map(v => v.id) })), history, 'Visualization history changed during resize');
    await page.screenshot({ path: path.join(outputDir, `${item.name}-resized.png`), fullPage: true });
    for (let repeat = 0; repeat < 3; repeat++) {
      await page.setViewportSize(viewport);
      await settle(frame);
      assert.deepEqual(await frame.evaluate(`(${geometry})(${PAINTED_MARKERS})`), item.before, 'SVG label positions drift after repeated resize');
      assert.equal(await frame.locator('body').innerText(), feedback, 'Quiz feedback reset on repeated resize');
      await page.setViewportSize(opposite);
      await settle(frame);
      assert.deepEqual(await frame.evaluate(`(${geometry})(${PAINTED_MARKERS})`), item.after, 'SVG label positions drift after reciprocal resize');
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
  return Array.from(document.querySelectorAll('text[id]')).map(label => {
    const svg = label.closest('svg');
    const matrix = label.getScreenCTM() || { a: 0, b: 0, c: 0, d: 0 };
    const rect = label.getBoundingClientRect();
    const arrowTips = Array.from(svg.querySelectorAll('line[marker-end]')).map(line => {
      const point = svg.createSVGPoint();
      point.x = line.x2.baseVal.value; point.y = line.y2.baseVal.value;
      const tip = point.matrixTransform(line.getScreenCTM());
      return { x: tip.x, y: tip.y };
    });
    return {
      id: label.id, font: label.style.fontSize, transform: label.getAttribute('transform'), rotate: label.getAttribute('rotate'),
      x: label.getAttribute('x'), y: label.getAttribute('y'), authoredFont: label.getAttribute('font-size'),
      rect: rect.toJSON(), computedTransform: getComputedStyle(label).transform,
      svgId: svg.id, svgBounds: svg.getBoundingClientRect().toJSON(), arrowTips,
      renderedFont: parseFloat(getComputedStyle(label).fontSize) * Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)),
    };
  });
}

function assertControls(values, stage) {
  const semanticIds = ['flowchart-evaporation', 'flowchart-rainfall', 'concept-map-producer', 'concept-map-consumer'];
  for (const label of values) {
    if (label.id === 'visible-label' || semanticIds.includes(label.id)) continue;
    assert.equal(label.font, '', `${label.id}: authored font changed ${stage}`);
    assert.equal(label.transform, label.id === 'svg-transform-label' ? 'translate(6 0)' : null, `${label.id}: authored transform changed ${stage}`);
    assert.equal(label.rotate, label.id === 'rotated-label' ? '20' : null, `${label.id}: authored rotation changed ${stage}`);
  }
  for (const id of [...semanticIds, 'named-chart-label', 'data-chart-label', 'geographic-map-label', 'chart-label', 'map-label']) {
    assert(values.some(label => label.id === id), `Semantic control missing ${id}`);
  }
  const semanticLabels = values.filter(label => semanticIds.includes(label.id));
  for (const label of semanticLabels) {
    assert(label.renderedFont >= 13.99, `${label.id}: unreadable semantic diagram label ${stage}: ${label.renderedFont}px`);
    assert.equal(label.authoredFont, '8', `${label.id}: authored font attribute changed ${stage}`);
    assert.equal(label.x, label.id.endsWith('evaporation') || label.id.endsWith('producer') ? '65' : '67', `${label.id}: authored x changed ${stage}`);
    assert.equal(label.y, label.id.endsWith('evaporation') || label.id.endsWith('producer') ? '45' : '47', `${label.id}: authored y changed ${stage}`);
    const bounds = label.svgBounds, rect = label.rect;
    assert(rect.left >= bounds.left - .5 && rect.top >= bounds.top - .5 && rect.right <= bounds.right + .5 && rect.bottom <= bounds.bottom + .5, `${label.id}: clipped semantic diagram label ${stage}`);
    assert(!label.arrowTips.some(tip => tip.x > rect.left && tip.x < rect.right && tip.y > rect.top && tip.y < rect.bottom), `${label.id}: semantic diagram label covers arrow tip ${stage}`);
    for (const other of semanticLabels.filter(other => other.svgId === label.svgId && other.id !== label.id)) {
      const width = Math.min(rect.right, other.rect.right) - Math.max(rect.left, other.rect.left);
      const height = Math.min(rect.bottom, other.rect.bottom) - Math.max(rect.top, other.rect.top);
      assert(width <= .5 || height <= .5, `${label.id}: overlapping semantic diagram label ${other.id} ${stage}`);
    }
  }
  const visible = values.find(label => label.id === 'visible-label');
  assert(visible, 'Visible control is missing');
  assert.equal(visible.transform, null, 'Hidden text interfered with visible label');
  assert(parseFloat(visible.font) >= 14, 'Visible control not adapted');
}

async function presentationTransitions(frame) {
  const transitions = [];
  for (const attribute of ['opacity', 'visibility', 'display']) {
    const hidden = attribute === 'opacity' ? '0' : attribute === 'visibility' ? 'hidden' : 'none';
    const shown = attribute === 'opacity' ? '1' : attribute === 'visibility' ? 'visible' : 'inline';
    for(let repeat=0;repeat<2;repeat++) {
      await frame.evaluate(({name,value})=>document.getElementById('hide-'+name+'-group').setAttribute(name,value),{name:attribute,value:shown});
      await settle(frame);
      const visible = await frame.locator('#hide-'+attribute+'-label').evaluate(label=>({
        font: label.style.fontSize, renderedFont: parseFloat(getComputedStyle(label).fontSize),
        authoredFont: label.getAttribute('font-size'), x: label.getAttribute('x'), y: label.getAttribute('y'),
      }));
      assert(visible.renderedFont>=13.99, attribute+': revealed label stayed undersized without resize');
      assert.equal(visible.authoredFont,'8',attribute+': authored font changed');
      assert.equal(visible.x,'80',attribute+': authored x changed');
      assert.equal(visible.y,'45',attribute+': authored y changed');
      await frame.evaluate(({name,value})=>document.getElementById('hide-'+name+'-group').setAttribute(name,value),{name:attribute,value:hidden});
      await settle(frame);
      assert.equal(await frame.locator('#hide-'+attribute+'-label').evaluate(label=>label.style.fontSize),'',attribute+': hidden label retained injected font');
    }
    transitions.push({attribute,automaticReveal:true,authoredHiddenLayoutRestored:true,repetitions:2});
  }
  return transitions;
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
  item.chartPhraseControls = [];
  for (const phrase of ['data plot', 'monthly rainfall bar chart', 'knowledge graph', 'data chart']) {
    await frame.evaluate(name => document.getElementById('named-data-chart').setAttribute('aria-label', name), phrase);
    await settle(frame);
    const control = await frame.locator('#data-chart-label').evaluate(label => ({
      font: label.style.fontSize, authoredFont: label.getAttribute('font-size'),
      transform: label.getAttribute('transform'), renderedFont: parseFloat(getComputedStyle(label).fontSize),
    }));
    assert.equal(control.authoredFont, '8', phrase + ': authored font attribute changed');
    assert.equal(control.transform, null, phrase + ': authored transform changed');
    if (phrase === 'knowledge graph') assert(control.renderedFont >= 13.99, 'Knowledge graph must remain eligible');
    else assert.equal(control.font, '', phrase + ': data-chart guard weakened');
    item.chartPhraseControls.push({ phrase, authoredLayoutPreserved: phrase !== 'knowledge graph', eligible: phrase === 'knowledge graph' });
  }
  item.presentationTransitions = await presentationTransitions(frame);
  item.idleLabelMeasurements = await frame.evaluate(async () => {
    let measurements = 0;
    document.querySelectorAll('svg text').forEach(label => {
      const measure=label.getBoundingClientRect.bind(label);
      label.getBoundingClientRect=()=>{measurements++;return measure();};
    });
    for(let i=0;i<8;i++)await new Promise(resolve=>requestAnimationFrame(resolve));
    return measurements;
  });
  assert.equal(item.idleLabelMeasurements,0,'Own label writes triggered a layout feedback loop');
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
  for (const transition of ['chart', 'viewBox', 'marker', 'rotation', 'group-transform', 'group-class', 'group-style', 'text-transform', 'text-class', 'text-style']) {
    await frame.evaluate(kind => {
      const svg = document.getElementById('hidden');
      if (kind === 'chart') svg.setAttribute('aria-label', 'line chart');
      if (kind === 'viewBox') svg.removeAttribute('viewBox');
      if (kind === 'marker') svg.querySelector('line').removeAttribute('marker-end');
      if (kind === 'rotation') svg.style.transform = 'rotate(5deg)';
      const group=document.getElementById('dynamic-group');
      const label=document.getElementById('visible-label');
      if(kind==='group-transform')group.setAttribute('transform','scale(0.5)');
      if(kind==='group-class')group.setAttribute('class','css-group');
      if(kind==='group-style')group.style.transform='scale(0.5)';
      if(kind==='text-transform')label.setAttribute('transform','translate(6 0)');
      if(kind==='text-class')label.setAttribute('class','css-label');
      if(kind==='text-style')label.style.transform='rotate(5deg)';
    }, transition);
    await settle(frame);
    assert.equal(await frame.locator('#visible-label').evaluate(label => label.style.fontSize), '', `${transition} transition retained injected font`);
    assert.equal(await frame.locator('#visible-label').getAttribute('transform'), transition === 'text-transform' ? 'translate(6 0)' : null, `${transition} transition retained injected transform`);
    await frame.evaluate(() => {
      const svg = document.getElementById('hidden');
      svg.removeAttribute('aria-label'); svg.setAttribute('viewBox', '0 0 200 100');
      svg.querySelector('line').setAttribute('marker-end', 'url(#controlArrow)');
      svg.style.transform = '';
      const group=document.getElementById('dynamic-group');
      const label=document.getElementById('visible-label');
      group.removeAttribute('transform');group.removeAttribute('class');group.style.transform='';
      label.removeAttribute('transform');label.removeAttribute('class');label.style.transform='';
    });
    await settle(frame);
    assert(parseFloat(await frame.locator('#visible-label').evaluate(label => label.style.fontSize)) >= 14, `${transition} supported transition did not restore label pass`);
    item.transitions.push({ kind: transition, authoredStateRestored: true, supportedPassRestored: true });
  }
  await page.setViewportSize(viewports[1]);
  await settle(frame);
  item.after = await frame.evaluate(readControls);
  assertControls(item.after, 'on resize');
  item.phonePresentationTransitions = await presentationTransitions(frame);
  assertControls(await frame.evaluate(readControls), 'after phone hide/show');
  const authored = values => values.map(({ id, x, y, authoredFont, rotate }) => ({ id, x, y, authoredFont, rotate }));
  assert.deepEqual(authored(item.after), authored(item.before), 'Guard authored attributes changed on resize');
  await page.screenshot({ path: path.join(outputDir, `${item.name}-390.png`), fullPage: true });
  item.guardLabels = item.before.length - 1;
  item.assertionsPassed = true;
  await page.close();
}

// Independent endpoint oracle: every marked geometry endpoint is compared with every label.
function readEdgeGeometry() {
  return Array.from(document.querySelectorAll('svg[data-edge-case]')).map(svg => {
    const bounds = svg.getBoundingClientRect();
    const matrix = svg.getScreenCTM();
    const endpoints = Array.from(svg.querySelectorAll('line, path, polyline')).flatMap(edge => {
      const edgeMatrix = edge.getScreenCTM();
      const length = edge.getTotalLength();
      return ['start', 'end'].filter(side => {
        const marker = getComputedStyle(edge).getPropertyValue(`marker-${side}`) || edge.getAttribute(`marker-${side}`);
        return marker && marker.trim().toLowerCase() !== 'none';
      }).map(side => {
        const point = edge.getPointAtLength(side === 'start' ? 0 : length);
        const tip = point.matrixTransform(edgeMatrix);
        return { edgeId: edge.id, side, x: tip.x, y: tip.y,
          svgX: (tip.x - matrix.e) / matrix.a, svgY: (tip.y - matrix.f) / matrix.d };
      });
    });
    const labels = Array.from(svg.querySelectorAll('text')).map(label => {
      const rect = label.getBoundingClientRect();
      const labelMatrix = label.getScreenCTM();
      const movement = (label.getAttribute('transform') || '').match(/^translate\(([-\d.e+]+) ([-\d.e+]+)\)$/);
      const shiftX = movement ? Number(movement[1]) * matrix.a : 0;
      const shiftY = movement ? Number(movement[2]) * matrix.d : 0;
      const covers = point => point.x > rect.left + .5 && point.x < rect.right - .5 && point.y > rect.top + .5 && point.y < rect.bottom - .5;
      const enlargedUnshifted = point => point.x > rect.left - shiftX + .5 && point.x < rect.right - shiftX - .5 && point.y > rect.top - shiftY + .5 && point.y < rect.bottom - shiftY - .5;
      return { id: label.id, rect: rect.toJSON(), authoredX: label.getAttribute('x'), authoredY: label.getAttribute('y'),
        authoredFont: label.getAttribute('font-size'), font: label.style.fontSize, transform: label.getAttribute('transform'), movement: Math.hypot(shiftX, shiftY),
        fontSize: parseFloat(getComputedStyle(label).fontSize) * Math.min(Math.hypot(labelMatrix.a, labelMatrix.b), Math.hypot(labelMatrix.c, labelMatrix.d)),
        covered: endpoints.filter(covers).map(({ edgeId, side }) => ({ edgeId, side })),
        enlargedUnshiftedCovered: endpoints.filter(enlargedUnshifted).map(({ edgeId, side }) => ({ edgeId, side })),
      };
    });
    return { id: svg.id, scale: matrix.a, bounds: bounds.toJSON(), endpoints, labels,
      edges: Array.from(svg.querySelectorAll('line[id], path[id], polyline[id]')).map(edge => ({
        id: edge.id, tag: edge.tagName.toLowerCase(), transform: edge.getAttribute('transform'),
        attributes: Object.fromEntries(['x1', 'y1', 'x2', 'y2', 'd', 'points', 'marker-start', 'marker-end'].map(name => [name, edge.getAttribute(name)])),
      })),
    };
  });
}

function assertEdgeGeometry(values, stage) {
  const expected = [
    { id: 'edge-nonadjacent-line', tag: 'line', tips: [['end', 100, 40]], transform: null },
    { id: 'edge-marker-start', tag: 'line', tips: [['start', 100, 40]], transform: null },
    { id: 'edge-path', tag: 'path', tips: [['start', 10, 75], ['end', 100, 40]], transform: null, startLabel: ['30', '80'] },
    { id: 'edge-polyline-ctm', tag: 'polyline', tips: [['start', 40, 90], ['end', 100, 40]], transform: 'translate(30 20)', startLabel: ['60', '95'] },
    { id: 'css-only-line', tag: 'line', tips: [['start', 10, 75], ['end', 100, 40]], transform: null, startLabel: ['30', '80'] },
    { id: 'css-only-path', tag: 'path', tips: [['start', 10, 75], ['end', 100, 40]], transform: null, startLabel: ['30', '80'] },
    { id: 'css-only-polyline', tag: 'polyline', tips: [['start', 40, 90], ['end', 100, 40]], transform: 'translate(30 20)', startLabel: ['60', '95'] },
  ];
  assert.equal(values.length, expected.length, `${stage}: endpoint fixture SVG count`);
  for (const control of expected) {
    const svg = values.find(value => value.id === control.id);
    assert(svg, `${stage}: missing ${control.id}`);
    assert.equal(svg.endpoints.length, control.tips.length, `${stage}: missing marked endpoints in ${control.id}`);
    assert.equal(svg.edges.length, 1, `${stage}: missing edge in ${control.id}`);
    assert.equal(svg.edges[0].tag, control.tag, `${stage}: edge type changed in ${control.id}`);
    assert.equal(svg.edges[0].transform, control.transform, `${stage}: authored edge transform changed in ${control.id}`);
    if (control.id.startsWith('css-only-')) {
      assert.equal(svg.edges[0].attributes['marker-start'], null, `${stage}: CSS-only start acquired a marker attribute`);
      assert.equal(svg.edges[0].attributes['marker-end'], null, `${stage}: CSS-only end acquired a marker attribute`);
    }
    for (const [side, x, y] of control.tips) {
      const tip = svg.endpoints.find(value => value.side === side);
      assert(tip, `${stage}: missing ${side} endpoint in ${control.id}`);
      assert(Math.abs(tip.svgX - x) < .01 && Math.abs(tip.svgY - y) < .01, `${stage}: unexpected ${side} endpoint geometry in ${control.id}`);
    }
    assert.equal(svg.labels.length, control.startLabel ? 3 : 2, `${stage}: missing endpoint labels in ${control.id}`);
    for (const label of svg.labels) {
      const target = label.id === `${control.id}-label`;
      const startTarget = label.id === `${control.id}-start-label`;
      assert.equal(label.authoredX, startTarget ? control.startLabel[0] : target ? '80' : '150', `${stage}: authored x changed for ${label.id}`);
      assert.equal(label.authoredY, startTarget ? control.startLabel[1] : target ? '45' : '85', `${stage}: authored y changed for ${label.id}`);
      assert.equal(label.authoredFont, '8', `${stage}: authored font attribute changed for ${label.id}`);
      assert.deepEqual(label.covered, [], `${stage}: ${label.id} covers marked endpoint`);
      assert(label.fontSize >= 13.99, `${stage}: unreadable endpoint label ${label.id}: ${label.fontSize}px`);
      assert(label.movement <= 48.01, `${stage}: endpoint label moved too far ${label.id}: ${label.movement}px`);
      assert(label.rect.left >= svg.bounds.left - .5 && label.rect.top >= svg.bounds.top - .5 && label.rect.right <= svg.bounds.right + .5 && label.rect.bottom <= svg.bounds.bottom + .5, `${stage}: clipped endpoint label ${label.id}`);
      if (target || startTarget) {
        assert(label.movement > .01, `${stage}: candidate did not move away from endpoint in ${control.id}`);
        const challengedSide = startTarget || control.id === 'edge-marker-start' ? 'start' : 'end';
        assert(label.enlargedUnshiftedCovered.some(tip => tip.side === challengedSide), `${stage}: fixture did not challenge enlarged candidate at ${challengedSide} endpoint in ${control.id}`);
      }
      for (const other of svg.labels.filter(value => value.id !== label.id)) {
        const width = Math.min(label.rect.right, other.rect.right) - Math.max(label.rect.left, other.rect.left);
        const height = Math.min(label.rect.bottom, other.rect.bottom) - Math.max(label.rect.top, other.rect.top);
        assert(width <= .5 || height <= .5, `${stage}: endpoint labels overlap ${label.id} / ${other.id}`);
      }
    }
  }
}

async function cssMarkerTransitions(frame, item) {
  item.cssMarkerTransitions = [];
  for (const kind of ['edge-style', 'edge-class', 'svg-style', 'svg-class', 'ancestor-style', 'ancestor-class']) {
    const change = async enabled => frame.evaluate(({ kind, enabled }) => {
      const svgs = Array.from(document.querySelectorAll('svg[data-edge-case^="css-only-"]'));
      const host = document.getElementById('css-marker-host');
      svgs.forEach(svg => {
        const edge = svg.querySelector('line[id], path[id], polyline[id]');
        if (kind === 'edge-style') {
          edge.style.markerStart = enabled ? '' : 'none';
          edge.style.markerEnd = enabled ? '' : 'none';
        }
        if (kind === 'edge-class') edge.setAttribute('class', enabled ? 'css-only-edge' : '');
        if (kind === 'svg-style') {
          if (enabled) svg.style.removeProperty('--css-edge-marker');
          else svg.style.setProperty('--css-edge-marker', 'none');
        }
        if (kind === 'svg-class') svg.setAttribute('class', enabled ? 'css-only-svg' : '');
      });
      if (kind === 'ancestor-style') {
        if (enabled) host.style.removeProperty('--css-edge-marker');
        else host.style.setProperty('--css-edge-marker', 'none');
      }
      if (kind === 'ancestor-class') host.setAttribute('class', enabled ? 'css-marker-host' : '');
    }, { kind, enabled });
    const entry = { kind, assertionsPassed: false };
    item.cssMarkerTransitions.push(entry);
    await change(false);
    await settle(frame);
    const without = (await frame.evaluate(readEdgeGeometry)).filter(svg => svg.id.startsWith('css-only-'));
    assert.equal(without.length, 3, `${kind}: missing CSS-only controls`);
    for (const svg of without) {
      assert.equal(svg.endpoints.length, 0, `${kind}: CSS marker removal did not remove actual endpoints`);
      for (const label of svg.labels) {
        assert.equal(label.font, '', `${kind}: CSS marker removal retained injected font for ${label.id}`);
        assert.equal(label.transform, null, `${kind}: CSS marker removal retained injected transform for ${label.id}`);
        assert(Math.abs(label.fontSize - 8 * svg.scale) < .01, `${kind}: CSS marker removal changed authored size for ${label.id}`);
      }
      assert.equal(svg.edges[0].attributes['marker-start'], null, `${kind}: acquired start marker attribute`);
      assert.equal(svg.edges[0].attributes['marker-end'], null, `${kind}: acquired end marker attribute`);
    }
    entry.off = without.map(svg => ({ id: svg.id, endpoints: svg.endpoints.length, fonts: svg.labels.map(label => label.fontSize), authoredLayoutRestored: true }));
    await change(true);
    await settle(frame);
    const restored = await frame.evaluate(readEdgeGeometry);
    assertEdgeGeometry(restored, `${kind}: CSS markers restored automatically`);
    assert.deepEqual(restored, item.scaled, `${kind}: CSS marker restoration changed stable layout`);
    entry.restoredEndpoints = restored.reduce((sum, svg) => sum + svg.endpoints.length, 0);
    entry.assertionsPassed = true;
  }
  item.postCssTransitionMeasurements = await frame.evaluate(async () => {
    let measurements = 0;
    const saved = Array.from(document.querySelectorAll('svg[data-edge-case] text')).map(label => ({
      label, measure: label.getBoundingClientRect, own: Object.prototype.hasOwnProperty.call(label, 'getBoundingClientRect'),
    }));
    saved.forEach(({ label, measure }) => { label.getBoundingClientRect = () => { measurements++; return measure.call(label); }; });
    const timer = document.createElement('span');
    timer.style.cssText = 'position:fixed;width:1px;height:1px';
    try {
      for (let index = 0; index < 8; index++) await new Promise(resolve => requestAnimationFrame(resolve));
      const idle = measurements;
      document.getElementById('root').append(timer);
      for (let index = 0; index < 8; index++) {
        timer.textContent = String(index);
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return { idle, htmlTimer: measurements - idle };
    } finally {
      timer.remove();
      saved.forEach(({ label, measure, own }) => { if (own) label.getBoundingClientRect = measure; else delete label.getBoundingClientRect; });
    }
  });
  assert.equal(item.postCssTransitionMeasurements.idle, 0, 'CSS marker transitions triggered own-write layout feedback');
  assert.equal(item.postCssTransitionMeasurements.htmlTimer, 0, 'HTML timer relaid out labels after CSS marker transitions');
}

// A hidden marked edge paints nothing, so it must not push its label away or block enlargement.
async function hiddenEdgeTransitions(frame, item) {
  const visibleStage = await frame.evaluate(readEdgeGeometry);
  item.hiddenEdges = [];
  for (const [name, value] of [['opacity', '0'], ['visibility', 'hidden']]) {
    await frame.evaluate(([attribute, setting]) => document.getElementById('nonadjacent-line').setAttribute(attribute, setting), [name, value]);
    await settle(frame);
    const hidden = (await frame.evaluate(readEdgeGeometry)).find(svg => svg.id === 'edge-nonadjacent-line');
    const label = hidden.labels.find(value => value.id === 'edge-nonadjacent-line-label');
    assert(label.fontSize >= 13.99, `Hidden edge (${name}) blocked label enlargement: ${label.fontSize}px`);
    assert.equal(label.transform, null, `Hidden edge (${name}) still displaced its label`);
    assert(label.enlargedUnshiftedCovered.length > 0, `Hidden edge (${name}) fixture no longer overlaps the enlarged label`);
    item.hiddenEdges.push({ attribute: name, movement: label.movement, fontSize: label.fontSize });
    await frame.evaluate(attribute => document.getElementById('nonadjacent-line').removeAttribute(attribute), name);
    await settle(frame);
    assert.deepEqual(await frame.evaluate(readEdgeGeometry), visibleStage, `Label placement not restored after ${name} edge returned`);
  }
}

async function endpointCase(context, html, report, outputDir) {
  for (const viewport of viewports) {
    const item = { name: `svg-edge-endpoints-${viewport.width}`, viewport, assertionsPassed: false };
    report.cases.push(item);
    const { page, frame } = await openFixture(context, html, viewport);
    item.before = await frame.evaluate(readEdgeGeometry);
    await page.screenshot({ path: path.join(outputDir, `${item.name}.png`), fullPage: true });
    assertEdgeGeometry(item.before, `${viewport.width}px initially`);
    const authoredEdges = values => values.map(svg => svg.edges);
    const opposite = viewports.find(size => size.width !== viewport.width);
    item.resizeTo = opposite;
    await page.setViewportSize(opposite);
    await settle(frame);
    item.after = await frame.evaluate(readEdgeGeometry);
    assertEdgeGeometry(item.after, `${opposite.width}px resized`);
    assert.deepEqual(authoredEdges(item.after), authoredEdges(item.before), 'Authored edge geometry changed on resize');
    await page.screenshot({ path: path.join(outputDir, `${item.name}-resized.png`), fullPage: true });
    for (let repeat = 0; repeat < 3; repeat++) {
      await page.setViewportSize(viewport);
      await settle(frame);
      assert.deepEqual(await frame.evaluate(readEdgeGeometry), item.before, 'Endpoint label placement drift after repeated resize');
      await page.setViewportSize(opposite);
      await settle(frame);
      assert.deepEqual(await frame.evaluate(readEdgeGeometry), item.after, 'Endpoint label placement drift after reciprocal resize');
    }
    await frame.evaluate(() => document.querySelectorAll('svg[data-edge-case]').forEach(svg => {
      svg.style.width = '180px';
      svg.style.maxWidth = '180px';
    }));
    await settle(frame);
    item.scaled = await frame.evaluate(readEdgeGeometry);
    item.scale = .9;
    assert(item.scaled.every(svg => Math.abs(svg.scale - item.scale) < .0001), 'Endpoint fixture did not enter non-unit CTM stage');
    assertEdgeGeometry(item.scaled, `${opposite.width}px non-unit CTM scale ${item.scale}`);
    assert.deepEqual(authoredEdges(item.scaled), authoredEdges(item.before), 'Authored edge geometry changed under non-unit CTM');
    await page.screenshot({ path: path.join(outputDir, `${item.name}-scaled.png`), fullPage: true });
    await cssMarkerTransitions(frame, item);
    await hiddenEdgeTransitions(frame, item);
    item.markedEndpoints = item.before.reduce((sum, svg) => sum + svg.endpoints.length, 0);
    item.repeatedResizeDrift = false;
    item.assertionsPassed = true;
    await page.close();
  }
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
    fixtures: ['photosynthesis-label-collision.json', 'svg-label-controls.json', 'svg-edge-endpoints.json'],
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
    await endpointCase(context, html(fixtures[2]), report, outputDir);
    assert.equal(report.networkRequests.length, 0, 'Unexpected network attempted');
    assert.deepEqual(report.errors, [], 'Renderer errors');
    assert.equal(report.cases.length, 5, 'Missing regression case');
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
