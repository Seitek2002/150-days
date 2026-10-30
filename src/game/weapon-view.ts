// The weapon in the player's hand (a Doom-style view). The images are ours: drawn in code on a canvas (weapon-art.ts): pistol,
// long gun, knife, spear and empty fist; without a canvas (tests), a simple pixel drawing from this file.
// Melee is a forward thrust instead of recoil.
import { FULL_RES, RES, VIEW_H, VIEW_W } from '../engine/renderer.ts';
import { ART_SCALE, paintWeapon, type Art } from './weapon-art.ts';

/* Each letter is a pixel color, a dot is transparent. */
const ART = [
  '...............ff...............',
  '...........kddmllmddk...........',
  '...........kddmllmddk...........',
  '...........kddmllmddk...........',
  '..........kdddmllmdddk..........',
  '..........kdddmllmdddk..........',
  '..........kdddmllmdddk..........',
  '.........kddddmllmddddk.........',
  '.........kddddmllmddddk.........',
  '.........kddddmllmddddk.........',
  '........kdddddmllmdddddk........',
  '........kdddddmllmdddddk........',
  '........kkkkkkkkkkkkkkkk........',
  '........kmmmmmk..kmmmmmk........',
  '........kddddddddddddddk........',
  '........kdmmmmmmmmmmmmdk........',
  '........kdmddddddddddmdk........',
  '........kdmddddddddddmdk........',
  '........kdmmmmmmmmmmmmdk........',
  '........kkddddddddddddkk........',
  '.........kggggggggggggk.........',
  '......kkkkhhhggggggggggk........',
  '.....khhhhhhhskggggggggk........',
  '....khhhhhhhhhskgggggggkk.......',
  '....khhhhhhhhhhhhhhhhhhhhk......',
  '....khsshhhhhhhhhhhhhhhhhhk.....',
  '....khhhhhhhhshhhhhshhhhhhk.....',
  '....kshhhhhhhhhhhhhhhhhhhhk.....',
  '....khhhhhhhhshhhhhshhhhhsk.....',
  '.....khhhhhhhhhhhhhhhhhhhk......',
  '.....kshhhhhhhhhhhhhhhhhsk......',
  '......kshhhhhhhhhhhhhhhsk.......',
  '......kkcccccccccccccccckk......',
  '.....kccCcccccccccccccCcck......',
  '.....kcCcccccccccccccccCck......',
  '....kccCcccccccccccccccCcck.....',
  '....kcCcccccccccccccccccCck.....',
  '...kccCcccccccccccccccccCcck....',
  '...kcCcccccccccccccccccccCck....',
  '..kccCcccccccccccccccccccCcck...',
  '..kcCcccccccccccccccccccccCck...',
];

function rgb(r: number, g: number, b: number): number {
  return (0xff << 24) | (b << 16) | (g << 8) | r;
}

const COLORS: Record<string, number> = {
  k: rgb(14, 13, 12),
  d: rgb(52, 54, 58),
  m: rgb(86, 89, 94),
  l: rgb(140, 144, 150),
  f: rgb(190, 192, 186),
  g: rgb(58, 40, 28),
  h: rgb(196, 150, 118),
  s: rgb(150, 108, 84),
  c: rgb(92, 98, 78),
  C: rgb(64, 69, 54),
};

/** What is in hand, for the image. */
export type WeaponLook =
  | 'pistol'
  | 'laserPistol'
  | 'plasmaPistol'
  | 'smg'
  | 'rifle'
  | 'shotgun'
  | 'laserRifle'
  | 'plasmaRifle'
  | 'flamer'
  | 'minigun'
  | 'rocket'
  | 'knife'
  | 'club'
  | 'spear'
  | 'fist';

/** Muzzle flash color: a bullet is yellow-orange, a laser red, plasma green, a flamer a big flame. */
export type FlashKind = 'bullet' | 'laser' | 'plasma' | 'fire';

