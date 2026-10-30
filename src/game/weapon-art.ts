// The weapon in hand, drawn in code on a canvas (our own drawing, not from Fallout): smooth shapes, light from the top left,
// a dark outline so it reads on any background. Sizes are in points of the detailed frame (640×380).
// Without a canvas (tests in Node) it is null, and the simple drawing from weapon-view.ts remains.
import type { WeaponLook } from './weapon-view.ts';

export interface Art {
  /** ABGR, like the frame; alpha in the high byte (edges antialiased). */
  pixels: Uint32Array;
  w: number;
  h: number;
  /** Where the muzzle is (image row): the muzzle flash goes there. */
  muzzle?: number;
}

/** The image is drawn at half size and shown enlarged, so its points are the same size as walls up close. */
export const ART_SCALE = 2;

type Ctx = CanvasRenderingContext2D;

const OUTLINE = '#141210';

/** Metal: dark edges, light middle (a cylinder or a beveled face). */
function metal(ctx: Ctx, x0: number, x1: number, dark = '#1e2024', mid = '#5d6168', light = '#9a9ea6'): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, dark);
  g.addColorStop(0.3, mid);
  g.addColorStop(0.45, light);
  g.addColorStop(0.7, mid);
  g.addColorStop(1, dark);
  return g;
}

/** Skin: light from the top left. */
function skin(ctx: Ctx, cx: number, cy: number, r: number): CanvasGradient {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.15);
  g.addColorStop(0, '#e8bb94');
  g.addColorStop(0.55, '#c08a64');
  g.addColorStop(1, '#7a4c34');
  return g;
}

