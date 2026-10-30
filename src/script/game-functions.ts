// Game functions called by Fallout scripts: dialogue, variables, items, skill checks…
// What the functions mean follows the format description; the code is ours. Anything missing is a safe stub: pop the arguments, return 0
// and log "not implemented yet" once (the list of unfinished ones is a task for Sonnet).
import type { CritterProto, ItemProto } from '../formats/pro.ts';
import type { Trade } from '../game/barter.ts';
import { ROTATION_COUNT, tileDir, tileDist, tileInDirection } from '../game/hex.ts';
import { DAY_SECONDS, ROLL, rollCheck, rollIsCritical, rollIsSuccess, statCheck } from '../game/rolls.ts';
import { emptyReplyOf } from '../game/text-fixes.ts';
import { ambientSfxName, characterSfxName, interfaceSfxName, openSfxName, scenerySfxName, weaponSfxName } from './sfx-names.ts';
import { FUNCTIONS } from './signatures.ts';
import { asInt, asObject, asString, int, ptr, str, type ScriptVM, type Value } from './vm.ts';

/** A game object as a script sees it: the hero, a critter, an item or static object (for a map script — "the map itself"). */
export interface ScriptObject {
  kind: 'dude' | 'critter' | 'item' | 'scenery';
  pid: number;
  name(): string;
  proto?: ItemProto;
  /** Critter prototype (the hero and items have none). */
  critter?: CritterProto;
  /** Critter art name ("HMWARR") — sound names are built from it (sfx_build_char_name). */
  artBase?: string;
  /** Code of the weapon in the critter's hands (0 — unarmed) — also for sound names. */
  weaponCode?: number;
  /** Open sound letter of a door or container (sfx_build_open_name). */
  soundCode?: string;
  /** Where the object is on our map (items in an inventory have none). */
  where?(): { x: number; y: number } | null;
}

/** Script procedures in the order in which the game stores their numbers (script_action returns the current one's number). */
export const PROCEDURES = [
  'no_p_proc',
  'start',
  'spatial_p_proc',
  'description_p_proc',
  'pickup_p_proc',
  'drop_p_proc',
  'use_p_proc',
  'use_obj_on_p_proc',
  'use_skill_on_p_proc',
  'none_x_bad',
  'none_x_bad',
  'talk_p_proc',
  'critter_p_proc',
  'combat_p_proc',
  'damage_p_proc',
  'map_enter_p_proc',
  'map_exit_p_proc',
  'create_p_proc',
  'destroy_p_proc',
  'none_x_bad',
  'none_x_bad',
  'look_at_p_proc',
  'timed_event_p_proc',
  'map_update_p_proc',
] as const;

/** Procedure number by name (for script_action); unknown — 0. */
export const procedureNumber = (name: string): number => Math.max(0, PROCEDURES.indexOf(name as (typeof PROCEDURES)[number]));

/** Dialogue window: show a line and the options, wait for a choice (option number). */
export interface DialogueUI {
  /**
   * head — talking head number from the copy's HEADS.LST (−1 — no head), background — background number,
   * mood — the speaker's mood, as in the original: 1 — good, 4 — neutral, 7 — bad (the head's "fidgets" depend on it).
   */
  open(speaker: string, head?: number, background?: number, mood?: number): void;
  ask(reply: string, options: string[]): Promise<number>;
  close(): void;
  /** Barter with the speaker (gdialog_barter): ends when the hero returns to the dialogue. Absent — no barter. */
  barter?(trade: Trade, merchant: string): Promise<void>;
  /**
   * The "Barter" button on the dialogue panel: what to do when pressed (the game sets it for the duration of the dialogue). The answer is what to tell
   * the hero if bartering is not possible. Absent — the button does nothing.
   */
  onBarter?: (() => Promise<string | void>) | null;
  /** An original movie by number (play_gmovie): ends when the movie ends or is skipped. Absent — no movie. */
  movie?(index: number): Promise<void>;
  /** Whether the dialogue window is open right now. */
  readonly isOpen?: boolean;
}

/** Hero counters: accumulated radiation and poison (stored in party variables: pc:radiation, pc:poison). */
export type Condition = 'radiation' | 'poison';

/** What a script can find out and change in the game. Implemented by the scene/session (src/game/scripts.ts). */
export interface ScriptContext {
  readonly scriptName: string;
  readonly self: ScriptObject;
  readonly dude: ScriptObject;
  globalVar(n: number): number;
  setGlobalVar(n: number, value: number): void;
  mapVar(n: number): number;
  /** object — the script put an object reference into the variable (the base gates store themselves: Katja later picks them with it). */
  setMapVar(n: number, value: number, object?: ScriptObject): void;
  /** An object put into a map variable (set_map_var with a reference); none — null. */
  mapObject?(n: number): ScriptObject | null;
  localVar(n: number): number;
  setLocalVar(n: number, value: number, object?: ScriptObject): void;
  /** An object put into a script local variable; none — null. */
  localObject?(n: number): ScriptObject | null;
  /** Text from a message file: list (script number + 1) and line number. */
  message(list: number, id: number): string;
  /** Load another script's message file (its own is ready in advance): after this message() knows it. */
  loadMessages(list: number): Promise<void>;
  /** Critter stat (number as in Fallout: 0–6 SPECIAL, 7 max HP, 35 current HP…). */
  stat(obj: ScriptObject, stat: number): number;
  skill(obj: ScriptObject, skill: number): number;
  /** How many items with this PID the object has; add and remove. */
  countItems(obj: ScriptObject, pid: number): number;
  addItems(obj: ScriptObject, proto: ItemProto, count: number): void;
  removeItems(obj: ScriptObject, pid: number, count: number): void;
  item(pid: number): Promise<ItemProto>;
  itemName(proto: ItemProto): string;
  /** Message to the game window; from — whose script is writing (the game reads a critter's look-at text instead of showing it). */
  say(text: string, from?: ScriptObject): void;
  giveExperience(points: number): void;
  /** A critter attacks the hero. */
  attack(obj: ScriptObject): void;
  /** A critter attacks another critter (not the hero): Gizmo's assassin attacks Killian; he fights back. */
  fight?(attacker: ScriptObject, victim: ScriptObject): void;
  heal(obj: ScriptObject, amount: number): void;
  /** Game time in seconds since the start of the game. */
  gameSeconds(): number;
  /** The script starts a dialogue itself (dialogue_system_enter). */
  requestTalk(obj: ScriptObject): void;
  readonly dialogue: DialogueUI;
  log(text: string): void;

