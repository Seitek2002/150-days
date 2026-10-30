// Travel target and fast travel: the target is stored in session variables (and so in the save), travel time is as on foot.
import { describe, expect, it } from 'vitest';
import { isRevealed, markVisited, placePoint, placeState, readTarget, revealAround, revealPath, targetPoint, travelHours, writeTarget } from '../src/game/travel.ts';
import { SQUARE_HOURS } from '../src/world/wasteland.ts';
import { PLACE_GVARS, PLACES } from '../src/world/worldmap.ts';

describe('travel target', () => {
  it('not chosen — the first location heard of but not visited', () => {
    const vars: Record<string, number> = { 'place:vault13': 2, 'place:vault15': 1 };
    expect(readTarget(vars)).toEqual({ place: 'vault15' });
    expect(readTarget({ 'place:vault13': 2 })).toBeNull();
  });

  it('location, point, cleared target — there and back', () => {
    const vars: Record<string, number> = { 'place:vault13': 2, 'place:vault15': 1, 'place:shadySands': 2 };
    writeTarget(vars, { place: 'shadySands' });
    expect(readTarget(vars)).toEqual({ place: 'shadySands' });
    writeTarget(vars, { point: { x: 10.25, y: 7.5 } });
    expect(readTarget(vars)).toEqual({ point: { x: 10.25, y: 7.5 } });
    writeTarget(vars, null);
    expect(readTarget(vars)).toBeNull();
    // An unknown location is never a target.
    writeTarget(vars, { place: 'glow' });
    expect(readTarget(vars)).toEqual({ place: 'vault15' });
  });

  it('world map fog: revealed around the hero and along the road, nothing beyond the edge of the world', () => {
    const vars: Record<string, number> = {};
    revealAround(vars, { x: 16.5, y: 1.5 });
    expect(isRevealed(vars, 16, 1)).toBe(true);
    expect(isRevealed(vars, 17, 2)).toBe(true);
    expect(isRevealed(vars, 18, 1)).toBe(false);
    revealAround(vars, { x: 0.2, y: 0.2 });
    expect(Object.keys(vars).some((k) => k.includes('-1'))).toBe(false);
    revealPath(vars, { x: 16.5, y: 1.5 }, { x: 25.5, y: 1.5 });
    for (let column = 16; column <= 25; column++) expect(isRevealed(vars, column, 1), `square ${column}`).toBe(true);
    expect(isRevealed(vars, 20, 3)).toBe(false);
  });

  it('a critter told about a location — it is on the map; arrived — "been there", and the story does not undo that', () => {
    // The critter's script sets the original location variable: 71 — Junktown, 79 — the Master's lair under the Cathedral.
    const vars: Record<string, number> = { 'place:vault13': 2, g71: 1, g79: 2 };
    expect(placeState(vars, 'junktown')).toBe(1);
    expect(placeState(vars, 'cathedral')).toBe(2);
    expect(placeState(vars, 'hub')).toBe(0);
    expect(readTarget(vars)).toEqual({ place: 'junktown' });
    markVisited(vars, 'junktown');
    expect(vars.g71).toBe(2);
    expect(placeState(vars, 'junktown')).toBe(2);
    // Another critter "told" again (set 1) — the location is still visited.
    vars.g71 = 1;
    expect(placeState(vars, 'junktown')).toBe(2);
    // Each location has its own variable, without repeats.
    const all = Object.values(PLACE_GVARS).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((n) => n >= 67 && n <= 79)).toBe(true);
  });

  it('where the target is and how long to walk', () => {
    expect(targetPoint({ place: 'vault13' })).toEqual({ x: PLACES.vault13.column + 0.5, y: PLACES.vault13.row + 0.5 });
    expect(targetPoint({ point: { x: 3, y: 4 } })).toEqual({ x: 3, y: 4 });
    expect(travelHours({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5 * SQUARE_HOURS);
    const v13 = placePoint('vault13');
    const v15 = placePoint('vault15');
    expect(travelHours(v13, v15)).toBeCloseTo((PLACES.vault15.column - PLACES.vault13.column) * SQUARE_HOURS);
  });
});
