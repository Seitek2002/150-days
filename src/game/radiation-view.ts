// Radiation on screen (src/game/radiation.ts decides what and how much): like a camera pointed at a radioactive object.
// Snow is fine noise across the frame; white spots are short flashes of particles (dots, short trail dashes, now and then a blurred spot);
// dead pixels stay lit in the same places all the time; yellowing makes the frame go yellow and fade.
// Drawn over the world view (with the weapon) but under the crosshair, compass and panel, so labels are always readable. When a window
// is open (pause, inventory, Pip-Boy, conversation…), it goes over the window (the client, 2026-10-25): as a separate transparent canvas over
// the whole game screen (layer in draw).
// Spots are small and there are no full-screen flashes (the flashing rule for photosensitive people); if the system
// has "reduce motion" on, the snow changes less often and there are fewer spots.
import type { RadiationLook } from './radiation.ts';
import { STUCK_MAX } from './radiation.ts';

/** A "camera" pixel is 2×2 screen points (the 320×190 world frame is scaled up twice). */
const CAM_PX = 2;
/** How many particle flashes per second at full spot strength. */
const SPARKS_PER_SECOND = 240;
/** How long a flash is visible (seconds): min and max. */
const SPARK_LIFE = { min: 0.05, max: 0.14 } as const;
/** With "reduce motion": the snow changes this many times per second, the spots are this fraction. */
const CALM_SNOW_FPS = 6;
const CALM_SPARKS = 0.35;
/** The color the frame shifts to, and how far (of yellowing 0–1). */
export const YELLOW_TINT = '#e8c020';
export const yellowShade = (yellow: number) => Math.min(1, yellow * 0.95);
/** Dead pixel colors: mostly white, the rest like a camera sensor. */
const STUCK_COLORS = ['#ffffff', '#ffffff', '#ffffff', '#fff6d0', '#ff4030', '#40ff60', '#50a0ff', '#ff60ff', '#60ffff'];

interface Spark {
  x: number;
  y: number;
  kind: 'dot' | 'streak' | 'blob';
  life: number;
  max: number;
  angle: number;
  size: number;
}

