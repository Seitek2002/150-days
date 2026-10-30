// Telegraph before an enemy attack (client, 2026-10-30): the creature freezes in its attack pose, the hero can dodge or walk through it;
// enemy bullets hit by where the hero is, not by a hidden roll. Also: ammo weighs per round and half as much as in the original.
import { describe, expect, it } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import { buildLevel } from '../src/engine/level.ts';
import { HERO_HALF_WIDTH, leadShare, shotHits, TELEGRAPH } from '../src/game/combat.ts';
import { Creature, type CreatureArt, type CreatureWeapon } from '../src/game/creature.ts';
import { AMMO_WEIGHT, stackWeight } from '../src/game/inventory.ts';
import { clickSfx } from '../src/game/resources.ts';
import { ITEM_TYPE, type ItemProto } from '../src/formats/pro.ts';
import { parseLevelDef } from '../src/world/defs.ts';

const frame = { width: 1, height: 1, pixels: new Uint32Array(1) };
const sheet = (frames: number, actionFrame = 0): SpriteSheet => ({
  fps: 10,
  actionFrame,
  directions: Array.from({ length: 6 }, () => Array.from({ length: frames }, () => frame)),
  shifts: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  offsets: Array.from({ length: 6 }, () => Array.from({ length: frames }, () => ({ x: 0, y: 0 }))),
});
const art: CreatureArt = { stand: sheet(1), walk: sheet(1), attack: sheet(4, 2), hit: sheet(1), death: sheet(1) };
const stats = { name: 'Bandit', maxHp: 20, ac: 0, armor: { dt: 0, dr: 0 }, skill: 30, damage: { min: 1, max: 2 }, experience: 0 };
const pistol: CreatureWeapon = { melee: false, range: 10, damage: { min: 5, max: 12 }, skill: 60, pause: 0.3, magazine: 9, reload: 2, spare: 30, sound: 'WAA1XXX1' };
const open = buildLevel(
  parseLevelDef({ id: 't', music: '', floor: 'floor', ceiling: 'ceiling', fade: 10, grid: ['##############', '#............#', '#............#', '#............#', '##############'], entries: { s: { x: 1.5, y: 1.5, angle: 0 } } }),
);

describe('enemy bullets: by position, not by a roll', () => {
  it('a hero standing on the aim line is hit with the original chance', () => {
    let hits = 0;
    for (let i = 0; i < 1000; i++) if (shotHits(0, 0, 5, 0, 5, 0, 0.4, () => i / 1000)) hits++;
    expect(hits / 1000).toBeCloseTo(0.4, 1);
  });

  it('a hero who stepped out of the line by more than the scatter is never hit', () => {
    const scatter = HERO_HALF_WIDTH / 0.4;
    for (let i = 0; i <= 100; i++) expect(shotHits(0, 0, 5, 0, 5, scatter + HERO_HALF_WIDTH + 0.01, 0.4, () => i / 100)).toBe(false);
  });

  it('a hero behind the shooter (walked through it) is not hit', () => {
    expect(shotHits(0, 0, 5, 0, -1, 0, 0.95, () => 0.5)).toBe(false);
  });

  it('a skilled shooter leads more', () => {
    expect(leadShare(30)).toBeCloseTo(0.3);
    expect(leadShare(150)).toBe(1);
  });
});

describe('telegraph: the creature freezes before attacking', () => {
  /** Runs a shooter at the hero; returns when it fired (seconds) and where it aimed. */
  function shoot(target: { x: number; y: number; vx?: number; vy?: number }, windup: number) {
    const c = new Creature(1, 2.5, 2.5, stats, art, true, 0, pistol);
    c.provoke();
    c.reaction = 0;
    c.windup = windup;
    let firedAt = -1;
    let frozen = false;
    let aim: { x: number; y: number } | null = null;
    for (let t = 0; t < 3 && firedAt < 0; t += 0.02) {
      c.update(0.02, open, { ...target, alive: true }, [c], () => {}, (cr) => {
        firedAt = t;
        aim = cr.aimAt;
      });
      if (c.windingUp) frozen = true;
    }
    return { firedAt, frozen, aim: aim as { x: number; y: number } | null };
  }

  it('without a freeze shoots sooner than with one, by about the freeze time', () => {
    const quick = shoot({ x: 9.5, y: 2.5 }, 0);
    const slow = shoot({ x: 9.5, y: 2.5 }, TELEGRAPH.windup);
    expect(quick.frozen).toBe(false);
    expect(slow.frozen).toBe(true);
    expect(slow.firedAt - quick.firedAt).toBeGreaterThan(TELEGRAPH.windup - 0.1);
  });

  it('reports the freeze once, so the scene clicks the warning sound once per attack', () => {
    const c = new Creature(1, 2.5, 2.5, stats, art, true, 0, pistol);
    c.provoke();
    c.reaction = 0;
    c.windup = TELEGRAPH.windup;
    let clicks = 0;
    let shots = 0;
    for (let t = 0; t < 3; t += 0.02) {
      c.update(0.02, open, { x: 9.5, y: 2.5, alive: true }, [c], () => {}, () => shots++);
      if (c.takeWindup()) clicks++;
    }
    expect(shots).toBeGreaterThan(0);
    expect(clicks - shots).toBeGreaterThanOrEqual(0);
    expect(clicks - shots).toBeLessThanOrEqual(1);
  });

  it('locks its aim when the freeze begins and leads a moving hero by its skill', () => {
    const { aim } = shoot({ x: 9.5, y: 2.5, vx: 0, vy: 2 }, TELEGRAPH.windup);
    expect(aim).not.toBeNull();
    expect(aim!.x).toBeCloseTo(9.5);
    // Leads 60% of the movement over the freeze and one frame: 2 × 0.6 × 0.6 = 0.72 cells.
    expect(aim!.y - 2.5).toBeCloseTo(2 * leadShare(pistol.skill) * (TELEGRAPH.windup + 0.1), 2);
  });
});

describe('ammo weight', () => {
  const box = (weight: number, quantity: number): ItemProto => ({ pid: 40, type: ITEM_TYPE.ammo, weight, ammo: { caliber: 5, quantity } }) as unknown as ItemProto;
  it('a round weighs box / rounds in the box, halved', () => {
    expect(stackWeight(box(2, 50), 50)).toBeCloseTo(2 * AMMO_WEIGHT);
    expect(stackWeight(box(1, 24), 12)).toBeCloseTo(0.25);
  });
  it('other items weigh as before', () => {
    const rifle = { pid: 10, type: ITEM_TYPE.weapon, weight: 9 } as unknown as ItemProto;
    expect(stackWeight(rifle, 2)).toBe(18);
  });
});

describe('the warning click', () => {
  it('firearms click with their own sound, everything else like the 10mm pistol', () => {
    expect(clickSfx(pistol)).toBe('WOA1XXX1');
    expect(clickSfx({ melee: false, sound: 'WAG1XXX1' })).toBe('WOG1XXX1');
    expect(clickSfx({ melee: true, sound: 'WA31XXX1' })).toBe('WOA1XXX1');
    expect(clickSfx(null)).toBe('WOA1XXX1');
  });
});
