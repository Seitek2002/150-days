// Doors and locks as script objects, objects spawned by scripts (Opus, part 3).
// Game functions are tested on small scripts from the test; doors and created objects on a real scene with resource stubs.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import type { CreatureArt } from '../src/game/creature.ts';
import { hexCenter } from '../src/game/hex.ts';
import type { Hero } from '../src/game/hero.ts';
import type { CritterKind, Resources } from '../src/game/resources.ts';
import { emptyMapState, type MapState } from '../src/game/save.ts';
import type { Scene, SceneHost } from '../src/game/scene.ts';
import { Player } from '../src/engine/player.ts';
import { t } from '../src/i18n.ts';
import { IMPLEMENTED, type ScriptObject } from '../src/script/game-functions.ts';
import { asInt, type ScriptVM } from '../src/script/vm.ts';
import type { LevelDef } from '../src/world/defs.ts';
import { MAP_SCRIPTS } from '../src/world/map-scripts.ts';
import { makeContext, runScript } from './helpers/script-context.ts';

const value = (vm: ScriptVM) => asInt(vm.stack[vm.bp]);

// The scene pulls in the game resources, and they pull in the platform, which needs a browser window: tests have none, so we stub an empty one.
(globalThis as { window?: unknown }).window ??= {};
const SceneClass = (await import('../src/game/scene.ts')).Scene;

describe('door and lock functions', () => {
  it('are implemented', () => {
    for (const name of ['obj_is_open', 'obj_open', 'obj_close', 'obj_is_locked', 'obj_lock', 'obj_unlock', 'jam_lock', 'use_obj', 'script_overrides', 'action_being_used', 'create_object_sid']) {
      expect(IMPLEMENTED.has(name), name).toBe(true);
    }
  });

  it('open, close, lock, unlock, jam go through the game; use_obj on a door works like a hand', async () => {
    const door: ScriptObject = { kind: 'scenery', pid: 0x02000001, name: () => '' };
    let open = false;
    let locked = true;
    let jammed = false;
    const ctx = makeContext({
      self: door,
      isOpen: () => open,
      setOpen: (_o, v) => {
        if (v && locked) return;
        open = v;
      },
      isLocked: () => locked,
      setLocked: (_o, v) => {
        locked = v;
      },
      jamLock: () => {
        jammed = true;
      },
    });
    expect(value(await runScript((a) => a.fn('self_obj').fn('obj_is_locked'), ctx))).toBe(1);
    await runScript((a) => a.fn('self_obj').fn('obj_unlock').push(0), ctx);
    expect(locked).toBe(false);
    await runScript((a) => a.fn('self_obj').fn('use_obj').push(0), ctx);
    expect(open).toBe(true);
    expect(value(await runScript((a) => a.fn('self_obj').fn('obj_is_open'), ctx))).toBe(1);
    await runScript((a) => a.fn('self_obj').fn('obj_close').fn('self_obj').fn('obj_lock').fn('self_obj').fn('jam_lock').push(0), ctx);
    expect(open).toBe(false);
    expect(locked).toBe(true);
    expect(jammed).toBe(true);
    // use_obj will not open a locked one.
    await runScript((a) => a.fn('self_obj').fn('use_obj').push(0), ctx);
    expect(open).toBe(false);
  });

  it('script_overrides forbids the default action; action_being_used is the skill being applied', async () => {
    let overridden = false;
    const ctx = makeContext({
      overrideDefault: () => {
        overridden = true;
      },
      skillBeingUsed: () => 9,
    });
    expect(value(await runScript((a) => a.fn('script_overrides').fn('action_being_used'), ctx))).toBe(9);
    expect(overridden).toBe(true);
  });

  it('create_object_sid: an item "in nowhere" is created by the function itself, the rest by the game (prototype, location, elevation, script)', async () => {
    const calls: number[][] = [];
    const ctx = makeContext({
      createObject: async (pid, tile, elevation, sid) => {
        calls.push([pid, tile, elevation, sid]);
        return { kind: 'critter', pid, name: () => '' };
      },
    });
    const item = await runScript((a) => a.push(40).push(0).push(0).push(-1).fn('create_object_sid').fn('obj_pid'), ctx);
    expect(value(item)).toBe(40);
    expect(calls).toEqual([]);
    await runScript((a) => a.push(0x0100000b).push(21515).push(0).push(12).fn('create_object_sid').fn('obj_pid'), ctx);
    expect(calls).toEqual([[0x0100000b, 21515, 0, 12]]);
  });
});