const FLASH_COLORS: Record<FlashKind, { glow: [number, number, number]; core: [number, number, number]; size: number }> = {
  bullet: { glow: [255, 190, 80], core: [255, 255, 230], size: 11 },
  laser: { glow: [255, 60, 40], core: [255, 220, 200], size: 9 },
  plasma: { glow: [80, 255, 100], core: [220, 255, 220], size: 12 },
  fire: { glow: [255, 120, 30], core: [255, 230, 120], size: 22 },
};

/** Fist (the lower part of the pistol image): with a handle for the knife and spear, without it, empty. */
const HAND = ART.slice(20);
const FIST = HAND.map((row) => row.replace(/g/g, 'h'));
const blank = (w: number) => '.'.repeat(w);
const centered = (core: string) => {
  const w = ART[0]!.length;
  const left = Math.floor((w - core.length) / 2) + 1;
  return blank(left) + core + blank(w - left - core.length);
};
/** Long gun: the same pistol, the barrel higher. */
const RIFLE = [...ART.slice(0, 4), ...ART.slice(1, 4), ...ART.slice(1, 4), ...ART.slice(1)];
/** Knife: the blade above the fist, the guard, the handle in the fist. */
const KNIFE = [
  centered('f'),
  centered('lf'),
  centered('llf'),
  centered('kllf'),
  centered('kllf'),
  centered('kllmf'),
  centered('kllmf'),
  centered('kllmf'),
  centered('kllmf'),
  centered('kllmf'),
  centered('kllmf'),
  centered('kllmf'),
  centered('kmmmmmmmk'),
  centered('kkkkkkkkk'),
  ...HAND,
];
/** Spear: the head and a long shaft, the fist at the bottom. */
const SPEAR = [
  centered('f'),
  centered('lf'),
  centered('lmf'),
  centered('llmf'),
  centered('kllmk'),
  centered('kkk'),
  ...Array.from({ length: 16 }, () => centered('kggk')),
  ...HAND,
];

function build(rows: string[]): Art {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const pixels = new Uint32Array(w * h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => (pixels[y * w + x] = COLORS[ch] ?? 0)));
  return { pixels, w, h };
}

/** A point of the simple drawing is 2×2 points of the 320×190 frame (RES times more in the detailed frame). */
const pixelScale = () => 2 * RES;
const PISTOL_PX = build(ART);
const RIFLE_PX = build(RIFLE);
const KNIFE_PX = build(KNIFE);
const PIXEL_ARTS: Record<WeaponLook, Art> = {
  pistol: PISTOL_PX,
  laserPistol: PISTOL_PX,
  plasmaPistol: PISTOL_PX,
  smg: PISTOL_PX,
  rifle: RIFLE_PX,
  shotgun: RIFLE_PX,
  laserRifle: RIFLE_PX,
  plasmaRifle: RIFLE_PX,
  flamer: RIFLE_PX,
  minigun: RIFLE_PX,
  rocket: RIFLE_PX,
  knife: KNIFE_PX,
  club: KNIFE_PX,
  spear: build(SPEAR),
  fist: build(FIST),
};
/** Images drawn on a canvas (drawn on first show) and how much to scale them (1 means point for point). */
const painted = new Map<WeaponLook, Art | null>();

function artOf(look: WeaponLook): { art: Art; scale: number; painted: boolean } {
  if (!painted.has(look)) painted.set(look, paintWeapon(look));
  const art = painted.get(look);
  // The drawn images are made for the detailed frame; in the fast one (RES = 1) they are half the size.
  return art ? { art, scale: (ART_SCALE * RES) / FULL_RES, painted: true } : { art: PIXEL_ARTS[look], scale: pixelScale(), painted: false };
}

/** Add light of color (r, g, b) with strength k to a frame point (the flash glows rather than paints over). */
function addLight(frame: Uint32Array, i: number, r: number, g: number, b: number, k: number): void {
  const c = frame[i] ?? 0;
  const nr = Math.min(255, (c & 0xff) + r * k);
  const ng = Math.min(255, ((c >>> 8) & 0xff) + g * k);
  const nb = Math.min(255, ((c >>> 16) & 0xff) + b * k);
  frame[i] = (0xff << 24) | (nb << 16) | (ng << 8) | nr;
}

