// Thought-out combat (client, 2026-10-26: "the player cannot relax and spam"): an enemy does not freeze from every weak
// hit, dodges the aim, limps from a bullet in the leg and drops the weapon from a bullet in the arm; for the hero running and jumping in combat
// cost AP, strong hits cripple an arm or a leg.
import { describe, expect, it } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import type { ItemProto, WeaponData } from '../src/formats/pro.ts';
import { buildLevel } from '../src/engine/level.ts';
import { Creature, DODGE, dodgeAfter, type CreatureArt, type CreatureWeapon, type Target } from '../src/game/creature.ts';
import { Hero, JUMP_AP, RUN_AP } from '../src/game/hero.ts';
import { parseLevelDef } from '../src/world/defs.ts';

const sheet: SpriteSheet = {
  fps: 10,
  actionFrame: 2,
  directions: Array.from({ length: 6 }, () => Array.from({ length: 5 }, () => ({ width: 1, height: 1, pixels: new Uint32Array(1) }))),
  shifts: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  offsets: Array.from({ length: 6 }, () => Array.from({ length: 5 }, () => ({ x: 0, y: 0 }))),
};
const art: CreatureArt = { stand: sheet, walk: sheet, attack: sheet, hit: sheet, death: sheet };
const stats = { name: 'Raider', maxHp: 40, ac: 0, armor: { dt: 0, dr: 0 }, skill: 50, damage: { min: 1, max: 2 }, experience: 0 };
const pistol: CreatureWeapon = { melee: false, range: 12, damage: { min: 3, max: 5 }, skill: 60, pause: 0.3, magazine: 50, reload: 0.9, spare: 50, sound: '' };
const field = buildLevel(
  parseLevelDef({
    id: 't',
    music: '',
    floor: 'floor',
    ceiling: 'ceiling',
    fade: 10,
    grid: ['########################', ...Array.from({ length: 12 }, () => '#......................#'), '########################'],
    entries: { s: { x: 1.5, y: 1.5, angle: 0 } },
  }),
);
const hero: Target = { x: 14.5, y: 6.5, alive: true };

function fight(c: Creature, seconds: number, each?: (t: number) => void): number {
  let fired = 0;
  for (let t = 0; t < seconds; t += 0.05) {
    each?.(t);
    c.update(0.05, field, hero, [c], () => {}, () => fired++);
  }
  return fired;
}

