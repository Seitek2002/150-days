// Fallout prototypes (PRO): descriptions of items, critters, scenery, walls, tiles and "misc".
// All numbers are 32-bit, big-endian. Field order is taken from the format description (the fallout1-ce project); the code is ours.

/** Object type: the high bits of the identifier (PID) and the PROTO\<type> directory number. */
export const OBJ_TYPE = { item: 0, critter: 1, scenery: 2, wall: 3, tile: 4, misc: 5 } as const;

/** Item prototype flag (extendedFlags): big gun. */
const ITEM_BIG_GUN = 0x100;
const ITEM_TWO_HANDED = 0x200;

export const ITEM_TYPE = { armor: 0, container: 1, drug: 2, weapon: 3, ammo: 4, misc: 5, key: 6 } as const;

/** Scenery kind: it determines how much data follows the common part. */
export const SCENERY_TYPE = { door: 0, stairs: 1, elevator: 2, ladderUp: 3, ladderDown: 4, generic: 5 } as const;

/** The seven damage types: DT and DR of armor and critters follow this order. */
export const DAMAGE_TYPE = { normal: 0, laser: 1, fire: 2, plasma: 3, electrical: 4, emp: 5, explosion: 6 } as const;
export const DAMAGE_TYPE_COUNT = 7;

/** Critter body type: it determines the set of animations and the way of walking. */
export const BODY_TYPE = { biped: 0, quadruped: 1, robotic: 2 } as const;

/** Map exits — "misc" with numbers 16–23 (PID 0x5000010–0x5000017). */
export const EXIT_GRID_FIRST = 0x5000010;
export const EXIT_GRID_LAST = 0x5000017;
export const isExitGrid = (pid: number) => pid >= EXIT_GRID_FIRST && pid <= EXIT_GRID_LAST;

/** Critter stat numbers (as in Fallout). */
export const STAT = {
  strength: 0,
  perception: 1,
  endurance: 2,
  charisma: 3,
  intelligence: 4,
  agility: 5,
  luck: 6,
  maxHp: 7,
  maxAp: 8,
  armorClass: 9,
  unarmedDamage: 10,
  meleeDamage: 11,
  carryWeight: 12,
  sequence: 13,
  healingRate: 14,
  criticalChance: 15,
  betterCriticals: 16,
  /** Damage threshold DT: seven consecutive values, 17 + damage type (DAMAGE_TYPE). */
  damageThreshold: 17,
  /** Damage resistance DR (percent): seven consecutive values, 24 + damage type. */
  damageResistance: 24,
  radiationResistance: 31,
  poisonResistance: 32,
  age: 33,
  gender: 34,
  currentHp: 35,
} as const;

export interface WeaponData {
  minDamage: number;
  maxDamage: number;
  damageType: number;
  range: number;
  minStrength: number;
  apCost: number;
  apCostMode2: number;
  caliber: number;
  ammoPid: number;
  capacity: number;
  /** Code of the weapon animation in the critter's hands (a letter in the file name: 1 = knife, 4 = pistol...). */
  animationCode?: number;
  /** Range of the secondary mode (burst, throw). */
  range2?: number;
  /** Projectile prototype number (for thrown weapons and rockets). */
  projectilePid?: number;
  criticalFailureType?: number;
  perk?: number;
  /** Shots per "burst" mode. */
  burstRounds?: number;
  /**
   * Big gun (prototype flag 0x100: flamer, minigun, rocket launcher) — the "Big Guns" skill. The original picks the skill by this,
   * not by the animation: the plasma rifle's animation is "heavy", but its skill is "Energy Weapons".
   */
  bigGun?: boolean;
  /** Two-handed (prototype flag 0x200: rifles, shotguns, big guns) — for the "One Hander" trait. */
  twoHanded?: boolean;
  /**
   * Sound code of the weapon itself: the shot file name is built from it (WA<code>1XXX1; the 10mm pistol — "A").
   * Important: the common `ItemProto.soundCode` of a weapon is always "0" — for weapon sound names this one is the right one.
   */
  soundCode?: string;
}

