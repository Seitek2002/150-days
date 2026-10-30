// Game save: plain JSON. Stored on the player's computer (Electron: the game's settings folder,
// development in the browser: .local/saves). The save holds only item numbers and state, nothing from the Fallout files.
import type { CaravanTrip } from './caravan.ts';
import type { Character } from './character.ts';
import type { CompanionProgress } from './companion.ts';
import type { CreatureState } from './creature.ts';
import type { ScriptTimer } from './script-timers.ts';

export const SAVE_VERSION = 1;

/** Slots: "quick" is the quick save (F6/F7), "1"…"10" are regular ones (the save screen, task C4). */
export type SaveSlot = 'quick' | `${number}`;

/** What changed on the map since the start of the game. Object keys are "o<object number in the level>". */
/** An object created by a script (create_object_sid): a critter or an item on the ground. Lives along with the map. */
export interface CreatedObject {
  /** Key on the map: "c1", "c2"… (its state is in creatures, its items in corpseItems, whether an item was picked up in taken). */
  key: string;
  /** scenery is scenery from a script (a pile of rocks after an explosion): if it is not flat and not passable, the cell becomes a wall. */
  kind: 'critter' | 'item' | 'container' | 'scenery';
  pid: number;
  x: number;
  y: number;
  /** The critter's script: a name from SCRIPTS.LST. */
  script?: string;
  /**
   * Script key (its variables), if the critter came from another map (a companion who stayed here: Tandi kidnapped
   * to the Khans' camp); none means "<map>:<key>".
   */
  scriptKey?: string;
  /** Weapon in hand (PID), if a script gave it while the critter was on another map. */
  weapon?: number;
  /** How many items (for an item on the ground). */
  count?: number;
  /** Created "nowhere" and not yet placed: invisible. */
  hidden?: boolean;
  /** The original's hex (for scenery with a script: a shaft with a rope instead of the broken one). */
  tile?: number;
}

export interface MapState {
  /** The level revision the state was taken from (LevelDef.revision); none means 0. */
  revision?: number;
  creatures: Record<string, CreatureState>;
  /** Picked up items. */
  taken: string[];
  /** Open doors: cell number → how far open. */
  doors: Record<string, number>;
  /** Locks that were unlocked or locked (picked by the hero, ordered by a script): door cell number → 1 locked, 0 not. */
  locks?: Record<string, number>;
  /** What scripts created (create_object_sid). */
  created?: CreatedObject[];
  /** Scripted scenery that scripts removed for good (destroy_object): keys "s<hex>". */
  gone?: string[];
  /** What is in boxes and cabinets: box key → [pid, count]. No box means the map has not been opened yet. A removed box is in taken. */
  containers?: Record<string, [number, number][]>;
  /** What is in corpses: critter key → [pid, count]. */
  corpseItems: Record<string, [number, number][]>;
  /** Cells the player has already seen (automap), packed into a string, see seen.ts. No field means the map has not been opened yet. */
  seen?: string;
}

export interface SaveData {
  version: number;
  savedAt: string;
  /** Label for the load screen (map name and day). */
  label: string;
  map: string;
  player: { x: number; y: number; angle: number };
  hero: {
    hp: number;
    experience: number;
    kills: number;
    magazine: number;
    inventory: [number, number][];
    /** The character (stats, skills, traits). No field means a save from an early version: the default character. */
    character?: Character;
    /** The pistol is in the inventory. No field means a save from an early version: the hero always had the pistol, it must be put in. */
    weaponInInventory?: boolean;
    /** What is in the second hand ("Hand 2"): PID, null means empty. No field means not chosen yet (the pistol in hand, if there is one). */
    held?: number | null;
    /** What is in the first hand ("Hand 1"). No field means an early version: empty. */
    hand1?: number | null;
    /** Active hand: 0 is Hand 1, 1 is Hand 2. No field means the second. */
    activeHand?: 0 | 1;
    /** Ammo in the magazine of each gun: [PID, rounds]. No field means an early version: magazine is the pistol's magazine. */
    magazines?: [number, number][];
    /** What ammo the guns are loaded with, if not "native": [gun PID, ammo PID]. No field means all "native". */
    loadedAmmo?: [number, number][];
    /** Worn armor (PID). No field means no armor. */
    worn?: number | null;
  };
  /** local is the script clock on maps beyond the calendar (no field means an early version: 0). */
  clock: { seconds: number; extraDays: number; local?: number };
  /** How many more seconds the lit flare on the hero keeps burning. No field means not lit. */
  flare?: number;
  maps: Record<string, MapState>;
  /** Script variables: story, maps and critters (the keys are in src/game/scripts.ts). */
  vars: Record<string, number>;
  /** Delayed script events (src/game/script-timers.ts). No field means a save from an early version. */
  timers?: ScriptTimer[];
  /** The hero's companions. No field means no companions. */
  party?: SavedPartyMember[];
  /** Companion growth (experience, levels, invested points) by critter PID, including those not in the party now. No field means no growth. */
  companions?: Record<string, Partial<CompanionProgress>>;
  /** What the companions have already offered and what the hero answered (src/game/companion-talk.ts). No field means nothing. */
  companionNotes?: Record<string, number>;
  /** The hero walks with a caravan (src/game/caravan.ts). No field means he does not. */
  caravan?: CaravanTrip;
  /** Drug addictions. No field means no addictions. */
  addictions?: { drugPid: number; perk: number; withdrawalAt: number; deltas: [number, number][] }[];
  /** Drug effects: modifiers now and what comes later (game seconds). No field means no drugs taken. */
  drugs?: { mods: Record<number, number>; queue: { at: number; deltas: [number, number][] }[] };
  /** Our own locations from the location editor that the save was made with: level → variant name. No field means the game's levels. */
  locations?: Record<string, string>;
}

/** A companion in a save: what to rebuild the critter from and where he comes from. */
export interface SavedPartyMember {
  pid: number;
  weaponPid: number;
  hp: number;
  inventory: [number, number][];
  script: { name: string; key: string } | null;
  /** The map and key the companion left with the hero from (he is marked "left" there). */
  origin: { map: string; key: string } | null;
  /** The "keep your distance" command. No field means close by. */
  far?: boolean;
}

export interface SaveInfo {
  slot: string;
  savedAt: string;
  label: string;
}

export function emptyMapState(): MapState {
  return { creatures: {}, taken: [], doors: {}, corpseItems: {} };
}

/** Validation of what was read: an old or foreign save does not break the game. */
export function isSaveData(value: unknown): value is SaveData {
  const v = value as SaveData | null;
  return !!v && v.version === SAVE_VERSION && typeof v.map === 'string' && !!v.player && !!v.hero && !!v.maps;
}
