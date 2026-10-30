// AI-0: the same fighter rules for the hero and NPCs (client decision: "NPCs work like the hero, only the numbers differ").
import { describe, expect, it } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import { buildLevel } from '../src/engine/level.ts';
import type { CritterProto, ItemProto } from '../src/formats/pro.ts';
import { SKILL, skillBase } from '../src/game/character.ts';
import { Creature, type CreatureArt, type CreatureWeapon } from '../src/game/creature.ts';
import { chanceToHit, characterFighter, critterFighter, drugHeal, strike, weaponSkillIndex } from '../src/game/fighter.ts';
import { defaultHeroCharacter } from '../src/game/hero.ts';
import { parseLevelDef } from '../src/world/defs.ts';

const proto = (stats: Partial<Record<number, number>>, skillPoints: number[] = []): CritterProto =>
  ({
    pid: 1,
    messageId: 0,
    fid: 0,
    stats: Array.from({ length: 36 }, (_, i) => stats[i] ?? (i < 7 ? 5 : 0)),
    skillPoints: Array.from({ length: 18 }, (_, i) => skillPoints[i] ?? 0),
    experience: 0,
    damageThreshold: [],
    damageResistance: [],
    headFid: -1,
    aiPacket: 0,
  }) as unknown as CritterProto;

describe('fighter from a character and from a prototype', () => {
  it('default hero: HP 30, AC 5, "Small Guns" 60% (tag skill), crit 5%', () => {
    const hero = characterFighter(defaultHeroCharacter());
    expect(hero.maxHp).toBe(30);
    expect(hero.ac).toBe(5);
    expect(hero.skills[SKILL.smallGuns]).toBe(skillBase(characterFighter(defaultHeroCharacter()).special, SKILL.smallGuns) + 20);
    expect(hero.skills[SKILL.smallGuns]).toBe(60);
    expect(hero.critChance).toBe(5);
  });

  it('NPC: stats, skills and armor come from the prototype', () => {
    const npc = critterFighter(proto({ 1: 8, 5: 7, 7: 40, 9: 12, 15: 9, 17: 3, 24: 20 }, [30]));
    expect(npc.special.perception).toBe(8);
    expect(npc.maxHp).toBe(40);
    expect(npc.ac).toBe(12);
    expect(npc.critChance).toBe(9);
    expect(npc.armor).toEqual({ dt: 3, dr: 20 });
    // "Small Guns": the same Agility formula as for the hero, plus points from the prototype.
    expect(npc.skills[SKILL.smallGuns]).toBe(skillBase(npc.special, SKILL.smallGuns) + 30);
    expect(npc.skills[SKILL.smallGuns]).toBeGreaterThan(characterFighter(defaultHeroCharacter()).skills[SKILL.smallGuns]! - 20);
  });

  it('weapon → skill', () => {
    expect(weaponSkillIndex(undefined)).toBe(SKILL.unarmed);
    expect(weaponSkillIndex({ animationCode: 5, range: 25, damageType: 0 } as never)).toBe(SKILL.smallGuns);
    expect(weaponSkillIndex({ animationCode: 1, range: 1, damageType: 0 } as never)).toBe(SKILL.melee);
    expect(weaponSkillIndex({ animationCode: 8, range: 30, damageType: 0 } as never)).toBe(SKILL.bigGuns);
    expect(weaponSkillIndex({ animationCode: 7, range: 30, damageType: 1 } as never)).toBe(SKILL.energyWeapons);
  });

  it('heavy by the prototype flag, as in the original (2026-10-27: the plasma rifle counted as a heavy weapon)', () => {
    // Plasma rifle: "heavy" animation (8), no flag, plasma damage.
    expect(weaponSkillIndex({ animationCode: 8, range: 30, damageType: 3, bigGun: false } as never)).toBe(SKILL.energyWeapons);
    // Gatling laser: minigun animation (9), no flag, laser damage.
    expect(weaponSkillIndex({ animationCode: 9, range: 30, damageType: 1, bigGun: false } as never)).toBe(SKILL.energyWeapons);
    // Minigun and flamer: the flag is set.
    expect(weaponSkillIndex({ animationCode: 9, range: 30, damageType: 0, bigGun: true } as never)).toBe(SKILL.bigGuns);
    expect(weaponSkillIndex({ animationCode: 8, range: 5, damageType: 2, bigGun: true } as never)).toBe(SKILL.bigGuns);
  });
});

