// Vault 13 in chrome (client request, 2026-10-24: "chrome color, retro-futurism style"): our own drawings in the spirit of the "atomic
// age" — polished chrome panels with a highlight, rounded light fixtures and "fin" ribs, consoles with round dials and
// blue lamps, a glowing strip under the ceiling, a dark mirror floor with seams, a ceiling with round lights,
// a sliding door with a porthole. No recognizable insignia. Rusty floor and ceiling — for the abandoned Vault 15.
import { build, cracks, dome, fbm, hash, lerp, noise, put, smooth, TEX, type Px, type Texture } from './textures.ts';

export type ChromeTexture = 'chromeWall' | 'chromeFloor' | 'chromeCeiling' | 'chromeDoor' | 'rustFloor' | 'rustCeiling';

type Rgb3 = [number, number, number];
const CHROME: Rgb3 = [206, 214, 220];
const CHROME_HI: Rgb3 = [248, 251, 253];
const CHROME_LO: Rgb3 = [118, 128, 138];
const ENAMEL: Rgb3 = [168, 184, 192];
const DARK: Rgb3 = [30, 34, 40];
const CYAN: Rgb3 = [96, 226, 238];
const AMBER: Rgb3 = [255, 204, 96];

type Glow = (x: number, y: number) => boolean;

/** Rounded rectangle: distance inward from the edge (below 0 — outside). */
function roundRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number): number {
  const cx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const cy = Math.max(y0 + r - y, 0, y - (y1 - r));
  if (cx > 0 && cy > 0) return r - Math.hypot(cx, cy);
  return Math.min(x - x0, x1 - x, y - y0, y1 - y);
}

/**
 * Polished chrome: vertically — a highlight (a light band at a third of the height, darker toward the bottom — the floor's reflection), horizontally —
 * slightly "wavy" from brushing; rare scratches. band — where the highlight is (0..1 of the panel height).
 */
function chromePaint(seed: number) {
  const brushed = noise(seed, 2, 64);
  const sheen = fbm(seed + 1, 3, 2);
  const scratch = cracks(seed + 2, 3, 0.005, 0.25);
  return (x: number, y: number, p: Px, y0 = 0, y1 = TEX, tint: Rgb3 = CHROME) => {
    const v = (y - y0) / Math.max(1, y1 - y0);
    // Highlight at the upper third, dark reflection below, a narrow light edge at the very bottom.
    const glint = Math.exp(-((v - 0.3) * (v - 0.3)) / 0.02);
    const floorRef = smooth(0.55, 1, v) * 0.45;
    const lip = v > 0.93 ? 0.25 : 0;
    const k = 0.72 + glint * 0.5 - floorRef + lip + (sheen(x, y) - 0.5) * 0.16 + brushed(x, y) * 0.05 - scratch(x, y) * 0.3;
    put(p, lerp(tint[0], CHROME_HI[0], glint * 0.6), lerp(tint[1], CHROME_HI[1], glint * 0.6), lerp(tint[2], CHROME_HI[2], glint * 0.6), k);
    p.h = 0.92 - scratch(x, y) * 0.3;
  };
}

/** Enamel between the chrome: smooth, lightly brushed. */
function enamel(seed: number) {
  const grain = fbm(seed, 8, 3);
  const scuff = fbm(seed + 1, 5, 3);
  return (x: number, y: number, p: Px, tint: Rgb3 = ENAMEL, k = 1) => {
    const worn = Math.max(0, Math.min(1, (scuff(x, y) - 0.7) * 4));
    put(p, lerp(tint[0], 200, worn), lerp(tint[1], 206, worn), lerp(tint[2], 208, worn), (0.9 + grain(x, y) * 0.1) * k);
    p.h = 0.8;
  };
}