describe('script table of the original\'s maps', () => {
  it('maps have their scripts, doors have elevation, hex, script and lock', () => {
    expect(MAP_SCRIPTS.SHADYW?.script).toBe('SHADYWST');
    const sec = MAP_SCRIPTS.VAULT13!.doors.find(([, , name]) => name === 'SECDOOR');
    expect(sec).toEqual([2, 21492, 'SECDOOR', 1]);
    for (const table of Object.values(MAP_SCRIPTS)) {
      for (const [elevation, tile, , locked] of table.doors) {
        expect(elevation >= 0 && elevation <= 2).toBe(true);
        expect(tile >= 0 && tile < 40000).toBe(true);
        expect(locked === 0 || locked === 1).toBe(true);
      }
    }
  });
});

// ---------------- scene on stubs ----------------

const sheet: SpriteSheet = {
  fps: 10,
  actionFrame: 0,
  directions: Array.from({ length: 6 }, () => [{ width: 1, height: 1, pixels: new Uint32Array(1) }]),
  shifts: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  offsets: Array.from({ length: 6 }, () => [{ x: 0, y: 0 }]),
};
const art: CreatureArt = { stand: sheet, walk: sheet, attack: sheet, hit: sheet, death: sheet };
const RAT = 0x0100000b;
const PERSON = 0x01000037;

function fakeRes(): Resources {
  const kind = (pid: number): CritterKind =>
    ({
      pid,
      stats: { name: 'Creature', maxHp: 10, ac: 0, armor: { dt: 0, dr: 0 }, skill: 30, damage: { min: 1, max: 2 }, experience: 0 },
      art,
      soundBase: '',
      bites: pid === RAT,
      weapon: null,
      fighter: { special: { perception: 5 } },
    }) as unknown as CritterKind;
  return {
    preloadLevel: async () => {},
    critterKind: async (pid: number) => kind(pid),
    item: async (pid: number) => ({ pid, messageId: 0, fid: 0, type: 5, weight: 0, cost: 0, inventoryFid: 0 }),
    groundSprite: async () => sheet,
    itemName: () => 'item',
    sound: { playAt: () => {}, play: () => {} },
  } as unknown as Resources;
}

/** A level "inspired by" the third floor of Vault 13: one door where the original has the guard door, and one ordinary door. */
const frame = { col: 146, row: 77 };
const sec = hexCenter(frame, 21492);
const secCell = { x: Math.floor(sec.x), y: Math.floor(sec.y) };
function vaultDef(): LevelDef {
  const width = 30;
  const height = 26;
  const grid = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.')).join(''),
  );
  return {
    id: 'vault-test',
    original: 'VAULT13',
    elevation: 2,
    hexFrame: frame,
    music: '',
    floor: 'floor',
    ceiling: 'ceiling',
    fade: 10,
    grid,
    entries: { start: { x: 3.5, y: 3.5, angle: 0 } },
    objects: [
      { kind: 'door', x: secCell.x + 0.5, y: secCell.y + 0.5 },
      { kind: 'door', x: 5.5, y: 5.5 },
    ],
  };
}

function host(lockpick: number) {
  const said: string[] = [];
  const h: SceneHost = {
    res: fakeRes(),
    hero: { inventory: { count: () => 0 }, fighter: { skills: Object.assign(new Array(18).fill(0), { 9: lockpick }) }, critChance: 0 } as unknown as Hero,
    player: new Player({ x: 3.5, y: 3.5, angle: 0 }),
    clock: { seconds: 0 },
    say: (m) => void said.push(m),
  };
  return { h, said };
}

const doorAt = (scene: Scene, x: number, y: number) => {
  return (scene as unknown as { doors: { door: { cx: number; cy: number } }[] }).doors.find((d) => d.door.cx === x && d.door.cy === y) as never as Parameters<Scene['pickLock']>[0];
};

