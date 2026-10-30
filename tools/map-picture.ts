/**
 * A picture of an original map "as on the game screen" (oblique view): floor tiles, walls, scenery and items from the player's copy,
 * critters as red squares. Used to compare our locations with the original without running it.
 * Run: node tools/map-picture.ts SHADYW [floor] [--roofs] [--scale 0.5] [--region tx0,ty0,tx1,ty1]
 *   --roofs — draw roofs (the map's roof layer, raised by 96 pixels as in the original); without it you see inside houses;
 *   --scale — shrink the picture (0.5 — by half); --region — only part of the map (in 100×100 floor tiles, as in docs/data).
 * Output: docs/img/pic-<NAME>-<floor>[-roofs].png (the folder is on this computer only, it does not go to git).
 * Screen position: a hex — hexToScreen (src/formats/map.ts), an 80×36 floor tile is a 2×2 square of hexes.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseFrm, type Frm } from '../src/formats/frm.ts';
import { createProtoTypes, hexToScreen, parseMap } from '../src/formats/map.ts';
import { parsePalette } from '../src/formats/pal.ts';
import { idType, OBJ_TYPE } from '../src/formats/pro.ts';
import { parseLst } from '../src/formats/text.ts';

const require = createRequire(import.meta.url);
const { openGame } = require('../electron/gamefiles.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const B = '\\';

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !['--scale', '--region'].includes(args[i - 1] ?? ''));
const mapName = (positional[0] ?? '').toUpperCase();
if (!mapName) {
  console.error('Specify a map: node tools/map-picture.ts SHADYW [floor] [--roofs] [--scale 0.5] [--region tx0,ty0,tx1,ty1]');
  process.exit(1);
}
const elevation = Number(positional[1] ?? 0);
const roofs = args.includes('--roofs');
const scale = Number(option('--scale') ?? 1);
const region = option('--region')?.split(',').map(Number) as [number, number, number, number] | undefined;

const gameDir = JSON.parse(fs.readFileSync(path.join(root, '.local', 'config.json'), 'utf8')).gameDir as string;
const game = openGame(gameDir);
const read = (file: string): Uint8Array | null => game.read(file);
const map = parseMap(read(`MAPS${B}${mapName}.MAP`)!, createProtoTypes((n) => read(n)));
const floor = map.elevations[elevation];
if (!floor) throw new Error(`Map ${mapName} has no floor ${elevation}`);
const palette = parsePalette(read('COLOR.PAL')!);
const lists: Record<string, string[]> = {
  TILES: parseLst(read(`ART${B}TILES${B}TILES.LST`)!),
  WALLS: parseLst(read(`ART${B}WALLS${B}WALLS.LST`)!),
  SCENERY: parseLst(read(`ART${B}SCENERY${B}SCENERY.LST`)!),
  ITEMS: parseLst(read(`ART${B}ITEMS${B}ITEMS.LST`)!),
  MISC: parseLst(read(`ART${B}MISC${B}MISC.LST`)!),
};
const DIRS: Record<number, string> = { 0: 'ITEMS', 2: 'SCENERY', 3: 'WALLS', 4: 'TILES', 5: 'MISC' };
const frms = new Map<string, Frm | null>();
function frmOf(dir: string, index: number): Frm | null {
  const name = lists[dir]?.[index];
  if (!name) return null;
  const key = `${dir}/${name}`;
  let frm = frms.get(key);
  if (frm === undefined) {
    const bytes = read(`ART${B}${dir}${B}${name.trim()}`);
    frm = bytes ? parseFrm(bytes) : null;
    frms.set(key, frm);
  }
  return frm;
}

/** Top-left corner of floor tile (tx, ty) on the original's screen: at the middle of its four hexes. */
const tileScreen = (tx: number, ty: number) => ({ x: 48 * (99 - tx) + 32 * ty, y: 24 * ty - 12 * (99 - tx) - 4 });

// Which tiles we draw and where they are on screen — this gives the picture size.
const inRegion = (tx: number, ty: number) => !region || (tx >= region[0] && ty >= region[1] && tx <= region[2] && ty <= region[3]);
let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
const squares: number[] = [];
for (let sq = 0; sq < floor.floor.length; sq++) {
  const tx = sq % 100;
  const ty = Math.floor(sq / 100);
  if ((floor.floor[sq]! & 0xfff) === 1 || !inRegion(tx, ty)) continue;
  squares.push(sq);
  const p = tileScreen(tx, ty);
  minX = Math.min(minX, p.x);
  minY = Math.min(minY, p.y - (roofs ? 96 : 0) - 120);
  maxX = Math.max(maxX, p.x + 80);
  maxY = Math.max(maxY, p.y + 36);
}
if (squares.length === 0) throw new Error('The floor has no floor tiles');
const W = maxX - minX;
const H = maxY - minY;
const canvas = new Uint32Array(W * H);
canvas.fill(0xff101010);

