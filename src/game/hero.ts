// The hero: health, weapons, ammo, stimpaks. All numbers come from the character (character.ts) by the common fighter rules
// (fighter.ts), the same as for NPCs. The character is made on the creation screen (character-screen.ts) before a new game.
// A weapon is any suitable item from the inventory: guns fire their own ammo (each has its own magazine), a knife, a spear and
// brass knuckles hit up close. There are two hands, as in the original: each holds any item, one is active (F switches); if the active hand holds
// no weapon or is empty — fists. At the start of the game the cave's script hands out a pistol, as in the original.
import type { ItemProto, WeaponData } from '../formats/pro.ts';
import { derivedStats, newCharacter, PERK, perkRank, SKILL, TRAIT, type Character } from './character.ts';
import { gainExperience } from './perks.ts';
import { AIMED, ATTACK_SPEED, attackDelay, CRIPPLE, drawFactor, JINX, cripples, isMeleeWeapon, isThrownWeapon, KNOCKDOWN, KNOCKDOWN_TIME, knocksDown, RECOIL, recoilHeat, STAGGER, staggers } from './combat.ts';
import { agilityTime, characterFighter, drugHeal, RELOAD_SECONDS, SKILL_SECONDS, weaponSkill, type Fighter } from './fighter.ts';
import { Inventory, stackWeight } from './inventory.ts';

/** The default character while there's no creation screen: all stats 5, the tag skill is "Small Guns". */
export const defaultHeroCharacter = (): Character => ({ ...newCharacter(), tagged: [SKILL.smallGuns] });

export interface Loadout {
  weapon: ItemProto & { weapon: WeaponData };
  ammo: ItemProto;
  stimpak: ItemProto;
}

export type WeaponItem = ItemProto & { weapon: WeaponData };

/** Fists (nothing in hand): the Unarmed skill, damage 1–2 plus the melee bonus, 3 AP per blow — as in the original. */
export const FISTS: WeaponData = { minDamage: 1, maxDamage: 2, damageType: 0, range: 1, minStrength: 0, apCost: 3, apCostMode2: 3, caliber: 0, ammoPid: -1, capacity: 0, animationCode: 0 };

/**
 * Does the weapon hit up close (fists, brass knuckles, knife, club, spear): no ammo and range up to 2. A grenade and a flare
 * are also "weapons" without ammo, but they are thrown (range 15) — that's not melee.
 */
export const isMelee = (weapon: WeaponData): boolean =>
  weapon.capacity <= 0 && weapon.range <= 2 && ((weapon.animationCode ?? 0) === 0 || isMeleeWeapon(weapon.animationCode ?? 0));

/**
 * Can an item be taken in hand as a weapon: guns with ammo, melee and thrown weapons (knife, rock — LMB
 * throws them). Grenades and dynamite are items in hand; they are used.
 */
export function canWield(item: ItemProto): item is WeaponItem {
  const w = item.weapon;
  if (!w) return false;
  return isMelee(w) || isThrownWeapon(w) || (w.capacity > 0 && w.ammoPid >= 0);
}

/** Does ammo fit a gun: its "own" or of the same calibre (armor-piercing 10mm — for the 10mm pistol). */
export const ammoFits = (ammo: ItemProto, weapon: WeaponData): boolean =>
  weapon.capacity > 0 && (ammo.pid === weapon.ammoPid || (!!ammo.ammo && weapon.caliber > 0 && ammo.ammo.caliber === weapon.caliber));

/**
 * Pause between the hero's attacks at average Agility and skill, seconds (client, 2026-10-24: you can't "click an enemy to death"); with
 * Agility and skill it's shorter (client, 2026-10-27; combat.ts → attackDelay).
 */
export const ATTACK_PAUSE = ATTACK_SPEED.floor;
/**
 * Stagger from a strong hit (combat.ts → staggers): how many seconds the hero stands still and how fast the shake fades.
 * The next stagger — no sooner than STAGGER.grace seconds later, as for enemies.
 */
export const HURT_STUN = 0.6;
const HURT_SHAKE_FADE = 4;
/** Any hit throws off the aim: a bonus to recoil (the aiming circle is wider), as if he fired one and a half more shots. */
const HURT_FLINCH = 1.5;
/**
 * Under fire (client, 2026-10-26: thought-out combat): an enemy bullet passed close by — the aim shakes (a bonus to recoil) and
 * the camera jerks slightly. That's how a squad pins the hero down with fire while others flank.
 */
