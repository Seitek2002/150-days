// Combat rules. The numbers are from Fallout (skill and damage formulas), but combat is in real time:
// action points turn into time between shots.
import { STAT } from '../formats/pro.ts';

export type Random = () => number;

/** How many seconds one action point "costs". A pistol (5 AP) fires once every 0.6 s. */
export const SECONDS_PER_AP = 0.12;

/**
 * Delay between the hero's attacks (client, 2026-10-27: "rate of fire depends on Agility and how developed the skill is"):
 * the attack's AP cost × SECONDS_PER_AP, but no less than floor — and Agility and the skill with this weapon speed it up. Agility 5 and skill
 * up to 50% — as before; Agility 10 — ×agilityFast; skill 200% — ×skillFast; together (Agility 10, skill 200%) a pistol
 * (5 AP) — about 0.23 s, and never faster than min. Weaker than average — slower, up to slow times (Agility 1, skill 0%).
 * 2026-10-27: the cap was raised from 0.05 to 0.2 s and the speed-up softened (client: a late-game hero with plasma fired 4 times
 * a second and killed a deathclaw in 2 seconds — no fear was left).
 */
export const ATTACK_SPEED = { floor: 0.5, min: 0.2, slow: 1.3, agilityFast: 0.7, skillFrom: 50, skillTo: 200, skillFast: 0.55 } as const;

/**
 * "Jinxed" (a hero trait; as in the original, bad luck applies to everyone around): with chance jam a shot doesn't fire —
 * the weapon jams (for the hero and for enemies), clear seconds go into freeing it.
 */
export const JINX = { jam: 0.06, clear: 1.6 } as const;

/**
 * Reaction — "Sequence" in real time (client, 2026-10-27: sequence was useless). An enemy that has just
 * spotted the hero doesn't shoot or charge immediately but after base seconds plus per for every point by which the hero's
 * sequence exceeds its own (lower — the enemy is faster), from min to max. A hero with sequence above drawFrom draws
 * and switches weapons faster (drawPer per point, no faster than drawMin times), below it — slower (no longer than drawMax times).
 */
export const REACTION = { base: 0.45, per: 0.05, min: 0.1, max: 1.1, drawFrom: 10, drawPer: 0.04, drawMin: 0.5, drawMax: 1.4 } as const;

/** After how many seconds an enemy responds once it has spotted the hero (REACTION). */
export function reactionDelay(heroSequence: number, enemySequence: number): number {
  const { base, per, min, max } = REACTION;
  return Math.max(min, Math.min(max, base + (heroSequence - enemySequence) * per));
}

/** How many times faster (less than 1) the hero draws and switches weapons (REACTION). */
export function drawFactor(sequence: number): number {
  const { drawFrom, drawPer, drawMin, drawMax } = REACTION;
  return Math.max(drawMin, Math.min(drawMax, 1 - (sequence - drawFrom) * drawPer));
}

export function attackDelay(apCost: number, agility: number, skill: number): number {
  const { floor, min, slow, agilityFast, skillFrom, skillTo, skillFast } = ATTACK_SPEED;
  const a = Math.max(1, Math.min(10, agility));
  const agi = a >= 5 ? 1 - ((a - 5) / 5) * (1 - agilityFast) : 1 + ((5 - a) / 4) * (slow - 1);
  const k = Math.max(0, Math.min(skillTo, skill));
  const sk = k >= skillFrom ? 1 - ((k - skillFrom) / (skillTo - skillFrom)) * (1 - skillFast) : 1 + ((skillFrom - k) / skillFrom) * (slow - 1);
  return Math.max(min, Math.max(floor, apCost * SECONDS_PER_AP) * agi * sk);
}

export function roll(min: number, max: number, rnd: Random = Math.random): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

export interface Armor {
  /** Damage threshold: armor simply "eats" this many points. */
  dt: number;
  /** Resistance in percent. */
  dr: number;
}

/** Ammo modifiers from the original's prototype: armor-piercing rounds penetrate armor, hollow points hit harder without armor. */
export interface AmmoMods {
  /** Modifier to the target's armor class (minus — the target is easier to hit). */
  acModifier?: number;
  /** Modifier to the target's armor resistance (minus for armor-piercing). */
  drModifier?: number;
  /** Damage multiplier and divisor (damage × mult / div). */
  damageMultiplier?: number;
  damageDivisor?: number;
}

/**
 * Critical hit power: how many times the damage grows. Depends on Luck (task from the client's friend, 2026-10-25):
 * Luck 5 — ×2, as before; each point — another ±0.1 (Luck 10 — ×2.5, Luck 1 — ×1.6). "Better Criticals" adds 0.3.
 */
