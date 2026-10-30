// The script "processor" on small scripts built right in the test (no game copy).
import { describe, expect, it } from 'vitest';
import { callGameFunction, iqAllows, type DialogueUI, type ScriptContext, type ScriptObject } from '../src/script/game-functions.ts';
import { asInt, asString, int, ScriptVM, type ScriptHost } from '../src/script/vm.ts';
import { program } from './helpers/asm.ts';

const quietHost: ScriptHost = { call: () => int(0), now: () => 0 };

describe('script processor', () => {
  it('the start run prepares global variables and stops', async () => {
    const vm = new ScriptVM(program(() => {}), quietHost);
    await vm.init();
    expect(vm.bp).toBe(0);
    expect(vm.stack.slice(0, 2).map(asInt)).toEqual([0, 0]);
  });

  it('arithmetic and writing to a global variable', async () => {
    const vm = new ScriptVM(
      program((a) => a.proc('calc').op('push_base').push(2).push(3).op('add').push(4).op('mul').push(0).op('store_global').ret()),
      quietHost,
    );
    await vm.init();
    await vm.call('calc');
    expect(asInt(vm.stack[vm.bp])).toBe(20);
    // After the return the stack is back to the global variables and the result of the start run.
    expect(vm.stack.length).toBe(3);
  });

  it('strings are added to numbers', async () => {
    const vm = new ScriptVM(
      program((a) => a.proc('text').op('push_base').pushStr('Vault ').push(13).op('add').push(1).op('store_global').ret()),
      quietHost,
    );
    await vm.init();
    await vm.call('text');
    expect(asString(vm.stack[vm.bp + 1])).toBe('Vault 13');
  });

  it('if: the "yes" branch and the "no" branch', async () => {
    const make = (left: number, right: number) =>
      program((a) =>
        a
          .proc('pick')
          .op('push_base')
          .push('else')
          .push(left)
          .push(right)
          .op('less')
          .op('if')
          .push(7)
          .push(0)
          .op('store_global')
          .push('end')
          .op('jump')
          .label('else')
          .push(9)
          .push(0)
          .op('store_global')
          .label('end')
          .ret(),
      );
    for (const [l, r, want] of [[1, 2, 7], [3, 2, 9]] as const) {
      const vm = new ScriptVM(make(l, r), quietHost);
      await vm.init();
      await vm.call('pick');
      expect(asInt(vm.stack[vm.bp])).toBe(want);
    }
  });

  it('game functions get arguments in order and push the result', async () => {
    const calls: number[][] = [];
    const host: ScriptHost = {
      call: (_vm, code, args) => {
        calls.push(args.map(asInt));
        return code === 0x80b4 ? int(asInt(args[1])) : undefined;
      },
      now: () => 0,
    };
    const vm = new ScriptVM(program((a) => a.proc('roll').op('push_base').push(3).push(18).fn('random').push(0).op('store_global').ret()), host);
    await vm.init();
    await vm.call('roll');
    expect(calls).toEqual([[3, 18]]);
    expect(asInt(vm.stack[vm.bp])).toBe(18);
  });

  it('an unknown procedure — nothing happens', async () => {
    const vm = new ScriptVM(program(() => {}), quietHost);
    await vm.init();
    await vm.call('talk_p_proc');
    expect(vm.stack.length).toBe(3);
  });
});

describe('dialogue', () => {
  it('a reply, an option with an Intelligence check, a jump by choice', async () => {
    const asked: [string, string[]][] = [];
    const vars = new Map<number, number>();
    const ui: DialogueUI = { open: () => {}, ask: async (r, o) => (asked.push([r, o]), 0), close: () => {} };
    const self: ScriptObject = { kind: 'critter', pid: 1, name: () => 'Villager' };
    const dude: ScriptObject = { kind: 'dude', pid: 0, name: () => 'Hero' };
    const ctx = {
      scriptName: 'TEST',
      self,
      dude,
      globalVar: (n: number) => vars.get(n) ?? 0,
      setGlobalVar: (n: number, v: number) => void vars.set(n, v),
      stat: (_o: ScriptObject, stat: number) => (stat === 4 ? 5 : 5),
      message: () => '',
      dialogue: ui,
      log: () => {},
    } as unknown as ScriptContext;
    const vm = new ScriptVM(
      program((a) => {
        a.proc('talk_p_proc').op('push_base');
        a.push(1).fn('gsay_start');
        a.push(1).pushStr('Hello').fn('gsay_reply');
        // An option for the smart (needs Intelligence 8) — not shown to a hero with 5.
        a.push(8).push(1).pushStr('Smart answer').pushStr('node_smart').push(50).fn('giq_option');
        a.push(4).push(1).pushStr('Bye').pushStr('node_bye').push(50).fn('giq_option');
        a.fn('gsay_end').fn('end_dialogue').ret();
        a.proc('node_bye').op('push_base').push(5).push(1).fn('set_global_var').ret();
        a.proc('node_smart').op('push_base').push(5).push(2).fn('set_global_var').ret();
      }),
      { call: (machine, code, args) => callGameFunction(ctx, machine, code, args), now: () => 0 },
    );
    await vm.init();
    await vm.call('talk_p_proc');
    expect(asked).toEqual([['Hello', ['Bye']]]);
    expect(vars.get(5)).toBe(1);
  });

  it('Intelligence check: normal and "dumb" options', () => {
    expect(iqAllows(5, 4)).toBe(true);
    expect(iqAllows(5, 7)).toBe(false);
    // A "dumb" option (-3) — only at Intelligence 3 and below.
    expect(iqAllows(5, -3)).toBe(false);
    expect(iqAllows(2, -3)).toBe(true);
  });
});