function outline(ctx: Ctx, width = 2): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = OUTLINE;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** Jacket sleeve (grey-green, with folds): from the bottom edge to the wrist. */
function sleeve(ctx: Ctx, cx: number, top: number, wTop: number, wBottom: number, h: number, tilt = 0): void {
  const g = ctx.createLinearGradient(cx - wBottom / 2, 0, cx + wBottom / 2, 0);
  g.addColorStop(0, '#272b21');
  g.addColorStop(0.3, '#5a614d');
  g.addColorStop(0.55, '#4b5140');
  g.addColorStop(1, '#22261d');
  ctx.beginPath();
  ctx.moveTo(cx - wBottom / 2, h + 4);
  ctx.lineTo(cx - wTop / 2 + tilt, top);
  ctx.quadraticCurveTo(cx + tilt, top - 10, cx + wTop / 2 + tilt, top);
  ctx.lineTo(cx + wBottom / 2, h + 4);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  outline(ctx, 2.5);
  // Fabric folds.
  ctx.strokeStyle = 'rgba(20, 22, 16, 0.55)';
  ctx.lineWidth = 2;
  for (const [dx, len] of [
    [-0.22, 0.5],
    [0.08, 0.35],
    [0.3, 0.45],
  ] as const) {
    ctx.beginPath();
    const x = cx + dx * wBottom;
    ctx.moveTo(x, h);
    ctx.quadraticCurveTo(x + 6, h - (h - top) * len * 0.5, x + tilt * len - 2, h - (h - top) * len);
    ctx.stroke();
  }
  // Cuff.
  ctx.beginPath();
  ctx.moveTo(cx - wTop / 2 + tilt + 2, top + 12);
  ctx.quadraticCurveTo(cx + tilt, top + 2, cx + wTop / 2 + tilt - 2, top + 12);
  ctx.strokeStyle = 'rgba(16, 18, 13, 0.7)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

/** A fist gripping the handle: the back of the hand, the thumb on the left, the fingertips on the right. */
function gripHand(ctx: Ctx, cx: number, cy: number, s = 1): void {
  // Wrist.
  ctx.beginPath();
  ctx.moveTo(cx - 30 * s, cy + 20 * s);
  ctx.lineTo(cx - 34 * s, cy + 70 * s);
  ctx.lineTo(cx + 36 * s, cy + 70 * s);
  ctx.lineTo(cx + 34 * s, cy + 20 * s);
  ctx.closePath();
  ctx.fillStyle = skin(ctx, cx, cy + 40 * s, 40 * s);
  ctx.fill();
  outline(ctx);
  // Fingers on the right gripping the handle from the front: three phalanges.
  for (let i = 0; i < 3; i++) {
    const fy = cy - 14 * s + i * 17 * s;
    ctx.beginPath();
    ctx.ellipse(cx + 36 * s, fy, 11 * s, 8 * s, 0.35, 0, Math.PI * 2);
    ctx.fillStyle = skin(ctx, cx + 34 * s, fy, 13 * s);
    ctx.fill();
    outline(ctx, 1.8);
  }
  // Back of the hand.
  // Back of the hand: wide at the knuckles, narrowing toward the wrist.
  ctx.beginPath();
  ctx.moveTo(cx - 28 * s, cy + 34 * s);
  ctx.quadraticCurveTo(cx - 40 * s, cy + 6 * s, cx - 34 * s, cy - 18 * s);
  ctx.quadraticCurveTo(cx - 28 * s, cy - 30 * s, cx - 10 * s, cy - 28 * s);
  ctx.lineTo(cx + 26 * s, cy - 24 * s);
  ctx.quadraticCurveTo(cx + 40 * s, cy - 20 * s, cx + 40 * s, cy - 2 * s);
  ctx.quadraticCurveTo(cx + 40 * s, cy + 20 * s, cx + 30 * s, cy + 34 * s);
  ctx.closePath();
  ctx.fillStyle = skin(ctx, cx, cy - 4 * s, 40 * s);
  ctx.fill();
  outline(ctx);
  // Knuckles side by side along the top edge and tendons from them to the wrist.
  for (let i = 0; i < 4; i++) {
    const kx = cx + (-16 + i * 13) * s;
    const ky = cy - 22 * s + i * 0.8 * s;
    ctx.beginPath();
    ctx.ellipse(kx, ky, 6 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(242, 204, 172, 0.55)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(kx, ky + 5 * s);
    ctx.quadraticCurveTo(kx + 1 * s, cy + 8 * s, cx + (-6 + i * 4) * s, cy + 30 * s);
    ctx.strokeStyle = 'rgba(120, 76, 52, 0.35)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  // Thumb on the left, forward along the weapon.
  ctx.beginPath();
  ctx.ellipse(cx - 30 * s, cy - 16 * s, 9 * s, 23 * s, 0.3, 0, Math.PI * 2);
  ctx.fillStyle = skin(ctx, cx - 30 * s, cy - 18 * s, 22 * s);
  ctx.fill();
  outline(ctx);
  // Thumbnail.
  ctx.beginPath();
  ctx.ellipse(cx - 37 * s, cy - 34 * s, 4 * s, 6 * s, 0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(214, 170, 146, 0.9)';
  ctx.fill();
}

/** Pistol: seen from behind and above, the slide runs forward to the crosshair. glow is the ring color for laser and plasma. */
function pistol(ctx: Ctx, w: number, h: number, glow?: string): void {
  const cx = w / 2;
  sleeve(ctx, cx + 4, h - 54, 82, 120, h);
  // Slide: the near edge wide, the far one narrow (it recedes toward the screen center).
  const near = h - 112;
  const far = near - 78;
  ctx.beginPath();
  ctx.moveTo(cx - 30, near);
  ctx.lineTo(cx - 19, far);
  ctx.lineTo(cx + 19, far);
  ctx.lineTo(cx + 30, near);
  ctx.closePath();
  ctx.fillStyle = glow ? metal(ctx, cx - 30, cx + 30, '#3a3c40', '#a9aba6', '#d6d6cf') : metal(ctx, cx - 30, cx + 30);
  ctx.fill();
  outline(ctx);
  if (glow) rings(ctx, cx, near, far, 30, 19, glow);
  // Ejection port on the right and a slot along the slide.
  ctx.fillStyle = '#16171a';
  ctx.beginPath();
  ctx.moveTo(cx + 8, near - 52);
  ctx.lineTo(cx + 16, near - 52);
  ctx.lineTo(cx + 16, near - 30);
  ctx.lineTo(cx + 8, near - 30);
  ctx.fill();
  ctx.strokeStyle = 'rgba(10, 10, 12, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, near - 4);
  ctx.lineTo(cx, far + 8);
  ctx.stroke();
  // Front sight at the far end.
  ctx.fillStyle = '#2b2d31';
  ctx.fillRect(cx - 2.5, far - 8, 5, 10);
  // Back face of the slide with serrations and the rear sight.
  ctx.beginPath();
  ctx.rect(cx - 30, near, 60, 22);
  ctx.fillStyle = metal(ctx, cx - 30, cx + 30, '#17181b', '#3d4046', '#5e626a');
  ctx.fill();
  outline(ctx);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - 26, near + 5 + i * 4);
    ctx.lineTo(cx + 26, near + 5 + i * 4);
    ctx.stroke();
  }
  ctx.fillStyle = '#1c1d20';
  ctx.fillRect(cx - 24, near - 10, 10, 12);
  ctx.fillRect(cx + 14, near - 10, 10, 12);
  // Hammer.
  ctx.fillStyle = '#26282c';
  ctx.fillRect(cx - 6, near + 20, 12, 10);
  // Grip in the fist.
  ctx.beginPath();
  ctx.rect(cx - 24, near + 22, 48, 30);
  ctx.fillStyle = '#2a2420';
  ctx.fill();
  gripHand(ctx, cx + 2, h - 62);
}

/**
 * Long gun: the receiver at the hand, a long handguard and barrel toward the crosshair, the left hand under the handguard. kind: rifle,
 * shotgun (thick barrel with a magazine tube under it, pump handguard) or energy (light body, glowing rings).
 */
function rifle(ctx: Ctx, w: number, h: number, kind: 'rifle' | 'shotgun' | 'energy' = 'rifle', glow = '#ff4030'): void {
  const cx = w / 2;
  sleeve(ctx, cx + 30, h - 50, 80, 124, h, -6);
  // Barrel: recedes toward the screen center; thicker on the shotgun, with the magazine tube under it.
  const near = h - 104;
  const bw = kind === 'shotgun' ? 13 : kind === 'energy' ? 11 : 9;
  if (kind === 'shotgun') wedge(ctx, cx, near - 60, 22, 9, 5, metal(ctx, cx - 9, cx + 9, '#151618', '#3a3d42', '#62666d'), 8);
  wedge(ctx, cx, near - 60, 6, bw, bw * 0.5, kind === 'energy' ? metal(ctx, cx - bw, cx + bw, '#3a3c40', '#a9aba6', '#d6d6cf') : metal(ctx, cx - bw, cx + bw));
  if (kind === 'energy') {
    rings(ctx, cx, near - 60, 6, bw, bw * 0.5, glow);
    ctx.beginPath();
    ctx.ellipse(cx, 8, bw * 0.45, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
  } else {
    ctx.fillStyle = '#2b2d31';
    ctx.fillRect(cx - 2.5, 0, 5, 12);
  }
  // Handguard: wood; on the shotgun a ribbed pump; on the energy weapon a metal shroud.
  ctx.beginPath();
  ctx.moveTo(cx - 26, near + 6);
  ctx.lineTo(cx - 13, near - 96);
  ctx.lineTo(cx + 13, near - 96);
  ctx.lineTo(cx + 26, near + 6);
  ctx.closePath();
  const wood = ctx.createLinearGradient(cx - 26, 0, cx + 26, 0);
  wood.addColorStop(0, '#2c1a0e');
  wood.addColorStop(0.35, '#6e4426');
  wood.addColorStop(0.5, '#8a5a34');
  wood.addColorStop(1, '#2a180c');
  ctx.fillStyle = kind === 'energy' ? metal(ctx, cx - 26, cx + 26, '#2e3034', '#8c8e8a', '#bdbdb5') : wood;
  ctx.fill();
  outline(ctx);
  if (kind === 'shotgun') {
    ctx.strokeStyle = 'rgba(20, 12, 6, 0.7)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      const y = near + 6 - i * 17;
      const half = 26 - (13 * i * 17) / 102;
      ctx.beginPath();
      ctx.moveTo(cx - half + 2, y);
      ctx.lineTo(cx + half - 2, y);
      ctx.stroke();
    }
  }
  // Receiver at the hand.
  ctx.beginPath();
  ctx.moveTo(cx - 32, h - 40);
  ctx.lineTo(cx - 28, near);
  ctx.lineTo(cx + 28, near);
  ctx.lineTo(cx + 32, h - 40);
  ctx.closePath();
  ctx.fillStyle = metal(ctx, cx - 32, cx + 32, '#16171a', '#43464c', '#6f737b');
  ctx.fill();
  outline(ctx);
  ctx.fillStyle = '#121315';
  ctx.fillRect(cx - 5, near + 6, 10, 18);
  // Left hand below the handguard (the fingers gripping it are visible).
  for (let i = 0; i < 3; i++) {
    const fx = cx - 30 + i * 4;
    const fy = near - 46 + i * 14;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 9, 7, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = skin(ctx, fx, fy, 10);
    ctx.fill();
    outline(ctx, 1.6);
  }
  gripHand(ctx, cx + 30, h - 44, 0.9);
}

/** Knife: the blade above the fist, the guard, the handle in the fist. */
function knife(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  sleeve(ctx, cx + 4, h - 50, 82, 120, h);
  const base = h - 120;
  // Blade: spine on the left, cutting edge on the right, point at the top.
  ctx.beginPath();
  ctx.moveTo(cx - 10, base);
  ctx.lineTo(cx - 9, 40);
  ctx.quadraticCurveTo(cx - 4, 14, cx + 6, 4);
  ctx.quadraticCurveTo(cx + 14, 40, cx + 12, base);
  ctx.closePath();
  const steel = ctx.createLinearGradient(cx - 10, 0, cx + 14, 0);
  steel.addColorStop(0, '#4a4e55');
  steel.addColorStop(0.4, '#b9bdc4');
  steel.addColorStop(0.75, '#e6e9ee');
  steel.addColorStop(1, '#7c8088');
  ctx.fillStyle = steel;
  ctx.fill();
  outline(ctx);
  // Blade fuller.
  ctx.strokeStyle = 'rgba(60, 64, 70, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 3, base - 6);
  ctx.lineTo(cx - 2, 48);
  ctx.stroke();
  // Guard.
  ctx.beginPath();
  ctx.rect(cx - 26, base, 52, 10);
  ctx.fillStyle = metal(ctx, cx - 26, cx + 26, '#1c1d20', '#55585e', '#8a8e95');
  ctx.fill();
  outline(ctx);
  ctx.beginPath();
  ctx.rect(cx - 12, base + 10, 24, 30);
  ctx.fillStyle = '#2a1d14';
  ctx.fill();
  gripHand(ctx, cx + 2, h - 66);
}

/** Spear: a shaft with a wrapping, an iron head at the top. */
function spear(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  sleeve(ctx, cx + 4, h - 50, 82, 120, h);
  const wood = ctx.createLinearGradient(cx - 9, 0, cx + 9, 0);
  wood.addColorStop(0, '#2c1a0e');
  wood.addColorStop(0.45, '#8a5a34');
  wood.addColorStop(1, '#2a180c');
  ctx.beginPath();
  ctx.moveTo(cx - 9, h - 60);
  ctx.lineTo(cx - 5, 64);
  ctx.lineTo(cx + 5, 64);
  ctx.lineTo(cx + 9, h - 60);
  ctx.closePath();
  ctx.fillStyle = wood;
  ctx.fill();
  outline(ctx);
  // Wrapping at the head.
  ctx.strokeStyle = '#5a4a36';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - 6, 74 + i * 6);
    ctx.lineTo(cx + 6, 70 + i * 6);
    ctx.stroke();
  }
  // Head.
  ctx.beginPath();
  ctx.moveTo(cx - 11, 70);
  ctx.lineTo(cx, 0);
  ctx.lineTo(cx + 11, 70);
  ctx.quadraticCurveTo(cx, 78, cx - 11, 70);
  ctx.closePath();
  ctx.fillStyle = metal(ctx, cx - 11, cx + 11, '#3a3d42', '#9a9ea6', '#d8dbe0');
  ctx.fill();
  outline(ctx);
  gripHand(ctx, cx + 2, h - 66);
}

