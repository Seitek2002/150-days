// Fallout 1 character rules — pure functions with no screen and no ties to Hero or combat (that is done together with balancing).
// Formulas: the reference (section 3) and the fallout1-ce sources (stat, skill, trait, character editor) — only the order and meaning are taken, the code is ours.
// Trait names and descriptions are read from the game copy's TRAIT.MSG (traitName, traitDescription); they aren't in the code.

/** The primary SPECIAL stats. */
export const SPECIAL_NAMES = ['strength', 'perception', 'endurance', 'charisma', 'intelligence', 'agility', 'luck'] as const;
export type SpecialName = (typeof SPECIAL_NAMES)[number];
export type Special = Record<SpecialName, number>;

export const SPECIAL_MIN = 1;
export const SPECIAL_MAX = 10;
/** At creation each stat has 5, plus 5 points to distribute — 40 in total. */
export const SPECIAL_DEFAULT = 5;
export const SPECIAL_TOTAL = 40;

/** Skills in game order (skill number = number in the original's lists). */
export const SKILL = {
  smallGuns: 0,
  bigGuns: 1,
  energyWeapons: 2,
  unarmed: 3,
  melee: 4,
  throwing: 5,
  firstAid: 6,
  doctor: 7,
  sneak: 8,
  lockpick: 9,
  steal: 10,
  traps: 11,
  science: 12,
  repair: 13,
  speech: 14,
  barter: 15,
  gambling: 16,
  outdoorsman: 17,
} as const;
export const SKILL_COUNT = 18;
export const SKILL_MAX = 200;
/** Tag skills at creation (a fourth is given by the "Tag!" perk — the caller sets the number). */
export const TAGGED_SKILLS = 3;
/** The tag skill bonus, and the fact that one point put into it is worth double. */
export const TAG_BONUS = 20;

/** Traits: number = number in TRAIT.MSG (name — line 100 + number, description — 200 + number). */
export const TRAIT = {
  fastMetabolism: 0,
  bruiser: 1,
  smallFrame: 2,
  oneHander: 3,
  finesse: 4,
  kamikaze: 5,
  heavyHanded: 6,
  fastShot: 7,
  bloodyMess: 8,
  jinxed: 9,
  goodNatured: 10,
  chemReliant: 11,
  chemResistant: 12,
  nightPerson: 13,
  skilled: 14,
  gifted: 15,
} as const;
export const TRAIT_COUNT = 16;
export const MAX_TRAITS = 2;

interface SkillRule {
  /** The value without stats and points. */
  base: number;
  /** Stat multiplier. */
  factor: number;
  /** One or two stats (two — the average is taken: (a + b) × multiplier / 2, the fraction is dropped). */
  stats: readonly [SpecialName] | readonly [SpecialName, SpecialName];
}

/** Skill formulas (the reference, section 3). */
const SKILL_RULES: readonly SkillRule[] = [
  { base: 35, factor: 1, stats: ['agility'] }, // small guns
  { base: 10, factor: 1, stats: ['agility'] }, // big guns
  { base: 10, factor: 1, stats: ['agility'] }, // energy weapons
  { base: 65, factor: 1, stats: ['agility', 'strength'] }, // unarmed
  { base: 55, factor: 1, stats: ['agility', 'strength'] }, // melee weapons
  { base: 40, factor: 1, stats: ['agility'] }, // throwing
  { base: 30, factor: 1, stats: ['perception', 'intelligence'] }, // first aid
  { base: 15, factor: 1, stats: ['perception', 'intelligence'] }, // doctor
  { base: 25, factor: 1, stats: ['agility'] }, // sneak
  { base: 20, factor: 1, stats: ['perception', 'agility'] }, // lockpick
  { base: 20, factor: 1, stats: ['agility'] }, // steal
  { base: 20, factor: 1, stats: ['perception', 'agility'] }, // traps
  { base: 25, factor: 2, stats: ['intelligence'] }, // science
  { base: 20, factor: 1, stats: ['intelligence'] }, // repair
  { base: 25, factor: 2, stats: ['charisma'] }, // speech
  { base: 20, factor: 2, stats: ['charisma'] }, // barter
  { base: 20, factor: 3, stats: ['luck'] }, // gambling
  { base: 5, factor: 1, stats: ['endurance', 'intelligence'] }, // outdoorsman
];

