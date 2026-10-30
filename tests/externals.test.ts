// Shared script variables (export_var, store_external, fetch_external): the name lies in the script's name block, even though
// it is pushed onto the stack as a string. This is how store containers hand themselves to the merchant, a shelf its number, a door itself to the officer.
import { describe, expect, it } from 'vitest';
import { asInt, ScriptVM, externalVars, type Value } from '../src/script/vm.ts';
import { program } from './helpers/asm.ts';

const run = async (body: Parameters<typeof program>[0]): Promise<Value | undefined> => {
  const vm = new ScriptVM(
    program((a) => {
      a.proc('test').op('push_base');
      body(a);
      a.push(0).op('store_global').ret();
    }),
    { call: () => undefined, now: () => 0 },
  );
  await vm.init();
  await vm.call('test');
  return vm.stack[vm.bp];
};

describe('shared script variables', () => {
  it('one script writes, another reads, by name from the name block', async () => {
    await run((a) => a.pushName('Killian_Store_Box').op('export_var').push(2).pushName('Killian_Store_Box').op('store_external').push(0));
    expect(asInt(await run((a) => a.pushName('killian_store_box').op('fetch_external')))).toBe(2);
    // Different names do not get mixed up.
    await run((a) => a.push(7).pushName('Other').op('store_external').push(0));
    expect(asInt(await run((a) => a.pushName('Killian_Store_Box').op('fetch_external')))).toBe(2);
    expect(externalVars().get('other')).toEqual({ t: 'i', v: 7 });
  });
});
