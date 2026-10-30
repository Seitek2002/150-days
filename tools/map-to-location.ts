/**
 * Fallout map → location for the location editor: a variant of a game level "as in the original". The wall layout is the same
 * as the level's (made by tools/map-to-level.ts), and on top of it comes what the level does not have:
 *  - the floor of each cell, from the original floor tile under it (cave, cobblestone, grating, asphalt, dirt…);
 *  - the texture of each wall, from the kind of original wall next to it (cave rock, vault concrete…);
 *  - the location ceiling (--ceiling).
 * Which tile or wall becomes what: tables in tools/levels/floor-rules.ts (only file names from the player's copy; no
 * pictures or texts of the original end up in the result). After that the location is edited in the editor as usual.
 *
 * Run:
 *   node tools/map-to-location.ts cave --name "As in the original" --ceiling caveCeiling
 *   node tools/map-to-location.ts cave --out ../150-days/locations      — write to another locations folder
 * Output: locations/<level>/<name>.json (the same folder the game uses in development); stderr shows how many cells became what.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { TextureName } from '../src/engine/textures.ts';
import { MAP_RULES, FLOOR_RULES, WALL_RULES, ruleOf } from './levels/floor-rules.ts';
import { createProtoTypes, parseMap } from '../src/formats/map.ts';
import { idType } from '../src/formats/pro.ts';
import { parseLst } from '../src/formats/text.ts';
import { hexCenter } from '../src/game/hex.ts';
import { blockInfo } from '../src/world/block-catalog.ts';
import { LEVELS } from '../src/world/levels/index.ts';
import { encodeLocation, locationFromLevel } from '../src/world/location-file.ts';

// The "tile → texture" and "wall → texture" rules are shared with tools/map-to-level.ts: tools/levels/floor-rules.ts.

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const B = '\\';

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const id = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const def = id ? LEVELS[id] : undefined;
if (!def?.original || !def.hexFrame) {
  console.error('Specify a level made from an original map: node tools/map-to-location.ts cave [--name …] [--ceiling …] [--out …]');
  process.exit(1);
}
const name = option('--name') ?? 'As in the original';
const ceiling = option('--ceiling') as TextureName | undefined;
const outDir = path.resolve(option('--out') ?? path.join(root, 'locations'));

const { openGame } = require('../electron/gamefiles.cjs');
const { writeLocation } = require('../electron/locations.cjs');
const gameDir = JSON.parse(fs.readFileSync(path.join(root, '.local', 'config.json'), 'utf8')).gameDir as string;
const game = openGame(gameDir);
const read = (file: string): Uint8Array => game.read(file);
const map = parseMap(read(`MAPS${B}${def.original.toUpperCase()}.MAP`), createProtoTypes(read));
const elevation = def.elevation ?? 0;
const own = MAP_RULES[def.original.toUpperCase()] ?? {};
const floorRules = [...(own.floor ?? []), ...FLOOR_RULES];
const wallRules = [...(own.walls ?? []), ...WALL_RULES];
const floorTiles = map.elevations[elevation];
if (!floorTiles) throw new Error(`Map ${def.original} has no floor ${elevation}`);
const tileNames = parseLst(read(`ART${B}TILES${B}TILES.LST`));
const wallNames = parseLst(read(`ART${B}WALLS${B}WALLS.LST`));

const loc = locationFromLevel(def, name);
const { width, height } = loc;
const frame = def.hexFrame;
const cellOf = (tile: number): number | null => {
  const p = hexCenter(frame, tile);
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  return x >= 0 && y >= 0 && x < width && y < height ? y * width + x : null;
};
const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

// Floor: a floor tile is a 2×2 square of hexes; its middle is hex (2·row+1, 2·column+1).
const ground = loc.floors[0]!;
const floorStats = new Map<string, number>();
for (let square = 0; square < floorTiles.floor.length; square++) {
  const texture = ruleOf(floorRules, tileNames[floorTiles.floor[square]! & 0xfff] ?? '');
  if (!texture) continue;
  const sx = square % 100;
  const sy = Math.floor(square / 100);
  const cell = cellOf((sy * 2 + 1) * 200 + sx * 2 + 1);
  if (cell === null) continue;
  ground[cell] = `tex:${texture}`;
  count(floorStats, texture);
}
// Cells without a tile (map edge, tiles with no rule) get the most common floor underfoot: the fill under the walls around
// rooms (dark stone in vaults and the Brotherhood) does not count.
const openFloors = new Map<string, number>();
for (let cell = 0; cell < ground.length; cell++) if (ground[cell] && !loc.floors[1]?.[cell]) count(openFloors, ground[cell]!);
const common = [...openFloors].sort((a, b) => b[1] - a[1])[0]?.[0]?.replace(/^tex:/, '');
if (common) for (let cell = 0; cell < ground.length; cell++) ground[cell] ??= `tex:${common}`;

// Walls: a wall cell's texture comes from the nearest original wall (no farther than two cells); only the level's "plain"
// walls (letters # and R) are replaced, special ones (blast door, the level's own letters) stay.
const legend = { '#': 'metal', R: 'rock', ...def.walls } as Record<string, TextureName>;
const plain = new Set([legend['#'], legend.R].map((t) => `tex:${t}`));
const edge = `tex:${legend.R}`;
const walls: { x: number; y: number; texture: TextureName }[] = [];
for (const o of map.objects[elevation] ?? []) {
  if (idType(o.pid) !== 3 || o.tile < 0) continue;
  const texture = ruleOf(wallRules, wallNames[o.fid & 0xfff] ?? '');
  if (texture) walls.push({ ...hexCenter(frame, o.tile), texture });
}
const wallStats = new Map<string, number>();
const mainWall = (() => {
  const m = new Map<string, number>();
  for (const w of walls) count(m, w.texture);
  return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] as TextureName | undefined;
})();
for (let cell = 0; cell < width * height; cell++) {
  const x = (cell % width) + 0.5;
  const y = Math.floor(cell / width) + 0.5;
  let near: TextureName | undefined;
  let bestDist = 2;
  for (const w of walls) {
    const d = Math.hypot(w.x - x, w.y - y);
    if (d < bestDist) {
      near = w.texture;
      bestDist = d;
    }
  }
  for (let f = 1; f < loc.floors.length; f++) {
    const block = loc.floors[f]![cell];
    if (!block || !plain.has(block) || blockInfo(block)?.kind !== 'wall') continue;
    // Far from original walls, the location's main wall; only the map edge under the open sky (rock R) stays as it was,
    // so the town is not fenced in with the main wall.
    const best = near ?? (def.outdoor && block === edge ? undefined : mainWall);
    if (!best) continue;
    loc.floors[f]![cell] = `tex:${best}`;
    if (f === 1) count(wallStats, best);
  }
}
if (ceiling) loc.ceiling = ceiling;

const file = writeLocation(outDir, def.id, name, encodeLocation(loc));
// Underfoot means only cells without a wall (the fill around rooms does not count).
const openStats = new Map<string, number>();
for (let cell = 0; cell < ground.length; cell++) if (!loc.floors[1]?.[cell]) count(openStats, ground[cell]!.replace(/^tex:/, ''));
console.error(`Floor: ${[...floorStats].map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.error(`Underfoot: ${[...openStats].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.error(`Walls: ${[...wallStats].map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.error(`Wrote: ${file}`);
