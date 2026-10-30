// "After the end" maps: after the vats and the bomb under the Cathedral blow up, entering the location leads to the ruins.
import { describe, expect, it } from 'vitest';
import { placeEntrance } from '../src/world/wasteland.ts';

describe('ruins after the explosion', () => {
  it('while nothing is blown up — the normal entrance', () => {
    expect(placeEntrance('militaryBase', {})?.map).toBe('mbase-ent');
    expect(placeEntrance('cathedral', {})?.map).toBe('cathedral-ent');
  });

  it('the vats blown up — the Military Base in ruins, the Cathedral intact', () => {
    const vars = { g17: 1 };
    expect(placeEntrance('militaryBase', vars)?.map).toBe('mbase-dead');
    expect(placeEntrance('cathedral', vars)?.map).toBe('cathedral-ent');
  });

  it('the Cathedral blown up — its ruins', () => {
    expect(placeEntrance('cathedral', { g18: 1 })?.map).toBe('cathedral-dead');
  });
});
