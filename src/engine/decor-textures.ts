// Scenery drawings (src/game/blocks.ts): a computer cabinet with tape reels (working, and a broken one in the Glow), a round stove
// with fire behind the door and a hotplate on top, dirty porcelain (toilets in towns); pipes on vault walls (riser, valve,
// pump with tanks), a caged lamp (the Military Base), a patch of old masonry (the Necropolis sewers), the rust-orange paint
// of caravan trailers.
// Our own drawings in code, nothing from Fallout files.
// Front side: y = 0 — top of the object, y = 127 — floor. Top: y = 0 — at the back wall, y = 127 — at the front.
// Point 0 — a hole (what is behind the object shows through).
import { withHoles } from './furniture-textures.ts';
import { build, cracks, fbm, hash, lerp, noise, put, rng, smooth, TEX, withGlow, type Texture } from './textures.ts';

export type DecorTexture =
  | 'mainframeFront'
  | 'mainframeBroken'
  | 'stoveBody'
  | 'stoveTop'
  | 'dirtyEnamel'
  | 'pipeRiser'
  | 'valveFront'
  | 'pipeMachine'
  | 'cageLamp'
  | 'brickPatch'
  | 'trailerPaint';

/** Dark pipe iron: grain, rust patches; k — brightness (pipe rounding). */
function ironPainter(seed: number) {
  const grain = fbm(seed, 8, 4);
  const rust = fbm(seed + 1, 5, 3);
  return (x: number, y: number, p: { r: number; g: number; b: number; h: number }, k: number) => {
    const r = smooth(0.6, 0.8, rust(x, y));
    put(p, lerp(84, 120, r), lerp(80, 76, r), lerp(74, 50, r), (0.6 + grain(x, y) * 0.35) * k);
  };
}

/** Riser: a vertical pipe of dark iron, bolted flanges at the top, middle and bottom. */
function pipeRiser(): Texture {
  const iron = ironPainter(851);
  return build((x, y, p) => {
    const flange = y < 6 || (y >= 60 && y < 68) || y >= 122;
    const bolt = flange && x % 16 === 8;
    iron(x, y, p, flange ? (bolt ? 1.5 : 1.2) : 1);
    p.h = flange ? 0.9 : 0.6;
  }, 1.1);
}

/** Valve: a riser in the middle, a branch into the wall at the top, a red spoked wheel on the pipe. */
function valveFront(): Texture {
  const iron = ironPainter(861);
  const wheel = { x: 64, y: 78, r: 22 };
  const inPipe = (x: number, y: number) => (Math.abs(x - 64) < 13 && y > 0) || (y > 10 && y < 30 && x > 40 && x < 88);
  const inWheel = (x: number, y: number) => {
    const d = Math.hypot(x - wheel.x, y - wheel.y);
    if (Math.abs(d - wheel.r) < 3.5) return true;
    if (d < 6) return true;
    if (d < wheel.r) return [0, 1, 2].some((i) => Math.abs(Math.sin(Math.atan2(y - wheel.y, x - wheel.x) - (i * Math.PI) / 3)) * d < 2);
    return false;
  };
  const tex = build((x, y, p) => {
    if (inWheel(x, y)) {
      const d = Math.hypot(x - wheel.x, y - wheel.y);
      put(p, 168, 44, 32, 0.8 + (d < 6 ? 0.3 : 0));
      p.h = 0.95;
      return;
    }
    const round = Math.abs(x - 64) < 13 ? 1 - Math.abs(x - 64) / 13 : 1 - Math.abs(y - 20) / 10;
    const flange = (y >= 34 && y < 40) || (y >= 116 && y < 122);
    iron(x, y, p, 0.65 + round * 0.5 + (flange ? 0.2 : 0));
    p.h = 0.4 + round * 0.5;
  }, 1.1);
  return withHoles(tex, (x, y) => !inPipe(x, y) && !inWheel(x, y));
}

/**
 * Pump with tanks: three horizontal dark-iron tanks with copper hoops, a vertical copper pipe on the right, at the bottom —
 * the pump housing with a grille.
 */
