// Own locations in the game: the chosen variant replaces the level, "as in the game" restores the level, an unreadable file is skipped.
import { describe, expect, it, vi } from 'vitest';

const files = new Map<string, unknown>();
vi.mock('../src/platform.ts', () => ({ platform: { readLocation: async (base: string, name: string) => files.get(`${base}/${name}`) ?? null } }));
vi.mock('../src/world/known-textures.ts', () => ({ textureNames: () => new Set(['sand', 'brick', 'adobe', 'rock']) }));

const { buildLevel } = await import('../src/engine/level.ts');
const { parseLevelDef } = await import('../src/world/defs.ts');
const { LEVELS } = await import('../src/world/levels/index.ts');
const { encodeLocation, locationFromLevel } = await import('../src/world/location-file.ts');
const { activeVariants, useLocationVariants } = await import('../src/world/location-variants.ts');

describe('own locations in the game', () => {
  it('the variant replaces the level, "as in the game" brings the level back; no file — the game level', async () => {
    const original = LEVELS['shady-sands-e']!;
    const loc = locationFromLevel(original, 'House');
    const cell = loc.floors[1]!.findIndex((b, i) => !b && i > loc.width * 5);
    loc.floors[1]![cell] = 'wall-brick';
    files.set('shady-sands-e/House', JSON.parse(JSON.stringify(encodeLocation(loc))));

    expect(await useLocationVariants({ 'shady-sands-e': 'House' })).toEqual({ 'shady-sands-e': 'House' });
    expect(LEVELS['shady-sands-e']).not.toBe(original);
    expect(buildLevel(parseLevelDef(LEVELS['shady-sands-e']!)).walls[cell]).toBe('brick');
    expect(activeVariants()).toEqual({ 'shady-sands-e': 'House' });

    expect(await useLocationVariants({})).toEqual({});
    expect(LEVELS['shady-sands-e']).toBe(original);

    expect(await useLocationVariants({ 'shady-sands-e': 'No such' })).toEqual({});
    expect(LEVELS['shady-sands-e']).toBe(original);
    expect(activeVariants()).toEqual({});
  });
});
