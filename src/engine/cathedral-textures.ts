// The Cathedral — from the client's picture (2026-10-21: "make the same building"): a dark mass of stone and metal. Below —
// a long hall with arched windows, a ribbed band and three doors; above it — a central tower with a huge glowing stained-glass
// window (a rose and three windows), under the window — a relief band with figures and a winged figure above the entrance; on the sides —
// pinnacled buttresses, wings with lancet windows, round towers with domes and spires. Our own drawings in code, without
// anyone else's emblems or inscriptions.
import { build, fbm, hash, noise, put, TEX, type Px, type Texture } from './textures.ts';

export type CathedralTexture = 'gothicWall' | 'gothicSpire' | 'gothicDoor' | 'cathBase' | 'cathTower' | 'cathPier' | 'cathDrum' | 'cathDome';

/** Dark dressed stone: rows of blocks, joints, soot and streaks. */
function darkStone(seed: number) {
  const grain = fbm(seed, 16, 4);
  const soot = fbm(seed + 1, 4, 3);
  const streak = noise(seed + 2, 40, 2);
  return (x: number, y: number, p: Px, k = 1, blocks = true) => {
    const row = Math.floor(y / 11);
    const joint = blocks && (y % 11 === 0 || (x + (row & 1) * 16) % 32 === 0);
    const tone = 0.88 + hash(Math.floor((x + (row & 1) * 16) / 32), row, seed) * 0.2;
    const dirty = streak(x, y) > 0.6 ? 0.82 : 1;
    const g = (0.85 + grain(x, y) * 0.22) * (0.86 + soot(x, y) * 0.2) * tone * dirty * k * (joint ? 0.6 : 1);
    put(p, 78 * g, 72 * g, 70 * g);
    p.h = joint ? 0.3 : 0.55 + grain(x, y) * 0.2;
  };
}

/** Stained-glass colors (by day the glass is dark from outside; at night the renderer raises its brightness — the window glows with its own color). */
const GLASS: [number, number, number][] = [
  [235, 150, 40],
  [200, 52, 30],
  [44, 70, 170],
  [240, 200, 70],
  [220, 110, 30],
];

/** Stained glass: lead diamonds, each with its own color. */
function stainedGlass(x: number, y: number, p: Px): void {
  const a = Math.floor((x + y) / 9);
  const b = Math.floor((x - y + 256) / 9);
  if ((x + y) % 9 === 0 || (x - y + 256) % 9 === 0) {
    put(p, 22, 20, 20);
    p.h = 0.5;
    return;
  }
  const c = GLASS[Math.floor(hash(a, b, 905) * GLASS.length)]!;
  const k = 0.3 + hash(b, a, 906) * 0.1;
  put(p, c[0] * k, c[1] * k, c[2] * k);
  p.h = 0.25;
}

/** A lancet arch from x0 to x1 springing at height base (above it — two arcs meeting at a point). */
function inArch(x: number, y: number, x0: number, x1: number, base: number): boolean {
  if (x < x0 || x > x1) return false;
  if (y >= base) return true;
  const r = x1 - x0;
  return (x - x1) ** 2 + (y - base) ** 2 < r * r && (x - x0) ** 2 + (y - base) ** 2 < r * r;
}

/** Wall window (3 storeys tall): lancet, from y 14 (the point) to 110 (the sill). */
const WIN = { x0: 42, x1: 86, base: 52, sill: 110 };

/** Window glass (without frame or tracery): 1 or 0. */
function windowAt(x: number, y: number): number {
  if (y > WIN.sill - 3 || !inArch(x, y, WIN.x0 + 3, WIN.x1 - 3, WIN.base)) return 0;
  const mullion = Math.abs(x - 64) < 1.5 && y > 40;
  const transom = Math.abs(y - 72) < 1.2 || Math.abs(y - 92) < 1.2;
  const rose = Math.abs(Math.hypot(x - 64, y - 32) - 8) < 1.5;
  return mullion || transom || rose ? 0 : 1;
}

