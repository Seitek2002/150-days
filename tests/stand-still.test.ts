// Peaceful critters stand in their places, as in the original: the hero's steps do not disturb them, even armed ones (guards, Skulls); at a shot
// an armed peaceful one goes to look, an unarmed one flees; an enemy goes to check steps too.
import { describe, expect, it } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import { buildLevel } from '../src/engine/level.ts';
import { Creature, type CreatureArt, type CreatureWeapon } from '../src/game/creature.ts';
import { parseLevelDef } from '../src/world/defs.ts';

const sheet: SpriteSheet = {
  fps: 10,
  actionFrame: 0,
  directions: Array.from({ length: 6 }, () => [{ width: 1, height: 1, pixels: new Uint32Array(1) }]),
  shifts: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  offsets: Array.from({ length: 6 }, () => [{ x: 0, y: 0 }]),
};
const art: CreatureArt = { stand: sheet, walk: sheet, attack: sheet, hit: sheet, death: sheet };
const stats = { name: 'Villager', maxHp: 20, ac: 0, armor: { dt: 0, dr: 0 }, skill: 30, damage: { min: 1, max: 2 }, experience: 0 };
const gun = { melee: false } as unknown as CreatureWeapon;
const field = buildLevel(
  parseLevelDef({
    id: 't',
    music: '',
    floor: 'floor',
    ceiling: 'ceiling',
    fade: 10,
    grid: ['####################', ...Array.from({ length: 10 }, () => '#..................#'), '####################'],
    entries: { s: { x: 1.5, y: 1.5, angle: 0 } },
  }),
);

describe('peaceful critters in their places', () => {
  it('the hero\'s steps do not disturb peaceful critters, even armed ones', () => {
    const guard = new Creature(1, 5.5, 5.5, stats, art, false, 0, gun);
    const peasant = new Creature(2, 7.5, 5.5, stats, art, false, 0, null);
    guard.hear(9.5, 5.5, false, field);
    peasant.hear(9.5, 5.5, false, field);
    expect(guard.searching).toBeNull();
    expect(peasant.searching).toBeNull();
    expect(peasant.waypoint).toBeNull();
  });

  it('at a shot an armed peaceful one goes to look, an unarmed one flees', () => {
    const guard = new Creature(1, 5.5, 5.5, stats, art, false, 0, gun);
    const peasant = new Creature(2, 7.5, 5.5, stats, art, false, 0, null);
    guard.hear(9.5, 5.5, true, field);
    peasant.hear(9.5, 5.5, true, field);
    expect(guard.searching).toEqual({ x: 9.5, y: 5.5, run: true });
    expect(peasant.waypoint).not.toBeNull();
  });

  it('at the hero\'s shot an armed peaceful one neither comes to him nor flees', () => {
    const guard = new Creature(1, 5.5, 5.5, stats, art, false, 0, gun);
    guard.hear(9.5, 5.5, true, field, true);
    expect(guard.searching).toBeNull();
    expect(guard.waypoint).toBeNull();
  });

  it('a companion keeps up with the hero no slower than he runs (bunny hop)', () => {
    const slow = new Creature(1, 2.5, 5.5, stats, art, false, 0);
    const fast = new Creature(2, 2.5, 7.5, stats, art, false, 0);
    for (let i = 0; i < 10; i++) {
      slow.followLeader(0.05, field, [], { x: 18.5, y: 5.5 });
      fast.followLeader(0.05, field, [], { x: 18.5, y: 7.5 }, 2.2, 12);
    }
    // A companion's normal run is 4.2 cells per second; behind a hero at 12 cells per second — more than 12.
    expect(slow.x - 2.5).toBeLessThan(2.2);
    expect(fast.x - 2.5).toBeGreaterThan(5.9);
  });

  it('a shooter companion backs away from a melee fighter and approaches a distant enemy', () => {
    const c = new Creature(1, 9.5, 5.5, stats, art, false, 0, gun);
    for (let i = 0; i < 10; i++) expect(c.backOff(0.05, field, [], { x: 8.5, y: 5.5 }, 4.4)).toBe(true);
    expect(c.x).toBeGreaterThan(11.5);
    // While backing away it faces the enemy.
    expect(Math.cos(c.facing)).toBeLessThan(-0.9);
    for (let i = 0; i < 10; i++) c.closeIn(0.05, field, [], { x: 18.5, y: 5.5 }, 4.4);
    expect(c.x).toBeGreaterThan(13.5);
  });

  it('a companion in the wasteland is knocked out by a lethal blow instead of dying', () => {
    const c = new Creature(1, 5.5, 5.5, stats, art, false, 0, gun);
    c.knockoutGuard = true;
    expect(c.hurt(100)).toBe(false);
    expect(c.unconscious).toBe(true);
    expect(c.alive).toBe(false);
    // Someone lying down is not hit any more.
    expect(c.hurt(5)).toBe(false);
    c.wake();
    expect(c.alive).toBe(true);
    expect(c.hp).toBe(1);
    c.knockoutGuard = false;
    expect(c.hurt(100)).toBe(true);
  });

  it('an enemy goes to check steps too', () => {
    const raider = new Creature(1, 5.5, 5.5, stats, art, true, 0, gun);
    raider.hear(9.5, 5.5, false, field);
    expect(raider.searching).toEqual({ x: 9.5, y: 5.5, run: false });
  });
});
