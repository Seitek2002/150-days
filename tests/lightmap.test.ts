// Level light and shadows (src/engine/lightmap.ts): shadow by walls and in corners, a lamp's light spot does not pass through a wall.
import { describe, expect, it } from 'vitest';
import { buildLevel } from '../src/engine/level.ts';
import { buildLightMap, LAMP_SCALE, sampleGrid } from '../src/engine/lightmap.ts';
import { createTextures, TEX } from '../src/engine/textures.ts';
import { parseLevelDef } from '../src/world/defs.ts';

/** Two 5×5 rooms with a wall between them. */
const level = () =>
  buildLevel(
    parseLevelDef({
      id: 'test',
      music: '',
      floor: 'floor',
      ceiling: 'ceiling',
      fade: 10,
      grid: ['#############', '#.....#.....#', '#.....#.....#', '#.....#.....#', '#.....#.....#', '#.....#.....#', '#############'],
      entries: { start: { x: 3.5, y: 3.5, angle: 0 } },
    }),
  );

describe('shadows by walls', () => {
  it('darker by a wall than in the middle of the room, darkest in a corner', () => {
    const lv = level();
    const map = buildLightMap(lv);
    const at = (x: number, y: number) => sampleGrid(map.ao, map, x, y) / 255;
    const middle = at(3.5, 3.5);
    const wall = at(1.05, 3.5);
    const corner = at(1.05, 1.05);
    expect(wall).toBeLessThan(middle * 0.8);
    expect(corner).toBeLessThan(wall);
  });
});

describe('lamp light', () => {
  it('a lamp lights its own room, but not behind the wall', () => {
    const lv = level();
    lv.lights = [{ x: 4.5, y: 3.5, radius: 4, intensity: 1 }];
    const map = buildLightMap(lv);
    const lamp = (x: number, y: number) => (sampleGrid(map.lamp!, map, x, y) / 255) * LAMP_SCALE;
    expect(lamp(4.5, 3.5)).toBeGreaterThan(0.8);
    expect(lamp(2.5, 3.5)).toBeGreaterThan(0.1);
    // Behind the wall at the same distance: dark.
    expect(lamp(7.5, 3.5)).toBe(0);
  });

  it('a lamp "on the wall" is moved into the room', () => {
    const lv = level();
    lv.lights = [{ x: 6.5, y: 3.5, radius: 3, intensity: 1 }];
    const map = buildLightMap(lv);
    expect(sampleGrid(map.lamp!, map, 5.5, 3.5)).toBeGreaterThan(0);
  });
});

describe('textures', () => {
  // All textures are drawn by code: on a busy machine longer than five seconds.
  it('each has an image of the right size, walls have several variants', () => {
    const textures = createTextures();
    for (const t of Object.values(textures)) {
      expect(t.pixels).toHaveLength(TEX * TEX);
      expect(t.variants[0]).toBe(t.pixels);
    }
    expect(textures.adobe.variants.length).toBeGreaterThan(1);
    expect(textures.adobe.variants[1]).not.toEqual(textures.adobe.variants[0]);
  }, 30_000);
});