describe('the same formulas for everyone', () => {
  const sharp = critterFighter(proto({ 1: 9 }));
  const blind = critterFighter(proto({ 1: 2 }));

  it('Perception improves accuracy at range, the same for any shooter', () => {
    const target = { ac: 5 };
    expect(chanceToHit(sharp, 70, target, 3)).toBe(65);
    expect(chanceToHit(sharp, 70, target, 8)).toBeGreaterThan(chanceToHit(blind, 70, target, 8));
    // Point-blank, Perception does not matter.
    expect(chanceToHit(sharp, 70, target, 1)).toBe(chanceToHit(blind, 70, target, 1));
    expect(chanceToHit(blind, 70, target, 30)).toBe(5);
  });

  it('a hit: a crit by the attacker\'s Luck doubles damage, the target\'s armor is subtracted', () => {
    const always = () => 0;
    const hit = strike({ critChance: 50 }, { min: 10, max: 10 }, { armor: { dt: 2, dr: 50 } }, always);
    expect(hit.critical).toBe(true);
    expect(hit.damage).toBe(9);
    expect(strike({ critChance: 0 }, { min: 10, max: 10 }, { armor: { dt: 0, dr: 0 } }, always)).toEqual({ damage: 10, critical: false });
  });

  it('a stimpak heals the same: from the drug data', () => {
    expect(drugHeal({ stats: [-2, 35, -1], amounts: [10, 20, 0] }, () => 0)).toBe(10);
  });
});

const sheet: SpriteSheet = {
  fps: 10,
  actionFrame: 0,
  directions: Array.from({ length: 6 }, () => [{ width: 1, height: 1, pixels: new Uint32Array(1) }]),
  shifts: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  offsets: Array.from({ length: 6 }, () => [{ x: 0, y: 0 }]),
};
const art: CreatureArt = { stand: sheet, walk: sheet, attack: sheet, hit: sheet, death: sheet };
const stats = { name: 'Raider', maxHp: 30, ac: 0, armor: { dt: 0, dr: 0 }, skill: 50, damage: { min: 1, max: 2 }, experience: 0 };
const room = buildLevel(
  parseLevelDef({ id: 't', music: '', floor: 'floor', ceiling: 'ceiling', fade: 10, grid: ['##########', '#........#', '#........#', '##########'], entries: { s: { x: 1.5, y: 1.5, angle: 0 } } }),
);

describe('an NPC runs out of everything just like the hero', () => {
  it('ammo: magazine + reserve, then bare hands', () => {
    const w: CreatureWeapon = { melee: false, range: 10, damage: { min: 3, max: 5 }, skill: 60, pause: 0.1, magazine: 2, reload: 0.3, spare: 2, sound: '' };
    const c = new Creature(1, 1.5, 1.5, stats, art, true, 0, w);
    c.provoke();
    let fired = 0;
    for (let t = 0; t < 20; t += 0.05) c.update(0.05, room, { x: 7.5, y: 1.5, alive: true }, [c], () => {}, () => fired++);
    expect(fired).toBe(4);
    expect(c.ranged).toBe(false);
    expect(c.ammo).toEqual({ rounds: 0, spare: 0 });
  });

  it('badly wounded: injects a stimpak from the inventory (once, if there is only one)', () => {
    const c = new Creature(1, 1.5, 1.5, stats, art, true, 0);
    const stimpak = { pid: 40, messageId: 0, fid: 0, type: 2, weight: 0, cost: 0, inventoryFid: 0, drug: { stats: [-2, 35, -1], amounts: [10, 10, 0] } } as unknown as ItemProto;
    c.inventory.add(stimpak, 1);
    c.hurt(25, false);
    const healed: number[] = [];
    for (let t = 0; t < 3; t += 0.05) c.update(0.05, room, { x: 8.5, y: 2.5, alive: true }, [c], () => {}, () => {}, (_c, n) => healed.push(n));
    expect(healed).toEqual([10]);
    expect(c.hp).toBe(15);
    expect(c.inventory.count(40)).toBe(0);
  });
});

describe('stats in real time', () => {
  it('Agility speeds up reloading and gives a dodge up close; Strength below the requirement is an accuracy penalty; sharp sight reveals the map further', async () => {
    const { agilityTime, meleeDodge, strengthPenalty, revealRadius } = await import('../src/game/fighter.ts');
    expect(agilityTime(5)).toBe(1);
    expect(agilityTime(10)).toBeCloseTo(0.75);
    expect(agilityTime(1)).toBeCloseTo(1.2);
    expect(meleeDodge(4)).toBe(0);
    expect(meleeDodge(10)).toBe(18);
    expect(strengthPenalty(4, 6)).toBe(40);
    expect(strengthPenalty(8, 6)).toBe(0);
    expect(revealRadius(7)).toBe(1);
    expect(revealRadius(8)).toBe(2);
  });
});
