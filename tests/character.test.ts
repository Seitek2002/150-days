// Character rules: checked on numbers that can be computed by hand. The last block reads TRAIT.MSG from the game copy (no copy: skipped).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  addSkillPoints,
  canRaiseSkill,
  creationPointsLeft,
  defaultSpecial,
  derivedStats,
  experienceToNextLevel,
  isNight,
  isValidSpecial,
  isValidTagged,
  isValidTraits,
  levelForExperience,
  levelUp,
  newCharacter,
  SKILL,
  skillLevel,
  specialLevel,
  specialTotal,
  TRAIT,
  traitDescription,
  traitName,
  TRAIT_COUNT,
  type Character,
  type Special,
} from '../src/game/character.ts';
import { parseMsg } from '../src/formats/text.ts';

/** A character from stats (in order: STR PER END CHA INT AGI LCK) and traits. */
function make(stats: [number, number, number, number, number, number, number], traits: number[] = [], tagged: number[] = []): Character {
  const [strength, perception, endurance, charisma, intelligence, agility, luck] = stats;
  const special: Special = { strength, perception, endurance, charisma, intelligence, agility, luck };
  return { ...newCharacter(), special, traits, tagged };
}

describe('stats at creation', () => {
  it('by default all 5, sum 35: 5 points left', () => {
    const special = defaultSpecial();
    expect(specialTotal(special)).toBe(35);
    expect(creationPointsLeft(special)).toBe(5);
    expect(isValidSpecial(special)).toBe(false);
  });

  it('done: each from 1 to 10 and the sum exactly 40', () => {
    expect(isValidSpecial(make([6, 6, 6, 5, 5, 6, 6]).special)).toBe(true);
    expect(isValidSpecial(make([10, 1, 10, 1, 1, 10, 7]).special)).toBe(true);
    expect(isValidSpecial(make([11, 1, 10, 1, 1, 9, 7]).special)).toBe(false);
    expect(isValidSpecial(make([0, 2, 10, 1, 1, 10, 16]).special)).toBe(false);
    expect(isValidSpecial(make([6, 6, 6, 5, 5, 6, 7]).special)).toBe(false);
    expect(creationPointsLeft(make([6, 6, 6, 5, 5, 6, 7]).special)).toBe(-1);
    expect(isValidSpecial(make([5.5, 5.5, 6, 5, 5, 6, 7]).special)).toBe(false);
  });

  it('traits: up to two, real ones, no repeats', () => {
    expect(isValidTraits([])).toBe(true);
    expect(isValidTraits([TRAIT.finesse, TRAIT.skilled])).toBe(true);
    expect(isValidTraits([0, 1, 2])).toBe(false);
    expect(isValidTraits([3, 3])).toBe(false);
    expect(isValidTraits([16])).toBe(false);
    expect(isValidTraits([-1])).toBe(false);
  });

  it('tag skills: three different real ones', () => {
    expect(isValidTagged([0, 3, 17])).toBe(true);
    expect(isValidTagged([0, 3])).toBe(false);
    expect(isValidTagged([0, 3, 3])).toBe(false);
    expect(isValidTagged([0, 3, 18])).toBe(false);
    expect(isValidTagged([0, 3, 17, 4], 4)).toBe(true);
  });
});

