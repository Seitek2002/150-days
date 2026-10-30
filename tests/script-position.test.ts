// Position functions from scripts (task D2): tiles, distances, directions, seeing and hearing.
// Each is called from a small script built in the test; the "game" is replaced with a stub.
import { describe, expect, it } from 'vitest';
import { HEX_WIDTH, ROTATION, tileDir, tileDist, tileInDirection } from '../src/game/hex.ts';
import { IMPLEMENTED, type ScriptContext, type ScriptObject } from '../src/script/game-functions.ts';
import { asInt, type ScriptVM } from '../src/script/vm.ts';
import { makeContext, runScript } from './helpers/script-context.ts';

const value = (vm: ScriptVM) => asInt(vm.stack[vm.bp]);

const MIDDLE = 100 * HEX_WIDTH + 100;

/** A context where the hero (dude_obj) and the critter (self_obj) have tiles set. */
function placed(dude: number, self: number, over: Partial<ScriptContext> = {}): ScriptContext {
  const base = makeContext();
  return makeContext({
    tileOf: (o: ScriptObject) => (o === base.dude ? dude : o === base.self ? self : -1),
    ...over,
    // The hero and the critter come from the stub so that `tileOf` recognizes them.
    dude: base.dude,
    self: base.self,
  });
}

describe('position functions are done', () => {
  it('all are in the function table', () => {
    for (const name of ['tile_num', 'tile_num_in_direction', 'tile_distance', 'tile_distance_objs', 'rotation_to_tile', 'elevation', 'cur_map_index', 'obj_can_see_obj', 'obj_can_hear_obj']) {
      expect(IMPLEMENTED.has(name), name).toBe(true);
    }
  });
});

describe('tiles and distances', () => {
  it('tile_num: the object\'s tile; no object — −1', async () => {
    const ctx = placed(MIDDLE, MIDDLE + 5);
    expect(value(await runScript((a) => a.fn('dude_obj').fn('tile_num'), ctx))).toBe(MIDDLE);
    expect(value(await runScript((a) => a.fn('self_obj').fn('tile_num'), ctx))).toBe(MIDDLE + 5);
    expect(value(await runScript((a) => a.push(0).fn('tile_num'), ctx))).toBe(-1);
  });

  it('tile_distance: steps between tiles; −1 — very far', async () => {
    const far = tileInDirection(MIDDLE, ROTATION.se, 7);
    expect(value(await runScript((a) => a.push(MIDDLE).push(far).fn('tile_distance')))).toBe(7);
    expect(value(await runScript((a) => a.push(MIDDLE).push(MIDDLE).fn('tile_distance')))).toBe(0);
    expect(value(await runScript((a) => a.push(-1).push(far).fn('tile_distance')))).toBe(9999);
    expect(value(await runScript((a) => a.push(MIDDLE).push(-1).fn('tile_distance')))).toBe(9999);
  });

  it('tile_distance_objs: by object tiles; another elevation, no tile or object — very far', async () => {
    const near = tileInDirection(MIDDLE, ROTATION.e, 4);
    const ctx = placed(MIDDLE, near);
    expect(value(await runScript((a) => a.fn('dude_obj').fn('self_obj').fn('tile_distance_objs'), ctx))).toBe(4);
    const otherFloor = placed(MIDDLE, near, { elevationOf: (o) => (o.kind === 'dude' ? 0 : 1) });
    expect(value(await runScript((a) => a.fn('dude_obj').fn('self_obj').fn('tile_distance_objs'), otherFloor))).toBe(9999);
    expect(value(await runScript((a) => a.fn('dude_obj').fn('self_obj').fn('tile_distance_objs'), placed(MIDDLE, -1)))).toBe(9999);
    expect(value(await runScript((a) => a.fn('dude_obj').push(0).fn('tile_distance_objs'), ctx))).toBe(9999);
  });

  it('tile_num_in_direction: the tile several steps away; bad values — −1', async () => {
    const walk = async (origin: number, rotation: number, distance: number) =>
      value(await runScript((a) => a.push(origin).push(rotation).push(distance).fn('tile_num_in_direction')));
    expect(await walk(MIDDLE, ROTATION.sw, 3)).toBe(tileInDirection(MIDDLE, ROTATION.sw, 3));
    expect(await walk(MIDDLE, ROTATION.ne, 1)).toBe(MIDDLE - 1);
    expect(await walk(-1, 2, 3)).toBe(-1);
    expect(await walk(MIDDLE, 6, 3)).toBe(-1);
    expect(await walk(MIDDLE, 2, 0)).toBe(-1);
  });

  it('rotation_to_tile: which way to face to see the second tile', async () => {
    for (const rotation of [0, 1, 2, 3, 4, 5]) {
      const target = tileInDirection(MIDDLE, rotation, 4);
      expect(value(await runScript((a) => a.push(MIDDLE).push(target).fn('rotation_to_tile')))).toBe(tileDir(MIDDLE, target));
    }
    expect(value(await runScript((a) => a.push(MIDDLE).push(MIDDLE + 3 * HEX_WIDTH).fn('rotation_to_tile')))).toBe(ROTATION.se);
  });
});