/** Cathedral wall three storeys tall: buttresses at the edges, a tall lancet stained-glass window, a blind arcade beneath it. */
function gothicWall(): Texture {
  const stone = darkStone(641);
  const texture = build((x, y, p) => {
    // Cornice band along the top.
    if (y < 6) {
      stone(x, y, p, y < 2 ? 1.15 : y > 4 ? 0.55 : 0.95, false);
      p.h = y > 4 ? 0.2 : 0.95;
      return;
    }
    // Buttresses: projecting, with drip-stone offsets.
    const pier = x < 12 || x > 115;
    if (pier) {
      const edge = x < 12 ? x : 127 - x;
      const ledge = y % 43;
      stone(x, y, p, edge < 2 ? 0.6 : ledge < 3 ? 1.2 : ledge < 6 ? 0.55 : 1.02, false);
      p.h = edge < 2 ? 0.4 : ledge < 3 ? 1 : 0.85;
      return;
    }
    if (inArch(x, y, WIN.x0, WIN.x1, WIN.base) && y <= WIN.sill) {
      if (windowAt(x, y)) stainedGlass(x, y, p);
      else {
        stone(x, y, p, 1.12, false);
        p.h = 0.8;
      }
      return;
    }
    // Window reveal — deep shadow.
    if (inArch(x, y, WIN.x0 - 5, WIN.x1 + 5, WIN.base) && y <= WIN.sill + 4) {
      stone(x, y, p, 0.45, false);
      p.h = 0.25;
      return;
    }
    // Under the window — three blind arches.
    if (y > 114 && y < 126 && x > 30 && x < 98) {
      const cell = Math.floor((x - 30) / 23);
      const lx = 30 + cell * 23;
      const inner = inArch(x, y, lx + 3, lx + 20, 119);
      stone(x, y, p, inner ? 0.5 : 0.95, false);
      p.h = inner ? 0.2 : 0.7;
      return;
    }
    stone(x, y, p);
  });
  const windows = new Uint8Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) windows[y * TEX + x] = windowAt(x, y);
  return { ...texture, windows, windowShare: 0.7, repeat: 3 };
}

/** Spire: dark ribbed metal, bronze crockets along the ribs, bands at equal intervals. */
function gothicSpire(): Texture {
  const grain = fbm(651, 8, 3);
  return build((x, y, p) => {
    const rib = x % 32;
    const onRib = rib < 4;
    const crocket = onRib && y % 16 < 5;
    const belt = y % 64 < 4;
    const k = 0.8 + grain(x, y) * 0.3;
    if (crocket || belt) put(p, 118 * k, 92 * k, 58 * k);
    else put(p, 56 * k, 58 * k, 62 * k, onRib ? 1.25 : rib < 7 ? 0.6 : 1);
    p.h = crocket ? 1 : onRib ? 0.85 : belt ? 0.9 : 0.45;
  }, 1.3);
}

/**
 * A huge door (one image for the full height of the opening — the renderer stretches it over repeat storeys): colonnettes at the edges,
 * above the door — a lancet arch with mouldings and a blind tympanum, the leaves — dark wood with iron straps and rivets.
 */
function gothicDoor(): Texture {
  const stone = darkStone(671);
  const wood = fbm(672, 4, 4);
  return build((x, y, p) => {
    if (x < 12 || x > 115) {
      // A cluster of thin colonnettes.
      const c = (x < 12 ? x : 127 - x) % 4;
      stone(x, y, p, c === 0 ? 0.55 : c === 2 ? 1.2 : 1, false);
      p.h = c === 0 ? 0.3 : 0.9;
      return;
    }
    const inner = inArch(x, y, 22, 106, 26);
    if (!inner) {
      // Arch mouldings: three steps.
      const ring = inArch(x, y, 14, 114, 20) ? (inArch(x, y, 18, 110, 23) ? 2 : 1) : 0;
      stone(x, y, p, ring === 2 ? 0.55 : ring === 1 ? 1.15 : 0.9, false);
      p.h = ring === 2 ? 0.3 : ring === 1 ? 0.9 : 0.6;
      return;
    }
    // Tympanum above the leaves.
    if (y < 30) {
      stone(x, y, p, 0.5, false);
      p.h = 0.35;
      return;
    }
    // Leaves: planks, iron straps, rivets, rings.
    const leaf = x < 64 ? x - 22 : 106 - x;
    const plank = (x - 22) % 8 === 0 || Math.abs(x - 64) < 1;
    const strap = [44, 70, 96, 118].some((s) => Math.abs(y - s) < 2.5);
    const rivet = strap && (x - 22) % 8 === 4;
    const ring = Math.abs(Math.hypot(x - (x < 64 ? 58 : 70), y - 84) - 3.5) < 1;
    if (rivet || ring) {
      put(p, 120, 110, 96);
      p.h = 1;
    } else if (strap) {
      put(p, 46, 44, 44);
      p.h = 0.8;
    } else {
      const k = (0.75 + wood(x * 0.25, y) * 0.4) * (plank ? 0.5 : 1) * (leaf < 2 ? 0.6 : 1);
      put(p, 70 * k, 46 * k, 30 * k);
      p.h = plank ? 0.3 : 0.6;
    }
  });
}