function pipeMachine(): Texture {
  const iron = ironPainter(871);
  const tanks = [18, 50, 82];
  const inTank = (y: number) => tanks.find((t) => y >= t && y < t + 26);
  const solid = (x: number, y: number) => (x >= 8 && x < 104 && inTank(y) !== undefined) || (x >= 106 && x < 118 && y > 10) || (x >= 14 && x < 100 && y >= 108);
  const tex = build((x, y, p) => {
    if (x >= 106 && x < 118) {
      const round = 1 - Math.abs(x - 112) / 6;
      put(p, 176, 104, 60, 0.6 + round * 0.5);
      p.h = 0.4 + round * 0.5;
      return;
    }
    if (y >= 108) {
      const slot = x > 24 && x < 90 && (y - 110) % 4 === 3;
      iron(x, y, p, slot ? 0.4 : 0.95);
      p.h = slot ? 0.2 : 0.7;
      return;
    }
    const t = inTank(y) ?? 0;
    const round = 1 - Math.abs(y - (t + 13)) / 13;
    const band = (x >= 14 && x < 20) || (x >= 92 && x < 98);
    if (band) put(p, 170, 100, 56, 0.6 + round * 0.5);
    else iron(x, y, p, 0.55 + round * 0.55);
    p.h = 0.4 + round * 0.5;
  }, 1.1);
  return withHoles(tex, (x, y) => !solid(x, y));
}

/** Caged lamp: orange glass (glows) in a wire cage on a round base. */
function cageLamp(): Texture {
  const inLamp = (x: number, y: number) => ((x - 64) / 50) ** 2 + ((y - 64) / 60) ** 2 <= 1;
  const tex = build((x, y, p) => {
    const u = (x - 64) / 50;
    const v = (y - 64) / 60;
    const d = Math.sqrt(u * u + v * v);
    const wire = d > 0.9 || Math.abs(x - 64) < 3 || Math.abs(y - 40) < 3 || Math.abs(y - 88) < 3;
    if (wire) {
      put(p, 60, 56, 52, 0.9);
      p.h = 0.9;
      return;
    }
    put(p, 255, lerp(190, 120, d), lerp(110, 50, d), 1.05 - d * 0.35);
    p.h = 0.6 - d * 0.3;
  }, 0.8);
  const glow = withGlow(tex, (x, y) => {
    const d = Math.hypot((x - 64) / 50, (y - 64) / 60);
    return d <= 0.9 && Math.abs(x - 64) >= 3 && Math.abs(y - 40) >= 3 && Math.abs(y - 88) >= 3;
  });
  return withHoles(glow, (x, y) => !inLamp(x, y));
}

/** Patch of old masonry on rock: dark brick with black joints, ragged edges, bricks crumbled along the edge. */
function brickPatch(): Texture {
  const body = fbm(881, 6, 4);
  const edge = fbm(882, 5, 4);
  const soot = fbm(883, 3, 4);
  const inside = (x: number, y: number) => {
    const d = Math.max(Math.abs(x - 64) / 64, Math.abs(y - 64) / 64);
    return d + (edge(x, y) - 0.5) * 0.7 < 0.82;
  };
  const tex = build((x, y, p) => {
    const row = y >> 4;
    const shift = (row & 1) * 16;
    const bx = (x + shift) & 31;
    const by = y & 15;
    const mortar = bx < 3 || by < 3;
    const tone = hash(((x + shift) >> 5) & 3, row, 881);
    const s = smooth(0.45, 0.8, soot(x, y));
    const n = body(x, y);
    if (mortar) put(p, 30, 28, 30, 0.8);
    else put(p, lerp(104, 80, tone), lerp(64, 50, tone), lerp(48, 42, tone), (0.55 + n * 0.4) * (1 - s * 0.4));
    p.h = mortar ? 0.15 : 0.8;
  }, 1.3);
  return withHoles(tex, (x, y) => !inside(x, y));
}

/** Cabinet reels: centers and radius. */
const REELS = [
  { x: 38, y: 34 },
  { x: 90, y: 34 },
];
const REEL_R = 19;
/** The window with the reels. */
const reelWindow = (x: number, y: number) => x >= 14 && x <= 114 && y >= 10 && y <= 58;
/** Lamps on the panel under the window: a row of eight. */
const lampAt = (x: number, y: number): number => {
  if (y < 66 || y > 74) return -1;
  for (let i = 0; i < 8; i++) if (Math.hypot(x - (22 + i * 12), y - 70) < 3.2) return i;
  return -1;
};
const LAMP_COLORS: [number, number, number][] = [
  [255, 80, 60],
  [255, 200, 70],
  [100, 255, 120],
  [255, 200, 70],
];

/**
 * Computer cabinet: grey-olive case, two tape reels behind glass at the top, a row of lamps and toggle switches beneath them,
 * a ventilation grille and a plinth at the bottom. Broken: glass knocked out, one reel missing, lamps dark, dents,
 * rust streaks and a couple of sparks in the hole.
 */
