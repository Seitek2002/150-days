// Rule and check functions from scripts (task D1): each is called from a small script built in the test,
// the "game" is replaced with a stub with the needed answers (tests/helpers/script-context.ts).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parseLst } from '../src/formats/text.ts';
import type { ItemProto } from '../src/formats/pro.ts';
import { callGameFunction, IMPLEMENTED, type ScriptObject } from '../src/script/game-functions.ts';
import { IntProgram } from '../src/script/int.ts';
import { FUNCTIONS } from '../src/script/signatures.ts';
import { asInt, asString, ScriptVM } from '../src/script/vm.ts';
import type { Asm } from './helpers/asm.ts';
import { critterObject, dudeObject, makeContext, runScript } from './helpers/script-context.ts';

const value = (vm: ScriptVM) => asInt(vm.stack[vm.bp]);
const text = (vm: ScriptVM) => asString(vm.stack[vm.bp]);

/** A die with values in turn (the last one forever). */
const dice = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};

/** An item by number (create_object_sid takes the prototype from the context's `item`). */
const item = (a: Asm, pid: number) => a.push(pid).push(0).push(0).push(0).fn('create_object_sid');

const proto = (pid: number, extra: Partial<ItemProto> = {}): ItemProto => ({ pid, messageId: 0, fid: 0, type: 5, weight: 0, cost: 0, inventoryFid: 0, ...extra });

const DAY = 86400;

describe('all task D1 functions are done', () => {
  const names = [
    'roll_vs_skill', 'do_check', 'is_success', 'is_critical', 'how_much', 'has_trait', 'get_pc_stat', 'critter_mod_skill', 'set_critter_stat',
    'get_month', 'get_day', 'days_since_visited', 'game_time_advance', 'combat_difficulty', 'critter_state', 'get_poison', 'obj_item_subtype',
    'proto_data', 'party_member_obj', 'combat_is_initialized', 'using_skill', 'anim_busy', 'obj_on_screen', 'critter_inven_obj',
    'rm_mult_objs_from_inven', 'script_action', 'metarule', 'sfx_build_open_name', 'sfx_build_char_name', 'sfx_build_ambient_name',
    'sfx_build_interface_name', 'sfx_build_item_name', 'sfx_build_weapon_name', 'sfx_build_scenery_name', 'dialogue_reaction',
  ];
  it('are in the function table', () => {
    for (const name of names) expect(IMPLEMENTED.has(name), name).toBe(true);
  });
  it('names match the signature reference', () => {
    const known = new Set(Object.values(FUNCTIONS).map((s) => s[0]));
    for (const name of names) expect(known.has(name), name).toBe(true);
  });
});

describe('chance and time', () => {
  it('random takes the roll from the game and orders the bounds itself', async () => {
    const asked: number[][] = [];
    const ctx = makeContext({ random: (a, b) => (asked.push([a, b]), 4) });
    expect(value(await runScript((a) => a.push(2).push(9).fn('random'), ctx))).toBe(4);
    await runScript((a) => a.push(7).push(3).fn('random'), ctx);
    expect(asked).toEqual([[2, 9], [3, 7]]);
  });

  it('get_month and get_day — from the game date', async () => {
    const ctx = makeContext({ date: () => ({ month: 3, day: 14 }) });
    expect(value(await runScript((a) => a.fn('get_month'), ctx))).toBe(3);
    expect(value(await runScript((a) => a.fn('get_day'), ctx))).toBe(14);
  });

  it('days_since_visited: whatever the game says (−1 — not left yet)', async () => {
    expect(value(await runScript((a) => a.fn('days_since_visited'), makeContext({ daysSinceVisited: () => 4 })))).toBe(4);
    expect(value(await runScript((a) => a.fn('days_since_visited')))).toBe(-1);
  });

  it('game_time_advance: ticks of a tenth of a second, a day is 864000', async () => {
    const advanced: number[] = [];
    const ctx = makeContext({ advanceTime: (s) => void advanced.push(s) });
    await runScript((a) => a.push(864000).fn('game_time_advance').push(0), ctx);
    await runScript((a) => a.push(6000).fn('game_time_advance').push(0), ctx);
    await runScript((a) => a.push(-5).fn('game_time_advance').push(0), ctx);
    expect(advanced).toEqual([DAY, 600, 0]);
  });
});