describe('all fives', () => {
  const hero = make([5, 5, 5, 5, 5, 5, 5], [], [SKILL.smallGuns, SKILL.speech, SKILL.lockpick]);

  it('HP 30, AP 7, AC 5 and the rest', () => {
    expect(derivedStats(hero)).toEqual({
      maxHp: 30,
      maxAp: 7,
      armorClass: 5,
      // Carry weight is double the original (client, 2026-10-29).
      carryWeight: 300,
      meleeDamage: 1,
      sequence: 10,
      healingRate: 1,
      criticalChance: 5,
      betterCriticals: 0,
      radiationResistance: 10,
      poisonResistance: 25,
    });
  });

  it('small guns 40, and as a tag skill 60', () => {
    expect(skillLevel(newCharacter(), SKILL.smallGuns)).toBe(40);
    expect(skillLevel(hero, SKILL.smallGuns)).toBe(60);
  });

  it('skills by the reference formulas', () => {
    const plain = newCharacter();
    const expected: Record<number, number> = {
      [SKILL.smallGuns]: 40,
      [SKILL.bigGuns]: 15,
      [SKILL.energyWeapons]: 15,
      [SKILL.unarmed]: 70,
      [SKILL.melee]: 60,
      [SKILL.throwing]: 45,
      [SKILL.firstAid]: 35,
      [SKILL.doctor]: 20,
      [SKILL.sneak]: 30,
      [SKILL.lockpick]: 25,
      [SKILL.steal]: 25,
      [SKILL.traps]: 25,
      [SKILL.science]: 35,
      [SKILL.repair]: 25,
      [SKILL.speech]: 35,
      [SKILL.barter]: 30,
      [SKILL.gambling]: 35,
      [SKILL.outdoorsman]: 10,
    };
    for (const [skill, value] of Object.entries(expected)) expect(skillLevel(plain, Number(skill)), `skill ${skill}`).toBe(value);
  });

  it('a point invested in a tag skill counts twice, in an ordinary one once', () => {
    const points = new Array<number>(18).fill(0);
    points[SKILL.smallGuns] = 10;
    points[SKILL.sneak] = 10;
    const built = { ...hero, skillPoints: points };
    expect(skillLevel(built, SKILL.smallGuns)).toBe(40 + 10 + 20 + 10);
    expect(skillLevel(built, SKILL.sneak)).toBe(30 + 10);
  });

  it('a skill is not above 200, and no more can be invested', () => {
    const points = new Array<number>(18).fill(0);
    points[SKILL.smallGuns] = 150;
    points[SKILL.melee] = 139;
    const built = { ...hero, skillPoints: points };
    expect(skillLevel(built, SKILL.smallGuns)).toBe(200);
    expect(canRaiseSkill(built, SKILL.smallGuns)).toBe(false);
    expect(skillLevel(built, SKILL.melee)).toBe(60 + 139);
    expect(canRaiseSkill(built, SKILL.melee)).toBe(true);
    expect(canRaiseSkill(built, 18)).toBe(false);
  });
});

describe('extreme values', () => {
  it('all ones', () => {
    const hero = make([1, 1, 1, 1, 1, 1, 1]);
    expect(derivedStats(hero)).toMatchObject({
      maxHp: 18,
      maxAp: 5,
      armorClass: 1,
      carryWeight: 100,
      meleeDamage: 1,
      sequence: 2,
      healingRate: 1,
      criticalChance: 1,
      radiationResistance: 2,
      poisonResistance: 5,
    });
    expect(skillLevel(hero, SKILL.smallGuns)).toBe(36);
    expect(skillLevel(hero, SKILL.unarmed)).toBe(66);
    expect(skillLevel(hero, SKILL.outdoorsman)).toBe(6);
  });

  it('all tens', () => {
    const hero = make([10, 10, 10, 10, 10, 10, 10]);
    expect(derivedStats(hero)).toMatchObject({
      maxHp: 45,
      maxAp: 10,
      armorClass: 10,
      carryWeight: 550,
      meleeDamage: 5,
      sequence: 20,
      healingRate: 3,
      criticalChance: 10,
      radiationResistance: 20,
      poisonResistance: 50,
    });
    expect(skillLevel(hero, SKILL.smallGuns)).toBe(45);
    expect(skillLevel(hero, SKILL.gambling)).toBe(50);
    expect(skillLevel(hero, SKILL.science)).toBe(45);
  });

  it('an allowed "extreme" build: strength, endurance and agility at 10', () => {
    const hero = make([10, 1, 10, 1, 1, 10, 7]);
    expect(isValidSpecial(hero.special)).toBe(true);
    expect(derivedStats(hero)).toMatchObject({ maxHp: 45, maxAp: 10, armorClass: 10, sequence: 2, healingRate: 3 });
  });

  it('stats with traits stay within 1…10', () => {
    expect(specialLevel(make([10, 10, 10, 10, 10, 10, 10], [TRAIT.gifted]), 'strength')).toBe(10);
    expect(specialLevel(make([9, 5, 5, 5, 5, 5, 5], [TRAIT.bruiser]), 'strength')).toBe(10);
    expect(specialLevel(make([5, 1, 5, 5, 1, 5, 5], [TRAIT.nightPerson]), 'perception', 12)).toBe(1);
  });
});

