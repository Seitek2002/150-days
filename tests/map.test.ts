// Parsing Fallout maps. The first part runs on hand-built bytes (always runs),
// the second on a real copy of the game (path from .local/config.json; no copy — skipped).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createProtoTypes,
  hexToPlan,
  hexToScreen,
  parseMap,
  type FalloutMap,
  type ProtoTypes,
} from '../src/formats/map.ts';
import { ITEM_TYPE, OBJ_TYPE, SCENERY_TYPE, idType } from '../src/formats/pro.ts';

/** Writes numbers in a row, 4 bytes big-endian each. */
function ints(...values: number[]): number[] {
  return values.flatMap((v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
}

function header(opts: { flags?: number; globals?: number; locals?: number } = {}): number[] {
  const name = 'TEST.MAP'.split('').map((c) => c.charCodeAt(0));
  while (name.length < 16) name.push(0);
  return [
    ...ints(19),
    ...name,
    ...ints(1234, 0, 2, opts.locals ?? 0, 0, opts.flags ?? 14, 0, opts.globals ?? 0, 7, 0),
    ...ints(...new Array(44).fill(0)),
  ];
}

/** An object: 18 common numbers and a data block (the caller builds it). */
function object(pid: number, tile: number, extra: number[], inventory: number[] = [], inventoryLength = 0, critter = false): number[] {
  return [
    ...ints(1, tile, 0, 0, 0, 0, 0, 2, 0x1000001, 0x20, 0, pid, -1, 0, 0, 0, -1, 0),
    ...ints(inventoryLength, 0, 0),
    ...(critter ? [] : ints(0)),
    ...extra,
    ...inventory,
  ];
}

/** No floor with tiles and no scripts; objects are per floor. */
function build(objects: number[][][] = [[], [], []], head = header()): Uint8Array {
  const total = objects.reduce((n, list) => n + list.length, 0);
  const scripts = ints(0, 0, 0, 0, 0);
  return Uint8Array.from([...head, ...scripts, ...ints(total), ...objects.flatMap((list) => [...ints(list.length), ...list.flat()])]);
}

const fakeTypes: ProtoTypes = {
  itemType: (pid) => (pid === 8 ? ITEM_TYPE.weapon : pid === 29 ? ITEM_TYPE.ammo : pid === 3 ? ITEM_TYPE.container : ITEM_TYPE.key),
  sceneryType: (pid) => (pid === 0x2000002 ? SCENERY_TYPE.door : pid === 0x2000026 ? SCENERY_TYPE.elevator : SCENERY_TYPE.generic),
  scenerySound: () => undefined,
};

describe('parsing maps from hand-built bytes', () => {
  it('empty map: header, no floors, no objects', () => {
    const map = parseMap(build(), fakeTypes);
    expect(map.header).toMatchObject({ version: 19, name: 'TEST.MAP', enteringTile: 1234, enteringRotation: 2, mapNumber: 7 });
    expect(map.elevations).toEqual([null, null, null]);
    expect(map.objects).toEqual([[], [], []]);
    expect(map.scripts).toEqual([]);
  });

  it('variables and floor and ceiling tiles', () => {
    const tiles = ints(...new Array(10000).fill(0).map((_, i) => (i === 5 ? (0x0102 << 16) | 0x0304 : 1)));
    const head = header({ flags: 12, globals: 2, locals: 1 });
    const bytes = Uint8Array.from([...head, ...ints(10, 20, 30), ...tiles, ...ints(0, 0, 0, 0, 0), ...ints(0, 0, 0, 0)]);
    const map = parseMap(bytes, fakeTypes);
    expect(map.globalVars).toEqual([10, 20]);
    expect(map.localVars).toEqual([30]);
    expect(map.elevations[1]).toBeNull();
    expect(map.elevations[0]?.floor[5]).toBe(0x0304);
    expect(map.elevations[0]?.roof[5]).toBe(0x0102);
    expect(map.elevations[0]?.floor[6]).toBe(1);
  });

  it('objects: a critter with items, a door, a lift, a map exit', () => {
    const rat = object(
      0x1000030,
      20100,
      ints(0, 0, 0, 5, 0, 12, 5, -1, 6, 0, 0),
      [
        ...ints(12),
        ...object(8, -1, ints(12, 29)), // pistol with 12 rounds
        ...ints(3),
        ...object(3, -1, [], [...ints(1), ...object(0x30, -1, ints(555))], 1),
      ],
      2,
      true,
    );
    const door = object(0x2000002, 20200, ints(1));
    const lift = object(0x2000026, 20300, ints(3, 1));
    const exit = object(0x5000010, 20400, ints(5, 18900, 0, 2));
    const map = parseMap(build([[rat, door], [lift], [exit]]), fakeTypes);
    const [first, second] = map.objects[0]!;
    expect(first).toMatchObject({ pid: 0x1000030, tile: 20100, critter: { hp: 6, aiPacket: 12, team: 5 } });
    expect(first!.inventory).toHaveLength(2);
    expect(first!.inventory[0]).toMatchObject({ quantity: 12, object: { pid: 8, weaponAmmo: { quantity: 12, pid: 29 } } });
    expect(first!.inventory[1]!.object.inventory[0]).toMatchObject({ quantity: 1, object: { keyCode: 555 } });
    expect(second).toMatchObject({ pid: 0x2000002, openFlags: 1 });
    expect(map.objects[1]![0]).toMatchObject({ elevator: { type: 3, level: 1 } });
    expect(map.objects[2]![0]).toMatchObject({ exit: { map: 5, tile: 18900, elevation: 0, rotation: 2 } });
    expect(idType(map.objects[2]![0]!.pid)).toBe(OBJ_TYPE.misc);
  });

  it('scripts: a spatial one takes 2 numbers more, empty slots take fewer', () => {
    const nodeBase = (id: number) => ints(id, -1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0).slice(0);
    // 16 numbers for a normal script: number, next, then 14 fields; a spatial one has a cell and radius after next.
    const spatial = [...ints(0x1000000, -1, 777, 3, 0, 5, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0)];
    const junk = [...nodeBase(0xcccccccc)];
    const extent = [...spatial, ...new Array(15).fill(junk).flat(), ...ints(1, 0)];
    const bytes = Uint8Array.from([...header(), ...ints(0), ...ints(1), ...extent, ...ints(0, 0, 0), ...ints(0), ...ints(0, 0, 0)]);
    const map = parseMap(bytes, fakeTypes);
    expect(map.scripts).toHaveLength(1);
    expect(map.scripts[0]).toMatchObject({ type: 1, id: 0x1000000, builtTile: 777, radius: 3, scriptIndex: 5 });
  });

  it('extra bytes, wrong version and truncation are errors', () => {
    const good = build();
    expect(() => parseMap(Uint8Array.from([...good, 0]), fakeTypes)).toThrow();
    expect(() => parseMap(good.subarray(0, good.length - 3), fakeTypes)).toThrow();
    const wrong = Uint8Array.from(good);
    wrong[3] = 20;
    expect(() => parseMap(wrong, fakeTypes)).toThrow(/version/i);
  });

  it('hex → original screen and a "north up" plan', () => {
    expect(hexToScreen(199)).toEqual({ x: 0, y: 0 });
    expect(hexToScreen(0)).toEqual({ x: 48 * 99 + 32, y: -12 * 99 });
    expect(hexToScreen(200 + 199)).toEqual({ x: 16, y: 12 });
    expect(hexToPlan(199)).toEqual({ x: 0, y: 199 });
    expect(hexToPlan(0)).toEqual({ x: 0.5, y: 0 });
    // Neighbouring rows are one to the right, neighbouring columns one lower.
    expect(hexToPlan(201).y - hexToPlan(200).y).toBe(1);
    expect(hexToPlan(400).x - hexToPlan(200).x).toBe(1);
  });
});

const require = createRequire(import.meta.url);
const { Dat1, openGame, checkGameFolder } = require('../electron/gamefiles.cjs');

let gameDir = '';
try {
  gameDir = JSON.parse(fs.readFileSync('.local/config.json', 'utf8')).gameDir ?? '';
} catch {
  gameDir = '';
}
const available = Boolean(gameDir) && checkGameFolder(gameDir).ok;

/** Names of all maps: from both archives and from the data folder (it overrides the archives). */
function allMapNames(): string[] {
  const names = new Set<string>();
  for (const archive of ['master.dat', 'critter.dat']) {
    const dat = new Dat1(path.join(gameDir, archive));
    for (const key of dat.entries.keys() as Iterable<string>) if (key.startsWith('MAPS\\') && key.endsWith('.MAP')) names.add(key);
    dat.close();
  }
  const loose = path.join(gameDir, 'data', 'maps');
  if (fs.existsSync(loose)) for (const file of fs.readdirSync(loose)) if (file.toUpperCase().endsWith('.MAP')) names.add('MAPS\\' + file.toUpperCase());
  return [...names].sort();
}

describe.skipIf(!available)('maps from the player\'s Fallout 1 copy', () => {
  const game = available ? openGame(gameDir) : null;
  afterAll(() => game?.close());
  const types = available ? createProtoTypes((name) => game.read(name)) : (null as unknown as ProtoTypes);
  const maps = new Map<string, FalloutMap>();

  it('all maps parse without errors and down to the last byte', () => {
    const names = allMapNames();
    // A fan-localized build has 66 maps, the original English disc 72 (the fans removed extra development maps).
    expect(names.length).toBeGreaterThanOrEqual(66);
    for (const name of names) {
      let map: FalloutMap;
      try {
        map = parseMap(game.read(name), types);
      } catch (error) {
        throw new Error(name + ': ' + (error as Error).message);
      }
      maps.set(name.slice(5, -4), map);
      expect(map.header.version, name).toBe(19);
      expect(map.header.name.toUpperCase(), name).toBe(name.slice(5));
      for (const list of map.objects) {
        for (const obj of list) {
          expect(idType(obj.pid), name).toBeLessThanOrEqual(OBJ_TYPE.misc);
          expect(obj.tile, name).toBeGreaterThanOrEqual(-1);
          expect(obj.tile, name).toBeLessThan(40000);
        }
      }
    }
  }, 30000); // all maps of the copy (66–72): longer than 5 seconds on a loaded machine

  it('the cave by Vault 13: vault door, exits, rats', () => {
    const map = maps.get('V13ENT')!;
    expect(map.elevations[0]).not.toBeNull();
    expect(map.header.enteringElevation).toBe(0);
    const all = map.objects[0]!;
    expect(all.filter((o) => o.exit).length).toBeGreaterThanOrEqual(2);
    expect(all.filter((o) => idType(o.pid) === OBJ_TYPE.critter).length).toBeGreaterThanOrEqual(5);
    expect(all.filter((o) => idType(o.pid) === OBJ_TYPE.wall).length).toBeGreaterThan(300);
    expect(all.some((o) => o.openFlags !== undefined)).toBe(true);
  });

  it('Vault 13: three floors with critters, doors and items', () => {
    const map = maps.get('VAULT13')!;
    expect(map.elevations.map((e) => e !== null)).toEqual([true, true, true]);
    for (const [level, list] of map.objects.entries()) {
      expect(list.length, 'floor ' + level).toBeGreaterThan(100);
      expect(list.some((o) => o.openFlags !== undefined), 'doors on floor ' + level).toBe(true);
    }
    const critters = map.objects.flat().filter((o) => o.critter);
    expect(critters.length).toBeGreaterThan(10);
    expect(map.objects.flat().filter((o) => idType(o.pid) === OBJ_TYPE.item).length).toBeGreaterThan(5);
  });
});
