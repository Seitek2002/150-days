// People with weapons: shoot from afar while they see the hero, reload, go around walls; knife and club — up close.
import { describe, expect, it } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import { buildLevel } from '../src/engine/level.ts';
import { isMeleeWeapon, weaponArtLetter } from '../src/game/combat.ts';
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
const stats = { name: 'Bandit', maxHp: 20, ac: 0, armor: { dt: 0, dr: 0 }, skill: 30, damage: { min: 1, max: 2 }, experience: 0 };
const pistol: CreatureWeapon = { melee: false, range: 10, damage: { min: 5, max: 12 }, skill: 60, pause: 0.3, magazine: 3, reload: 2, spare: 30, sound: 'WAA1XXX1' };

const level = (grid: string[]) =>
  buildLevel(parseLevelDef({ id: 't', music: '', floor: 'floor', ceiling: 'ceiling', fade: 10, grid, entries: { s: { x: 1.5, y: 1.5, angle: 0 } } }));
const open = level(['##############', '#............#', '#............#', '#............#', '##############']);
// A wall in the middle with a passage at the bottom: the hero is not visible directly.
const walled = level(['##############', '#.....#......#', '#.....#......#', '#............#', '##############']);

/** Run a critter: how many shots and bites over time. */
function run(c: Creature, lvl: ReturnType<typeof level>, target: { x: number; y: number }, seconds: number) {
  let fired = 0;
  let bitten = 0;
  const times: number[] = [];
  for (let t = 0; t < seconds; t += 0.05) {
    c.update(0.05, lvl, { ...target, alive: true }, [c], () => bitten++, () => {
      fired++;
      times.push(t);
    });
  }
  return { fired, bitten, times };
}

describe('critter weapons: rules', () => {
  it('weapon letter in the images and melee', () => {
    expect(weaponArtLetter(0)).toBe('A');
    expect(weaponArtLetter(1)).toBe('D');
    expect(weaponArtLetter(5)).toBe('H');
    expect(weaponArtLetter(7)).toBe('J');
    expect(isMeleeWeapon(2)).toBe(true);
    expect(isMeleeWeapon(5)).toBe(false);
  });
});

describe('a critter with a pistol', () => {
  it('sees the hero within range — stands and shoots, after a "magazine" — reloads', () => {
    const c = new Creature(1, 2.5, 2.5, stats, art, true, 0, pistol);
    c.provoke();
    const { fired, times, bitten } = run(c, open, { x: 10.5, y: 2.5 }, 6);
    expect(bitten).toBe(0);
    expect(fired).toBeGreaterThanOrEqual(4);
    // Does not come up close: shoots almost in place (between shots it dodges with a step sideways — in an arc around the hero).
    expect(Math.hypot(10.5 - c.x, 2.5 - c.y)).toBeGreaterThan(6.5);
    // Between the third and fourth shot — a reload (2 s), between the others — a short pause.
    expect(times[3]! - times[2]!).toBeGreaterThan(1.9);
    expect(times[1]! - times[0]!).toBeLessThan(1);
  });

  it('the hero is not visible — does not shoot, goes around the wall and shoots once it sees him', () => {
    const c = new Creature(1, 2.5, 1.5, stats, art, true, 0, pistol);
    c.provoke();
    const first = run(c, walled, { x: 10.5, y: 1.5 }, 0.5);
    expect(first.fired).toBe(0);
    const later = run(c, walled, { x: 10.5, y: 1.5 }, 8);
    expect(later.fired).toBeGreaterThan(0);
  });

  it('far away (beyond weapon range) — comes closer', () => {
    const far: CreatureWeapon = { ...pistol, range: 3 };
    const c = new Creature(1, 1.5, 2.5, stats, art, true, 0, far);
    c.provoke();
    run(c, open, { x: 11.5, y: 2.5 }, 2);
    expect(c.x).toBeGreaterThan(3);
  });

  it('a knife hits up close like a bite instead of shooting', () => {
    const knife: CreatureWeapon = { ...pistol, melee: true, range: 1 };
    const c = new Creature(1, 2.5, 2.5, stats, art, true, 0, knife);
    c.provoke();
    const { fired, bitten } = run(c, open, { x: 3.1, y: 2.5 }, 3);
    expect(fired).toBe(0);
    expect(bitten).toBeGreaterThan(0);
  });
});
