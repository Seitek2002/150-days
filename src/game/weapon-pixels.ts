// Our own weapon in hand: first-person pixel art (our drawing, in code): at the bottom right of the frame, front toward the crosshair,
// no hand. The shape is defined by geometry (blade, guard, handle), laid out in points with a limited palette
// with shading, a dark outline along the edge. Shown at an integer scale (crisp points). With no drawing of our own for a
// weapon type, the hand holds the inventory image from the player's copy (weapon-view.ts).
import type { WeaponLook, WeaponPicture } from './weapon-view.ts';

const rgb = (r: number, g: number, b: number) => (0xff << 24) | (b << 16) | (g << 8) | r;

/** Palette: steel (from shadow to highlight), brass of the guard, leather of the handle, outline. */
const STEEL = [rgb(46, 50, 56), rgb(78, 84, 92), rgb(118, 124, 132), rgb(160, 166, 172), rgb(206, 210, 214), rgb(240, 242, 236)];
const BRASS = [rgb(70, 52, 26), rgb(122, 92, 44), rgb(176, 138, 70), rgb(222, 190, 112)];
const LEATHER = [rgb(36, 24, 16), rgb(62, 42, 26), rgb(92, 64, 40), rgb(122, 88, 56)];
const OUTLINE = rgb(16, 14, 12);

/** Our own image: points, size, where the muzzle is (not needed for a knife) and the scale in the frame. */
export interface OwnPicture extends WeaponPicture {
  scale: number;
}

const pick = (palette: number[], t: number) => palette[Math.max(0, Math.min(palette.length - 1, Math.round(t * (palette.length - 1))))]!;

/**
 * Knife: a blade curving toward the point, going from the bottom right corner up and to the left toward the crosshair; along the spine a shadow, along the
 * cutting edge a highlight, a fuller along the blade; a brass guard across; the leather-wrapped handle goes off the edge.
 */
function knife(): OwnPicture {
  const W = 76;
  const H = 76;
  const pixels = new Uint32Array(W * H);
  // Knife axis: from the guard (base) to the point (tip); across it n (toward the spine).
  const base = { x: 50, y: 52 };
  const tip = { x: 6, y: 7 };
  const L = Math.hypot(tip.x - base.x, tip.y - base.y);
  const ax = (tip.x - base.x) / L;
  const ay = (tip.y - base.y) / L;
  // Perpendicular: the spine up and to the right, the edge down and to the left.
  const nx = -ay;
  const ny = ax;
  const BLADE = 7.5;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 - base.x;
      const py = y + 0.5 - base.y;
      const t = px * ax + py * ay;
      const s = px * nx + py * ny;
      const u = t / L;
      let color = 0;
      if (t >= 0 && t <= L) {
        // The spine is almost straight, the edge curves toward the point.
        const spine = BLADE * 0.55 * (1 - Math.pow(u, 3));
        const edge = BLADE * (1 - Math.pow(u, 1.7)) * (1 + 0.15 * Math.sin(u * Math.PI));
        if (s <= spine && s >= -edge) {
          // Tone across the blade: lighter at the edge (light from the top left falls on the bevel), darker at the spine.
          const across = (spine - s) / (spine + edge || 1);
          let tone = 0.35 + across * 0.55 - u * 0.1;
          if (-edge + 1.2 > s) tone = 1; // cutting edge: highlight
          if (spine - s < 1.1) tone = 0.12; // spine: shadow
          // Fuller along the blade.
          if (u > 0.08 && u < 0.55 && Math.abs(s - spine * 0.15) < 0.7) tone = 0.2;
          color = pick(STEEL, tone);
        }
      } else if (t < 0 && t >= -3.5) {
        // Guard across.
        if (Math.abs(s) < BLADE * 1.55) {
          const tone = 0.85 - (t + 3.5) / 3.5 * 0.5 - (s > 0 ? 0.25 : 0);
          color = pick(BRASS, tone);
        }
      } else if (t < -3.5) {
        // Handle: leather wrapping in stripes, light from above.
        if (Math.abs(s) < 5.2) {
          const band = (((-t - 3.5) % 5) + 5) % 5 < 1.3;
          const tone = (0.75 - (s + 5.2) / 10.4 * 0.6) * (band ? 0.45 : 1);
          color = pick(LEATHER, tone);
        }
      }
      pixels[y * W + x] = color;
    }
  }
  // Outline: a transparent point next to an opaque one becomes dark.
  const outlined = pixels.slice();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (pixels[y * W + x]) continue;
      const near = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const qx = x + dx!;
        const qy = y + dy!;
        return qx >= 0 && qy >= 0 && qx < W && qy < H && pixels[qy * W + qx] !== 0;
      });
      if (near) outlined[y * W + x] = OUTLINE;
    }
  }
  // Scale 2 (was 3): at triple the knife took up a third of the frame and looked bigger than the pistol (night 15).
  return { pixels: outlined, w: W, h: H, muzzleX: tip.x, muzzleY: tip.y, scale: 2 };
}

const PAINTERS: Partial<Record<WeaponLook, () => OwnPicture>> = { knife };
const cache = new Map<WeaponLook, OwnPicture>();

/** Our own image for a weapon type; none means null (then the inventory image). */
export function ownPicture(look: WeaponLook): OwnPicture | null {
  const paint = PAINTERS[look];
  if (!paint) return null;
  let pic = cache.get(look);
  if (!pic) {
    pic = paint();
    cache.set(look, pic);
  }
  return pic;
}
