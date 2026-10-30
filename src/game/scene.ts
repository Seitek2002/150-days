// The scene is one map during play: creatures, items, doors, exits, lifts, shooting.
// Built from level data (src/world) and the map state from the save; it does not know levels by name itself.
import type { SpriteSheet } from '../assets/sprites.ts';
import { addBlock, addDecal, addPanel, blocksIn, buildLevel, DOOR_PASSABLE, EXIT_MARK, isExit, markExits, removeBlock, wallAt, type Block, type Door, type Level, type StaticLight } from '../engine/level.ts';
import { placeOfLevel } from '../world/places.ts';
import { WASTELAND } from '../world/wasteland.ts';
import { blockAt, blockShapeOf, clearNarrowPassages, decorOf, FENCE, fenceBlock, floorMarkOf, goodsShape, hasWallBeside, PIECED, piecedShape, spanAt, wallSignScale, TABLETOP_GOODS, unblockPassages, wallDecorShape, type BlockShape, type FloorMarkKind } from './blocks.ts';
import { METALLIC, type TextureName } from '../engine/textures.ts';
import type { DynamicLight } from '../engine/lightmap.ts';
import { effectBillboard, type Effect, type EffectKind } from './effects.ts';
import type { Player } from '../engine/player.ts';
import { RES, SPRITE_SCALE, VIEW_H, VIEW_W, type Billboard, type Renderer } from '../engine/renderer.ts';
import { ITEM_TYPE, type ItemProto } from '../formats/pro.ts';
import { formatDecimal, t, tf, type StringKey } from '../i18n.ts';
import { parseLevelDef, type Destination, type Entry, type LevelDef, type LevelPanel, type ParsedLevel } from '../world/defs.ts';
import { chanceToHit, meleeDodge, strengthPenalty, strike, type Fighter } from './fighter.ts';
import { findFlank } from './ai/cover.ts';
import { AIM_PARTS, AIMED, aimedChance, aimedZone, aimSpread, BEAST_AIM_PARTS, bodyZone, CRIPPLE, farAim, isGrenade, isThrownWeapon, JINX, MELEE_AIM, motionSpread, reactionDelay, spreadPoint, ZONE, type AimPart } from './combat.ts';
import { lightOf, NOISE, stealthFactor } from './ai/senses.ts';
import { PERK, perkRank, SKILL, TRAIT } from './character.ts';
import { Creature, lineOfSight, type BarkKey } from './creature.ts';
import type { Hero } from './hero.ts';
import { doorSfx, SFX, weaponSfx, type CritterKind, type Resources } from './resources.ts';
import { barkClassOf, barkText } from './barks.ts';
import { AP_COST, FAST_SHOT, JUMP_AP, meleeReach, OVERLOAD } from './hero.ts';
import { emptyMapState, type CreatedObject, type MapState } from './save.ts';
import { Inventory } from './inventory.ts';
import { packSeen, unpackSeen } from './seen.ts';
import { HEX_WIDTH, hexAt, hexCenter } from './hex.ts';
import { MAP_LIGHTS } from '../world/map-lights.ts';
import { rollCheck, ROLL, DAY_SECONDS } from './rolls.ts';
import { MAP_SCRIPTS } from '../world/map-scripts.ts';
import { signPanel, straightenSign } from './signs.ts';
import { liftLeadsOut, liftPanel } from './lifts.ts';
import { craterEdge, isCraterBeam } from '../engine/crater.ts';
import { LEVELS } from '../world/levels/index.ts';
import { isRaider, raiderGun } from '../world/armed-raiders.ts';

const PICKUP_RADIUS = 0.5;
/** A critter that moved away from the spot where it was placed by less than this (cells) is still on its hex for scripts. */
const STANDING_SLACK = 0.35;
/**
 * Peaceful critters stay in their places, as in the original (client, 2026-10-25): if combat drove them off (ran from shots, went to look),
 * once things quiet down (this many seconds without shots or combat), the critter walks back; farther than HOME_SLACK from the spot is "not in place";
 * if it did not make it (blocked), a new attempt in HOME_RETRY seconds.
 */
const RETURN_CALM = 8;
const HOME_SLACK = 0.6;
const HOME_RETRY = 3;
const REACH = 1.5;
/** Closer than this (cells) is "right at your feet": the view direction no longer counts (see focus). */
const UNDERFOOT = 0.3;
/** How much "farther" a piece of scenery counts than a critter when choosing what E presses (focus): the computer in the Overseer's cell yields to him. */
const PROP_YIELDS = 0.6;
/** Critters are talked to a little beyond arm's length: across the desk or console they stand behind (the Vault 13 Overseer). */
const TALK_REACH = 2;
const DOOR_SPEED = 1.6;
/**
 * Lying images (corpses, bodies, bones) lie as they fell and do not turn to follow the player (client, 2026-10-24):
 * the image's side and its "top" are as for someone looking from south to north.
 */
const FLAT_VIEW = -Math.PI / 2;
const DOOR_AUTOCLOSE = 5;
/** An original door (from the map-scripts.ts table) binds to our door no farther than this many cells away. */
const DOOR_MATCH = 1.6;
/** A container's pile of items is searched for on the floor no farther than this many cells from it. */
const PILE_REACH = 1.6;
/** A critter's items from the original map go to the nearest matching critter no farther than this many cells away. */
const CRITTER_MATCH = 3;
/** The chance to pick a lock does not rise above this (as with the original's rolls: 95%). */
const LOCKPICK_MAX = 95;
/** An enemy farther than this means it is no longer combat. */
const COMBAT_RANGE = 12;
/** How many seconds a line above the head stays visible (plus a little for each letter). */
const FLOAT_SECONDS = 3;
/** How often a squad (humans) and a pack (beasts) assign roles: who pins down with fire or charges, who flanks. */
const SQUAD_PERIOD = 0.5;
/** Super mutant: an "MA..." image, like beasts, but talks, shoots and hears like humans. */
const isMutant = (kind: CritterKind | undefined) => !!kind?.soundBase.toUpperCase().startsWith('MAMTN');
/**
 * Beast combat speed, cells per second (client, 2026-10-26; on screen it is km/h, doubled): Deathclaws 20 km/h,
 * radscorpions 12, rats and other beasts 8. Humans, mutants, the Master with the Lieutenant, and robots stay as they were (RUN_SPEED).
 */
const BEAST_SPEED: readonly [RegExp, number][] = [
  [/^MACL/, 10],
  [/^MASC/, 6],
  [/^MA(MTN|MSTR|LIEU|ROBO|FEYE)/, 0],
  [/^MA/, 4],
];
/**
 * "Animal Friend" (perk; client, 2026-10-27): rats, pig rats, mole rats, dogs and radscorpions do not attack the hero
 * on their own; they wander peacefully until the hero wounds them. By the names of the original's images.
 */
const ANIMAL_FRIEND = /^MA(MRAT|SRAT|MURT|DDOG|SCRP|SCP2)/;
/**
 * "One Hander" (trait): with one hand (pistols, knives) the crosshair circle is smaller, with two-handed weapons larger.
 */
const ONE_HANDER = { one: 0.75, two: 1.5 } as const;
/** The ridge around a huge footprint: height from and to (a wall is 1) and the width of the strip within a cell. */
const FOOT_RIM = { min: 0.03, max: 0.06, strip: 0.4 } as const;
/** "Ghost": light on the map darker than dark gives +sneak to Sneak. */
const GHOST = { dark: 0.6, sneak: 20 } as const;
/**
 * "Bloody Mess" (trait): the killed die more horribly (resources.ts -> goreDeath), there is more blood, and allies nearby
 * who saw it (closer than near cells) and are themselves wounded or weak (health below weak of full or below weakHp), with chance
 * scare flee for min...max seconds.
 */
const BLOODY = { near: 10, weak: 0.6, weakHp: 40, scare: 0.5, min: 3, max: 6 } as const;

/** Set a creature's run speed by kind (BEAST_SPEED; humans as before) and the deathclaw dodge. */
function setRunSpeed(creature: Creature, kind: CritterKind): void {
  const art = kind.soundBase.toUpperCase();
  const speed = BEAST_SPEED.find(([re]) => re.test(art))?.[1] ?? 0;
  if (speed > 0) creature.runSpeed = speed;
  // Deathclaws (and the mother) dodge the crosshair sooner and farther (creature.ts -> DODGE).
  creature.deathclaw = /^MACL/.test(art);
}
/** A guard is tougher than a regular critter (GUARD_BOOST): its own kind; the shared one for this prototype does not change. */
function guardKind(kind: CritterKind): CritterKind {
  const up = (v: number) => Math.min(GUARD_BOOST.skillMax, Math.max(v, v + GUARD_BOOST.skill));
  const combat: number[] = [SKILL.smallGuns, SKILL.bigGuns, SKILL.energyWeapons, SKILL.unarmed, SKILL.melee, SKILL.throwing];
  const maxHp = Math.round(kind.stats.maxHp * GUARD_BOOST.hp);
  const ac = kind.stats.ac + GUARD_BOOST.ac;
  return {
    ...kind,
    stats: { ...kind.stats, maxHp, ac, skill: up(kind.stats.skill) },
    fighter: { ...kind.fighter, maxHp, ac: kind.fighter.ac + GUARD_BOOST.ac, skills: kind.fighter.skills.map((v, i) => (combat.includes(i) ? up(v) : v)) },
    weapon: kind.weapon ? { ...kind.weapon, skill: up(kind.weapon.skill) } : null,
  };
}
/**
 * A shooter companion in combat (client, 2026-10-26): backs off from a melee fighter closer than ALLY_KEEP cells, approaches when farther than its
 * range without a penalty (Perception in cells: fighter.ts -> chanceToHit). Runs in combat like the running hero (ALLY_RUN).
 * It backs off only if the enemy is slower (you cannot outrun a radscorpion or a Deathclaw, so it stands and shoots), and for no longer than
 * KITE.back seconds in a row: then it shoots until its backing-off "reserve" recovers (KITE.refill: how many times slower).
 */
const ALLY_KEEP = 3;
const ALLY_RUN = 4.4;
const KITE = { back: 1.2, refill: 0.75 } as const;
/**
 * The hero runs away (client, 2026-10-26): runs no slower than speed cells per second away from the companion, and the companion has fallen behind by more
 * than gap cells: the companion drops the fight and runs after the hero for another hold seconds after the hero stopped running.
 */
const FLEE = { speed: 3.8, gap: 3.5, hold: 2.5 } as const;
/**
 * A companion in the wasteland is knocked unconscious instead of dying (client, 2026-10-26): lies for at least min seconds and gets up when
 * there are no enemies within safe cells around.
 */
const KNOCKOUT = { min: 8, safe: 12 } as const;
/** In the wasteland the companion joins a fight only if the hero attacked no more than this many seconds ago (client, 2026-10-26). */
const WASTELAND_JOIN_FIGHT = 15;
/**
 * Town guards (client, 2026-10-27: "too weak against the player"): hp times more health, a bonus to combat skill and to
 * armor class (skill no higher than skillMax). Who is a guard is decided by script name (barks.ts -> 'guard').
 */
const GUARD_BOOST = { hp: 1.6, skill: 25, skillMax: 95, ac: 10 } as const;
/**
 * The hero wounded someone: guards within this many cells immediately run to the hero (client, 2026-10-27: "they don't come at once at the sound
 * of shots"); a melee hit is heard from closer. A missed shot, into the air, still does not call the guards (client, 2026-10-26).
 */
const GUARD_ALARM = { shot: 24, melee: 10 } as const;
/** Lockpicking in plain sight: a critter notices it no farther than sight cells (if it sees the hero); on an attack, guards within guards cells come. */
const PICK_WITNESS = { sight: 10, guards: 20 } as const;
/** Enemy grenade: flight (seconds per cell and minimum) and the fuse after landing, time to run away. */
const ENEMY_GRENADE_FLIGHT = { base: 0.45, perCell: 0.07 };
const ENEMY_GRENADE_FUSE = 0.6;
/** A knife or rock thrown by the hero: flies faster than a grenade and almost straight. */
const THROW_FLIGHT = { base: 0.12, perCell: 0.045 };
const BARK_COLOR = '#ff8070';

/**
 * A critter's weapon from the map: a raider or bandit without a firearm gets a gun (client, 2026-10-24; armed-raiders.ts),
 * the rest get their weapon from the original map.
 */
async function mapWeapon(res: Resources, pid: number, script: string | undefined, weapon: number | undefined, seed: number): Promise<number> {
  if (!isRaider(pid, script)) return weapon ?? 0;
  const proto = weapon ? await res.item(weapon).catch(() => null) : null;
  return proto?.weapon && proto.weapon.capacity > 0 ? weapon! : raiderGun(seed);
}
/** A squad does not repeat the same line in chorus: the next one says it no sooner than this many seconds later. */
const BARK_REPEAT = 2.5;

/** IDs of creatures and items that appear during play, far from the IDs of level objects. */
let spawnedId = 1_000_000;

/** An original hex is roughly half a cell: a light shines this many cells for each hex of range. */
const LIGHT_CELLS_PER_HEX = 0.55;

/** Lights of this floor of the original map (the map-lights.ts table) in level cells. */
function mapLights(def: LevelDef): StaticLight[] {
  const table = MAP_LIGHTS[(def.original ?? '').toUpperCase()];
  const frame = def.hexFrame;
  if (!table || !frame) return [];
  return table
    .filter(([elevation]) => elevation === (def.elevation ?? 0))
    .map(([, tile, distance, intensity]) => ({ ...hexCenter(frame, tile), radius: distance * LIGHT_CELLS_PER_HEX, intensity: intensity / 100 }));
}
/** A scenery prototype flag "does not block" (blood, trash): these do not close off a cell. */
const SCENERY_NO_BLOCK = 0x10;
/** Charge explosion radius (cells) and the explosion sound from the player's copy. */
const BLAST_RADIUS = 2.5;
const EXPLOSION_SFX = 'WHN1XXX1';
/** A companion sees enemies this many cells away (and only in line of sight). */
const ALLY_SIGHT = 9;
/** How many times closer than humans beasts hear (a shot at 9 cells instead of 18, footsteps at half the distance) and call the pack. */
const BEAST_HEARING = 0.5;
/**
 * Scripts of guards that in the original fight on the hero's side even though they are not in the party: caravan guards on the ambush
 * maps. Here they are an ally on this map: they hit attackers, and with no enemies they stand still (they do not follow the hero).
 */
const DEFENDER_SCRIPTS: ReadonlySet<string> = new Set(['CRVNTEAM']);

/** A line above a creature's head (a script's float_msg). */
export interface FloatText {
  text: string;
  color: string;
  time: number;
}

/** A creature with an original script: the script name and the instance key (its variables and delayed events are in the save). */
export interface ScriptedCreature {
  creature: Creature;
  name: string;
  key: string;
}

interface Pickup {
  key: string;
  id: number;
  proto: ItemProto;
  count: number;
  x: number;
  y: number;
  taken: boolean;
  sheet: SpriteSheet;
}

/** What can be locked: a door or a container. */
export interface Lockable {
  locked: boolean;
  /** The lock is jammed (critical lockpick failure): cannot be picked until the hero leaves the map. */
  jammed: boolean;
  /** The hero already knows it is locked: the next E is an attempt to pick the lock. */
  knownLocked: boolean;
}

/** A box, cabinet, safe: items inside, a lock, an original script. */
export interface SceneContainer extends Lockable {
  key: string;
  id: number;
  proto: ItemProto;
  x: number;
  y: number;
  inventory: Inventory;
  sheet: SpriteSheet | null;
  lockedAtStart: boolean;
  /** Open (obj_is_open for scripts). */
  opened: boolean;
  /** Removed by a script (destroy_object). */
  gone: boolean;
  /** Not visible and cannot be opened by hand (a stash for scripts). */
  hidden: boolean;
  /** A body or bones holding items (a "container" in the original): lies on the floor like a corpse. */
  flat?: boolean;
  /** The container's hex in the original map: scripts use it to tell which container this is. */
  tile?: number;
  script?: { name: string; key: string };
  /** A 3D block instead of an image (locker, small chest, table). */
  block?: Block;
  /** The container's 3D look and its place in the original: left without a place, it gets a niche, and without that, its items go to a neighboring container (carveNiches). */
  look?: { shape: BlockShape; from: { x: number; y: number } };
}

/** A door on the map: whether it is open, whether it is locked, whose original script it has. */
export interface SceneDoor {
  key: string;
  door: Door;
  sound: string;
  locked: boolean;
  /** Whether it is locked from the very start, per level data or the original map (only changes go into the save). */
  lockedAtStart: boolean;
  /** The lock is jammed (critical lockpick failure): cannot be picked until the hero leaves the map. */
  jammed: boolean;
  /** The hero already knows it is locked: the next E is an attempt to pick the lock. */
  knownLocked: boolean;
  keyPid?: number;
  target: 0 | 1;
  /** In how many seconds an open door closes by itself. */
  closeIn: number;
  /** The door's script from the original (name and instance key), if any. */
  script?: { name: string; key: string };
  /** The door's hex in the original map: scripts use it to tell which door this is. */
  tile?: number;
  /** From this side the door always opens, without its script (the way out from inside: the Brotherhood of Steel lift booth). */
  openFrom?: 'north' | 'south' | 'east' | 'west';
}

/** Which side of the door the player stands on. */
export function sideOfDoor(d: SceneDoor, x: number, y: number): 'north' | 'south' | 'east' | 'west' {
  const dx = x - (d.door.cx + 0.5);
  const dy = y - (d.door.cy + 0.5);
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'west' : 'east';
  return dy < 0 ? 'north' : 'south';
}

interface UseExit {
  x: number;
  y: number;
  to: Destination;
}

export interface Elevator {
  x: number;
  y: number;
  floors: Destination[];
  current: number;
  art?: number;
  /** A point by the painted lift doors (src/game/lifts.ts): the lift can be called there too. */
  front?: { x: number; y: number };
}

/** What is in front of the player now and what E will do. */
/**
 * An original spatial script (spatial_p_proc): an invisible location on the map where something happens when
 * the hero comes near: a message in the message window ("an impressive cave-in"), a trap, a burning field. radius is in cells.
 */
export interface SceneSpatial {
  x: number;
  y: number;
  radius: number;
  tile: number;
  script: { name: string; key: string };
}

/** An original hex is half a cell: the spatial script radius in cells is this much per hex plus a margin. */
const SPATIAL_HEX = 0.5;
const SPATIAL_PAD = 0.35;
/** The original's lift scripts (ELEV...) are spatial, but we have our own lifts: we do not run them. */
const SPATIAL_SKIP = /^ELEV/;
/** A rockfall stone from our wall lands on the adjacent floor, this many cells from the cell's middle toward the wall. */
const RUBBLE_PULL = 0.32;
/** What from our wall is always pressed against it (growths and eggs of the Master's lair), and only in places with rockfalls. */
const WALL_HUGGERS = /^(mstr|eggs)/i;
const RUBBLE_DECOR = /^(rock|roks|cstalag|mushrm)/i;
/** We do not move a rockfall stone farther than this (cells) from its place. */
const RUBBLE_REACH = 2.3;

/**
 * A critter is no closer than this (cells) to a wall. Original positions converted to our grid often lie exactly on the edge
 * of a cell, and here past the edge is a wall: the critter's image sank halfway into it (client, 2026-10-24: Aradesh, Jarvis,
 * Razlo's wife "stick out of the wall").
 */
const WALL_GAP = 0.34;

/**
 * A point for a critter near (x, y), moved away from walls by WALL_GAP; if the point itself is inside a wall, the middle of the adjacent free
 * cell (the nearest one). Doors are not walls (a critter at a door stays where it stood).
 */
export function clearOfWalls(level: Level, x: number, y: number): { x: number; y: number } {
  const solid = (cx: number, cy: number) => {
    if (cx < 0 || cy < 0 || cx >= level.width || cy >= level.height) return true;
    const i = cy * level.width + cx;
    return level.walls[i] !== null && !level.doors.has(i);
  };
  let cx = Math.floor(x);
  let cy = Math.floor(y);
  if (solid(cx, cy)) {
    let best: [number, number] | null = null;
    let bestDist = Infinity;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      if (solid(cx + dx, cy + dy)) continue;
      const d = Math.hypot(cx + dx + 0.5 - x, cy + dy + 0.5 - y);
      if (d < bestDist) {
        best = [cx + dx, cy + dy];
        bestDist = d;
      }
    }
    if (!best) return { x, y };
    [cx, cy] = best;
    x = cx + 0.5;
    y = cy + 0.5;
  }
  if (solid(cx - 1, cy) && x - cx < WALL_GAP) x = cx + WALL_GAP;
  if (solid(cx + 1, cy) && cx + 1 - x < WALL_GAP) x = cx + 1 - WALL_GAP;
  if (solid(cx, cy - 1) && y - cy < WALL_GAP) y = cy + WALL_GAP;
  if (solid(cx, cy + 1) && cy + 1 - y < WALL_GAP) y = cy + 1 - WALL_GAP;
  // A corner: a wall diagonally and empty to the sides, also move away, toward the nearer side.
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    if (!solid(cx + dx, cy + dy)) continue;
    const ex = dx < 0 ? x - cx : cx + 1 - x;
    const ey = dy < 0 ? y - cy : cy + 1 - y;
    if (ex >= WALL_GAP || ey >= WALL_GAP) continue;
    if (ex < ey) x = dx < 0 ? cx + WALL_GAP : cx + 1 - WALL_GAP;
    else y = dy < 0 ? cy + WALL_GAP : cy + 1 - WALL_GAP;
  }
  return { x, y };
}

/** Scenery with an original script (cave wall, computer, force field): shown with the original's image, E uses it. */
export interface SceneProp {
  key: string;
  id: number;
  pid: number;
  tile: number;
  x: number;
  y: number;
  script: { name: string; key: string };
  sheet: SpriteSheet | null;
  /** Name from PRO_SCEN.MSG (for the hint). */
  name: string;
  /** Hidden by a script (set_obj_visibility) or removed (destroy_object). */
  hidden: boolean;
  /** Removed by a script for good (destroy_object): does not come back even when the map is entered again. */
  gone?: boolean;
  /** Force field: while it is visible, the cell is a wall (our glowing grid). */
  field: boolean;
  /** A 3D block instead of an image (terminal): while the scenery is visible, it stands in its cell. */
  block?: Block;
  /**
   * Whether the script has an action on E (use, skill, item, talk). If not (an alarm lamp), E selects it
   * only if there is nothing else nearby. No field means we do not know yet (assume it does).
   */
  usable?: boolean;
  /** A large item (a casino table made of pieces): its copies in the neighboring cells it occupies (block is in cell x, y). */
  copies?: { cell: number; block: Block }[];
  /** A staircase between floors: needed by the story, so a narrow passage next to it is not cleared for it (there is a way around). */
  keep?: boolean;
  /** The item's 3D look and its place in the original: left without a place (did not fit or was removed for a passage), it gets a niche (carveNiches). */
  look?: { shape: BlockShape; from: { x: number; y: number } };
  /** Not drawn without a block (slot machine): removed for a passage, it is simply gone; it is not placed as a flat image. */
  vanish?: boolean;
}

/**
 * Scenery with a script that the story does not need (slot machine, sink, alarm light): if it did not fit, it is simply
 * gone and is not placed as a flat image (client, 2026-10-29).
 */
const NOT_NEEDED = /^(slmach|bath\d|mblight)/i;

/**
 * A piece of a large item for addProp (joinPieces): the first piece carries the item (block in the middle cell, copies in other
 * cells), the rest are 'part': no image and no block (the script remains).
 */
type PropPiece = { block: Block; cells: number[]; keep: boolean } | 'part';

/** What can be examined (V mode): a critter, an item on the floor, a container, scenery with a script, furniture without a script. */
export type Examined =
  | { kind: 'creature'; creature: Creature }
  | { kind: 'pickup'; proto: ItemProto; count: number }
  | { kind: 'container'; container: SceneContainer }
  | { kind: 'prop'; prop: SceneProp }
  | { kind: 'scenery'; pid: number };

/** Beyond this (in cells) grass, rocks and trash are not drawn. */
const DECOR_RANGE = 14;

/** Uneven scenery as an image from the player's copy (grass, tree, rock, trash): where it stands and whose prototype. */
interface Decor {
  id: number;
  pid: number;
  x: number;
  y: number;
  sheet: SpriteSheet;
  /** Lies on the floor (body, skeleton) rather than standing. */
  flat?: boolean;
}

/** An explosive charge on the floor: goes off in time seconds. */
interface Charge {
  x: number;
  y: number;
  time: number;
  damage: { min: number; max: number };
  id: number;
  sheet: SpriteSheet | null;
  /** A thrown grenade: where it flies from and how long it flies (seconds); flown is how far it has already flown. */
  from?: { x: number; y: number; flight: number };
  flown: number;
  /** Who threw it (an enemy); none means the hero. */
  by?: Creature;
  /** A thrown knife or rock: does not explode, hits whoever it strikes and lands on the floor. */
  thrown?: { proto: ItemProto; target: Creature | null; damage: number; critical: boolean };
  /** A thrown lit flare: how many more seconds it burns on the floor. */
  flare?: number;
}

/** Flare light (held by the hero and on the floor): radius in cells and strength (visible on the walls and floor nearby). */
export const FLARE_LIGHT = { radius: 5, strength: 1.2 } as const;

export type Focus =
  | { kind: 'door'; door: SceneDoor }
  | { kind: 'prop'; prop: SceneProp }
  | { kind: 'container'; container: SceneContainer }
  | { kind: 'exit'; exit: UseExit }
  | { kind: 'elevator'; elevator: Elevator }
  | { kind: 'npc'; creature: Creature }
  | { kind: 'corpse'; creature: Creature }
  | null;

/** What the game should do after an action on the map. */
export type SceneEvent =
  | { type: 'travel'; to: Destination }
  | { type: 'elevator'; elevator: Elevator }
  | { type: 'loot'; creature: Creature }
  | { type: 'talk'; creature: Creature }
  /** A door with a script: first the script (use_p_proc or, if pick, use_skill_on_p_proc with "Lockpick"), then the regular action. */
  | { type: 'door'; door: SceneDoor; pick: boolean }
  /** A container with a script, same as a door; the game decides whether to open it (the search window) after the script. */
  | { type: 'container'; container: SceneContainer; pick: boolean }
  /** Open the search window: a box, a cabinet. */
  | { type: 'open'; name: string; inventory: Inventory }
  /** Scenery with a script: the script decides (use_p_proc). */
  | { type: 'prop'; prop: SceneProp }
  /** Pick the lock of a door or container without a script: the game occupies the hero's hands with the skill and then calls pickLock / pickContainer. */
  | { type: 'pick'; door?: SceneDoor; container?: SceneContainer }
  | { type: 'dead' }
  | null;