describe('skill and stat checks', () => {
  it('roll_vs_skill: the skill and the modifier add up, d% against them', async () => {
    const ctx = makeContext({ skill: () => 60, random: dice(50) });
    // 60 + 10 against a roll of 50 → success
    const vm = await runScript((a) => a.fn('dude_obj').push(8).push(10).fn('roll_vs_skill'), ctx);
    expect(value(vm)).toBe(2);
    // 60 − 20 against a roll of 50 → failure
    expect(value(await runScript((a) => a.fn('dude_obj').push(8).push(-20).fn('roll_vs_skill'), makeContext({ skill: () => 60, random: dice(50) })))).toBe(1);
  });

  it('roll_vs_skill with a skill call to the game: exactly this object and skill number are passed', async () => {
    const asked: [ScriptObject, number][] = [];
    const ctx = makeContext({ skill: (o, s) => (asked.push([o, s]), 50), random: dice(10) });
    await runScript((a) => a.fn('dude_obj').push(14).push(0).fn('roll_vs_skill'), ctx);
    expect(asked).toEqual([[ctx.dude, 14]]);
  });

  it('critical outcomes: the hero\'s Luck is added to the critical success chance, but not before the second day', async () => {
    // skill 100, roll 1 → margin 99 → chance 9 + Luck 5 = 14%; second roll 14 is a critical success
    const rolled = async (seconds: number, second: number) =>
      value(await runScript((a) => a.fn('dude_obj').push(8).push(0).fn('roll_vs_skill'), makeContext({ skill: () => 100, stat: () => 5, gameSeconds: () => seconds, random: dice(1, second) })));
    expect(await rolled(DAY, 14)).toBe(3);
    expect(await rolled(DAY, 15)).toBe(2);
    expect(await rolled(DAY - 1, 1)).toBe(2);
  });

  it('roll_vs_skill: no object or it is an item — critical failure', async () => {
    expect(value(await runScript((a) => a.push(0).push(8).push(0).fn('roll_vs_skill')))).toBe(0);
    expect(value(await runScript((a) => item(a, 5).push(8).push(0).fn('roll_vs_skill')))).toBe(0);
  });

  it('is_success and is_critical parse an outcome', async () => {
    const success = async (roll: number) => value(await runScript((a) => a.push(roll).fn('is_success')));
    const critical = async (roll: number) => value(await runScript((a) => a.push(roll).fn('is_critical')));
    expect([await success(0), await success(1), await success(2), await success(3), await success(9)]).toEqual([0, 0, 1, 1, -1]);
    expect([await critical(0), await critical(1), await critical(2), await critical(3), await critical(9)]).toEqual([1, 0, 0, 1, -1]);
  });

  it('how_much: how well the last check went', async () => {
    const ctx = makeContext({ skill: () => 60, random: dice(25) });
    const vm = await runScript((a) => a.fn('dude_obj').push(8).push(0).fn('roll_vs_skill').op('pop').push(0).fn('how_much'), ctx);
    expect(value(vm)).toBe(35);
  });

  it('do_check: d10 against a stat with a modifier', async () => {
    const check = async (stat: number, mod: number, roll: number) =>
      value(await runScript((a) => a.fn('dude_obj').push(stat).push(mod).fn('do_check'), makeContext({ stat: () => 6, random: dice(roll) })));
    expect(await check(4, 0, 6)).toBe(2);
    expect(await check(4, 0, 7)).toBe(1);
    expect(await check(4, 1, 7)).toBe(2);
    expect(await check(4, -2, 5)).toBe(1);
    // Only primary stats can be checked; anything else is a critical failure.
    expect(await check(9, 0, 1)).toBe(0);
  });

  it('do_check remembers the margin for how_much', async () => {
    const vm = await runScript((a) => a.fn('dude_obj').push(2).push(0).fn('do_check').op('pop').push(0).fn('how_much'), makeContext({ stat: () => 6, random: dice(4) }));
    expect(value(vm)).toBe(2);
  });
});

