// Compass at the top of the screen in the wasteland and in locations (client decision): cardinal directions and the travel target with distance.
// Our own window (not a Fallout image) — in the same font as the action hints.
import { t, tf } from '../i18n.ts';

/** Strip width and how many degrees it shows (90° to each side of the gaze). */
const WIDTH = 260;
const HALF_SPAN = Math.PI / 2;
const TOP = 6;
const HEIGHT = 18;

export interface CompassTarget {
  name: string;
  /** Direction to the target in our world (0 — east, π/2 — south). */
  bearing: number;
  km: number;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Draw the compass: angle — where the hero is looking. */
export function drawCompass(ctx: CanvasRenderingContext2D, screenWidth: number, angle: number, target: CompassTarget | null): void {
  const left = Math.round((screenWidth - WIDTH) / 2);
  const center = left + WIDTH / 2;
  const xOf = (bearing: number) => center + (wrap(bearing - angle) / HALF_SPAN) * (WIDTH / 2);
  ctx.save();
  ctx.fillStyle = 'rgba(11, 10, 8, 0.7)';
  ctx.fillRect(left, TOP, WIDTH, HEIGHT);
  ctx.strokeStyle = 'rgba(240, 180, 60, 0.6)';
  ctx.strokeRect(left + 0.5, TOP + 0.5, WIDTH - 1, HEIGHT - 1);
  ctx.beginPath();
  ctx.rect(left + 1, TOP + 1, WIDTH - 2, HEIGHT - 2);
  ctx.clip();
  // Ticks every 15°, letters at the cardinal directions. North is up on the map (−π/2).
  const letters: [number, string][] = [
    [-Math.PI / 2, t('dirN')],
    [0, t('dirE')],
    [Math.PI / 2, t('dirS')],
    [Math.PI, t('dirW')],
  ];
  ctx.fillStyle = 'rgba(233, 220, 192, 0.55)';
  for (let k = 0; k < 24; k++) {
    const x = xOf((k * Math.PI) / 12);
    ctx.fillRect(Math.round(x), TOP + HEIGHT - 5, 1, 3);
  }
  ctx.font = '16px VT323, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e9dcc0';
  for (const [bearing, letter] of letters) {
    if (Math.abs(wrap(bearing - angle)) < HALF_SPAN + 0.1) ctx.fillText(letter, xOf(bearing), TOP + HEIGHT / 2);
  }
  ctx.restore();

  // Target: a triangle on the strip (beyond the edge — an arrow at the edge) and a label under the strip.
  ctx.save();
  ctx.font = '16px VT323, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (target) {
    const rel = wrap(target.bearing - angle);
    const inside = Math.abs(rel) <= HALF_SPAN;
    const x = inside ? xOf(target.bearing) : rel < 0 ? left + 6 : left + WIDTH - 6;
    ctx.fillStyle = '#f0b43c';
    ctx.beginPath();
    if (inside) {
      ctx.moveTo(x - 5, TOP - 1);
      ctx.lineTo(x + 5, TOP - 1);
      ctx.lineTo(x, TOP + 6);
    } else {
      const dir = rel < 0 ? -1 : 1;
      ctx.moveTo(x + dir * 5, TOP + HEIGHT / 2);
      ctx.lineTo(x - dir * 3, TOP + 3);
      ctx.lineTo(x - dir * 3, TOP + HEIGHT - 3);
    }
    ctx.fill();
    const label = tf('compassTarget', { name: target.name, km: Math.max(1, Math.round(target.km)) });
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = 'rgba(11, 10, 8, 0.7)';
    ctx.fillRect(center - w / 2, TOP + HEIGHT + 2, w, 17);
    ctx.fillStyle = '#f0b43c';
    ctx.fillText(label, center, TOP + HEIGHT + 3);
  } else {
    const label = t('compassNoTarget');
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = 'rgba(11, 10, 8, 0.7)';
    ctx.fillRect(center - w / 2, TOP + HEIGHT + 2, w, 17);
    ctx.fillStyle = 'rgba(233, 220, 192, 0.8)';
    ctx.fillText(label, center, TOP + HEIGHT + 3);
  }
  ctx.restore();
}