/** Lower hall (5 storeys in one image): cornice, ribbed band, a tall arched window with a grille, plinth. */
function cathBase(): Texture {
  const stone = darkStone(681);
  const inWindow = (x: number, y: number) => inArch(x, y, 36, 92, 56) && y <= 108;
  const texture = build((x, y, p) => {
    if (y < 5) {
      stone(x, y, p, y < 2 ? 1.2 : 0.6, false);
      p.h = y < 2 ? 1 : 0.3;
      return;
    }
    // Ribbed band: dense vertical ribs, like a balustrade.
    if (y < 26) {
      const rib = x % 5;
      stone(x, y, p, rib === 0 ? 0.5 : rib === 2 ? 1.25 : 1, false);
      p.h = rib === 0 ? 0.2 : 0.85;
      return;
    }
    if (y < 31) {
      stone(x, y, p, y < 28 ? 1.15 : 0.55, false);
      p.h = y < 28 ? 0.95 : 0.3;
      return;
    }
    // Piers at the edges.
    if (x < 9 || x > 118) {
      const edge = x < 9 ? x : 127 - x;
      stone(x, y, p, edge < 2 ? 0.55 : 1.05, false);
      p.h = edge < 2 ? 0.3 : 0.9;
      return;
    }
    if (inWindow(x, y)) {
      // Dark glass behind an iron grille.
      const bar = (x - 36) % 7 === 0 || Math.abs(y - 82) < 1.5 || Math.abs(x - 64) < 1.5;
      if (bar) put(p, 40, 40, 44);
      else put(p, 26, 24, 26);
      p.h = bar ? 0.6 : 0.1;
      return;
    }
    if (inArch(x, y, 31, 97, 52) && y <= 112) {
      stone(x, y, p, 1.12, false);
      p.h = 0.85;
      return;
    }
    if (y > 112) {
      stone(x, y, p, y < 115 ? 1.15 : 0.85);
      p.h = y < 115 ? 1 : 0.5;
      return;
    }
    stone(x, y, p);
  });
  const windows = new Uint8Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const bar = (x - 36) % 7 === 0 || Math.abs(y - 82) < 1.5 || Math.abs(x - 64) < 1.5;
      windows[y * TEX + x] = x >= 9 && x <= 118 && inWindow(x, y) && !bar ? 1 : 0;
    }
  }
  return { ...texture, windows, windowLight: [255, 170, 80], windowShare: 0.6, repeat: 5 };
}

/** Central tower: dark stone, thin colonnettes and blind lancet panels (2 storeys tall). */
function cathTower(): Texture {
  const stone = darkStone(691);
  return build((x, y, p) => {
    const shaft = x % 32;
    if (shaft < 4) {
      stone(x, y, p, shaft === 0 ? 0.5 : shaft === 2 ? 1.3 : 1.1, false);
      p.h = shaft === 0 ? 0.3 : 0.95;
      return;
    }
    if (y % 64 < 4) {
      stone(x, y, p, y % 64 < 2 ? 1.2 : 0.55, false);
      p.h = y % 64 < 2 ? 1 : 0.3;
      return;
    }
    // Blind arch in each panel: a dark outline.
    const lx = x % 32;
    const inner = inArch(lx, y % 64, 8, 28, 26);
    const outer = inArch(lx, y % 64, 6, 30, 24);
    stone(x, y, p, inner ? 0.78 : outer ? 0.5 : 1, false);
    p.h = inner ? 0.35 : outer ? 0.2 : 0.6;
  });
}

/** Pinnacled buttress: a cluster of shafts, crockets on the sides, a drip stone every 64 points. */
function cathPier(): Texture {
  const stone = darkStone(701);
  return build((x, y, p) => {
    const stripe = Math.floor(x / 10) % 2;
    const edge = x % 10;
    const crocket = (x < 8 || x > 119) && y % 20 < 7;
    const ledge = y % 64 < 5;
    stone(x, y, p, crocket ? 1.3 : ledge ? (y % 64 < 2 ? 1.25 : 0.5) : edge === 0 ? 0.5 : stripe ? 1.1 : 0.9, false);
    p.h = crocket || (ledge && y % 64 < 2) ? 1 : edge === 0 ? 0.2 : 0.75;
  });
}

/** Dome drum: dark metal and stone, arched windows all around (they glow at night). */
function cathDrum(): Texture {
  const stone = darkStone(711);
  const inWindow = (x: number, y: number) => inArch(x, y, 44, 84, 44) && y <= 106;
  const texture = build((x, y, p) => {
    if (y < 8 || y > 118) {
      stone(x, y, p, y < 3 || y > 124 ? 1.2 : 0.6, false);
      p.h = y < 3 || y > 124 ? 1 : 0.3;
      return;
    }
    if (inWindow(x, y)) {
      const bar = Math.abs(x - 64) < 1.5;
      put(p, bar ? 40 : 24, bar ? 38 : 22, bar ? 42 : 26);
      p.h = 0.1;
      return;
    }
    if (inArch(x, y, 38, 90, 40) && y <= 110) {
      stone(x, y, p, 1.15, false);
      p.h = 0.85;
      return;
    }
    const col = x % 64 < 5;
    stone(x, y, p, col ? 1.2 : 0.95, !col);
  });
  const windows = new Uint8Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) windows[y * TEX + x] = inWindow(x, y) && Math.abs(x - 64) >= 1.5 ? 1 : 0;
  return { ...texture, windows, windowLight: [255, 176, 90], windowShare: 0.65, repeat: 2 };
}

