// Body clock (client, 2026-10-29): drugs wear off even in locations where the calendar stands still, at 10 game seconds per
// real one there. Otherwise a single Rad-X pill protected you at the bottom of the Glow for as long as you liked.
import { describe, expect, it } from 'vitest';
import { Clock, LOCAL_SPEED } from '../src/game/clock.ts';

describe('body clock', () => {
  it('in the wasteland it runs with the calendar, in locations at 10 game seconds per real one', () => {
    const clock = new Clock();
    clock.advance(3600);
    expect(clock.body).toBe(3600);
    clock.tickPlace(60);
    expect(clock.body).toBe(3600 + 60 * LOCAL_SPEED);
    // The calendar (water deadline) is not moved by time spent in locations.
    expect(clock.seconds).toBe(3600);
  });

  it('Rad-X (full strength for a day) wears off in a location in about 2.4 hours of real play', () => {
    const clock = new Clock();
    const fades = clock.body + 1440 * 60;
    clock.tickPlace(2.3 * 3600);
    expect(clock.body).toBeLessThan(fades);
    clock.tickPlace(0.2 * 3600);
    expect(clock.body).toBeGreaterThanOrEqual(fades);
  });

  it('is saved; an old save without it starts from zero', () => {
    const clock = new Clock();
    clock.advance(100);
    clock.tickPlace(5);
    expect(Clock.from(clock.toJSON()).body).toBe(clock.body);
    expect(Clock.from({ seconds: 100, local: 30 }).body).toBe(100);
  });
});