describe('traits, perks and object properties (has_trait)', () => {
  const ctx = makeContext({
    hasTrait: (n) => n === 3,
    perkLevel: (n) => (n === 7 ? 2 : 0),
    objectTrait: (_o, n) => (n === 669 ? 77 : n === 5 ? 12 : 0),
  });
  const trait = (type: number, param: number, who: (a: Asm) => Asm = (a) => a.fn('dude_obj')) => async () =>
    value(await runScript((a) => who(a.push(type)).push(param).fn('has_trait'), ctx));

  it('hero trait: present or not', async () => {
    expect(await trait(2, 3)()).toBe(1);
    expect(await trait(2, 4)()).toBe(0);
    expect(await trait(2, 20)()).toBe(0);
  });

  it('a trait is always the hero\'s, whoever is asked about', async () => {
    expect(await trait(2, 3, (a) => a.fn('self_obj'))()).toBe(1);
  });

  it('perk: its rank; a number out of range — 0', async () => {
    expect(await trait(0, 7)()).toBe(2);
    expect(await trait(0, 8)()).toBe(0);
    expect(await trait(0, 99)()).toBe(0);
  });

  it('object properties: AI packet, item weight', async () => {
    expect(await trait(1, 5)()).toBe(12);
    expect(await trait(1, 669)()).toBe(77);
    expect(await trait(1, 6)()).toBe(0);
  });

  it('no object and an unknown type — 0', async () => {
    expect(await trait(2, 3, (a) => a.push(0))()).toBe(0);
    expect(await trait(9, 3)()).toBe(0);
  });
});

describe('hero stats', () => {
  it('get_pc_stat passes the stat number to the game', async () => {
    const ctx = makeContext({ pcStat: (s) => s * 10 + 1 });
    expect(value(await runScript((a) => a.push(1).fn('get_pc_stat'), ctx))).toBe(11);
    expect(value(await runScript((a) => a.push(4).fn('get_pc_stat'), ctx))).toBe(41);
  });

  it('critter_mod_skill changes only what the game allows, and does nothing with zero points', async () => {
    const calls: [string, number, number][] = [];
    const ctx = makeContext({ modifySkill: (o, s, p) => void calls.push([o.kind, s, p]) });
    await runScript((a) => a.fn('dude_obj').push(8).push(15).fn('critter_mod_skill'), ctx);
    await runScript((a) => a.fn('dude_obj').push(8).push(0).fn('critter_mod_skill'), ctx);
    await runScript((a) => a.push(0).push(8).push(5).fn('critter_mod_skill'), ctx);
    expect(calls).toEqual([['dude', 8, 15]]);
  });

  it('set_critter_stat: 0 — done, −1 — not allowed (another critter or no object)', async () => {
    const calls: [string, number, number][] = [];
    const ctx = makeContext({ modifyStat: (o, s, d) => (calls.push([o.kind, s, d]), o.kind === 'dude') });
    expect(value(await runScript((a) => a.fn('dude_obj').push(1).push(2).fn('set_critter_stat'), ctx))).toBe(0);
    expect(value(await runScript((a) => a.fn('self_obj').push(1).push(2).fn('set_critter_stat'), ctx))).toBe(-1);
    expect(value(await runScript((a) => a.push(0).push(1).push(2).fn('set_critter_stat'), ctx))).toBe(-1);
    expect(calls).toEqual([['dude', 1, 2], ['critter', 1, 2]]);
  });
});

