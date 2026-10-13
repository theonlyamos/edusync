import { normalizeVisualizationDimensions, type VisualizationDimensions } from './visualization-layout';

/** Measure drawable CSS pixels; generation must not budget for the whole device screen. */
export function readVisualizationPanelDimensions(panel?: Element | null): VisualizationDimensions {
  if (typeof window === 'undefined') return { width: 704, height: 504 };

  const measure = (element: Element | null | undefined) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const style = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(element) : null;
    const inset = (properties: (keyof CSSStyleDeclaration)[]) => properties.reduce<number>((total, property) => total + (parseFloat(String(style?.[property] ?? '0')) || 0), 0);
    const width = (element.clientWidth ?? rect.width - inset(['borderLeftWidth', 'borderRightWidth'])) - inset(['paddingLeft', 'paddingRight']);
    const height = (element.clientHeight ?? rect.height - inset(['borderTopWidth', 'borderBottomWidth'])) - inset(['paddingTop', 'paddingBottom']);
    return width > 0 && height > 0 ? normalizeVisualizationDimensions({ width, height }) : null;
  };

  const explicit = measure(panel);
  if (explicit) return explicit;
  if (typeof document !== 'undefined') {
    for (const candidate of Array.from(document.querySelectorAll('[data-visualization-panel]')).reverse()) {
      const dimensions = measure(candidate);
      if (dimensions) return dimensions;
    }
    const viewport = measure(document.querySelector('[data-visualization-viewport]'));
    if (viewport) return viewport;
  }
  return normalizeVisualizationDimensions({
    width: window.visualViewport?.width || window.innerWidth,
    height: Math.min(720, (window.visualViewport?.height || window.innerHeight) * 0.65),
  });
}
