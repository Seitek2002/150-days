// Glow radiation (client request, 2026-10-25): in the wasteland near the Glow the Geiger counter is louder (until the spots appear), snow and spots
// get closer; below without Rad-X — a lethal dose (the screen turns yellow, then death), with Rad-X — only the original's irradiation.
import { describe, expect, it } from 'vitest';
import { RADIATION_DEATH } from '../src/game/conditions.ts';
import { geigerRate, geigerVolume, placeDose, protectedDose, radiationField, radiationLook, SPOTS_FROM, STUCK_MAX, WASTE_FIELD, WASTE_REACH, type RadSpot } from '../src/game/radiation.ts';
import { SQUARE_CELLS, WASTELAND } from '../src/world/wasteland.ts';
import { PLACES } from '../src/world/worldmap.ts';

/** A wasteland point d cells north of the middle of the Glow square. */
function waste(d: number): RadSpot {
  const g = PLACES.glow;
  const origin = { x: (g.column - 1) * SQUARE_CELLS, y: (g.row - 1) * SQUARE_CELLS };
  return { map: WASTELAND, x: (g.column + 0.5) * SQUARE_CELLS - origin.x, y: (g.row + 0.5) * SQUARE_CELLS - d - origin.y, origin };
}

describe('radiation strength', () => {
  it('in the wasteland — by distance to the Glow: none far away, more closer, WASTE_FIELD at the entrance', () => {
    expect(radiationField(waste(WASTE_REACH + 10))).toBe(0);
    const far = radiationField(waste(WASTE_REACH - 20));
    const mid = radiationField(waste(WASTE_REACH / 2));
    const near = radiationField(waste(4));
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(SPOTS_FROM);
    expect(mid).toBeGreaterThan(far);
    expect(near).toBeCloseTo(WASTE_FIELD, 5);
    expect(near).toBeGreaterThan(SPOTS_FROM);
    // Without a wasteland window (loading) — not computed.
    expect(radiationField({ map: WASTELAND, x: 0, y: 0 })).toBe(0);
  });

  it('on the Glow surface it is stronger than in the wasteland and grows towards the drop down; below — 1; elsewhere — none', () => {
    const edge = radiationField({ map: 'glow-ent', x: 10, y: 10 });
    const entry = radiationField({ map: 'glow-ent', x: 49.5, y: 38.5 });
    const hole = radiationField({ map: 'glow-ent', x: 37.5, y: 42.5 });
    expect(edge).toBeGreaterThanOrEqual(WASTE_FIELD);
    expect(entry).toBeGreaterThan(edge);
    expect(hole).toBeGreaterThan(entry);
    expect(radiationField({ map: 'glow-1', x: 5, y: 5 })).toBe(1);
    expect(radiationField({ map: 'glow-5', x: 5, y: 5 })).toBeLessThan(1);
    expect(radiationField({ map: 'junktown-ent', x: 5, y: 5 })).toBe(0);
  });
});

describe('Geiger counter', () => {
  it('the volume grows until the spots appear, then stays; the clicks get faster all the time', () => {
    expect(geigerVolume(0)).toBe(0);
    expect(geigerRate(0)).toBe(0);
    expect(geigerVolume(0.05)).toBeLessThan(geigerVolume(0.2));
    expect(geigerVolume(SPOTS_FROM)).toBeCloseTo(geigerVolume(1), 5);
    expect(geigerVolume(0.6)).toBeCloseTo(geigerVolume(1), 5);
    expect(geigerRate(0.05)).toBeLessThan(geigerRate(SPOTS_FROM));
    expect(geigerRate(SPOTS_FROM)).toBeLessThan(geigerRate(0.65));
    expect(geigerRate(0.65)).toBeLessThan(geigerRate(1));
  });
});

describe('screen', () => {
  it('snow and spots from SPOTS_FROM (a bit earlier — barely visible), dead pixels and yellowing from irradiation', () => {
    expect(radiationLook(0.1, 0).snow).toBe(0);
    expect(radiationLook(SPOTS_FROM, 0).snow).toBeGreaterThan(0);
    expect(radiationLook(1, 0).snow).toBeCloseTo(1, 5);
    expect(radiationLook(0.6, 0).spots).toBeLessThan(radiationLook(1, 0).spots);
    expect(radiationLook(0, 0)).toEqual({ snow: 0, spots: 0, stuck: 0, yellow: 0 });
    expect(radiationLook(0, 100).stuck).toBeGreaterThan(0);
    expect(radiationLook(0, 600).stuck).toBeGreaterThan(radiationLook(0, 100).stuck);
    expect(radiationLook(0, 5000).stuck).toBe(STUCK_MAX);
    expect(radiationLook(0, 250).yellow).toBe(0);
    expect(radiationLook(0, 600).yellow).toBeGreaterThan(0.3);
    expect(radiationLook(0, RADIATION_DEATH).yellow).toBe(1);
  });
});

describe('dose', () => {
  /** How much irradiation in seconds at a location: our dose with protection and the original script's dose (perUpdate per 30 s). */
  function exposure(at: RadSpot, resistance: number, seconds: number, perUpdate: number): { rads: number; yellowAt: number; deadAt: number } {
    let rads = 0;
    let yellowAt = -1;
    let deadAt = -1;
    const dose = protectedDose(placeDose(at, radiationField(at)), resistance);
    for (let t = 0; t < seconds; t += 0.05) {
      rads += dose * 0.05;
      if (Math.floor((t + 0.05) / 30) > Math.floor(t / 30)) rads += perUpdate - Math.trunc((resistance * perUpdate) / 100);
      if (yellowAt < 0 && radiationLook(0, rads).yellow > 0.2) yellowAt = t;
      if (deadAt < 0 && rads >= RADIATION_DEATH) deadAt = t;
    }
    return { rads, yellowAt, deadAt };
  }

  it('below the Glow without protection (own 10%): the screen turns yellow, then death — in less than a minute and a half', () => {
    const r = exposure({ map: 'glow-1', x: 5, y: 5 }, 10, 120, 10);
    expect(r.yellowAt).toBeGreaterThan(20);
    expect(r.deadAt).toBeGreaterThan(r.yellowAt);
    expect(r.deadAt).toBeLessThan(90);
  });

  it('with Rad-X (+50%) there is no dose of ours: 10 minutes below give irradiation as in the original, far from death', () => {
    expect(protectedDose(15, 60)).toBe(0);
    expect(protectedDose(15, 30)).toBeGreaterThan(0);
    const r = exposure({ map: 'glow-1', x: 5, y: 5 }, 60, 600, 10);
    expect(r.deadAt).toBe(-1);
    expect(r.rads).toBeLessThan(150);
  });

  it('in the wasteland: no dose far from the Glow, a weak one at the very entrance', () => {
    const far = waste(WASTE_REACH / 2);
    expect(placeDose(far, radiationField(far))).toBe(0);
    const near = waste(4);
    expect(placeDose(near, radiationField(near))).toBeGreaterThan(0);
    expect(placeDose(near, radiationField(near))).toBeLessThan(1);
    // The surface is irradiated by the original map script — no dose of ours.
    expect(placeDose({ map: 'glow-ent', x: 37.5, y: 42.5 }, 0.8)).toBe(0);
  });
});