const SUPPRESS_FLINCH = 0.6;
/**
 * Running and jumping in combat spend AP (client, 2026-10-26: you can't endlessly run in circles and shoot): while the hero runs,
 * AP don't recover and are spent at RUN_AP per second; a jump costs JUMP_AP. No AP — walking only and no jumping.
 */
export const RUN_AP = 1;
export const JUMP_AP = 2;

/** How far a melee weapon reaches (cells): a spear — further. */
export const meleeReach = (weapon: WeaponData): number => (weapon.range >= 2 ? 2 : 1.4);

export type FireResult = 'fired' | 'busy' | 'empty' | 'reloading' | 'noAp' | 'jammed';

/**
 * Overload (client, 2026-10-27: carry weight was useless): items heavier than the hero can carry (Strength, "Strong
 * Back", "Small Frame") — he doesn't run or jump, walks slower (speed) and is knocked down more easily (knock — this many
 * Endurance points as if missing).
 */
export const OVERLOAD = { speed: 0.75, knock: 3 } as const;
/** "Fast Shot" (a trait): the pause between attacks is shorter (delay), the aiming circle is wider (spread; scene.ts → heroSpread). */
export const FAST_SHOT = { delay: 0.7, spread: 1.35 } as const;
export type ReloadResult = 'started' | 'noAp' | 'no';

/**
 * Action points (client decision, 2026-10-21): combat is real-time, shots and walking don't spend AP,
 * while reloading, the inventory and drugs do, as in Fallout. Costs are from the original, at Agility 5; how much it costs
 * the hero — Hero.apCost (an agile one pays less).
 */
export const AP_COST = { reload: 2, inventory: 4, useItem: 2 } as const;
/** Recoil for spread: how much a shot adds and how much goes away per second (combat.ts → motionSpread). */
/** In how many seconds the full AP pool recovers (roughly one "turn" of the original). */
export const AP_REFILL_SECONDS = 4;

export class Hero {
  private heroCharacter: Character;
  private heroFighter: Fighter;
  hp: number;
  ap: number;
  /** Combat is on (an enemy has spotted the hero). Out of combat AP aren't spent — as in the original. */
  inCombat = false;
  /** There was combat, and the weapon hasn't been put away by itself since (play.ts); calmFor — how many seconds there's been no combat or shots. */
  fought = false;
  calmFor = 0;
  /** How many seconds ago the hero attacked himself (shot, blow, throw): in the wasteland a companion doesn't join a fight without it. */
  sinceAttack = Infinity;
  experience = 0;
  kills = 0;

  readonly loadout: Loadout;
  readonly inventory = new Inventory();
  /**
   * Items in hand (PID; null — empty): [Hand 1, Hand 2], as in the original's inventory window. undefined in the second hand —
   * not chosen yet: a pistol from the inventory will end up there by itself.
   */
  private hands: [number | null, number | null | undefined] = [null, undefined];
  /** The active hand: 0 — Hand 1, 1 — Hand 2. Only it fires and is visible on screen and to critters. */
  activeHand: 0 | 1 = 1;
  /** Ammo in each gun's magazine (by PID). A new gun, as in the original, is fully loaded. */
  private readonly rounds = new Map<number, number>();
  /**
   * What ammo a gun is loaded with (gun PID → ammo); no entry — its "own". Any ammo of the same
   * calibre fits, but the magazine holds one kind: load another — the previous one goes back to the inventory (client, 2026-10-24).
   */
  private readonly loaded = new Map<number, number>();
  /** What the reload is currently using. */
  private reloadWith: ItemProto | null = null;
  /** Known ammo by PID — to return rounds taken out of a magazine to the inventory. */
  private readonly ammoProtos = new Map<number, ItemProto>();
  /** Find ammo by PID if it hasn't been seen yet (set by the session: the data is read from the player's copy). */
  findAmmo: ((pid: number) => Promise<ItemProto>) | null = null;
  /** Stagger from a hit: how many seconds the hero stands still and doesn't attack (like a critter that was hit). */
  stunLeft = 0;
  /** Knocked down (combat.ts → KNOCKDOWN): how many more seconds he lies and gets up; 0 — on his feet. knockSide — where he fell (±1). */
  knockLeft = 0;
  knockSide = 1;
  /** How long he can't be knocked down again. */
  private knockGrace = 0;
  /** How long he can't be staggered again (so a pack can't pin the hero in place forever). */
  private stunGrace = 0;
  /** Whether the hero is running this frame (the scene, by last frame's steps): then AP in combat don't accumulate but are spent. */
  exerting = false;
  /** Camera shake from a hit (1 — just now, 0 — gone). */
  shake = 0;
  /** Armor worn (PID); null — no armor. */
  private wornPid: number | null = null;
  /** Which armor the fighter is currently computed for (armor sold — recompute). */
  private fighterArmor: number | null = null;

