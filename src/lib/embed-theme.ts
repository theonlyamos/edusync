/** Look-and-feel options a site can pass to the embedded tutor in its URL. */
export type EmbedTheme = {
  /** null leaves the widget on its default (light). */
  mode: 'light' | 'dark' | null;
  /** Accent colour as CSS variable values, or null for the default green. */
  accent: { primary: string; foreground: string } | null;
};

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#1d4ed8" or "1d4ed8" or "14f" as red, green, blue from 0 to 255. */
export function parseHexColor(value: string | null | undefined): [number, number, number] | null {
  const match = HEX.exec((value ?? '').trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? match[1].replace(/./g, (c) => c + c) : match[1];
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** The "H S% L%" form the app's colour variables use. */
export function toHslTriplet([r, g, b]: [number, number, number]): string {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Reads `theme` and `accent` from the embed URL. Anything unrecognised is ignored. */
export function parseEmbedTheme(params: { get(name: string): string | null }): EmbedTheme {
  const theme = params.get('theme');
  const rgb = parseHexColor(params.get('accent'));
  return {
    mode: theme === 'light' || theme === 'dark' ? theme : null,
    accent: rgb
      ? {
          primary: toHslTriplet(rgb),
          // Text on the accent is whichever of near-white or near-black reads better.
          foreground: 1.05 / (luminance(rgb) + 0.05) >= (luminance(rgb) + 0.05) / 0.05 ? '0 0% 100%' : '0 0% 9%',
        }
      : null,
  };
}
