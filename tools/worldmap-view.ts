/**
 * The Fallout world map for marking up: the picture from the player's copy with a grid of squares and column and row numbers.
 * Run: node tools/worldmap-view.ts [--find] [--suggest] [--terrain]
 *   (no flags)    — docs/img/worldmap.png: the picture, a 50×50 pixel grid (28 columns, 30 rows), numbers along the edges;
 *   --find        — find the green location circles on the picture and print their squares (column, row);
 *   --suggest     — print a "first draft" of the terrain from the colour and pattern of each square (letters as in src/world/worldmap.ts);
 *   --terrain     — draw the terrain letters and locations from src/world/worldmap.ts over the picture (an "eyeball" check).
 * The picture is INTRFACE.LST #135 (one 1400×1500 picture); in Fallout 1 it is not made of pieces. Output is on this computer only (docs/img is in .gitignore).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseFont, renderText } from '../src/formats/font.ts';
import { parseFrm } from '../src/formats/frm.ts';
import { parsePalette } from '../src/formats/pal.ts';
import { parseLst } from '../src/formats/text.ts';

const require = createRequire(import.meta.url);
const { openGame, checkGameFolder } = require('../electron/gamefiles.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const B = String.fromCharCode(92);

/** The world map picture's number in INTRFACE.LST and the size of a grid square on it. */
const WORLDMAP_PICTURE = 135;
const SQUARE = 50;

let gameDir = '';
try {
  gameDir = JSON.parse(fs.readFileSync(path.join(root, '.local', 'config.json'), 'utf8')).gameDir ?? '';
} catch {
  gameDir = '';
}
if (!gameDir || !checkGameFolder(gameDir).ok) {
  console.error('No Fallout 1 copy found: set the game folder in .local/config.json');
  process.exit(1);
}
const game = openGame(gameDir);

// ---------- picture ----------

const list = parseLst(game.read(`ART${B}INTRFACE${B}INTRFACE.LST`));
const frmBytes = game.read(`ART${B}INTRFACE${B}${list[WORLDMAP_PICTURE]}`);
if (!frmBytes) {
  console.error('No world map picture (INTRFACE.LST #' + WORLDMAP_PICTURE + ')');
  process.exit(1);
}
const frame = parseFrm(frmBytes).directions[0]!.frames[0]!;
const palette = parsePalette(game.read('COLOR.PAL'));
const width = frame.width;
const height = frame.height;
const columns = Math.floor(width / SQUARE);
const rows = Math.floor(height / SQUARE);
/** Colours of each pixel: r, g, b (the palette stores them as 0xAABBGGRR). */
const rgb = new Uint8Array(width * height * 3);
for (let i = 0; i < width * height; i++) {
  const px = palette[frame.pixels[i] ?? 0] ?? 0;
  rgb[i * 3] = px & 255;
  rgb[i * 3 + 1] = (px >>> 8) & 255;
  rgb[i * 3 + 2] = (px >>> 16) & 255;
}
console.log(`picture ${width}×${height}, squares: ${columns} columns × ${rows} rows`);

// ---------- square features ----------

interface Features {
  /** Average colours and brightness. */
  r: number;
  g: number;
  b: number;
  light: number;
  /** Brightness spread inside the square (relief) and "fine ripple" (town pattern). */
  spread: number;
  ripple: number;
  /** How many pixels are green (location circle). */
  green: number;
}

function featuresOf(column: number, row: number): Features {
  let r = 0;
  let g = 0;
  let b = 0;
  let green = 0;
  const lights: number[] = [];
  let ripple = 0;
  let pairs = 0;
  for (let y = row * SQUARE; y < (row + 1) * SQUARE; y++) {
    for (let x = column * SQUARE; x < (column + 1) * SQUARE; x++) {
      const i = (y * width + x) * 3;
      const pr = rgb[i]!;
      const pg = rgb[i + 1]!;
      const pb = rgb[i + 2]!;
      r += pr;
      g += pg;
      b += pb;
      const light = (pr + pg + pb) / 3;
      lights.push(light);
      if (pg > pr + 30 && pg > pb + 30 && pg > 90) green++;
      if (x + 1 < (column + 1) * SQUARE) {
        const j = i + 3;
        ripple += Math.abs(light - (rgb[j]! + rgb[j + 1]! + rgb[j + 2]!) / 3);
        pairs++;
      }
    }
  }
  const n = lights.length;
  const mean = lights.reduce((s, v) => s + v, 0) / n;
  const spread = Math.sqrt(lights.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  return { r: r / n, g: g / n, b: b / n, light: mean, spread, ripple: ripple / pairs, green };
}

const features: Features[][] = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => featuresOf(column, row)));

// ---------- terrain draft by colour ----------