describe('traits', () => {
  const base = (traits: number[]) => make([5, 5, 5, 5, 5, 5, 5], traits);

  it('Bruiser: strength +2, AP −2, health unchanged', () => {
    const hero = base([TRAIT.bruiser]);
    expect(specialLevel(hero, 'strength')).toBe(7);
    expect(derivedStats(hero)).toMatchObject({ maxHp: 30, maxAp: 5, meleeDamage: 2, carryWeight: 400 });
  });

  it('Small Frame: agility +1, but carry weight 20 less per point of strength (doubled, like all carry weight)', () => {
    const hero = base([TRAIT.smallFrame]);
    expect(derivedStats(hero)).toMatchObject({ maxAp: 8, armorClass: 6, carryWeight: 200 });
  });

  it('Kamikaze: no armor at all, but moves earlier', () => {
    expect(derivedStats(base([TRAIT.kamikaze]))).toMatchObject({ armorClass: 0, sequence: 15 });
  });

  it('Heavy Handed: damage +4, but criticals 30 lower', () => {
    expect(derivedStats(base([TRAIT.heavyHanded]))).toMatchObject({ meleeDamage: 5, betterCriticals: -30 });
  });

  it('Finesse: crit chance +10', () => {
    expect(derivedStats(base([TRAIT.finesse]))).toMatchObject({ criticalChance: 15 });
  });

  it('Fast Metabolism: healing +2, radiation and poisons hit without resistance', () => {
    expect(derivedStats(base([TRAIT.fastMetabolism]))).toMatchObject({ healingRate: 3, radiationResistance: 0, poisonResistance: 0 });
  });

  it('Gifted: all stats +1 and all skills −10; skill points and health from the raw stats', () => {
    const hero = base([TRAIT.gifted]);
    expect(specialLevel(hero, 'luck')).toBe(6);
    expect(skillLevel(hero, SKILL.smallGuns)).toBe(35 + 6 - 10);
    expect(derivedStats(hero).maxHp).toBe(30);
    expect(derivedStats(hero)).toMatchObject({ maxAp: 8, armorClass: 6, criticalChance: 6 });
  });

  it('Skilled: all skills +10', () => {
    expect(skillLevel(base([TRAIT.skilled]), SKILL.smallGuns)).toBe(50);
  });

  it('Good Natured: combat skills −10, first aid, doctor, speech and barter +15', () => {
    const hero = base([TRAIT.goodNatured]);
    expect(skillLevel(hero, SKILL.smallGuns)).toBe(30);
    expect(skillLevel(hero, SKILL.throwing)).toBe(35);
    expect(skillLevel(hero, SKILL.firstAid)).toBe(50);
    expect(skillLevel(hero, SKILL.barter)).toBe(45);
    expect(skillLevel(hero, SKILL.sneak)).toBe(30);
  });

  it('Night Person: at night perception and intelligence +1, by day −1', () => {
    const hero = base([TRAIT.nightPerson]);
    expect(specialLevel(hero, 'perception', 12)).toBe(4);
    expect(specialLevel(hero, 'intelligence', 12)).toBe(4);
    expect(specialLevel(hero, 'perception', 22)).toBe(6);
    expect(specialLevel(hero, 'perception', 3)).toBe(6);
    expect(specialLevel(hero, 'strength', 22)).toBe(5);
    expect(derivedStats(hero, 22).sequence).toBe(12);
    expect(derivedStats(hero, 12).sequence).toBe(8);
    expect(skillLevel(hero, SKILL.science, 22)).toBe(25 + 12);
    expect(isNight(18)).toBe(true);
    expect(isNight(6)).toBe(false);
    expect(isNight(5)).toBe(true);
  });

  it('two traits together add up', () => {
    const hero = base([TRAIT.bruiser, TRAIT.heavyHanded]);
    expect(derivedStats(hero)).toMatchObject({ maxAp: 5, meleeDamage: 6, betterCriticals: -30 });
  });
});

