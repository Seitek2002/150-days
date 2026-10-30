// AI-1: eyes, ears, memory. Enemies see by Perception and light, do not see through walls or behind them, remember where they saw
// the hero, go to check noise; peaceful people without weapons flee from shots; a sneaking hero is harder to notice.
import { describe, expect, it } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import { buildLevel } from '../src/engine/level.ts';
import { inFront, sightRange, stealthFactor } from '../src/game/ai/senses.ts';
import { Creature, type CreatureArt, type CreatureWeapon, type Target } from '../src/game/creature.ts';
import { parseLevelDef } from '../src/world/defs.ts';

const sheet: SpriteSheet = {
  fps: 10,
  actionFrame: 0,
  directions: Array.from({ length: 6 }, () => [{ width: 1, height: 1, pixels: new Uint32Array(1) }]),
  shifts: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  offsets: Array.from({ length: 6 }, () => [{ x: 0, y: 0 }]),
};
const art: CreatureArt = { stand: sheet, walk: sheet, attack: sheet, hit: sheet, death: sheet };
const stats = { name: 'Raider', maxHp: 30, ac: 0, armor: { dt: 0, dr: 0 }, skill: 50, damage: { min: 1, max: 2 }, experience: 0 };
const pistol: CreatureWeapon = { melee: false, range: 10, damage: { min: 3, max: 5 }, skill: 60, pause: 0.3, magazine: 12, reload: 0.9, spare: 24, sound: '' };
const level = (grid: string[]) =>
  buildLevel(parseLevelDef({ id: 't', music: '', floor: 'floor', ceiling: 'ceiling', fade: 10, grid, entries: { s: { x: 1.5, y: 1.5, angle: 0 } } }));
const field = level(['######################', ...Array.from({ length: 6 }, () => '#....................#'), '######################']);
// A wall with a passage at the bottom: you can hide behind it.
const walled = level(['######################', '#.........#..........#', '#.........#..........#', '#.........#..........#', '#....................#', '######################']);

const run = (c: Creature, lvl: ReturnType<typeof level>, target: Target, seconds: number, fire: () => void = () => {}) => {
  for (let t = 0; t < seconds; t += 0.05) c.update(0.05, lvl, target, [c], () => {}, fire);
};
const east = 0;
const west = Math.PI;

describe('eyes: rules', () => {
  it('far in front, almost point-blank behind; darkness and sneaking make it closer', () => {
    expect(sightRange(5, 1, true)).toBe(12.5);
    expect(sightRange(5, 1, false)).toBe(2.5);
    expect(sightRange(5, 0.4, true)).toBe(5);
    expect(sightRange(5, 1, true, 0.5)).toBe(6.25);
    expect(sightRange(1, 0.1, false)).toBe(1);
    expect(inFront(east, 5, 1)).toBe(true);
    expect(inFront(east, -5, 0)).toBe(false);
  });

  it('sneak: the skill hides, without it — as usual', () => {
    expect(stealthFactor(false, 100)).toBe(1);
    expect(stealthFactor(true, 0)).toBe(1);
    expect(stealthFactor(true, 100)).toBe(0.5);
    expect(stealthFactor(true, 150)).toBeCloseTo(1 / 3);
  });
});

