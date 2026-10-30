// Our own wall, floor and ceiling textures. Drawn in code at startup, in the spirit of the wasteland: vault steel,
// cave stone, clay, concrete ruins, scrap iron. Nothing here is from Fallout files.
// Each texture is a color and a relief height at every point; light "from the upper left" over the relief makes seams, bolts,
// bricks and cracks look three-dimensional (Opus's decision at the visual-style stage: 128×128 instead of 64×64).
// Furniture drawings (lockers, tables, crates) — in furniture-textures.ts.
import { furnitureTextures, type FurnitureTexture } from './furniture-textures.ts';
import { retroTextures, type RetroTexture } from './retro-textures.ts';
import { chromeTextures, type ChromeTexture } from './chrome-textures.ts';
import { cathedralTextures, type CathedralTexture } from './cathedral-textures.ts';
import { townTextures, type TownTexture } from './town-textures.ts';
import { doorTextures, type DoorTexture } from './door-textures.ts';
import { decorTextures, type DecorTexture } from './decor-textures.ts';
import { craterTextures, type CraterTexture } from './crater-textures.ts';

export const TEX = 128;
const MASK = TEX - 1;

export interface Texture {
  pixels: Uint32Array; // ABGR, TEX×TEX
  /**
   * Variants of the same texture with different blotches, cracks and rust (the first — pixels). The renderer picks a variant
   * by level cell — so the pattern doesn't repeat in every cell.
   */
  variants: Uint32Array[];
  /** Points that glow by themselves (terminal screen, lamps): 1 — don't darken in the dark. No field — there are none. */
  glow?: Uint8Array;
  /** The same per variant (different variants have different lamps); if present — takes precedence over glow. */
  glows?: Uint8Array[];
  /** On tall walls the image repeats every this many storeys (none — every one). */
  repeat?: number;
  /** Windows that light up at night: window number (1, 2…) in glass points, 0 — not a window. Whether a window is lit is up to the renderer. */
  windows?: Uint8Array;
  /** Light color in a lit window; none — the window glows with its own color (stained glass), only brighter. */
  windowLight?: [number, number, number];
  /** What share of windows are lit at night (none — 0.55). */
  windowShare?: number;
}

/** How many variants walls and floors have. */
const VARIANTS = 3;
/** Offset of all "random" numbers — for the next texture variant. */
let seedShift = 0;

/** Deterministic random number generator: identical textures on every launch. */
export function rng(seed: number) {
  let s = (seed + seedShift) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** A number 0..1 from two integers — for scattering tile and brick shades. */
export function hash(a: number, b: number, seed: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed + seedShift, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth noise that wraps at the texture edges (so there are no seams): cx×cy cells per texture. */
export function noise(seed: number, cx: number, cy = cx) {
  const rand = rng(seed);
  const grid = Float32Array.from({ length: cx * cy }, rand);
  const at = (x: number, y: number) => grid[(((y % cy) + cy) % cy) * cx + (((x % cx) + cx) % cx)] ?? 0;
  return (u: number, v: number): number => {
    const x = (u / TEX) * cx;
    const y = (v / TEX) * cy;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
    const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
}

/** Multi-layer noise: large blotches and fine grain (0..1). */
export function fbm(seed: number, cells: number, octaves = 4) {
  const layers = Array.from({ length: octaves }, (_, i) => noise(seed + i * 101, Math.min(TEX, cells << i)));
  return (u: number, v: number): number => {
    let sum = 0;
    let amp = 1;
    let total = 0;
    for (const layer of layers) {
      sum += layer(u, v) * amp;
      total += amp;
      amp *= 0.5;
    }
    return sum / total;
  };
}

/**
 * Thin winding lines (cracks): 1 — on a line, 0 — off it. width — thickness, coverage — what part of the texture
 * is cracked (toward the edges of that part the cracks narrow and vanish).
 */
export function cracks(seed: number, cells: number, width = 0.012, coverage = 0.5) {
  const n = fbm(seed, cells, 3);
  const mask = noise(seed + 7, 2);
  return (u: number, v: number): number => {
    const w = width * smooth(0.9 - coverage, 1.1 - coverage, mask(u, v));
    return w < 0.001 ? 0 : 1 - smooth(w * 0.4, w, Math.abs(n(u, v) - 0.5));
  };
}

export function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Distance across the texture accounting for wrapping (for pebbles and blotches at the edge). */
export const wrap = (d: number) => ((((d + TEX / 2) % TEX) + TEX) % TEX) - TEX / 2;

function rgb(r: number, g: number, b: number): number {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (0xff << 24) | (c(b) << 16) | (c(g) << 8) | c(r);
}

/** A texture point filled in by the painter: color and relief height (0 — a dip, 1 — a bump). */
export interface Px {
  r: number;
  g: number;
  b: number;
  h: number;
}

/**
 * Build a texture: the painter sets the color and height of each point, then the relief is lit from the upper left
 * (relief — how strongly; 0 — a flat picture).
 */
export function build(paint: (x: number, y: number, p: Px) => void, relief = 1): Texture {
  const n = TEX * TEX;
  const color = new Float32Array(n * 3);
  const height = new Float32Array(n);
  const p: Px = { r: 0, g: 0, b: 0, h: 0.5 };
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      p.h = 0.5;
      paint(x, y, p);
      const i = y * TEX + x;
      color[i * 3] = p.r;
      color[i * 3 + 1] = p.g;
      color[i * 3 + 2] = p.b;
      height[i] = p.h;
    }
  }
  const pixels = new Uint32Array(n);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const i = y * TEX + x;
      const dx = (height[y * TEX + ((x + 1) & MASK)] ?? 0) - (height[y * TEX + ((x - 1) & MASK)] ?? 0);
      const dy = (height[((y + 1) & MASK) * TEX + x] ?? 0) - (height[((y - 1) & MASK) * TEX + x] ?? 0);
      // A slope facing up-left (toward the light) is lighter; one facing away from the light is darker.
      const light = Math.max(0.3, Math.min(1.6, 1 + relief * 1.1 * (0.6 * dx + 0.8 * dy)));
      pixels[i] = rgb((color[i * 3] ?? 0) * light, (color[i * 3 + 1] ?? 0) * light, (color[i * 3 + 2] ?? 0) * light);
    }
  }
  return { pixels, variants: [pixels] };
}

/** A texture in several variants: the same pattern, different random blotches. */
export function varied(make: () => Texture, count = VARIANTS): Texture {
  const variants: Uint32Array[] = [];
  for (let v = 0; v < count; v++) {
    seedShift = v * 7919;
    variants.push(make().pixels);
  }
  seedShift = 0;
  return { pixels: variants[0]!, variants };
}

/**
 * A set of images drawn on first access (town and door images aren't needed on every level, and
 * drawing them all together at startup would take about a second). An override (a custom library block) replaces the image as usual.
 */
export function addLazyTextures<K extends string>(set: Record<K, Texture>, makers: Record<K, () => Texture>): void {
  for (const name of Object.keys(makers) as K[]) {
    const settle = (value: Texture) => Object.defineProperty(set, name, { value, writable: true, enumerable: true, configurable: true });
    Object.defineProperty(set, name, {
      get: () => {
        const value = makers[name]();
        settle(value);
        return value;
      },
      set: settle,
      enumerable: true,
      configurable: true,
    });
  }
}

