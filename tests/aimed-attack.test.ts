// Aimed attack (client, 2026-10-29; the original's aimed shots): the chance depends on the body part and Luck, not on skill; the
// delay of such an attack is 20% longer than usual.
import { describe, expect, it } from 'vitest';
import type { ItemProto, WeaponData } from '../src/formats/pro.ts';
import { AIM_PARTS, AIMED, aimedChance, aimedZone, BEAST_AIM_PARTS } from '../src/game/combat.ts';
import { Hero } from '../src/game/hero.ts';

describe('aimed attack', () => {
  it('chance: torso 75%, legs 55%, arms and groin 45%, head 35%, eyes 15% at Luck 5', () => {
    expect(aimedChance('torso', 5)).toBe(75);
    expect(aimedChance('leftLeg', 5)).toBe(55);
    expect(aimedChance('rightArm', 5)).toBe(45);
    expect(aimedChance('groin', 5)).toBe(45);
    expect(aimedChance('head', 5)).toBe(35);
    expect(aimedChance('eyes', 5)).toBe(15);
  });

  it('Luck adds or subtracts 3% per point, chance is 5% to 95%', () => {
    expect(aimedChance('torso', 10)).toBe(90);
    expect(aimedChance('eyes', 1)).toBe(5);
    expect(aimedChance('eyes', 10)).toBe(30);
    for (const part of AIM_PARTS) for (let luck = 1; luck <= 10; luck++) {
      const chance = aimedChance(part, luck);
      expect(chance).toBeGreaterThanOrEqual(AIMED.min);
      expect(chance).toBeLessThanOrEqual(AIMED.max);
    }
  });

  it('body parts: eyes and head hit the head, groin hits the torso; animals have no groin or arms', () => {
    expect(aimedZone('eyes')).toBe('head');
    expect(aimedZone('groin')).toBe('torso');
    expect(aimedZone('leftArm')).toBe('arms');
    expect(aimedZone('rightLeg')).toBe('legs');
    expect(BEAST_AIM_PARTS).not.toContain('groin');
    expect(BEAST_AIM_PARTS.some((p) => p === 'leftArm' || p === 'rightArm')).toBe(false);
  });

  it('the pause after an aimed attack is 20% longer than usual', () => {
    const weapon = { pid: 8, type: 3, weapon: { minDamage: 5, maxDamage: 12, damageType: 0, range: 30, minStrength: 3, apCost: 5, apCostMode2: 5, caliber: 1, ammoPid: 29, capacity: 12, animationCode: 5 } as WeaponData } as ItemProto & { weapon: WeaponData };
    const ammo = { pid: 29, type: 4, ammo: { caliber: 1, quantity: 24 } } as ItemProto;
    const stimpak = { pid: 40, type: 2 } as ItemProto;
    const shot = (aimed: boolean) => {
      const h = new Hero({ weapon, ammo, stimpak });
      h.inventory.add(weapon, 1);
      h.putInHand(1, weapon);
      h.magazine = 5;
      h.holstered = false;
      // The weapon has just been taken in hand: first it is drawn.
      h.update(5);
      expect(h.fire(aimed)).toBe('fired');
      return h.attackLeft;
    };
    expect(shot(true)).toBeCloseTo(shot(false) * AIMED.delay);
  });
});