export const critPowerOf = (luck: number): number => 1.5 + luck / 10;

/**
 * Damage as in Fallout: roll × ammo → crit (crit power — critPower, 1 — a normal hit) → minus threshold → minus
 * percent. Integer arithmetic, as in the original: the resistance share, rounded down, is subtracted from the damage — a 1-point blow at 25%
 * stays 1 (client, 2026-10-29: ours became 0, and fists didn't hurt Garl at all).
 */
export function computeDamage(min: number, max: number, armor: Armor, critPower: number, rnd: Random = Math.random, ammo?: AmmoMods): number {
  let damage = roll(min, max, rnd);
  if (ammo) damage = Math.floor((damage * (ammo.damageMultiplier ?? 1)) / Math.max(1, ammo.damageDivisor ?? 1));
  damage = Math.floor(damage * critPower);
  damage -= armor.dt;
  if (damage <= 0) return 0;
  const dr = Math.max(0, Math.min(100, armor.dr + (ammo?.drModifier ?? 0)));
  return damage - Math.floor((damage * dr) / 100);
}

/** The Unarmed skill: 65 + (Agility + Strength) / 2 + extra points. */
export function unarmedSkill(stats: number[], extraPoints: number): number {
  return 65 + Math.floor(((stats[STAT.agility] ?? 5) + (stats[STAT.strength] ?? 5)) / 2) + extraPoints;
}

/** Chance to hit a target with the given armor class (as in Fallout: 5–95%). */
export function hitChance(skill: number, targetAc: number): number {
  return Math.max(5, Math.min(95, skill - targetAc));
}

/**
 * The hero's accuracy is spread (client decision, 2026-10-22: "like in CS" — an aiming circle, the higher the skill, the smaller it is).
 * The angle from the crosshair to the circle's edge in degrees — from the weapon skill: 0% → 5.6°, 45% (a new hero) → 2.6°, 70% → 1.4°,
 * 100% and above → 0.6°. Whether a bullet hits is decided only by where it lands: the hero has no "to hit" roll.
 */
export function spreadDegrees(skill: number): number {
  const miss = 1 - Math.max(0, Math.min(100, skill)) / 100;
  return 0.6 + 5 * miss ** 1.5;
}

/**
 * The hero's shot spread — the angle from the crosshair to the circle's edge (radians). The main thing is the weapon skill (spreadDegrees); Perception
 * narrows the circle slightly (−4% per point above 5), lacking the Strength the weapon needs widens it (+25% per point: in the original −20% accuracy).
 * motion — movement and recoil (motionSpread, 1 — standing still).
 */
export function aimSpread(skill: number, perception: number, strengthLack: number, motion = 1): number {
  const eyes = Math.max(0.8, Math.min(1.2, 1 - (perception - 5) * 0.04));
  return ((spreadDegrees(skill) * Math.PI) / 180) * eyes * (1 + 0.25 * Math.max(0, strengthLack)) * motion;
}

/**
 * How much the target's distance widens the aiming circle (task from the client's friend, 2026-10-25: Perception is the range of accuracy).
 * Within Perception cells (2 hexes per point, as for NPCs in chanceToHit) the hero aims precisely; beyond that every extra
 * hex adds 5% spread — a translation of the original's rule "−4% accuracy per hex beyond what you see".
 * "Sharpshooter" (+2 to Perception for range) pushes the boundary out. No more than ×3.
 */
export function farAim(distanceCells: number, perception: number): number {
  return Math.min(3, 1 + 0.1 * Math.max(0, distanceCells - perception));
}

/**
 * Recoil accumulates (client, 2026-10-26: "thought-out combat where the player can't relax and spam"), as in CS:
 * every shot adds "heat" (recoilHeat), which cools by fade per second. The aiming circle is 1 + spread·heat times wider
 * (heat no more than max): the first shot is accurate, each next one without a pause (a pistol — once every 0.6 s) inflates the circle —
 * the fifth is already twice as wide, the tenth almost four times; once a second — every shot is almost accurate. Waiting pays off better than
 * clicking nonstop.
 */
export const RECOIL = { fade: 1.1, spread: 0.9, max: 3, hold: 4.5 } as const;

/**
 * Heat from one shot: an experienced shooter controls recoil (skill 45% — 1, 100% — 0.8, 150% — 0.6), lacking the Strength
 * the weapon needs — +0.3 per point, a crippled arm — ×1.5.
 */