/** The hero's sex: the original's scripts read it (for example, the officer's look in Vault 13 depends on sex). */
export type Gender = 'male' | 'female';
/** The hero's age at creation: from 16 to 35, 25 by default (as in the original). */
export const AGE_MIN = 16;
export const AGE_MAX = 35;
export const AGE_DEFAULT = 25;

/** Everything that defines a character for the rules. */
export interface Character {
  /** Stats as chosen by the player (without traits). */
  special: Special;
  /** Chosen traits (up to two). */
  traits: readonly number[];
  /** Tag skills (numbers). */
  tagged: readonly number[];
  /** How many points are put into each of the 18 skills. */
  skillPoints: readonly number[];
  /** Perk ranks the rules need: "Educated" (+2 skill points per rank), "Lifegiver" (+4 HP per rank). */
  educated?: number;
  lifegiver?: number;
  /** Perks taken: perk number (as in PERK.MSG: name — 101 + number) → rank. */
  perks?: Readonly<Record<number, number>>;
  /** The hero's level (none — the first). */
  level?: number;
  /** Health gained from levels (added to the health from stats). */
  levelHp?: number;
  /** Unspent skill points. */
  unspentSkillPoints?: number;
  /** How many perks are due but not yet chosen. */
  perksOwed?: number;
  /** Temporary modifiers (drugs, radiation): STAT number → bonus. The session computes them (conditions.ts). */
  statEffects?: Readonly<Record<number, number>>;
  /** The hero's name (none — the game uses the default name). */
  name?: string;
  /** Age (none — 25). */
  age?: number;
  /** Sex (none — male). */
  gender?: Gender;
}

export const defaultSpecial = (): Special => ({
  strength: SPECIAL_DEFAULT,
  perception: SPECIAL_DEFAULT,
  endurance: SPECIAL_DEFAULT,
  charisma: SPECIAL_DEFAULT,
  intelligence: SPECIAL_DEFAULT,
  agility: SPECIAL_DEFAULT,
  luck: SPECIAL_DEFAULT,
});

/** A new "default" character: all stats 5, no traits, no tag skills, no points spent; 25 years old, male. */
export function newCharacter(): Character {
  return { special: defaultSpecial(), traits: [], tagged: [], skillPoints: new Array<number>(SKILL_COUNT).fill(0), age: AGE_DEFAULT, gender: 'male' };
}

export const specialTotal = (special: Special): number => SPECIAL_NAMES.reduce((sum, name) => sum + special[name], 0);

/** How many creation points can still be distributed (negative — too many distributed). */
export const creationPointsLeft = (special: Special): number => SPECIAL_TOTAL - specialTotal(special);

/** Stats are ready for the start of the game: each from 1 to 10, the sum exactly 40. */
export function isValidSpecial(special: Special): boolean {
  return SPECIAL_NAMES.every((name) => Number.isInteger(special[name]) && special[name] >= SPECIAL_MIN && special[name] <= SPECIAL_MAX) && specialTotal(special) === SPECIAL_TOTAL;
}

/** Can these traits be chosen: no more than two, real and without repeats. */
export function isValidTraits(traits: readonly number[]): boolean {
  return traits.length <= MAX_TRAITS && new Set(traits).size === traits.length && traits.every((t) => Number.isInteger(t) && t >= 0 && t < TRAIT_COUNT);
}

/** Tag skills: exactly as many as allowed (three by default), real and without repeats. */
export function isValidTagged(tagged: readonly number[], allowed = TAGGED_SKILLS): boolean {
  return tagged.length === allowed && new Set(tagged).size === allowed && tagged.every((s) => Number.isInteger(s) && s >= 0 && s < SKILL_COUNT);
}

const has = (character: Pick<Character, 'traits'>, trait: number) => character.traits.includes(trait);

