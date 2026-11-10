/**
 * A school's look: a preset or its own primary and secondary colours, a default
 * light/dark look, and a logo. Shared by the API (to validate) and the portals
 * (to turn the colours into the app's CSS variables).
 */
import { luminance, parseHexColor } from '@/lib/embed-theme';

export type BrandingMode = 'light' | 'dark' | 'system';

export type SchoolBranding = {
  /** 'default' keeps the InsyteAI colours; 'custom' uses primary/secondary. */
  preset: string;
  primary: string | null;
  secondary: string | null;
  /** The look people get until they pick their own. null keeps the app default. */
  mode: BrandingMode | null;
  /** Storage path of the logo inside LOGO_BUCKET, always under the school's id. */
  logoPath: string | null;
};

export type BrandingPreset = { id: string; name: string; primary: string; secondary: string };

export const DEFAULT_PRESET_ID = 'default';
export const CUSTOM_PRESET_ID = 'custom';
export const LOGO_BUCKET = 'school-logos';
export const LOGO_MAX_BYTES = 512 * 1024;

export const BRANDING_PRESETS: BrandingPreset[] = [
  { id: DEFAULT_PRESET_ID, name: 'InsyteAI', primary: '#26604f', secondary: '#dd5a21' },
  { id: 'navy', name: 'Classic navy', primary: '#1e3a8a', secondary: '#d4a017' },
  { id: 'forest', name: 'Forest', primary: '#166534', secondary: '#ca8a04' },
  { id: 'royal', name: 'Royal', primary: '#5b21b6', secondary: '#f59e0b' },
  { id: 'crimson', name: 'Crimson', primary: '#9f1239', secondary: '#334155' },
  { id: 'ocean', name: 'Ocean', primary: '#0e7490', secondary: '#f97316' },
  { id: 'berry', name: 'Berry', primary: '#9d174d', secondary: '#0d9488' },
];

export const DEFAULT_BRANDING: SchoolBranding = {
  preset: DEFAULT_PRESET_ID,
  primary: null,
  secondary: null,
  mode: null,
  logoPath: null,
};

function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const rgb = parseHexColor(value);
  if (!rgb) return null;
  return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
}

function isMode(value: unknown): value is BrandingMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Keeps only valid fields of a stored branding object. Anything odd falls back to the default. */
export function readStoredBranding(value: unknown, schoolId: string): SchoolBranding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_BRANDING };
  const raw = value as Record<string, unknown>;
  const primary = normalizeHex(raw.primary);
  const secondary = normalizeHex(raw.secondary);
  const presetIds = BRANDING_PRESETS.map((p) => p.id);
  let preset = typeof raw.preset === 'string' && (presetIds.includes(raw.preset) || raw.preset === CUSTOM_PRESET_ID)
    ? raw.preset
    : DEFAULT_PRESET_ID;
  if (preset === CUSTOM_PRESET_ID && (!primary || !secondary)) preset = DEFAULT_PRESET_ID;
  const logoPath = typeof raw.logoPath === 'string' && isLogoPathFor(raw.logoPath, schoolId) ? raw.logoPath : null;
  return {
    preset,
    primary: preset === CUSTOM_PRESET_ID ? primary : null,
    secondary: preset === CUSTOM_PRESET_ID ? secondary : null,
    mode: isMode(raw.mode) ? raw.mode : null,
    logoPath,
  };
}

/** A logo path must sit in the school's own folder, so one school can't point at another's file. */
export function isLogoPathFor(path: string, schoolId: string): boolean {
  return new RegExp(`^${schoolId.replace(/[^0-9a-f-]/gi, '')}/logo-[0-9a-f-]{36}\\.(png|jpg|webp)$`, 'i').test(path);
}

export type BrandingInput = { preset: string; primary: string | null; secondary: string | null; mode: BrandingMode | null };

/** Validates the colour and look settings an admin sends. */
export function parseBrandingInput(body: unknown): { ok: true; value: BrandingInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request' };
  const raw = body as Record<string, unknown>;
  const mode = raw.mode === null || raw.mode === undefined || raw.mode === '' ? null : raw.mode;
  if (mode !== null && !isMode(mode)) return { ok: false, error: 'Default look must be light, dark or system.' };
  const preset = typeof raw.preset === 'string' ? raw.preset : DEFAULT_PRESET_ID;
  if (preset === CUSTOM_PRESET_ID) {
    const primary = normalizeHex(raw.primary);
    const secondary = normalizeHex(raw.secondary);
    if (!primary || !secondary) return { ok: false, error: 'Choose a primary and a secondary colour as hex codes, like #1e3a8a.' };
    return { ok: true, value: { preset, primary, secondary, mode } };
  }
  if (!BRANDING_PRESETS.some((p) => p.id === preset)) return { ok: false, error: 'Unknown colour theme.' };
  return { ok: true, value: { preset, primary: null, secondary: null, mode } };
}

