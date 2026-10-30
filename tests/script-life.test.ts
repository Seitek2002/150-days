// Map life (Opus, part 2): delayed events, movement, visibility, death by script.
// The functions are called from small scripts built in the test; the "game" is replaced with a stub. The critter is real.
import { describe, expect, it } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import { buildLevel } from '../src/engine/level.ts';
import { findPath } from '../src/engine/path.ts';
import { Creature, type CreatureArt } from '../src/game/creature.ts';
import { LONG_TIMER_TICKS, makeTimer, takeDueTimers, type ScriptTimer } from '../src/game/script-timers.ts';
import { IMPLEMENTED, type ScriptObject } from '../src/script/game-functions.ts';
import { asInt, type ScriptVM } from '../src/script/vm.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { makeContext, runScript } from './helpers/script-context.ts';

const value = (vm: ScriptVM) => asInt(vm.stack[vm.bp]);

const sheet: SpriteSheet = {
  fps: 10,
  actionFrame: 0,
  directions: Array.from({ length: 6 }, () => [{ width: 1, height: 1, pixels: new Uint32Array(1) }]),
  shifts: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  offsets: Array.from({ length: 6 }, () => [{ x: 0, y: 0 }]),
};
const art: CreatureArt = { stand: sheet, walk: sheet, attack: sheet, hit: sheet, death: sheet };
const stats = { name: 'Villager', maxHp: 20, ac: 0, armor: { dt: 0, dr: 0 }, skill: 30, damage: { min: 1, max: 2 }, experience: 0 };

/** An empty 10×10 room with walls along the edge. */
const room = buildLevel(
  parseLevelDef({
    id: 'test',
    music: '',
    floor: 'floor',
    ceiling: 'ceiling',
    fade: 10,
    grid: ['##########', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '##########'],
    entries: { start: { x: 1.5, y: 1.5, angle: 0 } },
  }),
);
const far = { x: 100, y: 100, alive: true };

describe('map life functions are done', () => {
  it('all are in the function table', () => {
    for (const name of [
      'add_timer_event',
      'rm_timer_event',
      'fixed_param',
      'float_msg',
      'set_obj_visibility',
      'destroy_object',
      'move_to',
      'animate_move_obj_to_tile',
      'reg_anim_obj_move_to_tile',
      'reg_anim_obj_run_to_tile',
      'reg_anim_obj_move_to_obj',
      'reg_anim_func',
      'anim',
      'critter_add_trait',
      'kill_critter',
      'kill_critter_type',
      'critter_damage',
      'attack_setup',
      'terminate_combat',
      'load_map',
    ]) {
      expect(IMPLEMENTED.has(name), name).toBe(true);
    }
  });
});

describe('delayed events', () => {
  it('a short delay is seconds on the map; a long one (an hour or more) is by game hours', () => {
    expect(makeTimer('a', 30, 2, 1000)).toEqual({ key: 'a', param: 2, left: 3 });
    expect(makeTimer('a', LONG_TIMER_TICKS, 0, 1000)).toEqual({ key: 'a', param: 0, at: 1000 + 3600 });
  });

  it('they fire on time, only for those on this map, and are removed from the list', () => {
    const timers: ScriptTimer[] = [makeTimer('here:o1', 10, 1, 0), makeTimer('there:o2', 10, 2, 0), makeTimer('here:o3', 50, 3, 0), makeTimer('here:o4', LONG_TIMER_TICKS * 24, 4, 0)];
    const here = (key: string) => key.startsWith('here:');
    expect(takeDueTimers(timers, 0.5, 0, here)).toEqual([]);
    expect(takeDueTimers(timers, 0.6, 0, here).map((t) => t.param)).toEqual([1]);
    // Another map does not count down while the hero is not there.
    expect(timers.find((t) => t.key === 'there:o2')!.left).toBe(1);
    expect(takeDueTimers(timers, 4, 0, here).map((t) => t.param)).toEqual([3]);
    // A day flew by on the road — a long event fires as soon as the hero arrives.
    expect(takeDueTimers(timers, 0, 86400, here).map((t) => t.param)).toEqual([4]);
    expect(timers.map((t) => t.key)).toEqual(['there:o2']);
  });

  it('add_timer_event, rm_timer_event and fixed_param are passed to the game', async () => {
    const added: [ScriptObject, number, number][] = [];
    const removed: ScriptObject[] = [];
    const ctx = makeContext({ addTimer: (o, ticks, param) => void added.push([o, ticks, param]), removeTimers: (o) => void removed.push(o), fixedParam: () => 7 });
    await runScript((a) => a.fn('self_obj').push(30).push(2).fn('add_timer_event').push(0), ctx);
    expect(added).toEqual([[ctx.self, 30, 2]]);
    await runScript((a) => a.fn('self_obj').fn('rm_timer_event').push(0), ctx);
    expect(removed).toEqual([ctx.self]);
    expect(value(await runScript((a) => a.fn('fixed_param'), ctx))).toBe(7);
  });
});