/** Numbers of the original's perks that our rules know (name in PERK.MSG — 101 + number, description — 201 + number). */
export const PERK = {
  awareness: 0,
  bonusHthDamage: 2,
  bonusRangedDamage: 4,
  bonusRateOfFire: 5,
  fasterHealing: 7,
  moreCriticals: 8,
  radResistance: 11,
  toughness: 12,
  strongBack: 13,
  sharpshooter: 14,
  survivalist: 16,
  educated: 18,
  betterCriticals: 21,
  actionBoy: 26,
  lifegiver: 28,
  dodger: 29,
  snakeater: 30,
  mrFixit: 31,
  medic: 32,
  masterThief: 33,
  speaker: 34,
  ranger: 47,
  swiftLearner: 50,
  masterTrader: 17,
  tag: 51,
  fortuneFinder: 20,
  pathfinder: 43,
  scout: 45,
  // Perks that the original's scripts check or that were given a job in our game (client, 2026-10-27).
  nightVision: 9,
  presence: 10,
  sniper: 24,
  mentalBlock: 27,
  ghost: 38,
  cultOfPersonality: 39,
  scrounger: 40,
  animalFriend: 44,
  mysteriousStranger: 46,
  quickPockets: 48,
} as const;

/** The character's perk rank (0 — not taken). */
export const perkRank = (character: Pick<Character, 'perks'>, perk: number): number => character.perks?.[perk] ?? 0;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Night — from 6 p.m. to 6 a.m. The "Night Person" trait description says "when the sun goes down"; the original's code counts only the evening as night (docs/ORIGINAL-FIXES.md). */
export const isNight = (hour: number) => hour >= 18 || hour < 6;

/**
 * The traits' modifier to a primary stat. "Gifted" — +1 to all, "Bruiser" — +2 to strength,
 * "Small Frame" — +1 to agility, "Night Person" — ±1 to perception and intelligence (plus at night, minus by day).
 */
export function traitSpecialBonus(traits: readonly number[], name: SpecialName, hour = 12): number {
  const c = { traits };
  let bonus = 0;
  if (has(c, TRAIT.gifted)) bonus += 1;
  if (name === 'strength' && has(c, TRAIT.bruiser)) bonus += 2;
  if (name === 'agility' && has(c, TRAIT.smallFrame)) bonus += 1;
  if ((name === 'perception' || name === 'intelligence') && has(c, TRAIT.nightPerson)) bonus += isNight(hour) ? 1 : -1;
  return bonus;
}

/** A stat with traits, as the rest of the rules see it: from 1 to 10. */
export function specialLevel(character: Pick<Character, 'special' | 'traits' | 'statEffects'>, name: SpecialName, hour = 12): number {
  const effect = character.statEffects?.[SPECIAL_NAMES.indexOf(name)] ?? 0;
  return clamp(character.special[name] + traitSpecialBonus(character.traits, name, hour) + effect, SPECIAL_MIN, SPECIAL_MAX);
}

export interface DerivedStats {
  maxHp: number;
  maxAp: number;
  armorClass: number;
  /** How much can be carried (pounds). */
  carryWeight: number;
  /** Melee damage bonus. */
  meleeDamage: number;
  /** Sequence (turn order). */
  sequence: number;
  healingRate: number;
  criticalChance: number;
  betterCriticals: number;
  radiationResistance: number;
  poisonResistance: number;
}

/**
 * Derived stats: health, action points, armor class, weight, melee damage, sequence, healing,
 * critical hit chance, radiation and poison resistance. Traits are taken into account.
 * hour — hour of the day 0–23 (needed only for "Night Person").
 */