export interface AmmoData {
  caliber: number;
  quantity: number;
  /** Modifier to the target's armor class, percent. */
  acModifier?: number;
  /** Modifier to the target's damage resistance, percent. */
  drModifier?: number;
  /** Damage is multiplied by the multiplier and divided by the divisor. */
  damageMultiplier?: number;
  damageDivisor?: number;
}

export interface DrugData {
  stats: [number, number, number];
  amounts: [number, number, number];
  /** First delayed effect: after this many minutes of game time. */
  duration1?: number;
  amounts1?: [number, number, number];
  /** Second delayed effect. */
  duration2?: number;
  amounts2?: [number, number, number];
  /** Addiction chance, percent. */
  addictionChance?: number;
  withdrawalEffect?: number;
  /** After how many minutes withdrawal starts. */
  withdrawalOnset?: number;
}

export interface ArmorData {
  /** Armor class bonus. */
  armorClass: number;
  /** DR for the seven damage types (DAMAGE_TYPE), percent. */
  damageResistance: number[];
  /** DT for the seven damage types (DAMAGE_TYPE). */
  damageThreshold: number[];
  perk: number;
  /** Hero image numbers in this armor (the ART\CRITTERS list). */
  maleFid: number;
  femaleFid: number;
}

export interface ContainerData {
  /** Capacity by item size. */
  maxSize: number;
  openFlags: number;
}

export interface MiscItemData {
  /** Which batteries fit (PID) and their type. */
  powerPid: number;
  powerType: number;
  /** Charges (Geiger counter, stealth boy, etc.). */
  charges: number;
}

export interface KeyData {
  /** Which locks the key fits. */
  keyCode: number;
}

export interface ItemProto {
  pid: number;
  messageId: number;
  fid: number;
  type: number;
  weight: number;
  cost: number;
  inventoryFid: number;
  /**
   * The common "sound" byte from the item header. For all weapons it is "0", so for weapon sounds
   * use `weapon.soundCode`, not this field.
   */
  soundCode?: string;
  lightDistance?: number;
  lightIntensity?: number;
  flags?: number;
  extendedFlags?: number;
  /** Script number (-1 — none). */
  scriptId?: number;
  material?: number;
  size?: number;
  weapon?: WeaponData;
  ammo?: AmmoData;
  drug?: DrugData;
  armor?: ArmorData;
  container?: ContainerData;
  misc?: MiscItemData;
  key?: KeyData;
}

/** Critter flags (critterFlags): barter — you can trade with it via the "Barter" button in dialogue (almost all humans). */
export const CRITTER_FLAG = { barter: 0x02 } as const;

export interface CritterProto {
  pid: number;
  messageId: number;
  fid: number;
  /** Base stats + bonuses from the prototype (35 values, indices — STAT). */
  stats: number[];
  /** Extra skill points (on top of the SPECIAL formulas). */
  skillPoints: number[];
  experience: number;
  /** DT for the seven damage types (DAMAGE_TYPE) — the same as stats[17..23]. */
  damageThreshold: number[];
  /** DR for the seven damage types (DAMAGE_TYPE), percent — the same as stats[24..30]. */
  damageResistance: number[];
  /** "Head" number for dialogue (the ART\HEADS list), -1 — none. */
  headFid: number;
  /** AI behavior packet number (from AI.TXT). */
  aiPacket: number;
  /** Team: who fights whom. */
  team: number;
  /** Body: BODY_TYPE. */
  bodyType: number;
  /** Critter kind for the "... slayer" perks. */
  killType: number;
  /** Critter flags (can't sneak, doesn't heal from wounds, etc.): CRITTER_FLAG. */
  critterFlags: number;
  lightDistance: number;
  lightIntensity: number;
  flags: number;
  extendedFlags: number;
  scriptId: number;
}

