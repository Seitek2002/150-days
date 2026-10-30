// Parsing PRO prototypes. The first part runs on hand-built bytes (always runs),
// the second on a real Fallout 1 copy (path from .local/config.json; no copy — skipped).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
import {
  BODY_TYPE,
  DAMAGE_TYPE,
  ITEM_TYPE,
  OBJ_TYPE,
  SCENERY_TYPE,
  STAT,
  idIndex,
  idType,
  isExitGrid,
  parseProto,
  type AnyProto,
} from '../src/formats/pro.ts';
import { parseLst, parseMsg } from '../src/formats/text.ts';

/** Builds a file from 32-bit numbers and single bytes: a number → 4 bytes big-endian, `{ b: n }` → 1 byte. */
function build(...parts: (number | { b: number })[]): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'number') out.push((part >>> 24) & 255, (part >>> 16) & 255, (part >>> 8) & 255, part & 255);
    else out.push(part.b);
  }
  return Uint8Array.from(out);
}

describe('parsing PRO from hand-built bytes', () => {
  const itemHead = (pid: number, type: number) => [pid, 100, 0x1000001, 0, 0, 0, 0, -1, type, 3, 1, 10, 50, 0x1000002, { b: 48 }];

  it('armor: class, 7 DR, 7 DT, images', () => {
    const bytes = build(
      ...itemHead(1, ITEM_TYPE.armor),
      15, // armor class
      25, 20, 20, 10, 30, 500, 20, // DR
      2, 0, 1, 0, 0, 0, 3, // DT
      -1, // perk
      0x1000010, 0x1000011, // images for male and female
    );
    const proto = parseProto(bytes);
    expect(proto.kind).toBe('item');
    if (proto.kind !== 'item') return;
    expect(proto.armor).toMatchObject({ armorClass: 15, perk: -1, maleFid: 0x1000010, femaleFid: 0x1000011 });
    expect(proto.armor?.damageResistance).toEqual([25, 20, 20, 10, 30, 500, 20]);
    expect(proto.armor?.damageThreshold[DAMAGE_TYPE.normal]).toBe(2);
    expect(proto.armor?.damageThreshold[DAMAGE_TYPE.explosion]).toBe(3);
  });

  it('container, key and "misc"', () => {
    const container = parseProto(build(...itemHead(0x42, ITEM_TYPE.container), 250, 9));
    const key = parseProto(build(...itemHead(0x52, ITEM_TYPE.key), 77));
    const misc = parseProto(build(...itemHead(0x34, ITEM_TYPE.misc), 38, 3, 200));
    expect(container.kind === 'item' && container.container).toEqual({ maxSize: 250, openFlags: 9 });
    expect(key.kind === 'item' && key.key).toEqual({ keyCode: 77 });
    expect(misc.kind === 'item' && misc.misc).toEqual({ powerPid: 38, powerType: 3, charges: 200 });
  });

  it('weapon: the weapon\'s own sound is separate from the common byte', () => {
    const bytes = build(
      ...itemHead(8, ITEM_TYPE.weapon),
      4, 5, 12, DAMAGE_TYPE.normal, 24, 0, -1, 3, 5, 6, 0, -1, 0, 7, 29, 12,
      { b: 65 },
    );
    const proto = parseProto(bytes);
    if (proto.kind !== 'item') throw new Error('not an item');
    expect(proto.soundCode).toBe('0');
    expect(proto.weapon).toMatchObject({ minDamage: 5, maxDamage: 12, range: 24, ammoPid: 29, capacity: 12, soundCode: 'A', animationCode: 4 });
  });

  it('scenery: door, lift, rope ladder, plain', () => {
    const head = (pid: number, type: number) => [pid, 0, 0x2000001, 0, 0, 0x10, 0, -1, type, 2, { b: 0 }];
    const door = parseProto(build(...head(0x2000002, SCENERY_TYPE.door), 1, 5));
    const lift = parseProto(build(...head(0x2000026, SCENERY_TYPE.elevator), 2, 1));
    const ladder = parseProto(build(...head(0x200008b, SCENERY_TYPE.ladderUp), 9));
    const plain = parseProto(build(...head(0x2000003, SCENERY_TYPE.generic), 0));
    expect(door.kind === 'scenery' && door.door).toEqual({ openFlags: 1, keyCode: 5 });
    expect(lift.kind === 'scenery' && lift.elevator).toEqual({ type: 2, level: 1 });
    expect(ladder.kind === 'scenery' && ladder.ladder).toBe(9);
    expect(plain.kind === 'scenery' && plain.type).toBe(SCENERY_TYPE.generic);
  });

  it('wall, tile and map exit', () => {
    const wall = parseProto(build(0x3000001, 0, 0x3000001, 0, 0, 0x8, 0, -1, 4));
    const tile = parseProto(build(0x4000001, 0, 0x4000001, 0, 0, -1, 2));
    const exit = parseProto(build(0x5000010, 0, 0x5000010, 0, 0, 0x10, 0));
    const other = parseProto(build(0x5000001, 0, 0x5000001, 0, 0, 0x10, 0));
    expect(wall).toMatchObject({ kind: 'wall', material: 4, flags: 8 });
    expect(tile).toMatchObject({ kind: 'tile', material: 2 });
    expect(exit).toMatchObject({ kind: 'misc', exitGrid: true });
    expect(other).toMatchObject({ kind: 'misc', exitGrid: false });
    expect(isExitGrid(0x5000017)).toBe(true);
    expect(isExitGrid(0x5000018)).toBe(false);
  });

  it('critter: DT, DR, body, AI packet, team', () => {
    const base = Array.from({ length: 35 }, (_, i) => i);
    const bonus = Array.from({ length: 35 }, () => 1);
    const bytes = build(
      0x1000030, 0, 0x1000030, 0, 0, 0, 0, -1, // common part
      -1, 5, 6, // head, AI packet, team
      0, // critter flags
      ...base,
      ...bonus,
      ...Array.from({ length: 18 }, () => 0),
      BODY_TYPE.quadruped, 20, 7,
    );
    const proto = parseProto(bytes);
    if (proto.kind !== 'critter') throw new Error('not a critter');
    expect(proto).toMatchObject({ aiPacket: 5, team: 6, bodyType: BODY_TYPE.quadruped, experience: 20, killType: 7 });
    expect(proto.damageThreshold).toEqual([18, 19, 20, 21, 22, 23, 24]);
    expect(proto.damageResistance).toEqual([25, 26, 27, 28, 29, 30, 31]);
    expect(proto.stats[STAT.maxHp]).toBe(8);
  });

  it('extra or missing bytes are an error', () => {
    const wall = build(0x3000001, 0, 0x3000001, 0, 0, 0x8, 0, -1, 4);
    expect(() => parseProto(Uint8Array.from([...wall, 0]))).toThrow();
    expect(() => parseProto(wall.subarray(0, wall.length - 2))).toThrow();
    expect(() => parseProto(build(0x7000001, 0))).toThrow();
  });
});