export function derivedStats(character: Pick<Character, 'special' | 'traits' | 'perks' | 'levelHp' | 'statEffects'>, hour = 12): DerivedStats {
  const strength = specialLevel(character, 'strength', hour);
  const perception = specialLevel(character, 'perception', hour);
  const endurance = specialLevel(character, 'endurance', hour);
  const agility = specialLevel(character, 'agility', hour);
  const luck = specialLevel(character, 'luck', hour);
  const traits = character.traits;
  const c = { traits };

  // Base values without traits.
  // Health, as in the original, is computed from the "pure" stats — without traits (Bruiser and Gifted don't raise it).
  const baseHp = character.special.strength + character.special.endurance * 2 + 15;
  const baseAp = Math.floor(agility / 2) + 5;
  const baseAc = agility;
  const baseMelee = Math.max(strength - 5, 1);
  // Double the original (client, 2026-10-29): Strength 5 — 300 pounds, not 150. The "Small Frame" modifier is doubled too.
  const baseCarry = 2 * (25 * strength + 25);
  const baseSequence = 2 * perception;
  const baseHealing = Math.max(Math.floor(endurance / 3), 1);
  const baseCrit = luck;
  const baseRad = 2 * endurance;
  const basePoison = 5 * endurance;

  // Trait modifiers.
  let ap = baseAp;
  if (has(c, TRAIT.bruiser)) ap -= 2;
  let ac = baseAc;
  if (has(c, TRAIT.kamikaze)) ac -= baseAc;
  let melee = baseMelee;
  if (has(c, TRAIT.heavyHanded)) melee += 4;
  let carry = baseCarry;
  if (has(c, TRAIT.smallFrame)) carry -= 2 * 10 * character.special.strength;
  let sequence = baseSequence;
  if (has(c, TRAIT.kamikaze)) sequence += 5;
  let healing = baseHealing;
  if (has(c, TRAIT.fastMetabolism)) healing += 2;
  let crit = baseCrit;
  if (has(c, TRAIT.finesse)) crit += 10;
  const better = has(c, TRAIT.heavyHanded) ? -30 : 0;
  let rad = baseRad;
  let poison = basePoison;
  if (has(c, TRAIT.fastMetabolism)) {
    rad = 0;
    poison = 0;
  }

  // Perks.
  const rank = (perk: number) => perkRank(character, perk);
  ap += rank(PERK.actionBoy);
  ac += 5 * rank(PERK.dodger);
  melee += 2 * rank(PERK.bonusHthDamage);
  carry += 50 * rank(PERK.strongBack);
  healing += 2 * rank(PERK.fasterHealing);
  crit += 5 * rank(PERK.moreCriticals);
  rad += 10 * rank(PERK.radResistance);
  poison += 25 * rank(PERK.snakeater);
  const betterPerk = 20 * rank(PERK.betterCriticals);
  // Temporary modifiers: drugs (Buffout, Rad-X…) and radiation — by the original's stat numbers.
  const fx = (stat: number) => character.statEffects?.[stat] ?? 0;
  ap += fx(8);
  ac += fx(9);
  melee += fx(11);
  carry += fx(12);
  sequence += fx(13);
  healing += fx(14);
  crit += fx(15);
  rad += fx(31);
  poison += fx(32);

  return {
    maxHp: Math.max(0, baseHp + (character.levelHp ?? 0) + fx(7)),
    maxAp: Math.max(0, ap),
    armorClass: Math.max(0, ac),
    carryWeight: Math.max(0, carry),
    meleeDamage: Math.max(0, melee),
    sequence: Math.max(0, sequence),
    healingRate: Math.max(0, healing),
    criticalChance: clamp(crit, 0, 100),
    betterCriticals: clamp(better + betterPerk + fx(16), -60, 100),
    radiationResistance: clamp(rad, 0, 100),
    poisonResistance: clamp(poison, 0, 100),
  };
}

/** The traits' modifier to a skill: "Gifted" −10, "Skilled" +10, "Good Natured" −10 to combat and +15 to peaceful ones. */
export function traitSkillBonus(traits: readonly number[], skill: number): number {
  const c = { traits };
  let bonus = 0;
  if (has(c, TRAIT.gifted)) bonus -= 10;
  if (has(c, TRAIT.skilled)) bonus += 10;
  if (has(c, TRAIT.goodNatured)) {
    if (skill >= SKILL.smallGuns && skill <= SKILL.throwing) bonus -= 10;
    else if (skill === SKILL.firstAid || skill === SKILL.doctor || skill === SKILL.speech || skill === SKILL.barter) bonus += 15;
  }
  return bonus;
}

/** A skill without points spent, traits and tag skills — by stats only. */
export function skillBase(special: Special, skill: number): number {
  const rule = SKILL_RULES[skill];
  if (!rule) return 0;
  const stats = rule.stats;
  const bonus = stats.length === 2 ? Math.floor(((special[stats[0]] + special[stats[1]]) * rule.factor) / 2) : special[stats[0]] * rule.factor;
  return rule.base + bonus;
}

/**
 * Skill value in percent: the base from stats (with traits) + points put in; a tag skill
 * gets another +20 and every point counts double. No more than 200.
 */
export function skillLevel(character: Character, skill: number, hour = 12): number {
  const rule = SKILL_RULES[skill];
  if (!rule) return 0;
  const special = { ...character.special };
  for (const name of SPECIAL_NAMES) special[name] = specialLevel(character, name, hour);
  const points = character.skillPoints[skill] ?? 0;
  let value = skillBase(special, skill) + points;
  if (character.tagged.includes(skill)) value += TAG_BONUS + points;
  value += traitSkillBonus(character.traits, skill);
  value += perkSkillBonus(character, skill);
  return Math.min(SKILL_MAX, value);
}

