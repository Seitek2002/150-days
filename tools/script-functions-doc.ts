/**
 * List of Fallout script functions: which ones the scripts in the player's copy call, how many times, whether we implemented them and who did.
 * Run: node tools/script-functions-doc.ts   →   docs/SCRIPT-FUNCTIONS.md (in history; reads the game copy only for counting).
 * Update after each batch of functions: add the names to the lists below (who and when) and run it again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseLst } from '../src/formats/text.ts';
import { usedFunctions } from '../src/script/disasm.ts';
import { IMPLEMENTED } from '../src/script/game-functions.ts';
import { IntProgram } from '../src/script/int.ts';
import { FUNCTIONS } from '../src/script/signatures.ts';

const require = createRequire(import.meta.url);
const { openGame, checkGameFolder } = require('../electron/gamefiles.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));

// ---------- who and when ----------

/** Phase D, task D1 (Sonnet, night 3): rules and checks, time, sounds, metarules. */
const D1 = new Set([
  'roll_vs_skill', 'do_check', 'is_success', 'is_critical', 'how_much', 'has_trait', 'get_pc_stat', 'critter_mod_skill', 'set_critter_stat',
  'get_month', 'get_day', 'days_since_visited', 'game_time_advance', 'combat_difficulty', 'critter_state', 'get_poison', 'obj_item_subtype',
  'proto_data', 'party_member_obj', 'combat_is_initialized', 'using_skill', 'anim_busy', 'obj_on_screen', 'critter_inven_obj',
  'rm_mult_objs_from_inven', 'script_action', 'metarule', 'sfx_build_open_name', 'sfx_build_char_name', 'sfx_build_ambient_name',
  'sfx_build_interface_name', 'sfx_build_item_name', 'sfx_build_weapon_name', 'sfx_build_scenery_name', 'dialogue_reaction', 'random',
]);
/** Phase D, task D2 (Sonnet, night 3): hexes, distances, visibility. */
const D2 = new Set(['tile_num', 'tile_num_in_direction', 'tile_distance', 'tile_distance_objs', 'rotation_to_tile', 'elevation', 'cur_map_index', 'obj_can_see_obj', 'obj_can_hear_obj']);
/** What the plan defers to Opus ("Scripts, part 2" — section 5, item 1: needs the engine). */
const OPUS_PART2 = new Set([
  'critter_p_proc', 'map_enter_p_proc', 'map_update_p_proc', 'add_timer_event', 'rm_timer_event', 'move_to', 'animate_move_obj_to_tile',
  'reg_anim_func', 'reg_anim_animate', 'reg_anim_animate_reverse', 'reg_anim_obj_move_to_obj', 'reg_anim_obj_run_to_obj',
  'reg_anim_obj_move_to_tile', 'reg_anim_obj_run_to_tile', 'reg_anim_animate_forever', 'reg_anim_play_sfx', 'anim', 'set_obj_visibility',
  'destroy_object', 'critter_damage', 'kill_critter', 'kill_critter_type', 'critter_injure', 'obj_lock', 'obj_unlock', 'obj_open', 'obj_close',
  'use_obj', 'jam_lock', 'load_map', 'override_map_start', 'set_map_start', 'party_add', 'party_remove', 'gdialog_barter', 'attack_setup',
  'terminate_combat', 'attack', 'critter_add_trait', 'fixed_param', 'float_msg', 'game_ui_disable', 'game_ui_enable', 'create_object_sid', 'obj_is_locked', 'obj_is_open',
]);
/** Phase E, task E2 (Sonnet, night 4): what does not need the engine. */
const E2 = new Set([
  'set_light_level', 'obj_set_light_level', 'move_obj_inven_to_obj', 'radiation_inc', 'radiation_dec', 'poison', 'wield_obj_critter',
  'inven_unwield', 'critter_attempt_placement', 'critter_set_flee_state', 'critter_stop_attacking', 'animate_stand_obj',
  'animate_stand_reverse_obj', 'play_sfx', 'reg_anim_play_sfx', 'gdialog_set_barter_mod', 'saystart', 'sayend', 'sayreply', 'sayoption',
  'saymessage', 'scr_return', 'world_map', 'town_map', 'endgame_movie', 'endgame_slideshow', 'play_gmovie', 'explosion', 'art_anim', 'obj_art_fid',
]);

