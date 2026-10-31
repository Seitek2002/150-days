/**
 * Fallout map → level file: a draft `LevelDef` source from an original map in the player's copy.
 * Run (one map floor at a time; the result goes to standard output, so redirect it to a file):
 *   node tools/map-to-level.ts VAULTBUR 1 --id vault15-2 --title "<ru title>|Vault 15, middle level" \
 *        --music 13CARVRN --config my-fixes.ts > pieces.ts
 *   node tools/map-to-level.ts SHADYW 0 --id shady-sands-w --outdoor --wall-texture dirt --config file.ts --header > shady.ts
 *   node tools/map-to-level.ts JUNKENT 0 --draft            — only the grid draft (to work out the fixes)
 * Flags: --id, --const (constant name, derived from id by default), --title "ru|en" (Russian title, a bar, the English title),
 *   --music, --floor, --ceiling, --fade, --outdoor,
 *   --wall-texture (texture of the letter "#": dirt, rock…), --people npc|critter (peaceful or hostile by default),
 *   --hostile SCRIPT,SCRIPT,0xPID (who is hostile with --people npc), --link N (how close wall pieces must be to merge),
 *   --blockers 0x02000043,… (PIDs of invisible "blocker" scenery to treat as walls: the original fences the town with them),
 *   --hull [--hull-pid 0x02000158] (the play area boundary is the convex hull of cells with this PID and of exit marks, rock outside:
 *   for maps where the original fences the screen diamond with invisible cells; default PID is the "auto-invisible cell"), --header
 *   (file header: imports), --config (a module with fixes, see below), --draft (print only the grid).
 * What it does: map walls → "#" cells (our cell is a 2×2 square of hexes, cell numbers are the same as in the list
 * docs/data/map-<NAME>.md from tools/map-view.ts); a flood fill from items, critters, decor and entrances tells floor from rock; openings
 * that "collapsed" (the original's walls are double) are cut by the shortest path; NPCs become `npc`/`critter` with the original's
 * scripts (names from SCRIPTS.LST) and `weapon` from their inventory (firearms beat melee; among firearms, the one
 * with the larger animation code; brass knuckles only if there is nothing else), items and locker contents become items on the floor, doors `door`, map exits
 * letters in the grid: `X` to the world map, `Y`, `Z`, `W`, `U`, `T`… to other maps (in order; which is which goes to stderr; `V` and `L` are not used: they are walls in the grid);
 * elevators, stairs and scripted scenery become hints in stderr. Cells where the original floor is an "empty tile" (past the map edge) are rock;
 * exit marks that cannot be reached from the first entrance (they stand behind a fence) are joined to the floor: a cell or two of fence is cut (in stderr).
 * The --config module: `export default { entries (draft cell `cell` or original tile number `tile`), fills, patches, transform, wallLetter, marks, extraObjects, doc, comment, … }`,
 * its coordinates are draft cells (`--draft` shows them); the fields are `LevelConfig` below.
 * Level files keep only the grid, numbers (PIDs as names from `src/world/pids.ts`, unknown ones as numbers) and script names;
 * no names, texts or pictures of the original end up in the result.
 *
 * What to check by hand afterwards:
 *  1. `npx vitest run tests/world.test.ts` (edges closed, all objects reachable) and a look in the game (`__game.travel`).
 *  2. Leaks: if a large "." area remains outside the walls, the fill "escaped" outside — fill it with rock via `fills`/`transform`.
 *  3. Entrances (`entries`), elevators, stairs and exits — by hand (hints in stderr); an exit must stand on floor, an elevator next to an entrance.
 *  4. Cut passages (their count is in stderr) and "thrown out" NPCs (no floor near them) — fix if needed.
 *  5. People's hostility: the "script — PID" table in stderr; use it to decide who is `critter` and who is `npc` (`--hostile`).
 *  6. NPC weapons: the "who is armed with what" list is in stderr; if something else is needed, fix `weapon` by hand.
 *  7. Unknown PIDs (in stderr) — add them to `src/world/pids.ts` from `docs/data` and run again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createProtoTypes, hexToPlan, parseMap, type MapObject } from '../src/formats/map.ts';
import { ITEM_TYPE, OBJ_TYPE, SCENERY_TYPE, idIndex, idType, parseProto } from '../src/formats/pro.ts';
import { parseLst, parseMsg } from '../src/formats/text.ts';
import { PID } from '../src/world/pids.ts';
import { ruleOf, rulesFor } from './levels/floor-rules.ts';

type Facing = 'north' | 'south' | 'east' | 'west';

/** Fixes that cannot be guessed from the map: entrances, pieces to cut off, and extra objects. */
export interface LevelConfig {
  id?: string;
  constName?: string;
  title?: { ru: string; en: string };
  /** One-line description for the comment above the constant. */
  doc?: string;
  /** Comment lines inside the level. */
  comment?: string[];
  music?: string;
  floor?: string;
  /** The level's door texture. */
  doorTexture?: string;
  /** Door texture replacement by the original's picture: { grayDoor: 'chromeDoor' } — chrome where a gray door would be. */
  doorLooks?: Record<string, string>;
  /** Ruined location: computers are broken (LevelDef.ruined). */
  ruined?: boolean;
  /** Cave-ins: original rocks inside our wall go to the nearest floor (LevelDef.rubble). */
  rubble?: boolean;
  /** Layout revision number (LevelDef.revision): saves from an old layout forget this location's state. */
  revision?: number;
  /** Floor from the original's tiles (rules in tools/levels/floor-rules.ts): cells whose texture differs from the level floor (LevelDef.paint). */
  paint?: boolean;
  /** Roofs from the original's roof layer (LevelDef.roof — a second floor of full blocks over a house): true for the adobeRoof texture, or a texture name. */
  roofs?: boolean | string;
  /** Original roof tiles with these names are not roofs (tents of the Khans' camp — yrf*: otherwise a tent is two floors high). */
  roofSkip?: RegExp;
  /**
   * A roof texture of its own by the house walls: wall letter → roof texture (a roof cell takes the letter of the nearest wall). Warehouses
   * of the Hub's old town have a black flat roof over ribbed siding, houses a concrete one over panels.
   */
  roofByWall?: Record<string, string>;
  /** Texture of the roof floor above a wall (outside, the top of the facade) by roof letter: "#" is the main one, others come from roofByWall. */
  roofEdges?: Record<string, string>;
  /**
   * The original's roof over the street (floor reachable from entrances without doors): kept by default (awnings); false cuts off
   * its edge that sticks out over the roofless street. In the Hub the original's roof layer is shifted and overlaps the street cell in front of
   * the facade — the roof hung over the sidewalk.
   */
  streetRoofs?: boolean;
  /** Roof over the whole floor (the upper floor of a house is a closed room: the original has no roof layer for it). */
  roofAll?: boolean;
  /**
   * Chain-link fence: wall pieces with this picture are not a wall but a level fence (LevelDef.fences) with its own texture and height:
   * you can see through it (Adytum behind the mesh). A diagonal step gets an extra cell so there is no gap in the corner.
   */
  chainFences?: { art: RegExp; texture: string; height: number };
  /** The original's invisible walls under furniture in the middle of a room (only block.frm, reachable floor around) are not walls. */
  furnitureBlocks?: boolean;
  /** Floor that cannot be reached from any entrance becomes rock (the void around basements). */
  seal?: boolean;
  /** The original's invisible wall pieces (block.frm) are not walls (around tanks and furniture in closed rooms). */
  dropInvisibleWalls?: boolean;
  /** Cells on both sides of a door are floor seeds: the room behind a door is floor even if it holds only furniture. */
  doorSeeds?: boolean;
  /** A location made of separate parts, each with its own entrance (LevelDef.separateParts): no passages are cut between them. */
  separateParts?: boolean;
  /**
   * Partitions inside houses: a wall of letter from whose neighbouring floor is all under a roof (it does not face the street
   * from the house) becomes letter to. The Hub's outer walls are dark panels, partitions are light plaster, as in
   * the original inside houses (our walls have one texture on all sides).
   */
  insideWall?: { from: string; to: string };
  /** Open doorways without a door (a missing hex in a wall line) — the houses of Shady Sands. */
  doorways?: boolean;
  /**
   * Seal houses (client, 2026-10-31: in the Hub you could walk into houses through holes, not only through doors): a floor cell in a
   * house's wall line at the edge of the original's roof, through which the street leads under the roof past the doors, becomes a wall. The
   * holes come from our coarser cell (a wall that only grazes a cell leaves it empty) and from passages cut to objects stuck in double walls.
   * A cell is sealed only if it sits between two walls along the wall line, and only if nothing reachable before (through doors) is cut off.
   */
  sealHouses?: boolean;
  /** Fence posts: wall pieces with this picture are a cell slightly taller than the wall with its own texture (LevelDef.towers). */
  posts?: { art: RegExp; texture: string; height: number };
  /** Round windows: cells with wall pieces of this picture are not a wall but a post with a round window (texture is a wall with a hole). */
  windows?: { art: RegExp; texture: string };
  /** Tall buildings: rectangles of level cells (after cropping), texture and height in floors (see LevelDef.towers). */
  towers?: { x0: number; y0: number; x1: number; y1: number; height: number; texture: string }[];
  /** Round towers and pictures on walls (see LevelDef.rounds, LevelDef.panels). */
  rounds?: { x: number; y: number; radius: number; height: number; texture: string }[];
  panels?: { face: string; at: number; a0: number; a1: number; from: number; to: number; picture: string }[];
  /** Haze around tall buildings (see LevelDef.haze). */
  haze?: { from: number; to: number; max?: number };
  ceiling?: string;
  fade?: number;
  outdoor?: boolean;
  /** Texture of the letter "#" (metal by default). */
  wallTexture?: string;
  /** Custom walls: letter → texture. */
  walls?: Record<string, string>;
  /** Which draft letters to keep in the grid (exit marks): "XY". */
  keep?: string;
  /** Marks: letter → object source, for example `X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'shadySands' } }"`. */
  marks?: Record<string, string>;
  /** Draft rectangles: [x1, y1, x2, y2, letter] — a fill (for example, rock outside the town). */
  fills?: [number, number, number, number, string][];
  /** Single draft cells: [x, y, letter]. */
  patches?: [number, number, string][];
  /** Arbitrary draft edit (rows are letter arrays, draft coordinates). */
  transform?: (rows: string[][]) => void;
  /** Wall letter in draft cell (x, y): for example rock "R" for a cave and "#" for rooms. */
  wallLetter?: (x: number, y: number) => string;
  /** Wall letter by the picture of the wall piece in the cell (first match; otherwise "#"): [[/^(ybk|ylf)/i, 'T']] — tents. */
  wallArts?: [RegExp, string][];
  /** Entrances: draft cell and where the hero faces. The first entrance is the main one: reachability is counted from it. */
  entries?: Record<string, { cell?: [number, number]; tile?: number; facing: Facing }>;
  /** Extra objects (elevators, ropes…): they get the level frame offset relative to the draft and return source. */
  extraObjects?: ((offset: { ox: number; oy: number }) => string)[];
  /** Elevators at entrance points (by entrance name): the elevator goes in the entrance cell (already moved onto floor); floors is the name of the floor list at the top of the levels file. */
  elevators?: Record<string, { floors: string; current: number }>;
  /** Doors with a teleport script (in the original the door moves the hero to another floor): script (upper case) → destination; an "on E" exit is placed in the door cell instead of the door. */
  doorExits?: Record<string, { map: string; entry: string }>;
  /** Original entrances: entrance number (load_map parameter) → level entrance name. */
  entrances?: Record<number, string>;
  /** Draft cells that must be reachable (for example "on E" stairs in a wall): a passage is cut to them, as to objects. */
  reach?: [number, number][];
  /** Instead of automatic passages, cut nothing. */
  carve?: boolean;
  /** Level frame in draft cells [x1, y1, x2, y2]; by default everything that is not rock. */
  crop?: [number, number, number, number];
  hostile?: string[];
  people?: 'npc' | 'critter';
  link?: number;
  /** PIDs of scenery the original places as invisible walls (fencing the town): treat them as walls. */
  blockers?: number[];
  /** Play area boundary along the convex hull of cells with this PID (true for the "auto-invisible cell") and of exit marks; rock outside. Same as --hull. */
  hull?: boolean | number;
  /** Extra floor fill "seeds" — draft cells in open space with no objects (the field around a building that the fill would otherwise not reach). */
  seeds?: [number, number][];
  /** Scripts whose owners get no weapon in hand (for example children: their weapon stays in the inventory). */
  noWeapon?: string[];
  /** PIDs of "items" that are really furniture (shelves, tables, scripted boxes): do not put them on the floor. */
  skipItems?: number[];
}