describe('levels and experience', () => {
  it('experience to the next level: 1000 × L(L+1)/2, the last level is 21', () => {
    expect(experienceToNextLevel(1)).toBe(1000);
    expect(experienceToNextLevel(2)).toBe(3000);
    expect(experienceToNextLevel(3)).toBe(6000);
    expect(experienceToNextLevel(20)).toBe(210000);
    expect(experienceToNextLevel(21)).toBe(-1);
  });

  it('level from experience', () => {
    expect(levelForExperience(0)).toBe(1);
    expect(levelForExperience(999)).toBe(1);
    expect(levelForExperience(1000)).toBe(2);
    expect(levelForExperience(2999)).toBe(2);
    expect(levelForExperience(3000)).toBe(3);
    expect(levelForExperience(209999)).toBe(20);
    expect(levelForExperience(210000)).toBe(21);
    expect(levelForExperience(10_000_000)).toBe(21);
  });

  it('per level: health END/2 + 2, skill points 5 + 2×INT, a perk every 3 levels', () => {
    const hero = make([5, 5, 5, 5, 5, 5, 5]);
    expect(levelUp(hero, 2)).toEqual({ hp: 4, skillPoints: 15, perk: false });
    expect(levelUp(hero, 3).perk).toBe(true);
    expect(levelUp(hero, 4).perk).toBe(false);
    expect(levelUp(hero, 6).perk).toBe(true);
    expect(levelUp(make([5, 5, 10, 5, 1, 5, 5]), 2)).toMatchObject({ hp: 7, skillPoints: 7 });
  });

  it('no more than seven perks', () => {
    const hero = make([5, 5, 5, 5, 5, 5, 5]);
    expect(levelUp(hero, 21, 6).perk).toBe(true);
    expect(levelUp(hero, 21, 7).perk).toBe(false);
  });

  it('Skilled: a perk every 4 levels', () => {
    const hero = make([5, 5, 5, 5, 5, 5, 5], [TRAIT.skilled]);
    expect(levelUp(hero, 3).perk).toBe(false);
    expect(levelUp(hero, 4).perk).toBe(true);
    expect(levelUp(hero, 8).perk).toBe(true);
    expect(levelUp(hero, 6).perk).toBe(false);
  });

  it('Skilled: 5 more skill points (as in the description), together with Gifted as without traits', () => {
    expect(levelUp(make([5, 5, 5, 5, 5, 5, 5], [TRAIT.skilled]), 2).skillPoints).toBe(20);
    expect(levelUp(make([5, 5, 5, 5, 5, 5, 5], [TRAIT.skilled, TRAIT.gifted]), 2).skillPoints).toBe(15);
    expect(levelUp(make([1, 1, 1, 1, 1, 1, 1], [TRAIT.skilled]), 2).skillPoints).toBe(12);
  });

  it('Gifted: 5 fewer skill points; Educated and Lifegiver add', () => {
    expect(levelUp(make([5, 5, 5, 5, 5, 5, 5], [TRAIT.gifted]), 2).skillPoints).toBe(10);
    expect(levelUp({ ...make([5, 5, 5, 5, 5, 5, 5]), educated: 2 }, 2).skillPoints).toBe(19);
    expect(levelUp({ ...make([5, 5, 5, 5, 5, 5, 5]), lifegiver: 2 }, 2).hp).toBe(12);
  });

  it('unspent skill points are no more than 99', () => {
    expect(addSkillPoints(0, 15)).toBe(15);
    expect(addSkillPoints(90, 15)).toBe(99);
    expect(addSkillPoints(5, -10)).toBe(0);
  });
});

const require = createRequire(import.meta.url);
const { openGame, checkGameFolder } = require('../electron/gamefiles.cjs');

let gameDir = '';
try {
  gameDir = JSON.parse(fs.readFileSync('.local/config.json', 'utf8')).gameDir ?? '';
} catch {
  gameDir = '';
}
const available = Boolean(gameDir) && checkGameFolder(gameDir).ok;

describe.skipIf(!available)('traits: names and descriptions from the game copy', () => {
  it('all 16 have a name and a description, the names differ', () => {
    const game = openGame(gameDir);
    try {
      const msg = parseMsg(game.read('TEXT\\ENGLISH\\GAME\\TRAIT.MSG'));
      const names = new Set<string>();
      for (let trait = 0; trait < TRAIT_COUNT; trait++) {
        const name = traitName(msg, trait);
        expect(name, `name ${trait}`).not.toBe('');
        expect(traitDescription(msg, trait).length, `description ${trait}`).toBeGreaterThan(20);
        names.add(name);
      }
      expect(names.size).toBe(TRAIT_COUNT);
    } finally {
      game.close();
    }
  });
});

describe('trait names', () => {
  it('taken by numbers 100+ and 200+, no line means empty', () => {
    const msg = new Map<number, string>([
      [103, 'Name'],
      [203, 'Description'],
    ]);
    expect(traitName(msg, 3)).toBe('Name');
    expect(traitDescription(msg, 3)).toBe('Description');
    expect(traitName(msg, 4)).toBe('');
  });
});

describe('name, age and sex', () => {
  it('a new character is twenty-five years old and male, with no name', () => {
    const c = newCharacter();
    expect(c.age).toBe(25);
    expect(c.gender).toBe('male');
    expect(c.name).toBeUndefined();
  });
});
