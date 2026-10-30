// Late-game fear and the "useless" put to work (client, 2026-10-27): squads with a leader, the deathclaw mother's curse,
// reaction by sequence, drug-related traits, new perks and indicators.
import { describe, expect, it } from 'vitest';
import { drawFactor, reactionDelay } from '../src/game/combat.ts';
import { newCharacter, PERK, TRAIT } from '../src/game/character.ts';
import { indicators } from '../src/game/indicators.ts';
import { canTakePerk, PERK_RULES } from '../src/game/perks.ts';
import { addictionFactor } from '../src/game/session.ts';
import { PID } from '../src/world/pids.ts';
import { CURSE, curseSquad, LATE_SQUADS, lateSquad } from '../src/world/wasteland.ts';

/** Random numbers from a list (cycling). */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('late squads in the wasteland', () => {
  it('below the required level: ordinary beasts', () => {
    expect(lateSquad(LATE_SQUADS.mutants.fromLevel - 1, 'desert', false, () => 0)).toBeNull();
  });

  it('super mutants follow a lieutenant with a minigun', () => {
    const squad = lateSquad(LATE_SQUADS.mutants.fromLevel, 'ruins', false, () => 0)!;
    expect(squad.kind).toBe('mutants');
    expect(squad.members[0]).toEqual({ pid: PID.superMutantLieutenant, weaponPid: PID.minigun });
    expect(squad.members.length).toBe(1 + LATE_SQUADS.mutants.count.min);
  });

  it('deathclaws: from which level and where, sometimes following the mother', () => {
    const squad = lateSquad(LATE_SQUADS.deathclaws.fromLevel, 'mountains', false, () => 0)!;
    expect(squad.kind).toBe('deathclaws');
    expect(squad.members[0]!.pid).toBe(PID.motherDeathclaw);
    // No claws in the ruins: only mutants there.
    expect(lateSquad(30, 'ruins', false, () => 0)!.kind).toBe('mutants');
    // Without the mother: the roll is above her share.
    const pack = lateSquad(LATE_SQUADS.deathclaws.fromLevel, 'desert', false, seq(0, 0, 0.9))!;
    expect(pack.members.every((m) => m.pid === PID.deathclaw)).toBe(true);
  });

  it('for the cursed: claws on the trail even early in the game; no encounters in town or on water', () => {
    expect(lateSquad(1, 'desert', true, () => 0)!.kind).toBe('curse');
    expect(lateSquad(30, 'town', true, () => 0)).toBeNull();
    const pack = curseSquad(() => 0.99);
    expect(pack.members.length).toBe(CURSE.count.max);
    expect(pack.members.every((m) => m.pid === PID.deathclaw)).toBe(true);
  });
});

describe('reaction by sequence', () => {
  it('if the hero\'s sequence is higher the enemy takes longer to react; within min…max', () => {
    expect(reactionDelay(10, 10)).toBeCloseTo(0.45);
    expect(reactionDelay(15, 10)).toBeGreaterThan(reactionDelay(10, 10));
    expect(reactionDelay(0, 30)).toBeCloseTo(0.1);
    expect(reactionDelay(40, 0)).toBeCloseTo(1.1);
  });

  it('a weapon is drawn faster with a high sequence', () => {
    expect(drawFactor(10)).toBe(1);
    expect(drawFactor(15)).toBeLessThan(1);
    expect(drawFactor(0)).toBeGreaterThan(1);
  });
});

describe('traits and perks', () => {
  it('"Chem Reliant" gets addicted twice as often, "Chem Resistant" half as often', () => {
    expect(addictionFactor([])).toBe(1);
    expect(addictionFactor([TRAIT.chemReliant])).toBe(2);
    expect(addictionFactor([TRAIT.chemResistant])).toBe(0.5);
  });

  it('new perks can be picked by the original\'s requirements', () => {
    const rule = (id: number) => PERK_RULES.find((r) => r.id === id)!;
    for (const id of [PERK.nightVision, PERK.presence, PERK.sniper, PERK.mentalBlock, PERK.ghost, PERK.cultOfPersonality, PERK.scrounger, PERK.animalFriend, PERK.mysteriousStranger, PERK.quickPockets]) {
      expect(rule(id)).toBeDefined();
    }
    const lucky = { ...newCharacter(), level: 9, special: { ...newCharacter().special, luck: 8 } };
    expect(canTakePerk(lucky, rule(PERK.scrounger))).toBe(true);
    expect(canTakePerk({ ...lucky, level: 8 }, rule(PERK.scrounger))).toBe(false);
  });

  it('the overload and curse indicators come last', () => {
    const calm = { addicted: false, sneaking: false, levelUp: false, poisoned: true, irradiated: false, arm: null, leg: null };
    expect(indicators({ ...calm, overloaded: true, cursed: true }).map((i) => i.key)).toEqual(['poison', 'overload', 'curse']);
  });
});
