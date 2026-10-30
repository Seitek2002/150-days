import { describe, expect, it } from 'vitest';
import { ITEM_TYPE, type ItemProto } from '../src/formats/pro.ts';
import { SKILL, SKILL_COUNT, SKILL_MAX } from '../src/game/character.ts';
import { addCompanionXp, autoSpend, bestArmor, companionSkill, grownKind, newProgress, progressFrom, refundCompanionPoint, refundUnusable, spendCompanionPoint, usableSkills, wieldScore } from '../src/game/companion.ts';
import type { Fighter } from '../src/game/fighter.ts';
import type { CritterKind } from '../src/game/resources.ts';

const special = { strength: 6, perception: 6, endurance: 7, charisma: 5, intelligence: 5, agility: 6, luck: 5 };
const fighter = (): Fighter => ({
  special,
  skills: Array.from({ length: SKILL_COUNT }, (_, i) => (i === SKILL.smallGuns ? 60 : 20)),
  maxHp: 40,
  ac: 6,
  armor: { dt: 0, dr: 0 },
  critChance: 5,
  critPower: 2,
  maxAp: 8,
  meleeDamage: 1,
  healingRate: 1,
});
const pistol = { minDamage: 5, maxDamage: 12, damageType: 0, range: 25, minStrength: 3, apCost: 5, apCostMode2: 5, caliber: 1, ammoPid: 29, capacity: 12, animationCode: 5 };
const kind = (): CritterKind =>
  ({
    pid: 0x1000001,
    stats: { name: 'Ian', maxHp: 40, ac: 6, armor: { dt: 0, dr: 0 }, skill: 20, damage: { min: 1, max: 2 }, experience: 50 },
    art: {},
    soundBase: 'HMWARR',
    bites: false,
    weapon: { melee: false, range: 12, damage: { min: 5, max: 12 }, skill: 60, pause: 1, magazine: 12, reload: 2, spare: 24, sound: 'WAP1XXX1' },
    fighter: fighter(),
    weaponPid: 8,
  }) as unknown as CritterKind;
const armor = (pid: number, ac: number, dr: number, dt: number): ItemProto =>
  ({ pid, type: ITEM_TYPE.armor, armor: { armorClass: ac, damageResistance: [dr, 0, 0, 0, 0, 0, 0], damageThreshold: [dt, 0, 0, 0, 0, 0, 0], perk: -1, maleFid: 0, femaleFid: 0 } }) as unknown as ItemProto;

describe('companion growth', () => {
  it('experience by the hero\'s table: level, points 5 + 2×INT and health END/2 + 2', () => {
    const p = newProgress();
    expect(addCompanionXp(p, 999, special)).toBe(0);
    expect(addCompanionXp(p, 1, special)).toBe(1);
    expect(p).toMatchObject({ level: 2, xp: 1000, points: 15, hp: 5 });
    // The next level is from 3000.
    expect(addCompanionXp(p, 2000, special)).toBe(1);
    expect(p.level).toBe(3);
  });

  it('points only into combat skills and "First Aid"; taking back not below what it was', () => {
    const p = newProgress();
    p.points = 3;
    const base = fighter();
    expect(spendCompanionPoint(p, base, SKILL.barter)).toBe(false);
    expect(spendCompanionPoint(p, base, SKILL.smallGuns)).toBe(true);
    expect(companionSkill(base, p, SKILL.smallGuns)).toBe(61);
    expect(refundCompanionPoint(p, SKILL.smallGuns, new Array(SKILL_COUNT).fill(0))).toBe(true);
    expect(refundCompanionPoint(p, SKILL.smallGuns, new Array(SKILL_COUNT).fill(0))).toBe(false);
    expect(p.points).toBe(3);
  });

  it('"decide yourself": into the skill of the weapon in hand; at the limit, into "First Aid"', () => {
    const p = newProgress();
    const base = fighter();
    p.points = SKILL_MAX - 60 + 10;
    autoSpend(p, base, pistol);
    expect(companionSkill(base, p, SKILL.smallGuns)).toBe(SKILL_MAX);
    expect(p.skills[SKILL.firstAid]).toBe(10);
    expect(p.points).toBe(0);
  });

  it('the best armor by armor class and protection', () => {
    const leather = armor(1, 15, 25, 2);
    const jacket = armor(2, 8, 20, 0);
    expect(bestArmor([jacket, leather])?.pid).toBe(1);
    expect(bestArmor([])).toBeNull();
  });

  it('appearance with growth: health, weapon skill in hand and armor; the base does not change', () => {
    const k = kind();
    const p = newProgress();
    p.hp = 10;
    p.skills[SKILL.smallGuns] = 15;
    const grown = grownKind(k, p, armor(1, 15, 25, 2), pistol);
    expect(grown.stats.maxHp).toBe(50);
    expect(grown.weapon?.skill).toBe(75);
    expect(grown.fighter.ac).toBe(21);
    expect(grown.fighter.armor).toEqual({ dt: 2, dr: 25 });
    expect(k.stats.maxHp).toBe(40);
    expect(k.weapon?.skill).toBe(60);
  });

  it('from a save: what is missing takes the default', () => {
    const p = progressFrom({ xp: 1500, level: 2, skills: [5] });
    expect(p).toMatchObject({ xp: 1500, level: 2, points: 0, hp: 0 });
    expect(p.skills).toHaveLength(SKILL_COUNT);
    expect(p.skills[0]).toBe(5);
  });
});

describe('what suits the companion', () => {
  it('skills by the weapons it can hold: Ian (knife, pistol, SMG) has no use for heavy ones', () => {
    const ian = usableSkills(new Set([1, 5, 6]), false);
    expect(ian).toContain(SKILL.smallGuns);
    expect(ian).toContain(SKILL.energyWeapons);
    expect(ian).not.toContain(SKILL.bigGuns);
    // For Katja (knife, spear, SMG) laser pistols are no good either.
    const katja = usableSkills(new Set([1, 4, 6]), false);
    expect(katja).not.toContain(SKILL.energyWeapons);
    expect(katja).toContain(SKILL.melee);
    expect(usableSkills(new Set(), true)).toEqual([SKILL.unarmed]);
  });

  it('what was invested in a useless skill is returned', () => {
    const p = newProgress();
    p.skills[SKILL.bigGuns] = 12;
    expect(refundUnusable(p, usableSkills(new Set([5]), false))).toBe(12);
    expect(p.points).toBe(12);
    expect(p.skills[SKILL.bigGuns]).toBe(0);
  });

  it('with a trained energy weapons skill a laser pistol beats a 14 mm pistol', () => {
    const gun = (min: number, max: number, cap: number, damageType: number) =>
      ({ weapon: { minDamage: min, maxDamage: max, capacity: cap, range: 25, animationCode: 5, damageType } }) as unknown as ItemProto;
    const laser = gun(10, 22, 12, 1);
    const pistol14 = gun(12, 22, 6, 0);
    const f = fighter();
    f.skills[SKILL.smallGuns] = 60;
    f.skills[SKILL.energyWeapons] = 30;
    expect(wieldScore(pistol14, f)).toBeGreaterThan(wieldScore(laser, f));
    f.skills[SKILL.energyWeapons] = 110;
    expect(wieldScore(laser, f)).toBeGreaterThan(wieldScore(pistol14, f));
  });
});
