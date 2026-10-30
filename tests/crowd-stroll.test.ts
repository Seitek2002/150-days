// Extras from a location editor variant stroll around their spot: stand, walk a couple of cells and stand again; they do not
// leave the spot; with the hero nearby they stand and look at him; a script led them far away: they stroll there; the stroll spot is in the save.
// Without the mark (game locations, important critters) they stand at their post as before.
import { describe, expect, it } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import { addBlock, buildLevel, type Block } from '../src/engine/level.ts';
import { Creature, type CreatureArt, type Target } from '../src/game/creature.ts';
import { parseLevelDef } from '../src/world/defs.ts';

const sheet: SpriteSheet = {
  fps: 10,
  actionFrame: 0,
  directions: Array.from({ length: 6 }, () => [{ width: 1, height: 1, pixels: new Uint32Array(1) }]),
  shifts: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  offsets: Array.from({ length: 6 }, () => [{ x: 0, y: 0 }]),
};
const art: CreatureArt = { stand: sheet, walk: sheet, attack: sheet, hit: sheet, death: sheet };
const stats = { name: 'Peasant', maxHp: 20, ac: 0, armor: { dt: 0, dr: 0 }, skill: 30, damage: { min: 1, max: 2 }, experience: 0 };
const field = buildLevel(
  parseLevelDef({
    id: 't',
    music: '',
    floor: 'floor',
    ceiling: 'ceiling',
    fade: 10,
    grid: ['########################', ...Array.from({ length: 10 }, () => '#......................#'), '########################'],
    entries: { s: { x: 1.5, y: 1.5, angle: 0 } },
  }),
);
const home = { x: 6.5, y: 5.5 };
/** The hero is far away: not in the way. */
const far: Target = { x: 22.5, y: 10.5, alive: true };

/** Run the time; returns how far it walked and how far it strayed from point from. */
const run = (c: Creature, target: Target, seconds: number, from = home) => {
  let walked = 0;
  let farthest = 0;
  for (let t = 0; t < seconds; t += 0.05) {
    const x = c.x;
    const y = c.y;
    c.update(0.05, field, target, [c], () => {});
    walked += Math.hypot(c.x - x, c.y - y);
    farthest = Math.max(farthest, Math.hypot(c.x - from.x, c.y - from.y));
  }
  return { walked, farthest };
};

const crowd = () => {
  const c = new Creature(1, home.x, home.y, stats, art, false, 0, null);
  c.roamAround(home);
  return c;
};

describe('extras stroll', () => {
  it('in two minutes it walked more than once and did not stray further than three cells from its spot', () => {
    const c = crowd();
    const { walked, farthest } = run(c, far, 120);
    expect(walked).toBeGreaterThan(3);
    expect(farthest).toBeLessThanOrEqual(3.05);
  });

  it('it does not walk non-stop: more than half the time it stands', () => {
    const c = crowd();
    let standing = 0;
    for (let t = 0; t < 120; t += 0.05) {
      const x = c.x;
      const y = c.y;
      c.update(0.05, field, far, [c], () => {});
      if (c.x === x && c.y === y) standing += 0.05;
    }
    expect(standing).toBeGreaterThan(60);
  });

  it('hero nearby: it stands still and looks at him', () => {
    const c = crowd();
    c.talks = true;
    const hero: Target = { x: home.x + 1.5, y: home.y, alive: true };
    const { walked } = run(c, hero, 60);
    expect(walked).toBe(0);
    expect(Math.cos(c.facing)).toBeGreaterThan(0.99);
  });

  it('a fence (a low block you can see through) is neither crossed nor walked into: it strolls on', () => {
    const level = buildLevel(
      parseLevelDef({
        id: 'f',
        music: '',
        floor: 'floor',
        ceiling: 'ceiling',
        fade: 10,
        grid: ['############', ...Array.from({ length: 10 }, () => '#..........#'), '############'],
        entries: { s: { x: 1.5, y: 1.5, angle: 0 } },
      }),
    );
    // A fence across the whole field at x = 7.5…7.6: the brahmin lives right next to it.
    for (let y = 1; y <= 10; y++) {
      const rail: Block = { x0: 7.5, y0: y, x1: 7.6, y1: y + 1, height: 0.5, front: 'concrete', side: 'concrete', top: 'concrete', facing: 0, fill: false };
      addBlock(level, y * level.width + 7, rail);
    }
    const c = new Creature(1, 6.9, 5.5, stats, art, false, 0, null);
    c.roamAround({ x: 6.9, y: 5.5 });
    let walked = 0;
    for (let t = 0; t < 180; t += 0.05) {
      const x = c.x;
      const y = c.y;
      c.update(0.05, level, far, [c], () => {});
      walked += Math.hypot(c.x - x, c.y - y);
      expect(c.x).toBeLessThan(7.5);
    }
    expect(walked).toBeGreaterThan(4);
  });

  it('without the "strolls" mark a peaceful critter stands at its post as before', () => {
    const c = new Creature(1, home.x, home.y, stats, art, false, 0, null);
    expect(run(c, far, 60).walked).toBe(0);
    expect(c.roamHome).toBeNull();
  });

  it('a script led it far away: it strolls there instead of returning', () => {
    const c = crowd();
    const there = { x: 17.5, y: 5.5 };
    expect(c.walkTo(there.x, there.y, false, field)).toBe(true);
    run(c, far, 30);
    const { farthest } = run(c, far, 90, there);
    expect(farthest).toBeLessThanOrEqual(3.2);
    expect(Math.hypot(c.roamHome!.x - there.x, c.roamHome!.y - there.y)).toBeLessThan(0.2);
  });

  it('the stroll spot is in the save (after loading it strolls around the same place)', () => {
    const c = crowd();
    run(c, far, 30);
    const saved = JSON.parse(JSON.stringify(c.snapshot()));
    expect(saved.roam).toEqual(home);
    const again = new Creature(2, 1.5, 1.5, stats, art, false, 0, null);
    again.restore(saved);
    again.roamAround(saved.roam);
    expect(again.roamHome).toEqual(home);
    expect(new Creature(3, 1.5, 1.5, stats, art, false, 0, null).snapshot().roam).toBeUndefined();
  });

  it('hostile extras (attacked: hit back) do not stroll but fight', () => {
    const c = crowd();
    c.provoke();
    run(c, { x: home.x + 4, y: home.y, alive: true }, 3);
    expect(c.chasing).toBe(true);
  });
});
