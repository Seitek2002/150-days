// Cover and positions (AI-2…AI-4): where to hide from the hero, where to peek out and shoot from, where to flank, where to retreat.
// Our world is flat: cover is a free cell next to a wall from whose centre the hero can't be seen (a wall or a corner between walls).
// Everything is computed over the level's cells within a few steps of walking — a breadth-first search from the creature.
import type { Level } from '../../engine/level.ts';
import { lineOfSight } from '../creature.ts';

export interface Spot {
  x: number;
  y: number;
}

const open = (level: Level, cx: number, cy: number) =>
  cx >= 0 && cy >= 0 && cx < level.width && cy < level.height && level.walls[cy * level.width + cx] === null && !level.doors.has(cy * level.width + cx);

const center = (cell: number, w: number): Spot => ({ x: (cell % w) + 0.5, y: Math.floor(cell / w) + 0.5 });

/**
 * Cells reachable in at most steps steps (in 4 directions), with the distance in steps.
 * avoid — don't pass closer than 1.5 cells to this point (can't run right past the hero).
 */
function reachable(level: Level, from: Spot, steps: number, avoid?: Spot): Map<number, number> {
  const w = level.width;
  const start = Math.floor(from.y) * w + Math.floor(from.x);
  const dist = new Map<number, number>([[start, 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i]!;
    const d = dist.get(cell)!;
    if (d >= steps) continue;
    const cx = cell % w;
    const cy = Math.floor(cell / w);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      const next = ny * w + nx;
      if (!open(level, nx, ny) || dist.has(next)) continue;
      if (avoid && Math.hypot(nx + 0.5 - avoid.x, ny + 0.5 - avoid.y) < 1.5) continue;
      dist.set(next, d + 1);
      queue.push(next);
    }
  }
  return dist;
}

/** Is there a wall nearby (in 4 directions) — something to hide behind. */
function besideWall(level: Level, cell: number): boolean {
  const w = level.width;
  const cx = cell % w;
  const cy = Math.floor(cell / w);
  return !open(level, cx + 1, cy) || !open(level, cx - 1, cy) || !open(level, cx, cy + 1) || !open(level, cx, cy - 1);
}

/**
 * Cover nearby: a free cell next to a wall from which the hero (threat) can't be seen, at most steps steps away. Closer is better,
 * but not closer to the hero than the creature is now (don't run towards him). taken — cells occupied by allies.
 */
export function findCover(level: Level, from: Spot, threat: Spot, steps = 7, taken: Spot[] = []): Spot | null {
  const w = level.width;
  const here = Math.hypot(from.x - threat.x, from.y - threat.y);
  let best: Spot | null = null;
  let bestScore = Infinity;
  for (const [cell, d] of reachable(level, from, steps)) {
    if (!besideWall(level, cell)) continue;
    const c = center(cell, w);
    if (lineOfSight(level, c.x, c.y, threat.x, threat.y)) continue;
    if (taken.some((t) => Math.floor(t.x) === Math.floor(c.x) && Math.floor(t.y) === Math.floor(c.y))) continue;
    const toThreat = Math.hypot(c.x - threat.x, c.y - threat.y);
    if (toThreat < Math.min(here, 3)) continue;
    const score = d + Math.max(0, here - toThreat) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Where to peek out of cover: the nearest cell (up to 3 steps) from which the hero is visible and within range. */
export function findPeek(level: Level, cover: Spot, threat: Spot, range: number): Spot | null {
  const w = level.width;
  let best: Spot | null = null;
  let bestD = Infinity;
  for (const [cell, d] of reachable(level, cover, 3)) {
    const c = center(cell, w);
    if (Math.hypot(c.x - threat.x, c.y - threat.y) > range) continue;
    if (!lineOfSight(level, c.x, c.y, threat.x, threat.y)) continue;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Where to flank the hero: a point ~distance from him from which he is visible, to the side of the "hero — ally" line
 * (side: −1 — left, +1 — right; angle 70–110°), reachable in at most steps steps.
 */
export function findFlank(level: Level, from: Spot, threat: Spot, ally: Spot, side: -1 | 1, distance: number, steps = 18): Spot | null {
  const w = level.width;
  const base = Math.atan2(ally.y - threat.y, ally.x - threat.x);
  const cells = reachable(level, from, steps);
  let best: Spot | null = null;
  let bestScore = Infinity;
  for (let turn = 70; turn <= 110; turn += 10) {
    for (let r = distance * 0.6; r <= distance; r += 1) {
      const a = base + side * ((turn * Math.PI) / 180);
      const x = threat.x + Math.cos(a) * r;
      const y = threat.y + Math.sin(a) * r;
      const cell = Math.floor(y) * w + Math.floor(x);
      const d = cells.get(cell);
      if (d === undefined) continue;
      const c = center(cell, w);
      if (!lineOfSight(level, c.x, c.y, threat.x, threat.y)) continue;
      const score = d + Math.abs(turn - 90) / 10;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }
  return best;
}

/**
 * Where to retreat: as far from the hero as possible (up to steps steps), preferably where he can't see (hide; animals don't hide —
 * they just run further away). Nowhere to retreat (can't get any further) — null.
 */
export function findRetreat(level: Level, from: Spot, threat: Spot, hide = true, steps = 14): Spot | null {
  const w = level.width;
  let best: Spot | null = null;
  let bestScore = -Infinity;
  for (const [cell] of reachable(level, from, steps, threat)) {
    const c = center(cell, w);
    const far = Math.hypot(c.x - threat.x, c.y - threat.y);
    const hidden = hide && !lineOfSight(level, c.x, c.y, threat.x, threat.y);
    const score = far + (hidden ? 6 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  const now = Math.hypot(from.x - threat.x, from.y - threat.y);
  return best && Math.hypot(best.x - from.x, best.y - from.y) > 1.5 && Math.hypot(best.x - threat.x, best.y - threat.y) > now + 1 ? best : null;
}
