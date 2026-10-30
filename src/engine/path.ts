// Pathfinding over level cells (A*): critters go where the script sent them, along corridors rather than through walls.
// Doors count as passable — a critter opens the door itself (the scene opens a door for whoever walks up to it).
import type { Level } from './level.ts';

/** Don't search beyond this: this many cells are examined at once (the wasteland — up to 288×288 cells). */
const MAX_VISITED = 60000;

/** Cells in eight directions; diagonally — only if both neighboring passages are free (don't cut a wall corner). */
const STEPS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

function open(level: Level, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= level.width || cy >= level.height) return false;
  const i = cy * level.width + cx;
  if (level.walls[i] !== null) return false;
  for (let b = level.blocks?.get(i); b; b = b.next) if (b.fill) return false;
  return true;
}

/** A queue with the lowest score on top (binary heap). */
class Queue {
  private readonly cells: number[] = [];
  private readonly scores: number[] = [];

  get size(): number {
    return this.cells.length;
  }

  push(cell: number, score: number): void {
    let i = this.cells.length;
    this.cells.push(cell);
    this.scores.push(score);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scores[parent]! <= score) break;
      this.cells[i] = this.cells[parent]!;
      this.scores[i] = this.scores[parent]!;
      i = parent;
    }
    this.cells[i] = cell;
    this.scores[i] = score;
  }

  pop(): number {
    const top = this.cells[0]!;
    const cell = this.cells.pop()!;
    const score = this.scores.pop()!;
    const n = this.cells.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const a = 2 * i + 1;
        if (a >= n) break;
        const b = a + 1;
        const child = b < n && this.scores[b]! < this.scores[a]! ? b : a;
        if (this.scores[child]! >= score) break;
        this.cells[i] = this.cells[child]!;
        this.scores[i] = this.scores[child]!;
        i = child;
      }
      this.cells[i] = cell;
      this.scores[i] = score;
    }
    return top;
  }
}

/**
 * Path from point (x0, y0) to point (x1, y1): the centers of cells along the way and the target itself at the end.
 * null — unreachable (the target is in a wall or cut off). Already in the same cell — one point, the target itself.
 */
export function findPath(level: Level, x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] | null {
  const sx = Math.floor(x0);
  const sy = Math.floor(y0);
  const tx = Math.floor(x1);
  const ty = Math.floor(y1);
  if (!open(level, tx, ty)) return null;
  if (sx === tx && sy === ty) return [{ x: x1, y: y1 }];
  const w = level.width;
  const start = sy * w + sx;
  const goal = ty * w + tx;
  const cost = new Map<number, number>([[start, 0]]);
  const from = new Map<number, number>();
  const guess = (cell: number) => Math.hypot((cell % w) - tx, Math.floor(cell / w) - ty);
  const queue = new Queue();
  queue.push(start, guess(start));
  const done = new Set<number>();
  while (queue.size > 0 && done.size < MAX_VISITED) {
    const cell = queue.pop();
    if (cell === goal) break;
    if (done.has(cell)) continue;
    done.add(cell);
    const cx = cell % w;
    const cy = Math.floor(cell / w);
    for (const [dx, dy, step] of STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!open(level, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!open(level, cx + dx, cy) || !open(level, cx, cy + dy))) continue;
      const next = ny * w + nx;
      const c = cost.get(cell)! + step;
      if (c >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, c);
      from.set(next, cell);
      queue.push(next, c + guess(next));
    }
  }
  if (!from.has(goal)) return null;
  const cells: number[] = [];
  for (let cell = goal; cell !== start; cell = from.get(cell)!) cells.push(cell);
  cells.reverse();
  const path = cells.map((cell) => ({ x: (cell % w) + 0.5, y: Math.floor(cell / w) + 0.5 }));
  path[path.length - 1] = { x: x1, y: y1 };
  return path;
}