export interface SceneHost {
  res: Resources;
  hero: Hero;
  /** The hero on the map: doors do not close in front of them, sounds are heard from them. */
  player: Player;
  /** Game time: there are no critical failures on the first day (as with the original's rolls). */
  clock: { seconds: number };
  say(message: string): void;
  /**
   * Experience for a kill goes to everyone equally and in full: the hero and every companion (client, 2026-10-26). None means only the hero.
   * Returns what the hero got.
   */
  shareExperience?(points: number): { gained: number; levels: number };
  /** A companion has emptied all its ammo: the game will give it another weapon from its inventory and it will say so. */
  companionRanOut?(creature: Creature): void;
  /** A creature died in combat (from the hero, a companion, an explosion): pid is its prototype (the deathclaw mother is a curse). */
  creatureKilled?(creature: Creature, pid: number): void;
}

/** A squad leader died: the chance that each human flees and for how many seconds (from and to). */
const LEADER_DOWN = { panic: 0.6, min: 5, max: 9 } as const;

/** Companion commands: wait in place (where told) and keep farther from the hero. */
export interface AllyOrders {
  wait: { x: number; y: number } | null;
  far: boolean;
}
/** How far from the hero the companion keeps: normally and on the "farther" command. */
const ALLY_NEAR = 2.2;
const ALLY_FAR = 4.5;

export class Scene {
  readonly def: LevelDef;
  readonly parsed: ParsedLevel;
  readonly level: Level;
  readonly creatures: Creature[] = [];
  readonly pickups: Pickup[] = [];
  /** Cells the player has already seen (for the automap and the save), indexed by `y * width + x`; the renderer marks them. Set in create(). */
  seen = new Uint8Array(0);
  /** Where the last bite came from: the angle in the world and how close. Fades within a second. */
  hitFrom: { angle: number; near: boolean; time: number } | null = null;
  /** Whether the player was walking in the last frame, for weapon bob. */
  moving = false;
  walkTime = 0;
  /** Lines above heads; the game draws them over the frame. */
  readonly floats = new Map<Creature, FloatText>();
  /** The hero's companions on this map: they follow the hero and hit the hero's enemies; the hero's bullets do not hit them. */
  readonly allies = new Set<Creature>();
  /** Allies on this map only (caravan guards): with no enemies they stand still and do not follow the hero. */
  private readonly defenders = new Set<Creature>();
  /** Until what scene time the companion runs after the fleeing hero without joining combat (FLEE). */
  private readonly fleeUntil = new Map<Creature, number>();
  /** Companions whose fainting has already been announced. */
  private readonly knockedOut = new Set<Creature>();
  /** Critters already checked for a weapon in their inventory (armFromInventory, once per critter). */
  private readonly armChecked = new Set<Creature>();
  /** How many seconds in a row the companion has been backing off from an enemy (KITE). */
  private readonly kiting = new Map<Creature, number>();
  /** Companion commands (set by the game from a conversation with the companion). */
  readonly orders = new Map<Creature, AllyOrders>();
  /**
   * Fights between critters (a script told one to attack another: Gizmo's assassin on Killian): who attacks whom.
   * Neither is the hero's enemy until the hero wounds one of them.
   */
  private readonly feuds = new Map<Creature, Creature>();
  /**
   * A caravan traveling through the wasteland (src/game/caravan.ts): people and brahmin walk to their place in the formation, set by the game every
   * frame. People fight off enemies nearby, brahmin do not fight (fights = false).
   */
  private readonly escorts = new Map<Creature, { x: number; y: number; heading: number; pace: number; fights: boolean }>();
  private readonly props: SceneProp[] = [];
  private readonly spatials: SceneSpatial[] = [];
  /**
   * Original furniture and scenery that did not fit (inside our wall, no room by the wall, a sign has nothing to hang on): for
   * checking positions against the original.
   */
  readonly lost: { pid: number; art: string; x: number; y: number; why: 'wall' | 'noRoom' | 'noWall' }[] = [];
  /** Niches carved into walls for story items without a place (carveNiches): the cell and the item's place in the original. */
  readonly niches: { cell: number; from: { x: number; y: number } }[] = [];
  /** Containers without a place (carveNiches): removed, their items are in a neighboring container. */
  readonly rehomed: { from: string; to: string }[] = [];
  /** Cells from which item blocks were removed (for checks): cut means part of the map is unreachable without this, narrow means a passage is blocked. */
  readonly cleared: { cell: number; why: 'cut' | 'narrow' }[] = [];
  private readonly charges: Charge[] = [];
  /** Lit flares on the floor: they burn, give light and burn out (cannot be picked up: a flare burns away without a trace). */
  readonly groundFlares: { id: number; x: number; y: number; left: number; sheet: SpriteSheet | null }[] = [];
  /** Scenery hit by an explosion: scripts learn about it (damage_p_proc); the script runner takes them. */
  private propDamage: SceneProp[] = [];
  /** Wounded creatures and who wounded them (null means the hero): their scripts learn about it (damage_p_proc); the script runner takes them. */
  private creatureHits: { victim: Creature; by: Creature | null }[] = [];
  /** Who last wounded a creature (null means the hero): for a killed one, that is the killer (source_obj in destroy_p_proc). */
  private readonly lastHit = new Map<Creature, Creature | null>();
  /** Explosion flash for the image (0...1). */
  blast = 0;
  /** Flashes of shots and explosions: for a moment they light up everything around. */
  private readonly flashes: (DynamicLight & { time: number; duration: number })[] = [];
  /** Dust and sparks from bullets, blood, fire and smoke from explosions. */
  private readonly effects: Effect[] = [];
  private readonly host: SceneHost;
  private readonly doors: SceneDoor[] = [];
  /** Pen gates: the door and the two blocks of its leaf (along the fence row and across, see swingGate). */
  private readonly gates: { door: Door; leaf: Block; swung: Block; shown: number }[] = [];
  private readonly containers: SceneContainer[] = [];
  private readonly useExits: UseExit[] = [];
  /** Grass, bushes, trees, rocks, trash, as images. */
  private readonly decor: Decor[] = [];
  private readonly elevators: Elevator[] = [];
  private readonly keyOf = new Map<Creature, string>();
  private readonly kindOf = new Map<Creature, CritterKind>();
  /**
   * Which original hex a critter was placed on (by the map or a script) and where it actually stood here: by a wall
   * it is moved away, and the cell number by position is different, yet scripts check exactly the number (Marcelle talks only behind the counter).
   */
  private readonly standing = new Map<Creature, { tile: number; x: number; y: number }>();
  /** A peaceful critter's own spot (and where it was looking): where it stood on the map or where a script placed or led it. */
  private readonly homes = new Map<Creature, { x: number; y: number; facing?: number }>();
  /** Who is walking to their spot (on arrival, turns as it stood) and when to try again if it did not make it. */
  private readonly returning = new Set<Creature>();
  private readonly homeRetry = new Map<Creature, number>();
  /** When there was last a shot or explosion (scene time). */
  private lastLoud = -Infinity;
  /** How many times critters saw the hero picking a lock on this map (witnessPick). */
  private pickWarnings = 0;
  /** What scripts created on this map (for the save) and the prototype numbers of created creatures. */
  private readonly created: CreatedObject[] = [];
  private readonly createdPid = new Map<Creature, number>();
  /** A critter's original script: the name (from SCRIPTS.LST) and the instance key (its variables are in the save). */
  private readonly scripts = new Map<Creature, { name: string; key: string }>();
  private lastEmpty = false;
  /** Aimed attack (RMB, combat.ts -> AIMED): the selected body part; null means regular shooting. Set by play.ts every frame. */
  aimedPart: AimPart | null = null;
  private reloadSounded = false;
  private squadTime = 0;
  private time = 0;
  /** When a squad last said a line ("squad:line" -> time). */
  private readonly said = new Map<string, number>();

  private constructor(def: LevelDef, parsed: ParsedLevel, host: SceneHost) {
    this.def = def;
    this.parsed = parsed;
    this.level = buildLevel(parsed);
    this.host = host;
    this.level.lights = mapLights(def);
    // Exits on the floor (client, 2026-10-21: "accidentally moved to another part"): to another part of the same location,
    // green; from the location outward (wasteland, another location), orange. The wasteland has its own location rings, so we do not mark there.
    if (def.id !== WASTELAND) {
      const here = placeOfLevel(def.id);
      const cells = new Map<number, number>();
      for (const o of parsed.objects) {
        if (o.kind !== 'exit') continue;
        // A way down from the location editor (hatch, crawlway, pit), drawn on the floor instead of a colored zone.
        if (o.look) {
          (this.level.floorMarks ??= new Map()).set(Math.floor(o.y) * this.level.width + Math.floor(o.x), { texture: o.look, turn: 0 });
          continue;
        }
        if (o.use) continue;
        const near = here !== null && placeOfLevel(o.to.map) === here;
        cells.set(Math.floor(o.y) * this.level.width + Math.floor(o.x), near ? EXIT_MARK.near : EXIT_MARK.out);
      }
      markExits(this.level, cells);
    }
  }

  /** Assemble the scene: load the level's creatures and items, apply the saved map state. */
  static async create(def: LevelDef, host: SceneHost, state: MapState = emptyMapState()): Promise<Scene> {
    const parsed = parseLevelDef(def);
    const scene = new Scene(def, parsed, host);
    scene.seen = new Uint8Array(scene.level.width * scene.level.height);
    unpackSeen(state.seen, scene.seen, scene.level.width);
    await host.res.preloadLevel(parsed);
    let id = 1;
    for (const [index, o] of parsed.objects.entries()) {
      const key = 'o' + index;
      if (o.kind === 'critter' || o.kind === 'npc') {
        // A critter from a fan build (its script is not in the player's copy, it was not in the official game) is not placed.
        if (o.script && (await host.res.scriptExists?.(o.script)) === false) continue;
        const plain = await host.res.critterKind(o.pid, await mapWeapon(host.res, o.pid, o.script, o.weapon, index));
        const kind = barkClassOf(plain.soundBase, o.script ?? null) === 'guard' ? guardKind(plain) : plain;
        const at = clearOfWalls(scene.level, o.x, o.y);
        const creature = new Creature(id++, at.x, at.y, kind.stats, kind.art, o.kind === 'critter', o.facing, kind.weapon);
        creature.perception = kind.fighter.special.perception;
        creature.agility = kind.fighter.special.agility;
        creature.wanders = kind.bites;
        creature.talks = !kind.bites || isMutant(kind);
        setRunSpeed(creature, kind);
        scene.befriend(creature, kind);
        const saved = state.creatures[key];
        if (saved) {
          creature.restore(saved);
          // Saved before the wall rule: move it away too.
          const free = clearOfWalls(scene.level, creature.x, creature.y);
          if (creature.alive) creature.placeAt(free.x, free.y);
        }
        // Extras from a location editor variant stroll around their spot (after a save, around the same one).
        if (o.kind === 'npc' && o.roam) creature.roamAround(saved?.roam ?? creature);
        for (const [pid, count] of state.corpseItems[key] ?? []) creature.inventory.add(await host.res.item(pid), count);
        scene.creatures.push(creature);
        scene.keyOf.set(creature, key);
        scene.kindOf.set(creature, kind);
        if (def.hexFrame) scene.standAt(creature, hexAt(def.hexFrame, o.x, o.y), at.x, at.y);
        // Its own spot is where it stands now (after a save, where it was left).
        scene.homes.set(creature, { x: creature.x, y: creature.y, facing: creature.facing });
        if (o.script) scene.scripts.set(creature, { name: o.script, key: `${def.id}:${key}` });
      } else if (o.kind === 'corpse') {
        // A body from the original map: a corpse right away; in its pockets, its items (after the first visit, whatever is left).
        const kind = await host.res.critterKind(o.pid, 0);
        const creature = new Creature(id++, o.x, o.y, kind.stats, kind.art, false, o.facing, null);
        const saved = state.creatures[key];
        creature.restore(saved ?? { x: o.x, y: o.y, hp: 0, facing: o.facing ?? 0, dead: true, hostile: false });
        const items = saved ? (state.corpseItems[key] ?? []) : (o.items ?? []);
        for (const [pid, count] of items) creature.inventory.add(await host.res.item(pid), count);
        scene.creatures.push(creature);
        scene.keyOf.set(creature, key);
        scene.kindOf.set(creature, kind);
        if (o.script) scene.scripts.set(creature, { name: o.script, key: `${def.id}:${key}` });
      } else if (o.kind === 'item') {
        const proto = await host.res.item(o.pid);
        const count = o.count ?? (proto.type === ITEM_TYPE.ammo ? (proto.ammo?.quantity ?? 1) : 1);
        const sheet = await host.res.groundSprite(proto);
        scene.pickups.push({ key, id: id++, proto, count, x: o.x, y: o.y, taken: state.taken.includes(key), sheet });
      } else if (o.kind === 'door') {
        const cell = Math.floor(o.y) * scene.level.width + Math.floor(o.x);
        const door = scene.level.doors.get(cell);
        if (!door) continue;
        door.open = state.doors[String(cell)] ?? 0;
        const lock = state.locks?.[String(cell)];
        scene.doors.push({
          key: String(cell),
          door,
          sound: o.sound ?? 'A',
          locked: lock === undefined ? !!o.locked : lock === 1,
          lockedAtStart: !!o.locked,
          jammed: false,
          knownLocked: false,
          keyPid: o.keyPid,
          target: door.open > 0.5 ? 1 : 0,
          closeIn: DOOR_AUTOCLOSE,
          ...(o.openFrom ? { openFrom: o.openFrom } : {}),
        });
      } else if (o.kind === 'exit' && o.use) {
        scene.useExits.push({ x: o.x, y: o.y, to: o.to });
      } else if (o.kind === 'elevator') {
        scene.elevators.push({ x: o.x, y: o.y, floors: o.floors, current: o.current, art: o.art });
      }
    }
    await scene.placeContainers(state);
    await scene.giveCritterItems(state);
    for (const rec of state.created ?? []) await scene.materialize(rec, state);
    await scene.bindDoorScripts(state.locks);
    scene.bindSpatialScripts();
    await scene.placeProps(state);
    await scene.placeFurniture();
    await scene.placeSigns();
    scene.placeLifts();
    return scene;
  }

  /**
   * Lift doors on the wall behind each lift (src/game/lifts.ts): a lift is only a point, without them you cannot see where it is; a lift
   * outward (to the open sky) has a green "exit" arrow.
   */
  private placeLifts(): void {
    const outdoor = (map: string) => !!LEVELS[map]?.outdoor;
    const { level } = this;
    for (const el of this.elevators) {
      const exit = liftLeadsOut(this.def, el.floors, el.current, outdoor);
      const doors = liftPanel(level, el, exit);
      // On the automap a lift is the cab or the doors on the wall, and without them, the lift's own location.
      const lifts = (level.lifts ??= []);
      if (!doors) {
        lifts.push(this.cellOf(el.x, el.y));
        continue;
      }
      if (this.liftCabin(doors, exit, el)) continue;
      lifts.push(doors.wall.y * level.width + doors.wall.x);
      if (doors.panel) addPanel(level, doors.panel);
      // Lift doors: a door from the original map (with a wall behind it); it looks like lift doors as it is.
      const door = doors.door !== undefined ? this.level.doors.get(doors.door) : undefined;
      if (door) door.texture = 'elevator';
      el.front = doors.front;
    }
  }