/** The muzzle flash is ours, drawn in code: a hot core, a halo and short rays; each shot gets its own ray rotation. */
function drawFlash(frame: Uint32Array, cx: number, cy: number, size: number, turn: number, kind: FlashKind): void {
  const { glow, core } = FLASH_COLORS[kind];
  const reach = Math.ceil(size * 1.8);
  for (let y = -reach; y <= reach; y++) {
    for (let x = -reach; x <= reach; x++) {
      const px = Math.round(cx + x);
      const py = Math.round(cy + y);
      if (px < 0 || py < 0 || px >= VIEW_W || py >= VIEW_H) continue;
      const d = Math.hypot(x, y * 1.25) / size;
      const a = Math.atan2(y, x) + turn;
      const rays = Math.pow(Math.abs(Math.cos(a * 3)), 12) * 0.9;
      const k = Math.max(0, 1 - d) ** 1.5 + Math.max(0, 1 - d / 1.8) * rays;
      if (k <= 0.02) continue;
      const i = py * VIEW_W + px;
      addLight(frame, i, glow[0], glow[1], glow[2], k * 1.4);
      if (d < 0.35) addLight(frame, i, core[0], core[1], core[2], (1 - d / 0.35) * 1.2);
    }
  }
}

export interface WeaponPose {
  /** How long since walking started, for the bobbing. */
  walkTime: number;
  moving: boolean;
  /** 0..1: recoil right after a shot. */
  recoil: number;
  flash: boolean;
  /** 0..1: the weapon is lowered while reloading. */
  lowered: number;
  /** What is in hand; none means the pistol. */
  look?: WeaponLook;
  /** What flash the shot has; none means a bullet. */
  flashKind?: FlashKind;
  /**
   * The weapon image from the player's copy (the same as in the inventory): drawn at the bottom right, no hand, barrel toward the crosshair.
   * null means nothing in hand (or the image is still loading): we draw nothing. No field means our own drawing (for tests).
   */
  picture?: WeaponPicture | null;
  /** Melee (knife, spear, club): a blow is a forward thrust, not recoil. */
  melee?: boolean;
}

/** A weapon image from the player's copy: points (0 is transparent), size and where the muzzle is (the left end of the barrel). */
export interface WeaponPicture {
  pixels: Uint32Array;
  w: number;
  h: number;
  muzzleX: number;
  muzzleY: number;
  /** Its own scale in the detailed frame (pixel art: an integer, crisp points; half in the fast one); none means by image size. */
  scale?: number;
}

/**
 * The inventory image (canvas) to points for the frame. In the frame the weapon is on the right and faces the crosshair, that is "front"
 * to the left. In the inventory some are drawn barrel to the right (pistol, rifle), others blade to the left (knife): the front is the thin
 * end (muzzle, point), the back is the thick one (grip, stock). If the front is on the right, we mirror. The muzzle is the middle of the leftmost
 * opaque column.
 */
export function weaponPicture(data: ImageData, front?: 'left' | 'right'): WeaponPicture {
  const source = new Uint32Array(data.data.buffer.slice(0));
  const { width: w, height: h } = data;
  const solid = (x: number, y: number) => ((source[y * w + x] ?? 0) >>> 24) > 128;
  const edge = Math.max(1, Math.round(w * 0.2));
  let leftMass = 0;
  let rightMass = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < edge; x++) {
      if (solid(x, y)) leftMass++;
      if (solid(w - 1 - x, y)) rightMass++;
    }
  }
  // Where the front is can be stated directly (spear: the barbed head is thicker than the shaft, the "thin end" rule does not apply).
  const mirror = front ? front === 'right' : rightMass < leftMass;
  const pixels = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pixels[y * w + x] = source[y * w + (mirror ? w - 1 - x : x)] ?? 0;
  let muzzleX = 0;
  let muzzleY = h / 2;
  found: for (let x = 0; x < w; x++) {
    let sum = 0;
    let n = 0;
    for (let y = 0; y < h; y++) {
      if ((pixels[y * w + x] ?? 0) >>> 24 > 128) {
        sum += y;
        n++;
      }
    }
    if (n > 0) {
      muzzleX = x;
      muzzleY = sum / n;
      break found;
    }
  }
  return { pixels, w, h, muzzleX, muzzleY };
}

