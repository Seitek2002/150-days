// The world map window: calculations — scrolling, clicking a location and a point, right panel lines, travel time.
import { describe, expect, it, vi } from 'vitest';
import type { TravelTarget } from '../src/game/travel.ts';
import { PLACES, WORLD_COLUMNS, WORLD_ROWS, WORLD_SQUARE_PIXELS, type PlaceKey } from '../src/world/worldmap.ts';

vi.mock('../src/platform.ts', () => ({ platform: { readGameFile: async () => new Uint8Array(0) } }));

const { clampView, fogLevels, formatHours, placeAtPixels, slotPlaces, squareFromPixels, targetHit, toPixels, viewCenteredOn } = await import('../src/game/worldmap-screen.ts');

const place = (key: PlaceKey, km: number, visited = false) => ({ key, name: key, square: PLACES[key], visited, hours: km / 2, km });
const MAP_W = WORLD_COLUMNS * WORLD_SQUARE_PIXELS;
const MAP_H = WORLD_ROWS * WORLD_SQUARE_PIXELS;

describe('map scrolling', () => {
  it('the window does not go past the image', () => {
    expect(clampView(-100, -5)).toEqual({ x: 0, y: 0 });
    expect(clampView(5000, 5000)).toEqual({ x: MAP_W - 450, y: MAP_H - 443 });
    expect(clampView(100.4, 200.6)).toEqual({ x: 100, y: 201 });
  });

  it('the hero is in the middle of the window; at the map edge the window stops at the edge', () => {
    expect(viewCenteredOn(700, 750)).toEqual({ x: 475, y: 529 });
    expect(viewCenteredOn(10, 10)).toEqual({ x: 0, y: 0 });
    expect(viewCenteredOn(MAP_W, MAP_H)).toEqual({ x: MAP_W - 450, y: MAP_H - 443 });
  });
});

describe('map point and squares', () => {
  it('square ↔ image point', () => {
    expect(toPixels({ x: 16.5, y: 1.5 })).toEqual({ x: 825, y: 75 });
    expect(squareFromPixels(825, 75)).toEqual({ x: 16.5, y: 1.5 });
    expect(squareFromPixels(-1, 10)).toBeNull();
    expect(squareFromPixels(MAP_W, 10)).toBeNull();
    expect(squareFromPixels(10, MAP_H + 1)).toBeNull();
  });
});

describe('clicking a location', () => {
  const places = [place('vault13', 0, true), place('vault15', 130), place('shadySands', 80)];

  it('hits the location circle and misses it', () => {
    const c = toPixels({ x: PLACES.vault15.column + 0.5, y: PLACES.vault15.row + 0.5 });
    expect(placeAtPixels(places, c.x + 10, c.y - 12)?.key).toBe('vault15');
    expect(placeAtPixels(places, c.x + 60, c.y)).toBeNull();
  });

  it('an unknown location (not in the list) is not selected, even if its circle is drawn on the image', () => {
    const c = toPixels({ x: PLACES.junktown.column + 0.5, y: PLACES.junktown.row + 0.5 });
    expect(placeAtPixels(places, c.x, c.y)).toBeNull();
  });

  it('next to each of two nearby locations — that location, and in between — nothing', () => {
    const near = [place('boneyard', 10), place('cathedral', 20)];
    const b = toPixels({ x: PLACES.boneyard.column + 0.5, y: PLACES.boneyard.row + 0.5 });
    expect(placeAtPixels(near, b.x, b.y + 10)?.key).toBe('boneyard');
    expect(placeAtPixels(near, b.x, b.y + 90)?.key).toBe('cathedral');
    expect(placeAtPixels(near, b.x, b.y + 50)).toBeNull();
  });
});

describe('target and a repeated click', () => {
  it('a location — the same target; a point — only near the one already set', () => {
    const place: TravelTarget = { place: 'hub' };
    const point: TravelTarget = { point: { x: 10.5, y: 12.5 } };
    expect(targetHit(place, 'hub', 0, 0)).toBe(true);
    expect(targetHit(place, 'junktown', 0, 0)).toBe(false);
    expect(targetHit(place, null, 525, 625)).toBe(false);
    const c = toPixels(point.point);
    expect(targetHit(point, null, c.x + 5, c.y + 5)).toBe(true);
    expect(targetHit(point, null, c.x + 40, c.y)).toBe(false);
    // A click on a location when the target is a point does not clear the target.
    expect(targetHit(point, 'hub', c.x, c.y)).toBe(false);
    expect(targetHit(null, 'hub', 0, 0)).toBe(false);
  });
});

describe('right panel and travel time', () => {
  it('nearest locations first and no more than twelve', () => {
    const keys = Object.keys(PLACES) as PlaceKey[];
    const many = keys.map((key, i) => place(key, 100 - i * 5));
    const rows = slotPlaces([...many, place('vault13', 1)]);
    expect(rows).toHaveLength(12);
    expect(rows[0]!.key).toBe('vault13');
    expect(rows.map((p) => p.km)).toEqual([...rows.map((p) => p.km)].sort((a, b) => a - b));
  });

  it('travel time: less than an hour, hours, days', () => {
    expect(formatHours(0.4)).toBe('меньше часа');
    expect(formatHours(5.4)).toBe('5 ч');
    expect(formatHours(60)).toBe('2,5 дн.');
  });
});

describe('fog', () => {
  it('without "is the square revealed" there is no fog', () => {
    expect(fogLevels(undefined)).toBeNull();
  });

  it('revealed squares — 0, hidden ones — thick fog; row by row', () => {
    const fog = fogLevels((column, row) => column === 16 && row === 1)!;
    expect(fog).toHaveLength(WORLD_COLUMNS * WORLD_ROWS);
    expect(fog[1 * WORLD_COLUMNS + 16]).toBe(0);
    expect(fog[1 * WORLD_COLUMNS + 15]).toBe(Math.round(255 * 0.88));
    expect(fog[0]).toBe(Math.round(255 * 0.88));
    expect([...fog].filter((v) => v === 0)).toHaveLength(1);
  });

  it('everything revealed — no fog in any square; everything hidden — the same everywhere', () => {
    expect([...fogLevels(() => true)!].every((v) => v === 0)).toBe(true);
    expect(new Set(fogLevels(() => false)!).size).toBe(1);
  });
});