  private fireCooldown = 0;
  /** From what delay the current countdown to the next attack started (the ring on the crosshair — play.ts). */
  attackDelayTotal = 0;
  /** Overload has already been announced (the scene writes "overloaded" and "no longer overloaded" once). */
  overloadNoted = false;
  reloadLeft = 0;
  /** For the image: recoil and muzzle flash (for melee — a lunge). */
  recoil = 0;
  /** Accumulated recoil (heat, RECOIL in combat.ts): every shot adds to it, a second of calm almost clears it. */
  spreadKick = 0;
  /** An arm and a leg crippled (combat.ts → CRIPPLE); the session remembers when (vars pc:crippledArm, pc:crippledLeg). */
  crippledArm = false;
  crippledLeg = false;
  /** Which one is broken: the left (true) or the right (pc:crippledArmLeft, pc:crippledLegLeft — the session remembers). */
  armLeft = false;
  legLeft = false;
  flash = 0;
  /** A red screen flash after a bite. */
  hurtFlash = 0;
  /** Immortality (the test range panel): damage doesn't go through. */
  immortal = false;
  /** The weapon is holstered (Q; when talking out of combat — by itself): hands are empty, critters aren't scared, a shot first draws the weapon. */
  holstered = false;
  /** For the image: how far the weapon is holstered, 0 — in hand, 1 — holstered. */
  holsterPos = 0;
  /** Hands busy with a skill: how many seconds are left and how many in total (weapon lowered, no shooting or reloading). */
  skillLeft = 0;
  skillTotal = 0;

  /** A hero with no items. */
  constructor(loadout: Loadout, character: Character = defaultHeroCharacter()) {
    this.heroCharacter = character;
    this.heroFighter = this.fighterWithArmor(character);
    this.hp = this.maxHp;
    this.ap = this.maxAp;
    this.loadout = loadout;
    this.ammoProtos.set(loadout.ammo.pid, loadout.ammo);
  }

  /** PID of the item in hand (undefined in the second — the default pistol). */
  private handPid(hand: 0 | 1): number | null {
    const raw = this.hands[hand];
    return raw === undefined ? this.loadout.weapon.pid : raw;
  }

  /**
   * The item in hand (any: a weapon, a rope); it's not in the inventory (sold, given away) — empty. The same item in both hands
   * — two of them are needed, otherwise it's in the second hand.
   */
  handItem(hand: 0 | 1): ItemProto | null {
    const pid = this.handPid(hand);
    if (pid === null) return null;
    const stack = this.inventory.items.find((s) => s.proto.pid === pid);
    if (!stack) return null;
    if (hand === 0 && this.handPid(1) === pid && stack.count < 2) return null;
    return stack.proto;
  }

  /** The item in the active hand. */
  get activeItem(): ItemProto | null {
    return this.handItem(this.activeHand);
  }

  /** The weapon in the active hand; not a weapon or empty — fists (null). */
  get weaponItem(): WeaponItem | null {
    const item = this.activeItem;
    return item && canWield(item) ? item : null;
  }

  /** Put an item from the inventory into a hand (null — free it). The same item in the other hand (a single one) moves over. */
  putInHand(hand: 0 | 1, item: ItemProto | null): void {
    this.hands[hand] = item ? item.pid : null;
    const other = (1 - hand) as 0 | 1;
    if (item && this.handPid(other) === item.pid && (this.inventory.items.find((s) => s.proto.pid === item.pid)?.count ?? 0) < 2) this.hands[other] = null;
    if (hand === this.activeHand) this.weaponChanged();
  }