export function recoilHeat(skill: number, strengthLack: number, crippledArm = false): number {
  const base = Math.max(0.6, Math.min(1.2, 1.2 - skill / 250)) + 0.3 * Math.max(0, strengthLack);
  return base * (crippledArm ? 1.5 : 1);
}

/**
 * How much movement and recoil widen the circle (as in CS): standing — 1, walking — 1.25, running — 1.6, jumping — 2; sneaking
 * in place — 0.85. heat — accumulated recoil (RECOIL): heat 1 — the circle is 1.9 times wider, 3 and more — 3.7.
 */
export function motionSpread(speed: number, airborne: boolean, sneaking: boolean, heat = 0): number {
  let k = 1 + Math.min(1, speed / 4.4) * 0.6;
  if (airborne) k = Math.max(k, 2);
  else if (sneaking && speed < 0.5) k = 0.85;
  return k * (1 + RECOIL.spread * Math.max(0, Math.min(RECOIL.max, heat)));
}

/**
 * Telegraph before an enemy attack (client, 2026-10-30: combat must depend on the player's skill): before a shot or a blow
 * the creature freezes in its attack pose for windup seconds — the same for every creature for now (per-creature timings come later,
 * by feel). During the freeze the hero can step out of the line of fire or out of reach, and can even walk through the creature.
 * arc — the cosine of the half-angle in front of a frozen fighter that its blow still reaches (0.5 — 60° to each side).
 */
export const TELEGRAPH = { windup: 0.5, arc: 0.5 } as const;

/** Half of the hero's width for enemy bullets (cells). */
export const HERO_HALF_WIDTH = 0.25;

/**
 * How much of the hero's movement a shooter leads when it locks its aim (it aims where the hero will be when the freeze ends):
 * skill 100% and above — fully, 50% — half. Running one way escapes a weak shooter; changing direction during the freeze escapes anyone.
 */
export const leadShare = (skill: number): number => Math.max(0, Math.min(1, skill / 100));

/**
 * Whether an enemy bullet hits the hero (client, 2026-10-30: the hit is decided by where the hero is, not by a hidden roll).
 * The shooter fires along the line from (sx, sy) through its locked aim point (ax, ay); the bullet deviates sideways by a random amount
 * within ±HERO_HALF_WIDTH / chance. So a hero who stood still on the aim line is hit with exactly the original's chance (chance, 0..1:
 * skill minus armor class and the distance penalty), and a hero who stepped out of the line by more than the scatter is never hit.
 * A target behind the shooter (walked through it) is not hit.
 */
export function shotHits(sx: number, sy: number, ax: number, ay: number, tx: number, ty: number, chance: number, rnd: Random = Math.random): boolean {
  const len = Math.hypot(ax - sx, ay - sy);
  if (len < 1e-6) return false;
  const nx = (ax - sx) / len;
  const ny = (ay - sy) / len;
  if ((tx - sx) * nx + (ty - sy) * ny <= 0) return false;
  const side = (ty - sy) * nx - (tx - sx) * ny;
  const scatter = HERO_HALF_WIDTH / Math.max(0.01, Math.min(1, chance));
  return Math.abs((rnd() * 2 - 1) * scatter - side) < HERO_HALF_WIDTH;
}

/**
 * Stagger from a hit — one rule for the hero and enemies (Opus decision, 2026-10-26): only a strong
 * hit (a quarter of health or more at once) or a critical one staggers, and no more often than once per STAGGER.grace seconds. Previously any
 * hit interrupted an enemy's shot — the hero, firing often, never let it shoot even once.
 */
export const STAGGER = { share: 0.25, grace: 2 } as const;
export const staggers = (damage: number, maxHp: number, critical: boolean): boolean => damage > 0 && (critical || damage >= maxHp * STAGGER.share);

/**
 * The hero's wound (like crippled arms and legs in the original, where only critical hits cripple them): a critical
 * hit or half of health at once cripples an arm or a leg. Arm — the aiming circle is one and a half times wider, recoil accumulates more, reloading is slower;
 * leg — walks slower, can't run or jump. Healed by the Doctor skill on oneself or a day of time.
 */
export const CRIPPLE = { share: 0.5, armSpread: 1.5, armReload: 1.5, legSpeed: 0.65, heals: 24 * 3600 } as const;
export const cripples = (damage: number, maxHp: number, critical: boolean): boolean => damage > 0 && (critical || damage >= maxHp * CRIPPLE.share);

