// Town and vault doors — for doors that are not high-tech in the original: plank and panelled wooden ones,
// a curtain, a gate, bars, a grey metal one and a brown one. Our own drawings in code, nothing from Fallout files.
import { build, cracks, dome, fbm, hash, lerp, noise, put, rng, smooth, TEX, type Texture } from './textures.ts';

export type DoorTexture = 'woodDoor' | 'panelDoor' | 'curtain' | 'woodGate' | 'barsDoor' | 'grayDoor' | 'brownDoor';

/** Door handle or ring: dark metal with a highlight. */
function knob(x: number, y: number, cx: number, cy: number, r: number): number {
  return dome(Math.hypot(x - cx, y - cy), r);
}

/** Plank door: dark vertical planks, two cross bars and a diagonal brace, a wrought handle on the right. */
function woodDoor(): Texture {
  const grain = noise(701, 6, 3);
  const fine = noise(702, 64, 6);
  const body = fbm(703, 4, 4);
  const grime = fbm(704, 3, 4);
  return build((x, y, p) => {
    const n = body(x, y);
    const g = smooth(0.55, 0.8, grime(x, y));
    const k0 = knob(x, y, 104, 66, 5);
    if (k0 > 0) {
      put(p, 70, 64, 58, 0.6 + k0 * 0.8);
      p.h = 0.9 + k0 * 0.3;
      return;
    }
    const batten = (y >= 18 && y < 30) || (y >= 98 && y < 110);
    const brace = Math.abs(y - 30 - (x * 68) / TEX) < 6 && y > 30 && y < 98;
    if (batten || brace) {
      const k = (0.55 + fine(x, y) * 0.3 + n * 0.2) * (1 - g * 0.3);
      put(p, 96, 64, 42, k);
      p.h = 0.95;
      return;
    }
    const col = Math.floor(x / 21);
    const bx = x - col * 21;
    const tone = hash(col, 0, 701);
    const gap = bx < 1;
    const w = grain(x + tone * 40, y) * 0.5 + fine(x, y + tone * 30) * 0.5;
    const k = gap ? 0.25 : (0.45 + tone * 0.25 + w * 0.3 + n * 0.15) * (1 - g * 0.35);
    put(p, 88, 60, 42, k);
    p.h = gap ? 0.1 : 0.55 + w * 0.15;
  }, 1.2);
}

/** Panelled door: old red-brown wood, four recessed panels, a round knob, peeling varnish. */
function panelDoor(): Texture {
  const fine = noise(711, 48, 6);
  const body = fbm(712, 4, 4);
  const peel = fbm(713, 6, 3);
  return build((x, y, p) => {
    const n = body(x, y);
    const pl = smooth(0.68, 0.74, peel(x, y));
    const k0 = knob(x, y, 106, 68, 4.5);
    if (k0 > 0) {
      put(p, 150, 128, 80, 0.6 + k0 * 0.7);
      p.h = 0.9 + k0 * 0.3;
      return;
    }
    // Panels: two columns of two, with a bevelled frame.
    const inX = (x >= 16 && x < 58) || (x >= 70 && x < 112);
    const inY = (y >= 14 && y < 58) || (y >= 70 && y < 116);
    const lx = x < 64 ? Math.min(x - 16, 57 - x) : Math.min(x - 70, 111 - x);
    const ly = y < 64 ? Math.min(y - 14, 57 - y) : Math.min(y - 70, 115 - y);
    const edge = inX && inY ? Math.min(lx, ly) : -1;
    const bevel = edge >= 0 && edge < 4;
    const k = (0.5 + fine(x, y) * 0.25 + n * 0.25) * (bevel ? (lx < ly ? 0.75 : 1.15) : 1);
    put(p, lerp(92, 112, pl), lerp(46, 86, pl), lerp(36, 66, pl), k);
    p.h = edge >= 4 ? 0.45 : bevel ? 0.45 + edge * 0.1 : 0.85;
  }, 1.2);
}

/** Curtain in a doorway: coarse faded cloth with pale olive-brown blotches, vertical folds, a rod at the top. */
function curtain(): Texture {
  const fold = noise(721, 10, 2);
  const blotch = fbm(722, 5, 4);
  const weave = rng(723);
  return build((x, y, p) => {
    if (y < 8) {
      put(p, 80, 66, 50, y === 0 ? 1.2 : y === 7 ? 0.6 : 0.9);
      p.h = 0.9;
      return;
    }
    const f = fold(x, y * 0.2);
    const b = blotch(x, y);
    const tone = b < 0.42 ? [104, 96, 70] : b < 0.58 ? [122, 108, 80] : [96, 84, 62];
    const hem = y > TEX - 8 ? 0.8 : 1;
    put(p, tone[0]!, tone[1]!, tone[2]!, (0.55 + f * 0.55 + (weave() - 0.5) * 0.1) * hem);
    p.h = f * 0.9;
  }, 1.6);
}