describe('enemy eyes and memory', () => {
  it('sees 10 cells ahead by day but does not see someone behind', () => {
    const front = new Creature(1, 2.5, 3.5, stats, art, true, east, pistol);
    run(front, field, { x: 12.5, y: 3.5, alive: true }, 0.2);
    expect(front.chasing).toBe(true);
    const back = new Creature(1, 2.5, 3.5, stats, art, true, west, pistol);
    run(back, field, { x: 12.5, y: 3.5, alive: true }, 0.2);
    expect(back.chasing).toBe(false);
  });

  it('at night and when sneaking the hero is seen closer', () => {
    const night = new Creature(1, 2.5, 3.5, stats, art, true, east, pistol);
    run(night, field, { x: 12.5, y: 3.5, alive: true, light: 0.4 }, 0.2);
    expect(night.chasing).toBe(false);
    const sneaky = new Creature(1, 2.5, 3.5, stats, art, true, east, pistol);
    run(sneaky, field, { x: 10.5, y: 3.5, alive: true, stealth: 0.5 }, 0.2);
    expect(sneaky.chasing).toBe(false);
  });

  it('the hero hid behind a wall — the enemy does not shoot blindly, goes to where it saw him, looks around and calms down', () => {
    const c = new Creature(1, 2.5, 2.5, stats, art, true, east, pistol);
    run(c, walled, { x: 9.5, y: 2.5, alive: true }, 0.1);
    expect(c.chasing).toBe(true);
    let shots = 0;
    // The hero went behind the wall, far from where he was seen.
    run(c, walled, { x: 18.5, y: 1.5, alive: true }, 1.5, () => shots++);
    expect(c.chasing).toBe(false);
    expect(c.searching).toEqual({ x: 9.5, y: 2.5, run: true });
    run(c, walled, { x: 18.5, y: 1.5, alive: true }, 4, () => shots++);
    expect(shots).toBe(0);
    // Got there and is looking around.
    expect(Math.hypot(c.x - 9.5, c.y - 2.5)).toBeLessThan(1.2);
    expect(c.searching).not.toBeNull();
    run(c, walled, { x: 18.5, y: 1.5, alive: true }, 6);
    expect(c.searching).toBeNull();
  });
});

describe('ears', () => {
  it('an enemy hears a shot and goes to check', () => {
    const c = new Creature(1, 2.5, 3.5, stats, art, true, west, pistol);
    c.hear(15.5, 3.5, true, field);
    expect(c.searching).toMatchObject({ x: 15.5, y: 3.5 });
    run(c, field, { x: 30, y: 30, alive: false }, 0.1);
  });

  it('a peaceful one without a weapon flees from a shot, guards go to look', () => {
    const civil = new Creature(1, 5.5, 3.5, stats, art, false, east);
    civil.hear(4.5, 3.5, true, field);
    run(civil, field, { x: 30, y: 30, alive: true }, 4);
    expect(civil.x).toBeGreaterThan(9);
    const guard = new Creature(2, 5.5, 3.5, stats, art, false, east, pistol);
    guard.hear(15.5, 3.5, true, field);
    expect(guard.searching).toMatchObject({ x: 15.5, y: 3.5 });
  });

  it('alarm from allies: they call to where the hero is', () => {
    const c = new Creature(1, 2.5, 3.5, stats, art, true, west, pistol);
    c.alertTo(12.5, 3.5);
    expect(c.searching).toMatchObject({ x: 12.5, y: 3.5, run: true });
  });
});

describe('a peaceful critter notices the hero (guards demand putting the weapon away)', () => {
  const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const townsman = () => {
    const c = new Creature(1, 10.5, 3.5, stats, art, false, east);
    c.talks = true;
    return c;
  };

  it('the hero came from behind — the critter turns to him; he left — back to the post', () => {
    const c = townsman();
    run(c, field, { x: 6.5, y: 3.5, alive: true }, 2);
    expect(angle(c.facing)).toBeCloseTo(west, 1);
    run(c, field, { x: 20.5, y: 3.5, alive: true, stealth: 1 }, 0.05);
    run(c, field, { x: 1.5, y: 1.5, alive: true }, 2);
    expect(angle(c.facing)).toBeCloseTo(east, 1);
  });

  it('far away, behind a wall or sneaking — does not notice', () => {
    const far = townsman();
    run(far, field, { x: 1.5, y: 3.5, alive: true }, 2);
    expect(angle(far.facing)).toBeCloseTo(east, 5);
    const sneaky = townsman();
    run(sneaky, field, { x: 7.5, y: 3.5, alive: true, stealth: 0.5 }, 2);
    expect(angle(sneaky.facing)).toBeCloseTo(east, 5);
    const behindWall = new Creature(1, 12.5, 2.5, stats, art, false, east);
    behindWall.talks = true;
    run(behindWall, walled, { x: 8.5, y: 2.5, alive: true }, 2);
    expect(angle(behindWall.facing)).toBeCloseTo(east, 5);
  });
});