/** The perks' modifier to a skill: "Speaker" +20 to speech, "Medic" +20 to first aid and doctor, and so on. */
export function perkSkillBonus(character: Pick<Character, 'perks'>, skill: number): number {
  const rank = (perk: number) => perkRank(character, perk);
  let bonus = 0;
  if (skill === SKILL.speech) bonus += 20 * rank(PERK.speaker);
  if (skill === SKILL.firstAid || skill === SKILL.doctor) bonus += 20 * rank(PERK.medic);
  if (skill === SKILL.repair || skill === SKILL.science) bonus += 20 * rank(PERK.mrFixit);
  if (skill === SKILL.lockpick || skill === SKILL.steal) bonus += 15 * rank(PERK.masterThief);
  if (skill === SKILL.outdoorsman) bonus += 20 * rank(PERK.survivalist) + 15 * rank(PERK.ranger);
  if (skill === SKILL.barter) bonus += 25 * rank(PERK.masterTrader);
  return bonus;
}

/** Can another point be put into a skill (up to 200%). */
export const canRaiseSkill = (character: Character, skill: number, hour = 12) => skill >= 0 && skill < SKILL_COUNT && skillLevel(character, skill, hour) < SKILL_MAX;

/** Experience needed to go from level `level` to the next: 1000 × L(L+1)/2. The last level (21) — nowhere further: −1. */
export const PLAYER_LEVEL_MAX = 21;
export function experienceToNextLevel(level: number): number {
  if (level < 1) return 1000;
  return level >= PLAYER_LEVEL_MAX ? -1 : (1000 * level * (level + 1)) / 2;
}

/** Level by accumulated experience: from 1 to 21. */
export function levelForExperience(experience: number): number {
  let level = 1;
  while (level < PLAYER_LEVEL_MAX && experience >= experienceToNextLevel(level)) level++;
  return level;
}

export interface LevelUp {
  /** Health bonus: endurance / 2 + 2, plus 4 for each rank of "Lifegiver". */
  hp: number;
  /** New skill points: 5 + 2 × intelligence, plus 2 per rank of "Educated", plus 5 for "Skilled", minus 5 for "Gifted"; no less than zero. */
  skillPoints: number;
  /** Whether a new perk is due: every 3 levels (with "Skilled" — every 4), while fewer than 7 are taken. */
  perk: boolean;
}

/** Maximum of unspent skill points. */
export const UNSPENT_SKILL_POINTS_MAX = 99;

/** How many skill points there will be after the bonus: no more than 99. */
export const addSkillPoints = (unspent: number, gained: number): number => Math.min(UNSPENT_SKILL_POINTS_MAX, Math.max(0, unspent + gained));

/**
 * What advancing to level `newLevel` (2…21) gives. perksTaken — how many perks are already taken.
 * As in the original, health and skill points are computed from the "pure" stats, without traits.
 * "Skilled" gives +5 skill points per level, as its description says (the original's code doesn't have them — see docs/ORIGINAL-FIXES.md).
 */
export function levelUp(character: Character, newLevel: number, perksTaken = 0): LevelUp {
  const lifegiver = (character.lifegiver ?? 0) + perkRank(character, PERK.lifegiver);
  const educated = (character.educated ?? 0) + perkRank(character, PERK.educated);
  const hp = Math.floor(character.special.endurance / 2) + 2 + lifegiver * 4;
  let skillPoints = 5 + character.special.intelligence * 2 + educated * 2;
  if (has(character, TRAIT.skilled)) skillPoints += 5;
  if (has(character, TRAIT.gifted)) skillPoints -= 5;
  skillPoints = Math.max(0, skillPoints);
  const interval = has(character, TRAIT.skilled) ? 4 : 3;
  return { hp, skillPoints, perk: perksTaken < 7 && newLevel % interval === 0 };
}

/** Trait name and description from the game copy's TRAIT.MSG (msg — the parsed file, see parseMsg). */
export const traitName = (msg: ReadonlyMap<number, string>, trait: number): string => msg.get(100 + trait) ?? '';
export const traitDescription = (msg: ReadonlyMap<number, string>, trait: number): string => msg.get(200 + trait) ?? '';
