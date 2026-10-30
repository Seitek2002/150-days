// Momentary effects (our own drawing, in code): dust and sparks where a bullet hit, blood spatter, explosion fire and smoke.
// Each effect is a flat image, like a sprite, with frames over the course of the effect.
import type { SpriteFrame } from '../assets/sprites.ts';
import { SPRITE_SCALE, type Billboard } from '../engine/renderer.ts';

export type EffectKind = 'dust' | 'spark' | 'blood' | 'fire' | 'smoke';

export interface Effect {
  kind: EffectKind;
  x: number;
  y: number;
  /** Height of the effect's centre above the floor (wall height = 1). */
  z: number;
  /** How much has elapsed and how long it lasts (seconds). */
  time: number;
  duration: number;
  /** Diameter in world units. */
  size: number;
  /** Rise speed (smoke). */
  rise: number;
  /** So that two effects next to each other aren't identical. */
  seed: number;
}

/** Frames per effect and frame size in pixels; the drawings are designed at 32 pixels and scaled up U times. */
const FRAMES = 8;
const PX = 64;
const U = PX / 32;
const C = PX / 2;
/** How many different drawings each kind of effect has. */
const LOOKS = 4;

const cache = new Map<string, SpriteFrame>();

function rgb(r: number, g: number, b: number): number {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (0xff << 24) | (c(b) << 16) | (c(g) << 8) | c(r);
}

/** A number 0..1 from three integers. */
function hash(a: number, b: number, c: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth noise over the frame's pixels (ragged edges of puffs). */
function smoothNoise(x: number, y: number, look: number, cell: number): number {
  const fx = x / cell;
  const fy = y / cell;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const top = hash(ix, iy, look) * (1 - tx) + hash(ix + 1, iy, look) * tx;
  const bottom = hash(ix, iy + 1, look) * (1 - tx) + hash(ix + 1, iy + 1, look) * tx;
  return top * (1 - ty) + bottom * ty;
}

/**
 * Puffs (dust, smoke, fire): several circles around the centre with a ragged edge. For each pixel — how far inside it is
 * (0 — edge, 1 — centre of the puff); paint decides the colour.
 */
function puff(pixels: Uint32Array, s: number, look: number, count: number, grow: number, paint: (inside: number, x: number, y: number) => number): void {
  const blobs = Array.from({ length: count }, (_, i) => {
    const a = hash(i, look, 1) * Math.PI * 2;
    const d = (2 + hash(i, look, 2) * 5) * (0.4 + s) * U;
    return { x: C + Math.cos(a) * d, y: C + Math.sin(a) * d, r: (3.5 + hash(i, look, 3) * 3) * (0.6 + s * grow) * U };
  });
  for (let y = 0; y < PX; y++) {
    for (let x = 0; x < PX; x++) {
      let best = 0;
      for (const b of blobs) best = Math.max(best, 1 - Math.hypot(x - b.x, y - b.y) / b.r);
      const inside = best - (smoothNoise(x, y, look + 7, 3 * U) - 0.5) * 0.35 - 0.08;
      if (inside <= 0) continue;
      pixels[y * PX + x] = paint(Math.min(1, inside * 1.6), x, y);
    }
  }
}

function paintFrame(kind: EffectKind, step: number, look: number): SpriteFrame {
  const pixels = new Uint32Array(PX * PX);
  const s = step / (FRAMES - 1);
  const dot = (x: number, y: number, r: number, c: number) => {
    const cx = C + (x - 16) * U;
    const cy = C + (y - 16) * U;
    const rr = r * U;
    for (let py = Math.floor(cy - rr); py <= Math.ceil(cy + rr); py++) {
      for (let px = Math.floor(cx - rr); px <= Math.ceil(cx + rr); px++) {
        if (px < 0 || py < 0 || px >= PX || py >= PX || Math.hypot(px - cx, py - cy) > rr) continue;
        pixels[py * PX + px] = c;
      }
    }
  };
  switch (kind) {
    case 'dust':
      puff(pixels, s, look, 5, 1.6, (k, _x, y) => {
        const v = 0.8 + k * 0.3 - (y / PX) * 0.2;
        return rgb(168 * v, 154 * v, 130 * v);
      });
      break;
    case 'smoke':
      puff(pixels, s, look, 7, 1.5, (k, _x, y) => {
        const v = 0.75 + k * 0.35 - (y / PX) * 0.25;
        return rgb(70 * v, 66 * v, 62 * v);
      });
      break;
    case 'fire':
      // A fireball of puffs: white-yellow inside, orange at the edge, reddening and darkening towards the end.
      puff(pixels, s, look, 7, 1.7, (k) => {
        const heat = k * (1 - s * 0.75);
        return rgb(255 * (0.75 + heat * 0.25) * (1 - s * 0.4), 60 + heat * 190, heat * heat * 190);
      });
      break;
    case 'spark': {
      // A bright point and sparks flying out to the sides.
      if (s < 0.35) dot(16, 16, 3 - s * 6, rgb(255, 250, 220));
      for (let i = 0; i < 7; i++) {
        const a = hash(i, look, 4) * Math.PI * 2;
        const d = 2 + s * (8 + hash(i, look, 5) * 6);
        dot(16 + Math.cos(a) * d, 16 + Math.sin(a) * d + s * s * 4, 1.2 - s * 0.5, rgb(255, 220 - s * 90, 130 - s * 90));
      }
      break;
    }
    case 'blood': {
      // Droplets fly apart and fall down.
      if (s < 0.4) dot(16, 16, 4 - s * 5, rgb(120, 14, 10));
      for (let i = 0; i < 9; i++) {
        const a = hash(i, look, 6) * Math.PI * 2;
        const d = 2 + s * (5 + hash(i, look, 7) * 7);
        dot(16 + Math.cos(a) * d, 16 + Math.sin(a) * d * 0.7 + s * s * 9, 1.6 - s * 0.6, rgb(150 - s * 30, 18, 12));
      }
      break;
    }
  }
  return { width: PX, height: PX, pixels };
}

function frameOf(kind: EffectKind, step: number, look: number): SpriteFrame {
  const key = `${kind}:${step}:${look}`;
  let frame = cache.get(key);
  if (!frame) {
    frame = paintFrame(kind, step, look);
    cache.set(key, frame);
  }
  return frame;
}

/** An effect for the renderer: the right frame, scaled to its size, raised to its height. */
export function effectBillboard(e: Effect): Billboard {
  const t = Math.min(1, e.time / e.duration);
  const frame = frameOf(e.kind, Math.min(FRAMES - 1, Math.floor(t * FRAMES)), e.seed % LOOKS);
  const scale = e.size / (PX * SPRITE_SCALE);
  const bottom = e.z + e.rise * e.time - e.size / 2;
  const glow = e.kind === 'spark' || e.kind === 'fire';
  // Dust and smoke fade towards the end, fire and blood only at the very end.
  const alpha = e.kind === 'dust' || e.kind === 'smoke' ? 0.85 * (1 - t) : t > 0.75 ? (1 - t) * 4 : 1;
  return { x: e.x, y: e.y, frame, shiftX: 0, shiftY: -bottom / (SPRITE_SCALE * scale), scale, glow, alpha };
}
