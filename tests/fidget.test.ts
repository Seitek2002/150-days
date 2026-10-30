// A critter standing still does not "twitch": the idle animation plays rarely and once, the rest of the time it is the first frame.
import { describe, expect, it } from 'vitest';
import type { SpriteFrame, SpriteSheet } from '../src/assets/sprites.ts';
import { Creature, type CreatureArt } from '../src/game/creature.ts';

const frames: SpriteFrame[] = Array.from({ length: 4 }, () => ({ width: 1, height: 1, pixels: new Uint32Array(1) }));
const stand: SpriteSheet = {
  fps: 10,
  actionFrame: 0,
  directions: Array.from({ length: 6 }, () => frames),
  shifts: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  offsets: Array.from({ length: 6 }, () => frames.map(() => ({ x: 0, y: 0 }))),
};
const art: CreatureArt = { stand, walk: stand, attack: stand, hit: stand, death: stand };
const stats = { name: 'critter', maxHp: 10, ac: 0, armor: { dt: 0, dr: 0 }, skill: 30, damage: { min: 1, max: 2 }, experience: 0 };

describe('fidgeting in place', () => {
  it('over a minute: almost all the time the first frame, but it moves occasionally', () => {
    const c = new Creature(1, 1.5, 1.5, stats, art, false);
    const cam = { x: 5, y: 5, angle: 0 } as unknown as Parameters<Creature['billboard']>[0];
    let moving = 0;
    const samples = 1200;
    for (let i = 0; i < samples; i++) {
      (c as unknown as { stateTime: number }).stateTime = i * 0.05;
      if (c.billboard(cam).frame !== frames[0]) moving++;
    }
    expect(moving).toBeGreaterThan(0);
    expect(moving / samples).toBeLessThan(0.1);
  });
});
