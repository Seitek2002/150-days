// Special encounters — the original's easter eggs: when an encounter is special, which one comes up, once per game, caps in a stash.
import { describe, expect, it } from 'vitest';
import { cacheCaps, isSpecialRoll, pickSpecial, SPECIAL_WEIGHTS } from '../src/world/special-encounters.ts';

describe('special encounters', () => {
  it('3d6 + (Luck − 5) ≥ 18: with Luck 5 only three sixes, with Luck 10 more often', () => {
    expect(isSpecialRoll(5, () => 0.99)).toBe(true);
    expect(isSpecialRoll(5, () => 0.8)).toBe(false);
    expect(isSpecialRoll(10, () => 0.7)).toBe(true);
    // A roll over all of them: with Luck 5 it is 1 in 216.
    let n = 0;
    let s = 1;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 100000; i++) if (isSpecialRoll(5, rnd)) n++;
    expect(n / 100000).toBeGreaterThan(0.003);
    expect(n / 100000).toBeLessThan(0.0065);
  });

  it('weights as in the original, 100 in total; each encounter once per game', () => {
    expect(SPECIAL_WEIGHTS.reduce((sum, [, w]) => sum + w, 0)).toBe(100);
    expect(pickSpecial(() => false, () => 0)).toBe('foot');
    expect(pickSpecial(() => false, () => 0.995)).toBe('capsCache');
    // The trail has already happened — the same roll gives the next one.
    expect(pickSpecial((k) => k === 'foot', () => 0)).toBe('cows');
    expect(pickSpecial(() => true)).toBeNull();
  });

  it('caps in abandoned crates — by Luck, "Fortune Finder" doubles them', () => {
    expect(cacheCaps(1, false)).toBe(1);
    expect(cacheCaps(5, false)).toBe(730);
    expect(cacheCaps(5, true)).toBe(1460);
    expect(cacheCaps(12, false)).toBe(10765);
  });
});
