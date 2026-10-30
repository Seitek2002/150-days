// Critters do not stand right against a wall (client request, 2026-10-24: Aradesh, Jarvis, Razlo's wife "stick out of the wall").
import { describe, expect, it } from 'vitest';
import { buildLevel } from '../src/engine/level.ts';
import { parseLevelDef, type LevelDef } from '../src/world/defs.ts';
import { clearOfWalls } from '../src/game/scene.ts';
import { LEVELS } from '../src/world/levels/index.ts';

const room: LevelDef = {
  id: 'test-room',
  title: { ru: 'Комната', en: 'Room' },
  music: '06VAULT',
  floor: 'floor',
  ceiling: 'ceiling',
  fade: 10,
  grid: ['#####', '#...#', '#...#', '#...#', '#####'],
};
const level = buildLevel(parseLevelDef(room));
const gap = (p: { x: number; y: number }) => Math.min(p.x - 1, 4 - p.x, p.y - 1, 4 - p.y);

describe('critters not right at the wall', () => {
  it('a point at the edge of a cell by a wall is moved inward', () => {
    const p = clearOfWalls(level, 2.5, 1);
    expect(p.x).toBe(2.5);
    expect(p.y).toBeCloseTo(1.34);
    expect(gap(clearOfWalls(level, 1, 3.9))).toBeGreaterThanOrEqual(0.33);
  });

  it('in a corner — away from both walls; in the middle of a room — as it was', () => {
    const p = clearOfWalls(level, 1.05, 1.1);
    expect(p.x).toBeGreaterThanOrEqual(1.34);
    expect(p.y).toBeGreaterThanOrEqual(1.34);
    expect(clearOfWalls(level, 2.5, 2.5)).toEqual({ x: 2.5, y: 2.5 });
  });

  it('a point in a wall goes to the middle of the neighbouring free cell', () => {
    const p = clearOfWalls(level, 0.5, 2.5);
    expect(p).toEqual({ x: 1.5, y: 2.5 });
  });

  it('Shady Sands critters do not touch walls after the rule', () => {
    for (const def of [LEVELS['shady-sands-w']!, LEVELS['shady-sands-e']!]) {
      const lv = buildLevel(parseLevelDef(def));
      const solid = (x: number, y: number) => {
        const i = Math.floor(y) * lv.width + Math.floor(x);
        return lv.walls[i] !== null && !lv.doors.has(i);
      };
      for (const o of parseLevelDef(def).objects) {
        if (o.kind !== 'npc' && o.kind !== 'critter') continue;
        const p = clearOfWalls(lv, o.x, o.y);
        for (const [dx, dy] of [
          [0.3, 0],
          [-0.3, 0],
          [0, 0.3],
          [0, -0.3],
        ] as const)
          expect(solid(p.x + dx, p.y + dy)).toBe(false);
      }
    }
  });
});