describe('enemy under fire', () => {
  it('weak hits every 0.6 seconds do not stop it shooting (before, each one cut the shot short)', () => {
    const c = new Creature(1, 6.5, 6.5, stats, art, true, 0, pistol);
    c.agility = 0;
    let shots = 0;
    const fired = fight(c, 8, (t) => {
      if (Math.floor(t / 0.6) !== Math.floor((t - 0.05) / 0.6) && c.hp > 5) {
        c.hurt(2);
        shots++;
      }
    });
    expect(shots).toBeGreaterThan(10);
    expect(fired).toBeGreaterThan(3);
  });

  it('a strong or critical hit stuns, but not more often than once every two seconds', () => {
    const c = new Creature(1, 6.5, 6.5, stats, art, true, 0, pistol);
    c.agility = 0;
    fight(c, 0.5);
    c.hurt(12);
    // Stunned: stands while the hit animation plays.
    expect(fight(c, 0.3)).toBe(0);
    c.hurt(1, true, true);
    fight(c, 0.3);
    // A second critical right after the first no longer stuns: it shoots.
    expect(fight(c, 2)).toBeGreaterThan(0);
  });

  it('dodging the aim: deathclaw after 1 s, humans after 5 s, agile ones (8+) after 3 s', () => {
    expect(dodgeAfter(true, 5)).toBe(DODGE.claw);
    expect(dodgeAfter(false, 5)).toBe(DODGE.person);
    expect(dodgeAfter(false, 8)).toBe(DODGE.nimble);
    // After how many seconds of being aimed at the enemy first dodges.
    const firstDash = (agility: number, deathclaw: boolean) => {
      const c = new Creature(1, 6.5, 6.5, stats, art, true, 0, { ...pistol, pause: 50 });
      c.agility = agility;
      c.deathclaw = deathclaw;
      fight(c, 0.3);
      let at = -1;
      fight(c, 7, (t) => {
        c.aimedAt += 0.05;
        if (at < 0 && (c as unknown as { dodgeLeft: number }).dodgeLeft > 0) at = t;
      });
      return at;
    };
    expect(firstDash(5, true)).toBeGreaterThan(0.9);
    expect(firstDash(5, true)).toBeLessThan(1.6);
    expect(firstDash(5, false)).toBeGreaterThan(4.9);
    expect(firstDash(9, false)).toBeGreaterThan(2.9);
    expect(firstDash(9, false)).toBeLessThan(3.6);
  });

  it('a bullet in the leg makes it limp: shorter steps', () => {
    const fast = new Creature(1, 2.5, 6.5, stats, art, true, 0, null);
    const lame = new Creature(2, 2.5, 6.5, stats, art, true, 0, null);
    lame.cripple();
    fast.agility = lame.agility = 0;
    fight(fast, 1);
    fight(lame, 1);
    expect(lame.x - 2.5).toBeLessThan((fast.x - 2.5) * 0.7);
  });

  it('a bullet in the arm makes it drop the weapon and fight bare-handed; a knife cannot be knocked out', () => {
    const c = new Creature(1, 6.5, 6.5, stats, art, true, 0, pistol);
    expect(c.disarm()).toBe(true);
    expect(c.weapon).toBeNull();
    expect(c.ranged).toBe(false);
    const knife = new Creature(2, 6.5, 6.5, stats, art, true, 0, { ...pistol, melee: true });
    expect(knife.disarm()).toBe(false);
  });
});

describe('hero', () => {
  const weapon = { pid: 8, type: 3, weapon: { minDamage: 5, maxDamage: 12, damageType: 0, range: 30, minStrength: 3, apCost: 5, apCostMode2: 5, caliber: 1, ammoPid: 29, capacity: 12, animationCode: 5 } as WeaponData } as ItemProto & { weapon: WeaponData };
  const ammo = { pid: 29, type: 4, ammo: { caliber: 1, quantity: 24 } } as ItemProto;
  const stimpak = { pid: 40, type: 2 } as ItemProto;

  it('in combat running spends AP instead of accumulating it; a jump costs JUMP_AP', () => {
    const h = new Hero({ weapon, ammo, stimpak });
    h.inCombat = true;
    h.ap = 5;
    h.exerting = true;
    h.update(1);
    expect(h.ap).toBeCloseTo(5 - RUN_AP);
    h.exerting = false;
    h.update(1);
    expect(h.ap).toBeGreaterThan(5 - RUN_AP);
    h.ap = JUMP_AP - 0.5;
    expect(h.canJump()).toBe(false);
    h.inCombat = false;
    expect(h.canJump()).toBe(true);
  });

  it('a critical hit cripples an arm or a leg; an arm means longer reloading', () => {
    const h = new Hero({ weapon, ammo, stimpak });
    const before = h.reloadTime;
    const first = h.takeDamage(1, { critical: true });
    const second = h.takeDamage(1, { critical: true });
    expect(new Set([first, second])).toEqual(new Set(['arm', 'leg']));
    expect(h.crippledArm && h.crippledLeg).toBe(true);
    expect(h.reloadTime).toBeGreaterThan(before);
    // Everything is crippled: nothing more.
    expect(h.takeDamage(1, { critical: true })).toBeNull();
  });

  it('a hit interrupts reloading: it starts over', () => {
    const h = new Hero({ weapon, ammo, stimpak });
    h.inventory.add(weapon, 1);
    h.inventory.add(ammo, 24);
    h.putInHand(1, weapon);
    h.magazine = 0;
    expect(h.reload()).toBe('started');
    h.update(h.reloadTime * 0.8);
    h.takeDamage(1, {});
    expect(h.reloadLeft).toBeCloseTo(h.reloadTime);
  });
});