/** Top and bottom of the wall in all variants: a glowing strip under the ceiling, a chrome cornice, a dark riveted baseboard. */
const LIGHT_STRIP = (y: number) => y >= 3 && y <= 6;
function frame(x: number, y: number, p: Px, chrome: ReturnType<typeof chromePaint>): boolean {
  if (y < 10) {
    if (LIGHT_STRIP(y)) put(p, 236, 250, 255, 1);
    else put(p, DARK[0], DARK[1], DARK[2], 1);
    p.h = LIGHT_STRIP(y) ? 0.4 : 0.8;
    return true;
  }
  if (y < 16) {
    chrome(x, y, p, 10, 16);
    return true;
  }
  if (y >= 114) {
    const rivet = dome(Math.hypot((x % 16) - 8, y - 121), 2.2) > 0;
    if (rivet) chrome(x, y, p, 118, 124);
    else {
      put(p, DARK[0], DARK[1], DARK[2], 1);
      p.h = 0.6;
    }
    return true;
  }
  if (y >= 108) {
    chrome(x, y, p, 108, 114);
    return true;
  }
  return false;
}

/** Two chrome panels with rounded corners and an enamel inset; between them — a dark seam. */
function chromePanels(seed: number): [Texture, Glow] {
  const chrome = chromePaint(seed);
  const paint = enamel(seed + 10);
  const tex = build((x, y, p) => {
    if (frame(x, y, p, chrome)) return;
    const half = x < 64 ? 0 : 64;
    const d = roundRect(x, y, half + 4, 20, half + 59, 104, 10);
    if (d < 0) {
      put(p, DARK[0], DARK[1], DARK[2], 1);
      p.h = 0.2;
      return;
    }
    // Chrome panel frame, inside — enamel with a chrome rib down the middle.
    if (d < 6) {
      chrome(x, y, p, 20, 104);
      return;
    }
    if (Math.abs(y - 62) < 3) {
      chrome(x, y, p, 59, 65);
      return;
    }
    paint(x, y, p);
  });
  return [tex, (_x, y) => LIGHT_STRIP(y)];
}

/** A panel with three horizontal chrome "fin" ribs (like on fridges and cars of that era). */
function chromeFins(seed: number): [Texture, Glow] {
  const chrome = chromePaint(seed);
  const paint = enamel(seed + 10);
  const fins = [30, 56, 82];
  const tex = build((x, y, p) => {
    if (frame(x, y, p, chrome)) return;
    for (const f of fins) {
      if (y >= f && y < f + 8) {
        chrome(x, y, p, f, f + 8);
        p.h = 1;
        return;
      }
      // Shadow under the rib.
      if (y >= f + 8 && y < f + 11) {
        paint(x, y, p, ENAMEL, 0.7);
        return;
      }
    }
    paint(x, y, p, [150, 170, 180]);
  });
  return [tex, (_x, y) => LIGHT_STRIP(y)];
}

/** Console: three round dials in chrome rings, a small blue screen and a row of lamps. */
function chromeConsole(seed: number): [Texture, Glow] {
  const chrome = chromePaint(seed);
  const paint = enamel(seed + 10);
  const dials = [24, 64, 104];
  const screen = (x: number, y: number) => x >= 14 && x <= 54 && y >= 22 && y <= 42;
  const lamp = (x: number, y: number) => y >= 90 && y <= 96 && x >= 16 && x <= 112 && (x - 16) % 12 < 6;
  const lit = (x: number, y: number) => lamp(x, y) && hash(Math.floor((x - 16) / 12), 3, seed) > 0.3;
  const tex = build((x, y, p) => {
    if (frame(x, y, p, chrome)) return;
    if (screen(x, y)) {
      const line = (y - 24) % 5 < 2 && x < 14 + 6 + hash(Math.floor((y - 24) / 5), 1, seed) * 30;
      put(p, line ? 140 : 8, line ? 240 : 40, line ? 250 : 52, 1);
      p.h = 0.3;
      return;
    }
    // Chrome edge of the screen.
    if (x >= 12 && x <= 56 && y >= 20 && y <= 44) {
      chrome(x, y, p, 20, 44);
      return;
    }
    for (const dx of dials) {
      const d = Math.hypot(x - dx, y - 68);
      if (d < 15) {
        if (d > 12) {
          chrome(x, y, p, 53, 83);
          return;
        }
        // Dial face: dark, ticks around the circle, a blue needle.
        const a = Math.atan2(y - 68, x - dx);
        const tick = d > 9 && Math.abs(((a / (Math.PI * 2)) * 12 + 12) % 1 - 0.5) < 0.08;
        const needleA = -2.2 + hash(dx, 5, seed) * 2.6;
        const needle = d < 10 && Math.abs(a - needleA) < 0.1;
        if (needle) put(p, CYAN[0], CYAN[1], CYAN[2], 1);
        else put(p, tick ? 200 : 22, tick ? 206 : 26, tick ? 210 : 32, 1);
        p.h = 0.25;
        return;
      }
    }
    if (lamp(x, y)) {
      const on = lit(x, y);
      const amber = hash(Math.floor((x - 16) / 12), 9, seed) > 0.5;
      const c = amber ? AMBER : CYAN;
      put(p, c[0], c[1], c[2], on ? 1 : 0.3);
      p.h = 0.7;
      return;
    }
    paint(x, y, p, [150, 168, 176]);
  });
  return [tex, (x, y) => LIGHT_STRIP(y) || screen(x, y) || lit(x, y)];
}