/**
 * The hero is knocked down (client, 2026-10-26; Opus decided when): an explosion — from a fifth of health at once, a critical
 * hit — from a third, any hit — from 45%. Falls over fall seconds (gaze sharply up, eyes at ground level), lies for lie, gets up over
 * rise; all this time he can neither walk nor shoot, while enemies hit him. He can't be knocked down again until grace seconds after getting up.
 * Endurance (client, 2026-10-27): each point above 5 raises these shares by endurance (10 — one and a half times), below 5 —
 * lowers them (1 — 60% of normal): a tough one is harder to knock down.
 */
export const KNOCKDOWN = { fall: 0.35, lie: 0.55, rise: 1.1, grace: 4, share: 0.45, critShare: 0.3, blastShare: 0.2, endurance: 0.1 } as const;
export const KNOCKDOWN_TIME = KNOCKDOWN.fall + KNOCKDOWN.lie + KNOCKDOWN.rise;
export function knocksDown(damage: number, maxHp: number, critical: boolean, blast: boolean, endurance = 5): boolean {
  const hold = maxHp * (1 + (Math.max(1, Math.min(10, endurance)) - 5) * KNOCKDOWN.endurance);
  return damage > 0 && (damage >= hold * KNOCKDOWN.share || (critical && damage >= hold * KNOCKDOWN.critShare) || (blast && damage >= hold * KNOCKDOWN.blastShare));
}

/** Gaze pitch (in Camera.pitch units) — a knocked-down hero looks up. */
const KNOCK_LOOK = 420;
/** How far the eyes drop while lying (cells) and how strongly the hero's gaze sags down as he sits up. */
const KNOCK_DROP = 0.36;
const KNOCK_DIP = 160;

/**
 * The gaze of a knocked-down hero elapsed seconds after the hit: pitch — where he looks (w — how much this overrides his
 * own gaze: 1 — entirely), drop — how much lower than normal the eyes are, sway — swaying sideways (radians, side — where
 * he fell). Falling — looks sharply up and sinks to the ground; getting up — rises, looks at his feet for a moment and
 * straightens up, staggering.
 */
export function knockView(elapsed: number, side: number): { pitch: number; w: number; drop: number; sway: number } {
  const ease = (x: number) => x * x * (3 - 2 * x);
  const { fall, lie, rise } = KNOCKDOWN;
  if (elapsed < fall) {
    const k = elapsed / fall;
    return { pitch: KNOCK_LOOK * (1 - (1 - k) * (1 - k)), w: Math.min(1, k * 3), drop: KNOCK_DROP * k * k, sway: 0.18 * side * k };
  }
  if (elapsed < fall + lie) {
    const k = (elapsed - fall) / lie;
    // Hitting the ground: the eyes bounce slightly and come back down.
    return { pitch: KNOCK_LOOK + Math.sin(k * Math.PI) * 25, w: 1, drop: KNOCK_DROP - Math.sin(k * Math.PI) * 0.03, sway: 0.18 * side };
  }
  const k = Math.min(1, (elapsed - fall - lie) / rise);
  return {
    pitch: KNOCK_LOOK * (1 - ease(k)) - KNOCK_DIP * Math.sin(k * Math.PI),
    w: 1 - ease(Math.max(0, (k - 0.55) / 0.45)),
    drop: KNOCK_DROP * (1 - ease(k)),
    sway: side * (0.18 * (1 - ease(k)) + 0.07 * Math.sin(k * Math.PI * 2.5) * (1 - k)),
  };
}

/**
 * Where the hero's bullet hit — by the point in the creature's image (u — left to right, v — top to bottom, 0–1 over the visible part
 * of the sprite). Humans and mutants: the top 17% — head, the bottom 38% — legs, the sides of the middle — arms, the rest — body.
 * Animals: the bottom quarter — legs, the rest — body (an animal's head can't be told apart in the image).
 */
export type BodyZone = 'head' | 'torso' | 'arms' | 'legs';
export function bodyZone(u: number, v: number, upright: boolean): BodyZone {
  if (!upright) return v > 0.75 ? 'legs' : 'torso';
  if (v < 0.17) return 'head';
  if (v > 0.62) return 'legs';
  return Math.abs(u - 0.5) > 0.28 ? 'arms' : 'torso';
}

/**
 * What a hit to a body part does (the original's aimed shots): head — always critical; arms and legs — damage
 * ×0.8, but an arm may drop its weapon (a strong hit — 40%), a leg — limps until the end of the fight (step ×0.55).
 */
export const ZONE = { limbDamage: 0.8, disarmShare: 0.15, disarmChance: 0.4, limp: 0.55 } as const;

/**
 * Aimed melee blow (client, 2026-10-29: Garl couldn't be beaten with fists): where the crosshair points — that's where the blow lands, by the same
 * rules as a bullet (head — always critical, arms and legs — ZONE), but it's harder to hit, as with the original's aimed
 * attacks: head −40%, arms −30%, legs −20%. A shot has no modifier: there the aiming circle decides the hit.
 */
