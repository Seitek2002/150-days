// Holes in the ground — the Glow crater and the smaller craters nearby (client request, 2026-10-25: "a huge crater whose bottom you can't see — not
// a texture, but a real hole"). The shape follows the original map: center and edge radius by direction (the ring of cliff tiles
// GLOWENT), plus small raggedness of the edge. From the edge down: a narrow rim of debris, a slope and (for a deep one) a drop into a bottomless
// shaft — the walls are nearly vertical, no light deeper down. A shallow crater is just a bowl. The renderer (renderer.ts — craters)
// walks each frame column from near to far, as over terrain, and paints the frame bottom to top: both the near
// slope and the far shaft wall fading into blackness are visible. You can't walk up to the center (solidAt).
import type { Block } from './level.ts';
import type { TextureName } from './textures.ts';
import type { LevelCrater } from '../world/defs.ts';

/** How many radius values around the circle (ragged edge). */
const TABLE = 720;
/** Fractions of the radius: the debris rim at the edge, and where the shaft starts for a deep one. */
export const LIP = 0.14;
export const SHAFT = 0.5;
/** Depth (storeys): at the end of the rim, at the start of the shaft; how many storeys of drop per radius fraction in the shaft. */
const LIP_DEPTH = 0.06;
const SLOPE_DEPTH = 1.15;
const SHAFT_DROP = 40;
/** Shallow crater: depth at the center. */
const BOWL_DEPTH = 0.32;
/** You can't get closer to the center than this fraction of the radius. */
export const WALK = 0.84;

export interface Crater {
  x: number;
  y: number;
  /** Edge radius by angle (TABLE values around the circle, from east clockwise). */
  radii: Float32Array;
  /** The largest radius — for culling. */
  reach: number;
  /** The average radius — for the drawing along the edge. */
  mean: number;
  shaft: boolean;
  lip: TextureName;
  slope: TextureName;
  wall: TextureName;
  /** Tied rope (beam with a rope): in which direction and from which radius fraction it hangs down. */
  rope?: { angle: number; from: number };
}

/** Build a level's hole: radius by direction, smoothly between the given values and with small raggedness. */
export function buildCrater(def: LevelCrater): Crater {
  const n = def.radius.length;
  const radii = new Float32Array(TABLE);
  let reach = 0;
  let sum = 0;
  for (let i = 0; i < TABLE; i++) {
    const a = (i / TABLE) * Math.PI * 2;
    const f = (i / TABLE) * n;
    const k = Math.floor(f);
    const t = f - k;
    const s = t * t * (3 - 2 * t);
    const r0 = def.radius[k % n]!;
    const r1 = def.radius[(k + 1) % n]!;
    // Ragged edge: several waves with different spacing — uneven, but without single-point spikes.
    const torn = 0.16 * Math.sin(a * 7 + 1.3) + 0.1 * Math.sin(a * 13 + 4.1) + 0.06 * Math.sin(a * 31 + 2.2);
    const r = Math.max(0.5, r0 + (r1 - r0) * s + torn * Math.min(1, r0 / 4));
    radii[i] = r;
    reach = Math.max(reach, r);
    sum += r;
  }
  return { x: def.x, y: def.y, radii, reach, mean: sum / TABLE, shaft: def.shaft ?? false, lip: def.lip, slope: def.slope, wall: def.wall ?? def.slope };
}

/** Edge radius in direction angle (radians from east clockwise). */
export function craterEdge(c: Crater, angle: number): number {
  const f = ((angle / (Math.PI * 2)) % 1 + 1) % 1 * TABLE;
  const i = Math.floor(f);
  const t = f - i;
  return c.radii[i % TABLE]! * (1 - t) + c.radii[(i + 1) % TABLE]! * t;
}

/** Hole depth by radius fraction s (0 — center, 1 — edge): for a deep one — down to the abyss in the shaft. */
export function depthAt(c: Crater, s: number): number {
  if (s >= 1) return 0;
  if (!c.shaft) {
    const k = 1 - s * s;
    return BOWL_DEPTH * k * k;
  }
  if (s > 1 - LIP) return (LIP_DEPTH * (1 - s)) / LIP;
  if (s > SHAFT) {
    const k = (1 - LIP - s) / (1 - LIP - SHAFT);
    return LIP_DEPTH + SLOPE_DEPTH * k * Math.sqrt(k);
  }
  return LIP_DEPTH + SLOPE_DEPTH + SHAFT_DROP * (SHAFT - s);
}

