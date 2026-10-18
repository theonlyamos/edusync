export type VisualizationDimensions = { width: number; height: number }

export function normalizeVisualizationDimensions(input: unknown): VisualizationDimensions {
  const dimensions = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  const bound = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.min(4096, Math.max(1, Math.round(value)))
      : fallback

  return { width: bound(dimensions.width, 800), height: bound(dimensions.height, 600) }
}

export function buildVisualizationLayoutPrompt(input: unknown): string {
  const { width, height } = normalizeVisualizationDimensions(input)
  return `\n\n### Responsive Layout and Drawable Space
Initial drawable container: ${width}px wide × ${height}px tall (CSS pixels, with application chrome and outer padding already excluded). Do not subtract a fixed margin. These dimensions are an initial layout hint, never a fixed root size.
- Design for phone, tablet/iPad, and desktop using the actual container width, not the physical screen or user agent. Below 640px, stack the visual and controls in one column and wrap labels; at 640–1023px, use a compact tablet layout; at 1024px and above, use side-by-side space only when both visual and controls remain legible. A narrow panel on a desktop still uses the narrow layout.
- Root width must be 100%, with min-width: 0 and border-box sizing. Reflow content; never scale the entire interface down, clip labels, or hide essential controls. Allow vertical scrolling when necessary instead of forcing all content into the initial height. Use compact gaps on small screens.
- Keep body text around 16px, diagram labels at least 14px, strong contrast, and buttons/answer options/slider hit areas at least 44px in each direction. These minimums apply to rendered screen pixels: compensate SVG label sizes for viewBox scaling or place readable HTML labels beside the diagram. Provide keyboard and tap alternatives to drag-only or hover-only interactions, clear control labels, and visible feedback.
- Use short SVG labels for names and values; put longer explanations in readable HTML text instead of squeezing paragraphs into the drawing.
- Reserve distinct annotation zones with generous gaps around nodes, arrow shafts, and arrow tips. Choose coordinates and routes so labels do not overlap one another or cover directional cues.
- At narrow widths, stack a wrapped HTML caption or legend below the diagram while preserving clear label-to-part associations. Keep complete teaching information visible without shrinking its text to fit.
- Images must fit fully at width: 100%, max-width: 100%, height: auto with object-fit: contain; never crop instructional content. SVG diagrams need a viewBox, responsive width, and readable labels. Charts need a responsive container with a defined usable height.
- The sandbox exposes window.lessonViewport = { width, height, pixelRatio, orientation } before your code runs and emits a 'lesson-viewport-change' event when its drawable space changes. Read the latest window.lessonViewport in the handler; ordinary DOM measurements, ResizeObserver and window resize are also available. Never access the parent document.
- React: use fluid flex/grid layouts, wrapping, and a ResizeObserver on the root or the viewport event to update layout state when needed. Disconnect observers and remove listeners in effect cleanup.
- p5.js: size createCanvas from the current drawable space and use windowResized with resizeCanvas (or the viewport event) to recompute drawing coordinates and hit areas.
- Three.js: update renderer.setSize, camera.aspect and camera.updateProjectionMatrix when the drawable space changes. Bound renderer pixel ratio to at most 2. Recompute any overlay/control layout too.
- On window resize or orientation change, preserve learner state, answers, slider values and animation progress. Resize the existing scene; do not regenerate or reset it. Every generated visual must work across these widths even when first generated for another device.`
}
