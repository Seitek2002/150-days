// Companion growth (client, 2026-10-26). Experience is shared and full for everyone: whoever in the party kills an enemy (and for quests), the same
// amount of experience goes to the hero and to every companion. Levels follow the same table as the hero's; per level — skill points, as for
// the hero (5 + 2 × Intelligence), and health (Endurance / 2 + 2). Points go only into skills the companion
// uses: the six combat ones and "First Aid" (he bandages himself with it after a fight), 1 point — 1%.
// The companion wears the best armor among his items; his look doesn't change, as in the original — only armor class and protection.
import { ITEM_TYPE, type ItemProto, type WeaponData } from '../formats/pro.ts';
import { experienceToNextLevel, SKILL, SKILL_COUNT, SKILL_MAX, type Special } from './character.ts';
import { weaponSkillIndex, type Fighter } from './fighter.ts';
import type { CritterKind } from './resources.ts';

/** Skills the companion can put points into (client: barter, speech and the rest are of no use to him). */
export const COMPANION_SKILLS: readonly number[] = [SKILL.smallGuns, SKILL.bigGuns, SKILL.energyWeapons, SKILL.unarmed, SKILL.melee, SKILL.throwing, SKILL.firstAid];
/** The dog (and any animal in the party) fights only with its teeth: points go only into "Unarmed". */
export const BEAST_SKILLS: readonly number[] = [SKILL.unarmed];
/** Which skills grow for this companion (not knowing what he can hold — all combat ones). */
export const skillsFor = (kind: { bites: boolean }): readonly number[] => (kind.bites ? BEAST_SKILLS : COMPANION_SKILLS);

/**
 * Skills the companion will find useful (client, 2026-10-26: a raised "Big Guns" is of no use to Ian — he can't
 * hold them): by the kinds of weapons his sprites can hold (resources.ts → wieldCodes). Small guns — pistols,
 * SMGs, rifles (codes 5–7); energy — laser and plasma pistols (5) and rifles (8, 9); big guns —
 * 8–10; melee — knife, club, hammer, spear (1–4). "Unarmed", "Throwing" (a rock — everyone) and "First Aid" — always.
 */
export function usableSkills(codes: ReadonlySet<number>, bites: boolean): readonly number[] {
  if (bites) return BEAST_SKILLS;
  const any = (...list: number[]) => list.some((c) => codes.has(c));
  return COMPANION_SKILLS.filter((skill) => {
    if (skill === SKILL.smallGuns) return any(5, 6, 7);
    if (skill === SKILL.energyWeapons) return any(5, 8, 9);
    if (skill === SKILL.bigGuns) return any(8, 9, 10);
    if (skill === SKILL.melee) return any(1, 2, 3, 4);
    return true;
  });
}

/** Refund points from skills the companion won't find useful (put in before we knew); returns how many were refunded. */
export function refundUnusable(p: CompanionProgress, usable: readonly number[]): number {
  let back = 0;
  for (const skill of COMPANION_SKILLS) {
    if (usable.includes(skill) || (p.skills[skill] ?? 0) <= 0) continue;
    back += p.skills[skill]!;
    p.skills[skill] = 0;
  }
  p.points += back;
  return back;
}

/**
 * How good a gun is in the hands of this particular companion: damage and magazine (weaponScore) adjusted for his skill with this
 * weapon — if he raised "Energy Weapons" above "Small Guns", a laser pistol is better for him than a 14mm pistol.
 */
export function wieldScore(p: ItemProto, fighter: Fighter): number {
  const skill = fighter.skills[weaponSkillIndex(p.weapon)] ?? 0;
  return weaponScore(p) * Math.max(0.05, Math.min(0.95, (skill - 15) / 100));
}

/** Companion growth: stored in the save by the creature's PID — he leaves the party and comes back, the growth stays. */
export interface CompanionProgress {
  xp: number;
  level: number;
  /** Unspent skill points. */
  points: number;
  /** How many percent are put into each skill (by SKILL number). */
  skills: number[];
  /** Bonus to max health from levels. */
  hp: number;
  /** How many seconds of play the points have stayed unspent (he'll ask himself — see ASK_POINTS_AFTER). */
  idle: number;
}

/** Points stay unspent longer than this (seconds of play, not paused) — the companion comes over himself and asks what to improve. */
export const ASK_POINTS_AFTER = 240;

export function newProgress(): CompanionProgress {
  return { xp: 0, level: 1, points: 0, skills: new Array<number>(SKILL_COUNT).fill(0), hp: 0, idle: 0 };
}

/** Read from a save (an old or corrupted one — from scratch). */
export function progressFrom(data: Partial<CompanionProgress> | undefined): CompanionProgress {
  const p = newProgress();
  if (!data) return p;
  p.xp = Math.max(0, data.xp ?? 0);
  p.level = Math.max(1, data.level ?? 1);
  p.points = Math.max(0, data.points ?? 0);
  p.hp = Math.max(0, data.hp ?? 0);
  p.idle = Math.max(0, data.idle ?? 0);
  (data.skills ?? []).forEach((v, i) => {
    if (i < SKILL_COUNT) p.skills[i] = Math.max(0, v);
  });
  return p;
}