/** A point in the hole: radius fraction and angle (null — outside). */
export function craterSpot(c: Crater, x: number, y: number): { s: number; angle: number } | null {
  const dx = x - c.x;
  const dy = y - c.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= c.reach * c.reach) return null;
  const angle = Math.atan2(dy, dx);
  const s = Math.sqrt(d2) / craterEdge(c, angle);
  return s < 1 ? { s, angle } : null;
}

/** Depth below ground at a point (0 — not in a hole). */
export function craterDepth(c: Crater, x: number, y: number): number {
  const spot = craterSpot(c, x, y);
  return spot ? depthAt(c, spot.s) : 0;
}

/** Can't go here: too close to the center of the hole. */
export function craterBlocks(c: Crater, x: number, y: number): boolean {
  const spot = craterSpot(c, x, y);
  return !!spot && spot.s < WALK;
}

/** Deterministic generator (mulberry32): the debris around a hole is always the same. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A block by the hole (slab at the edge, beam over the drop) and the cells it lies in. */
export interface CraterPiece {
  cells: number[];
  block: Block;
}

/** Numbers of the big blocks by holes (the beam lies as copies in two cells and is drawn once). */
const PIECE_GROUP = 7_000_000;

/** Beam by the hole: the beam scenery with a script (and the coil of rope) lies on it — they don't get in its way. */
export function isCraterBeam(b: Block): boolean {
  return (b.group ?? 0) >= PIECE_GROUP && (b.group ?? 0) < PIECE_GROUP + 1000;
}

/**
 * Debris by the hole: concrete slabs along the edge (of different sizes and heights, some above the rim) and a steel beam from the edge toward
 * the center (people climb down it on a rope). Slabs are not placed in walls or by the beam; each one is in its own cell.
 */
export function craterPieces(c: Crater, def: LevelCrater, width: number, height: number, isWall: (x: number, y: number) => boolean, index = 0): CraterPiece[] {
  const out: CraterPiece[] = [];
  const beam = def.beam;
  if (def.slabs) {
    const rand = rng(Math.floor(c.x * 131 + c.y * 977) + index);
    for (let k = 0; k < def.slabs.count; k++) {
      const angle = ((k + rand() * 0.6) / def.slabs.count) * Math.PI * 2;
      const edge = craterEdge(c, angle);
      const r = edge * (0.93 + rand() * 0.16);
      const x = c.x + Math.cos(angle) * r;
      const y = c.y + Math.sin(angle) * r;
      if (beam && Math.hypot(x - beam.x, y - beam.y) < 1.6) continue;
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      if (cx < 0 || cy < 0 || cx >= width || cy >= height || isWall(cx, cy)) continue;
      // A slab within its own cell.
      const hw = 0.12 + rand() * 0.22;
      const hd = 0.1 + rand() * 0.2;
      const x0 = Math.max(cx + 0.02, x - hw);
      const x1 = Math.min(cx + 0.98, x + hw);
      const y0 = Math.max(cy + 0.02, y - hd);
      const y1 = Math.min(cy + 0.98, y + hd);
      if (x1 - x0 < 0.15 || y1 - y0 < 0.15) continue;
      const block: Block = { x0, x1, y0, y1, height: 0.04 + rand() * 0.11, front: def.slabs.side, side: def.slabs.side, top: def.slabs.top, facing: 0, fill: false };
      out.push({ cells: [cy * width + cx], block });
    }
  }
  if (beam) {
    // The beam — from a point at the edge toward the center, along the axis closer to the direction of the center.
    const dx = c.x - beam.x;
    const dy = c.y - beam.y;
    const len = beam.length ?? 1.6;
    const half = 0.11;
    const alongX = Math.abs(dx) > Math.abs(dy);
    const end = alongX ? beam.x + Math.sign(dx) * len : beam.y + Math.sign(dy) * len;
    const [a0, a1] = alongX ? [Math.min(beam.x, end), Math.max(beam.x, end)] : [Math.min(beam.y, end), Math.max(beam.y, end)];
    const block: Block = alongX
      ? { x0: a0, x1: a1, y0: beam.y - half, y1: beam.y + half, height: 0.13, front: beam.texture, side: beam.texture, top: beam.texture, facing: 0, fill: false, group: PIECE_GROUP + index }
      : { x0: beam.x - half, x1: beam.x + half, y0: a0, y1: a1, height: 0.13, front: beam.texture, side: beam.texture, top: beam.texture, facing: 2, fill: false, group: PIECE_GROUP + index };
    const cells = new Set<number>();
    for (let cy = Math.floor(block.y0); cy <= Math.floor(block.y1 - 1e-6); cy++) {
      for (let cx = Math.floor(block.x0); cx <= Math.floor(block.x1 - 1e-6); cx++) cells.add(cy * width + cx);
    }
    out.push({ cells: [...cells], block });
  }
  return out;
}
