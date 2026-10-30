// Script functions "without the engine" (E2): old dialogue names, items in hands, radiation and poison, sounds, explosions, stubs.
// Each is called from a small script built in the test; the "game" is replaced with a stub.
import { describe, expect, it } from 'vitest';
import { callGameFunction, IMPLEMENTED, type DialogueUI, type ScriptContext, type ScriptObject } from '../src/script/game-functions.ts';
import { asInt, ScriptVM } from '../src/script/vm.ts';
import { program, type Asm } from './helpers/asm.ts';
import { critterObject, makeContext, runScript } from './helpers/script-context.ts';

const value = (vm: ScriptVM) => asInt(vm.stack[vm.bp]);

const E2 = [
  'set_light_level', 'obj_set_light_level', 'move_obj_inven_to_obj', 'radiation_inc', 'radiation_dec', 'poison', 'wield_obj_critter',
  'inven_unwield', 'critter_attempt_placement', 'critter_set_flee_state', 'critter_stop_attacking', 'animate_stand_obj',
  'animate_stand_reverse_obj', 'play_sfx', 'reg_anim_play_sfx', 'gdialog_set_barter_mod', 'saystart', 'sayend', 'sayreply', 'sayoption',
  'saymessage', 'scr_return', 'world_map', 'town_map', 'endgame_movie', 'endgame_slideshow', 'play_gmovie', 'explosion', 'art_anim', 'obj_art_fid',
];

/** An item for the script: created by the create_object_sid function itself. */
const item = (a: Asm, pid: number) => {
  a.push(pid).push(0).push(0).push(0).fn('create_object_sid');
};

describe('E2 functions are done', () => {
  it('all thirty are in the function table', () => {
    expect(E2).toHaveLength(30);
    for (const name of E2) expect(IMPLEMENTED.has(name), name).toBe(true);
  });
});

describe('old dialogue names', () => {
  /** A dialogue from the old functions: a reply, two options (procedures by number), the choice taken in turn from `picks`. */
  async function converse(picks: number[]) {
    const asked: [string, string[]][] = [];
    const set: [number, number][] = [];
    const ui: DialogueUI = { open: () => {}, ask: async (reply, options) => (asked.push([reply, options]), picks.shift() ?? 0), close: () => {} };
    const ctx = makeContext({ dialogue: ui, setGlobalVar: (n, v) => void set.push([n, v]) });
    const prog = program((a) => {
      a.proc('talk_p_proc').op('push_base');
      a.fn('saystart');
      // The first value of sayreply and saymessage is a title (never shown), the second is the text.
      a.push(0).pushStr('Hello').fn('sayreply');
      // An option: text and procedure number (procedures in order: talk_p_proc — 1, node_a — 2, node_b — 3).
      a.pushStr('First').push(2).fn('sayoption');
      a.pushStr('Second').push(3).fn('sayoption');
      a.fn('sayend').fn('end_dialogue').ret();
      a.proc('node_a').op('push_base').push(1).push(11).fn('set_global_var').ret();
      a.proc('node_b').op('push_base').push(1).push(22).fn('set_global_var').ret();
    });
    expect([prog.findProcedure('node_a'), prog.findProcedure('node_b')]).toEqual([2, 3]);
    const vm = new ScriptVM(prog, { call: (machine, code, args) => callGameFunction(ctx, machine, code, args), now: () => 0 });
    await vm.init();
    await vm.call('talk_p_proc');
    return { asked, set };
  }

  it('the reply and options are shown, the chosen option runs its procedure', async () => {
    const first = await converse([0]);
    expect(first.asked).toEqual([['Hello', ['First', 'Second']]]);
    expect(first.set).toEqual([[1, 11]]);
    const second = await converse([1]);
    expect(second.set).toEqual([[1, 22]]);
  });

  it('saymessage — one "next" button with no choice', async () => {
    const asked: [string, string[]][] = [];
    const ui: DialogueUI = { open: () => {}, ask: async (reply, options) => (asked.push([reply, options]), 0), close: () => {} };
    const ctx = makeContext({ dialogue: ui, message: (list, id) => (list === -2 && id === -2 ? 'Next' : '') });
    await runScript((a) => a.push(0).pushStr('Message').fn('saymessage').push(0), ctx);
    expect(asked).toEqual([['Message', ['Next']]]);
  });

  it('an option "to a reply by name" ends the dialogue', async () => {
    const asked: string[][] = [];
    const ui: DialogueUI = { open: () => {}, ask: async (_reply, options) => (asked.push(options), 0), close: () => {} };
    const ctx = makeContext({ dialogue: ui });
    const prog = program((a) => {
      a.proc('talk_p_proc').op('push_base');
      a.fn('saystart');
      a.push(0).pushStr('Reply').fn('sayreply');
      a.pushStr('To the name').pushStr('Name').fn('sayoption');
      a.fn('sayend').ret();
    });
    const vm = new ScriptVM(prog, { call: (machine, code, args) => callGameFunction(ctx, machine, code, args), now: () => 0 });
    await vm.init();
    await vm.call('talk_p_proc');
    expect(asked).toEqual([['To the name']]);
  });
});