/** The original's map numbers in order (exits between maps use the number) — only MAPS\*.MAP file names. */
const MAP_NAMES = 'DESERT1 DESERT2 DESERT3 HALLDED HOTEL WATRSHD VAULT13 VAULTENT VAULTBUR VAULTNEC JUNKENT JUNKCSNO JUNKKILL BROHDENT BROHD12 BROHD34 CAVES CHILDRN1 CHILDRN2 CITY1 COAST1 COAST2 COLATRUK FSAUSER RAIDERS SHADYE SHADYW GLOWENT LAADYTUM LAFOLLWR MBENT MBSTRG12 MBVATS12 MSTRLR12 MSTRLR34 V13ENT HUBENT DETHCLAW HUBDWNTN HUBHEIGT HUBOLDTN HUBWATER GLOW1 GLOW2 LABLADES LARIPPER LAGUNRUN CHILDEAD MBDEAD MOUNTN1 MOUNTN2 FOOT TARDIS TALKCOW USEDCAR BRODEAD DESCRVN1 DESCRVN2 MNTCRVN1 MNTCRVN2 VIPERS DESCRVN3 MNTCRVN3 DESCRVN4 MNTCRVN4 HUBMIS1'.split(' ');
/** Letters of exits to other maps. */
const EXIT_LETTERS = 'YZWUTQPNMKJHGFE';
/** All exit marks in the grid: X is the world map, the rest are other maps. */
const EXIT_MARKS = 'X' + EXIT_LETTERS;

// ---------- run and flag parsing ----------

const root = fileURLToPath(new URL('../', import.meta.url));
const B = String.fromCharCode(92);
const args = process.argv.slice(2);
const FLAGS_WITH_VALUE = new Set(['--blockers', '--id', '--const', '--title', '--music', '--floor', '--ceiling', '--fade', '--wall-texture', '--people', '--hostile', '--link', '--config', '--hull-pid']);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !FLAGS_WITH_VALUE.has(args[i - 1] ?? ''));
const [mapArg, elevationArg] = positional;
if (!mapArg) {
  console.error('Specify a map and floor: node tools/map-to-level.ts VAULTBUR 1 --id vault15-2 [...] (details at the top of the file)');
  process.exit(1);
}
const mapName = mapArg.toUpperCase().replace(/\.MAP$/, '');
const elevation = Number(elevationArg ?? 0);
const cell = 2;

const cfg: LevelConfig = flag('--config') ? ((await import(pathToFileURL(path.resolve(flag('--config')!)).href)) as { default: LevelConfig }).default : {};
const link = Number(flag('--link') ?? cfg.link ?? 1.6);
const id = flag('--id') ?? cfg.id ?? mapName.toLowerCase() + '-' + elevation;
const constName = flag('--const') ?? cfg.constName ?? id.replace(/[^a-z0-9]+/gi, '_').toUpperCase();
const [titleRu, titleEn] = (flag('--title') ?? '').split('|');
const title = titleRu ? { ru: titleRu, en: titleEn ?? titleRu } : (cfg.title ?? { ru: id, en: id });
const outdoor = args.includes('--outdoor') || (cfg.outdoor ?? false);
const wallTexture = flag('--wall-texture') ?? cfg.wallTexture;
const people = (flag('--people') ?? cfg.people ?? 'npc') as 'npc' | 'critter';
const blockers = new Set((flag('--blockers')?.split(',').map((v) => Number(v.trim())) ?? cfg.blockers ?? []).map((v) => v >>> 0));
const noWeapon = new Set((cfg.noWeapon ?? []).map((v) => v.toUpperCase()));
const skipItems = new Set((cfg.skipItems ?? []).map((v) => v >>> 0));
const hostile = new Set((flag('--hostile')?.split(',') ?? cfg.hostile ?? []).map((s) => s.trim().toUpperCase()));
/** Whether an NPC is named in the --hostile list: by script or by PID (0x… or a number). */
const listed = (script: string | undefined, pid: number): boolean => hostile.has((script ?? '').toUpperCase()) || hostile.has('0X' + (pid >>> 0).toString(16).toUpperCase()) || hostile.has(String(pid >>> 0));

let gameDir = '';
try {
  gameDir = JSON.parse(fs.readFileSync(path.join(root, '.local', 'config.json'), 'utf8')).gameDir ?? '';
} catch {
  gameDir = '';
}
const require = createRequire(import.meta.url);
const { openGame, checkGameFolder } = require('../electron/gamefiles.cjs');
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
const objects = (map.objects[elevation] ?? []).filter((o) => o.tile >= 0);
if (objects.length === 0) {
  console.error(`Map ${mapName} has no objects on floor ${elevation}`);
  process.exit(1);
}
/** Weapon animation code from the prototype (1 knife … 7 rifle, 0 brass knuckles, no "armed" picture); null means not a weapon. */
const itemList = parseLst(read(`PROTO${B}ITEMS${B}ITEMS.LST`)!);
const weaponAnimation = (pid: number): number | null => {
  if (idType(pid) !== OBJ_TYPE.item || types.itemType(pid) !== ITEM_TYPE.weapon) return null;
  const file = itemList[idIndex(pid) - 1];
  const proto = file ? parseProto(read(`PROTO${B}ITEMS${B}${file}`)!) : null;
  return (proto && 'weapon' in proto ? proto.weapon?.animationCode : undefined) ?? 0;
};
/** What a critter holds: of the weapons in its inventory, a firearm (animation code at least FIREARM_FROM), the one with the larger code; otherwise melee, also the larger code; brass knuckles (code 0) last. */
const FIREARM_FROM = 5;
const pickWeapon = (carried: number[]): number | undefined => {
  const rank = (code: number) => (code === 0 ? 0 : code >= FIREARM_FROM ? 1000 + code : code);
  let best: number | undefined;
  let bestRank = -1;
  for (const pid of carried) {
    const code = weaponAnimation(pid);
    if (code === null) continue;
    if (rank(code) > bestRank) {
      best = pid;
      bestRank = rank(code);
    }
  }
  return best;
};
const scriptNames = parseLst(read(`SCRIPTS${B}SCRIPTS.LST`)!).map((l: string) => l.split('.')[0]!.trim().toUpperCase());

/**
 * The original's door picture (file name in ART\SCENERY) → our door texture. No match means the level's door texture
 * (doorTexture, otherwise sliding). Doors of the Cathedral, the Master's lair and the Brotherhood are their own (their levels have their own doorTexture).
 */
const DOOR_LOOKS: [RegExp, string][] = [
  [/^necdoor[123]/i, 'panelDoor'],
  [/^(wdoor|necdoor|door1\.)/i, 'woodDoor'],
  [/^curtain/i, 'curtain'],
  [/^gate/i, 'woodGate'],
  [/^doorbar/i, 'barsDoor'],
  [/^(vdoor|v13door|v13secur|wareh|flcdoor)/i, 'grayDoor'],
  [/^brndor/i, 'brownDoor'],
  [/^velev/i, 'elevator'],
];
const ownDoors = /^(CHILDRN|MSTRLR|BROHD)/.test(mapName);
const sceneryArt = parseLst(read(`ART${B}SCENERY${B}SCENERY.LST`)!);
const doorLook = (fid: number): string | undefined => {
  if (ownDoors) return undefined;
  const look = DOOR_LOOKS.find(([re]) => re.test(sceneryArt[fid & 0xfff] ?? ''))?.[1];
  // The level config can replace the door texture (Vault 13's gray doors are chrome).
  return look && cfg.doorLooks?.[look] ? cfg.doorLooks[look] : look;
};
const scriptOf = (o: MapObject): string | undefined => (o.scriptIndex > 0 && o.scriptId !== -1 ? scriptNames[o.scriptIndex] : undefined);

// ---------- frame: the same as in tools/map-view.ts (by the floor's objects, margin 3), so cell numbers match the docs/data list ----------

const points = objects.map((o) => hexToPlan(o.tile));
if (map.header.enteringElevation === elevation && map.header.enteringTile >= 0) points.push(hexToPlan(map.header.enteringTile));
const margin = 3;
const x0 = Math.floor(Math.min(...points.map((p) => p.x))) - margin;
const y0 = Math.floor(Math.min(...points.map((p) => p.y))) - margin;
const x1 = Math.ceil(Math.max(...points.map((p) => p.x))) + margin;
const y1 = Math.ceil(Math.max(...points.map((p) => p.y))) + margin;
const width = Math.ceil((x1 - x0) / cell);
const height = Math.ceil((y1 - y0) / cell);
const cellOf = (p: { x: number; y: number }): [number, number] => [Math.floor((p.x - x0) / cell), Math.floor((p.y - y0) / cell)];
const inside = (gx: number, gy: number) => gx >= 0 && gy >= 0 && gx < width && gy < height;

// ---------- draft: walls, floor fill ----------

