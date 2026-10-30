// A creature from the player's copy of Fallout: wanders, notices the player, runs at them, bites or shoots, takes wounds, dies.
import type { SpriteSheet } from '../assets/sprites.ts';
import type { AmmoMods } from './combat.ts';
import { findPath } from '../engine/path.ts';
import { blocked } from '../engine/player.ts';
import { solidAt, type Level } from '../engine/level.ts';
import type { Billboard, Camera } from '../engine/renderer.ts';
import type { Armor } from './combat.ts';
import { findCover, findPeek, findRetreat, type Spot } from './ai/cover.ts';
import { inFront, sightRange } from './ai/senses.ts';
import { drugHeal, healsHp, SECONDS_PER_AP } from './fighter.ts';
import { Inventory } from './inventory.ts';
import { isGrenade, leadShare, STAGGER, staggers, TELEGRAPH, ZONE } from './combat.ts';
import type { ItemProto } from '../formats/pro.ts';

export interface CreatureArt {
  stand: SpriteSheet;
  walk: SpriteSheet;
  attack: SpriteSheet;
  hit: SpriteSheet;
  death: SpriteSheet;
}

export interface CreatureStats {
  name: string;
  maxHp: number;
  ac: number;
  armor: Armor;
  /** "Unarmed" skill: chance to bite. */
  skill: number;
  damage: { min: number; max: number };
  experience: number;
}

/**
 * The weapon a creature holds. A firearm shoots from afar while it can see the hero; a melee weapon (knife, club) works like a bite,
 * but with the weapon's damage. Numbers come from the weapon prototype and the creature's skills (resources.ts).
 */
export interface CreatureWeapon {
  /** Melee (knife, club, sledgehammer, spear): hits up close, like a bite. */
  melee: boolean;
  /** Range in our cells. */
  range: number;
  damage: { min: number; max: number };
  /** Skill with this weapon (small guns, big guns, energy weapons, melee): chance to hit. */
  skill: number;
  /** Seconds between shots (from the shot's AP cost), on top of the animation itself. */
  pause: number;
  /** Rounds in the magazine and how many seconds a reload takes (as for the hero). */
  magazine: number;
  reload: number;
  /** Spare ammo: when it runs out, the creature fights with its fists. */
  spare: number;
  /** Modifiers of this gun's "native" ammo (armor-piercing, hollow point); none means regular. */
  ammo?: AmmoMods;
  /** Shot sound (sound file name without .ACM). */
  sound: string;
  /** Thrown (knife, rock): the "magazine" is one item in hand, the next comes from the inventory; a thrown one lies there until picked up. */
  thrown?: boolean;
}

export interface Target {
  x: number;
  y: number;
  alive: boolean;
  /** Light where the action is (1 is daylight, less is darker); none means daylight. */
  light?: number;
  /** How visible the target is (1 is normal, less means sneaking). */
  stealth?: number;
  /** Speed (cells per second): a shooter leads a moving target when it locks its aim (TELEGRAPH). */
  vx?: number;
  vy?: number;
}

/** out: unconscious (a companion in the wasteland instead of dying): lies there, is not attacked, then gets up (wake). */
type State = 'idle' | 'wander' | 'chase' | 'attack' | 'hurt' | 'dying' | 'dead' | 'out';

/**
 * A shooter's combat tactics (AI-2...AI-4): stands and shoots, runs to cover, waits there, peeks out and shoots,
 * flanks the hero, retreats when wounded.
 */
type Tactic = 'fight' | 'cover' | 'hide' | 'peek' | 'flank' | 'flee';

/** What a creature shouts to its allies (lines above the head, humans only; texts are in i18n.ts, "bark..."). */
export type BarkKey = 'contact' | 'reload' | 'cover' | 'flankLeft' | 'flankRight' | 'lost' | 'search' | 'hurt' | 'retreat' | 'manDown' | 'grenade';

/**
 * Enemy grenades (Opus decision): thrown from the creature's own inventory if the target is GRENADE_MIN to GRENADE_REACH cells away and the path
 * for the throw is clear; not thrown when allies are near the target. There is a pause between throws, and not every chance is taken.
 */
const GRENADE_MIN = 3.5;
const GRENADE_REACH = 8;
const GRENADE_SAFE = 2.8;
const GRENADE_CHANCE = 0.4;

const REACH = 0.8;
/** Has not seen the hero for longer than this (seconds): stops "knowing" where they are and goes to where it last saw them. */
const LOSE_SIGHT = 1;
/** How many seconds it looks around at the spot where it lost the hero or where the noise came from. */
const LOOK_AROUND = 4;
/** Closer than this the hero is always noticed (bumped into). */
const BUMP = 1;
/** Humans retreat when health is below this fraction and they have nothing to heal with; beasts when below FLEE_BEAST (and they never hide). */
const FLEE_PERSON = 0.25;
const FLEE_BEAST = 0.3;
/** In tactical combat (hiding, flanking) the hero is not "lost" so quickly: they know where the hero is, they just cannot see them. */
const LOSE_SIGHT_TACTIC = 6;
/** Nowhere to retreat: the next attempt no sooner than this many seconds later. */
const FLEE_RETRY = 1;
/** Flanks the hero no more often than once per this many seconds. */
const FLANK_EVERY = 8;
/** How many shots in a row during one dash (after that, to cover). */
const BURST = { min: 2, max: 3 } as const;
const WALK_SPEED = 0.7;
/**
 * Standing still: the standing animation is a weight shift, it is played occasionally, not in a loop (client, 2026-10-23: critters
 * "twitched like mad"). Once every every...every+spread seconds; the rest of the time, the first frame.
 */
const FIDGET = { every: 7, spread: 6 } as const;
const RUN_SPEED = 1.9;
const ATTACK_PAUSE = 0.9;

/**
 * Anchor of a creature's first-person image: the bottom edge of what is drawn (paws, feet) is on the floor, the middle of what is drawn is
 * above the point where the creature stands. Computed from the first frame of a direction and valid for all its frames: so standing, running,
 * biting and flinching from a hit stay in one place and do not jump when the animation changes.
 */
const anchors = new WeakMap<SpriteSheet, { x: number; y: number }[]>();
function groundAnchor(sheet: SpriteSheet, dir: number): { x: number; y: number } {
  let list = anchors.get(sheet);
  if (!list) {
    list = sheet.directions.map((frames) => {
      const f = frames[0];
      if (!f) return { x: 0, y: 0 };
      let bottom = -1;
      let left = f.width;
      let right = -1;
      for (let y = 0; y < f.height; y++) {
        for (let x = 0; x < f.width; x++) {
          if (!(f.pixels[y * f.width + x]! >>> 24)) continue;
          bottom = y;
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
      if (bottom < 0) return { x: 0, y: 0 };
      return { x: f.width / 2 - (left + right + 1) / 2, y: f.height - 1 - bottom };
    });
    anchors.set(sheet, list);
  }
  return list[dir] ?? list[0] ?? { x: 0, y: 0 };
}
/** The companion keeps no farther than this from the hero (cells), and if it falls behind beyond FOLLOW_CATCH_UP it catches up at once. */
const FOLLOW_DISTANCE = 2.2;
const FOLLOW_CATCH_UP = 16;
/** Speed of a companion catching up with the hero: far behind, it runs like the running hero; close by, it walks like the walking hero. */
const FOLLOW_RUN = 4.2;
const FOLLOW_WALK = 2.6;
/** A peaceful critter notices the hero closer than this many cells and turns toward them (watchVisitor). */
const NOTICE_RANGE = 6;
/** How fast a critter turns (radians per second). */
const TURN_SPEED = 3;
/**
 * Extras from a location editor variant stroll around their spot (client, 2026-10-23; roamAround): stand for pause...
 * pause+spread seconds, walk 1-3.5 cells, but no farther than radius from their spot; with the hero closer than stop they stand still
 * (you cannot talk to one who is walking).
 */
const STROLL = { pause: 4, spread: 8, radius: 3, stop: 2.5 } as const;
/**
 * How many enemies can hit the hero up close at once. In the original there are only six cells around the hero, and combat is turn-based;
 * here any amount of crowding is possible, and a pack of rats would bite all at once. The rest wait their turn nearby.
 */
export const MAX_MELEE_ATTACKERS = 3;
const RADIUS = 0.18;
/** How often a creature that lost sight of the hero looks for a path to them again (seconds). */
const REPATH = 1;
/** Wounded worse than this (fraction of health): injects a stimpak if it has one. */
const HEAL_BELOW = 0.4;
/** A stimpak costs 2 AP, for an NPC as for the hero. */
const STIMPAK_AP = 2;
/**
 * Dodge out of the crosshair (client, 2026-10-27): the hero's crosshair stays on an enemy for claw seconds (deathclaw),
 * person seconds (humans, mutants, other beasts) or nimble seconds (Agility nimbleAgility and above), and the enemy dashes
 * sideways: time seconds at speed speed (deathclaw: clawSpeed, farther). Beasts leap aside while still running at the hero
 * (zigzagging). The crosshair count starts from zero again. A shooter waits out in cover anyone who aims for long (hide seconds).
 */
export const DODGE = { claw: 1, person: 5, nimble: 3, nimbleAgility: 8, time: 0.32, speed: 3.6, clawSpeed: 6, hide: 1.2 } as const;
/** How many seconds of crosshair on it are needed for an enemy to dodge (DODGE). */
export const dodgeAfter = (deathclaw: boolean, agility: number): number =>
  deathclaw ? DODGE.claw : agility >= DODGE.nimbleAgility ? DODGE.nimble : DODGE.person;
/** A suppressing shooter (role 'suppress') fires more often: shorter pause between shots. */
const SUPPRESS_PAUSE = 0.6;

/**
 * Which of the 6 Fallout directions to show. Directions in Fallout:
 * 0 is up-right, 1 is right, 2 is down-right, 3 is down-left, 4 is left, 5 is up-left.
 * "Down" on the Fallout screen means "toward the viewer".
 */
export function spriteDirection(facing: number, creature: { x: number; y: number }, cam: Camera): number {
  const dx = creature.x - cam.x;
  const dy = creature.y - cam.y;
  const len = Math.hypot(dx, dy) || 1;
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  // toward > 0: facing the player; right > 0: facing right on the player's screen.
  const toward = -(fx * dx + fy * dy) / len;
  const right = (-fx * dy + fy * dx) / len;
  const deg = (Math.atan2(right, toward) * 180) / Math.PI;
  if (deg >= 0 && deg < 60) return 2;
  if (deg >= 60 && deg < 120) return 1;
  if (deg >= 120) return 0;
  if (deg < 0 && deg >= -60) return 3;
  if (deg < -60 && deg >= -120) return 4;
  return 5;
}

/** Whether one point can be seen from another (walls block, low blocks do not). */
export function lineOfSight(level: Level, x0: number, y0: number, x1: number, y1: number): boolean {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.1);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (solidAt(level, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, false)) return false;
  }
  return true;
}

