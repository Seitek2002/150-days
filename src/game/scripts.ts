// Scripts on maps: Fallout scripts from the player's copy on NPCs, doors, containers and the maps themselves.
// Map life: entering the map (map_enter_p_proc), each NPC's procedure once per second (critter_p_proc),
// map update (map_update_p_proc), delayed events (timed_event_p_proc), leaving the map (map_exit_p_proc), conversations.
// Plot, map and script variables are kept in session.vars, delayed events in session.timers: everything goes into the save.
import { parseGam } from '../formats/gam.ts';
import { parseMapHeader } from '../formats/map.ts';
import { fixMessages } from './text-fixes.ts';
import { CRITTER_FLAG, ITEM_TYPE, type ItemProto } from '../formats/pro.ts';
import { parseLst, parseMsg } from '../formats/text.ts';
import { t, tf, type StringKey } from '../i18n.ts';
import { platform } from '../platform.ts';
import { callGameFunction, procedureNumber, type DialogueUI, type ScriptContext, type ScriptObject } from '../script/game-functions.ts';
import { IntProgram } from '../script/int.ts';
import { disassemble } from '../script/disasm.ts';
import { externalVars, ScriptError, ScriptVM } from '../script/vm.ts';
import { stackWeight, type Inventory } from './inventory.ts';
import { AGE_DEFAULT, derivedStats, levelForExperience, perkRank, newCharacter, SKILL, SKILL_MAX, skillBase, skillLevel, specialLevel, SPECIAL_NAMES, type Character, type Special } from './character.ts';
import { angleFromRotation, hexAt, hexCenter, onOriginalScreen, ROTATION_COUNT, rotationFromAngle, tileDist, tileInDirection } from './hex.ts';
import { wallAt } from '../engine/level.ts';
import type { Destination, LevelDef } from '../world/defs.ts';
import { LEVELS } from '../world/levels/index.ts';
import { MAP_SCRIPTS } from '../world/map-scripts.ts';
import { MERCHANT_EXTRAS } from '../world/merchant-extras.ts';
import { ORIGINAL_MAPS } from '../world/map-list.ts';
import { makeTimer, takeDueTimers } from './script-timers.ts';
import { DAY_SECONDS } from './rolls.ts';
import { lineOfSight, type Creature } from './creature.ts';
import type { Resources } from './resources.ts';
import { clearOfWalls, sideOfDoor, type Examined, type SceneContainer, type SceneDoor, type SceneProp, type SceneSpatial } from './scene.ts';
import type { CreatedObject } from './save.ts';
import { Trade } from './barter.ts';
import { deadVar } from './quests.ts';
import type { Session } from './session.ts';

/**
 * A game object for a script; a critter has a reference to its creature (new on each visit to the map, the object itself stays the same).
 * key is the script instance key; traits are properties the script set itself (critter_add_trait).
 */
export type GameObject = ScriptObject & {
  creature?: Creature;
  key?: string;
  traits?: Record<number, number>;
  /** What the script put in the critter's hands (wield_obj_critter); not remembered for the hero. */
  wielded?: ScriptObject | null;
  /** The script told the critter to flee (critter_set_flee_state): only remembered for now. */
  fleeing?: boolean;
  /** A door on the map (for a door script's object). */
  door?: SceneDoor;
  /** A container, cabinet, safe or stash (for a container script's object). */
  container?: SceneContainer;
  /** Scenery with a script (computer, force field), for visibility and destruction. */
  prop?: SceneProp;
  /** Created by a script "nowhere" (hex 0): not visible until the script puts it in place. */
  unplaced?: boolean;
  /**
   * Created by a script on another elevation: its record in that level's state and its items. It appears when the hero gets there
   * (then the object will have a creature and no record).
   */
  stored?: { level: LevelDef; record: CreatedObject; items: [number, number][] };
  /** A fixed marker created by a script: its hex and elevation. */
  tile?: number;
  elevation?: number;
};

/** Original map scripts we don't enable yet (the V13CAVE cave is enabled: it hands out starting items by skill). */
const MAP_SCRIPTS_OFF = new Set<string>();
/** How many to put in the inventory: ammo is counted by the round, while scripts and tables give packs. */
const itemUnits = (proto: ItemProto, count: number): number => (proto.type === ITEM_TYPE.ammo ? count * Math.max(1, proto.ammo?.quantity ?? 1) : count);
/** Object kinds by the high byte of the PID. */
const PID_KIND = { item: 0, critter: 1, scenery: 2 } as const;

/** How often each NPC's critter_p_proc runs (seconds). */
const CRITTER_PROC_SECONDS = 1;
/** How often map_update_p_proc runs (seconds on the map). */
const MAP_UPDATE_SECONDS = 30;
/** The hero's step for spatial scripts (cells): an original hex is half a cell. */
const SPATIAL_STEP = 0.5;
/** Game time jumped by more than this (rest, scripted wait): update the map right away. */
const TIME_JUMP_SECONDS = 15 * 60;
/** How long to wait when leaving a map for the scripts to learn about the latest deaths (milliseconds): longer means a script hung. */
const DEATHS_WAIT_MS = 3000;
/** Overhead line colors (float_msg) by the number from the script; −1 means "in turn". */
const FLOAT_COLORS: Record<number, string> = {
  [-2]: '#ff3c28',
  0: '#e8e8e8',
  1: '#202020',
  2: '#ff3c28',
  3: '#3cf800',
  4: '#5c8cff',
  5: '#c050ff',
  6: '#f0f0f0',
  7: '#ff8070',
  8: '#fcd400',
  9: '#ffffff',
  10: '#a0a0a0',
  11: '#606060',
  12: '#c8c8c8',
};
const SEQUENTIAL_COLORS = ['#e8e8e8', '#fcd400', '#3cf800', '#ff8070', '#c8c8c8'];
const OBJECT_TRAIT = { aiPacket: 5, team: 6 } as const;
/** Closer than this (in cells) to another creature or the hero, a spot counts as occupied (critter_attempt_placement). */
const OCCUPIED_DISTANCE = 0.5;
/** How far (in hexes) to search for a free spot nearby. */
const PLACEMENT_RADIUS = 4;
/** A script-created creature whose hex is inside a wall or past the edge of the map on our side searches nearby, up to this many rings. */
const CREATE_RADIUS = 12;
/** An explosion by the original's rules: hits up to three hexes from the center and no more than seven victims (the one in the center and six around). */
const EXPLOSION_RADIUS = 3;
const EXPLOSION_VICTIMS = 7;
const EXPLOSION_SOUND = 'WHN1XXX1';

const B = String.fromCharCode(92);
/** Fallout stat numbers that scripts need. */
const STAT_MAX_HP = 7;
const STAT_MAX_AP = 8;
const STAT_AC = 9;
const STAT_MELEE_DAMAGE = 11;
const STAT_CARRY_WEIGHT = 12;
const STAT_SEQUENCE = 13;
const STAT_HEALING_RATE = 14;
const STAT_CRITICAL_CHANCE = 15;
const STAT_BETTER_CRITICALS = 16;
const STAT_RADIATION_RESISTANCE = 31;
const STAT_POISON_RESISTANCE = 32;
const STAT_AGE = 33;
const STAT_GENDER = 34;
/** The hero's PID in the original: scripts compare obj_pid with it and ask for its prototype. */
const PID_PLAYER = 0x01000000;
const STAT_CURRENT_HP = 35;
/** Hero stats for get_pc_stat. */
const PC_STAT = { unspentSkillPoints: 0, level: 1, experience: 2, reputation: 3, karma: 4 } as const;
/** The number of the "reputation" (karma) global variable in Fallout 1 scripts. */
const GVAR_REPUTATION = 0;
/**
 * "On screen" (obj_on_screen) on our maps without hex binding: this many cells around the hero (with binding, the
 * original's window, onOriginalScreen in hex.ts: Killian's assassin coming in from the side used to "not be on screen" of the view cone).
 */
const SCREEN_REACH = 6;

/** move_to of the hero to another elevation: that elevation's entry point no farther than this many cells from the hex. */
const HERO_MOVE_REACH = 3;

/** The story variable a script's load_map writes its entrance number to (VAULT13.GAM). */
const LOAD_MAP_INDEX = 'LOAD_MAP_INDEX';

/** The original map of a level (it determines the map variables, the "first visit" and the map script). */
const originalOf = (def: LevelDef): string => (def.original ?? def.id).toUpperCase();

/**
 * Where a script's load_map leads: the map is a file name ("CHILDRN1.MAP") or a number in the original's map list, the entrance is an original
 * entrance number. The level is the elevation of the map that has this entrance (the `entrances` field); if there is none, the bottom elevation, and there, as
 * in the original, the map's starting cell, i.e. where you arrive from the world map (the "wasteland" entrance), and if there is no such
 * entrance, the first one. Previously this was simply the first entrance: Maxson and Rhombus threw a caught thief out (load_map(13, 1))
 * to the elevator inside the Brotherhood bunker, where a caravan master stands in front of the door, and the hero was stuck forever.
 */
/** The "hero didn't take him into the party" variable (the dog): by script name (the original changes the dog's prototype), otherwise by PID. */
export const declinedKey = (scriptName: string, pid: number): string => `party:declined:${scriptName.toUpperCase() || pid}`;

export function destinationOf(map: string | number, entrance: number): Destination | null {
  const name = typeof map === 'string' ? map.replace(/\.MAP$/i, '').toUpperCase() : ORIGINAL_MAPS[map];
  if (!name) return null;
  const levels = Object.values(LEVELS).filter((def) => originalOf(def) === name);
  const exact = levels.find((def) => def.entrances?.[entrance] !== undefined);
  if (exact) return { map: exact.id, entry: exact.entrances![entrance]! };
  const ground = levels.find((def) => (def.elevation ?? 0) === 0) ?? levels[0];
  return ground ? { map: ground.id, entry: ground.entries?.wasteland ? 'wasteland' : '' } : null;
}

/** A creature's primary stats from its prototype (no prototype means five each). */
function creatureSpecial(o: GameObject): Special {
  const special = {} as Special;
  SPECIAL_NAMES.forEach((name, i) => (special[name] = o.critter?.stats[i] ?? 5));
  return special;
}


/**
 * Procedures the hero runs himself (his action on an object): in them source_obj is the hero. In map events
 * (map_enter_p_proc, map_update_p_proc, timed_event_p_proc, critter_p_proc) there is no source, as in the original
 * (the Military Base force field on map entry reads the shared "off" order only if it was not called by the hero).
 */
const HERO_PROCS: ReadonlySet<number> = new Set(
  ['use_p_proc', 'use_skill_on_p_proc', 'use_obj_on_p_proc', 'talk_p_proc', 'look_at_p_proc', 'description_p_proc', 'desc_p_proc', 'pickup_p_proc', 'push_p_proc', 'damage_p_proc', 'destroy_p_proc', 'barter_p_proc', 'spatial_p_proc'].map((name) => procedureNumber(name)),
);

/**
 * Which script procedure to call for a game event: its own, and if there is none, start, as in the original. Old scripts keep all
 * events in start and recognize the event by script_action (in the English copy almost a third are like that: Aradesh, guards, dogs,
 * the script of the Shady Sands village itself; in the localized one, 119); new ones also often handle in start events that have no
 * procedure of their own (the cow: conversation and examine). Client, 2026-10-28: Aradesh in the English copy "just stared silently".
 */
export function entryOf(vm: ScriptVM, proc: string): string | null {
  if (vm.has(proc)) return proc;
  return proc !== 'start' && vm.has('start') ? 'start' : null;
}
export class ScriptRuntime {
  private readonly res: Resources;
  private readonly ui: DialogueUI;
  /** SCRIPTS.LST: number → file name without ".int" (uppercase). */
  private readonly names: string[];
  private readonly globalsInit: number[];
  /** Story variable names (VAULT13.GAM), by number. */
  private readonly globalNames: string[];
  private readonly protoMsg: Map<number, string>;
  private readonly mapInit = new Map<string, number[]>();
  /** Map numbers from the original MAP headers (for cur_map_index): map name → number. */
  private readonly mapNumbers = new Map<string, number>();
  private readonly messages = new Map<number, Map<number, string>>();
  private readonly bytes = new Map<string, Uint8Array>();
  private instances = new Map<string, ScriptVM>();
  /** Which procedure each script is running right now (for script_action): a number from PROCEDURES. */
  private readonly actions = new Map<string, number>();
  /** The script name of each instance. */
  private readonly scriptNames = new Map<string, string>();
  private session: Session | null = null;
  /** The hero's character, the same one that fights and is saved (critter_mod_skill and set_critter_stat really change it). */
  private get character(): Character {
    return this.require().hero.character;
  }

