import { describe, expect, it } from 'vitest';
import {
  aimSpread,
  bodyZone,
  computeDamage,
  cripples,
  critPowerOf,
  farAim,
  hitChance,
  motionSpread,
  RECOIL,
  recoilHeat,
  spreadDegrees,
  spreadPoint,
  staggers,
  unarmedDamage,
  unarmedSkill,
} from '../src/game/combat.ts';

describe('combat rules', () => {
  const fixed = (v: number) => () => v;

  it('damage: roll, crit multiplier, minus threshold, minus percent', () => {
    // rnd = 0 → minimum damage; 1 is a normal hit, 2 a crit at Luck 5.
    expect(computeDamage(5, 12, { dt: 0, dr: 0 }, 1, fixed(0))).toBe(5);
    expect(computeDamage(5, 12, { dt: 0, dr: 0 }, 2, fixed(0))).toBe(10);
    expect(computeDamage(5, 12, { dt: 2, dr: 50 }, 1, fixed(0))).toBe(2); // 5 − 2 = 3, minus 50% (1.5 → 1) = 2, as in the original
    expect(computeDamage(5, 12, { dt: 6, dr: 0 }, 1, fixed(0))).toBe(0);
    // rnd almost 1 → maximum damage.
    expect(computeDamage(5, 12, { dt: 0, dr: 0 }, 1, fixed(0.9999))).toBe(12);
  });

  it('crit multiplier from Luck: 5 → ×2, 10 → ×2.5, 1 → ×1.6', () => {
    expect(critPowerOf(5)).toBe(2);
    expect(critPowerOf(10)).toBe(2.5);
    expect(critPowerOf(1)).toBe(1.6);
  });

  it('ammo: armor-piercing goes through resistance, hollow-point hits harder, resistance does not go negative', () => {
    // Normal 10 units against 40% resistance → 6; armor-piercing (−25% resistance): 10 − 1 (1.5 → 1) = 9.
    expect(computeDamage(10, 10, { dt: 0, dr: 40 }, 1, fixed(0), { drModifier: -25 })).toBe(9);
    // Hollow-point ×2, but their +25% resistance modifier always applies: without armor 20 × 75% = 15.
    expect(computeDamage(10, 10, { dt: 0, dr: 0 }, 1, fixed(0), { damageMultiplier: 2, drModifier: 25 })).toBe(15);
    expect(computeDamage(10, 10, { dt: 0, dr: 40 }, 1, fixed(0), { damageMultiplier: 2, drModifier: 25 })).toBe(7);
    // The modifier does not take resistance below zero.
    expect(computeDamage(10, 10, { dt: 0, dr: 5 }, 1, fixed(0), { drModifier: -50 })).toBe(10);
  });

  it('a 1-damage hit after the threshold at 25% resistance stays 1, as in the original (fists against Garl)', () => {
    // Garl: threshold 2, resistance 25%. A novice's fist (Strength 5): 1–3. Roll 3 → 3 − 2 = 1 → 1 (it used to be 0).
    expect(computeDamage(3, 3, { dt: 2, dr: 25 }, 1, fixed(0))).toBe(1);
    // A critical to the head (×2): 6 − 2 = 4, minus 25% (1) = 3.
    expect(computeDamage(3, 3, { dt: 2, dr: 25 }, 2, fixed(0))).toBe(3);
  });

  it('accuracy range from Perception: within its cells the circle does not grow, beyond +10% per cell, at most ×3', () => {
    expect(farAim(4, 5)).toBe(1);
    expect(farAim(5, 5)).toBe(1);
    expect(farAim(10, 5)).toBeCloseTo(1.5);
    expect(farAim(10, 9)).toBeCloseTo(1.1);
    expect(farAim(100, 5)).toBe(3);
  });

  it('hit chance is always between 5% and 95%', () => {
    expect(hitChance(60, 5)).toBe(55);
    expect(hitChance(10, 50)).toBe(5);
    expect(hitChance(200, 0)).toBe(95);
  });

  it('the "Unarmed" skill and bite damage are computed from stats', () => {
    const stats = new Array(35).fill(0);
    stats[0] = 4; // Strength
    stats[5] = 6; // Agility
    stats[11] = 2; // melee damage
    expect(unarmedSkill(stats, 3)).toBe(65 + 5 + 3);
    expect(unarmedDamage(stats)).toEqual({ min: 1, max: 3 });
  });
});

