// The original's hexes and our grid: tile numbers, distances, directions and conversion back and forth.
// Fallout scripts speak in hexes (tile_num, move_to, tile_distance…), while our levels are square cells.
// The hex grid rules are as in the original (fallout1-ce, tile.cc: only the design, the code is ours); how our
// grid maps to tiles is set by the level's `hexFrame` (src/world/defs.ts) — by the same conversion as tools/map-view.ts: a cell = 2×2 hexes.
import { hexToPlan, hexToScreen } from '../formats/map.ts';

/** A 200×200 hex grid; tile = row × 200 + index in the row (the index in the row counts from the right edge). */
export const HEX_WIDTH = 200;
export const HEX_SIZE = HEX_WIDTH * HEX_WIDTH;

/** Directions: 0 — up-right (NE), then clockwise. */
export const ROTATION = { ne: 0, e: 1, se: 2, sw: 3, w: 4, nw: 5 } as const;
export const ROTATION_COUNT = 6;

/** How the tile number shifts in each direction: separately for even and odd indices in the row. */
const STEP = [
  [-1, HEX_WIDTH - 1, HEX_WIDTH, HEX_WIDTH + 1, 1, -HEX_WIDTH],
  [-HEX_WIDTH - 1, -1, HEX_WIDTH, 1, 1 - HEX_WIDTH, -HEX_WIDTH],
] as const;

/**
 * Position of our grid on the hexes: which hex lies in the top-left corner of the first cell.
 * `col` counts from the right edge of the grid (as in the original), `row` — the row from the top.
 */
export interface HexFrame {
  col: number;
  row: number;
}

export const validTile = (tile: number): boolean => Number.isInteger(tile) && tile >= 0 && tile < HEX_SIZE;

/** A tile on the edge of the grid: you can't step beyond it. */
export function tileOnEdge(tile: number): boolean {
  return tile < HEX_WIDTH || tile >= HEX_SIZE - HEX_WIDTH || tile % HEX_WIDTH === 0 || tile % HEX_WIDTH === HEX_WIDTH - 1;
}

/**
 * In which of the six directions from tile `from` tile `to` lies (by their position on the original's screen).
 * An invalid tile — 0.
 */
export function tileDir(from: number, to: number): number {
  if (!validTile(from) || !validTile(to)) return 0;
  const a = hexToScreen(from);
  const b = hexToScreen(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0) return dy < 0 ? ROTATION.ne : ROTATION.se;
  const degrees = Math.trunc((Math.atan2(-dy, dx) * 180) / Math.PI);
  let turn = 360 - (degrees + 180) - 90;
  if (turn < 0) turn += 360;
  const rotation = Math.trunc(turn / 60);
  return rotation >= ROTATION_COUNT ? ROTATION.nw : rotation;
}

/** Distance in hexes: how many steps from one tile to another (walking towards the target, as in the original). */
export function tileDist(from: number, to: number): number {
  if (!validTile(from) || !validTile(to)) return 9999;
  let tile = from;
  let steps = 0;
  while (tile !== to) {
    const parity = (tile % HEX_WIDTH) & 1;
    tile += STEP[parity]![tileDir(tile, to)]!;
    // Safeguard: a map never has more than 400 steps — otherwise something went wrong.
    if (!validTile(tile) || ++steps > 400) return 9999;
  }
  return steps;
}

/** The tile `distance` steps in direction `rotation`; stops at the edge of the grid. */
export function tileInDirection(tile: number, rotation: number, distance: number): number {
  let next = tile;
  for (let i = 0; i < distance; i++) {
    if (tileOnEdge(next)) break;
    next += STEP[(next % HEX_WIDTH) & 1]![rotation]!;
  }
  return next;
}

/** Origin of our grid on the hex plan (in hex units): x — along the rows, y — along the index in the row. */
const frameOrigin = (frame: HexFrame) => ({ x: frame.row, y: HEX_WIDTH - 1 - frame.col });

/**
 * The hex under a point of our map (cells, fractional: the centre of a cell is x + 0.5, y + 0.5).
 * A point outside the original's grid — −1.
 */
export function hexAt(frame: HexFrame, x: number, y: number): number {
  const origin = frameOrigin(frame);
  const planX = origin.x + 2 * x;
  const planY = origin.y + 2 * y;
  const inRow = Math.round(planY);
  const col = HEX_WIDTH - 1 - inRow;
  const row = Math.round(planX - (col & 1 ? 0.5 : 0));
  if (inRow < 0 || inRow >= HEX_WIDTH || row < 0 || row >= HEX_WIDTH) return -1;
  return row * HEX_WIDTH + inRow;
}

/**
 * "On screen" (obj_on_screen), as in the original: point at is within the 640×380-pixel game window around the hero (hero), wherever he
 * is looking: there the camera is overhead and sees everything around (ours is a narrow cone of view). null — the point is outside the original's grid.
 */
export function onOriginalScreen(frame: HexFrame, hero: { x: number; y: number }, at: { x: number; y: number }): boolean | null {
  const from = hexAt(frame, hero.x, hero.y);
  const to = hexAt(frame, at.x, at.y);
  if (from < 0 || to < 0) return null;
  const a = hexToScreen(from);
  const b = hexToScreen(to);
  return Math.abs(b.x - a.x) <= SCREEN_HALF.x && Math.abs(b.y - a.y) <= SCREEN_HALF.y;
}
/** Half sizes of the original's game window in its screen pixels. */
const SCREEN_HALF = { x: 320, y: 190 } as const;

/** Centre of a hex on our map (cells, fractional). */
export function hexCenter(frame: HexFrame, tile: number): { x: number; y: number } {
  const origin = frameOrigin(frame);
  const plan = hexToPlan(tile);
  return { x: (plan.x - origin.x) / 2, y: (plan.y - origin.y) / 2 };
}

/** Where each of the six directions points on our plan (angle from east, clockwise, as for the player). */
const DIRECTION_ANGLES = (() => {
  const middle = HEX_WIDTH * 100 + 100;
  const from = hexToPlan(middle);
  return Array.from({ length: ROTATION_COUNT }, (_, rotation) => {
    const to = hexToPlan(tileInDirection(middle, rotation, 1));
    return Math.atan2(to.y - from.y, to.x - from.x);
  });
})();

/** Our view angle for direction 0–5 (turning a creature at a script's request). */
export function angleFromRotation(rotation: number): number {
  return DIRECTION_ANGLES[((rotation % ROTATION_COUNT) + ROTATION_COUNT) % ROTATION_COUNT] ?? 0;
}

/**
 * Direction (0–5) from our view angle: on the plan the six directions are spaced unevenly (the hex is stretched),
 * so the nearest one by angle is taken.
 */
export function rotationFromAngle(angle: number): number {
  let best: number = ROTATION.ne;
  let bestDiff = Infinity;
  DIRECTION_ANGLES.forEach((direction, rotation) => {
    const diff = Math.abs(Math.atan2(Math.sin(angle - direction), Math.cos(angle - direction)));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = rotation;
    }
  });
  return best;
}
