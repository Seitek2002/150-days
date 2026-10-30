// Scripts of the original maps, scripted and locked doors, boxes and lockers (with contents), critters' items and furniture
// without scripts (only the kind we place as a block or as floor markings — src/game/blocks.ts)
// → src/world/map-scripts.ts (only script names, prototype and hex numbers, the "locked" flag, numbers).
// Run: node tools/map-scripts.ts — takes all original maps our levels are made from (the `original` field).
// From this table the game turns on the map's own script and binds door scripts to our doors: an original door
// is converted to a level cell by the level's hex frame (`hexFrame`) and the nearest door of ours is found.
// Added a level from a new map — run again.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createProtoTypes, parseMap, SCRIPT_TYPE } from '../src/formats/map.ts';
import { ITEM_TYPE, OBJ_TYPE, SCENERY_TYPE, idType, parseProto } from '../src/formats/pro.ts';
import type { MapObject } from '../src/formats/map.ts';
import { parseLst } from '../src/formats/text.ts';
import { LEVELS } from '../src/world/levels/index.ts';
import { blockShapeOf, decorOf, floorMarkOf, wallDecorOf, wallSignOf } from '../src/game/blocks.ts';

const require = createRequire(import.meta.url);
const { openGame } = require('../electron/gamefiles.cjs');

const config = JSON.parse(fs.readFileSync('.local/config.json', 'utf8'));
const game = openGame(config.gameDir);
const B = String.fromCharCode(92);
const read = (name: string): Uint8Array | null => game.read(name);
const types = createProtoTypes(read);
const names = parseLst(read(`SCRIPTS${B}SCRIPTS.LST`)!).map((line: string) => line.split('.')[0]!.trim().toUpperCase());
const sceneryList = parseLst(read(`PROTO${B}SCENERY${B}SCENERY.LST`)!);
const sceneryArt = parseLst(read(`ART${B}SCENERY${B}SCENERY.LST`)!);
const wallArt = parseLst(read(`ART${B}WALLS${B}WALLS.LST`)!);

/** Whether this is furniture (scenery we place as a block): by the name of its picture. */
function isFurniture(pid: number): boolean {
  const file = sceneryList[(pid & 0xffffff) - 1];
  const bytes = file ? read(`PROTO${B}SCENERY${B}${file}`) : null;
  const proto = bytes ? parseProto(bytes) : null;
  if (proto?.kind !== 'scenery' || proto.type !== SCENERY_TYPE.generic) return false;
  const art = sceneryArt[proto.fid & 0xfff] ?? '';
  // The Glow elevator door (velev07) becomes a block only with a script: without one it is part of our elevators, drawn by the level.
  if (/^velev07/i.test(art)) return false;
  return blockShapeOf(art) !== null || floorMarkOf(art) !== null || decorOf(art) !== null;
}

/** Whether this is a wall sign (src/game/blocks.ts — wallSignOf): by the picture name. */
function isWallSign(pid: number): boolean {
  const file = sceneryList[(pid & 0xffffff) - 1];
  const bytes = file ? read(`PROTO${B}SCENERY${B}${file}`) : null;
  const proto = bytes ? parseProto(bytes) : null;
  return proto?.kind === 'scenery' && wallSignOf(sceneryArt[proto.fid & 0xfff] ?? '');
}

/** The "locked" flag in a door's map data (as in the original). */
const DOOR_LOCKED = 0x02000000;

/** Whether this is a door: a static object of the "door" kind. */
function isDoor(pid: number): boolean {
  if (idType(pid) !== OBJ_TYPE.scenery) return false;
  const file = sceneryList[(pid & 0xffffff) - 1];
  const bytes = file ? read(`PROTO${B}SCENERY${B}${file}`) : null;
  const proto = bytes ? parseProto(bytes) : null;
  return proto?.kind === 'scenery' && proto.type === SCENERY_TYPE.door;
}

const maps = [...new Set(Object.values(LEVELS).map((def) => (def.original ?? '').toUpperCase()))].filter((m) => m && read(`MAPS${B}${m}.MAP`)).sort();
/** An object's contents: [pid, how many] — as in the map converter (for ammo — how many rounds). */
const contents = (o: MapObject) => `[${o.inventory.map((inner) => `[${inner.object.pid >>> 0}, ${inner.object.ammoQuantity ?? inner.quantity}]`).join(', ')}]`;
const scriptName = (o: MapObject) => (o.scriptId !== -1 && o.scriptIndex >= 0 ? (names[o.scriptIndex] ?? '') : '');