export interface DoorData {
  openFlags: number;
  /** Which key opens it (0 — no lock). */
  keyCode: number;
}

export interface SceneryProto {
  kind: 'scenery';
  pid: number;
  messageId: number;
  fid: number;
  lightDistance: number;
  lightIntensity: number;
  flags: number;
  extendedFlags: number;
  scriptId: number;
  /** Scenery kind: SCENERY_TYPE. */
  type: number;
  material: number;
  /** Open/use sound code (a character), if set. */
  soundCode?: string;
  /** For a door. */
  door?: DoorData;
  /** For an ordinary ladder: two numbers from the prototype (meaning to be clarified from the maps). */
  stairs?: [number, number];
  /** For an elevator: elevator kind (which floors are available) and the floor it stands on. */
  elevator?: { type: number; level: number };
  /** For a rope ladder (up or down): a number from the prototype. */
  ladder?: number;
  /** For ordinary scenery: a number from the prototype (unused in the game). */
  generic?: number;
}

export interface WallProto {
  kind: 'wall';
  pid: number;
  messageId: number;
  fid: number;
  lightDistance: number;
  lightIntensity: number;
  flags: number;
  extendedFlags: number;
  scriptId: number;
  material: number;
}

export interface TileProto {
  kind: 'tile';
  pid: number;
  messageId: number;
  fid: number;
  flags: number;
  extendedFlags: number;
  scriptId: number;
  material: number;
}

export interface MiscProto {
  kind: 'misc';
  pid: number;
  messageId: number;
  fid: number;
  lightDistance: number;
  lightIntensity: number;
  flags: number;
  extendedFlags: number;
  /** Map exit (PID 0x5000010–0x5000017). */
  exitGrid: boolean;
}

export type AnyProto = (ItemProto & { kind: 'item' }) | (CritterProto & { kind: 'critter' }) | SceneryProto | WallProto | TileProto | MiscProto;

function reader(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  return {
    i32() {
      const v = view.getInt32(p);
      p += 4;
      return v;
    },
    list(n: number) {
      return Array.from({ length: n }, () => this.i32());
    },
    skip(n: number) {
      p += n;
    },
    u8() {
      return view.getUint8(p++);
    },
    /** How many bytes have been read already. */
    get pos() {
      return p;
    },
  };
}

type Reader = ReturnType<typeof reader>;

const triple = (r: Reader): [number, number, number] => [r.i32(), r.i32(), r.i32()];
const soundChar = (code: number) => (code > 32 && code < 127 ? String.fromCharCode(code) : undefined);