  // ---------- rules and checks (D1) ----------
  /** Dice roll: an integer from min to max inclusive (replaced in tests). */
  random(min: number, max: number): number;
  /** Game date: month 1–12 and day of the month. */
  date(): { month: number; day: number };
  /** Skip game time (seconds): rest, waiting. */
  advanceTime(seconds: number): void;
  /** How many whole days have passed since last leaving this map; −1 — never left yet (days_since_visited). */
  daysSinceVisited(): number;
  /** Whether this is the first arrival on the map (the "first run" metarule). */
  isFirstRun(): boolean;
  /** How many companions are in the party. */
  partyCount(): number;
  /** The item the hero is using on the object right now (obj_being_used_with in use_obj_on_p_proc); none — null. */
  usedWith(): ScriptObject | null;
  /** Make a critter the hero's companion (party_add) and the reverse (party_remove). */
  partyAdd(obj: ScriptObject): void | Promise<void>;
  partyRemove(obj: ScriptObject): void;
  /** The companion with this PID (party_member_obj) or null. */
  partyMember(pid: number): ScriptObject | null;
  /** Whether a save is being loaded (metarule). */
  isLoadGame(): boolean;
  /** The script asks to end the game (the "end game" metarule). */
  signalEndGame(): void;
  /** Show an original movie by number (play_gmovie). */
  playMovie(index: number): Promise<void>;
  /** Hero stat: 0 — unspent skill points, 1 — level, 2 — experience, 3 — reputation, 4 — karma. */
  pcStat(stat: number): number;
  /** Add points to a hero skill (critter_mod_skill); not allowed for other critters. */
  modifySkill(obj: ScriptObject, skill: number, points: number): void;
  /** Change a hero primary stat by delta (set_critter_stat); true — done, false — not allowed. */
  modifyStat(obj: ScriptObject, stat: number, delta: number): boolean;
  /** Whether the hero has a trait (number as in TRAIT.MSG). */
  hasTrait(trait: number): boolean;
  /** Hero's perk rank (0 — none). */
  perkLevel(perk: number): number;
  /** Object properties for has_trait: 5 — AI packet, 6 — team, 10 — rotation, 666 — visible, 669 — item weight. */
  objectTrait(obj: ScriptObject, trait: number): number;
  /** Whether the hero or critter is alive. */
  isAlive(obj: ScriptObject): boolean;
  /** Whether the object is in the hero's view (obj_on_screen). */
  onScreen(obj: ScriptObject): boolean;
  /** What is in hand or worn: 0 — armor, 1 — right hand, 2 — left; none — null. */
  equipped(obj: ScriptObject, slot: number): ScriptObject | null;
  /** How many kinds of items are in the inventory (critter_inven_obj with number −2). */
  inventoryCount(obj: ScriptObject): number;
  /** Prototype data by number (proto_data): a number or a string (name, description). */
  protoData(pid: number, member: number): Promise<number | string>;
  /** Number of the procedure running right now (script_action; numbers — PROCEDURES). */
  action(): number;

  // ---------- object positions (D2) ----------
  /** The original hex the object stands on; −1 — no position (item in an inventory, level without a binding). */
  tileOf(obj: ScriptObject): number;
  /** The original map elevation (0–2) the object stands on. */
  elevationOf(obj: ScriptObject): number;
  /** Where the critter faces: direction 0–5, as with hexes. */
  rotationOf(obj: ScriptObject): number;
  /** Whether a straight line can be drawn from one object to another without hitting a wall. */
  lineOfSight(from: ScriptObject, to: ScriptObject): boolean;
  /** Map number from the original MAP header (cur_map_index); −1 — unknown. */
  mapIndex(): number;

  // ---------- life on the map: events, movement, visibility, death (Opus, part 2) ----------
  /** The number a timed event fired with (fixed_param in timed_event_p_proc); in other procedures — 0. */
  fixedParam(): number;
  /** Timed event for an object: after ticks ticks (tenths of a second) — timed_event_p_proc with the number param. */
  addTimer(obj: ScriptObject, ticks: number, param: number): void;
  /** Remove all timed events of an object. */
  removeTimers(obj: ScriptObject): void;
  /** A line above the head (float_msg); type — colour by the original's rules (−2 — warning, −1 — in turn, 0 — normal…). */
  float(obj: ScriptObject, text: string, type: number): void;
  /** Hide or show an object (set_obj_visibility). */
  setVisible(obj: ScriptObject, visible: boolean): void;
  /** Remove an object from the map for good (destroy_object). */
  destroy(obj: ScriptObject): void;
  /** Move an object to a hex on an elevation (move_to): 0 — done, −1 — not. */
  moveTo(obj: ScriptObject, tile: number, elevation: number): number;
  /** Send a critter walking (run — running) to a hex. */
  walkTo(obj: ScriptObject, tile: number, run: boolean): void;
  /** Stop the movement the script asked for. */
  stopMoving(obj: ScriptObject): void;
  /** Turn a critter: direction 0–5. */
  setRotation(obj: ScriptObject, rotation: number): void;
  /** Object property (critter_add_trait): 5 — AI packet, 6 — team. */
  setObjectTrait(obj: ScriptObject, trait: number, value: number): void;
  /** Kill a critter without combat (kill_critter): the hero gets no experience. */
  kill(obj: ScriptObject): void;
  /** Kill all critters of this kind on the map (kill_critter_type). */
  killType(pid: number): void;
  /** Wound without combat (critter_damage): the critter does not become the hero's enemy because of it. */
  damage(obj: ScriptObject, amount: number): void;
  /** End of combat (terminate_combat): everyone stops chasing the hero. */
  endCombat(): void;
  /** Go to another map (load_map): the original map name ("V13ENT.MAP") or its number, and the entrance number. */
  loadMap(map: string | number, entrance: number): void;

