/**
 * Top view of a Fallout map and a list of its objects, for building our levels from the original's layout.
 * Run: node tools/map-view.ts <MAP_NAME> [floor] [pixels per hex] [hexes per our cell] [--grid]
 *   node tools/map-view.ts V13ENT          — all floors of the map
 *   node tools/map-view.ts VAULT13 1 8 2   — floor 1 only, scale 8, our cell = 2×2 hexes
 *   node tools/map-view.ts VAULT13 1 12 2 --grid — the same with our cell grid and numbers every five cells
 * Output: docs/img/map-<NAME>-<floor>.png and docs/data/map-<NAME>.md (both folders are on this computer only).
 * Colours: walls are dark dots, doors yellow, critters red (with the prototype number next to them), items green,
 * map exits blue; elevators and stairs orange; the entrance is a white cross. The floor is not drawn: there are tiles under the whole map.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseFont, renderText } from '../src/formats/font.ts';
import { createProtoTypes, hexToPlan, parseMap, type FalloutMap, type MapObject } from '../src/formats/map.ts';
import { ITEM_TYPE, OBJ_TYPE, SCENERY_TYPE, idIndex, idType, parseProto } from '../src/formats/pro.ts';
import { parseLst, parseMsg } from '../src/formats/text.ts';

const require = createRequire(import.meta.url);
const { openGame, checkGameFolder } = require('../electron/gamefiles.cjs');

const root = fileURLToPath(new URL('../', import.meta.url));
const B = '\\';

const showGrid = process.argv.includes('--grid');
const [nameArg, elevationArg, scaleArg, cellArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!nameArg) {
  console.error('Specify a map: node tools/map-view.ts V13ENT [floor] [scale] [hexes per cell]');
  process.exit(1);
}
const mapName = nameArg.toUpperCase().replace(/\.MAP$/, '');
const scale = Number(scaleArg ?? 6);
const cellSize = Number(cellArg ?? 2);

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
const read = (name: string): Uint8Array | null => game.read(name);
const types = createProtoTypes(read);

const bytes = read(`MAPS${B}${mapName}.MAP`);
if (!bytes) {
  console.error('No map ' + mapName);
  process.exit(1);
}
const map = parseMap(bytes, types);

// ---------- object names from the game copy ----------

const MESSAGE_FILE: Record<number, string> = {
  [OBJ_TYPE.item]: 'PRO_ITEM.MSG',
  [OBJ_TYPE.critter]: 'PRO_CRIT.MSG',
  [OBJ_TYPE.scenery]: 'PRO_SCEN.MSG',
  [OBJ_TYPE.wall]: 'PRO_WALL.MSG',
  [OBJ_TYPE.misc]: 'PRO_MISC.MSG',
};
const DIR_OF: Record<number, string> = {
  [OBJ_TYPE.item]: 'ITEMS',
  [OBJ_TYPE.critter]: 'CRITTERS',
  [OBJ_TYPE.scenery]: 'SCENERY',
  [OBJ_TYPE.wall]: 'WALLS',
  [OBJ_TYPE.misc]: 'MISC',
};
const TYPE_LABEL: Record<number, string> = {
  [OBJ_TYPE.item]: 'item',
  [OBJ_TYPE.critter]: 'critter',
  [OBJ_TYPE.scenery]: 'scenery',
  [OBJ_TYPE.wall]: 'wall',
  [OBJ_TYPE.misc]: 'misc',
};
const messages = new Map<number, Map<number, string>>();
const lists = new Map<string, string[]>();
const nameCache = new Map<number, string>();

function nameOf(pid: number): string {
  const cached = nameCache.get(pid);
  if (cached !== undefined) return cached;
  let name = '—';
  const type = idType(pid);
  const dir = DIR_OF[type];
  const file = MESSAGE_FILE[type];
  if (dir && file) {
    try {
      let list = lists.get(dir);
      if (!list) {
        list = parseLst(game.read(`PROTO${B}${dir}${B}${dir}.LST`));
        lists.set(dir, list);
      }
      const proto = parseProto(game.read(`PROTO${B}${dir}${B}${list[idIndex(pid) - 1]}`));
      let msg = messages.get(type);
      if (!msg) {
        msg = parseMsg(game.read(`TEXT${B}ENGLISH${B}GAME${B}${file}`));
        messages.set(type, msg);
      }
      name = msg.get(proto.messageId) ?? '—';
    } catch {
      name = '?';
    }
  }
  nameCache.set(pid, name);
  return name;
}

// ---------- top view ----------

type Rgb = [number, number, number];
const COLORS = {
  background: [16, 18, 20] as Rgb,
  wall: [96, 96, 104] as Rgb,
  scenery: [66, 66, 80] as Rgb,
  door: [255, 214, 51] as Rgb,
  lift: [255, 140, 40] as Rgb,
  critter: [255, 64, 64] as Rgb,
  item: [64, 220, 96] as Rgb,
  container: [40, 150, 70] as Rgb,
  exit: [64, 120, 255] as Rgb,
  entry: [255, 255, 255] as Rgb,
};

function classify(obj: MapObject): { color: Rgb; size: number; layer: number } | null {
  const type = idType(obj.pid);
  if (type === OBJ_TYPE.wall) return { color: COLORS.wall, size: 0.9, layer: 1 };
  if (type === OBJ_TYPE.scenery) {
    const kind = types.sceneryType(obj.pid);
    if (kind === SCENERY_TYPE.door) return { color: COLORS.door, size: 1.4, layer: 4 };
    if (kind === SCENERY_TYPE.elevator || kind === SCENERY_TYPE.stairs || kind === SCENERY_TYPE.ladderUp || kind === SCENERY_TYPE.ladderDown) {
      return { color: COLORS.lift, size: 1.6, layer: 4 };
    }
    return { color: COLORS.scenery, size: 0.6, layer: 0 };
  }
  if (type === OBJ_TYPE.critter) return { color: COLORS.critter, size: 1.4, layer: 5 };
  if (type === OBJ_TYPE.item) {
    return types.itemType(obj.pid) === ITEM_TYPE.container
      ? { color: COLORS.container, size: 1.0, layer: 2 }
      : { color: COLORS.item, size: 1.0, layer: 3 };
  }
  if (type === OBJ_TYPE.misc && obj.exit) return { color: COLORS.exit, size: 1.6, layer: 4 };
  return null;
}

class Canvas {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) this.set(i % width, Math.floor(i / width), COLORS.background);
  }

  set(x: number, y: number, [r, g, b]: Rgb): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const at = (y * this.width + x) * 4;
    this.pixels[at] = r;
    this.pixels[at + 1] = g;
    this.pixels[at + 2] = b;
    this.pixels[at + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, color: Rgb): void {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++) for (let xx = Math.round(x); xx < Math.round(x + w); xx++) this.set(xx, yy, color);
  }

  /** Overlays a label (RGBA) pixel by pixel. */
  blit(image: { width: number; height: number; pixels: Uint8ClampedArray }, x: number, y: number): void {
    for (let yy = 0; yy < image.height; yy++) {
      for (let xx = 0; xx < image.width; xx++) {
        const s = (yy * image.width + xx) * 4;
        const a = image.pixels[s + 3]! / 255;
        if (a === 0) continue;
        const px = x + xx;
        const py = y + yy;
        if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
        const at = (py * this.width + px) * 4;
        for (let c = 0; c < 3; c++) this.pixels[at + c] = Math.round(image.pixels[s + c]! * a + this.pixels[at + c]! * (1 - a));
      }
    }
  }
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8);
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
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const labelFont = (() => {
  const fon = game.read('FONT1.FON');
  return fon ? parseFont(fon) : null;
})();