/** A panel with a round air vent grille in a chrome ring. */
function chromeVent(seed: number): [Texture, Glow] {
  const chrome = chromePaint(seed);
  const paint = enamel(seed + 10);
  const tex = build((x, y, p) => {
    if (frame(x, y, p, chrome)) return;
    const d = Math.hypot(x - 64, y - 62);
    if (d < 32) {
      if (d > 27) {
        chrome(x, y, p, 30, 94);
        return;
      }
      const slot = Math.floor(d) % 5 < 2;
      put(p, slot ? 12 : 84, slot ? 14 : 92, slot ? 18 : 98, 1);
      p.h = slot ? 0.05 : 0.6;
      return;
    }
    paint(x, y, p);
  });
  return [tex, (_x, y) => LIGHT_STRIP(y)];
}

/** Vault 13 wall in variants (per cell): panels, fins, console, panels, grille; each has its own light mask. */
function chromeWall(): Texture {
  const made = [chromePanels(601), chromeFins(602), chromeConsole(603), chromePanels(604), chromeVent(605)];
  const variants = made.map(([t]) => t.pixels);
  const glows = made.map(([, lit]) => {
    const g = new Uint8Array(TEX * TEX);
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) g[y * TEX + x] = lit(x, y) ? 1 : 0;
    return g;
  });
  return { pixels: variants[0]!, variants, glows };
}

/** Dark mirror floor: polished steel plates with soft highlights and light chrome seams. */
function chromeFloor(): Texture {
  const sheen = fbm(611, 2, 2);
  const grain = fbm(612, 8, 3);
  const scratch = cracks(613, 4, 0.005, 0.3);
  return build((x, y, p) => {
    const px = x & 63;
    const py = y & 63;
    const edge = Math.min(px, 63 - px, py, 63 - py);
    if (edge < 2) {
      put(p, CHROME[0], CHROME[1], CHROME[2], edge < 1 ? 0.75 : 1);
      p.h = 0.95;
      return;
    }
    const s = sheen(x, y);
    const k = 0.62 + s * 0.5 + grain(x, y) * 0.08 - scratch(x, y) * 0.25;
    put(p, 96, 108, 118, k);
    p.h = 0.9 - scratch(x, y) * 0.3;
  });
}

/** Ceiling: light panels with chrome seams and a round light in a chrome ring (glows). */
const LAMP = (x: number, y: number) => Math.hypot(x - 63.5, y - 63.5) < 13;
function chromeCeiling(): Texture {
  const grain = fbm(621, 8, 3);
  const tex = build((x, y, p) => {
    const d = Math.hypot(x - 63.5, y - 63.5);
    if (d < 13) {
      put(p, 250, 250, 240, 1 - d * 0.012);
      p.h = 0.6;
      return;
    }
    if (d < 17) {
      put(p, CHROME[0], CHROME[1], CHROME[2], d < 15 ? 1.05 : 0.8);
      p.h = 0.9;
      return;
    }
    const px = x & 63;
    const py = y & 63;
    const seam = px < 2 || py < 2;
    if (seam) put(p, CHROME[0], CHROME[1], CHROME[2], 0.9);
    else put(p, 150, 160, 168, 0.88 + grain(x, y) * 0.16);
    p.h = seam ? 0.95 : 0.6;
  });
  const glow = new Uint8Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) glow[y * TEX + x] = LAMP(x, y) ? 1 : 0;
  return { ...tex, glow };
}

