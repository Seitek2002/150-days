// Weapon after combat: the hero remembers there was a fight and counts seconds of calm (no fight and no shots); by them play.ts
// lowers the weapon where there are peaceful townsfolk; a shot resets the calm, and so does a new fight.
import { describe, expect, it } from 'vitest';
import type { ItemProto, WeaponData } from '../src/formats/pro.ts';
import { Hero } from '../src/game/hero.ts';

const base = { messageId: 0, fid: 0, weight: 0, cost: 0, inventoryFid: 0 };
const pistol = { ...base, pid: 8, type: 3, weapon: { minDamage: 5, maxDamage: 12, damageType: 0, range: 25, minStrength: 3, apCost: 5, apCostMode2: 0, caliber: 8, ammoPid: 29, capacity: 12 } as WeaponData } as ItemProto & { weapon: WeaponData };
const ammo: ItemProto = { ...base, pid: 29, type: 4 };
const stimpak: ItemProto = { ...base, pid: 40, type: 2 };

describe('weapon after combat', () => {
  it('combat is noted, calm is counted, a shot and a new fight reset it', () => {
    const h = new Hero({ weapon: pistol, ammo, stimpak });
    expect(h.fought).toBe(false);
    h.inCombat = true;
    h.update(0.1);
    expect(h.fought).toBe(true);
    expect(h.calmFor).toBe(0);
    h.inCombat = false;
    for (let i = 0; i < 15; i++) h.update(0.1);
    expect(h.calmFor).toBeCloseTo(1.5, 5);
    // A shot is not calm.
    h.fire();
    expect(h.calmFor).toBe(0);
    for (let i = 0; i < 25; i++) h.update(0.1);
    expect(h.calmFor).toBeGreaterThanOrEqual(2);
    h.inCombat = true;
    h.update(0.1);
    expect(h.calmFor).toBe(0);
    expect(h.fought).toBe(true);
  });
});