function readItem(r: Reader): ItemProto {
  const pid = r.i32();
  const messageId = r.i32();
  const fid = r.i32();
  const lightDistance = r.i32();
  const lightIntensity = r.i32();
  const flags = r.i32();
  const extendedFlags = r.i32();
  const scriptId = r.i32();
  const type = r.i32();
  const material = r.i32();
  const size = r.i32();
  const weight = r.i32();
  const cost = r.i32();
  const inventoryFid = r.i32();
  const sound = r.u8();
  const item: ItemProto = {
    pid, messageId, fid, type, weight, cost, inventoryFid,
    lightDistance, lightIntensity, flags, extendedFlags, scriptId, material, size,
  };
  const code = soundChar(sound);
  if (code) item.soundCode = code;
  if (type === ITEM_TYPE.weapon) {
    const animationCode = r.i32();
    const minDamage = r.i32();
    const maxDamage = r.i32();
    const damageType = r.i32();
    const range = r.i32();
    const range2 = r.i32();
    const projectilePid = r.i32();
    const minStrength = r.i32();
    const apCost = r.i32();
    const apCostMode2 = r.i32();
    const criticalFailureType = r.i32();
    const perk = r.i32();
    const burstRounds = r.i32();
    const caliber = r.i32();
    const ammoPid = r.i32();
    const capacity = r.i32();
    const weapon: WeaponData = {
      minDamage, maxDamage, damageType, range, minStrength, apCost, apCostMode2, caliber, ammoPid, capacity,
      animationCode, range2, projectilePid, criticalFailureType, perk, burstRounds, bigGun: (extendedFlags & ITEM_BIG_GUN) !== 0, twoHanded: (extendedFlags & ITEM_TWO_HANDED) !== 0,
    };
    const weaponCode = soundChar(r.u8());
    if (weaponCode) weapon.soundCode = weaponCode;
    item.weapon = weapon;
  } else if (type === ITEM_TYPE.ammo) {
    const caliber = r.i32();
    const quantity = r.i32();
    const acModifier = r.i32();
    const drModifier = r.i32();
    const damageMultiplier = r.i32();
    const damageDivisor = r.i32();
    item.ammo = { caliber, quantity, acModifier, drModifier, damageMultiplier, damageDivisor };
  } else if (type === ITEM_TYPE.drug) {
    const stats = triple(r);
    const amounts = triple(r);
    const duration1 = r.i32();
    const amounts1 = triple(r);
    const duration2 = r.i32();
    const amounts2 = triple(r);
    const addictionChance = r.i32();
    const withdrawalEffect = r.i32();
    const withdrawalOnset = r.i32();
    item.drug = { stats, amounts, duration1, amounts1, duration2, amounts2, addictionChance, withdrawalEffect, withdrawalOnset };
  } else if (type === ITEM_TYPE.armor) {
    const armorClass = r.i32();
    const damageResistance = r.list(DAMAGE_TYPE_COUNT);
    const damageThreshold = r.list(DAMAGE_TYPE_COUNT);
    const perk = r.i32();
    const maleFid = r.i32();
    const femaleFid = r.i32();
    item.armor = { armorClass, damageResistance, damageThreshold, perk, maleFid, femaleFid };
  } else if (type === ITEM_TYPE.container) {
    item.container = { maxSize: r.i32(), openFlags: r.i32() };
  } else if (type === ITEM_TYPE.misc) {
    item.misc = { powerPid: r.i32(), powerType: r.i32(), charges: r.i32() };
  } else if (type === ITEM_TYPE.key) {
    item.key = { keyCode: r.i32() };
  }
  return item;
}

function readCritter(r: Reader): CritterProto {
  const pid = r.i32();
  const messageId = r.i32();
  const fid = r.i32();
  const lightDistance = r.i32();
  const lightIntensity = r.i32();
  const flags = r.i32();
  const extendedFlags = r.i32();
  const scriptId = r.i32();
  const headFid = r.i32();
  const aiPacket = r.i32();
  const team = r.i32();
  const critterFlags = r.i32();
  const base = r.list(35);
  const bonus = r.list(35);
  const skillPoints = r.list(18);
  const bodyType = r.i32();
  const experience = r.i32();
  const killType = r.i32();
  const stats = base.map((v, i) => v + (bonus[i] ?? 0));
  return {
    pid, messageId, fid, stats, skillPoints, experience,
    damageThreshold: stats.slice(STAT.damageThreshold, STAT.damageThreshold + DAMAGE_TYPE_COUNT),
    damageResistance: stats.slice(STAT.damageResistance, STAT.damageResistance + DAMAGE_TYPE_COUNT),
    headFid, aiPacket, team, bodyType, killType, critterFlags,
    lightDistance, lightIntensity, flags, extendedFlags, scriptId,
  };
}

