import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  effects: [] as { run: () => void | (() => void); deps: unknown[] }[],
  sendViewport: vi.fn(),
  dimensions: new Map<unknown, { width: number; height: number }>(),
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => [initial, vi.fn()],
  useRef: (current: unknown) => ({ current }),
  useEffect: (run: () => void | (() => void), deps: unknown[]) => state.effects.push({ run, deps }),
}));
vi.mock('@/hooks/useAudioStreaming', () => ({
  useAudioStreaming: () => ({ connectionStatus: 'connected', sendViewport: state.sendViewport, getAnalyser: () => null }),
}));
vi.mock('../AudioVisualizer', () => ({ default: () => null }));
vi.mock('@/lib/visualization-viewport', () => ({
  readVisualizationPanelDimensions: (panel: unknown) => state.dimensions.get(panel),
}));
import { VoiceControl } from '../VoiceControl';

let resize: { callback: () => void; observe: ReturnType<typeof vi.fn>; unobserve: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
let mutation: { callback: () => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
let listeners: { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
let visualViewport: typeof listeners;

beforeEach(() => {
  vi.useFakeTimers();
  state.effects = [];
  state.dimensions.clear();
  state.sendViewport.mockClear();
  listeners = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  visualViewport = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('window', { ...listeners, visualViewport, devicePixelRatio: 2 });
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn();
    constructor(callback: () => void) { resize = { callback, observe: this.observe, unobserve: this.unobserve, disconnect: this.disconnect }; }
  });
  vi.stubGlobal('MutationObserver', class {
    observe = vi.fn(); disconnect = vi.fn();
    constructor(callback: () => void) { mutation = { callback, observe: this.observe, disconnect: this.disconnect }; }
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function connect() {
  const loadingPanel = {};
  const generatedPanel = {};
  let currentPanel = loadingPanel;
  const viewport = { querySelector: () => currentPanel };
  state.dimensions.set(loadingPanel, { width: 700, height: 600 });
  state.dimensions.set(generatedPanel, { width: 652, height: 440 });
  VoiceControl({ active: false, viewportRef: { current: viewport as unknown as HTMLElement } });
  const cleanup = state.effects.find(effect => effect.deps[1] === state.sendViewport)!.run() as () => void;
  return { loadingPanel, generatedPanel, viewport, cleanup, replace: () => { currentPanel = generatedPanel; } };
}

describe('voice visualization viewport metadata', () => {
  it('tracks the generated panel replacing the loading panel without an outer resize', () => {
    const session = connect();
    expect(state.sendViewport).toHaveBeenCalledWith(700, 600, 2);
    expect(resize.observe).toHaveBeenCalledWith(session.loadingPanel);
    session.replace();
    mutation.callback();
    vi.advanceTimersByTime(300);
    expect(resize.unobserve).toHaveBeenCalledWith(session.loadingPanel);
    expect(resize.observe).toHaveBeenCalledWith(session.generatedPanel);
    expect(state.sendViewport).toHaveBeenLastCalledWith(652, 440, 2);
    session.cleanup();
  });

  it('debounces panel resizes and skips unchanged dimensions', () => {
    const session = connect();
    resize.callback();
    vi.advanceTimersByTime(150);
    resize.callback();
    vi.advanceTimersByTime(299);
    expect(state.sendViewport).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(state.sendViewport).toHaveBeenCalledOnce();
    state.dimensions.set(session.loadingPanel, { width: 320, height: 460 });
    resize.callback();
    vi.advanceTimersByTime(300);
    expect(state.sendViewport).toHaveBeenLastCalledWith(320, 460, 2);
    session.cleanup();
  });

  it('cancels pending updates and both observers when the session disconnects', () => {
    const session = connect();
    state.dimensions.set(session.loadingPanel, { width: 320, height: 460 });
    resize.callback();
    session.cleanup();
    vi.advanceTimersByTime(300);
    expect(state.sendViewport).toHaveBeenCalledOnce();
    expect(resize.disconnect).toHaveBeenCalledOnce();
    expect(mutation.disconnect).toHaveBeenCalledOnce();
    expect(listeners.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(visualViewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