/** Terrain letters (the same as in src/world/worldmap.ts). */
const LETTERS = { desert: '.', mountains: '^', ruins: 'r', town: 'T', water: '~' } as const;

/**
 * Draft by colour: locations are green circles, water is dark and blue, desert is light or grey and even, the rest is mountains.
 * Ruins cannot be told from mountains by colour (both are dark and rippled), so they are placed by hand from the picture.
 */
function suggest(f: Features): string {
  if (f.green > 40) return LETTERS.town;
  if (f.b >= f.r + 4 && f.light < 95) return LETTERS.water;
  if (f.light >= 100) return LETTERS.desert;
  if (f.light >= 74 && f.r - f.b <= 8 && f.spread <= 35) return LETTERS.desert;
  return LETTERS.mountains;
}

// ---------- drawing ----------

type Rgb = [number, number, number];
const pixels = new Uint8Array(width * height * 4);
for (let i = 0; i < width * height; i++) {
  pixels[i * 4] = rgb[i * 3]!;
  pixels[i * 4 + 1] = rgb[i * 3 + 1]!;
  pixels[i * 4 + 2] = rgb[i * 3 + 2]!;
  pixels[i * 4 + 3] = 255;
}

function blend(x: number, y: number, [r, g, b]: Rgb, alpha: number): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const at = (y * width + x) * 4;
  pixels[at] = Math.round(r * alpha + pixels[at]! * (1 - alpha));
  pixels[at + 1] = Math.round(g * alpha + pixels[at + 1]! * (1 - alpha));
  pixels[at + 2] = Math.round(b * alpha + pixels[at + 2]! * (1 - alpha));
}

const font = (() => {
  const fon = game.read('FONT1.FON');
  return fon ? parseFont(fon) : null;
})();

function label(text: string, x: number, y: number, color: string): void {
  if (!font) return;
  const image = renderText(font, text, color);
  for (let yy = 0; yy < image.height; yy++) {
    for (let xx = 0; xx < image.width; xx++) {
      const s = (yy * image.width + xx) * 4;
      const a = image.pixels[s + 3]! / 255;
      if (a > 0) blend(x + xx, y + yy, [image.pixels[s]!, image.pixels[s + 1]!, image.pixels[s + 2]!], a);
    }
  }
}

function drawGrid(): void {
  for (let c = 0; c <= columns; c++) for (let y = 0; y < height; y++) blend(c * SQUARE, y, [255, 255, 255], c % 5 === 0 ? 0.55 : 0.28);
  for (let r = 0; r <= rows; r++) for (let x = 0; x < width; x++) blend(x, r * SQUARE, [255, 255, 255], r % 5 === 0 ? 0.55 : 0.28);
  // Numbers: columns at the top of each square, rows on the left; every fifth in a more noticeable colour.
  for (let c = 0; c < columns; c++) label(String(c), c * SQUARE + 3, 2, c % 5 === 0 ? '#ffe040' : '#ffffff');
  for (let r = 1; r < rows; r++) label(String(r), 3, r * SQUARE + 2, r % 5 === 0 ? '#ffe040' : '#ffffff');
}

function encodePng(w: number, h: number, rgba: Uint8Array): Buffer {
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 255]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- modes ----------

const args = new Set(process.argv.slice(2));
const outDir = path.join(root, 'docs', 'img');
fs.mkdirSync(outDir, { recursive: true });

if (args.has('--find')) {
  const found: string[] = [];
  features.forEach((line, row) => line.forEach((f, column) => f.green > 40 && found.push(`column ${column}, row ${row} (green pixels ${f.green})`)));
  console.log(`green circles: ${found.length}`);
  for (const line of found) console.log('  ' + line);
}

if (args.has('--suggest')) {
  console.log('terrain draft (. desert, ^ mountains, r ruins, T location, ~ water):');
  for (const line of features) console.log("  '" + line.map(suggest).join('') + "',");
}

if (args.has('--terrain')) {
  const { WORLD_TERRAIN, PLACES } = await import('../src/world/worldmap.ts');
  const colors: Record<string, string> = { '.': '#ffe9a0', '^': '#ff9050', r: '#d0d0ff', T: '#40ff40', '~': '#80b0ff' };
  WORLD_TERRAIN.forEach((line, row) => [...line].forEach((letter, column) => label(letter, column * SQUARE + 20, row * SQUARE + 20, colors[letter] ?? '#ff00ff')));
  for (const [key, place] of Object.entries(PLACES)) label(key, place.column * SQUARE + 2, place.row * SQUARE + 36, '#40ff40');
}

drawGrid();
const file = path.join(outDir, 'worldmap.png');
fs.writeFileSync(file, encodePng(width, height, pixels));
console.log('saved: docs/img/worldmap.png');
game.close();