const lines: string[] = [];
for (const name of maps) {
  const map = parseMap(read(`MAPS${B}${name}.MAP`)!, types);
  const script = map.header.scriptIndex > 0 ? names[map.header.scriptIndex - 1] : undefined;
  const doors: string[] = [];
  const containers: string[] = [];
  const critters: string[] = [];
  const scenery: string[] = [];
  const furniture: string[] = [];
  const wallDecor: string[] = [];
  const signs: string[] = [];
  // Spatial scripts (fire when the hero comes near a cell): floor, cell, radius in hexes, name.
  const spatial: string[] = [];
  for (const sc of map.scripts) {
    if (((sc.id >>> 24) & 0xff) !== SCRIPT_TYPE.spatial) continue;
    const built = sc.builtTile ?? 0;
    const spatialName = names[sc.scriptIndex] ?? '';
    if (spatialName) spatial.push(`[${(built >>> 29) & 7}, ${built & 0x3ffffff}, ${sc.radius ?? 0}, '${spatialName}']`);
  }
  map.objects.forEach((list, elevation) => {
    for (const o of list) {
      const type = idType(o.pid);
      if (type === OBJ_TYPE.item && types.itemType(o.pid) === ITEM_TYPE.container) {
        const locked = ((o.dataFlags ?? 0) & DOOR_LOCKED) !== 0;
        containers.push(`[${elevation}, ${o.tile}, ${o.pid >>> 0}, '${scriptName(o)}', ${locked ? 1 : 0}, ${contents(o)}]`);
        continue;
      }
      if (type === OBJ_TYPE.critter) {
        if (o.inventory.length > 0) critters.push(`[${elevation}, ${o.tile}, ${o.pid >>> 0}, '${scriptName(o)}', ${contents(o)}]`);
        continue;
      }
      if (!isDoor(o.pid)) {
        // Scripted scenery (a wall that can be blown up, a computer, a force field): floor, cell, PID, script.
        if (type === OBJ_TYPE.scenery && scriptName(o)) scenery.push(`[${elevation}, ${o.tile}, ${o.pid >>> 0}, '${scriptName(o)}']`);
        // Furniture without a script: floor, cell, PID.
        else if (type === OBJ_TYPE.scenery && isFurniture(o.pid)) furniture.push(`[${elevation}, ${o.tile}, ${o.pid >>> 0}]`);
        // Wall signs: floor, cell, PID.
        else if (type === OBJ_TYPE.scenery && isWallSign(o.pid)) signs.push(`[${elevation}, ${o.tile}, ${o.pid >>> 0}]`);
        // Pipes on walls (wall pieces in the original): floor, cell, pipe kind (our word).
        else if (type === OBJ_TYPE.wall && o.tile >= 0) {
          const kind = wallDecorOf(wallArt[o.fid & 0xfff] ?? '');
          if (kind) wallDecor.push(`[${elevation}, ${o.tile}, '${kind}']`);
        }
        continue;
      }
      const script = scriptName(o);
      const locked = ((o.openFlags ?? 0) & DOOR_LOCKED) !== 0;
      // Only scripted or locked doors are needed.
      if (!script && !locked) continue;
      doors.push(`[${elevation}, ${o.tile}, '${script}', ${locked ? 1 : 0}]`);
    }
  });
  lines.push(`  ${name}: {`);
  if (script) lines.push(`    script: '${script}',`);
  lines.push(`    doors: [${doors.join(', ')}],`);
  lines.push(`    containers: [${containers.join(', ')}],`);
  lines.push(`    critters: [${critters.join(', ')}],`);
  lines.push(`    scenery: [${scenery.join(', ')}],`);
  lines.push(`    furniture: [${furniture.join(', ')}],`);
  if (wallDecor.length) lines.push(`    wallDecor: [${wallDecor.join(', ')}],`);
  if (signs.length) lines.push(`    signs: [${signs.join(', ')}],`);
  if (spatial.length) lines.push(`    spatial: [${spatial.join(', ')}],`);
  lines.push('  },');
}
game.close();

const out = `// Generated by tools/map-scripts.ts — do not edit by hand, run it again. Scripts of the original maps and their doors:
// the map script name; scripted and locked doors — [floor, hex, script name ('' — none), locked (1/0)];
// boxes and lockers — [floor, hex, PID, script, locked, contents [PID, how many]]; critters' items —
// [floor, hex, critter PID, script, items]; scripted scenery — [floor, hex, PID, script];
// furniture without a script (blocks in our game) — [floor, hex, PID]; pipes on walls — [floor, hex, kind];
// wall signs — [floor, hex, PID];
// spatial scripts — [floor, hex, radius, script].
// No texts or pictures of the original are here.

export interface MapScripts {
  /** The map's own script (from its header). */
  script?: string;
  /** Scripted and locked doors: floor, hex, script name ('' — none), whether locked (1/0). */
  doors: [number, number, string, number][];
  /** Boxes and lockers: floor, hex, PID, script ('' — none), whether locked (1/0), contents [PID, how many]. */
  containers: [number, number, number, string, number, [number, number][]][];
  /** Critters' items (for those who have any): floor, hex, critter PID, script, items [PID, how many]. */
  critters: [number, number, number, string, [number, number][]][];
  /** Scripted scenery (not doors): floor, hex, PID, script. */
  scenery: [number, number, number, string][];
  /** Furniture without a script that we place as a block (lockers, tables, beds): floor, hex, PID. */
  furniture: [number, number, number][];
  /** Pipes on walls and fences (wall pieces in the original): floor, hex, kind (WallDecorKind in src/game/blocks.ts). */
  wallDecor?: [number, number, 'pipe' | 'riser' | 'valve' | 'machine' | 'fence'][];
  /** Wall signs without a script (src/game/signs.ts): floor, hex, PID. */
  signs?: [number, number, number][];
  /** Spatial scripts (spatial_p_proc — the hero came near a cell): floor, hex, radius in hexes, script. */
  spatial?: [number, number, number, string][];
}

export const MAP_SCRIPTS: Record<string, MapScripts> = {
${lines.join('\n')}
};
`;
fs.writeFileSync('src/world/map-scripts.ts', out);
console.log(`Wrote src/world/map-scripts.ts: ${maps.length} maps`);