/** Dome: lead sheets, ribs running top to bottom, seams across. */
function cathDome(): Texture {
  const grain = fbm(721, 8, 3);
  return build((x, y, p) => {
    const rib = x % 32 < 4;
    const seam = y % 21 === 0;
    const k = (0.8 + grain(x, y) * 0.3) * (rib ? 1.3 : seam ? 0.6 : 1);
    put(p, 74 * k, 78 * k, 86 * k);
    p.h = rib ? 0.95 : seam ? 0.2 : 0.5;
  }, 1.2);
}

export function cathedralTextures(): Record<CathedralTexture, () => Texture> {
  return {
    gothicWall: () => gothicWall(),
    gothicSpire: () => ({ ...gothicSpire(), repeat: 2 }),
    gothicDoor: () => ({ ...gothicDoor(), repeat: 4 }),
    cathBase: () => cathBase(),
    cathTower: () => ({ ...cathTower(), repeat: 2 }),
    cathPier: () => ({ ...cathPier(), repeat: 2 }),
    cathDrum: () => cathDrum(),
    cathDome: () => cathDome(),
  };
}

/**
 * A large picture on a wall (see LevelPanel): w points across, h — top to bottom; stored by columns (point —
 * px * h + row), because the renderer walks down a frame column. 0 — a transparent point (the wall shows through); glow —
 * glows by itself (the stained glass glows by day too).
 */
export interface PanelPicture {
  w: number;
  h: number;
  pixels: Uint32Array;
  glow: Uint8Array;
}

export type PanelName = 'greatWindow' | 'frieze' | 'wingedFigure' | 'bunkerLadder' | 'vaultHole' | 'liftDoor' | 'liftExit' | 'liftCabin' | 'liftCabinExit';

/** A picture point: color (0..255), whether it glows; null — transparent. */
interface PanelPx {
  r: number;
  g: number;
  b: number;
  glow: boolean;
}

/** A picture units cells × storeys storeys in size: paint(X, Y) — X from −units/2 to units/2, Y — storeys from the bottom. */
function panel(units: number, storeys: number, perUnit: number, paint: (X: number, Y: number, p: PanelPx) => boolean): PanelPicture {
  const w = Math.round(units * perUnit);
  const h = Math.round(storeys * perUnit);
  const pixels = new Uint32Array(w * h);
  const glow = new Uint8Array(w * h);
  const p: PanelPx = { r: 0, g: 0, b: 0, glow: false };
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  for (let px = 0; px < w; px++) {
    for (let py = 0; py < h; py++) {
      p.glow = false;
      const X = ((px + 0.5) / w - 0.5) * units;
      const Y = (1 - (py + 0.5) / h) * storeys;
      if (!paint(X, Y, p)) continue;
      const i = px * h + py;
      pixels[i] = (0xff << 24) | (c(p.b) << 16) | (c(p.g) << 8) | c(p.r);
      glow[i] = p.glow ? 1 : 0;
    }
  }
  return { w, h, pixels, glow };
}

/** A lancet arch with half-width hw springing at height spring (in picture units). */
const archIn = (X: number, Y: number, cx: number, hw: number, spring: number, bottom = -1e9) => {
  const x = X - cx;
  if (Math.abs(x) > hw || Y < bottom) return false;
  if (Y <= spring) return true;
  const r = hw * 2;
  return (x - hw) ** 2 + (Y - spring) ** 2 < r * r && (x + hw) ** 2 + (Y - spring) ** 2 < r * r;
};

/** Picture stone: dark, grainy. */
function panelStone(p: PanelPx, X: number, Y: number, k: number): void {
  const n = hash(Math.floor(X * 40), Math.floor(Y * 40), 731) * 0.16 + 0.92;
  p.r = 72 * k * n;
  p.g = 69 * k * n;
  p.b = 70 * k * n;
}

/** Fiery glass: from gold in the middle to red at the edges; brightness — light. */
function fireGlass(p: PanelPx, heat: number, light: number): void {
  p.r = (200 + 55 * heat) * light;
  p.g = (60 + 150 * heat * heat) * light;
  p.b = (10 + 60 * heat ** 3) * light;
  p.glow = true;
}

