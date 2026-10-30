// A companion shoots ammo from its own items (the hero gives them via "Steal"): the magazine loads from the items; when they run out
// it fights bare-handed until given more; on saving, the rounds in the magazine are not lost.
import { describe, expect, it } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import type { ItemProto } from '../src/formats/pro.ts';
import { Creature, type CreatureArt, type CreatureWeapon } from '../src/game/creature.ts';

const sheet: SpriteSheet = {
  fps: 10,
  actionFrame: 0,
  directions: Array.from({ length: 6 }, () => [{ width: 1, height: 1, pixels: new Uint32Array(1) }]),
  shifts: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  offsets: Array.from({ length: 6 }, () => [{ x: 0, y: 0 }]),
};
const art: CreatureArt = { stand: sheet, walk: sheet, attack: sheet, hit: sheet, death: sheet };
const stats = { name: 'Ian', maxHp: 50, ac: 0, armor: { dt: 0, dr: 0 }, skill: 50, damage: { min: 1, max: 2 }, experience: 0 };
const pistol: CreatureWeapon = { melee: false, range: 10, damage: { min: 5, max: 12 }, skill: 85, pause: 0.3, magazine: 12, reload: 0.9, spare: 36, sound: '' };
const ammo = { pid: 29, messageId: 0, fid: 0, type: 4, weight: 0, cost: 0, inventoryFid: 0 } as ItemProto;

describe('companion ammo', () => {
  it('the magazine loads from its items, the rest stays in the items', () => {
    const ian = new Creature(1, 1.5, 1.5, stats, art, false, 0, pistol);
    ian.inventory.add(ammo, 20);
    ian.rearm(pistol, art, ammo);
    expect(ian.ammo).toEqual({ rounds: 12, spare: 8 });
    expect(ian.inventory.count(29)).toBe(8);
    expect(ian.ranged).toBe(true);
  });

  it('no ammo: fights bare-handed; on saving, the rounds in the magazine count as items', () => {
    const ian = new Creature(1, 1.5, 1.5, stats, art, false, 0, pistol);
    ian.rearm(pistol, art, ammo);
    expect(ian.ranged).toBe(false);
    ian.inventory.add(ammo, 5);
    ian.rearm(pistol, art, ammo);
    expect(ian.ammo).toEqual({ rounds: 5, spare: 0 });
    expect(ian.carried).toEqual([[29, 5]]);
  });

  it('switching weapons returns the loaded rounds to the items', () => {
    const ian = new Creature(1, 1.5, 1.5, stats, art, false, 0, pistol);
    ian.inventory.add(ammo, 20);
    ian.rearm(pistol, art, ammo);
    ian.rearm(null, art, null);
    expect(ian.inventory.count(29)).toBe(20);
  });
});