const require = createRequire(import.meta.url);
const { Dat1, openGame, checkGameFolder, normalize } = require('../electron/gamefiles.cjs');

let gameDir = '';
try {
  gameDir = JSON.parse(fs.readFileSync('.local/config.json', 'utf8')).gameDir ?? '';
} catch {
  gameDir = '';
}
const available = Boolean(gameDir) && checkGameFolder(gameDir).ok;

const DIRS = [
  ['ITEMS', OBJ_TYPE.item, 'item'],
  ['CRITTERS', OBJ_TYPE.critter, 'critter'],
  ['SCENERY', OBJ_TYPE.scenery, 'scenery'],
  ['WALLS', OBJ_TYPE.wall, 'wall'],
  ['TILES', OBJ_TYPE.tile, 'tile'],
  ['MISC', OBJ_TYPE.misc, 'misc'],
] as const;

/** Names of all PRO files: from both archives and from the data folder (it overrides the archives). */
function allProNames(): string[] {
  const names = new Set<string>();
  for (const archive of ['master.dat', 'critter.dat']) {
    const dat = new Dat1(path.join(gameDir, archive));
    for (const key of dat.entries.keys() as Iterable<string>) if (key.startsWith('PROTO\\') && key.endsWith('.PRO')) names.add(key);
    dat.close();
  }
  const loose = path.join(gameDir, 'data', 'proto');
  const walk = (dir: string, prefix: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix + '\\' + entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.name.toUpperCase().endsWith('.PRO')) names.add(normalize(rel));
    }
  };
  walk(loose, 'PROTO');
  return [...names].sort();
}