describe('items and hands', () => {
  it('move_obj_inven_to_obj: all items from the first to the second; to itself and to "nobody" — nothing', async () => {
    const moved: [ScriptObject, ScriptObject][] = [];
    const ctx = makeContext({ moveInventory: (from, to) => void moved.push([from, to]) });
    await runScript((a) => a.fn('self_obj').fn('dude_obj').fn('move_obj_inven_to_obj').push(0), ctx);
    await runScript((a) => a.fn('self_obj').fn('self_obj').fn('move_obj_inven_to_obj').push(0), ctx);
    await runScript((a) => a.push(0).fn('dude_obj').fn('move_obj_inven_to_obj').push(0), ctx);
    expect(moved).toEqual([[ctx.self, ctx.dude]]);
  });

  it('wield_obj_critter wields only an item and only by a critter; inven_unwield takes one\'s own out of hands', async () => {
    const wielded: [ScriptObject, ScriptObject | null][] = [];
    const ctx = makeContext({ wield: (o, it) => void wielded.push([o, it]) });
    await runScript((a) => {
      a.fn('self_obj');
      item(a, 0x00000007);
      a.fn('wield_obj_critter').push(0);
    }, ctx);
    // An item does not wield an item, and "nothing" wields nothing.
    await runScript((a) => {
      a.fn('self_obj').fn('dude_obj').fn('wield_obj_critter').push(0);
    }, ctx);
    await runScript((a) => {
      a.push(0);
      item(a, 0x00000007);
      a.fn('wield_obj_critter').push(0);
    }, ctx);
    await runScript((a) => a.fn('inven_unwield').push(0), ctx);
    expect(wielded.map(([o, it]) => [o, it?.pid ?? null])).toEqual([
      [ctx.self, 7],
      [ctx.self, null],
    ]);
  });

  it('critter_attempt_placement returns the game\'s answer; not a critter — −1', async () => {
    const asked: [number, number][] = [];
    const ctx = makeContext({ placeNear: (_o, tile, elevation) => (asked.push([tile, elevation]), tile === 100 ? 0 : -1) });
    expect(value(await runScript((a) => a.fn('self_obj').push(100).push(1).fn('critter_attempt_placement'), ctx))).toBe(0);
    expect(value(await runScript((a) => a.fn('self_obj').push(200).push(0).fn('critter_attempt_placement'), ctx))).toBe(-1);
    expect(
      value(
        await runScript((a) => {
          item(a, 0x00000007);
          a.push(100).push(1).fn('critter_attempt_placement');
        }, ctx),
      ),
    ).toBe(-1);
    expect(asked).toEqual([
      [100, 1],
      [200, 0],
    ]);
  });

  it('critter_stop_attacking calms down, critter_set_flee_state remembers fleeing', async () => {
    const log: string[] = [];
    const ctx = makeContext({ calm: (o) => void log.push('calm ' + o.kind), setFleeing: (_o, f) => void log.push('flee ' + f) });
    await runScript((a) => a.fn('self_obj').fn('critter_stop_attacking').push(0), ctx);
    // There is nothing to calm the hero with.
    await runScript((a) => a.fn('dude_obj').fn('critter_stop_attacking').push(0), ctx);
    await runScript((a) => a.fn('self_obj').push(1).fn('critter_set_flee_state').push(0), ctx);
    await runScript((a) => a.fn('self_obj').push(0).fn('critter_set_flee_state').push(0), ctx);
    expect(log).toEqual(['calm critter', 'flee true', 'flee false']);
  });
});

