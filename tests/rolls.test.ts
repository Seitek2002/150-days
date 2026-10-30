// Rolls for skill and stat checks: the numbers are computed by hand, the die is replaced with preset values.
import { describe, expect, it } from 'vitest';
import { DAY_SECONDS, ROLL, rollCheck, rollIsCritical, rollIsSuccess, statCheck } from '../src/game/rolls.ts';

/** A die that yields values in turn (the last one forever). */
const dice = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};

describe('skill check (d%)', () => {
  it('a roll not above the skill is a success, above is a failure, exactly equal is a success', () => {
    expect(rollCheck(50, 0, dice(30), false)).toEqual({ result: ROLL.success, howMuch: 20 });
    expect(rollCheck(50, 0, dice(50), false)).toEqual({ result: ROLL.success, howMuch: 0 });
    expect(rollCheck(50, 0, dice(80), false)).toEqual({ result: ROLL.failure, howMuch: -30 });
  });

  it('no critical outcomes during the first day — and no second roll is made', () => {
    let throws = 0;
    const counting = (a: number) => (throws++, a);
    expect(rollCheck(100, 50, () => counting(1), false).result).toBe(ROLL.success);
    expect(throws).toBe(1);
    expect(rollCheck(10, 0, () => counting(100), false).result).toBe(ROLL.failure);
    expect(throws).toBe(2);
  });

  it('critical success: margin / 10 plus the hero\'s bonus, no less than the second roll', () => {
    // skill 100, roll 1 → margin 99 → chance 9 + 2 = 11%; second roll 11 is critical, 12 is a normal success
    expect(rollCheck(100, 2, dice(1, 11), true)).toEqual({ result: ROLL.criticalSuccess, howMuch: 99 });
    expect(rollCheck(100, 2, dice(1, 12), true)).toEqual({ result: ROLL.success, howMuch: 99 });
  });

  it('critical failure: shortfall / 10, no less than the second roll', () => {
    // skill 10, roll 90 → shortfall 80 → chance 8%
    expect(rollCheck(10, 0, dice(90, 8), true)).toEqual({ result: ROLL.criticalFailure, howMuch: -80 });
    expect(rollCheck(10, 0, dice(90, 9), true)).toEqual({ result: ROLL.failure, howMuch: -80 });
  });

  it('a day is 86400 game seconds', () => {
    expect(DAY_SECONDS).toBe(86400);
  });
});

describe('stat check (d10)', () => {
  it('a roll not above the value is a success', () => {
    expect(statCheck(6, dice(6))).toEqual({ result: ROLL.success, howMuch: 0 });
    expect(statCheck(6, dice(7))).toEqual({ result: ROLL.failure, howMuch: -1 });
    expect(statCheck(10, dice(10)).result).toBe(ROLL.success);
    expect(statCheck(0, dice(1)).result).toBe(ROLL.failure);
  });

  it('the die rolls from 1 to 10', () => {
    const asked: number[][] = [];
    statCheck(5, (a, b) => (asked.push([a, b]), 1));
    expect(asked).toEqual([[1, 10]]);
  });
});

describe('success and criticality of an outcome', () => {
  it('is_success: 0 — failure, 1 — success, −1 — not an outcome', () => {
    expect([0, 1, 2, 3].map(rollIsSuccess)).toEqual([0, 0, 1, 1]);
    expect(rollIsSuccess(4)).toBe(-1);
    expect(rollIsSuccess(-1)).toBe(-1);
  });

  it('is_critical: 1 — critical, 0 — normal, −1 — not an outcome', () => {
    expect([0, 1, 2, 3].map(rollIsCritical)).toEqual([1, 0, 0, 1]);
    expect(rollIsCritical(7)).toBe(-1);
  });
});
