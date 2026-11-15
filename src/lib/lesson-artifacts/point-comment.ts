/** A teacher's pin on a material preview, as fractions of its width and height (0 to 1). */
export type MaterialPoint = { artifactId: string; x: number; y: number; comment: string };

const clamp = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5));

/** Plain words for where the pin is, e.g. "upper left". */
export function regionName(x: number, y: number) {
  const across = x < 1 / 3 ? 'left' : x > 2 / 3 ? 'right' : 'centre';
  const down = y < 1 / 3 ? 'top' : y > 2 / 3 ? 'bottom' : 'middle';
  if (across === 'centre' && down === 'middle') return 'centre';
  if (down === 'middle') return `middle ${across}`;
  return across === 'centre' ? `${down} centre` : `${down} ${across}`;
}

/** The co-author message for a pinned comment. */
export function describePoint(point: MaterialPoint, materialLabel: string) {
  const x = clamp(point.x);
  const y = clamp(point.y);
  return `On the ${materialLabel} [${point.artifactId}], I pointed at the ${regionName(x, y)} of the preview (${Math.round(x * 100)}% from the left, ${Math.round(y * 100)}% from the top): ${point.comment.trim().slice(0, 2_000)}`;
}

/** The short version the teacher sees in the chat, without ids or percentages. */
export function describePointForTeacher(point: MaterialPoint, materialLabel: string) {
  return `Pinned on the ${materialLabel}, ${regionName(clamp(point.x), clamp(point.y))}: ${point.comment.trim().slice(0, 2_000)}`;
}