function blit(frame: { width: number; height: number; pixels: Uint8Array }, x0: number, y0: number): void {
  for (let y = 0; y < frame.height; y++) {
    const py = y0 + y - minY;
    if (py < 0 || py >= H) continue;
    for (let x = 0; x < frame.width; x++) {
      const px = x0 + x - minX;
      if (px < 0 || px >= W) continue;
      const index = frame.pixels[y * frame.width + x]!;
      if (index === 0) continue;
      canvas[py * W + px] = 0xff000000 | (palette[index]! & 0xffffff);
    }
  }
}
function box(x0: number, y0: number, size: number, color: number): void {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = x0 + x - minX;
    const py = y0 + y - minY;
    if (px >= 0 && py >= 0 && px < W && py < H) canvas[py * W + px] = color;
  }
}

// Floor.
for (const sq of squares) {
  const frm = frmOf('TILES', floor.floor[sq]! & 0xfff);
  const frame = frm?.directions[0]?.frames[0];
  if (!frame) continue;
  const p = tileScreen(sq % 100, Math.floor(sq / 100));
  blit(frame, p.x, p.y);
}
// Objects in hex order (the original draws this way: lower on screen goes on top); flat ones first.
const objects = (map.objects[elevation] ?? []).filter((o) => o.tile >= 0 && inRegion(Math.floor((o.tile % 200) / 2), Math.floor(o.tile / 400)));
const FLAT = 0x8;
const order = (o: (typeof objects)[number]) => {
  const type = idType(o.pid);
  return type === OBJ_TYPE.wall ? 0 : type === OBJ_TYPE.scenery ? 1 : 2;
};
objects.sort((a, b) => a.tile - b.tile || ((a.flags & FLAT) ? 0 : 1) - ((b.flags & FLAT) ? 0 : 1) || order(a) - order(b));
let drawn = 0;
let critters = 0;
for (const o of objects) {
  const hex = hexToScreen(o.tile);
  const cx = hex.x + 16;
  const cy = hex.y + 8;
  const type = (o.fid >>> 24) & 0xf;
  if (type === 1) {
    box(cx - 4, cy - 4, 8, 0xff2020ff);
    critters++;
    continue;
  }
  const dir = DIRS[type];
  if (!dir) continue;
  const frm = frmOf(dir, o.fid & 0xfff);
  if (!frm) continue;
  const direction = frm.directions[Math.min(o.rotation, frm.directions.length - 1)] ?? frm.directions[0];
  const frame = direction?.frames[Math.min(o.frame, (direction?.frames.length ?? 1) - 1)];
  if (!direction || !frame) continue;
  blit(frame, cx + direction.shiftX + frame.offsetX - Math.floor(frame.width / 2), cy + direction.shiftY + frame.offsetY - frame.height);
  drawn++;
}
// Roofs on top of everything, raised to wall height.
let roofCount = 0;
if (roofs) {
  for (const sq of squares) {
    const index = floor.roof[sq]! & 0xfff;
    if (index === 1) continue;
    const frame = frmOf('TILES', index)?.directions[0]?.frames[0];
    if (!frame) continue;
    const p = tileScreen(sq % 100, Math.floor(sq / 100));
    blit(frame, p.x, p.y - 96);
    roofCount++;
  }
}

// Downscale (average over a square) and write the PNG.
const outW = Math.max(1, Math.round(W * scale));
const outH = Math.max(1, Math.round(H * scale));
const rgba = new Uint8Array(outW * outH * 4);
const step = 1 / scale;
for (let y = 0; y < outH; y++) {
  for (let x = 0; x < outW; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    const sx0 = Math.floor(x * step);
    const sy0 = Math.floor(y * step);
    for (let sy = sy0; sy < Math.min(H, sy0 + Math.max(1, Math.round(step))); sy++) {
      for (let sx = sx0; sx < Math.min(W, sx0 + Math.max(1, Math.round(step))); sx++) {
        const c = canvas[sy * W + sx]!;
        r += c & 255;
        g += (c >>> 8) & 255;
        b += (c >>> 16) & 255;
        n++;
      }
    }
    const i = (y * outW + x) * 4;
    rgba[i] = r / n;
    rgba[i + 1] = g / n;
    rgba[i + 2] = b / n;
    rgba[i + 3] = 255;
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
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
header.writeUInt32BE(outW, 0);
header.writeUInt32BE(outH, 4);
header[8] = 8;
header[9] = 6;
const raw = Buffer.alloc((outW * 4 + 1) * outH);
for (let y = 0; y < outH; y++) Buffer.from(rgba.buffer, y * outW * 4, outW * 4).copy(raw, y * (outW * 4 + 1) + 1);
const outDir = path.join(root, 'docs', 'img');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `pic-${mapName}-${elevation}${roofs ? '-roofs' : ''}${region ? '-part' : ''}.png`);
fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
game.close();
console.log(`${file}: ${outW}×${outH}; tiles ${squares.length}, objects ${drawn}, critters ${critters}${roofs ? `, roofs ${roofCount}` : ''}`);