  private set character(character: Character) {
    this.require().hero.setCharacter(character);
  }
  /**
   * Who asked for a conversation themselves (dialogue_system_enter), in turn: if two asked at once (Killian thanks you, and a guard
   * demands the weapon be put away), the second conversation comes after the first. Previously there was a single request, the second was lost, and the guard's timer
   * kept running, so he attacked the hero without saying a word.
   */
  private talkRequests: GameObject[] = [];
  /** by: the script that asked (the caravan driver, etc.). */
  private travelRequest: (Destination & { by?: string }) | null = null;
  /** The next map arrival is a script's load_map (it already set LOAD_MAP_INDEX). */
  private scriptArrival = false;
  /** Entering a map is in progress: items the map script gives the hero (the starting kit) come without "You picked up" lines. */
  private quietItems = false;
  /** The item the hero is using on an object right now (obj_being_used_with). */
  private usedWithItem: GameObject | null = null;
  private worldMapRequest = false;
  /** Script objects by instance key. */
  private objects = new Map<string, GameObject>();
  /** What the script is busy with now (one procedure at a time: a conversation waits, background procedures are skipped). */
  private readonly busy = new Map<string, Promise<void>>();
  /** The delayed event number the script is currently running with (fixed_param). */
  private readonly params = new Map<string, number>();
  /** How many times scripts have "used" other objects (use_obj): a console toggled the field, so something happened. */
  private usedObjects = 0;
  /** Who started the current script procedure (source_obj): an object, if not the hero. */
  private readonly sources = new Map<string, GameObject>();
  /** Objects for creatures without a script (who wounded an NPC is source_obj in its damage_p_proc). */
  private readonly plainCritters = new WeakMap<Creature, GameObject>();
  /** Seconds until the NPC's next critter_p_proc. */
  private readonly critterClock = new Map<string, number>();
  private updateLeft = MAP_UPDATE_SECONDS;
  /** Where the hero was the last time spatial scripts were checked (they fire on each of his steps). */
  private spatialFrom: { x: number; y: number } | null = null;
  /** Game time of the previous map update: if it jumped (rest, wait), update right away (the shop opened in the morning). */
  private updatedAt = 0;
  /** NPCs of this map whose death the scripts already know about (destroy_p_proc ran, or they were lying dead on entry). */
  private readonly mourned = new Set<string>();
  /** Death procedures strictly in turn, as in the original: otherwise a shared counter ("how many scorpions are left") goes wrong. */
  private deaths: Promise<void> = Promise.resolve();
  private sequence = 0;
  /** Whose scripts in this procedure forbade the game its normal action (script_overrides). */
  private readonly overridden = new Set<string>();
  /** Whose examine (look_at_p_proc) is running for the hint: its display_msg calls are collected here, not in the message window. */
  readonly heard = new Map<string, string[]>();
  /**
   * Object references in map and script variables (key as in session.vars): they are not in the save; the script puts the
   * reference when it starts (the base gates put themselves), the variable holds 1, as in the original.
   */
  private readonly objectVars = new Map<string, GameObject>();

  /** Write a script variable; o is set if the script put an object reference into it. */
  private setVar(key: string, value: number, o?: ScriptObject): void {
    this.require().vars[key] = value;
    if (o) this.objectVars.set(key, o as GameObject);
    else this.objectVars.delete(key);
  }

  /** The object in a variable (if it still holds that reference and not a number written over it). */
  private objectIn(key: string): GameObject | null {
    return this.objectVars.get(key) ?? null;
  }
  /** Which skill is being used on the script's object right now (action_being_used). */
  private readonly skillUsed = new Map<string, number>();
  /** The trade price modifier of this conversation, percent (gdialog_set_barter_mod); 0 at the start of a conversation. Trading will read it. */
  barterMod = 0;
  /** The script log (what isn't done, errors), for debugging. */
  readonly journal: string[] = [];

  private constructor(res: Resources, ui: DialogueUI, names: string[], globalsInit: number[], protoMsg: Map<number, string>, globalNames: string[] = []) {
    this.res = res;
    this.ui = ui;
    this.names = names;
    this.globalsInit = globalsInit;
    this.globalNames = globalNames;
    this.protoMsg = protoMsg;
  }

  static async load(res: Resources, ui: DialogueUI): Promise<ScriptRuntime> {
    const [list, gam, proto] = await Promise.all([
      platform.readGameFile(`SCRIPTS${B}SCRIPTS.LST`).then(parseLst),
      platform.readGameFile(`DATA${B}VAULT13.GAM`).then(parseGam),
      platform.readGameFile(`TEXT${B}ENGLISH${B}GAME${B}PROTO.MSG`).then(parseMsg),
    ]);
    const names = list.map((line) => line.split('.')[0]!.trim().toUpperCase());
    return new ScriptRuntime(res, ui, names, gam.values, proto, gam.names);
  }

  /** A story variable by its name in VAULT13.GAM (the numbering differs between copies); unknown names are ignored. */
  setGlobalByName(name: string, value: number): void {
    const n = this.globalNames.indexOf(name);
    if (n >= 0 && this.session) this.session.vars[`g${n}`] = value;
  }

  private globalByName(name: string): number {
    const n = this.globalNames.indexOf(name);
    return n < 0 || !this.session ? 0 : (this.session.vars[`g${n}`] ?? this.globalsInit[n] ?? 0);
  }

  /**
   * Saves from before 2026-10-31: Lars hid Killian and himself at home for the raid on Gizmo (LARS_N_KILLIAN_ON_CASINO), but the raid never
   * began (the entrance number was lost), the hero killed Gizmo on his own, and Killian stayed hidden for good. Gizmo dead and the hero
   * elsewhere — the raid is over: they come back.
   */
  private repairGizmoRaid(session: Session): void {
    if (this.mapName(session) === 'JUNKCSNO') return;
    if (this.globalByName('LARS_N_KILLIAN_ON_CASINO') === 1 && this.globalByName('GIZMO_DEAD') === 1) this.setGlobalByName('LARS_N_KILLIAN_ON_CASINO', 0);
  }

  /** A new playthrough (new game or load): scripts start over, variables come from the save. */
  useSession(session: Session): void {
    this.session = session;
    this.instances = new Map();
    this.objects = new Map();
    this.objectVars.clear();
    this.actions.clear();
    this.params.clear();
    this.barterMod = 0;
    this.critterClock.clear();
    this.talkRequests = [];
    this.travelRequest = null;
  }

  /**
   * The hero arrived at a level (new game, load, transition, elevator). The NPCs' scripts learn about it (map_enter_p_proc);
   * the map script only if it is a different original map (moving between elevations of one map is not a new arrival).
   */
  async enterMap(previous: LevelDef | null): Promise<void> {
    const session = this.require();
    // Arriving at another original map not by a script's load_map (an exit, the world map): no entrance number (LOAD_MAP_INDEX = 0),
    // as in the original — otherwise the Junktown script, seeing the jail entrance left over, would fine the hero on every visit.
    if (previous && originalOf(previous) !== this.mapName(session)) {
      if (!this.scriptArrival) this.setGlobalByName(LOAD_MAP_INDEX, 0);
      this.scriptArrival = false;
      this.repairGizmoRaid(session);
    }
    this.critterClock.clear();
    this.updateLeft = MAP_UPDATE_SECONDS;
    this.updatedAt = session.clock.scriptSeconds;
    // Standing on the entry point is not a step yet: spatial scripts fire when the hero starts walking.
    this.spatialFrom = { x: session.player.x, y: session.player.y };
    this.mourned.clear();
    for (const s of session.scene.scripted()) if (!s.creature.alive) this.mourned.add(s.key);
    const map = this.mapObject(session);
    if (map && (!previous || originalOf(previous) !== this.mapName(session))) {
      this.quietItems = true;
      try {
        await this.run(map, 'map_enter_p_proc');
      } finally {
        this.quietItems = false;
      }
      // The "first visit" ends right after entering: loading a save made right here won't hand out the items again.
      session.vars[`seen:${this.mapName(session)}`] = 1;
    }
    for (const s of session.scene.scripted()) {
      if (s.creature.alive && !s.creature.gone) await this.run(this.objectFor(s.key, s.creature, s.name), 'map_enter_p_proc');
    }
    for (const d of session.scene.scriptedDoors()) await this.run(this.doorObject(d), 'map_enter_p_proc');
    // Containers after the map script: a stash it created (create_object_sid) also learns about the arrival.
    for (const c of session.scene.scriptedContainers()) await this.run(this.containerObject(c), 'map_enter_p_proc');
    for (const p of session.scene.scriptedProps()) {
      p.usable = await this.hasAction(p.script.name);
      await this.run(this.propObject(p), 'map_enter_p_proc');
    }
    await this.addMerchantExtras(session);
  }

  /** Our additions to the stock (src/world/merchant-extras.ts): once, when the store first appears on the map. */
  private async addMerchantExtras(session: Session): Promise<void> {
    const map = this.mapName(session);
    for (const extra of MERCHANT_EXTRAS) {
      if (extra.map !== map) continue;
      for (const c of session.scene.scriptedContainers()) {
        if (c.script?.name !== extra.script) continue;
        const flag = `extra:${c.script.key}`;
        if (session.vars[flag]) continue;
        session.vars[flag] = 1;
        for (const [pid, count] of extra.items) {
          const proto = await this.res.item(pid);
          c.inventory.add(proto, itemUnits(proto, count));
        }
      }
    }
  }

  /** The hero leaves the level for `next` (null means the world map). Leaving an original map: map_exit_p_proc and the visit mark. */
  async leaveMap(next: LevelDef | null): Promise<void> {
    const session = this.require();
    if (next && originalOf(next) === this.mapName(session)) return;
    // First the deaths the scripts haven't learned about yet: the ambush script on exit counts whether all attackers are dead
    // (left right after the last shot: the caravan is "abandoned", no pay).
    this.mournDead(session.scene);
    await Promise.race([this.deaths, new Promise((done) => setTimeout(done, DEATHS_WAIT_MS))]);
    for (const s of session.scene.scripted()) {
      if (s.creature.alive && !s.creature.gone) await this.run(this.objectFor(s.key, s.creature, s.name), 'map_exit_p_proc');
    }
    for (const d of session.scene.scriptedDoors()) await this.run(this.doorObject(d), 'map_exit_p_proc');
    for (const c of session.scene.scriptedContainers()) await this.run(this.containerObject(c), 'map_exit_p_proc');
    const map = this.mapObject(session);
    if (map) await this.run(map, 'map_exit_p_proc');
    this.markVisited(session);
  }