describe('critter state and items', () => {
  it('critter_state: alive — 0, dead, an item or no object — 1', async () => {
    const alive = makeContext({ isAlive: () => true });
    const dead = makeContext({ isAlive: () => false });
    expect(value(await runScript((a) => a.fn('self_obj').fn('critter_state'), alive))).toBe(0);
    expect(value(await runScript((a) => a.fn('self_obj').fn('critter_state'), dead))).toBe(1);
    expect(value(await runScript((a) => item(a, 5).fn('critter_state'), alive))).toBe(1);
    expect(value(await runScript((a) => a.push(0).fn('critter_state'), alive))).toBe(1);
  });

  it('get_poison — 0, there are no poisons in the game yet', async () => {
    expect(value(await runScript((a) => a.fn('dude_obj').fn('get_poison')))).toBe(0);
  });

  it('obj_item_subtype: the item type; a non-item gets −1', async () => {
    const ctx = makeContext({ item: async (pid) => proto(pid, { type: pid === 8 ? 3 : 4 }) });
    expect(value(await runScript((a) => item(a, 8).fn('obj_item_subtype'), ctx))).toBe(3);
    expect(value(await runScript((a) => item(a, 29).fn('obj_item_subtype'), ctx))).toBe(4);
    expect(value(await runScript((a) => a.fn('dude_obj').fn('obj_item_subtype'), ctx))).toBe(-1);
  });

  it('proto_data: a number or a string, whatever the game says', async () => {
    const ctx = makeContext({ protoData: async (pid, member) => (member === 1 ? `Item ${pid}` : pid + member) });
    const named = await runScript((a) => a.push(8).push(1).fn('proto_data'), ctx);
    expect(text(named)).toBe('Item 8');
    expect(value(await runScript((a) => a.push(8).push(13).fn('proto_data'), ctx))).toBe(21);
  });

  it('stubs: no companions, combat, skill in use or animations', async () => {
    expect(value(await runScript((a) => a.push(1).fn('party_member_obj')))).toBe(0);
    expect(value(await runScript((a) => a.fn('combat_is_initialized')))).toBe(0);
    expect(value(await runScript((a) => a.fn('dude_obj').push(8).fn('using_skill')))).toBe(0);
    expect(value(await runScript((a) => a.fn('self_obj').fn('anim_busy')))).toBe(0);
    expect(value(await runScript((a) => a.fn('combat_difficulty')))).toBe(1);
  });

  it('obj_on_screen: whatever the game says; no object — 0', async () => {
    expect(value(await runScript((a) => a.fn('self_obj').fn('obj_on_screen'), makeContext({ onScreen: () => true })))).toBe(1);
    expect(value(await runScript((a) => a.fn('self_obj').fn('obj_on_screen'), makeContext({ onScreen: () => false })))).toBe(0);
    expect(value(await runScript((a) => a.push(0).fn('obj_on_screen'), makeContext({ onScreen: () => true })))).toBe(0);
  });

  it('critter_inven_obj: number of item kinds, weapon in hand, empty slots', async () => {
    const weapon: ScriptObject = { kind: 'item', pid: 8, name: () => 'Pistol' };
    const ctx = makeContext({ inventoryCount: () => 3, equipped: (_o, slot) => (slot === 1 ? weapon : null) });
    expect(value(await runScript((a) => a.fn('dude_obj').push(-2).fn('critter_inven_obj'), ctx))).toBe(3);
    // Weapon in the right hand: next we ask for its number.
    expect(value(await runScript((a) => a.fn('dude_obj').push(1).fn('critter_inven_obj').fn('obj_pid'), ctx))).toBe(8);
    expect(value(await runScript((a) => a.fn('dude_obj').push(2).fn('critter_inven_obj'), ctx))).toBe(0);
    expect(value(await runScript((a) => a.fn('dude_obj').push(0).fn('critter_inven_obj'), ctx))).toBe(0);
    expect(value(await runScript((a) => a.fn('dude_obj').push(5).fn('critter_inven_obj'), ctx))).toBe(0);
    // Not a critter — 0.
    expect(value(await runScript((a) => item(a, 5).push(1).fn('critter_inven_obj'), ctx))).toBe(0);
  });

  it('rm_mult_objs_from_inven removes no more than there is and says how many it removed', async () => {
    const removed: [number, number][] = [];
    const ctx = makeContext({ countItems: () => 3, removeItems: (_o, pid, n) => void removed.push([pid, n]) });
    // Order of values: owner, item, how many to remove.
    const remove = async (quantity: number) => value(await runScript((a) => item(a.fn('dude_obj'), 41).push(quantity).fn('rm_mult_objs_from_inven'), ctx));
    expect(await remove(2)).toBe(2);
    expect(await remove(5)).toBe(3);
    expect(await remove(0)).toBe(0);
    expect(removed).toEqual([[41, 2], [41, 3]]);
    expect(value(await runScript((a) => a.push(0).push(0).push(1).fn('rm_mult_objs_from_inven'), ctx))).toBe(0);
  });
});

