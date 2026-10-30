// Fallout maps (MAPS\*.MAP version 19): header, variables, floor and ceiling tiles, scripts, objects with all their data.
// All numbers are 32-bit, big-endian. Field order follows the format description (fallout1-ce: map, object, scripts, proto); the code is ours.
// A map stores objects as "prototype number + data"; how much data follows an object depends on the prototype kind
// (weapon, door, elevator...), so the parser needs a list of kinds — `ProtoTypes` (see createProtoTypes).
import { EXIT_GRID_FIRST, EXIT_GRID_LAST, ITEM_TYPE, OBJ_TYPE, SCENERY_TYPE, idIndex, idType, parseProto } from './pro.ts';
import { parseLst } from './text.ts';

export const MAP_VERSION = 19;
export const ELEVATION_COUNT = 3;
/** A 200×200 hex grid and a 100×100 square grid (floor and ceiling). */
export const HEX_GRID = 200;
export const SQUARE_GRID = 100;

/** Header flags: the map was saved by the game (rather than shipped with it) and "no elevation" (one bit per elevation). */
const FLAG_SAVED_GAME = 1;
const ELEVATION_ABSENT = [2, 4, 8];

const SCRIPT_TYPES = 5;
/** Script types in list order: system, spatial, timer, item, critter. */
export const SCRIPT_TYPE = { system: 0, spatial: 1, timed: 2, item: 3, critter: 4 } as const;
const SCRIPTS_PER_EXTENT = 16;

export interface MapHeader {
  version: number;
  /** Map name as written in the file ("V13ENT.MAP"). */
  name: string;
  enteringTile: number;
  enteringElevation: number;
  enteringRotation: number;
  localVariablesCount: number;
  /** Number of the map's own script (1-based, 0 — none). */
  scriptIndex: number;
  flags: number;
  darkness: number;
  globalVariablesCount: number;
  mapNumber: number;
  lastVisitTime: number;
}

export interface MapScript {
  type: number;
  id: number;
  next: number;
  flags: number;
  /** Script number in SCRIPTS.LST (0-based). */
  scriptIndex: number;
  /** Owner object number. */
  ownerId: number;
  localVarOffset: number;
  localVarCount: number;
  /** Only for spatial scripts: the trigger cell and radius. */
  builtTile?: number;
  radius?: number;
  /** Only for timer scripts. */
  time?: number;
}

export interface CritterState {
  flags: number;
  damageLastTurn: number;
  maneuver: number;
  ap: number;
  results: number;
  aiPacket: number;
  team: number;
  whoHitMeCid: number;
  hp: number;
  radiation: number;
  poison: number;
}

export interface ExitGrid {
  /** Destination map number (in the game's map list), −1/0 — another map of the same location; entry cell and elevation. */
  map: number;
  tile: number;
  elevation: number;
  rotation: number;
}

export interface MapObject {
  id: number;
  /** Hex number 0…39999 (in an inventory — −1). */
  tile: number;
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  frame: number;
  rotation: number;
  /** Image number (type in the high bits, number in the ART list — in the low bits). */
  fid: number;
  flags: number;
  elevation: number;
  /** Prototype number: object type in the high bits (idType), number — in the low bits (idIndex). */
  pid: number;
  cid: number;
  lightDistance: number;
  lightIntensity: number;
  /** Script instance number (−1 — none) and script number in SCRIPTS.LST (0-based). */
  scriptId: number;
  scriptIndex: number;
  /** Common data flags (for critters — the first number of the block). */
  dataFlags: number;
  critter?: CritterState;
  /** Weapon: how many rounds and of what kind (PID). */
  weaponAmmo?: { quantity: number; pid: number };
  /** Ammo: how many in the pack. */
  ammoQuantity?: number;
  /** "Misc": charges. Key: code. */
  charges?: number;
  keyCode?: number;
  /** Door: opening flags. */
  openFlags?: number;
  stairs?: { destinationMap: number; destinationTile: number };
  elevator?: { type: number; level: number };
  /** Rope ladder: where it leads (cell with elevation). */
  ladder?: number;
  /** Map exit: where it leads. */
  exit?: ExitGrid;
  inventory: { quantity: number; object: MapObject }[];
}