/**
 * The huge stained-glass window of the central tower (6 cells × 13.5 storeys): a lancet arch with three mouldings, at the top — a rose
 * with sixteen petals, at the bottom — three tall windows, in the middle — a radiance, like a bright figure in flames.
 */
function greatWindow(): PanelPicture {
  const SPRING = 8.5;
  return panel(6, 13.5, 64, (X, Y, p) => {
    if (!archIn(X, Y, 0, 2.75, SPRING)) return false;
    // Frame mouldings: three steps of stone.
    if (!archIn(X, Y, 0, 2.25, SPRING + 0.1, 0.35)) {
      const step = archIn(X, Y, 0, 2.5, SPRING + 0.05) ? 0.62 : 1.1;
      panelStone(p, X, Y, Y < 0.35 ? 0.8 : step);
      return true;
    }
    const lead = (k: number) => {
      p.r = 30 * k;
      p.g = 24 * k;
      p.b = 22 * k;
      p.glow = true;
    };
    // Rose.
    const rx = X;
    const ry = Y - 10.3;
    const rr = Math.hypot(rx, ry);
    if (rr < 1.95) {
      if (Math.abs(rr - 1.95) < 0.08 || Math.abs(rr - 0.45) < 0.06) {
        lead(1.2);
        return true;
      }
      const a = Math.atan2(ry, rx);
      const sector = ((a / (Math.PI * 2)) * 16 + 16) % 1;
      if (rr > 0.45 && (sector < 0.05 || sector > 0.95)) {
        lead(1);
        return true;
      }
      // Petals: a circle in each sector.
      const mid = (Math.floor(((a / (Math.PI * 2)) * 16 + 16) % 16) + 0.5) * ((Math.PI * 2) / 16);
      const petal = Math.hypot(rx - Math.cos(mid) * 1.2, ry - Math.sin(mid) * 1.2);
      if (Math.abs(petal - 0.36) < 0.05) {
        lead(1);
        return true;
      }
      const heat = rr < 0.45 ? 1 : petal < 0.36 ? 0.75 - rr * 0.15 : 0.45 - (rr - 1.2) * 0.3;
      fireGlass(p, Math.max(0, heat), 0.95);
      return true;
    }
    // Three windows at the bottom.
    const lancets = [-1.45, 0, 1.45];
    for (const cx of lancets) {
      if (archIn(X, Y, cx, 0.62, 6.9, 0.6)) {
        // Lead cames: a dense grid.
        if ((X * 9 + 100) % 1 < 0.12 || (Y * 4) % 1 < 0.08) {
          lead(1);
          return true;
        }
        const glowAt = Math.exp(-((X / 1.6) ** 2) - ((Y - 4.3) / 3.2) ** 2);
        const tile = hash(Math.floor(X * 9 + 100), Math.floor(Y * 4), 741);
        fireGlass(p, Math.min(1, glowAt * 1.1 + tile * 0.15), 0.8 + tile * 0.2);
        return true;
      }
    }
    // Small round windows between the pointed window tops and the rose.
    for (const cx of [-0.72, 0.72]) {
      const d = Math.hypot(X - cx, Y - 7.85);
      if (d < 0.32) {
        if (d > 0.26) lead(1);
        else fireGlass(p, 0.55, 0.85);
        return true;
      }
    }
    // Stone tracery between the windows.
    panelStone(p, X, Y, Y < 0.6 ? 0.8 : 1.15);
    return true;
  });
}

/** Relief band under the stained glass (6 cells × 2.5 storeys): nine figures in niches, cornices above and below. */
function frieze(): PanelPicture {
  return panel(6, 2.5, 64, (X, Y, p) => {
    if (Y < 0.3 || Y > 2.2) {
      const lip = Y < 0.12 || Y > 2.38;
      panelStone(p, X, Y, lip ? 1.25 : Y > 2.2 && Y < 2.28 ? 0.5 : 0.95);
      return true;
    }
    const cell = 6 / 9;
    const n = Math.floor((X + 3) / cell);
    const lx = X + 3 - (n + 0.5) * cell;
    const niche = archIn(lx, Y, 0, cell * 0.4, 1.7, 0.36);
    if (!niche) {
      panelStone(p, X, Y, Math.abs(Math.abs(lx) - cell * 0.42) < 0.03 ? 0.6 : 1);
      return true;
    }
    // Figure: head, shoulders, robe widening downward; light from the upper left.
    const head = Math.hypot(lx, Y - 1.62) < 0.11;
    const bodyHalf = Y < 1.48 ? 0.1 + (1.48 - Y) * 0.1 : 0;
    const body = Y > 0.4 && Y < 1.5 && Math.abs(lx) < bodyHalf;
    if (head || body) {
      const side = head ? lx / 0.11 : lx / Math.max(0.01, bodyHalf);
      const fold = body ? 0.08 * Math.cos(lx * 60 + (n % 3)) : 0;
      panelStone(p, X, Y, 1.35 - side * 0.35 + fold);
      return true;
    }
    panelStone(p, X, Y, 0.42);
    return true;
  });
}