describe('current procedure number and metarules', () => {
  it('script_action takes the number from the game', async () => {
    expect(value(await runScript((a) => a.fn('script_action'), makeContext({ action: () => 11 })))).toBe(11);
  });

  it('metarule: first run, loading, party, game end, unknown', async () => {
    let ended = 0;
    const ctx = makeContext({ isFirstRun: () => true, isLoadGame: () => true, partyCount: () => 2, signalEndGame: () => void ended++ });
    const rule = async (n: number, param = 0) => value(await runScript((a) => a.push(n).push(param).fn('metarule'), ctx));
    expect(await rule(14)).toBe(1);
    expect(await rule(22)).toBe(1);
    expect(await rule(16)).toBe(2);
    expect(await rule(13)).toBe(0);
    expect(ended).toBe(1);
    expect(await rule(15, 9)).toBe(0);
    expect(await rule(51)).toBe(0);
    expect(value(await runScript((a) => a.push(14).push(0).fn('metarule'), makeContext({ isFirstRun: () => false })))).toBe(0);
  });

  it('dialogue_reaction does nothing', async () => {
    expect(value(await runScript((a) => a.push(3).fn('dialogue_reaction').push(7)))).toBe(7);
  });
});

describe('sound names', () => {
  const pistol = proto(8, { weapon: { minDamage: 5, maxDamage: 12, damageType: 0, range: 0, minStrength: 0, apCost: 0, apCostMode2: 0, caliber: 0, ammoPid: 0, capacity: 0, soundCode: 'A' } });
  const ctx = makeContext({
    item: async (pid) => (pid === 8 ? pistol : proto(pid, { material: pid === 30 ? 1 : 3 })),
    self: { kind: 'critter', pid: 1, name: () => 'Critter', artBase: 'hmwarr', weaponCode: 4, soundCode: 'B' } as ScriptObject,
  });

  it('ambient, interface, items', async () => {
    expect(text(await runScript((a) => a.pushStr('birds1').fn('sfx_build_ambient_name'), ctx))).toBe('ABIRDS11');
    expect(text(await runScript((a) => a.pushStr('ib1p1x').fn('sfx_build_interface_name'), ctx))).toBe('NIB1P1X1');
    expect(text(await runScript((a) => a.pushStr('ib1p1x').fn('sfx_build_item_name'), ctx))).toBe('NIB1P1X1');
  });

  it('scenery: order of values — name, action, action type', async () => {
    expect(text(await runScript((a) => a.pushStr('door').push(0).push(0).fn('sfx_build_scenery_name'), ctx))).toBe('SAODOOR1');
    expect(text(await runScript((a) => a.pushStr('door').push(1).push(1).fn('sfx_build_scenery_name'), ctx))).toBe('SPCDOOR1');
  });

  it('opening: a door has its sound letter, an item has the default container letter', async () => {
    expect(text(await runScript((a) => a.fn('self_obj').push(0).fn('sfx_build_open_name'), ctx))).toBe('SODOORSB');
    expect(text(await runScript((a) => item(a, 30).push(1).fn('sfx_build_open_name'), ctx))).toBe('ICCNTNRA');
    expect(text(await runScript((a) => a.push(0).push(0).fn('sfx_build_open_name'), ctx))).toBe('');
  });

  it('weapon: shot, hit on metal and wood, second mode, no target', async () => {
    const weapon = async (effect: number, hitMode: number, target: (a: Asm) => Asm) =>
      text(await runScript((a) => target(item(a.push(effect), 8).push(hitMode)).fn('sfx_build_weapon_name'), ctx));
    expect(await weapon(1, 2, (a) => a.push(0))).toBe('WAA1XXX1');
    expect(await weapon(4, 2, (a) => item(a, 30))).toBe('WHA1MXX1');
    expect(await weapon(4, 2, (a) => item(a, 31))).toBe('WHA1WXX1');
    expect(await weapon(4, 3, (a) => item(a, 30))).toBe('WHA2MXX1');
    expect(await weapon(4, 2, (a) => a.push(0))).toBe('WHA1XXX1');
  });

  it('critter: image name and animation letters; no images — empty', async () => {
    expect(text(await runScript((a) => a.fn('self_obj').push(0).push(0).fn('sfx_build_char_name'), ctx))).toBe('HMWARRGA');
    expect(text(await runScript((a) => a.fn('self_obj').push(20).push(3).fn('sfx_build_char_name'), ctx))).toBe('HMWARRZA');
    expect(text(await runScript((a) => a.fn('dude_obj').push(0).push(0).fn('sfx_build_char_name'), ctx))).toBe('');
    expect(text(await runScript((a) => a.push(0).push(0).push(0).fn('sfx_build_char_name'), ctx))).toBe('');
  });
});

