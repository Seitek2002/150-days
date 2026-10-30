// Fallout fonts from the player's copy (FONT*.FON and FONT*.AAF) and drawing a string in such a font.
// FON — Fallout 1 fonts: little-endian numbers, one bit per point (the point is set or not).
// AAF — anti-aliased fonts (they lie next to the FON files in the player's copy): big-endian numbers, a byte 0…7 per point (how filled it is).
// Field order follows the format descriptions (fodev, fallout1-ce, fallout2-ce); the code is ours.
// Where to use these fonts in the interface is Opus's call; here — only parsing and drawing.

export interface FontGlyph {
  width: number;
  height: number;
  /** Points by rows top to bottom: 0 — empty, `levels` — fully filled. */
  pixels: Uint8Array;
}

export interface BitmapFont {
  format: 'fon' | 'aaf';
  /** Line height: for FON — the height of all glyphs, for AAF — the tallest glyph (short glyphs sit on the baseline). */
  height: number;
  /** Gap between letters in pixels. */
  letterSpacing: number;
  /** Space width: for AAF it is set in the header, for FON it is the width of the space glyph. */
  spaceWidth: number;
  /** Extra height between lines (FON has none — 0). */
  lineSpacing: number;
  /** The largest point value: for FON — 1, for AAF — 7. */
  levels: number;
  /** By character code 0…255 (in the localized copy — windows-1251 encoding). */
  glyphs: FontGlyph[];
}

const AAF_LEVELS = 7;
const FON_HEADER = 20;
const AAF_HEADER = 12;
const AAF_GLYPHS = 256;

function checkRange(ok: boolean, what: string): void {
  if (!ok) throw new Error('Corrupted font: ' + what);
}

/** Fallout 1 font (FON): num, height, spacing (4 bytes each), two service numbers, a {width, offset} table, data. */
export function parseFon(bytes: Uint8Array): BitmapFont {
  checkRange(bytes.length >= FON_HEADER, 'file too short');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const num = view.getInt32(0, true);
  const height = view.getInt32(4, true);
  const letterSpacing = view.getInt32(8, true);
  checkRange(num >= 1 && num <= 256, 'glyph count ' + num);
  checkRange(height >= 1 && height <= 64, 'height ' + height);
  const dataStart = FON_HEADER + num * 8;
  checkRange(bytes.length >= dataStart, 'glyph table');
  const glyphs: FontGlyph[] = [];
  for (let i = 0; i < num; i++) {
    const width = view.getInt32(FON_HEADER + i * 8, true);
    const offset = view.getInt32(FON_HEADER + i * 8 + 4, true);
    checkRange(width >= 0 && width <= 64 && offset >= 0, 'glyph ' + i);
    const rowBytes = (width + 7) >> 3;
    checkRange(dataStart + offset + rowBytes * height <= bytes.length, 'glyph data ' + i);
    const pixels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const byte = bytes[dataStart + offset + y * rowBytes + (x >> 3)] ?? 0;
        pixels[y * width + x] = (byte >> (7 - (x & 7))) & 1;
      }
    }
    glyphs.push({ width, height, pixels });
  }
  // Glyphs missing up to 256 are empty, so that any character code finds a glyph.
  while (glyphs.length < 256) glyphs.push({ width: 0, height, pixels: new Uint8Array(0) });
  return { format: 'fon', height, letterSpacing, spaceWidth: glyphs[32]?.width ?? 0, lineSpacing: 0, levels: 1, glyphs };
}

/** Anti-aliased font (AAF): "AAFF", height, gaps (2 bytes each), 256 glyphs {width, height, offset}, data. */
export function parseAaf(bytes: Uint8Array): BitmapFont {
  checkRange(bytes.length >= AAF_HEADER + AAF_GLYPHS * 8, 'file too short');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  checkRange(view.getUint32(0) === 0x41414646, 'no AAFF tag');
  const height = view.getInt16(4);
  const letterSpacing = view.getInt16(6);
  const spaceWidth = view.getInt16(8);
  const lineSpacing = view.getInt16(10);
  checkRange(height >= 1 && height <= 64, 'height ' + height);
  const dataStart = AAF_HEADER + AAF_GLYPHS * 8;
  const glyphs: FontGlyph[] = [];
  for (let i = 0; i < AAF_GLYPHS; i++) {
    const width = view.getUint16(AAF_HEADER + i * 8);
    const glyphHeight = view.getUint16(AAF_HEADER + i * 8 + 2);
    const offset = view.getUint32(AAF_HEADER + i * 8 + 4);
    const size = width * glyphHeight;
    checkRange(glyphHeight <= height || size === 0, 'glyph height ' + i);
    checkRange(dataStart + offset + size <= bytes.length, 'glyph data ' + i);
    const pixels = new Uint8Array(size);
    // Some glyphs contain values above 7 — treat them as fully filled.
    for (let k = 0; k < size; k++) pixels[k] = Math.min(AAF_LEVELS, bytes[dataStart + offset + k] ?? 0);
    glyphs.push({ width, height: glyphHeight, pixels });
  }
  return { format: 'aaf', height, letterSpacing, spaceWidth, lineSpacing, levels: AAF_LEVELS, glyphs };
}

/** Parses a font of either kind: AAF is recognized by the tag at the start, everything else is FON. */
export function parseFont(bytes: Uint8Array): BitmapFont {
  const isAaf = bytes.length >= 4 && bytes[0] === 0x41 && bytes[1] === 0x41 && bytes[2] === 0x46 && bytes[3] === 0x46;
  return isAaf ? parseAaf(bytes) : parseFon(bytes);
}

let cp1251: Map<string, number> | null = null;