describe.skipIf(!available)('prototypes from the player\'s Fallout 1 copy', () => {
  const game = available ? openGame(gameDir) : null;
  afterAll(() => game?.close());
  const read = (name: string): Uint8Array => {
    const data = game.read(name);
    if (!data) throw new Error('No file ' + name);
    return data;
  };
  const byDir = new Map<string, AnyProto[]>();

  it('all PRO files parse without errors and match the catalog', () => {
    const names = allProNames();
    expect(names.length).toBeGreaterThan(3000);
    for (const [dir] of DIRS) byDir.set(dir, []);
    for (const name of names) {
      const dir = name.split('\\')[1]!;
      const spec = DIRS.find((d) => d[0] === dir);
      if (!spec) throw new Error('Unknown catalog ' + name);
      let proto: AnyProto;
      try {
        proto = parseProto(read(name));
      } catch (error) {
        throw new Error(name + ': ' + (error as Error).message);
      }
      expect(idType(proto.pid), name).toBe(spec[1]);
      expect(proto.kind, name).toBe(spec[2]);
      byDir.get(dir)!.push(proto);
    }
    for (const [dir] of DIRS) expect(byDir.get(dir)!.length, dir).toBeGreaterThan(0);
  }, 30_000); // Reads three thousand files from the game copy: in a full run it does not finish in 5 seconds.

  it('in every LST list the line number equals the number in the identifier', () => {
    for (const [dir, objType] of DIRS) {
      const files = parseLst(read(`PROTO\\${dir}\\${dir}.LST`));
      let checked = 0;
      files.forEach((file, i) => {
        if (!file) return;
        const proto = parseProto(read(`PROTO\\${dir}\\${file}`));
        expect(idType(proto.pid), `${dir}/${file}`).toBe(objType);
        expect(idIndex(proto.pid), `${dir}/${file}`).toBe(i + 1);
        checked++;
      });
      expect(checked, dir).toBeGreaterThan(0);
    }
    // A heavy test: under the load of a full run it does not fit into 5 seconds.
  }, 30_000);

  it('leather armor: armor class above zero, DT and DR for seven damage types', () => {
    const msg = parseMsg(read('TEXT\\ENGLISH\\GAME\\PRO_ITEM.MSG'));
    const armors = (byDir.get('ITEMS') ?? []).filter((p) => p.kind === 'item' && p.type === ITEM_TYPE.armor);
    expect(armors.length).toBeGreaterThanOrEqual(4);
    const leather = armors.find((p) => p.kind === 'item' && /Leather Armor|Кожаная броня/i.test(msg.get(p.messageId) ?? ''));
    expect(leather?.kind === 'item' && leather.armor?.armorClass).toBeGreaterThan(0);
    for (const armor of armors) {
      if (armor.kind !== 'item') continue;
      expect(armor.armor?.damageResistance).toHaveLength(7);
      expect(armor.armor?.damageThreshold).toHaveLength(7);
    }
  });

  it('doors, lift, ladders and map exits', () => {
    const scenery = (byDir.get('SCENERY') ?? []).filter((p) => p.kind === 'scenery');
    const ofType = (type: number) => scenery.filter((p) => p.type === type);
    const doors = ofType(SCENERY_TYPE.door);
    expect(doors.length).toBeGreaterThan(10);
    expect(doors.every((p) => p.door !== undefined)).toBe(true);
    // The door with identifier 0x2000002 is the ordinary vault and cave door.
    expect(scenery.find((p) => p.pid === 0x2000002)?.type).toBe(SCENERY_TYPE.door);
    expect(ofType(SCENERY_TYPE.elevator).length).toBeGreaterThanOrEqual(1);
    expect(ofType(SCENERY_TYPE.ladderUp).length + ofType(SCENERY_TYPE.ladderDown).length).toBeGreaterThanOrEqual(2);
    expect(ofType(SCENERY_TYPE.stairs).length).toBeGreaterThanOrEqual(1);
    const exits = (byDir.get('MISC') ?? []).filter((p) => p.kind === 'misc' && p.exitGrid);
    expect(exits).toHaveLength(8);
  });

  it('critters: body type, AI packet, team, DT and DR; the cave rat has 6 HP', () => {
    const critters = (byDir.get('CRITTERS') ?? []).filter((p) => p.kind === 'critter');
    expect(critters.length).toBeGreaterThan(300);
    for (const c of critters) {
      expect(c.stats).toHaveLength(35);
      expect(c.damageThreshold).toHaveLength(7);
      expect(c.damageResistance).toHaveLength(7);
      expect(c.damageThreshold).toEqual(c.stats.slice(STAT.damageThreshold, STAT.damageThreshold + 7));
      expect([BODY_TYPE.biped, BODY_TYPE.quadruped, BODY_TYPE.robotic]).toContain(c.bodyType);
    }
    // The cave rat is line 48 in CRITTERS.LST (identifier 0x1000030).
    const rat = critters.find((c) => c.pid === 0x1000030);
    expect(rat?.stats[STAT.maxHp]).toBe(6);
    expect(rat).toMatchObject({ bodyType: BODY_TYPE.quadruped, team: 5, aiPacket: 12 });
  });

  it('10mm pistol: the weapon\'s own sound is "A", and such a file exists in the game', () => {
    const items = parseLst(read('PROTO\\ITEMS\\ITEMS.LST'));
    const pistol = parseProto(read('PROTO\\ITEMS\\' + items[8 - 1]));
    if (pistol.kind !== 'item') throw new Error('not an item');
    expect(pistol.weapon).toMatchObject({ minDamage: 5, maxDamage: 12, soundCode: 'A' });
    expect(game.read('SOUND\\SFX\\WAA1XXX1.ACM')).not.toBeNull();
  });
});
