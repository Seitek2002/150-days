// The original's fonts in windows drawn with Fallout images: messages on the panel, inventory, looting, automap, Pip-Boy,
// save screen. Font files are taken from the player's copy and loaded once (`loadInterfaceFonts` remembers the result;
// the `fonts` field in `Resources` is the same set). Our own windows (menu, pause, settings) stay on VT323 and aren't covered here.
// Replacement of characters missing from a font — `printable` in `formats/font.ts`. The English copy's fonts have no Cyrillic letters —
// we build them ourselves (`addCyrillic`), otherwise Cyrillic text on the English copy came out as garbage.
import { charCode, measureText, parseFont, printable, renderText, type BitmapFont, type FontGlyph } from '../formats/font.ts';
import { platform } from '../platform.ts';

export interface InterfaceFonts {
  /** Main window font: number 101 in the original — FONT1.AAF (height 9, antialiased); if missing — the same number as FON. */
  main: BitmapFont;
  /** Large font for headings: number 102 in the original — FONT2.AAF (height 24, narrow tall letters); if missing — FONT2.FON. */
  big: BitmapFont;
}

/** Font by number: the antialiased file first, then the plain one. */
async function loadFont(number: number): Promise<BitmapFont> {
  const aaf = `FONT${number}.AAF`;
  const name = (await platform.gameFileExists(aaf)) ? aaf : `FONT${number}.FON`;
  const font = parseFont(await platform.readGameFile(name));
  if (!(await copyIsCyrillic())) addCyrillic(font);
  return font;
}

/**
 * Whether this is a Cyrillic-localized copy of the game (then its fonts have Cyrillic letters at the windows-1251 positions): the perk text has more than CYRILLIC_BYTES
 * bytes from the upper half of the table. The English copy has almost none.
 */
const CYRILLIC_BYTES = 200;
let cyrillicCopy: Promise<boolean> | null = null;
function copyIsCyrillic(): Promise<boolean> {
  cyrillicCopy ??= platform
    .readGameFile('TEXT\\ENGLISH\\GAME\\PERK.MSG')
    .then((bytes) => bytes.reduce((n, b) => n + (b >= 0xc0 ? 1 : 0), 0) > CYRILLIC_BYTES)
    .catch(() => true);
  return cyrillicCopy;
}

/** Cyrillic letters (including Yo) that the English copy's font lacks. */
const letters = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String.fromCharCode(from + i)).join('');
/** Upper case with Yo after the sixth letter, then lower case the same way, then the numero sign (U+2116). */
const CYRILLIC = letters(0x410, 0x415) + '\u0401' + letters(0x416, 0x42f) + letters(0x430, 0x435) + '\u0451' + letters(0x436, 0x44f) + '\u2116';

/**
 * Build Cyrillic letters into a font (English copy): each is drawn with a system font as tall as the original's capital
 * letters ("A"), on the same baseline, and converted into font pixels (a brightness threshold; for antialiased fonts — levels).
 * The letters differ slightly in style, but the Cyrillic text is readable.
 */