  /** Take an item from the inventory into the active hand; null — free the hand (fists). */
  equip(item: WeaponItem | null): void {
    this.putInHand(this.activeHand, item);
  }

  /** F — switch the active hand. */
  toggleHand(): void {
    this.activeHand = this.activeHand === 0 ? 1 : 0;
    this.weaponChanged();
  }

  /** The weapon in hand changed: the reload is reset, the shot isn't immediate. */
  private weaponChanged(): void {
    this.reloadLeft = 0;
    this.reloadWith = null;
    this.fireCooldown = Math.max(this.fireCooldown, 0.3 * this.agilityFactor * drawFactor(this.heroFighter.sequence ?? 10));
  }

  /** What's in the second hand — for saving: PID, null — empty, undefined — not chosen yet. */
  get heldForSave(): number | null | undefined {
    return this.hands[1];
  }

  /** What's in the first hand — for saving. */
  get firstHandForSave(): number | null {
    return this.hands[0];
  }

  /** Ammo in the magazines — for saving. */
  get magazines(): [number, number][] {
    return [...this.rounds];
  }

  /** What ammo the guns are loaded with — for saving: [gun PID, ammo PID] (only those not loaded with their "own"). */
  get loadedForSave(): [number, number][] {
    return [...this.loaded];
  }

  /**
   * Weapons from a save: the second hand, magazines, the first hand, which one is active and what the guns are loaded with (no fields — an early
   * version: one hand, "own" ammo).
   */
  restoreWeapons(held: number | null | undefined, magazines: [number, number][], first: number | null = null, active: 0 | 1 = 1, loaded: [number, number][] = []): void {
    this.hands = [first, held];
    this.activeHand = active;
    this.rounds.clear();
    for (const [pid, n] of magazines) this.rounds.set(pid, n);
    this.loaded.clear();
    for (const [pid, ammo] of loaded) this.loaded.set(pid, ammo);
  }

  /** Is there an item in hand (not fists). */
  get armed(): boolean {
    return this.weaponItem !== null;
  }

  /** Is it hitting up close now (fists, knife, spear). */
  get melee(): boolean {
    return isMelee(this.weapon);
  }

  /** A thrown weapon in hand (knife, rock): LMB throws it. */
  get thrown(): boolean {
    return isThrownWeapon(this.weaponItem?.weapon);
  }

  /** PID of the ammo in a gun's magazine (no entry — its "own"). */
  private loadedPid(item: WeaponItem): number {
    return this.loaded.get(item.pid) ?? item.weapon.ammoPid;
  }

  /** The ammo in the magazine of the weapon in hand — for the label (not seen in the inventory — null). */
  get loadedAmmo(): ItemProto | null {
    const pid = this.loadedAmmoPid;
    if (pid < 0) return null;
    return this.ammoProtos.get(pid) ?? this.inventory.items.find((s) => s.proto.pid === pid)?.proto ?? null;
  }

  /** What ammo the reload is using (null — not reloading). */
  get reloadingWith(): ItemProto | null {
    return this.reloadLeft > 0 ? this.reloadWith : null;
  }

  /** PID of the ammo in the magazine of the weapon in hand (for melee and thrown — -1). */
  get loadedAmmoPid(): number {
    const item = this.weaponItem;
    return item && item.weapon.capacity > 0 ? this.loadedPid(item) : -1;
  }

  /** Ammo from the inventory that fits the weapon in hand (any of the same calibre). */
  private fittingAmmo(): { proto: ItemProto; count: number }[] {
    const item = this.weaponItem;
    if (!item || item.weapon.capacity <= 0) return [];
    return this.inventory.items.filter((s) => ammoFits(s.proto, item.weapon));
  }

  /**
   * What to reload with: the chosen ammo (in the inventory — "Use" on it), if it fits; otherwise the same as in
   * the magazine; none of those left — other fitting ammo, if it loads more than is in the magazine now.
   */
  private pickAmmo(prefer: ItemProto | null): ItemProto | null {
    const item = this.weaponItem;
    if (!item) return null;
    const fits = this.fittingAmmo();
    if (prefer) return fits.find((s) => s.proto.pid === prefer.pid)?.proto ?? null;
    const current = this.loadedPid(item);
    const same = fits.find((s) => s.proto.pid === current);
    if (same) return this.magazine < item.weapon.capacity ? same.proto : null;
    const other = fits.sort((a, b) => b.count - a.count)[0];
    return other && Math.min(item.weapon.capacity, other.count) > this.magazine ? other.proto : null;
  }

