import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { SANDBOX_RESPONSIVE_SCRIPT } from '../sandbox-responsive';

class TestElement {
  nodeType = 1;
  clientWidth = 900;
  attributes = new Map<string, string>();
  children: TestElement[] = [];
  style = { setProperty: vi.fn() };

  constructor(public tagName = 'HTML') {}
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  querySelectorAll() { return this.children.filter(child => child.tagName.toLowerCase() === 'svg'); }
}

type Mutation = { type: 'attributes' | 'childList'; target?: TestElement; addedNodes?: TestElement[] };
type Viewport = { width: number; height: number; pixelRatio: number; orientation: string };

function startRuntime(children: TestElement[] = []) {
  const documentElement = new TestElement();
  documentElement.children = children;
  const listeners = new Map<string, () => void>();
  const events: { type: string; detail: Viewport }[] = [];
  let mutation!: (records: Mutation[]) => void;
  const window = {
    innerWidth: 900,
    innerHeight: 540,
    devicePixelRatio: 2,
    lessonViewport: undefined as Viewport | undefined,
    addEventListener: (type: string, callback: () => void) => listeners.set(type, callback),
    dispatchEvent: (event: { type: string; detail: Viewport }) => events.push(event),
  };
  runInNewContext(SANDBOX_RESPONSIVE_SCRIPT, {
    window,
    document: { documentElement },
    CustomEvent: class {
      constructor(public type: string, public options: { detail: Viewport }) {}
      get detail() { return this.options.detail; }
    },
    ResizeObserver: class { observe = vi.fn(); },
    MutationObserver: class {
      observe = vi.fn();
      constructor(callback: typeof mutation) { mutation = callback; }
    },
  });
  return { window, documentElement, listeners, events, mutation };
}

describe('responsive generated activity sandbox', () => {
  it('reports the iframe CSS size across orientations without touching activity state', () => {
    const runtime = startRuntime();
    const activity = { selectedAnswer: 2, position: { x: 15, y: 8 } };
    Object.assign(runtime.window, { activity });
    expect(runtime.window.lessonViewport).toEqual({ width: 900, height: 540, pixelRatio: 2, orientation: 'landscape' });

    for (const [width, height] of [[700, 780], [320, 620], [620, 320]]) {
      runtime.documentElement.clientWidth = width;
      runtime.window.innerHeight = height;
      runtime.listeners.get('resize')!();
      expect(runtime.events.at(-1)).toMatchObject({
        type: 'lesson-viewport-change',
        detail: { width, height, pixelRatio: 2, orientation: width >= height ? 'landscape' : 'portrait' },
      });
    }
    expect(runtime.events).toHaveLength(4);
    runtime.listeners.get('resize')!();
    expect(runtime.events).toHaveLength(4);
    expect(runtime.window).toHaveProperty('activity', activity);
    expect(activity).toEqual({ selectedAnswer: 2, position: { x: 15, y: 8 } });
  });

  it('ignores zero-sized boot frames and falls back to innerWidth', () => {
    const runtime = startRuntime();
    runtime.documentElement.clientWidth = 0;
    runtime.window.innerWidth = 0;
    runtime.listeners.get('resize')!();
    expect(runtime.events).toHaveLength(1);
    runtime.window.innerWidth = 360;
    runtime.listeners.get('resize')!();
    expect(runtime.window.lessonViewport?.width).toBe(360);
  });

  it('gives legacy SVGs a scalable coordinate space without replacing an authored viewBox', () => {
    const legacy = new TestElement('svg');
    legacy.setAttribute('width', '800px');
    legacy.setAttribute('height', '400');
    const authored = new TestElement('svg');
    authored.setAttribute('width', '800');
    authored.setAttribute('height', '400');
    authored.setAttribute('viewBox', '-20 -20 100 100');
    const percentage = new TestElement('svg');
    percentage.setAttribute('width', '100%');
    percentage.setAttribute('height', '400');
    const runtime = startRuntime([legacy, authored, percentage]);
    expect(legacy.getAttribute('viewBox')).toBe('0 0 800 400');
    expect(authored.getAttribute('viewBox')).toBe('-20 -20 100 100');
    expect(percentage.getAttribute('viewBox')).toBeNull();

    legacy.setAttribute('width', '600');
    runtime.mutation([{ type: 'attributes', target: legacy }]);
    expect(legacy.getAttribute('viewBox')).toBe('0 0 600 400');
    legacy.setAttribute('viewBox', '-50 0 1000 400');
    legacy.setAttribute('height', '500');
    runtime.mutation([{ type: 'attributes', target: legacy }]);
    expect(legacy.getAttribute('viewBox')).toBe('-50 0 1000 400');

    const added = new TestElement('svg');
    added.setAttribute('width', '320');
    added.setAttribute('height', '200');
    runtime.mutation([{ type: 'childList', addedNodes: [added] }]);
    expect(added.getAttribute('viewBox')).toBe('0 0 320 200');
  });

  it('keeps both activities laid out while booting in opaque-origin frames', async () => {
    for (const name of ['ReactRenderer', 'SafeCodeRunner']) {
      const source = await readFile(join(process.cwd(), 'src/components/lessons', `${name}.tsx`), 'utf8');
      expect(source).toContain('sandbox="allow-scripts"');
      expect(source).not.toContain('sandbox="allow-scripts allow-same-origin"');
      expect(source).toContain("visibility: isLoading || error ? 'hidden' : 'visible'");
      expect(source).not.toContain("display: isLoading || error ? 'none'");
      expect(source).toContain('${SANDBOX_RESPONSIVE_SCRIPT}');
    }
  });
});