/** A predictable generator (mulberry32): dead pixels are always in the same places. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RadiationView {
  private noise: HTMLCanvasElement | null = null;
  private noiseData: ImageData | null = null;
  private sparks: Spark[] = [];
  private sparkCarry = 0;
  private snowWait = 0;
  /** Dead pixel positions as fractions of the frame (the first stuck ones are lit). */
  private readonly stuckAt: { x: number; y: number; color: string }[] = [];
  private readonly calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(seed = 150) {
    const rand = rng(seed);
    for (let i = 0; i < STUCK_MAX; i++) {
      this.stuckAt.push({ x: rand(), y: rand(), color: STUCK_COLORS[Math.floor(rand() * STUCK_COLORS.length)]! });
    }
  }

  /**
   * Draw over the world view (w × h screen points); dt is seconds since the last frame (0 means the spots do not change).
   * layer is the height of a separate transparent canvas over the windows (the whole game screen): it is blended onto the picture with "screen",
   * and its own layer shifts the frame color to yellow (YELLOW_TINT, yellowShade). Snow and spots cover the whole canvas, dead pixels
   * stay in their old places in the world view.
   */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, look: RadiationLook, dt: number, layer?: number): void {
    const full = layer ?? h;
    ctx.save();
    if (look.yellow > 0) this.drawYellow(ctx, w, full, look.yellow, layer === undefined);
    if (look.snow > 0) this.drawSnow(ctx, w, full, look.snow, dt);
    if (look.spots > 0 || this.sparks.length) this.drawSparks(ctx, w, full, look.spots, dt);
    else this.sparkCarry = 0;
    for (let i = 0; i < look.stuck; i++) {
      const p = this.stuckAt[i]!;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.floor((p.x * w) / CAM_PX) * CAM_PX, Math.floor((p.y * h) / CAM_PX) * CAM_PX, CAM_PX, CAM_PX);
    }
    ctx.restore();
  }

  /** Yellowing: the frame color shifts to yellow (brightness stays; tint is here too), shadows fade to yellow. */
  private drawYellow(ctx: CanvasRenderingContext2D, w: number, h: number, yellow: number, tint: boolean): void {
    if (tint) {
      ctx.globalCompositeOperation = 'color';
      ctx.globalAlpha = yellowShade(yellow);
      ctx.fillStyle = YELLOW_TINT;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = yellow * 0.38;
    ctx.fillStyle = '#b89000';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** Snow: random light "camera" dots across the frame, new ones every frame. */
  private drawSnow(ctx: CanvasRenderingContext2D, w: number, h: number, snow: number, dt: number): void {
    const cw = Math.ceil(w / CAM_PX);
    const ch = Math.ceil(h / CAM_PX);
    if (!this.noise || this.noise.width !== cw || this.noise.height !== ch) {
      this.noise = document.createElement('canvas');
      this.noise.width = cw;
      this.noise.height = ch;
      this.noiseData = new ImageData(cw, ch);
      this.snowWait = 0;
    }
    this.snowWait -= dt;
    if (this.snowWait <= 0) {
      this.snowWait = this.calm ? 1 / CALM_SNOW_FPS : 0;
      const px = new Uint32Array(this.noiseData!.data.buffer);
      const density = 0.05 + 0.3 * snow;
      for (let i = 0; i < px.length; i++) {
        const r = Math.random();
        if (r >= density) {
          px[i] = 0;
          continue;
        }
        const v = 110 + Math.floor((r / density) * 145);
        const a = 90 + Math.floor(Math.random() * 165);
        // ImageData byte order in memory: R, G, B, A (R is the lowest).
        px[i] = ((a << 24) | (v << 16) | (v << 8) | v) >>> 0;
      }
      this.noise.getContext('2d')!.putImageData(this.noiseData!, 0, 0);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.25 + 0.45 * snow;
    ctx.drawImage(this.noise, 0, 0, cw, ch, 0, 0, cw * CAM_PX, ch * CAM_PX);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** White spots: new flashes by spot strength, old ones fade over their short life. */
  private drawSparks(ctx: CanvasRenderingContext2D, w: number, h: number, spots: number, dt: number): void {
    this.sparkCarry += dt * SPARKS_PER_SECOND * spots * spots * (this.calm ? CALM_SPARKS : 1);
    for (; this.sparkCarry >= 1; this.sparkCarry--) {
      const r = Math.random();
      this.sparks.push({
        x: Math.random() * w,
        y: Math.random() * h,
        kind: r < 0.62 ? 'dot' : r < 0.93 ? 'streak' : 'blob',
        life: 0,
        max: SPARK_LIFE.min + Math.random() * (SPARK_LIFE.max - SPARK_LIFE.min),
        angle: Math.random() * Math.PI,
        size: Math.random(),
      });
    }
    ctx.globalCompositeOperation = 'lighter';
    const keep: Spark[] = [];
    for (const s of this.sparks) {
      s.life += dt;
      if (s.life >= s.max) continue;
      keep.push(s);
      const fade = 1 - s.life / s.max;
      const x = Math.floor(s.x / CAM_PX) * CAM_PX;
      const y = Math.floor(s.y / CAM_PX) * CAM_PX;
      if (s.kind === 'dot') {
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, CAM_PX, CAM_PX);
        if (s.size > 0.6) {
          // A bright particle gets a cross around it.
          ctx.globalAlpha = fade * 0.45;
          ctx.fillRect(x - CAM_PX, y, CAM_PX * 3, CAM_PX);
          ctx.fillRect(x, y - CAM_PX, CAM_PX, CAM_PX * 3);
        }
      } else if (s.kind === 'streak') {
        // A particle trail: a dash of 3–10 camera pixels.
        const len = (3 + s.size * 7) * CAM_PX;
        ctx.globalAlpha = fade * 0.85;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = CAM_PX;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(s.angle) * len, y + Math.sin(s.angle) * len);
        ctx.stroke();
      } else {
        // A spot: soft white, 3–7 camera pixels.
        const radius = (3 + s.size * 4) * CAM_PX;
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(0.35, 'rgba(255,255,245,0.45)');
        g.addColorStop(1, 'rgba(255,255,240,0)');
        ctx.globalAlpha = fade;
        ctx.fillStyle = g;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    }
    this.sparks = keep;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
