// Mouse: a single huge "spike" (Chromium on Windows does this when capturing the mouse) does not spin the camera,
// while a normal fast turn goes through.
import { describe, expect, it } from 'vitest';
import { isMouseSpike } from '../src/engine/player.ts';

describe('mouse spikes', () => {
  it('a huge move in the middle of normal ones is a spike', () => {
    expect(isMouseSpike(-700, 20)).toBe(true);
    expect(isMouseSpike(900, 0)).toBe(true);
    // In the middle of a fast bunny-hop turn: half a screen per event is a spike too.
    expect(isMouseSpike(960, 150)).toBe(true);
  });

  it('normal and fast turns are not spikes', () => {
    expect(isMouseSpike(20, 15)).toBe(false);
    expect(isMouseSpike(240, 0)).toBe(false);
    // A fast flick: the previous move is large too.
    expect(isMouseSpike(600, 300)).toBe(false);
  });
});
