// A strong hit knocks the hero down (client, 2026-10-26): falling, the view goes up and the eyes near the ground; getting up, he straightens.
import { describe, expect, it } from 'vitest';
import { attackDelay, KNOCKDOWN, KNOCKDOWN_TIME, knocksDown, knockView } from '../src/game/combat.ts';

describe('knocked down', () => {
  it('when it knocks down: an explosion from a fifth of health, a critical from a third, any hit from 45%', () => {
    expect(knocksDown(10, 60, false, false)).toBe(false);
    expect(knocksDown(12, 60, false, true)).toBe(true);
    expect(knocksDown(20, 60, true, false)).toBe(true);
    expect(knocksDown(20, 60, false, false)).toBe(false);
    expect(knocksDown(27, 60, false, false)).toBe(true);
  });

  it('falls and gets up: view up and down to the ground, at the end as he stood', () => {
    const start = knockView(0, 1);
    expect(start.drop).toBe(0);
    const down = knockView(KNOCKDOWN.fall + KNOCKDOWN.lie / 2, 1);
    expect(down.w).toBe(1);
    expect(down.pitch).toBeGreaterThan(300);
    expect(down.drop).toBeGreaterThan(0.3);
    const end = knockView(KNOCKDOWN_TIME, 1);
    expect(end.drop).toBeCloseTo(0);
    expect(end.w).toBeCloseTo(0);
    expect(Math.abs(end.sway)).toBeLessThan(0.01);
  });
});

describe('Endurance and knockdown (client, 2026-10-27)', () => {
  it('a hardy hero is harder to knock down, a weak one easier', () => {
    // 27 of 60 is 45%: at Endurance 5 it knocks down, at 10 (threshold one and a half times higher) it does not.
    expect(knocksDown(27, 60, false, false, 5)).toBe(true);
    expect(knocksDown(27, 60, false, false, 10)).toBe(false);
    expect(knocksDown(41, 60, false, false, 10)).toBe(true);
    // At Endurance 1: from 27% of health (16.2 of 60).
    expect(knocksDown(17, 60, false, false, 1)).toBe(true);
    expect(knocksDown(15, 60, false, false, 1)).toBe(false);
  });
});

describe('delay between attacks from Agility and skill (client, 2026-10-27)', () => {
  it('the middle is as before; Agility 10 and skill 200%: a pistol once per 0.23 s, never faster than 0.2 s', () => {
    expect(attackDelay(5, 5, 50)).toBeCloseTo(0.6);
    expect(attackDelay(3, 5, 50)).toBeCloseTo(0.5);
    expect(attackDelay(5, 10, 50)).toBeCloseTo(0.42);
    expect(attackDelay(5, 5, 200)).toBeCloseTo(0.33);
    expect(attackDelay(5, 10, 200)).toBeCloseTo(0.231);
    // Never faster than 0.2 s; skill above 200% does not speed up further.
    expect(attackDelay(3, 10, 250)).toBeCloseTo(0.2);
    // A weak fighter is slower: Agility 1 and skill 0% means 1.3 × 1.3 times.
    expect(attackDelay(5, 1, 0)).toBeCloseTo(0.6 * 1.69);
  });
});