/** Texture variant number for a level cell. */
export function variantIndex(texture: Texture, cx: number, cy: number): number {
  const n = texture.variants.length;
  if (n === 1) return 0;
  return ((Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0) % n;
}

/** Texture variant for a level cell. */
export function variantOf(texture: Texture, cx: number, cy: number): Uint32Array {
  return texture.variants[variantIndex(texture, cx, cy)] ?? texture.pixels;
}

/** Fill a point with a color at brightness k. */
export function put(p: Px, r: number, g: number, b: number, k = 1): void {
  p.r = r * k;
  p.g = g * k;
  p.b = b * k;
}

/** Hemisphere (rivet, bolt, pebble): height added at a point at distance d from the center. */
export const dome = (d: number, radius: number) => (d < radius ? 1 - (d / radius) ** 2 : 0);

/**
 * What panel metal looks like: rust color, from what noise level the blotches start and how sharp they are, how many
 * streaks; patina — greenish blotches of oxidized copper (Vault 15); shine — how light and even the panel is.
 */
interface PanelLook {
  rust: [number, number, number];
  from: number;
  sharp: number;
  drips: number;
  patina?: [number, number, number];
  shine?: number;
}
const STEEL: PanelLook = { rust: [124, 72, 44], from: 0.57, sharp: 3, drips: 3 };
/** Vault 13 is lived in and kept tidy (client request, 2026-10-24): light clean panels, dirt barely noticeable. */
const CLEAN: PanelLook = { rust: [168, 160, 146], from: 0.7, sharp: 1.2, drips: 0, shine: 0.9 };
/** Vault 15 is abandoned (client request, 2026-10-24): copper panels, rust, streaks and green patina. */
const RUSTED: PanelLook = { rust: [108, 52, 28], from: 0.42, sharp: 2.6, drips: 5, patina: [78, 120, 98] };

/**
 * Steel panels (vaults, base): four plates with bevelled edges, rivets at the corners, brushing marks,
 * rust blotches and streaks running down. The bottom row of plates is darker — like cladding by the floor.
 */
function metalPanel(tint: [number, number, number], seed: number, look: PanelLook = STEEL): Texture {
  const brushed = noise(seed, 2, 64);
  const grain = fbm(seed + 1, 8, 4);
  const rust = fbm(seed + 2, 4, 4);
  const drips = noise(seed + 3, 32, 2);
  const patina = fbm(seed + 4, 5, 3);
  const RIVETS = [5, 58];
  const shine = look.shine ?? 0;
  return build((x, y, p) => {
    const px = x & 63;
    const py = y & 63;
    const edge = Math.min(px, 63 - px, py, 63 - py);
    let h = edge < 1 ? 0.05 : edge < 4 ? 0.15 + (edge - 1) * 0.22 : 0.85;
    for (const rx of RIVETS) for (const ry of RIVETS) h += dome(Math.hypot(px - rx, py - ry), 2.6) * 0.7;
    let k = 0.8 + shine * 0.12 + (brushed(x, y) * 0.12 + grain(x, y) * 0.18) * (1 - shine * 0.6);
    if (y >= 64) k *= 0.86 + shine * 0.08;
    if (edge < 1) k *= 0.45;
    const drip = drips(x, y);
    const rusty = Math.min(1, Math.max(0, (rust(x, y) - look.from) * look.sharp) + (drip > 0.6 ? (py / 64) * (drip - 0.6) * look.drips : 0) + (py > 56 && edge < 6 ? 0.25 * (look.drips / 3) : 0));
    let r = lerp(tint[0], look.rust[0], rusty);
    let g = lerp(tint[1], look.rust[1], rusty);
    let b = lerp(tint[2], look.rust[2], rusty);
    if (look.patina) {
      const green = smooth(0.62, 0.8, patina(x, y)) * (1 - rusty) * 0.8;
      r = lerp(r, look.patina[0], green);
      g = lerp(g, look.patina[1], green);
      b = lerp(b, look.patina[2], green);
    }
    p.r = r * k;
    p.g = g * k;
    p.b = b * k;
    p.h = h;
  });
}

/**
 * Cave-in (the buried corridor of Vault 15): a heap of rubble across the whole passage — chunks of concrete and stone of different sizes and
 * shades, deep dark gaps between them, orange rebar sticking out here and there, smaller rubble on top, lighter with dust.
 */
function rubblePile(): Texture {
  const big = worley(71, 4);
  const small = worley(72, 9);
  const body = fbm(73, 4, 4);
  const warpX = fbm(74, 4, 3);
  const warpY = fbm(75, 4, 3);
  const bars = noise(76, 6, 3);
  const skyline = noise(77, 6, 1);
  return build((x, y, p) => {
    // The heap doesn't reach the ceiling: the top is uneven, above it — the darkness of the buried corridor.
    const ridge = 8 + skyline(x, 0) * 26;
    if (y < ridge) {
      put(p, 40, 36, 32, 0.12 + (y / ridge) * 0.08);
      p.h = 0;
      return;
    }
    const wx = x + (warpX(x, y) - 0.5) * 34;
    const wy = y + (warpY(x, y) - 0.5) * 34;
    // Big chunks at the bottom, small rubble at the top.
    const up = 1 - y / 127;
    const b = up > 0.55 ? small(wx, wy) : big(wx, wy);
    const n = body(x, y);
    const gap = 1 - smooth(0, 2.2, b.f2 - b.f1);
    const bulge = 1 - Math.min(1, b.f1 / (b.size * 0.7));
    const tone = hash(b.id, up > 0.55 ? 1 : 0, 71);
    // Concrete is grey, stone is brown; dust lightens the top.
    const concrete = tone > 0.45;
    const base: [number, number, number] = concrete ? [128, 124, 116] : [118, 96, 72];
    const dust = up * 0.25;
    const k = (0.5 + n * 0.45 + bulge * 0.35) * (1 - gap * 0.75);
    put(p, lerp(base[0], 170, dust), lerp(base[1], 160, dust), lerp(base[2], 140, dust), k);
    p.h = bulge * 1.1 + n * 0.4 - gap * 1.2;
    // Rebar: thin orange rods sticking out of the concrete at an angle.
    const bar = concrete && bulge > 0.25 && Math.abs(((x + y * 0.6 + bars(x, y) * 40) % 31) - 15.5) < 0.7 && hash(b.id, 5, 72) > 0.6;
    if (bar) {
      put(p, 120, 64, 36, 0.9);
      p.h += 0.5;
    }
  }, 1.4);
}

/**
 * Cellular noise (chunks, pebbles): for a point — the distance to the nearest cell center (f1), to the second (f2), the index
 * of the nearest cell and the cell size. Wraps at the texture edges.
 */
export function worley(seed: number, cells: number) {
  const rand = rng(seed);
  const size = TEX / cells;
  const pts = Array.from({ length: cells * cells }, (_, i) => ({ x: ((i % cells) + 0.15 + rand() * 0.7) * size, y: (Math.floor(i / cells) + 0.15 + rand() * 0.7) * size }));
  return (u: number, v: number): { f1: number; f2: number; id: number; size: number } => {
    const cx = Math.floor(u / size);
    const cy = Math.floor(v / size);
    let f1 = Infinity;
    let f2 = Infinity;
    let id = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx;
        const gy = cy + dy;
        const wx = ((gx % cells) + cells) % cells;
        const wy = ((gy % cells) + cells) % cells;
        const pt = pts[wy * cells + wx]!;
        const d = Math.hypot(u - (pt.x + (gx - wx) * size), v - (pt.y + (gy - wy) * size));
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = wy * cells + wx;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    return { f1, f2, id, size };
  };
}

/**
 * Cave stone: chunks of different shades (from warm brown to grey), deep dark gaps between them, small
 * chips on top, streaks running down.
 */
function caveRock(): Texture {
  const big = worley(21, 5);
  const small = worley(24, 11);
  const body = fbm(22, 4, 5);
  const streak = noise(25, 24, 4);
  const crack = cracks(23, 3, 0.01, 0.4);
  const warpX = fbm(26, 4, 3);
  const warpY = fbm(27, 4, 3);
  const seam = fbm(28, 3, 3);
  return build((x, y, p) => {
    // Irregularly shaped chunks: the grid is warped, some joints vanish — pieces merge into large masses.
    const wx = x + (warpX(x, y) - 0.5) * 34;
    const wy = y + (warpY(x, y) - 0.5) * 34;
    const b = big(wx, wy);
    const sm = small(wx, wy);
    const n = body(x, y);
    const m = seam(x, y);
    const gapBig = (1 - smooth(0, 1.5 + m * 4, b.f2 - b.f1)) * smooth(0.36, 0.52, m);
    const gapSmall = (1 - smooth(0, 1.6, sm.f2 - sm.f1)) * smooth(0.45, 0.65, 1 - m);
    const bulge = 1 - Math.min(1, b.f1 / (b.size * 0.75));
    const tone = hash(b.id, 0, 21);
    const st = smooth(0.62, 0.88, streak(wx, y)) * 0.18;
    const k = (0.52 + n * 0.55 + bulge * 0.22) * (1 - gapBig * 0.6) * (1 - gapSmall * 0.22);
    put(p, lerp(126, 104, tone) * (1 - st * 0.5), lerp(96, 94, tone) * (1 - st * 0.9), lerp(66, 86, tone) * (1 - st * 1.2), k);
    p.h = bulge * 0.9 + n * 0.5 - gapBig * 0.9 - gapSmall * 0.25 - crack(x, y) * 0.3;
  }, 1.5);
}

/**
 * Dark rock (the cave by Vault 13 and the original's other caves): blue-black wet stone with vertical folds
 * and veins, light faces on the bumps, a damp sheen.
 */
function caveWall(): Texture {
  const fold = noise(401, 16, 3);
  const streak = noise(406, 48, 5);
  const fine = noise(402, 64, 8);
  const body = fbm(403, 4, 5);
  const vein = cracks(404, 3, 0.012, 0.45);
  const warp = fbm(405, 3, 3);
  return build((x, y, p) => {
    const wx = x + (warp(x, y) - 0.5) * 24;
    const f = fold(wx, y);
    const s = streak(wx, y);
    const n = body(x, y);
    const sheen = smooth(0.7, 0.9, fine(wx, y)) * smooth(0.5, 0.8, f) * 0.45;
    const k = (0.22 + n * 0.35 + f * 0.55 + s * 0.25) * (1 - vein(x, y) * 0.5) + sheen;
    put(p, 46, 54, 76, k);
    p.h = f * 1.3 + s * 0.5 + n * 0.3 - vein(x, y) * 0.4;
  }, 1.8);
}

/** Cave floor: dark blue-grey stone, damp patches, fine grain and thin cracks. */
function caveFloor(): Texture {
  const body = fbm(411, 4, 5);
  const damp = fbm(412, 3, 4);
  const grain = rng(413);
  const crack = cracks(414, 4, 0.008, 0.4);
  return build((x, y, p) => {
    const n = body(x, y);
    const wet = smooth(0.5, 0.75, damp(x, y));
    const k = (0.45 + n * 0.5 + (grain() - 0.5) * 0.12) * (1 - wet * 0.35) * (1 - crack(x, y) * 0.45);
    put(p, lerp(70, 50, wet), lerp(76, 58, wet), lerp(94, 78, wet), k);
    p.h = n * 0.5 - crack(x, y) * 0.3;
  }, 1.1);
}

/** Cobblestone: rounded blue-grey stones of different sizes, dark gaps between them. */
function cobbles(): Texture {
  const stones = worley(421, 7);
  const body = fbm(422, 6, 4);
  const warpX = fbm(423, 4, 3);
  const warpY = fbm(424, 4, 3);
  return build((x, y, p) => {
    const w = stones(x + (warpX(x, y) - 0.5) * 18, y + (warpY(x, y) - 0.5) * 18);
    const n = body(x, y);
    const gap = 1 - smooth(0, 3, w.f2 - w.f1);
    const bulge = 1 - Math.min(1, w.f1 / (w.size * 0.7));
    const tone = hash(w.id, 0, 421);
    put(p, lerp(84, 64, tone), lerp(90, 70, tone), lerp(104, 88, tone), (0.5 + n * 0.35 + bulge * 0.3) * (1 - gap * 0.75));
    p.h = bulge * 0.9 + n * 0.2 - gap;
  }, 1.5);
}

/** Dark cave vault: blue-black bumps and deep gaps. */
function caveCeiling(): Texture {
  const big = worley(431, 4);
  const body = fbm(432, 4, 5);
  const warpX = fbm(433, 4, 3);
  const warpY = fbm(434, 4, 3);
  return build((x, y, p) => {
    const w = big(x + (warpX(x, y) - 0.5) * 40, y + (warpY(x, y) - 0.5) * 40);
    const n = body(x, y);
    const gap = 1 - smooth(0, 3, w.f2 - w.f1);
    const bulge = 1 - Math.min(1, w.f1 / (w.size * 0.8));
    put(p, 40, 46, 62, (0.3 + n * 0.5 + bulge * 0.3) * (1 - gap * 0.7));
    p.h = bulge + n * 0.5 - gap;
  }, 1.6);
}

/** Concrete slab floor: seams, different slab tones, blotches, scratches. */
function concreteFloor(): Texture {
  const body = fbm(31, 8, 4);
  const stain = fbm(32, 4, 3);
  const scratch = cracks(33, 4, 0.006, 0.35);
  return build((x, y, p) => {
    const px = x & 63;
    const py = y & 63;
    const edge = Math.min(px, 63 - px, py, 63 - py);
    const tile = hash(x >> 6, y >> 6, 31);
    const n = body(x, y);
    let k = 0.68 + n * 0.32 + (tile - 0.5) * 0.14;
    if (edge < 1) k *= 0.5;
    const s = smooth(0.58, 0.75, stain(x, y)) * 0.55;
    k *= 1 - scratch(x, y) * 0.2;
    put(p, lerp(112, 62, s), lerp(108, 54, s), lerp(98, 44, s), k);
    p.h = edge < 1 ? 0.1 : edge < 2 ? 0.5 : 0.75 + n * 0.1;
  });
}

/** Ceiling: perforated grated panels. */
function ceilingGrate(): Texture {
  const n = fbm(41, 8, 3);
  return build((x, y, p) => {
    const px = x & 31;
    const py = y & 31;
    const k = 0.6 + n(x, y) * 0.45;
    if (px < 3 || py < 3) {
      put(p, 80, 79, 76, k);
      p.h = 0.9;
    } else if ((px & 3) === 1 && (py & 3) === 1) {
      put(p, 16, 16, 15, k);
      p.h = 0.15;
    } else {
      put(p, 46, 46, 44, k);
      p.h = 0.4;
    }
  }, 1.2);
}

/** Trampled cave earth: damp dark patches, here and there a scatter of small pebbles with shadows. */
function dirtFloor(): Texture {
  const body = fbm(51, 4, 5);
  const damp = fbm(54, 3, 4);
  const gravel = worley(53, 22);
  const mask = fbm(55, 4, 3);
  const grain = rng(56);
  return build((x, y, p) => {
    const n = body(x, y);
    const g = grain();
    const wet = smooth(0.55, 0.72, damp(x, y));
    let k = 0.6 + n * 0.45 + (g - 0.5) * 0.1;
    let r = lerp(100, 70, wet);
    let gg = lerp(80, 56, wet);
    let b = lerp(58, 42, wet);
    let h = n * 0.4 + g * 0.05;
    const w = gravel(x, y);
    const radius = w.size * (0.14 + hash(w.id, 1, 53) * 0.16);
    if (mask(x, y) > 0.56 && hash(w.id, 2, 53) > 0.55 && w.f1 < radius) {
      const t = hash(w.id, 3, 53);
      r = lerp(112, 92, t);
      gg = lerp(94, 80, t);
      b = lerp(72, 66, t);
      k = 0.7 + t * 0.15 + n * 0.15;
      h = 0.5 + dome(w.f1, radius) * 0.22;
    }
    put(p, r, gg, b, k);
    p.h = h;
  }, 1.1);
}

/** Stone vault: large dark bumps, deep gaps between them. */
function rockCeiling(): Texture {
  const big = worley(61, 4);
  const body = fbm(62, 4, 5);
  const warpX = fbm(63, 4, 3);
  const warpY = fbm(64, 4, 3);
  const seam = fbm(65, 3, 3);
  return build((x, y, p) => {
    const w = big(x + (warpX(x, y) - 0.5) * 40, y + (warpY(x, y) - 0.5) * 40);
    const n = body(x, y);
    const m = seam(x, y);
    const gap = (1 - smooth(0, 2 + m * 5, w.f2 - w.f1)) * smooth(0.38, 0.55, m);
    const bulge = 1 - Math.min(1, w.f1 / (w.size * 0.8));
    const tone = hash(w.id, 0, 61);
    put(p, 98 + tone * 12, 82 + tone * 6, 64 + tone * 4, (0.3 + n * 0.55 + bulge * 0.25) * (1 - gap * 0.75));
    p.h = bulge + n * 0.5 - gap;
  }, 1.6);
}

/**
 * Vault blast door (our own drawing): a big round steel door across two wall cells — half half (0 — left,
 * 1 — right). Around it — concrete, a bolted steel ring frame, a gap; on the door — two ring grooves, ribs between
 * them, a wheel in the middle. No teeth around the edge and no number.
 */
function vaultDoor(half: number): Texture {
  const grain = fbm(311, 8, 4);
  const rust = fbm(312, 4, 4);
  const scratch = cracks(313, 6, 0.006, 0.5);
  const brushed = noise(314, 64, 2);
  const TAU = Math.PI * 2;
  return build((x0, y, p) => {
    const x = x0 + half * TEX;
    const dx = x - TEX;
    const dy = y - 64;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const n = grain(x0, y);
    const rusty = smooth(0.55, 0.78, rust(x0, y)) * (0.3 + 0.7 * smooth(-20, 50, dy));
    if (r > 62) {
      // Concrete around the door.
      put(p, 96, 95, 90, 0.55 + n * 0.3);
      p.h = 0.6 + n * 0.1;
      return;
    }
    if (r > 55.5) {
      // Steel ring frame and 18 bolts on it.
      const step = TAU / 18;
      const ba = Math.round(a / step) * step;
      const d = Math.hypot(x - (TEX + Math.cos(ba) * 59), y - (64 + Math.sin(ba) * 59));
      put(p, lerp(72, 110, rusty), lerp(76, 70, rusty), lerp(80, 50, rusty), (0.8 + n * 0.2) * (d < 2.4 ? 1.35 : 1));
      p.h = 0.95 + dome(d, 2.4) * 0.6;
      return;
    }
    if (r > 54) {
      put(p, 16, 16, 18);
      p.h = 0;
      return;
    }
    let k = 0.78 + n * 0.16 + brushed(x0, y) * 0.08;
    let h = 0.8;
    let col: [number, number, number] = [128, 132, 136];
    if (Math.abs(r - 42) < 1.5 || Math.abs(r - 26) < 1.2) {
      h = 0.3;
      k *= 0.55;
    }
    // Eight ribs between the grooves.
    const sector = (((a / (TAU / 8)) % 1) + 1) % 1;
    if (r > 27.5 && r < 40.5 && Math.abs(sector - 0.5) * (TAU / 8) * r < 1.6) {
      h = 1.05;
      k *= 1.08;
    }
    // Twelve bolts on the outer groove.
    const bstep = TAU / 12;
    const bb = Math.round(a / bstep) * bstep;
    const bd = Math.hypot(x - (TEX + Math.cos(bb) * 48), y - (64 + Math.sin(bb) * 48));
    if (bd < 2.2) {
      h += dome(bd, 2.2) * 0.6;
      k *= 1.25;
    }
    // Wheel: rim, four spokes, hub; a recess beneath it.
    if (r < 18) {
      const rim = Math.abs(r - 15.5) < 1.8;
      const spoke = r < 15 && (r * Math.abs(Math.sin(2 * a))) / 2 < 1.5;
      const hub = r < 5;
      if (rim || spoke || hub) {
        col = [150, 152, 148];
        k = 0.9 + n * 0.15;
        h = 1.4;
      } else {
        h = 0.5;
        k *= 0.7;
      }
    }
    k *= 1 + scratch(x0, y) * 0.25;
    p.r = lerp(col[0], 124, rusty * 0.8) * k;
    p.g = lerp(col[1], 72, rusty * 0.8) * k;
    p.b = lerp(col[2], 44, rusty * 0.8) * k;
    p.h = h;
  }, 1.3);
}

/** Heavy steel blast door: leaves, rows of bolts, a yellow-and-black stripe at the bottom, scuffs. */
function blastDoor(): Texture {
  const grain = fbm(71, 8, 4);
  const rust = fbm(72, 4, 4);
  const scratch = cracks(73, 6, 0.006, 0.4);
  return build((x, y, p) => {
    const n = grain(x, y);
    let k = 0.76 + n * 0.28;
    p.h = 0.75;
    if (x < 6 || x > 121) {
      put(p, 80, 83, 86, k);
      p.h = 0.95;
      return;
    }
    if (y >= 104 && y < 118) {
      const stripe = ((x + y) >> 3) & 1;
      if (stripe) put(p, 200, 160, 44, k);
      else put(p, 34, 32, 28, k);
      p.h = 0.7;
      return;
    }
    if (x === 63 || x === 64) {
      put(p, 22, 23, 25);
      p.h = 0.05;
      return;
    }
    if (y === 103 || y === 118 || y % 34 === 0) {
      k *= 0.5;
      p.h = 0.2;
    }
    const bx = Math.round((x - 12) / 20) * 20 + 12;
    const by = Math.floor(y / 34) * 34 + 17;
    p.h += dome(Math.hypot(x - bx, y - by), 3) * 0.6;
    k *= 1 + scratch(x, y) * 0.25;
    const rusty = y > 90 ? smooth(0.55, 0.75, rust(x, y)) * ((y - 90) / 38) : 0;
    p.r = lerp(112, 120, rusty) * k;
    p.g = lerp(116, 70, rusty) * k;
    p.b = lerp(120, 42, rusty) * k;
  });
}

/** Daylight in an exit opening: a bright warm haze. */
function daylight(): Texture {
  const n = fbm(81, 4, 3);
  return build((x, y, p) => {
    const glow = 0.85 + n(x, y) * 0.15;
    const t = y / TEX;
    put(p, 250 - t * 30, 232 - t * 50, 190 - t * 80, glow);
  }, 0);
}

/** Elevator doors: two smooth halves with a gap, ribs, a lamp above them (our own drawing). */
function elevatorDoors(): Texture {
  const grain = fbm(91, 8, 3);
  const brushed = noise(92, 64, 2);
  return build((x, y, p) => {
    const k = 0.78 + grain(x, y) * 0.16 + brushed(x, y) * 0.1;
    if (y < 16) {
      const lamp = Math.abs(x - 64) < 6 && y > 4 && y < 12;
      if (lamp) put(p, 255, 196, 70);
      else put(p, 46, 48, 52, k);
      p.h = lamp ? 0.9 : 0.6;
      return;
    }
    if (x < 6 || x > 121) {
      put(p, 70, 72, 76, k);
      p.h = 0.95;
      return;
    }
    if (x === 63 || x === 64 || y === 16) {
      put(p, 20, 20, 22);
      p.h = 0;
      return;
    }
    put(p, 132, 136, 140, k);
    p.h = (y - 16) % 24 < 2 ? 0.95 : 0.6;
  });
}

/** Indoor sliding door: a leaf in a frame, a small window, a green lamp, ribs (our own drawing). */
function slidingDoor(): Texture {
  const grain = fbm(101, 8, 3);
  return build((x, y, p) => {
    const k = 0.8 + grain(x, y) * 0.25;
    if (x < 6 || x > 121 || y < 6 || y > 121) {
      put(p, 36, 38, 40, k);
      p.h = 0.95;
    } else if (x >= 52 && x <= 75 && y >= 22 && y <= 40) {
      put(p, 78, 96, 98, k * (y < 25 ? 0.5 : 1));
      p.h = 0.2;
    } else if (x >= 58 && x <= 69 && y >= 64 && y <= 68) {
      put(p, 90, 220, 110);
      p.h = 0.8;
    } else {
      put(p, 84, 90, 96, k);
      p.h = y % 32 === 16 && x > 12 && x < 115 ? 0.3 : 0.7;
    }
  });
}

/** Water by the shore: dark waves (a wall — impassable). */
function water(): Texture {
  const n = fbm(131, 4, 3);
  const m = fbm(132, 4, 3);
  return build((x, y, p) => {
    const wave = Math.sin(((y + n(x, y) * 20) / TEX) * Math.PI * 2 * 8) * 0.5 + 0.5;
    put(p, 28 + wave * 18, 58 + wave * 26, 78 + wave * 30, 0.75 + m(x, y) * 0.3);
    p.h = wave * 0.3;
  }, 0.8);
}

/** Placeholder for a block missing from the block library: a large magenta-and-black checker — you can see right away what is missing. */
function missingBlock(): Texture {
  return build((x, y, p) => {
    const odd = ((x >> 5) + (y >> 5)) & 1;
    if (odd) put(p, 220, 40, 200);
    else put(p, 20, 16, 20);
  }, 0);
}

/** Force field: a blue glowing mesh with ripples (our own drawing). */
function forcefield(): Texture {
  const n = fbm(151, 4, 3);
  return build((x, y, p) => {
    const ripple = Math.sin((x + y * 0.5) * 0.2 + n(x, y) * 6) * 0.5 + 0.5;
    const grid = x % 16 === 0 || y % 16 === 0 ? 1 : 0;
    put(p, 60, 150, 255, 0.55 + ripple * 0.3 + grid * 0.25);
  }, 0);
}

/** Wasteland sand: grain, wind ripples, occasional pebbles. */
function sand(): Texture {
  const n = fbm(141, 4, 4);
  const warp = fbm(142, 4, 3);
  const grain = rng(143);
  const rand = rng(144);
  const stones = Array.from({ length: 18 }, () => ({ x: rand() * TEX, y: rand() * TEX, r: 0.8 + rand() * 1.6 }));
  return build((x, y, p) => {
    const ripple = Math.sin(((y * 10 + x * 2) / TEX + warp(x, y) * 1.5) * Math.PI * 2) * 0.5 + 0.5;
    const g = grain();
    const v = n(x, y);
    put(p, 162, 138, 100, 0.8 + v * 0.25 + (g - 0.5) * 0.12 + ripple * 0.05);
    p.h = ripple * 0.25 + v * 0.4 + g * 0.08;
    for (const s of stones) {
      const d = Math.hypot(wrap(x - s.x), wrap(y - s.y));
      if (d >= s.r) continue;
      put(p, 120, 104, 82, 0.9);
      p.h = 0.6 + dome(d, s.r) * 0.4;
    }
  }, 0.8);
}

/** Trampled sand — the floor of a huge footprint (a special encounter in the wasteland): darker, smooth, without ripples or pebbles. */
function pressedSand(): Texture {
  const n = fbm(145, 4, 4);
  const grain = rng(146);
  return build((x, y, p) => {
    const v = n(x, y);
    put(p, 118, 96, 68, 0.58 + v * 0.16 + (grain() - 0.5) * 0.08);
    p.h = v * 0.2;
  }, 0.5);
}

/** Clay wall (Shady Sands, the Hub): cracked plaster, where it has fallen off — adobe brick; the bottom is splashed with earth. */
function adobe(): Texture {
  const body = fbm(161, 4, 5);
  const fall = fbm(162, 3, 4);
  const crack = cracks(163, 2, 0.01, 0.45);
  return build((x, y, p) => {
    const n = body(x, y);
    const bare = smooth(0.65, 0.68, fall(x, y));
    const row = y >> 4;
    const shift = (row & 1) * 16;
    const bx = (x + shift) & 31;
    const by = y & 15;
    const mortar = bx < 2 || by < 2;
    const tone = hash(((x + shift) >> 5) & 3, row, 161);
    // Plaster.
    const c = crack(x, y);
    let r = 196;
    let g = 168;
    let b = 128;
    let k = (0.78 + n * 0.32) * (1 - c * 0.45);
    let h = 0.85 + n * 0.1 - c * 0.3;
    // Exposed brick.
    if (bare > 0) {
      const br = 150;
      const bg = mortar ? 128 : 96;
      const bb = mortar ? 100 : 66;
      const bk = mortar ? 0.6 : 0.7 + tone * 0.25 + n * 0.1;
      r = lerp(r * k, br * bk, bare);
      g = lerp(g * k, bg * bk, bare);
      b = lerp(b * k, bb * bk, bare);
      k = 1;
      h = lerp(h, mortar ? 0.2 : 0.45, bare);
      // Edge of the fallen patch — shadow from the plaster's thickness.
      if (bare < 0.9) k *= 0.8;
    }
    if (y > 100) k *= 1 - ((y - 100) / 28) * 0.3 * (0.6 + n * 0.8);
    put(p, r, g, b, k);
    p.h = h;
  }, 1.2);
}

/** Scrap iron wall (Junktown, raiders): corrugated sheets of different colors, bolts along the edges, rust. */
function scrapMetal(): Texture {
  // Sheet colors: rusty, faded green, grey, bluish, ochre — each variant has its own set.
  const palette = [
    [150, 92, 56],
    [96, 110, 92],
    [124, 122, 116],
    [92, 104, 118],
    [158, 128, 74],
  ];
  const tint = (i: number) => palette[Math.floor(hash(i, 1, 170) * palette.length)] ?? palette[0]!;
  const sheets = [
    { x0: 0, x1: 46, joint: 70, tint: tint(0) },
    { x0: 46, x1: 88, joint: 30, tint: tint(1) },
    { x0: 88, x1: 128, joint: 96, tint: tint(2) },
  ];
  const rust = fbm(171, 4, 4);
  const grain = fbm(172, 16, 3);
  const drips = noise(173, 32, 2);
  return build((x, y, p) => {
    const s = sheets.find((sheet) => x < sheet.x1) ?? sheets[0]!;
    const lx = x - s.x0;
    const rx = s.x1 - 1 - x;
    const ly = (y - s.joint + TEX) & MASK;
    let h = 0.5 + 0.35 * Math.sin((lx * Math.PI * 2) / 10);
    let k = 0.72 + grain(x, y) * 0.3;
    if (lx < 2 || rx < 1) {
      h = lx < 2 ? 0.95 : 0.05;
      k *= lx < 2 ? 1 : 0.4;
    }
    if (ly < 2) {
      h = 0.05;
      k *= 0.4;
    } else if (ly < 4) {
      h = 0.95;
    }
    // Bolts: along the side edges of a sheet and in a row under the joint, every 24 points.
    const side = Math.hypot(Math.min(Math.abs(lx - 4), Math.abs(rx - 4)), (ly % 24) - 12);
    const under = Math.hypot(ly - 7, (lx % 24) - 12);
    h += dome(Math.min(side, under), 2.2) * 0.8;
    const drip = drips(x, y);
    const rusty = Math.min(1, smooth(0.45, 0.72, rust(x, y)) + (drip > 0.62 ? (drip - 0.62) * 3 * (ly / TEX) : 0));
    p.r = lerp(s.tint[0]!, 112, rusty) * k;
    p.g = lerp(s.tint[1]!, 58, rusty) * k;
    p.b = lerp(s.tint[2]!, 32, rusty) * k;
    p.h = h;
  }, 1.1);
}

/** Concrete ruins (the Necropolis, the Boneyard): formwork marks, tie holes, streaks, chipped pieces with rebar. */
function ruinConcrete(): Texture {
  const body = fbm(181, 8, 4);
  const stain = noise(182, 24, 3);
  const hole = fbm(183, 2, 4);
  const crack = cracks(184, 3, 0.01, 0.5);
  return build((x, y, p) => {
    const n = body(x, y);
    let k = 0.7 + n * 0.32;
    let h = 0.7 + n * 0.15;
    let r = 128;
    let g = 124;
    let b = 116;
    if ((y & 31) === 0) {
      h -= 0.25;
      k *= 0.82;
    }
    if (Math.hypot((x & 31) - 16, (y & 31) - 16) < 1.8) {
      h = 0.1;
      k *= 0.4;
    }
    const st = smooth(0.55, 0.8, stain(x, y)) * (1 - (y / TEX) * 0.5);
    k *= 1 - st * 0.35;
    const c = crack(x, y);
    k *= 1 - c * 0.5;
    h -= c * 0.3;
    const chip = smooth(0.66, 0.7, hole(x, y));
    if (chip > 0) {
      h = lerp(h, 0.15 + n * 0.2, chip);
      r = lerp(r, 96, chip);
      g = lerp(g, 90, chip);
      b = lerp(b, 82, chip);
      // Rebar deep in the chip.
      if (chip > 0.95 && y % 22 >= 10 && y % 22 < 13) {
        r = 130;
        g = 70;
        b = 40;
        h = 0.55;
      }
    }
    put(p, r, g, b, k);
    p.h = h;
  }, 1.2);
}

/** Old brick (dungeons, sewers): offset bond, different firing, chips, damp at the bottom. */
function brickWall(): Texture {
  const body = fbm(191, 8, 4);
  const chips = fbm(192, 4, 4);
  const damp = fbm(193, 4, 3);
  return build((x, y, p) => {
    const n = body(x, y);
    const rowF = (y * 10) / TEX;
    const row = Math.floor(rowF);
    const by = (rowF - row) * 12.8;
    const shift = (row & 1) * 16;
    const bx = (x + shift) & 31;
    const col = ((x + shift) >> 5) & 3;
    const tone = hash(col, row, 191);
    let k: number;
    if (bx < 2.5 || by < 2.2) {
      put(p, 110, 100, 88, 0.7 + n * 0.3);
      p.h = 0.2;
    } else {
      const edge = Math.min(bx - 2.5, 32 - bx, by - 2.2, 12.8 - by);
      k = (0.72 + tone * 0.32 + n * 0.15) * (tone < 0.12 ? 0.7 : 1);
      const chip = smooth(0.66, 0.72, chips(x, y));
      put(p, lerp(128, 150, chip), lerp(62, 92, chip), lerp(44, 70, chip), k);
      p.h = (0.75 + n * 0.1) * (0.7 + smooth(0, 2, edge) * 0.3) - chip * 0.3;
    }
    const wet = y > 80 ? ((y - 80) / 48) * smooth(0.4, 0.7, damp(x, y)) : 0;
    p.r *= 1 - wet * 0.45;
    p.g *= 1 - wet * 0.35;
    p.b *= 1 - wet * 0.4;
  }, 1.2);
}

/** Bunker concrete (the Glow, the Brotherhood): even slabs with seams, ties, small pits. */
function bunkerConcrete(): Texture {
  const body = fbm(201, 8, 4);
  const stain = fbm(202, 4, 3);
  const rand = rng(203);
  const pits = Array.from({ length: 40 }, () => ({ x: rand() * TEX, y: rand() * TEX, r: 0.6 + rand() * 0.9 }));
  return build((x, y, p) => {
    const px = x & 63;
    const py = y & 63;
    const edge = Math.min(px, 63 - px, py, 63 - py);
    const n = body(x, y);
    let k = 0.74 + n * 0.26 - smooth(0.6, 0.78, stain(x, y)) * 0.2;
    let h = edge < 1.5 ? 0.1 : 0.75 + n * 0.08;
    if (edge < 1.5) k *= 0.55;
    for (const cx of [16, 48]) for (const cy of [16, 48]) if (Math.hypot(px - cx, py - cy) < 1.6) (h = 0.1), (k *= 0.45);
    for (const s of pits) if (Math.hypot(wrap(x - s.x), wrap(y - s.y)) < s.r) (h -= 0.3), (k *= 0.75);
    put(p, 118, 120, 116, k);
    p.h = h;
  });
}

/** Cathedral walls: light cracked plaster, a wooden cornice and panels at the bottom. */
function plaster(): Texture {
  const body = fbm(211, 4, 4);
  const crack = cracks(212, 2, 0.008, 0.4);
  const woodGrain = noise(213, 32, 2);
  const stain = fbm(214, 4, 3);
  return build((x, y, p) => {
    const n = body(x, y);
    if (y < 84) {
      const c = crack(x, y);
      const s = smooth(0.6, 0.78, stain(x, y)) * 0.25;
      put(p, lerp(178, 140, s), lerp(168, 124, s), lerp(148, 96, s), (0.82 + n * 0.18) * (1 - c * 0.45));
      p.h = 0.7 + n * 0.05 - c * 0.3;
    } else if (y < 92) {
      put(p, 92, 62, 40, 0.8 + n * 0.2);
      p.h = 0.6 + 0.4 * Math.sin(((y - 84) / 8) * Math.PI);
    } else {
      const plank = (x & 15) === 0;
      put(p, 110, 74, 46, (0.72 + woodGrain(x, y) * 0.35) * (plank ? 0.5 : 1));
      p.h = plank ? 0.2 : 0.6;
    }
  });
}

/** Cracked asphalt of ruined city streets: gravel grain, cracks, drifted sand. */
function asphalt(): Texture {
  const body = fbm(221, 8, 4);
  const crack = cracks(222, 3, 0.012, 0.6);
  const drift = fbm(223, 3, 4);
  const speck = rng(224);
  return build((x, y, p) => {
    const n = body(x, y);
    const s = speck();
    let k = 0.78 + n * 0.3 + (s > 0.92 ? 0.35 : 0);
    let r = 70;
    let g = 70;
    let b = 72;
    let h = 0.6 + n * 0.1 + s * 0.08;
    const c = crack(x, y);
    if (c > 0) {
      r = lerp(r, 40, c);
      g = lerp(g, 38, c);
      b = lerp(b, 36, c);
      h -= c * 0.4;
    }
    const sandy = smooth(0.56, 0.68, drift(x, y));
    r = lerp(r, 150, sandy);
    g = lerp(g, 128, sandy);
    b = lerp(b, 94, sandy);
    if (sandy > 0.5) k = lerp(k, 0.85 + n * 0.2, sandy);
    put(p, r, g, b, k);
    p.h = h;
  }, 0.9);
}

/** Mark points that glow by themselves. */
export function withGlow(texture: Texture, lit: (x: number, y: number) => boolean): Texture {
  const glow = new Uint8Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) glow[y * TEX + x] = lit(x, y) ? 1 : 0;
  return { ...texture, glow };
}

