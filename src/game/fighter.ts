// Fighter — common combat rules for the hero and NPCs (client decision, 2026-10-24: "NPCs work like the hero, only the numbers
// differ"). Every rule is one function for everyone: accuracy, damage, critical hits, healing, reloading.
// The hero is a fighter by his character (character.ts), an NPC by the creature prototype from the player's copy.
import { STAT, type CritterProto, type DrugData, type WeaponData } from '../formats/pro.ts';
import { derivedStats, PERK, perkRank, SKILL, SKILL_COUNT, SKILL_MAX, skillBase, skillLevel, specialLevel, SPECIAL_NAMES, type Character, type Special } from './character.ts';
import { computeDamage, critPowerOf, hitChance, isMeleeWeapon, roll, type AmmoMods, type Armor, type Random } from './combat.ts';

export interface Fighter {
  /** Primary stats — as the rules see them (with traits). */
  special: Special;
  /** Skills in percent, by SKILL number. */
  skills: number[];
  maxHp: number;
  /** Armor class: the higher, the harder to hit. */
  ac: number;
  /** Armor against normal damage: threshold and resistance. */
  armor: Armor;
  /** Critical hit chance, %. */
  critChance: number;
  /** Critical hit power: how many times the damage grows (from Luck — critPowerOf; "Better Criticals" +0.3). */
  critPower: number;
  maxAp: number;
  /** Melee damage bonus. */
  meleeDamage: number;
  /** How much health heals in 6 hours. */
  healingRate: number;
  /** Perception bonus for shooting range ("Sharpshooter" +2). */
  rangePerception?: number;
  /** Damage bonus for every bullet ("Bonus Ranged Damage" +2 per rank). */
  rangedDamage?: number;
  /** Turn order: in real time — reaction speed (combat.ts → REACTION). */
  sequence?: number;
}

/** Reloading — the same for everyone (seconds): the hero's weapon is lowered, for an NPC it's a window to attack. */
export const RELOAD_SECONDS = 0.9;
/** How many seconds the hero's hands are busy with a skill (lockpicking, healing, repair) at Agility 5: weapon lowered, step away — cancelled. */
export const SKILL_SECONDS = 1.6;

/**
 * Stat properties for real-time combat (client decision, 2026-10-21; numbers chosen by Opus, 2026-10-20):
 * Agility speeds up reloading, weapon switching and skill use, makes combat actions cheaper (AP) and shortens
 * skill healing time (Agility 5 — as before, each point ±5%; client task, 2026-10-22), gives a chance to dodge
 * a melee hit (3% per point above 4); Strength below what the weapon needs — −20% to hit chance per point (as in
 * the original); Perception 8 and above reveals squares one step further on the world map.
 */
export const agilityTime = (agility: number): number => Math.max(0.6, 1 - (agility - 5) * 0.05);
export const meleeDodge = (agility: number): number => Math.max(0, (agility - 4) * 3);
export const strengthPenalty = (strength: number, minStrength: number): number => 20 * Math.max(0, minStrength - strength);
export const revealRadius = (perception: number): number => (perception >= 8 ? 2 : 1);

/** Damage types of energy weapons (laser, plasma, electrical). */
const ENERGY_DAMAGE = new Set([1, 3, 4]);

/** A fighter from a character (the hero). hour — hour of the day: some traits depend on it ("Night Person"). */
export function characterFighter(character: Character, hour = 12): Fighter {
  const d = derivedStats(character, hour);
  const special = {} as Special;
  for (const name of SPECIAL_NAMES) special[name] = specialLevel(character, name, hour);
  return {
    special,
    skills: Array.from({ length: SKILL_COUNT }, (_, i) => skillLevel(character, i, hour)),
    maxHp: d.maxHp,
    ac: d.armorClass,
    // "Toughness": +10% damage resistance per rank.
    armor: { dt: 0, dr: 10 * perkRank(character, PERK.toughness) },
    critChance: d.criticalChance,
    critPower: critPowerOf(special.luck) + 0.3 * perkRank(character, PERK.betterCriticals),
    maxAp: d.maxAp,
    meleeDamage: d.meleeDamage,
    healingRate: d.healingRate,
    rangePerception: 2 * perkRank(character, PERK.sharpshooter),
    rangedDamage: 2 * perkRank(character, PERK.bonusRangedDamage),
    sequence: d.sequence,
  };
}