describe('doors on the map', () => {
  afterEach(() => vi.restoreAllMocks());

  it('the guard door gets the original\'s script and lock, the ordinary one does not', async () => {
    const { h } = host(0);
    const scene = await SceneClass.create(vaultDef(), h);
    const scripted = scene.scriptedDoors();
    expect(scripted).toHaveLength(1);
    expect(scripted[0]!.script).toEqual({ name: 'SECDOOR', key: `vault-test:d${secCell.y * 30 + secCell.x}` });
    expect(scripted[0]!.locked).toBe(true);
    expect(doorAt(scene, 5, 5).locked).toBe(false);
  });

  it('locked: "locked" with the lockpick chance, then E picks it; once picked it stays unlocked even after returning', async () => {
    const { h, said } = host(60);
    const scene = await SceneClass.create(vaultDef(), h);
    const d = scene.scriptedDoors()[0]!;
    expect(scene.setDoorOpen(d, true)).toBe(false);
    scene.operateDoor(d);
    expect(said.at(-1)).toContain('60');
    expect(d.knownLocked).toBe(true);
    // The hero at the door: E gives the door script the lockpick attempt.
    h.player.x = d.door.cx + 0.5;
    h.player.y = d.door.cy + 1.4;
    h.player.angle = -Math.PI / 2;
    expect(scene.use(h.player)).toEqual({ type: 'door', door: d, pick: true });
    // The script does not object: an ordinary lockpick: roll 1 out of 100 at chance 60 is a success.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    scene.pickLock(d);
    expect(said.at(-1)).toBe(t('msgLockPicked'));
    expect(d.locked).toBe(false);
    const state = scene.snapshot();
    expect(state.locks).toEqual({ [d.key]: 0 });
    const again = await SceneClass.create(vaultDef(), host(0).h, state);
    expect(again.scriptedDoors()[0]!.locked).toBe(false);
  });

  it('a jammed lock cannot be picked; a critical failure jams it (after the first day)', async () => {
    const { h, said } = host(0);
    h.clock.seconds = 2 * 86400;
    const scene = await SceneClass.create(vaultDef(), h);
    const d = scene.scriptedDoors()[0]!;
    // Roll 100 at chance 0 is a failure by 100, critical (second roll 1 ≤ 10).
    const rolls = [0.999, 0];
    vi.spyOn(Math, 'random').mockImplementation(() => rolls.shift() ?? 0.5);
    scene.pickLock(d);
    expect(d.jammed).toBe(true);
    expect(said.at(-1)).toBe(t('msgLockJammedNow'));
    scene.pickLock(d);
    expect(said.at(-1)).toBe(t('msgLockJammed'));
  });
});

describe('objects created by a script', () => {
  it('a scripted creature and an item on the ground live along with the map', async () => {
    const { h } = host(0);
    const scene = await SceneClass.create(vaultDef(), h);
    const rat = await scene.addCreated({ kind: 'critter', pid: RAT, x: 10.5, y: 10.5, script: 'RADSCORP' });
    const person = await scene.addCreated({ kind: 'critter', pid: PERSON, x: 3.5, y: 3.5, script: 'OFFICER', hidden: true });
    await scene.addCreated({ kind: 'item', pid: 40, x: 12.5, y: 12.5, count: 1 });
    expect(rat.key).toBe('c1');
    expect(rat.creature!.hostile).toBe(true);
    expect(person.creature!.hostile).toBe(false);
    expect(person.creature!.hidden).toBe(true);
    expect(scene.pidOf(rat.creature!)).toBe(RAT);
    expect(scene.indexOf(rat.creature!)).toBe(-1);
    expect(scene.scripted().map((s) => [s.name, s.key])).toEqual([
      ['RADSCORP', 'vault-test:c1'],
      ['OFFICER', 'vault-test:c2'],
    ]);
    // Back on the map: everything is in place, the killed one stays killed.
    person.creature!.hidden = false;
    rat.creature!.kill();
    const state: MapState = scene.snapshot();
    expect(state.created).toHaveLength(3);
    const again = await SceneClass.create(vaultDef(), host(0).h, state);
    const [r, p] = again.creatures;
    expect(again.pidOf(r!)).toBe(RAT);
    expect(r!.alive).toBe(false);
    expect(p!.hidden).toBe(false);
    expect(again.scripted().map((s) => s.key)).toEqual(['vault-test:c1', 'vault-test:c2']);
  });

  it('something created "on another elevation" appears when the hero gets there: with script, items and weapon', async () => {
    const state = emptyMapState();
    state.created = [{ key: 'c1', kind: 'critter', pid: PERSON, x: 7.5, y: 7.5, script: 'OFFICER' }];
    state.corpseItems.c1 = [[40, 2]];
    const scene = await SceneClass.create(vaultDef(), host(0).h, state);
    expect(scene.creatures).toHaveLength(1);
    expect(scene.creatures[0]!.inventory.count(40)).toBe(2);
    expect(scene.scripted()[0]!.name).toBe('OFFICER');
  });
});