/**
 * Winged figure above the entrance (6 cells × 4 storeys): a helmeted bust, huge wings on the sides, feathers fanned up
 * and outward; below — a stone corbel. Dark metal with highlights. Transparent — the tower wall.
 */
function wingedFigure(): PanelPicture {
  const metal = (p: PanelPx, k: number) => {
    p.r = 104 * k;
    p.g = 102 * k;
    p.b = 108 * k;
  };
  return panel(6, 4, 64, (X, Y, p) => {
    // Corbel under the figure.
    if (Y < 0.32 && Math.abs(X) < 2.7) {
      panelStone(p, X, Y, Y > 0.24 ? 1.3 : Y > 0.16 ? 0.6 : 0.95);
      return true;
    }
    const ax = Math.abs(X);
    // Helmet: dome on top, cheek guards, dark depth in the face and a crest down the middle.
    const hy = Y - 2.25;
    if (ax < 0.36 && hy > -0.45 && hy < 0.5 && (hy < 0.1 || ax * ax / 0.13 + (hy - 0.1) ** 2 / 0.16 < 1)) {
      const face = ax < 0.2 && hy > -0.35 && hy < 0.05;
      const brow = Math.abs(hy - 0.08) < 0.04 && ax < 0.3;
      const crest = ax < 0.04 && hy > 0.12;
      const nose = ax < 0.03 && face;
      metal(p, crest ? 1.6 : brow ? 1.4 : nose ? 1.1 : face ? 0.38 + hy * 0.4 : 1.25 - ax * 1.2 + hy * 0.3);
      return true;
    }
    // Neck and chest — a breastplate tapering downward, with a ridge down the middle.
    const chestHalf = 0.62 - (1.75 - Y) * 0.32;
    if (Y > 0.32 && Y < 1.8 && ax < chestHalf) {
      const ridge = ax < 0.025;
      const band = Math.abs(Y - 1.3) < 0.03 || Math.abs(Y - 0.85) < 0.03;
      metal(p, ridge ? 1.5 : band ? 0.5 : 1.15 - ax * 0.6 + (Y - 1) * 0.1);
      return true;
    }
    // Pauldrons.
    const sh = Math.hypot(ax - 0.62, (Y - 1.62) * 1.4);
    if (sh < 0.3) {
      metal(p, sh > 0.26 ? 0.5 : 1.35 - (ax - 0.62) * 1.2);
      return true;
    }
    // Wings: fanned up and outward from the shoulder, three tiers of feathers — small coverts at the shoulder, middle ones, long flight feathers.
    const wx = ax - 0.68;
    const wy = Y - 1.7;
    if (wx < -0.05) return false;
    const r = Math.hypot(wx, wy);
    const ang = Math.atan2(wy, wx);
    if (ang < 0.12 || ang > 1.5 || r > 2.9) return false;
    const FEATHERS = 13;
    const t = (ang - 0.12) / 1.38;
    const k = Math.min(FEATHERS - 1, Math.floor(t * FEATHERS));
    const inK = t * FEATHERS - k;
    const len = 1.55 + 1.25 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62);
    if (r > len * (0.9 + 0.1 * Math.sqrt(Math.max(0, inK * (1 - inK) * 4)))) return false;
    const tier = r < len * 0.38 ? 0 : r < len * 0.66 ? 1 : 2;
    if (tier === 0) {
      // Coverts: rows of scales.
      const row = Math.floor(r * 9);
      const scale = (r * 9) % 1;
      const off = (inK * 2 + (row & 1) * 0.5) % 1;
      metal(p, scale < 0.15 || off < 0.08 ? 0.45 : 1.2 - scale * 0.35);
      return true;
    }
    // Feather: dark edge, light shaft, darker toward the tip; tier over tier — with a shadow at the edge.
    const shift = tier === 1 ? 0.5 : 0;
    const local = (inK + shift) % 1;
    const edge = local < 0.07 || local > 0.93;
    const quill = Math.abs(local - 0.5) < 0.035;
    const lip = tier === 2 && r < len * 0.71;
    const toTip = r / len;
    metal(p, edge || lip ? 0.42 : quill ? 1.45 : (tier === 1 ? 1.12 : 1) * (1.15 - toTip * 0.35) * (0.92 + 0.12 * Math.sin(local * Math.PI)));
    return true;
  });
}

