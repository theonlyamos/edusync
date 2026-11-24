/**
 * Helpers for the pictures of the board sent to the tutor: the handwriting
 * font to embed, and cutting out the framed part for "ask about this part".
 * Browser only.
 */

export type CropRect = { x: number; y: number; w: number; h: number };

/** Longest side of the picture sent to the tutor; larger frames are scaled down. */
const MAX_SIDE = 1024;

/** The crop in whole pixels, kept inside the image. Null when nothing is left. */
export function clampCrop(rect: CropRect, width: number, height: number): CropRect | null {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.min(width - x, Math.ceil(rect.w));
  const h = Math.min(height - y, Math.ceil(rect.h));
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

export function cropScale(rect: CropRect, maxSide = MAX_SIDE): number {
  return Math.min(1, maxSide / Math.max(rect.w, rect.h));
}

export async function cropDataUrl(dataUrl: string, rect: CropRect): Promise<string | null> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const crop = clampCrop(rect, image.naturalWidth, image.naturalHeight);
  if (!crop) return null;
  const scale = cropScale(crop);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(crop.w * scale));
  canvas.height = Math.max(1, Math.round(crop.h * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

const familyName = (value: string) => value.split(',')[0].trim().replace(/^["']|["']$/g, '');

const MAX_FONT_BYTES = 200_000;

async function buildBoardFontCss(root: HTMLElement): Promise<string> {
  const family = familyName(getComputedStyle(root).fontFamily);
  if (!family) return '';
  const faces: Array<{ rule: CSSFontFaceRule; base: string }> = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; } // cross-origin sheet
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule && familyName(rule.style.getPropertyValue('font-family')) === family) {
        faces.push({ rule, base: sheet.href ?? document.baseURI });
      }
    }
  }
  // Only the basic Latin file is embedded; other alphabets fall back to a system font in the picture.
  const face = faces.find(({ rule }) => /U\+0{1,4}-0{0,2}FF\b/i.test(rule.style.getPropertyValue('unicode-range'))) ?? faces[0];
  const src = face?.rule.style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)/)?.[1];
  if (!face || !src) return '';
  const url = new URL(src, face.base);
  if (url.origin !== window.location.origin) return '';
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) return '';
  const blob = await response.blob();
  if (blob.size > MAX_FONT_BYTES) return '';
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return `@font-face{font-family:${JSON.stringify(family)};src:url(${dataUrl});}`;
}

let boardFont: Promise<string> | null = null;

/**
 * CSS that embeds the board's handwriting font, built once. Without it the
 * picture falls back to a system font whose words no longer fit their boxes.
 * Empty when the font cannot be read; the picture is still sent.
 */
export function boardFontCss(root: HTMLElement): Promise<string> {
  boardFont ??= buildBoardFontCss(root).catch(() => '');
  return boardFont;
}