  /** Ammo in the magazine of the weapon in hand. */
  get magazine(): number {
    const item = this.weaponItem;
    if (!item || item.weapon.capacity <= 0) return 0;
    return this.rounds.get(item.pid) ?? item.weapon.capacity;
  }

  set magazine(n: number) {
    const item = this.weaponItem;
    if (item) this.rounds.set(item.pid, Math.max(0, n));
  }

  /** The hero's character: stats, skills, traits. Scripts and levels change it via setCharacter. */
  get character(): Character {
    return this.heroCharacter;
  }

  /**
   * Gain experience: levels grow by themselves (health is added and immediately heals by the same amount, skill points and perks wait for
   * the character screen). Returns how much experience was actually gained and how many levels he went up.
   */
  addExperience(points: number): { gained: number; levels: number } {
    const r = gainExperience(this.heroCharacter, this.experience, points);
    this.experience += r.gained;
    if (r.levels > 0) {
      this.setCharacter(r.character);
      this.hp = Math.min(this.maxHp, this.hp + r.hp);
    }
    return { gained: r.gained, levels: r.levels };
  }

  /** The hero's level. */
  get level(): number {
    return Math.max(1, this.heroCharacter.level ?? 1);
  }

  /** Armor worn (it's not in the inventory — sold, given away — means no armor). */
  get armorItem(): ItemProto | null {
    if (this.wornPid === null) return null;
    const stack = this.inventory.items.find((s) => s.proto.pid === this.wornPid);
    return stack?.proto.armor ? stack.proto : null;
  }

  /** Put on armor from the inventory (null — take it off): armor class and damage protection — from its data. */
  wear(item: ItemProto | null): void {
    this.wornPid = item?.armor ? item.pid : null;
    this.heroFighter = this.fighterWithArmor(this.heroCharacter);
  }

  /** What's worn — for saving. */
  get wornForSave(): number | null {
    return this.wornPid;
  }

  /** A fighter from the character and the worn armor: the armor's AC is added, the threshold and resistance to normal damage are its own. */
  private fighterWithArmor(character: Character): Fighter {
    const f = characterFighter(character);
    const armor = this.armorItem?.armor;
    if (!armor) return f;
    return { ...f, ac: f.ac + armor.armorClass, armor: { dt: f.armor.dt + (armor.damageThreshold[0] ?? 0), dr: Math.min(90, f.armor.dr + (armor.damageResistance[0] ?? 0)) } };
  }

  setCharacter(character: Character): void {
    this.heroCharacter = character;
    this.heroFighter = this.fighterWithArmor(character);
    this.hp = Math.min(this.hp, this.maxHp);
  }

  /** The hero as a fighter — by the same rules as NPCs. */
  get fighter(): Fighter {
    return this.heroFighter;
  }

  get maxHp(): number {
    return this.heroFighter.maxHp;
  }

  get ac(): number {
    return this.heroFighter.ac;
  }

  get critChance(): number {
    return this.heroFighter.critChance;
  }

  get maxAp(): number {
    return this.heroFighter.maxAp;
  }

  /** Skill with the weapon in hand (pistol — "Small Guns", knife — "Melee Weapons", fists — "Unarmed"), %. */
  get gunSkill(): number {
    return weaponSkill(this.heroFighter, this.weaponItem?.weapon);
  }

  /**
   * Spare ammo for the weapon in the inventory: the same kind as in the magazine (ran out — all fitting ones); for thrown —
   * how many in hand and in reserve; for melee — 0.
   */
  get reserve(): number {
    const item = this.weaponItem;
    if (item && this.thrown) return this.inventory.count(item.pid);
    if (!item || this.melee) return 0;
    const fits = this.fittingAmmo();
    const same = fits.find((s) => s.proto.pid === this.loadedPid(item));
    return same ? same.count : fits.reduce((n, s) => n + s.count, 0);
  }