  /**
   * An open lift cab, as in the original (client, 2026-10-29), instead of doors on the wall: the wall cell behind the lift (or
   * a door from the original map with a wall behind it) becomes a niche in the thickness of the wall: a steel grate on the floor, a console
   * with a display on the back wall (a lift outward has a green arrow), a frame in front: two posts and a crossbar. You can step into the cab, E works there too.
   * A thin wall (not a wall behind or beside it), a door with a script or a locked one, a wall taller than the floor: the doors remain.
   */
  private liftCabin(found: NonNullable<ReturnType<typeof liftPanel>>, exit: boolean, el: Elevator): boolean {
    const { level } = this;
    const W = level.width;
    const H = level.height;
    const at = (cx: number, cy: number) => cy * W + cx;
    const inside = (cx: number, cy: number) => cx > 0 && cy > 0 && cx < W - 1 && cy < H - 1;
    const wall = (cx: number, cy: number) => inside(cx, cy) && level.walls[at(cx, cy)] !== null && level.walls[at(cx, cy)] !== 'forcefield' && !level.doors.has(at(cx, cy));
    const open = (cx: number, cy: number) => inside(cx, cy) && level.walls[at(cx, cy)] === null && !level.doors.has(at(cx, cy));
    const sceneDoor = (cx: number, cy: number) => this.doors.find((d) => d.door === level.doors.get(at(cx, cy)));
    const FACE = (dx: number, dy: number): LevelPanel['face'] => (dx < 0 ? 'east' : dx > 0 ? 'west' : dy < 0 ? 'south' : 'north');
    // Where possible: the wall (or lift door) behind the lift that was chosen for the doors comes first; then walls on other sides
    // (up to three cells in a straight line). The cab is in the wall cell; for a door without a script, in the door itself (we remove it); for a door with a
    // script or a locked one, behind it (the door stays as the cab's door).
    const lx = Math.floor(el.x);
    const ly = Math.floor(el.y);
    const tries: { x: number; y: number; dx: number; dy: number; door?: SceneDoor; keepDoor?: boolean }[] = [];
    const add = (cx: number, cy: number, dx: number, dy: number) => {
      if (level.doors.has(at(cx, cy))) {
        const d = sceneDoor(cx, cy);
        if (!d) return;
        if (d.script || d.locked) tries.push({ x: cx + dx, y: cy + dy, dx, dy, door: d, keepDoor: true });
        else tries.push({ x: cx, y: cy, dx, dy, door: d });
      } else if (wall(cx, cy)) tries.push({ x: cx, y: cy, dx, dy });
    };
    add(found.wall.x, found.wall.y, found.wall.dx, found.wall.dy);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      let k = 1;
      while (k <= 3 && open(lx + dx * k, ly + dy * k)) k++;
      if (k <= 3) add(lx + dx * k, ly + dy * k, dx, dy);
    }
    // The niche is in the thickness of the wall: a wall behind the cab; to the side, a wall or the same passage in front of the cab (not the next room).
    const side = (sx: number, sy: number, dx: number, dy: number) => wall(sx, sy) || (open(sx, sy) && open(sx - dx, sy - dy));
    const fit = tries.find(({ x, y, dx, dy, door, keepDoor }) => (door && !keepDoor ? true : wall(x, y)) && wall(x + dx, y + dy) && side(x + dy, y + dx, dx, dy) && side(x - dy, y - dx, dx, dy));
    if (!fit) return false;
    const { x, y, dx, dy, door, keepDoor } = fit;
    const i = at(x, y);
    if (door && !keepDoor) {
      level.doors.delete(i);
      this.doors.splice(this.doors.indexOf(door), 1);
    }
    // A wall taller than the floor (a house with a roof): the niche is only at the bottom, the top of the wall remains (a hanging block of the same wall).
    const tall = level.heights?.[i] ?? 0;
    const texture = level.walls[i];
    level.walls[i] = null;
    level.wallsVersion = (level.wallsVersion ?? 0) + 1;
    if (tall > 1 && texture) addBlock(level, i, { x0: x, x1: x + 1, y0: y, y1: y + 1, base: 1, height: tall, front: texture, side: texture, top: texture, facing: 0, fill: true });
    (level.floorMarks ??= new Map()).set(i, { texture: 'liftGrate', turn: 0 });
    // The back wall is the side of the wall behind the cab that is visible from inside it.
    const alongX = dy !== 0;
    const line = alongX ? y + dy + (dy < 0 ? 1 : 0) : x + dx + (dx < 0 ? 1 : 0);
    const mid = alongX ? x + 0.5 : y + 0.5;
    addPanel(level, { face: FACE(dx, dy), at: line, a0: mid - 0.45, a1: mid + 0.45, from: 0, to: 0.94, picture: exit ? 'liftCabinExit' : 'liftCabin' });
    // The frame at the cab entrance: posts at the edges and a crossbar on top (you walk under it). Behind a door there is no frame: the door plays that role.
    if (!keepDoor) {
      const edge = (d0: number, d1: number, a0: number, a1: number, base: number, height: number, walkable = false): Block => {
        const f = alongX ? (dy < 0 ? y + 1 : y) : dx < 0 ? x + 1 : x;
        const [p0, p1] = alongX ? [f + dy * d0, f + dy * d1] : [f + dx * d0, f + dx * d1];
        const box = alongX ? { x0: x + a0, x1: x + a1, y0: Math.min(p0, p1), y1: Math.max(p0, p1) } : { x0: Math.min(p0, p1), x1: Math.max(p0, p1), y0: y + a0, y1: y + a1 };
        return { ...box, base, height, front: 'metalSide', side: 'metalSide', top: 'metalTop', facing: 0, fill: false, ...(walkable ? { walkable: true } : {}) };
      };
      addBlock(level, i, edge(0, 0.12, 0, 0.08, 0, 1));
      addBlock(level, i, edge(0, 0.12, 0.92, 1, 0, 1));
      addBlock(level, i, edge(0, 0.12, 0.08, 0.92, 0.86, 1, true));
    } else {
      // The lift door remains: it looks like lift doors as it is; open it and the cab is behind.
      door!.door.texture = 'elevator';
    }
    // E also works inside the cab itself (from outside it is called at the lift's location).
    el.front = { x: x + 0.5, y: y + 0.5 };
    (level.lifts ??= []).push(i);
    return true;
  }

  /**
   * Signs on walls (the map-scripts.ts table: signs): an image from the player's copy, straightened, placed on the side of our nearest
   * wall where it hung in the original (src/game/signs.ts). No wall nearby: goes to lost (noWall).
   */
  private async placeSigns(): Promise<void> {
    const { def, level } = this;
    const { res } = this.host;
    const frame = def.hexFrame;
    const table = MAP_SCRIPTS[(def.original ?? '').toUpperCase()];
    if (!frame || !res.data || !table?.signs) return;
    for (const [elevation, tile, pid] of table.signs) {
      if (elevation !== (def.elevation ?? 0)) continue;
      const proto = await res.data.scenery(pid).catch(() => null);
      const sheet = proto ? await res.data.scenerySprite(proto).catch(() => null) : null;
      const image = sheet?.directions[0]?.[0];
      const sign = image ? straightenSign(image) : null;
      if (!sign) continue;
      const at = def.spots?.[tile] ?? hexCenter(frame, tile);
      const art = proto ? await res.data.sceneryArtName(proto).catch(() => '') : '';
      const panel = signPanel(level, at, sign, wallSignScale(art));
      if (panel) addPanel(level, panel);
      else this.lost.push({ pid, art, x: at.x, y: at.y, why: 'noWall' });
    }
  }

  /**
   * Original boxes and cabinets (the map-scripts.ts table). The level keeps their contents as a pile on the floor at the container's spot
   * (that is how the helper captures maps); this pile is taken into the container. The save holds what is in the containers now.
   */
  private async placeContainers(state: MapState): Promise<void> {
    const { def } = this;
    const table = MAP_SCRIPTS[(def.original ?? '').toUpperCase()];
    const frame = def.hexFrame;
    if (!table || !frame) return;
    const { res } = this.host;
    for (const [index, [elevation, tile, pid, script, locked, contents]] of table.containers.entries()) {
      if (elevation !== (def.elevation ?? 0)) continue;
      const key = `k${index}`;
      const at = def.spots?.[tile] ?? hexCenter(frame, tile);
      // The contents pile lies at the original spot even if the container was moved in the location editor.
      const pile = this.takePile(at, contents);
      const moved = def.decor?.moved[key];
      // Neither a pile nearby nor a free spot (the container landed in rock): the nearest free cell.
      const spot = moved ? this.openSpotNear(moved) : (pile ?? this.openSpotNear(at));
      const proto = await res.item(pid);
      const c: SceneContainer = {
        key,
        id: spawnedId++,
        proto,
        x: spot.x,
        y: spot.y,
        inventory: new Inventory(),
        sheet: await res.groundSprite(proto).catch(() => null),
        locked: state.locks?.[key] !== undefined ? state.locks[key] === 1 : locked === 1,
        lockedAtStart: locked === 1,
        jammed: false,
        knownLocked: false,
        opened: false,
        gone: state.taken.includes(key),
        hidden: false,
        tile,
      };
      if (script && (await res.scriptExists?.(script)) !== false) c.script = { name: script, key: `${def.id}:${key}` };
      for (const [itemPid, count] of state.containers?.[key] ?? contents) c.inventory.add(await res.item(itemPid), count);
      // Locker, small chest, bookcase: as a 3D block (if the cell allows).
      // Without copy data (checks) there is no image name, so the container stays an image.
      const art = res.data?.itemArtName?.(proto) ?? '';
      if (/bone|body|corps|dead|^alien/i.test(art)) c.flat = true;
      // Goods on a counter are placed after the furniture, onto the tabletop (placeFurniture -> stackGoods).
      const shape = TABLETOP_GOODS.test(art) ? null : blockShapeOf(art, this.def.ruined);
      // If it did not fit in its place: a free cell nearby; if there is none, its own place, and a critter nearby is moved away
      // (client, 2026-10-29: containers are 3D; flat images of cabinets and tables looked bad).
      if (shape && !c.gone) {
        c.look = { shape, from: at };
        let block = blockAt(this.level, spot, at, shape);
        let fits = this.blockFits(spot.x, spot.y, block);
        if (!fits) {
          const near = this.blockSpotNear(at, spot, shape, this.containers.filter((o) => !o.gone));
          if (near) {
            c.x = near.at.x;
            c.y = near.at.y;
            block = near.block;
            fits = true;
          }
        }
        if (!fits && this.blockFits(spot.x, spot.y, block, false)) {
          fits = true;
          this.clearSpot(spot.x, spot.y);
        }
        if (fits) {
          c.block = block;
          this.setBlock(block, c.x, c.y);
        }
      }
      this.containers.push(c);
    }
  }

  /**
   * What is in the crosshair (the middle of the last frame), for "examine": a critter, an item, a container, scenery, furniture; a wall, the sky
   * or distant nothing gives null.
   */
  examineTarget(renderer: Renderer): Examined | null {
    const hit = renderer.pickAt(VIEW_W / 2, VIEW_H / 2);
    if (!hit) return null;
    if (hit.id !== undefined) {
      const creature = this.creatures.find((c) => c.id === hit.id && c.present);
      if (creature) return { kind: 'creature', creature };
      const pickup = this.pickups.find((p) => p.id === hit.id && !p.taken);
      if (pickup) return { kind: 'pickup', proto: pickup.proto, count: pickup.count };
      const container = this.containers.find((c) => c.id === hit.id && !c.gone);
      if (container) return { kind: 'container', container };
      const prop = this.props.find((p) => p.id === hit.id && !p.hidden);
      if (prop) return { kind: 'prop', prop };
      const decor = this.decor.find((d) => d.id === hit.id);
      return decor ? { kind: 'scenery', pid: decor.pid } : null;
    }
    if (!hit.block) return null;
    // Part of a compound item lies in the cell of the whole item; a cell can hold several items.
    const cell = this.cellOf((hit.block.x0 + hit.block.x1) / 2, (hit.block.y0 + hit.block.y1) / 2);
    const whole = blocksIn(this.level, cell).find((b) => b === hit.block || b.parts?.includes(hit.block!));
    if (!whole) return null;
    const prop = this.props.find((p) => p.block === whole || p.copies?.some((c) => c.block === whole));
    if (prop) return { kind: 'prop', prop };
    const container = this.containers.find((c) => c.block === whole);
    if (container) return { kind: 'container', container };
    return whole.pid ? { kind: 'scenery', pid: whole.pid } : null;
  }

  /** The level cell index under a point. */
  private cellOf(x: number, y: number): number {
    return Math.floor(y) * this.level.width + Math.floor(x);
  }

  /**
   * Whether a block can be placed in a cell: not a wall, not a door, not an exit, not a lift, not a map entrance; other items in
   * the cell do not overlap this one (if block is not given, the cell must be empty); no critter stands where the item goes
   * (it would get stuck in it).
   */
  private blockFits(x: number, y: number, block?: Block, people = true, onExit = false): boolean {
    const { level } = this;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= level.width || cy >= level.height) return false;
    const i = cy * level.width + cx;
    if (level.walls[i] !== null || level.doors.has(i) || level.exits.has(i)) return false;
    const same = (p: { x: number; y: number }) => Math.floor(p.x) === cx && Math.floor(p.y) === cy;
    if ((!onExit && this.useExits.some(same)) || this.elevators.some(same) || Object.values(this.parsed.entries).some(same)) return false;
    // Something hanging at floor height (a roof slab, a ceiling, a crossbar) takes no floor space.
    // The beam at the crater is no obstacle: the beam scenery (and the coil of rope) lies on it.
    const others = blocksIn(level, i).filter((b) => (b.base ?? 0) < 1 && !isCraterBeam(b));
    if (!block) return others.length === 0 && !this.creatures.some((c) => c.alive && same(c));
    if (others.some((b) => b.x0 < block.x1 && block.x0 < b.x1 && b.y0 < block.y1 && block.y0 < b.y1)) return false;
    const near = (p: { x: number; y: number }) => p.x > block.x0 - 0.25 && p.x < block.x1 + 0.25 && p.y > block.y0 - 0.25 && p.y < block.y1 + 0.25;
    return !people || !this.creatures.some((c) => c.alive && near(c));
  }

  /** Place an item's block in the cell of point (x, y). */
  private setBlock(block: Block, x: number, y: number): void {
    addBlock(this.level, this.cellOf(x, y), block);
  }

  /**
   * A gate leaf follows the door's openness by rotating on a hinge (the hinge is at the cell edge with the smaller coordinate): the block along
   * the fence row shortens to 1 - open, the block across the row grows from the hinge to open. The blocks are pass-through (fill: false):
   * the passage is closed by the door itself (solidAt) until it opens.
   */
  private swingGate(gate: { door: Door; leaf: Block; swung: Block; shown: number }): void {
    const { door, leaf, swung } = gate;
    const open = Math.min(1, Math.max(0, door.open));
    if (open === gate.shown) return;
    gate.shown = open;
    const least = 0.002;
    const half = FENCE.depth / 2;
    if (door.axis === 'x') {
      leaf.x0 = door.cx;
      leaf.x1 = door.cx + Math.max(least, 1 - open);
      swung.x0 = door.cx;
      swung.x1 = door.cx + FENCE.depth;
      swung.y0 = door.cy + 0.5 - half;
      swung.y1 = swung.y0 + Math.max(least, open);
    } else {
      leaf.y0 = door.cy;
      leaf.y1 = door.cy + Math.max(least, 1 - open);
      swung.y0 = door.cy;
      swung.y1 = door.cy + FENCE.depth;
      swung.x0 = door.cx + 0.5 - half;
      swung.x1 = swung.x0 + Math.max(least, open);
    }
    this.level.blocksVersion = (this.level.blocksVersion ?? 0) + 1;
  }

  /** Remove an item's block (a script destroyed a container). */
  dropBlock(obj: { block?: Block; x: number; y: number }): void {
    const cell = this.cellOf(obj.x, obj.y);
    if (obj.block) removeBlock(this.level, cell, obj.block);
    delete obj.block;
  }

  /**
   * Furniture without scripts (the map-scripts.ts table): cabinets, tables, beds, as blocks. If it landed in our wall (our walls are
   * thicker), to an adjacent free cell; an occupied cell is skipped. Furniture that blocks a passage is removed.
   */
  private async placeFurniture(): Promise<void> {
    const { def, level } = this;
    const { res } = this.host;
    const frame = def.hexFrame;
    const table = MAP_SCRIPTS[(def.original ?? '').toUpperCase()];
    const placed = new Set<number>();
    const marks = new Map<number, FloorMarkKind>();
    // Original furniture (not if removed in the location editor; if moved, at the new spot) and our own furniture from the editor.
    const edit = def.decor;
    const removed = new Set(edit?.removed ?? []);
    const list: { pid: number; at: { x: number; y: number } }[] = [];
    if (frame && res.data) {
      (table?.furniture ?? []).forEach(([elevation, tile, pid], i) => {
        const key = `f${i}`;
        if (elevation !== (def.elevation ?? 0) || removed.has(key)) return;
        // Our own copy of the point: a rockfall stone moves it, and the level's shared points must not be touched.
        list.push({ pid, at: { ...(edit?.moved[key] ?? def.spots?.[tile] ?? hexCenter(frame, tile)) } });
      });
    }
    if (res.data) for (const a of edit?.added ?? []) list.push({ pid: a.pid, at: { x: a.x, y: a.y } });
    for (const { pid, at } of list) {
      const proto = await res.data.scenery(pid).catch(() => null);
      const art = proto ? await res.data.sceneryArtName(proto).catch(() => '') : '';
      // Grass, trees, rocks, trash: as an image at the same spot as in the original; inside our wall, not placed.
      const decor = decorOf(art);
      if (decor) {
        if (!proto) continue;
        // Whatever landed inside our wall (our walls are thicker) goes onto the adjacent floor right against the wall: growths and eggs of the Master's lair
        // always (the lair walls are "alive", client, 2026-10-24), rocks, stalagmites and mushrooms in places with rockfalls and caves
        // (rubble): a heap at a dead end, rocks along the cave walls.
        if (wallAt(level, at.x, at.y)) {
          // Bodies and the weathervane that landed in our wall also go onto the floor nearby (client, 2026-10-29: everything as in the original).
          const hugs = WALL_HUGGERS.test(art) || (def.rubble && RUBBLE_DECOR.test(art)) || !!decor.flat || /^awpc/i.test(art);
          const cell = hugs ? this.rubbleFloorNear(at) : null;
          if (cell === null) {
            this.lost.push({ pid, art, x: at.x, y: at.y, why: 'wall' });
            continue;
          }
          const cx = (cell % level.width) + 0.5;
          const cy = Math.floor(cell / level.width) + 0.5;
          const d = Math.hypot(at.x - cx, at.y - cy) || 1;
          const pull = Math.min(RUBBLE_PULL, d);
          at.x = cx + ((at.x - cx) / d) * pull;
          at.y = cy + ((at.y - cy) / d) * pull;
        }
        const sheet = await res.data.scenerySprite(proto).catch(() => null);
        if (!sheet) continue;
        this.decor.push({ id: spawnedId++, pid, x: at.x, y: at.y, sheet, ...(decor.flat ? { flat: true } : {}) });
        // Under a tree or a rock, an invisible round stop (not overlapping other items in the cell).
        if (decor.solid > 0) {
          const r = decor.solid;
          // The stop holds the cell (critters walk around); if it blocks a passage, passage protection removes it and the image stays.
          const stop: Block = { x0: at.x - r, x1: at.x + r, y0: at.y - r, y1: at.y + r, height: 0.5, front: 'rock', side: 'rock', top: 'rock', facing: 0, fill: true, round: true, hidden: true };
          if (this.blockFits(at.x, at.y, stop)) {
            this.setBlock(stop, at.x, at.y);
            placed.add(this.cellOf(at.x, at.y));
          }
        }
        continue;
      }
      // Floor markings: inside our thick wall, onto the adjacent open floor (nearest to the original spot).
      const mark = floorMarkOf(art);
      if (mark) {
        const cell = this.openFloorNear(at);
        if (cell !== null && !marks.has(cell)) marks.set(cell, mark);
        continue;
      }
      const shape = blockShapeOf(art, this.def.ruined);
      if (!shape) continue;
      // Cars and carts are larger than a cell: in every cell they occupy.
      if (shape.span) {
        for (const cell of this.placeSpan(at, shape, pid)) placed.add(cell);
        continue;
      }
      const found = this.furnitureSpot(at, shape);
      if (!found) {
        this.lost.push({ pid, art, x: at.x, y: at.y, why: 'noRoom' });
        continue;
      }
      const { spot, block } = found;
      block.pid = pid;
      this.setBlock(block, spot.x, spot.y);
      placed.add(this.cellOf(spot.x, spot.y));
      // A burning barrel gives light like a lamp (shadows and light are computed on the first frame on the map).
      if (shape.light) level.lights = [...(level.lights ?? []), { x: spot.x, y: spot.y, ...shape.light }];
    }
    // Pipes on Vault walls (wall pieces in the original): on our nearest wall; where a pipe already hangs, not a second one.
    if (frame) {
      const decor = (table?.wallDecor ?? []).filter(([elevation]) => elevation === (def.elevation ?? 0));
      // Fences (wall pieces in the original, not walls here): waist-high, you can see through them; along the axis where the neighboring
      // pieces are, in a corner along both. In old levels a fence cell is still a wall, so nothing is placed there.
      const fences = decor.filter(([, , kind]) => kind === 'fence').map(([, tile]) => def.spots?.[tile] ?? hexCenter(frame, tile));
      for (const at of fences) {
        const cx = Math.floor(at.x);
        const cy = Math.floor(at.y);
        if (wallAt(level, at.x, at.y) || blocksIn(level, this.cellOf(at.x, at.y)).some((b) => (b.base ?? 0) < 1)) continue;
        const near = (dx: number, dy: number) => fences.some((o) => o !== at && Math.abs(o.x - at.x - dx) < 0.6 && Math.abs(o.y - at.y - dy) < 0.6);
        const alongX = near(1, 0) || near(-1, 0);
        const alongY = near(0, 1) || near(0, -1);
        if (alongX || !alongY) this.setBlock(fenceBlock(cx, cy, 'x'), at.x, at.y);
        if (alongY) this.setBlock(fenceBlock(cx, cy, 'y'), at.x, at.y);
      }
      // A pen gate (an original door with a gate image, here Door.gate): not a full-height wall but a waist-high leaf in
      // the fence row, along the neighboring pieces; it opens and closes like a door, and is drawn as two blocks (swingGate).
      for (const door of level.doors.values()) {
        if (!door.gate) continue;
        const near = (dx: number, dy: number) => fences.some((o) => Math.abs(o.x - (door.cx + 0.5 + dx)) < 0.6 && Math.abs(o.y - (door.cy + 0.5 + dy)) < 0.6);
        if (near(1, 0) || near(-1, 0)) door.axis = 'x';
        else if (near(0, 1) || near(0, -1)) door.axis = 'y';
        const leaf = fenceBlock(door.cx, door.cy, door.axis, true);
        const swung = fenceBlock(door.cx, door.cy, door.axis === 'x' ? 'y' : 'x', true);
        this.setBlock(leaf, door.cx + 0.5, door.cy + 0.5);
        this.setBlock(swung, door.cx + 0.5, door.cy + 0.5);
        const gate = { door, leaf, swung, shown: -1 };
        this.gates.push(gate);
        this.swingGate(gate);
      }
      // Pipes on Vault walls (wall pieces in the original): on our nearest wall; where a pipe already hangs, not a second one.
      for (const [, tile, kind] of decor) {
        if (kind === 'fence') continue;
        const found = this.furnitureSpot(def.spots?.[tile] ?? hexCenter(frame, tile), wallDecorShape(kind));
        if (!found) continue;
        this.setBlock(found.block, found.spot.x, found.spot.y);
        placed.add(this.cellOf(found.spot.x, found.spot.y));
      }
    }
    // The level fence by mask (LevelDef.fences: the mesh around the Brotherhood bunker): along neighboring pieces, in a corner along both.
    if (def.fences) {
      const { rows, texture, height } = def.fences;
      const at = (x: number, y: number) => rows[y]?.[x] === 'F';
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (!at(x, y) || wallAt(level, x + 0.5, y + 0.5)) continue;
          const alongX = at(x - 1, y) || at(x + 1, y);
          const alongY = at(x, y - 1) || at(x, y + 1);
          if (alongX || !alongY) this.setBlock(fenceBlock(x, y, 'x', false, { texture, height }), x + 0.5, y + 0.5);
          if (alongY) this.setBlock(fenceBlock(x, y, 'y', false, { texture, height }), x + 0.5, y + 0.5);
        }
      });
    }
    this.stackGoods();
    this.layFloorMarks(marks);
    // If they block a passage, the block is removed; a container or scenery without a block is drawn as an image again. First the passages
    // without which part of the map is unreachable, then those blocked "in place", even if there is a long way around.
    // Stairs (keep) in a narrow passage stay: without them you cannot reach another floor, and there is a way around.
    const kept = this.props.filter((p) => p.keep && p.block);
    const keptCells = new Set(kept.flatMap((p) => [this.cellOf(p.x, p.y), ...(p.copies?.map((c) => c.cell) ?? [])]));
    const movable = new Set([...placed, ...[...this.containers, ...this.props].filter((o) => o.block).map((o) => this.cellOf(o.x, o.y)), ...this.props.flatMap((p) => p.copies?.map((c) => c.cell) ?? [])].filter((cell) => !keptCells.has(cell)));
    for (const cell of unblockPassages(level, placed)) this.cleared.push({ cell, why: 'cut' });
    for (const cell of clearNarrowPassages(level, movable, placed)) this.cleared.push({ cell, why: 'narrow' });
    if (this.cleared.length > 0) {
      // A large item that lost a part is removed entirely; a slot machine and a casino table without a block are simply
      // gone (they are not placed as flat images).
      for (const p of this.props) {
        if (!p.block || !p.copies) continue;
        const whole = [{ cell: this.cellOf(p.x, p.y), block: p.block }, ...p.copies];
        if (whole.every(({ cell, block }) => blocksIn(level, cell).includes(block))) continue;
        for (const { cell, block } of whole) if (blocksIn(level, cell).includes(block)) removeBlock(level, cell, block);
        delete p.copies;
        p.vanish = true;
      }
      for (const o of [...this.containers, ...this.props]) {
        if (!o.block || blocksIn(level, this.cellOf(o.x, o.y)).includes(o.block)) continue;
        delete o.block;
        if ('vanish' in o && o.vanish) o.hidden = true;
      }
      // The table under the goods was removed for a passage: the goods are moved to an adjacent table (if there is one).
      this.stackGoods(true);
    }
    this.carveNiches();
  }

  /**
   * A story item with a script (computer, terminal, pump) was left without a place: it did not fit or was removed for a passage.
   * Client, 2026-10-29: whatever the story needs is 3D, and its space is widened. A one-cell niche is carved into the thick wall nearby
   * (the wall on three sides of the niche stays), the item stands in it with its back to the far wall, and the passage is free.
   */
  private carveNiches(): void {
    const { level } = this;
    const W = level.width;
    const wall = (x: number, y: number) => x <= 0 || y <= 0 || x >= W - 1 || y >= level.height - 1 || (level.walls[y * W + x] !== null && level.walls[y * W + x] !== 'forcefield');
    const placed = (o: { x: number; y: number; block?: Block }) => !!o.block && blocksIn(level, this.cellOf(o.x, o.y)).includes(o.block);
    const homeless: { p: SceneProp | SceneContainer; show: () => void }[] = [
      ...this.props.filter((p) => !(p.hidden || p.gone || p.vanish || p.field || p.copies) && p.look).map((p) => ({ p, show: () => this.setPropVisible(p, true) })),
      ...this.containers.filter((c) => !(c.gone || c.hidden || c.flat) && c.look).map((c) => ({ p: c, show: () => this.setBlock(c.block!, c.x, c.y) })),
    ];
    for (const { p, show } of homeless) {
      if (!p.look || placed(p)) continue;
      delete p.block;
      const { shape, from } = p.look;
      if (shape.hidden) continue;
      // Where to carve from: the item's cell, and if it is inside a wall or door, the nearest open one.
      const home = this.openFloorNear({ x: p.x, y: p.y });
      if (home === null) continue;
      const hx = home % W;
      const hy = Math.floor(home / W);
      // Carve next to the item's cell, and if there is no thick wall there, next to open cells nearby (up to two, visible from it), nearest first.
      const near: { x: number; y: number; d: number }[] = [];
      for (let oy = -2; oy <= 2; oy++) {
        for (let ox = -2; ox <= 2; ox++) {
          const x = hx + ox;
          const y = hy + oy;
          if (wall(x, y) || level.doors.has(y * W + x) || !lineOfSight(level, hx + 0.5, hy + 0.5, x + 0.5, y + 0.5)) continue;
          near.push({ x, y, d: Math.hypot(ox, oy) });
        }
      }
      near.sort((a, b) => a.d - b.d);
      const carve = () => {
        for (const c of near) {
          for (const [dx, dy] of [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0],
          ] as const) {
            const nx = c.x + dx;
            const ny = c.y + dy;
            const i = ny * W + nx;
            if (nx <= 0 || ny <= 0 || nx >= W - 1 || ny >= level.height - 1 || !wall(nx, ny) || level.doors.has(i)) continue;
            // The niche is in the thickness of the wall: a wall behind it; to the side, a wall or the same passage (a cell next to an open one), not the next
            // room.
            const side = (sx: number, sy: number) => wall(sx, sy) || !wall(sx - dx, sy - dy);
            if (!wall(nx + dx, ny + dy) || !side(nx + dy, ny + dx) || !side(nx - dy, ny - dx)) continue;
            level.walls[i] = null;
            level.wallsVersion = (level.wallsVersion ?? 0) + 1;
            const at = { x: nx + 0.5, y: ny + 0.5 };
            p.block = blockAt(level, at, { x: at.x + dx, y: at.y + dy }, shape);
            p.x = at.x;
            p.y = at.y;
            this.niches.push({ cell: i, from });
            show();
            return;
          }
        }
      };
      carve();
    }
    // No place for a container even in a niche: it is gone, and its items go to the nearest 3D container visible from it (up to six cells; unlocked
    // first): in the save the removed container is empty and the items are with the neighbor, so nothing is lost or duplicated.
    // A container with a script (a quest) is not removed: better to leave it as an image.
    for (const c of this.containers) {
      if (c.gone || c.hidden || c.flat || !c.look || c.script || placed(c)) continue;
      const to = this.containers
        .filter((o) => o !== c && !o.gone && !o.hidden && placed(o) && Math.hypot(o.x - c.x, o.y - c.y) <= 6 && lineOfSight(level, c.x, c.y, o.x, o.y))
        .sort((a, b) => Number(a.locked) - Number(b.locked) || Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
      if (!to) continue;
      delete c.block;
      c.inventory.moveAllTo(to.inventory);
      c.hidden = true;
      this.rehomed.push({ from: c.key, to: to.key });
    }
  }

  /**
   * Goods on a counter (tbltop: the "Stuff" you rummage through): as a stack of boxes on the tabletop of whatever stands in the cell (table,
   * counter); it needs no space; no table means on the floor, if there is room (client, 2026-10-26: Killian's goods were flat
   * images).
   */
  private stackGoods(nearby = false): void {
    const { res, level } = { res: this.host.res, level: this.level };
    // The top of whatever stands in the cell on the floor (table, counter): the block's height is the height of its top above the floor.
    const topAt = (x: number, y: number) => Math.max(0, ...blocksIn(level, this.cellOf(x, y)).filter((b) => (b.base ?? 0) < 1).map((b) => b.height));
    for (const c of this.containers) {
      if (c.block || c.gone || !TABLETOP_GOODS.test(res.data?.itemArtName?.(c.proto) ?? '')) continue;
      let top = topAt(c.x, c.y);
      // Second pass (after clearing passages): no tabletop of its own, so onto the tabletop of an adjacent cell.
      if (nearby && top <= 0) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
          const t = topAt(c.x + dx, c.y + dy);
          if (t > 0.2 && t < 0.7) {
            c.x = Math.floor(c.x + dx) + 0.5;
            c.y = Math.floor(c.y + dy) + 0.5;
            top = t;
            break;
          }
        }
      }
      const block = blockAt(level, c, c, goodsShape(top));
      if (top <= 0 && !this.blockFits(c.x, c.y, block)) continue;
      c.block = block;
      this.setBlock(block, c.x, c.y);
    }
  }

  /**
   * A car or cart at its original spot: long side along x or y, whichever fits (first where there is more free floor
   * lengthwise); each occupied cell gets its own copy (the parts are shared). If it does not fit, it is not there. Returns the cells.
   */
  private placeSpan(at: { x: number; y: number }, shape: BlockShape, pid: number): number[] {
    const { level } = this;
    // The original spot does not fit (our walls are thicker): one cell to the side.
    for (const [ox, oy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const cells = this.trySpan({ x: at.x + ox, y: at.y + oy }, shape, pid);
      if (cells.length > 0) return cells;
    }
    return [];
  }

  /** A car centered at point c: if it fits, the cells; if not, empty. */
  private trySpan(c: { x: number; y: number }, shape: BlockShape, pid: number): number[] {
    const { level } = this;
    const freeRun = (dx: number, dy: number) => [-1, 1].filter((s) => !wallAt(level, c.x + dx * s, c.y + dy * s)).length;
    const order: ('x' | 'y')[] = freeRun(1, 0) >= freeRun(0, 1) ? ['x', 'y'] : ['y', 'x'];
    for (const along of order) {
      const whole = spanAt(c, along, shape);
      whole.pid = pid;
      const cells: number[] = [];
      for (let cy = Math.floor(whole.y0); cy <= Math.floor(whole.y1 - 1e-6); cy++) {
        for (let cx = Math.floor(whole.x0); cx <= Math.floor(whole.x1 - 1e-6); cx++) cells.push(cy * level.width + cx);
      }
      const fits = cells.every((cell) => this.blockFits((cell % level.width) + 0.5, Math.floor(cell / level.width) + 0.5, whole));
      if (!fits) continue;
      for (const cell of cells) addBlock(level, cell, { ...whole });
      return cells;
    }
    return [];
  }

  /** The open floor cell under a point or, if there is a wall there, the adjacent one (of four) nearest to the point; none means null. */
  /** Floor for a rockfall stone from our wall: the nearest open cell no farther than two cells (not a door). */
  private rubbleFloorNear(at: { x: number; y: number }): number | null {
    const { level } = this;
    let best: number | null = null;
    let bestDist = RUBBLE_REACH;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.floor(at.x) + dx + 0.5;
        const y = Math.floor(at.y) + dy + 0.5;
        if (wallAt(level, x, y) || level.doors.has(this.cellOf(x, y))) continue;
        const d = Math.hypot(x - at.x, y - at.y);
        if (d < bestDist) {
          best = this.cellOf(x, y);
          bestDist = d;
        }
      }
    }
    return best;
  }

  private openFloorNear(at: { x: number; y: number }): number | null {
    const { level } = this;
    if (!wallAt(level, at.x, at.y)) return this.cellOf(at.x, at.y);
    let best: number | null = null;
    let bestDist = Infinity;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = Math.floor(at.x) + dx + 0.5;
      const y = Math.floor(at.y) + dy + 0.5;
      if (wallAt(level, x, y) || level.doors.has(this.cellOf(x, y))) continue;
      const d = Math.hypot(x - at.x, y - at.y);
      if (d < bestDist) {
        best = this.cellOf(x, y);
        bestDist = d;
      }
    }
    return best;
  }

  /**
   * Floor markings: a stripe runs where adjacent cells also have a stripe (along x, along y or crosswise), so separate
   * pieces add up to paths; mats and grates as they are.
   */
  private layFloorMarks(marks: Map<number, FloorMarkKind>): void {
    if (marks.size === 0) return;
    const { level } = this;
    const w = level.width;
    level.floorMarks ??= new Map();
    const stripe = (cell: number) => marks.get(cell) === 'stripe';
    for (const [cell, kind] of marks) {
      if (kind === 'mat') level.floorMarks.set(cell, { texture: 'floorMat', turn: 0 });
      else if (kind === 'rug') level.floorMarks.set(cell, { texture: 'carpet', turn: 0 });
      else if (kind === 'drain' || kind === 'manhole' || kind === 'trapdoor' || kind === 'pit') level.floorMarks.set(cell, { texture: kind, turn: 0 });
      else if (kind === 'planks') level.floorMarks.set(cell, { texture: 'bridgePlanks', turn: 0 });
      else {
        const x = cell % w;
        const alongX = (x > 0 && stripe(cell - 1)) || (x < w - 1 && stripe(cell + 1));
        const alongY = stripe(cell - w) || stripe(cell + w);
        if (alongX && alongY) level.floorMarks.set(cell, { texture: 'stripeCross', turn: 0 });
        else level.floorMarks.set(cell, { texture: 'stripeLine', turn: alongY ? 1 : 0 });
      }
    }
  }

  /**
   * The cell and item for furniture: its own cell; inside a wall (our walls are thicker), the nearest free one no farther than two cells
   * that is separated from the original spot only by wall (do not jump into the next room); no place (overlaps another
   * item, a critter) gives null.
   */
  /**
   * Cells reachable from entrances, lifts and "E" exits (doors are passable). Our walls are thicker than the original ones:
   * a small original niche (the bed in a Vault 13 apartment) can become a closed-off cell here, and the player would not see furniture in it.
   */
  private reachable: Uint8Array | null = null;

  /** Whether it is closed off for furniture: a wall or a cell that cannot be reached. */
  private closed(x: number, y: number): boolean {
    if (wallAt(this.level, x, y)) return true;
    const { level } = this;
    if (!this.reachable) {
      const { width, height } = level;
      const seen = new Uint8Array(width * height);
      const stack: number[] = [];
      for (const s of [...Object.values(this.parsed.entries), ...this.elevators, ...this.useExits]) {
        const i = this.cellOf(s.x, s.y);
        if (i >= 0 && i < seen.length && !seen[i]) {
          seen[i] = 1;
          stack.push(i);
        }
      }
      // Without entrances (checks), everything open is reachable.
      if (stack.length === 0) seen.fill(1);
      while (stack.length > 0) {
        const i = stack.pop()!;
        const x0 = i % width;
        for (const j of [x0 > 0 ? i - 1 : -1, x0 < width - 1 ? i + 1 : -1, i - width, i + width]) {
          if (j < 0 || j >= seen.length || seen[j] || level.walls[j] !== null) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
      this.reachable = seen;
    }
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    return !this.reachable[cy * level.width + cx];
  }

  private furnitureSpot(at: { x: number; y: number }, shape: BlockShape): { spot: { x: number; y: number }; block: Block } | null {
    const cx = Math.floor(at.x);
    const cy = Math.floor(at.y);
    const tryCell = (x: number, y: number) => {
      if (this.closed(x, y)) return null;
      // Wall-mounted items without a fallback look (window, pipes, lamp) are not placed without a wall nearby.
      if (shape.wall && !shape.fallback && !hasWallBeside(this.level, x, y)) return null;
      const block = blockAt(this.level, { x, y }, at, shape);
      if (this.blockFits(x, y, block)) return { spot: { x, y }, block };
      // Something already stands at the cell's nearest wall: to another wall of the same cell (a window next to a console, a second bed).
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        if (!wallAt(this.level, x + dx, y + dy)) continue;
        const other = blockAt(this.level, { x, y }, { x: x + dx * 0.9, y: y + dy * 0.9 }, shape);
        if (this.blockFits(x, y, other)) return { spot: { x, y }, block: other };
      }
      return null;
    };
    if (!this.closed(at.x, at.y)) {
      const here = tryCell(cx + 0.5, cy + 0.5);
      if (here) return here;
      // The cell is occupied (in the original a table, a screen and a chair stand in one of our cells): to an adjacent free one, if it is
      // not through a wall (client, 2026-10-24: dozens of screens and chairs went missing in Vault 13).
      const near: { x: number; y: number; d: number }[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const x = cx + dx + 0.5;
          const y = cy + dy + 0.5;
          if (this.closed(x, y) || wallAt(this.level, cx + dx + 0.5, cy + 0.5) || wallAt(this.level, cx + 0.5, cy + dy + 0.5)) continue;
          near.push({ x, y, d: Math.hypot(x - at.x, y - at.y) });
        }
      }
      near.sort((a, b) => a.d - b.d);
      for (const c of near) {
        const found = tryCell(c.x, c.y);
        if (found) return found;
      }
      return null;
    }
    const cells: { x: number; y: number; d: number }[] = [];
    // Up to three cells (client, 2026-10-24: the consoles and screens of Vault 13 stood in a narrow room that here became
    // a wall three cells thick; now they come out of it to the nearest floor).
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = cx + dx + 0.5;
        const y = cy + dy + 0.5;
        cells.push({ x, y, d: Math.hypot(x - at.x, y - at.y) });
      }
    }
    // Nooks first (cells with fewer open neighbors), then the nearest: the sink of a Vault 13 apartment stands in
    // the original on the wall line between the bedroom and the narrow bathroom; its place is in the open bathroom, not in the bedroom corner
    // (client, 2026-10-24). A console from the wall between the hall and the corridor goes to the corridor, also by the wall, as it was.
    const openAround = (c: { x: number; y: number }) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !this.closed(c.x + dx!, c.y + dy!)).length;
    cells.sort((a, b) => openAround(a) - openAround(b) || a.d - b.d);
    for (const c of cells) {
      // From the original spot to this cell: through the wall (closed-off cells) and then over the open floor of the same room:
      // having left the wall onto the floor, the line must not hit a wall again (otherwise it is another room past the corridor).
      let ok = true;
      let out = false;
      for (let t = 0.15; t < 1 && ok; t += 0.1) {
        const px = at.x + (c.x - at.x) * t;
        const py = at.y + (c.y - at.y) * t;
        if (Math.floor(px) === Math.floor(c.x) && Math.floor(py) === Math.floor(c.y)) break;
        const shut = this.closed(px, py);
        if (!shut) out = true;
        else if (out) ok = false;
      }
      if (!ok) continue;
      const found = tryCell(c.x, c.y);
      if (found) return found;
    }
    return null;
  }

  /**
   * The level's pile of items at the container's spot (no farther than a cell or so): all items at one point, and all of them from the
   * container's contents. Taken from the floor; returns where it lay.
   */
  private takePile(at: { x: number; y: number }, contents: [number, number][]): { x: number; y: number } | null {
    if (contents.length === 0) return null;
    const pids = new Set(contents.map(([pid]) => pid));
    const piles = new Map<string, Pickup[]>();
    for (const p of this.pickups) {
      if (!p.key.startsWith('o') || Math.hypot(p.x - at.x, p.y - at.y) > PILE_REACH) continue;
      const spot = `${p.x},${p.y}`;
      piles.set(spot, [...(piles.get(spot) ?? []), p]);
    }
    let best: Pickup[] | null = null;
    for (const pile of piles.values()) {
      if (!pile.every((p) => pids.has(p.proto.pid))) continue;
      if (!best || Math.hypot(pile[0]!.x - at.x, pile[0]!.y - at.y) < Math.hypot(best[0]!.x - at.x, best[0]!.y - at.y)) best = pile;
    }
    if (!best) return null;
    for (const p of best) this.pickups.splice(this.pickups.indexOf(p), 1);
    return { x: best[0]!.x, y: best[0]!.y };
  }

  /** Critters' items from the original map, on the first visit (afterwards they are in the save). A weapon in hand does not go into the items. */
  private async giveCritterItems(state: MapState): Promise<void> {
    const { def } = this;
    const table = MAP_SCRIPTS[(def.original ?? '').toUpperCase()];
    const frame = def.hexFrame;
    if (!table || !frame) return;
    const { res } = this.host;
    const used = new Set<number>();
    for (const c of this.creatures) {
      const key = this.keyOf.get(c);
      if (!key?.startsWith('o') || state.creatures[key]) continue;
      const placed = this.parsed.objects[Number(key.slice(1))];
      if (placed?.kind !== 'critter' && placed?.kind !== 'npc') continue;
      // A critter moved in the location editor: at its position in the game level.
      const home = placed.home ?? c;
      let best = -1;
      let bestDist = CRITTER_MATCH;
      table.critters.forEach(([elevation, tile, pid], index) => {
        if (used.has(index) || elevation !== (def.elevation ?? 0) || pid !== placed.pid) return;
        const at = hexCenter(frame, tile);
        const dist = Math.hypot(at.x - home.x, at.y - home.y);
        if (dist < bestDist) {
          best = index;
          bestDist = dist;
        }
      });
      if (best < 0) continue;
      used.add(best);
      let weapon = placed.weapon ?? 0;
      for (const [pid, count] of table.critters[best]![4]) {
        const left = pid === weapon ? count - 1 : count;
        if (pid === weapon) weapon = 0;
        if (left > 0) c.inventory.add(await res.item(pid), left);
      }
    }
  }

  /**
   * A script created an object on this map (create_object_sid): a creature (with a script, if given) or an item on the ground.
   * The object is saved together with the map. Returns its key and the creature.
   */
  async addCreated(rec: Omit<CreatedObject, 'key'>): Promise<{ key: string; creature: Creature | null }> {
    const full: CreatedObject = { ...rec, key: `c${this.created.length + 1}` };
    return { key: full.key, creature: await this.materialize(full, emptyMapState()) };
  }

  /** Place an object created by a script on the map (just now or from a save). */
  private async materialize(rec: CreatedObject, state: MapState): Promise<Creature | null> {
    const { res } = this.host;
    this.created.push(rec);
    if (rec.kind === 'container') {
      const proto = await res.item(rec.pid);
      const c: SceneContainer = {
        key: rec.key,
        id: spawnedId++,
        proto,
        x: rec.x,
        y: rec.y,
        inventory: new Inventory(),
        sheet: null,
        locked: state.locks?.[rec.key] === 1,
        lockedAtStart: false,
        jammed: false,
        knownLocked: false,
        opened: false,
        gone: state.taken.includes(rec.key),
        hidden: true,
      };
      if (rec.script) c.script = { name: rec.script, key: rec.scriptKey ?? `${this.def.id}:${rec.key}` };
      for (const [pid, count] of state.containers?.[rec.key] ?? []) c.inventory.add(await res.item(pid), count);
      this.containers.push(c);
      return null;
    }
    if (rec.kind === 'scenery' && rec.script) {
      // Scenery with a script (a shaft with a rope instead of a broken one), the same as in the map: it is used with E.
      await this.addProp(rec.key, rec.pid, rec.tile ?? -1, { x: rec.x, y: rec.y }, { name: rec.script, key: rec.scriptKey ?? `${this.def.id}:${rec.key}` }, !!rec.hidden, true);
      return null;
    }
    if (rec.kind === 'scenery') {
      const proto = await Promise.resolve()
        .then(() => res.data.scenery(rec.pid))
        .catch(() => null);
      // Passable (blood, trash: the "does not block" flag): nothing; the rest (rubble rocks) is a wall in this cell.
      // "Flat" in the original is only the drawing order; it does not open a passage.
      if (!proto || (proto.flags & SCENERY_NO_BLOCK) !== 0) return null;
      // The original's invisible stop (block: the "blocking hex" at the Hub's notice board) becomes an invisible stop too, not
      // a stone wall in the middle of the street; if the cell already has an item, that item holds it.
      if (/^block\./i.test(await res.data.sceneryArtName(proto).catch(() => ''))) {
        const cell = this.cellOf(rec.x, rec.y);
        if (!wallAt(this.level, rec.x, rec.y) && blocksIn(this.level, cell).every((b) => (b.base ?? 0) >= 1)) {
          const cx = Math.floor(rec.x);
          const cy = Math.floor(rec.y);
          this.setBlock({ x0: cx + 0.2, x1: cx + 0.8, y0: cy + 0.2, y1: cy + 0.8, height: 0.5, front: 'rock', side: 'rock', top: 'rock', facing: 0, fill: true, hidden: true }, rec.x, rec.y);
        }
        return null;
      }
      this.blockCell(rec.x, rec.y);
      return null;
    }
    if (rec.kind === 'item') {
      const proto = await res.item(rec.pid);
      const sheet = await res.groundSprite(proto);
      this.pickups.push({ key: rec.key, id: spawnedId++, proto, count: rec.count ?? 1, x: rec.x, y: rec.y, taken: state.taken.includes(rec.key), sheet });
      return null;
    }
    const plain = await res.critterKind(rec.pid, await mapWeapon(res, rec.pid, rec.script, rec.weapon, Number(rec.key.slice(1)) || 0));
    const kind = barkClassOf(plain.soundBase, rec.script ?? null) === 'guard' ? guardKind(plain) : plain;
    // Beasts are hostile, humans are peaceful (the script itself will make them attack).
    const spot = clearOfWalls(this.level, rec.x, rec.y);
    const c = new Creature(spawnedId++, spot.x, spot.y, kind.stats, kind.art, kind.bites, undefined, kind.weapon);
    c.hidden = !!rec.hidden;
    const saved = state.creatures[rec.key];
    if (saved) c.restore(saved);
    for (const [pid, count] of state.corpseItems[rec.key] ?? []) c.inventory.add(await res.item(pid), count);
    this.adopt(c, kind);
    this.keyOf.set(c, rec.key);
    this.createdPid.set(c, rec.pid);
    if (rec.script) this.scripts.set(c, { name: rec.script, key: rec.scriptKey ?? `${this.def.id}:${rec.key}` });
    return c;
  }

  /**
   * A companion from another map left the party here (party_remove: the script leaves the kidnapped Tandi in the Khans' cell):
   * now it is a critter of this map, saved with it, with its script and the script's variables.
   */
  settle(creature: Creature, kind: CritterKind, script: { name: string; key: string } | null): void {
    if (this.keyOf.has(creature)) return;
    const rec: CreatedObject = { key: `c${this.created.length + 1}`, kind: 'critter', pid: kind.pid, x: creature.x, y: creature.y };
    if (kind.weaponPid) rec.weapon = kind.weaponPid;
    if (script) {
      rec.script = script.name;
      rec.scriptKey = script.key;
    }
    this.created.push(rec);
    this.keyOf.set(creature, rec.key);
    this.createdPid.set(creature, kind.pid);
  }

  /**
   * Original doors with scripts and locked ones (the map-scripts.ts table): an original door is converted to a level cell by the frame
   * on hexes, and the nearest of our doors gets the script and the lock. locks are the locks from the save (they take precedence).
   */
  /**
   * Scenery with original scripts (the map-scripts.ts table) on this floor. We draw our own walls, so scenery
   * by a wall (a computer, a panel) is placed in front of the wall, on the nearest free cell, so that it can be seen and
   * approached.
   */
  private async placeProps(state: MapState): Promise<void> {
    const { def } = this;
    const table = MAP_SCRIPTS[(def.original ?? '').toUpperCase()];
    const frame = def.hexFrame;
    if (!table?.scenery || !frame) return;
    const gone = new Set(state.gone ?? []);
    const here = table.scenery.filter(([elevation]) => elevation === (def.elevation ?? 0));
    const fromOf = (tile: number) => def.decor?.moved[`s${tile}`] ?? def.spots?.[tile] ?? hexCenter(frame, tile);
    const pieces = await this.joinPieces(here.map(([, tile, pid]) => ({ tile, pid })), fromOf);
    for (const [, tile, pid, name] of here) {
      const key = `s${tile}`;
      // A fan build script on the official copy: scenery without a script.
      const real = (await this.host.res.scriptExists?.(name)) !== false;
      await this.addProp(key, pid, tile, fromOf(tile), { name: real ? name : '', key: `${def.id}:${key}` }, gone.has(key), false, pieces.get(tile));
    }
  }

  /**
   * Large original items made of pieces (PIECED: casino tables, stairs up): the pieces of one item (adjacent
   * hexes) form one large item along the row of pieces, at the middle of their spots. Placed before the other scenery
   * (so it cannot take their place). The first piece gets the item (E runs its script), the rest have no image. If it does not fit,
   * it is not there at all.
   */
  private async joinPieces(list: { tile: number; pid: number }[], fromOf: (tile: number) => { x: number; y: number }): Promise<Map<number, PropPiece>> {
    const out = new Map<number, PropPiece>();
    const data = this.host.res.data;
    if (!data) return out;
    const arts = new Map<number, string>();
    for (const { tile, pid } of list) {
      const proto = await data.scenery(pid).catch(() => null);
      const art = proto ? await data.sceneryArtName(proto).catch(() => '') : '';
      if (PIECED.test(art)) arts.set(tile, art);
    }
    const near = (a: number, b: number) => Math.abs((a % HEX_WIDTH) - (b % HEX_WIDTH)) <= 1 && Math.abs(Math.floor(a / HEX_WIDTH) - Math.floor(b / HEX_WIDTH)) <= 1;
    const left = [...arts.keys()].sort((a, b) => a - b);
    while (left.length > 0) {
      const group = [left.shift()!];
      for (let i = 0; i < group.length; i++) {
        for (let j = left.length - 1; j >= 0; j--) if (near(group[i]!, left[j]!)) group.push(...left.splice(j, 1));
      }
      group.sort((a, b) => a - b);
      const spots = group.map(fromOf);
      const xs = spots.map((p) => p.x);
      const ys = spots.map((p) => p.y);
      const mid = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      const along = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'x' : 'y';
      const [lead, ...rest] = group;
      out.set(lead!, this.placeJoined(mid, along, piecedShape(arts.get(lead!)!)) ?? 'part');
      for (const tile of rest) out.set(tile, 'part');
    }
    return out;
  }

  /**
   * A large item centered at point c (if it does not fit, one cell to the side), long side along along (if that does not fit,
   * crosswise), back to the wall if there is one at either end (stairs go into the wall): the block goes in the middle cell,
   * copies in the other cells it occupies. If it does not fit, null.
   */
  private placeJoined(c: { x: number; y: number }, along: 'x' | 'y', shape: BlockShape): { block: Block; cells: number[]; keep: boolean } | null {
    const { level } = this;
    for (const [ox, oy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      for (const dir of along === 'x' ? (['x', 'y'] as const) : (['y', 'x'] as const)) {
        // Crosswise, in the middle of the cell: a cell-wide item does not reach into the next row.
        const at = { x: dir === 'y' ? Math.floor(c.x + ox) + 0.5 : c.x + ox, y: dir === 'x' ? Math.floor(c.y + oy) + 0.5 : c.y + oy };
        // The back (the end opposite the face; face east means back west, and so on): a wall behind it, how far to shift
        // the item along the axis so the back rests against it; no wall means null.
        const toWall = (b: Block): number | null => {
          const mx = (b.x0 + b.x1) / 2;
          const my = (b.y0 + b.y1) / 2;
          const back = [
            { edge: Math.ceil(b.x1), probe: [Math.ceil(b.x1) + 0.5, my], shift: Math.ceil(b.x1) - b.x1 },
            { edge: Math.floor(b.x0), probe: [Math.floor(b.x0) - 0.5, my], shift: Math.floor(b.x0) - b.x0 },
            { edge: Math.ceil(b.y1), probe: [mx, Math.ceil(b.y1) + 0.5], shift: Math.ceil(b.y1) - b.y1 },
            { edge: Math.floor(b.y0), probe: [mx, Math.floor(b.y0) - 0.5], shift: Math.floor(b.y0) - b.y0 },
          ][b.facing]!;
          return wallAt(level, back.probe[0]!, back.probe[1]!) ? back.shift : null;
        };
        const plain = spanAt(at, dir, shape);
        const flipped = spanAt(at, dir, shape, true);
        const flip = toWall(plain) === null && toWall(flipped) !== null;
        const shift = toWall(flip ? flipped : plain) ?? 0;
        const whole = spanAt(dir === 'x' ? { x: at.x + shift, y: at.y } : { x: at.x, y: at.y + shift }, dir, shape, flip);
        at.x = (whole.x0 + whole.x1) / 2;
        at.y = (whole.y0 + whole.y1) / 2;
        const cells: number[] = [];
        for (let cy = Math.floor(whole.y0); cy <= Math.floor(whole.y1 - 1e-6); cy++) {
          for (let cx = Math.floor(whole.x0); cx <= Math.floor(whole.x1 - 1e-6); cx++) cells.push(cy * level.width + cx);
        }
        // Critters at the table (casino players) do not get in the table's way: they are moved away.
        if (!cells.every((cell) => this.blockFits((cell % level.width) + 0.5, Math.floor(cell / level.width) + 0.5, whole, false, shape.exit))) continue;
        const home = this.cellOf(at.x, at.y);
        for (const cell of cells) addBlock(level, cell, cell === home ? whole : { ...whole });
        for (const cell of cells) this.clearSpot((cell % level.width) + 0.5, Math.floor(cell / level.width) + 0.5);
        return { block: whole, cells: cells.filter((cell) => cell !== home), keep: !!shape.exit };
      }
    }
    return null;
  }

  /**
   * Place scenery with a script: from the original map (placeProps) or created by a script (a shaft with a rope instead of
   * a broken one). from is the place in the original; gone means the script has already removed it for good (it exists but is not visible);
   * created means created by a script: it takes the place of the scenery on the same hex (which the script is about to remove).
   */
  private async addProp(key: string, pid: number, tile: number, from: { x: number; y: number }, script: SceneProp['script'], gone = false, created = false, piece?: PropPiece): Promise<void> {
    const { res } = this.host;
    const twins = created && tile >= 0 ? this.props.filter((q) => q.tile === tile && !q.hidden) : [];
    // Each piece of scenery gets its own cell: two in one (a lamp on a computer) would get in each other's way on E.
    const taken = this.props.filter((q) => !q.gone && !twins.includes(q)).map((q) => ({ x: q.x, y: q.y }));
    // A piece of a large item (joinPieces): the first at the middle of the item, the rest at the same spot as in the original.
    const joined = piece && piece !== 'part' ? piece : null;
    const at = joined ? { x: (joined.block.x0 + joined.block.x1) / 2, y: (joined.block.y0 + joined.block.y1) / 2 } : piece ? { ...from } : twins[0] ? { x: twins[0].x, y: twins[0].y } : this.openSpotNear(from, taken);
    // Image and name from the player's copy; if not found, the scenery still works (its script), just without an image.
    const proto = await Promise.resolve()
      .then(() => res.data.scenery(pid))
      .catch(() => null);
    const sheet = proto ? await res.data.scenerySprite(proto).catch(() => null) : null;
    const text = proto ? await res.data.sceneryText(proto).catch(() => ({ name: '', description: '' })) : { name: '', description: '' };
    const art = proto ? await res.data.sceneryArtName(proto).catch(() => '') : '';
    // Hatch, crawlway, pit (a way down): drawn on the floor rather than as an upright image; E works as before.
    const hatch = gone ? null : floorMarkOf(art);
    if (hatch) this.layFloorMarks(new Map([[this.cellOf(at.x, at.y), hatch]]));
    const prop: SceneProp = { key, id: spawnedId++, pid, tile, x: at.x, y: at.y, script, sheet: hatch ? null : sheet, name: text.name, hidden: gone, gone, field: /^ffield/i.test(art) };
    if (piece) {
      // The large item is already placed (joinPieces); extra pieces have no image. If it did not fit, the first piece does not have it either.
      if (joined) {
        prop.block = joined.block;
        if (joined.keep) prop.keep = true;
        prop.copies = joined.cells.map((cell) => ({ cell, block: blocksIn(this.level, cell).find((b) => b.parts === joined.block.parts)! }));
      } else {
        prop.sheet = null;
        prop.hidden = true;
      }
      this.props.push(prop);
      if (gone) this.setPropVisible(prop, false);
      return;
    }
    const shape = blockShapeOf(art, this.def.ruined);
    if (NOT_NEEDED.test(art)) prop.vanish = true;
    if (shape?.exit) prop.keep = true;
    // An invisible original marker (block: a light point, a stop): it has no image.
    if (/^block\./i.test(art)) prop.sheet = null;
    // Stairs: on the E exit cell next to their place in the original (that is where the level expects the stairs).
    if (shape?.exit && !twins[0]) {
      const exit = this.useExits.find((e) => Math.hypot(Math.floor(e.x) + 0.5 - from.x, Math.floor(e.y) + 0.5 - from.y) < 2.1);
      if (exit) {
        at.x = Math.floor(exit.x) + 0.5;
        at.y = Math.floor(exit.y) + 0.5;
        prop.x = at.x;
        prop.y = at.y;
      }
    }
    if (shape) {
      // The block of the previous scenery at this spot does not get in the new one's way: the script is about to remove the previous one.
      const old = twins.filter((q) => q.block);
      for (const q of old) removeBlock(this.level, this.cellOf(q.x, q.y), q.block!);
      // An invisible stop (the level draws the thing itself) is always placed: otherwise a flat original image would pop out.
      // Everything that works with E is 3D (client, 2026-10-29): if it did not fit in its place, a free cell nearby;
      // if none there either, its own place, and a critter nearby is moved away.
      let block = blockAt(this.level, at, from, shape);
      let fits = !!shape.hidden || this.blockFits(at.x, at.y, block, true, shape.exit);
      if (!fits && !twins[0]) {
        const near = this.blockSpotNear(from, at, shape, taken);
        if (near) {
          prop.x = near.at.x;
          prop.y = near.at.y;
          block = near.block;
          fits = true;
        }
      }
      if (!fits && this.blockFits(at.x, at.y, block, false, shape.exit)) {
        fits = true;
        this.clearSpot(at.x, at.y);
      }
      prop.look = { shape, from };
      if (fits) prop.block = block;
      // Not needed by the story (slot machine, sink, alarm light) and no room: it is not placed as a flat image, it is simply
      // gone (client, 2026-10-27: "the slot machines in the casino look very bad").
      else if (prop.vanish) prop.hidden = true;
      for (const q of old) addBlock(this.level, this.cellOf(q.x, q.y), q.block!);
    }
    this.props.push(prop);
    if (!gone && (prop.field || prop.block)) this.setPropVisible(prop, true);
    // The rope was tied to the beam at the crater: it hangs down the slope into the shaft (the crater draws it).
    if (!gone && /^beamrope/i.test(art)) {
      for (const c of this.level.craters ?? []) {
        const d = Math.hypot(at.x - c.x, at.y - c.y);
        if (d > c.reach + 1.5) continue;
        const angle = Math.atan2(at.y - c.y, at.x - c.x);
        c.rope = { angle, from: Math.min(1, d / craterEdge(c, angle)) };
      }
    }
  }

  /** A script removed scenery for good (destroy_object): it will not be there on the next visit to the map either. */
  destroyProp(prop: SceneProp): void {
    prop.gone = true;
    this.setPropVisible(prop, false);
    // Scenery created by a script stays in the list (its script variables are by its number), but is no longer visible.
    const rec = this.created.find((r) => r.key === prop.key);
    if (rec) rec.hidden = true;
  }

  /**
   * A free cell for an item near its original spot (from): up to two cells, the nearest, visible from where the item
   * would land on its own (at, not behind a wall in another room), without other scenery. None means null.
   */
  private blockSpotNear(from: { x: number; y: number }, at: { x: number; y: number }, shape: BlockShape, taken: { x: number; y: number }[]): { at: { x: number; y: number }; block: Block } | null {
    const { level } = this;
    const busy = (x: number, y: number) => taken.some((q) => Math.floor(q.x) === Math.floor(x) && Math.floor(q.y) === Math.floor(y));
    const cells: { x: number; y: number; d: number }[] = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.floor(from.x) + dx + 0.5;
        const y = Math.floor(from.y) + dy + 0.5;
        const d = Math.hypot(x - from.x, y - from.y);
        if (d <= 2.3) cells.push({ x, y, d });
      }
    }
    cells.sort((a, b) => a.d - b.d);
    // The spot itself is in a door or wall (our walls are thicker): we cannot check visibility from there, so we take the nearest cell.
    const blind = !!wallAt(level, at.x, at.y) || level.doors.has(this.cellOf(at.x, at.y));
    for (const c of cells) {
      if (wallAt(level, c.x, c.y) || level.doors.has(this.cellOf(c.x, c.y)) || busy(c.x, c.y) || (!blind && !lineOfSight(level, at.x, at.y, c.x, c.y))) continue;
      const block = blockAt(level, c, from, shape);
      if (this.blockFits(c.x, c.y, block, true, shape.exit)) return { at: { x: c.x, y: c.y }, block };
    }
    return null;
  }

  /** Move living creatures standing closer than a cell to a point (the hero's spawn point) to the nearest free cell. */
  clearSpot(x: number, y: number): void {
    const taken = [{ x, y }, ...this.creatures.filter((c) => c.present).map((c) => ({ x: c.x, y: c.y }))];
    for (const c of this.creatures) {
      if (!c.present || !c.alive || Math.hypot(c.x - x, c.y - y) >= 0.7) continue;
      let best: { x: number; y: number } | null = null;
      let bestDist = Infinity;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = Math.floor(x) + dx + 0.5;
          const ny = Math.floor(y) + dy + 0.5;
          if (wallAt(this.level, nx, ny) || this.level.doors.has(this.cellOf(nx, ny)) || blocksIn(this.level, this.cellOf(nx, ny)).some((b) => b.fill)) continue;
          if (taken.some((q) => Math.hypot(q.x - nx, q.y - ny) < 0.6)) continue;
          if (!lineOfSight(this.level, x, y, nx, ny)) continue;
          const d = Math.hypot(nx - x, ny - y);
          if (d < bestDist) {
            best = { x: nx, y: ny };
            bestDist = d;
          }
        }
      }
      if (!best) continue;
      c.x = best.x;
      c.y = best.y;
      // Stepped aside to make room for the hero: stays there.
      if (this.homes.has(c)) this.homes.set(c, { x: best.x, y: best.y, facing: c.facing });
      taken.push(best);
    }
  }

  /**
   * The free cell nearest to a point (its middle); if the point is free, the point itself. taken: where other scenery already stands;
   * those cells are occupied (if there is another free one nearby).
   */
  private openSpotNear(at: { x: number; y: number }, taken: { x: number; y: number }[] = []): { x: number; y: number } {
    const busy = (x: number, y: number) => taken.some((q) => Math.floor(q.x) === Math.floor(x) && Math.floor(q.y) === Math.floor(y));
    if (!wallAt(this.level, at.x, at.y) && !busy(at.x, at.y)) return at;
    let best = at;
    let bestDist = Infinity;
    const cx = Math.floor(at.x);
    const cy = Math.floor(at.y);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx + 0.5;
        const y = cy + dy + 0.5;
        if (wallAt(this.level, x, y) || busy(x, y)) continue;
        const d = Math.hypot(x - at.x, y - at.y);
        if (d < bestDist) {
          best = { x, y };
          bestDist = d;
        }
      }
    }
    return best;
  }

  /** Turn a cell into a wall (a script cave-in): the texture is this map's most common wall. */
  private blockCell(x: number, y: number): void {
    const { level } = this;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= level.width || cy >= level.height) return;
    const i = cy * level.width + cx;
    if (level.walls[i] !== null || level.doors.has(i)) return;
    const count = new Map<TextureName, number>();
    for (const w of level.walls) if (w) count.set(w, (count.get(w) ?? 0) + 1);
    let texture: TextureName | null = null;
    let most = 0;
    for (const [name, n] of count) {
      if (n > most) {
        texture = name;
        most = n;
      }
    }
    if (!texture) return;
    level.walls[i] = texture;
    level.wallsVersion = (level.wallsVersion ?? 0) + 1;
  }

  /** Hide or show scenery (script); a force field closes or opens its cell accordingly. */
  setPropVisible(prop: SceneProp, visible: boolean): void {
    prop.hidden = !visible;
    const { level } = this;
    if (prop.block) {
      const home = Math.floor(prop.y) * level.width + Math.floor(prop.x);
      for (const { cell, block } of [{ cell: home, block: prop.block }, ...(prop.copies ?? [])]) {
        const placed = blocksIn(level, cell).includes(block);
        if (visible && !placed) addBlock(level, cell, block);
        else if (!visible && placed) removeBlock(level, cell, block);
      }
    }
    if (!prop.field) return;
    const i = Math.floor(prop.y) * level.width + Math.floor(prop.x);
    if (visible && level.walls[i] === null) level.walls[i] = 'forcefield';
    else if (!visible && level.walls[i] === 'forcefield') level.walls[i] = null;
    level.wallsVersion = (level.wallsVersion ?? 0) + 1;
  }

  /** A momentary effect: kind, where, at what height, size, duration, rise speed. */
  private addEffect(kind: EffectKind, x: number, y: number, z: number, size: number, duration: number, rise = 0): void {
    this.effects.push({ kind, x, y, z, size, duration, rise, time: 0, seed: Math.floor(Math.random() * 1000) });
  }

  /** Light from flashes this frame: fades by the end of the flash. Flares on the floor glow with a slight flicker of flame. */
  flashLights(): DynamicLight[] {
    const lights: DynamicLight[] = this.flashes.map((f) => ({ x: f.x, y: f.y, radius: f.radius, strength: f.strength * (f.time / f.duration) }));
    for (const f of this.groundFlares) lights.push({ x: f.x, y: f.y, radius: FLARE_LIGHT.radius, strength: FLARE_LIGHT.strength * (0.88 + Math.random() * 0.12) });
    return lights;
  }

  /** Scenery with original scripts. */
  scriptedProps(): SceneProp[] {
    // Without a script (special encounters, a fan script on the official copy): not for scripts.
    return this.props.filter((p) => p.script.name);
  }

  /** Spatial scripts of this map (this floor). */
  scriptedSpatials(): readonly SceneSpatial[] {
    return this.spatials;
  }

  /** Original spatial scripts (the map-scripts.ts table) at their places on this floor. */
  private bindSpatialScripts(): void {
    const { def } = this;
    const table = MAP_SCRIPTS[(def.original ?? '').toUpperCase()];
    const frame = def.hexFrame;
    if (!table?.spatial || !frame) return;
    table.spatial.forEach(([elevation, tile, radius, name], i) => {
      if (elevation !== (def.elevation ?? 0) || SPATIAL_SKIP.test(name)) return;
      const at = def.spots?.[tile] ?? hexCenter(frame, tile);
      this.spatials.push({ x: at.x, y: at.y, radius: radius * SPATIAL_HEX + SPATIAL_PAD, tile, script: { name, key: `${def.id}:s${i}` } });
    });
  }

  /** Scenery hit by an explosion since last time (the script runner will call damage_p_proc on them). */
  takePropDamage(): SceneProp[] {
    const list = this.propDamage;
    this.propDamage = [];
    return list;
  }

  /** Wounded since last time and who wounded them (null means the hero): the script runner will call damage_p_proc on them. */
  takeCreatureHits(): { victim: Creature; by: Creature | null }[] {
    const list = this.creatureHits;
    this.creatureHits = [];
    return list;
  }

  /** Who last wounded a creature: null means the hero, undefined means nobody (death by script). */
  lastHitBy(c: Creature): Creature | null | undefined {
    return this.lastHit.get(c);
  }

  /** A creature was wounded (or hit without damage): remember by whom, for its script. */
  private noteHit(victim: Creature, by: Creature | null): void {
    this.creatureHits.push({ victim, by });
    this.lastHit.set(victim, by);
  }

  /**
   * Place an explosive charge at the hero's feet: in time seconds it explodes, damaging everyone in the radius (the hero too, if they did not
   * get away in time); scenery nearby learns about the explosion (a cave wall collapses).
   */
  async plantCharge(
    proto: ItemProto,
    x: number,
    y: number,
    time: number,
    damage: { min: number; max: number },
    from?: { x: number; y: number; flight: number },
    by?: Creature,
  ): Promise<void> {
    const sheet = await this.host.res.groundSprite(proto).catch(() => null);
    this.charges.push({ x, y, time, damage, id: spawnedId++, sheet, from, flown: 0, ...(by ? { by } : {}) });
  }

  /** Throw a lit flare to point (x, y): it flies in an arc, lands and burns on the floor for the remaining left seconds. */
  async throwFlare(proto: ItemProto, x: number, y: number, left: number, from: { x: number; y: number }): Promise<void> {
    const sheet = await this.host.res.groundSprite(proto).catch(() => null);
    const flight = THROW_FLIGHT.base + Math.hypot(x - from.x, y - from.y) * THROW_FLIGHT.perCell;
    this.charges.push({ x, y, time: flight, damage: { min: 0, max: 0 }, id: spawnedId++, sheet, from: { ...from, flight }, flown: 0, flare: left });
  }

  /**
   * An enemy threw a grenade to point (x, y): the worse its "Throwing" skill, the farther from the target it lands; it flies in an arc and does not
   * pass through walls; it explodes after a short fuse.
   */
  private enemyGrenade(c: Creature, x: number, y: number, proto: ItemProto): void {
    const w = proto.weapon;
    if (!w) return;
    const skill = Math.min(95, this.fighterOf(c).skills[SKILL.throwing] ?? 0);
    const miss = (1 - skill / 100) * 2;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * miss;
    const tx = x + Math.cos(a) * r;
    const ty = y + Math.sin(a) * r;
    // Flies from the thrower toward the target until it hits a wall.
    const d = Math.hypot(tx - c.x, ty - c.y) || 1;
    let lx = c.x;
    let ly = c.y;
    for (let s = 0.25; s <= d; s += 0.25) {
      const nx = c.x + ((tx - c.x) / d) * s;
      const ny = c.y + ((ty - c.y) / d) * s;
      if (wallAt(this.level, nx, ny)) break;
      lx = nx;
      ly = ny;
    }
    const flight = ENEMY_GRENADE_FLIGHT.base + d * ENEMY_GRENADE_FLIGHT.perCell;
    void this.plantCharge(proto, lx, ly, flight + ENEMY_GRENADE_FUSE, { min: w.minDamage, max: w.maxDamage }, { x: c.x, y: c.y, flight }, c);
  }

  /**
   * Where something thrown forward lands: along the hero's view up to reach cells, but no farther than a wall or the first living thing in the way
   * (a grenade bounces off a wall to the enemy's feet).
   */
  throwTarget(player: Player, reach: number): { x: number; y: number } {
    const dx = Math.cos(player.angle);
    const dy = Math.sin(player.angle);
    let x = player.x;
    let y = player.y;
    for (let d = 0.25; d <= reach; d += 0.25) {
      const nx = player.x + dx * d;
      const ny = player.y + dy * d;
      if (wallAt(this.level, nx, ny)) break;
      x = nx;
      y = ny;
      if (this.creatures.some((c) => c.alive && c.present && !this.allies.has(c) && Math.hypot(c.x - nx, c.y - ny) < 0.5)) break;
    }
    return { x, y };
  }

  private updateCharges(dt: number, player: Player): void {
    this.blast = Math.max(0, this.blast - dt * 2);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      f.time -= dt;
      if (f.time <= 0) this.flashes.splice(i, 1);
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]!;
      e.time += dt;
      if (e.time >= e.duration) this.effects.splice(i, 1);
    }
    for (let i = this.charges.length - 1; i >= 0; i--) {
      const c = this.charges[i]!;
      c.time -= dt;
      c.flown += dt;
      if (c.time > 0) continue;
      this.charges.splice(i, 1);
      if (c.flare !== undefined) this.groundFlares.push({ id: c.id, x: c.x, y: c.y, left: c.flare, sheet: c.sheet });
      else if (c.thrown) this.landThrown(c, c.thrown, player);
      else this.explode(c, player);
    }
    for (let i = this.groundFlares.length - 1; i >= 0; i--) {
      const f = this.groundFlares[i]!;
      f.left -= dt;
      if (f.left <= 0) this.groundFlares.splice(i, 1);
    }
  }

  /**
   * The hero throws a thrown weapon (knife, rock; 2026-10-24: the knife used to explode like a grenade): the item leaves the hand and
   * flies to a point in the crosshair circle, like a bullet, but with the "Throwing" skill and no farther than Strength and the weapon itself allow; it hits
   * whoever it strikes with normal damage and stays lying on the floor, where it can be picked up.
   */
  private throwHeld(renderer: Renderer, player: Player, radius: number): void {
    const { hero, res } = this.host;
    const item = hero.weaponItem;
    if (!item || !hero.inventory.remove(item.pid)) return;
    const w = item.weapon;
    if (w.soundCode) res.sound.play(weaponSfx('A', w.soundCode, 1), 0.8);
    this.noise(player.x, player.y, NOISE.run, false);
    // Throw range in the original is no more than three hexes per point of Strength; a cell is two hexes.
    const reach = Math.min(w.range, 3 * hero.fighter.special.strength) / 2;
    const living = new Set(this.creatures.filter((c) => c.alive && c.present && !this.allies.has(c)).map((c) => c.id));
    const lands = spreadPoint(radius);
    const offset = Math.atan(lands.x / renderer.proj);
    const id = renderer.pickPoint(VIEW_W / 2 + lands.x, VIEW_H / 2 + lands.y, RES, (n) => living.has(n));
    let target = this.creatures.find((c) => c.id === id && c.alive) ?? null;
    if (target && Math.hypot(target.x - player.x, target.y - player.y) > reach + 0.3) target = null;
    // Where it lands: at the target's feet, and on a miss, along the throw direction up to a wall or the range limit.
    const a = player.angle + offset;
    const stop = target ? Math.hypot(target.x - player.x, target.y - player.y) - 0.2 : reach;
    let x = player.x;
    let y = player.y;
    for (let d = 0.25; d <= stop; d += 0.25) {
      const nx = player.x + Math.cos(a) * d;
      const ny = player.y + Math.sin(a) * d;
      if (wallAt(this.level, nx, ny)) break;
      x = nx;
      y = ny;
    }
    const hit = target ? strike(hero.fighter, { min: w.minDamage, max: w.maxDamage }, this.fighterOf(target)) : { damage: 0, critical: false };
    const flight = THROW_FLIGHT.base + Math.hypot(x - player.x, y - player.y) * THROW_FLIGHT.perCell;
    void res.groundSprite(item).catch(() => null).then((sheet) => {
      this.charges.push({ x, y, time: flight, damage: { min: 0, max: 0 }, id: spawnedId++, sheet, from: { x: player.x, y: player.y, flight }, flown: 0, thrown: { proto: item, target, damage: hit.damage, critical: hit.critical } });
    });
  }

  /** The thrown item arrived: on a hit, damage (as from the hero's blow), and the item lands on the floor. */
  private landThrown(c: Charge, thrown: NonNullable<Charge['thrown']>, player: Player): void {
    const { target } = thrown;
    if (target && target.alive && target.present) this.wound(target, player, thrown.damage, thrown.critical);
    else if (thrown.proto.weapon?.soundCode) this.host.res.sound.playAt(weaponSfx('H', thrown.proto.weapon.soundCode, 1, 'S'), c.x, c.y, player, 0.5);
    void this.addCreated({ kind: 'item', pid: thrown.proto.pid, x: c.x, y: c.y, count: 1 });
  }

  private explode(c: Charge, player: Player): void {
    const { hero, res } = this.host;
    this.blast = 1;
    this.flashes.push({ x: c.x, y: c.y, radius: 7, strength: 2, time: 0.6, duration: 0.6 });
    this.addEffect('fire', c.x, c.y, 0.55, 2.4, 0.55);
    this.addEffect('smoke', c.x, c.y, 0.7, 2.8, 1.8, 0.35);
    res.sound.playAt(EXPLOSION_SFX, c.x, c.y, player, 1);
    this.noise(c.x, c.y, NOISE.shot * 1.5, true);
    const hits = (x: number, y: number) => Math.hypot(x - c.x, y - c.y) <= BLAST_RADIUS && lineOfSight(this.level, c.x, c.y, x, y);
    for (const cr of this.creatures) {
      if (!cr.alive || !cr.present || !hits(cr.x, cr.y)) continue;
      const dmg = Math.max(0, strike({ critChance: 0 }, c.damage, this.fighterOf(cr)).damage);
      const killed = cr.hurt(dmg);
      this.noteHit(cr, c.by ?? null);
      this.host.say(tf('msgHit', { name: cr.stats.name, dmg }));
      if (killed) {
        this.manDown(cr);
        if (!this.allies.has(cr)) {
          hero.kills += 1;
          const xp = this.gainKill(cr.stats.experience);
          this.host.say(tf('msgKill', { name: cr.stats.name, xp: xp.gained }));
          if (xp.levels > 0) this.host.say(tf('msgLevelUp', { level: hero.level }));
        }
      } else {
        cr.alertTo(player.x, player.y);
      }
    }
    if (hits(player.x, player.y)) {
      const dmg = Math.max(0, strike({ critChance: 0 }, c.damage, hero.fighter).damage);
      const limb = hero.takeDamage(dmg, { blast: true });
      this.host.say(tf('msgBlastHurt', { dmg }));
      if (limb) this.host.say(t(limb === 'arm' ? 'msgCrippledArm' : 'msgCrippledLeg'));
    }
    for (const p of this.props) if (Math.hypot(p.x - c.x, p.y - c.y) <= BLAST_RADIUS + 1.5) this.propDamage.push(p);
  }

  private async bindDoorScripts(locks: Record<string, number> = {}): Promise<void> {
    const { def } = this;
    const table = MAP_SCRIPTS[(def.original ?? '').toUpperCase()];
    const frame = def.hexFrame;
    if (!table || !frame) return;
    for (const [elevation, tile, name, locked] of table.doors) {
      if (elevation !== (def.elevation ?? 0)) continue;
      const at = hexCenter(frame, tile);
      let best: SceneDoor | null = null;
      let bestDist = DOOR_MATCH;
      for (const d of this.doors) {
        const dist = Math.hypot(d.door.cx + 0.5 - at.x, d.door.cy + 0.5 - at.y);
        if (!d.script && dist < bestDist) {
          best = d;
          bestDist = dist;
        }
      }
      if (!best) continue;
      best.tile = tile;
      if (name && (await this.host.res.scriptExists?.(name)) !== false) best.script = { name, key: `${def.id}:d${best.key}` };
      if (locked) {
        best.lockedAtStart = true;
        if (locks[best.key] === undefined) best.locked = true;
      }
    }
  }

  /** Doors with original scripts. */
  scriptedDoors(): SceneDoor[] {
    return this.doors.filter((d) => d.script);
  }

  /** Containers with original scripts (and stashes created by scripts). */
  scriptedContainers(): SceneContainer[] {
    return this.containers.filter((c) => c.script && !c.gone);
  }

  /** A stash created by a script (by a "c..." key). */
  containerByKey(key: string): SceneContainer | undefined {
    return this.containers.find((c) => c.key === key);
  }

  /**
   * Open or close a door, by script (obj_open, obj_close, use_obj) or by the hero's hand. With sound. A locked one cannot be opened,
   * and it cannot be closed while someone stands in the doorway. Returns whether it worked.
   */
  setDoorOpen(d: SceneDoor, open: boolean): boolean {
    const { player, res } = this.host;
    if (open === (d.target === 1)) return true;
    if (open && d.locked) return false;
    if (!open && this.doorBusy(d, player)) return false;
    d.target = open ? 1 : 0;
    d.closeIn = DOOR_AUTOCLOSE;
    res.sound.playAt(doorSfx(open ? 'O' : 'C', d.sound), d.door.cx + 0.5, d.door.cy + 0.5, player);
    return true;
  }

  /** Lock or unlock a door or a container (obj_lock, obj_unlock). */
  setDoorLocked(d: Lockable, locked: boolean): void {
    d.locked = locked;
    if (!locked) d.knownLocked = false;
  }

  /** The hero's regular action with a container (E): locked gives "locked" (the next E picks it), open means it can be searched. */
  operateContainer(c: SceneContainer): boolean {
    const { res, player } = this.host;
    if (c.locked) {
      res.sound.playAt(doorSfx('L', 'A'), c.x, c.y, player);
      this.host.say(tf('msgDoorLockedPick', { n: this.lockpickChance() }));
      c.knownLocked = true;
      return false;
    }
    c.opened = true;
    return true;
  }

  /** Pick a container's lock; if it is not locked at all, it can be searched (true). */
  pickContainer(c: SceneContainer): boolean {
    if (!c.locked) return this.operateContainer(c);
    this.tryPick(c);
    return false;
  }

  /**
   * The hero's regular action with a door (E): open or close. Locked: with a key, unlocks it; without one, "locked",
   * and the next E tries to pick the lock (pickLock).
   */
  operateDoor(d: SceneDoor): void {
    const { hero, res, player } = this.host;
    if (d.locked) {
      if (d.keyPid !== undefined && hero.inventory.count(d.keyPid) > 0) {
        d.locked = false;
      } else {
        res.sound.playAt(doorSfx('L', d.sound), d.door.cx + 0.5, d.door.cy + 0.5, player);
        this.host.say(tf('msgDoorLockedPick', { n: this.lockpickChance() }));
        d.knownLocked = true;
        return;
      }
    }
    this.setDoorOpen(d, d.target !== 1);
  }

  /**
   * Pick a lock with the "Lockpick" skill (on a door without a script, or if the script does not object). Success: the door is unlocked;
   * critical failure: the lock jams until leaving the map; plain failure: you can try again.
   */
  pickLock(d: SceneDoor): void {
    if (!d.locked) {
      this.operateDoor(d);
      return;
    }
    this.tryPick(d);
  }

  /** A "Lockpick" roll against a lock: success unlocks, critical failure jams. */
  private tryPick(d: Lockable): void {
    const { hero, clock } = this.host;
    if (d.jammed) {
      this.host.say(t('msgLockJammed'));
      return;
    }
    const dice = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
    const roll = rollCheck(this.lockpickChance(), hero.critChance, dice, clock.seconds >= DAY_SECONDS);
    if (roll.result >= ROLL.success) {
      this.setDoorLocked(d, false);
      this.host.say(t('msgLockPicked'));
    } else if (roll.result === ROLL.criticalFailure) {
      d.jammed = true;
      this.host.say(t('msgLockJammedNow'));
    } else {
      this.host.say(t('msgLockPickFail'));
    }
  }

  /**
   * The hero started picking a lock (client, 2026-10-27: "nobody reacts"). A critter who sees it warns the first
   * time; the second time on this map, armed witnesses and guards around attack, unarmed ones run away.
   * Nobody saw it: nothing happens.
   */
  witnessPick(player: Player): void {
    const seen = this.creatures.filter((c) => {
      if (!c.alive || !c.present || c.hostile || !c.talks || this.allies.has(c) || this.kindOf.get(c)?.bites) return false;
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      return d <= PICK_WITNESS.sight && lineOfSight(this.level, c.x, c.y, player.x, player.y);
    });
    if (!seen.length) return;
    const dist = (c: Creature) => Math.hypot(c.x - player.x, c.y - player.y);
    const nearest = seen.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    nearest.turnTo(Math.atan2(player.y - nearest.y, player.x - nearest.x));
    if (this.pickWarnings++ === 0) {
      this.float(nearest, t('pickWarnSay'), BARK_COLOR);
      this.host.say(tf('msgPickWarned', { name: nearest.stats.name }));
      return;
    }
    this.float(nearest, t('pickAttackSay'), BARK_COLOR);
    this.host.say(tf('msgPickAttacked', { name: nearest.stats.name }));
    for (const c of this.creatures) {
      if (!c.alive || !c.present || c.hostile || this.allies.has(c) || this.kindOf.get(c)?.bites) continue;
      const witness = seen.includes(c);
      const guard = barkClassOf(this.kindOf.get(c)?.soundBase ?? '', this.scripts.get(c)?.name ?? null) === 'guard';
      if (c.weapon && (witness || (guard && dist(c) <= PICK_WITNESS.guards))) {
        c.provoke();
        c.alertTo(player.x, player.y);
      } else if (witness) {
        c.hear(player.x, player.y, true, this.level);
      }
    }
  }

  /** The hero's chance to pick a lock: the "Lockpick" skill, but no higher than 95%. */
  lockpickChance(): number {
    return Math.max(0, Math.min(LOCKPICK_MAX, this.host.hero.fighter.skills[SKILL.lockpick] ?? 0));
  }

  /** An entry point by name; if there is none, the first one found (so as not to get stuck because of a typo in the data). */
  entry(name: string): Entry {
    const entries = this.parsed.entries;
    const found = entries[name] ?? Object.values(entries)[0];
    if (!found) throw new Error(`${this.def.id}: no entry points at all`);
    return found;
  }

  /** A critter's script (for conversation), if it has one. */
  scriptOf(creature: Creature): { name: string; key: string } | null {
    return this.scripts.get(creature) ?? null;
  }

  /** All creatures on the map with scripts. */
  scripted(): ScriptedCreature[] {
    return [...this.scripts].map(([creature, s]) => ({ creature, name: s.name, key: s.key }));
  }

  /** Give a creature a script (for those that appear during play, and for checks). */
  bindScript(creature: Creature, name: string): string {
    const key = `${this.def.id}:${this.keyOf.get(creature) ?? 'c' + creature.id}`;
    this.scripts.set(creature, { name: name.toUpperCase(), key });
    return key;
  }

  /** A creature's prototype number (PID), from level data. */
  pidOf(creature: Creature): number {
    const created = this.createdPid.get(creature);
    if (created !== undefined) return created;
    const o = this.parsed.objects[this.indexOf(creature)];
    return o && (o.kind === 'critter' || o.kind === 'npc' || o.kind === 'corpse') ? o.pid : 0;
  }

  /** The ID of the level object a creature came from (-1 means it appeared on its own). */
  indexOf(creature: Creature): number {
    const key = this.keyOf.get(creature);
    return key?.startsWith('o') ? Number(key.slice(1)) : -1;
  }

  /** A creature appeared during play (a wasteland encounter): hostile, lives on the map while the hero is here. */
  async spawnCreature(pid: number, x: number, y: number, weaponPid = 0): Promise<Creature> {
    const kind = await this.host.res.critterKind(pid, weaponPid);
    const c = new Creature(spawnedId++, x, y, kind.stats, kind.art, true, undefined, kind.weapon);
    this.adopt(c, kind);
    return c;
  }

  /** Take in a creature from another map (the wasteland was rebuilt around the hero, and encountered beasts follow). */
  adopt(creature: Creature, kind: CritterKind): void {
    creature.perception = kind.fighter.special.perception;
    creature.agility = kind.fighter.special.agility;
    creature.wanders = kind.bites;
    creature.talks = !kind.bites || isMutant(kind);
    setRunSpeed(creature, kind);
    this.befriend(creature, kind);
    this.creatures.push(creature);
    this.kindOf.set(creature, kind);
  }

  /** An ally on this map only (caravan guards, "Mysterious Stranger"): hits the hero's enemies, does not follow the hero. */
  addDefender(creature: Creature): void {
    creature.hostile = false;
    this.allies.add(creature);
    this.defenders.add(creature);
  }

  /** "Animal Friend" (ANIMAL_FRIEND): a beast is not the hero's enemy and wanders peacefully. Also the reaction to the hero follows turn order. */
  private befriend(creature: Creature, kind: CritterKind): void {
    // The hero is not ready yet (checks without a hero): the default.
    const hero = this.host.hero as Partial<Hero> | undefined;
    creature.reaction = reactionDelay(hero?.fighter?.sequence ?? 10, kind.fighter?.sequence ?? 10);
    if (!creature.hostile || !hero?.character || !perkRank(hero.character, PERK.animalFriend) || !ANIMAL_FRIEND.test(kind.soundBase.toUpperCase())) return;
    creature.hostile = false;
    creature.tame = true;
  }

  /** Where the hero stands on the original hex tile (not inside a wall); a hex beyond the edge of our map gives null. */
  tileSpot(tile: number, angle: number): Entry | null {
    const frame = this.def.hexFrame;
    if (!frame || tile < 0) return null;
    const at = hexCenter(frame, tile);
    if (at.x < 0 || at.y < 0 || at.x >= this.level.width || at.y >= this.level.height) return null;
    const spot = clearOfWalls(this.level, at.x, at.y);
    return { x: spot.x, y: spot.y, angle };
  }

  /** A critter came from another floor of this map (a script led it after the hero): now it lives here. */
  adoptResident(creature: Creature, kind: CritterKind, script: { name: string; key: string } | null, at: { x: number; y: number }, tile: number): void {
    if (!this.creatures.includes(creature)) this.adopt(creature, kind);
    const spot = clearOfWalls(this.level, at.x, at.y);
    creature.placeAt(spot.x, spot.y);
    if (script) this.scripts.set(creature, script);
    this.settle(creature, kind, script);
    this.standAt(creature, tile, spot.x, spot.y);
  }

  /** A critter was placed on hex tile but stood at (x, y); while it is there, it stands on tile as far as scripts are concerned. */
  standAt(creature: Creature, tile: number, x: number, y: number): void {
    this.standing.set(creature, { tile, x, y });
    // A script placed or led it: now its spot is there.
    this.homes.set(creature, { x, y });
  }

  /** The hex the critter was placed on, if it still stands where it was placed (if it moved, null). */
  standingTile(creature: Creature): number | null {
    const s = this.standing.get(creature);
    return s && Math.hypot(creature.x - s.x, creature.y - s.y) < STANDING_SLACK ? s.tile : null;
  }

  /** A creature's key on this map (the ID of a level object or a created one); none means it appeared during play or came with the hero. */
  keyOfCreature(creature: Creature): string | null {
    return this.keyOf.get(creature) ?? null;
  }

  /** A companion came to this map with the hero: stands next to the hero, with its script (the script key is the same as before). */
  adoptAlly(creature: Creature, kind: CritterKind, script: { name: string; key: string } | null, near: { x: number; y: number }): void {
    if (!this.creatures.includes(creature)) this.adopt(creature, kind);
    this.allies.add(creature);
    creature.hostile = false;
    creature.runSpeed = Math.max(creature.runSpeed, ALLY_RUN);
    if (script) this.scripts.set(creature, script);
    creature.placeNear(this.level, this.creatures, near);
  }

  /** A critter became a companion or stopped being one (party_add / party_remove). */
  setAlly(creature: Creature, ally: boolean): void {
    if (ally) {
      this.allies.add(creature);
      creature.hostile = false;
      creature.runSpeed = Math.max(creature.runSpeed, ALLY_RUN);
    } else {
      this.allies.delete(creature);
    }
  }

  /** A caravan person or brahmin travels with the hero through the wasteland: an ally, but does not follow the hero; it keeps its place in the formation. */
  addEscort(creature: Creature, kind: CritterKind, fights: boolean): void {
    if (!this.creatures.includes(creature)) this.adopt(creature, kind);
    this.allies.add(creature);
    this.defenders.add(creature);
    creature.hostile = false;
    this.escorts.set(creature, { x: creature.x, y: creature.y, heading: creature.facing, pace: 0, fights });
  }

  /** The place in the caravan formation this frame and the caravan's speed (0 means standing). */
  setEscortSpot(creature: Creature, x: number, y: number, heading: number, pace: number): void {
    const e = this.escorts.get(creature);
    if (!e) return;
    e.x = x;
    e.y = y;
    e.heading = heading;
    e.pace = pace;
  }

  /** A companion left with the hero: it is no longer on this map. */
  release(creature: Creature): void {
    const i = this.creatures.indexOf(creature);
    if (i >= 0) this.creatures.splice(i, 1);
    this.allies.delete(creature);
    this.defenders.delete(creature);
    this.escorts.delete(creature);
    this.orders.delete(creature);
    this.kiting.delete(creature);
    this.fleeUntil.delete(creature);
    this.knockedOut.delete(creature);
    this.scripts.delete(creature);
    this.floats.delete(creature);
  }

  /** A creature's kind (images, sounds, rules), for moving it to another map. */
  /** A companion changed weapons: its kind (images, sounds, rules) is now with this weapon. */
  setKind(creature: Creature, kind: CritterKind): void {
    if (this.kindOf.has(creature)) this.kindOf.set(creature, kind);
  }

  kindOfCreature(creature: Creature): CritterKind | undefined {
    return this.kindOf.get(creature);
  }

  /** An item appeared on the ground during play (a wasteland find). */
  async spawnItem(pid: number, count: number, x: number, y: number): Promise<void> {
    const proto = await this.host.res.item(pid);
    const sheet = await this.host.res.groundSprite(proto);
    const id = spawnedId++;
    this.pickups.push({ key: 's' + id, id, proto, count, x, y, taken: false, sheet });
  }

  /**
   * A special encounter in the wasteland (play.ts -> meetSpecial): original scenery as an image from the player's copy, without a script. Like
   * the original's random encounter map, it does not go into the save.
   */
  async placeScenery(pid: number, x: number, y: number): Promise<SceneProp | undefined> {
    const key = `e${spawnedId}`;
    await this.addProp(key, pid, -1, { x, y }, { name: '', key: `${this.def.id}:${key}` });
    const prop = this.props.find((p) => p.key === key);
    if (prop) prop.usable = false;
    return prop;
  }

  /** Special encounter: a container (small chest, bones) with items; locked means locked (opened with "Lockpick"). */
  async placeContainer(pid: number, x: number, y: number, items: readonly (readonly [number, number])[], locked = false): Promise<void> {
    const { res } = this.host;
    const proto = await res.item(pid);
    const at = this.openSpotNear({ x, y });
    const c: SceneContainer = {
      key: `e${spawnedId}`,
      id: spawnedId++,
      proto,
      x: at.x,
      y: at.y,
      inventory: new Inventory(),
      sheet: await res.groundSprite(proto).catch(() => null),
      locked,
      lockedAtStart: locked,
      jammed: false,
      knownLocked: false,
      opened: false,
      gone: false,
      hidden: false,
    };
    const art = res.data?.itemArtName?.(proto) ?? '';
    if (/bone|body|corps|dead/i.test(art)) c.flat = true;
    for (const [itemPid, count] of items) c.inventory.add(await res.item(itemPid), count);
    this.containers.push(c);
  }

  /**
   * The wasteland window was rebuilt (session.recenter): what was met along the way (beasts and squads, alive and dead, with items),
   * the "Mysterious Stranger", items on the ground, containers and scenery of special encounters, moves here shifted by dx, dy if
   * it falls into the new window. skip: who is moved differently (companions, the caravan).
   */
  async takeOver(from: Scene, dx: number, dy: number, skip: (c: Creature) => boolean): Promise<void> {
    const inside = (x: number, y: number) => x >= 1 && y >= 1 && x < this.level.width - 1 && y < this.level.height - 1;
    for (const c of from.creatures) {
      const kind = from.kindOf.get(c);
      if (from.indexOf(c) !== -1 || c.gone || !kind || skip(c) || !inside(c.x + dx, c.y + dy)) continue;
      if (from.allies.has(c) && !from.defenders.has(c)) continue;
      const wanders = c.wanders;
      c.placeAt(c.x + dx, c.y + dy);
      this.adopt(c, kind);
      c.wanders = wanders;
      if (from.defenders.has(c)) this.addDefender(c);
      const script = from.scripts.get(c);
      if (script) this.scripts.set(c, script);
    }
    for (const p of from.pickups) if (!p.taken && p.key.startsWith('s') && inside(p.x + dx, p.y + dy)) this.pickups.push({ ...p, x: p.x + dx, y: p.y + dy });
    for (const c of from.containers) if (!c.gone && c.key.startsWith('e') && inside(c.x + dx, c.y + dy)) this.containers.push({ ...c, x: c.x + dx, y: c.y + dy });
    // The huge footprint (pressFootprint): the same cells, shifted.
    const fw = from.level.width;
    for (const [cell, m] of from.level.floorMarks ?? []) {
      if (m.texture !== 'pressedSand') continue;
      const x = (cell % fw) + dx;
      const y = Math.floor(cell / fw) + dy;
      if (inside(x, y)) (this.level.floorMarks ??= new Map()).set(y * this.level.width + x, m);
    }
    // The huge footprint's ridge: the same blocks, shifted.
    for (const [cell, head] of from.level.blocks ?? []) {
      for (let b: Block | undefined = head; b; b = b.next) {
        if (!b.walkable) continue;
        const x = (cell % fw) + dx;
        const y = Math.floor(cell / fw) + dy;
        if (inside(x, y)) addBlock(this.level, y * this.level.width + x, { ...b, x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy, next: undefined });
      }
    }
    // Scenery is placed again (3D ones with their block in the new cell).
    for (const p of from.props) {
      if (p.gone || !p.key.startsWith('e') || !inside(p.x + dx, p.y + dy)) continue;
      await this.addProp(p.key, p.pid, -1, { x: p.x + dx, y: p.y + dy }, p.script);
      const moved = this.props.find((q) => q.key === p.key);
      if (moved) moved.usable = false;
    }
  }

  /**
   * A huge footprint on the ground (the "footprint" special encounter): a foot with a heel and three toes, about 13 cells long, toes pointing in
   * direction angle; the cells are trampled sand (floorMarks), and around them a low ridge of pushed-out sand (FOOT_RIM; client,
   * 2026-10-27: as a single floor drawing the footprint could not be read from eye level). The ridge does not block walking. It does not go into walls or onto other marks.
   */
  pressFootprint(x: number, y: number, angle: number): void {
    const { level } = this;
    const w = level.width;
    const marks = (level.floorMarks ??= new Map());
    // Parts of the footprint in their own axes (u along, toward the toes; v across): ellipses (center, semi-axes).
    const parts = [
      { u: -4, v: 0, a: 2.6, b: 2.4 },
      { u: 0, v: 0, a: 3.2, b: 2.6 },
      { u: 4.5, v: -2.4, a: 2.2, b: 1.1 },
      { u: 5.2, v: 0, a: 2.4, b: 1.1 },
      { u: 4.5, v: 2.4, a: 2.2, b: 1.1 },
    ];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let cy = Math.floor(y - 9); cy <= y + 9; cy++) {
      for (let cx = Math.floor(x - 9); cx <= x + 9; cx++) {
        if (cx < 1 || cy < 1 || cx >= w - 1 || cy >= level.height - 1) continue;
        const dx = cx + 0.5 - x;
        const dy = cy + 0.5 - y;
        const u = dx * cos + dy * sin;
        const v = -dx * sin + dy * cos;
        if (!parts.some((p) => ((u - p.u) / p.a) ** 2 + ((v - p.v) / p.b) ** 2 <= 1)) continue;
        const cell = cy * w + cx;
        if (wallAt(level, cx + 0.5, cy + 0.5) || marks.has(cell)) continue;
        marks.set(cell, { texture: 'pressedSand', turn: 0 });
      }
    }
    // The ridge: cells next to the footprint (on the sides) that are not footprint themselves.
    const inPrint = (cell: number) => marks.get(cell)?.texture === 'pressedSand';
    const rim = new Set<number>();
    for (const [cell] of marks) {
      if (!inPrint(cell)) continue;
      for (const n of [cell - 1, cell + 1, cell - w, cell + w]) if (!inPrint(n) && !marks.has(n)) rim.add(n);
    }
    // In a ridge cell, a strip FOOT_RIM.strip wide along each side that faces the footprint.
    const t = FOOT_RIM.strip;
    for (const cell of rim) {
      const cx = cell % w;
      const cy = Math.floor(cell / w);
      if (cx < 1 || cy < 1 || cx >= w - 1 || cy >= level.height - 1 || wallAt(level, cx + 0.5, cy + 0.5) || level.blocks?.has(cell)) continue;
      const height = FOOT_RIM.min + ((cx * 7 + cy * 13) % 5) * ((FOOT_RIM.max - FOOT_RIM.min) / 4);
      const sides: [number, number, number, number, 0 | 1 | 2 | 3][] = [
        [cell - 1, cx, cx + t, 0, 0],
        [cell + 1, cx + 1 - t, cx + 1, 0, 1],
        [cell - w, 0, 0, cy, 2],
        [cell + w, 0, 0, cy + 1 - t, 3],
      ];
      for (const [n, x0, x1, y0, facing] of sides) {
        if (!inPrint(n)) continue;
        const box = facing < 2 ? { x0, x1, y0: cy, y1: cy + 1 } : { x0: cx, x1: cx + 1, y0, y1: y0 + t };
        addBlock(level, cell, { ...box, height, front: 'sand', side: 'sand', top: 'sand', facing, fill: false, walkable: true });
      }
    }
  }

  /** Give a creature an original script (Bob the trader at a special encounter): E conversation goes through it. */
  attachScript(creature: Creature, name: string): void {
    this.scripts.set(creature, { name, key: `${this.def.id}:egg${creature.id}` });
  }

  /** A line above the head; an empty string removes it. */
  float(creature: Creature, text: string, color: string): void {
    if (!text.trim()) this.floats.delete(creature);
    else this.floats.set(creature, { text, color, time: FLOAT_SECONDS + text.length * 0.04 });
  }

  /** The map state for saving and for returning to it. */
  snapshot(): MapState {
    const state = emptyMapState();
    if (this.def.revision) state.revision = this.def.revision;
    for (const c of this.creatures) {
      // Those that appeared during play (encounters) do not go into the map state.
      const key = this.keyOf.get(c);
      if (!key) continue;
      state.creatures[key] = c.snapshot();
      if (!c.inventory.empty) state.corpseItems[key] = c.inventory.items.map((s) => [s.proto.pid, s.count]);
    }
    state.taken = this.pickups.filter((p) => p.taken && !p.key.startsWith('s')).map((p) => p.key);
    if (this.created.length) state.created = this.created.map((r) => ({ ...r }));
    const gone = this.props.filter((p) => p.gone && p.key.startsWith('s')).map((p) => p.key);
    if (gone.length) state.gone = gone;
    for (const d of this.doors) {
      if (d.door.open > 0) state.doors[d.key] = d.target;
      if (d.locked !== d.lockedAtStart) (state.locks ??= {})[d.key] = d.locked ? 1 : 0;
    }
    for (const c of this.containers) {
      (state.containers ??= {})[c.key] = c.inventory.items.map((s) => [s.proto.pid, s.count]);
      if (c.locked !== c.lockedAtStart) (state.locks ??= {})[c.key] = c.locked ? 1 : 0;
      if (c.gone) state.taken.push(c.key);
    }
    const seen = packSeen(this.seen, this.level.width);
    if (seen) state.seen = seen;
    return state;
  }

  update(dt: number, player: Player, firing: boolean, renderer: Renderer): SceneEvent {
    const { hero, res } = this.host;
    const { level } = this;
    const x0 = player.x;
    const y0 = player.y;
    // Creatures hidden and removed by scripts do not get in the way, are not visible and do nothing.
    const present = this.creatures.filter((c) => c.present);
    // You can pass through peaceful ones (not hostile to the hero, and companions) (client, 2026-10-23): a critter at a door or in a narrow
    // corridor no longer traps the hero. Enemies still block the way.
    // Staggered by a hit: stands still (hero.ts -> takeDamage).
    player.frozen = hero.stunLeft > 0;
    // In combat running and jumping cost AP (hero.ts -> RUN_AP, JUMP_AP): no AP means walking only; a crippled leg means slower,
    // without running or jumping.
    // Overloaded (hero.ts -> OVERLOAD): also no running or jumping, and slower.
    const heavy = hero.overloaded;
    if (heavy !== hero.overloadNoted) {
      hero.overloadNoted = heavy;
      this.host.say(t(heavy ? 'msgOverloaded' : 'msgUnloaded'));
    }
    player.canRun = !hero.crippledLeg && !heavy && (!hero.inCombat || hero.ap > 0.05);
    player.canJump = !hero.crippledLeg && !heavy && hero.canJump();
    player.speedScale = (hero.crippledLeg ? CRIPPLE.legSpeed : 1) * (heavy ? OVERLOAD.speed : 1);
    const jumps = player.jumps;
    player.update(dt, level, present.filter((c) => c.hostile && !this.allies.has(c)));
    if (player.jumps > jumps && hero.inCombat) hero.ap = Math.max(0, hero.ap - JUMP_AP);
    if (this.hitFrom) {
      this.hitFrom.time -= dt;
      if (this.hitFrom.time <= 0) this.hitFrom = null;
    }
    this.moving = Math.hypot(player.x - x0, player.y - y0) > 0.0005;
    if (this.moving) this.walkTime += dt;
    hero.exerting = this.moving && player.running;
    // Who the hero's crosshair is on (from the previous frame): an enemy aimed at for long leaps aside or hides (creature.ts -> DODGE).
    const aimable = !hero.holstered && !hero.melee && hero.alive;
    const living = new Set(present.filter((c) => c.alive && !this.allies.has(c)).map((c) => c.id));
    const aimed = aimable ? renderer.pickPoint(VIEW_W / 2, VIEW_H / 2, RES, (n) => living.has(n)) : null;
    for (const c of present) c.aimedAt = c.id === aimed ? c.aimedAt + dt : 0;

    this.time += dt;
    this.updateDoors(dt, player);
    this.updateCharges(dt, player);
    hero.inCombat = this.inCombat(player);
    // Enemy eyes: the light on the map and the hero's stealth (the "Sneak" skill while sneaking), what keeps them from noticing the hero.
    const target = {
      x: player.x,
      y: player.y,
      alive: hero.alive,
      light: lightOf(level),
      stealth: stealthFactor(player.sneaking, hero.fighter.skills[SKILL.sneak] ?? 0),
    };
    // "Ghost" (perk, as in the original's description): in darkness Sneak is 20% higher.
    if (target.light < GHOST.dark && perkRank(hero.character, PERK.ghost)) target.stealth = stealthFactor(player.sneaking, (hero.fighter.skills[SKILL.sneak] ?? 0) + GHOST.sneak);
    // The hero's footsteps are heard nearby (farther when running, not at all when sneaking).
    if (this.moving && !player.sneaking) this.noise(player.x, player.y, player.running ? NOISE.run : NOISE.walk, false);
    for (const c of present) {
      if (!this.allies.has(c) && c.alive && DEFENDER_SCRIPTS.has(this.scripts.get(c)?.name ?? '')) {
        this.allies.add(c);
        this.defenders.add(c);
        c.hostile = false;
      }
      if (this.allies.has(c)) {
        this.updateAlly(c, dt, player, present);
        continue;
      }
      // Fighting (with the hero or by script) with empty hands: takes a weapon from its inventory.
      if (c.alive && !c.weapon && (c.hostile || this.feuds.has(c))) this.armFromInventory(c);
      // A fight with another critter (not the hero's enemy): hits it; once the opponent has fallen or left, the fight is over.
      const foe = this.feuds.get(c);
      if (foe && (!foe.alive || !foe.present || !c.alive || c.hostile)) {
        this.feuds.delete(c);
        // The fight is over and it did not become the hero's enemy: stop "searching" for the opponent (otherwise it would go for the hero).
        if (!c.hostile) c.calm();
      }
      else if (foe) {
        this.fightFoe(c, foe, dt, player, present);
        continue;
      }
      // An enemy hits whoever is closer: the hero or the hero's companion (if the companion is visible).
      const ally = c.hostile && c.alive ? this.nearestAlly(c, Math.hypot(c.x - player.x, c.y - player.y)) : null;
      c.update(
        dt,
        level,
        ally ? { x: ally.x, y: ally.y, alive: true, light: target.light } : target,
        present,
        (cr) => (ally ? this.strikeCreature(cr, ally, player, false) : this.bite(cr, player)),
        (cr) => (ally ? this.strikeCreature(cr, ally, player, true) : this.fire(cr, player)),
        (cr) => this.host.say(tf('msgNpcHeal', { name: cr.stats.name })),
        (cr, x, y, grenade) => this.enemyGrenade(cr, x, y, grenade),
      );
      this.keepPlace(c, hero.inCombat);
      // Noticed the hero: shouts to its allies, and they run to where the hero is.
      if (c.takeNoticed()) this.alertAllies(c, player);
      const bark = c.takeBark();
      const said = bark ? `${this.teamOf(c)}:${bark}` : '';
      if (bark && this.time - (this.said.get(said) ?? -BARK_REPEAT) >= BARK_REPEAT) {
        this.said.set(said, this.time);
        const cls = barkClassOf(this.kindOf.get(c)?.soundBase ?? '', this.scripts.get(c)?.name ?? null);
        this.float(c, t(barkText(cls, bark, Math.random() < 0.5 ? 1 : 2)), BARK_COLOR);
      }
    }
    this.squadTime -= dt;
    if (this.squadTime <= 0) {
      this.squadTime = SQUAD_PERIOD;
      this.updateSquads(player);
    }
    for (const [c, f] of this.floats) {
      f.time -= dt;
      if (f.time <= 0 || !c.present || !c.alive) this.floats.delete(c);
    }
    if (firing) this.shoot(renderer, player);
    this.checkReloadSound();

    for (const p of this.pickups) {
      if (p.taken || Math.hypot(p.x - player.x, p.y - player.y) > PICKUP_RADIUS) continue;
      p.taken = true;
      hero.inventory.add(p.proto, p.count);
      const name = res.itemName(p.proto);
      this.host.say(p.count > 1 ? tf('msgPickupCount', { name, n: p.count }) : tf('msgPickup', { name }));
      res.sound.play(SFX.pickup);
    }

    if (!hero.alive) {
      res.sound.play(SFX.heroDeath);
      return { type: 'dead' };
    }
    const exit = isExit(level, player.x, player.y) ? this.walkExitAt(player.x, player.y) : null;
    return exit ? { type: 'travel', to: exit } : null;
  }

  /**
   * What is in front of the player: the nearest of the things E can act on. First, what the player is looking at; what is
   * right at their feet (not ahead) only if there is nothing ahead: standing in a lift facing the door, E opens the door instead of
   * calling the lift again (client, 2026-10-25: there was no way out of the Brotherhood of Steel booth).
   */
  focus(player: Player): Focus {
    let best: Focus = null;
    let bestDist = Infinity;
    let near: Focus = null;
    let nearDist = Infinity;
    // extra: added to the distance when choosing: a searched corpse yields to its neighbor (client, 2026-10-27: from a pile of corpses
    // E kept opening the top, already empty one, and the items of the lower ones were out of reach).
    const consider = (x: number, y: number, reach: number, make: () => Focus, extra = 0) => {
      const real = Math.hypot(x - player.x, y - player.y);
      if (real > reach) return;
      const dist = real + extra;
      let rel = Math.atan2(y - player.y, x - player.x) - player.angle;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const ahead = Math.abs(rel) <= 0.7 && real > UNDERFOOT;
      if (ahead) {
        if (dist >= bestDist) return;
        best = make();
        bestDist = dist;
      } else if (real <= 0.6 && dist < nearDist) {
        near = make();
        nearDist = dist;
      }
    };
    for (const d of this.doors) consider(d.door.cx + 0.5, d.door.cy + 0.5, REACH, () => ({ kind: 'door', door: d }));
    // Scenery in the same cell as an "E" exit (the Necropolis stairs): E goes to the exit.
    const exitCell = (x: number, y: number) => this.useExits.some((e) => Math.floor(e.x) === Math.floor(x) && Math.floor(e.y) === Math.floor(y));
    // Scenery next to a critter yields to the critter (client, 2026-10-27: the Overseer has a computer in the same cell, E turned on
    // the computer and there was no way to talk).
    // A large item (a casino table): measured from the edge nearest to the hero, not from the middle.
    for (const p of this.props) {
      if (p.hidden || p.usable === false || exitCell(p.x, p.y)) continue;
      const b = p.copies ? p.block : undefined;
      const x = b ? Math.min(b.x1, Math.max(b.x0, player.x)) : p.x;
      const y = b ? Math.min(b.y1, Math.max(b.y0, player.y)) : p.y;
      consider(x, y, REACH + 0.3, () => ({ kind: 'prop', prop: p }), PROP_YIELDS);
    }
    for (const c of this.containers) if (!c.gone && !c.hidden) consider(c.x, c.y, REACH, () => ({ kind: 'container', container: c }));
    for (const e of this.useExits) consider(e.x, e.y, REACH + 0.2, () => ({ kind: 'exit', exit: e }));
    for (const el of this.elevators) {
      consider(el.x, el.y, REACH, () => ({ kind: 'elevator', elevator: el }));
      if (el.front) consider(el.front.x, el.front.y, REACH, () => ({ kind: 'elevator', elevator: el }));
    }
    for (const c of this.creatures) {
      if (!c.present) continue;
      if (c.alive && !c.hostile) consider(c.x, c.y, TALK_REACH, () => ({ kind: 'npc', creature: c }));
      if (!c.alive) consider(c.x, c.y, 1.4, () => ({ kind: 'corpse', creature: c }), c.inventory.empty ? 2 : 0);
    }
    // Scenery without an action (lamps): only if there is nothing else nearby.
    if (!best && !near) for (const p of this.props) if (!p.hidden && p.usable === false) consider(p.x, p.y, REACH + 0.3, () => ({ kind: 'prop', prop: p }));
    return best ?? near;
  }

  /** Hint label for whatever is in front of the player. */
  prompt(focus: Focus): string | null {
    if (!focus) return null;
    switch (focus.kind) {
      case 'door':
        if (focus.door.knownLocked && (focus.door.locked || focus.door.script)) return t('promptPickLock');
        return t(focus.door.target === 1 ? 'promptDoorClose' : 'promptDoorOpen');
      case 'container':
        if (focus.container.knownLocked && (focus.container.locked || focus.container.script)) return t('promptPickLock');
        return tf('promptOpen', { name: this.host.res.itemName(focus.container.proto) });
      case 'prop':
        return tf('promptUseThing', { name: focus.prop.name || t('promptThing') });
      case 'exit':
        return t('promptEnter');
      case 'elevator':
        return t('promptElevator');
      case 'npc':
        return tf('promptTalk', { name: focus.creature.stats.name });
      case 'corpse':
        return tf('promptSearch', { name: focus.creature.stats.name });
    }
  }

  /** E was pressed. */
  use(player: Player): SceneEvent {
    const focus = this.focus(player);
    if (!focus) return null;
    switch (focus.kind) {
      case 'door': {
        const d = focus.door;
        // Locked (or the door's script refused) and the hero already knows it: E tries to pick the lock.
        const pick = d.knownLocked && (d.locked || !!d.script);
        // A door with an original script: the script decides first (the game calls it and then, if it does not object, the regular action).
        if (d.script) return { type: 'door', door: d, pick };
        if (pick) return { type: 'pick', door: d };
        this.operateDoor(d);
        return null;
      }
      case 'container': {
        const c = focus.container;
        const pick = c.knownLocked && (c.locked || !!c.script);
        if (c.script) return { type: 'container', container: c, pick };
        if (pick) return { type: 'pick', container: c };
        return this.operateContainer(c) ? { type: 'open', name: this.host.res.itemName(c.proto), inventory: c.inventory } : null;
      }
      case 'prop':
        return { type: 'prop', prop: focus.prop };
      case 'exit':
        return { type: 'travel', to: focus.exit.to };
      case 'elevator':
        return { type: 'elevator', elevator: focus.elevator };
      case 'npc':
        return { type: 'talk', creature: focus.creature };
      case 'corpse':
        return { type: 'loot', creature: focus.creature };
    }
  }

  billboards(player: Player): Billboard[] {
    const list = this.creatures.filter((c) => c.present).map((c) => {
      if (!c.corpse) return c.billboard(player);
      // A corpse lies on the floor rather than standing as an image in midair (client, 2026-10-21: corpses blocked the view), and lies as
      // it fell: the image is chosen and laid down for someone looking from the south (FLAT_VIEW), not for the player.
      const b = c.billboard({ ...player, x: c.x - Math.cos(FLAT_VIEW), y: c.y - Math.sin(FLAT_VIEW), angle: FLAT_VIEW });
      b.flat = true;
      b.angle = FLAT_VIEW;
      return b;
    });
    for (const p of this.pickups) {
      if (p.taken) continue;
      const frame = p.sheet.directions[0]?.[0];
      if (!frame) continue;
      const shift = p.sheet.shifts[0] ?? { x: 0, y: 0 };
      list.push({ id: p.id, x: p.x, y: p.y, frame, shiftX: shift.x, shiftY: shift.y });
    }
    // Decor farther than DECOR_RANGE cells is not drawn: small things are barely visible there, and there are hundreds of images.
    for (const d of this.decor) {
      if ((d.x - player.x) ** 2 + (d.y - player.y) ** 2 > DECOR_RANGE * DECOR_RANGE) continue;
      const frame = d.sheet.directions[0]?.[0];
      if (!frame) continue;
      const shift = d.sheet.shifts[0] ?? { x: 0, y: 0 };
      list.push({ id: d.id, x: d.x, y: d.y, frame, shiftX: shift.x, shiftY: shift.y, ...(d.flat ? { flat: true, angle: FLAT_VIEW } : {}) });
    }
    for (const p of this.props) {
      // A visible force field is drawn as its cell's wall, a terminal as a block, not as an image.
      const frame = p.hidden || p.field || p.block ? undefined : p.sheet?.directions[0]?.[0];
      if (!frame) continue;
      const shift = p.sheet!.shifts[0] ?? { x: 0, y: 0 };
      list.push({ id: p.id, x: p.x, y: p.y, frame, shiftX: shift.x, shiftY: shift.y });
    }
    for (const c of this.charges) {
      const frame = c.sheet?.directions[0]?.[0];
      if (!frame) continue;
      const shift = c.sheet!.shifts[0] ?? { x: 0, y: 0 };
      // In flight: an arc from the thrower to the landing spot.
      if (c.from && c.flown < c.from.flight) {
        const t = c.flown / c.from.flight;
        const z = 0.45 * (1 - t) + (c.thrown ? 0.3 : 1.6) * t * (1 - t);
        list.push({ id: c.id, x: c.from.x + (c.x - c.from.x) * t, y: c.from.y + (c.y - c.from.y) * t, frame, shiftX: shift.x, shiftY: shift.y - z / SPRITE_SCALE });
        continue;
      }
      list.push({ id: c.id, x: c.x, y: c.y, frame, shiftX: shift.x, shiftY: shift.y });
    }
    for (const f of this.groundFlares) {
      const frame = f.sheet?.directions[0]?.[0];
      if (!frame) continue;
      const shift = f.sheet!.shifts[0] ?? { x: 0, y: 0 };
      list.push({ id: f.id, x: f.x, y: f.y, frame, shiftX: shift.x, shiftY: shift.y });
    }
    for (const c of this.containers) {
      const frame = c.gone || c.hidden || c.block ? undefined : c.sheet?.directions[0]?.[0];
      if (!frame) continue;
      const shift = c.sheet!.shifts[0] ?? { x: 0, y: 0 };
      list.push({ id: c.id, x: c.x, y: c.y, frame, shiftX: shift.x, shiftY: shift.y, ...(c.flat ? { flat: true, angle: FLAT_VIEW } : {}) });
    }
    for (const e of this.effects) list.push(effectBillboard(e));
    return list;
  }

  /** Reload (R); ammo: the ammo chosen in the inventory, load exactly that (the previous rounds go back to the inventory). */
  reload(ammo: ItemProto | null = null): void {
    const { hero, res } = this.host;
    const before = hero.loadedAmmoPid;
    const result = hero.reload(ammo);
    if (result === 'noAp') this.host.say(tf('msgNoAp', { n: formatDecimal(this.host.hero.apCost(AP_COST.reload)) }));
    else if (result === 'wrong' || (ammo && result === 'no' && hero.weapon.capacity <= 0)) this.host.say(tf('msgAmmoWrong', { name: res.itemName(ammo!) }));
    else if (result === 'no' && hero.reserve <= 0 && hero.magazine === 0) this.host.say(t('msgNoAmmo'));
    else if (result === 'started' && hero.reloadingWith && hero.reloadingWith.pid !== before) this.host.say(tf('msgAmmoSwitch', { name: res.itemName(hero.reloadingWith) }));
  }

  /** free: from the open inventory; the AP for opening it have already been paid. */
  useStimpak(free = false): void {
    const { hero, res } = this.host;
    const result = hero.useStimpak(free);
    if (result === 'none') this.host.say(t('msgNoStimpak'));
    else if (result === 'full') this.host.say(t('msgFullHp'));
    else if (result === 'noAp') this.host.say(tf('msgNoAp', { n: formatDecimal(this.host.hero.apCost(AP_COST.useItem)) }));
    else this.host.say(tf('msgHeal', { name: res.itemName(res.loadout.stimpak), n: result }));
  }

  /** Combat goes on while at least one living enemy nearby is chasing the hero. */
  private inCombat(player: Player): boolean {
    return this.creatures.some((c) => c.present && c.alive && c.hostile && c.chasing && !this.allies.has(c) && Math.hypot(c.x - player.x, c.y - player.y) < COMBAT_RANGE);
  }

  private walkExitAt(x: number, y: number): Destination | null {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (const o of this.parsed.objects) {
      if (o.kind === 'exit' && !o.use && Math.floor(o.x) === cx && Math.floor(o.y) === cy) return o.to;
    }
    return null;
  }

  /** Someone stands in the doorway: we do not close the door. */
  private doorBusy(d: SceneDoor, player: Player): boolean {
    const cx = d.door.cx + 0.5;
    const cy = d.door.cy + 0.5;
    if (Math.hypot(player.x - cx, player.y - cy) < 0.75) return true;
    return this.creatures.some((c) => c.alive && Math.hypot(c.x - cx, c.y - cy) < 0.75);
  }

  private updateDoors(dt: number, player: Player): void {
    // A critter walking a path through a door opens it itself (not a locked one: then it stands a while and abandons the path). Beasts (brahmin,
    // dogs) do not open doors, as in the original: the brahmin script leads it around at random, and it used to leave the pen through the gate.
    for (const c of this.creatures) {
      const next = c.present && c.alive ? c.waypoint : null;
      if (!next || Math.hypot(c.x - next.x, c.y - next.y) > 1.6) continue;
      const kind = this.kindOf.get(c);
      if (kind?.bites && !isMutant(kind)) continue;
      const d = this.doors.find((one) => one.door.cx === Math.floor(next.x) && one.door.cy === Math.floor(next.y));
      if (!d || d.locked || d.target === 1) continue;
      d.target = 1;
      d.closeIn = DOOR_AUTOCLOSE;
      this.host.res.sound.playAt(doorSfx('O', d.sound), d.door.cx + 0.5, d.door.cy + 0.5, player);
    }
    for (const d of this.doors) {
      const { door } = d;
      if (door.open < d.target) door.open = Math.min(1, door.open + DOOR_SPEED * dt);
      else if (door.open > d.target) {
        // A closing door does not pinch anyone: if someone is in the doorway, it opens again.
        if (door.open < DOOR_PASSABLE + 0.15 && this.doorBusy(d, player)) d.target = 1;
        else door.open = Math.max(0, door.open - DOOR_SPEED * dt);
      }
      if (d.target === 1 && door.open >= 1) {
        d.closeIn -= dt;
        if (d.closeIn <= 0 && !this.doorBusy(d, player)) {
          d.target = 0;
          this.host.res.sound.playAt(doorSfx('C', d.sound), door.cx + 0.5, door.cy + 0.5, player);
        }
      }
    }
    for (const gate of this.gates) this.swingGate(gate);
  }

  private soundOf(c: Creature): string {
    return this.kindOf.get(c)?.soundBase ?? '';
  }

  /** A creature's fighter (by prototype); if for some reason there is no kind, by its numbers in the level. */
  private fighterOf(c: Creature): Fighter {
    const kind = this.kindOf.get(c);
    if (kind) return kind.fighter;
    return {
      special: { strength: 5, perception: 5, endurance: 5, charisma: 5, intelligence: 5, agility: 5, luck: 5 },
      skills: [],
      maxHp: c.stats.maxHp,
      ac: c.stats.ac,
      armor: c.stats.armor,
      critChance: 0,
      critPower: 2,
      maxAp: 5,
      meleeDamage: 1,
      healingRate: 1,
    };
  }

  /** The companion nearest to the enemy, if it is closer than the hero and visible. */
  private nearestAlly(enemy: Creature, heroDist: number): Creature | null {
    let best: Creature | null = null;
    let bestDist = heroDist;
    for (const a of this.allies) {
      if (!a.alive || !a.present) continue;
      const d = Math.hypot(a.x - enemy.x, a.y - enemy.y);
      if (d < bestDist && lineOfSight(this.level, enemy.x, enemy.y, a.x, a.y)) {
        best = a;
        bestDist = d;
      }
    }
    return best;
  }

  /**
   * Companion: an enemy nearby and visible, it hits it by the common rules; no enemies, it follows the hero (no slower than the hero). In the wasteland
   * it does not join combat until the hero attacks: it keeps going with the hero.
   */
  private updateAlly(c: Creature, dt: number, player: Player, present: Creature[]): void {
    const escort = this.escorts.get(c);
    let enemy: Creature | null = null;
    const companion = !escort && !this.defenders.has(c);
    // Unconscious: lies there; gets up when it has lain long enough and there are no enemies nearby.
    if (c.unconscious) {
      if (!this.knockedOut.has(c)) {
        this.knockedOut.add(c);
        this.host.say(tf('msgCompanionOut', { name: c.stats.name }));
      }
      const out = c.lieOut(dt);
      const danger = present.some((e) => e !== c && !this.allies.has(e) && e.alive && e.hostile && Math.hypot(e.x - c.x, e.y - c.y) < KNOCKOUT.safe);
      if (out >= KNOCKOUT.min && !danger) {
        c.wake();
        this.knockedOut.delete(c);
        this.host.say(tf('msgCompanionUp', { name: c.stats.name }));
      }
      return;
    }
    c.knockoutGuard = companion && this.def.id === WASTELAND;
    // The hero runs away: the companion drops the fight and runs after the hero.
    const heroSpeed = Math.hypot(player.vx, player.vy);
    const away = (player.x - c.x) * player.vx + (player.y - c.y) * player.vy;
    if (companion && heroSpeed >= FLEE.speed && away > 0 && Math.hypot(player.x - c.x, player.y - c.y) > FLEE.gap) this.fleeUntil.set(c, this.time + FLEE.hold);
    const fleeing = companion && (this.fleeUntil.get(c) ?? -Infinity) > this.time;
    const holdFire = companion && this.def.id === WASTELAND && this.host.hero.sinceAttack > WASTELAND_JOIN_FIGHT;
    let best = (escort && !escort.fights) || holdFire || fleeing ? 0 : ALLY_SIGHT;
    for (const e of present) {
      if (e === c || this.allies.has(e) || !e.alive || !e.hostile) continue;
      const d = Math.hypot(e.x - c.x, e.y - c.y);
      if (d < best && lineOfSight(this.level, c.x, c.y, e.x, e.y)) {
        enemy = e;
        best = d;
      }
    }
    if (!enemy || !c.alive) {
      c.hostile = false;
      const orders = this.orders.get(c);
      if (escort) c.march(dt, this.level, present, escort, escort.heading, escort.pace);
      // "Wait here": returns to the place where it was told to wait and stands there.
      else if (orders?.wait) c.followLeader(dt, this.level, present, orders.wait, 0.4);
      else if (!this.defenders.has(c)) c.followLeader(dt, this.level, present, player, orders?.far ? ALLY_FAR : ALLY_NEAR, Math.hypot(player.vx, player.vy));
      return;
    }
    c.hostile = true;
    const foe = enemy;
    // A shooter keeps its distance: backs off from a melee fighter, approaches from afar up to its range without a penalty.
    if (companion && c.ranged) {
      const d = Math.hypot(foe.x - c.x, foe.y - c.y);
      const backed = this.kiting.get(c) ?? 0;
      const canOutrun = foe.runSpeed * foe.limp < c.runSpeed * c.limp;
      if (!foe.ranged && canOutrun && d < ALLY_KEEP && backed < KITE.back && c.backOff(dt, this.level, present, foe, c.runSpeed)) {
        this.kiting.set(c, backed + dt);
        return;
      }
      this.kiting.set(c, Math.max(0, backed - dt * KITE.refill));
      // Its range is by Perception, but no farther than the weapon reaches (a throwing knife does not fly far).
      const reach = Math.min(c.perception, c.weapon?.range ?? Infinity);
      if (d > Math.max(ALLY_KEEP + 0.5, reach) && c.closeIn(dt, this.level, present, foe, c.runSpeed)) return;
    }
    c.update(
      dt,
      this.level,
      { x: foe.x, y: foe.y, alive: foe.alive, light: 1, stealth: 1 },
      present,
      (cr) => this.strikeCreature(cr, foe, player, false),
      (cr) => this.strikeCreature(cr, foe, player, true),
      (cr) => this.host.say(tf('msgNpcHeal', { name: cr.stats.name })),
    );
    if (c.takeRanOut()) this.host.companionRanOut?.(c);
  }

  /**
   * A peaceful critter stays in its place, as in the original: if combat drove it off (ran from shots, went to look, fought by
   * script), once everything has quieted down (RETURN_CALM seconds without shots or combat), it walks back and stands as it stood. If it is walking by
   * script, searching, or strolling (extras), we do not interfere.
   */
  private keepPlace(c: Creature, fighting: boolean): void {
    if (c.hostile || !c.alive || !c.present || c.roamHome) return;
    const home = this.homes.get(c);
    if (!home) {
      this.homes.set(c, { x: c.x, y: c.y, facing: c.facing });
      return;
    }
    const calm = !fighting && this.time - this.lastLoud >= RETURN_CALM;
    // Went to see where the shots came from and cannot get there: it has been quiet for a long time, so it stops searching.
    if (c.searching && calm && this.time - this.lastLoud >= 2 * RETURN_CALM) c.calm();
    if (c.waypoint || c.searching) return;
    if (Math.hypot(c.x - home.x, c.y - home.y) <= HOME_SLACK) {
      if (this.returning.delete(c) && home.facing !== undefined) c.turnTo(home.facing);
      return;
    }
    if (!calm || (this.homeRetry.get(c) ?? -Infinity) > this.time) return;
    this.homeRetry.set(c, this.time + HOME_RETRY);
    if (c.walkTo(home.x, home.y, false, this.level)) {
      this.returning.add(c);
      return;
    }
    // The spot itself cannot be reached (the critter stood in a cell with a container and got blocked): stand right next to it; now the spot is there.
    const cx = Math.floor(home.x);
    const cy = Math.floor(home.y);
    const near: { x: number; y: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) near.push({ x: cx + dx + 0.5, y: cy + dy + 0.5 });
    near.sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y));
    for (const spot of near) {
      if (!c.walkTo(spot.x, spot.y, false, this.level)) continue;
      this.homes.set(c, { ...spot, ...(home.facing !== undefined ? { facing: home.facing } : {}) });
      this.returning.add(c);
      return;
    }
  }

  /** Whether the map has peaceful critters (with a script, alive, not the hero's enemies and not companions): a town, not a lair. */
  hasPeaceful(): boolean {
    return this.creatures.some((c) => c.present && c.alive && !c.hostile && !this.allies.has(c) && this.scripts.has(c));
  }

  /** Whether a critter is fighting another critter (a scripted fight is still going on). */
  inFight(c: Creature): boolean {
    return this.feuds.has(c);
  }

  /** A critter attacks another (attack by script); the other fights back if it is not a companion and not the hero's enemy. */
  startFight(attacker: Creature, victim: Creature): void {
    if (attacker === victim || !attacker.alive || !victim.alive || this.allies.has(attacker)) return;
    this.feuds.set(attacker, victim);
    if (!this.allies.has(victim) && !victim.hostile && !this.feuds.has(victim)) this.feuds.set(victim, attacker);
  }

  /**
   * A turn in a fight between critters: like combat with the hero, only the target is the opponent; the critter does not become the hero's enemy because of this. It
   * knows its opponent even without seeing them (to the side or behind): the script told it to attack, and whoever is attacked knows who attacked.
   */
  private fightFoe(c: Creature, foe: Creature, dt: number, player: Player, present: Creature[]): void {
    c.hostile = true;
    c.engage();
    c.update(
      dt,
      this.level,
      { x: foe.x, y: foe.y, alive: foe.alive, light: 1, stealth: 1 },
      present,
      (cr) => this.strikeCreature(cr, foe, player, false),
      (cr) => this.strikeCreature(cr, foe, player, true),
      (cr) => this.host.say(tf('msgNpcHeal', { name: cr.stats.name })),
    );
    c.hostile = false;
  }

  /**
   * A hit or shot by one creature at another (a companion at an enemy, an enemy at a companion): the same rules as in combat with
   * the hero: chance by skill and distance, damage, armor. A kill by a companion gives the hero no experience (as in the original).
   * The wounded one becomes the hero's enemy only if the hero's companion wounded it (not in a fight between critters).
   */
  private strikeCreature(attacker: Creature, victim: Creature, player: Player, ranged: boolean): void {
    const { res } = this.host;
    const w = attacker.weapon;
    if (ranged && !w) return;
    if (ranged && w) {
      res.sound.playAt(w.sound, attacker.x, attacker.y, player);
      this.noise(attacker.x, attacker.y, NOISE.shot, true, attacker);
    } else {
      res.sound.playAt(w && !w.melee ? this.soundOf(attacker) + 'AQ' : (w?.sound ?? this.soundOf(attacker) + 'AQ'), attacker.x, attacker.y, player);
    }
    if (!victim.alive) return;
    const fighter = this.fighterOf(attacker);
    const dist = Math.hypot(attacker.x - victim.x, attacker.y - victim.y);
    const skill = ranged && w ? w.skill : attacker.stats.skill;
    const ammo = ranged && w ? w.ammo : undefined;
    if (Math.random() * 100 >= chanceToHit(fighter, skill, this.fighterOf(victim), dist, ammo?.acModifier ?? 0)) return;
    const dmg = Math.max(1, strike(fighter, ranged && w ? w.damage : attacker.stats.damage, this.fighterOf(victim), Math.random, ammo).damage);
    const killed = victim.hurt(dmg, this.allies.has(attacker));
    this.noteHit(victim, attacker);
    res.sound.playAt(this.soundOf(victim) + (killed ? 'BA' : 'AO'), victim.x, victim.y, player);
    if (!killed) victim.alertTo(attacker.x, attacker.y);
    if (this.allies.has(victim)) this.host.say(tf('msgAllyHurt', { name: victim.stats.name, dmg }));
    if (killed) {
      this.manDown(victim);
      // A companion (not caravan guards) killed an enemy: experience to the party, as for a kill by the hero.
      const companion = this.allies.has(attacker) && !this.defenders.has(attacker) && !this.allies.has(victim);
      if (companion && this.host.shareExperience) {
        this.host.hero.kills += 1;
        const xp = this.host.shareExperience(victim.stats.experience);
        this.host.say(tf('msgAllyKillXp', { name: victim.stats.name, ally: attacker.stats.name, xp: xp.gained }));
        if (xp.levels > 0) this.host.say(tf('msgLevelUp', { level: this.host.hero.level }));
      } else this.host.say(tf(this.allies.has(victim) ? 'msgAllyDown' : 'msgAllyKill', { name: victim.stats.name, ally: attacker.stats.name }));
    }
  }

  /** Experience for a kill by the hero: to everyone in the party (host.shareExperience), without a party to the hero. */
  private gainKill(points: number): { gained: number; levels: number } {
    return this.host.shareExperience ? this.host.shareExperience(points) : this.host.hero.addExperience(points);
  }

  private bite(c: Creature, player: Player): void {
    const { hero, res } = this.host;
    res.sound.playAt(c.weapon && !c.weapon.melee ? this.soundOf(c) + 'AQ' : (c.weapon?.sound ?? this.soundOf(c) + 'AQ'), c.x, c.y, player);
    const attacker = this.fighterOf(c);
    const dist = Math.hypot(c.x - player.x, c.y - player.y);
    // An agile hero sometimes dodges a bite or a melee hit (not bullets).
    if (Math.random() * 100 < meleeDodge(hero.fighter.special.agility)) {
      this.host.say(tf('msgDodge', { name: c.stats.name }));
      return;
    }
    if (Math.random() * 100 < chanceToHit(attacker, c.stats.skill, hero.fighter, dist)) {
      const hit = strike(attacker, c.stats.damage, hero.fighter);
      const dmg = Math.max(1, hit.damage);
      const limb = hero.takeDamage(dmg, { critical: hit.critical });
      if (limb) this.host.say(t(limb === 'arm' ? 'msgCrippledArm' : 'msgCrippledLeg'));
      if (hero.alive) res.sound.play(SFX.heroHurt, 0.8);
      this.hitFrom = {
        angle: Math.atan2(c.y - player.y, c.x - player.x),
        near: Math.hypot(c.x - player.x, c.y - player.y) < 1.2,
        time: 1,
      };
      this.host.say(tf(this.kindOf.get(c)?.bites ? 'msgBitten' : 'msgStruck', { name: c.stats.name, dmg }));
    } else {
      this.host.say(tf('msgCritterMiss', { name: c.stats.name }));
    }
  }

  /**
   * Noise: whoever hears it reacts (enemies go to check, guards go to look, peaceful ones run away).
   * Through walls it is heard at half the distance. source: the one making the noise (it does not hear itself); without it the hero makes the noise, and guards
   * do not come running at it (Creature.hear -> byHero).
   */
  noise(x: number, y: number, radius: number, loud: boolean, source?: Creature): void {
    if (loud) this.lastLoud = this.time;
    for (const c of this.creatures) {
      // A companion neither runs toward nor scatters from a noise: it is with the hero.
      if (c === source || !c.alive || !c.present || this.allies.has(c)) continue;
      // Beasts hear from closer than humans (client, 2026-10-21: every beast in the area came running at a shot).
      const kind = this.kindOf.get(c);
      const r = kind?.bites && !isMutant(kind) ? radius * BEAST_HEARING : radius;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d > r) continue;
      if (d > r / 2 && !lineOfSight(this.level, c.x, c.y, x, y)) continue;
      c.hear(x, y, loud, this.level, !source);
    }
  }

  /** Alarm: whoever noticed the hero calls its allies (beasts call a pack of the same kind within 6 cells, humans call humans within 12). */
  private alertAllies(caller: Creature, player: Player): void {
    const team = this.teamOf(caller);
    const callerKind = this.kindOf.get(caller);
    const reach = callerKind?.bites && !isMutant(callerKind) ? 12 * BEAST_HEARING : 12;
    // A squad with a leader rises as a whole, no matter how far it has spread (the leader shouts into the radio, the mother calls the pack).
    const squad = caller.leader ?? caller;
    for (const c of this.creatures) {
      if (c === caller || !c.alive || !c.present || !c.hostile || this.allies.has(c)) continue;
      const same = c === squad || (c.leader !== null && c.leader === squad);
      if (same) c.alertTo(player.x, player.y);
      else if (this.teamOf(c) === team && Math.hypot(c.x - caller.x, c.y - caller.y) <= reach) c.alertTo(player.x, player.y);
    }
  }

  /**
   * Squad and pack (AI-3): the one nearest to the hero pins the hero down with fire (beasts charge), the rest come from the side
   * if they stand on the same side. Humans assign roles among the shooters, beasts among all of them.
   */
  private updateSquads(player: Player): void {
    const teams = new Map<string, Creature[]>();
    for (const c of this.creatures) {
      c.role = null;
      if (!c.alive || !c.present || !c.hostile || !c.chasing || this.allies.has(c) || (c.talks && !c.ranged)) continue;
      const team = this.teamOf(c);
      teams.set(team, [...(teams.get(team) ?? []), c]);
    }
    const dist = (c: Creature) => Math.hypot(c.x - player.x, c.y - player.y);
    for (const members of teams.values()) {
      if (members.length < 2) continue;
      members.sort((a, b) => dist(a) - dist(b));
      const lead = members[0]!;
      lead.role = 'suppress';
      const base = Math.atan2(lead.y - player.y, lead.x - player.x);
      // How many are already flanking left and right, so they split evenly.
      const sides = { left: 0, right: 0 };
      for (const c of members.slice(1)) {
        c.role = 'flank';
        const turn = Math.atan2(c.y - player.y, c.x - player.x) - base;
        const left = Math.sin(turn) < 0;
        // Already to the side of the first one (more than 60 degrees): no need to flank.
        if (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > Math.PI / 3 || !c.readyToFlank) {
          if (c.plan === 'flank') sides[left ? 'left' : 'right']++;
          continue;
        }
        const goLeft = left ? sides.left <= sides.right : sides.left < sides.right;
        sides[goLeft ? 'left' : 'right']++;
        const side: -1 | 1 = goLeft ? -1 : 1;
        const reach = c.talks ? Math.min((c.weapon?.range ?? 6) * 0.8, 8) : 3.5;
        const spot = findFlank(this.level, c, player, lead, side, reach);
        if (spot) c.flankTo(spot, side);
      }
    }
  }

  /** One of their own was killed: the nearest ally (humans) shouts about it. */
  private manDown(dead: Creature): void {
    this.leaderDown(dead);
    const kind = this.kindOf.get(dead);
    if (kind) this.host.creatureKilled?.(dead, kind.pid);
    if (kind && this.host.hero.character.traits.includes(TRAIT.bloodyMess)) this.bloodyMess(dead, kind);
    // "Scrounger" (perk, as in the original's description, "in random encounters"): a kill in the wasteland has twice as much ammo.
    if (this.def.id === WASTELAND && !this.allies.has(dead) && perkRank(this.host.hero.character, PERK.scrounger)) {
      for (const st of [...dead.inventory.items]) if (st.proto.type === ITEM_TYPE.ammo) dead.inventory.add(st.proto, st.count);
    }
    const team = this.teamOf(dead);
    let near: Creature | null = null;
    for (const c of this.creatures) {
      if (c === dead || !c.alive || !c.present || !c.hostile || !c.talks || this.allies.has(c) || this.teamOf(c) !== team) continue;
      if (Math.hypot(c.x - dead.x, c.y - dead.y) > 12) continue;
      if (!near || Math.hypot(c.x - dead.x, c.y - dead.y) < Math.hypot(near.x - dead.x, near.y - dead.y)) near = c;
    }
    near?.bark('manDown', true);
  }

  /**
   * A squad leader died (client, 2026-10-27): humans and mutants waver, each with chance LEADER_DOWN.panic flees
   * for a few seconds; beasts that lost their mother, on the contrary, fly into a rage.
   */
  private leaderDown(dead: Creature): void {
    for (const c of this.creatures) {
      if (c.leader !== dead) continue;
      c.leader = null;
      if (!c.alive) continue;
      if (!c.talks) c.enrage();
      else if (Math.random() < LEADER_DOWN.panic) c.breakMorale(LEADER_DOWN.min + Math.random() * (LEADER_DOWN.max - LEADER_DOWN.min));
    }
  }

  /** "Bloody Mess" (BLOODY): a horrible death, blood all around, the weak among the allies flee. */
  private bloodyMess(dead: Creature, kind: CritterKind): void {
    void this.host.res.goreDeath(kind.pid).then((sheet) => sheet && dead.gore(sheet));
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.6;
      this.addEffect('blood', dead.x + Math.cos(a) * r, dead.y + Math.sin(a) * r, 0.2 + Math.random() * 0.4, 0.5 + Math.random() * 0.5, 0.6);
    }
    const team = this.teamOf(dead);
    for (const c of this.creatures) {
      if (c === dead || !c.alive || !c.present || !c.hostile || this.allies.has(c) || this.teamOf(c) !== team) continue;
      if (Math.hypot(c.x - dead.x, c.y - dead.y) > BLOODY.near || !lineOfSight(this.level, c.x, c.y, dead.x, dead.y)) continue;
      const weak = c.hp < c.stats.maxHp * BLOODY.weak || c.stats.maxHp < BLOODY.weakHp;
      if (weak && Math.random() < BLOODY.scare) c.breakMorale(BLOODY.min + Math.random() * (BLOODY.max - BLOODY.min));
    }
  }

  /** "Allies": for beasts, the same kind; for humans, all humans. */
  private teamOf(c: Creature): string {
    const kind = this.kindOf.get(c);
    return kind?.bites ? `beast:${kind.pid}` : 'people';
  }

  /** A creature's shot at the hero: the chance is the skill with this weapon minus the hero's armor class and the distance penalty. */
  private fire(c: Creature, player: Player): void {
    const { hero, res } = this.host;
    const w = c.weapon;
    if (!w) return;
    // The hero's "Jinxed": enemy weapons jam too.
    if (hero.character.traits.includes(TRAIT.jinxed) && Math.random() < JINX.jam) {
      c.jam(JINX.clear);
      res.sound.playAt(weaponSfx('O', '0', 1), c.x, c.y, player);
      this.float(c, t('floatJammed'), BARK_COLOR);
      return;
    }
    res.sound.playAt(w.sound, c.x, c.y, player);
    this.flashes.push({ x: c.x, y: c.y, radius: 3, strength: 0.9, time: 0.08, duration: 0.08 });
    // Everyone around hears the shot: allies will come running.
    this.noise(c.x, c.y, NOISE.shot, true, c);
    const dist = Math.hypot(c.x - player.x, c.y - player.y);
    const attacker = this.fighterOf(c);
    if (Math.random() * 100 < chanceToHit(attacker, w.skill, hero.fighter, dist, w.ammo?.acModifier ?? 0)) {
      const hit = strike(attacker, w.damage, hero.fighter, Math.random, w.ammo);
      const dmg = Math.max(1, hit.damage);
      const limb = hero.takeDamage(dmg, { critical: hit.critical });
      if (hero.alive) res.sound.play(SFX.heroHurt, 0.8);
      this.hitFrom = { angle: Math.atan2(c.y - player.y, c.x - player.x), near: dist < 1.2, time: 1 };
      this.host.say(tf('msgShot', { name: c.stats.name, dmg }));
      if (limb) this.host.say(t(limb === 'arm' ? 'msgCrippledArm' : 'msgCrippledLeg'));
    } else {
      // A bullet passed nearby: the hero's crosshair shakes (suppressing fire: while one pins down, others flank).
      hero.suppress();
      this.host.say(tf('msgShotMiss', { name: c.stats.name }));
    }
  }

  /** Sound code of the weapon in hand (the 10mm pistol is "A"); fists have no sound. */
  private get soundCode(): string {
    return this.host.hero.weapon.soundCode ?? '0';
  }

  /** Reload sound: once at the start; the reload itself takes time. */
  private checkReloadSound(): void {
    const reloading = this.host.hero.reloadLeft > 0;
    if (reloading && !this.reloadSounded) this.host.res.sound.play(weaponSfx('R', this.soundCode, 1), 0.8);
    this.reloadSounded = reloading;
  }

  /**
   * The hero's current shot spread: the radius of the crosshair circle in frame pixels (combat.ts: skill, Perception, Strength, movement,
   * recoil). Melee weapons have no circle: 0.
   */
  heroSpread(player: Player, renderer: Renderer): number {
    const { hero } = this.host;
    if (hero.melee) return 0;
    const lack = Math.max(0, hero.weapon.minStrength - hero.fighter.special.strength);
    const motion = motionSpread(Math.hypot(player.vx, player.vy), player.airborne, player.sneaking, hero.spreadKick);
    // Accuracy range comes from Perception: you cannot aim precisely farther than you can see (the circle grows with the target's distance).
    const far = farAim(this.aimDistance(renderer, player), hero.fighter.special.perception + (hero.fighter.rangePerception ?? 0));
    const arm = hero.crippledArm ? CRIPPLE.armSpread : 1;
    const traits = hero.character.traits;
    const fast = traits.includes(TRAIT.fastShot) ? FAST_SHOT.spread : 1;
    const hands = traits.includes(TRAIT.oneHander) ? (hero.weapon.twoHanded ? ONE_HANDER.two : ONE_HANDER.one) : 1;
    return Math.tan(aimSpread(hero.gunSkill, hero.fighter.special.perception, lack, motion)) * renderer.proj * far * arm * fast * hands;
  }

  /** How far the thing the hero aims at is: a living thing in the crosshair, otherwise the wall at the middle of the screen (cells, at most 30). */
  private aimDistance(renderer: Renderer, player: Player): number {
    const living = new Set(this.creatures.filter((c) => c.alive && c.present && !this.allies.has(c)).map((c) => c.id));
    const id = renderer.pickPoint(VIEW_W / 2, VIEW_H / 2, RES, (n) => living.has(n));
    const c = this.creatures.find((k) => k.id === id && k.alive);
    if (c) return Math.hypot(c.x - player.x, c.y - player.y);
    return Math.min(30, renderer.wallInColumn(VIEW_W / 2).depth);
  }

  /**
   * Who an aimed attack hits: with a melee weapon, the nearest living thing in front of the hero within arm's reach; with a gun, whoever is in
   * the crosshair within the weapon's range (farther means a regular shot). No target gives null. Thrown weapons have no aimed attack.
   */
  aimTarget(renderer: Renderer, player: Player): { creature: Creature; parts: readonly AimPart[] } | null {
    const { hero } = this.host;
    if (hero.thrown || !hero.alive) return null;
    let target: Creature | null = null;
    if (hero.melee) target = this.meleeTarget(player);
    else {
      const living = new Set(this.creatures.filter((c) => c.alive && c.present && !this.allies.has(c)).map((c) => c.id));
      const id = renderer.pickPoint(VIEW_W / 2, VIEW_H / 2, RES, (n) => living.has(n));
      const found = this.creatures.find((c) => c.id === id && c.alive) ?? null;
      // Weapon range is in original hexes; our cell is two hexes.
      if (found && Math.hypot(found.x - player.x, found.y - player.y) <= Math.max(1, hero.weapon.range / 2)) target = found;
    }
    if (!target) return null;
    return { creature: target, parts: this.kindOf.get(target)?.bites ? BEAST_AIM_PARTS : AIM_PARTS };
  }

  /** The nearest living thing in front of the hero within arm's (or spear's) reach and in the strike field. */
  private meleeTarget(player: Player): Creature | null {
    const reach = meleeReach(this.host.hero.weapon) + 0.3;
    let target: Creature | null = null;
    let best = Infinity;
    for (const c of this.creatures) {
      if (!c.alive || !c.present) continue;
      const dist = Math.hypot(c.x - player.x, c.y - player.y);
      if (dist > reach || dist >= best) continue;
      const diff = Math.atan2(c.y - player.y, c.x - player.x) - player.angle;
      if (Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))) > 0.6) continue;
      if (!lineOfSight(this.level, player.x, player.y, c.x, c.y)) continue;
      target = c;
      best = dist;
    }
    return target;
  }

  /**
   * Aimed attack at the chosen body part (combat.ts -> AIMED): whether it hits depends on the part's chance and Luck, without the skill; the eyes and
   * head are critical (the eyes more so), the groin means the opponent cannot attack for a short time, arms and legs work like a bullet.
   */
  private aimedHit(target: Creature, part: AimPart, player: Player): void {
    const { hero, res } = this.host;
    const name = target.stats.name;
    if (Math.random() * 100 >= aimedChance(part, hero.fighter.special.luck)) {
      this.host.say(tf('msgAimedMiss', { name }));
      target.alertTo(player.x, player.y);
      return;
    }
    const zone = aimedZone(part);
    const weapon = hero.weapon;
    const bonus = hero.melee ? 0 : (hero.fighter.rangedDamage ?? 0);
    const damage = hero.melee ? { min: weapon.minDamage, max: weapon.maxDamage + hero.fighter.meleeDamage } : { min: weapon.minDamage + bonus, max: weapon.maxDamage + bonus };
    const critChance = zone === 'head' ? 100 : part === 'groin' ? Math.max(hero.fighter.critChance, AIMED.groinCrit) : hero.fighter.critChance;
    const critPower = (hero.fighter.critPower ?? 2) + (part === 'eyes' ? AIMED.eyesPower : 0);
    const hit = strike({ ...hero.fighter, critChance, critPower }, damage, this.fighterOf(target), Math.random, hero.melee ? undefined : hero.loadedAmmo?.ammo);
    let dmg = hit.damage;
    if ((zone === 'arms' || zone === 'legs') && dmg > 0) dmg = Math.max(1, Math.floor(dmg * ZONE.limbDamage));
    if (dmg > 0) {
      const code = hero.melee ? weapon.soundCode : this.soundCode;
      if (code) res.sound.playAt(weaponSfx('H', code, 1), target.x, target.y, player, 0.7);
    }
    this.wound(target, player, dmg, hit.critical, zone, part === 'eyes');
    if (part === 'groin' && dmg > 0 && target.alive) {
      target.jam(AIMED.groinStun);
      this.host.say(tf('msgGroin', { name }));
    }
  }

  private shoot(renderer: Renderer, player: Player): void {
    const { hero, res } = this.host;
    // The circle as it was before this shot (the shot itself adds recoil for the next one).
    const radius = this.heroSpread(player, renderer);
    // An aimed attack if there is a target in the crosshair; otherwise a regular one.
    const aim = this.aimedPart ? this.aimTarget(renderer, player) : null;
    const aimedAt = aim && aim.parts.includes(this.aimedPart!) ? this.aimedPart! : null;
    const result = hero.fire(!!aimedAt);
    if (result === 'empty' || result === 'noAp') {
      if (!this.lastEmpty) {
        res.sound.play(weaponSfx('O', this.soundCode, 1));
        this.host.say(result === 'noAp' ? tf('msgNoAp', { n: formatDecimal(this.host.hero.apCost(AP_COST.reload)) }) : t('msgNoAmmo'));
      }
      this.lastEmpty = true;
      return;
    }
    this.lastEmpty = false;
    if (result === 'jammed') {
      res.sound.play(weaponSfx('O', this.soundCode, 1));
      this.host.say(t('msgJammed'));
      return;
    }
    if (result !== 'fired') return;
    if (hero.melee) {
      if (aim && aimedAt) {
        if (hero.weapon.soundCode) res.sound.play(weaponSfx('A', hero.weapon.soundCode, 1), 0.8);
        this.noise(player.x, player.y, NOISE.run, false);
        this.aimedHit(aim.creature, aimedAt, player);
      } else this.strikeMelee(renderer, player);
      return;
    }
    if (hero.thrown) {
      this.throwHeld(renderer, player, radius);
      return;
    }
    const code = this.soundCode;
    const variant = Math.random() < 0.5 ? 1 : 2;
    res.sound.play(weaponSfx('A', code, variant), 0.9);
    // The hero's shot is heard far away: enemies around go to check, peaceful ones scatter.
    this.noise(player.x, player.y, NOISE.shot, true);
    if (aim && aimedAt) {
      this.aimedHit(aim.creature, aimedAt, player);
      return;
    }
    // The hero's accuracy is spread (client, 2026-10-22): the bullet lands in the crosshair circle, more often near the middle, and hits
    // whoever it lands on; there is no "to hit" roll and no target armor in it (armor still reduces damage). The circle is honest
    // vertically too: there is no Doom-style auto-aim anymore; a low rat is caught by tilting your view. NPCs shoot by the old rules.
    // Only living things stop a bullet: corpses and items on the floor let it through.
    const living = new Set(this.creatures.filter((c) => c.alive && c.present && !this.allies.has(c)).map((c) => c.id));
    const solid = (id: number) => living.has(id);
    const lands = spreadPoint(radius);
    const px = VIEW_W / 2 + lands.x;
    const py = VIEW_H / 2 + lands.y;
    const offset = Math.atan(lands.x / renderer.proj);
    const id = renderer.pickPoint(px, py, RES, solid);
    const target = this.creatures.find((c) => c.id === id && c.alive);
    if (!target) {
      // A miss: the bullet hits the wall, with a stone or metal sound where it struck.
      const wall = renderer.wallInColumn(px);
      if (wall.texture && wall.depth < 16) {
        const a = player.angle + offset;
        const dist = wall.depth / Math.cos(offset);
        const metallic = METALLIC.has(wall.texture);
        res.sound.playAt(weaponSfx('H', code, variant, metallic ? 'M' : 'S'), player.x + Math.cos(a) * dist, player.y + Math.sin(a) * dist, player, 0.5);
        // Where the bullet struck: sparks from metal or a puff of dust from stone (just in front of the wall) and a mark on the wall.
        const at = Math.max(0.2, dist - 0.06);
        const z = 0.3 + Math.random() * 0.35;
        this.addEffect(metallic ? 'spark' : 'dust', player.x + Math.cos(a) * at, player.y + Math.sin(a) * at, z, metallic ? 0.35 : 0.5, metallic ? 0.25 : 0.55);
        const spot = renderer.wallSpotInColumn(px);
        if (spot) addDecal(this.level, spot.key, { u: spot.u, v: 1 - z, r: 0.014 + Math.random() * 0.006 });
      }
      return;
    }
    const bonus = hero.fighter.rangedDamage ?? 0;
    // Modifiers of the ammo loaded in the gun: armor-piercing rounds go through armor, hollow points hurt more without it.
    const ammo = hero.loadedAmmo?.ammo;
    // Where the bullet hit (the original's aimed shots, combat.ts -> bodyZone): the head is always critical, arms and legs
    // take less damage, but the enemy limps or drops its weapon. Accuracy matters more than frequent shots to the torso.
    const part = renderer.spritePoint(px, py, target.id);
    const zone = part ? bodyZone(part.u, part.v, !this.kindOf.get(target)?.bites) : 'torso';
    // "Sniper" (perk, as in the original's description): a hit is critical if a Luck roll succeeds (Luck x 10%).
    const sniper = perkRank(hero.character, PERK.sniper) > 0;
    const crit = sniper ? Math.max(hero.fighter.critChance, hero.fighter.special.luck * 10) : hero.fighter.critChance;
    const attacker = zone === 'head' ? { ...hero.fighter, critChance: 100 } : { ...hero.fighter, critChance: crit };
    const hit = strike(attacker, { min: hero.weapon.minDamage + bonus, max: hero.weapon.maxDamage + bonus }, this.fighterOf(target), Math.random, ammo);
    let dmg = hit.damage;
    if ((zone === 'arms' || zone === 'legs') && dmg > 0) dmg = Math.max(1, Math.floor(dmg * ZONE.limbDamage));
    if (dmg > 0) res.sound.playAt(weaponSfx('H', code, variant), target.x, target.y, player, 0.7);
    this.wound(target, player, dmg, hit.critical, zone);
  }

  /**
   * A melee hit (fists, brass knuckles, knife, spear): at the living thing in front of the hero within arm's or spear's reach. The chance uses the same formula as
   * a shot, with this weapon's skill; the hero's "melee damage" is added to the damage, as in the original. A hit is heard only nearby.
   */
  private strikeMelee(renderer: Renderer, player: Player): void {
    const { hero, res } = this.host;
    const weapon = hero.weapon;
    const reach = meleeReach(weapon) + 0.3;
    if (weapon.soundCode) res.sound.play(weaponSfx('A', weapon.soundCode, 1), 0.8);
    // A swing is heard nearby, but it is not "loud": peaceful ones do not scatter from it.
    this.noise(player.x, player.y, NOISE.run, false);
    const target = this.meleeTarget(player);
    if (!target) return;
    const best = Math.hypot(target.x - player.x, target.y - player.y);
    // Aimed hit (combat.ts -> MELEE_AIM): crosshair on the target's head means a hit to the head (critical, but harder to land),
    // on an arm or leg, there; crosshair off the image means the torso.
    const part = renderer.spritePoint(VIEW_W / 2, VIEW_H / 2, target.id);
    const zone = part ? bodyZone(part.u, part.v, !this.kindOf.get(target)?.bites) : 'torso';
    const chance = chanceToHit(hero.fighter, hero.gunSkill, this.fighterOf(target), best) - strengthPenalty(hero.fighter.special.strength, weapon.minStrength) - MELEE_AIM[zone];
    if (Math.random() * 100 >= chance) {
      target.alertTo(player.x, player.y);
      return;
    }
    const attacker = zone === 'head' ? { ...hero.fighter, critChance: 100 } : hero.fighter;
    const hit = strike(attacker, { min: weapon.minDamage, max: weapon.maxDamage + hero.fighter.meleeDamage }, this.fighterOf(target));
    let dmg = hit.damage;
    if ((zone === 'arms' || zone === 'legs') && dmg > 0) dmg = Math.max(1, Math.floor(dmg * ZONE.limbDamage));
    if (dmg > 0 && weapon.soundCode) res.sound.playAt(weaponSfx('H', weapon.soundCode, 1), target.x, target.y, player, 0.7);
    this.wound(target, player, dmg, hit.critical, zone);
  }

  /** The hero's hit: damage, the wounded sound, a log line; if killed, experience. */
  /**
   * A hit to an arm or a leg (combat.ts -> ZONE): a leg makes the enemy limp until the end of the fight; an arm, on a strong or critical
   * hit, makes it drop its weapon with some chance (the weapon lands on the floor nearby, and it then fights with its fists).
   */
  /**
   * A critter with a weapon in its inventory but empty hands (Killian's assassin: the script puts a hunting rifle in its inventory but does not
   * put it in its hands) takes the best one in combat, like the original's AI: a gun by damage (ammo by prototype); no gun means a melee weapon.
   * The weapon stays in its inventory (it is there when the corpse is searched). Checked once per critter; beasts do not take weapons.
   */
  private armFromInventory(c: Creature): void {
    if (this.armChecked.has(c)) return;
    this.armChecked.add(c);
    const kind = this.kindOf.get(c);
    if (!kind || kind.bites) return;
    const usable = c.inventory.items.map((s) => s.proto).filter((p) => p.weapon && !isGrenade(p) && !isThrownWeapon(p.weapon));
    const average = (p: ItemProto) => ((p.weapon?.minDamage ?? 0) + (p.weapon?.maxDamage ?? 0)) / 2;
    const guns = usable.filter((p) => p.weapon!.capacity > 0 && p.weapon!.range > 2);
    const best = (guns.length ? guns : usable).sort((a, b) => average(b) - average(a))[0];
    if (!best) return;
    void this.host.res.critterKind(kind.pid, best.pid).then(
      (armed) => {
        if (!c.alive || c.weapon || this.kindOf.get(c) !== kind) return;
        c.arm(armed.weapon, armed.art);
        this.kindOf.set(c, armed);
      },
      () => {},
    );
  }

  private limbHit(target: Creature, zone: 'head' | 'torso' | 'arms' | 'legs', dmg: number, critical: boolean): void {
    if (zone === 'legs' && target.limp === 1) {
      target.cripple();
      this.host.say(tf('msgLimp', { name: target.stats.name }));
      return;
    }
    if (zone !== 'arms' || !(critical || dmg >= target.stats.maxHp * ZONE.disarmShare) || Math.random() >= ZONE.disarmChance) return;
    const kind = this.kindOf.get(target);
    const gun = kind?.weaponPid ?? 0;
    if (!gun || !target.disarm()) return;
    this.host.say(tf('msgDisarm', { name: target.stats.name }));
    // The weapon was also in the inventory (taken from it): that is what falls to the floor, not a second identical item.
    if (target.inventory.count(gun) > 0) target.inventory.remove(gun, 1);
    void this.addCreated({ kind: 'item', pid: gun, x: target.x, y: target.y, count: 1 });
    // Images without a weapon in hand.
    void this.host.res.critterKind(kind!.pid, 0).then((bare) => target.rearm(null, bare.art, null)).catch(() => {});
  }

  /** The hero wounded someone: guards around run to where the shot or blow came from. */
  private alarmGuards(player: Player): void {
    const radius = this.host.hero.melee ? GUARD_ALARM.melee : GUARD_ALARM.shot;
    for (const c of this.creatures) {
      if (!c.alive || !c.present || this.allies.has(c)) continue;
      if (barkClassOf(this.kindOf.get(c)?.soundBase ?? '', this.scripts.get(c)?.name ?? null) !== 'guard') continue;
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      if (d > radius || (d > radius / 2 && !lineOfSight(this.level, c.x, c.y, player.x, player.y))) continue;
      c.hear(player.x, player.y, true, this.level);
    }
  }

  /** eyes: an aimed hit to the eyes (its own log line). */
  private wound(target: Creature, player: Player, dmg: number, critical: boolean, zone: 'head' | 'torso' | 'arms' | 'legs' = 'torso', eyes = false): void {
    const { hero, res } = this.host;
    const killed = target.hurt(dmg, true, critical);
    if (dmg > 0) this.alarmGuards(player);
    if (!killed && dmg > 0) this.limbHit(target, zone, dmg, critical);
    this.noteHit(target, null);
    // Blood splashes slightly closer to the hero, so they do not hide behind the sprite.
    if (dmg > 0) {
      const d = Math.hypot(player.x - target.x, player.y - target.y) || 1;
      this.addEffect('blood', target.x + ((player.x - target.x) / d) * 0.15, target.y + ((player.y - target.y) / d) * 0.15, 0.42, 0.6, 0.45);
    }
    // The wounded one knows where the shots came from: runs there if it does not see the hero.
    if (!killed) target.alertTo(player.x, player.y);
    res.sound.playAt(this.soundOf(target) + (killed ? 'BA' : 'AO'), target.x, target.y, player);
    const name = target.stats.name;
    // A fist, knife or thrown rock is a "blow", not a "bullet".
    if (dmg <= 0) this.host.say(tf(hero.melee || hero.thrown ? 'msgNoDamageMelee' : 'msgNoDamage', { name }));
    else this.host.say(tf(eyes ? 'msgCritEyes' : zone === 'head' ? 'msgCritHead' : critical ? 'msgCrit' : 'msgHit', { name, dmg }) + (perkRank(hero.character, PERK.awareness) && !killed ? ` (${target.hp}/${target.stats.maxHp})` : ''));
    if (killed) {
      this.manDown(target);
      hero.kills += 1;
      const xp = this.gainKill(target.stats.experience);
      this.host.say(tf('msgKill', { name, xp: xp.gained }));
      if (xp.levels > 0) this.host.say(tf('msgLevelUp', { level: hero.level }));
    }
  }
}