export interface MapElevation {
  /** Floor and ceiling tiles per 100×100 cells: the low 12 bits — number in TILES.LST, the high 4 — flags. */
  floor: Uint16Array;
  roof: Uint16Array;
}

export interface FalloutMap {
  header: MapHeader;
  globalVars: number[];
  localVars: number[];
  /** By elevation 0…2; null — the elevation isn't in the file. */
  elevations: (MapElevation | null)[];
  scripts: MapScript[];
  /** Top-level objects by elevation (inventory items are inside objects). */
  objects: MapObject[][];
}

/** Prototype kinds: they determine how much data follows an object on the map. */
export interface ProtoTypes {
  /** ITEM_TYPE of the item with this PID. */
  itemType(pid: number): number;
  /** SCENERY_TYPE of the scenery with this PID. */
  sceneryType(pid: number): number;
  /** Scenery sound letter (for a door — which opening sound: SODOORS<letter>); none — undefined. */
  scenerySound(pid: number): string | undefined;
}

/**
 * Prototype kinds from the game copy's files. read — reads a file by name ("PROTO\\ITEMS\\ITEMS.LST"), null — no such file.
 * Files are read as needed and cached.
 */
export function createProtoTypes(read: (name: string) => Uint8Array | null): ProtoTypes {
  const lists = new Map<string, string[]>();
  const types = new Map<number, number>();
  const sounds = new Map<number, string | undefined>();
  const lookup = (pid: number, dir: 'ITEMS' | 'SCENERY'): number => {
    const known = types.get(pid);
    if (known !== undefined) return known;
    let list = lists.get(dir);
    if (!list) {
      const bytes = read(`PROTO\\${dir}\\${dir}.LST`);
      if (!bytes) throw new Error(`No list PROTO\\${dir}\\${dir}.LST`);
      list = parseLst(bytes);
      lists.set(dir, list);
    }
    const file = list[idIndex(pid) - 1];
    const bytes = file ? read(`PROTO\\${dir}\\${file}`) : null;
    if (!bytes) throw new Error(`No prototype 0x${pid.toString(16)}`);
    const proto = parseProto(bytes);
    const type = proto.kind === 'item' ? proto.type : proto.kind === 'scenery' ? proto.type : -1;
    if (type < 0) throw new Error(`Prototype 0x${pid.toString(16)} is of the wrong kind`);
    types.set(pid, type);
    if (proto.kind === 'scenery') sounds.set(pid, proto.soundCode);
    return type;
  };
  return {
    itemType: (pid) => lookup(pid, 'ITEMS'),
    sceneryType: (pid) => lookup(pid, 'SCENERY'),
    scenerySound: (pid) => {
      lookup(pid, 'SCENERY');
      return sounds.get(pid);
    },
  };
}

class Reader {
  private readonly view: DataView;
  private readonly bytes: Uint8Array;
  pos = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.length;
  }

  i32(): number {
    if (this.pos + 4 > this.bytes.length) throw new Error('Map ends abruptly at byte ' + this.pos);
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }

  /** Unsigned integer: needed for tiles (the high 16 bits). */
  u32(): number {
    if (this.pos + 4 > this.bytes.length) throw new Error('Map ends abruptly at byte ' + this.pos);
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }

  list(count: number): number[] {
    return Array.from({ length: count }, () => this.i32());
  }

  text(count: number): string {
    if (this.pos + count > this.bytes.length) throw new Error('Map ends abruptly at byte ' + this.pos);
    let end = this.pos;
    while (end < this.pos + count && this.bytes[end] !== 0) end++;
    const out = String.fromCharCode(...this.bytes.subarray(this.pos, end));
    this.pos += count;
    return out;
  }
}

function readHeader(r: Reader): MapHeader {
  const version = r.i32();
  const name = r.text(16);
  const header: MapHeader = {
    version,
    name,
    enteringTile: r.i32(),
    enteringElevation: r.i32(),
    enteringRotation: r.i32(),
    localVariablesCount: r.i32(),
    scriptIndex: r.i32(),
    flags: r.i32(),
    darkness: r.i32(),
    globalVariablesCount: r.i32(),
    mapNumber: r.i32(),
    lastVisitTime: r.i32(),
  };
  r.pos += 44 * 4; // padding at the end of the header
  return header;
}