/** A straight path is possible: no wall, closed door or block (fence, furniture) along the way. */
function clearWalk(level: Level, x0: number, y0: number, x1: number, y1: number): boolean {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.2);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blocked(level, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, RADIUS)) return false;
  }
  return true;
}

export interface CreatureState {
  x: number;
  y: number;
  hp: number;
  facing: number;
  dead: boolean;
  hostile: boolean;
  /** Hidden by a script (set_obj_visibility). */
  hidden?: boolean;
  /** Removed from the map by a script for good (destroy_object). */
  gone?: boolean;
  /** Extras: which spot they stroll around (roamAround), so they do not drift farther away from visit to visit. */
  roam?: { x: number; y: number };
}

/** Where a creature walks at a script's request: a path over cells (the target is the last point); stuck: how many seconds it has been unable to move. */
interface Goal {
  path: { x: number; y: number }[];
  run: boolean;
  stuck: number;
}

/** Unable to move for longer than this: abandons the path, since we cannot walk around obstacles. */
const GIVE_UP = 2;

export class Creature {
  readonly id: number;
  x: number;
  y: number;
  facing = Math.random() * Math.PI * 2;
  hp: number;
  /** The creature's numbers; for a companion they change with growth (companion.ts -> grownKind, via rearm). */
  stats: CreatureStats;
  /**
   * A killing blow does not kill but knocks unconscious (the scene sets this every frame: a companion in the wasteland; client, 2026-10-26).
   */
  knockoutGuard = false;
  /** How many thrown weapons it threw in this fight and which ones (picks them up after the fight; session.ts -> tickCompanions). */
  private thrownCount = 0;
  private thrownItem: ItemProto | null = null;
  /** Just emptied all the ammo it had (the scene takes the flag: the companion will take another weapon). */
  private ranOutNow = false;
  /** What can be found when searching the corpse. Rats in Fallout 1 have no items. */
  readonly inventory = new Inventory();
  private art: CreatureArt;
  private state: State = 'idle';
  private stateTime = 0;
  /** Weight shift: how often (seconds) and an offset so neighbors do not move all at once (see FIDGET). */
  private readonly fidgetEvery = FIDGET.every + Math.random() * FIDGET.spread;
  private readonly fidgetPhase = Math.random() * FIDGET.every;
  private wait = 0.5 + Math.random() * 2;
  private cooldown = 0;
  private struck = false;
  /**
   * Telegraph (combat.ts -> TELEGRAPH): how many seconds it freezes in the attack pose before a shot or a blow (set by the scene;
   * 0 — no freeze), how much of the freeze is left, whether this attack has already frozen, and where it aims (locked as the freeze begins).
   */
  windup = 0;
  private windLeft = 0;
  private wound = false;
  /** Has just frozen before an attack (the scene plays the warning click and takes the flag). */
  private windNow = false;
  aimAt: { x: number; y: number } | null = null;
  private aware = false;
  /** Just noticed the hero (the scene raises the alarm among allies and takes the flag). */
  private noticedNow = false;
  /** Where it last saw the hero or where the noise came from, and whether to run there. */
  private lastSeen: { x: number; y: number; run: boolean } | null = null;
  private unseenFor = 0;
  private lookLeft = 0;
  /** Perception (from the fighter by prototype): how far it sees. */
  perception = 5;
  /** Whether it wanders idly (beasts); humans stand at their post. */
  wanders = true;
  /** How many seconds it takes to react after noticing the hero, before the first attack (set by the scene: combat.ts -> reactionDelay). */
  reaction = 0.45;
  /** Tamed (the hero's "Animal Friend"): a peaceful beast wanders instead of standing like a post. */
  tame = false;
  /** Whether it talks (humans): shouts to its allies what it is doing. */
  talks = false;
  /** Role in the squad (assigned by the scene): pin the hero down with fire or flank. */
  role: 'suppress' | 'flank' | null = null;
  /** Agility (from the fighter by prototype): how often it dodges the crosshair. */
  agility = 5;
  /** How many seconds in a row the hero's crosshair has been on it (set by the scene every frame; 0 means not aimed at). */
  aimedAt = 0;
  /** Deathclaw: dodges the crosshair sooner and farther (DODGE; set by the scene by kind). */
  deathclaw = false;
  /**
   * Combat run speed, cells per second (on screen the speed is doubled, km/h). Humans use RUN_SPEED; for beasts it is set
   * by the scene per kind (client, 2026-10-26: radscorpions 12 km/h, Deathclaws 20, rats and other beasts 8).
   */
  runSpeed = RUN_SPEED;
  /** Limping (shot in the leg): stride multiplier until the end of the fight; 1 means unhurt. */
  limp = 1;
  /**
   * Squad leader (late wasteland enemies; client, 2026-10-27): while alive, the squad keeps close to them and does not flee
   * the battlefield; once they die, the squad wavers (scene: breakMorale) or, if they are beasts, flies into a rage (enrage).
   */
  leader: Creature | null = null;
  /** How many more seconds it runs in panic (the leader died). */
  private panic = 0;
  /** Enraged (the pack mother died): does not retreat until the end of the fight. */
  private enraged = false;
  /** Weapon jammed (the hero's "Jinxed"): this many seconds are added to the pause after this shot. */
  private jammed = 0;
  /** How long until it can be staggered again (combat.ts -> STAGGER). */
  private staggerGrace = 0;
  /** Leap away from the crosshair: how many more seconds and where; until the next attempt. */
  private dodgeLeft = 0;
  private dodgeX = 0;
  private dodgeY = 0;
  private tactic: Tactic = 'fight';
  private tacticTime = 0;
  /** Where it is going by tactics (cover, a spot to peek from, flanking, where to retreat) and its own cover. */
  private spot: Spot | null = null;
  private coverSpot: Spot | null = null;
  private burst: number = BURST.max;
  private sinceHit = 99;
  private strafe = 1;
  private strafeTime = 0;
  private barkWait = 0;
  private pendingBark: BarkKey | null = null;
  private fleeRetry = 0;
  private peekDelay = 1;
  private coverRetry = 0;
  /** Until the next attempt to throw a grenade (seconds). */
  private grenadeWait = 2 + Math.random() * 3;
  /** How to throw a grenade this frame (set by the game in update). */
  private throwAt: (c: Creature, x: number, y: number, grenade: ItemProto) => void = () => {};
  private flankWait = 0;
  /** Where it looks at its post and how long it glances around. */
  private post = 0;
  private glance = Math.random() * 10;
  private target: { x: number; y: number } | null = null;
  private goal: Goal | null = null;
  /** Extras from the location editor: which spot they stroll around (peaceful); none means standing at a post. */
  private roam: { x: number; y: number } | null = null;
  /** Weapon in hand (none means punching or biting); for a companion the game changes it based on what the hero gave (rearm). */
  weapon: CreatureWeapon | null;
  /**
   * Ammo is taken from the creature's inventory (companion: what the hero gave), not from the prototype's "spare magazines". None means as
   * for all critters: the prototype's supply.
   */
  private ammoItem: ItemProto | null = null;
  /** Rounds in the magazine and in reserve, how much longer to reload; completely out means fighting with fists. */
  private rounds = 0;
  private spareLeft = 0;
  private reloadLeft = 0;
  private empty = false;
  /** Path to the hero around walls when they cannot be seen, and when to search again. */
  private chasePath: { x: number; y: number }[] | null = null;
  private repath = 0;
  /** Whether it is hostile to the player. Peaceful critters stand still until shot at. */
  hostile: boolean;
  /** Hidden by a script: not visible, does not block the way, does nothing (but its script runs). */
  hidden = false;
  /** Removed from the map by a script for good. */
  gone = false;