interface Plan {
  x0: number;
  y0: number;
  width: number;
  height: number;
}

/** Frame around the floor's objects (plus a margin), in hex units. */
function planBounds(objects: MapObject[], entering: number | null): Plan | null {
  const points = objects.filter((o) => o.tile >= 0).map((o) => hexToPlan(o.tile));
  if (entering !== null && entering >= 0) points.push(hexToPlan(entering));
  if (points.length === 0) return null;
  const margin = 3;
  const x0 = Math.floor(Math.min(...points.map((p) => p.x))) - margin;
  const y0 = Math.floor(Math.min(...points.map((p) => p.y))) - margin;
  const x1 = Math.ceil(Math.max(...points.map((p) => p.x))) + margin;
  const y1 = Math.ceil(Math.max(...points.map((p) => p.y))) + margin;
  return { x0, y0, width: x1 - x0, height: y1 - y0 };
}

function drawElevation(map: FalloutMap, elevation: number, plan: Plan): Buffer {
  const canvas = new Canvas(Math.ceil(plan.width * scale), Math.ceil(plan.height * scale));
  const px = (x: number) => (x - plan.x0) * scale;
  const py = (y: number) => (y - plan.y0) * scale;

  // Our cell grid: thin lines and cell numbers every five cells, handy for transferring the map into a level.
  if (showGrid) {
    const gridColor: Rgb = [34, 40, 48];
    const strongColor: Rgb = [52, 62, 74];
    for (let i = 0; i * cellSize <= plan.width; i++) {
      canvas.rect(px(plan.x0 + i * cellSize), 0, 1, canvas.height, i % 5 === 0 ? strongColor : gridColor);
    }
    for (let j = 0; j * cellSize <= plan.height; j++) {
      canvas.rect(0, py(plan.y0 + j * cellSize), canvas.width, 1, j % 5 === 0 ? strongColor : gridColor);
    }
    if (labelFont) {
      for (let i = 0; i * cellSize <= plan.width; i += 5) canvas.blit(renderText(labelFont, String(i), '#7f8a99'), Math.round(px(plan.x0 + i * cellSize)) + 2, 1);
      for (let j = 5; j * cellSize <= plan.height; j += 5) canvas.blit(renderText(labelFont, String(j), '#7f8a99'), 1, Math.round(py(plan.y0 + j * cellSize)) + 2);
    }
  }

  const drawn = map.objects[elevation]!
    .filter((o) => o.tile >= 0)
    .map((o) => ({ o, how: classify(o) }))
    .filter((d): d is { o: MapObject; how: NonNullable<ReturnType<typeof classify>> } => d.how !== null)
    .sort((a, b) => a.how.layer - b.how.layer);
  for (const { o, how } of drawn) {
    const p = hexToPlan(o.tile);
    const size = Math.max(2, how.size * scale);
    canvas.rect(px(p.x) - size / 2, py(p.y) - size / 2, size, size, how.color);
  }
  // Critter prototype numbers.
  if (labelFont) {
    for (const { o } of drawn) {
      if (idType(o.pid) !== OBJ_TYPE.critter) continue;
      const p = hexToPlan(o.tile);
      canvas.blit(renderText(labelFont, String(idIndex(o.pid)), '#ff9090'), Math.round(px(p.x) + scale), Math.round(py(p.y) - scale));
    }
  }
  // Map entrance.
  if (map.header.enteringElevation === elevation && map.header.enteringTile >= 0) {
    const p = hexToPlan(map.header.enteringTile);
    const arm = Math.max(4, scale * 1.5);
    canvas.rect(px(p.x) - arm, py(p.y) - 1, 2 * arm, 2, COLORS.entry);
    canvas.rect(px(p.x) - 1, py(p.y) - arm, 2, 2 * arm, COLORS.entry);
  }
  return encodePng(canvas.width, canvas.height, canvas.pixels);
}