export const MELEE_AIM: Readonly<Record<BodyZone, number>> = { head: 40, arms: 30, legs: 20, torso: 0 };

/**
 * Targeted attack (client, 2026-10-29; the original's aimed attacks): RMB with a weapon in hand — a mode, crosshair on an enemy —
 * a list of body parts with chances, the shot or blow goes to the chosen one. The chance doesn't depend on skill: only on the body part and Luck
 * (base − the original's body part modifier + luck for every point of Luck above 5, from min to max). Such an attack's delay — ×delay.
 * Eyes — always critical, and stronger than usual (+eyesPower to crit power); head — always critical; groin —
 * critical with chance groinCrit, and the enemy can't attack for groinStun seconds; arms and legs — like a bullet (ZONE).
 */
export type AimPart = 'eyes' | 'head' | 'torso' | 'groin' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
export const AIM_PARTS: readonly AimPart[] = ['eyes', 'head', 'torso', 'groin', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
/** Animals (running on four legs) — no groin and arms: eyes, head, torso, legs. */
export const BEAST_AIM_PARTS: readonly AimPart[] = ['eyes', 'head', 'torso', 'leftLeg', 'rightLeg'];
export const AIMED = {
  base: 75,
  penalty: { eyes: 60, head: 40, torso: 0, groin: 30, leftArm: 30, rightArm: 30, leftLeg: 20, rightLeg: 20 } as Readonly<Record<AimPart, number>>,
  luck: 3,
  min: 5,
  max: 95,
  delay: 1.2,
  eyesPower: 1,
  groinCrit: 50,
  groinStun: 2,
} as const;

/** Chance to hit this body part with a targeted attack, percent. */
export function aimedChance(part: AimPart, luck: number): number {
  return Math.max(AIMED.min, Math.min(AIMED.max, AIMED.base - AIMED.penalty[part] + (luck - 5) * AIMED.luck));
}

/** Which body part this is for a hit (combat → ZONE): eyes — head, groin — torso. */
export function aimedZone(part: AimPart): BodyZone {
  if (part === 'eyes' || part === 'head') return 'head';
  if (part === 'leftArm' || part === 'rightArm') return 'arms';
  if (part === 'leftLeg' || part === 'rightLeg') return 'legs';
  return 'torso';
}

/** Where in a circle of radius radius a bullet will land: in any direction, more often nearer the centre than the edge (as in shooters). */
export function spreadPoint(radius: number, rnd: () => number = Math.random): { x: number; y: number } {
  const a = rnd() * Math.PI * 2;
  const r = radius * rnd();
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

/**
 * The weapon letter in a creature's image names (as in the original): unarmed — "A", knife — "D", club — "E", hammer — "F",
 * spear — "G", pistol — "H", SMG — "I", rifle and shotgun — "J", heavy — "K", minigun — "L", rocket launcher — "M".
 */
export const weaponArtLetter = (animationCode: number): string => String.fromCharCode(animationCode > 0 ? 67 + animationCode : 65);

type ThrowData = { capacity: number; range: number; maxDamage: number; damageType: number; projectilePid?: number };

/**
 * Grenade: a weapon that is thrown (no magazine, range over two cells, has a projectile), with damage greater than a flare
 * and not normal damage (explosion, plasma, pulse). A throwing knife and a rock deal normal damage — they don't explode
 * (2026-10-24: the knife exploded like a grenade).
 */
export const isGrenade = (item: { weapon?: ThrowData }): boolean => {
  const w = item.weapon;
  return !!w && w.capacity <= 0 && w.range > 2 && w.maxDamage > 1 && (w.projectilePid ?? -1) > 0 && w.damageType !== 0;
};

/** A thrown weapon (throwing knife, rock): thrown like a grenade, but deals normal damage to whoever it hits. */
export const isThrownWeapon = (w: ThrowData | undefined): boolean => !!w && w.capacity <= 0 && w.range > 2 && w.maxDamage > 1 && w.damageType === 0;

/** Melee weapons (knife, club, hammer, spear) — by animation code. */
export const isMeleeWeapon = (animationCode: number): boolean => animationCode >= 1 && animationCode <= 4;

/** Unarmed damage for creatures: from 1 to (melee damage + 1), no less than 2. */
export function unarmedDamage(stats: number[]): { min: number; max: number } {
  return { min: 1, max: Math.max(2, (stats[STAT.meleeDamage] ?? 1) + 1) };
}