describe('hero radiation and poison', () => {
  /** A game with the hero's two counters and radiation and poison resistance (in percent). */
  const withCounters = (radResist = 0, poisonResist = 0) => {
    const counters = { radiation: 0, poison: 0 };
    const ctx = makeContext({
      stat: (_o, stat) => (stat === 31 ? radResist : stat === 32 ? poisonResist : 5),
      condition: (o, kind) => (o.kind === 'dude' ? counters[kind] : 0),
      setCondition: (o, kind, v) => {
        if (o.kind === 'dude') counters[kind] = v;
      },
    });
    return { counters, ctx };
  };

  it('radiation_inc, radiation_dec and poison change the hero\'s counters; get_poison reads them', async () => {
    const { counters, ctx } = withCounters();
    await runScript((a) => a.fn('dude_obj').push(30).fn('radiation_inc').push(0), ctx);
    await runScript((a) => a.fn('dude_obj').push(8).fn('radiation_dec').push(0), ctx);
    expect(counters.radiation).toBe(22);
    await runScript((a) => a.fn('dude_obj').push(6).fn('poison').push(0), ctx);
    expect(counters.poison).toBe(6);
    expect(value(await runScript((a) => a.fn('dude_obj').fn('get_poison'), ctx))).toBe(6);
  });

  it('radiation and poison resistance reduce an increase but not a decrease; never below zero', async () => {
    const { counters, ctx } = withCounters(50, 25);
    await runScript((a) => a.fn('dude_obj').push(30).fn('radiation_inc').push(0), ctx);
    expect(counters.radiation).toBe(15);
    await runScript((a) => a.fn('dude_obj').push(10).fn('poison').push(0), ctx);
    // 25% of 10 is two and a half, as in the original with integers: 2 is subtracted.
    expect(counters.poison).toBe(8);
    await runScript((a) => a.fn('dude_obj').push(100).fn('radiation_dec').push(0), ctx);
    expect(counters.radiation).toBe(0);
    await runScript((a) => a.fn('dude_obj').push(-50).fn('poison').push(0), ctx);
    expect(counters.poison).toBe(0);
  });

  it('other critters have no counters', async () => {
    const { counters, ctx } = withCounters();
    await runScript((a) => a.fn('self_obj').push(30).fn('radiation_inc').push(0), ctx);
    await runScript((a) => a.fn('self_obj').push(30).fn('poison').push(0), ctx);
    await runScript((a) => a.push(0).push(30).fn('poison').push(0), ctx);
    expect(counters).toEqual({ radiation: 0, poison: 0 });
    expect(value(await runScript((a) => a.fn('self_obj').fn('get_poison'), ctx))).toBe(0);
  });
});

describe('sounds, explosions, barter', () => {
  it('play_sfx and reg_anim_play_sfx pass the sound name (the second also where it is heard from)', async () => {
    const played: [string, ScriptObject | undefined][] = [];
    const ctx = makeContext({ playSound: (name, at) => void played.push([name, at]) });
    await runScript((a) => a.pushStr('IISXXXX1').fn('play_sfx').push(0), ctx);
    await runScript((a) => a.fn('self_obj').pushStr('WHN1XXX1').push(0).fn('reg_anim_play_sfx').push(0), ctx);
    expect(played).toEqual([
      ['IISXXXX1', undefined],
      ['WHN1XXX1', ctx.self],
    ]);
  });

  it('explosion: hex, elevation and max damage; min is 1 (0 when zero); no hex — no explosion', async () => {
    const booms: [number, number, number, number][] = [];
    const ctx = makeContext({ explode: (tile, elevation, min, max) => void booms.push([tile, elevation, min, max]) });
    await runScript((a) => a.push(12345).push(1).push(30).fn('explosion').push(0), ctx);
    await runScript((a) => a.push(12346).push(0).push(0).fn('explosion').push(0), ctx);
    await runScript((a) => a.push(-1).push(0).push(30).fn('explosion').push(0), ctx);
    expect(booms).toEqual([
      [12345, 1, 1, 30],
      [12346, 0, 0, 0],
    ]);
  });

  it('gdialog_set_barter_mod remembers the number', async () => {
    let mod = 0;
    const ctx = makeContext({ setBarterMod: (n) => void (mod = n) });
    await runScript((a) => a.push(15).fn('gdialog_set_barter_mod').push(0), ctx);
    expect(mod).toBe(15);
    await runScript((a) => a.push(-10).fn('gdialog_set_barter_mod').push(0), ctx);
    expect(mod).toBe(-10);
  });
});