// ---------- object list ----------

function describe(o: MapObject): string {
  const parts: string[] = [];
  if (o.exit) parts.push(`exit: map ${o.exit.map}, cell ${o.exit.tile}, floor ${o.exit.elevation}`);
  if (o.elevator) parts.push(`elevator: kind ${o.elevator.type}, floor ${o.elevator.level}`);
  if (o.stairs) parts.push(`stairs: map ${o.stairs.destinationMap}, cell ${o.stairs.destinationTile}`);
  if (o.ladder !== undefined) parts.push(`rope: ${o.ladder}`);
  if (o.openFlags !== undefined) parts.push(o.openFlags & 0x1 ? 'open' : 'closed');
  if (o.keyCode !== undefined && o.keyCode > 0) parts.push(`key ${o.keyCode}`);
  if (o.critter) parts.push(`HP ${o.critter.hp}, AI ${o.critter.aiPacket}, team ${o.critter.team}`);
  if (o.weaponAmmo) parts.push(`rounds ${o.weaponAmmo.quantity}`);
  if (o.ammoQuantity !== undefined) parts.push(`in pack ${o.ammoQuantity}`);
  if (o.scriptIndex > 0 && o.scriptId !== -1) parts.push(`script ${o.scriptIndex}`);
  if (o.inventory.length > 0) parts.push(`items inside ${o.inventory.length}`);
  return parts.join('; ');
}