  get stimpaks(): number {
    return this.inventory.count(this.loadout.stimpak.pid);
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /** The weapon in hand; nothing — fists. */
  get weapon(): WeaponData {
    return this.weaponItem?.weapon ?? FISTS;
  }

  /** How many times the hero's actions are faster (less than 1) or slower than normal — from Agility. */
  get agilityFactor(): number {
    return agilityTime(this.heroFighter.special.agility);
  }

  /** An action's AP cost for the hero: the original's cost adjusted for Agility, to tenths. */
  apCost(base: number): number {
    return Math.round(base * this.agilityFactor * 10) / 10;
  }

  /** Start a skill: hands are busy for this many seconds (from Agility). */
  startSkill(): number {
    this.skillLeft = this.skillTotal = SKILL_SECONDS * this.agilityFactor;
    return this.skillLeft;
  }

  cancelSkill(): void {
    this.skillLeft = 0;
  }

  get skillBusy(): boolean {
    return this.skillLeft > 0;
  }

  /** Spend AP on an action. Out of combat — free. false — not enough. */
  spendAp(cost: number): boolean {
    if (!this.inCombat) return true;
    if (this.ap < cost) return false;
    this.ap -= cost;
    return true;
  }

  update(dt: number): void {
    const armor = this.armorItem?.pid ?? null;
    if (armor !== this.fighterArmor) {
      this.fighterArmor = armor;
      this.heroFighter = this.fighterWithArmor(this.heroCharacter);
    }
    if (!this.inCombat) this.ap = this.maxAp;
    else if (this.exerting) this.ap = Math.max(0, this.ap - RUN_AP * dt);
    else this.ap = Math.min(this.maxAp, this.ap + (this.maxAp / AP_REFILL_SECONDS) * dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.spreadKick = Math.max(0, this.spreadKick - dt * RECOIL.fade);
    this.flash = Math.max(0, this.flash - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    const lowered = this.holstered || this.skillLeft > 0 || this.knockLeft > 0;
    this.skillLeft = Math.max(0, this.skillLeft - dt);
    this.holsterPos = lowered ? Math.min(1, this.holsterPos + dt * 4) : Math.max(0, this.holsterPos - dt * 4);
    this.stunLeft = Math.max(0, this.stunLeft - dt);
    this.knockLeft = Math.max(0, this.knockLeft - dt);
    this.knockGrace = Math.max(0, this.knockGrace - dt);
    if (this.inCombat) {
      this.fought = true;
      this.calmFor = 0;
    } else {
      this.calmFor += dt;
    }
    this.sinceAttack += dt;
    this.stunGrace = Math.max(0, this.stunGrace - dt);
    this.shake = Math.max(0, this.shake - dt * HURT_SHAKE_FADE);
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        this.reloadLeft = 0;
        this.finishReload();
      }
    }
  }

  /** Reload finished: a different kind of ammo — the previous rounds from the magazine go back to the inventory. */
  private finishReload(): void {
    const item = this.weaponItem;
    const ammo = this.reloadWith;
    this.reloadWith = null;
    if (!item || !ammo) return;
    const was = this.loadedPid(item);
    if (ammo.pid !== was && this.magazine > 0) {
      const n = this.magazine;
      this.magazine = 0;
      const known = this.ammoProtos.get(was) ?? this.inventory.items.find((s) => s.proto.pid === was)?.proto;
      if (known) this.inventory.add(known, n);
      else void this.findAmmo?.(was).then((proto) => this.inventory.add(proto, n));
    }
    this.ammoProtos.set(ammo.pid, ammo);
    if (ammo.pid === item.weapon.ammoPid) this.loaded.delete(item.pid);
    else this.loaded.set(item.pid, ammo.pid);
    this.magazine += this.inventory.remove(ammo.pid, item.weapon.capacity - this.magazine);
  }

  /** Seconds until the next attack (0 — now). */
  get attackLeft(): number {
    return this.fireCooldown;
  }

  /** aimed — a targeted attack: the pause after it is longer (combat.ts → AIMED.delay). */
  private startAttackDelay(apCost: number, aimed = false): void {
    const fast = this.heroCharacter.traits.includes(TRAIT.fastShot) ? FAST_SHOT.delay : 1;
    this.fireCooldown = attackDelay(apCost, this.heroFighter.special.agility, this.gunSkill) * fast * (aimed ? AIMED.delay : 1);
    this.attackDelayTotal = this.fireCooldown;
  }

  /** aimed — a targeted attack (RMB, a chosen body part): the pause after it is 20% longer. */
  fire(aimed = false): FireResult {
    if (!this.alive || this.skillLeft > 0 || this.stunLeft > 0) return 'busy';
    // Weapon holstered — the first click draws it.
    if (this.holstered) {
      this.holstered = false;
      this.fireCooldown = 0.25 * drawFactor(this.heroFighter.sequence ?? 10);
      return 'busy';
    }
    // Shooting — not a lull (at a fleeing target, at a lock).
    this.calmFor = 0;
    if (this.reloadLeft > 0) return 'reloading';
    if (this.fireCooldown > 0) return 'busy';
    this.sinceAttack = 0;
    // Melee and throwing: no ammo, a blow — once per its AP cost (no more often than ATTACK_PAUSE at average
    // Agility and skill), faster — with Agility and skill with this weapon (combat.ts → attackDelay).
    if (this.melee || this.thrown) {
      this.startAttackDelay(this.weapon.apCost, aimed);
      this.recoil = 1;
      return 'fired';
    }
    if (this.magazine <= 0) {
      const reload = this.reload();
      if (reload === 'started') return 'reloading';
      this.fireCooldown = 0.4;
      return reload === 'noAp' ? 'noAp' : 'empty';
    }
    this.magazine -= 1;
    // "Jinxed" (a trait, as in the original — for everyone around): the weapon sometimes jams — the round is lost, a pause.
    if (this.heroCharacter.traits.includes(TRAIT.jinxed) && Math.random() < JINX.jam) {
      this.fireCooldown = this.attackDelayTotal = JINX.clear;
      return 'jammed';
    }
    const lack = Math.max(0, this.weapon.minStrength - this.heroFighter.special.strength);
    this.spreadKick = Math.min(RECOIL.hold, this.spreadKick + recoilHeat(this.gunSkill, lack, this.crippledArm));
    // "Bonus Rate of Fire": a shot costs 1 AP less.
    this.startAttackDelay(Math.max(1, this.weapon.apCost - perkRank(this.heroCharacter, PERK.bonusRateOfFire)), aimed);
    this.recoil = 1;
    this.flash = 0.06;
    return 'fired';
  }

  /** Start reloading: 'no' — nothing to reload with or no need, 'noAp' — not enough AP in combat. */
  /**
   * Reload the weapon in hand: prefer — which ammo (chosen in the inventory); without it — the same as in the magazine,
   * and if that ran out — other fitting ammo. 'wrong' — the chosen ammo doesn't fit this weapon.
   */
  reload(prefer: ItemProto | null = null): ReloadResult | 'wrong' {
    if (!this.alive || this.reloadLeft > 0 || this.skillLeft > 0 || this.melee || this.thrown) return 'no';
    const item = this.weaponItem;
    if (!item) return 'no';
    if (prefer && !ammoFits(prefer, item.weapon)) return 'wrong';
    const ammo = this.pickAmmo(prefer);
    if (!ammo) return 'no';
    if (ammo.pid === this.loadedPid(item) && this.magazine >= item.weapon.capacity) return 'no';
    if (!this.spendAp(this.apCost(AP_COST.reload))) return 'noAp';
    this.reloadWith = ammo;
    this.reloadLeft = this.reloadTime;
    return 'started';
  }

  /**
   * Stimpak: in a Fallout prototype "-2" means "random from A to B" for the stat from the second field.
   * free — from the open inventory (AP were already paid for opening it), otherwise it costs AP in combat.
   */
  useStimpak(free = false): number | 'none' | 'full' | 'noAp' {
    if (this.stimpaks <= 0) return 'none';
    if (this.hp >= this.maxHp) return 'full';
    if (!free && !this.spendAp(this.apCost(AP_COST.useItem))) return 'noAp';
    const heal = drugHeal(this.loadout.stimpak.drug);
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + heal);
    this.inventory.remove(this.loadout.stimpak.pid);
    return this.hp - before;
  }

