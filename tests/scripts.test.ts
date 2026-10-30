// The script "processor" on real scripts from the player's copy: the start code of all scripts
// and the whole conversation with the Overseer. Without a game copy the tests are skipped.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parseLst, parseMsg } from '../src/formats/text.ts';
import { callGameFunction, type DialogueUI, type ScriptContext, type ScriptObject } from '../src/script/game-functions.ts';
import { IntProgram } from '../src/script/int.ts';
import { asInt, int, ScriptVM } from '../src/script/vm.ts';
import { makeContext } from './helpers/script-context.ts';
import { entryOf } from '../src/game/scripts.ts';

/** The code of the random function in scripts. */
const RANDOM = 0x80b4;

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

describe.skipIf(!available)('scripts from the player\'s copy', () => {
  it('the start code of all scripts runs without errors', async () => {
    const game = openGame(gameDir);
    try {
      const names = parseLst(game.read(`SCRIPTS${B}SCRIPTS.LST`)).map((l: string) => l.split('.')[0]!.trim().toUpperCase());
      const failures: string[] = [];
      let ran = 0;
      for (const name of names) {
        const bytes = game.read(`SCRIPTS${B}${name}.INT`);
        if (!bytes) continue;
        try {
          // A stub instead of the game: everything is 0 except random (some scripts loop until a non-zero comes up).
          const vm = new ScriptVM(new IntProgram(name, bytes), {
            call: (_vm, code, args) => (code === RANDOM ? int(asInt(args[0]) + Math.floor(Math.random() * (asInt(args[1]) - asInt(args[0]) + 1))) : int(0)),
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

  it('the conversation with the Overseer runs to the end (always the first answer)', async () => {
    const game = openGame(gameDir);
    try {
      const names = parseLst(game.read(`SCRIPTS${B}SCRIPTS.LST`)).map((l: string) => l.split('.')[0]!.trim().toUpperCase());
      const list = names.indexOf('OVER') + 1;
      expect(list).toBeGreaterThan(0);
      const messages = parseMsg(game.read(`TEXT${B}ENGLISH${B}DIALOG${B}OVER.MSG`));
      const replies: string[] = [];
      const optionCounts: number[] = [];
      let opened = 0;
      let closed = 0;
      const ui: DialogueUI = {
        open: () => void opened++,
        ask: async (reply, options) => {
          replies.push(reply);
          optionCounts.push(options.length);
          return 0;
        },
        close: () => void closed++,
      };
      const journal: string[] = [];
      const vars = new Map<string, number>();
      const self: ScriptObject = { kind: 'critter', pid: 0x01000008, name: () => 'Overseer' };
      const dude: ScriptObject = { kind: 'dude', pid: 0, name: () => 'Vault Dweller' };
      const ctx: ScriptContext = makeContext({
        scriptName: 'OVER',
        self,
        dude,
        globalVar: (n) => vars.get(`g${n}`) ?? 0,
        setGlobalVar: (n, v) => void vars.set(`g${n}`, v),
        mapVar: (n) => vars.get(`m${n}`) ?? 0,
        setMapVar: (n, v) => void vars.set(`m${n}`, v),
        localVar: (n) => vars.get(`l${n}`) ?? 0,
        setLocalVar: (n, v) => void vars.set(`l${n}`, v),
        message: (l, id) => (l === list ? (messages.get(id) ?? '') : ''),
        stat: (o, stat) => (o.kind === 'dude' && stat === 4 ? 5 : 5),
        skill: () => 40,
        countItems: () => 0,
        addItems: () => {},
        removeItems: () => {},
        item: async (pid) => ({ pid, messageId: 0, fid: 0, type: 5, weight: 0, cost: 0, inventoryFid: 0 }),
        itemName: () => 'item',
        say: () => {},
        giveExperience: () => {},
        attack: () => {},
        heal: () => {},
        gameSeconds: () => 0,
        requestTalk: () => {},
        dialogue: ui,
        log: (text) => void journal.push(text),
      });
      const vm = new ScriptVM(new IntProgram('OVER', game.read(`SCRIPTS${B}OVER.INT`)), {
        call: (machine, code, args) => callGameFunction(ctx, machine, code, args),
        now: () => 0,
        log: (text) => void journal.push(text),
      });
      await vm.init();
      await vm.call('talk_p_proc');
      expect(opened).toBe(1);
      expect(replies.length).toBeGreaterThan(0);
      expect(replies.every((r) => r.length > 0), 'all replies have text').toBe(true);
      expect(Math.max(...optionCounts)).toBeGreaterThan(0);
      // After the conversation the data stack is empty: the script returned "cleanly".
      expect(vm.stack.length).toBeLessThan(20);
    } finally {
      game.close();
    }
  }, 60_000);
});

// Client request, 2026-10-28: Aradesh "stared silently" on the English copy — his script is old, all events go to start. If an event has no
// procedure of its own, we call start (as the original does); the script learns the event from script_action.
describe.skipIf(!available)('events without their own procedure go to start', () => {
  it('an old script gets the dialogue in start, a new one in talk_p_proc', () => {
    const game = openGame(gameDir);
    try {
      const vmOf = (name: string) => new ScriptVM(new IntProgram(name, game.read(`SCRIPTS${B}${name}.INT`)), { call: () => int(0), now: () => 0 });
      // ELDER is old in both copies (localized and English): not a single event procedure.
      const elder = vmOf('ELDER');
      expect(elder.has('talk_p_proc')).toBe(false);
      expect(entryOf(elder, 'talk_p_proc')).toBe('start');
      expect(entryOf(elder, 'critter_p_proc')).toBe('start');
      const over = vmOf('OVER');
      expect(entryOf(over, 'talk_p_proc')).toBe('talk_p_proc');
      expect(entryOf(over, 'start')).toBe('start');
    } finally {
      game.close();
    }
  });
});
