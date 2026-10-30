// Fallout dice rolls for skill and stat checks in scripts (roll_vs_skill, do_check).
// The rules are as in the original (reference, section 3; meaning from roll.cc and stat.cc of fallout1-ce, the code is ours): d% against a skill
// and d10 against a stat; critical outcomes appear from the second day of the game.

/** Check outcome: the same numbers as in the original's scripts. */
export const ROLL = { criticalFailure: 0, failure: 1, success: 2, criticalSuccess: 3 } as const;

/** A die roll: an integer from min to max inclusive. */
export type Dice = (min: number, max: number) => number;

/** How many game seconds in a day: until the end of the first day there are no critical outcomes. */
export const DAY_SECONDS = 24 * 60 * 60;

export interface RollResult {
  /** Outcome: one of ROLL. */
  result: number;
  /** How much better (plus) or worse (minus) than needed the roll is. */
  howMuch: number;
}

/**
 * A d% check against a difficulty (chance in percent). Success: the roll is no greater than the difficulty.
 * Critical failure: on a failure with a chance of (shortfall / 10)%; critical success: on a success with a chance of
 * (margin / 10 + bonus)%, the bonus is the hero's critical hit chance. No crits until the first day has passed.
 */
export function rollCheck(difficulty: number, criticalBonus: number, dice: Dice, criticalsAllowed: boolean): RollResult {
  const delta = difficulty - dice(1, 100);
  let result: number = delta < 0 ? ROLL.failure : ROLL.success;
  if (criticalsAllowed) {
    if (delta < 0 && dice(1, 100) <= Math.trunc(-delta / 10)) result = ROLL.criticalFailure;
    else if (delta >= 0 && dice(1, 100) <= Math.trunc(delta / 10) + criticalBonus) result = ROLL.criticalSuccess;
  }
  return { result, howMuch: delta };
}

/** Stat check: a d10 roll no greater than the value (with a modifier). No critical outcomes. */
export function statCheck(value: number, dice: Dice): RollResult {
  const roll = dice(1, 10);
  return { result: roll <= value ? ROLL.success : ROLL.failure, howMuch: value - roll };
}

/** is_success: 1 means success (normal or critical), 0 failure, −1 not a check outcome. */
export function rollIsSuccess(roll: number): number {
  if (roll === ROLL.criticalFailure || roll === ROLL.failure) return 0;
  if (roll === ROLL.success || roll === ROLL.criticalSuccess) return 1;
  return -1;
}

/** is_critical: 1 means a critical outcome (success or failure), 0 normal, −1 not a check outcome. */
export function rollIsCritical(roll: number): number {
  if (roll === ROLL.criticalFailure || roll === ROLL.criticalSuccess) return 1;
  if (roll === ROLL.failure || roll === ROLL.success) return 0;
  return -1;
}
