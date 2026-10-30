// Business signs on walls (Killian's store, the "Crash House", the "Skum Pitt" bar, the Hub's shops), as in the original:
// the scenery image comes from the player's copy. The original looks at the town from above and at an angle, so the sign is drawn skewed:
// the wall's verticals stay vertical on screen, while the horizontals slant: for walls along the plan's x steeply down to the right
// (12 points per 16), for walls along y gently up to the right (6 per 24) (hexToScreen in src/formats/map.ts). The original's camera
// sees the south and east sides of walls. So the slant of the image tells which side of the wall the sign hangs on, and
// straightened (by shifting columns) it is a flat plate: that is what we hang on our wall as a picture (LevelPanel with an image).
import type { SpriteFrame } from '../assets/sprites.ts';
import type { PanelPicture } from '../engine/cathedral-textures.ts';
import { blocksIn, type Level } from '../engine/level.ts';
import type { LevelPanel } from '../world/defs.ts';

/** Slant of wall horizontals on the original's screen (down is plus): for a wall along the plan's x and along y. */
const SLOPE_ALONG_X = 12 / 16;
const SLOPE_ALONG_Y = -6 / 24;

/** A straightened sign and the side of the wall it hung on in the original. */
export interface StraightSign {
  picture: PanelPicture;
  face: 'south' | 'east';
}

/** The median of slopes between edge points far from each other (neighboring letter points give a random slope). */
function medianSlope(points: [number, number][], minGap: number): number | null {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j]![0] - points[i]![0];
      if (dx >= minGap) slopes.push((points[j]![1] - points[i]![1]) / dx);
    }
  }
  if (slopes.length === 0) return null;
  slopes.sort((a, b) => a - b);
  return slopes[slopes.length >> 1]!;
}

/**
 * Straighten a sign: the slant is taken from the top and bottom edges of the image (median), and it also tells the wall side; columns
 * are shifted so the wall's horizontals become horizontal, and the width is stretched to the length of the slanted line (on the
 * original's screen the wall looks foreshortened). The image is by columns, like pictures on walls; extra empty edges are cropped.
 */
export function straightenSign(frame: SpriteFrame): StraightSign | null {
  const { width: w, height: h, pixels } = frame;
  const tops: [number, number][] = [];
  const bottoms: [number, number][] = [];
  for (let x = 0; x < w; x++) {
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < h; y++) {
      if (pixels[y * w + x] === 0) continue;
      if (top < 0) top = y;
      bottom = y;
    }
    if (top < 0) continue;
    tops.push([x, top]);
    bottoms.push([x, bottom]);
  }
  if (tops.length < 4) return null;
  const gap = Math.max(4, Math.floor(w / 5));
  const found = [medianSlope(tops, gap), medianSlope(bottoms, gap)].filter((s): s is number => s !== null);
  if (found.length === 0) return null;
  const measured = found.reduce((a, b) => a + b, 0) / found.length;
  const face = measured > (SLOPE_ALONG_X + SLOPE_ALONG_Y) / 2 ? 'south' : 'east';
  const s = face === 'south' ? SLOPE_ALONG_X : SLOPE_ALONG_Y;
  const stretch = Math.hypot(1, s);
  // Image point (x, y) → row y − s·x + lift of the straightened one (lift keeps rows from going above zero).
  const lift = s > 0 ? s * (w - 1) : 0;
  const tall = Math.ceil(h + Math.abs(s) * (w - 1));
  const wide = Math.max(1, Math.round(w * stretch));
  const full = new Uint32Array(wide * tall);
  let x0 = wide;
  let x1 = -1;
  let y0 = tall;
  let y1 = -1;
  for (let px = 0; px < wide; px++) {
    const sx = Math.min(w - 1, Math.floor((px + 0.5) / stretch));
    for (let py = 0; py < tall; py++) {
      const sy = Math.round(py + s * sx - lift);
      if (sy < 0 || sy >= h) continue;
      const color = pixels[sy * w + sx] ?? 0;
      if (color === 0) continue;
      full[px * tall + py] = color;
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      y0 = Math.min(y0, py);
      y1 = Math.max(y1, py);
    }
  }
  if (x1 < 0) return null;
  const pw = x1 - x0 + 1;
  const ph = y1 - y0 + 1;
  const out = new Uint32Array(pw * ph);
  for (let px = 0; px < pw; px++) out.set(full.subarray((x0 + px) * tall + y0, (x0 + px) * tall + y0 + ph), px * ph);
  return { picture: { w: pw, h: ph, pixels: out, glow: new Uint8Array(pw * ph) }, face };
}

/**
 * Sign size: an image point is this many cells (larger than critters: a sign must be readable from afar); no taller than
 * SIGN_MAX_HEIGHT floors (for posters taller than wide, POSTER_MAX_HEIGHT), no wider than the wall it hangs on.
 */
const SIGN_PIXEL = 1 / 45;
const SIGN_MAX_HEIGHT = 0.45;
const POSTER_MAX_HEIGHT = 0.62;
/** The top of the sign is a little below the top of a one-floor wall. */
const SIGN_TOP = 0.96;
/** On a roofed house (a wall two floors or taller with a street in front) the sign is larger and higher, at the roof edge, like on a facade. */
const ROOFED_TOP = 1.3;
const ROOFED_MAX_HEIGHT = 0.7;
/** How many cells from the original's location to look for a wall. */
const SIGN_REACH = 2.5;
/** A wall side inside a house (a roof over the floor) is worse than a street one: the original's signs hang outside. */
const INDOOR_PENALTY = 1;