  constructor(
    id: number,
    x: number,
    y: number,
    stats: CreatureStats,
    art: CreatureArt,
    hostile = true,
    facing?: number,
    weapon: CreatureWeapon | null = null,
  ) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.stats = stats;
    this.hp = stats.maxHp;
    this.art = art;
    this.hostile = hostile;
    if (facing !== undefined) this.facing = facing;
    this.post = this.facing;
    this.weapon = weapon;
    this.rounds = weapon?.magazine ?? 0;
    this.spareLeft = weapon?.spare ?? 0;
  }

  /** Shoots from afar: a firearm in hand and ammo available. */
  /** Hitting up close right now (a swing or a bite), for the attack queue. */
  get striking(): boolean {
    return this.alive && this.state === 'attack' && !this.ranged;
  }

  /** Frozen before an attack (TELEGRAPH): the hero can walk through it. */
  get windingUp(): boolean {
    return this.state === 'attack' && this.windLeft > 0;
  }

  get ranged(): boolean {
    return !!this.weapon && !this.weapon.melee && !this.empty;
  }

  /** How much ammo in reserve: for a companion, in its inventory; for the rest, by prototype. */
  private get spareRounds(): number {
    return this.ammoItem ? this.inventory.count(this.ammoItem.pid) : this.spareLeft;
  }

  /**
   * Take another weapon (companion: from its own inventory): images with it, the magazine is loaded from the inventory with ammo ammo
   * (whatever was loaded before goes back to the inventory). No ammo for a firearm: fights with fists until given some.
   */
  rearm(weapon: CreatureWeapon | null, art: CreatureArt, ammo: ItemProto | null, stats?: CreatureStats): void {
    if (this.ammoItem && this.rounds > 0) this.inventory.add(this.ammoItem, this.rounds);
    // New numbers (companion growth): the increase to max health is also added to current health.
    if (stats) {
      if (stats.maxHp > this.stats.maxHp) this.hp += stats.maxHp - this.stats.maxHp;
      this.stats = stats;
      this.hp = Math.min(this.hp, stats.maxHp);
    }
    this.weapon = weapon;
    this.art = art;
    this.ammoItem = weapon && !weapon.melee ? ammo : null;
    this.reloadLeft = 0;
    this.spareLeft = 0;
    this.rounds = this.ammoItem && weapon ? this.inventory.remove(this.ammoItem.pid, weapon.magazine) : 0;
    this.empty = !!weapon && !weapon.melee && this.rounds === 0;
  }

  /**
   * Take a weapon like any critter: ammo by prototype (a full magazine and spares), not from the inventory. For a critter
   * whose script put a weapon in its inventory rather than its hands (scene.ts -> armFromInventory).
   */
  arm(weapon: CreatureWeapon | null, art: CreatureArt): void {
    this.weapon = weapon;
    this.art = art;
    this.ammoItem = null;
    this.reloadLeft = 0;
    this.rounds = weapon?.magazine ?? 0;
    this.spareLeft = weapon?.spare ?? 0;
    this.empty = false;
  }

  /** Inventory together with the rounds in the magazine (the weapon holds them, not the inventory), for saving the companion. */
  get carried(): [number, number][] {
    const items: [number, number][] = this.inventory.items.map((s) => [s.proto.pid, s.count]);
    if (this.ammoItem && this.rounds > 0) {
      const own = items.find(([pid]) => pid === this.ammoItem!.pid);
      if (own) own[1] += this.rounds;
      else items.push([this.ammoItem.pid, this.rounds]);
    }
    return items;
  }

  /** Knives (rocks) thrown in combat: what and how many; picking them up resets the count. Nothing means null. */
  takeThrown(): { item: ItemProto; count: number } | null {
    if (!this.thrownItem || this.thrownCount <= 0) return null;
    const out = { item: this.thrownItem, count: this.thrownCount };
    this.thrownCount = 0;
    this.thrownItem = null;
    return out;
  }

  /** Just emptied all its ammo (the flag is taken once). */
  takeRanOut(): boolean {
    const now = this.ranOutNow;
    this.ranOutNow = false;
    return now;
  }

  /** Ammo: in the magazine and in reserve (for checks and the AI: runs out, as for the hero). */
  get ammo(): { rounds: number; spare: number } {
    return { rounds: this.rounds, spare: this.spareRounds };
  }

  /** State for saving the game. */
  snapshot(): CreatureState {
    const state: CreatureState = { x: this.x, y: this.y, hp: this.hp, facing: this.facing, dead: !this.alive, hostile: this.hostile };
    if (this.hidden) state.hidden = true;
    if (this.gone) state.gone = true;
    if (this.roam) state.roam = { x: this.roam.x, y: this.roam.y };
    return state;
  }

  /** Stroll around a spot (extras from the location editor, scene). The first step is not immediate and at different times for everyone. */
  roamAround(home: { x: number; y: number }): void {
    this.roam = { x: home.x, y: home.y };
    this.wait = Math.random() * (STROLL.pause + STROLL.spread);
  }

  /** Which spot it strolls around (none means standing at a post). */
  get roamHome(): { x: number; y: number } | null {
    return this.roam;
  }

  /** Restore from a save: a corpse lies there at once, a living one stands at the same place. */
  restore(state: CreatureState): void {
    this.x = state.x;
    this.y = state.y;
    this.hp = state.hp;
    this.facing = state.facing;
    this.hostile = state.hostile;
    this.hidden = !!state.hidden;
    this.gone = !!state.gone;
    if (state.dead) {
      this.state = 'dead';
      this.stateTime = 1000;
    }
  }

  /** Noticed the hero and is chasing them. */
  get chasing(): boolean {
    return this.aware;
  }

  /** Searching for the hero: goes to where it last saw them, or toward a noise. */
  get searching(): { x: number; y: number } | null {
    return this.aware ? null : this.lastSeen;
  }

  /** Its own cover (so allies do not hide in one place). */
  get cover(): Spot | null {
    return this.tactic === 'cover' || this.tactic === 'hide' || this.tactic === 'peek' ? this.coverSpot : null;
  }

  /** Current tactic (for the squad and for checks). */
  get plan(): Tactic {
    return this.tactic;
  }

  /** Tell its allies (no more than once every few seconds, except for important things: urgent; beasts do not talk). */
  bark(key: BarkKey, urgent = false): void {
    if (!this.talks || !this.alive || (this.barkWait > 0 && !urgent)) return;
    this.pendingBark = key;
    this.barkWait = 3 + Math.random() * 2;
  }

  /** The line the creature just said (cleared when read). */
  takeBark(): BarkKey | null {
    const b = this.pendingBark;
    this.pendingBark = null;
    return b;
  }

  /**
   * Squad (AI-3): the scene tells it to flank the hero, going to this point (to the side of whoever is pinning down with fire).
   * Does not interfere with reloading or retreating.
   */
  flankTo(spot: Spot, side: -1 | 1): void {
    if (!this.readyToFlank) return;
    this.spot = spot;
    this.chasePath = null;
    this.setTactic('flank');
    this.flankWait = FLANK_EVERY;
    this.bark(side < 0 ? 'flankLeft' : 'flankRight');
  }

  /** Can go flanking: in combat, not retreating, not reloading, and has not flanked for a while. */
  get readyToFlank(): boolean {
    return this.alive && this.aware && (this.tactic === 'fight' || this.tactic === 'hide') && this.reloadLeft <= 0 && this.flankWait <= 0;
  }

  /** Froze before an attack this frame (TELEGRAPH; the flag is cleared when read). */
  takeWindup(): boolean {
    const w = this.windNow;
    this.windNow = false;
    return w;
  }

  /** Noticed the hero this frame (the flag is cleared when read). */
  takeNoticed(): boolean {
    const n = this.noticedNow;
    this.noticedNow = false;
    return n;
  }

  /** One of its allies shouted where the hero is (or it was shot from there): runs there to search. */
  alertTo(x: number, y: number): void {
    if (!this.alive || this.aware) return;
    this.lastSeen = { x, y, run: true };
    this.lookLeft = 0;
    this.chasePath = null;
  }

  /**
   * Heard a noise. An enemy goes to check (at a run for a shot); a peaceful one with a weapon (a guard) also goes to look, but only at
   * a shot or an explosion: the hero's footsteps do not disturb peaceful ones, they stay in their places, as in the original (client, 2026-10-25);
   * a peaceful one without a weapon runs away from a shot. If it already sees the hero, noise does not matter. Once everything quiets down, peaceful ones return to
   * their places (scene.ts, keepPlace). byHero: the hero makes the noise; guards do not come running at the hero's shots (client,
   * 2026-10-26: armed critters came right up at every mouse click), as in the original, as long as the hero has not hit anyone.
   */
  hear(x: number, y: number, loud: boolean, level?: Level, byHero = false): void {
    if (!this.alive || !this.present || this.aware) return;
    if (this.hostile || (this.weapon && loud && !byHero)) {
      if (!this.lastSeen || loud) {
        if (!this.lastSeen && this.hostile) this.bark('search');
        this.lastSeen = { x, y, run: loud };
        this.lookLeft = 0;
        this.chasePath = null;
      }
      return;
    }
    if (!loud || this.goal || this.weapon) return;
    // Peaceful and unarmed: away from the shot, 8-12 cells, along the corridors.
    const away = Math.atan2(this.y - y, this.x - x);
    for (let tries = 0; tries < 8; tries++) {
      const a = away + (Math.random() - 0.5) * 1.4;
      const d = 8 + Math.random() * 4;
      if (this.walkTo(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d, true, level)) return;
    }
    // A random spot did not work in a narrow place: just farther from the shot, where it cannot be seen.
    const away2 = level ? findRetreat(level, this, { x, y }) : null;
    if (away2) this.walkTo(away2.x, away2.y, true, level);
  }

  get alive(): boolean {
    return this.state !== 'dying' && this.state !== 'dead' && this.state !== 'out';
  }

  /** Unconscious (knockoutGuard): lies there, enemies leave it alone. */
  get unconscious(): boolean {
    return this.state === 'out';
  }

  /** Lies unconscious for another dt seconds; returns how long it has been lying. */
  lieOut(dt: number): number {
    this.stateTime += dt;
    return this.stateTime;
  }

  /** Come to: gets up with 1 health (then heals itself with stimpaks and "First Aid"). */
  wake(): void {
    if (this.state !== 'out') return;
    this.hp = Math.max(1, this.hp);
    this.setState('idle');
  }

  get corpse(): boolean {
    return this.state === 'dead';
  }

  /** On the map: not hidden and not removed by a script. */
  get present(): boolean {
    return !this.hidden && !this.gone;
  }

  /** A script decided to attack: the creature becomes hostile and notices the player at once. */
  provoke(): void {
    if (!this.alive) return;
    this.hostile = true;
    this.aware = true;
    this.unseenFor = 0;
  }

  /**
   * A fight with another critter (the scene sets this every frame of the fight): knows the opponent even if they are to the side or behind, and walks to
   * where they are now (the script told it to attack; whoever is attacked knows who attacked).
   */
  engage(): void {
    if (!this.alive) return;
    this.aware = true;
    this.unseenFor = 0;
    this.lastSeen = null;
  }

  /** The fight is over (script): the creature stops chasing the hero until it notices them again. */
  calm(): void {
    this.aware = false;
    this.lastSeen = null;
  }

  /**
   * A script sent the creature to a point. With a level it walks along corridors (cell pathfinding); without one, in a straight line.
   * Returns false if the point cannot be reached (inside a wall or cut off): then the creature stays where it is.
   */
  walkTo(x: number, y: number, run = false, level?: Level): boolean {
    if (!this.alive) return false;
    const path = level ? findPath(level, this.x, this.y, x, y) : [{ x, y }];
    if (!path) return false;
    this.goal = { path, run, stuck: 0 };
    this.target = null;
    return true;
  }

  /** The next point of a scripted path (the scene opens doors for those walking toward them). */
  get waypoint(): { x: number; y: number } | null {
    return this.goal?.path[0] ?? null;
  }

  /** Turn and remember this direction as the "post" (script, placement on the test range). */
  turnTo(angle: number): void {
    this.facing = angle;
    this.post = angle;
  }

  /** Stop (the script cancelled the movement). */
  stop(): void {
    this.goal = null;
  }

  /** A script moved the creature straight to a point. */
  placeAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.goal = null;
    this.target = null;
  }

  /** Death by script: no fight and no experience for the hero. */
  kill(): void {
    if (!this.alive) return;
    this.hp = Math.min(this.hp, 0);
    this.goal = null;
    this.setState('dying');
  }

  /**
   * A hit. Returns true if the creature died.
   * provoke = false: damage from a script (a trap, an explosion); the creature does not become the hero's enemy.
   */
  hurt(damage: number, provoke = true, critical = false): boolean {
    if (!this.alive) return false;
    if (provoke) {
      this.hostile = true;
      this.aware = true;
      this.unseenFor = 0;
    }
    this.hp -= damage;
    if (this.hp <= 0 && this.knockoutGuard) {
      this.hp = 0;
      this.setState('out');
      return false;
    }
    if (this.hp <= 0) {
      this.setState('dying');
      return true;
    }
    if (damage > 0) {
      this.sinceHit = 0;
      this.bark('hurt');
      // Only a strong or critical hit staggers, and no more often than once per STAGGER.grace seconds (the same rule as
      // for the hero): small hits do not interrupt a shot, so an enemy can no longer be pinned in place by frequent shots.
      if (this.staggerGrace <= 0 && staggers(damage, this.stats.maxHp, critical)) {
        this.staggerGrace = STAGGER.grace;
        this.dodgeLeft = 0;
        this.setState('hurt');
      }
    }
    return false;
  }

  /** Shot in the leg: limps until the end of the fight (shorter stride). */
  cripple(): void {
    this.limp = Math.min(this.limp, ZONE.limp);
  }

  /**
   * A shot in the arm knocked the weapon away: from now on it fights with fists (as when out of ammo). Returns whether there was anything to drop; the scene
   * places the weapon on the floor nearby.
   */
  disarm(): boolean {
    if (!this.alive || !this.weapon || this.weapon.melee) return false;
    this.weapon = null;
    this.rounds = 0;
    this.reloadLeft = 0;
    this.empty = false;
    if (this.state === 'attack') this.setState('idle');
    if (this.tactic !== 'flee') this.setTactic('fight');
    return true;
  }

  /**
   * bite is called at the moment of a bite or a melee hit, fire at the moment of a shot (on the animation's "action frame"):
   * whether it hits and how much damage, the game decides.
   */
  update(
    dt: number,
    level: Level,
    player: Target,
    others: Creature[],
    bite: (c: Creature) => void,
    fire: (c: Creature) => void = () => {},
    healed: (c: Creature, amount: number) => void = () => {},
    throwAt: (c: Creature, x: number, y: number, grenade: ItemProto) => void = () => {},
  ): void {
    if (!this.present) return;
    this.throwAt = throwAt;
    this.grenadeWait -= dt;
    this.stateTime += dt;
    this.tickWeapon(dt);
    this.repath -= dt;
    this.sinceHit += dt;
    this.barkWait = Math.max(0, this.barkWait - dt);
    this.fleeRetry -= dt;
    this.coverRetry -= dt;
    this.flankWait -= dt;
    this.staggerGrace -= dt;
    this.panic = Math.max(0, this.panic - dt);
    if (this.state === 'dead') return;
    if (this.state === 'dying') {
      if (this.finished(this.art.death)) this.setState('dead');
      return;
    }

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    // Eyes (AI-1): in front by Perception, behind almost point-blank; darkness and the hero's sneaking interfere. Not through walls.
    const range = sightRange(this.perception, player.light ?? 1, inFront(this.facing, dx, dy), player.stealth ?? 1);
    const sees = player.alive && (dist <= BUMP || dist <= range) && lineOfSight(level, this.x, this.y, player.x, player.y);
    if (!player.alive) {
      this.aware = false;
      this.lastSeen = null;
    } else if (this.hostile && sees) {
      if (!this.aware) {
        this.noticedNow = true;
        this.cooldown = Math.max(this.cooldown, this.reaction);
        this.bark('contact');
        if (this.tactic !== 'flee') this.setTactic('fight');
      }
      this.aware = true;
      this.unseenFor = 0;
      this.lastSeen = { x: player.x, y: player.y, run: true };
      this.lookLeft = 0;
    } else if (this.aware) {
      // Lost sight: for a while it still "senses" where the hero is, then goes to where it last saw them.
      // Attacked by script without ever seeing them: knows where the hero was at that moment (it was told).
      if (!this.lastSeen) this.lastSeen = { x: player.x, y: player.y, run: true };
      this.unseenFor += dt;
      const tactical = this.tactic === 'cover' || this.tactic === 'hide' || this.tactic === 'peek' || this.tactic === 'flank';
      if (this.unseenFor > (tactical ? LOSE_SIGHT_TACTIC : LOSE_SIGHT)) {
        this.aware = false;
        this.bark('lost');
        if (this.tactic !== 'flee') this.setTactic('fight');
      }
    }

    if (this.state === 'hurt') {
      if (this.finished(this.art.hit)) this.setState('chase');
      return;
    }
    // Badly wounded and has a stimpak: heals like the hero (the same drug, the same AP cost).
    if (this.state !== 'attack' && this.hp < this.stats.maxHp * HEAL_BELOW && this.cooldown <= 0) {
      const stack = this.inventory.items.find((s) => healsHp(s.proto.drug));
      if (stack) {
        const before = this.hp;
        this.hp = Math.min(this.stats.maxHp, this.hp + drugHeal(stack.proto.drug));
        this.inventory.remove(stack.proto.pid);
        this.cooldown = STIMPAK_AP * SECONDS_PER_AP;
        healed(this, this.hp - before);
      }
    }
    if (this.state === 'attack') {
      const sheet = this.art.attack;
      // Telegraph: freezes one frame before the action frame, locking its facing and where it aims; the hero sees the pose and can dodge.
      const hold = Math.max(0, sheet.actionFrame - 1) / sheet.fps;
      if (this.windLeft > 0) {
        this.windLeft -= dt;
        this.stateTime = hold;
        if (this.windLeft > 0) return;
      } else if (!this.struck && !this.wound && this.windup > 0 && this.stateTime >= hold) {
        this.wound = true;
        this.windNow = true;
        this.windLeft = this.windup;
        this.stateTime = hold;
        const lead = this.ranged ? leadShare(this.weapon!.skill) * (this.windup + 1 / sheet.fps) : 0;
        this.aimAt = { x: player.x + (player.vx ?? 0) * lead, y: player.y + (player.vy ?? 0) * lead };
        this.facing = Math.atan2(this.aimAt.y - this.y, this.aimAt.x - this.x);
        return;
      }
      if (!this.wound) this.facing = Math.atan2(dy, dx);
      const frame = Math.floor(this.stateTime * sheet.fps);
      if (!this.struck && frame >= sheet.actionFrame) {
        this.struck = true;
        if (this.ranged) {
          if (player.alive) fire(this);
        } else if (dist < REACH + 0.3 && player.alive && Math.cos(Math.atan2(dy, dx) - this.facing) > TELEGRAPH.arc) {
          // A blow reaches only in front: a hero who stepped aside or walked through it during the freeze is not hit.
          bite(this);
        }
      }
      if (this.finished(this.art.attack)) {
        if (this.ranged) {
          // Between shots, a pause by the weapon's AP; magazine empty means reload from reserve, reserve empty means fists.
          const w = this.weapon!;
          this.cooldown = w.pause * (0.8 + Math.random() * 0.5) * (this.role === 'suppress' ? SUPPRESS_PAUSE : 1) + this.jammed;
          this.jammed = 0;
          this.rounds = Math.max(0, this.rounds - 1);
          if (w.thrown && this.ammoItem) {
            this.thrownCount++;
            this.thrownItem = this.ammoItem;
          }
          this.burst = Math.max(0, this.burst - 1);
          if (this.rounds === 0) {
            if (this.spareRounds > 0) {
              this.reloadLeft = w.reload;
              this.bark('reload');
            } else {
              this.empty = true;
              this.ranOutNow = true;
            }
          }
          this.setState('idle');
        } else {
          this.cooldown = ATTACK_PAUSE;
          this.setState('chase');
        }
      }
      return;
    }

    // Badly wounded with nothing to heal with: retreats (AI-4): humans hide, beasts just run away.
    if (this.hostile && (this.aware || this.lastSeen) && this.shouldFlee()) {
      const threat = sees ? player : (this.lastSeen ?? player);
      if (this.flee(dt, level, others, threat, sees, dist)) return;
    } else if (this.tactic === 'flee') {
      this.setTactic('fight');
    }

    if (this.aware && this.dodge(dt, level, others, player, sees, dist)) return;

    if (this.aware) {
      // Cannot see: goes to where it saw them (not to the actual hero: it does not know through walls).
      const goal = sees ? player : (this.lastSeen ?? player);
      if (this.ranged) {
        this.rangedTactics(dt, level, others, player, goal, sees, dist);
        return;
      }
      // Pack: told to come from the side, it does so until close; then it charges.
      if (this.tactic === 'flank') {
        this.tacticTime += dt;
        const spot = this.spot;
        if (spot && dist > 1.6 && this.tacticTime < 5 && Math.hypot(spot.x - this.x, spot.y - this.y) > 0.5) {
          this.approach(dt, level, others, spot, false, this.runSpeed);
          return;
        }
        this.setTactic('fight');
      }
      if (sees && dist < REACH) {
        this.facing = Math.atan2(dy, dx);
        if (this.state !== 'chase') this.setState('chase');
        if (this.cooldown <= 0) {
          // Attack queue: no more than MAX_MELEE_ATTACKERS hit at once, the rest wait a bit and try again.
          const striking = others.filter((o) => o !== this && o.striking).length;
          if (striking >= MAX_MELEE_ATTACKERS) {
            this.cooldown = 0.2 + Math.random() * 0.3;
            return;
          }
          this.struck = false;
          this.setState('attack');
        }
        return;
      }
      this.approach(dt, level, others, goal, sees);
      return;
    }

    // Searching: goes to where it saw the hero or where the noise came from, looks around and calms down.
    if (this.lastSeen) {
      this.search(dt, level, others);
      return;
    }

    // A script told it to go somewhere: it goes; otherwise peaceful critters stay in their place and beasts wander.
    if (this.goal) {
      this.followGoal(dt, level, others);
      return;
    }
    // Extras from the location editor stroll around their spot.
    if (!this.hostile && this.roam) {
      this.stroll(dt, level, others, player, dx, dy, dist);
      return;
    }
    // The squad keeps close to its leader: the leader wanders, they follow; the leader stands, they stand and look the same way.
    const lead = this.leader;
    if (this.hostile && lead && lead !== this && lead.alive && lead.present) {
      if (Math.hypot(lead.x - this.x, lead.y - this.y) > 3) {
        this.approach(dt, level, others, lead, lineOfSight(level, this.x, this.y, lead.x, lead.y), WALK_SPEED * 1.4);
        return;
      }
      if (this.state !== 'idle') this.setState('idle');
      this.facing = lead.facing;
      return;
    }
    if (!this.hostile && this.tame) {
      this.wanderAround(dt, level, others);
      return;
    }
    // Beasts wander; humans stand at their post and glance around (so you can pick a moment to sneak past).
    if (!this.hostile || !this.wanders) {
      if (this.state !== 'idle') this.setState('idle');
      if (this.hostile) {
        this.glance += dt;
        this.facing = this.post + Math.sin(this.glance * 0.6) * 0.7;
      } else if (this.talks) {
        this.watchVisitor(dt, level, player, dx, dy, dist);
      }
      return;
    }
    this.wanderAround(dt, level, others);
  }

  /**
   * A peaceful critter in place turns toward the hero who came closer than NOTICE_RANGE cells and is not sneaking, and once the hero leaves,
   * turns back to its post. Then scripts see the hero (obj_can_see_obj: far in front, almost point-blank to the side and behind):
   * guards notice a weapon in hand and start talking on their own (client, 2026-10-23).
   */
  private watchVisitor(dt: number, level: Level, player: Target, dx: number, dy: number, dist: number): void {
    const near = player.alive && dist <= NOTICE_RANGE && (player.stealth ?? 1) >= 1 && lineOfSight(level, this.x, this.y, player.x, player.y);
    const want = near ? Math.atan2(dy, dx) : this.post;
    const diff = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
    const step = TURN_SPEED * dt;
    this.facing = Math.abs(diff) <= step ? want : this.facing + Math.sign(diff) * step;
  }

  /**
   * Extras stroll around their spot (roam): stand a while, walk a couple of cells and stand again, and while standing they turn toward the hero,
   * like all peaceful ones. With the hero closer than STROLL.stop they stop. If a script led them away or moved them far (rations, sleep, fleeing
   * from a shot), they stroll there instead.
   */
  private stroll(dt: number, level: Level, others: Creature[], player: Target, dx: number, dy: number, dist: number): void {
    if (Math.hypot(this.x - this.roam!.x, this.y - this.roam!.y) > STROLL.radius + 1.5) this.roam = { x: this.x, y: this.y };
    const near = player.alive && dist <= STROLL.stop;
    if (near && this.target) {
      this.target = null;
      this.wait = STROLL.pause;
    }
    if (!this.target && this.talks) this.watchVisitor(dt, level, player, dx, dy, dist);
    if (near) {
      if (this.state !== 'idle') this.setState('idle');
      return;
    }
    this.wanderAround(dt, level, others, this.roam!);
  }

  billboard(cam: Camera): Billboard {
    const { sheet, frame: index } = this.animation();
    const dir = spriteDirection(this.facing, this, cam);
    const frames = sheet.directions[dir] ?? sheet.directions[0] ?? [];
    const frame = frames[index] ?? frames[0];
    if (!frame) throw new Error('Sprite has no frames');
    // Falling dead, as in the original: the direction's anchor point and the accumulated frame offsets (the body rolls back).
    if (sheet === this.art.death) {
      const shift = sheet.shifts[dir] ?? { x: 0, y: 0 };
      const offset = sheet.offsets[dir]?.[index] ?? { x: 0, y: 0 };
      return { id: this.id, x: this.x, y: this.y, frame, shiftX: shift.x + offset.x, shiftY: shift.y + offset.y };
    }
    // Everything else uses the image itself (groundAnchor): the original's anchor points and frame offsets are for the top-down view, and they differ
    // between animations; in first person a rat right up close jumped when switching from running to biting (client, 2026-10-27).
    const anchor = groundAnchor(sheet, dir);
    return { id: this.id, x: this.x, y: this.y, frame, shiftX: anchor.x, shiftY: anchor.y };
  }

  private animation(): { sheet: SpriteSheet; frame: number } {
    const once = (sheet: SpriteSheet) => {
      const count = sheet.directions[0]?.length ?? 1;
      return { sheet, frame: Math.min(count - 1, Math.floor(this.stateTime * sheet.fps)) };
    };
    const loop = (sheet: SpriteSheet) => {
      const count = Math.max(1, sheet.directions[0]?.length ?? 1);
      return { sheet, frame: Math.floor(this.stateTime * sheet.fps) % count };
    };
    switch (this.state) {
      case 'wander':
      case 'chase':
        return loop(this.art.walk);
      case 'attack':
        return once(this.art.attack);
      case 'hurt':
        return once(this.art.hit);
      case 'dying':
      case 'dead':
      case 'out':
        return once(this.art.death);
      default: {
        const sheet = this.art.stand;
        const count = Math.max(1, sheet.directions[0]?.length ?? 1);
        const frame = Math.floor(((this.stateTime + this.fidgetPhase) % this.fidgetEvery) * sheet.fps);
        return { sheet, frame: frame < count ? frame : 0 };
      }
    }
  }

  private finished(sheet: SpriteSheet): boolean {
    const count = sheet.directions[0]?.length ?? 1;
    return this.stateTime * sheet.fps >= count;
  }

  private setState(state: State): void {
    this.state = state;
    this.stateTime = 0;
    this.windLeft = 0;
    this.wound = false;
    this.aimAt = null;
  }

  /** Wanders: beasts anywhere, extras around home with long stops (STROLL). */
  private wanderAround(dt: number, level: Level, others: Creature[], home?: { x: number; y: number }): void {
    if (!this.target) {
      if (this.state !== 'idle') this.setState('idle');
      this.wait -= dt;
      if (this.wait <= 0) this.pickTarget(level, home);
      return;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.05) {
      this.target = null;
      this.wait = home ? STROLL.pause + Math.random() * STROLL.spread : 0.8 + Math.random() * 2;
      // Arrived: stays put (after looking at the hero, it will turn back here).
      if (home) this.post = this.facing;
      return;
    }
    if (this.state !== 'wander') this.setState('wander');
    this.facing = Math.atan2(dy, dx);
    const x0 = this.x;
    const y0 = this.y;
    const length = Math.min(dist, WALK_SPEED * dt);
    const moved = this.step(level, others, dx / dist, dy / dist, length);
    // Extras that bump into something (a neighbor, a fence) do not shuffle in place, they stand and pick another point.
    if (!moved || (home && Math.hypot(this.x - x0, this.y - y0) < length * 0.2)) {
      this.target = null;
      this.wait = home ? 1 + Math.random() * 2 : 0.3;
    }
  }

  private setTactic(tactic: Tactic): void {
    // Left cover or a flank: has a second to find the hero with its eyes again (instead of "losing" them at once).
    if (tactic === 'fight' && this.tactic !== 'fight' && this.tactic !== 'flee') this.unseenFor = 0;
    this.tactic = tactic;
    this.tacticTime = 0;
    if (tactic === 'fight') this.burst = BURST.min + Math.floor(Math.random() * (BURST.max - BURST.min + 1));
  }

  /** Time to retreat: humans when badly wounded with nothing to heal with; beasts when badly wounded. */
  /** The weapon jammed on this shot: the pause after it is longer by seconds. */
  jam(seconds: number): void {
    this.jammed = seconds;
  }

  /** "Bloody Mess": a gorier death (chunks, a hole right through), the same death, a different image, from the start. */
  gore(sheet: SpriteSheet): void {
    if (this.state !== 'dying' && this.state !== 'dead') return;
    this.art = { ...this.art, death: sheet };
    this.setState('dying');
  }

  /** The leader died: runs for seconds seconds, then fights again. */
  breakMorale(seconds: number): void {
    if (!this.alive || this.enraged) return;
    this.panic = Math.max(this.panic, seconds);
    this.bark('retreat', true);
  }

  /** The pack mother died: does not retreat and runs faster until the end of the fight. */
  enrage(): void {
    if (!this.alive || this.enraged) return;
    this.enraged = true;
    this.panic = 0;
    this.runSpeed *= 1.25;
    this.provoke();
  }

  private shouldFlee(): boolean {
    if (this.panic > 0) return true;
    // Leader alive nearby or enraged: does not retreat.
    if (this.enraged || (this.leader?.alive && Math.hypot(this.leader.x - this.x, this.leader.y - this.y) < 14)) return false;
    const share = this.hp / this.stats.maxHp;
    if (!this.talks) return share < FLEE_BEAST;
    return share < FLEE_PERSON && !this.inventory.items.some((s) => healsHp(s.proto.drug));
  }

  /**
   * Retreat: away from the hero and to where they cannot see. Humans hide there (and shoot back if the hero
   * comes right up), beasts just stand at a distance and run again if the hero is near. Nowhere to retreat: false (fights).
   */
  private flee(dt: number, level: Level, others: Creature[], threat: { x: number; y: number }, sees: boolean, dist: number): boolean {
    const spot = this.tactic === 'flee' ? this.spot : null;
    if (spot && Math.hypot(spot.x - this.x, spot.y - this.y) > 0.4) {
      this.approach(dt, level, others, spot, false, this.runSpeed);
      return true;
    }
    // Not running yet or already arrived, and the hero sees it: looks for where to retreat further (not every frame).
    if (this.tactic !== 'flee' || sees) {
      const away = this.fleeRetry <= 0 ? findRetreat(level, this, threat, this.talks) : null;
      if (away) {
        if (this.tactic !== 'flee') this.bark('retreat', true);
        this.spot = away;
        this.setTactic('flee');
        this.chasePath = null;
        this.approach(dt, level, others, away, false, this.runSpeed);
        return true;
      }
      if (this.fleeRetry <= 0) this.fleeRetry = FLEE_RETRY;
      // Nowhere to run (cornered) and the hero sees it: shoots back or fights.
      if (sees || this.tactic !== 'flee') return false;
    }
    // Hidden (beasts: standing at a distance): waits.
    if (this.state !== 'idle') this.setState('idle');
    this.facing = Math.atan2(threat.y - this.y, threat.x - this.x);
    return true;
  }

  /**
   * Combat shooter (AI-2, AI-3): sees the hero, fires short bursts, dodging with a step to the side; after a burst
   * and to reload, goes to nearby cover; from there it peeks out, shoots and hides again. Flanks the hero if the squad says so.
   * Cannot see: goes to where it saw them. A suppressing shooter (role 'suppress') hides only to reload.
   */
  private rangedTactics(dt: number, level: Level, others: Creature[], player: Target, goal: { x: number; y: number }, sees: boolean, dist: number): void {
    const w = this.weapon!;
    this.tacticTime += dt;
    const inRange = sees && dist <= w.range;
    const reloading = this.reloadLeft > 0;
    const shoot = () => {
      this.facing = Math.atan2(player.y - this.y, player.x - this.x);
      if (this.cooldown <= 0 && !reloading && this.rounds > 0) {
        this.struck = false;
        this.setState('attack');
        return true;
      }
      return false;
    };
    const taken = others.filter((o) => o !== this && o.cover).map((o) => o.cover!);
    const toCover = (why: BarkKey | null) => {
      // No cover nearby: search again no sooner than in a second.
      if (this.coverRetry > 0) return false;
      const cover = findCover(level, this, player, 7, taken);
      if (!cover) {
        this.coverRetry = 1;
        return false;
      }
      this.spot = cover;
      this.setTactic('cover');
      this.chasePath = null;
      if (why) this.bark(why);
      return true;
    };

    // Grenade: to where the hero is (sees them) or where it last saw them (from cover).
    if (this.tactic !== 'flee' && this.tryGrenade(level, others, sees ? player : goal, dist)) return;

    switch (this.tactic) {
      case 'flee':
        // Nowhere to retreat: shoots back from where it stands.
        if (inRange) shoot();
        else if (this.state !== 'attack' && this.state !== 'idle') this.setState('idle');
        return;
      case 'cover': {
        const spot = this.spot;
        if (!spot) break;
        if (Math.hypot(spot.x - this.x, spot.y - this.y) > 0.35) {
          this.approach(dt, level, others, spot, false, this.runSpeed);
          return;
        }
        this.coverSpot = spot;
        this.setTactic('hide');
        this.peekDelay = 0.7 + Math.random() * 0.8;
        return;
      }
      case 'hide': {
        // The hero went around and sees it in cover: the cover is no longer cover, so it shoots or looks for another.
        if (inRange) break;
        this.facing = Math.atan2(goal.y - this.y, goal.x - this.x);
        if (this.state !== 'idle') this.setState('idle');
        if (!reloading && this.tacticTime > this.peekDelay) {
          const peek = findPeek(level, this, goal, w.range);
          if (!peek) break;
          this.spot = peek;
          this.chasePath = null;
          this.setTactic('peek');
          this.burst = BURST.min + Math.floor(Math.random() * (BURST.max - BURST.min + 1));
        }
        return;
      }
      case 'peek': {
        if (inRange) {
          // Fired a burst, reloading or wounded: back to its cover.
          if ((this.burst <= 0 || reloading || this.sinceHit < 0.6) && this.coverSpot) {
            this.spot = this.coverSpot;
            this.chasePath = null;
            this.setTactic('cover');
            return;
          }
          if (!shoot() && this.state !== 'idle') this.setState('idle');
          return;
        }
        const spot = this.spot;
        if (spot && Math.hypot(spot.x - this.x, spot.y - this.y) > 0.35 && this.tacticTime < 4) {
          this.approach(dt, level, others, spot, false, this.runSpeed);
          // Peeks out with a step to the side, looking toward the hero.
          this.facing = Math.atan2(goal.y - this.y, goal.x - this.x);
          return;
        }
        // Peeked out, but the hero is not visible: goes searching.
        break;
      }
      case 'flank': {
        const spot = this.spot;
        if (inRange && this.tacticTime > 2) break;
        if (spot && Math.hypot(spot.x - this.x, spot.y - this.y) > 0.4 && this.tacticTime < 9) {
          this.approach(dt, level, others, spot, false, this.runSpeed);
          return;
        }
        break;
      }
      default:
        break;
    }
    if (this.tactic !== 'fight') this.setTactic('fight');

    if (inRange) {
      this.chasePath = null;
      // Reloading, after a burst or just wounded: to cover, if there is some nearby. A suppressing shooter only to reload.
      const wantCover = reloading || (this.role !== 'suppress' && (this.burst <= 0 || this.sinceHit < 1 || this.aimedAt > DODGE.hide));
      if (wantCover && toCover(reloading ? null : 'cover')) return;
      if (this.burst <= 0) this.burst = BURST.min;
      if (shoot()) return;
      // Waiting for a shot: dodges with a step to the side (switches sides every second or two).
      this.strafeTime -= dt;
      if (this.strafeTime <= 0) {
        this.strafe = Math.random() < 0.5 ? -1 : 1;
        this.strafeTime = 0.8 + Math.random() * 1.2;
      }
      const ux = -(player.y - this.y) / dist;
      const uy = (player.x - this.x) / dist;
      if (this.state !== 'chase') this.setState('chase');
      if (!this.step(level, others, ux * this.strafe, uy * this.strafe, WALK_SPEED * 1.6 * dt)) this.strafe = -this.strafe;
      return;
    }
    this.approach(dt, level, others, goal, sees);
  }

  /**
   * Dodge the crosshair (DODGE): a dodge in progress continues; the hero's crosshair on it longer than dodgeAfter means a dash sideways,
   * where it is free. A beast leaps aside while still running at the hero. true means it is dodging.
   */
  private dodge(dt: number, level: Level, others: Creature[], player: Target, sees: boolean, dist: number): boolean {
    if (this.dodgeLeft > 0) {
      this.dodgeLeft -= dt;
      if (this.state !== 'chase') this.setState('chase');
      if (!this.step(level, others, this.dodgeX, this.dodgeY, this.dodgeSpeed * dt)) this.dodgeLeft = 0;
      return true;
    }
    if (!sees || this.aimedAt < dodgeAfter(this.deathclaw, this.agility) || dist < 1.2 || this.tactic === 'hide' || this.tactic === 'flee') return false;
    // Sideways from the line to the hero: first to a random side, if there is a wall, to the other.
    const ux = -(player.y - this.y) / dist;
    const uy = (player.x - this.x) / dist;
    const forward = this.ranged ? 0 : 0.6;
    for (const side of Math.random() < 0.5 ? [1, -1] : [-1, 1]) {
      let dx = ux * side + ((player.x - this.x) / dist) * forward;
      let dy = uy * side + ((player.y - this.y) / dist) * forward;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const reach = this.dodgeSpeed * DODGE.time;
      if (!clearWalk(level, this.x, this.y, this.x + dx * reach, this.y + dy * reach)) continue;
      this.dodgeX = dx;
      this.dodgeY = dy;
      this.dodgeLeft = DODGE.time;
      this.aimedAt = 0;
      return true;
    }
    return false;
  }

  /** Dodge speed: farther for a deathclaw. */
  private get dodgeSpeed(): number {
    return this.deathclaw ? DODGE.clawSpeed : DODGE.speed;
  }

  /** Throw a grenade from its own inventory, if possible and worthwhile; true means thrown. */
  private tryGrenade(level: Level, others: Creature[], goal: { x: number; y: number }, dist: number): boolean {
    if (this.grenadeWait > 0 || !this.hostile) return false;
    const stack = this.inventory.items.find((s) => isGrenade(s.proto));
    if (!stack) return false;
    const reach = Math.min(GRENADE_REACH, (stack.proto.weapon?.range ?? 0) / 2);
    const d = Math.hypot(goal.x - this.x, goal.y - this.y) || dist;
    if (d < GRENADE_MIN || d > reach || !lineOfSight(level, this.x, this.y, goal.x, goal.y)) return false;
    this.grenadeWait = 2 + Math.random() * 2;
    if (others.some((o) => o !== this && o.alive && o.present && Math.hypot(o.x - goal.x, o.y - goal.y) < GRENADE_SAFE)) return false;
    if (Math.random() > GRENADE_CHANCE) return false;
    if (!this.inventory.remove(stack.proto.pid)) return false;
    this.facing = Math.atan2(goal.y - this.y, goal.x - this.x);
    this.cooldown = Math.max(this.cooldown, 0.8);
    this.grenadeWait = 8 + Math.random() * 6;
    this.bark('grenade', true);
    this.throwAt(this, goal.x, goal.y, stack.proto);
    return true;
  }

  /** Search: reach the spot (along corridors), then look around for a few seconds, turning. */
  private search(dt: number, level: Level, others: Creature[]): void {
    const spot = this.lastSeen!;
    const d = Math.hypot(spot.x - this.x, spot.y - this.y);
    if (d > 0.6 && this.lookLeft <= 0) {
      this.approach(dt, level, others, spot, false, spot.run ? this.runSpeed : WALK_SPEED * 1.5);
      return;
    }
    if (this.lookLeft <= 0) this.lookLeft = LOOK_AROUND;
    if (this.state !== 'idle') this.setState('idle');
    this.facing += dt * 1.6;
    this.lookLeft -= dt;
    if (this.lookLeft <= 0) {
      this.lastSeen = null;
      this.chasePath = null;
      this.post = this.facing;
    }
  }

  /** Run to the target: if visible, straight; if not, along a path around walls (the path is searched again once a second). */
  private approach(dt: number, level: Level, others: Creature[], player: { x: number; y: number }, sees: boolean, speed = this.runSpeed): void {
    if (this.state !== 'chase') this.setState('chase');
    let tx = player.x;
    let ty = player.y;
    if (!sees) {
      if (this.repath <= 0 || !this.chasePath) {
        this.repath = REPATH;
        this.chasePath = findPath(level, this.x, this.y, player.x, player.y);
      }
      let next = this.chasePath?.[0];
      while (next && Math.hypot(next.x - this.x, next.y - this.y) < 0.3 && this.chasePath!.length > 1) {
        this.chasePath!.shift();
        next = this.chasePath![0];
      }
      if (next) {
        tx = next.x;
        ty = next.y;
      }
    } else {
      this.chasePath = null;
    }
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    this.facing = Math.atan2(dy, dx);
    // Stuck (path ended, target behind a wall): searches for a path again at once.
    if (!this.step(level, others, dx / d, dy / d, Math.min(d, speed * dt))) this.repath = 0;
  }

  /** The pause between shots and the reload go on as usual (also when the companion backs off from or approaches an enemy). */
  private tickWeapon(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      // Reload finished: the magazine is full, as far as the reserve allows.
      if (this.reloadLeft <= 0 && this.weapon) {
        if (this.ammoItem) this.rounds = this.inventory.remove(this.ammoItem.pid, this.weapon.magazine);
        else {
          const take = Math.min(this.weapon.magazine, this.spareLeft);
          this.spareLeft -= take;
          this.rounds = take;
        }
      }
    }
  }

  /**
   * A shooter companion keeps its distance (client, 2026-10-26): backs off from a melee fighter, facing them, backward or
   * diagonally, wherever it can pass. false means nowhere to back off, or it is shooting or wounded right now (then as usual).
   */
  backOff(dt: number, level: Level, others: Creature[], from: { x: number; y: number }, speed: number): boolean {
    if (!this.alive || !this.present || this.state === 'hurt' || this.state === 'attack') return false;
    const away = Math.atan2(this.y - from.y, this.x - from.x);
    for (const turn of [0, 0.7, -0.7, 1.4, -1.4]) {
      const a = away + turn;
      if (!this.step(level, others, Math.cos(a), Math.sin(a), speed * dt)) continue;
      this.stateTime += dt;
      this.tickWeapon(dt);
      if (this.state !== 'chase') this.setState('chase');
      this.facing = Math.atan2(from.y - this.y, from.x - this.x);
      return true;
    }
    return false;
  }

  /** A shooter companion approaches an enemy up to its range without a penalty (scene.ts -> updateAlly). false means it cannot now. */
  closeIn(dt: number, level: Level, others: Creature[], target: { x: number; y: number }, speed: number): boolean {
    if (!this.alive || !this.present || this.state === 'hurt' || this.state === 'attack') return false;
    this.stateTime += dt;
    this.repath -= dt;
    this.tickWeapon(dt);
    this.approach(dt, level, others, target, lineOfSight(level, this.x, this.y, target.x, target.y), speed);
    return true;
  }

  /**
   * A companion with no enemy nearby: follows the hero and keeps within a couple of cells (runs if far); if it falls far behind or loses
   * the path, it catches up "off screen", as in the original, where the party is always next to the hero.
   */
  /**
   * distance: how far it keeps (the companion command "closer" / "farther"); leaderSpeed: how fast the hero goes:
   * when behind, the companion runs no slower than the hero (client, 2026-10-26: even behind bunny hopping in the wasteland).
   */
  followLeader(dt: number, level: Level, others: Creature[], leader: { x: number; y: number }, distance = FOLLOW_DISTANCE, leaderSpeed = 0): void {
    if (!this.present) return;
    this.stateTime += dt;
    this.repath -= dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.state === 'dead') return;
    if (this.state === 'dying') {
      if (this.finished(this.art.death)) this.setState('dead');
      return;
    }
    if (this.state === 'hurt' && !this.finished(this.art.hit)) return;
    this.aware = false;
    this.lastSeen = null;
    const d = Math.hypot(leader.x - this.x, leader.y - this.y);
    if (d > FOLLOW_CATCH_UP) {
      this.placeNear(level, others, leader);
      return;
    }
    if (d > distance) {
      this.approach(dt, level, others, leader, lineOfSight(level, this.x, this.y, leader.x, leader.y), Math.max(d > distance + 2 ? FOLLOW_RUN : FOLLOW_WALK, leaderSpeed * 1.05));
      return;
    }
    if (this.state !== 'idle') this.setState('idle');
    this.facing = Math.atan2(leader.y - this.y, leader.x - this.x);
  }

  /**
   * Goes to its place in the caravan's marching order: walking (faster if behind); in place, it stands facing the direction of travel.
   * Completely behind (a new wasteland window, loading): takes its place at once.
   */
  march(dt: number, level: Level, others: Creature[], spot: { x: number; y: number }, heading: number, pace: number): void {
    if (!this.present) return;
    this.stateTime += dt;
    if (this.state === 'dead') return;
    if (this.state === 'dying') {
      if (this.finished(this.art.death)) this.setState('dead');
      return;
    }
    if (this.state === 'hurt' && !this.finished(this.art.hit)) return;
    this.aware = false;
    this.lastSeen = null;
    const dx = spot.x - this.x;
    const dy = spot.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d > FOLLOW_CATCH_UP) {
      this.placeNear(level, others, spot);
      return;
    }
    if (d < 0.15) {
      if (this.state !== 'idle') this.setState('idle');
      this.facing = heading;
      return;
    }
    if (this.state !== 'wander') this.setState('wander');
    this.facing = Math.atan2(dy, dx);
    this.step(level, others, dx / d, dy / d, Math.min(d, Math.min(FOLLOW_RUN, pace + d) * dt));
  }

  /** Stand near a point on a free cell (a companion catches up with the hero or enters a new map with them). */
  placeNear(level: Level, others: Creature[], at: { x: number; y: number }): void {
    for (const r of [1, 1.5, 2, 2.5, 3]) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const x = at.x + Math.cos(a) * r;
        const y = at.y + Math.sin(a) * r;
        if (solidAt(level, x, y) || !lineOfSight(level, at.x, at.y, x, y)) continue;
        if (others.some((o) => o !== this && o.alive && o.present && Math.hypot(o.x - x, o.y - y) < 0.5)) continue;
        this.placeAt(x, y);
        this.chasePath = null;
        if (this.state !== 'idle' && this.alive) this.setState('idle');
        return;
      }
    }
    this.placeAt(at.x, at.y);
  }

  private followGoal(dt: number, level: Level, others: Creature[]): void {
    const goal = this.goal!;
    let next = goal.path[0];
    // Intermediate points can be "cut" more widely; the last one must be reached exactly.
    while (next && Math.hypot(next.x - this.x, next.y - this.y) < (goal.path.length > 1 ? 0.25 : 0.08)) {
      goal.path.shift();
      next = goal.path[0];
    }
    if (!next) {
      this.goal = null;
      this.setState('idle');
      // Extras that a script led here first stand still for a while.
      if (this.roam) this.wait = STROLL.pause + Math.random() * STROLL.spread;
      return;
    }
    const dx = next.x - this.x;
    const dy = next.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (this.state !== 'wander') this.setState('wander');
    this.facing = Math.atan2(dy, dx);
    const length = Math.min(dist, (goal.run ? RUN_SPEED : WALK_SPEED) * dt);
    const x0 = this.x;
    const y0 = this.y;
    this.step(level, others, dx / dist, dy / dist, length);
    if (Math.hypot(this.x - x0, this.y - y0) < length * 0.2) {
      goal.stuck += dt;
      if (goal.stuck > GIVE_UP) {
        this.goal = null;
        this.setState('idle');
      }
    } else {
      goal.stuck = 0;
    }
  }

  /** A step that goes around walls and neighbors. Returns false if there is nowhere to go. */
  private step(level: Level, others: Creature[], ux: number, uy: number, length: number): boolean {
    // Limping (shot in the leg): shorter stride.
    length *= this.limp;
    let mx = ux * length;
    let my = uy * length;
    // Do not walk into other living creatures.
    for (const o of others) {
      if (o === this || !o.alive) continue;
      const ox = this.x - o.x;
      const oy = this.y - o.y;
      const d = Math.hypot(ox, oy);
      if (d > 0 && d < RADIUS * 2.5) {
        mx += (ox / d) * length * 0.6;
        my += (oy / d) * length * 0.6;
      }
    }
    let moved = false;
    if (!blocked(level, this.x + mx, this.y, RADIUS)) {
      this.x += mx;
      moved = true;
    }
    if (!blocked(level, this.x, this.y + my, RADIUS)) {
      this.y += my;
      moved = true;
    }
    return moved;
  }

  /**
   * Where to stroll: 1-3.5 cells in a straight line, a free spot; with home, no farther than STROLL.radius from it and so that
   * there are no low blocks along the way either (you can see through a fence but not walk through it; it would keep bumping into it).
   */
  private pickTarget(level: Level, home?: { x: number; y: number }): void {
    for (let tries = 0; tries < 20; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 1 + Math.random() * 2.5;
      const tx = this.x + Math.cos(angle) * dist;
      const ty = this.y + Math.sin(angle) * dist;
      if (home && Math.hypot(tx - home.x, ty - home.y) > STROLL.radius) continue;
      if (!blocked(level, tx, ty, RADIUS + 0.05) && (home ? clearWalk(level, this.x, this.y, tx, ty) : lineOfSight(level, this.x, this.y, tx, ty))) {
        this.target = { x: tx, y: ty };
        return;
      }
    }
    this.wait = 0.5;
  }
}