function readScripts(r: Reader, savedGame: boolean): MapScript[] {
  const out: MapScript[] = [];
  for (let type = 0; type < SCRIPT_TYPES; type++) {
    const count = r.i32();
    // Blocks are counted as in the game itself (C integer division): the first block is read for any non-zero count,
    // even a negative one — shipped maps contain such records.
    const blocks = count === 0 ? 0 : Math.max(1, Math.trunc(count / SCRIPTS_PER_EXTENT) + (count % SCRIPTS_PER_EXTENT !== 0 ? 1 : 0));
    for (let extent = 0; extent < blocks; extent++) {
      const nodes: MapScript[] = [];
      for (let slot = 0; slot < SCRIPTS_PER_EXTENT; slot++) {
        const id = r.i32();
        const next = r.i32();
        const script: MapScript = { type, id, next, flags: 0, scriptIndex: 0, ownerId: 0, localVarOffset: 0, localVarCount: 0 };
        // The record size depends on the kind of the script itself (the high byte of its number), not on the list it is in:
        // in empty block slots the number is garbage, and they take up less space. The game itself reads it the same way.
        const kind = (id >>> 24) & 0xff;
        if (kind === SCRIPT_TYPE.spatial) {
          script.builtTile = r.i32();
          script.radius = r.i32();
        } else if (kind === SCRIPT_TYPE.timed) {
          script.time = r.i32();
        }
        script.flags = r.i32();
        script.scriptIndex = r.i32();
        r.i32(); // program (empty space in the file)
        script.ownerId = r.i32();
        script.localVarOffset = r.i32();
        script.localVarCount = r.i32();
        r.pos += 4 * 8; // service fields: action, parameters, overrides, count, launch flags
        // The game zeroes the local variable count for maps shipped with the game; for saved ones it keeps it.
        if (!savedGame) script.localVarCount = 0;
        nodes.push(script);
      }
      const used = r.i32();
      r.i32(); // next block — service field
      // The game sees only `used` scripts in a block; some shipped maps have garbage here (−1, 0xCCCCCCCC) — such blocks are empty.
      if (used > 0 && used <= SCRIPTS_PER_EXTENT) out.push(...nodes.slice(0, used));
    }
  }
  return out;
}

const isExitGrid = (pid: number) => pid >= EXIT_GRID_FIRST && pid <= EXIT_GRID_LAST;

function readObject(r: Reader, types: ProtoTypes): MapObject {
  const obj: MapObject = {
    id: r.i32(),
    tile: r.i32(),
    x: r.i32(),
    y: r.i32(),
    screenX: r.i32(),
    screenY: r.i32(),
    frame: r.i32(),
    rotation: r.i32(),
    fid: r.i32(),
    flags: r.i32(),
    elevation: r.i32(),
    pid: r.i32(),
    cid: r.i32(),
    lightDistance: r.i32(),
    lightIntensity: r.i32(),
    scriptId: 0,
    scriptIndex: 0,
    dataFlags: 0,
    inventory: [],
  };
  r.i32(); // service field
  obj.scriptId = r.i32();
  obj.scriptIndex = r.i32();

  const inventoryLength = r.i32();
  r.i32(); // capacity
  r.i32(); // pointer to items (garbage in the file)
  const kind = idType(obj.pid);
  if (kind === OBJ_TYPE.critter) {
    obj.dataFlags = r.i32();
    obj.critter = {
      flags: obj.dataFlags,
      damageLastTurn: r.i32(),
      maneuver: r.i32(),
      ap: r.i32(),
      results: r.i32(),
      aiPacket: r.i32(),
      team: r.i32(),
      whoHitMeCid: r.i32(),
      hp: r.i32(),
      radiation: r.i32(),
      poison: r.i32(),
    };
  } else {
    obj.dataFlags = r.i32();
    if (kind === OBJ_TYPE.item) {
      const type = types.itemType(obj.pid);
      if (type === ITEM_TYPE.weapon) obj.weaponAmmo = { quantity: r.i32(), pid: r.i32() };
      else if (type === ITEM_TYPE.ammo) obj.ammoQuantity = r.i32();
      else if (type === ITEM_TYPE.misc) obj.charges = r.i32();
      else if (type === ITEM_TYPE.key) obj.keyCode = r.i32();
    } else if (kind === OBJ_TYPE.scenery) {
      const type = types.sceneryType(obj.pid);
      if (type === SCENERY_TYPE.door) obj.openFlags = r.i32();
      else if (type === SCENERY_TYPE.stairs) obj.stairs = { destinationMap: r.i32(), destinationTile: r.i32() };
      else if (type === SCENERY_TYPE.elevator) obj.elevator = { type: r.i32(), level: r.i32() };
      else if (type === SCENERY_TYPE.ladderUp || type === SCENERY_TYPE.ladderDown) obj.ladder = r.i32();
    } else if (kind === OBJ_TYPE.misc && isExitGrid(obj.pid)) {
      obj.exit = { map: r.i32(), tile: r.i32(), elevation: r.i32(), rotation: r.i32() };
    }
  }

  if (inventoryLength < 0 || inventoryLength > 1000) throw new Error('Strange inventory: ' + inventoryLength);
  for (let i = 0; i < inventoryLength; i++) {
    const quantity = r.i32();
    obj.inventory.push({ quantity, object: readObject(r, types) });
  }
  return obj;
}