/**
 * A steel ladder on the Brotherhood bunker wall (to the right of the door, as on the original door frame): two rails and rungs,
 * between them — the wall itself (transparent). A picture rather than a wall texture: otherwise the ladder would also be inside the doorway.
 */
function bunkerLadder(): PanelPicture {
  return panel(0.7, 1, 128, (X, Y, p) => {
    const rail = Math.abs(Math.abs(X) - 0.24) < 0.025;
    const rung = Math.abs(X) < 0.25 && Y % 0.11 < 0.022 && Y > 0.04;
    if (!rail && !rung) return false;
    const k = rail ? (X < 0 ? 1.1 : 0.85) : 0.95;
    p.r = 128 * k;
    p.g = 124 * k;
    p.b = 118 * k;
    return true;
  });
}

/**
 * Entrance to Vault 15 from the cave (like the original v13secr4 wall): around the passage — remains of the thick toothed rim of the torn-off
 * blast door and blast soot on the concrete; transparent — the slab itself. The passage — a cell without a wall in the middle of the picture.
 */
function vaultHole(): PanelPicture {
  // Smooth noise (grid of s per unit, smoothed between nodes): soot in ragged patches rather than squares.
  const soft = (X: number, Y: number, s: number) => {
    const gx = X * s + 100;
    const gy = Y * s + 100;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const h = (i: number, j: number) => hash(x0 + i, y0 + j, 761);
    return (h(0, 0) * (1 - sx) + h(1, 0) * sx) * (1 - sy) + (h(0, 1) * (1 - sx) + h(1, 1) * sx) * sy;
  };
  return panel(4, 1, 64, (X, Y, p) => {
    const dy = Y - 0.5;
    const d = Math.hypot(X, dy);
    const a = Math.atan2(dy, X);
    const n = soft(X, Y, 10) * 0.6 + soft(X, Y, 26) * 0.4;
    if (d < 0.6) {
      // Inner edge of the rim — teeth (between them — the darkness of the opening).
      const tooth = ((a / (Math.PI * 2)) * 22 + 22) % 1 < 0.55;
      const k = tooth ? 0.8 + n * 0.2 : 0.12;
      p.r = 128 * k;
      p.g = 92 * k;
      p.b = 66 * k;
      return true;
    }
    if (d < 0.82) {
      // Rim body: rusty steel, bolts.
      const bolt = Math.abs(d - 0.71) < 0.025 && ((a / (Math.PI * 2)) * 16 + 16) % 1 < 0.18;
      const k = (0.62 + n * 0.25) * (bolt ? 1.35 : 1) * (Math.abs(d - 0.61) < 0.012 ? 0.5 : 1);
      p.r = 132 * k;
      p.g = 84 * k;
      p.b = 52 * k;
      return true;
    }
    // Soot around — in ragged patches, thicker near the rim.
    if (d < 1.25 && n < 1 - (d - 0.82) * 2) {
      const k = 0.25 + n * 0.25;
      p.r = 60 * k;
      p.g = 52 * k;
      p.b = 46 * k;
      return true;
    }
    return false;
  });
}

/** Draw a picture by name (the renderer draws it once, when it first comes into view). */
/**
 * Elevator doors on the wall behind the elevator spot (client request, 2026-10-25: "can't tell where the elevator is and where the exit is"): a frame, two leaves
 * of brushed steel with a seam in the middle, a call button on the side. Above the doors a display: on an elevator between floors — amber
 * up and down arrows; on an elevator leading outside (exit) — a green up arrow and a green frame glow.
 */