/** Empty fist: knuckles forward. */
function fist(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  sleeve(ctx, cx + 4, h - 40, 84, 124, h);
  const cy = h - 70;
  // Knuckles: four bumps on top.
  for (let i = 0; i < 4; i++) {
    const kx = cx - 27 + i * 18;
    const ky = cy - 34 + Math.abs(i - 1.5) * 4;
    ctx.beginPath();
    ctx.ellipse(kx, ky, 12, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = skin(ctx, kx, ky, 14);
    ctx.fill();
    outline(ctx, 1.8);
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy, 42, 36, 0, 0, Math.PI * 2);
  ctx.fillStyle = skin(ctx, cx, cy, 42);
  ctx.fill();
  outline(ctx);
  // Bent fingers: lines between them.
  ctx.strokeStyle = 'rgba(90, 52, 34, 0.7)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    const x = cx - 36 + i * 18;
    ctx.beginPath();
    ctx.moveTo(x, cy - 38);
    ctx.lineTo(x + 2, cy - 14);
    ctx.stroke();
  }
  // Thumb across the bottom.
  ctx.beginPath();
  ctx.ellipse(cx - 6, cy + 4, 30, 10, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = skin(ctx, cx - 6, cy + 4, 24);
  ctx.fill();
  outline(ctx, 1.8);
}

/** A trapezoid "toward the crosshair": near edge near with width 2·wNear, far edge far with width 2·wFar. */
function wedge(ctx: Ctx, cx: number, near: number, far: number, wNear: number, wFar: number, fill: CanvasGradient | string, dx = 0): void {
  ctx.beginPath();
  ctx.moveTo(cx - wNear, near + dx);
  ctx.lineTo(cx - wFar, far + dx);
  ctx.lineTo(cx + wFar, far + dx);
  ctx.lineTo(cx + wNear, near + dx);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  outline(ctx);
}

/** Glowing rings across an energy weapon. */
function rings(ctx: Ctx, cx: number, near: number, far: number, wNear: number, wFar: number, glow: string): void {
  for (const t of [0.25, 0.5, 0.75]) {
    const y = near + (far - near) * t;
    const half = wNear + (wFar - wNear) * t;
    ctx.fillStyle = glow;
    ctx.fillRect(cx - half + 1, y - 2, half * 2 - 2, 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(cx - half * 0.5, y - 1, half, 1.5);
  }
}

/** Submachine gun: a wide short body, the magazine down and to the left, the barrel in a perforated shroud. */
function smg(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  sleeve(ctx, cx + 4, h - 54, 82, 120, h);
  const near = h - 112;
  // Magazine: from the body down and to the left.
  ctx.save();
  ctx.translate(cx - 26, near - 30);
  ctx.rotate(-0.55);
  ctx.beginPath();
  ctx.rect(-9, 0, 18, 66);
  ctx.fillStyle = metal(ctx, -9, 9, '#121315', '#34373c', '#50545a');
  ctx.fill();
  outline(ctx);
  ctx.restore();
  // Barrel shroud with holes.
  wedge(ctx, cx, near - 48, near - 104, 14, 9, metal(ctx, cx - 14, cx + 14, '#141517', '#3c3f44', '#62666c'));
  ctx.fillStyle = '#0c0c0d';
  for (let i = 0; i < 4; i++) {
    const y = near - 58 - i * 12;
    ctx.beginPath();
    ctx.ellipse(cx, y, 4 - i * 0.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Body.
  wedge(ctx, cx, near, near - 50, 34, 25, metal(ctx, cx - 34, cx + 34));
  ctx.fillStyle = '#16171a';
  ctx.fillRect(cx + 10, near - 40, 9, 22);
  // Back face with the rear sight.
  ctx.beginPath();
  ctx.rect(cx - 34, near, 68, 20);
  ctx.fillStyle = metal(ctx, cx - 34, cx + 34, '#17181b', '#3d4046', '#5e626a');
  ctx.fill();
  outline(ctx);
  ctx.fillStyle = '#1c1d20';
  ctx.fillRect(cx - 6, near - 12, 12, 13);
  ctx.beginPath();
  ctx.rect(cx - 24, near + 20, 48, 30);
  ctx.fillStyle = '#2a2420';
  ctx.fill();
  gripHand(ctx, cx + 2, h - 62);
}

/** Heavy weapons: flamer is a thick body and a nozzle; minigun is six barrels in a circle; rocket launcher is a wide tube. */
function heavy(ctx: Ctx, w: number, h: number, kind: 'flamer' | 'minigun' | 'rocket'): void {
  const cx = w / 2;
  sleeve(ctx, cx + 50, h - 60, 86, 130, h, -8);
  sleeve(ctx, cx - 70, h - 40, 76, 116, h, 10);
  const near = h - 70;
  if (kind === 'rocket') {
    const olive = metal(ctx, cx - 56, cx + 56, '#1e2216', '#5a6440', '#7d8858');
    wedge(ctx, cx, near + 40, 40, 56, 36, olive);
    ctx.beginPath();
    ctx.ellipse(cx, 40, 34, 11, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0b08';
    ctx.fill();
    outline(ctx);
    // Sight on the left and stripes.
    ctx.beginPath();
    ctx.rect(cx - 70, near - 70, 16, 34);
    ctx.fillStyle = '#26281f';
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = 'rgba(210, 180, 60, 0.85)';
    ctx.fillRect(cx - 50, near - 10, 100, 6);
  } else if (kind === 'minigun') {
    // Six barrels: from the near circle to the far one (they converge toward the crosshair).
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const nx = cx + Math.cos(a) * 26;
      const ny = near - 40 + Math.sin(a) * 12;
      const fx = cx + Math.cos(a) * 10;
      const fy = 30 + Math.sin(a) * 4;
      ctx.beginPath();
      ctx.moveTo(nx - 6, ny);
      ctx.lineTo(fx - 3, fy);
      ctx.lineTo(fx + 3, fy);
      ctx.lineTo(nx + 6, ny);
      ctx.closePath();
      ctx.fillStyle = metal(ctx, nx - 6, nx + 6, '#141517', '#4a4d52', '#8a8e95');
      ctx.fill();
      outline(ctx, 1.5);
    }
    ctx.beginPath();
    ctx.ellipse(cx, 34, 16, 6, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#2a2c30';
    ctx.lineWidth = 4;
    ctx.stroke();
    wedge(ctx, cx, near + 50, near - 30, 60, 46, metal(ctx, cx - 60, cx + 60, '#121315', '#3d4046', '#666a72'));
  } else {
    // Flamer: nozzle, thick body, tank.
    wedge(ctx, cx, near - 40, 30, 14, 9, metal(ctx, cx - 14, cx + 14, '#151618', '#4c4f55', '#7a7e86'));
    ctx.beginPath();
    ctx.ellipse(cx, 30, 9, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0a';
    ctx.fill();
    wedge(ctx, cx, near + 50, near - 40, 52, 34, metal(ctx, cx - 52, cx + 52, '#2a1a10', '#8a5a2c', '#b07a40'));
    ctx.fillStyle = 'rgba(30, 20, 10, 0.7)';
    ctx.fillRect(cx - 40, near - 10, 80, 5);
  }
  gripHand(ctx, cx + 50, h - 40, 0.9);
}

/** Club or sledgehammer: the handle up out of the fist, a heavy head. */
function club(ctx: Ctx, w: number, h: number): void {
  const cx = w / 2;
  sleeve(ctx, cx + 4, h - 50, 82, 120, h);
  const wood = ctx.createLinearGradient(cx - 8, 0, cx + 8, 0);
  wood.addColorStop(0, '#2c1a0e');
  wood.addColorStop(0.45, '#8a5a34');
  wood.addColorStop(1, '#2a180c');
  wedge(ctx, cx, h - 60, 70, 8, 5, wood);
  // Head: a bar of metal across.
  ctx.beginPath();
  ctx.moveTo(cx - 40, 74);
  ctx.lineTo(cx - 34, 30);
  ctx.lineTo(cx + 34, 30);
  ctx.lineTo(cx + 40, 74);
  ctx.closePath();
  ctx.fillStyle = metal(ctx, cx - 40, cx + 40, '#1a1b1e', '#55585e', '#8a8e95');
  ctx.fill();
  outline(ctx);
  ctx.beginPath();
  ctx.rect(cx - 40, 74, 80, 12);
  ctx.fillStyle = '#2a2c30';
  ctx.fill();
  outline(ctx);
  gripHand(ctx, cx + 2, h - 66);
}

/** Image size (in points of the detailed frame), the painter and where the muzzle is. */
const PAINTERS: Record<WeaponLook, { w: number; h: number; paint: (ctx: Ctx, w: number, h: number) => void; muzzle?: number }> = {
  pistol: { w: 200, h: 250, paint: (c, w, h) => pistol(c, w, h), muzzle: 50 },
  laserPistol: { w: 200, h: 250, paint: (c, w, h) => pistol(c, w, h, '#ff4a30'), muzzle: 50 },
  plasmaPistol: { w: 200, h: 250, paint: (c, w, h) => pistol(c, w, h, '#60ff70'), muzzle: 50 },
  smg: { w: 200, h: 250, paint: smg, muzzle: 34 },
  rifle: { w: 230, h: 300, paint: (c, w, h) => rifle(c, w, h), muzzle: 4 },
  shotgun: { w: 230, h: 300, paint: (c, w, h) => rifle(c, w, h, 'shotgun'), muzzle: 4 },
  laserRifle: { w: 230, h: 300, paint: (c, w, h) => rifle(c, w, h, 'energy', '#ff4a30'), muzzle: 6 },
  plasmaRifle: { w: 230, h: 300, paint: (c, w, h) => rifle(c, w, h, 'energy', '#60ff70'), muzzle: 6 },
  flamer: { w: 280, h: 260, paint: (c, w, h) => heavy(c, w, h, 'flamer'), muzzle: 30 },
  minigun: { w: 280, h: 260, paint: (c, w, h) => heavy(c, w, h, 'minigun'), muzzle: 32 },
  rocket: { w: 280, h: 260, paint: (c, w, h) => heavy(c, w, h, 'rocket'), muzzle: 40 },
  knife: { w: 200, h: 250, paint: knife },
  club: { w: 200, h: 260, paint: club },
  spear: { w: 200, h: 300, paint: spear },
  fist: { w: 200, h: 200, paint: fist },
};

/** Draw the weapon on a canvas (at half size, with grain like worn metal and skin); without a canvas (tests), null. */
export function paintWeapon(look: WeaponLook): Art | null {
  if (typeof document === 'undefined') return null;
  const { w, h, paint, muzzle } = PAINTERS[look];
  const cw = Math.ceil(w / ART_SCALE);
  const ch = Math.ceil(h / ART_SCALE);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(1 / ART_SCALE, 1 / ART_SCALE);
  paint(ctx, w, h);
  const pixels = new Uint32Array(ctx.getImageData(0, 0, cw, ch).data.buffer.slice(0));
  // Grain: each point a little lighter or darker (the same on every run).
  let seed = 12345;
  for (let i = 0; i < pixels.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const c = pixels[i] ?? 0;
    if (c >>> 24 === 0) continue;
    const k = 0.9 + (seed / 0x100000000) * 0.2;
    const r = Math.min(255, Math.round((c & 0xff) * k));
    const g = Math.min(255, Math.round(((c >>> 8) & 0xff) * k));
    const b = Math.min(255, Math.round(((c >>> 16) & 0xff) * k));
    pixels[i] = (c & 0xff000000) | (b << 16) | (g << 8) | r;
  }
  return { pixels, w: cw, h: ch, muzzle: muzzle === undefined ? undefined : muzzle / ART_SCALE };
}
