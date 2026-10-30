// Hero perks and levels by Fallout 1 rules: experience → level, health and skill points per level, a perk every 3 levels.
// Perk names and descriptions are read from PERK.MSG in the player's copy (name is 101 + number, description is 201 + number);
// the requirements (level, stats, skills) are not in the original's data, so they are here, by the original's rules.
// Perk effects live in character.ts (health, armor class, damage, criticals, skills) and fighter.ts (combat).
import {
  addSkillPoints,
  canRaiseSkill,
  levelForExperience,
  levelUp,
  PERK,
  perkRank,
  skillLevel,
  SKILL,
  SKILL_COUNT,
  specialLevel,
  type Character,
  type SpecialName,
} from './character.ts';

export interface PerkRule {
  id: number;
  /** How many times it can be taken. */
  ranks: number;
  /** From which level. */
  level: number;
  /** Required stats (at least). */
  special?: Partial<Record<SpecialName, number>>;
  /** Required skills (at least), all of them. */
  skills?: [number, number][];
}

/** Perks that can be chosen: requirements as in the original. */
export const PERK_RULES: readonly PerkRule[] = [
  { id: PERK.awareness, ranks: 1, level: 3, special: { perception: 5 } },
  { id: PERK.bonusHthDamage, ranks: 3, level: 3, special: { strength: 6, agility: 6 } },
  { id: PERK.fasterHealing, ranks: 3, level: 3, special: { endurance: 6 } },
  { id: PERK.toughness, ranks: 3, level: 3, special: { endurance: 6, luck: 6 } },
  { id: PERK.strongBack, ranks: 3, level: 3, special: { strength: 6, endurance: 6 } },
  { id: PERK.survivalist, ranks: 1, level: 3, special: { endurance: 6, intelligence: 6 }, skills: [[SKILL.outdoorsman, 40]] },
  { id: PERK.swiftLearner, ranks: 3, level: 3, special: { intelligence: 4 } },
  { id: PERK.bonusRangedDamage, ranks: 2, level: 6, special: { agility: 6, luck: 6 } },
  { id: PERK.moreCriticals, ranks: 3, level: 6, special: { luck: 6 } },
  { id: PERK.radResistance, ranks: 3, level: 6, special: { endurance: 6, intelligence: 4 } },
  { id: PERK.educated, ranks: 3, level: 6, special: { intelligence: 6 } },
  { id: PERK.snakeater, ranks: 2, level: 6, special: { endurance: 3 } },
  { id: PERK.ranger, ranks: 1, level: 6, special: { perception: 6 } },
  { id: PERK.bonusRateOfFire, ranks: 1, level: 9, special: { agility: 7, intelligence: 6, perception: 6 } },
  { id: PERK.sharpshooter, ranks: 1, level: 9, special: { perception: 7, intelligence: 6 } },
  { id: PERK.betterCriticals, ranks: 1, level: 9, special: { perception: 6, agility: 4, luck: 6 } },
  { id: PERK.dodger, ranks: 1, level: 9, special: { agility: 6 } },
  { id: PERK.speaker, ranks: 1, level: 9, skills: [[SKILL.speech, 50]] },
  { id: PERK.actionBoy, ranks: 2, level: 12, special: { agility: 5 } },
  { id: PERK.lifegiver, ranks: 2, level: 12, special: { endurance: 4 } },
  { id: PERK.mrFixit, ranks: 1, level: 12, skills: [[SKILL.repair, 40], [SKILL.science, 40]] },
  { id: PERK.medic, ranks: 1, level: 12, skills: [[SKILL.firstAid, 40], [SKILL.doctor, 40]] },
  { id: PERK.masterThief, ranks: 1, level: 12, skills: [[SKILL.lockpick, 50], [SKILL.steal, 50]] },
  { id: PERK.masterTrader, ranks: 1, level: 12, special: { charisma: 7 }, skills: [[SKILL.barter, 60]] },
  { id: PERK.tag, ranks: 1, level: 12 },
  { id: PERK.scout, ranks: 1, level: 3, special: { perception: 7 } },
  { id: PERK.pathfinder, ranks: 2, level: 6, special: { endurance: 6 }, skills: [[SKILL.outdoorsman, 40]] },
  { id: PERK.fortuneFinder, ranks: 1, level: 6, special: { luck: 8 } },
  // Perks that the original's scripts check ("Presence", "Cult of Personality", "Mental Block", "Animal Friend") or
  // that were given a job in our game (the client, 2026-10-27); requirements as in the original.
  { id: PERK.nightVision, ranks: 2, level: 3, special: { perception: 6 } },
  { id: PERK.quickPockets, ranks: 1, level: 3, special: { agility: 5 } },
  { id: PERK.presence, ranks: 3, level: 3, special: { charisma: 6 } },
  { id: PERK.ghost, ranks: 1, level: 6, skills: [[SKILL.sneak, 60]] },
  { id: PERK.scrounger, ranks: 1, level: 9, special: { luck: 8 } },
  { id: PERK.animalFriend, ranks: 1, level: 9, special: { intelligence: 5 }, skills: [[SKILL.outdoorsman, 25]] },
  { id: PERK.mysteriousStranger, ranks: 1, level: 9, special: { luck: 4 } },
  { id: PERK.cultOfPersonality, ranks: 1, level: 12, special: { charisma: 10 } },
  { id: PERK.mentalBlock, ranks: 1, level: 15 },
  { id: PERK.sniper, ranks: 1, level: 18, special: { perception: 8, agility: 8 }, skills: [[SKILL.smallGuns, 80]] },
];

