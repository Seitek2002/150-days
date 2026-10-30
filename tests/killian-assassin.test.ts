// The attempt on Killian, as in the original: "on screen" is the original's window around the hero, not a view cone (the killer comes in
// from the side); in a scripted fight a critter knows its opponent even without seeing it, and after the fight does not go for the hero; a critter's
// wound is remembered with who caused it (damage_p_proc, source_obj); Killian's empty reply is his line 115 (asking how he can help).
import { describe, expect, it } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import { buildLevel } from '../src/engine/level.ts';
import { Player } from '../src/engine/player.ts';
import { Creature, type CreatureArt, type Target } from '../src/game/creature.ts';
import { hexCenter, onOriginalScreen } from '../src/game/hex.ts';
import type { Hero } from '../src/game/hero.ts';
import type { CritterKind, Resources } from '../src/game/resources.ts';
import type { SceneHost } from '../src/game/scene.ts';
import { emptyReplyOf } from '../src/game/text-fixes.ts';
import { callGameFunction, type DialogueUI, type ScriptContext, type ScriptObject } from '../src/script/game-functions.ts';
import { ScriptVM } from '../src/script/vm.ts';
import { parseLevelDef, type LevelDef } from '../src/world/defs.ts';
import { program } from './helpers/asm.ts';

(globalThis as { window?: unknown }).window ??= {};
const SceneClass = (await import('../src/game/scene.ts')).Scene;

const sheet: SpriteSheet = {
  fps: 10,
  actionFrame: 0,
  directions: Array.from({ length: 6 }, () => [{ width: 1, height: 1, pixels: new Uint32Array(1) }]),
  shifts: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  offsets: Array.from({ length: 6 }, () => [{ x: 0, y: 0 }]),
};
const art: CreatureArt = { stand: sheet, walk: sheet, attack: sheet, hit: sheet, death: sheet };
const stats = { name: 'Critter', maxHp: 40, ac: 0, armor: { dt: 0, dr: 0 }, skill: 60, damage: { min: 1, max: 2 }, experience: 0 };
const frame = { col: 150, row: 60 };
const grid = ['########################', ...Array.from({ length: 12 }, () => '#......................#'), '########################'];
const field = buildLevel(parseLevelDef({ id: 't', music: '', floor: 'floor', ceiling: 'ceiling', fade: 10, grid, entries: { s: { x: 1.5, y: 1.5, angle: 0 } } }));