  /** How much all the hero's items weigh (pounds, as in the original: items in hand and worn armor are also in the inventory). */
  get load(): number {
    return this.inventory.items.reduce((sum, s) => sum + stackWeight(s.proto, s.count), 0);
  }

  /** How much he can carry (character window, "Carry Weight"). */
  get carryWeight(): number {
    return derivedStats(this.heroCharacter).carryWeight;
  }

  /** Overloaded (OVERLOAD). */
  get overloaded(): boolean {
    return this.load > this.carryWeight;
  }

  /** How long a reload takes: from Agility; with a crippled arm — one and a half times longer. */
  get reloadTime(): number {
    return RELOAD_SECONDS * this.agilityFactor * (this.crippledArm ? CRIPPLE.armReload : 1);
  }

  /** Spend AP on a jump (in combat); false — not enough, can't jump. */
  canJump(): boolean {
    return !this.inCombat || this.ap >= JUMP_AP;
  }

  /**
   * Damage to the hero. hit — a hit in combat (bullet, bite, blow, explosion), not poison, radiation or a script: then the aim
   * is thrown off (a bonus to recoil), the camera jerks, the reload starts over; a strong or critical hit
   * staggers (like an enemy, combat.ts → staggers) and may cripple an arm or a leg. Returns what was crippled (or null).
   */
  takeDamage(damage: number, hit?: { critical?: boolean; blast?: boolean }): 'arm' | 'leg' | null {
    if (!this.alive || this.immortal) return null;
    this.hp = Math.max(0, this.hp - damage);
    this.hurtFlash = 1;
    if (damage <= 0 || !hit) {
      if (damage > 0) this.shake = 1;
      return null;
    }
    this.shake = 1;
    this.spreadKick = Math.min(RECOIL.hold, this.spreadKick + HURT_FLINCH);
    // Interrupted — reload starts over (the ammo isn't lost, the AP are already paid).
    if (this.reloadLeft > 0) this.reloadLeft = this.reloadTime;
    const critical = hit.critical ?? false;
    if (this.stunGrace <= 0 && staggers(damage, this.maxHp, critical)) {
      this.stunLeft = HURT_STUN;
      this.stunGrace = HURT_STUN + STAGGER.grace;
    }
    // Knocked down: falls and gets up (KNOCKDOWN_TIME), all this time no walking or shooting.
    if (this.alive && this.knockLeft <= 0 && this.knockGrace <= 0 && knocksDown(damage, this.maxHp, critical, hit.blast ?? false, this.heroFighter.special.endurance - (this.overloaded ? OVERLOAD.knock : 0))) {
      this.knockLeft = KNOCKDOWN_TIME;
      this.knockGrace = KNOCKDOWN_TIME + KNOCKDOWN.grace;
      this.knockSide = Math.random() < 0.5 ? -1 : 1;
      this.stunLeft = Math.max(this.stunLeft, KNOCKDOWN_TIME);
      this.stunGrace = Math.max(this.stunGrace, KNOCKDOWN_TIME + STAGGER.grace);
    }
    if (!this.alive || !cripples(damage, this.maxHp, critical)) return null;
    const limbs: ('arm' | 'leg')[] = [];
    if (!this.crippledArm) limbs.push('arm');
    if (!this.crippledLeg) limbs.push('leg');
    const limb = limbs[Math.floor(Math.random() * limbs.length)];
    if (limb === 'arm') {
      this.crippledArm = true;
      this.armLeft = Math.random() < 0.5;
    }
    if (limb === 'leg') {
      this.crippledLeg = true;
      this.legLeft = Math.random() < 0.5;
    }
    return limb ?? null;
  }

  /** An enemy bullet passed close by: the aim shakes, the camera jerks slightly. */
  suppress(): void {
    if (!this.alive) return;
    this.spreadKick = Math.min(RECOIL.hold, this.spreadKick + SUPPRESS_FLINCH);
    this.shake = Math.max(this.shake, 0.35);
  }
}

/** How many times wounds heal over gameSeconds (carry — time accumulated since last time; the remainder goes back to carry). */
export function healTicks(carry: number, gameSeconds: number, period: number): { times: number; carry: number } {
  const time = carry + Math.max(0, gameSeconds);
  const times = Math.floor(time / period);
  return { times, carry: time - times * period };
}
