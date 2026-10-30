// Retro-futuristic bunker (the Brotherhood of Steel): our own drawings in the spirit of the "atomic age" — enamelled steel panels with
// rounded corners and a chrome strip, a glowing strip under the ceiling, computer cabinets with tape reels and rows
// of lamps, a ribbed floor, round ceiling lights, a sliding door with a porthole. No recognizable insignia.
import { build, dome, fbm, hash, lerp, noise, put, TEX, type Px, type Texture } from './textures.ts';

export type RetroTexture = 'retroWall' | 'retroFloor' | 'retroCeiling' | 'retroDoor';

type Rgb3 = [number, number, number];
const ENAMEL: Rgb3 = [104, 120, 128];
const CHROME: Rgb3 = [196, 204, 208];
const DARK: Rgb3 = [38, 42, 46];

/** Image points that glow (lamps, screens) — per variant. */
type Glow = (x: number, y: number) => boolean;

/** Rounded rectangle: distance inward from the edge (below 0 — outside). */
function roundRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number): number {
  const cx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const cy = Math.max(y0 + r - y, 0, y - (y1 - r));
  if (cx > 0 && cy > 0) return r - Math.hypot(cx, cy);
  return Math.min(x - x0, x1 - x, y - y0, y1 - y);
}

/** Enamel with light brushing and scuffs. */
function enamel(seed: number) {
  const brushed = noise(seed, 2, 64);
  const grain = fbm(seed + 1, 8, 3);
  const scuff = fbm(seed + 2, 6, 3);
  return (x: number, y: number, p: Px, tint: Rgb3 = ENAMEL, k = 1) => {
    const worn = Math.max(0, Math.min(1, (scuff(x, y) - 0.66) * 4));
    const g = (0.86 + brushed(x, y) * 0.08 + grain(x, y) * 0.12) * k;
    put(p, lerp(tint[0], 150, worn) * g, lerp(tint[1], 150, worn) * g, lerp(tint[2], 148, worn) * g);
  };
}

/** Top and bottom of the wall in all variants: a glowing strip under the ceiling and a dark riveted baseboard. */
const LIGHT_STRIP = (y: number) => y >= 4 && y <= 7;
function frame(x: number, y: number, p: Px, paint: ReturnType<typeof enamel>): boolean {
  if (y < 12) {
    if (LIGHT_STRIP(y)) put(p, 255, 240, 200, 1);
    else put(p, DARK[0], DARK[1], DARK[2], y < 4 ? 0.8 : 1);
    p.h = LIGHT_STRIP(y) ? 0.4 : 0.8;
    return true;
  }
  if (y >= 112) {
    const rivet = dome(Math.hypot((x % 16) - 8, y - 120), 2) > 0;
    paint(x, y, p, DARK, rivet ? 1.8 : 1);
    p.h = rivet ? 0.95 : 0.6;
    return true;
  }
  // Chrome strips above the baseboard and below the light.
  if (y === 12 || y === 13 || y === 110 || y === 111) {
    put(p, CHROME[0], CHROME[1], CHROME[2], y % 2 ? 0.8 : 1.05);
    p.h = 0.9;
    return true;
  }
  return false;
}

/** Two enamelled panels with rounded corners and a chrome strip in the middle. */
function panels(seed: number, tint: Rgb3): [Texture, Glow] {
  const paint = enamel(seed);
  const tex = build((x, y, p) => {
    if (frame(x, y, p, paint)) return;
    const half = x < 64 ? 0 : 64;
    const d = roundRect(x, y, half + 5, 18, half + 58, 106, 10);
    if (d < 0) {
      paint(x, y, p, DARK, 1.2);
      p.h = 0.2;
      return;
    }
    const chrome = Math.abs(y - 62) < 2;
    if (chrome) put(p, CHROME[0], CHROME[1], CHROME[2], 1);
    else paint(x, y, p, tint, d < 3 ? 0.8 + d * 0.07 : 1);
    p.h = chrome ? 0.95 : d < 3 ? 0.4 + d * 0.15 : 0.85;
  });
  return [tex, (_x, y) => LIGHT_STRIP(y)];
}