/** Skill points per level — as for the hero: 5 + 2 × Intelligence. */
export const pointsPerLevel = (special: Special): number => 5 + 2 * special.intelligence;
/** Health per level — as for the hero: Endurance / 2 + 2. */
export const hpPerLevel = (special: Special): number => Math.floor(special.endurance / 2) + 2;

/** Add experience; returns how many levels he gained. */
export function addCompanionXp(p: CompanionProgress, points: number, special: Special): number {
  if (points <= 0) return 0;
  p.xp += points;
  let levels = 0;
  for (let next = experienceToNextLevel(p.level); next > 0 && p.xp >= next; next = experienceToNextLevel(p.level)) {
    p.level++;
    p.points += pointsPerLevel(special);
    p.hp += hpPerLevel(special);
    levels++;
  }
  return levels;
}

/** The companion's skill including points put in: the base from the prototype + points, no more than SKILL_MAX. */
export const companionSkill = (base: Fighter, p: CompanionProgress, skill: number): number =>
  Math.min(SKILL_MAX, (base.skills[skill] ?? 0) + (p.skills[skill] ?? 0));

/** Put a point into a skill (only from allowed — skillsFor, until the skill hits the cap). */
export function spendCompanionPoint(p: CompanionProgress, base: Fighter, skill: number, allowed: readonly number[] = COMPANION_SKILLS): boolean {
  if (p.points <= 0 || !allowed.includes(skill) || companionSkill(base, p, skill) >= SKILL_MAX) return false;
  p.skills[skill] = (p.skills[skill] ?? 0) + 1;
  p.points--;
  return true;
}

/** Take a point back (not below what it was before the window opened — floor). */
export function refundCompanionPoint(p: CompanionProgress, skill: number, floor: readonly number[]): boolean {
  if ((p.skills[skill] ?? 0) <= (floor[skill] ?? 0)) return false;
  p.skills[skill] = (p.skills[skill] ?? 0) - 1;
  p.points++;
  return true;
}

/**
 * "Decide yourself": all points go into the skill of the weapon in his hands (bare hands — "Unarmed"); hit the cap — into "First
 * Aid", then into the other combat skills in order.
 */
export function autoSpend(p: CompanionProgress, base: Fighter, weapon?: WeaponData, allowed: readonly number[] = COMPANION_SKILLS): void {
  const order = [weaponSkillIndex(weapon), SKILL.firstAid, ...allowed];
  for (const skill of order) while (spendCompanionPoint(p, base, skill, allowed));
}

/** How good armor is: armor class and protection against normal damage (the threshold weighs like 5% resistance). */
export function armorScore(proto: ItemProto | null): number {
  const a = proto?.armor;
  if (!a) return 0;
  return a.armorClass + (a.damageResistance[0] ?? 0) + 5 * (a.damageThreshold[0] ?? 0);
}

/** The best armor among the items (none — null). */
export function bestArmor(items: readonly ItemProto[]): ItemProto | null {
  let best: ItemProto | null = null;
  for (const p of items) if (p.type === ITEM_TYPE.armor && p.armor && armorScore(p) > armorScore(best)) best = p;
  return best;
}

/** Average weapon damage. */
export const averageDamage = (p: ItemProto): number => ((p.weapon?.minDamage ?? 0) + (p.weapon?.maxDamage ?? 0)) / 2;

/**
 * How good a gun is for the companion: average damage and magazine (the 10mm SMG hits like the 10mm pistol, but
 * reloads less often — it's better). By this the companion picks a weapon from his items and decides whether to ask for a better gun.
 */
export const weaponScore = (p: ItemProto): number => averageDamage(p) * (1 + Math.max(0, p.weapon?.capacity ?? 0) / 60);

/**
 * The companion's stats with his growth: skills (and accuracy of the weapon in hand), health, armor. The base is the stats from the prototype (we don't
 * touch it: it's shared in the resource cache).
 */
export function grownKind(kind: CritterKind, p: CompanionProgress, armor: ItemProto | null, gun?: WeaponData): CritterKind {
  const base = kind.fighter;
  const skills = base.skills.map((_, i) => companionSkill(base, p, i));
  const a = armor?.armor;
  const ac = base.ac + (a?.armorClass ?? 0);
  const dt = base.armor.dt + (a?.damageThreshold[0] ?? 0);
  const dr = Math.min(90, base.armor.dr + (a?.damageResistance[0] ?? 0));
  const fighter: Fighter = { ...base, skills, maxHp: base.maxHp + p.hp, ac, armor: { dt, dr } };
  const handSkill = skills[weaponSkillIndex(gun)] ?? 0;
  const stats = { ...kind.stats, maxHp: kind.stats.maxHp + p.hp, ac, armor: { dt, dr } };
  // The creature's "attack": with a knife — the melee weapons skill, otherwise (hands, a gun with no ammo) — "Unarmed".
  stats.skill = kind.weapon?.melee ? handSkill : (skills[SKILL.unarmed] ?? 0);
  const weapon = kind.weapon ? { ...kind.weapon, skill: handSkill } : null;
  return { ...kind, fighter, stats, weapon };
}