const wall = new Uint8Array(width * height);
const marks = new Map<number, string>();
// Fences (fen…) are not walls: the game places them as waist-high blocks you can see through (src/game/blocks.ts, wallDecor).
const wallArtNames = parseLst(read(`ART${B}WALLS${B}WALLS.LST`)!);
// A chain-link fence (chainFences) is not a wall either: it goes into the level's fence mask (LevelDef.fences), you can see through the mesh.
const isChain = (o: MapObject) => !!cfg.chainFences && idType(o.pid) === OBJ_TYPE.wall && cfg.chainFences.art.test(wallArtNames[o.fid & 0xfff] ?? '');
const isFence = (o: MapObject) => (idType(o.pid) === OBJ_TYPE.wall && /^fen\d/i.test(wallArtNames[o.fid & 0xfff] ?? '')) || isChain(o);
// The original's invisible walls (wall piece block.frm) around tanks and furniture (dropInvisibleWalls) are not walls: in the Glow's
// lab the tanks stand one hex apart, and the whole hall turned into a solid wall. The game places the furniture as blocks.
const invisibleWall = (o: MapObject) => !!cfg.dropInvisibleWalls && idType(o.pid) === OBJ_TYPE.wall && /^block/i.test(wallArtNames[o.fid & 0xfff] ?? '');
const walls = objects.filter((o) => (idType(o.pid) === OBJ_TYPE.wall && !isFence(o) && !invisibleWall(o)) || blockers.has(o.pid >>> 0)).map((o) => hexToPlan(o.tile));
const putWall = (p: { x: number; y: number }) => {
  const [gx, gy] = cellOf(p);
  if (inside(gx, gy)) wall[gy * width + gx] = 1;
};
for (const p of walls) putWall(p);
// Join nearby wall pieces with segments so no gaps remain on diagonals.
const bucket = new Map<string, { x: number; y: number }[]>();
for (const p of walls) {
  const key = `${Math.floor(p.x / 2)},${Math.floor(p.y / 2)}`;
  const list = bucket.get(key) ?? [];
  list.push(p);
  bucket.set(key, list);
}
for (const p of walls) {
  const bx = Math.floor(p.x / 2);
  const by = Math.floor(p.y / 2);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (const q of bucket.get(`${bx + dx},${by + dy}`) ?? []) {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d === 0 || d > link) continue;
        for (let t = 0.25; t < 1; t += 0.25) putWall({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
}

/**
 * Doorways without a door (Shady Sands houses: open doorways in wooden frames): the original's wall line skips
 * one hex, but our cell is two, and the doorway cell also holds a wall piece — it becomes a wall and the doorway disappears.
 * We search by the cell's hexes: if free hexes lead from one edge of the cell to the opposite one, and
 * the neighbouring cells on both sides are floor, the whole cell is opened. Only with the setting (doorways): in slanted walls
 * such a "doorway" would be found at every zigzag.
 */
const doorways: string[] = [];
if (cfg.doorways) {
  // Occupied hexes of each cell: 2×2, bit = (along x) + 2·(along y).
  const occupied = new Map<number, number>();
  for (const o of objects) {
    if (idType(o.pid) !== OBJ_TYPE.wall || isFence(o)) continue;
    const p = hexToPlan(o.tile);
    const [gx, gy] = cellOf(p);
    if (!inside(gx, gy)) continue;
    const qx = (((Math.floor(p.x) - x0) % 2) + 2) % 2;
    const qy = (((p.y - y0) % 2) + 2) % 2;
    const i = gy * width + gx;
    occupied.set(i, (occupied.get(i) ?? 0) | (1 << (qx + 2 * qy)));
  }
  const maskOf = (gx: number, gy: number) => occupied.get(gy * width + gx) ?? 0;
  // --masks x0,y0,x1,y1 — show the occupied hexes of draft cells (doorway debugging): "#" occupied, "." free.
  const masksArg = flag('--masks');
  if (masksArg) {
    const [mx0, my0, mx1, my1] = masksArg.split(',').map(Number) as [number, number, number, number];
    for (let gy = my0; gy <= my1; gy++) {
      for (const half of [0, 1]) {
        let row = half === 0 ? `${String(gy).padStart(3)} ` : '    ';
        for (let gx = mx0; gx <= mx1; gx++) {
          const m = maskOf(gx, gy);
          row += `${m & (1 << (0 + 2 * half)) ? '#' : '.'}${m & (1 << (1 + 2 * half)) ? '#' : '.'}${wall[gy * width + gx] ? '|' : ' '}`;
        }
        console.error(row);
      }
    }
  }
  // Floor, or a cell that became a wall only from joining neighbouring pieces (it has no pieces of its own).
  const open = (gx: number, gy: number) => inside(gx, gy) && (!wall[gy * width + gx] || maskOf(gx, gy) === 0);
  // Free at both the left and the right edge of the cell (along x) means you can pass through it; the same along y.
  const across = (mask: number, axis: 'x' | 'y') => {
    const free = (bit: number) => !(mask & (1 << bit));
    return axis === 'x' ? (free(0) || free(2)) && (free(1) || free(3)) : (free(0) || free(1)) && (free(2) || free(3));
  };
  const partial = (gx: number, gy: number, axis: 'x' | 'y') => {
    const m = maskOf(gx, gy);
    return inside(gx, gy) && !!wall[gy * width + gx] && m !== 0 && m !== 15 && across(m, axis);
  };
  const openCell = (gx: number, gy: number) => {
    if (!inside(gx, gy) || !wall[gy * width + gx]) return;
    wall[gy * width + gx] = 0;
    doorways.push(`${gx},${gy}`);
  };
  for (const [i, mask] of occupied) {
    if (!wall[i] || mask === 15) continue;
    const gx = i % width;
    const gy = Math.floor(i / width);
    // You can pass through the cell, and the neighbours on both sides are floor. A wall two hexes thick (a zigzag along the border of two
    // of our cells, the Shady Sands yard fence) does not open this way: each of its cells is passable, but the opening is only at the gate;
    // such gates are set by cell patches (patches) in the config.
    const alongX = across(mask, 'x') && open(gx - 1, gy) && open(gx + 1, gy);
    const alongY = across(mask, 'y') && open(gx, gy - 1) && open(gx, gy + 1);
    if (!alongX && !alongY) continue;
    openCell(gx, gy);
    // Cells on both sides of the doorway filled only by joining are opened too: the doorway leads through them.
    for (const [dx, dy] of alongX ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]]) {
      const nx = gx + dx!;
      const ny = gy + dy!;
      if (inside(nx, ny) && wall[ny * width + nx] && maskOf(nx, ny) === 0) openCell(nx, ny);
    }
  }
}

/** Exit letter: X to the world map, Y, Z, W… to other maps in order of first appearance. */
const exitMaps: { map: number; elevation: number; tile: number }[] = [];
const exitLetter = (exit: { map: number; elevation: number; tile: number }): string => {
  if (exit.map < 0) return 'X';
  let at = exitMaps.findIndex((g) => g.map === exit.map && g.elevation === exit.elevation && g.tile === exit.tile);
  if (at < 0) at = exitMaps.push({ map: exit.map, elevation: exit.elevation, tile: exit.tile }) - 1;
  return EXIT_LETTERS[at] ?? EXIT_LETTERS[EXIT_LETTERS.length - 1]!;
};

/** The original floor tile is "empty" (grid000.frm, number 1) — a cell past the map edge. */
const floorTiles = map.elevations[elevation]?.floor;
const voidAt = (px: number, py: number): boolean => {
  if (!floorTiles) return false;
  const tx = Math.floor(py / 2);
  const ty = Math.floor(px / 2);
  return tx < 0 || ty < 0 || tx > 99 || ty > 99 || (floorTiles[ty * 100 + tx]! & 0xfff) === 1;
};

/** Object sign in the draft: c critter, i item, + door, S elevator/stairs/rope, d decor (seed only), X/Y/Z… map exit. */
function kindOf(o: MapObject): string | null {
  const type = idType(o.pid);
  if (blockers.has(o.pid >>> 0)) return null;
  if (type === OBJ_TYPE.critter) return 'c';
  if (type === OBJ_TYPE.item) return 'i';
  if (type === OBJ_TYPE.misc && o.exit) return exitLetter(o.exit);
  if (type === OBJ_TYPE.scenery) {
    const kind = types.sceneryType(o.pid);
    if (kind === SCENERY_TYPE.door) return '+';
    if (kind === SCENERY_TYPE.elevator || kind === SCENERY_TYPE.stairs || kind === SCENERY_TYPE.ladderUp || kind === SCENERY_TYPE.ladderDown) return 'S';
    return 'd';
  }
  return null;
}
const seeds: [number, number][] = [...(cfg.seeds ?? [])];
const decorSeeds: [number, number][] = [];
for (const o of objects) {
  const ch = kindOf(o);
  if (!ch) continue;
  const [gx, gy] = cellOf(hexToPlan(o.tile));
  if (!inside(gx, gy)) continue;
  if (ch === 'd') decorSeeds.push([gx, gy]);
  else {
    const isExit = EXIT_MARKS.includes(ch);
    if (!isExit) seeds.push([gx, gy]);
    if (!isExit || !marks.has(gy * width + gx)) marks.set(gy * width + gx, ch);
  }
}
if (map.header.enteringElevation === elevation && map.header.enteringTile >= 0) {
  const [gx, gy] = cellOf(hexToPlan(map.header.enteringTile));
  if (inside(gx, gy)) seeds.push([gx, gy]);
}

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const reach = new Uint8Array(width * height);
{
  const queue: [number, number][] = [];
  for (const [gx, gy] of seeds) {
    if (wall[gy * width + gx] || reach[gy * width + gx]) continue;
    reach[gy * width + gx] = 1;
    queue.push([gx, gy]);
  }
  while (queue.length > 0) {
    const [gx, gy] = queue.pop()!;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (!inside(nx, ny) || reach[ny * width + nx] || wall[ny * width + nx]) continue;
      reach[ny * width + nx] = 1;
      queue.push([nx, ny]);
    }
  }
}
// Doors lead into rooms (doorSeeds): cells on both sides of a door are floor seeds too. Otherwise a room with only
// furniture behind the door (the Glow's lab with tanks, Vault 12's bedrooms), with no NPC or item, stayed rock. Floor from these seeds
// that connects to the frame edge is the void around the building (dungeons sit among dark tiles), so we skip it.
if (cfg.doorSeeds) {
  const outside = new Uint8Array(width * height);
  const edge: [number, number][] = [];
  for (let gx = 0; gx < width; gx++) edge.push([gx, 0], [gx, height - 1]);
  for (let gy = 0; gy < height; gy++) edge.push([0, gy], [width - 1, gy]);
  while (edge.length > 0) {
    const [gx, gy] = edge.pop()!;
    const i = gy * width + gx;
    if (!inside(gx, gy) || outside[i] || wall[i]) continue;
    outside[i] = 1;
    for (const [dx, dy] of NEIGHBOURS) edge.push([gx + dx, gy + dy]);
  }
  const queue: [number, number][] = [];
  for (const [i, ch] of marks) {
    if (ch !== '+') continue;
    const gx = i % width;
    const gy = Math.floor(i / width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]] as const) queue.push([gx + dx, gy + dy]);
  }
  while (queue.length > 0) {
    const [gx, gy] = queue.pop()!;
    const i = gy * width + gx;
    if (!inside(gx, gy) || reach[i] || wall[i] || outside[i]) continue;
    reach[i] = 1;
    for (const [dx, dy] of NEIGHBOURS) queue.push([gx + dx, gy + dy]);
  }
}
// Decor: the seed is used only if its area is closed (does not reach the frame edge): otherwise it is a marker outside the building.
for (const [sx, sy] of decorSeeds) {
  if (wall[sy * width + sx] || reach[sy * width + sx]) continue;
  const seen = new Set<number>([sy * width + sx]);
  const queue: [number, number][] = [[sx, sy]];
  let closed = true;
  while (queue.length > 0 && closed) {
    const [gx, gy] = queue.pop()!;
    if (gx === 0 || gy === 0 || gx === width - 1 || gy === height - 1 || seen.size > 4000) {
      closed = false;
      break;
    }
    for (const [dx, dy] of NEIGHBOURS) {
      const i = (gy + dy) * width + gx + dx;
      if (seen.has(i) || wall[i]) continue;
      seen.add(i);
      queue.push([gx + dx, gy + dy]);
    }
  }
  if (closed) for (const i of seen) reach[i] = 1;
}

