// Enemies' eyes (AI-1) — and the hero's: the same rules for everyone (client decision: "NPCs work like the hero").
// Sight depends on Perception: far to the front, almost point-blank behind; darkness and the target's stealth reduce it.
// Numbers follow the original's intent: in front Perception × 5 hexes (our cell is 2 hexes), behind — Perception.
import type { Level } from '../../engine/level.ts';

/** How many degrees to each side of the gaze count as "in front". */
export const FRONT_HALF_ANGLE = (75 * Math.PI) / 180;

/** Is the creature facing the point (dx, dy) — measured from itself to the point. */
export function inFront(facing: number, dx: number, dy: number): boolean {
  const diff = Math.atan2(dy, dx) - facing;
  return Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))) <= FRONT_HALF_ANGLE;
}

/**
 * How far one can see (cells). front — the target is in front; light — light level (1 — day, less — darker);
 * stealth — how noticeable the target is (1 — normal, less — sneaking). Point-blank is always visible.
 */
export function sightRange(perception: number, light: number, front: boolean, stealth = 1): number {
  const base = front ? perception * 2.5 : perception * 0.5;
  return Math.max(1, base * light * stealth);
}

/** Light on the map: in the open — by time of day, underground and indoors — dim. */
export function lightOf(level: Level): number {
  return level.outdoor ? level.outdoor.brightness : 0.8;
}

/**
 * How noticeable a sneaker is (1 — not sneaking): the Sneak skill hides — at 100% by half, at 150% and above — by two thirds.
 * The same rule works for NPCs too, if they ever sneak.
 */
export function stealthFactor(sneaking: boolean, sneakSkill: number): number {
  if (!sneaking) return 1;
  const s = Math.max(0, Math.min(sneakSkill, 150));
  return s <= 100 ? 1 - s / 200 : 0.5 - (s - 100) / 300;
}

/** How far noise carries (cells): a shot, footsteps. Through walls — half as loud. */
export const NOISE = { shot: 18, run: 5, walk: 2.5 } as const;
