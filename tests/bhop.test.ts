// Jumping and bunny hopping: walking as before; space jumps, holding it jumps again on touching the ground; no friction in the air,
// a sidestep with turning accelerates without limit; fast movement does not pass through walls; moving to a location resets speed.
import { describe, expect, it } from 'vitest';
import { buildLevel } from '../src/engine/level.ts';
import { Player } from '../src/engine/player.ts';
import { parseLevelDef } from '../src/world/defs.ts';

const SIZE = 200;
const room = buildLevel(
  parseLevelDef({
    id: 'field',
    music: '',
    floor: 'floor',
    ceiling: 'ceiling',
    fade: 10,
    grid: Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1 ? '#' : '.')).join('')),
    entries: { s: { x: 100.5, y: 100.5, angle: 0 } },
  }),
);

const keys = (p: Player) => (p as unknown as { keys: Set<string> }).keys;
const speedOf = (p: Player) => Math.hypot(p.vx, p.vy);
const run = (p: Player, seconds: number, each?: () => void) => {
  for (let t = 0; t < seconds; t += 1 / 60) {
    each?.();
    p.update(1 / 60, room);
  }
};

describe('jumping and bunny hopping', () => {
  it('walking as before: full speed at once, release and it stops', () => {
    const p = new Player({ x: 100.5, y: 100.5, angle: 0 });
    keys(p).add('KeyW');
    run(p, 1);
    expect(p.x - 100.5).toBeCloseTo(2.6, 1);
    keys(p).clear();
    run(p, 0.1);
    expect(speedOf(p)).toBe(0);
  });

  it('space jumps about a third of a wall high and back to the ground', () => {
    const p = new Player({ x: 100.5, y: 100.5, angle: 0 });
    keys(p).add('Space');
    run(p, 1 / 60);
    keys(p).delete('Space');
    let top = 0;
    run(p, 0.7, () => (top = Math.max(top, p.z)));
    expect(top).toBeGreaterThan(0.2);
    expect(top).toBeLessThanOrEqual(0.4);
    expect(p.z).toBe(0);
  });

  it('holding space, sidestep and turn accelerate without limit; on release, back on the ground the speed is normal again', () => {
    const p = new Player({ x: 30.5, y: 100.5, angle: 0 });
    keys(p).add('KeyW');
    run(p, 0.3);
    keys(p).delete('KeyW');
    keys(p).add('Space');
    keys(p).add('KeyD');
    // Turning right after a step right, as with the mouse. Speed grows and outruns running (4.4 cells per second), without limit.
    run(p, 6, () => (p.angle += 2.2 / 60));
    const at6 = speedOf(p);
    expect(at6).toBeGreaterThan(7);
    p.x = 30.5;
    p.y = 100.5;
    run(p, 6, () => (p.angle += 1.6 / 60));
    expect(speedOf(p)).toBeGreaterThan(at6);
    keys(p).clear();
    run(p, 1);
    expect(speedOf(p)).toBe(0);
  });

  it('at huge speed you cannot fly through a wall', () => {
    const p = new Player({ x: SIZE - 3.5, y: 100.5, angle: 0 });
    keys(p).add('Space');
    run(p, 1 / 60);
    p.vx = 500;
    run(p, 0.1);
    expect(p.x).toBeLessThan(SIZE - 1);
    expect(p.vx).toBe(0);
  });

  it('moving to another location: no speed carried over, on the ground', () => {
    const p = new Player({ x: 100.5, y: 100.5, angle: 0 });
    p.vx = 40;
    keys(p).add('Space');
    run(p, 0.1);
    p.placeAt(10.5, 10.5, Math.PI);
    expect([p.x, p.y, p.angle, p.vx, p.vy, p.z]).toEqual([10.5, 10.5, Math.PI, 0, 0, 0]);
  });
});