/** Gate: a frame of beams with a diagonal brace, cladding boards, dark gaps between them. */
function woodGate(): Texture {
  const fine = noise(731, 64, 6);
  const body = fbm(732, 4, 4);
  return build((x, y, p) => {
    const n = body(x, y);
    const frame = x < 10 || x >= TEX - 10 || y < 10 || y >= TEX - 10;
    const d1 = Math.abs(x - y) < 7;
    const d2 = Math.abs(x + y - TEX) < 7;
    if (frame || d1 || d2) {
      put(p, 110, 76, 50, 0.55 + fine(x, y) * 0.3 + n * 0.2);
      p.h = 0.95;
      return;
    }
    const board = (x - 10) % 18;
    const gap = board < 3;
    put(p, gap ? 30 : 96, gap ? 24 : 70, gap ? 20 : 50, gap ? 0.8 : 0.45 + fine(x * 0.5, y) * 0.3 + n * 0.2);
    p.h = gap ? 0.05 : 0.6;
  }, 1.2);
}

/** Bars (cell, shop): dense vertical iron bars, two crossbars, darkness behind the bars. */
function barsDoor(): Texture {
  const rust = fbm(741, 6, 3);
  const dark = fbm(742, 3, 3);
  return build((x, y, p) => {
    const r = smooth(0.55, 0.8, rust(x, y));
    const frame = x < 6 || x >= TEX - 6 || y < 6 || y >= TEX - 6;
    const cross = (y >= 30 && y < 36) || (y >= 92 && y < 98);
    const bar = (x - 6) % 16;
    const isBar = bar >= 6 && bar < 11;
    if (frame || cross || isBar) {
      const round = isBar && !frame && !cross ? 1 - Math.abs(bar - 8.5) / 2.5 : 1;
      put(p, lerp(92, 112, r), lerp(92, 70, r), lerp(96, 50, r), 0.5 + round * 0.4);
      p.h = 0.6 + round * 0.4;
      return;
    }
    put(p, 24, 22, 22, 0.7 + dark(x, y) * 0.5);
    p.h = 0;
  }, 1.4);
}

/** Grey metal door (vaults, base, warehouses): a smooth sheet with a seam along the edge, scuffs, dirt at the bottom. */
function grayDoor(): Texture {
  const body = fbm(751, 4, 5);
  const scuff = noise(752, 48, 8);
  const stain = fbm(753, 4, 4);
  return build((x, y, p) => {
    const edge = Math.min(x, y, TEX - 1 - x, TEX - 1 - y);
    const n = body(x, y);
    const s = smooth(0.6, 0.85, stain(x, y));
    const dirt = y > 108 ? ((y - 108) / 20) * 0.35 : 0;
    const bevel = edge < 3 ? 0.55 : edge < 5 ? 1.15 : 1;
    put(p, lerp(120, 104, s), lerp(124, 108, s), lerp(124, 100, s), (0.66 + n * 0.25 + scuff(x, y) * 0.1) * bevel * (1 - dirt));
    p.h = edge < 3 ? 0.2 : 0.8 + n * 0.05;
  }, 1);
}

/** Brown door (the Glow): a mottled grey-brown sheet with a dark frame and a slit in the middle, traces of soot. */
function brownDoor(): Texture {
  const body = fbm(761, 4, 4);
  const speck = rng(762);
  const crack = cracks(763, 3, 0.008, 0.3);
  return build((x, y, p) => {
    const edge = Math.min(x, y, TEX - 1 - x, TEX - 1 - y);
    const seam = Math.abs(x - TEX / 2) < 1.5;
    const n = body(x, y);
    const c = crack(x, y);
    const k = edge < 5 || seam ? 0.4 : (0.6 + n * 0.3 + (speck() - 0.5) * 0.35) * (1 - c * 0.4);
    put(p, 116, 100, 86, k);
    p.h = edge < 5 || seam ? 0.2 : 0.75 - c * 0.3;
  }, 1.1);
}

/** How to draw each drawing (drawn on first access — addLazyTextures). */
export function doorTextures(): Record<DoorTexture, () => Texture> {
  return {
    woodDoor,
    panelDoor,
    curtain,
    woodGate,
    barsDoor,
    grayDoor,
    brownDoor,
  };
}