/**
 * Weapon image at the bottom right (in points of the 320×190 frame): no wider than PICTURE_WIDTH, no taller than PICTURE_HEIGHT and no larger than
 * PICTURE_MAX_SCALE, so a long rifle and a short pistol look proportionate.
 */
const PICTURE_WIDTH = 130;
const PICTURE_HEIGHT = 62;
const PICTURE_MAX_SCALE = 3.2;

/**
 * The size of our own image from the weapons folder is by its painted area in the frame (square points of the 320×190 frame), not by
 * width: a tall pistol of the same width covered half the screen (the client, 2026-10-23). Knife ≈3700; pistol the same as the knife;
 * long weapons one and a half times more. A type without its own area uses FILE_PICTURE_AREA.
 */
export const FILE_PICTURE_AREA = 5600;
export const FILE_PICTURE_AREAS: Partial<Record<WeaponLook, number>> = { pistol: 3700, knife: 3700, club: 4200, spear: 4800 };

/**
 * Our own image from the public/weapons folder (a finished first-person drawing): scaled down so its painted part
 * takes area square points of the frame (FILE_PICTURE_AREAS), with smoothing, not mirrored. The muzzle is the topmost-leftmost
 * opaque point (the barrel faces the crosshair).
 */
export function filePicture(image: HTMLImageElement | HTMLCanvasElement, area = FILE_PICTURE_AREA): WeaponPicture | null {
  // Empty edges around the weapon are cropped: it does not matter where it is in the image and how much transparency surrounds it.
  const full = document.createElement('canvas');
  full.width = image.width;
  full.height = image.height;
  const fctx = full.getContext('2d');
  if (!fctx) return null;
  fctx.drawImage(image, 0, 0);
  const src = fctx.getImageData(0, 0, full.width, full.height).data;
  let x0 = full.width;
  let y0 = full.height;
  let x1 = -1;
  let y1 = -1;
  let opaque = 0;
  for (let y = 0; y < full.height; y++) {
    for (let x = 0; x < full.width; x++) {
      if ((src[(y * full.width + x) * 4 + 3] ?? 0) < 24) continue;
      opaque++;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < x0) return null;
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  // How much to scale down so the painted part becomes area points of the 320×190 frame (the image is for the detailed frame, ×FULL_RES per side).
  const w = Math.max(1, Math.round(cw * Math.sqrt(area / opaque) * FULL_RES));
  const h = Math.max(1, Math.round((ch / cw) * w));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, x0, y0, cw, ch, 0, 0, w, h);
  const pixels = new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer.slice(0));
  // A semi-transparent edge becomes a dark outline: generated images keep the old background color at the edge (a green fringe).
  for (let i = 0; i < pixels.length; i++) {
    const a = (pixels[i] ?? 0) >>> 24;
    if (a > 0 && a < 220) pixels[i] = (a << 24) | 0x101214;
  }
  let muzzleX = 0;
  let muzzleY = 0;
  let best = Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((pixels[y * w + x] ?? 0) >>> 24 < 200) continue;
      if (x + y < best) {
        best = x + y;
        muzzleX = x;
        muzzleY = y;
      }
    }
  }
  return { pixels, w, h, muzzleX, muzzleY, scale: 1 };
}