/** Computer cabinet: two tape reels, rows of colored lamps, toggle switches, a small green screen. */
function computerBank(seed: number): [Texture, Glow] {
  const paint = enamel(seed);
  const reels = [36, 92];
  const lampColors: Rgb3[] = [
    [255, 80, 60],
    [255, 200, 70],
    [110, 255, 140],
    [120, 190, 255],
  ];
  const lamp = (x: number, y: number) => y >= 74 && y <= 90 && (y - 74) % 8 < 4 && x >= 14 && x <= 113 && (x - 14) % 8 < 4;
  const lit = (x: number, y: number) => lamp(x, y) && hash(Math.floor((x - 14) / 8), Math.floor((y - 74) / 8), seed) > 0.35;
  const screen = (x: number, y: number) => x >= 50 && x <= 77 && y >= 22 && y <= 40;
  const tex = build((x, y, p) => {
    if (frame(x, y, p, paint)) return;
    // Reel window: dark glass, the reels are spoked discs.
    if (y >= 18 && y <= 58) {
      if (screen(x, y)) {
        const line = (y - 24) % 5 < 2 && x < 50 + 6 + hash(Math.floor((y - 24) / 5), 1, seed) * 20;
        put(p, line ? 120 : 10, line ? 255 : 56, line ? 150 : 26, 1);
        p.h = 0.3;
        return;
      }
      for (const rx of reels) {
        const d = Math.hypot(x - rx, y - 38);
        if (d < 17) {
          const hub = d < 4;
          const spoke = d > 5 && d < 14 && Math.abs(((Math.atan2(y - 38, x - rx) / (Math.PI * 2)) * 3 + 3) % 1 - 0.5) < 0.12;
          const tape = d >= 14;
          if (hub) put(p, CHROME[0], CHROME[1], CHROME[2], 0.9);
          else if (tape) put(p, 60, 44, 36, 1);
          else put(p, spoke ? 70 : 150, spoke ? 72 : 160, spoke ? 76 : 168, 0.95);
          p.h = hub ? 0.95 : tape ? 0.6 : spoke ? 0.4 : 0.7;
          return;
        }
      }
      paint(x, y, p, DARK, 0.9);
      p.h = 0.3;
      return;
    }
    if (lamp(x, y)) {
      const c = lampColors[Math.floor(hash(Math.floor((x - 14) / 8), Math.floor((y - 74) / 8), seed + 1) * lampColors.length)]!;
      put(p, c[0], c[1], c[2], lit(x, y) ? 1 : 0.3);
      p.h = 0.7;
      return;
    }
    // Toggle switches in a row.
    if (y >= 96 && y <= 106 && x >= 14 && x <= 113 && (x - 14) % 10 < 4) {
      const up = hash(Math.floor((x - 14) / 10), 7, seed) > 0.5;
      const lever = (up ? y < 101 : y > 101) && (x - 14) % 10 >= 1 && (x - 14) % 10 <= 2;
      put(p, lever ? CHROME[0] : 30, lever ? CHROME[1] : 30, lever ? CHROME[2] : 32, 1);
      p.h = lever ? 1 : 0.3;
      return;
    }
    const seam = y === 62 || y === 63;
    paint(x, y, p, [150, 156, 150], seam ? 0.5 : 1);
    p.h = seam ? 0.1 : 0.75;
  });
  return [tex, (x, y) => LIGHT_STRIP(y) || screen(x, y) || lit(x, y)];
}

/** A panel with a round air vent grille and warning stripes at the bottom. */
function ventPanel(seed: number): [Texture, Glow] {
  const paint = enamel(seed);
  const tex = build((x, y, p) => {
    if (frame(x, y, p, paint)) return;
    if (y >= 96) {
      const stripe = ((x + y) >> 3) & 1;
      put(p, stripe ? 214 : 34, stripe ? 172 : 32, stripe ? 40 : 28, 0.9);
      p.h = 0.6;
      return;
    }
    const d = Math.hypot(x - 64, y - 54);
    if (d < 30) {
      const ring = d > 26;
      const slot = !ring && (Math.floor(d) % 5 < 2);
      if (ring) put(p, CHROME[0], CHROME[1], CHROME[2], 0.9);
      else put(p, slot ? 14 : 80, slot ? 14 : 86, slot ? 16 : 92, 1);
      p.h = ring ? 0.95 : slot ? 0.05 : 0.6;
      return;
    }
    paint(x, y, p, ENAMEL, 1);
    p.h = 0.8;
  });
  return [tex, (_x, y) => LIGHT_STRIP(y)];
}