  // ---------- small things without an engine (E2) ----------
  /** Move all items of one object into another's inventory (move_obj_inven_to_obj). */
  moveInventory(from: ScriptObject, to: ScriptObject): void;
  /** A critter takes an item in hand (null — empties its hands). Remembered in the object, changes nothing for the hero. */
  wield(obj: ScriptObject, item: ScriptObject | null): void;
  /** Put a critter on a hex, or if it is taken, on the nearest free one nearby (critter_attempt_placement): 0 — done, −1 — not. */
  placeNear(obj: ScriptObject, tile: number, elevation: number): number;
  /** The critter stops attacking (critter_stop_attacking). */
  calm(obj: ScriptObject): void;
  /** Remember that the critter is fleeing (critter_set_flee_state). */
  setFleeing(obj: ScriptObject, fleeing: boolean): void;
  /** The hero's current radiation or poison (other critters have no counters — 0) and its new value. */
  condition(obj: ScriptObject, kind: Condition): number;
  setCondition(obj: ScriptObject, kind: Condition, value: number): void;
  /** Sound by name from the player's copy (SOUND\SFX\<name>.ACM); at — where it is heard from, without it it just plays. No file — silence. */
  playSound(name: string, at?: ScriptObject): void;
  /** Explosion on a hex of an elevation: damage from min to max to those nearby (critters and the hero). */
  explode(tile: number, elevation: number, minDamage: number, maxDamage: number): void;
  /** Price adjustment for barter in this dialogue, percent (gdialog_set_barter_mod). */
  setBarterMod(percent: number): void;

  // ---------- doors and locks (Opus, part 3) ----------
  /** Whether the door is open (not a door — no). */
  isOpen(obj: ScriptObject): boolean;
  /** Open or close a door; a locked one will not open, and it cannot be closed while someone stands in the doorway. */
  setOpen(obj: ScriptObject, open: boolean): void;
  isLocked(obj: ScriptObject): boolean;
  setLocked(obj: ScriptObject, locked: boolean): void;
  /** Jam a lock (jam_lock): it cannot be picked until the hero leaves the map. */
  jamLock(obj: ScriptObject): void;
  /** The script overrode the game's usual action (script_overrides): opening a door after use_p_proc, picking a lock… */
  overrideDefault(): void;
  /** Which skill is being used on the script's object right now (action_being_used); −1 — none. */
  skillBeingUsed(): number;
  /**
   * Who started this procedure (source_obj): another object via use_obj (a force field console), the hero — for their actions
   * (use, skill, dialogue, look, damage); null — for map events (enter, update, timer), as in the original.
   */
  source(): ScriptObject | null;
  /** use_obj: run the "use" action on an object (its use_p_proc; the source is this script); none — open/close. */
  useObject(o: ScriptObject): Promise<void> | void;

  /**
   * Create an object on the map (create_object_sid): a critter (sid — script number in SCRIPTS.LST counted from one, −1 — none),
   * an item on the ground or a static marker on a hex of an elevation. An item with no location (hex 0) is created by the function itself.
   */
  createObject(pid: number, tile: number, elevation: number, sid: number): Promise<ScriptObject>;

  /** The script opens the world map (world_map) — the game shows its world map screen. */
  openWorldMap(): void;

  /** Barter with the owner of this script (gdialog_barter): price adjustment, percent (0 — the one set by gdialog_set_barter_mod). */
  barter(modifier: number): Promise<void>;
}

type Fn = (ctx: ScriptContext, args: Value[], vm: ScriptVM) => Value | void | Promise<Value | void>;

/** An answer option: text and the procedure that runs after it is chosen (0 — no continuation). */
interface Option {
  text: string;
  proc: number | string;
}

/** Dialogue state: the current line and options. One per script while a dialogue is going on. */
class Conversation {
  reply = '';
  hasReply = false;
  options: Option[] = [];
  started = false;
}

const conversations = new WeakMap<ScriptVM, Conversation>();
const conversation = (vm: ScriptVM) => {
  let c = conversations.get(vm);
  if (!c) {
    c = new Conversation();
    conversations.set(vm, c);
  }
  return c;
};

/** Text of a line or option: a string from the script or a line number in the message file. */
function text(ctx: ScriptContext, list: number, msg: Value): string {
  return msg.t === 's' ? msg.v : ctx.message(list, asInt(msg));
}

/**
 * The same, but the message file is loaded first: dialogues take lines from other files too (the mutant at the base gates — from
 * the shared super mutant file), and only the script's own file is ready in advance.
 */
async function textLoaded(ctx: ScriptContext, list: number, msg: Value): Promise<string> {
  if (msg.t !== 's' && list > 0) await ctx.loadMessages(list);
  return text(ctx, list, msg);
}

/** Text from the old dialogue functions: script strings only (anything else is empty text, like "nothing" in the original). */
const sayText = (v: Value | undefined): string => (v?.t === 's' ? v.v : '');

function procOf(v: Value): number | string {
  return v.t === 's' ? v.v : asInt(v);
}

const obj = (v: Value | undefined) => asObject<ScriptObject>(v);

/** Numbers scripts pass to functions (values as in the original). */
const STAT_CRITICAL_CHANCE = 15;
const STAT_RADIATION_RESISTANCE = 31;
const STAT_POISON_RESISTANCE = 32;
/** The hero's art in calls to obj_art_fid: critter (type 1), standing (animation 0). */
const HERO_ART_FID = 0x01000000;
const TRAIT_KIND = { perk: 0, object: 1, trait: 2 } as const;
const PERK_COUNT = 64;
const TRAIT_COUNT = 16;
const METARULE = { endGame: 13, firstRun: 14, elevator: 15, partyCount: 16, isLoadGame: 22 } as const;
const CRITTER_STATE = { normal: 0, dead: 1 } as const;
/** animate_move_obj_to_tile: the "run" bit. */
const ANIMATE_RUN = 1;
/** reg_anim_func: "cancel the object's movements". */
const ANIM_CLEAR = 2;
/** anim: instead of moving — turn the critter (direction is the third argument). */
const ANIM_SET_ROTATION = 1000;
/** critter_inven_obj with this number returns the number of item kinds. */
const INVEN_COUNT = -2;

/** How well the last check went for each script (how_much). */
const lastRoll = new WeakMap<ScriptVM, number>();

/** "Very far": what distance functions answer when there is no distance (no tile, different elevations). */
const NO_DISTANCE = 9999;

/**
 * Whether `watcher` notices `target`: as in the original, distance no more than Perception ×5 if the target is in the field of view
 * (ahead or slightly to the side, three directions of six), and no more than Perception if it is behind.
 * We do not have combat and sneaking yet, which narrow this distance.
 */