describe('context stub', () => {
  it('the hero and the critter are different objects', () => {
    expect(dudeObject().kind).toBe('dude');
    expect(critterObject().kind).toBe('critter');
    expect(makeContext().dude.kind).toBe('dude');
  });
});

describe('dialogue start (start_gdialog)', () => {
  it('head, background and mood reach the dialogue window in the right order', async () => {
    const opened: unknown[][] = [];
    const ctx = makeContext({ dialogue: { open: (...args) => void opened.push(args), ask: async () => 0, close: () => {} } });
    // Order in the script: message list number, speaker, mood, head, background.
    await runScript((a) => a.push(7).fn('self_obj').push(4).push(1).push(10).fn('start_gdialog').push(0), ctx);
    await runScript((a) => a.push(7).fn('self_obj').push(7).push(5).push(3).fn('start_gdialog').push(0), ctx);
    expect(opened).toEqual([['Critter', 1, 10, 4], ['Critter', 5, 3, 7]]);
  });
});

const require = createRequire(import.meta.url);
const { openGame, checkGameFolder } = require('../electron/gamefiles.cjs');

let gameDir = '';
try {
  gameDir = JSON.parse(fs.readFileSync('.local/config.json', 'utf8')).gameDir ?? '';
} catch {
  gameDir = '';
}
const available = Boolean(gameDir) && checkGameFolder(gameDir).ok;
const B = String.fromCharCode(92);

describe.skipIf(!available)('real scripts of the copy with the real function table', () => {
  it('the start code of every script runs with the game\'s functions, not stubs', async () => {
    const game = openGame(gameDir);
    try {
      const names = parseLst(game.read(`SCRIPTS${B}SCRIPTS.LST`)).map((l: string) => l.split('.')[0]!.trim().toUpperCase());
      const failures: string[] = [];
      let ran = 0;
      for (const name of new Set(names)) {
        const bytes = game.read(`SCRIPTS${B}${name}.INT`);
        if (!name || !bytes) continue;
        try {
          const ctx = makeContext({ random: (min, max) => min + Math.floor(Math.random() * (max - min + 1)) });
          const vm = new ScriptVM(new IntProgram(name, bytes), {
            call: (machine, code, args) => callGameFunction(ctx, machine, code, args),
            now: () => 0,
          });
          await vm.init();
          ran++;
        } catch (e) {
          failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      expect(failures, failures.slice(0, 10).join('\n')).toEqual([]);
      expect(ran).toBeGreaterThan(500);
    } finally {
      game.close();
    }
  }, 120_000);
});
