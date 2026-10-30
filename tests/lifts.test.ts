// Elevators are visible (client, 2026-10-25: "you cannot see where the elevator is and where the exit is"): every game elevator has doors on the wall behind it;
// an elevator outside (from an underground level to open sky) has a green arrow, the others floor arrows.
import { describe, expect, it } from 'vitest';
import { buildLevel } from '../src/engine/level.ts';
import { liftLeadsOut, liftPanel } from '../src/game/lifts.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';

const outdoor = (map: string) => !!LEVELS[map]?.outdoor;

describe('elevator doors', () => {
  it('every elevator has a wall for the doors', () => {
    let count = 0;
    for (const def of Object.values(LEVELS)) {
      const lifts = (def.objects ?? []).filter((o) => o.kind === 'elevator');
      if (!lifts.length) continue;
      const level = buildLevel(parseLevelDef(def));
      for (const el of lifts) {
        count++;
        expect(liftPanel(level, el, false), `${def.id} ${el.x},${el.y}`).not.toBeNull();
      }
    }
    expect(count).toBeGreaterThan(20);
  });

  it('the Brotherhood of Steel: the doors are on the back wall of the niche (opposite the passage); up is the "exit", between floors not', () => {
    const b1 = LEVELS['brotherhood-1']!;
    const level = buildLevel(parseLevelDef(b1));
    const lifts = (b1.objects ?? []).filter((o) => o.kind === 'elevator');
    const up = lifts.find((o) => o.current === 1 && o.floors.some((f) => f.map === 'brotherhood-ent'))!;
    const down = lifts.find((o) => o !== up)!;
    expect(liftLeadsOut(b1, up.floors, up.current, outdoor)).toBe(true);
    expect(liftLeadsOut(b1, down.floors, down.current, outdoor)).toBe(false);
    // Niche (3, 23) is open to the east: doors on the west wall (its east side, line x = 3).
    expect(liftPanel(level, up, true)?.panel).toMatchObject({ face: 'east', at: 3, picture: 'liftExit' });
    // From the surface the elevator goes down: that is not an exit.
    const ent = LEVELS['brotherhood-ent']!;
    const top = (ent.objects ?? []).find((o) => o.kind === 'elevator')!;
    expect(liftLeadsOut(ent, top.floors, top.current, outdoor)).toBe(false);
  });
});

// Elevators are an open cabin, as in the original (client, 2026-10-29): the cabin is cut into the wall cell behind the elevator, which
// liftPanel finds (where the doors were); it has a side to cut into.
describe('elevator cabin', () => {
  it('behind every elevator: a wall (or door) cell and the direction from the elevator to it', () => {
    for (const def of Object.values(LEVELS)) {
      const lifts = (def.objects ?? []).filter((o) => o.kind === 'elevator');
      if (!lifts.length) continue;
      const level = buildLevel(parseLevelDef(def));
      for (const el of lifts) {
        const found = liftPanel(level, el, false)!;
        const i = found.wall.y * level.width + found.wall.x;
        expect(level.walls[i] !== null || level.doors.has(i), `${def.id}`).toBe(true);
        expect(Math.abs(found.wall.dx) + Math.abs(found.wall.dy)).toBe(1);
      }
    }
  });
});
