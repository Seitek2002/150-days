// Level light and shadows, computed once on entering the map (Opus's decision at the visual-style stage):
// soft shadow by walls and in room corners and pools of light from the original's light sources — light doesn't pass through walls.
// The renderer takes the brightness of floor, ceiling, wall and sprite points from here (smoothly interpolated between grid points).
import type { Level } from './level.ts';
import { EMISSIVE } from './textures.ts';

/** Grid points per cell along each side. */
export const LM_RES = 8;
/** How dark it is right at a wall (fraction of light) and how many cells from the wall the shadow extends. */
const AO_DEPTH = 0.42;
const AO_REACH = 0.55;
/** A corner is never darker than this. */
const AO_MIN = 0.42;
/** Patches across the whole map (so the floor and wall images don't repeat cell after cell): size in cells and depth. */
const PATCH_CELLS = 5;
const PATCH_DEPTH = 0.16;
/** In the light grid 255 means this much (a nearby light source can shine brighter than usual). */
export const LAMP_SCALE = 2;

export interface LightMap {
  width: number;
  height: number;
  /** Shadow by walls and large patches across the map: 255 — no shadow. */
  ao: Uint8Array;
  /** Light from light sources (255 — LAMP_SCALE); null — the map has no light sources. */
  lamp: Uint8Array | null;
}

/** A momentary flickering light: muzzle flash, explosion. */
export interface DynamicLight {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

/** A wall that casts a shadow and blocks light (glowing openings and force fields don't). */
function solid(level: Level, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= level.width || cy >= level.height) return true;
  const wall = level.walls[cy * level.width + cx];
  return wall !== null && wall !== undefined && !EMISSIVE.has(wall);
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** How much one wall darkens a point at distance d from it. */
export const wallShade = (d: number): number => 1 - AO_DEPTH * (1 - smooth(0, AO_REACH, d));

/** A number 0..1 by patch grid cell. */
function cellRandom(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth patches across the map: 1 — lightest, 1 − PATCH_DEPTH — darkest. */
function patchAt(x: number, y: number): number {
  const fx = x / PATCH_CELLS;
  const fy = y / PATCH_CELLS;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth(0, 1, fx - ix);
  const ty = smooth(0, 1, fy - iy);
  const top = cellRandom(ix, iy) * (1 - tx) + cellRandom(ix + 1, iy) * tx;
  const bottom = cellRandom(ix, iy + 1) * (1 - tx) + cellRandom(ix + 1, iy + 1) * tx;
  return 1 - PATCH_DEPTH * (top * (1 - ty) + bottom * ty);
}

export function buildLightMap(level: Level): LightMap {
  const width = level.width * LM_RES;
  const height = level.height * LM_RES;
  const ao = new Uint8Array(width * height).fill(255);
  // Patches are at cell corners, smoothly interpolated inside a cell (many times faster on a big wasteland).
  const cornerW = level.width + 1;
  const corners = new Float32Array(cornerW * (level.height + 1));
  for (let y = 0; y <= level.height; y++) for (let x = 0; x <= level.width; x++) corners[y * cornerW + x] = patchAt(x, y);
  for (let cy = 0; cy < level.height; cy++) {
    for (let cx = 0; cx < level.width; cx++) {
      if (solid(level, cx, cy)) continue;
      const p00 = corners[cy * cornerW + cx] ?? 1;
      const p10 = corners[cy * cornerW + cx + 1] ?? 1;
      const p01 = corners[(cy + 1) * cornerW + cx] ?? 1;
      const p11 = corners[(cy + 1) * cornerW + cx + 1] ?? 1;
      // This cell's neighboring walls; a corner one counts only if both sides of the corner are open (otherwise the shadow doubles).
      const near: [number, number][] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && solid(level, cx + dx, cy + dy) && !(dx && dy && (solid(level, cx + dx, cy) || solid(level, cx, cy + dy)))) near.push([dx, dy]);
        }
      }
      for (let sy = 0; sy < LM_RES; sy++) {
        for (let sx = 0; sx < LM_RES; sx++) {
          const px = (sx + 0.5) / LM_RES;
          const py = (sy + 0.5) / LM_RES;
          let shade = 1;
          for (const [dx, dy] of near) {
            const ddx = dx < 0 ? px : dx > 0 ? 1 - px : 0;
            const ddy = dy < 0 ? py : dy > 0 ? 1 - py : 0;
            shade *= wallShade(Math.hypot(ddx, ddy));
          }
          const patch = (p00 * (1 - px) + p10 * px) * (1 - py) + (p01 * (1 - px) + p11 * px) * py;
          ao[(cy * LM_RES + sy) * width + cx * LM_RES + sx] = Math.round(Math.max(AO_MIN, shade) * patch * 255);
        }
      }
    }
  }
  return { width, height, ao, lamp: level.lights?.length ? lampLight(level, width, height) : null };
}

