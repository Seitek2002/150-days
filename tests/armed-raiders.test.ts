// Raiders and bandits carry firearms (client, 2026-10-24).
import { describe, expect, it } from 'vitest';
import { isRaider, raiderGun } from '../src/world/armed-raiders.ts';
import { PID } from '../src/world/pids.ts';

describe('raiders with guns', () => {
  it('raider, thug and the Skulls gang are bandits; townsfolk and guards are not', () => {
    expect(isRaider(PID.raider)).toBe(true);
    expect(isRaider(PID.raiderGuard)).toBe(true);
    expect(isRaider(PID.thug)).toBe(true);
    expect(isRaider(PID.strangerB, 'GENSKULZ')).toBe(true);
    expect(isRaider(PID.townswoman, 'genraidr')).toBe(true);
    expect(isRaider(PID.townsman)).toBe(false);
    expect(isRaider(PID.guard, 'JTGENGRD')).toBe(false);
  });

  it('the gun is always a firearm, and the same critter always gets the same one', () => {
    const guns = new Set<number>([PID.pistol10mm, PID.shotgun, PID.huntingRifle]);
    for (let seed = 0; seed < 20; seed++) {
      expect(guns.has(raiderGun(seed))).toBe(true);
      expect(raiderGun(seed)).toBe(raiderGun(seed));
    }
    expect(raiderGun(0)).toBe(PID.pistol10mm);
  });
});
