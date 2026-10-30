// Location editor, critters: important ones stand in their places (or where they were moved), enemies come from the editor, extras
// stand randomly near their place (not behind a door or fence) and are marked "wanders"; nobody stands in a wall, on a door, exit
// or entry; a foreign file does not break the game.
import { describe, expect, it } from 'vitest';
import { buildLevel, solidAt } from '../src/engine/level.ts';
import { parseLevelDef, type LevelDef, type ObjectDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';
import { decodeLocation, encodeLocation, levelFromLocation, locationFromLevel, SCATTER } from '../src/world/location-file.ts';
import { levelPeople } from '../src/world/people.ts';

const TEXTURES = new Set(['sand', 'rock', 'adobe']);
/** A repeatable "chance" for the checks. */
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const peopleOf = (def: LevelDef) => parseLevelDef(def).objects.filter((o): o is Extract<ObjectDef, { kind: 'npc' | 'critter' }> => o.kind === 'npc' || o.kind === 'critter');
const cellKey = (o: { x: number; y: number }) => `${Math.floor(o.x)},${Math.floor(o.y)}`;

describe('who is important, who is an enemy, who is an extra', () => {
  it('important ones always have a script; the radscorpions of the Shady Sands quest are important; rats are enemies', () => {
    for (const def of Object.values(LEVELS)) for (const p of levelPeople(def)) if (p.role === 'important') expect(p.def.script).toBeTruthy();
    expect(levelPeople(LEVELS['shady-caves']!).filter((p) => p.def.script === 'SSRADSCO').every((p) => p.role === 'important')).toBe(true);
    expect(levelPeople(LEVELS['cave']!).filter((p) => p.def.script === 'WANRATS').every((p) => p.role === 'enemy')).toBe(true);
  });

  it('a peaceful critter with a script and a rare prototype (at most two in the whole game) is important, even with an extras script', () => {
    const pids = new Map<number, number>();
    for (const def of Object.values(LEVELS)) for (const p of levelPeople(def)) pids.set(p.def.pid, (pids.get(p.def.pid) ?? 0) + 1);
    for (const def of Object.values(LEVELS)) for (const p of levelPeople(def)) if (p.role === 'crowd' && p.def.script) expect(pids.get(p.def.pid), `${def.id} ${p.key}`).toBeGreaterThan(2);
    const role = (level: string, script: string, pid: number) => levelPeople(LEVELS[level]!).find((p) => p.def.script === script && p.def.pid === pid)?.role;
    // Nicole at the Followers and Sheriff Greene in Adytum have an extras script, but their own prototype.
    expect(role('boneyard-followers', 'FOLSCHOL', 0x01000094)).toBe('important');
    expect(role('boneyard-adytum', 'REGULATR', 0x01000070)).toBe('important');
    expect(levelPeople(LEVELS['boneyard-followers']!).some((p) => p.def.script === 'FOLSCHOL' && p.role === 'crowd')).toBe(true);
    // Brotherhood elders — all three have their own prototype.
    const elders = levelPeople(LEVELS['brotherhood-4']!).filter((p) => p.def.script === 'BROELD');
    expect(elders.length).toBe(3);
    expect(elders.every((p) => p.role === 'important')).toBe(true);
  });

  it('guards are important (Junktown gates, Hub police), ghouls and brahmin are extras', () => {
    const roles = (script: string) => Object.values(LEVELS).flatMap((def) => levelPeople(def).filter((p) => p.def.script === script).map((p) => p.role));
    for (const guard of ['JTGENGRD', 'GENCOP']) {
      expect(roles(guard).length).toBeGreaterThan(2);
      expect(roles(guard).every((r) => r === 'important')).toBe(true);
    }
    for (const crowd of ['GENGHOUL', 'BRAHMIN']) expect(roles(crowd).filter((r) => r === 'crowd').length).toBeGreaterThan(10);
  });

  it('keys of important critters within a level do not repeat', () => {
    for (const def of Object.values(LEVELS)) {
      const keys = levelPeople(def).map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('placement in an editor location', () => {
  for (const id of ['shady-sands-e', 'cave', 'junktown-center']) {
    it(`${id}: nobody is lost, important ones in their places, extras nearby, all on the floor and one per cell`, () => {
      const base = LEVELS[id]!;
      const back = levelFromLocation(locationFromLevel(base), base, seeded());
      const before = peopleOf(base);
      const after = peopleOf(back);
      expect(after.length).toBe(before.length);
      const level = buildLevel(parseLevelDef(back));
      const cells = new Set<string>();
      for (const o of after) {
        expect(solidAt(level, o.x, o.y)).toBe(false);
        cells.add(cellKey(o));
      }
      expect(cells.size).toBe(after.length);
      const passages = new Set(parseLevelDef(back).objects.filter((o) => o.kind === 'door' || o.kind === 'exit' || o.kind === 'elevator').map(cellKey));
      for (const o of after) expect(passages.has(cellKey(o))).toBe(false);
      for (const p of levelPeople(base)) {
        if (p.role !== 'crowd') continue;
        const now = after.find((o) => o.home?.x === p.def.x && o.home?.y === p.def.y && o.pid === p.def.pid) ?? after.find((o) => o.x === p.def.x && o.y === p.def.y);
        expect(now).toBeTruthy();
        expect(Math.abs(Math.floor(now!.x) - Math.floor(p.def.x))).toBeLessThanOrEqual(SCATTER);
      }
    });
  }

  it('nothing changed — important critters and enemies stand in the same places in every game location', () => {
    for (const def of Object.values(LEVELS)) {
      const after = peopleOf(levelFromLocation(locationFromLevel(def), def, seeded()));
      for (const p of levelPeople(def)) if (p.role !== 'crowd') expect(after.some((o) => o.pid === p.def.pid && o.x === p.def.x && o.y === p.def.y && !o.home), `${def.id} ${p.key}`).toBe(true);
    }
  });

  it('extras do not go behind a door or fence: the Shady Sands brahmin stay in the pen with any "chance"', () => {
    const base = LEVELS['shady-sands-e']!;
    const loc = locationFromLevel(base);
    // Pen: fence along x 9–10 and 17–18, y 4 and 15; the gate is a door in cell 17, 11.
    for (let seed = 1; seed <= 30; seed++) {
      const brahmins = peopleOf(levelFromLocation(loc, base, seeded(seed))).filter((o) => o.script === 'BRAHMIN');
      expect(brahmins).toHaveLength(5);
      for (const b of brahmins) {
        expect(Math.floor(b.x), `chance ${seed}`).toBeGreaterThanOrEqual(11);
        expect(Math.floor(b.x), `chance ${seed}`).toBeLessThanOrEqual(16);
        expect(Math.floor(b.y), `chance ${seed}`).toBeGreaterThanOrEqual(5);
        expect(Math.floor(b.y), `chance ${seed}`).toBeLessThanOrEqual(14);
      }
    }
  });

  it('critters stand in their places as in the original: extras do not wander in location variants; nor in game levels', () => {
    for (const id of ['shady-sands-e', 'junktown-center', 'necro-hall']) {
      const base = LEVELS[id]!;
      expect(levelPeople(base).filter((p) => p.role === 'crowd').length, id).toBeGreaterThan(0);
      const after = peopleOf(levelFromLocation(locationFromLevel(base), base, seeded()));
      expect(after.filter((o) => o.kind === 'npc' && o.roam), id).toEqual([]);
    }
    for (const def of Object.values(LEVELS)) for (const o of peopleOf(def)) expect(o.kind === 'npc' && o.roam, def.id).toBeFalsy();
  });

  it('the Brotherhood of Steel stands at its posts: its extras (knights, scribes, initiates) do not wander', () => {
    for (const id of ['brotherhood-2', 'brotherhood-3']) {
      const base = LEVELS[id]!;
      expect(levelPeople(base).filter((p) => p.role === 'crowd').length, id).toBeGreaterThan(0);
      const after = peopleOf(levelFromLocation(locationFromLevel(base), base, seeded()));
      expect(after.filter((o) => o.kind === 'npc' && o.roam), id).toEqual([]);
    }
  });

  it('extras stand differently each time (each game), the same with one "chance"', () => {
    const base = LEVELS['shady-sands-e']!;
    const loc = locationFromLevel(base);
    const a = peopleOf(levelFromLocation(loc, base, seeded(1))).map(cellKey);
    const b = peopleOf(levelFromLocation(loc, base, seeded(1))).map(cellKey);
    const c = peopleOf(levelFromLocation(loc, base, seeded(7))).map(cellKey);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('a wall where an important critter stands — it goes to the nearest free cell and remembers where it stood (home)', () => {
    const base = LEVELS['shady-sands-e']!;
    const important = levelPeople(base).find((p) => p.role === 'important')!;
    const loc = locationFromLevel(base);
    const cell = Math.floor(important.def.y) * loc.width + Math.floor(important.def.x);
    loc.floors[1]![cell] = 'wall-brick';
    const after = peopleOf(levelFromLocation(loc, base, seeded()));
    const moved = after.find((o) => o.script === important.def.script && o.home);
    expect(moved).toBeTruthy();
    expect(moved!.home).toEqual({ x: important.def.x, y: important.def.y });
    expect(Math.hypot(moved!.x - important.def.x, moved!.y - important.def.y)).toBeLessThan(3);
  });

  it('a moved important critter is where it was placed', () => {
    const base = LEVELS['shady-sands-e']!;
    const important = levelPeople(base).find((p) => p.role === 'important')!;
    const loc = locationFromLevel(base);
    const spot = { x: Math.floor(important.def.x) + 2.5, y: Math.floor(important.def.y) + 0.5 };
    // To be sure the cell is empty floor: remove the wall in it.
    loc.floors[1]![Math.floor(spot.y) * loc.width + Math.floor(spot.x)] = null;
    loc.people!.moved[important.key] = spot;
    const after = peopleOf(levelFromLocation(loc, base, seeded()));
    expect(after.some((o) => o.script === important.def.script && o.x === spot.x && o.y === spot.y)).toBe(true);
  });

  it('enemies come from the editor: all removed — none; own one placed — hostile at once', () => {
    const base = LEVELS['cave']!;
    const loc = locationFromLevel(base);
    const rats = loc.people!.enemies.length;
    expect(rats).toBeGreaterThan(0);
    loc.people!.enemies = [];
    expect(peopleOf(levelFromLocation(loc, base, seeded())).filter((o) => o.script === 'WANRATS')).toHaveLength(0);
    const entry = Object.values(parseLevelDef(base).entries)[0]!;
    loc.people!.enemies = [{ x: entry.x + 1, y: entry.y, pid: 0x01000030, weapon: 8 }];
    const added = peopleOf(levelFromLocation(loc, base, seeded())).at(-1)!;
    expect(added).toMatchObject({ kind: 'critter', pid: 0x01000030, weapon: 8 });
  });

  it('an item in a wall goes to the nearest floor', () => {
    const base = LEVELS['shady-sands-e']!;
    const item = parseLevelDef(base).objects.find((o) => o.kind === 'item')!;
    const loc = locationFromLevel(base);
    loc.floors[1]![Math.floor(item.y) * loc.width + Math.floor(item.x)] = 'wall-brick';
    const back = levelFromLocation(loc, base, seeded());
    const level = buildLevel(parseLevelDef(back));
    const moved = parseLevelDef(back).objects.filter((o) => o.kind === 'item' && o.pid === item.pid);
    expect(moved.every((o) => !solidAt(level, o.x, o.y))).toBe(true);
  });
});

describe('critters in a variant file', () => {
  it('written and read back — the same', () => {
    const base = LEVELS['shady-sands-e']!;
    const loc = locationFromLevel(base, 'Critters');
    const important = levelPeople(base).find((p) => p.role === 'important')!;
    loc.people!.moved[important.key] = { x: 3.5, y: 4.5 };
    loc.people!.enemies.push({ x: 5.5, y: 5.5, pid: 0x01000030, weapon: 8 });
    const back = decodeLocation(JSON.parse(JSON.stringify(encodeLocation(loc))), LEVELS, TEXTURES);
    expect(back?.people).toEqual(loc.people);
  });

  it('foreign file: unknown key, not a critter, not an enemy script, point off the map — dropped', () => {
    const base = LEVELS['shady-sands-e']!;
    const file = encodeLocation(locationFromLevel(base, 'x')) as unknown as Record<string, unknown>;
    file.people = {
      moved: { 'NOBODY#0': { x: 1.5, y: 1.5 }, [levelPeople(base).find((p) => p.role === 'important')!.key]: { x: -3, y: 1 } },
      enemies: [
        { x: 2.5, y: 2.5, pid: 0x01000030, script: 'OVER' },
        { x: 2.5, y: 2.5, pid: 0x00000030 },
        { x: 9999, y: 2.5, pid: 0x01000030 },
        { x: 2.5, y: 2.5, pid: 0x01000030, script: 'WANRATS', weapon: -1, npc: 'yes' },
        'junk',
      ],
    };
    const back = decodeLocation(file, LEVELS, TEXTURES);
    expect(back?.people).toEqual({
      moved: {},
      enemies: [
        { x: 2.5, y: 2.5, pid: 0x01000030 },
        { x: 2.5, y: 2.5, pid: 0x01000030, script: 'WANRATS' },
      ],
    });
  });

  it('a file without critters (stages 1–3) — important ones in their places, enemies as in the level', () => {
    const base = LEVELS['cave']!;
    const loc = locationFromLevel(base);
    delete loc.people;
    const after = peopleOf(levelFromLocation(loc, base, seeded()));
    expect(after.length).toBe(peopleOf(base).length);
  });
});
