// Light in the open by time of day: sky colour, distant haze and ambient light. By day — a dusty bright sky,
// at dawn and dusk — warm, at night — dark (and visibility is short).
import type { Outdoor, Rgb } from '../engine/level.ts';

/** Key points of the day: hour → light. In between — a smooth transition. */
const KEYS: { hour: number; light: Outdoor }[] = [
  { hour: 0, light: { skyTop: { r: 6, g: 8, b: 18 }, skyHorizon: { r: 22, g: 22, b: 34 }, fog: { r: 16, g: 16, b: 24 }, brightness: 0.4 } },
  { hour: 5, light: { skyTop: { r: 10, g: 12, b: 26 }, skyHorizon: { r: 34, g: 30, b: 42 }, fog: { r: 24, g: 22, b: 30 }, brightness: 0.45 } },
  { hour: 6.5, light: { skyTop: { r: 70, g: 82, b: 120 }, skyHorizon: { r: 214, g: 146, b: 96 }, fog: { r: 170, g: 130, b: 104 }, brightness: 0.8 } },
  { hour: 9, light: { skyTop: { r: 96, g: 132, b: 168 }, skyHorizon: { r: 206, g: 192, b: 160 }, fog: { r: 196, g: 182, b: 150 }, brightness: 1 } },
  { hour: 17, light: { skyTop: { r: 96, g: 132, b: 168 }, skyHorizon: { r: 206, g: 192, b: 160 }, fog: { r: 196, g: 182, b: 150 }, brightness: 1 } },
  { hour: 19, light: { skyTop: { r: 64, g: 60, b: 96 }, skyHorizon: { r: 220, g: 128, b: 76 }, fog: { r: 160, g: 110, b: 86 }, brightness: 0.75 } },
  { hour: 21, light: { skyTop: { r: 10, g: 12, b: 26 }, skyHorizon: { r: 34, g: 30, b: 42 }, fog: { r: 24, g: 22, b: 30 }, brightness: 0.45 } },
  { hour: 24, light: { skyTop: { r: 6, g: 8, b: 18 }, skyHorizon: { r: 22, g: 22, b: 34 }, fog: { r: 16, g: 16, b: 24 }, brightness: 0.4 } },
];

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t),
});

/** Light for a time of day (hours with fractions: 13.5 — half past one). */
export function outdoorAt(hours: number): Outdoor {
  const h = ((hours % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.hour <= h) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const t = Math.max(0, Math.min(1, (h - a.hour) / (b.hour - a.hour)));
  // The sun rises in the east at 6 a.m., at noon it is highest in the south, it sets in the west at 6 p.m.
  const day = (h - 6) / 12;
  return {
    skyTop: mixRgb(a.light.skyTop, b.light.skyTop, t),
    skyHorizon: mixRgb(a.light.skyHorizon, b.light.skyHorizon, t),
    fog: mixRgb(a.light.fog, b.light.fog, t),
    brightness: a.light.brightness + (b.light.brightness - a.light.brightness) * t,
    sun: { azimuth: Math.PI * day, elevation: Math.sin(Math.PI * day) * 1.0 },
    clouds: h * 6,
  };
}