function drawPicture(frame: Uint32Array, pic: WeaponPicture, pose: WeaponPose, bobX: number, bobY: number): void {
  const scale = pic.scale !== undefined ? (pic.scale * RES) / FULL_RES : Math.min(PICTURE_MAX_SCALE * RES, (PICTURE_WIDTH * RES) / pic.w, (PICTURE_HEIGHT * RES) / pic.h);
  const w = pic.w * scale;
  const h = pic.h * scale;
  // A shot pushes the weapon back (right and down), a melee blow is a forward thrust (left and up).
  const push = pose.melee ? -pose.recoil * 22 * RES : pose.recoil * 8 * RES;
  const left = Math.round(VIEW_W - w - 6 * RES + bobX + push);
  // The bottom goes slightly past the frame edge, so the weapon "sticks out" of the corner.
  const top = Math.round(VIEW_H - h * 0.88 - 10 * RES + pose.lowered * 70 * RES + bobY + push * 0.6);
  for (let y = 0; y < h; y++) {
    const py = top + y;
    if (py < 0 || py >= VIEW_H) continue;
    const sy = Math.min(pic.h - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const px = left + x;
      if (px < 0 || px >= VIEW_W) continue;
      const color = pic.pixels[sy * pic.w + Math.min(pic.w - 1, Math.floor(x / scale))] ?? 0;
      const alpha = color >>> 24;
      // Antialiased edge (images from the weapons folder): blend with the frame.
      if (alpha === 255) frame[py * VIEW_W + px] = color;
      else if (alpha > 12) frame[py * VIEW_W + px] = blend(frame[py * VIEW_W + px] ?? 0, color, alpha / 255);
    }
  }
  if (pose.flash && !pose.melee) {
    const kind = pose.flashKind ?? 'bullet';
    drawFlash(frame, left + pic.muzzleX * scale - 3 * RES, top + pic.muzzleY * scale, FLASH_COLORS[kind].size * RES, pose.walkTime * 13 + pose.recoil * 5, kind);
  }
}

export function drawWeapon(image: ImageData, pose: WeaponPose): void {
  const frame = new Uint32Array(image.data.buffer);
  // Offsets are in points of the 320×190 frame, multiplied by RES.
  const bobX = pose.moving ? Math.sin(pose.walkTime * 7) * 5 * RES : 0;
  const bobY = pose.moving ? Math.abs(Math.cos(pose.walkTime * 7)) * 4 * RES : 0;
  if (pose.picture !== undefined) {
    if (pose.picture) drawPicture(frame, pose.picture, pose, bobX, bobY);
    return;
  }
  const look = pose.look ?? 'pistol';
  const { art, scale, painted: smooth } = artOf(look);
  const melee = look === 'knife' || look === 'club' || look === 'spear' || look === 'fist';
  const w = art.w * scale;
  const h = art.h * scale;
  const left = Math.round(VIEW_W / 2 - w / 2 + 16 * RES + bobX);
  // The whole fist is in the frame, the sleeve goes past the bottom edge. A shot pushes the weapon down, a blow forward (up the screen).
  const kick = (melee ? -pose.recoil * 26 : pose.recoil * 10) * RES;
  const top = Math.round(VIEW_H - h + (10 + pose.lowered * 70 + (look === 'fist' && !smooth ? 12 : 0)) * RES + bobY + kick);
  for (let y = 0; y < h; y++) {
    const py = top + y;
    if (py < 0 || py >= VIEW_H) continue;
    for (let x = 0; x < w; x++) {
      const px = left + x;
      if (px < 0 || px >= VIEW_W) continue;
      const color = art.pixels[Math.floor(y / scale) * art.w + Math.floor(x / scale)] ?? 0;
      if (!color) continue;
      const alpha = color >>> 24;
      const i = py * VIEW_W + px;
      if (alpha === 255 || !smooth) frame[i] = color | 0xff000000;
      else if (alpha > 8) frame[i] = blend(frame[i] ?? 0, color, alpha / 255);
    }
  }
  if (pose.flash && !melee) {
    const kind = pose.flashKind ?? 'bullet';
    drawFlash(frame, left + w / 2, top + (art.muzzle ?? 0) * scale - 2 * RES, FLASH_COLORS[kind].size * RES, pose.walkTime * 13 + pose.recoil * 5, kind);
  }
}

/** Blend the frame color with the image color (antialiased edge). */
function blend(under: number, over: number, t: number): number {
  const ch = (shift: number) => Math.round(((under >>> shift) & 0xff) * (1 - t) + ((over >>> shift) & 0xff) * t);
  return (0xff << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