describe('movement, visibility, death — from the script', () => {
  it('walking, running, stopping, turning', async () => {
    const walks: [number, boolean][] = [];
    let stopped = 0;
    let rotation = -1;
    const ctx = makeContext({
      walkTo: (_o, tile, run) => void walks.push([tile, run]),
      stopMoving: () => void stopped++,
      setRotation: (_o, r) => void (rotation = r),
      tileOf: () => 777,
    });
    await runScript((a) => a.fn('self_obj').push(1234).push(0).fn('animate_move_obj_to_tile').push(0), ctx);
    await runScript((a) => a.fn('self_obj').push(1235).push(1).fn('animate_move_obj_to_tile').push(0), ctx);
    await runScript((a) => a.fn('self_obj').push(1236).push(-1).fn('reg_anim_obj_move_to_tile').push(0), ctx);
    await runScript((a) => a.fn('self_obj').push(1237).push(-1).fn('reg_anim_obj_run_to_tile').push(0), ctx);
    await runScript((a) => a.fn('self_obj').fn('dude_obj').push(-1).fn('reg_anim_obj_move_to_obj').push(0), ctx);
    expect(walks).toEqual([
      [1234, false],
      [1235, true],
      [1236, false],
      [1237, true],
      [777, false],
    ]);
    // reg_anim_func: 1 — start a chain (does nothing), 2 — cancel the object's movements.
    await runScript((a) => a.push(1).push(0).fn('reg_anim_func').push(0), ctx);
    await runScript((a) => a.push(2).fn('self_obj').fn('reg_anim_func').push(0), ctx);
    expect(stopped).toBe(1);
    await runScript((a) => a.fn('self_obj').push(1000).push(4).fn('anim').push(0), ctx);
    expect(rotation).toBe(4);
  });

  it('visibility, destruction, moving', async () => {
    const shown: boolean[] = [];
    let destroyed: ScriptObject | null = null;
    const ctx = makeContext({ setVisible: (_o, v) => void shown.push(v), destroy: (o) => void (destroyed = o), moveTo: (_o, tile) => (tile === 5 ? 0 : -1) });
    await runScript((a) => a.fn('self_obj').push(1).fn('set_obj_visibility').push(0), ctx);
    await runScript((a) => a.fn('self_obj').push(0).fn('set_obj_visibility').push(0), ctx);
    expect(shown).toEqual([false, true]);
    await runScript((a) => a.fn('self_obj').fn('destroy_object').push(0), ctx);
    expect(destroyed).toBe(ctx.self);
    expect(value(await runScript((a) => a.fn('self_obj').push(5).push(0).fn('move_to'), ctx))).toBe(0);
    expect(value(await runScript((a) => a.push(0).push(5).push(0).fn('move_to'), ctx))).toBe(-1);
  });

  it('properties, death, damage, combat, moving to a map', async () => {
    const traits: [number, number][] = [];
    const log: string[] = [];
    const ctx = makeContext({
      setObjectTrait: (_o, trait, v) => void traits.push([trait, v]),
      kill: (o) => void log.push('kill ' + o.kind),
      killType: (pid) => void log.push('type ' + pid),
      damage: (o, n) => void log.push(`damage ${o.kind} ${n}`),
      attack: (o) => void log.push('attack ' + o.kind),
      endCombat: () => void log.push('end'),
      loadMap: (map, entrance) => void log.push(`map ${map} ${entrance}`),
    });
    // critter_add_trait: only object properties (type 1); perks and traits are not given this way.
    await runScript((a) => a.fn('self_obj').push(1).push(6).push(3).fn('critter_add_trait'), ctx);
    await runScript((a) => a.fn('self_obj').push(0).push(6).push(3).fn('critter_add_trait'), ctx);
    expect(traits).toEqual([[6, 3]]);
    await runScript((a) => a.fn('self_obj').push(0).fn('kill_critter').push(0), ctx);
    await runScript((a) => a.push(0x01000002).push(0).fn('kill_critter_type').push(0), ctx);
    await runScript((a) => a.fn('dude_obj').push(5).push(0).fn('critter_damage').push(0), ctx);
    await runScript((a) => a.fn('self_obj').fn('dude_obj').fn('attack_setup').push(0), ctx);
    await runScript((a) => a.fn('terminate_combat').push(0), ctx);
    await runScript((a) => a.pushStr('V13ENT.MAP').push(1).fn('load_map').push(0), ctx);
    expect(log).toEqual(['kill critter', `type ${0x01000002}`, 'damage dude 5', 'attack critter', 'end', 'map V13ENT.MAP 1']);
  });

  it('float_msg — a line over the head with a color', async () => {
    const floats: [ScriptObject, string, number][] = [];
    const ctx = makeContext({ float: (o, text, type) => void floats.push([o, text, type]) });
    await runScript((a) => a.fn('self_obj').pushStr('Hello').push(2).fn('float_msg').push(0), ctx);
    expect(floats).toEqual([[ctx.self, 'Hello', 2]]);
  });
});