function withinPerception(ctx: ScriptContext, watcher: ScriptObject, target: ScriptObject): boolean {
  const from = ctx.tileOf(watcher);
  const to = ctx.tileOf(target);
  if (from === -1 || to === -1) return false;
  const turn = Math.abs(ctx.rotationOf(watcher) - tileDir(from, to));
  const inFront = turn === 0 || turn === 1 || turn === 5;
  const perception = ctx.stat(watcher, 1);
  return tileDist(to, from) <= (inFront ? perception * 5 : perception);
}

/**
 * Change the hero's radiation or poison. Only the hero counts them (the others have no counters); poison and radiation resistance
 * reduce an increase but not a decrease; never below zero.
 */
function adjustCondition(ctx: ScriptContext, target: ScriptObject | null, kind: Condition, amount: number): void {
  if (!target || target.kind !== 'dude') return;
  const resistance = ctx.stat(target, kind === 'radiation' ? STAT_RADIATION_RESISTANCE : STAT_POISON_RESISTANCE);
  const effective = amount > 0 ? amount - Math.trunc((resistance * amount) / 100) : amount;
  ctx.setCondition(target, kind, Math.max(0, ctx.condition(target, kind) + effective));
}

/** Whether to show an option with an Intelligence check: iq > 0 — needs at least that, iq < 0 — a "dumb" option, only when low. */
export function iqAllows(intelligence: number, iq: number): boolean {
  if (iq < 0) return -intelligence >= iq;
  return intelligence >= iq;
}

/** Show a line and wait for a choice while the script provides options (like gsay_end in the original). */
async function runConversation(ctx: ScriptContext, vm: ScriptVM, c: Conversation): Promise<void> {
  if (!c.hasReply) return;
  if (c.options.length === 0) c.options.push({ text: '', proc: 0 });
  for (;;) {
    const options = c.options;
    const choice = await ctx.dialogue.ask(c.reply, options.map((o) => o.text));
    const picked = options[choice] ?? options[0]!;
    c.options = [];
    if (picked.proc !== 0 && picked.proc !== '') await vm.call(picked.proc);
    if (c.options.length === 0) break;
  }
}