/** What actually happens on our side where a function is "implemented" but not for real. */
const NOTES: Record<string, string> = {
  script_overrides: 'does nothing',
  override_map_start: 'does nothing: where the hero appears is decided by the level entrances',
  game_ui_disable: 'does nothing',
  game_ui_enable: 'does nothing',
  reg_anim_animate: 'does nothing: no one-off moves (bow, wave) yet',
  reg_anim_animate_forever: 'does nothing: no one-off moves yet',
  critter_injure: 'does nothing: the game has no broken limbs or blinding',
  reg_anim_func: '"cancel" stops movement, the rest happens at once',
  anim: 'rotation only (1000)',
  move_to: 'does not move the hero (the level entrances decide where he is); no moving to another level',
  load_map: 'by original map name; by number — not yet',
  critter_add_trait: 'object properties only: AI packet and team',
  attack_setup: 'only if the hero takes part in the fight',
  create_object_sid: 'inventory items only; critters and items on the map — no',
  action_being_used: 'always −1',
  obj_being_used_with: 'always empty',
  gfade_out: 'does nothing',
  gfade_in: 'does nothing',
  debug_msg: 'does nothing',
  party_member_obj: 'stub: no companions',
  combat_is_initialized: 'stub: always "no combat"',
  using_skill: 'stub: always "not using"',
  anim_busy: 'stub: no animations',
  get_poison: 'hero poison counter (pc:poison); 0 for other critters; health damage — later (with the hero rules)',
  // E2 (Sonnet, night 4)
  saystart: 'same as gsay_start',
  sayend: 'same as gsay_end',
  sayreply: 'like gsay_reply, but the text is a string; the reply header is not shown (this function is unfinished in the original)',
  sayoption: 'like gsay_option, but the text is a string; an option "to a reply by name" ends the conversation',
  saymessage: 'like gsay_message, but the text is a string (this function is unfinished in the original and raises an error)',
  move_obj_inven_to_obj: 'all items of the first go into the inventory of the second (whoever has an inventory: the hero and critters)',
  wield_obj_critter: 'stored in the critter object, visible through critter_inven_obj; changes nothing for the hero',
  inven_unwield: 'clears the hands of its own critter (stored the same way)',
  critter_attempt_placement: 'nearest free hex within four steps; does not move the hero or move to another level (−1)',
  critter_stop_attacking: 'the critter stops chasing the hero until it notices him again',
  critter_set_flee_state: 'only stored: critters cannot flee yet',
  radiation_inc: 'hero radiation counter (pc:radiation) with resistance applied; health damage — later (with the hero rules)',
  radiation_dec: 'the same counter going down; never below zero',
  poison: 'hero poison counter (pc:poison) with resistance applied; health damage — later (with the hero rules)',
  play_sfx: 'sound from the player\'s copy (SOUND\\SFX); no file — silence',
  reg_anim_play_sfx: 'sound from the player\'s copy, heard from the critter; the delay is ignored — plays at once',
  explosion: 'damage from 1 (0 when zero) up to the given value; up to three hexes from the center, at most seven victims, walls protect; no armor protection from explosions; no explosion image',
  gdialog_set_barter_mod: 'the number is stored (ScriptRuntime.barterMod) for trading, reset with each conversation',
  set_light_level: 'does nothing: lighting belongs to the "visuals" stage',
  obj_set_light_level: 'does nothing: lighting belongs to the "visuals" stage',
  animate_stand_obj: 'does nothing: critters have no separate "stance"',
  animate_stand_reverse_obj: 'does nothing: critters have no separate "stance"',
  scr_return: 'does nothing: the original engine read the number for locks and items (Opus, part 2)',
  world_map: 'only a script log entry: world map — later',
  town_map: 'only a script log entry: town map — later',
  endgame_movie: 'only a script log entry: movies — later',
  endgame_slideshow: 'only a script log entry: movies — later',
  play_gmovie: 'only a script log entry: movies — later',
  art_anim: 'animation type from the art code, as in the original',
  obj_art_fid: 'prototype art code; for the hero — "critter standing"',
  combat_difficulty: 'stub: always "normal"',
  dialogue_reaction: 'does nothing (as the task says)',
  has_trait: 'hero traits are real; perks — always 0',
  metarule: 'numbers 13, 14, 16, 22 are real, 15 (elevator) and the rest — 0',
  critter_mod_skill: 'changes only the copy of the hero inside scripts (not saved)',
  set_critter_stat: 'changes only the copy of the hero inside scripts (not saved)',
  obj_can_hear_obj: 'fixed bug of the original (docs/ORIGINAL-FIXES.md)',
  tile_num: 'bounds of level 1 and the cave are approximate (docs/QUESTIONS.md, D2)',
  attack: 'the critter becomes hostile; no turn-based combat',
};

// ---------- counting over the real scripts ----------