function readScenery(r: Reader): SceneryProto {
  const pid = r.i32();
  const messageId = r.i32();
  const fid = r.i32();
  const lightDistance = r.i32();
  const lightIntensity = r.i32();
  const flags = r.i32();
  const extendedFlags = r.i32();
  const scriptId = r.i32();
  const type = r.i32();
  const material = r.i32();
  const scenery: SceneryProto = {
    kind: 'scenery', pid, messageId, fid, lightDistance, lightIntensity, flags, extendedFlags, scriptId, type, material,
  };
  const code = soundChar(r.u8());
  if (code) scenery.soundCode = code;
  if (type === SCENERY_TYPE.door) scenery.door = { openFlags: r.i32(), keyCode: r.i32() };
  else if (type === SCENERY_TYPE.stairs) scenery.stairs = [r.i32(), r.i32()];
  else if (type === SCENERY_TYPE.elevator) scenery.elevator = { type: r.i32(), level: r.i32() };
  else if (type === SCENERY_TYPE.ladderUp || type === SCENERY_TYPE.ladderDown) scenery.ladder = r.i32();
  else if (type === SCENERY_TYPE.generic) scenery.generic = r.i32();
  return scenery;
}

function readWall(r: Reader): WallProto {
  const pid = r.i32();
  const messageId = r.i32();
  const fid = r.i32();
  const lightDistance = r.i32();
  const lightIntensity = r.i32();
  const flags = r.i32();
  const extendedFlags = r.i32();
  const scriptId = r.i32();
  const material = r.i32();
  return { kind: 'wall', pid, messageId, fid, lightDistance, lightIntensity, flags, extendedFlags, scriptId, material };
}

function readTile(r: Reader): TileProto {
  const pid = r.i32();
  const messageId = r.i32();
  const fid = r.i32();
  const flags = r.i32();
  const extendedFlags = r.i32();
  const scriptId = r.i32();
  const material = r.i32();
  return { kind: 'tile', pid, messageId, fid, flags, extendedFlags, scriptId, material };
}

function readMisc(r: Reader): MiscProto {
  const pid = r.i32();
  const messageId = r.i32();
  const fid = r.i32();
  const lightDistance = r.i32();
  const lightIntensity = r.i32();
  const flags = r.i32();
  const extendedFlags = r.i32();
  return { kind: 'misc', pid, messageId, fid, lightDistance, lightIntensity, flags, extendedFlags, exitGrid: isExitGrid(pid) };
}

export const parseItemProto = (bytes: Uint8Array): ItemProto => readItem(reader(bytes));
export const parseCritterProto = (bytes: Uint8Array): CritterProto => readCritter(reader(bytes));
export const parseSceneryProto = (bytes: Uint8Array): SceneryProto => readScenery(reader(bytes));
export const parseWallProto = (bytes: Uint8Array): WallProto => readWall(reader(bytes));
export const parseTileProto = (bytes: Uint8Array): TileProto => readTile(reader(bytes));
export const parseMiscProto = (bytes: Uint8Array): MiscProto => readMisc(reader(bytes));

/**
 * Parses any PRO file: the kind is determined by the identifier at the start of the file.
 * Strict check: if extra bytes remain in the file after parsing or there aren't enough — an error.
 */
export function parseProto(bytes: Uint8Array): AnyProto {
  if (bytes.length < 4) throw new Error('PRO: file shorter than 4 bytes');
  const r = reader(bytes);
  const type = idType(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(0));
  let proto: AnyProto;
  switch (type) {
    case OBJ_TYPE.item:
      proto = { kind: 'item', ...readItem(r) };
      break;
    case OBJ_TYPE.critter:
      proto = { kind: 'critter', ...readCritter(r) };
      break;
    case OBJ_TYPE.scenery:
      proto = readScenery(r);
      break;
    case OBJ_TYPE.wall:
      proto = readWall(r);
      break;
    case OBJ_TYPE.tile:
      proto = readTile(r);
      break;
    case OBJ_TYPE.misc:
      proto = readMisc(r);
      break;
    default:
      throw new Error('PRO: unknown object type ' + type);
  }
  if (r.pos !== bytes.length) throw new Error(`PRO: read ${r.pos} bytes of ${bytes.length}`);
  return proto;
}

/** Type and list number by a prototype or image identifier. */
export const idType = (id: number) => (id >>> 24) & 0x0f;
export const idIndex = (id: number) => id & 0xfff;
