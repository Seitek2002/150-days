// Checks of all game levels (src/world/levels): parsing, reachability, transitions, doors; the game clock.
import { describe, expect, it } from 'vitest';
import { buildLevel, DOOR_PASSABLE, solidAt, wallAt } from '../src/engine/level.ts';
import { Clock, LOCAL_SPEED } from '../src/game/clock.ts';
import { isSaveData } from '../src/game/save.ts';
import { parseLevelDef, type ParsedLevel } from '../src/world/defs.ts';
import { PLACES } from '../src/world/worldmap.ts';
import { LEVELS, NEW_GAME } from '../src/world/levels/index.ts';

/** All cells reachable on foot from a point (doors count as passable — they can be opened). */
function reachable(parsed: ParsedLevel, from: { x: number; y: number }): Set<number> {
  const seen = new Set<number>();
  const queue = [Math.floor(from.y) * parsed.width + Math.floor(from.x)];
  while (queue.length) {
    const cell = queue.pop()!;
    if (seen.has(cell)) continue;
    seen.add(cell);
    const x = cell % parsed.width;
    const y = Math.floor(cell / parsed.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= parsed.width || ny >= parsed.height) continue;
      if (!parsed.walls[ny * parsed.width + nx]) queue.push(ny * parsed.width + nx);
    }
  }
  return seen;
}

const cellOf = (p: ParsedLevel, x: number, y: number) => Math.floor(y) * p.width + Math.floor(x);

describe('levels', () => {
  for (const def of Object.values(LEVELS)) {
    describe(def.id, () => {
      const parsed = parseLevelDef(def);

      it('parses, edges are closed by walls, there is an entry point', () => {
        expect(Object.keys(parsed.entries).length).toBeGreaterThan(0);
        for (let x = 0; x < parsed.width; x++) {
          expect(parsed.walls[x], `top edge, x=${x}`).not.toBeNull();
          expect(parsed.walls[(parsed.height - 1) * parsed.width + x], `bottom edge, x=${x}`).not.toBeNull();
        }
        for (let y = 0; y < parsed.height; y++) {
          expect(parsed.walls[y * parsed.width], `left edge, y=${y}`).not.toBeNull();
          expect(parsed.walls[y * parsed.width + parsed.width - 1], `right edge, y=${y}`).not.toBeNull();
        }
      });

      it('every object can be reached from each entry point', () => {
        // A location of separate parts (LevelDef.separateParts): each object is reachable from at least one entry.
        if (def.separateParts) {
          const seen = new Set<number>();
          for (const [name, entry] of Object.entries(parsed.entries)) {
            expect(parsed.walls[cellOf(parsed, entry.x, entry.y)], `entry point "${name}" is in a wall`).toBeNull();
            for (const c of reachable(parsed, entry)) seen.add(c);
          }
          for (const o of parsed.objects) {
            const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(cellOf(parsed, o.x + dx!, o.y + dy!)));
            expect(near, `${o.kind} at ${o.x},${o.y} is unreachable from any entry`).toBe(true);
          }
          return;
        }
        for (const [name, entry] of Object.entries(parsed.entries)) {
          expect(parsed.walls[cellOf(parsed, entry.x, entry.y)], `entry point "${name}" is in a wall`).toBeNull();
          const seen = reachable(parsed, entry);
          for (const o of parsed.objects) {
            if (o.kind === 'exit' && o.use) {
              // An exit "by E" is in a wall (a vault door): it is enough to reach the neighbouring cell.
              const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(cellOf(parsed, o.x + dx!, o.y + dy!)));
              expect(near, `the exit at ${o.x},${o.y} cannot be reached from "${name}"`).toBe(true);
            } else {
              expect(seen.has(cellOf(parsed, o.x, o.y)), `${o.kind} at ${o.x},${o.y} is unreachable from "${name}"`).toBe(true);
            }
          }
        }
      });

      it('exits and lifts lead to existing maps and entry points', () => {
        const targets = parsed.objects.flatMap((o) => (o.kind === 'exit' ? [o.to] : o.kind === 'elevator' ? o.floors : []));
        for (const to of targets) {
          if (to.map === 'worldmap') continue;
          // To the wasteland — to the location on the world map: the entry is the location key; "middle" — where the hero is (caravan ambushes on the road).
          if (to.map === 'wasteland') {
            if (to.entry === 'middle') continue;
            expect(PLACES[to.entry as keyof typeof PLACES], `no location ${to.entry}`).toBeTruthy();
            continue;
          }
          const target = LEVELS[to.map];
          expect(target, `no map ${to.map}`).toBeTruthy();
          expect(parseLevelDef(target!).entries[to.entry], `${to.map} has no entry "${to.entry}"`).toBeTruthy();
        }
      });

      it('a lift\'s floor number matches this map', () => {
        for (const o of parsed.objects) {
          if (o.kind === 'elevator') expect(o.floors[o.current]?.map).toBe(def.id);
        }
      });
    });
  }

  it('a new game starts on an existing map', () => {
    expect(parseLevelDef(LEVELS[NEW_GAME.map]!).entries[NEW_GAME.entry]).toBeTruthy();
  });

  it('an unknown letter in the grid is a clear error', () => {
    expect(() =>
      parseLevelDef({ id: 'bad', music: '', floor: 'floor', ceiling: 'ceiling', fade: 5, grid: ['###', '#?#', '###'] }),
    ).toThrow(/unknown mark/);
  });
});