/** Terminal case: painted steel (grey-olive), scuffs down to the metal, fine grain. */
function casing(grain: (x: number, y: number) => number, scuff: (x: number, y: number) => number, x: number, y: number, p: Px, k = 1): void {
  const worn = Math.max(0, Math.min(1, (scuff(x, y) - 0.62) * 4));
  const g = 0.86 + grain(x, y) * 0.22;
  put(p, lerp(128, 150, worn), lerp(128, 146, worn), lerp(112, 140, worn), g * k);
}

/** Terminal screen on the front side. */
const SCREEN = { x0: 22, x1: 105, y0: 17, y1: 60 };
const inScreen = (x: number, y: number) => {
  if (x < SCREEN.x0 || x > SCREEN.x1 || y < SCREEN.y0 || y > SCREEN.y1) return false;
  // Rounded corners of the CRT.
  const cx = Math.max(SCREEN.x0 + 6 - x, x - (SCREEN.x1 - 6), 0);
  const cy = Math.max(SCREEN.y0 + 6 - y, y - (SCREEN.y1 - 6), 0);
  return cx * cx + cy * cy <= 36;
};
/** Lamps under the screen: x of the center and color. */
const LAMPS: [number, [number, number, number]][] = [
  [26, [255, 70, 50]],
  [38, [255, 190, 60]],
  [50, [90, 255, 120]],
];

