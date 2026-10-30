// House roofs (client request, 2026-10-24: "one more storey of full blocks"): above a wall — a two-storey wall, above the floor —
// a hanging block for the whole storey (a ceiling); floor by letters (paint); in the editor a roof is ordinary second-floor blocks.
import { describe, expect, it } from 'vitest';
import { blocksIn, buildLevel, solidAt } from '../src/engine/level.ts';
import { parseLevelDef, type LevelDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';
import { levelFromLocation, locationFromLevel } from '../src/world/location-file.ts';

const house: LevelDef = {
  id: 'test-house',
  title: { ru: 'Дом', en: 'House' },
  music: '06VAULT',
  floor: 'wasteland',
  ceiling: 'rockCeiling',
  fade: 10,
  outdoor: true,
  grid: ['RRRRRR', 'R....R', 'R.##.R', 'R.#..R', 'R....R', 'RRRRRR'],
  walls: { '#': 'adobeLight' },
  roof: { texture: 'adobeRoof', rows: ['......', '......', '..##..', '..##..', '......', '......'] },
  paint: { legend: { a: 'dirt' }, rows: ['......', '.a....', '......', '......', '....a.', '......'] },
  entries: { start: { x: 1.5, y: 1.5, angle: 0 } },
};

describe('house roofs', () => {
  const level = buildLevel(parseLevelDef(house));
  const cell = (x: number, y: number) => y * level.width + x;

  it('above a wall — a two-storey wall (wall below, roof above), above the floor — a hanging block for the whole storey', () => {
    expect(level.heights?.[cell(2, 2)]).toBe(2);
    expect(level.walls[cell(2, 2)]).toBe('adobeLight');
    expect(level.wallLayers?.[cell(2, 2)]).toEqual(['adobeLight', 'adobeRoof']);
    expect(blocksIn(level, cell(2, 2))).toHaveLength(0);
    const overFloor = blocksIn(level, cell(3, 3));
    expect(level.walls[cell(3, 3)]).toBeNull();
    expect(overFloor).toHaveLength(1);
    expect(overFloor[0]).toMatchObject({ base: 1, height: 2, front: 'adobeRoof', fill: false });
    // People walk under the ceiling.
    expect(solidAt(level, 3.5, 3.5)).toBe(false);
    expect(blocksIn(level, cell(1, 1))).toHaveLength(0);
  });

  it('floor by letters is laid out as markings on the cells', () => {
    expect(level.floorMarks?.get(cell(1, 1))?.texture).toBe('dirt');
    expect(level.floorMarks?.get(cell(4, 4))?.texture).toBe('dirt');
    expect(level.floorMarks?.has(cell(2, 1))).toBe(false);
  });

  it('in the editor a roof is an ordinary second-floor block; back — the same walls and ceiling', () => {
    const loc = locationFromLevel(house, 'test');
    expect(loc.floors[2]?.[cell(3, 3)]).toBe('tex:adobeRoof');
    expect(loc.floors[2]?.[cell(2, 2)]).toBe('tex:adobeRoof');
    expect(loc.floors[1]?.[cell(2, 2)]).toBe('tex:adobeLight');
    expect(loc.floors[0]?.[cell(1, 1)]).toBe('tex:dirt');
    const back = buildLevel(parseLevelDef(levelFromLocation(loc, house, () => 0.5)));
    expect(back.heights?.[cell(2, 2)]).toBe(2);
    expect(back.wallLayers?.[cell(2, 2)]).toEqual(['adobeLight', 'adobeRoof']);
    const ceiling = blocksIn(back, cell(3, 3));
    expect(ceiling).toHaveLength(1);
    expect(ceiling[0]).toMatchObject({ base: 1, height: 2 });
  });
});

// Client request, 2026-10-28: there are no ceilings or roofs made of flat blocks anywhere — in every location whatever hangs above the floor (roofs, ceilings,
// lintels) is full-storey blocks.
describe('in every location ceilings and roofs are full blocks', () => {
  for (const [id, def] of Object.entries(LEVELS)) {
    it(id, () => {
      const level = buildLevel(parseLevelDef(def));
      const thin: string[] = [];
      for (const cell of level.blocks?.keys() ?? []) {
        for (const b of blocksIn(level, cell)) {
          const base = b.base ?? 0;
          if (base > 0 && b.height - base < 1) thin.push(`${cell % level.width},${Math.floor(cell / level.width)} ${b.top} ${base}–${b.height}`);
        }
      }
      expect(thin).toEqual([]);
    });
  }
});
