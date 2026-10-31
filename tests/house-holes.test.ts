// Houses are entered only through their doors (client, 2026-10-31: "there are many holes in the houses you can easily walk through" — the Hub,
// then the other towns). For every door in a straight wall line with a roof on one side, its two sides must not be joined by a way around it.
// Exceptions are doors that can be walked around in the original too (checked against the original's maps).
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/world/levels/index.ts';

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Doors the original itself lets you walk around: level → door cells. */
const AS_IN_ORIGINAL: Record<string, string[]> = {
  // Adobe houses with open doorways: both rooms by the inner door have their own doorway out.
  'shady-sands-w': ['25,32', '47,31'],
  // The Khans' house: the partition with the inner door stops a step short of the outer wall.
  raiders: ['23,35'],
  // The Boneyard is a ruined city: the Rippers' building has a wide breach in its north wall, the gun runners' palisade has gaps.
  'boneyard-rippers': ['37,28'],
  'boneyard-gunrunners': ['54,51'],
};

describe('houses have no holes', () => {
  for (const def of Object.values(LEVELS)) {
    it(`${def.id}: no house door can be walked around`, () => {
      const grid = def.grid;
      const roof = def.roof?.rows ?? [];
      const H = grid.length;
      const W = grid[0]!.length;
      const walls = new Set([...Object.keys(def.walls ?? {}), '#', 'R']);
      const wall = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || walls.has(grid[y]![x]!);
      const roofed = (x: number, y: number) => (roof[y]?.[x] ?? '.') !== '.';
      const doors = new Set((def.objects ?? []).filter((o) => o.kind === 'door').map((o) => Math.floor(o.y) * W + Math.floor(o.x)));
      const around: string[] = [];
      for (const d of doors) {
        const x = d % W;
        const y = (d - x) / W;
        const open = (sx: number, sy: number) => !wall(sx, sy) && !doors.has(sy * W + sx);
        const sides = open(x + 1, y) && open(x - 1, y) && wall(x, y + 1) && wall(x, y - 1) ? [[x + 1, y], [x - 1, y]] : open(x, y + 1) && open(x, y - 1) && wall(x + 1, y) && wall(x - 1, y) ? [[x, y + 1], [x, y - 1]] : null;
        if (!sides || !sides.some(([sx, sy]) => roofed(sx!, sy!))) continue;
        // From one side to the other without passing any door.
        const seen = new Set([sides[0]![1]! * W + sides[0]![0]!]);
        const queue = [...seen];
        const goal = sides[1]![1]! * W + sides[1]![0]!;
        for (let q = 0; q < queue.length && !seen.has(goal); q++) {
          const i = queue[q]!;
          for (const [dx, dy] of STEPS) {
            const nx = (i % W) + dx;
            const ny = Math.floor(i / W) + dy;
            const j = ny * W + nx;
            if (wall(nx, ny) || doors.has(j) || seen.has(j)) continue;
            seen.add(j);
            queue.push(j);
          }
        }
        if (seen.has(goal) && !AS_IN_ORIGINAL[def.id]?.includes(`${x},${y}`)) around.push(`${x},${y}`);
      }
      expect(around).toEqual([]);
    });
  }
});