/**
 * Terminal from the front (our own drawing): the case, at the top — a green screen with stripes of text lines and a cursor (glows by itself),
 * beneath it three lamps and two knobs, a speaker grille, at the bottom — a keyboard and a plinth.
 */
function terminalFront(broken = false): Texture {
  const grain = fbm(141, 8, 4);
  const scuff = fbm(142, 4, 3);
  // Broken (the Glow): the screen is dark and smashed — cracks radiating from the impact, a hole in the glass; the lamps are out.
  const hit = { x: 70, y: 34 };
  const rays = Array.from({ length: 9 }, (_, i) => (i / 9) * Math.PI * 2 + hash(i, 1, 148) * 0.5);
  const tex = build((x, y, p) => {
    if (broken && inScreen(x, y)) {
      const dx = x - hit.x;
      const dy = y - hit.y;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const crack = rays.some((r) => Math.abs(Math.sin(a - r)) * d < 0.8 && Math.cos(a - r) > 0) || (d > 9 && d < 10.5);
      if (d < 6) put(p, 8, 8, 8);
      else put(p, crack ? 120 : 22, crack ? 128 : 30, crack ? 124 : 28, crack ? 0.9 : 0.8 + (grain(x, y) - 0.5) * 0.3);
      p.h = d < 6 ? 0 : crack ? 0.45 : 0.3;
      return;
    }
    if (broken && y >= 66 && y <= 78 && LAMPS.some(([lx]) => Math.hypot(x - lx, y - 72) < 4)) {
      put(p, 50, 42, 38, 0.8);
      p.h = 0.6;
      return;
    }
    const edge = Math.min(x, 127 - x, y);
    // Case rim.
    if (edge < 3) {
      casing(grain, scuff, x, y, p, 0.55 + edge * 0.15);
      p.h = 0.9;
      return;
    }
    // Screen: lines of "text" — strips 3 points high, words of different lengths, a cursor on the last line.
    if (inScreen(x, y)) {
      const u = (x - SCREEN.x0) / (SCREEN.x1 - SCREEN.x0) - 0.5;
      const v = (y - SCREEN.y0) / (SCREEN.y1 - SCREEN.y0) - 0.5;
      const vignette = 1 - (u * u + v * v) * 1.4;
      const scan = (y & 1) === 0 ? 1 : 0.78;
      const row = Math.floor((y - SCREEN.y0 - 4) / 6);
      const inRow = (y - SCREEN.y0 - 4) % 6;
      let text = false;
      if (row >= 0 && row < 6 && inRow < 3 && x > SCREEN.x0 + 4 && x < SCREEN.x1 - 4) {
        const col = x - SCREEN.x0 - 5;
        const word = Math.floor(col / 9);
        const length = 3 + Math.floor(hash(word, row, 143) * 6);
        const words = 3 + Math.floor(hash(row, 7, 144) * 6);
        text = row === 5 ? word === 0 && col % 9 < 3 : word < words && col % 9 < length && hash(x, y, 145) > 0.3;
      }
      if (text) put(p, 120, 255, 150, scan);
      else put(p, 12 * vignette + 6, 54 * vignette + 10, 26 * vignette + 8, scan);
      p.h = 0.3;
      return;
    }
    // Screen frame: dark, bevelled toward the glass.
    if (x >= SCREEN.x0 - 6 && x <= SCREEN.x1 + 6 && y >= SCREEN.y0 - 5 && y <= SCREEN.y1 + 5) {
      const inner = Math.min(x - (SCREEN.x0 - 6), SCREEN.x1 + 6 - x, y - (SCREEN.y0 - 5), SCREEN.y1 + 5 - y);
      put(p, 46, 46, 44, 0.8 + grain(x, y) * 0.2);
      p.h = 0.75 - inner * 0.08;
      return;
    }
    // Lamps and knobs.
    if (y >= 66 && y <= 78) {
      for (const [lx, [r, g, b]] of LAMPS) {
        const d = Math.hypot(x - lx, y - 72);
        if (d < 4) {
          put(p, r, g, b, d < 2 ? 1.1 : 0.8);
          p.h = 0.6 + dome(d, 4) * 0.4;
          return;
        }
        if (d < 5.2) {
          put(p, 40, 40, 38);
          p.h = 0.5;
          return;
        }
      }
      for (const kx of [86, 104]) {
        const d = Math.hypot(x - kx, y - 72);
        if (d < 5.5) {
          // Knob with a notch.
          const mark = Math.abs(x - kx) < 1 && y < 72;
          put(p, mark ? 200 : 58, mark ? 196 : 56, mark ? 180 : 52, 0.8 + dome(d, 5.5) * 0.3);
          p.h = 0.5 + dome(d, 5.5) * 0.5;
          return;
        }
      }
    }
    // Speaker grille.
    if (y >= 83 && y <= 95 && x >= 20 && x <= 107) {
      const slot = (y - 83) % 3 === 2;
      casing(grain, scuff, x, y, p, slot ? 0.3 : 0.95);
      p.h = slot ? 0.1 : 0.7;
      return;
    }
    // Keyboard.
    if (y >= 100 && y <= 116) {
      if (x >= 12 && x <= 115 && y >= 102 && y <= 114) {
        const kx = (x - 12) % 7;
        const ky = (y - 102) % 4;
        const key = kx < 6 && ky < 3;
        if (key) put(p, 176, 170, 152, 0.85 + grain(x, y) * 0.2 - ky * 0.05);
        else put(p, 30, 30, 28);
        p.h = key ? 0.85 - ky * 0.1 : 0.1;
        return;
      }
      put(p, 62, 60, 54, 0.85 + grain(x, y) * 0.2);
      p.h = 0.6;
      return;
    }
    // Plinth.
    if (y >= 120) {
      put(p, 40, 40, 38, 0.8 + grain(x, y) * 0.3);
      p.h = 0.4;
      return;
    }
    // Case; seams above and below the keyboard.
    const seam = y === 118 || y === 98;
    casing(grain, scuff, x, y, p, seam ? 0.5 : 1);
    p.h = seam ? 0.2 : 0.7;
  });
  if (broken) return tex;
  return withGlow(tex, (x, y) => inScreen(x, y) || LAMPS.some(([lx]) => Math.hypot(x - lx, y - 72) < 4));
}