function mainframe(broken: boolean): Texture {
  const grain = fbm(801, 8, 4);
  const scuff = fbm(802, 4, 3);
  const rust = noise(803, 22, 3);
  const dent = fbm(804, 3, 3);
  const tex = build((x, y, p) => {
    const n = grain(x, y);
    const rr = broken ? smooth(0.62, 0.85, rust(x, y)) * (0.3 + (y / TEX) * 0.7) : 0;
    const body = (k: number) => {
      const worn = smooth(0.62, 0.8, scuff(x, y));
      put(p, lerp(lerp(118, 140, worn), 120, rr), lerp(lerp(120, 136, worn), 78, rr), lerp(lerp(104, 128, worn), 52, rr), (0.82 + n * 0.25) * k);
    };
    const edge = Math.min(x, TEX - 1 - x, y);
    if (edge < 3) {
      body(0.6 + edge * 0.12);
      p.h = 0.9;
      return;
    }
    if (reelWindow(x, y)) {
      const frame = x <= 16 || x >= 112 || y <= 12 || y >= 56;
      if (frame) {
        put(p, 44, 44, 42, 0.9);
        p.h = 0.7;
        return;
      }
      for (const [i, r] of REELS.entries()) {
        if (broken && i === 1) continue;
        const d = Math.hypot(x - r.x, y - r.y);
        if (d < REEL_R) {
          const hub = d < 5;
          const spoke = d < 14 && Math.abs(Math.sin(Math.atan2(y - r.y, x - r.x) * 3)) < 0.18;
          const tape = d > 8 && d < 17;
          if (hub) put(p, 170, 170, 164, 0.9);
          else if (spoke) put(p, 150, 150, 146, 0.85);
          else if (tape) put(p, 70, 52, 40, 0.7 + ((Math.floor(d) & 1) === 0 ? 0.1 : 0));
          else put(p, 120, 120, 116, 0.8);
          p.h = hub ? 0.8 : 0.55;
          return;
        }
      }
      if (broken) {
        // Broken glass: darkness, shards along the edge, sparks.
        const shard = (x < 26 || x > 104 || y < 20 || y > 50) && hash(x >> 2, y >> 2, 805) > 0.55;
        const spark = hash(x, y, 806) > 0.996;
        if (spark) put(p, 255, 230, 140);
        else if (shard) put(p, 130, 146, 140, 0.8);
        else put(p, 14, 14, 14);
        p.h = shard ? 0.4 : 0;
        return;
      }
      put(p, 30, 40, 38, 0.9 + ((x + y) % 9 === 0 ? 0.3 : 0));
      p.h = 0.25;
      return;
    }
    const lamp = lampAt(x, y);
    if (lamp >= 0) {
      const [r, g, b] = LAMP_COLORS[lamp % LAMP_COLORS.length]!;
      if (broken) put(p, 52, 44, 40, 0.8);
      else put(p, r, g, b, 1);
      p.h = 0.75;
      return;
    }
    // Toggle switches.
    if (y >= 80 && y <= 88 && (x - 18) % 14 < 4 && x > 16 && x < 112) {
      put(p, 180, 176, 166, y < 83 ? 1.1 : 0.8);
      p.h = 0.85;
      return;
    }
    if (y >= 96 && y <= 114 && x >= 18 && x <= 110) {
      const slot = (y - 96) % 3 === 2;
      body(slot ? 0.3 : 0.95);
      p.h = slot ? 0.1 : 0.7;
      return;
    }
    if (y >= 120) {
      put(p, 40, 40, 38, 0.8 + n * 0.3);
      p.h = 0.4;
      return;
    }
    const d = broken ? smooth(0.6, 0.75, dent(x, y)) : 0;
    const seam = y === 62 || y === 92 || y === 117;
    body((seam ? 0.5 : 1) * (1 - d * 0.25));
    p.h = seam ? 0.2 : 0.7 - d * 0.3;
  });
  if (broken) return withGlow(tex, (x, y) => reelWindow(x, y) && hash(x, y, 806) > 0.996);
  return withGlow(tex, (x, y) => lampAt(x, y) >= 0);
}

/** Fire behind the stove door. */
const FIRE = { x0: 46, x1: 82, y0: 62, y1: 92 };
const inFire = (x: number, y: number) => x > FIRE.x0 + 3 && x < FIRE.x1 - 3 && y > FIRE.y0 + 3 && y < FIRE.y1 - 3;

/**
 * Side of a round stove: dark cast iron, riveted hoops at the top and bottom, a firebox door with a grate — fire behind it
 * (glows by itself), a dark plinth at the bottom.
 */