describe('the attempt on Killian', () => {
  it('"on screen" is the original\'s window around the hero, wherever he looks', () => {
    const hero = { x: 10.5, y: 6.5 };
    // To the side and behind, nearby: on screen (the hero's view does not matter).
    expect(onOriginalScreen(frame, hero, { x: 14.5, y: 6.5 })).toBe(true);
    expect(onOriginalScreen(frame, hero, { x: 7.5, y: 8.5 })).toBe(true);
    // Far away: beyond the window edge.
    expect(onOriginalScreen(frame, hero, { x: 40.5, y: 6.5 })).toBe(false);
    // Beyond the original's grid: unknown.
    expect(onOriginalScreen(frame, hero, { x: -500, y: 6.5 })).toBeNull();
  });

  it('in a scripted fight a critter finds its opponent even behind it; after the fight it is calm', () => {
    // Looks east, the opponent is three cells behind; the fight runs as in the scene (fightFoe).
    const c = new Creature(1, 10.5, 6.5, stats, art, false, 0, null);
    const foe: Target = { x: 7.5, y: 6.5, alive: true, light: 1, stealth: 1 };
    let blows = 0;
    c.hostile = true;
    c.engage();
    // Knows the opponent at once, though it does not see it.
    expect(c.chasing).toBe(true);
    for (let t = 0; t < 4; t += 0.05) {
      c.hostile = true;
      c.engage();
      c.update(0.05, field, foe, [c], () => blows++);
      c.hostile = false;
    }
    expect(blows).toBeGreaterThan(0);
    c.calm();
    expect(c.chasing).toBe(false);
  });

  it('scripted fight and wounds: who is fighting, who wounded whom', async () => {
    const scene = await SceneClass.create(testDef(), host());
    const kenji = (await scene.addCreated({ kind: 'critter', pid: 0x01000037, x: 8.5, y: 6.5, script: 'KENJI' })).creature!;
    const killian = (await scene.addCreated({ kind: 'critter', pid: 0x01000037, x: 9.5, y: 6.5, script: 'KILLIAN' })).creature!;
    scene.startFight(kenji, killian);
    expect(scene.inFight(kenji)).toBe(true);
    expect(scene.inFight(killian)).toBe(true);
    expect(scene.lastHitBy(kenji)).toBeUndefined();
    // The hero wounded the killer.
    (scene as unknown as { wound: (c: Creature, p: Player, dmg: number, crit: boolean) => void }).wound(kenji, new Player({ x: 8.5, y: 8.5, angle: 0 }), 5, false);
    expect(scene.takeCreatureHits()).toEqual([{ victim: kenji, by: null }]);
    expect(scene.takeCreatureHits()).toEqual([]);
    expect(scene.lastHitBy(kenji)).toBeNull();
  });

  it('Killian\'s empty reply (back to questions) is his line 115, others stay as they were', async () => {
    expect(emptyReplyOf('killian')).toEqual([47, 115]);
    const reply = async (scriptName: string) => {
      const asked: string[] = [];
      const ui: DialogueUI = { open: () => {}, ask: async (r) => (asked.push(r), 0), close: () => {} };
      const self: ScriptObject = { kind: 'critter', pid: 1, name: () => 'Killian' };
      const ctx = {
        scriptName,
        self,
        dude: { kind: 'dude', pid: 0, name: () => 'Hero' },
        stat: () => 5,
        message: (list: number, id: number) => (list === 47 && id === 115 ? 'line 115' : ''),
        loadMessages: async () => {},
        dialogue: ui,
        log: () => {},
      } as unknown as ScriptContext;
      const vm = new ScriptVM(
        program((a) => {
          a.proc('talk_p_proc').op('push_base');
          a.push(1).fn('gsay_start');
          a.push(0).push(0).fn('gsay_reply');
          a.push(4).push(1).pushStr('Bye').pushStr('node_bye').push(50).fn('giq_option');
          a.fn('gsay_end').fn('end_dialogue').ret();
          a.proc('node_bye').op('push_base').ret();
        }),
        { call: (machine, code, args) => callGameFunction(ctx, machine, code, args), now: () => 0 },
      );
      await vm.init();
      await vm.call('talk_p_proc');
      return asked[0];
    };
    expect(await reply('KILLIAN')).toBe('line 115');
    expect(await reply('TEST')).toBe('');
  });
});

function testDef(): LevelDef {
  return { id: 'assassin-test', original: 'JUNKKILL', hexFrame: frame, music: '', floor: 'floor', ceiling: 'ceiling', fade: 10, grid, entries: { start: { ...hexCenter(frame, 20000), angle: 0 } } };
}

function host(): SceneHost {
  const kind = (pid: number): CritterKind => ({ pid, stats, art, soundBase: '', bites: false, weapon: null, fighter: { special: { perception: 5 } } }) as unknown as CritterKind;
  const res = {
    preloadLevel: async () => {},
    critterKind: async (pid: number) => kind(pid),
    item: async (pid: number) => ({ pid, messageId: 0, fid: 0, type: 5, weight: 0, cost: 0, inventoryFid: 0 }),
    groundSprite: async () => sheet,
    itemName: () => 'item',
    sound: { playAt: () => {}, play: () => {} },
  } as unknown as Resources;
  return {
    res,
    hero: { inventory: { count: () => 0 }, fighter: { skills: new Array(18).fill(0) }, critChance: 0, kills: 0, character: { perks: {} }, addExperience: () => ({ gained: 0, levels: 0 }) } as unknown as Hero,
    player: new Player({ x: 3.5, y: 3.5, angle: 0 }),
    clock: { seconds: 0 },
    say: () => {},
  };
}