/** Terminal from the side: a case with ventilation slots at the top, a seam in the middle, a plinth. */
function terminalSide(): Texture {
  const grain = fbm(146, 8, 4);
  const scuff = fbm(147, 4, 3);
  return build((x, y, p) => {
    if (y >= 120) {
      put(p, 40, 40, 38, 0.8 + grain(x, y) * 0.3);
      p.h = 0.4;
      return;
    }
    const edge = Math.min(x, 127 - x, y);
    const vent = y >= 14 && y <= 44 && x >= 30 && x <= 98 && (y - 14) % 6 < 2;
    const seam = y === 64;
    casing(grain, scuff, x, y, p, edge < 3 ? 0.6 : vent ? 0.25 : seam ? 0.55 : 1);
    p.h = vent ? 0.1 : edge < 3 ? 0.9 : seam ? 0.2 : 0.7;
  });
}

/** Terminal from above: a lid on four screws. */
function terminalTop(): Texture {
  const grain = fbm(148, 8, 4);
  const scuff = fbm(149, 4, 3);
  return build((x, y, p) => {
    const edge = Math.min(x, 127 - x, y, 127 - y);
    const groove = edge > 7 && edge < 10;
    let h = edge < 2 ? 0.9 : groove ? 0.2 : 0.7;
    for (const sx of [16, 111]) for (const sy of [16, 111]) h += dome(Math.hypot(x - sx, y - sy), 2.5) * 0.6;
    casing(grain, scuff, x, y, p, edge < 2 || groove ? 0.6 : 1);
    p.h = h;
  });
}