/** The draft in letters: # wall, . floor, R rock (unreachable), c i + S object marks, X Y exits. */
const draft: string[][] = [];
for (let gy = 0; gy < height; gy++) {
  const row: string[] = [];
  for (let gx = 0; gx < width; gx++) {
    const i = gy * width + gx;
    const m = marks.get(i);
    const isExit = m !== undefined && EXIT_MARKS.includes(m);
    if (m && !isExit) row.push(m);
    else if (wall[i]) row.push('#');
    else if (reach[i] || isExit) row.push(m ?? '.');
    else row.push('R');
  }
  draft.push(row);
}
// An empty floor tile is rock (exit marks are left alone).
for (let gy = 0; gy < height; gy++) {
  for (let gx = 0; gx < width; gx++) {
    if (!EXIT_MARKS.includes(draft[gy]![gx]!) && voidAt(x0 + cell * gx + cell / 2, y0 + cell * gy + cell / 2)) draft[gy]![gx] = 'R';
  }
}
// Boundary along the convex hull: rock outside.
const hullPid = (flag('--hull-pid') !== undefined ? Number(flag('--hull-pid')) : typeof cfg.hull === 'number' ? cfg.hull : 0x02000158) >>> 0;
if (args.includes('--hull') || cfg.hull) {
  const pts: [number, number][] = [];
  for (const o of objects) {
    if ((o.pid >>> 0) !== hullPid) continue;
    const [gx, gy] = cellOf(hexToPlan(o.tile));
    if (inside(gx, gy)) pts.push([gx, gy]);
  }
  draft.forEach((row, gy) => row.forEach((ch, gx) => { if (EXIT_MARKS.includes(ch)) pts.push([gx, gy]); }));
  if (pts.length < 3) console.error(`  ! --hull: too few cells for a hull (PID 0x${hullPid.toString(16)}) — no boundary drawn`);
  else {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: [number, number][] = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper: [number, number][] = [];
    for (const p of [...pts].reverse()) {
      while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
      upper.push(p);
    }
    const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
    const within = (gx: number, gy: number) =>
      hull.every((a, i) => {
        const b = hull[(i + 1) % hull.length]!;
        return cross(a, b, [gx, gy]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1) >= -0.8;
      });
    draft.forEach((row, gy) => row.forEach((ch, gx) => { if (!EXIT_MARKS.includes(ch) && !within(gx, gy)) row[gx] = 'R'; }));
  }
}
const header = `${mapName} floor ${elevation}: frame x ${x0}…${x1}, y ${y0}…${y1}; cells ${width}×${height}`;
if (args.includes('--draft')) {
  console.log('# ' + header);
  for (const row of draft) console.log(row.join(''));
  game.close();
  process.exit(0);
}

// ---------- config fixes, cropping, edges ----------

for (const [x, y, ch] of cfg.patches ?? []) if (draft[y]?.[x] !== undefined) draft[y]![x] = ch;
for (const [fx1, fy1, fx2, fy2, ch] of cfg.fills ?? []) {
  for (let y = fy1; y <= fy2; y++) for (let x = fx1; x <= fx2; x++) if (draft[y]?.[x] !== undefined) draft[y]![x] = ch;
}
cfg.transform?.(draft);

let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
draft.forEach((row, y) =>
  row.forEach((ch, x) => {
    if (ch === 'R') return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }),
);
if (maxX < 0) {
  console.error('After the fixes no cell is left except rock.');
  process.exit(1);
}
if (cfg.crop) [minX, minY, maxX, maxY] = cfg.crop;
const ox = minX - 1;
const oy = minY - 1;
const w = maxX - minX + 3;
const h = maxY - minY + 3;
const keep = cfg.keep ?? EXIT_MARKS;
// Wall letter by the pictures of wall pieces in the cell (wallArts): tents of the Khans' camp are canvas, the bottom of a house is brick.
const cellArts = new Map<number, string[]>();
if (cfg.wallArts) {
  for (const o of objects) {
    if (idType(o.pid) !== OBJ_TYPE.wall || isFence(o)) continue;
    const art = wallArtNames[o.fid & 0xfff] ?? '';
    // Invisible blockers (block) have no picture of their own — their cell takes the letter from its neighbours (the back of a tent).
    if (/^block/i.test(art)) continue;
    const [gx, gy] = cellOf(hexToPlan(o.tile));
    if (gx < 0 || gy < 0 || gx >= width || gy >= height) continue;
    const list = cellArts.get(gy * width + gx) ?? [];
    list.push(art);
    cellArts.set(gy * width + gx, list);
  }
}
const wallLetter =
  cfg.wallLetter ??
  ((sx: number, sy: number): string => {
    // The cell has no pieces of its own (a wall from joining neighbours) — use the pieces of neighbouring cells.
    let arts = cellArts.get(sy * width + sx) ?? [];
    if (arts.length === 0) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) arts = arts.concat(cellArts.get((sy + dy) * width + sx + dx) ?? []);
    for (const [re, letter] of cfg.wallArts ?? []) if (arts.some((a) => re.test(a))) return letter;
    return '#';
  });
const G: string[][] = [];
for (let y = 0; y < h; y++) {
  const row: string[] = [];
  for (let x = 0; x < w; x++) {
    const sx = x + ox;
    const sy = y + oy;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    let ch = draft[sy]?.[sx] ?? 'R';
    if (ch === '#') ch = edge ? 'R' : wallLetter(sx, sy);
    else if (ch === 'R' || (edge && ch !== 'R')) ch = 'R';
    else if (!keep.includes(ch)) ch = '.';
    row.push(ch);
  }
  G.push(row);
}
// Floor is "." and mark letters (exits); everything else in the grid is wall.
const floorLetters = new Set(['.', ...keep, ...Object.keys(cfg.marks ?? {})]);
const solid = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || !floorLetters.has(G[y]![x]!);

// Doors are always on floor (a door cell is a passage).
const exported = exportObjects();
for (const o of exported) if (o.kind === 'door') {
  const dx = Math.floor(o.gx - ox);
  const dy = Math.floor(o.gy - oy);
  if (G[dy]?.[dx] !== undefined && G[dy]![dx] !== 'R') G[dy]![dx] = '.';
}

// ---------- entrances, reachability, passages ----------

const warnings: string[] = [];
const entryDefs = cfg.entries ?? {};
if (Object.keys(entryDefs).length === 0 && map.header.enteringElevation === elevation && map.header.enteringTile >= 0) {
  const [gx, gy] = cellOf(hexToPlan(map.header.enteringTile));
  entryDefs.start = { cell: [gx, gy], facing: 'south' };
  warnings.push(`no entrances in the config — took the original map's entrance (cell ${gx},${gy}), check the facing`);
}
if (Object.keys(entryDefs).length === 0) {
  console.error('No entrances at all: set `entries` in --config (draft cell and where the hero faces).');
  process.exit(1);
}
const entryCell = (e: { cell?: [number, number]; tile?: number }): [number, number] => e.cell ?? cellOf(hexToPlan(e.tile ?? map.header.enteringTile));
const entries = Object.entries(entryDefs).map(([name, e]) => {
  let [ex, ey] = entryCell(e);
  // An entrance (by original tile or by cell) may land in a wall (our walls are thicker): look for the nearest floor cell (up to three cells).
  if (solid(ex - ox, ey - oy)) {
    let best: [number, number] | null = null;
    for (let r = 1; r <= 3 && !best; r++) {
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || solid(ex - ox + dx, ey - oy + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = [ex + dx, ey + dy];
        }
      }
    }
    if (best) {
      warnings.push(`entrance ${name}${e.tile !== undefined ? ` (tile ${e.tile})` : ''} landed in a wall — moved by ${best[0] - ex},${best[1] - ey}`);
      [ex, ey] = best;
    }
  }
  return { name, x: ex - ox + 0.5, y: ey - oy + 0.5, facing: e.facing };
});
let seen = new Set<number>();
const flood = () => {
  seen = new Set();
  const first = entries[0]!;
  const queue: [number, number][] = [[Math.floor(first.x), Math.floor(first.y)]];
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    if (seen.has(y * w + x) || solid(x, y)) continue;
    seen.add(y * w + x);
    for (const [dx, dy] of NEIGHBOURS) queue.push([x + dx, y + dy]);
  }
};
// Invisible walls under furniture (furnitureBlocks): a wall cell with no visible original wall piece (only
// block.frm), and with neither the void around the location (floor connected to the map edge) nor rock next to it, is a blocker under
// a table or bed in the middle of a room: it becomes floor (the game places the table as a block). Blockers at the edge of a room
// (with the void behind them) stay walls.
if (cfg.furnitureBlocks) {
  const visible = new Set<number>();
  for (const o of objects) {
    if (idType(o.pid) !== OBJ_TYPE.wall || isFence(o) || /^block/i.test(wallArtNames[o.fid & 0xfff] ?? '')) continue;
    const [gx, gy] = cellOf(hexToPlan(o.tile));
    visible.add((gy - oy) * w + (gx - ox));
  }
  const outside = new Set<number>();
  const queue: [number, number][] = [];
  for (let x = 0; x < w; x++) queue.push([x, 1], [x, h - 2]);
  for (let y = 0; y < h; y++) queue.push([1, y], [w - 2, y]);
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    if (outside.has(y * w + x) || solid(x, y)) continue;
    outside.add(y * w + x);
    for (const [dx, dy] of NEIGHBOURS) queue.push([x + dx, y + dy]);
  }
  const reach = { has: (i: number) => !outside.has(i), add: (_i: number) => {} };
  let opened = 0;
  for (let changed = true; changed; ) {
    changed = false;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!solid(x, y) || G[y]![x] === 'R' || visible.has(y * w + x)) continue;
        let bad = false;
        for (let dy = -1; dy <= 1 && !bad; dy++) {
          for (let dx = -1; dx <= 1 && !bad; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            bad = G[ny]?.[nx] === 'R' || (!solid(nx, ny) && !reach.has(ny * w + nx));
          }
        }
        if (bad) continue;
        G[y]![x] = '.';
        reach.add(y * w + x);
        opened++;
        changed = true;
      }
    }
  }
  warnings.push(`blockers under furniture opened: ${opened} cells`);
}
// Floor that cannot be reached from any entrance (seal) becomes rock: the empty dark tile around the original's basements.
if (cfg.seal) {
  const reach = new Set<number>();
  const queue: [number, number][] = entries.map((e) => [Math.floor(e.x), Math.floor(e.y)]);
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    if (reach.has(y * w + x) || solid(x, y)) continue;
    reach.add(y * w + x);
    for (const [dx, dy] of NEIGHBOURS) queue.push([x + dx, y + dy]);
  }
  let sealed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (G[y]![x] !== '.' || reach.has(y * w + x)) continue;
      G[y]![x] = 'R';
      sealed++;
    }
  }
  warnings.push(`unreachable floor turned to rock: ${sealed} cells`);
}
flood();
let carved = 0;
if (cfg.carve !== false) {
  const targets: { x: number; y: number; what: string }[] = [];
  for (const o of exported) if (o.kind !== 'exit' && o.kind !== 'door') targets.push({ x: o.gx - ox, y: o.gy - oy, what: `${o.kind} ${(o.pid >>> 0).toString(16)}` });
  for (const e of entries) targets.push({ x: e.x, y: e.y, what: 'entrance ' + e.name });
  for (const t of targets) {
    let cx = Math.floor(t.x);
    let cy = Math.floor(t.y);
    if (cx < 1 || cy < 1 || cx >= w - 1 || cy >= h - 1) continue;
    if (solid(cx, cy)) {
      let found: [number, number] | null = null;
      for (let r = 1; r <= 2 && !found; r++) for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r && !found; dx++) if (!solid(cx + dx, cy + dy)) found = [cx + dx, cy + dy];
      if (!found) continue;
      [cx, cy] = found;
    }
    if (seen.has(cy * w + cx)) continue;
    // The cheapest path to the reachable part: a floor cell costs 1, a wall 4; every wall along the way becomes floor.
    const dist = new Map<number, number>([[cy * w + cx, 0]]);
    const prev = new Map<number, [number, number]>();
    const heap: [number, number, number][] = [[0, cx, cy]];
    let goal: [number, number] | null = null;
    while (heap.length > 0) {
      heap.sort((a, b) => a[0] - b[0]);
      const [d, x, y] = heap.shift()!;
      if (d > (dist.get(y * w + x) ?? Infinity)) continue;
      if (seen.has(y * w + x)) {
        goal = [x, y];
        break;
      }
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const nd = d + (solid(nx, ny) ? 4 : 1);
        if (nd < (dist.get(ny * w + nx) ?? Infinity)) {
          dist.set(ny * w + nx, nd);
          prev.set(ny * w + nx, [x, y]);
          heap.push([nd, nx, ny]);
        }
      }
    }
    if (!goal) {
      warnings.push('no path to ' + t.what);
      continue;
    }
    const cut: string[] = [];
    for (let at: [number, number] | undefined = goal; at; at = prev.get(at[1] * w + at[0])) {
      if (solid(at[0], at[1])) {
        G[at[1]]![at[0]] = '.';
        cut.push(`${at[0]},${at[1]}`);
        carved++;
      }
    }
    if (cut.length) warnings.push(`cut to ${t.what} (${cx},${cy}): cells ${cut.join(' ')}`);
    flood();
  }
}
// "On E" cells (reach): a neighbouring cell must be reachable; if not, cut the cheapest path to the reachable part (the exit cell itself is left alone).
if (cfg.reach && cfg.carve !== false) {
  for (const [rx, ry] of cfg.reach) {
    const sx = rx - ox;
    const sy = ry - oy;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((sy + dy!) * w + sx + dx!)) || seen.has(sy * w + sx);
    if (near) continue;
    const dist = new Map<number, number>([[sy * w + sx, 0]]);
    const prev = new Map<number, [number, number]>();
    const heap: [number, number, number][] = [[0, sx, sy]];
    let goal: [number, number] | null = null;
    while (heap.length > 0) {
      heap.sort((a, b) => a[0] - b[0]);
      const [d, x, y] = heap.shift()!;
      if (d > (dist.get(y * w + x) ?? Infinity)) continue;
      if (seen.has(y * w + x) && !(x === sx && y === sy)) {
        goal = [x, y];
        break;
      }
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const nd = d + (solid(nx, ny) ? 4 : 1);
        if (nd < (dist.get(ny * w + nx) ?? Infinity)) {
          dist.set(ny * w + nx, nd);
          prev.set(ny * w + nx, [x, y]);
          heap.push([nd, nx, ny]);
        }
      }
    }
    const path: [number, number][] = [];
    for (let at: [number, number] | undefined = goal ?? undefined; at; at = prev.get(at[1] * w + at[0])) if (solid(at[0], at[1]) && !(at[0] === sx && at[1] === sy)) path.push(at);
    if (!goal || path.length > 3) warnings.push(`on-E exit cell (${rx},${ry} in the draft): cannot be approached (to cut: ${goal ? path.length : 'nothing'})`);
    else {
      for (const [x, y] of path) G[y]![x] = '.';
      carved += path.length;
      if (path.length > 0) warnings.push(`on-E exit cell (${rx},${ry} in the draft): cells cut ${path.length}`);
      flood();
    }
  }
}
// Exit marks that cannot be reached from the first entrance (they stand behind a fence): cut a cell or two of fence; rock does not count.
if (cfg.carve !== false) {
  for (let round = 0; round < 500; round++) {
    let lost: [number, number] | null = null;
    for (let y = 0; y < h && !lost; y++) for (let x = 0; x < w && !lost; x++) if (EXIT_MARKS.includes(G[y]![x]!) && keep.includes(G[y]![x]!) && !seen.has(y * w + x)) lost = [x, y];
    if (!lost) break;
    const [sx, sy] = lost;
    const letter = G[sy]![sx]!;
    const dist = new Map<number, number>([[sy * w + sx, 0]]);
    const prev = new Map<number, [number, number]>();
    const heap: [number, number, number][] = [[0, sx, sy]];
    let goal: [number, number] | null = null;
    while (heap.length > 0) {
      heap.sort((a, b) => a[0] - b[0]);
      const [d, x, y] = heap.shift()!;
      if (d > (dist.get(y * w + x) ?? Infinity)) continue;
      if (seen.has(y * w + x)) {
        goal = [x, y];
        break;
      }
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const nd = d + (solid(nx, ny) ? 4 : 1);
        if (nd < (dist.get(ny * w + nx) ?? Infinity)) {
          dist.set(ny * w + nx, nd);
          prev.set(ny * w + nx, [x, y]);
          heap.push([nd, nx, ny]);
        }
      }
    }
    const path: [number, number][] = [];
    for (let at: [number, number] | undefined = goal ?? undefined; at; at = prev.get(at[1] * w + at[0])) if (solid(at[0], at[1])) path.push(at);
    if (!goal || path.length > 3) {
      G[sy]![sx] = 'R';
      warnings.push(`exit mark ${letter} (${sx + ox},${sy + oy} in the draft): unreachable — dropped`);
    } else {
      for (const [x, y] of path) G[y]![x] = '.';
      carved += path.length;
      if (path.length > 0) warnings.push(`exit mark ${letter} (${sx + ox},${sy + oy} in the draft) behind a fence: cells cut ${path.length}`);
    }
    flood();
  }
}
for (const e of entries) if (!seen.has(Math.floor(e.y) * w + Math.floor(e.x))) warnings.push(`entrance ${e.name} is not reachable from the first entrance`);