function addCyrillic(font: BitmapFont): void {
  const capital = font.glyphs[65];
  if (!capital || typeof document === 'undefined') return;
  // Where the filled part of "A" has its top and bottom — in line coordinates (in AAF, short glyphs sit on the baseline).
  const dy = font.format === 'aaf' ? font.height - capital.height : 0;
  let top = capital.height;
  let bottom = -1;
  for (let y = 0; y < capital.height; y++) {
    for (let x = 0; x < capital.width; x++) {
      if (!capital.pixels[y * capital.width + x]) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (bottom < 0) return;
  const cap = bottom - top + 1;
  const baseline = dy + bottom + 1;
  const canvas = document.createElement('canvas');
  canvas.width = font.height * 3;
  canvas.height = font.height + 4;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  // Capital height of a monospace font is about 0.72 of the font size.
  const size = Math.max(6, Math.round(cap / 0.72));
  ctx.font = `${cap <= 10 ? 'bold ' : ''}${size}px Consolas, "Courier New", monospace`;
  ctx.textBaseline = 'alphabetic';
  for (const ch of CYRILLIC) {
    const code = charCode(ch);
    if (code === 63) continue;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillText(ch, 1, baseline);
    const data = ctx.getImageData(0, 0, canvas.width, font.height).data;
    let left = canvas.width;
    let right = -1;
    for (let y = 0; y < font.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if ((data[(y * canvas.width + x) * 4 + 3] ?? 0) < 110) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    if (right < 0) continue;
    const width = right - left + 1;
    const pixels = new Uint8Array(width * font.height);
    for (let y = 0; y < font.height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = (data[(y * canvas.width + left + x) * 4 + 3] ?? 0) / 255;
        pixels[y * width + x] = font.levels === 1 ? (alpha >= 0.45 ? 1 : 0) : Math.round(alpha * font.levels);
      }
    }
    const glyph: FontGlyph = { width, height: font.height, pixels };
    font.glyphs[code] = glyph;
  }
}

let loading: Promise<InterfaceFonts> | null = null;

/** Loads the window fonts (once: repeated calls get the same set). */
export function loadInterfaceFonts(): Promise<InterfaceFonts> {
  if (!loading) {
    loading = Promise.all([loadFont(1), loadFont(2)]).then(([main, big]) => ({ main, big }));
    // Failed — try again next time.
    loading.catch(() => (loading = null));
  }
  return loading;
}

/** Text width in pixels (after replacing characters without a glyph). */
export const labelWidth = (font: BitmapFont, text: string): number => measureText(font, printable(font, text));

/**
 * Word wrap into lines no wider than `width`. The first line may have its own width (on the panel an icon stands before it).
 * A word that doesn't fit even into an empty line is cut by letters.
 */
export function wrapText(font: BitmapFont, text: string, width: number, firstWidth = width): string[] {
  const out: string[] = [];
  let line = '';
  let limit = firstWidth;
  for (const word of printable(font, text).split(' ')) {
    if (word === '') continue;
    const candidate = line ? line + ' ' + word : word;
    if (measureText(font, candidate) <= limit) {
      line = candidate;
      continue;
    }
    if (line) {
      out.push(line);
      line = '';
      limit = width;
    }
    let rest = word;
    while (measureText(font, rest) > limit && rest.length > 1) {
      let n = rest.length - 1;
      while (n > 1 && measureText(font, rest.slice(0, n)) > limit) n--;
      out.push(rest.slice(0, n));
      rest = rest.slice(n);
      limit = width;
    }
    line = rest;
  }
  if (line) out.push(line);
  return out;
}

const layers = new Map<string, HTMLCanvasElement>();
const fontIds = new WeakMap<BitmapFont, number>();
let nextFontId = 1;
/** We remember no more than this many rendered labels: then the cache is cleared entirely. */
const LAYERS_MAX = 600;

/**
 * Draws one line in the original's font; (x, y) — the top-left corner of the text, for `center` and `right` — the middle and the right edge.
 * Rendered labels are remembered, so drawing them every frame is cheap. Returns the width.
 */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  font: BitmapFont,
  text: string,
  x: number,
  y: number,
  color: string,
  align: 'left' | 'center' | 'right' = 'left',
): number {
  const line = printable(font, text);
  if (line === '') return 0;
  let id = fontIds.get(font);
  if (id === undefined) {
    id = nextFontId++;
    fontIds.set(font, id);
  }
  const key = `${id}|${color}|${line}`;
  let layer = layers.get(key);
  if (!layer) {
    const image = renderText(font, line, color);
    if (image.width === 0) return 0;
    if (layers.size >= LAYERS_MAX) layers.clear();
    layer = document.createElement('canvas');
    layer.width = image.width;
    layer.height = image.height;
    layer.getContext('2d')!.putImageData(new ImageData(image.pixels, image.width, image.height), 0, 0);
    layers.set(key, layer);
  }
  const left = align === 'left' ? x : align === 'center' ? x - Math.floor(layer.width / 2) : x - layer.width;
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer, Math.round(left), Math.round(y));
  ctx.imageSmoothingEnabled = smoothing;
  return layer.width;
}