describe('hero shot spread (accuracy is the aim circle)', () => {
  it('the higher the skill, the narrower the circle: 0% → 5.6°, 45% → about 2.6°, 100% and above → 0.6°', () => {
    expect(spreadDegrees(0)).toBeCloseTo(5.6);
    expect(spreadDegrees(45)).toBeCloseTo(2.64, 1);
    expect(spreadDegrees(100)).toBeCloseTo(0.6);
    expect(spreadDegrees(150)).toBeCloseTo(0.6);
    for (let s = 0; s < 100; s += 10) expect(spreadDegrees(s + 10)).toBeLessThan(spreadDegrees(s));
  });

  it('Perception narrows the circle, lack of Strength widens it', () => {
    expect(aimSpread(60, 8, 0)).toBeLessThan(aimSpread(60, 5, 0));
    expect(aimSpread(60, 5, 2)).toBeCloseTo(aimSpread(60, 5, 0) * 1.5);
  });

  it('moving and rapid fire widen the circle, sneaking in place narrows it', () => {
    expect(motionSpread(0, false, false)).toBe(1);
    expect(motionSpread(4.4, false, false)).toBeCloseTo(1.6);
    expect(motionSpread(0, true, false)).toBe(2);
    expect(motionSpread(0, false, true)).toBe(0.85);
    expect(motionSpread(0, false, false, 1)).toBeCloseTo(1.9);
    expect(motionSpread(0, false, false, 3)).toBeCloseTo(3.7);
    expect(motionSpread(0, false, false, 10)).toBeCloseTo(3.7);
  });

  it('recoil: an experienced shooter handles it better, lack of Strength and a crippled arm worse', () => {
    expect(recoilHeat(45, 0)).toBeCloseTo(1.02);
    expect(recoilHeat(100, 0)).toBeCloseTo(0.8);
    expect(recoilHeat(200, 0)).toBe(0.6);
    expect(recoilHeat(45, 2)).toBeCloseTo(1.62);
    expect(recoilHeat(100, 0, true)).toBeCloseTo(1.2);
  });

  it('a burst without pauses inflates the circle, a second of pause almost restores accuracy', () => {
    // A pistol fires once per 0.6 s: each shot +1, during a pause it cools by 0.66.
    const series = (pause: number, n: number) => {
      let heat = 0;
      const spreads: number[] = [];
      for (let i = 0; i < n; i++) {
        spreads.push(motionSpread(0, false, false, heat));
        heat = Math.max(0, Math.min(RECOIL.hold, heat + 1) - RECOIL.fade * pause);
      }
      return spreads;
    };
    const spam = series(0.6, 10);
    expect(spam[0]).toBe(1);
    expect(spam[1]).toBeGreaterThan(1.25);
    expect(spam[4]).toBeGreaterThan(2.1);
    expect(spam[9]).toBeGreaterThan(3.5);
    // Once a second: every shot is accurate.
    expect(Math.max(...series(1, 10))).toBe(1);
    // One shot and a second of pause: the circle is almost as for the first.
    expect(motionSpread(0, false, false, 1 - RECOIL.fade)).toBeLessThan(1.25);
  });

  it('only a strong or critical hit stuns and cripples', () => {
    expect(staggers(3, 30, false)).toBe(false);
    expect(staggers(8, 30, false)).toBe(true);
    expect(staggers(1, 30, true)).toBe(true);
    expect(staggers(0, 30, true)).toBe(false);
    expect(cripples(14, 30, false)).toBe(false);
    expect(cripples(15, 30, false)).toBe(true);
    expect(cripples(2, 30, true)).toBe(true);
  });

  it('body parts: humans have the head on top, legs at the bottom, arms at the sides; animals only body and paws', () => {
    expect(bodyZone(0.5, 0.05, true)).toBe('head');
    expect(bodyZone(0.5, 0.4, true)).toBe('torso');
    expect(bodyZone(0.1, 0.4, true)).toBe('arms');
    expect(bodyZone(0.9, 0.4, true)).toBe('arms');
    expect(bodyZone(0.5, 0.8, true)).toBe('legs');
    expect(bodyZone(0.5, 0.05, false)).toBe('torso');
    expect(bodyZone(0.5, 0.9, false)).toBe('legs');
  });

  it('a bullet lands in the circle, more often near the middle', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let inner = 0;
    for (let i = 0; i < 2000; i++) {
      const p = spreadPoint(10, rnd);
      const r = Math.hypot(p.x, p.y);
      expect(r).toBeLessThanOrEqual(10);
      if (r < 5) inner++;
    }
    // Half the bullets are in the inner circle of half the radius (its area is a quarter).
    expect(inner / 2000).toBeGreaterThan(0.45);
  });
});