/** The nearest reachable cell to a point (in rings), or null. */
function nudge(gx: number, gy: number, what: string): [number, number] | null {
  const cx = Math.floor(gx - ox);
  const cy = Math.floor(gy - oy);
  if (seen.has(cy * w + cx)) return [gx - ox, gy - oy];
  for (let r = 1; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && seen.has((cy + dy) * w + cx + dx)) {
          warnings.push(`${what} (${gx},${gy}) moved by ${dx},${dy}`);
          return [cx + dx + 0.5, cy + dy + 0.5];
        }
      }
    }
  }
  warnings.push(`${what} (${gx},${gy}) dropped: no floor nearby`);
  return null;
}

// ---------- objects ----------

interface Exported {
  kind: 'critter' | 'corpse' | 'item' | 'content' | 'door' | 'exit' | 'scenery';
  pid: number;
  /** Items in a dead body's pockets: [PID, how many]. */
  items?: [number, number][];
  gx: number;
  gy: number;
  script?: string;
  weapon?: number;
  count?: number;
  itemType?: number;
  sceneryType?: number;
  /** Door sound letter from the prototype. */
  sound?: string;
  /** Our door texture from the original's door picture (DOOR_LOOKS). */
  texture?: string;
}


function exportObjects(): Exported[] {
  const out: Exported[] = [];
  const at = (o: MapObject) => {
    const p = hexToPlan(o.tile);
    return { gx: +((p.x - x0) / cell).toFixed(2), gy: +((p.y - y0) / cell).toFixed(2) };
  };
  for (const o of objects) {
    const type = idType(o.pid);
    const script = scriptOf(o);
    if (type === OBJ_TYPE.critter && o.critter && ((o.critter.results & 0x80) !== 0 || o.critter.hp <= 0)) {
      // A dead body in the map data (death flag or 0 health): a corpse with items in its pockets — it is searched like a killed one.
      out.push({ kind: 'corpse', pid: o.pid, ...at(o), script, items: o.inventory.map((inner) => [inner.object.pid, inner.object.ammoQuantity ?? inner.quantity]) });
      continue;
    }
    if (type === OBJ_TYPE.critter) out.push({ kind: 'critter', pid: o.pid, ...at(o), script, weapon: noWeapon.has((script ?? '').toUpperCase()) ? undefined : pickWeapon(o.inventory.map((i) => i.object.pid)) });
    else if (type === OBJ_TYPE.item) {
      out.push({ kind: 'item', pid: o.pid, ...at(o), count: o.ammoQuantity, itemType: types.itemType(o.pid) });
      for (const inner of o.inventory) out.push({ kind: 'content', pid: inner.object.pid, ...at(o), count: inner.object.ammoQuantity ?? inner.quantity });
    } else if (type === OBJ_TYPE.scenery) {
      const kind = types.sceneryType(o.pid);
      // Door sound comes from its prototype (a vault blast door has one, a wooden door another); "A" is the game's default.
      if (kind === SCENERY_TYPE.door) out.push({ kind: 'door', pid: o.pid, ...at(o), script, sound: types.scenerySound(o.pid), texture: doorLook(o.fid) });
      else if (script) out.push({ kind: 'scenery', pid: o.pid, ...at(o), script, sceneryType: kind });
    }
  }
  return out;
}

const pidNames = new Map<number, string>(Object.entries(PID).map(([key, value]) => [value as number, `PID.${key}`]));
const unknown = new Set<number>();
const pidSource = (pid: number): string => {
  const known = pidNames.get(pid >>> 0) ?? pidNames.get(pid);
  if (known) return known;
  unknown.add(pid >>> 0);
  return '0x' + (pid >>> 0).toString(16);
};