/** A fighter from a creature prototype (NPCs and animals): stats, skills and armor — from the original's file. */
export function critterFighter(proto: CritterProto): Fighter {
  const s = proto.stats;
  const special = {} as Special;
  SPECIAL_NAMES.forEach((name, i) => (special[name] = s[i] ?? 5));
  return {
    special,
    skills: Array.from({ length: SKILL_COUNT }, (_, i) => Math.min(SKILL_MAX, skillBase(special, i) + (proto.skillPoints[i] ?? 0))),
    maxHp: s[STAT.maxHp] ?? 5,
    ac: s[STAT.armorClass] ?? 0,
    armor: { dt: s[STAT.damageThreshold] ?? 0, dr: s[STAT.damageResistance] ?? 0 },
    critChance: s[STAT.criticalChance] ?? special.luck,
    critPower: critPowerOf(special.luck),
    maxAp: s[STAT.maxAp] ?? 5,
    meleeDamage: s[STAT.meleeDamage] ?? 1,
    healingRate: s[STAT.healingRate] ?? 1,
    sequence: s[STAT.sequence] ?? 2 * special.perception,
  };
}

/** Which skill this weapon is used with (no weapon or brass knuckles — "Unarmed"). */
export function weaponSkillIndex(weapon?: WeaponData): number {
  if (!weapon) return SKILL.unarmed;
  // Things that are thrown (throwing knife, rock, grenade) — "Throwing".
  if (weapon.capacity <= 0 && weapon.range > 2) return SKILL.throwing;
  const code = weapon.animationCode ?? 0;
  if (code === 0) return SKILL.unarmed;
  if (isMeleeWeapon(code) || weapon.range <= 2) return SKILL.melee;
  // As in the original: heavy — by the prototype flag (flamer, minigun, rocket launcher); the rest — energy by damage type
  // (laser, plasma, pulse: plasma rifle, gatling laser), otherwise small guns. No flag in the data (tests) — by animation.
  if (weapon.bigGun ?? code >= 8) return SKILL.bigGuns;
  return ENERGY_DAMAGE.has(weapon.damageType) ? SKILL.energyWeapons : SKILL.smallGuns;
}

/** The fighter's skill with this weapon, %. */
export const weaponSkill = (fighter: Fighter, weapon?: WeaponData): number => fighter.skills[weaponSkillIndex(weapon)] ?? 0;

/**
 * Hit chance — one formula for everyone: skill minus the target's armor class (with the ammo modifier), minus 4 for every
 * hex further than the shooter's Perception "sees" (2 hexes per point; our cell is 2 hexes).
 * That way Perception improves accuracy for both the hero and NPCs. No less than 5% and no more than 95%.
 */
export function chanceToHit(attacker: Fighter, skill: number, target: Pick<Fighter, 'ac'>, distanceCells: number, targetAcMod = 0): number {
  const hexes = distanceCells * 2;
  const free = 2 * (attacker.special.perception + (attacker.rangePerception ?? 0));
  return hitChance(skill - 4 * Math.max(0, hexes - free), Math.max(0, target.ac + targetAcMod));
}

/**
 * A blow or a shot — one formula: a damage roll (with ammo modifiers), a critical hit by the attacker's Luck
 * (crit power is also from Luck, critPower), the target's armor.
 */
export function strike(
  attacker: Pick<Fighter, 'critChance'> & { critPower?: number },
  damage: { min: number; max: number },
  target: Pick<Fighter, 'armor'>,
  rnd: Random = Math.random,
  ammo?: AmmoMods,
): { damage: number; critical: boolean } {
  const critical = rnd() * 100 < attacker.critChance;
  return { damage: computeDamage(damage.min, damage.max, target.armor, critical ? (attacker.critPower ?? 2) : 1, rnd, ammo), critical };
}

/** Does this drug heal health (stimpak, super stimpak): the drug's first stat is "health" (−2). */
export const healsHp = (drug?: DrugData): boolean => !!drug && drug.stats[0] === -2;

/** How much health a drug gives — the same for the hero and NPCs (from the drug data). */
export const drugHeal = (drug: DrugData | undefined, rnd: Random = Math.random): number => (drug && healsHp(drug) ? roll(drug.amounts[0]!, drug.amounts[1]!, rnd) : 15);

/** How many seconds an action that costs AP takes (the same rule as for the hero: AP → time). */
export { SECONDS_PER_AP } from './combat.ts';