const esc = (value: string | number) => String(value).replace(/\|/g, '/').replace(/\s+/g, ' ');

function listObjects(map: FalloutMap, plans: (Plan | null)[]): string {
  const lines: string[] = [
    `# Map ${mapName}: objects`,
    '',
    'Generated by `tools/map-view.ts` from the game copy (on this computer only).',
    '',
    `- Version ${map.header.version}, map # ${map.header.mapNumber}, variables: global ${map.header.globalVariablesCount}, local ${map.header.localVariablesCount}, scripts: ${map.scripts.length}.`,
    `- Entrance: cell ${map.header.enteringTile}, floor ${map.header.enteringElevation}, rotation ${map.header.enteringRotation}.`,
    `- "Our grid" — a cell of ${cellSize}×${cellSize} hexes, counted from the top-left corner of the floor frame (north is up).`,
    '- "Cell" — the original hex number (0–39999).',
    '',
  ];
  map.objects.forEach((objects, elevation) => {
    const plan = plans[elevation];
    if (!plan || objects.length === 0) return;
    lines.push(`## Floor ${elevation} (objects: ${objects.length})`, '');
    lines.push('| Type | PID | Name | Cell | Our grid | Notes |', '|---|---|---|---|---|---|');
    const rows = objects
      .filter((o) => o.tile >= 0 && idType(o.pid) !== OBJ_TYPE.wall && idType(o.pid) !== OBJ_TYPE.tile)
      .sort((a, b) => idType(a.pid) - idType(b.pid) || a.pid - b.pid || a.tile - b.tile);
    for (const o of rows) {
      const p = hexToPlan(o.tile);
      const gx = Math.floor((p.x - plan.x0) / cellSize);
      const gy = Math.floor((p.y - plan.y0) / cellSize);
      lines.push(`| ${TYPE_LABEL[idType(o.pid)] ?? idType(o.pid)} | 0x${(o.pid >>> 0).toString(16).padStart(8, '0')} | ${esc(nameOf(o.pid))} | ${o.tile} | ${gx}, ${gy} | ${esc(describe(o))} |`);
    }
    const walls = objects.filter((o) => idType(o.pid) === OBJ_TYPE.wall).length;
    lines.push('', `Walls on the floor: ${walls} (dark dots on the top view).`, '');
  });
  return lines.join('\n') + '\n';
}

// ---------- run ----------

const imageDir = path.join(root, 'docs', 'img');
const dataDir = path.join(root, 'docs', 'data');
fs.mkdirSync(imageDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

const only = elevationArg === undefined ? null : Number(elevationArg);
const plans: (Plan | null)[] = [];
for (let e = 0; e < 3; e++) {
  const present = map.elevations[e] !== null || map.objects[e]!.length > 0;
  plans.push(present ? planBounds(map.objects[e]!, map.header.enteringElevation === e ? map.header.enteringTile : null) : null);
}
plans.forEach((plan, e) => {
  if (!plan || (only !== null && only !== e)) return;
  const file = path.join(imageDir, `map-${mapName}-${e}.png`);
  fs.writeFileSync(file, drawElevation(map, e, plan));
  console.log('picture', path.relative(root, file), `${Math.ceil(plan.width * scale)}×${Math.ceil(plan.height * scale)}`);
});
const listFile = path.join(dataDir, `map-${mapName}.md`);
fs.writeFileSync(listFile, listObjects(map, plans));
console.log('list', path.relative(root, listFile));
game.close();
