// The wasteland in first person: a 3×3 window of world map squares is assembled predictably and can be walked through.
import { describe, expect, it } from 'vitest';
import { buildLevel, GLOW, wallAt } from '../src/engine/level.ts';
import { findPath } from '../src/engine/path.ts';
import { outdoorAt } from '../src/game/daylight.ts';
import { healTicks } from '../src/game/hero.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { ENCOUNTERS, SQUARE_CELLS, squareAt, squareMiddle, wastelandWindow, ZONE_RADIUS } from '../src/world/wasteland.ts';
import { PLACES, terrainAt, WORLD_COLUMNS, WORLD_ROWS } from '../src/world/worldmap.ts';

const alive = () => false;

describe('the wasteland', () => {
  it('the window at Vault 13: 3×3 squares, the entrance at the location, under the open sky', () => {
    const w = wastelandWindow(PLACES.vault13, alive);
    expect(w.def.grid.length).toBe(SQUARE_CELLS * 3);
    expect(w.def.grid.every((row) => row.length === SQUARE_CELLS * 3)).toBe(true);
    expect(w.def.outdoor).toBe(true);
    const parsed = parseLevelDef(w.def);
    const entry = parsed.entries.vault13!;
    expect(entry).toBeTruthy();
    const level = buildLevel(parsed);
    expect(level.outdoor).toBeTruthy();
    expect(wallAt(level, entry.x, entry.y)).toBeNull();
    // The entrance is in its own square, near the middle of the location.
    expect(squareAt(w.center, entry.x, entry.y)).toEqual(PLACES.vault13);
  });

  it('the same square — the same result; killed animals do not come back', () => {
    const a = wastelandWindow({ column: 18, row: 2 }, alive);
    const b = wastelandWindow({ column: 18, row: 2 }, alive);
    expect(a.def.grid).toEqual(b.def.grid);
    expect(a.tags).toEqual(b.tags);
    if (a.tags.length > 0) {
      const dead = new Set([a.tags[0]!]);
      const c = wastelandWindow({ column: 18, row: 2 }, (tag) => dead.has(tag));
      expect(c.tags).not.toContain(a.tags[0]);
      expect(c.tags.length).toBe(a.tags.length - 1);
    }
  });

  it('from the middle of the window you can walk to the middle of every neighbouring land square', () => {
    for (const center of [PLACES.vault13, PLACES.shadySands, PLACES.junktown, { column: 19, row: 1 }, { column: 9, row: 6 }]) {
      const w = wastelandWindow(center, alive);
      const level = buildLevel(parseLevelDef(w.def));
      const from = squareMiddle(center, center);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const square = { column: center.column + dx, row: center.row + dy };
          const terrain = terrainAt(square.column, square.row);
          if (!terrain || terrain === 'water') continue;
          const to = squareMiddle(center, square);
          expect(findPath(level, from.x, from.y, to.x, to.y), `${center.column},${center.row} → ${square.column},${square.row}`).not.toBeNull();
        }
      }
    }
  });

  it('water and the edge of the world are walls', () => {
    // The bottom left corner of the map is ocean.
    const w = wastelandWindow({ column: 1, row: WORLD_ROWS - 2 }, alive);
    const level = buildLevel(parseLevelDef(w.def));
    const m = squareMiddle(w.center, { column: 0, row: WORLD_ROWS - 1 });
    expect(terrainAt(0, WORLD_ROWS - 1)).toBe('water');
    expect(wallAt(level, m.x, m.y)).toBe('water');
    const edge = wastelandWindow({ column: WORLD_COLUMNS - 1, row: 0 }, alive);
    const outside = squareMiddle(edge.center, { column: WORLD_COLUMNS, row: -1 });
    expect(wallAt(buildLevel(parseLevelDef(edge.def)), outside.x, outside.y)).not.toBeNull();
  });

  it('at a location — a green zone: a ring along the edge, a tint inside, the entrance inside the zone', () => {
    const w = wastelandWindow(PLACES.vault13, alive);
    const m = squareMiddle(w.center, PLACES.vault13);
    expect(w.def.glow).toContainEqual({ x: m.x, y: m.y, radius: ZONE_RADIUS });
    const parsed = parseLevelDef(w.def);
    const level = buildLevel(parsed);
    const at = (x: number, y: number) => level.glow![Math.floor(y) * level.width + Math.floor(x)];
    expect(at(m.x, m.y)).toBe(GLOW.inside);
    expect(at(m.x + ZONE_RADIUS, m.y)).toBe(GLOW.ring);
    expect(at(m.x + ZONE_RADIUS + 3, m.y)).toBe(0);
    const entry = parsed.entries.vault13!;
    expect(Math.hypot(entry.x - m.x, entry.y - m.y)).toBeLessThan(ZONE_RADIUS);
    // The whole zone is free: it is visible entirely.
    for (let a = 0; a < Math.PI * 2; a += 0.3) expect(wallAt(level, m.x + Math.cos(a) * (ZONE_RADIUS - 1), m.y + Math.sin(a) * (ZONE_RADIUS - 1))).toBeNull();
  });

  it('wounds heal once per period, the leftover time accumulates', () => {
    expect(healTicks(0, 3600, 6 * 3600)).toEqual({ times: 0, carry: 3600 });
    expect(healTicks(5 * 3600, 2 * 3600, 6 * 3600)).toEqual({ times: 1, carry: 3600 });
    expect(healTicks(0, 3 * 6 * 3600 + 10, 6 * 3600)).toEqual({ times: 3, carry: 10 });
    expect(healTicks(100, -5, 6 * 3600)).toEqual({ times: 0, carry: 100 });
  });

  it('light: bright by day, dark at night, warmer at sunset', () => {
    expect(outdoorAt(12).brightness).toBe(1);
    expect(outdoorAt(2).brightness).toBeLessThan(0.5);
    const dusk = outdoorAt(19).skyHorizon;
    expect(dusk.r).toBeGreaterThan(dusk.b);
    expect(outdoorAt(26)).toEqual(outdoorAt(2));
  });
});

describe('packs in the wasteland', () => {
  it('a pack in 20% of squares (the client\'s decision): the road does not eat all the ammo', () => {
    for (const e of Object.values(ENCOUNTERS)) if (e.kinds.length) expect(e.chance).toBe(0.2);
  });
});
