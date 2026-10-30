// Hero action points (client decision): in combat reloading, the inventory and a stimpak cost AP, out of combat they are free.
import { describe, expect, it } from 'vitest';
import type { ItemProto, WeaponData } from '../src/formats/pro.ts';
import { AP_COST, AP_REFILL_SECONDS, defaultHeroCharacter, Hero } from '../src/game/hero.ts';
import { SKILL_SECONDS } from '../src/game/fighter.ts';

const weapon = {
  pid: 8,
  messageId: 0,
  fid: 0,
  type: 3,
  weight: 0,
  cost: 0,
  inventoryFid: 0,
  weapon: { minDamage: 5, maxDamage: 12, damageType: 0, range: 25, minStrength: 3, apCost: 5, apCostMode2: 0, caliber: 8, ammoPid: 29, capacity: 12 } as WeaponData,
} as ItemProto & { weapon: WeaponData };
const ammo: ItemProto = { pid: 29, messageId: 0, fid: 0, type: 4, weight: 0, cost: 0, inventoryFid: 0 };
const stimpak: ItemProto = {
  pid: 40,
  messageId: 0,
  fid: 0,
  type: 2,
  weight: 0,
  cost: 0,
  inventoryFid: 0,
  drug: { stats: [-2, 35, -1], amounts: [10, 20, 0] },
};

function hero(): Hero {
  const h = new Hero({ weapon, ammo, stimpak });
  h.inventory.add(weapon, 1);
  h.inventory.add(ammo, 24);
  h.inventory.add(stimpak, 2);
  return h;
}

describe('action points', () => {
  it('pool is 5 + Agility/2 = 7', () => {
    expect(hero().maxAp).toBe(7);
  });

  it('out of combat nothing costs AP', () => {
    const h = hero();
    h.magazine = 0;
    h.ap = 0;
    expect(h.reload()).toBe('started');
    h.hp = 10;
    expect(typeof h.useStimpak()).toBe('number');
  });

  it('in combat reloading costs 2 AP; when short, it does not start', () => {
    const h = hero();
    h.inCombat = true;
    h.magazine = 0;
    h.ap = AP_COST.reload;
    expect(h.reload()).toBe('started');
    expect(h.ap).toBe(0);
    h.update(10); // reloading finished; AP recovered partly or fully
    h.magazine = 0;
    h.ap = 1;
    expect(h.reload()).toBe('noAp');
    expect(h.fire()).toBe('noAp');
  });

  it('in combat a stimpak costs 2 AP; from the inventory (entry already paid) it is free', () => {
    const h = hero();
    h.inCombat = true;
    h.hp = 5;
    h.ap = 1;
    expect(h.useStimpak()).toBe('noAp');
    expect(h.stimpaks).toBe(2);
    expect(typeof h.useStimpak(true)).toBe('number');
    expect(h.stimpaks).toBe(1);
  });

  it('opening the inventory in combat costs 4 AP', () => {
    const h = hero();
    h.inCombat = true;
    h.ap = 3;
    expect(h.spendAp(AP_COST.inventory)).toBe(false);
    h.ap = 7;
    expect(h.spendAp(AP_COST.inventory)).toBe(true);
    expect(h.ap).toBe(3);
  });

  it('in combat AP recover over a few seconds, out of combat fully at once', () => {
    const h = hero();
    h.inCombat = true;
    h.ap = 0;
    h.update(AP_REFILL_SECONDS / 2);
    expect(h.ap).toBeCloseTo(3.5);
    h.update(AP_REFILL_SECONDS);
    expect(h.ap).toBe(7);
    h.ap = 0;
    h.inCombat = false;
    h.update(0.01);
    expect(h.ap).toBe(7);
  });
});

/** A hero with a different Agility. */
function nimble(agility: number): Hero {
  const c = defaultHeroCharacter();
  return new Hero({ weapon, ammo, stimpak }, { ...c, special: { ...c.special, agility } });
}

describe('Agility speeds up actions (client task, 2026-10-22)', () => {
  it('Agility 5 is the original prices; higher is cheaper, lower is dearer (5% per point)', () => {
    expect(nimble(5).apCost(AP_COST.inventory)).toBe(4);
    expect(nimble(10).apCost(AP_COST.inventory)).toBe(3);
    expect(nimble(10).apCost(AP_COST.reload)).toBe(1.5);
    expect(nimble(1).apCost(AP_COST.inventory)).toBe(4.8);
  });

  it('in combat reloading costs an agile hero fewer AP', () => {
    const h = nimble(10);
    h.inCombat = true;
    h.inventory.add(weapon, 1);
    h.inventory.add(ammo, 24);
    h.ap = 2;
    h.magazine = 0;
    expect(h.reload()).toBe('started');
    expect(h.ap).toBeCloseTo(0.5);
  });

  it('a skill occupies the hands: at Agility 10 a quarter faster; while the hands are busy, no shooting', () => {
    expect(nimble(5).startSkill()).toBeCloseTo(SKILL_SECONDS);
    const h = nimble(10);
    expect(h.startSkill()).toBeCloseTo(SKILL_SECONDS * 0.75);
    expect(h.skillBusy).toBe(true);
    expect(h.fire()).toBe('busy');
    h.update(SKILL_SECONDS);
    expect(h.skillBusy).toBe(false);
  });
});