/** Prototype name from the game copy (only for hints in stderr, it does not go into the level file). */
const PROTO_DIR: Record<number, [string, string]> = { [OBJ_TYPE.item]: ['ITEMS', 'PRO_ITEM.MSG'], [OBJ_TYPE.critter]: ['CRITTERS', 'PRO_CRIT.MSG'] };
const messages = new Map<string, Map<number, string>>();
function nameOf(pid: number): string {
  const where = PROTO_DIR[idType(pid)];
  if (!where) return '?';
  try {
    const list = parseLst(read(`PROTO${B}${where[0]}${B}${where[0]}.LST`)!);
    const proto = parseProto(read(`PROTO${B}${where[0]}${B}${list[idIndex(pid) - 1]}`)!);
    let msg = messages.get(where[1]);
    if (!msg) {
      msg = parseMsg(read(`TEXT${B}ENGLISH${B}GAME${B}${where[1]}`)!);
      messages.set(where[1], msg);
    }
    return msg.get(proto.messageId) ?? '?';
  } catch {
    return '?';
  }
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
/** With --people critter the list holds peaceful exceptions, with --people npc hostile ones. */
const isHostile = (o: Exported): boolean => (people === 'critter' ? !listed(o.script, o.pid) : listed(o.script, o.pid));

const objectLines: string[] = [];
const armed: string[] = [];
const kinds = new Map<string, number>();
for (const o of exported) {
  if (o.kind === 'critter') {
    const place = nudge(o.gx, o.gy, 'critter ' + pidSource(o.pid));
    if (!place) continue;
    const kind = isHostile(o) ? 'critter' : 'npc';
    kinds.set(`${o.script ?? '—'} ${(o.pid >>> 0).toString(16)} ${kind}`, (kinds.get(`${o.script ?? '—'} ${(o.pid >>> 0).toString(16)} ${kind}`) ?? 0) + 1);
    objectLines.push(`{ kind: '${kind}', pid: ${pidSource(o.pid)}, x: ${fmt(place[0])}, y: ${fmt(place[1])}${o.script ? `, script: '${o.script}'` : ''}${o.weapon !== undefined ? `, weapon: ${pidSource(o.weapon)}` : ''} },`);
    if (o.weapon !== undefined) armed.push(`${o.script ?? '—'} ${pidSource(o.pid)} → ${pidSource(o.weapon)} (animation code ${weaponAnimation(o.weapon)})`);
  } else if (o.kind === 'corpse') {
    const place = nudge(o.gx, o.gy, 'body ' + pidSource(o.pid));
    if (!place) continue;
    const items = (o.items ?? []).map(([pid, count]) => `[${pidSource(pid)}, ${count}]`).join(', ');
    objectLines.push(`{ kind: 'corpse', pid: ${pidSource(o.pid)}, x: ${fmt(place[0])}, y: ${fmt(place[1])}${o.script ? `, script: '${o.script}'` : ''}${items ? `, items: [${items}]` : ''} },`);
  } else if (o.kind === 'door') {
    const dx = Math.floor(o.gx - ox);
    const dy = Math.floor(o.gy - oy);
    const teleport = o.script ? cfg.doorExits?.[o.script.toUpperCase()] : undefined;
    const sound = (o.sound && o.sound !== 'A' ? `, sound: '${o.sound}'` : '') + (o.texture ? `, texture: '${o.texture}'` : '');
    if (seen.has(dy * w + dx)) objectLines.push(teleport ? `{ kind: 'exit', x: ${dx + 0.5}, y: ${dy + 0.5}, use: true, to: { map: '${teleport.map}', entry: '${teleport.entry}' } },` : `{ kind: 'door', x: ${dx + 0.5}, y: ${dy + 0.5}${sound} },`);
    else warnings.push(`door (${o.gx},${o.gy}) is not in the reachable part — dropped`);
  } else if ((o.kind === 'item' && o.itemType !== ITEM_TYPE.container && !skipItems.has(o.pid >>> 0)) || o.kind === 'content') {
    const place = nudge(o.gx, o.gy, 'item ' + pidSource(o.pid));
    if (place) objectLines.push(`{ kind: 'item', pid: ${pidSource(o.pid)}, x: ${fmt(place[0])}, y: ${fmt(place[1])}${o.count && o.count > 1 ? `, count: ${o.count}` : ''} },`);
  }
}
for (const extra of cfg.extraObjects ?? []) objectLines.push(extra({ ox, oy }));
for (const [name, lift] of Object.entries(cfg.elevators ?? {})) {
  const at = entries.find((e) => e.name === name);
  if (at) objectLines.push(`{ kind: 'elevator', x: ${fmt(at.x)}, y: ${fmt(at.y)}, floors: ${lift.floors}, current: ${lift.current} },`);
  else warnings.push(`elevator: no entrance "${name}"`);
}

// A door in the same cell as an elevator or an "on E" exit is removed: otherwise the door grabs E and the elevator cannot be used.
{
  const spots = new Set<string>();
  for (const l of objectLines) {
    if (!/kind: 'elevator'|use: true/.test(l)) continue;
    const m = /x: ([0-9.]+), y: ([0-9.]+)/.exec(l);
    if (m) spots.add(m[1] + ',' + m[2]);
  }
  for (let i = objectLines.length - 1; i >= 0; i--) {
    const m = /^{ kind: 'door', x: ([0-9.]+), y: ([0-9.]+)(?:, sound: '.')?(?:, texture: '\w+')? },$/.exec(objectLines[i]!);
    if (m && spots.has(m[1] + ',' + m[2])) objectLines.splice(i, 1);
  }
}

// ---------- result ----------

const planX0 = x0 + cell * ox;
const planY0 = y0 + cell * oy;
// Fence posts (posts): cells with post-like wall pieces become small towers slightly taller than the wall with their own texture.
const towers = [...(cfg.towers ?? [])];
if (cfg.posts) {
  const { art, texture, height } = cfg.posts;
  const cells = new Set<number>();
  for (const o of objects) {
    if (idType(o.pid) !== OBJ_TYPE.wall || !art.test(wallArtNames[o.fid & 0xfff] ?? '')) continue;
    const [gx, gy] = cellOf(hexToPlan(o.tile));
    const lx = gx - ox;
    const ly = gy - oy;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h || G[ly]![lx] !== '#') continue;
    cells.add(ly * w + lx);
  }
  for (const cell of [...cells].sort((a, b) => a - b)) towers.push({ x0: cell % w, y0: Math.floor(cell / w), x1: (cell % w) + 1, y1: Math.floor(cell / w) + 1, height, texture });
  if (cells.size > 0) warnings.push(`fence posts: ${cells.size}`);
}
// Round windows (windows): a cell with a window wall piece becomes floor, and a post with a round window goes into it: a block the height
// of the floor with a texture that has a hole (you can see through it but not walk through).
const windowColumns: { x: number; y: number; texture: string }[] = [];
if (cfg.windows) {
  const { art, texture } = cfg.windows;
  const cells = new Set<number>();
  for (const o of objects) {
    if (idType(o.pid) !== OBJ_TYPE.wall || !art.test(wallArtNames[o.fid & 0xfff] ?? '')) continue;
    const [gx, gy] = cellOf(hexToPlan(o.tile));
    const lx = gx - ox;
    const ly = gy - oy;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h || G[ly]![lx] !== '#') continue;
    cells.add(ly * w + lx);
  }
  for (const cell of [...cells].sort((a, b) => a - b)) {
    G[Math.floor(cell / w)]![cell % w] = '.';
    windowColumns.push({ x: cell % w, y: Math.floor(cell / w), texture });
  }
  if (cells.size > 0) warnings.push(`round windows: ${cells.size}`);
}
const out: string[] = [];
if (args.includes('--header')) {
  out.push(`import { FACING, type LevelDef } from '../defs.ts';`, `import { PID } from '../pids.ts';`, '');
}
if (cfg.doc) out.push(`/** ${cfg.doc} */`);
out.push(`export const ${constName}: LevelDef = {`, `  id: '${id}',`, `  title: { ru: '${title.ru.replace(/'/g, "\\'")}', en: '${title.en.replace(/'/g, "\\'")}' },`, `  original: '${mapName}',`);
for (const line of cfg.comment ?? []) out.push(`  // ${line}`);
out.push(`  elevation: ${elevation},`, `  hexFrame: { col: ${199 - planY0}, row: ${planX0} },`);
if (cfg.entrances && Object.keys(cfg.entrances).length > 0) out.push(`  entrances: { ${Object.entries(cfg.entrances).map(([k, v]) => `${k}: '${v}'`).join(', ')} },`);
if (outdoor) out.push('  outdoor: true,');
/** A config object as a TypeScript string: { x: 1, texture: 'name' }. */
function literal(o: object): string {
  return `{ ${Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : v}`).join(', ')} }`;
}
out.push(`  music: '${flag('--music') ?? cfg.music ?? '06VAULT'}',`, `  floor: '${flag('--floor') ?? cfg.floor ?? (outdoor ? 'sand' : 'floor')}',`, `  ceiling: '${flag('--ceiling') ?? cfg.ceiling ?? (outdoor ? 'rockCeiling' : 'ceiling')}',`, `  fade: ${flag('--fade') ?? cfg.fade ?? (outdoor ? 22 : 10)},`, ...(cfg.doorTexture ? [`  doorTexture: '${cfg.doorTexture}',`] : []), ...(cfg.ruined ? ['  ruined: true,'] : []), ...(cfg.rubble ? ['  rubble: true,'] : []), ...(cfg.revision ? [`  revision: ${cfg.revision},`] : []),...(cfg.separateParts ? ['  separateParts: true,'] : []),...(towers.length ? [`  towers: [${towers.map((t) => `{ x0: ${t.x0}, y0: ${t.y0}, x1: ${t.x1}, y1: ${t.y1}, height: ${t.height}, texture: '${t.texture}' }`).join(', ')}],`] : []), ...(cfg.rounds?.length ? [`  rounds: [${cfg.rounds.map(literal).join(', ')}],`] : []), ...(cfg.panels?.length ? [`  panels: [${cfg.panels.map(literal).join(', ')}],`] : []), ...(cfg.haze ? [`  haze: ${literal(cfg.haze)},`] : []), '  grid: [');
// Where the grid rows are in the output: partitions (insideWall) are known only after the roofs — then the rows are rewritten.
const gridAt = out.length;
for (const row of G) out.push(`    '${row.join('')}',`);
out.push('  ],');
const wallMap = { ...(wallTexture ? { '#': wallTexture } : {}), ...cfg.walls };
if (Object.keys(wallMap).length > 0) out.push(`  walls: { ${Object.entries(wallMap).map(([k, v]) => `'${k}': '${v}'`).join(', ')} },`);
if (windowColumns.length > 0) out.push(`  columns: [${windowColumns.map((c) => `{ x: ${c.x}, y: ${c.y}, storeys: [{ texture: '${c.texture}', window: 'round' }] }`).join(', ')}],`);
if (cfg.marks) out.push(`  marks: { ${Object.entries(cfg.marks).map(([k, v]) => `${k}: ${v}`).join(', ')} },`);
// Chain-link fence (chainFences): cells of fence pieces go into the mask as "F"; where the fence steps diagonally, the corner cell
// goes into the mask too (otherwise a half-cell gap would remain between the ends of two pieces).
if (cfg.chainFences) {
  const rows = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  const fenceFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && floorLetters.has(G[y]![x]!);
  for (const o of objects) {
    if (!isChain(o)) continue;
    const [gx, gy] = cellOf(hexToPlan(o.tile));
    const x = gx - ox;
    const y = gy - oy;
    if (fenceFloor(x, y)) rows[y]![x] = 'F';
  }
  const on = (x: number, y: number) => rows[y]?.[x] === 'F';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      for (const [dx, dy] of [[1, 1], [1, -1]] as const) {
        if (!on(x + dx, y + dy) || on(x + dx, y) || on(x, y + dy)) continue;
        if (fenceFloor(x + dx, y)) rows[y]![x + dx] = 'F';
        else if (fenceFloor(x, y + dy)) rows[y + dy]![x] = 'F';
      }
    }
  }
  const { texture, height } = cfg.chainFences;
  out.push(`  fences: { texture: '${texture}', height: ${height}, rows: [`, ...rows.map((r) => `    '${r.join('')}',`), '  ] },');
  warnings.push(`chain-link fence: ${rows.reduce((n, r) => n + r.filter((c) => c === 'F').length, 0)} cells`);
}
/**
 * sealHouses: holes in house walls. A hole starts at a pair of neighbouring floor cells — street u (not under the original's roof) and r under it,
 * neither a door. Along the step u→r (u itself and up to three cells further, the roof overhangs the street) the first cell in a wall line
 * is found: a run of 1–3 floor cells across the step bounded by walls or doors on both ends; the run is filled with the wall's letter. Each fill is kept only if every floor cell reachable from the entrances through doors before stays
 * reachable (an alley between two houses, a house whose only way in was this hole). Repeats until nothing changes.
 */
function sealHouseHoles(
  w: number,
  h: number,
  at: (x: number, y: number) => number,
  wallAt: (x: number, y: number) => boolean,
  floorAt: (x: number, y: number) => boolean,
  roofed: (x: number, y: number) => boolean,
  passage: ReadonlySet<number>,
  taken: ReadonlySet<number>,
): { done: string[]; skipped: string[] } {
  // From which entrances each cell can be reached (a bit per entrance): a fill must not cut a cell off from any of them.
  const reachable = (): Uint32Array => {
    const seen = new Uint32Array(w * h);
    entries.forEach((e, n) => {
      const bit = 1 << Math.min(31, n);
      const queue = [at(Math.floor(e.x), Math.floor(e.y))];
      while (queue.length) {
        const i = queue.pop()!;
        const x = i % w;
        const y = Math.floor(i / w);
        if (!floorAt(x, y) || seen[i]! & bit) continue;
        seen[i] = seen[i]! | bit;
        queue.push(at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1));
      }
    });
    return seen;
  };
  let before = reachable();
  const done: string[] = [];
  const skipped = new Set<string>();
  const tried = new Set<number>();
  /**
   * Fill the cells with a wall letter; undo if anything reachable before (through doors) is cut off from any entrance — except an empty
   * pocket of up to four cells left behind the filled cells (a nook of a house open only through the hole): it is walled up too.
   */
  const tryFill = (run: [number, number][], letter: string, was: string[]): boolean => {
    if (run.some(([cx, cy]) => passage.has(at(cx, cy)) || taken.has(at(cx, cy)))) return false;
    for (const [cx, cy] of run) G[cy]![cx] = letter;
    let after = reachable();
    const cells = new Set(run.map(([cx, cy]) => at(cx, cy)));
    const lost: number[] = [];
    for (let k = 0; k < before.length; k++) if (!cells.has(k) && before[k]! & ~after[k]!) lost.push(k);
    const pocket = lost.length > 0 && lost.length <= 4 && lost.every((k) => after[k] === 0 && !taken.has(k) && !passage.has(k));
    if (lost.length && !pocket) {
      run.forEach(([cx, cy], m) => (G[cy]![cx] = was[m]!));
      return false;
    }
    for (const k of lost) {
      G[Math.floor(k / w)]![k % w] = letter;
      done.push(`${k % w},${Math.floor(k / w)}`);
    }
    if (lost.length) after = reachable();
    before = after;
    for (const [cx, cy] of run) done.push(`${cx},${cy}`);
    return true;
  };
  // A wall-line gap: from cell c across the step (along p), a run of 1–3 floor cells bounded by walls or doors on both ends.
  const solid = (x: number, y: number) => wallAt(x, y) || passage.has(at(x, y));
  const gapAt = (cx: number, cy: number, px: number, py: number): [number, number][] | null => {
    const run: [number, number][] = [[cx, cy]];
    for (const sign of [1, -1]) {
      let k = 1;
      for (; k <= 3; k++) {
        const x = cx + px * k * sign;
        const y = cy + py * k * sign;
        if (solid(x, y)) break;
        if (!floorAt(x, y)) return null;
        run.push([x, y]);
      }
      if (k > 3) return null;
    }
    return run.length <= 3 ? run : null;
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!floorAt(x, y) || roofed(x, y) || passage.has(at(x, y))) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const rx = x + dx;
          const ry = y + dy;
          if (!floorAt(rx, ry) || !roofed(rx, ry) || passage.has(at(rx, ry))) continue;
          // The gap may be at the roof's edge or a step or two inside it (the original's roof overhangs the street by a cell).
          let run: [number, number][] | null = null;
          for (let k = 0; k <= 3 && !run; k++) {
            const cx = x + dx * k;
            const cy = y + dy * k;
            if (!floorAt(cx, cy) || passage.has(at(cx, cy))) break;
            run = gapAt(cx, cy, dy, dx);
          }
          if (!run || run.some(([cx, cy]) => tried.has(at(cx, cy)) || taken.has(at(cx, cy)))) {
            if (!run) skipped.add(`${rx},${ry}`);
            continue;
          }
          for (const [cx, cy] of run) tried.add(at(cx, cy));
          const was = run.map(([cx, cy]) => G[cy]![cx]!);
          // The wall letter of the run's end (a door end takes the wall beyond the run's other end).
          const [ex, ey] = run.reduce((a, b) => (a[0] * dy + a[1] * dx <= b[0] * dy + b[1] * dx ? a : b));
          const end = wallAt(ex - dy, ey - dx) ? G[ey - dx]![ex - dy]! : null;
          const [fx, fy] = run.reduce((a, b) => (a[0] * dy + a[1] * dx >= b[0] * dy + b[1] * dx ? a : b));
          const letter = end ?? (wallAt(fx + dy, fy + dx) ? G[fy + dx]![fx + dy]! : '#');
          if (!tryFill(run, letter, was)) {
            skipped.add(`${rx},${ry}`);
            continue;
          }
          skipped.delete(`${rx},${ry}`);
          changed = true;
        }
      }
    }
  }
  // Second pass, by doors (the original's roof is shifted and misses some houses, the Hub's old-town warehouses): a door in a wall line
  // whose two sides are joined by a path around it — along that path the first wall-line gap is sealed.
  const around = (from: number, to: number): number[] | null => {
    const prev = new Map<number, number>([[from, -1]]);
    const queue = [from];
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q]!;
      if (i === to) {
        const path: number[] = [];
        for (let k = i; k >= 0; k = prev.get(k)!) path.push(k);
        return path.reverse();
      }
      const x = i % w;
      const y = Math.floor(i / w);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        const j = at(nx, ny);
        if (!floorAt(nx, ny) || passage.has(j) || prev.has(j)) continue;
        prev.set(j, i);
        queue.push(j);
      }
    }
    return null;
  };
  const stuck = new Set<number>();
  for (let guard = 0; guard < 200; guard++) {
    let sealedOne = false;
    for (const d of passage) {
      if (stuck.has(d)) continue;
      const x = d % w;
      const y = Math.floor(d / w);
      // A door in a straight wall line: floor on two opposite sides, walls on the other two.
      const open = (sx: number, sy: number) => floorAt(sx, sy) && !passage.has(at(sx, sy));
      const sides = open(x + 1, y) && open(x - 1, y) && wallAt(x, y + 1) && wallAt(x, y - 1) ? ([[x + 1, y], [x - 1, y]] as const) : open(x, y + 1) && open(x, y - 1) && wallAt(x + 1, y) && wallAt(x - 1, y) ? ([[x, y + 1], [x, y - 1]] as const) : null;
      if (!sides) continue;
      const path = around(at(sides[0]![0], sides[0]![1]), at(sides[1]![0], sides[1]![1]));
      if (!path) continue;
      let fixed = false;
      for (let n = 1; n < path.length && !fixed; n++) {
        const a = path[n - 1]!;
        const b = path[n]!;
        const sx = (b % w) - (a % w);
        const sy = Math.floor(b / w) - Math.floor(a / w);
        const run = gapAt(b % w, Math.floor(b / w), sy, sx);
        if (!run || run.some(([cx, cy]) => passage.has(at(cx, cy)))) continue;
        const was = run.map(([cx, cy]) => G[cy]![cx]!);
        const [ex, ey] = run.reduce((p, q) => (p[0] * sy + p[1] * sx <= q[0] * sy + q[1] * sx ? p : q));
        const [fx, fy] = run.reduce((p, q) => (p[0] * sy + p[1] * sx >= q[0] * sy + q[1] * sx ? p : q));
        const letter = wallAt(ex - sy, ey - sx) ? G[ey - sx]![ex - sy]! : wallAt(fx + sy, fy + sx) ? G[fy + sx]![fx + sy]! : '#';
        fixed = tryFill(run, letter, was);
      }
      // No straight gap on the way: an open corner, where one wall ends and the next one goes on a diagonal step further (the walls of two
      // sides do not meet). The path cell at the end of a wall with a wall diagonally across from that end joins them.
      for (let n = 1; n < path.length - 1 && !fixed; n++) {
        const cx = path[n]! % w;
        const cy = Math.floor(path[n]! / w);
        const end = ([[0, 1], [0, -1], [1, 0], [-1, 0]] as const).find(
          ([ux, uy]) => wallAt(cx + ux, cy + uy) && !wallAt(cx - ux, cy - uy) && (wallAt(cx - ux + uy, cy - uy + ux) || wallAt(cx - ux - uy, cy - uy - ux)),
        );
        if (!end) continue;
        fixed = tryFill([[cx, cy]], G[cy + end[1]]![cx + end[0]]!, [G[cy]![cx]!]);
      }
      if (fixed) sealedOne = true;
      else {
        stuck.add(d);
        skipped.add(`door ${x},${y}`);
      }
    }
    if (!sealedOne) break;
  }
  // Third pass, dead ends: a gap between two walls, from the street (reachable from the entrances without doors), that leads only into an
  // empty nook of up to four cells (no door, nothing in it) — a hole into a corner of a house cut off by a partition. tryFill walls up the
  // gap and the nook behind it. Nooks inside houses (behind doors: a toilet alcove) are left alone.
  const street = new Uint8Array(w * h);
  {
    const queue = entries.map((e) => at(Math.floor(e.x), Math.floor(e.y)));
    while (queue.length) {
      const i = queue.pop()!;
      const cx = i % w;
      const cy = Math.floor(i / w);
      if (!floorAt(cx, cy) || street[i] || passage.has(i)) continue;
      street[i] = 1;
      queue.push(at(cx + 1, cy), at(cx - 1, cy), at(cx, cy + 1), at(cx, cy - 1));
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!floorAt(x, y) || passage.has(at(x, y)) || taken.has(at(x, y))) continue;
      for (const [px, py] of [[1, 0], [0, 1]] as const) {
        if (!wallAt(x + px, y + py) || !wallAt(x - px, y - py)) continue;
        // The two sides of the gap across the wall line: one of them must be a small closed nook.
        for (const side of [1, -1]) {
          const start = at(x + py * side, y + px * side);
          const outer = at(x - py * side, y - px * side);
          if (!floorAt(start % w, Math.floor(start / w)) || !street[outer]) continue;
          const nook = new Set([start]);
          const queue = [start];
          let closed = true;
          for (let q = 0; q < queue.length && closed; q++) {
            const i = queue[q]!;
            if (passage.has(i) || taken.has(i)) closed = false;
            const cx = i % w;
            const cy = Math.floor(i / w);
            for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
              const j = at(nx, ny);
              if ((nx === x && ny === y) || !floorAt(nx, ny) || nook.has(j)) continue;
              nook.add(j);
              queue.push(j);
              if (nook.size > 4) closed = false;
            }
          }
          if (!closed) continue;
          const letter = G[y + py]![x + px]!;
          tryFill([[x, y], ...[...nook].map((i) => [i % w, Math.floor(i / w)] as [number, number])], letter, [G[y]![x]!, ...[...nook].map((i) => G[Math.floor(i / w)]![i % w]!)]);
          break;
        }
      }
    }
  }
  return { done, skipped: [...skipped].filter((k) => !done.includes(k)) };
}

// Floor from the original's tiles (paint) and flat roofs from the roof layer (roofs): as letters along the level grid rows. A floor tile is
// a 2×2 square of hexes, its middle is hex (2·row+1, 2·column+1).
if (cfg.paint || cfg.roofs) {
  const tileNames = parseLst(read(`ART${B}TILES${B}TILES.LST`)!);
  const rules = rulesFor(mapName).floor;
  const floorName = flag('--floor') ?? cfg.floor ?? (outdoor ? 'sand' : 'floor');
  const paintRows = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  const roofRows = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  const legend = new Map<string, string>();
  const PAINT_LETTERS = 'abcdefghijklmnopqrstuvwxyz';
  const squares = map.elevations[elevation]!;
  for (let sq = 0; sq < squares.floor.length; sq++) {
    const sx = sq % 100;
    const sy = Math.floor(sq / 100);
    const [gx, gy] = cellOf(hexToPlan((sy * 2 + 1) * 200 + sx * 2 + 1));
    const lx = gx - ox;
    const ly = gy - oy;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) continue;
    const ch = G[ly]![lx]!;
    if (cfg.paint && floorLetters.has(ch)) {
      const texture = ruleOf(rules, tileNames[squares.floor[sq]! & 0xfff] ?? '');
      if (texture && texture !== floorName) {
        let letter = legend.get(texture);
        if (!letter) legend.set(texture, (letter = PAINT_LETTERS[legend.size] ?? 'z'));
        paintRows[ly]![lx] = letter;
      }
    }
    const roofTile = squares.roof[sq]! & 0xfff;
    if (cfg.roofs && ch !== 'R' && roofTile !== 1 && !cfg.roofSkip?.test(tileNames[roofTile] ?? '')) roofRows[ly]![lx] = '#';
  }
  // The roof follows the house exactly (client request, 2026-10-24: "not the whole ceiling is covered"). The original's roof layer is drawn shifted
  // and lies across our cells at a slant: the roof stuck out a cell past the house, while the north wall and corners stayed without it.
  // So the original's roof is only a hint: a room (a connected piece of floor that cannot be reached from the entrances without passing a door
  // or doorway) is roofed entirely if the original's roof covers at least half of its cells; doors and doorways next to
  // such a room are roofed; a wall is roofed if roofed floor is next to it (diagonals included). A yard fenced
  // by a wall with a gate is also a "room", but the original has almost no roof over it, so it stays under the sky.
  if (cfg.roofs) {
    const at = (x: number, y: number) => y * w + x;
    // A round window cell is floor in the grid, but it is a wall with a hole: you cannot walk through, and the roof over it is like over a wall.
    const windowCells = new Set(windowColumns.map((c) => at(c.x, c.y)));
    const wallAt = (x: number, y: number) => {
      const ch = G[y]?.[x];
      return ch === '#' || !!(ch && cfg.walls?.[ch]) || windowCells.has(at(x, y));
    };
    const floorAt = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && floorLetters.has(G[y]![x]!) && !windowCells.has(at(x, y));
    const passage = new Set<number>();
    for (const o of exported) if (o.kind === 'door') passage.add(at(Math.floor(o.gx - ox), Math.floor(o.gy - oy)));
    for (const d of doorways) {
      const [gx, gy] = d.split(',').map(Number) as [number, number];
      passage.add(at(gx - ox, gy - oy));
    }
    if (cfg.sealHouses) {
      // Only real doors are kept: open doorways (doorways) found in slanted walls are holes too, unless one is the only way in.
      const doors = new Set<number>();
      // Cells holding an item, a critter, a body, an elevator or an exit (where the level places them) are never filled; furniture is
      // moved aside by the game itself.
      const taken = new Set<number>();
      for (const o of exported) if (o.kind === 'door') doors.add(at(Math.floor(o.gx - ox), Math.floor(o.gy - oy)));
      for (const line of objectLines) {
        const m = /kind: '(\w+)'.*?\bx: ([\d.]+), y: ([\d.]+)/.exec(line);
        if (m && m[1] !== 'door') taken.add(at(Math.floor(Number(m[2])), Math.floor(Number(m[3]))));
      }
      const sealed = sealHouseHoles(w, h, at, wallAt, floorAt, (x, y) => roofRows[y]?.[x] === '#', doors, taken);
      warnings.push(`sealHouses: ${sealed.done.length} holes sealed (${sealed.done.join(' ')}); left open (would cut something off or not between walls): ${sealed.skipped.join(' ') || 'none'}`);
      if (sealed.done.length) for (let y = 0; y < h; y++) out[gridAt + y] = `    '${G[y]!.join('')}',`;
    }
    const outside = new Uint8Array(w * h);
    const queue = entries.map((e) => at(Math.floor(e.x), Math.floor(e.y)));
    while (queue.length) {
      const i = queue.pop()!;
      const x = i % w;
      const y = Math.floor(i / w);
      if (!floorAt(x, y) || outside[i] || passage.has(i)) continue;
      outside[i] = 1;
      queue.push(at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1));
    }
    // The original's roof over floor stays (an awning or a shed without a door does not count as a room); rooms add to it.
    const originalRoof = (x: number, y: number) => roofRows[y]?.[x] === '#';
    // streetRoofs: false cuts the edge of the original's roof over the street: a street cell next to which (on the sides) is street without
    // a roof. This removes the strip of roof over the sidewalk in front of the facade, while a shop with a wide doorway and no door (to the helper it
    // is "street" too) stays roofed except for the doorway itself.
    const streetEdge = (x: number, y: number) =>
      cfg.streetRoofs === false &&
      outside[at(x, y)] &&
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => floorAt(x + dx!, y + dy!) && outside[at(x + dx!, y + dy!)] && !originalRoof(x + dx!, y + dy!));
    const roof = Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => floorAt(x, y) && (cfg.roofAll || (originalRoof(x, y) && !streetEdge(x, y)))),
    );
    const seen = new Uint8Array(w * h);
    const rooms: string[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const start = at(x, y);
        if (!floorAt(x, y) || outside[start] || passage.has(start) || seen[start]) continue;
        const room: number[] = [];
        const stack = [start];
        seen[start] = 1;
        while (stack.length) {
          const i = stack.pop()!;
          room.push(i);
          const cx = i % w;
          const cy = Math.floor(i / w);
          for (const n of [at(cx + 1, cy), at(cx - 1, cy), at(cx, cy + 1), at(cx, cy - 1)]) {
            if (!floorAt(n % w, Math.floor(n / w)) || outside[n] || passage.has(n) || seen[n]) continue;
            seen[n] = 1;
            stack.push(n);
          }
        }
        const covered = room.filter((i) => roofRows[Math.floor(i / w)]![i % w] === '#').length;
        if (covered * 2 >= room.length) for (const i of room) roof[Math.floor(i / w)]![i % w] = true;
        if (room.length >= 4) rooms.push(`${x},${y}:${room.length}/${covered}`);
      }
    }
    for (const i of passage) {
      const x = i % w;
      const y = Math.floor(i / w);
      if (floorAt(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => roof[y + dy!]?.[x + dx!])) roof[y]![x] = true;
    }
    warnings.push(`roofs: entrances ${entries.map((e) => `${Math.floor(e.x)},${Math.floor(e.y)}`).join(' ')}; outside ${outside.reduce((a, b) => a + b, 0)} cells; doors and doorways ${passage.size}; rooms (cell:size/under the original's roof): ${rooms.join(' ')}`);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const under = wallAt(x, y) && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => (dx || dy) && roof[y + dy]?.[x + dx]));
        roofRows[y]![x] = roof[y]![x] || under ? '#' : '.';
      }
    }
    // Roof texture by the nearest wall (roofByWall): in rings around the cell, the first ring that has walls, and the most
    // common letter in it.
    if (cfg.roofByWall) {
      const letterOf = (x: number, y: number): string | null => {
        const ch = G[y]?.[x];
        return ch && (ch === '#' || cfg.walls?.[ch]) ? ch : null;
      };
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (roofRows[y]![x] !== '#') continue;
          let found: Map<string, number> | null = null;
          for (let r = 0; r <= 8 && !found; r++) {
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                const l = letterOf(x + dx, y + dy);
                if (!l) continue;
                found ??= new Map();
                found.set(l, (found.get(l) ?? 0) + 1);
              }
            }
          }
          const best = found ? [...found].sort((a, b) => b[1] - a[1])[0]![0] : null;
          if (best && cfg.roofByWall[best]) roofRows[y]![x] = best;
        }
      }
    }
    // Partitions (insideWall): a wall that has neighbouring floor and all floor around it (diagonals too — slanted walls
    // are visible from the corner) is under a roof.
    if (cfg.insideWall) {
      const { from, to } = cfg.insideWall;
      const changed = new Set<number>();
      const around = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (G[y]![x] !== from) continue;
          const sides = around.filter(([dx, dy]) => floorAt(x + dx!, y + dy!));
          if (sides.length > 0 && sides.every(([dx, dy]) => roof[y + dy!]![x + dx!])) {
            G[y]![x] = to;
            changed.add(y);
          }
        }
      }
      for (const y of changed) out[gridAt + y] = `    '${G[y]!.join('')}',`;
      warnings.push(`partitions (${from} → ${to}): ${[...changed].reduce((n, y) => n + G[y]!.filter((c) => c === to).length, 0)} cells`);
    }
  }
  if (legend.size > 0) out.push(`  paint: { legend: { ${[...legend].map(([t, l]) => `${l}: '${t}'`).join(', ')} }, rows: [`, ...paintRows.map((r) => `    '${r.join('')}',`), '  ] },');
  const roofLegend = Object.entries(cfg.roofByWall ?? {}).filter(([l]) => roofRows.some((r) => r.includes(l)));
  const roofEdges = Object.entries(cfg.roofEdges ?? {}).filter(([l]) => roofRows.some((r) => r.includes(l)));
  if (cfg.roofs && roofRows.some((r) => r.some((c) => c !== '.'))) {
    const legendText = roofLegend.length ? ` legend: { ${roofLegend.map(([l, t]) => `${l}: '${t}'`).join(', ')} },` : '';
    const edgesText = roofEdges.length ? ` edges: { ${roofEdges.map(([l, t]) => `'${l}': '${t}'`).join(', ')} },` : '';
    out.push(`  roof: { texture: '${typeof cfg.roofs === 'string' ? cfg.roofs : 'adobeRoof'}',${legendText}${edgesText} rows: [`, ...roofRows.map((r) => `    '${r.join('')}',`), '  ] },');
  }
}
out.push('  entries: {');
for (const e of entries) out.push(`    ${e.name}: { x: ${fmt(e.x)}, y: ${fmt(e.y)}, angle: FACING.${e.facing} },`);
out.push('  },');
if (objectLines.length > 0) out.push('  objects: [', ...objectLines.map((l) => `    ${l}`), '  ],');
out.push('};');
console.log(out.join('\n'));

