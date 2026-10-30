// Elevator doors on walls (client, 2026-10-25: "you can't see which is the elevator and which is the exit"). An elevator in a level is only
// a point (an elevator object) with no image; so the elevator doors go on the nearest wall behind that point (the
// liftDoor picture). An elevator that goes up into the open (from an underground level to the surface) is an "exit": doors with a green
// up arrow (liftExit). The wall "behind the elevator" is opposite the passage you approach it from; in vaults the elevator stands
// in the middle of a platform, so the nearest wall is 2–3 cells away, and E also works at the doors themselves (front). Sometimes the elevator
// doors in a level are a door from the original map with a wall right behind it (Vault 13): then there is no picture, and that door itself
// looks like elevator doors (door is its cell).
import type { Level } from '../engine/level.ts';
import type { Destination, LevelDef, LevelPanel } from '../world/defs.ts';

/** Doors: width (cells, along the middle of a cell side) and height (floors). */
const DOOR_HALF = 0.4;
const DOOR_HEIGHT = 0.94;
/** How far from the elevator to look for a wall (cells). */
const WALL_REACH = 3;
/** The point "at the doors" is this far from the wall. */
const FRONT = 0.35;

/** The side of the wall cell that is visible from the elevator, and the step from the elevator to that wall. */
const SIDES = [
  { dx: -1, dy: 0, face: 'east' },
  { dx: 1, dy: 0, face: 'west' },
  { dx: 0, dy: -1, face: 'south' },
  { dx: 0, dy: 1, face: 'north' },
] as const;

/**
 * Whether the elevator leads outside: it is not under the open sky itself, but one of its floors is. outdoor tells whether a map has open sky
 * (by its number).
 */
export function liftLeadsOut(def: Pick<LevelDef, 'outdoor'>, floors: readonly Destination[], current: number, outdoor: (map: string) => boolean): boolean {
  if (def.outdoor) return false;
  return floors.some((f, i) => i !== current && outdoor(f.map));
}

/**
 * Elevator doors for the point at: on the nearest wall (no farther than WALL_REACH cells in a straight line), among equals the one opposite the passage.
 * front is the point at the doors themselves (the elevator can be called there too). No walls nearby means null.
 */
export function liftPanel(level: Level, at: { x: number; y: number }, exit: boolean): { panel?: LevelPanel; door?: number; front: { x: number; y: number }; wall: { x: number; y: number; dx: number; dy: number; face: LevelPanel['face'] } } | null {
  const { width, height } = level;
  const cx = Math.floor(at.x);
  const cy = Math.floor(at.y);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const isWall = (x: number, y: number) => inside(x, y) && !level.doors.has(y * width + x) && level.walls[y * width + x] !== null && level.walls[y * width + x] !== 'forcefield';
  const isDoor = (x: number, y: number) => inside(x, y) && level.doors.has(y * width + x);
  const isOpen = (x: number, y: number) => inside(x, y) && !isWall(x, y) && !isDoor(x, y);
  let best: { side: (typeof SIDES)[number]; k: number; score: number; door: boolean } | null = null;
  for (const side of SIDES) {
    let k = 1;
    while (k <= WALL_REACH && isOpen(cx + side.dx * k, cy + side.dy * k)) k++;
    const x = cx + side.dx * k;
    const y = cy + side.dy * k;
    // A door with a wall right behind it is the elevator doors.
    const door = isDoor(x, y) && isWall(x + side.dx, y + side.dy);
    if (k > WALL_REACH || (!isWall(x, y) && !door)) continue;
    // The back wall of a niche: the passage is on the other side of the elevator; elevator doors from the original map are best.
    const score = k - (isOpen(cx - side.dx, cy - side.dy) ? 0.5 : 0) - (door ? 1 : 0);
    if (!best || score < best.score) best = { side, k, score, door };
  }
  if (!best) return null;
  const { side, k } = best;
  if (best.door) {
    const x = cx + side.dx * k;
    const y = cy + side.dy * k;
    return { door: y * width + x, front: { x: x + 0.5 - side.dx * (0.5 + FRONT), y: y + 0.5 - side.dy * (0.5 + FRONT) }, wall: { x, y, dx: side.dx, dy: side.dy, face: side.face } };
  }
  const wx = cx + side.dx * k;
  const wy = cy + side.dy * k;
  const alongX = side.dx === 0;
  // The side line: for east and south it is the far edge of the wall cell, for west and north the near one.
  const line = alongX ? wy + (side.dy < 0 ? 1 : 0) : wx + (side.dx < 0 ? 1 : 0);
  const mid = alongX ? cx + 0.5 : cy + 0.5;
  const out = alongX ? line - side.dy * FRONT : line - side.dx * FRONT;
  return {
    panel: { face: side.face, at: line, a0: mid - DOOR_HALF, a1: mid + DOOR_HALF, from: 0, to: DOOR_HEIGHT, picture: exit ? 'liftExit' : 'liftDoor' },
    front: alongX ? { x: mid, y: out } : { x: out, y: mid },
    wall: { x: wx, y: wy, dx: side.dx, dy: side.dy, face: side.face },
  };
}