/** Bunker wall in variants (per cell): panels, computer cabinet, other panels, grille; each has its own light mask. */
function retroWall(): Texture {
  const made = [panels(501, ENAMEL), computerBank(502), panels(503, [96, 112, 122]), ventPanel(504), computerBank(505)];
  const variants = made.map(([t]) => t.pixels);
  const glows = made.map(([, lit]) => {
    const g = new Uint8Array(TEX * TEX);
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) g[y * TEX + x] = lit(x, y) ? 1 : 0;
    return g;
  });
  return { pixels: variants[0]!, variants, glows };
}

/** Ribbed steel floor: diamond plates, seams, lighter where people walk. */
function retroFloor(): Texture {
  const grain = fbm(511, 8, 3);
  const wear = fbm(512, 3, 3);
  return build((x, y, p) => {
    const px = x & 63;
    const py = y & 63;
    const seam = px === 0 || py === 0;
    const u = (px + py) % 8;
    const v = (px - py + 64) % 8;
    const diamond = (u === 3 || u === 4) && v >= 2 && v <= 5;
    const k = (0.82 + grain(x, y) * 0.2 + wear(x, y) * 0.15) * (seam ? 0.45 : 1);
    put(p, 108 * k, 114 * k, 120 * k, diamond ? 1.18 : 1);
    p.h = seam ? 0.05 : diamond ? 0.8 : 0.5;
  });
}

/** Ceiling: dark square panels and a round light in the middle (glows). */
const LAMP = (x: number, y: number) => Math.hypot(x - 63.5, y - 63.5) < 12;
function retroCeiling(): Texture {
  const grain = fbm(521, 8, 3);
  const tex = build((x, y, p) => {
    const d = Math.hypot(x - 63.5, y - 63.5);
    if (d < 12) {
      put(p, 255, 244, 214, 1 - d * 0.01);
      p.h = 0.6;
      return;
    }
    if (d < 16) {
      put(p, CHROME[0], CHROME[1], CHROME[2], 0.8);
      p.h = 0.9;
      return;
    }
    const px = x & 63;
    const py = y & 63;
    const seam = px === 0 || py === 0;
    put(p, 70, 76, 80, (0.85 + grain(x, y) * 0.2) * (seam ? 0.4 : 1));
    p.h = seam ? 0.1 : 0.6;
  });
  const glow = new Uint8Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) glow[y * TEX + x] = LAMP(x, y) ? 1 : 0;
  return { ...tex, glow };
}

/** Sliding door: a chrome frame, a porthole, stripes at the bottom, a green lamp above the porthole. */
function retroDoor(): Texture {
  const paint = enamel(531);
  const lamp = (x: number, y: number) => Math.hypot(x - 64, y - 14) < 4;
  const tex = build((x, y, p) => {
    const d = roundRect(x, y, 0, 0, 127, 127, 6);
    if (d < 6) {
      put(p, CHROME[0], CHROME[1], CHROME[2], 0.7 + d * 0.05);
      p.h = 0.9;
      return;
    }
    if (lamp(x, y)) {
      put(p, 110, 255, 140, 1);
      p.h = 0.8;
      return;
    }
    const w = Math.hypot(x - 64, y - 44);
    if (w < 18) {
      const rim = w > 14;
      const shine = !rim && Math.abs(x - y + 22) < 3;
      if (rim) put(p, CHROME[0], CHROME[1], CHROME[2], 0.9);
      else put(p, shine ? 120 : 30, shine ? 150 : 46, shine ? 160 : 56, 1);
      p.h = rim ? 0.95 : 0.2;
      return;
    }
    if (y >= 100) {
      const stripe = ((x + y) >> 3) & 1;
      put(p, stripe ? 214 : 34, stripe ? 172 : 32, stripe ? 40 : 28, 0.9);
      p.h = 0.6;
      return;
    }
    const ridge = y % 16 === 0 && y > 66;
    paint(x, y, p, [150, 160, 166], ridge ? 0.6 : 1);
    p.h = ridge ? 0.2 : 0.7;
  });
  const glow = new Uint8Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) glow[y * TEX + x] = lamp(x, y) ? 1 : 0;
  return { ...tex, glow };
}

export function retroTextures(): Record<RetroTexture, () => Texture> {
  return { retroWall: () => retroWall(), retroFloor: () => retroFloor(), retroCeiling: () => retroCeiling(), retroDoor: () => retroDoor() };
}