  /** A game frame (only while the game runs): delayed events, NPC procedures, map update. */
  update(dt: number): void {
    const session = this.session;
    if (!session) return;
    const { scene } = session;
    const prefix = `${scene.def.id}:`;
    const mapKey = `map:${this.mapName(session)}`;
    const here = (key: string) => key === mapKey || key.startsWith(prefix);
    // The script clock runs on maps too (countdown to the explosion, radiation), the calendar doesn't.
    session.clock.tickLocal(dt);
    for (const timer of takeDueTimers(session.timers, dt, session.clock.scriptSeconds, here)) {
      const o = this.objects.get(timer.key) ?? this.findObject(timer.key);
      if (o) void this.run(o, 'timed_event_p_proc', timer.param);
    }
    this.stepSpatials(session);
    // An explosion next to scenery (the cave wall will collapse): its script learns about it.
    for (const p of scene.takePropDamage()) {
      const o = this.propObject(p);
      this.deaths = this.deaths.then(() => this.run(o, 'damage_p_proc', 0, true));
    }
    // An NPC was wounded (by the hero, another NPC, an explosion): its script learns about it, source_obj is who wounded it (Killian's assassin
    // remembers whether the hero wounded him: the "for helping Killian" XP and Killian's thanks depend on it).
    for (const { victim, by } of scene.takeCreatureHits()) {
      const s = scene.scriptOf(victim);
      if (!s) continue;
      const o = this.objectFor(s.key, victim, s.name);
      const source = by ? this.creatureObject(by) : undefined;
      this.deaths = this.deaths.then(() => this.run(o, 'damage_p_proc', 0, true, source));
    }
    this.mournDead(scene);
    for (const s of scene.scripted()) {
      if (!s.creature.alive || s.creature.gone) continue;
      // The first time with a random offset, so the NPCs don't all think in the same frame.
      let left = (this.critterClock.get(s.key) ?? Math.random() * CRITTER_PROC_SECONDS) - dt;
      if (left <= 0) {
        left += CRITTER_PROC_SECONDS;
        // Not in a fight: in the original critter_p_proc doesn't run during combat (Killian thanks the hero once the assassin is dead,
        // not in the middle of the fight; the assassin says "Gizmo says hi" once).
        if (!scene.inFight(s.creature)) void this.run(this.objectFor(s.key, s.creature, s.name), 'critter_p_proc');
      }
      this.critterClock.set(s.key, left);
    }
    this.updateLeft -= dt;
    if (session.clock.scriptSeconds - this.updatedAt > TIME_JUMP_SECONDS) this.updateLeft = 0;
    if (this.updateLeft <= 0) {
      this.updateLeft = MAP_UPDATE_SECONDS;
      this.updatedAt = session.clock.scriptSeconds;
      const map = this.mapObject(session);
      if (map) void this.run(map, 'map_update_p_proc');
      for (const s of scene.scripted()) {
        if (s.creature.alive && !s.creature.gone) void this.run(this.objectFor(s.key, s.creature, s.name), 'map_update_p_proc');
      }
      for (const d of scene.scriptedDoors()) void this.run(this.doorObject(d), 'map_update_p_proc');
      for (const c of scene.scriptedContainers()) void this.run(this.containerObject(c), 'map_update_p_proc');
      for (const p of scene.scriptedProps()) void this.run(this.propObject(p), 'map_update_p_proc');
    }
  }

  /**
   * Died: the script learns about it once (destroy_p_proc): quest counters, rewards, the scorpion tail. source_obj is
   * the killer: another NPC if he was the last to wound (Killian killed the assassin: the hero's karma doesn't change), otherwise the hero.
   */
  private mournDead(scene: Session['scene']): void {
    for (const s of scene.scripted()) {
      // Unconscious (a companion in the wasteland) is not dead: the script doesn't learn about it (otherwise it would remove him from the party).
      if (s.creature.alive || s.creature.unconscious || this.mourned.has(s.key)) continue;
      this.mourned.add(s.key);
      // Died: the quests he gave can no longer be turned in (quests.ts → giverVar).
      this.require().vars[deadVar(s.key)] = 1;
      const o = this.objectFor(s.key, s.creature, s.name);
      const killer = scene.lastHitBy(s.creature);
      const source = killer ? this.creatureObject(killer) : undefined;
      this.deaths = this.deaths.then(() => this.run(o, 'destroy_p_proc', 0, true, source));
    }
  }

  /** The script object of any creature on the map: with a script, its object; without, our own for the playthrough (only for source_obj). */
  private creatureObject(c: Creature): GameObject {
    const session = this.require();
    const s = session.scene.scriptOf(c);
    if (s) return this.objectFor(s.key, c, s.name);
    let o = this.plainCritters.get(c);
    if (!o) {
      o = { kind: 'critter', pid: session.scene.pidOf(c), name: () => c.stats.name, where: () => ({ x: c.x, y: c.y }), creature: c };
      this.plainCritters.set(c, o);
    }
    return o;
  }

  /**
   * The hero pressed E at a container with a script: first the script (use_p_proc or, on an attempt to break in, use_skill_on_p_proc),
   * then the normal action if the script doesn't object. Returns whether the search window can be opened.
   */
  async useContainer(c: SceneContainer, pick: boolean): Promise<boolean> {
    const session = this.require();
    const o = this.containerObject(c);
    const key = o.key!;
    this.overridden.delete(key);
    if (pick) this.skillUsed.set(key, SKILL.lockpick);
    try {
      await this.run(o, pick ? 'use_skill_on_p_proc' : 'use_p_proc', 0, true);
    } finally {
      this.skillUsed.delete(key);
    }
    if (this.overridden.delete(key)) {
      c.knownLocked = !pick;
      return false;
    }
    if (pick && !c.locked) {
      c.knownLocked = false;
      session.say(t('msgDoorWontOpen'));
      return false;
    }
    return pick ? session.scene.pickContainer(c) : session.scene.operateContainer(c);
  }

  /**
   * The hero pressed E at a door with a script: first the script (use_p_proc, and on an attempt to pick the lock, use_skill_on_p_proc
   * with Lockpick), then the normal action if the script didn't forbid it (script_overrides). If it forbade it and the door is locked,
   * the hero has learned it is locked: the next E is an attempt to pick it.
   */
  async useDoor(d: SceneDoor, pick: boolean): Promise<void> {
    const session = this.require();
    // From the inside out the door always opens (openFrom): the script is asked only from outside.
    if (!pick && d.openFrom && sideOfDoor(d, session.player.x, session.player.y) === d.openFrom) {
      session.scene.operateDoor(d);
      return;
    }
    const o = this.doorObject(d);
    const key = o.key!;
    this.overridden.delete(key);
    if (pick) this.skillUsed.set(key, SKILL.lockpick);
    try {
      await this.run(o, pick ? 'use_skill_on_p_proc' : 'use_p_proc', 0, true);
    } finally {
      this.skillUsed.delete(key);
    }
    const overridden = this.overridden.delete(key);
    // The script refused the normal action (locked, a pass is needed…): the next E will try to pick the lock; after the attempt
    // to pick it, the normal action again (the script may have unlocked it itself).
    if (overridden) {
      d.knownLocked = !pick;
      return;
    }
    if (!pick) session.scene.operateDoor(d);
    else if (d.locked) session.scene.pickLock(d);
    else {
      // There is no lock and the script didn't accept the pick: the door still won't give (its refusal can't be bypassed).
      d.knownLocked = false;
      session.say(t('msgDoorWontOpen'));
    }
  }

  /** A script asked to open the world map (world_map): the game will take the request. */
  takeWorldMapRequest(): boolean {
    const asked = this.worldMapRequest;
    this.worldMapRequest = false;
    return asked;
  }

  /** A script asked to move to another map (load_map): the game will take the request. */
  takeTravelRequest(): (Destination & { by?: string }) | null {
    const request = this.travelRequest;
    this.travelRequest = null;
    return request;
  }

  /**
   * Record that the hero is leaving the map now: days_since_visited and the "first visit" (meta rule) depend on it.
   * In the original the time is recorded on leaving the map; the transition between maps must call this (session.ts).
   */
  markVisited(session: Session = this.require()): void {
    session.vars[this.visitKey(session)] = session.clock.seconds;
  }

  /** A script asked to start a conversation itself (dialogue_system_enter): the game will take the first request from the queue. */
  takeTalkRequest(): GameObject | null {
    return this.talkRequests.shift() ?? null;
  }