describe('images', () => {
  it('art_anim extracts the animation type from the third byte of the image code', async () => {
    expect(value(await runScript((a) => a.push(0x01230045).fn('art_anim')))).toBe(0x23);
    expect(value(await runScript((a) => a.push(0x10000001).fn('art_anim')))).toBe(0);
    // Rotation in the high bits of the code does not get in the way.
    expect(value(await runScript((a) => a.push(-0x7fdcffbb).fn('art_anim')))).toBe(0x23);
  });

  it('obj_art_fid: for an item and a critter — the prototype image, for the hero — "critter standing", for nothing — 0', async () => {
    const ctx = makeContext({
      item: async (pid) => ({ pid, messageId: 0, fid: 0x00000123, type: 5, weight: 0, cost: 0, inventoryFid: 0 }),
      self: { ...critterObject(), critter: { fid: 0x01000058 } as ScriptObject['critter'] },
    });
    expect(
      value(
        await runScript((a) => {
          item(a, 0x00000007);
          a.fn('obj_art_fid');
        }, ctx),
      ),
    ).toBe(0x123);
    expect(value(await runScript((a) => a.fn('self_obj').fn('obj_art_fid'), ctx))).toBe(0x01000058);
    expect(value(await runScript((a) => a.fn('dude_obj').fn('obj_art_fid'), ctx))).toBe(0x01000000);
    expect(value(await runScript((a) => a.push(0).fn('obj_art_fid'), ctx))).toBe(0);
  });
});

describe('what does nothing for now', () => {
  /** A context that fails on any access to the game: stubs must not touch it. */
  const strict = (log: string[]): ScriptContext => {
    const quiet = makeContext({ log: (text) => void log.push(text) });
    return new Proxy(quiet, {
      get(target, key: string) {
        if (key === 'log' || key === 'scriptName' || key === 'self' || key === 'dude') return Reflect.get(target, key);
        throw new Error('the script touched the game: ' + key);
      },
    });
  };

  it('light, stances, the returned number — silently', async () => {
    const log: string[] = [];
    const ctx = strict(log);
    await runScript((a) => a.push(70).fn('set_light_level').push(0), ctx);
    await runScript((a) => a.fn('self_obj').push(50).push(4).fn('obj_set_light_level').push(0), ctx);
    await runScript((a) => a.fn('self_obj').fn('animate_stand_obj').push(0), ctx);
    await runScript((a) => a.fn('self_obj').fn('animate_stand_reverse_obj').push(0), ctx);
    await runScript((a) => a.push(1).fn('scr_return').push(0), ctx);
    expect(log).toEqual([]);
  });

  it('world map opens; ending is the game summary screen; movie is shown; town map and ending movie are written to the script log', async () => {
    const log: string[] = [];
    let worldMap = 0;
    let ended = 0;
    const movies: number[] = [];
    await runScript((a) => a.push(7).fn('play_gmovie').push(0), makeContext({ playMovie: async (n) => void movies.push(n) }));
    expect(movies).toEqual([7]);
    await runScript((a) => a.fn('world_map').push(0), makeContext({ openWorldMap: () => void worldMap++ }));
    expect(worldMap).toBe(1);
    await runScript((a) => a.fn('endgame_slideshow').push(0), makeContext({ signalEndGame: () => void ended++ }));
    expect(ended).toBe(1);
    const ctx = strict(log);
    await runScript((a) => a.fn('town_map').push(0), ctx);
    await runScript((a) => a.fn('endgame_movie').push(0), ctx);
    expect(log).toHaveLength(2);
    expect(log.every((line) => line.includes('TEST'))).toBe(true);
  });
});
