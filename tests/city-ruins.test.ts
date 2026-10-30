// Ruins: on the way to the Boneyard the buildings get taller (one-storey houses → two or three storeys → high-rises), in Necropolis
// half-ruined high-rises, and they remain if the location is replaced by a variant from the editor.
import { describe, expect, it } from 'vitest';
import { buildLevel } from '../src/engine/level.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';
import { levelFromLocation, locationFromLevel } from '../src/world/location-file.ts';
import { SQUARE_CELLS, wastelandWindow } from '../src/world/wasteland.ts';

/** The tallest building in the middle square of the wasteland window around (15, row): the Boneyard is (15, 18). */
const tallest = (row: number) => {
  const towers = wastelandWindow({ column: 15, row }, () => false).def.towers ?? [];
  const inMiddle = (t: { x0: number; y0: number }) => t.x0 >= SQUARE_CELLS && t.x0 < 2 * SQUARE_CELLS && t.y0 >= SQUARE_CELLS && t.y0 < 2 * SQUARE_CELLS;
  return towers.filter(inMiddle).reduce((max, t) => Math.max(max, t.height), 0);
};

describe('ruins on the way to the Boneyard', () => {
  it('far away: none; closer: houses get taller; near the Boneyard: high-rises', () => {
    expect(tallest(12)).toBe(0);
    expect(tallest(13)).toBe(1);
    expect(tallest(14)).toBeLessThanOrEqual(2);
    expect(tallest(15)).toBeGreaterThanOrEqual(2);
    expect(tallest(15)).toBeLessThanOrEqual(3);
    expect(tallest(16)).toBeGreaterThanOrEqual(3);
    expect(tallest(16)).toBeLessThanOrEqual(6);
    expect(tallest(17)).toBeGreaterThanOrEqual(7);
  });

  it('no city ruins near Vault 13', () => {
    expect(wastelandWindow({ column: 16, row: 1 }, () => false).def.towers).toBeUndefined();
  });
});

describe('Necropolis high-rises', () => {
  for (const id of ['necro-hotel', 'necro-hall', 'necro-water']) {
    it(`${id}: there are high-rises with a facade, the streets are not occupied`, () => {
      const plain = buildLevel(parseLevelDef({ ...LEVELS[id]!, highRise: undefined }));
      const level = buildLevel(parseLevelDef(LEVELS[id]!));
      expect(level.maxHeight).toBeGreaterThanOrEqual(10);
      expect(level.wallLayers?.some((l) => l?.includes('ruinFacade'))).toBe(true);
      // The floor stayed a floor: high-rises are made only of walls.
      for (let i = 0; i < level.walls.length; i++) expect(level.walls[i] === null).toBe(plain.walls[i] === null);
    });
  }

  it('an editor variant also has high-rises', () => {
    const base = LEVELS['necro-hotel']!;
    const level = buildLevel(parseLevelDef(levelFromLocation(locationFromLevel(base), base)));
    expect(level.maxHeight).toBeGreaterThanOrEqual(10);
  });
});
