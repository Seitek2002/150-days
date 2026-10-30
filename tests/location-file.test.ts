// Location editor: a game level goes through the editor floors without loss, a variant file reads back, a foreign or
// corrupted file does not break the game.
import { describe, expect, it } from 'vitest';
import { blocksIn, buildLevel, solidAt } from '../src/engine/level.ts';
import { DOOR_BLOCK, WINDOW_BLOCK } from '../src/world/block-catalog.ts';
import { parseLevelDef, type LevelDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';
import { decodeLocation, encodeLocation, levelFromLocation, locationFromLevel, LOCATION_FORMAT } from '../src/world/location-file.ts';

const built = (def: LevelDef) => buildLevel(parseLevelDef(def));
const doors = (def: LevelDef) =>
  parseLevelDef(def)
    .objects.filter((o) => o.kind === 'door')
    .map((o) => `${Math.floor(o.x)},${Math.floor(o.y)}`)
    .sort();
const TEXTURES = new Set(['sand', 'rock', 'adobe', 'adobeLight', 'adobeRoof', 'adobePost', 'adobeWindow', 'wasteland', 'dirt', 'gothicWall', 'cathDome']);

describe('level → floors → level', () => {
  for (const id of ['shady-sands-e', 'vault13-1', 'cathedral-ent']) {
    it(`${id}: the same walls, heights, doors and entries`, () => {
      const base = LEVELS[id]!;
      const back = levelFromLocation(locationFromLevel(base), base);
      const a = built(base);
      const b = built(back);
      expect(b.walls).toEqual(a.walls);
      const tall = (h: Float32Array | undefined, i: number) => Math.max(1, Math.ceil((h?.[i] || 1) - 1e-6));
      for (let i = 0; i < a.walls.length; i++) if (a.walls[i]) expect(tall(b.heights, i)).toBe(tall(a.heights, i));
      expect(doors(back)).toEqual(doors(base));
      expect(Object.keys(parseLevelDef(back).entries).sort()).toEqual(Object.keys(parseLevelDef(base).entries).sort());
    });
  }
});

describe('editing floors', () => {
  it('a wall on floor 1 is a wall; another block above it is a two-storey wall; a door is a door; a floor is the cell image', () => {
    const base = LEVELS['shady-sands-e']!;
    const loc = locationFromLevel(base);
    // An empty cell in the middle of the village: check that it is floor.
    const cell = loc.floors[1]!.findIndex((b, i) => !b && i > loc.width * 5);
    loc.floors[1]![cell] = 'wall-brick';
    while (loc.floors.length < 3) loc.floors.push(new Array(loc.width * loc.height).fill(null));
    loc.floors[2]![cell] = 'wall-brick';
    loc.floors[1]![cell + 1] = DOOR_BLOCK;
    loc.floors[1]![cell + 2] = null;
    loc.floors[0]![cell + 2] = 'floor-asphalt';
    const level = built(levelFromLocation(loc, base));
    expect(level.walls[cell]).toBe('brick');
    expect(level.heights?.[cell]).toBe(2);
    expect(level.walls[cell + 1]).toBeNull();
    expect(doors(levelFromLocation(loc, base))).toContain(`${(cell + 1) % loc.width},${Math.floor(cell / loc.width)}`);
    expect(level.floorMarks?.get(cell + 2)?.texture).toBe('asphalt');
  });
});

describe('variant file', () => {
  it('written and read back — the same', () => {
    const loc = locationFromLevel(LEVELS['shady-sands-e']!, 'My variant');
    loc.floors[0]![3] = 'floor-sand';
    const file = JSON.parse(JSON.stringify(encodeLocation(loc)));
    expect(file.format).toBe(LOCATION_FORMAT);
    expect(decodeLocation(file, LEVELS, TEXTURES)).toEqual(loc);
  });

  it('foreign file: unknown level, wrong size, junk — not read; unknown block — empty', () => {
    const loc = locationFromLevel(LEVELS['shady-sands-e']!, 'x');
    const file = encodeLocation(loc);
    expect(decodeLocation({ ...file, base: 'no-such-level' }, LEVELS, TEXTURES)).toBeNull();
    expect(decodeLocation({ ...file, width: 100000 }, LEVELS, TEXTURES)).toBeNull();
    expect(decodeLocation('hello', LEVELS, TEXTURES)).toBeNull();
    expect(decodeLocation({ ...file, format: 'other' }, LEVELS, TEXTURES)).toBeNull();
    const strange = { ...file, legend: { ...file.legend, Z: 'tex:../../evil' }, floors: [file.floors[0]!.map((r, y) => (y === 0 ? 'Z' + r.slice(1) : r)), ...file.floors.slice(1)] };
    expect(decodeLocation(strange, LEVELS, TEXTURES)!.floors[0]![0]).toBeNull();
  });
});

describe('floor 2: openings, windows, images by height', () => {
  const base = LEVELS['shady-sands-e']!;
  /** An empty square in the middle of the village: 6×4 floor cells, three floors (0, 1, 2). */
  const setup = () => {
    const loc = locationFromLevel(base);
    while (loc.floors.length < 3) loc.floors.push(new Array(loc.width * loc.height).fill(null));
    const at = (x: number, y: number) => y * loc.width + x;
    return { loc, at };
  };

  it('arch: empty on floor 1, brick on floor 2 — passable, with a hanging block above', () => {
    const { loc, at } = setup();
    loc.floors[2]![at(30, 32)] = 'wall-brick';
    const level = built(levelFromLocation(loc, base));
    expect(level.walls[at(30, 32)]).toBeNull();
    expect(solidAt(level, 30.5, 32.5)).toBe(false);
    const [lintel] = blocksIn(level, at(30, 32));
    expect(lintel).toMatchObject({ base: 1, height: 2, front: 'brick' });
    expect(lintel!.group).toBeDefined();
  });

  it('door with a lintel: the door stays a door, with a block above it', () => {
    const { loc, at } = setup();
    loc.floors[1]![at(30, 32)] = DOOR_BLOCK;
    loc.floors[2]![at(30, 32)] = 'wall-brick';
    const def = levelFromLocation(loc, base);
    expect(doors(def)).toContain('30,32');
    expect(blocksIn(built(def), at(30, 32))).toHaveLength(1);
  });

  it('brick below, plaster above — a two-storey wall with two images', () => {
    const { loc, at } = setup();
    loc.floors[1]![at(30, 32)] = 'wall-brick';
    loc.floors[2]![at(30, 32)] = 'wall-plaster';
    const level = built(levelFromLocation(loc, base));
    expect(level.walls[at(30, 32)]).toBe('brick');
    expect(level.heights?.[at(30, 32)]).toBe(2);
    expect(level.wallLayers?.[at(30, 32)]).toEqual(['brick', 'plaster']);
  });

  it('window on floor 1: cannot walk through; the sill and the top of the opening come from the wall above', () => {
    const { loc, at } = setup();
    loc.floors[1]![at(30, 32)] = WINDOW_BLOCK;
    loc.floors[2]![at(30, 32)] = 'wall-brick';
    const level = built(levelFromLocation(loc, base));
    expect(level.walls[at(30, 32)]).toBeNull();
    expect(solidAt(level, 30.5, 32.5)).toBe(true);
    const window = blocksIn(level, at(30, 32)).find((b) => b.parts);
    expect(window!.parts!.map((p) => [p.base, p.height, p.front])).toEqual([
      [0, 0.35, 'brick'],
      [0.8, 1, 'brick'],
    ]);
  });

  it('a 3×2 room ceiling is one block (copies in every cell with one number)', () => {
    const { loc, at } = setup();
    for (let y = 30; y < 32; y++) for (let x = 28; x < 31; x++) loc.floors[2]![at(x, y)] = 'wall-concrete';
    const level = built(levelFromLocation(loc, base));
    const copies = [28, 29, 30].flatMap((x) => [30, 31].flatMap((y) => blocksIn(level, at(x, y))));
    expect(copies).toHaveLength(6);
    expect(new Set(copies.map((b) => b.group)).size).toBe(1);
    expect(copies[0]).toMatchObject({ x0: 28, x1: 31, y0: 30, y1: 32, base: 1, height: 2 });
    expect(solidAt(level, 29.5, 30.5)).toBe(false);
  });
});

describe('transitions: entries, exits, lifts', () => {
  const base = LEVELS['shady-sands-e']!;
  const objectsOf = (def: LevelDef) => parseLevelDef(def).objects;

  it('own transitions replace the level\'s exits, lifts and entries', () => {
    const loc = locationFromLevel(base);
    loc.marks = {
      entries: { entry1: { x: 30.5, y: 31.5, angle: Math.PI } },
      exits: [{ x: 10.5, y: 10.5, to: { map: 'wasteland', entry: 'shadySands' }, use: true }],
      lifts: [{ x: 29.5, y: 30.5, floors: [{ map: 'shady-sands-e', entry: 'entry1' }, { map: 'shady-sands-w', entry: 'wasteland' }], current: 0, art: 146 }],
    };
    const def = levelFromLocation(loc, base);
    const objects = objectsOf(def);
    expect(objects.filter((o) => o.kind === 'exit')).toEqual([{ kind: 'exit', x: 10.5, y: 10.5, to: { map: 'wasteland', entry: 'shadySands' }, use: true }]);
    expect(objects.filter((o) => o.kind === 'elevator')).toHaveLength(1);
    expect(Object.keys(parseLevelDef(def).entries)).toEqual(['entry1']);
    // The critters stayed.
    expect(objects.filter((o) => o.kind === 'npc').length).toBe(objectsOf(base).filter((o) => o.kind === 'npc').length);
  });

  it('without own transitions (a stage-one file) — the game level\'s transitions', () => {
    const loc = locationFromLevel(base);
    delete loc.marks;
    const def = levelFromLocation(loc, base);
    expect(objectsOf(def).filter((o) => o.kind === 'exit').length).toBe(objectsOf(base).filter((o) => o.kind === 'exit').length);
  });

  it('foreign file: address to an unknown location, bad entry name, point off the map — dropped', () => {
    const loc = locationFromLevel(base, 'x');
    const file = JSON.parse(JSON.stringify(encodeLocation(loc)));
    file.marks = {
      entries: { good: { x: 1.5, y: 1.5, angle: 0 }, '../bad': { x: 1.5, y: 1.5, angle: 0 }, far: { x: 9999, y: 1, angle: 0 } },
      exits: [{ x: 2.5, y: 2.5, to: { map: 'no-such', entry: 'a' } }, { x: 3.5, y: 3.5, to: { map: 'shady-sands-w', entry: 'wasteland' } }],
      lifts: [{ x: 4.5, y: 4.5, floors: [{ map: 'shady-sands-w', entry: 'wasteland' }], current: 5 }],
    };
    const read = decodeLocation(file, LEVELS, TEXTURES)!;
    expect(Object.keys(read.marks!.entries)).toEqual(['good']);
    expect(read.marks!.exits).toEqual([{ x: 3.5, y: 3.5, to: { map: 'shady-sands-w', entry: 'wasteland' } }]);
    expect(read.marks!.lifts).toEqual([]);
  });
});
