// The open-air sky (our own drawing, in code): two rows of mountains on the horizon (the far ones in haze), clouds at height,
// the sun with its glow by time of day and stars at night. The tables are computed once on first display.

/** How many points in the mountain table for a full circle. */
const RING = 2048;
/** Cloud texture size (wraps at the edges). */
const CLOUD = 256;
/** Cloud height (in cells) and how many times their texture is stretched. */
export const CLOUD_HEIGHT = 9;
export const CLOUD_SCALE = 3;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Mountain line around the circle: height (angle above the horizon, radians) for each direction. A sum of waves with a whole number
 * of waves per circle — no seam; the absolute value gives sharp peaks.
 */
function ridge(seed: number, base: number, amp: number, waves: number): Float32Array {
  const rand = rng(seed);
  const parts = Array.from({ length: waves }, (_, i) => ({ k: i + 2, phase: rand() * Math.PI * 2, a: 1 / Math.pow(i + 2, 1.1) }));
  const table = new Float32Array(RING);
  let max = 0;
  for (let i = 0; i < RING; i++) {
    const az = (i / RING) * Math.PI * 2;
    let v = 0;
    for (const p of parts) v += p.a * (1 - Math.abs(Math.sin(az * p.k * 0.5 + p.phase)));
    table[i] = v;
    max = Math.max(max, v);
  }
  for (let i = 0; i < RING; i++) table[i] = base + Math.pow((table[i] ?? 0) / max, 2.4) * amp;
  return table;
}

/** Clouds: multi-layer noise that wraps at the edges. */
function cloudTexture(): Float32Array {
  const tex = new Float32Array(CLOUD * CLOUD);
  const rand = rng(77);
  let amp = 1;
  let total = 0;
  for (let cells = 4; cells <= 64; cells *= 2) {
    const grid = Float32Array.from({ length: cells * cells }, rand);
    const at = (x: number, y: number) => grid[(y % cells) * cells + (x % cells)] ?? 0;
    for (let y = 0; y < CLOUD; y++) {
      for (let x = 0; x < CLOUD; x++) {
        const fx = (x / CLOUD) * cells;
        const fy = (y / CLOUD) * cells;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
        const ty = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
        const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
        const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
        tex[y * CLOUD + x]! += (top * (1 - ty) + bottom * ty) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < tex.length; i++) tex[i] = (tex[i] ?? 0) / total;
  return tex;
}

let tables: { far: Float32Array; near: Float32Array; clouds: Float32Array } | null = null;

function sky() {
  tables ??= { far: ridge(301, 0.03, 0.16, 12), near: ridge(302, 0.006, 0.07, 16), clouds: cloudTexture() };
  return tables;
}

const ringIndex = (az: number) => ((Math.floor((az / (Math.PI * 2)) * RING) % RING) + RING) % RING;

/** Height of the far and near mountains in direction az. */
export function mountainsAt(az: number): { far: number; near: number } {
  const t = sky();
  const i = ringIndex(az);
  return { far: t.far[i] ?? 0, near: t.near[i] ?? 0 };
}

/** Cloud density at a point of the cloud plane (0..1). */
export function cloudAt(u: number, v: number): number {
  const t = tables?.clouds ?? sky().clouds;
  return t[((Math.floor(v) & (CLOUD - 1)) << 8) | (Math.floor(u) & (CLOUD - 1))] ?? 0;
}

/** A star in this direction (0 — none, up to 1 — bright); rate — what share of points hold a star (the Milky Way is denser). */
export function starAt(az: number, elevation: number, rate = 0.0035): number {
  const ix = Math.floor(az * 300);
  const iy = Math.floor(elevation * 300);
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  return r > 1 - rate ? (r - (1 - rate)) / rate : 0;
}

/** Size of the Moon image (points per side). */
const MOON = 64;
let moonTable: Float32Array | null = null;

/**
 * The Moon image (our own, in code): a light disc, dark "seas" — large blotches, and craters — a dark floor with a light rim.
 * The value is the surface brightness (0..1).
 */
function moonTexture(): Float32Array {
  const tex = new Float32Array(MOON * MOON);
  const rand = rng(1969);
  const seas = Array.from({ length: 7 }, () => ({ x: rand() * 1.4 - 0.7, y: rand() * 1.4 - 0.8, r: 0.18 + rand() * 0.25 }));
  const pits = Array.from({ length: 34 }, () => ({ x: rand() * 2 - 1, y: rand() * 2 - 1, r: 0.03 + rand() * rand() * 0.16 }));
  for (let j = 0; j < MOON; j++) {
    for (let i = 0; i < MOON; i++) {
      const x = (i + 0.5) / (MOON / 2) - 1;
      const y = (j + 0.5) / (MOON / 2) - 1;
      let v = 0.86 + (cloudAt(i * 4, j * 4) - 0.5) * 0.12;
      for (const s of seas) {
        const d = Math.hypot(x - s.x, y - s.y) / s.r;
        if (d < 1) v -= 0.3 * (1 - d * d);
      }
      for (const p of pits) {
        const d = Math.hypot(x - p.x, y - p.y) / p.r;
        if (d < 0.8) v -= 0.18 * (1 - d / 0.8);
        else if (d < 1.15) v += 0.12 * (1 - Math.abs(d - 0.98) / 0.17);
      }
      tex[j * MOON + i] = Math.max(0.2, Math.min(1, v));
    }
  }
  return tex;
}

/** Brightness of the Moon's surface at a disc point (x, y — from −1 to 1, center — 0). */
export function moonAt(x: number, y: number): number {
  moonTable ??= moonTexture();
  const i = Math.max(0, Math.min(MOON - 1, Math.floor((x + 1) * (MOON / 2))));
  const j = Math.max(0, Math.min(MOON - 1, Math.floor((y + 1) * (MOON / 2))));
  return moonTable[j * MOON + i] ?? 0;
}