/** Wall side and the offset from it toward the floor. */
const FACES = {
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  north: { dx: 0, dy: -1 },
  west: { dx: -1, dy: 0 },
} as const;
type Face = keyof typeof FACES;
/**
 * Which sides to try and how much worse each is (in cells of distance): its own (by the image slant), the opposite one
 * (our wall is thicker and the floor may be on the other side), the perpendicular ones: a flag sign sticks out of the wall crosswise, and its slant
 * follows its own plane.
 */
const FACE_CHOICE: Record<StraightSign['face'], [Face, number][]> = {
  south: [['south', 0], ['north', 0.5], ['east', 0.7], ['west', 0.9]],
  east: [['east', 0], ['west', 0.5], ['south', 0.7], ['north', 0.9]],
};

/**
 * Where to hang a sign near point at (the location in the original, cells): on the nearest wall side with floor in front of it (preferably
 * a street, preferably the side matching the image slant). Along the wall: in the same place as in the original, without going past the wall (up to a door,
 * corner, opening). null means no wall nearby.
 */
/** scale is a fraction of a shop sign's size (an emblem, a floor number, graffiti are at real size, half as small). */
export function signPanel(level: Level, at: { x: number; y: number }, sign: StraightSign, scale = 1): LevelPanel | null {
  let best: { face: Face; x: number; y: number; score: number } | null = null;
  for (const [face, worse] of FACE_CHOICE[sign.face]) {
    const found = nearestFace(level, at, face);
    if (found && (!best || found.score + worse < best.score)) best = { face, x: found.x, y: found.y, score: found.score + worse };
  }
  return best ? hang(level, at, sign, best.face, best.x, best.y, scale) : null;
}

/** Helpers for one side: the wall in a cell, the floor in front of it, the side line (for south and east, the far edge of the cell). */
function sideOf(level: Level, face: Face) {
  const { width, height } = level;
  const { dx, dy } = FACES[face];
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const isWall = (x: number, y: number) => inside(x, y) && level.walls[y * width + x] !== null && level.walls[y * width + x] !== 'forcefield';
  const isFloor = (x: number, y: number) => inside(x, y) && level.walls[y * width + x] === null && !level.doors.has(y * width + x);
  return {
    dx,
    dy,
    alongX: dx === 0,
    hangs: (x: number, y: number) => isWall(x, y) && isFloor(x + dx, y + dy),
    roofed: (x: number, y: number) => blocksIn(level, y * width + x).some((b) => (b.base ?? 0) >= 1),
    line: (x: number, y: number) => (dx !== 0 ? x + (dx > 0 ? 1 : 0) : y + (dy > 0 ? 1 : 0)),
  };
}

/** The wall cell nearest to at with this side over floor (no farther than SIGN_REACH): distance to the side and the house penalty. */
function nearestFace(level: Level, at: { x: number; y: number }, face: Face): { x: number; y: number; score: number } | null {
  const { dx, dy, alongX, hangs, roofed, line } = sideOf(level, face);
  let best: { x: number; y: number; score: number } | null = null;
  const cx = Math.floor(at.x);
  const cy = Math.floor(at.y);
  const r = Math.ceil(SIGN_REACH);
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!hangs(x, y)) continue;
      // Distance from the location in the original to the side segment.
      const off = alongX ? Math.max(0, x - at.x, at.x - (x + 1)) : Math.max(0, y - at.y, at.y - (y + 1));
      const across = alongX ? at.y - line(x, y) : at.x - line(x, y);
      const d = Math.hypot(off, across);
      if (d > SIGN_REACH) continue;
      const score = d + (roofed(x + dx, y + dy) ? INDOOR_PENALTY : 0);
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  return best;
}

/** The sign picture on side face of wall cell (x, y): size from the image, along the wall at the original's location. */
function hang(level: Level, at: { x: number; y: number }, sign: StraightSign, face: Face, x: number, y: number, scale: number): LevelPanel {
  const { dx, dy, alongX, hangs, roofed: covered, line } = sideOf(level, face);
  // Along the wall: a continuous piece of the same side where the sign fits.
  const [sx, sy] = alongX ? [1, 0] : [0, 1];
  let r0 = 0;
  while (r0 < 8 && hangs(x - sx * (r0 + 1), y - sy * (r0 + 1))) r0++;
  let r1 = 0;
  while (r1 < 8 && hangs(x + sx * (r1 + 1), y + sy * (r1 + 1))) r1++;
  const start = (alongX ? x : y) - r0;
  const end = (alongX ? x : y) + r1 + 1;
  const { w, h } = sign.picture;
  const place = (big: boolean): LevelPanel => {
    const limit = big ? ROOFED_MAX_HEIGHT : w >= h ? SIGN_MAX_HEIGHT : POSTER_MAX_HEIGHT;
    const top = big ? ROOFED_TOP : SIGN_TOP;
    const k = Math.min(SIGN_PIXEL * scale, limit / h, (end - start) / w);
    const half = (w * k) / 2;
    const mid = Math.min(end - half, Math.max(start + half, alongX ? at.x : at.y));
    return { face, at: line(x, y), a0: mid - half, a1: mid + half, from: top - h * k, to: top, image: sign.picture };
  };
  // Large only if the whole wall under the sign is two floors tall and there is street in front everywhere: under an awning or in a room the
  // sign above the ceiling is not visible, so it goes under it, as on a one-floor wall.
  const big = place(true);
  for (let a = Math.floor(big.a0); a < Math.ceil(big.a1); a++) {
    const [cx, cy] = alongX ? [a, y] : [x, a];
    if ((level.heights?.[cy * level.width + cx] ?? 0) < 2 || covered(cx + dx, cy + dy)) return place(false);
  }
  return big;
}