import { afterEach, describe, expect, it, vi } from 'vitest';
import { readVisualizationPanelDimensions } from '../visualization-viewport';
import { requestVisualizationFromGenAi } from '../request-visualization';

function panel(width: number, height: number) {
  return { getBoundingClientRect: () => ({ width, height }) } as HTMLElement;
}

afterEach(() => vi.unstubAllGlobals());

describe('visualization drawable viewport', () => {
  it('subtracts actual padding and borders instead of a fixed desktop margin', () => {
    vi.stubGlobal('window', { getComputedStyle: () => ({ paddingLeft: '12px', paddingRight: '12px', paddingTop: '16px', paddingBottom: '16px', borderLeftWidth: '1px', borderRightWidth: '1px' }) });
    expect(readVisualizationPanelDimensions(panel(320, 500))).toEqual({ width: 294, height: 468 });
  });

  it('uses the latest mounted panel and skips hidden panels', () => {
    vi.stubGlobal('window', { getComputedStyle: () => ({}) });
    vi.stubGlobal('document', { querySelectorAll: () => [panel(700, 504), panel(290, 400), panel(0, 0)], querySelector: () => null });
    expect(readVisualizationPanelDimensions()).toEqual({ width: 290, height: 400 });
  });

  it('excludes native scrollbar gutters from a scrolling tutoring panel', () => {
    vi.stubGlobal('window', { getComputedStyle: () => ({ paddingLeft: '12px', paddingRight: '12px', paddingTop: '16px', paddingBottom: '16px' }) });
    const scrolling = Object.assign(panel(320, 500), { clientWidth: 300, clientHeight: 498 });
    expect(readVisualizationPanelDimensions(scrolling)).toEqual({ width: 276, height: 466 });
  });

  it('uses the visible browser area before any activity has mounted', () => {
    vi.stubGlobal('window', { innerWidth: 1200, innerHeight: 900, visualViewport: { width: 390, height: 600 } });
    expect(readVisualizationPanelDimensions()).toEqual({ width: 390, height: 390 });
  });

  it('keeps a safe non-browser fallback', () => {
    expect(readVisualizationPanelDimensions()).toEqual({ width: 704, height: 504 });
  });

  it('sends current drawable dimensions to visualization generation', async () => {
    vi.stubGlobal('window', { getComputedStyle: () => ({}) });
    vi.stubGlobal('document', { querySelectorAll: () => [panel(296, 420)], querySelector: () => null });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ library: 'react', code: 'function App(){}', explanation: '' })));
    vi.stubGlobal('fetch', fetchMock);
    await requestVisualizationFromGenAi({ taskDescription: 'A diagram' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).panel_dimensions).toEqual({ width: 296, height: 420 });
  });
});