/** Sliding door: a chrome leaf with a highlight, a porthole with blue glass, a blue lamp above it, ribs at the bottom. */
function chromeDoor(): Texture {
  const chrome = chromePaint(631);
  const lamp = (x: number, y: number) => Math.hypot(x - 64, y - 12) < 4;
  const tex = build((x, y, p) => {
    const d = roundRect(x, y, 0, 0, 127, 127, 6);
    if (d < 5) {
      put(p, CHROME_LO[0], CHROME_LO[1], CHROME_LO[2], 0.9 + d * 0.06);
      p.h = 0.9;
      return;
    }
    if (lamp(x, y)) {
      put(p, CYAN[0], CYAN[1], CYAN[2], 1);
      p.h = 0.8;
      return;
    }
    const w = Math.hypot(x - 64, y - 46);
    if (w < 19) {
      if (w > 15) {
        chrome(x, y, p, 27, 65);
        return;
      }
      const shine = Math.abs(x - y + 20) < 3;
      put(p, shine ? 150 : 24, shine ? 230 : 70, shine ? 240 : 86, 1);
      p.h = 0.2;
      return;
    }
    if (y >= 100 && y % 8 < 4) {
      chrome(x, y, p, 100, 128);
      p.h = 1;
      return;
    }
    chrome(x, y, p, 5, 123);
  });
  const glow = new Uint8Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) glow[y * TEX + x] = lamp(x, y) ? 1 : 0;
  return { ...tex, glow };
}

/** Floor of the abandoned Vault 15: concrete slabs with rust streaks, dirt and cracks, dark damp at the seams. */
function rustFloor(): Texture {
  const body = fbm(641, 8, 4);
  const stain = fbm(642, 4, 3);
  const rust = fbm(643, 3, 4);
  const scratch = cracks(644, 4, 0.008, 0.5);
  return build((x, y, p) => {
    const px = x & 63;
    const py = y & 63;
    const edge = Math.min(px, 63 - px, py, 63 - py);
    const tile = hash(x >> 6, y >> 6, 641);
    const n = body(x, y);
    let k = 0.58 + n * 0.3 + (tile - 0.5) * 0.14;
    if (edge < 1) k *= 0.45;
    else if (edge < 4) k *= 0.8;
    const s = smooth(0.55, 0.72, stain(x, y)) * 0.6;
    const r = smooth(0.5, 0.74, rust(x, y));
    k *= 1 - scratch(x, y) * 0.3;
    put(p, lerp(lerp(104, 58, s), 128, r), lerp(lerp(100, 50, s), 72, r), lerp(lerp(90, 40, s), 44, r), k);
    p.h = edge < 1 ? 0.1 : 0.65 + n * 0.15 - r * 0.2;
  });
}

/** Ceiling of the abandoned Vault 15: rusty grated panels, some panels torn off — black openings. */
function rustCeiling(): Texture {
  const n = fbm(651, 8, 3);
  const rust = fbm(652, 3, 3);
  return build((x, y, p) => {
    const px = x & 31;
    const py = y & 31;
    const missing = hash(x >> 5, y >> 5, 651) > 0.82;
    if (missing) {
      put(p, 8, 7, 6, 1);
      p.h = 0.05;
      return;
    }
    const r = smooth(0.52, 0.74, rust(x, y));
    const k = 0.55 + n(x, y) * 0.4;
    if (px < 3 || py < 3) {
      put(p, lerp(80, 112, r), lerp(79, 64, r), lerp(76, 40, r), k);
      p.h = 0.9;
    } else if ((px & 3) === 1 && (py & 3) === 1) {
      put(p, 14, 13, 12, k);
      p.h = 0.15;
    } else {
      put(p, lerp(46, 96, r), lerp(46, 58, r), lerp(44, 36, r), k);
      p.h = 0.4;
    }
  }, 1.2);
}

export function chromeTextures(): Record<ChromeTexture, () => Texture> {
  return { chromeWall: () => chromeWall(), chromeFloor: () => chromeFloor(), chromeCeiling: () => chromeCeiling(), chromeDoor: () => chromeDoor(), rustFloor: () => rustFloor(), rustCeiling: () => rustCeiling() };
}
