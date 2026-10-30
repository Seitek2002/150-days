// The hero's temporary conditions by Fallout's rules: drugs (immediate and delayed), radiation and poison.
// Everything that changes stats and attributes for a while adds up into one table of modifiers by STAT number
// (the character's Character.statEffects; specialLevel and derivedStats take it into account).
import { STAT, type DrugData } from '../formats/pro.ts';
import type { Random } from './combat.ts';

/** Numbers of the "current" stats in drug data: health, poison and radiation change immediately, not as a modifier. */
export const STAT_CURRENT_HP = STAT.currentHp;
export const STAT_POISON_LEVEL = 36;
export const STAT_RADIATION_LEVEL = 37;

/** Stat modifiers: STAT number → bonus. */
export type StatDeltas = [number, number][];

/** The delayed part of a drug's effect: after this many game seconds — these modifiers (usually the "comedown"). */
export interface DrugLater {
  after: number;
  deltas: StatDeltas;
}

const roll = (min: number, max: number, rnd: Random) => min + Math.floor(rnd() * (max - min + 1));

/**
 * Parsing a drug's effect: three stats and three amounts. A special case of the original: a first stat of −2 means
 * "a random number from the first to the second amount" for the second stat (that's how a stimpak heals).
 */
function deltasOf(stats: readonly number[], amounts: readonly number[], rnd: Random): StatDeltas {
  const out: StatDeltas = [];
  if (stats[0] === -2) {
    if ((stats[1] ?? -1) >= 0) out.push([stats[1]!, roll(amounts[0] ?? 0, amounts[1] ?? 0, rnd)]);
    if ((stats[2] ?? -1) >= 0 && amounts[2]) out.push([stats[2]!, amounts[2]]);
    return out;
  }
  stats.forEach((stat, i) => {
    if (stat >= 0 && amounts[i]) out.push([stat, amounts[i]!]);
  });
  return out;
}

/** What a drug does: now and later (the original's minutes converted to game seconds). */
export function drugEffects(drug: DrugData, rnd: Random = Math.random): { now: StatDeltas; later: DrugLater[] } {
  const now = deltasOf(drug.stats, drug.amounts, rnd);
  const later: DrugLater[] = [];
  // Delayed modifiers use the same stats, but their first −2 isn't random — we take the numbers themselves.
  const plain = drug.stats.map((s, i) => (i === 0 && s === -2 ? -1 : s));
  if (drug.duration1 && drug.amounts1) later.push({ after: drug.duration1 * 60, deltas: deltasOf(plain, drug.amounts1, rnd) });
  if (drug.duration2 && drug.amounts2) later.push({ after: drug.duration2 * 60, deltas: deltasOf(plain, drug.amounts2, rnd) });
  return { now, later: later.filter((l) => l.deltas.length > 0) };
}

/** The original's radiation levels: from what amount and what they take away. From 1000 — death. */
export const RADIATION_LEVELS: readonly { from: number; key: string; deltas: StatDeltas }[] = [
  { from: 150, key: 'radMinor', deltas: [[STAT.endurance, -1]] },
  { from: 300, key: 'radAdvanced', deltas: [[STAT.perception, -1], [STAT.endurance, -2], [STAT.agility, -1]] },
  { from: 450, key: 'radCritical', deltas: [[STAT.perception, -2], [STAT.endurance, -3], [STAT.strength, -2], [STAT.agility, -2]] },
  { from: 600, key: 'radDeadly', deltas: [[STAT.perception, -4], [STAT.endurance, -5], [STAT.strength, -4], [STAT.intelligence, -3], [STAT.agility, -5]] },
];
export const RADIATION_DEATH = 1000;

/** Radiation level (−1 — none, otherwise the index in RADIATION_LEVELS). */
export function radiationLevel(rads: number): number {
  let level = -1;
  RADIATION_LEVELS.forEach((l, i) => {
    if (rads >= l.from) level = i;
  });
  return level;
}

/** Sum of modifiers: drugs and radiation. */
export function combineEffects(drugMods: Readonly<Record<number, number>>, rads: number): Record<number, number> {
  const out: Record<number, number> = { ...drugMods };
  const level = radiationLevel(rads);
  if (level >= 0) for (const [stat, n] of RADIATION_LEVELS[level]!.deltas) out[stat] = (out[stat] ?? 0) + n;
  for (const k of Object.keys(out)) if (!out[Number(k)]) delete out[Number(k)];
  return out;
}

/** Drug addiction: withdrawal begins if there's no dose for longer than the term, and passes after a week without a dose. */
export interface Addiction {
  drugPid: number;
  /** Number of the addiction "perk" from the drug data (name in PERK.MSG — 101 + number). */
  perk: number;
  /** From which game second withdrawal starts (if there is no new dose). */
  withdrawalAt: number;
  /** What withdrawal takes away. */
  deltas: StatDeltas;
}

export const WITHDRAWAL_SECONDS = 7 * 24 * 3600;

/** What withdrawal takes away: each stat the drug raised is 1 below normal (our rule). */
export function withdrawalDeltas(now: StatDeltas): StatDeltas {
  return now.filter(([stat, n]) => stat >= 0 && stat <= 6 && n > 0).map(([stat]) => [stat, -1] as [number, number]);
}

/** Poison: once every this many game seconds it takes 1 health and weakens by 1 (as in the original — bit by bit). */
export const POISON_TICK = 10 * 60;
