// Enemy grenades: a shooter with a grenade in its items throws it at the hero at medium range, shouting "Grenade!";
// it does not throw when its own are near the hero, or when the hero is too close.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import { buildLevel } from '../src/engine/level.ts';
import type { ItemProto } from '../src/formats/pro.ts';
import { isGrenade } from '../src/game/combat.ts';
import { Creature, type BarkKey, type CreatureArt, type CreatureWeapon } from '../src/game/creature.ts';
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
const field = buildLevel(
  parseLevelDef({
    id: 't',
    music: '',
    floor: 'floor',
    ceiling: 'ceiling',
    fade: 10,
    grid: ['########################', ...Array.from({ length: 10 }, () => '#......................#'), '########################'],
    entries: { s: { x: 1.5, y: 1.5, angle: 0 } },
  }),
);
const grenade = { pid: 25, weapon: { minDamage: 20, maxDamage: 35, damageType: 6, range: 15, minStrength: 3, apCost: 4, apCostMode2: 4, caliber: 0, ammoPid: -1, capacity: 0, projectilePid: 0x05000001 } } as unknown as ItemProto;

function fight(heroAt: { x: number; y: number }, others: Creature[] = []) {
  const c = new Creature(1, 3.5, 5.5, stats, art, true, 0, pistol);
  c.talks = true;
  c.inventory.add(grenade, 2);
  const thrown: { x: number; y: number }[] = [];
  const barks: BarkKey[] = [];
  for (let t = 0; t < 20; t += 0.05) {
    c.update(0.05, field, { ...heroAt, alive: true }, [c, ...others], () => {}, () => {}, () => {}, (_c, x, y) => thrown.push({ x, y }));
    const b = c.takeBark();
    if (b) barks.push(b);
  }
  return { thrown, barks, left: c.inventory.items.find((s) => s.proto.pid === grenade.pid)?.count ?? 0 };
}

afterEach(() => vi.restoreAllMocks());

describe('enemy grenades', () => {
  it('a grenade is a thrown weapon with damage', () => {
    expect(isGrenade(grenade)).toBe(true);
    expect(isGrenade({ weapon: { capacity: 12, range: 20, maxDamage: 10, damageType: 0, projectilePid: 0 } })).toBe(false);
  });

  it('at medium range it throws at the hero and shouts', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const r = fight({ x: 9.5, y: 5.5 });
    expect(r.thrown.length).toBeGreaterThan(0);
    expect(r.thrown[0]!.x).toBeCloseTo(9.5, 0);
    expect(r.barks).toContain('grenade');
    expect(r.left).toBeLessThan(2);
  });

  it('one of its own near the hero: does not throw', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const friend = new Creature(2, 9.5, 6.5, stats, art, true, 0, null);
    expect(fight({ x: 9.5, y: 5.5 }, [friend]).thrown).toHaveLength(0);
  });

  it('the hero point-blank: does not throw (it would hit itself)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    expect(fight({ x: 5, y: 5.5 }).thrown).toHaveLength(0);
  });
});