const FNS: Record<string, Fn> = {
  // ---------- dialogue ----------
  // Values in script order: message list number, speaker, mood, head, background.
  // In the original, with a head, the mood comes from the speaker's attitude to the hero (good, neutral or bad);
  // we have no attitudes yet, so we take what the script passed itself (it is almost always "neutral").
  start_gdialog: (ctx, [, who, mood, head, background]) => {
    const target = obj(who) ?? ctx.self;
    ctx.dialogue.open(target.name(), asInt(head), asInt(background), asInt(mood));
  },
  gsay_start: (_ctx, _a, vm) => {
    const c = conversation(vm);
    c.started = true;
    c.options = [];
  },
  gsay_reply: async (ctx, [list, msg], vm) => {
    const c = conversation(vm);
    // An empty line (0, 0) — back to the questions; where no answer looks broken, a fitting line (text-fixes.ts).
    const empty = asInt(list) === 0 && msg?.t === 'i' && asInt(msg) === 0 ? emptyReplyOf(ctx.scriptName) : undefined;
    c.reply = empty ? await textLoaded(ctx, empty[0], int(empty[1])) : await textLoaded(ctx, asInt(list), msg!);
    c.hasReply = true;
    c.options = [];
  },
  gsay_option: async (ctx, [list, msg, proc], vm) => {
    conversation(vm).options.push({ text: await textLoaded(ctx, asInt(list), msg!), proc: procOf(proc!) });
  },
  giq_option: async (ctx, [iq, list, msg, proc], vm) => {
    if (!iqAllows(ctx.stat(ctx.dude, 4), asInt(iq))) return;
    conversation(vm).options.push({ text: await textLoaded(ctx, asInt(list), msg!), proc: procOf(proc!) });
  },
  gsay_message: async (ctx, [list, msg], vm) => {
    const c = conversation(vm);
    c.reply = await textLoaded(ctx, asInt(list), msg!);
    c.hasReply = true;
    // A message without a choice: a single "Next" button (its text comes from PROTO.MSG of the player's copy).
    await ctx.dialogue.ask(c.reply, [ctx.message(-2, -2)]);
    c.options = [];
  },
  gsay_end: (ctx, _a, vm) => {
    const c = conversation(vm);
    const run = runConversation(ctx, vm, c);
    return run.finally(() => {
      c.hasReply = false;
      c.options = [];
    });
  },
  end_dialogue: (ctx, _a, vm) => {
    conversations.delete(vm);
    ctx.dialogue.close();
  },
  dialogue_system_enter: (ctx) => ctx.requestTalk(ctx.self),
  // Map scripts also take texts from other message files (the location description) — such a file is loaded first.
  message_str: async (ctx, [list, id]) => {
    await ctx.loadMessages(asInt(list));
    return str(ctx.message(asInt(list), asInt(id)));
  },
  display_msg: (ctx, [msg]) => ctx.say(asString(msg), ctx.self),
  float_msg: (ctx, [who, msg, type]) => ctx.float(obj(who) ?? ctx.self, asString(msg), type ? asInt(type) : 0),

  // ---------- variables ----------
  global_var: (ctx, [n]) => int(ctx.globalVar(asInt(n))),
  set_global_var: (ctx, [n, v]) => ctx.setGlobalVar(asInt(n), asInt(v)),
  // A variable may hold an object reference (the number is 1, as in the original): the same reference is read back.
  map_var: (ctx, [n]) => {
    const o = ctx.mapObject?.(asInt(n));
    return o ? ptr(o) : int(ctx.mapVar(asInt(n)));
  },
  set_map_var: (ctx, [n, v]) => ctx.setMapVar(asInt(n), asInt(v), obj(v) ?? undefined),
  local_var: (ctx, [n]) => {
    const o = ctx.localObject?.(asInt(n));
    return o ? ptr(o) : int(ctx.localVar(asInt(n)));
  },
  set_local_var: (ctx, [n, v]) => ctx.setLocalVar(asInt(n), asInt(v), obj(v) ?? undefined),

  // ---------- objects ----------
  self_obj: (ctx) => ptr(ctx.self),
  dude_obj: (ctx) => ptr(ctx.dude),
  source_obj: (ctx) => {
    const source = ctx.source();
    return source ? ptr(source) : int(0);
  },
  target_obj: (ctx) => ptr(ctx.self),
  obj_being_used_with: (ctx) => ptr(ctx.usedWith()),
  obj_name: (ctx, [o]) => str(obj(o)?.name() ?? ''),
  obj_pid: (_ctx, [o]) => int(obj(o)?.pid ?? -1),
  obj_type: (_ctx, [o]) => {
    const target = obj(o);
    return int(!target ? -1 : target.kind === 'item' ? 0 : 1);
  },
  get_critter_stat: (ctx, [o, stat]) => {
    const target = obj(o);
    return int(target ? ctx.stat(target, asInt(stat)) : 0);
  },
  has_skill: (ctx, [o, skill]) => {
    const target = obj(o);
    return int(target ? ctx.skill(target, asInt(skill)) : 0);
  },
  critter_heal: (ctx, [o, amount]) => {
    const target = obj(o);
    if (target) ctx.heal(target, asInt(amount));
  },
  attack: (ctx, [o]) => {
    const target = obj(o) ?? ctx.dude;
    // attack(whom, …): this script's critter attacks. Attacking the hero — becomes their enemy; another critter — a fight
    // between critters (the target used to become the hero's enemy itself: Killian, attacked by the assassin, went for the hero).
    if (target === ctx.dude) ctx.attack(ctx.self);
    else if (target !== ctx.self) ctx.fight?.(ctx.self, target);
  },
  give_exp_points: (ctx, [points]) => ctx.giveExperience(asInt(points)),

  // ---------- items ----------
  // Values: prototype, hex, elevation, script number. An item "nowhere" (hex 0) is for handing it straight
  // to someone (add_obj_to_inven); everything else — critters, items on the ground, markers — is created by the game.
  create_object_sid: async (ctx, [pid, tile, elevation, sid]) => {
    const n = asInt(pid);
    if (n >>> 24 === 0 && asInt(tile ?? int(0)) <= 0) {
      const proto = await ctx.item(n);
      const item: ScriptObject = { kind: 'item', pid: proto.pid, proto, name: () => ctx.itemName(proto) };
      return ptr(item);
    }
    return ptr(await ctx.createObject(n, asInt(tile ?? int(0)), asInt(elevation ?? int(0)), asInt(sid ?? int(-1))));
  },
  add_obj_to_inven: (ctx, [who, what]) => {
    const target = obj(who);
    const item = obj(what);
    if (target && item?.proto) ctx.addItems(target, item.proto, 1);
  },
  add_mult_objs_to_inven: (ctx, [who, what, count]) => {
    const target = obj(who);
    const item = obj(what);
    if (target && item?.proto) ctx.addItems(target, item.proto, Math.max(1, asInt(count)));
  },
  rm_obj_from_inven: (ctx, [who, what]) => {
    const target = obj(who);
    const item = obj(what);
    if (target && item) ctx.removeItems(target, item.pid, 1);
  },
  obj_is_carrying_obj_pid: (ctx, [who, pid]) => {
    const target = obj(who);
    return int(target ? ctx.countItems(target, asInt(pid)) : 0);
  },
  obj_carrying_pid_obj: async (ctx, [who, pid]) => {
    const target = obj(who);
    if (!target || ctx.countItems(target, asInt(pid)) <= 0) return int(0);
    const proto = await ctx.item(asInt(pid));
    return ptr({ kind: 'item', pid: proto.pid, proto, name: () => ctx.itemName(proto) } satisfies ScriptObject);
  },
  item_caps_total: (ctx, [who]) => {
    const target = obj(who);
    return int(target ? ctx.countItems(target, 41) : 0);
  },
  item_caps_adjust: async (ctx, [who, amount]) => {
    const target = obj(who);
    const n = asInt(amount);
    if (!target) return int(-1);
    if (n >= 0) ctx.addItems(target, await ctx.item(41), n);
    else ctx.removeItems(target, 41, -n);
    return int(0);
  },

  // ---------- chance and time ----------
  random: (ctx, [min, max]) => {
    const a = asInt(min);
    const b = asInt(max);
    return int(a <= b ? ctx.random(a, b) : ctx.random(b, a));
  },
  get_month: (ctx) => int(ctx.date().month),
  get_day: (ctx) => int(ctx.date().day),
  days_since_visited: (ctx) => int(ctx.daysSinceVisited()),
  // Time in scripts is counted in "ticks" of a tenth of a second: a day is 864000.
  game_time_advance: (ctx, [ticks]) => ctx.advanceTime(Math.max(0, asInt(ticks)) / 10),

  // ---------- skill and stat checks ----------
  roll_vs_skill: (ctx, [who, skill, modifier], vm) => {
    const target = obj(who);
    // No object or not a critter — as in the original, a critical failure.
    if (!target || target.kind === 'item') return int(ROLL.criticalFailure);
    const roll = rollCheck(
      ctx.skill(target, asInt(skill)) + asInt(modifier),
      ctx.stat(target, STAT_CRITICAL_CHANCE),
      (a, b) => ctx.random(a, b),
      ctx.gameSeconds() >= DAY_SECONDS,
    );
    lastRoll.set(vm, roll.howMuch);
    return int(roll.result);
  },
  do_check: (ctx, [who, stat, modifier], vm) => {
    const target = obj(who);
    const which = asInt(stat);
    // Only primary stats (0–6) can be checked; anything else is a critical failure, as in the original.
    if (!target || which < 0 || which > 6) return int(ROLL.criticalFailure);
    const roll = statCheck(ctx.stat(target, which) + asInt(modifier), (a, b) => ctx.random(a, b));
    lastRoll.set(vm, roll.howMuch);
    return int(roll.result);
  },
  is_success: (_ctx, [roll]) => int(rollIsSuccess(asInt(roll))),
  is_critical: (_ctx, [roll]) => int(rollIsCritical(asInt(roll))),
  how_much: (_ctx, _args, vm) => int(lastRoll.get(vm) ?? 0),
  has_trait: (ctx, [type, who, param]) => {
    const target = obj(who);
    if (!target) return int(0);
    const n = asInt(param);
    switch (asInt(type)) {
      case TRAIT_KIND.perk:
        return int(n >= 0 && n < PERK_COUNT ? ctx.perkLevel(n) : 0);
      case TRAIT_KIND.object:
        return int(ctx.objectTrait(target, n));
      // The trait is always the hero's, whoever is asked about (so in the original).
      case TRAIT_KIND.trait:
        return int(n >= 0 && n < TRAIT_COUNT && ctx.hasTrait(n) ? 1 : 0);
      default:
        return int(0);
    }
  },
  get_pc_stat: (ctx, [stat]) => int(ctx.pcStat(asInt(stat))),
  critter_mod_skill: (ctx, [who, skill, points]) => {
    const target = obj(who);
    const n = asInt(points);
    if (target && target.kind !== 'item' && n !== 0) ctx.modifySkill(target, asInt(skill), n);
    return int(0);
  },
  set_critter_stat: (ctx, [who, stat, value]) => {
    const target = obj(who);
    if (!target || target.kind === 'item') return int(-1);
    return int(ctx.modifyStat(target, asInt(stat), asInt(value)) ? 0 : -1);
  },
  combat_difficulty: () => int(1),
  metarule: (ctx, [rule]) => {
    switch (asInt(rule)) {
      case METARULE.endGame:
        ctx.signalEndGame();
        return int(0);
      case METARULE.firstRun:
        return int(ctx.isFirstRun() ? 1 : 0);
      case METARULE.partyCount:
        return int(ctx.partyCount());
      case METARULE.isLoadGame:
        return int(ctx.isLoadGame() ? 1 : 0);
      // The original script elevator (15) is not needed here: elevators are level markers; the original does not know the other numbers either.
      default:
        return int(0);
    }
  },
  script_action: (ctx) => int(ctx.action()),

  // ---------- critter state and items ----------
  critter_state: (ctx, [who]) => {
    const target = obj(who);
    return int(target && target.kind !== 'item' && ctx.isAlive(target) ? CRITTER_STATE.normal : CRITTER_STATE.dead);
  },
  get_poison: (ctx, [who]) => {
    const target = obj(who);
    return int(target?.kind === 'dude' ? ctx.condition(target, 'poison') : 0);
  },
  obj_item_subtype: (_ctx, [what]) => {
    const item = obj(what);
    return int(item?.kind === 'item' && item.proto ? item.proto.type : -1);
  },
  proto_data: async (ctx, [pid, member]) => {
    const value = await ctx.protoData(asInt(pid), asInt(member));
    return typeof value === 'string' ? str(value) : int(value);
  },
  party_member_obj: (ctx, [pid]) => ptr(ctx.partyMember(asInt(pid))),
  party_add: async (ctx, [who]) => {
    const target = obj(who);
    if (target && target.kind !== 'item' && target.kind !== 'dude') await ctx.partyAdd(target);
    return int(0);
  },
  party_remove: (ctx, [who]) => {
    const target = obj(who);
    if (target && target.kind !== 'item' && target.kind !== 'dude') ctx.partyRemove(target);
    return int(0);
  },
  combat_is_initialized: () => int(0),
  using_skill: () => int(0),
  anim_busy: () => int(0),
  obj_on_screen: (ctx, [what]) => {
    const target = obj(what);
    return int(target && ctx.onScreen(target) ? 1 : 0);
  },
  critter_inven_obj: (ctx, [who, slot]) => {
    const target = obj(who);
    if (!target || target.kind === 'item') return int(0);
    const n = asInt(slot);
    if (n === INVEN_COUNT) return int(ctx.inventoryCount(target));
    return n >= 0 && n <= 2 ? ptr(ctx.equipped(target, n)) : int(0);
  },
  rm_mult_objs_from_inven: (ctx, [who, what, quantity]) => {
    const owner = obj(who);
    const item = obj(what);
    if (!owner || !item) return int(0);
    const n = Math.min(ctx.countItems(owner, item.pid), asInt(quantity));
    if (n > 0) ctx.removeItems(owner, item.pid, n);
    return int(Math.max(0, n));
  },
  dialogue_reaction: () => {},

  // ---------- hexes, distances, visibility ----------
  tile_num: (ctx, [what]) => {
    const target = obj(what);
    return int(target ? ctx.tileOf(target) : -1);
  },
  tile_distance: (_ctx, [a, b]) => {
    const from = asInt(a);
    const to = asInt(b);
    return int(from !== -1 && to !== -1 ? tileDist(from, to) : NO_DISTANCE);
  },
  tile_distance_objs: (ctx, [a, b]) => {
    const first = obj(a);
    const second = obj(b);
    if (!first || !second || ctx.elevationOf(first) !== ctx.elevationOf(second)) return int(NO_DISTANCE);
    const from = ctx.tileOf(first);
    const to = ctx.tileOf(second);
    return int(from !== -1 && to !== -1 ? tileDist(from, to) : NO_DISTANCE);
  },
  tile_num_in_direction: (_ctx, [origin, rotation, distance]) => {
    const from = asInt(origin);
    const turn = asInt(rotation);
    const steps = asInt(distance);
    if (from === -1 || turn < 0 || turn >= ROTATION_COUNT || steps === 0) return int(-1);
    const tile = tileInDirection(from, turn, steps);
    return int(tile < -1 ? -1 : tile);
  },
  rotation_to_tile: (_ctx, [a, b]) => int(tileDir(asInt(a), asInt(b))),
  elevation: (ctx, [what]) => {
    const target = obj(what);
    return int(target ? ctx.elevationOf(target) : 0);
  },
  cur_map_index: (ctx) => int(ctx.mapIndex()),
  obj_can_see_obj: (ctx, [a, b]) => {
    const watcher = obj(a);
    const target = obj(b);
    if (!watcher || !target || ctx.tileOf(target) === -1) return int(0);
    return int(withinPerception(ctx, watcher, target) && ctx.lineOfSight(watcher, target) ? 1 : 0);
  },
  // In the original this function is buggy (always "no" or crashes) — for us, whoever is within Perception hears (docs/ORIGINAL-FIXES.md).
  obj_can_hear_obj: (ctx, [a, b]) => {
    const listener = obj(a);
    const source = obj(b);
    if (!listener || !source || ctx.elevationOf(listener) !== ctx.elevationOf(source)) return int(0);
    return int(withinPerception(ctx, listener, source) ? 1 : 0);
  },

  // ---------- sound names by Fallout's rules ----------
  sfx_build_ambient_name: (_ctx, [base]) => str(ambientSfxName(asString(base))),
  sfx_build_interface_name: (_ctx, [base]) => str(interfaceSfxName(asString(base))),
  // Items use the same rule as the interface (so in the original).
  sfx_build_item_name: (_ctx, [base]) => str(interfaceSfxName(asString(base))),
  sfx_build_char_name: (_ctx, [who, animation, extra]) => {
    const target = obj(who);
    return str(target ? characterSfxName(target.artBase, asInt(animation), target.weaponCode ?? 0, asInt(extra)) : '');
  },
  sfx_build_weapon_name: (_ctx, [effect, weapon, hitMode, target]) => {
    const gun = obj(weapon)?.proto?.weapon;
    const victim = obj(target);
    return str(
      weaponSfxName(asInt(effect), asInt(hitMode), {
        soundCode: gun?.soundCode ?? '0',
        damageType: gun?.damageType ?? 0,
        targetMaterial: victim ? (victim.proto?.material ?? -1) : null,
      }),
    );
  },
  // Order of values in the script: name, action, action kind (passive — 1).
  sfx_build_scenery_name: (_ctx, [base, action, actionType]) => str(scenerySfxName(asInt(actionType) === 1, asInt(action), asString(base))),
  sfx_build_open_name: (_ctx, [what, action]) => {
    const target = obj(what);
    return str(target ? openSfxName(target.kind === 'item', asInt(action), target.soundCode ?? 'A') : '');
  },
  game_time: (ctx) => int(Math.floor(ctx.gameSeconds() * 10)),
  game_time_in_seconds: (ctx) => int(Math.floor(ctx.gameSeconds())),
  game_time_hour: (ctx) => {
    const minutes = Math.floor(ctx.gameSeconds() / 60) + 7 * 60;
    return int(Math.floor(minutes / 60) % 24 * 100 + (minutes % 60));
  },
  game_ticks: (_ctx, [seconds]) => int(asInt(seconds) * 10),

  // ---------- life on the map: events, movement, visibility, death (Opus, part 2) ----------
  add_timer_event: (ctx, [who, ticks, param]) => {
    const target = obj(who);
    if (target) ctx.addTimer(target, asInt(ticks), asInt(param));
  },
  rm_timer_event: (ctx, [who]) => {
    const target = obj(who);
    if (target) ctx.removeTimers(target);
  },
  fixed_param: (ctx) => int(ctx.fixedParam()),
  set_obj_visibility: (ctx, [who, hidden]) => {
    const target = obj(who);
    if (target) ctx.setVisible(target, asInt(hidden) === 0);
  },
  destroy_object: (ctx, [who]) => {
    const target = obj(who);
    if (target) ctx.destroy(target);
  },
  move_to: (ctx, [who, tile, elevation]) => {
    const target = obj(who);
    return int(target ? ctx.moveTo(target, asInt(tile), asInt(elevation)) : -1);
  },
  animate_move_obj_to_tile: (ctx, [who, tile, flags]) => {
    const target = obj(who);
    if (target) ctx.walkTo(target, asInt(tile), (asInt(flags) & ANIMATE_RUN) !== 0);
  },
  reg_anim_obj_move_to_tile: (ctx, [who, tile]) => {
    const target = obj(who);
    if (target) ctx.walkTo(target, asInt(tile), false);
  },
  reg_anim_obj_run_to_tile: (ctx, [who, tile]) => {
    const target = obj(who);
    if (target) ctx.walkTo(target, asInt(tile), true);
  },
  reg_anim_obj_move_to_obj: (ctx, [who, goal]) => {
    const target = obj(who);
    const to = obj(goal);
    const tile = to ? ctx.tileOf(to) : -1;
    if (target && tile !== -1) ctx.walkTo(target, tile, false);
  },
  // Movement chains (begin, cancel, end): for us movement starts at once, "cancel" means stop.
  reg_anim_func: (ctx, [op, param]) => {
    if (asInt(op) !== ANIM_CLEAR) return;
    const target = obj(param);
    if (target) ctx.stopMoving(target);
  },
  // Single animations (bow, hand wave) are not shown yet: critters only have walking, attack, being hit, death.
  reg_anim_animate: () => {},
  reg_anim_animate_forever: () => {},
  anim: (ctx, [who, animation, param]) => {
    const target = obj(who);
    if (target && asInt(animation) === ANIM_SET_ROTATION) ctx.setRotation(target, asInt(param));
  },
  critter_add_trait: (ctx, [who, kind, trait, value]) => {
    const target = obj(who);
    if (target && target.kind !== 'item' && asInt(kind) === TRAIT_KIND.object) ctx.setObjectTrait(target, asInt(trait), asInt(value));
    return int(-1);
  },
  kill_critter: (ctx, [who]) => {
    const target = obj(who);
    if (target && (target.kind === 'critter' || target.kind === 'dude')) ctx.kill(target);
  },
  kill_critter_type: (ctx, [pid]) => ctx.killType(asInt(pid)),
  critter_damage: (ctx, [who, amount]) => {
    const target = obj(who);
    if (target && (target.kind === 'critter' || target.kind === 'dude')) ctx.damage(target, Math.max(0, asInt(amount)));
  },
  // There are no crippled limbs or blinding in our game.
  critter_injure: () => {},
  attack_setup: (ctx, [attacker, victim]) => {
    const who = obj(attacker);
    const whom = obj(victim);
    if (who && whom === ctx.dude) ctx.attack(who);
    else if (whom && who === ctx.dude) ctx.attack(whom);
    else if (who && whom && who !== whom) ctx.fight?.(who, whom);
  },
  terminate_combat: (ctx) => ctx.endCombat(),
  load_map: (ctx, [map, entrance]) => ctx.loadMap(map?.t === 's' ? map.v : asInt(map), asInt(entrance)),

  // ---------- small things without an engine (E2) ----------
  // Old dialogue names (saystart and sayend — below, these are the same gsay_start and gsay_end). Texts in them are script strings only;
  // the answer title (first value) is never shown, and an option that leads "to an answer by name" ends
  // the dialogue: we have no answer names (docs/ORIGINAL-FIXES.md).
  sayreply: (ctx, [, msg], vm) => FNS.gsay_reply!(ctx, [int(0), str(sayText(msg))], vm),
  sayoption: (ctx, [msg, target], vm) => FNS.gsay_option!(ctx, [int(0), str(sayText(msg)), !target || target.t === 's' ? int(0) : target], vm),
  saymessage: (ctx, [, msg], vm) => FNS.gsay_message!(ctx, [int(0), str(sayText(msg))], vm),
  gdialog_set_barter_mod: (ctx, [percent]) => ctx.setBarterMod(asInt(percent)),
  // Barter straight from dialogue: the script waits until the hero returns to the dialogue.
  gdialog_barter: (ctx, [percent]) => ctx.barter(percent ? asInt(percent) : 0),

  // Items and hands. As in the original, only a critter can take something in hand, and only an item.
  move_obj_inven_to_obj: (ctx, [from, to]) => {
    const source = obj(from);
    const target = obj(to);
    if (source && target && source !== target) ctx.moveInventory(source, target);
  },
  wield_obj_critter: (ctx, [who, what]) => {
    const target = obj(who);
    const item = obj(what);
    if (target && item && item.kind === 'item' && (target.kind === 'critter' || target.kind === 'dude')) ctx.wield(target, item);
  },
  // No arguments: empties the hands of the owner of this script.
  inven_unwield: (ctx) => ctx.wield(ctx.self, null),

  // Critters.
  critter_attempt_placement: (ctx, [who, tile, elevation]) => {
    const target = obj(who);
    return int(target && (target.kind === 'critter' || target.kind === 'dude') ? ctx.placeNear(target, asInt(tile), asInt(elevation)) : -1);
  },
  critter_stop_attacking: (ctx, [who]) => {
    const target = obj(who);
    if (target?.kind === 'critter') ctx.calm(target);
  },
  critter_set_flee_state: (ctx, [who, fleeing]) => {
    const target = obj(who);
    if (target?.kind === 'critter') ctx.setFleeing(target, asInt(fleeing) !== 0);
  },

  // Hero radiation and poison (reducing radiation is the same counter with a minus sign, as in the original).
  radiation_inc: (ctx, [who, amount]) => adjustCondition(ctx, obj(who), 'radiation', asInt(amount)),
  radiation_dec: (ctx, [who, amount]) => adjustCondition(ctx, obj(who), 'radiation', -asInt(amount)),
  poison: (ctx, [who, amount]) => adjustCondition(ctx, obj(who), 'poison', asInt(amount)),

  // Sounds and explosions. The sound delay of reg_anim_play_sfx (third value) is ignored: the sound plays at once.
  play_sfx: (ctx, [name]) => ctx.playSound(asString(name)),
  reg_anim_play_sfx: (ctx, [who, name]) => ctx.playSound(asString(name), obj(who) ?? undefined),
  explosion: (ctx, [tile, elevation, maxDamage]) => {
    // As in the original: no hex means no explosion; the minimum damage is 1, and with a zero maximum — 0.
    if (asInt(tile) === -1) return;
    const max = asInt(maxDamage);
    ctx.explode(asInt(tile), asInt(elevation), max === 0 ? 0 : 1, max);
  },

  // Art: an art code keeps the animation kind in its third byte.
  art_anim: (_ctx, [fid]) => int((asInt(fid) & 0xff0000) >> 16),
  obj_art_fid: (_ctx, [who]) => {
    const target = obj(who);
    if (!target) return int(0);
    return int(target.kind === 'dude' ? HERO_ART_FID : (target.proto?.fid ?? target.critter?.fid ?? 0));
  },

  // Doors and locks. use_obj on a door works like a hand: opens a closed one (if not locked) or closes an open one.
  obj_is_open: (ctx, [what]) => {
    const target = obj(what);
    return int(target && ctx.isOpen(target) ? 1 : 0);
  },
  obj_open: (ctx, [what]) => {
    const target = obj(what);
    if (target) ctx.setOpen(target, true);
  },
  obj_close: (ctx, [what]) => {
    const target = obj(what);
    if (target) ctx.setOpen(target, false);
  },
  obj_is_locked: (ctx, [what]) => {
    const target = obj(what);
    return int(target && ctx.isLocked(target) ? 1 : 0);
  },
  obj_lock: (ctx, [what]) => {
    const target = obj(what);
    if (target) ctx.setLocked(target, true);
  },
  obj_unlock: (ctx, [what]) => {
    const target = obj(what);
    if (target) ctx.setLocked(target, false);
  },
  jam_lock: (ctx, [what]) => {
    const target = obj(what);
    if (target) ctx.jamLock(target);
  },
  use_obj: async (ctx, [what]) => {
    const target = obj(what);
    if (target) await ctx.useObject(target);
  },
  script_overrides: (ctx) => ctx.overrideDefault(),
  action_being_used: (ctx) => int(ctx.skillBeingUsed()),

  // These do nothing: lighting belongs to the "appearance" stage, critters have no stances without animations, nobody reads the number for the original engine (scr_return).
  set_light_level: () => {},
  obj_set_light_level: () => {},
  animate_stand_obj: () => {},
  animate_stand_reverse_obj: () => {},
  scr_return: () => {},
  // World map and movies — later: for now only a log entry, so it is visible that the script asked for it.
  world_map: (ctx) => ctx.openWorldMap(),
  town_map: (ctx) => ctx.log(`script ${ctx.scriptName}: open the town map (not shown yet)`),
  endgame_movie: (ctx) => ctx.log(`script ${ctx.scriptName}: show the ending movie (not shown yet)`),
  // The original's ending (the Vault 13 cave after victory): the game shows its own summary screen by location.
  endgame_slideshow: (ctx) => ctx.signalEndGame(),
  play_gmovie: (ctx, [movie]) => ctx.playMovie(asInt(movie)),

  // ---------- things that do nothing in our game (no log entry) ----------
  // Where the hero appears is decided by the level's entry points; we do not hide the interface during cutscenes.
  override_map_start: () => {},
  game_ui_disable: () => {},
  game_ui_enable: () => {},
  gfade_out: () => {},
  gfade_in: () => {},
  debug_msg: () => {},
};

// Old names for starting and ending a dialogue — the same as gsay_start and gsay_end.
FNS.saystart = FNS.gsay_start!;
FNS.sayend = FNS.gsay_end!;

const warned = new Set<string>();

/** Calling a game function by code from a script. */
export function callGameFunction(ctx: ScriptContext, vm: ScriptVM, code: number, args: Value[]): Value | void | Promise<Value | void> {
  const name = FUNCTIONS[code]?.[0] ?? `0x${code.toString(16)}`;
  const fn = FNS[name];
  if (fn) return fn(ctx, args, vm);
  if (!warned.has(name)) {
    warned.add(name);
    ctx.log(`script ${ctx.scriptName}: function ${name} not implemented yet`);
  }
  return FUNCTIONS[code]?.[2] ? int(0) : undefined;
}

/** Which functions are already implemented (for the task list and tests). */
export const IMPLEMENTED = new Set(Object.keys(FNS));