describe('elevation and map number', () => {
  it('elevation: the object\'s elevation; no object — 0', async () => {
    const ctx = makeContext({ elevationOf: () => 2 });
    expect(value(await runScript((a) => a.fn('dude_obj').fn('elevation'), ctx))).toBe(2);
    expect(value(await runScript((a) => a.push(0).fn('elevation'), ctx))).toBe(0);
  });

  it('cur_map_index: the map number from the game', async () => {
    expect(value(await runScript((a) => a.fn('cur_map_index'), makeContext({ mapIndex: () => 37 })))).toBe(37);
    expect(value(await runScript((a) => a.fn('cur_map_index')))).toBe(-1);
  });
});

describe('seeing and hearing', () => {
  // The hero faces south-east; Perception 5: sees 25 hexes ahead, hears 5 behind.
  const watcher = (target: number, over: Partial<ScriptContext> = {}) =>
    placed(MIDDLE, target, { stat: () => 5, rotationOf: () => ROTATION.se, ...over });
  const sees = async (ctx: ScriptContext) => value(await runScript((a) => a.fn('dude_obj').fn('self_obj').fn('obj_can_see_obj'), ctx));
  const hears = async (ctx: ScriptContext) => value(await runScript((a) => a.fn('dude_obj').fn('self_obj').fn('obj_can_hear_obj'), ctx));

  it('ahead, close and no wall — sees', async () => {
    expect(await sees(watcher(tileInDirection(MIDDLE, ROTATION.se, 10)))).toBe(1);
  });

  it('ahead, but farther than five Perceptions — does not see', async () => {
    expect(await sees(watcher(tileInDirection(MIDDLE, ROTATION.se, 26)))).toBe(0);
    expect(await sees(watcher(tileInDirection(MIDDLE, ROTATION.se, 25)))).toBe(1);
  });

  it('a wall in the way — does not see', async () => {
    expect(await sees(watcher(tileInDirection(MIDDLE, ROTATION.se, 6), { lineOfSight: () => false }))).toBe(0);
  });

  it('behind is visible only up close (at the Perception distance)', async () => {
    expect(await sees(watcher(tileInDirection(MIDDLE, ROTATION.nw, 5)))).toBe(1);
    expect(await sees(watcher(tileInDirection(MIDDLE, ROTATION.nw, 6)))).toBe(0);
  });

  it('to the side within three directions — as ahead', async () => {
    expect(await sees(watcher(tileInDirection(MIDDLE, ROTATION.e, 10)))).toBe(1);
    expect(await sees(watcher(tileInDirection(MIDDLE, ROTATION.sw, 10)))).toBe(1);
  });

  it('no target object or tile — does not see', async () => {
    expect(await sees(watcher(-1))).toBe(0);
    expect(value(await runScript((a) => a.fn('dude_obj').push(0).fn('obj_can_see_obj'), watcher(MIDDLE + 3)))).toBe(0);
    expect(value(await runScript((a) => a.push(0).fn('self_obj').fn('obj_can_see_obj'), watcher(MIDDLE + 3)))).toBe(0);
  });

  it('hears everyone within Perception, even behind a wall; farther — no', async () => {
    expect(await hears(watcher(tileInDirection(MIDDLE, ROTATION.nw, 5), { lineOfSight: () => false }))).toBe(1);
    expect(await hears(watcher(tileInDirection(MIDDLE, ROTATION.nw, 6)))).toBe(0);
    expect(await hears(watcher(tileInDirection(MIDDLE, ROTATION.se, 12), { lineOfSight: () => false }))).toBe(1);
  });

  it('does not hear on different elevations; no object — no', async () => {
    expect(await hears(watcher(MIDDLE + 2, { elevationOf: (o) => (o.kind === 'dude' ? 0 : 1) }))).toBe(0);
    expect(value(await runScript((a) => a.push(0).fn('self_obj').fn('obj_can_hear_obj'), watcher(MIDDLE + 2)))).toBe(0);
  });

  it('the observer\'s Perception is used', async () => {
    const dull = watcher(tileInDirection(MIDDLE, ROTATION.se, 10), { stat: () => 1 });
    expect(await sees(dull)).toBe(0);
    const sharp = watcher(tileInDirection(MIDDLE, ROTATION.se, 10), { stat: () => 8 });
    expect(await sees(sharp)).toBe(1);
  });
});

describe('distances and steps agree', () => {
  it('"adjacent tile" and "distance one" are the same', () => {
    for (let rotation = 0; rotation < 6; rotation++) expect(tileDist(MIDDLE, tileInDirection(MIDDLE, rotation, 1))).toBe(1);
  });
});
