// Status indicators above the message window (client, 2026-10-27): which are lit and in what order.
import { describe, expect, it } from 'vitest';
import { indicators } from '../src/game/indicators.ts';

const calm = { addicted: false, sneaking: false, levelUp: false, poisoned: false, irradiated: false, arm: null, leg: null } as const;

describe('status indicators', () => {
  it('all fine: no indicators', () => {
    expect(indicators(calm)).toEqual([]);
  });

  it('order as in the original, arms and legs after; good is green, bad is red', () => {
    const all = indicators({ addicted: true, sneaking: true, levelUp: true, poisoned: true, irradiated: true, arm: 'right', leg: 'left' });
    expect(all.map((i) => i.key)).toEqual(['addict', 'sneak', 'level', 'poison', 'rad', 'armRight', 'legLeft']);
    expect(all.filter((i) => !i.bad).map((i) => i.key)).toEqual(['sneak', 'level']);
  });

  it('a broken arm or leg has its own indicator for left and right', () => {
    expect(indicators({ ...calm, arm: 'left' }).map((i) => i.key)).toEqual(['armLeft']);
    expect(indicators({ ...calm, leg: 'right' }).map((i) => i.key)).toEqual(['legRight']);
  });
});
