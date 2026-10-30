// Gamepad: stick dead zone, smooth turn acceleration with the right stick, walking and looking with the sticks, running and jumping with buttons.
import { describe, expect, it } from 'vitest';
import { buildLevel } from '../src/engine/level.ts';
import { Player } from '../src/engine/player.ts';
import { deadzone, LookAccel, LOOK_DEAD, MOVE_DEAD } from '../src/game/gamepad.ts';
import { parseLevelDef } from '../src/world/defs.ts';

const SIZE = 60;
const room = buildLevel(
  parseLevelDef({
    id: 'field',
    music: '',
    floor: 'floor',
    ceiling: 'ceiling',
    fade: 10,
    grid: Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1 ? '#' : '.')).join('')),
    entries: { s: { x: 30.5, y: 30.5, angle: 0 } },
  }),
);
const run = (p: Player, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) p.update(1 / 60, room);
};

describe('dead zone', () => {
  it('a loose stick near the centre is zero', () => {
    expect(deadzone(0.1, -0.15, MOVE_DEAD)).toEqual({ x: 0, y: 0 });
    expect(deadzone(0.1, 0.05, LOOK_DEAD)).toEqual({ x: 0, y: 0 });
  });
  it('from the zone edge: smoothly from zero, at full tilt one, the same direction', () => {
    const near = deadzone(MOVE_DEAD + 0.01, 0, MOVE_DEAD);
    expect(near.x).toBeGreaterThan(0);
    expect(near.x).toBeLessThan(0.05);
    const full = deadzone(0, -1, MOVE_DEAD);
    expect(full.y).toBeCloseTo(-1);
    const diag = deadzone(0.6, 0.6, MOVE_DEAD);
    expect(diag.x).toBeCloseTo(diag.y);
    expect(Math.hypot(diag.x, diag.y)).toBeLessThanOrEqual(1);
  });
  it('the aim has a curve: halfway it is finer than linear', () => {
    const linear = deadzone(0.5, 0, LOOK_DEAD).x;
    const curved = deadzone(0.5, 0, LOOK_DEAD, 2).x;
    expect(curved).toBeLessThan(linear);
    expect(deadzone(1, 0, LOOK_DEAD, 2).x).toBeCloseTo(1);
  });
});

describe('turn acceleration', () => {
  it('stick fully sideways: normal speed at first, then smoothly faster; release and it is normal again', () => {
    const look = new LookAccel();
    const first = look.update(1, 0, 1 / 60).turn;
    let speed = first;
    let prev = first;
    for (let i = 0; i < 60; i++) {
      speed = look.update(1, 0, 1 / 60).turn;
      // Grows without jumps.
      expect(speed - prev).toBeLessThan(0.2);
      prev = speed;
    }
    expect(speed).toBeGreaterThan(first * 1.8);
    expect(look.update(0.5, 0, 1 / 60).turn).toBeLessThan(first);
  });
  it('stick up: look up', () => {
    expect(new LookAccel().update(0, -1, 1 / 60).pitch).toBeGreaterThan(0);
  });
});

describe('hero with sticks', () => {
  it('stick fully forward: a step as with W, halfway: slower', () => {
    const p = new Player({ x: 30.5, y: 30.5, angle: 0 });
    p.padMove = { x: 0, y: 1 };
    run(p, 1);
    expect(p.x - 30.5).toBeCloseTo(2.6, 1);
    const q = new Player({ x: 30.5, y: 30.5, angle: 0 });
    q.padMove = { x: 0, y: 0.5 };
    run(q, 1);
    expect(q.x - 30.5).toBeCloseTo(1.3, 1);
  });
  it('running (left stick press) is faster, a jump is above the floor', () => {
    const p = new Player({ x: 30.5, y: 30.5, angle: 0 });
    p.padMove = { x: 0, y: 1 };
    p.padRun = true;
    run(p, 1);
    expect(p.x - 30.5).toBeGreaterThan(4);
    expect(p.running).toBe(true);
    p.padJump = true;
    p.update(1 / 60, room);
    p.update(1 / 60, room);
    expect(p.z).toBeGreaterThan(0);
  });
  it('the right stick turns and tilts the view, inversion does the opposite', () => {
    const p = new Player({ x: 30.5, y: 30.5, angle: 0 });
    p.padTurn = 1;
    p.padPitch = 100;
    run(p, 0.5);
    expect(p.angle).toBeCloseTo(0.5, 1);
    expect(p.pitch).toBeGreaterThan(40);
    const q = new Player({ x: 30.5, y: 30.5, angle: 0 });
    q.invertY = true;
    q.padPitch = 100;
    run(q, 0.5);
    expect(q.pitch).toBeLessThan(-40);
  });
});