/** "Tag!": one more tag skill can be marked (four in total). */
export const canTagMore = (character: Character): boolean => perkRank(character, PERK.tag) > 0 && character.tagged.length < 4;

/** Make a skill a tag skill (after "Tag!"): +20 and every invested point counts double, like the first three. */
export function tagSkill(character: Character, skill: number): Character {
  if (!canTagMore(character) || character.tagged.includes(skill) || skill < 0 || skill >= SKILL_COUNT) return character;
  return { ...character, tagged: [...character.tagged, skill] };
}

/** Hero level. */
export const heroLevel = (character: Pick<Character, 'level'>): number => Math.max(1, character.level ?? 1);

/** How many perks have been taken (by ranks). */
export const perksTaken = (character: Pick<Character, 'perks'>): number => Object.values(character.perks ?? {}).reduce((sum, n) => sum + n, 0);

/** Whether the perk suits the character now (level, stats, skills, a rank still left). */
export function canTakePerk(character: Character, rule: PerkRule): boolean {
  if (perkRank(character, rule.id) >= rule.ranks) return false;
  if (heroLevel(character) < rule.level) return false;
  for (const [name, need] of Object.entries(rule.special ?? {}) as [SpecialName, number][]) if (specialLevel(character, name) < need) return false;
  for (const [skill, need] of rule.skills ?? []) if (skillLevel(character, skill) < need) return false;
  return true;
}

/** Perks that can be chosen now. */
export const availablePerks = (character: Character): PerkRule[] => PERK_RULES.filter((rule) => canTakePerk(character, rule));

/** Take a perk: rank +1, perks owed −1. */
export function takePerk(character: Character, perk: number): Character {
  const rule = PERK_RULES.find((r) => r.id === perk);
  if (!rule || (character.perksOwed ?? 0) <= 0 || !canTakePerk(character, rule)) return character;
  return { ...character, perks: { ...character.perks, [perk]: perkRank(character, perk) + 1 }, perksOwed: (character.perksOwed ?? 0) - 1 };
}

/** Invest a point in a skill (for a tag skill it counts twice, skillLevel does that). */
export function spendSkillPoint(character: Character, skill: number): Character {
  if ((character.unspentSkillPoints ?? 0) <= 0 || skill < 0 || skill >= SKILL_COUNT || !canRaiseSkill(character, skill)) return character;
  const skillPoints = [...character.skillPoints];
  skillPoints[skill] = (skillPoints[skill] ?? 0) + 1;
  return { ...character, skillPoints, unspentSkillPoints: (character.unspentSkillPoints ?? 0) - 1 };
}

/** Take a point back from a skill (only one invested this time: not below what it was before the screen opened). */
export function refundSkillPoint(character: Character, skill: number, floor: readonly number[]): Character {
  const now = character.skillPoints[skill] ?? 0;
  if (now <= (floor[skill] ?? 0)) return character;
  const skillPoints = [...character.skillPoints];
  skillPoints[skill] = now - 1;
  return { ...character, skillPoints, unspentSkillPoints: (character.unspentSkillPoints ?? 0) + 1 };
}

export interface ExperienceResult {
  character: Character;
  /** How much experience actually (with "Swift Learner"). */
  gained: number;
  /** How many levels gained. */
  levels: number;
  /** How much health was added. */
  hp: number;
}

/**
 * Gain experience: "Swift Learner" +5% per rank; each new level gives health, skill points and, every 3 levels,
 * a perk (via levelUp from character.ts). experience is the experience before the gain.
 */
export function gainExperience(character: Character, experience: number, points: number): ExperienceResult {
  const gained = Math.max(0, Math.round(points * (1 + 0.05 * perkRank(character, PERK.swiftLearner))));
  const target = levelForExperience(experience + gained);
  let c = character;
  let levels = 0;
  let hp = 0;
  while (heroLevel(c) < target) {
    const next = heroLevel(c) + 1;
    const up = levelUp(c, next, perksTaken(c) + (c.perksOwed ?? 0));
    c = {
      ...c,
      level: next,
      levelHp: (c.levelHp ?? 0) + up.hp,
      unspentSkillPoints: addSkillPoints(c.unspentSkillPoints ?? 0, up.skillPoints),
      perksOwed: (c.perksOwed ?? 0) + (up.perk ? 1 : 0),
    };
    levels++;
    hp += up.hp;
  }
  return { character: c, gained, levels, hp };
}