function liftDoors(exit: boolean): PanelPicture {
  const lit = exit ? [90, 255, 120] : [255, 176, 40];
  const glowPx = (p: PanelPx, k = 1) => {
    p.r = lit[0]! * k;
    p.g = lit[1]! * k;
    p.b = lit[2]! * k;
    p.glow = true;
    return true;
  };
  const steel = (p: PanelPx, k: number) => {
    p.r = 64 * k;
    p.g = 67 * k;
    p.b = 72 * k;
  };
  return panel(0.8, 0.94, 128, (X, Y, p) => {
    const ax = Math.abs(X);
    // Display above the doors.
    if (Y > 0.8) {
      const cy = 0.87;
      if (exit) {
        // Up arrow: a triangle and a stem.
        const head = Y > cy - 0.005 && Y < cy + 0.045 && ax < (cy + 0.045 - Y) * 0.9;
        const stem = ax < 0.012 && Y > cy - 0.045 && Y <= cy;
        if (head || stem) return glowPx(p);
      } else {
        // Two arrows: up on the left, down on the right.
        const up = Math.abs(X + 0.07) < (cy + 0.035 - Y) * 0.75 && Y > cy - 0.025;
        const down = Math.abs(X - 0.07) < (Y - (cy - 0.035)) * 0.75 && Y < cy + 0.025;
        if (up || down) return glowPx(p);
      }
      const box = ax < 0.16 && Math.abs(Y - cy) < 0.055;
      steel(p, box ? 0.35 : 0.82 + hash(Math.floor(X * 60), Math.floor(Y * 60), 941) * 0.12);
      return true;
    }
    // Frame; on an elevator leading outside its inner edge glows green.
    if (ax > 0.33) {
      if (exit && ax < 0.345) return glowPx(p, 0.85);
      // Call button on the right jamb.
      if (X > 0.35 && X < 0.385 && Math.abs(Y - 0.46) < 0.025) return glowPx(p, 0.9);
      steel(p, 0.9 + (ax > 0.39 ? -0.25 : 0) + hash(Math.floor(X * 50), Math.floor(Y * 50), 942) * 0.1);
      return true;
    }
    if (Y > 0.78) {
      steel(p, 0.7);
      return true;
    }
    // Seam between the leaves — a dark gap.
    if (ax < 0.006) {
      p.r = p.g = p.b = 18;
      return true;
    }
    // Leaves: brushed lengthwise, faint ribs, a worn strip at the bottom.
    const brush = hash(Math.floor(X * 400), Math.floor(Y * 12), 943) * 0.1;
    const rib = Y % 0.19 < 0.008 ? -0.18 : 0;
    const kick = Y < 0.07 ? -0.22 : 0;
    const k = 0.92 + brush + rib + kick - ax * 0.25;
    p.r = 138 * k;
    p.g = 142 * k;
    p.b = 146 * k;
    return true;
  });
}

/**
 * Back wall of an open elevator cab, as in the original (client request, 2026-10-29: elevators are an open cab with a grated floor):
 * ribbed steel, in the middle at hand height — a panel with floor buttons, above it a display with arrows; on an elevator leading outside
 * — a green up arrow and green buttons.
 */
function liftCabin(exit: boolean): PanelPicture {
  const lit = exit ? [90, 255, 120] : [255, 176, 40];
  const glowPx = (p: PanelPx, k = 1) => {
    p.r = lit[0]! * k;
    p.g = lit[1]! * k;
    p.b = lit[2]! * k;
    p.glow = true;
    return true;
  };
  return panel(0.9, 0.94, 128, (X, Y, p) => {
    const ax = Math.abs(X);
    // Display with arrows.
    const cy = 0.78;
    if (ax < 0.12 && Math.abs(Y - cy) < 0.05) {
      if (exit) {
        const head = Y > cy - 0.005 && Y < cy + 0.04 && ax < (cy + 0.04 - Y) * 0.9;
        const stem = ax < 0.01 && Y > cy - 0.04 && Y <= cy;
        if (head || stem) return glowPx(p);
      } else {
        const up = Math.abs(X + 0.05) < (cy + 0.03 - Y) * 0.75 && Y > cy - 0.02;
        const down = Math.abs(X - 0.05) < (Y - (cy - 0.03)) * 0.75 && Y < cy + 0.02;
        if (up || down) return glowPx(p);
      }
      p.r = p.g = p.b = 20;
      return true;
    }
    // Panel: a box with two columns of buttons.
    if (ax < 0.09 && Y > 0.38 && Y < 0.6) {
      const col = Math.abs(Math.abs(X) - 0.04) < 0.018;
      const row = (Y - 0.4) % 0.05 < 0.025;
      if (col && row && Y < 0.58) return glowPx(p, 0.75);
      p.r = 44;
      p.g = 46;
      p.b = 50;
      return true;
    }
    // Ribbed steel: vertical ribs, a worn strip at the bottom, shadow from the side walls at the edges.
    const rib = (X + 1) % 0.12 < 0.02 ? -0.2 : 0;
    const scuff = hash(Math.floor(X * 90), Math.floor(Y * 90), 951) * 0.12;
    const kick = Y < 0.08 ? -0.2 : 0;
    const k = 0.85 + rib + scuff + kick - ax * 0.35;
    p.r = 112 * k;
    p.g = 116 * k;
    p.b = 120 * k;
    return true;
  });
}

export function panelPicture(name: PanelName): PanelPicture {
  if (name === 'liftDoor' || name === 'liftExit') return liftDoors(name === 'liftExit');
  if (name === 'liftCabin' || name === 'liftCabinExit') return liftCabin(name === 'liftCabinExit');
  return name === 'greatWindow' ? greatWindow() : name === 'frieze' ? frieze() : name === 'bunkerLadder' ? bunkerLadder() : name === 'vaultHole' ? vaultHole() : wingedFigure();
}
