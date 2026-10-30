// A real night sky (client request, 2026-10-24): stars by the sidereal time of the game clock, constellations with names.
import { describe, expect, it } from 'vitest';
import { CONSTELLATIONS, localSiderealTime, moonPlace, skyPosition, SKY_LATITUDE, STAR_INDEX, STARS } from '../src/engine/stars.ts';
import { setLang, t, type StringKey } from '../src/i18n.ts';
import { Clock } from '../src/game/clock.ts';

const star = (name: Parameters<typeof STAR_INDEX.get>[0]) => STARS[STAR_INDEX.get(name)!]!;
const at = (name: Parameters<typeof STAR_INDEX.get>[0], dateMs: number) => {
  const s = star(name);
  return skyPosition(s.ra, s.dec, localSiderealTime(dateMs));
};
const DEG = Math.PI / 180;

describe('starry sky', () => {
  it('sidereal time: at noon on 1 January 2000 at Greenwich it is 18.7 hours', () => {
    // The wasteland clock is 8 hours behind Greenwich: 4 a.m. by it is noon at Greenwich.
    const lst = localSiderealTime(Date.UTC(2000, 0, 1, 4), 0);
    expect((lst / (Math.PI * 2)) * 24).toBeCloseTo(18.697, 2);
  });

  it('Polaris is always above north at the height of the latitude', () => {
    for (const hour of [0, 6, 13, 21]) {
      const p = at('polaris', Date.UTC(2161, 11, 5, hour));
      // Polaris is less than a degree from the pole: over a day it moves slightly in a circle.
      expect(Math.abs(p.el / DEG - SKY_LATITUDE)).toBeLessThan(1);
      expect(Math.abs(Math.atan2(Math.sin(p.az + Math.PI / 2), Math.cos(p.az + Math.PI / 2)))).toBeLessThan(0.05);
    }
  });

  it('on the first night of the game (5 December, 23:00) Orion is high in the south-east, Lyra has set below the horizon', () => {
    const night = Date.UTC(2161, 11, 5, 23);
    const betelgeuse = at('betelgeuse', night);
    expect(betelgeuse.el).toBeGreaterThan(40 * DEG);
    expect(betelgeuse.az).toBeGreaterThan(0);
    expect(betelgeuse.az).toBeLessThan(Math.PI / 2);
    expect(at('vega', night).el).toBeLessThan(5 * DEG);
  });

  it('on a summer evening (1 July, 22:00) Vega is almost overhead, Orion below ground', () => {
    const summer = Date.UTC(2162, 6, 1, 22);
    expect(at('vega', summer).el).toBeGreaterThan(55 * DEG);
    expect(at('rigel', summer).el).toBeLessThan(0);
  });

  it('the game clock knows the date for the sky', () => {
    const clock = new Clock();
    expect(clock.dateMs).toBe(Date.UTC(2161, 11, 5, 7));
    clock.advance(3600);
    expect(clock.date.hour).toBe(8);
  });

  it('every constellation has lines or stars and a name in two languages', () => {
    expect(CONSTELLATIONS.length).toBeGreaterThanOrEqual(40);
    // The language sets a mark on the page — there is no page in tests.
    (globalThis as { document?: unknown }).document ??= { documentElement: {} };
    const key = (k: string) => `constellation${k[0]!.toUpperCase()}${k.slice(1)}` as StringKey;
    for (const lang of ['ru', 'en'] as const) {
      setLang(lang);
      for (const c of CONSTELLATIONS) {
        expect(c.lines.length + (c.extra?.length ?? 0)).toBeGreaterThan(0);
        const name = t(key(c.key));
        expect(name).not.toBe(key(c.key));
        expect(name.length).toBeGreaterThan(2);
      }
    }
    setLang('ru');
  });

  it('catalog stars are in their places on the sphere', () => {
    for (const s of STARS) {
      expect(s.ra).toBeGreaterThanOrEqual(0);
      expect(s.ra).toBeLessThan(Math.PI * 2);
      expect(Math.abs(s.dec)).toBeLessThanOrEqual(Math.PI / 2);
    }
  });
});

describe('the Moon', () => {
  // The wasteland clock runs 8 hours behind Greenwich: local time = UTC − 8 h.
  const local = (utc: number) => utc - 8 * 3600 * 1000;
  it('phase by real dates: full moon 2024-04-23, new moon 2024-04-08', () => {
    expect(moonPlace(local(Date.UTC(2024, 3, 23, 23, 49))).lit).toBeGreaterThan(0.97);
    expect(moonPlace(local(Date.UTC(2024, 3, 8, 18, 21))).lit).toBeLessThan(0.03);
    // First quarter 2024-04-15 — waxing, half lit.
    const quarter = moonPlace(local(Date.UTC(2024, 3, 15, 19, 13)));
    expect(quarter.waxing).toBe(true);
    expect(Math.abs(quarter.lit - 0.5)).toBeLessThan(0.08);
  });

  it('stays close to the ecliptic', () => {
    for (let day = 0; day < 30; day++) expect(Math.abs(moonPlace(Date.UTC(2161, 6, day)).dec)).toBeLessThan((29.5 * Math.PI) / 180);
  });
});