function stoveBody(): Texture {
  const grain = fbm(811, 8, 4);
  const soot = fbm(812, 3, 4);
  const flame = noise(813, 10, 6);
  const tex = build((x, y, p) => {
    const n = grain(x, y);
    const s = smooth(0.5, 0.8, soot(x, y));
    const iron = (k: number) => put(p, 70, 64, 60, (0.6 + n * 0.35) * (1 - s * 0.3) * k);
    if (y >= 118) {
      iron(0.55);
      p.h = 0.4;
      return;
    }
    const band = (y >= 8 && y < 16) || (y >= 104 && y < 112);
    if (band) {
      const rivet = x % 16 === 8 && (y === 11 || y === 12 || y === 107 || y === 108);
      iron(rivet ? 1.5 : 1.15);
      p.h = rivet ? 1 : 0.9;
      return;
    }
    if (x >= FIRE.x0 && x <= FIRE.x1 && y >= FIRE.y0 && y <= FIRE.y1) {
      if (inFire(x, y)) {
        const bar = (x - FIRE.x0) % 7 < 2;
        if (bar) {
          iron(0.7);
          p.h = 0.6;
          return;
        }
        const f = flame(x, y * 1.5) * (1 - (FIRE.y1 - y) / 40);
        put(p, 255, lerp(90, 220, f), lerp(20, 80, f), 0.7 + f * 0.5);
        p.h = 0.2;
        return;
      }
      iron(1.25);
      p.h = 0.85;
      return;
    }
    iron(1);
    p.h = 0.6 + n * 0.1;
  }, 1.2);
  return withGlow(tex, (x, y) => inFire(x, y) && (x - FIRE.x0) % 7 >= 2);
}

/** Stove top: a cast-iron plate with two burners (rings), soot. */
function stoveTop(): Texture {
  const grain = fbm(821, 8, 4);
  return build((x, y, p) => {
    const n = grain(x, y);
    let k = 0.6 + n * 0.3;
    let h = 0.6;
    for (const c of [
      { x: 44, y: 64 },
      { x: 86, y: 64 },
    ]) {
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < 18 && (Math.abs(d - 16) < 1.5 || Math.abs(d - 10) < 1.2 || d < 3)) {
        k *= 1.35;
        h = 0.9;
      } else if (d < 18) {
        k *= 0.75;
        h = 0.4;
      }
    }
    put(p, 62, 58, 56, k);
    p.h = h;
  }, 1.2);
}

/** Dirty porcelain: yellowed, with rust streaks, dark stains and a web of cracks. */
function dirtyEnamel(): Texture {
  const body = fbm(831, 4, 4);
  const grime = fbm(832, 5, 4);
  const streak = noise(833, 18, 3);
  const crack = cracks(834, 3, 0.008, 0.45);
  const speck = rng(835);
  return build((x, y, p) => {
    const n = body(x, y);
    const g = smooth(0.5, 0.8, grime(x, y));
    const st = smooth(0.62, 0.85, streak(x, y)) * (0.4 + (y / TEX) * 0.6);
    const c = crack(x, y);
    const dot = speck() > 0.985;
    put(p, lerp(lerp(210, 150, g), 150, st), lerp(lerp(204, 136, g), 96, st), lerp(lerp(184, 110, g), 62, st), (0.82 + n * 0.18) * (1 - c * 0.5) * (dot ? 0.5 : 1));
    p.h = 0.7 - c * 0.3;
  }, 0.6);
}

/** Caravan trailer paint: faded rust-orange, patches of bare metal, a chrome stripe, dents. */
function trailerPaint(): Texture {
  const body = fbm(891, 4, 5);
  const bare = fbm(892, 6, 4);
  const dent = fbm(893, 3, 3);
  const speck = rng(894);
  return build((x, y, p) => {
    const n = body(x, y);
    const b = smooth(0.62, 0.7, bare(x, y));
    const d = smooth(0.6, 0.8, dent(x, y));
    if (y >= 40 && y < 46) {
      put(p, 190, 186, 176, y === 40 ? 1.2 : 0.85);
      p.h = 0.9;
      return;
    }
    const sp = speck() > 0.97 ? 0.7 : 1;
    put(p, lerp(150, 120, b), lerp(84, 112, b), lerp(52, 104, b), (0.6 + n * 0.35) * (1 - d * 0.2) * sp);
    p.h = 0.6 - d * 0.3 + n * 0.1;
  }, 1.1);
}

/** How to draw each drawing (drawn on first access — addLazyTextures). */
export function decorTextures(): Record<DecorTexture, () => Texture> {
  return {
    mainframeFront: () => mainframe(false),
    mainframeBroken: () => mainframe(true),
    stoveBody,
    stoveTop,
    dirtyEnamel,
    pipeRiser,
    valveFront,
    pipeMachine,
    cageLamp,
    brickPatch,
    trailerPaint,
  };
}
