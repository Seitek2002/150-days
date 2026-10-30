// Two hands, as in the original: either can hold any item, one is active (F), and only it shoots and is visible to critters.
import { describe, expect, it } from 'vitest';
import type { ItemProto, WeaponData } from '../src/formats/pro.ts';
import { Hero } from '../src/game/hero.ts';

const base = { messageId: 0, fid: 0, weight: 0, cost: 0, inventoryFid: 0 };
const pistol = { ...base, pid: 8, type: 3, weapon: { minDamage: 5, maxDamage: 12, damageType: 0, range: 25, minStrength: 3, apCost: 5, apCostMode2: 0, caliber: 8, ammoPid: 29, capacity: 12 } as WeaponData } as ItemProto & { weapon: WeaponData };
const knife = { ...base, pid: 4, type: 3, weapon: { minDamage: 1, maxDamage: 6, damageType: 0, range: 1, minStrength: 2, apCost: 3, apCostMode2: 0, caliber: 0, ammoPid: -1, capacity: 0 } as WeaponData } as ItemProto & { weapon: WeaponData };
const rope: ItemProto = { ...base, pid: 127, type: 5 };
const ammo: ItemProto = { ...base, pid: 29, type: 4 };
const stimpak: ItemProto = { ...base, pid: 40, type: 2 };

function hero(): Hero {
  const h = new Hero({ weapon: pistol, ammo, stimpak });
  h.inventory.add(pistol, 1);
  h.inventory.add(knife, 1);
  h.inventory.add(rope, 1);
  return h;
}

describe('two hands', () => {
  it('at the start the pistol is in the second hand, which is active', () => {
    const h = hero();
    expect(h.activeHand).toBe(1);
    expect(h.handItem(1)?.pid).toBe(pistol.pid);
    expect(h.handItem(0)).toBeNull();
    expect(h.weaponItem?.pid).toBe(pistol.pid);
  });

  it('F switches the active hand: a knife in one, a rope in the other; the rope is active, no weapon', () => {
    const h = hero();
    h.putInHand(0, knife);
    h.putInHand(1, rope);
    expect(h.weaponItem).toBeNull();
    expect(h.activeItem?.pid).toBe(rope.pid);
    h.toggleHand();
    expect(h.activeHand).toBe(0);
    expect(h.weaponItem?.pid).toBe(knife.pid);
  });

  it('one item cannot be in both hands at once', () => {
    const h = hero();
    h.putInHand(0, pistol);
    expect(h.handItem(0)?.pid).toBe(pistol.pid);
    expect(h.handItem(1)).toBeNull();
  });

  it('hands are saved and restored; an old save has one hand', () => {
    const h = hero();
    h.putInHand(0, knife);
    h.toggleHand();
    const restored = hero();
    restored.restoreWeapons(h.heldForSave, h.magazines, h.firstHandForSave, h.activeHand);
    expect(restored.activeHand).toBe(0);
    expect(restored.weaponItem?.pid).toBe(knife.pid);
    const old = hero();
    old.restoreWeapons(knife.pid, []);
    expect(old.activeHand).toBe(1);
    expect(old.handItem(1)?.pid).toBe(knife.pid);
    expect(old.handItem(0)).toBeNull();
  });
});