// ---------- what to say in stderr ----------

const say = (text: string) => console.error(text);
say(`[${id}] ${header}; level grid ${w}×${h}, passages cut ${carved}, hexFrame col ${199 - planY0}, row ${planX0}, frame offset ${ox},${oy}`);
if (doorways.length > 0) say(`  Doorways without a door (draft cells): ${doorways.join(' ')}`);
for (const warning of warnings) say(`  ! ${warning}`);
if (kinds.size > 0) {
  say('  NPCs (script PID kind: count) — decide who is hostile (--hostile):');
  for (const [key, count] of [...kinds.entries()].sort()) say(`    ${key}: ${count}`);
}
if (armed.length > 0) {
  say(`  Armed (weapons from the map inventory, ${armed.length}):`);
  for (const line of armed) say(`    ${line}`);
}
if (unknown.size > 0) {
  say('  Unknown PIDs — add to src/world/pids.ts (your own name; the number: for critters the index in CRITTERS.LST, for items in ITEMS.LST):');
  for (const pid of [...unknown].sort((a, b) => a - b)) say(`    0x${pid.toString(16)} = ${idIndex(pid)} — ${nameOf(pid)}${idType(pid) === OBJ_TYPE.item ? ', item kind ' + types.itemType(pid) : ''}`);
}
if (exitMaps.length > 0) say('  Exit letters: X — world map; ' + exitMaps.map((g, i) => `${EXIT_LETTERS[i] ?? EXIT_LETTERS[EXIT_LETTERS.length - 1]} — map ${g.map} (${MAP_NAMES[g.map] ?? '?'}), floor ${g.elevation}, tile ${g.tile}`).join('; '));
{
  // Items on the floor: by PID — how many, what kind, whether they have a script (with one it is usually furniture: skipItems helps).
  const table = new Map<number, { n: number; type: number }>();
  for (const o of exported) if (o.kind === 'item' && o.itemType !== ITEM_TYPE.container) table.set(o.pid >>> 0, { n: (table.get(o.pid >>> 0)?.n ?? 0) + 1, type: o.itemType ?? -1 });
  if (table.size > 0) {
    say('  Items on the floor (PID — count; kind 0 armor, 2 drugs, 3 weapon, 4 ammo, 5 misc, 6 key):');
    for (const [pid, v] of [...table.entries()].sort((a, b) => a[0] - b[0])) say(`    0x${pid.toString(16)} ×${v.n}, kind ${v.type}, ${nameOf(pid)}${skipItems.has(pid) ? ' — skipped (skipItems)' : ''}`);
  }
}
const hints = exported.filter((o) => o.kind === 'scenery');
if (hints.length > 0 || map.objects[elevation]?.some((o) => o.exit && o.exit.map >= 0)) {
  say('  By hand (elevators, stairs, ropes, scripted scenery; cells are in the draft and in docs/data):');
  const shown = new Map<string, number>();
  for (const o of hints) {
    const n = (shown.get(o.script ?? '') ?? 0) + 1;
    shown.set(o.script ?? '', n);
    // Objects of the same kind (slot machines and the like) are shown three at a time.
    if (n <= 3) say(`    ${o.script} — cell ${fmt(o.gx - ox)},${fmt(o.gy - oy)} in the level (${fmt(o.gx)},${fmt(o.gy)} in the draft)`);
  }
  for (const [name, n] of shown) if (n > 3) say(`    …and ${n - 3} more with script ${name}`);
  const exits = new Map<string, number>();
  for (const o of objects) if (o.exit) exits.set(`map ${o.exit.map}`, (exits.get(`map ${o.exit.map}`) ?? 0) + 1);
  for (const [key, count] of exits) say(`    exits to ${key}: ${count} (in the grid — letters X: to the world map and Y: to another map)`);
}
game.close();