describe('doors', () => {
  const parsed = parseLevelDef({
    id: 'doors',
    music: '',
    floor: 'floor',
    ceiling: 'ceiling',
    fade: 5,
    grid: ['#####', '#.+.#', '##+##', '#...#', '#####'],
    marks: { '+': { kind: 'door' } },
    entries: { a: { x: 1.5, y: 1.5, angle: 0 } },
  });
  const level = buildLevel(parsed);

  it('a door stands across the passage', () => {
    // In row 1 there is floor on both sides of the door — a west-east passage, the door stands along the y axis.
    expect(level.doors.get(1 * 5 + 2)?.axis).toBe('y');
    // In row 2 there are walls on both sides — a north-south passage, the door along the x axis.
    expect(level.doors.get(2 * 5 + 2)?.axis).toBe('x');
  });

  it('a closed door is impassable, an open one is passable', () => {
    const door = level.doors.get(2 * 5 + 2)!;
    expect(wallAt(level, 2.5, 2.5)).toBeNull();
    expect(solidAt(level, 2.5, 2.5)).toBe(true);
    door.open = DOOR_PASSABLE;
    expect(solidAt(level, 2.5, 2.5)).toBe(false);
  });
});

describe('game clock', () => {
  it('150 days for the chip and +100 for a caravan', () => {
    const clock = new Clock();
    expect(clock.day).toBe(1);
    expect(clock.daysLeft).toBe(150);
    clock.advance(10 * 24 * 3600);
    expect(clock.day).toBe(11);
    expect(clock.daysLeft).toBe(140);
    clock.extraDays = 100;
    expect(clock.daysLeft).toBe(240);
  });

  it('time on the map runs faster than real time', () => {
    const clock = new Clock();
    clock.tick(60);
    expect(clock.seconds).toBe(60 * LOCAL_SPEED);
    expect(clock.date).toMatchObject({ year: 2161, month: 12, day: 5 });
  });

  it('the clock is saved and restored', () => {
    const clock = new Clock();
    clock.advance(12345);
    clock.extraDays = 100;
    expect(Clock.from(clock.toJSON())).toMatchObject({ seconds: 12345, extraDays: 100 });
  });
});

describe('saving', () => {
  it('foreign and broken data are not accepted as a save', () => {
    expect(isSaveData(null)).toBe(false);
    expect(isSaveData({ version: 999 })).toBe(false);
    expect(isSaveData({ version: 1, map: 'cave', player: {}, hero: {}, maps: {} })).toBe(true);
  });
});
