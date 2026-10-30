// Location editor, original items: furniture, containers and level scenery with keys; edits (move, remove, place)
// reach the game level; a foreign file does not break the game; extras do not stand where furniture is.
import { describe, expect, it } from 'vitest';
import { furnitureKinds, levelDecor } from '../src/world/decor.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';
import { decodeLocation, encodeLocation, levelFromLocation, locationFromLevel } from '../src/world/location-file.ts';

const TEXTURES = new Set(['sand', 'rock', 'adobe']);
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('original items on the level', () => {
  it('levels built from original maps have furniture; keys within a level do not repeat', () => {
    expect(levelDecor(LEVELS['shady-sands-e']!).some((d) => d.kind === 'furniture')).toBe(true);
    for (const def of Object.values(LEVELS)) {
      const keys = levelDecor(def).map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('a level not tied to the original (the test range) has no items', () => {
    expect(levelDecor(LEVELS['polygon']!)).toEqual([]);
  });
});

describe('editing items in an editor location', () => {
  const base = LEVELS['shady-sands-e']!;
  const furniture = levelDecor(base).find((d) => d.kind === 'furniture')!;
  const pid = [...furnitureKinds()][0]!;

  it('untouched — the level has no edits', () => {
    expect(levelFromLocation(locationFromLevel(base), base, seeded()).decor).toBeUndefined();
  });

  it('moved, removed, placed — all in the game level', () => {
    const loc = locationFromLevel(base);
    loc.decor = { moved: { [furniture.key]: { x: 5.5, y: 5.5 } }, removed: ['f999999'], added: [{ x: 6.5, y: 6.5, pid }] };
    expect(levelFromLocation(loc, base, seeded()).decor).toEqual(loc.decor);
  });

  it('extras do not stand in a cell with placed furniture', () => {
    const loc = locationFromLevel(base);
    const crowd = parseLevelDef(base).objects.find((o) => o.kind === 'npc' && o.script === 'BRAHMIN')!;
    const cells: { x: number; y: number; pid: number }[] = [];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) cells.push({ x: Math.floor(crowd.x) + dx + 0.5, y: Math.floor(crowd.y) + dy + 0.5, pid });
    loc.decor = { moved: {}, removed: [], added: cells };
    const blocked = new Set(cells.map((c) => `${Math.floor(c.x)},${Math.floor(c.y)}`));
    for (let seed = 1; seed < 6; seed++) {
      const after = parseLevelDef(levelFromLocation(loc, base, seeded(seed))).objects.filter((o) => o.kind === 'npc' && o.script === 'BRAHMIN');
      for (const o of after) expect(blocked.has(`${Math.floor(o.x)},${Math.floor(o.y)}`)).toBe(false);
    }
  });
});

describe('items in a variant file', () => {
  const base = LEVELS['shady-sands-e']!;
  const items = levelDecor(base);
  const furniture = items.find((d) => d.kind === 'furniture')!;
  const pid = [...furnitureKinds()][0]!;

  it('written and read back — the same', () => {
    const loc = locationFromLevel(base, 'Items');
    loc.decor = { moved: { [furniture.key]: { x: 3.5, y: 4.5 } }, removed: [furniture.key], added: [{ x: 5.5, y: 5.5, pid }] };
    const back = decodeLocation(JSON.parse(JSON.stringify(encodeLocation(loc))), LEVELS, TEXTURES);
    expect(back?.decor).toEqual(loc.decor);
  });

  it('foreign file: unknown key, removing a container, not furniture, point off the map — dropped', () => {
    const container = items.find((d) => d.kind !== 'furniture');
    const file = encodeLocation(locationFromLevel(base, 'x')) as unknown as Record<string, unknown>;
    file.decor = {
      moved: { f999999: { x: 1.5, y: 1.5 }, [furniture.key]: { x: -1, y: 1 } },
      removed: [furniture.key, furniture.key, 'f999999', ...(container ? [container.key] : []), 7],
      added: [{ x: 2.5, y: 2.5, pid }, { x: 2.5, y: 2.5, pid: 16777264 }, { x: 9999, y: 1, pid }, 'junk'],
    };
    const back = decodeLocation(file, LEVELS, TEXTURES);
    expect(back?.decor).toEqual({ moved: {}, removed: [furniture.key], added: [{ x: 2.5, y: 2.5, pid }] });
  });
});

describe('location\'s own blocks', () => {
  const base = LEVELS['shady-sands-e']!;

  it('own door — with its own image, sound and lock; own wall and floor — with their own image', () => {
    const loc = locationFromLevel(base);
    loc.blocks = [
      { id: 'own-1', kind: 'door', texture: 'gothicDoor', name: 'Oak', sound: 'E', locked: true },
      { id: 'own-2', kind: 'wall', texture: 'tire', name: 'Tires' },
      { id: 'own-3', kind: 'floor', texture: 'water', name: 'Puddle' },
    ];
    const cell = loc.floors[1]!.findIndex((b, i) => !b && !loc.floors[1]![i + 1] && !loc.floors[1]![i + 2] && i > loc.width * 5);
    loc.floors[1]![cell] = 'own-1';
    loc.floors[1]![cell + 1] = 'own-2';
    loc.floors[0]![cell + 2] = 'own-3';
    const back = levelFromLocation(loc, base, seeded());
    const x = (cell % loc.width) + 0.5;
    const y = Math.floor(cell / loc.width) + 0.5;
    expect(parseLevelDef(back).objects.find((o) => o.kind === 'door' && o.x === x && o.y === y)).toMatchObject({ texture: 'gothicDoor', sound: 'E', locked: true });
    expect(back.walls?.[back.grid[y - 0.5]![x + 0.5]!]).toBe('tire');
    expect(back.floorPaint?.[cell + 2]).toBe('water');
  });

  it('in the file: written and read back — the same; foreign ones with a bad name, kind, image or sound are dropped', () => {
    const loc = locationFromLevel(base, 'Blocks');
    loc.blocks = [{ id: 'own-1', kind: 'door', texture: 'sand', name: 'Door', sound: 'E', locked: true }];
    loc.floors[1]![5] = 'own-1';
    const textures = new Set([...TEXTURES, 'tire']);
    const back = decodeLocation(JSON.parse(JSON.stringify(encodeLocation(loc))), LEVELS, textures);
    expect(back?.blocks).toEqual(loc.blocks);
    expect(back?.floors[1]![5]).toBe('own-1');
    const file = encodeLocation(loc) as unknown as Record<string, unknown>;
    file.blocks = [
      { id: 'own-1', kind: 'wall', texture: 'tire', name: 'x'.repeat(80), sound: 'E', locked: true },
      { id: 'own-1', kind: 'wall', texture: 'tire', name: 'repeat' },
      { id: '../etc', kind: 'wall', texture: 'tire', name: 'a' },
      { id: 'own-2', kind: 'roof', texture: 'tire', name: 'a' },
      { id: 'own-3', kind: 'floor', texture: 'no-such', name: 'a' },
      { id: 'own-4', kind: 'door', texture: 'sand', name: 'b', sound: 'zz' },
    ];
    expect(decodeLocation(file, LEVELS, textures)?.blocks).toEqual([
      { id: 'own-1', kind: 'wall', texture: 'tire', name: 'x'.repeat(40) },
      { id: 'own-4', kind: 'door', texture: 'sand', name: 'b' },
    ]);
  });
});

describe('exit look on the floor', () => {
  const base = LEVELS['shady-sands-e']!;

  it('a hatch at an exit reaches the level and the file; an unknown look is dropped', () => {
    const loc = locationFromLevel(base, 'Hatch');
    loc.marks!.exits[0]!.look = 'manhole';
    const exit = parseLevelDef(levelFromLocation(loc, base, seeded())).objects.find((o) => o.kind === 'exit' && o.look);
    expect(exit).toMatchObject({ look: 'manhole' });
    const file = JSON.parse(JSON.stringify(encodeLocation(loc)));
    expect(decodeLocation(file, LEVELS, TEXTURES)?.marks?.exits[0]?.look).toBe('manhole');
    file.marks.exits[0].look = 'portal';
    expect(decodeLocation(file, LEVELS, TEXTURES)?.marks?.exits[0]?.look).toBeUndefined();
  });
});