/**
 * Parses a map. Strictly: the version must be 19, and no extra bytes may remain at the end of the file.
 */
/** Only the map header (without objects and tiles): name, entrance, map number — when the rest isn't needed. */
export function parseMapHeader(bytes: Uint8Array): MapHeader {
  return readHeader(new Reader(bytes));
}

export function parseMap(bytes: Uint8Array, types: ProtoTypes): FalloutMap {
  const r = new Reader(bytes);
  const header = readHeader(r);
  if (header.version !== MAP_VERSION) throw new Error(`Map version ${header.version}, expected ${MAP_VERSION}`);
  const globalVars = r.list(Math.max(0, header.globalVariablesCount));
  const localVars = r.list(Math.max(0, header.localVariablesCount));

  const elevations: (MapElevation | null)[] = [];
  for (let e = 0; e < ELEVATION_COUNT; e++) {
    if ((header.flags & ELEVATION_ABSENT[e]!) !== 0) {
      elevations.push(null);
      continue;
    }
    const floor = new Uint16Array(SQUARE_GRID * SQUARE_GRID);
    const roof = new Uint16Array(SQUARE_GRID * SQUARE_GRID);
    for (let i = 0; i < floor.length; i++) {
      const v = r.u32();
      floor[i] = v & 0xffff;
      roof[i] = v >>> 16;
    }
    elevations.push({ floor, roof });
  }

  const scripts = readScripts(r, (header.flags & FLAG_SAVED_GAME) !== 0);

  const total = r.i32();
  const objects: MapObject[][] = [];
  let counted = 0;
  for (let e = 0; e < ELEVATION_COUNT; e++) {
    const count = r.i32();
    if (count < 0 || count > 100000) throw new Error('Strange object count: ' + count);
    const list: MapObject[] = [];
    for (let i = 0; i < count; i++) list.push(readObject(r, types));
    counted += count;
    objects.push(list);
  }
  if (counted !== total) throw new Error(`Header says ${total} objects, read ${counted}`);
  if (r.pos !== r.length) throw new Error(`Read ${r.pos} bytes of ${r.length}`);
  return { header, globalVars, localVars, elevations, scripts, objects };
}

/**
 * Where a hex is on the original's screen (pixels, origin — tile 0): a 200×200 grid, columns counted from the right edge.
 */
export function hexToScreen(tile: number): { x: number; y: number } {
  const col = HEX_GRID - 1 - (tile % HEX_GRID);
  const row = Math.floor(tile / HEX_GRID);
  const pair = Math.floor(col / 2);
  return { x: 48 * pair + 16 * row + (col & 1 ? 32 : 0), y: 12 * row - 12 * pair };
}

/**
 * Where a hex is on a "north up" plan (unit — one hex along a row or column).
 * The original's screen is oblique: the floor is 2×2-hex parallelograms that are squares in the world. If we give them right
 * angles back and rotate the map by 45°, rows (tile / 200) go right, columns (tile % 200) go down, and odd columns
 * are shifted by half a row, as in a hex grid. A 100×100 floor cell is a 2×2-unit square.
 */
export function hexToPlan(tile: number): { x: number; y: number } {
  const col = HEX_GRID - 1 - (tile % HEX_GRID);
  const row = Math.floor(tile / HEX_GRID);
  return { x: row + (col & 1 ? 0.5 : 0), y: tile % HEX_GRID };
}
