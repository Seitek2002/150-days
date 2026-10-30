// Hero conditions by Fallout's rules: drug effects (immediate and delayed), radiation by levels, modifiers in the character.
import { describe, expect, it } from 'vitest';
import { STAT } from '../src/formats/pro.ts';
import { derivedStats, newCharacter, specialLevel } from '../src/game/character.ts';
import { combineEffects, drugEffects, radiationLevel, STAT_CURRENT_HP, STAT_RADIATION_LEVEL } from '../src/game/conditions.ts';

describe('drugs', () => {
  it('stimpak (−2): random health from the first to the second value', () => {
    const fx = drugEffects({ stats: [-2, STAT_CURRENT_HP, -1], amounts: [10, 20, 0] }, () => 0.99);
    expect(fx.now).toEqual([[STAT_CURRENT_HP, 20]]);
    expect(fx.later).toEqual([]);
  });

  it('Buffout-like: strength at once, later a withdrawal', () => {
    const fx = drugEffects({ stats: [STAT.strength, STAT.endurance, -1], amounts: [2, 2, 0], duration1: 60, amounts1: [-3, -3, 0] });
    expect(fx.now).toEqual([
      [STAT.strength, 2],
      [STAT.endurance, 2],
    ]);
    expect(fx.later).toEqual([
      {
        after: 3600,
        deltas: [
          [STAT.strength, -3],
          [STAT.endurance, -3],
        ],
      },
    ]);
  });

  it('RadAway removes radiation at once (stat 37)', () => {
    expect(drugEffects({ stats: [STAT_RADIATION_LEVEL, -1, -1], amounts: [-25, 0, 0] }).now).toEqual([[STAT_RADIATION_LEVEL, -25]]);
  });
});

describe('radiation', () => {
  it('levels: below 150 none, 150 minor, 600 a lethal dose', () => {
    expect(radiationLevel(149)).toBe(-1);
    expect(radiationLevel(150)).toBe(0);
    expect(radiationLevel(650)).toBe(3);
  });

  it('modifiers add up and go into the stats and derived stats', () => {
    const effects = combineEffects({ [STAT.strength]: 2, [STAT.radiationResistance]: 25 }, 320);
    const c = { ...newCharacter(), statEffects: effects };
    expect(specialLevel(c, 'strength')).toBe(7);
    // Advanced poisoning: −2 to Endurance.
    expect(specialLevel(c, 'endurance')).toBe(3);
    // Radiation resistance is 2 × Endurance (lowered by 2) plus 25 from the drug.
    expect(derivedStats(c).radiationResistance).toBe(2 * 3 + 25);
  });
});

describe('addiction', () => {
  it('withdrawal takes a point from the stats the drug raised', async () => {
    const { withdrawalDeltas } = await import('../src/game/conditions.ts');
    expect(withdrawalDeltas([[STAT.strength, 2], [STAT.agility, 2], [STAT.radiationResistance, 25]])).toEqual([[STAT.strength, -1], [STAT.agility, -1]]);
  });
});