let gameDir = '';
try {
  gameDir = JSON.parse(fs.readFileSync(path.join(root, '.local', 'config.json'), 'utf8')).gameDir ?? '';
} catch {
  gameDir = '';
}
if (!gameDir || !checkGameFolder(gameDir).ok) {
  console.error('Fallout 1 copy not found: set the game folder in .local/config.json');
  process.exit(1);
}
const game = openGame(gameDir);
const B = String.fromCharCode(92);
const names = parseLst(game.read(`SCRIPTS${B}SCRIPTS.LST`)).map((l: string) => l.split('.')[0]!.trim().toUpperCase());
const calls = new Map<string, number>();
const scripts = new Map<string, number>();
let programs = 0;
for (const name of new Set(names)) {
  if (!name) continue;
  const bytes = game.read(`SCRIPTS${B}${name}.INT`);
  if (!bytes) continue;
  programs++;
  for (const [fn, count] of usedFunctions(new IntProgram(name, bytes))) {
    calls.set(fn, (calls.get(fn) ?? 0) + count);
    scripts.set(fn, (scripts.get(fn) ?? 0) + 1);
  }
}
game.close();

const signature = (fn: string) => Object.values(FUNCTIONS).find((s) => s[0] === fn);
const who = (fn: string): string => {
  if (D2.has(fn)) return 'Sonnet, D2 (night 3)';
  if (D1.has(fn) && IMPLEMENTED.has(fn)) return 'Sonnet, D1 (night 3)';
  if (E2.has(fn)) return IMPLEMENTED.has(fn) ? 'Sonnet, E2 (night 4)' : 'Sonnet: E2 (night 4)';
  if (OPUS_PART2.has(fn) && IMPLEMENTED.has(fn) && fn !== 'create_object_sid' && fn !== 'attack') return 'Opus, part 2 (live maps)';
  if (IMPLEMENTED.has(fn)) return 'Opus, B2 (skeleton)';
  if (OPUS_PART2.has(fn)) return 'Opus: part 2 (plan section 5, item 1)';
  return 'unassigned';
};

const rows = [...scripts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const done = rows.filter(([fn]) => IMPLEMENTED.has(fn)).length;
const total = Object.values(FUNCTIONS).length;
const unused = Object.values(FUNCTIONS).filter((s) => !scripts.has(s[0]) && IMPLEMENTED.has(s[0])).length;

const lines = [
  '# Fallout script functions',
  '',
  'Generated by `node tools/script-functions-doc.ts` (reads the game copy only for counting: how many scripts and calls; nothing about the scripts themselves or their texts is here).',
  'Update after each batch of functions: add the names to the `D1`, `D2`, `E2`, `OPUS_PART2` and `NOTES` lists in this tool and run it again.',
  '',
  `- Scripts in the copy: ${programs}. Distinct functions in the reference: ${total}; the scripts call ${rows.length}.`,
  `- Of those called, **${done}** are implemented, ${rows.length - done} are not${unused > 0 ? `; another ${unused} implemented ones are not called by the copy's scripts` : ''}.`,
  '- "Implemented" means present in `FNS` (`src/script/game-functions.ts`); unimplemented ones are safe stubs: they pop the arguments, return 0 and write to the log once.',
  '- "Who and when": Opus, B2 — skeleton (dialogue, variables, items, experience); Sonnet, D1 and D2 — night 3; Opus, "live maps" — critter procedures, timed events, movement, visibility, death; Sonnet, E2 — night 4; "Opus: part 2" — what still needs the engine (locks and doors, companions, trading, spawning critters), plan section 5.',
  `- Most frequent among unimplemented and still unassigned: ${rows
    .filter(([fn]) => !IMPLEMENTED.has(fn) && who(fn) === 'unassigned')
    .slice(0, 5)
    .map(([fn, n]) => `\`${fn}\` (${n})`)
    .join(', ') || 'none — all assigned'}.`,
  '',
  '| Function | Scripts | Calls | Arguments | Result | Implemented | Who and when | How implemented |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map(([fn, n]) => {
    const s = signature(fn);
    return `| ${fn} | ${n} | ${calls.get(fn)} | ${s?.[1] ?? '?'} | ${s?.[2] ? 'yes' : 'no'} | ${IMPLEMENTED.has(fn) ? 'yes' : ''} | ${who(fn)} | ${IMPLEMENTED.has(fn) ? (NOTES[fn] ?? '') : ''} |`;
  }),
  '',
];
fs.writeFileSync(path.join(root, 'docs', 'SCRIPT-FUNCTIONS.md'), lines.join('\n'));
console.log(`docs/SCRIPT-FUNCTIONS.md: ${rows.length} functions, ${done} implemented`);
