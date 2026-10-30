// Glow radiation on screen and in the ears (the client, 2026-10-25): like a camera pointed at a radioactive object.
// The radiation strength at a location (the field, from 0 to 1) depends on where the hero is: in the wasteland, on the distance to the Glow; on the surface
// of the Glow, on the distance to the hole down; below, on the level. The field drives the Geiger counter (quiet at first, then distinct;
// after that only the click rate grows), snow and white spots on screen. The hero's accumulated exposure drives "dead"
// (always lit) pixels and yellowing: near the lethal dose (1000) the screen is almost entirely yellow.
// Exposure is added by the original's scripts (surface 15 per 30 seconds, levels 1–3 10, 4–6 1) and by our dose: a weak one
// right by the Glow in the wasteland and a lethal one on levels 1–3 without protection (Rad-X gives +50% resistance, with it below is as in
// the original). The location table is RADIATION_PLACES.
import { PLACES } from '../world/worldmap.ts';
import { SQUARE_CELLS, WASTELAND } from '../world/wasteland.ts';
import { RADIATION_DEATH } from './conditions.ts';

/** From which field strength the screen shows snow and white spots and the Geiger counter gets no louder (after that only faster). */
export const SPOTS_FROM = 0.3;
/** Wasteland: from what distance to the center of the Glow square (cells) the counter is heard, and what the field is right at the entrance. */
export const WASTE_REACH = 2.5 * SQUARE_CELLS;
export const WASTE_NEAR = 4;
export const WASTE_FIELD = 0.45;
/** Our dose in the wasteland right by the Glow (exposure per second without protection); farther away less, none beyond SPOTS_FROM. */
export const WASTE_DOSE = 0.3;
/**
 * Below without protection (levels 1–3): exposure per second. With the hero's own resistance (2 × Endurance, usually 10%) about
 * 12 per second: the screen turns yellow in about half a minute, death comes in less than a minute and a half.
 */
export const LETHAL_DOSE = 15;
/** Radiation resistance at which our dose no longer matters: Rad-X (+50%). Less means proportionally less dose. */
export const PROTECTED_AT = 50;

/** Radiation strength on a map: the field (may grow toward a point) and our dose per second at field 1 (the map's scripts are separate). */
interface RadPlace {
  field: number;
  /** The field grows toward this point: peak at it, field at radius cells away. */
  toward?: { x: number; y: number; radius: number; peak: number };
  dose: number;
}

/** Locations with radiation. The surface and the lower levels are irradiated by the original's scripts, our dose there is 0. */
export const RADIATION_PLACES: Readonly<Record<string, RadPlace>> = {
  'glow-ent': { field: 0.5, toward: { x: 37, y: 37.2, radius: 25, peak: 0.85 }, dose: 0 },
  'glow-1': { field: 1, dose: LETHAL_DOSE },
  'glow-2': { field: 1, dose: LETHAL_DOSE },
  'glow-3': { field: 1, dose: LETHAL_DOSE },
  'glow-4': { field: 0.6, dose: 0 },
  'glow-5': { field: 0.6, dose: 0 },
  'glow-6': { field: 0.6, dose: 0 },
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (from: number, to: number, v: number) => {
  const s = clamp01((v - from) / (to - from));
  return s * s * (3 - 2 * s);
};

/** Where the hero is: map and cell; in the wasteland also the corner of the wasteland window in whole-wasteland cells (windowOrigin). */
export interface RadSpot {
  map: string;
  x: number;
  y: number;
  origin?: { x: number; y: number } | null;
}

/** Radiation strength at a point: 0 means none, 1 means like the bottom of the Glow. */
export function radiationField(at: RadSpot): number {
  if (at.map === WASTELAND) {
    if (!at.origin) return 0;
    const g = PLACES.glow;
    const d = Math.hypot(at.origin.x + at.x - (g.column + 0.5) * SQUARE_CELLS, at.origin.y + at.y - (g.row + 0.5) * SQUARE_CELLS);
    return WASTE_FIELD * clamp01((WASTE_REACH - d) / (WASTE_REACH - WASTE_NEAR));
  }
  const place = RADIATION_PLACES[at.map];
  if (!place) return 0;
  if (!place.toward) return place.field;
  const { x, y, radius, peak } = place.toward;
  return place.field + (peak - place.field) * clamp01(1 - Math.hypot(at.x - x, at.y - y) / radius);
}

/** Our dose per second (before the hero's resistance): in the wasteland right by the Glow, on maps from the table. */
export function placeDose(at: RadSpot, field: number): number {
  if (at.map === WASTELAND) return WASTE_DOSE * clamp01((field - SPOTS_FROM) / (WASTE_FIELD - SPOTS_FROM));
  return RADIATION_PLACES[at.map]?.dose ?? 0;
}

/** How much of the dose reaches the hero with resistance (%): with Rad-X (PROTECTED_AT and more), nothing. */
export function protectedDose(dose: number, resistance: number): number {
  return dose * clamp01(1 - resistance / PROTECTED_AT);
}

/** Geiger counter: clicks per second (rare at the very edge, a solid crackle at the bottom of the Glow). */
export function geigerRate(field: number): number {
  return field > 0 ? 0.5 + 150 * field * field : 0;
}

/** Counter volume (0–1): grows until the spots appear, then stays the same. */
export function geigerVolume(field: number): number {
  return field > 0 ? 0.12 + 0.78 * Math.sqrt(clamp01(field / SPOTS_FROM)) : 0;
}

/** What is visible on screen (all from 0 to 1, stuck is the number of dead pixels). */
export interface RadiationLook {
  /** Snow: fine noise across the whole frame. */
  snow: number;
  /** White spots: particle flashes. */
  spots: number;
  /** Dead (always lit) pixels. */
  stuck: number;
  /** Frame yellowing. */
  yellow: number;
}

/** The maximum number of dead pixels. */
export const STUCK_MAX = 180;

/** The screen from the field (snow, spots) and the hero's accumulated exposure (dead pixels, yellowing). */
export function radiationLook(field: number, rads: number): RadiationLook {
  const noise = smooth(SPOTS_FROM - 0.05, 1, field);
  return {
    snow: noise,
    spots: noise,
    stuck: Math.min(STUCK_MAX, Math.max(0, Math.floor((rads - 25) / 5))),
    yellow: smooth(300, RADIATION_DEATH - 50, rads),
  };
}

/** Whether anything is visible at all. */
export function lookVisible(look: RadiationLook): boolean {
  return look.snow > 0 || look.spots > 0 || look.stuck > 0 || look.yellow > 0;
}