/** Character code in the font. ASCII — as is, Cyrillic letters — windows-1251 (that's how the localized copy's fonts are built), anything else — "?". */
export function charCode(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code < 128) return code;
  if (!cp1251) {
    cp1251 = new Map();
    const decoder = new TextDecoder('windows-1251');
    for (let byte = 128; byte < 256; byte++) cp1251.set(decoder.decode(Uint8Array.of(byte)), byte);
  }
  return cp1251.get(ch) ?? 63;
}

function glyphFor(font: BitmapFont, ch: string): FontGlyph {
  return font.glyphs[charCode(ch)] ?? font.glyphs[63] ?? { width: 0, height: font.height, pixels: new Uint8Array(0) };
}

function advance(font: BitmapFont, ch: string): number {
  const width = ch === ' ' && font.format === 'aaf' ? font.spaceWidth : glyphFor(font, ch).width;
  return width + font.letterSpacing;
}

/** String width in pixels (as the game itself computes it: letter widths plus gaps). For several lines — the longest one. */
export function measureText(font: BitmapFont, text: string): number {
  let widest = 0;
  for (const line of text.split('\n')) {
    let width = 0;
    for (const ch of line) width += advance(font, ch);
    widest = Math.max(widest, width);
  }
  return widest;
}

/** Distance from line to line. */
export function lineHeight(font: BitmapFont): number {
  return font.height + font.lineSpacing;
}

/** What replaces characters missing from the font (FON and large AAF fonts lack the Cyrillic yo, "—", "·", "…", guillemets). */
const SUBSTITUTES: Record<string, string> = {
  '\u0451': '\u0435',
  '\u0401': '\u0415',
  '—': '-',
  '–': '-',
  '·': '-',
  '…': '..',
  '•': '*',
  '«': '"',
  '»': '"',
  '№': 'N',
};

/**
 * A string the font will draw in full: characters without a glyph are replaced with similar ones (Cyrillic yo → plain e, "—" → "-", "…" → ".."),
 * and if there is nothing similar — "?". This is the only place for such substitution: all windows using the original's fonts take their strings from here.
 */
export function printable(font: BitmapFont, text: string): string {
  let out = '';
  for (const ch of text) {
    // `charCode` returns a character outside windows-1251 as "?" — so as not to draw the question glyph silently, we replace it ourselves.
    const known = ch === ' ' || ((charCode(ch) !== 63 || ch === '?') && (font.glyphs[charCode(ch)]?.width ?? 0) > 0);
    out += known ? ch : (SUBSTITUTES[ch] ?? '?');
  }
  return out;
}

/** A string no wider than `maxWidth` pixels (with character substitution, as in `printable`): if it doesn't fit, the end is cut off and ".." is added. */
export function fitText(font: BitmapFont, text: string, maxWidth: number): string {
  const line = printable(font, text);
  if (measureText(font, line) <= maxWidth) return line;
  let cut = line.length;
  while (cut > 0 && measureText(font, line.slice(0, cut).trimEnd() + '..') > maxWidth) cut--;
  return line.slice(0, cut).trimEnd() + '..';
}

export type Rgb = readonly [number, number, number];

/** Color "#rrggbb" or "#rgb" into a triple of numbers. */
export function parseColor(color: string | Rgb): Rgb {
  if (typeof color !== 'string') return color;
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error('Color must be in the form #rrggbb: ' + color);
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export interface RenderedText {
  width: number;
  height: number;
  /** RGBA, by rows top to bottom; point opacity — from zero to full by the font level. */
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

/** Draws a string in the font into a point array (no canvas — so it works in tests too). Line break — the "\n" character. */
export function renderText(font: BitmapFont, text: string, color: string | Rgb = '#ffffff'): RenderedText {
  const [r, g, b] = parseColor(color);
  const lines = text.split('\n');
  const width = measureText(font, text);
  const height = font.height + (lines.length - 1) * lineHeight(font);
  const pixels = new Uint8ClampedArray(width * height * 4);
  lines.forEach((line, row) => {
    let x = 0;
    const top = row * lineHeight(font);
    for (const ch of line) {
      const glyph = glyphFor(font, ch);
      // AAF: short glyphs sit on the baseline; FON: all glyphs are line-high.
      const dy = font.format === 'aaf' ? font.height - glyph.height : 0;
      for (let gy = 0; gy < glyph.height; gy++) {
        for (let gx = 0; gx < glyph.width; gx++) {
          const level = glyph.pixels[gy * glyph.width + gx] ?? 0;
          if (level === 0) continue;
          const px = x + gx;
          const py = top + dy + gy;
          if (px >= width || py >= height) continue;
          const at = (py * width + px) * 4;
          const alpha = Math.round((level / font.levels) * 255);
          if (alpha <= (pixels[at + 3] ?? 0)) continue;
          pixels[at] = r;
          pixels[at + 1] = g;
          pixels[at + 2] = b;
          pixels[at + 3] = alpha;
        }
      }
      x += advance(font, ch);
    }
  });
  return { width, height, pixels };
}

/** Draws a string on a canvas: top left corner — (x, y). Returns the width of the text. */
export function drawText(ctx: CanvasRenderingContext2D, font: BitmapFont, text: string, x: number, y: number, color: string | Rgb = '#ffffff'): number {
  const image = renderText(font, text, color);
  if (image.width === 0) return 0;
  const layer = document.createElement('canvas');
  layer.width = image.width;
  layer.height = image.height;
  layer.getContext('2d')!.putImageData(new ImageData(image.pixels, image.width, image.height), 0, 0);
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer, Math.round(x), Math.round(y));
  ctx.imageSmoothingEnabled = smoothing;
  return image.width;
}