/** The primary and secondary colours a branding uses, or null for the InsyteAI default. */
export function brandingColors(branding: Pick<SchoolBranding, 'preset' | 'primary' | 'secondary'>): { primary: string; secondary: string } | null {
  if (branding.preset === CUSTOM_PRESET_ID && branding.primary && branding.secondary) {
    return { primary: branding.primary, secondary: branding.secondary };
  }
  if (branding.preset === DEFAULT_PRESET_ID) return null;
  const preset = BRANDING_PRESETS.find((p) => p.id === branding.preset);
  return preset ? { primary: preset.primary, secondary: preset.secondary } : null;
}

type Rgb = [number, number, number];
type Hsl = [number, number, number];

function rgbToHsl([r, g, b]: Rgb): Hsl {
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
  return [h, s * 100, l * 100];
}

function hslToRgb([h, s, l]: Hsl): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255)) as Rgb;
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The app's page backgrounds (globals.css --background). */
const BACKGROUNDS: Record<'light' | 'dark', Rgb> = {
  light: hslToRgb([38, 38, 97]),
  dark: hslToRgb([24, 20, 9]),
};

const WHITE: Rgb = [255, 255, 255];
const NEAR_BLACK: Rgb = [23, 23, 23];

export type ModeTokens = {
  /** "H S% L%" values for the CSS variables. */
  color: string;
  foreground: string;
  /** The colour actually used, as hex, and whether it had to change to stay readable. */
  hex: string;
  adjusted: boolean;
};

function triplet([h, s, l]: Hsl): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

/**
 * Makes a colour readable on the light or dark page: darkens it on light pages
 * and lightens it on dark ones until it reaches `minContrast` against the
 * background, then picks white or near-black text for things drawn on it.
 */
export function readableTokens(hex: string, mode: 'light' | 'dark', minContrast: number): ModeTokens {
  const rgb = parseHexColor(hex) ?? [0, 0, 0];
  const background = BACKGROUNDS[mode];
  const [h, s, l0] = rgbToHsl(rgb);
  let l = l0;
  let current = rgb;
  const step = mode === 'light' ? -1 : 1;
  // Pure white can still darken on light pages, and pure black lighten on dark ones.
  while (contrastRatio(current, background) < minContrast && (step < 0 ? l > 0 : l < 100)) {
    l = Math.min(100, Math.max(0, l + step));
    current = hslToRgb([h, s, l]);
  }
  const foreground = contrastRatio(current, WHITE) >= contrastRatio(current, NEAR_BLACK) ? '0 0% 100%' : '0 0% 9%';
  return {
    color: triplet([h, s, l]),
    foreground,
    hex: '#' + current.map((c) => c.toString(16).padStart(2, '0')).join(''),
    adjusted: Math.round(l) !== Math.round(l0),
  };
}

/** Primary is used for text and links, so it needs 4.5:1; secondary is mostly fills and highlights, so 3:1. */
export const PRIMARY_MIN_CONTRAST = 4.5;
export const SECONDARY_MIN_CONTRAST = 3;

export type BrandingTokens = Record<'light' | 'dark', { primary: ModeTokens; secondary: ModeTokens }>;

export function brandingTokens(colors: { primary: string; secondary: string }): BrandingTokens {
  const forMode = (mode: 'light' | 'dark') => ({
    primary: readableTokens(colors.primary, mode, PRIMARY_MIN_CONTRAST),
    secondary: readableTokens(colors.secondary, mode, SECONDARY_MIN_CONTRAST),
  });
  return { light: forMode('light'), dark: forMode('dark') };
}

/** CSS variables for one look, for a style attribute or a stylesheet rule. */
export function tokenVariables(tokens: { primary: ModeTokens; secondary: ModeTokens }): Record<string, string> {
  return {
    '--primary': tokens.primary.color,
    '--primary-foreground': tokens.primary.foreground,
    '--ring': tokens.primary.color,
    '--accent': tokens.secondary.color,
    '--accent-foreground': tokens.secondary.foreground,
  };
}

/** The stylesheet that recolours the app for a school, or '' for the default colours. */
export function brandingStylesheet(branding: Pick<SchoolBranding, 'preset' | 'primary' | 'secondary'>): string {
  const colors = brandingColors(branding);
  if (!colors) return '';
  const tokens = brandingTokens(colors);
  const block = (vars: Record<string, string>) => Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('');
  return `:root{${block(tokenVariables(tokens.light))}}:root.dark,.dark{${block(tokenVariables(tokens.dark))}}`;
}

/** The app's own colours (globals.css), used when a school keeps the InsyteAI theme. */
export const DEFAULT_TOKEN_VARIABLES: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    '--primary': '162 42% 26%',
    '--primary-foreground': '36 33% 98%',
    '--ring': '162 42% 26%',
    '--accent': '18 74% 50%',
    '--accent-foreground': '36 33% 98%',
  },
  dark: {
    '--primary': '162 52% 38%',
    '--primary-foreground': '24 20% 10%',
    '--ring': '162 52% 38%',
    '--accent': '20 78% 52%',
    '--accent-foreground': '24 20% 10%',
  },
};