  /** Conversation with an NPC: run his script's talk_p_proc and wait for the conversation to end. */
  async talk(creature: Creature, scriptName: string, key: string): Promise<void> {
    const session = this.require();
    const self = this.objectFor(key, creature, scriptName);
    try {
      this.barterMod = 0;
      // If the NPC's script is busy with something now (e.g. his procedure hasn't finished yet), the conversation will wait.
      await this.lock(key, true, async () => {
        const vm = await this.ready(self);
        // The script has no conversation: E examines the NPC, like clicking "examine" in the original: his description. An old
        // script (everything in start) gets the "talk" event, as in the original.
        const describe = ['description_p_proc', 'desc_p_proc', 'look_at_p_proc'].find((p) => vm.has(p));
        const said = session.spoken;
        let talked = false;
        const open = this.ui.open;
        this.ui.open = (...args) => {
          talked = true;
          open.apply(this.ui, args);
        };
        const call = async (proc: string) => {
          this.actions.set(key, procedureNumber(proc));
          this.params.set(key, 0);
          await vm.call(entryOf(vm, proc)!);
        };
        try {
          this.ui.onBarter = () => this.barterButton(self, creature);
          if (vm.has('talk_p_proc')) {
            await call('talk_p_proc');
            return;
          }
          if (entryOf(vm, 'talk_p_proc')) await call('talk_p_proc');
          if (!talked && session.spoken === said && describe) await call(describe);
        } finally {
          this.ui.open = open;
        }
        if (!talked && session.spoken === said) await this.describeCritter(self, creature);
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.note(message);
      session.say(t('msgScriptError'));
      if (!(e instanceof ScriptError)) console.error(e);
    } finally {
      this.actions.set(key, 0);
      this.ui.onBarter = null;
      this.ui.close();
    }
  }

  /**
   * The "Barter" button in a conversation, as in the original: you can trade with anyone whose prototype has the "barters" flag (almost all
   * people, with their own items; no Fallout 1 script intercepts this, nobody has barter_p_proc). Prices are
   * as in scripted trading, with the conversation's modifier (gdialog_set_barter_mod). Returns what to say if it is not possible.
   */
  private async barterButton(self: GameObject, creature: Creature): Promise<string | void> {
    // No trading with a companion: items are passed to him with Steal (client, 2026-10-23).
    if (this.require().isCompanion(creature)) return t('msgCompanionBarter');
    const proto = self.critter;
    if (!proto || (proto.critterFlags & CRITTER_FLAG.barter) === 0 || !creature.alive) return t('msgNoBarter');
    if (!this.ui.barter) return;
    const hero = this.require().hero;
    const trade = new Trade(hero.inventory, creature.inventory, {
      heroBarter: hero.fighter.skills[SKILL.barter] ?? 0,
      merchantBarter: Math.min(SKILL_MAX, skillBase(creatureSpecial(self), SKILL.barter) + (proto.skillPoints[SKILL.barter] ?? 0)),
      modifier: this.barterMod,
    });
    await this.ui.barter(trade, creature.stats.name);
  }

  /**
   * "Examine" (V mode, like the eye in the original): "You see: …", for a creature, how badly it is wounded; then the description:
   * the object's script writes it (description_p_proc), and if there is no script or it stayed silent, the description from the prototype in the player's copy.
   */
  async examine(target: Examined): Promise<void> {
    const session = this.require();
    const data = this.res.data;
    let o: GameObject | null = null;
    let name = '';
    let about = '';
    let state = '';
    // An NPC: first what his look-at script says about him (before you meet, without the name).
    let seen: string | null = null;
    switch (target.kind) {
      case 'creature': {
        const c = target.creature;
        name = c.stats.name;
        seen = (await this.lookAt(c)) ?? null;
        const s = session.scene.scriptOf(c);
        if (s) o = this.objectFor(s.key, c, s.name);
        const pid = session.scene.pidOf(c);
        const proto = pid ? await data.critter(pid).catch(() => null) : null;
        about = proto ? data.critterDescription(proto) : '';
        state = t(healthLook(c.alive ? c.hp / Math.max(1, c.stats.maxHp) : 0));
        break;
      }
      case 'pickup':
        name = this.res.itemName(target.proto);
        about = data.itemDescription(target.proto);
        break;
      case 'container':
        name = this.res.itemName(target.container.proto);
        about = data.itemDescription(target.container.proto);
        if (target.container.script) o = this.containerObject(target.container);
        break;
      case 'prop': {
        name = target.prop.name;
        o = this.propObject(target.prop);
        const proto = await data.scenery(target.prop.pid);
        about = proto ? (await data.sceneryText(proto)).description : '';
        break;
      }
      case 'scenery': {
        const proto = await data.scenery(target.pid);
        const text = proto ? await data.sceneryText(proto) : { name: '', description: '' };
        name = text.name;
        about = text.description;
        break;
      }
    }
    session.say((seen ?? tf('msgLookSee', { name: name || '?' })) + (state ? ' ' + state : ''));
    const said = session.spoken;
    if (o) {
      const vm = await this.ready(o).catch(() => null);
      const proc = vm ? (['description_p_proc', 'desc_p_proc'].find((p) => vm.has(p)) ?? (entryOf(vm, 'description_p_proc') && 'description_p_proc')) : undefined;
      if (proc) await this.run(o, proc, 0, true);
    }
    if (session.spoken === said && about && about !== name) session.say(about);
  }

  /**
   * What the player sees when looking at an NPC, as with the cursor hover in the original (look_at_p_proc): until you meet,
   * the script describes the appearance ("a sturdy guy with a rifle"), then names him ("Seth, the head of the guard"). No look-at
   * script or it stayed silent: null (then "You see: <name from the prototype>"); the script is busy (a conversation is on): undefined, ask later.
   */
  async lookAt(creature: Creature): Promise<string | null | undefined> {
    const session = this.require();
    const s = session.scene.scriptOf(creature);
    if (!s || !creature.alive) return null;
    return this.lookAtObject(this.objectFor(s.key, creature, s.name));
  }

  /**
   * The same for a door with a script: looking at it runs its look_at_p_proc, as with the cursor hover in the original. The script
   * may remember something along the way: the Military Base gates put themselves into a map variable, and Katja later opens them.
   */
  async lookAtDoor(d: SceneDoor): Promise<string | null | undefined> {
    return d.script ? this.lookAtObject(this.doorObject(d)) : null;
  }

  private async lookAtObject(o: GameObject): Promise<string | null | undefined> {
    const key = o.key!;
    const name = this.scriptNames.get(key) ?? key;
    const vm = await this.ready(o).catch(() => null);
    const entry = vm ? entryOf(vm, 'look_at_p_proc') : null;
    if (!vm || !entry) return null;
    let text: string | null = null;
    // Catch only the messages of the examine itself: collection happens inside this script's procedure queue; if busy, don't wait.
    const done = await this.lock(key, false, async () => {
      const lines: string[] = [];
      this.heard.set(key, lines);
      this.actions.set(key, procedureNumber('look_at_p_proc'));
      try {
        await vm.call(entry);
      } catch (e) {
        this.note(`${name}, look_at_p_proc: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        this.heard.delete(key);
        this.actions.set(key, 0);
        this.overridden.delete(key);
      }
      text = lines.join(' ').trim() || null;
    });
    return done ? text : undefined;
  }

  /** The NPC's description from his prototype (and if there is none either, "silent"). */
  private async describeCritter(self: GameObject, creature: Creature): Promise<void> {
    const session = this.require();
    const pid = self.pid || session.scene.pidOf(creature);
    const proto = pid ? await this.res.data.critter(pid).catch(() => null) : null;
    const text = proto ? this.res.data.critterDescription(proto) : '';
    session.say(text || tf('msgSilent', { name: creature.stats.name }));
  }

  /** The NPC's script object: one and the same for the whole playthrough, the creature is substituted anew. */
  private objectFor(key: string, creature: Creature, scriptName: string): GameObject {
    let o = this.objects.get(key);
    if (!o) {
      const self: GameObject = {
        kind: 'critter',
        pid: 0,
        key,
        name: () => self.creature?.stats.name ?? '',
        where: () => (self.creature ? { x: self.creature.x, y: self.creature.y } : null),
      };
      o = self;
      this.objects.set(key, o);
    }
    o.creature = creature;
    delete o.stored;
    this.scriptNames.set(key, scriptName);
    return o;
  }

  /**
   * A script moves the hero (move_to). The hero is placed by the level's entry points, not by scripts: our levels are made "inspired by" the originals,
   * a hex may end up inside a wall. So on the same elevation, nothing (−1). To another elevation of the same map
   * (climbing down a rope into the Vault 15 shaft, stairs), a transition to that elevation's entry point near this hex.
   */
  private moveHeroTo(tile: number, elevation: number): number {
    const here = this.require().scene.def;
    if (elevation === (here.elevation ?? 0)) return -1;
    const level = this.levelOf(originalOf(here), elevation);
    if (!level?.hexFrame) return -1;
    const at = hexCenter(level.hexFrame, tile);
    let best = '';
    let bestDist = HERO_MOVE_REACH;
    for (const [name, e] of Object.entries(level.entries ?? {})) {
      const d = Math.hypot(e.x - at.x, e.y - at.y);
      if (d <= bestDist) {
        best = name;
        bestDist = d;
      }
    }
    // An entry point nearby: use it (facing as intended); none: exactly at the hex (Garl's duel: back to the camp,
    // where the hero stood).
    this.travelRequest = best ? { map: level.id, entry: best } : { map: level.id, entry: '', tile };
    return 0;
  }

  /** The NPC is left without a weapon in hand (the script took all his items): he fights with what nature gave him. */
  private async disarm(creature: Creature): Promise<void> {
    const { scene } = this.require();
    const kind = scene.kindOfCreature(creature);
    if (!kind) return;
    const bare = await this.res.critterKind(kind.pid, 0);
    creature.rearm(bare.weapon, bare.art, null);
    scene.setKind(creature, bare);
  }

  /**
   * A script moves an NPC to another elevation of the same map where it has just sent the hero too (Garl takes the hero to
   * the arena): the NPC goes there together with the hero and stays there as an NPC. Returns whether it worked.
   */
  private carryAlong(creature: Creature, tile: number, elevation: number): boolean {
    const session = this.require();
    const level = this.levelOf(originalOf(session.scene.def), elevation);
    if (!level?.hexFrame || this.travelRequest?.map !== level.id) return false;
    // Companions follow the hero anyway.
    if (session.isCompanion(creature)) return true;
    return session.carryAlong(creature, level.id, hexCenter(level.hexFrame, tile), tile);
  }

  /** The level by original map and elevation (null means we don't have one). */
  private levelOf(map: string, elevation: number): LevelDef | null {
    return Object.values(LEVELS).find((def) => originalOf(def) === map && (def.elevation ?? 0) === elevation) ?? null;
  }

  /** A door's script object: one for the whole playthrough, the door is substituted anew (a new one on each visit to the map). */
  private doorObject(d: SceneDoor): GameObject {
    const key = d.script!.key;
    let o = this.objects.get(key);
    if (!o) {
      const self: GameObject = {
        kind: 'scenery',
        pid: 0,
        key,
        name: () => '',
        where: () => (self.door ? { x: self.door.door.cx + 0.5, y: self.door.door.cy + 0.5 } : null),
      };
      o = self;
      this.objects.set(key, o);
    }
    o.door = d;
    o.soundCode = d.sound;
    o.tile = d.tile;
    this.scriptNames.set(key, d.script!.name);
    return o;
  }

  /** A scenery script object (wall, computer): one for the whole playthrough. */
  private propObject(p: SceneProp): GameObject {
    const key = p.script.key;
    let o = this.objects.get(key);
    if (!o) {
      o = { kind: 'scenery', pid: p.pid, key, name: () => p.name, where: () => ({ x: p.x, y: p.y }) };
      this.objects.set(key, o);
    }
    o.prop = p;
    o.tile = p.tile;
    this.scriptNames.set(key, p.script.name);
    return o;
  }

  /**
   * The hero pressed E at scenery with a script: its script decides (use_p_proc). If there is no such procedure, examine
   * (description_p_proc or look_at_p_proc), and if that says nothing either, "nothing happens".
   */
  async useProp(p: SceneProp): Promise<void> {
    const session = this.require();
    const o = this.propObject(p);
    const vm = await this.ready(o).catch(() => null);
    const said = session.spoken;
    const used = this.usedObjects;
    const proc = vm ? ['use_p_proc', 'description_p_proc', 'desc_p_proc', 'look_at_p_proc'].find((name) => vm.has(name)) ?? (entryOf(vm, 'use_p_proc') && 'use_p_proc') : undefined;
    // The script may have opened a conversation (terminal): then we don't write "nothing happens".
    let talked = false;
    const open = this.ui.open;
    this.ui.open = (...args) => {
      talked = true;
      open.apply(this.ui, args);
    };
    try {
      if (proc) await this.run(o, proc, 0, true);
    } finally {
      this.ui.open = open;
    }
    if (talked) this.ui.close();
    // The script asked for a conversation (terminal): it opens on the next frame; we don't write "nothing happens".
    else if (session.spoken === said && this.usedObjects === used && !this.talkRequests.some((r) => r.prop === p)) session.say(t('msgNothingHappens'));
  }

  /** "Conversation" with scenery is the terminal screen: its talk_p_proc (the script asks for it via dialogue_system_enter). */
  async talkProp(p: SceneProp): Promise<void> {
    await this.talkObject(this.propObject(p));
  }

  /**
   * "Conversation" with an object with no NPC is its talk_p_proc: scenery, a spot on the floor (a rented room in the Crash House
   * asks whether to go to sleep when the hero stands at the bed), a door, a container.
   */
  async talkObject(o: GameObject): Promise<void> {
    try {
      await this.run(o, 'talk_p_proc', 0, true);
    } finally {
      this.ui.close();
    }
  }

  /**
   * Use an item on whatever is in front of the hero (the chip on a computer, the rope on a well): its script's use_obj_on_p_proc,
   * the script sees the item as obj_being_used_with. Returns 'none' if the target has no such script, 'done' if the script
   * ran, 'refused' if the script took over (script_overrides: the antidote for Jarvis, the game doesn't give the medicine).
   */
  async useItemOn(target: { prop?: SceneProp; door?: SceneDoor; container?: SceneContainer; creature?: Creature }, proto: ItemProto): Promise<'none' | 'done' | 'refused'> {
    const session = this.require();
    let o: GameObject | null = null;
    if (target.prop) o = this.propObject(target.prop);
    else if (target.door?.script) o = this.doorObject(target.door);
    else if (target.container?.script) o = this.containerObject(target.container);
    else if (target.creature) {
      const s = session.scene.scriptOf(target.creature);
      if (s) o = this.objectFor(s.key, target.creature, s.name);
    }
    if (!o) return 'none';
    const vm = await this.ready(o).catch(() => null);
    if (!vm || !entryOf(vm, 'use_obj_on_p_proc')) return 'none';
    const key = o.key!;
    const said = session.spoken;
    this.overridden.delete(key);
    this.usedWithItem = { kind: 'item', pid: proto.pid, proto, name: () => this.res.itemName(proto) };
    try {
      await this.run(o, 'use_obj_on_p_proc', 0, true);
    } finally {
      this.usedWithItem = null;
    }
    if (this.overridden.delete(key)) return 'refused';
    return vm.has('use_obj_on_p_proc') || session.spoken !== said ? 'done' : 'none';
  }

  /**
   * A skill from the Skilldex on a target (Science on a computer, Doctor on a wounded person): its script's use_skill_on_p_proc, the skill
   * is seen as action_being_used. Returns 'none' if the target has no such script (the game decides itself), 'done' if the script
   * ran, 'refused' if the script refused the normal action (script_overrides).
   */
  async useSkillOn(target: { prop?: SceneProp; door?: SceneDoor; container?: SceneContainer; creature?: Creature }, skill: number): Promise<'none' | 'done' | 'refused'> {
    const session = this.require();
    let o: GameObject | null = null;
    if (target.prop) o = this.propObject(target.prop);
    else if (target.door?.script) o = this.doorObject(target.door);
    else if (target.container?.script) o = this.containerObject(target.container);
    else if (target.creature) {
      const s = session.scene.scriptOf(target.creature);
      if (s) o = this.objectFor(s.key, target.creature, s.name);
    }
    if (!o) return 'none';
    const vm = await this.ready(o).catch(() => null);
    if (!vm || !entryOf(vm, 'use_skill_on_p_proc')) return 'none';
    const key = o.key!;
    const said = session.spoken;
    this.overridden.delete(key);
    this.skillUsed.set(key, skill);
    try {
      await this.run(o, 'use_skill_on_p_proc', 0, true);
    } finally {
      this.skillUsed.delete(key);
    }
    if (this.overridden.delete(key)) return 'refused';
    return vm.has('use_skill_on_p_proc') || session.spoken !== said ? 'done' : 'none';
  }

  /** A container's script object: one for the whole playthrough, the container is substituted anew. */
  private containerObject(c: SceneContainer): GameObject {
    const key = c.script?.key ?? `${this.require().scene.def.id}:${c.key}`;
    let o = this.objects.get(key);
    if (!o) {
      const self: GameObject = {
        kind: 'item',
        pid: c.proto.pid,
        proto: c.proto,
        key,
        name: () => this.res.itemName(c.proto),
        where: () => (self.container ? { x: self.container.x, y: self.container.y } : null),
      };
      o = self;
      this.objects.set(key, o);
    }
    o.container = c;
    o.tile = c.tile;
    if (c.script) this.scriptNames.set(key, c.script.name);
    return o;
  }

  /**
   * Spatial scripts (spatial_p_proc), as in the original: on each of the hero's steps (a hex is half a cell) within their
   * circle. Scripts remember themselves what they have already said (the sign at the rubble, once); the trap and the burning field fire on every step.
   */
  private stepSpatials(session: Session): void {
    const { player, scene } = session;
    const from = this.spatialFrom;
    if (from && Math.hypot(player.x - from.x, player.y - from.y) < SPATIAL_STEP) return;
    this.spatialFrom = { x: player.x, y: player.y };
    if (!from || !session.hero.alive) return;
    for (const sp of scene.scriptedSpatials()) {
      if (Math.hypot(player.x - sp.x, player.y - sp.y) <= sp.radius) void this.run(this.spatialObject(sp), 'spatial_p_proc');
    }
  }

  /** A spatial script's object: a spot without a picture. */
  private spatialObject(sp: SceneSpatial): GameObject {
    const key = sp.script.key;
    let o = this.objects.get(key);
    if (!o) {
      o = { kind: 'scenery', pid: 0, key, name: () => '', where: () => ({ x: sp.x, y: sp.y }) };
      this.objects.set(key, o);
    }
    o.tile = sp.tile;
    this.scriptNames.set(key, sp.script.name);
    return o;
  }

  /** The map's own script object (it has no spot and no creature). */
  private mapObject(session: Session): GameObject | null {
    const original = MAP_SCRIPTS[this.mapName(session)]?.script;
    const name = session.scene.def.script ?? (original && !MAP_SCRIPTS_OFF.has(original) ? original : undefined);
    if (!name) return null;
    const key = `map:${this.mapName(session)}`;
    let o = this.objects.get(key);
    if (!o) {
      o = { kind: 'scenery', pid: 0, key, name: () => '' };
      this.objects.set(key, o);
    }
    this.scriptNames.set(key, name.toUpperCase());
    return o;
  }

  /** An object by key from a saved delayed event (after loading the objects are not created yet). */
  private findObject(key: string): GameObject | null {
    const session = this.require();
    if (key.startsWith('map:')) return this.mapObject(session);
    const door = session.scene.scriptedDoors().find((d) => d.script!.key === key);
    if (door) return this.doorObject(door);
    const box = session.scene.scriptedContainers().find((c) => c.script!.key === key);
    if (box) return this.containerObject(box);
    const prop = session.scene.scriptedProps().find((p) => p.script.key === key);
    if (prop) return this.propObject(prop);
    const spatial = session.scene.scriptedSpatials().find((sp) => sp.script.key === key);
    if (spatial) return this.spatialObject(spatial);
    const s = session.scene.scripted().find((one) => one.key === key);
    return s ? this.objectFor(s.key, s.creature, s.name) : null;
  }

  /** Run a procedure of an object's script "in the background": if the script is busy, skip (wait means wait for it); errors go to the log. */
  private async run(o: GameObject, proc: string, param = 0, wait = false, source?: GameObject): Promise<void> {
    const key = o.key!;
    try {
      await this.lock(key, wait, async () => {
        const vm = await this.ready(o);
        const entry = entryOf(vm, proc);
        if (!entry) return;
        this.actions.set(key, procedureNumber(proc));
        this.params.set(key, param);
        if (source) this.sources.set(key, source);
        try {
          await vm.call(entry);
        } finally {
          this.actions.set(key, 0);
          this.params.set(key, 0);
          this.sources.delete(key);
        }
      });
    } catch (e) {
      this.note(`${this.scriptNames.get(key) ?? key}, ${proc}: ${e instanceof Error ? e.message : String(e)}`);
      if (!(e instanceof ScriptError)) console.error(e);
    }
  }

  /** The object's script is ready for procedure calls: the prototype is known, the messages are loaded, the initial run is done. */
  private async ready(o: GameObject): Promise<ScriptVM> {
    const session = this.require();
    const key = o.key!;
    const name = this.scriptNames.get(key)!;
    if (o.kind === 'critter' && !o.pid) await this.describe(o, session);
    // Everything the script reads "immediately" is ready before its initial run.
    await this.prepare(name, session);
    return this.instance(key, name, o);
  }

  /** One script procedure at a time. wait means wait until the script is free; otherwise skip (false). */
  private async lock(key: string, wait: boolean, job: () => Promise<void>): Promise<boolean> {
    for (let current = this.busy.get(key); current; current = this.busy.get(key)) {
      if (!wait) return false;
      await current;
    }
    const done = job();
    const settled = done.then(
      () => {},
      () => {},
    );
    this.busy.set(key, settled);
    try {
      await done;
    } finally {
      if (this.busy.get(key) === settled) this.busy.delete(key);
    }
    return true;
  }

  /** Learn about an NPC what scripts need: the creature's number and prototype (a level NPC or one created by a script), the image name for sounds. */
  private async describe(self: GameObject, session: Session): Promise<void> {
    const pid = self.creature ? session.scene.pidOf(self.creature) : 0;
    if (!pid) return;
    self.pid = pid;
    try {
      self.critter = await this.res.data.critter(pid);
      self.artBase = this.res.data.critterArtBase(self.critter);
    } catch {
      this.note(`no creature prototype ${pid}`);
    }
  }

  /** Play a sound from the player's copy by name; at is the object it is heard from. No such file in the copy means silence. */
  private playSound(name: string, at?: ScriptObject): void {
    const file = name.trim().toUpperCase();
    if (!/^[A-Z0-9_]+$/.test(file)) return;
    const where = at && at.kind !== 'dude' ? at.where?.() : null;
    void platform.gameFileExists(`SOUND${B}SFX${B}${file}.ACM`).then((found) => {
      if (!found || !this.session) return;
      if (where) this.res.sound.playAt(file, where.x, where.y, this.session.player);
      else this.res.sound.play(file);
    });
  }

  private require(): Session {
    if (!this.session) throw new Error('Scripts without a playthrough');
    return this.session;
  }

  private note(text: string): void {
    this.journal.push(text);
    console.warn('[scripts]', text);
  }

  /** Preload what the script reads "immediately": its messages and the map variables. */
  private async prepare(scriptName: string, session: Session): Promise<void> {
    const index = this.names.indexOf(scriptName.toUpperCase());
    if (index >= 0) await this.loadMessages(index + 1);
    await this.loadMapVars(this.mapName(session));
  }

  private mapName(session: Session): string {
    return originalOf(session.scene.def);
  }

  /** Key in session.vars: when the hero last left this map (game seconds). */
  private visitKey(session: Session): string {
    return `visit:${this.mapName(session)}`;
  }

  private async loadMessages(list: number): Promise<Map<number, string>> {
    let msg = this.messages.get(list);
    if (!msg) {
      const name = this.names[list - 1];
      msg = new Map();
      // Many scripts (rats, dogs) have no dialogue file, which is normal: we don't request it or write to the log.
      const file = `TEXT${B}ENGLISH${B}DIALOG${B}${name}.MSG`;
      if (name && (await platform.gameFileExists(file))) {
        try {
          msg = parseMsg(await platform.readGameFile(file));
          fixMessages(name, msg);
        } catch {
          this.note(`cannot read message file ${name}.MSG`);
        }
      }
      this.messages.set(list, msg);
    }
    return msg;
  }

  private async loadMapVars(map: string): Promise<void> {
    if (!this.mapNumbers.has(map)) {
      const file = `MAPS${B}${map}.MAP`;
      try {
        this.mapNumbers.set(map, (await platform.gameFileExists(file)) ? parseMapHeader(await platform.readGameFile(file)).mapNumber : -1);
      } catch {
        this.mapNumbers.set(map, -1);
      }
    }
    if (this.mapInit.has(map)) return;
    // Some maps have no initial variable values (VAULTBUR, our wasteland): then all zeros.
    const gam = `MAPS${B}${map}.GAM`;
    try {
      this.mapInit.set(map, (await platform.gameFileExists(gam)) ? parseGam(await platform.readGameFile(gam)).values : []);
    } catch {
      this.mapInit.set(map, []);
    }
  }

  /** Whether the script has an action on E: use, skill, item on object or conversation. No file means we assume it does. */
  private async hasAction(scriptName: string): Promise<boolean> {
    try {
      const prog = await this.program(scriptName);
      const procs = prog.procedures().map((p) => p.name.toLowerCase());
      // An old script (no event procedures at all, everything in start): the action may be in start.
      if (procs.includes('start') && !procs.some((n) => n.endsWith('_p_proc'))) return true;
      return ['use_p_proc', 'use_skill_on_p_proc', 'use_obj_on_p_proc', 'talk_p_proc'].some((n) => prog.findProcedure(n) >= 0);
    } catch {
      return true;
    }
  }

  /** Whether to take into the party someone who asks to join (the dog): "yes" is true. If a conversation is already open, the question goes there. */
  async askJoin(creature: Creature): Promise<boolean> {
    const open = this.ui.isOpen ?? false;
    if (!open) this.ui.open(creature.stats.name);
    const choice = await this.ui.ask(tf('dogJoinAsk', { name: creature.stats.name }), [t('dogJoinTake'), t('dogJoinLeave')]);
    if (!open) this.ui.close();
    return choice === 0;
  }

  /** Scripted traders: script name → whether it has trading (gdialog_barter). */
  private readonly traders = new Map<string, Promise<boolean>>();

  /**
   * Whether this is a real trader: the NPC's script has trading (gdialog_barter) (Beth, Jake, Killian, Razlo, etc.),
   * not just any NPC with the "barters" flag in the prototype (companion-talk.ts: who the companion buys weapons from).
   */
  trades(scriptName: string): Promise<boolean> {
    const name = scriptName.toUpperCase();
    let known = this.traders.get(name);
    if (!known) {
      known = this.program(name).then(
        (prog) => disassemble(prog).some((ins) => ins.name === 'gdialog_barter'),
        () => false,
      );
      this.traders.set(name, known);
    }
    return known;
  }

  /**
   * A trader's stock: the original's traders keep it in their own container, and the script moves it to themselves only for the
   * duration of the trade (Get_Stuff: a shared variable with the container → move_obj_inven_to_obj to self). We look for this move in the script and take
   * the container's items from the shared variable. If there is none, null (the stock, if any, is in the NPC's own items).
   */
  async stockOf(scriptName: string): Promise<Inventory | null> {
    const prog = await this.program(scriptName.toUpperCase()).catch(() => null);
    if (!prog) return null;
    const list = disassemble(prog);
    for (let i = 1; i + 2 < list.length; i++) {
      if (list[i]!.name !== 'fetch_external' || list[i + 1]!.name !== 'self_obj' || list[i + 2]!.name !== 'move_obj_inven_to_obj') continue;
      const push = list[i - 1]!;
      if (push.name !== 'push') continue;
      const value = externalVars().get(prog.identifier(prog.long(push.at + 2)).toLowerCase());
      const box = value?.t === 'p' ? (value.v as GameObject) : null;
      if (box?.container) return box.container.inventory;
      if (box?.creature) return box.creature.inventory;
    }
    return null;
  }

  private async program(scriptName: string): Promise<IntProgram> {
    const name = scriptName.toUpperCase();
    let bytes = this.bytes.get(name);
    if (!bytes) {
      bytes = await platform.readGameFile(`SCRIPTS${B}${name}.INT`);
      this.bytes.set(name, bytes);
    }
    // A separate copy for each NPC: the procedure table changes during the game.
    return new IntProgram(name, bytes);
  }

  private async instance(key: string, scriptName: string, self: GameObject): Promise<ScriptVM> {
    let vm = this.instances.get(key);
    if (vm) return vm;
    const ctx = this.context(key, scriptName, self);
    vm = new ScriptVM(await this.program(scriptName), {
      call: (machine, code, args) => callGameFunction(ctx, machine, code, args),
      now: () => (this.session?.clock.scriptSeconds ?? 0) * 1000,
      log: (text) => this.note(text),
    });
    this.instances.set(key, vm);
    // The script's initial run is the "start" procedure.
    this.actions.set(key, procedureNumber('start'));
    await vm.init();
    this.actions.set(key, 0);
    return vm;
  }

  /** What one NPC's script sees. */
  private context(key: string, scriptName: string, self: GameObject): ScriptContext {
    const runtime = this;
    const session = () => runtime.require();
    const dude: GameObject = {
      kind: 'dude',
      pid: PID_PLAYER,
      name: () => session().hero.character.name || t('heroName'),
      where: () => ({ x: session().player.x, y: session().player.y }),
    };
    /**
     * A container the script keeps in a variable (Garl's chest): on this map, the scene's container (if we came back to the map, it's
     * a new one, and we take that); on another map, null, its items are in that map's state (containerAway).
     */
    const containerHere = (g: GameObject) => {
      const box = g.container;
      if (!box || !g.key) return box ?? null;
      const { scene } = session();
      if (!g.key.startsWith(`${scene.def.id}:`)) return null;
      const live = scene.containerByKey(box.key);
      if (live) g.container = live;
      return live ?? box;
    };
    const containerAway = (g: GameObject) => {
      if (!g.container || !g.key) return undefined;
      const level = g.key.slice(0, g.key.indexOf(':'));
      return level && level !== session().scene.def.id ? (session().storedContainer(level, g.container.key) ?? undefined) : undefined;
    };
    const inventoryOf = (o: ScriptObject) => {
      if (o.kind === 'dude') return session().hero.inventory;
      const g = o as GameObject;
      return g.creature?.inventory ?? (g.container ? (containerHere(g)?.inventory ?? null) : null);
    };
    /** Items of a creature created on another elevation or of a container on another map: [pid, count] in that level's state. */
    const storedItems = (o: ScriptObject) => (o as GameObject).stored?.items ?? containerAway(o as GameObject);
    const storedCount = (items: [number, number][], pid: number) => items.filter(([p]) => p === pid).reduce((sum, [, n]) => sum + n, 0);
    const vars = () => session().vars;
    const creatureOf = (o: ScriptObject) => (o as GameObject).creature;
    /** The middle of the hex on our level, if it is on this elevation and not in a wall. */
    const placeOf = (tile: number, elevation: number) => {
      const { scene } = session();
      const frame = scene.def.hexFrame;
      if (!frame || elevation !== (scene.def.elevation ?? 0) || tile < 0) return null;
      const at = hexCenter(frame, tile);
      // Not right against a wall: the NPC's picture doesn't go into it (clearOfWalls).
      return wallAt(scene.level, at.x, at.y) ? null : clearOfWalls(scene.level, at.x, at.y);
    };
    /**
     * A free spot at hex tile: the hex itself, and if there is a wall there (or it is past the edge of our cropped map) or it is occupied,
     * its neighbors in rings, up to radius rings. Not right next to the hero or the others (except who).
     */
    const freeNear = (tile: number, elevation: number, radius: number, who?: Creature) => {
      const { scene, player } = session();
      const free = (x: number, y: number) =>
        Math.hypot(player.x - x, player.y - y) >= OCCUPIED_DISTANCE &&
        !scene.creatures.some((other) => other !== who && other.alive && other.present && Math.hypot(other.x - x, other.y - y) < OCCUPIED_DISTANCE);
      // In rings from the desired hex: first the hex itself, then its neighbors, then the neighbors' neighbors…
      const seen = new Set([tile]);
      let ring = [tile];
      for (let r = 0; r <= radius && ring.length > 0; r++) {
        for (const t of ring) {
          const at = placeOf(t, elevation);
          if (at && free(at.x, at.y)) return at;
        }
        const next: number[] = [];
        for (const t of ring) {
          for (let rotation = 0; rotation < ROTATION_COUNT; rotation++) {
            const neighbour = tileInDirection(t, rotation, 1);
            if (neighbour >= 0 && !seen.has(neighbour)) {
              seen.add(neighbour);
              next.push(neighbour);
            }
          }
        }
        ring = next;
      }
      return null;
    };
    const hour = () => session().clock.date.hour;
    const doorOf = (o: ScriptObject) => (o as GameObject).door;
    /** What can be locked: a door or a container. */
    const lockOf = (o: ScriptObject) => (o as GameObject).door ?? (o as GameObject).container;
    /** Something created "nowhere" has been put in place: now it is visible. */
    const placed = (o: ScriptObject) => {
      const g = o as GameObject;
      if (!g.unplaced) return;
      g.unplaced = false;
      if (g.creature) g.creature.hidden = false;
    };
    /** Put something created on another elevation onto a hex of that elevation (no wall check: that level doesn't exist right now). */
    const placeStored = (o: ScriptObject, tile: number): boolean => {
      const stored = (o as GameObject).stored;
      if (!stored?.level.hexFrame || tile <= 0) return false;
      const at = hexCenter(stored.level.hexFrame, tile);
      stored.record.x = at.x;
      stored.record.y = at.y;
      stored.record.hidden = false;
      return true;
    };
    const itemObject = (proto: ItemProto): GameObject => ({ kind: 'item', pid: proto.pid, proto, name: () => runtime.res.itemName(proto) });
    const api: ScriptContext = {
      scriptName,
      self,
      dude,
      globalVar: (n) => vars()[`g${n}`] ?? runtime.globalsInit[n] ?? 0,
      setGlobalVar: (n, v) => {
        vars()[`g${n}`] = v;
      },
      mapVar: (n) => vars()[`m:${runtime.mapName(session())}:${n}`] ?? runtime.mapInit.get(runtime.mapName(session()))?.[n] ?? 0,
      setMapVar: (n, v, o) => runtime.setVar(`m:${runtime.mapName(session())}:${n}`, v, o),
      mapObject: (n) => runtime.objectIn(`m:${runtime.mapName(session())}:${n}`),
      localVar: (n) => vars()[`l:${key}:${n}`] ?? 0,
      setLocalVar: (n, v, o) => runtime.setVar(`l:${key}:${n}`, v, o),
      localObject: (n) => runtime.objectIn(`l:${key}:${n}`),
      loadMessages: async (list) => {
        if (list > 0) await runtime.loadMessages(list);
      },
      message: (list, id) => {
        if ((list === 0 && id === 0) || (list === -1 && id === -1)) return '';
        if (list === -2 && id === -2) return runtime.protoMsg.get(650) ?? '…';
        const msg = runtime.messages.get(list);
        if (!msg) {
          void runtime.loadMessages(list);
          return '';
        }
        return msg.get(id) ?? '';
      },
      stat: (o, stat) => {
        if (o.kind === 'dude') {
          const hero = session().hero;
          if (stat >= 0 && stat < SPECIAL_NAMES.length) return specialLevel(runtime.character, SPECIAL_NAMES[stat]!, hour());
          const derived = derivedStats(runtime.character, hour());
          switch (stat) {
            case STAT_MAX_HP:
              return hero.maxHp;
            case STAT_CURRENT_HP:
              return hero.hp;
            case STAT_AC:
              return hero.ac;
            case STAT_MAX_AP:
              return derived.maxAp;
            case STAT_MELEE_DAMAGE:
              return derived.meleeDamage;
            case STAT_CARRY_WEIGHT:
              return derived.carryWeight;
            case STAT_SEQUENCE:
              return derived.sequence;
            case STAT_HEALING_RATE:
              return derived.healingRate;
            case STAT_CRITICAL_CHANCE:
              return derived.criticalChance;
            case STAT_BETTER_CRITICALS:
              return derived.betterCriticals;
            case STAT_RADIATION_RESISTANCE:
              return derived.radiationResistance;
            case STAT_POISON_RESISTANCE:
              return derived.poisonResistance;
            case STAT_AGE:
              return runtime.character.age ?? AGE_DEFAULT;
            case STAT_GENDER:
              return runtime.character.gender === 'female' ? 1 : 0;
            default:
              return 0;
          }
        }
        const c = (o as GameObject).creature;
        if (!c) return 0;
        if (stat === STAT_MAX_HP) return c.stats.maxHp;
        if (stat === STAT_CURRENT_HP) return c.hp;
        if (stat === STAT_AC) return c.stats.ac;
        // The rest from the creature's prototype; no prototype means primary stats of five each.
        if (o.critter) return o.critter.stats[stat] ?? 0;
        return stat >= 0 && stat < SPECIAL_NAMES.length ? 5 : 0;
      },
      skill: (o, skill) => {
        if (o.kind === 'dude') return skillLevel(runtime.character, skill, hour());
        // A creature: the base from its stats plus bonus points from the prototype.
        if (!o.critter) return 0;
        return Math.min(SKILL_MAX, skillBase(creatureSpecial(o), skill) + (o.critter.skillPoints[skill] ?? 0));
      },
      countItems: (o, pid) => {
        const stored = storedItems(o);
        return stored ? storedCount(stored, pid) : (inventoryOf(o)?.count(pid) ?? 0);
      },
      addItems: (o, proto: ItemProto, count) => {
        const stored = storedItems(o);
        if (stored) {
          const stack = stored.find(([p]) => p === proto.pid);
          if (stack) stack[1] += count;
          else stored.push([proto.pid, count]);
          return;
        }
        // Ammo in the inventory is counted by the round, while the script puts packs.
        inventoryOf(o)?.add(proto, itemUnits(proto, count));
        if (o.kind === 'dude' && !runtime.quietItems) session().say(count > 1 ? tf('msgPickupCount', { name: runtime.res.itemName(proto), n: count }) : tf('msgPickup', { name: runtime.res.itemName(proto) }));
      },
      removeItems: (o, pid, count) => {
        const stored = storedItems(o);
        if (stored) {
          let left = count;
          for (const stack of stored) {
            if (stack[0] !== pid || left <= 0) continue;
            const take = Math.min(stack[1], left);
            stack[1] -= take;
            left -= take;
          }
          for (let i = stored.length - 1; i >= 0; i--) if (stored[i]![1] <= 0) stored.splice(i, 1);
          return;
        }
        inventoryOf(o)?.remove(pid, count);
      },
      item: (pid) => runtime.res.item(pid),
      itemName: (proto) => runtime.res.itemName(proto),
      say: (text, from) => {
        // Examining an NPC on hover (lookAt): the script's text goes to the hint, not to the message window.
        const heard = from ? runtime.heard.get((from as GameObject).key ?? '') : undefined;
        if (heard) heard.push(text);
        else session().say(text);
      },
      giveExperience: (points) => {
        const hero = session().hero;
        const xp = session().shareExperience(points);
        session().say(tf('msgExperience', { n: xp.gained }));
        if (xp.levels > 0) session().say(tf('msgLevelUp', { level: hero.level }));
      },
      attack: (o) => (o as GameObject).creature?.provoke(),
      fight: (a, b) => {
        const attacker = (a as GameObject).creature;
        const victim = (b as GameObject).creature;
        if (attacker && victim) session().scene.startFight(attacker, victim);
      },
      heal: (o, amount) => {
        if (o.kind === 'dude') {
          const hero = session().hero;
          hero.hp = Math.min(hero.maxHp, hero.hp + amount);
        } else {
          const c = (o as GameObject).creature;
          if (c) c.hp = Math.min(c.stats.maxHp, c.hp + amount);
        }
      },
      gameSeconds: () => session().clock.scriptSeconds,
      requestTalk: (o) => {
        if (!runtime.talkRequests.includes(o as GameObject)) runtime.talkRequests.push(o as GameObject);
      },
      // The conversation window; we remember the head the NPC speaks with (in the save variables): the companion menu
      // (companion-talk.ts), which the original doesn't have, opens with the same head.
      dialogue: {
        open: (speaker, head = -1, background = -1, mood) => {
          if (self.creature && head >= 0) {
            session().vars[`head:${self.pid}`] = head;
            session().vars[`headbg:${self.pid}`] = background;
          }
          runtime.ui.open(speaker, head, background, mood);
        },
        ask: (reply, options) => runtime.ui.ask(reply, options),
        close: () => runtime.ui.close(),
      },
      log: (text) => runtime.note(text),

      random: (min, max) => min + Math.floor(Math.random() * (max - min + 1)),
      date: () => {
        const date = session().clock.date;
        return { month: date.month, day: date.day };
      },
      advanceTime: (seconds) => session().clock.advance(seconds),
      daysSinceVisited: () => {
        const left = vars()[runtime.visitKey(session())];
        return left === undefined ? -1 : Math.max(0, Math.floor((session().clock.seconds - left) / DAY_SECONDS));
      },
      isFirstRun: () => vars()[runtime.visitKey(session())] === undefined && !vars()[`seen:${runtime.mapName(session())}`],
      partyCount: () => session().party.length,
      usedWith: () => runtime.usedWithItem,
      partyAdd: async (o) => {
        const c = (o as GameObject).creature;
        if (!c) return;
        const s = session();
        if (s.isCompanion(c)) return;
        // The hero takes the dog if he wants (client, 2026-10-26: it's sad to watch him die): ask; if he refused, the script
        // no longer adds him on its own, and he can be called later (E on him, play.ts).
        if (s.scene.kindOfCreature(c)?.bites) {
          const key = declinedKey(self.creature === c ? scriptName : (s.scene.scriptOf(c)?.name ?? ''), s.scene.pidOf(c));
          if (s.vars[key]) return;
          if (!(await runtime.askJoin(c))) {
            s.vars[key] = 1;
            s.say(tf('msgDogStays', { name: c.stats.name }));
            return;
          }
        }
        s.joinParty(c);
      },
      partyRemove: (o) => {
        const c = (o as GameObject).creature;
        if (c) session().leaveParty(c);
      },
      partyMember: (pid) => {
        const m = session().party.find((p) => p.kind.pid === pid && (p.creature.alive || p.creature.unconscious));
        return m && m.script ? runtime.objectFor(m.script.key, m.creature, m.script.name) : null;
      },
      isLoadGame: () => false,
      signalEndGame: () => {
        vars()['endgame'] = 1;
      },
      playMovie: async (index) => {
        if (runtime.ui.movie) await runtime.ui.movie(index);
      },
      pcStat: (stat) => {
        switch (stat) {
          case PC_STAT.unspentSkillPoints:
            return vars()['pc:skillpoints'] ?? 0;
          case PC_STAT.level:
            return levelForExperience(session().hero.experience);
          case PC_STAT.experience:
            return session().hero.experience;
          case PC_STAT.reputation:
          case PC_STAT.karma:
            return vars()[`g${GVAR_REPUTATION}`] ?? runtime.globalsInit[GVAR_REPUTATION] ?? 0;
          default:
            return 0;
        }
      },
      modifySkill: (o, skill, points) => {
        if (o.kind !== 'dude' || skill < 0 || skill >= runtime.character.skillPoints.length) return;
        const next = [...runtime.character.skillPoints];
        next[skill] = Math.max(0, (next[skill] ?? 0) + points);
        runtime.character = { ...runtime.character, skillPoints: next };
      },
      modifyStat: (o, stat, delta) => {
        if (o.kind !== 'dude') return false;
        const name = SPECIAL_NAMES[stat];
        if (name) {
          const value = runtime.character.special[name] + delta;
          // As in the original: you can't go beyond 1…10, the value just doesn't change.
          if (value >= 1 && value <= 10) runtime.character = { ...runtime.character, special: { ...runtime.character.special, [name]: value } };
        }
        return true;
      },
      hasTrait: (trait) => runtime.character.traits.includes(trait),
      // There are no perks in the game yet.
      perkLevel: (perk) => perkRank(runtime.character, perk),
      objectTrait: (o, trait) => {
        const own = (o as GameObject).traits?.[trait];
        if (own !== undefined) return own;
        switch (trait) {
          case 5:
            return o.critter?.aiPacket ?? 0;
          case 6:
            return o.critter?.team ?? 0;
          case 10: {
            // Turning a creature: six directions around (roughly, by the view angle).
            const facing = (o as GameObject).creature?.facing ?? 0;
            return Math.round(((((facing % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * 6) % 6;
          }
          case 666:
            return (o as GameObject).creature?.hidden ? 0 : 1;
          case 669:
            return Math.round((inventoryOf(o)?.items ?? []).reduce((sum, stack) => sum + stackWeight(stack.proto, stack.count), 0));
          default:
            return 0;
        }
      },
      isAlive: (o) => {
        if (o.kind === 'dude') return session().hero.alive;
        const c = (o as GameObject).creature;
        return c ? c.alive || c.unconscious : true;
      },
      onScreen: (o) => {
        if (o.kind === 'dude') return true;
        const where = o.where?.();
        if (!where) return false;
        const { player, scene } = session();
        const frame = scene.def.hexFrame;
        return (frame ? onOriginalScreen(frame, player, where) : null) ?? Math.hypot(where.x - player.x, where.y - player.y) <= SCREEN_REACH;
      },
      equipped: (o, slot) => {
        // Slot 0 is what is worn (the hero's armor), 1 the right hand ("Hand 2"), 2 the left ("Hand 1").
        if (slot === 0) {
          const worn = o.kind === 'dude' ? session().hero.armorItem : null;
          return worn ? itemObject(worn) : null;
        }
        if (slot !== 1 && slot !== 2) return null;
        if (o.kind !== 'dude') return slot === 1 ? ((o as GameObject).wielded ?? null) : null;
        // As in the original, scripts see only the hero's active hand: a knife in one, a rope in the other and the rope
        // active means "no" weapon. A holstered weapon (Q) means empty hands. In combat and until it has quieted down after it (the weapon lowers
        // itself, play.ts), the same: in the original NPCs don't check the hero's hands during combat (critter_p_proc doesn't run), while ours
        // had the guards demand the weapon be put away in the middle of a firefight and attack.
        const hero = session().hero;
        const hand = slot === 1 ? 1 : 0;
        if (hero.holstered || hero.inCombat || hero.fought || hero.activeHand !== hand) return null;
        const item = hero.handItem(hand);
        return item ? itemObject(item) : null;
      },
      inventoryCount: (o) => inventoryOf(o)?.items.length ?? 0,
      protoData: async (pid, member) => {
        // The hero's prototype: the "name" is the hero's name (the Vault 13 water dispenser greets him by name).
        if (pid === PID_PLAYER) return member === 1 ? dude.name() : member === 0 ? pid : 0;
        try {
          const kind = pid >>> 24;
          if (kind === 0) {
            const p = await runtime.res.item(pid);
            switch (member) {
              case 0:
                return p.pid;
              case 1:
                return runtime.res.itemName(p);
              case 2:
                return runtime.res.data.itemDescription(p);
              case 3:
                return p.fid;
              case 4:
                return p.lightDistance ?? 0;
              case 5:
                return p.lightIntensity ?? 0;
              case 6:
                return p.flags ?? 0;
              case 7:
                return p.extendedFlags ?? 0;
              case 8:
                return p.scriptId ?? -1;
              case 9:
                return p.type;
              case 11:
                return p.material ?? 0;
              case 12:
                return p.size ?? 0;
              case 13:
                return p.weight;
              case 14:
                return p.cost;
              case 15:
                return p.inventoryFid;
              default:
                return 0;
            }
          }
          if (kind === 1) {
            const p = await runtime.res.data.critter(pid);
            switch (member) {
              case 0:
                return p.pid;
              case 1:
                return runtime.res.data.critterName(p);
              case 3:
                return p.fid;
              case 4:
                return p.lightDistance;
              case 5:
                return p.lightIntensity;
              case 6:
                return p.flags;
              case 7:
                return p.extendedFlags;
              case 8:
                return p.scriptId;
              case 10:
                return p.headFid;
              default:
                return member === 2 ? '' : 0;
            }
          }
        } catch {
          // No such prototype: an empty answer, as in the original.
        }
        return member === 1 || member === 2 ? '' : 0;
      },
      action: () => runtime.actions.get(key) ?? 0,

      tileOf: (o) => {
        const g = o as GameObject;
        if (g.tile !== undefined) return g.tile;
        if (g.stored) return g.stored.level.hexFrame && !g.stored.record.hidden ? hexAt(g.stored.level.hexFrame, g.stored.record.x, g.stored.record.y) : -1;
        // It stands where it was placed (at a wall, slightly to the side): exactly the hex the script expects.
        const standing = g.creature ? session().scene.standingTile(g.creature) : null;
        if (standing !== null) return standing;
        const frame = session().scene.def.hexFrame;
        const where = o.where?.();
        return frame && where ? hexAt(frame, where.x, where.y) : -1;
      },
      // Markers and things created on another elevation have their own elevation; the rest have the elevation of the level where the hero is.
      elevationOf: (o) => (o as GameObject).elevation ?? ((o as GameObject).stored?.level.elevation ?? session().scene.def.elevation ?? 0),
      rotationOf: (o) => rotationFromAngle(o.kind === 'dude' ? session().player.angle : ((o as GameObject).creature?.facing ?? 0)),
      lineOfSight: (from, to) => {
        const a = from.where?.();
        const b = to.where?.();
        return !!a && !!b && lineOfSight(session().scene.level, a.x, a.y, b.x, b.y);
      },
      // The map number is its position in the original's map list: in this copy's map headers the number is usually −1 (or someone else's),
      // while scripts check exactly the number from the list (Tandi in Shady Sands is 26, Vault 13 is 6).
      mapIndex: () => {
        const listed = ORIGINAL_MAPS.indexOf(runtime.mapName(session()));
        return listed >= 0 ? listed : (runtime.mapNumbers.get(runtime.mapName(session())) ?? -1);
      },

      fixedParam: () => runtime.params.get(key) ?? 0,
      addTimer: (o, ticks, param) => {
        const target = (o as GameObject).key ?? (o === self ? key : undefined);
        if (target) session().timers.push(makeTimer(target, ticks, param, session().clock.scriptSeconds));
      },
      removeTimers: (o) => {
        const target = (o as GameObject).key;
        const timers = session().timers;
        for (let i = timers.length - 1; i >= 0; i--) if (timers[i]!.key === target) timers.splice(i, 1);
      },
      float: (o, text, type) => {
        const c = creatureOf(o);
        if (o.kind === 'dude') {
          if (text.trim()) session().say(text);
          return;
        }
        if (!c) return;
        const color = type === -1 ? SEQUENTIAL_COLORS[runtime.sequence++ % SEQUENTIAL_COLORS.length]! : (FLOAT_COLORS[type] ?? FLOAT_COLORS[0]!);
        session().scene.float(c, text, color);
        // A companion walks behind the hero, so a line above his head (Ian about the locations they arrive at) can't be seen without turning around;
        // in the original the view is top-down and it is always visible. So it also goes to the message window.
        if (text.trim() && session().isCompanion(c)) session().say(tf('msgCompanionSays', { name: c.stats.name, text: text.trim() }));
      },
      setVisible: (o, visible) => {
        const prop = (o as GameObject).prop;
        if (prop) session().scene.setPropVisible(prop, visible);
        const stored = (o as GameObject).stored;
        if (stored) stored.record.hidden = !visible;
        const c = creatureOf(o);
        if (c) c.hidden = !visible;
      },
      destroy: (o) => {
        const prop = (o as GameObject).prop;
        if (prop) session().scene.destroyProp(prop);
        const box = (o as GameObject).container;
        if (box) {
          box.gone = true;
          session().scene.dropBlock(box);
        }
        const c = creatureOf(o);
        if (c) {
          c.gone = true;
          session().scene.floats.delete(c);
        }
      },
      moveTo: (o, tile, elevation) => {
        if (o.kind === 'dude') return runtime.moveHeroTo(tile, elevation);
        if (placeStored(o, tile)) return 0;
        const at = placeOf(tile, elevation);
        if (!at) {
          // Another elevation of the same map where the script has just sent the hero: the NPC goes there with him.
          const c = creatureOf(o);
          return c && elevation !== (session().scene.def.elevation ?? 0) && runtime.carryAlong(c, tile, elevation) ? 0 : -1;
        }
        const c = creatureOf(o);
        if (!c) return -1;
        c.placeAt(at.x, at.y);
        session().scene.standAt(c, tile, at.x, at.y);
        placed(o);
        return 0;
      },
      walkTo: (o, tile, run) => {
        const at = placeOf(tile, session().scene.def.elevation ?? 0);
        const c = creatureOf(o);
        if (at && c && c.walkTo(at.x, at.y, run, session().scene.level)) session().scene.standAt(c, tile, at.x, at.y);
      },
      stopMoving: (o) => creatureOf(o)?.stop(),
      setRotation: (o, rotation) => {
        const c = creatureOf(o);
        if (c) c.turnTo(angleFromRotation(rotation));
      },
      setObjectTrait: (o, trait, value) => {
        if (trait !== OBJECT_TRAIT.aiPacket && trait !== OBJECT_TRAIT.team) return;
        const target = o as GameObject;
        target.traits = { ...target.traits, [trait]: value };
        // A new combat behavior: whether it will now fight to the death.
        const c = trait === OBJECT_TRAIT.aiPacket ? creatureOf(o) : null;
        if (c) c.fightsToDeath = runtime.res.fightsToDeath(value);
      },
      kill: (o) => {
        if (o.kind === 'dude') session().hero.takeDamage(session().hero.hp);
        else creatureOf(o)?.kill();
      },
      killType: (pid) => {
        const { scene } = session();
        for (const c of scene.creatures) if (scene.pidOf(c) === pid) c.kill();
      },
      damage: (o, amount) => {
        if (o.kind === 'dude') session().hero.takeDamage(amount);
        else creatureOf(o)?.hurt(amount, false);
      },
      endCombat: () => {
        for (const c of session().scene.creatures) c.calm();
      },
      moveInventory: (from, to) => {
        const away = storedItems(from);
        const awayTo = storedItems(to);
        const source = away ? null : inventoryOf(from);
        const target = awayTo ? null : inventoryOf(to);
        // All the NPC's items, including the weapon in hand (in the original it is also in the inventory): Garl comes out to the duel with his fists.
        const owner = from.kind === 'dude' ? undefined : creatureOf(from);
        if (owner?.weapon && (target || awayTo)) void runtime.disarm(owner);
        if (source && target && source !== target) source.moveAllTo(target);
        else if (away && target) {
          // From a container (creature) on another elevation to here: items by PID from the player's copy.
          for (const [pid, count] of away.splice(0)) void runtime.res.item(pid).then((proto) => target.add(proto, count));
        } else if (source && awayTo) {
          for (const s of [...source.items]) {
            awayTo.push([s.proto.pid, s.count]);
            source.remove(s.proto.pid, s.count);
          }
        } else if (away && awayTo && away !== awayTo) awayTo.push(...away.splice(0));
      },
      wield: (o, item) => {
        if (o.kind === 'dude') return;
        (o as GameObject).wielded = item;
        // A creature on another elevation will get the weapon when it appears.
        const stored = (o as GameObject).stored;
        if (stored && item?.proto?.type === ITEM_TYPE.weapon) stored.record.weapon = item.pid;
      },
      placeNear: (o, tile, elevation) => {
        if (placeStored(o, tile)) return 0;
        const c = creatureOf(o);
        const { scene } = session();
        // The hero is placed by the level's entry points; another elevation and a hex off the map won't work.
        if (!c || o.kind === 'dude' || tile < 0 || elevation !== (scene.def.elevation ?? 0)) return -1;
        // Next to the desired hex; if it is inside a wall on our side or past the edge of the map and there is nothing free nearby, farther away
        // (otherwise the creature kept standing invisible on top of the hero: the monsters at the stairs to the lair).
        const at = freeNear(tile, elevation, PLACEMENT_RADIUS, c) ?? freeNear(tile, elevation, CREATE_RADIUS, c);
        if (!at) return -1;
        c.placeAt(at.x, at.y);
        placed(o);
        return 0;
      },
      calm: (o) => creatureOf(o)?.calm(),
      setFleeing: (o, fleeing) => {
        (o as GameObject).fleeing = fleeing;
      },
      // Only the hero tracks radiation and poison; the health damage from them is part of the hero's rules (docs/QUESTIONS.md).
      condition: (o, kind) => (o.kind === 'dude' ? (vars()[`pc:${kind}`] ?? 0) : 0),
      setCondition: (o, kind, value) => {
        if (o.kind === 'dude') vars()[`pc:${kind}`] = value;
      },
      playSound: (name, at) => runtime.playSound(name, at),
      explode: (tile, elevation, minDamage, maxDamage) => {
        const { scene, player, hero } = session();
        const frame = scene.def.hexFrame;
        if (!frame || tile < 0 || elevation !== (scene.def.elevation ?? 0)) return;
        const centre = hexCenter(frame, tile);
        runtime.playSound(EXPLOSION_SOUND);
        // Nearest first, no more than seven; anyone shielded by a wall isn't hit (whoever is right at the center always is).
        const near = (x: number, y: number) => {
          const dist = tileDist(tile, hexAt(frame, x, y));
          return dist <= EXPLOSION_RADIUS && (dist === 0 || lineOfSight(scene.level, centre.x, centre.y, x, y)) ? dist : -1;
        };
        const victims = [
          ...scene.creatures.filter((c) => c.alive && c.present).map((c) => ({ creature: c, dist: near(c.x, c.y) })),
          ...(hero.alive ? [{ creature: null, dist: near(player.x, player.y) }] : []),
        ]
          .filter((v) => v.dist >= 0)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, EXPLOSION_VICTIMS);
        for (const victim of victims) {
          const damage = minDamage + Math.floor(Math.random() * (Math.max(minDamage, maxDamage) - minDamage + 1));
          // A scripted explosion doesn't make a creature the hero's enemy (same as critter_damage).
          if (victim.creature) victim.creature.hurt(damage, false);
          else hero.takeDamage(damage);
        }
      },
      setBarterMod: (percent) => {
        runtime.barterMod = percent;
      },
      isOpen: (o) => doorOf(o)?.target === 1 || !!(o as GameObject).container?.opened,
      setOpen: (o, open) => {
        const d = doorOf(o);
        if (d) session().scene.setDoorOpen(d, open);
        const c = (o as GameObject).container;
        if (c && (!open || !c.locked)) c.opened = open;
      },
      isLocked: (o) => !!lockOf(o)?.locked,
      setLocked: (o, locked) => {
        const l = lockOf(o);
        if (l) session().scene.setDoorLocked(l, locked);
      },
      jamLock: (o) => {
        const l = lockOf(o);
        if (l) l.jammed = true;
      },
      overrideDefault: () => {
        runtime.overridden.add(key);
      },
      skillBeingUsed: () => runtime.skillUsed.get(key) ?? -1,
      source: () => runtime.sources.get(key) ?? (HERO_PROCS.has(runtime.actions.get(key) ?? 0) ? dude : null),
      useObject: async (o) => {
        const target = o as GameObject;
        runtime.usedObjects++;
        // An object with a script and a "use" action (a field that a console turns on): its script decides what to do.
        if (target.key && target !== self && runtime.scriptNames.has(target.key)) {
          const vm = await runtime.ready(target).catch(() => null);
          if (vm?.has('use_p_proc')) {
            await runtime.run(target, 'use_p_proc', 0, true, self);
            return;
          }
        }
        // Otherwise, like a door: open or close.
        if (target.kind === 'scenery') api.setOpen(target, !api.isOpen(target));
      },
      createObject: async (pid, tile, elevation, sid) => {
        const { scene, player } = session();
        const script = sid > 0 ? runtime.names[sid - 1] : undefined;
        const kind = pid >>> 24;
        if (kind === PID_KIND.item) {
          const proto = await runtime.res.item(pid);
          if (proto.type === ITEM_TYPE.container) {
            // A container from a script is a stash (it isn't visible): scripts keep a trader's stock in it, etc.
            const at = tile > 0 && scene.def.hexFrame ? hexCenter(scene.def.hexFrame, tile) : { x: player.x, y: player.y };
            const made = await scene.addCreated({ kind: 'container', pid, x: at.x, y: at.y, script, hidden: true });
            const box = scene.containerByKey(made.key);
            return box ? runtime.containerObject(box) : itemObject(proto);
          }
          const at = tile > 0 ? placeOf(tile, elevation) : null;
          // An item on the ground of this map.
          if (at) await scene.addCreated({ kind: 'item', pid, x: at.x, y: at.y, count: 1 });
          return itemObject(proto);
        }
        if (kind !== PID_KIND.critter) {
          // Scenery: on this elevation it is placed on the map (the rubble stones block the way); otherwise a marker
          // (other scripts use it to learn the spot and elevation): only the hex and elevation.
          if (kind === PID_KIND.scenery && tile > 0 && elevation === (scene.def.elevation ?? 0) && scene.def.hexFrame) {
            const at = hexCenter(scene.def.hexFrame, tile);
            // With a script (a shaft with a rope instead of the broken one): scenery that is used with E.
            await scene.addCreated({ kind: 'scenery', pid, x: at.x, y: at.y, tile, script });
          }
          const mark: GameObject = { kind: 'scenery', pid, name: () => '', tile, elevation };
          return mark;
        }
        const critter = await runtime.res.data.critter(pid).catch(() => undefined);
        const describe = (o: GameObject) => {
          o.pid = pid;
          o.critter = critter;
          o.artBase = critter ? runtime.res.data.critterArtBase(critter) : undefined;
          return o;
        };
        if (elevation === (scene.def.elevation ?? 0)) {
          // A hex inside a wall or past the edge of our map: the nearest free spot nearby (not at the hero: that's how the caravan
          // ambush and the monsters at the lair stairs ended up right on top of the hero).
          const at = tile > 0 ? (placeOf(tile, elevation) ?? freeNear(tile, elevation, CREATE_RADIUS)) : null;
          // Created "nowhere": stands invisible at the hero until the script puts it in place.
          const made = await scene.addCreated({ kind: 'critter', pid, x: at?.x ?? player.x, y: at?.y ?? player.y, script, hidden: !at });
          const o = describe(runtime.objectFor(`${scene.def.id}:${made.key}`, made.creature!, script ?? ''));
          o.unplaced = !at;
          return o;
        }
        // Another elevation of the same map: the creature appears there when the hero arrives.
        const level = runtime.levelOf(runtime.mapName(session()), elevation);
        if (!level?.hexFrame) {
          runtime.note(`script ${scriptName}: we don't have elevation ${elevation} of map ${runtime.mapName(session())}; creature not created`);
          return describe({ kind: 'critter', pid, name: () => '' });
        }
        const at = tile > 0 ? hexCenter(level.hexFrame, tile) : null;
        const { record, items } = session().createElsewhere(level.id, { kind: 'critter', pid, x: at?.x ?? 0, y: at?.y ?? 0, script, hidden: !at });
        const objectKey = `${level.id}:${record.key}`;
        const o = describe({ kind: 'critter', pid, key: objectKey, name: () => (critter ? runtime.res.data.critterName(critter) : ''), stored: { level, record, items } });
        runtime.objects.set(objectKey, o);
        if (script) runtime.scriptNames.set(objectKey, script);
        return o;
      },
      loadMap: (map, entrance) => {
        const to = destinationOf(map, entrance);
        if (!to) {
          runtime.note(`script ${scriptName}: we don't have map ${String(map)} yet`);
          return;
        }
        runtime.travelRequest = { ...to, by: scriptName };
        // As in the original, the entrance number goes into LOAD_MAP_INDEX: the map script of the destination looks at it (Lars takes the
        // hero to the casino with entrance 4, and only then does the casino script bring Killian, Lars and Gizmo's guards for the raid).
        runtime.setGlobalByName(LOAD_MAP_INDEX, entrance);
        runtime.scriptArrival = true;
      },
      openWorldMap: () => {
        runtime.worldMapRequest = true;
      },
      barter: async (modifier) => {
        const merchant = creatureOf(self);
        if (!merchant) return;
        const hero = session().hero;
        const trade = new Trade(hero.inventory, merchant.inventory, {
          heroBarter: hero.fighter.skills[SKILL.barter] ?? 0,
          merchantBarter: api.skill(self, SKILL.barter),
          modifier: modifier !== 0 ? modifier : runtime.barterMod,
        });
        if (runtime.ui.barter) await runtime.ui.barter(trade, self.name());
        else trade.cancel();
      },
    };
    return api;
  }
}

/** What a creature looks like by its health share (share: 1 is intact, 0 is dead), for "examine". */
function healthLook(share: number): StringKey {
  if (share <= 0) return 'lookDead';
  if (share >= 1) return 'lookUnhurt';
  if (share >= 0.75) return 'lookScratched';
  if (share >= 0.5) return 'lookWounded';
  if (share >= 0.25) return 'lookBadly';
  return 'lookDying';
}