export type TextureName =
  | FurnitureTexture
  | RetroTexture
  | CathedralTexture
  | TownTexture
  | DoorTexture
  | DecorTexture
  | CraterTexture
  | 'metal'
  | 'military'
  | 'rock'
  | 'floor'
  | 'ceiling'
  | 'dirt'
  | 'rockCeiling'
  | 'door'
  | 'daylight'
  | 'elevator'
  | 'slidingDoor'
  | 'water'
  | 'sand'
  | 'pressedSand'
  | 'forcefield'
  | 'adobe'
  | 'scrap'
  | 'ruin'
  | 'brick'
  | 'concrete'
  | 'plaster'
  | 'asphalt'
  | 'vaultDoorL'
  | 'vaultDoorR'
  | 'terminalFront'
  | 'terminalSide'
  | 'terminalTop'
  | 'terminalBroken'
  | 'missingBlock'
  | 'caveWall'
  | 'caveFloor'
  | 'cobbles'
  | 'caveCeiling'
  | 'vaultClean'
  | 'vaultRust'
  | 'rubble'
  | ChromeTexture;

/** Textures that glow by themselves and don't darken with distance (custom library blocks are added when read). */
export const EMISSIVE: Set<TextureName> = new Set(['daylight', 'forcefield']);

/** Metal walls: a bullet rings instead of chipping stone (custom library blocks are added when read). */
export const METALLIC: Set<TextureName> = new Set(['metal', 'vaultClean', 'vaultRust', 'military', 'door', 'elevator', 'slidingDoor', 'scrap', 'vaultDoorL', 'vaultDoorR', 'terminalFront', 'terminalSide', 'terminalTop', 'terminalBroken', 'retroWall', 'retroDoor', 'chromeWall', 'chromeDoor']);