/** Pools of light from light sources: brightness falls off toward the edge of the circle, walls block it. */
function lampLight(level: Level, width: number, height: number): Uint8Array {
  const sum = new Float32Array(width * height);
  for (const light of level.lights ?? []) {
    const { x, y } = outOfWall(level, light.x, light.y);
    const r = light.radius;
    for (let cy = Math.max(0, Math.floor(y - r)); cy <= Math.min(level.height - 1, Math.floor(y + r)); cy++) {
      for (let cx = Math.max(0, Math.floor(x - r)); cx <= Math.min(level.width - 1, Math.floor(x + r)); cx++) {
        if (solid(level, cx, cy)) continue;
        for (let sy = 0; sy < LM_RES; sy++) {
          for (let sx = 0; sx < LM_RES; sx++) {
            const px = cx + (sx + 0.5) / LM_RES;
            const py = cy + (sy + 0.5) / LM_RES;
            const d = Math.hypot(px - x, py - y);
            if (d >= r || !clear(level, x, y, px, py)) continue;
            const f = 1 - d / r;
            sum[(cy * LM_RES + sy) * width + cx * LM_RES + sx]! += light.intensity * f * f;
          }
        }
      }
    }
  }
  const lamp = new Uint8Array(width * height);
  for (let i = 0; i < sum.length; i++) lamp[i] = Math.min(255, Math.round(((sum[i] ?? 0) / LAMP_SCALE) * 255));
  return lamp;
}

/** A light source on a wall (the original's lamps often hang on a wall hex) — moved off the wall into a neighboring open cell. */
function outOfWall(level: Level, x: number, y: number): { x: number; y: number } {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (!solid(level, cx, cy)) return { x, y };
  let best = { x, y };
  let bestDist = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (solid(level, cx + dx, cy + dy)) continue;
      const nx = Math.min(cx + dx + 0.85, Math.max(cx + dx + 0.15, x));
      const ny = Math.min(cy + dy + 0.85, Math.max(cy + dy + 0.15, y));
      const d = Math.hypot(nx - x, ny - y);
      if (d < bestDist) {
        best = { x: nx, y: ny };
        bestDist = d;
      }
    }
  }
  return best;
}

/** Whether light from (x0, y0) reaches point (x1, y1): no wall between them. */
function clear(level: Level, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(d / 0.2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (solid(level, Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t))) return false;
  }
  return true;
}

/** Grid value at a level point, smoothly interpolated between grid points (0–255). */
export function sampleGrid(grid: Uint8Array, map: LightMap, x: number, y: number): number {
  const fx = x * LM_RES - 0.5;
  const fy = y * LM_RES - 0.5;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  if (ix < 0 || iy < 0 || ix + 1 >= map.width || iy + 1 >= map.height) return grid === map.ao ? 255 : 0;
  const tx = fx - ix;
  const ty = fy - iy;
  const i = iy * map.width + ix;
  const top = (grid[i] ?? 0) * (1 - tx) + (grid[i + 1] ?? 0) * tx;
  const bottom = (grid[i + map.width] ?? 0) * (1 - tx) + (grid[i + map.width + 1] ?? 0) * tx;
  return top * (1 - ty) + bottom * ty;
}