describe('the critter obeys the script', () => {
  const make = () => new Creature(1, 2.5, 2.5, stats, art, false, 0);

  it('walks to a point and stops there', () => {
    const c = make();
    c.walkTo(6.5, 2.5);
    for (let i = 0; i < 200; i++) c.update(0.05, room, far, [c], () => {});
    // It stops slightly before the point: closer than 0.1 cell counts as arrived.
    expect(Math.abs(c.x - 6.5)).toBeLessThan(0.1);
    expect(c.y).toBeCloseTo(2.5, 1);
  });

  it('with a level it goes around a wall along a corridor; does not walk into a wall or a cut-off cell', () => {
    const walled = buildLevel(
      parseLevelDef({
        id: 'walled',
        music: '',
        floor: 'floor',
        ceiling: 'ceiling',
        fade: 10,
        grid: ['#######', '#.....#', '#####.#', '#.....#', '#.#####', '#.....#', '#######'],
        entries: { start: { x: 1.5, y: 1.5, angle: 0 } },
      }),
    );
    const path = findPath(walled, 1.5, 1.5, 5.5, 5.5)!;
    expect(path.at(-1)).toEqual({ x: 5.5, y: 5.5 });
    // A zigzag: through the passage on the right in the second row and on the left in the fourth.
    expect(path.some((p) => p.x === 5.5 && p.y === 2.5)).toBe(true);
    expect(path.some((p) => p.x === 1.5 && p.y === 4.5)).toBe(true);
    expect(findPath(walled, 1.5, 1.5, 3.5, 2.5)).toBeNull();
    const c = new Creature(1, 1.5, 1.5, stats, art, false, 0);
    expect(c.walkTo(5.5, 5.5, true, walled)).toBe(true);
    for (let i = 0; i < 400; i++) c.update(0.05, walled, far, [c], () => {});
    expect(Math.hypot(c.x - 5.5, c.y - 5.5)).toBeLessThan(0.1);
    expect(c.walkTo(3.5, 2.5, false, walled)).toBe(false);
  });

  it('stuck against a wall — gives up the path after a couple of seconds', () => {
    const c = make();
    c.walkTo(2.5, -5);
    for (let i = 0; i < 100; i++) c.update(0.05, room, far, [c], () => {});
    const y = c.y;
    c.update(0.05, room, far, [c], () => {});
    expect(c.y).toBe(y);
    expect(c.y).toBeGreaterThan(1);
  });

  it('a hidden one stands still; hidden and removed — is saved', () => {
    const c = make();
    c.hidden = true;
    c.walkTo(6.5, 2.5);
    for (let i = 0; i < 20; i++) c.update(0.05, room, far, [c], () => {});
    expect(c.x).toBe(2.5);
    c.gone = true;
    const copy = make();
    copy.restore(c.snapshot());
    expect(copy.hidden).toBe(true);
    expect(copy.gone).toBe(true);
    expect(copy.present).toBe(false);
    expect(make().snapshot()).not.toHaveProperty('hidden');
  });

  it('death by script and damage without hostility', () => {
    const c = make();
    expect(c.hurt(5, false)).toBe(false);
    expect(c.hostile).toBe(false);
    expect(c.hp).toBe(15);
    c.kill();
    expect(c.alive).toBe(false);
  });
});