export function createTextures(): Record<TextureName, Texture> {
  // All images — on first access: a location needs only a small part of them, and drawing all of them at once on every launch took (on a weak
  // laptop) seconds of loading.
  const set = {} as Record<TextureName, Texture>;
  addLazyTextures<TextureName>(set, {
    metal: () => varied(() => metalPanel([104, 110, 116], 11)),
    vaultClean: () => varied(() => metalPanel([204, 208, 210], 13, CLEAN)),
    vaultRust: () => varied(() => metalPanel([154, 100, 66], 15, RUSTED)),
    rubble: () => varied(rubblePile),
    military: () => varied(() => metalPanel([92, 100, 80], 17)),
    rock: () => varied(caveRock),
    floor: () => varied(concreteFloor),
    ceiling: () => ceilingGrate(),
    dirt: () => dirtFloor(),
    rockCeiling: () => rockCeiling(),
    door: () => blastDoor(),
    daylight: () => daylight(),
    elevator: () => elevatorDoors(),
    slidingDoor: () => slidingDoor(),
    forcefield: () => forcefield(),
    water: () => water(),
    sand: () => sand(),
    pressedSand: () => pressedSand(),
    adobe: () => varied(adobe),
    scrap: () => varied(scrapMetal),
    ruin: () => varied(ruinConcrete),
    brick: () => varied(brickWall),
    concrete: () => varied(bunkerConcrete),
    plaster: () => varied(plaster),
    asphalt: () => asphalt(),
    vaultDoorL: () => vaultDoor(0),
    vaultDoorR: () => vaultDoor(1),
    terminalFront: () => terminalFront(),
    terminalSide: () => terminalSide(),
    terminalTop: () => terminalTop(),
    terminalBroken: () => terminalFront(true),
    missingBlock: () => missingBlock(),
    caveWall: () => varied(caveWall),
    caveFloor: () => varied(caveFloor),
    cobbles: () => varied(cobbles),
    caveCeiling: () => caveCeiling(),
    ...furnitureTextures(),
    ...retroTextures(),
    ...chromeTextures(),
    ...cathedralTextures(),
    ...townTextures(),
    ...doorTextures(),
    ...decorTextures(),
    ...craterTextures(),
  });
  return set;
}
