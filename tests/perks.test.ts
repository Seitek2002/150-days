// Hero levels and perks by Fallout 1 rules: experience → level, health and skill points per level, a perk every 3 levels,
// perk requirements and their effects.
import { describe, expect, it } from 'vitest';
import { derivedStats, newCharacter, PERK, SKILL, skillLevel, type Character } from '../src/game/character.ts';
import { characterFighter } from '../src/game/fighter.ts';
import { availablePerks, gainExperience, refundSkillPoint, spendSkillPoint, takePerk } from '../src/game/perks.ts';

const hero = (over: Partial<Character> = {}): Character => ({ ...newCharacter(), tagged: [SKILL.smallGuns, SKILL.speech, SKILL.lockpick], ...over });

describe('levels', () => {
  it('1000 experience is level two: health + (EN/2 + 2), skill points 5 + 2×IN', () => {
    const r = gainExperience(hero(), 0, 1000);
    expect(r.levels).toBe(1);
    expect(r.character.level).toBe(2);
    expect(r.hp).toBe(4);
    expect(r.character.unspentSkillPoints).toBe(15);
    expect(derivedStats(r.character).maxHp).toBe(derivedStats(hero()).maxHp + 4);
  });

  it('several levels at once; a perk on the third', () => {
    const r = gainExperience(hero(), 0, 3000);
    expect(r.character.level).toBe(3);
    expect(r.levels).toBe(2);
    expect(r.character.perksOwed).toBe(1);
  });

  it('"Educated" gives +5% experience per rank', () => {
    expect(gainExperience(hero({ perks: { [PERK.swiftLearner]: 2 } }), 0, 100).gained).toBe(110);
  });
});

describe('perks', () => {
  it('at level three with average stats — "Awareness" and "Educated", not level-6 perks', () => {
    const c = gainExperience(hero(), 0, 3000).character;
    const ids = availablePerks(c).map((p) => p.id);
    expect(ids).toContain(PERK.awareness);
    expect(ids).toContain(PERK.swiftLearner);
    expect(ids).not.toContain(PERK.educated);
    // Needs Endurance 6.
    expect(ids).not.toContain(PERK.fasterHealing);
  });

  it('taking a perk: the rank grows, the earned perk is spent; without an earned one — not allowed', () => {
    const c = gainExperience(hero({ special: { ...newCharacter().special, endurance: 6, luck: 4 } }), 0, 3000).character;
    const taken = takePerk(c, PERK.fasterHealing);
    expect(taken.perks?.[PERK.fasterHealing]).toBe(1);
    expect(taken.perksOwed).toBe(0);
    expect(derivedStats(taken).healingRate).toBe(derivedStats(c).healingRate + 2);
    expect(takePerk(taken, PERK.awareness)).toBe(taken);
  });

  it('effects: "Dodger" +5 AC, "Toughness" +10% resistance, "Speaker" +20 to Speech', () => {
    const base = hero();
    expect(derivedStats(hero({ perks: { [PERK.dodger]: 1 } })).armorClass).toBe(derivedStats(base).armorClass + 5);
    expect(characterFighter(hero({ perks: { [PERK.toughness]: 2 } })).armor.dr).toBe(20);
    expect(skillLevel(hero({ perks: { [PERK.speaker]: 1 } }), SKILL.speech)).toBe(skillLevel(base, SKILL.speech) + 20);
  });
});

describe('skill points', () => {
  it('a point in a tagged skill counts twice; only points spent now can be returned', () => {
    const c = { ...hero(), unspentSkillPoints: 2 };
    const floor = [...c.skillPoints];
    const raised = spendSkillPoint(c, SKILL.smallGuns);
    expect(skillLevel(raised, SKILL.smallGuns)).toBe(skillLevel(c, SKILL.smallGuns) + 2);
    expect(raised.unspentSkillPoints).toBe(1);
    const back = refundSkillPoint(raised, SKILL.smallGuns, floor);
    expect(back.unspentSkillPoints).toBe(2);
    expect(refundSkillPoint(back, SKILL.smallGuns, floor)).toBe(back);
  });
});

describe('"Tag!"', () => {
  it('after the perk a fourth tagged skill can be marked, and only one', async () => {
    const { tagSkill } = await import('../src/game/perks.ts');
    const c = hero({ perks: { [PERK.tag]: 1 } });
    const tagged = tagSkill(c, SKILL.repair);
    expect(tagged.tagged).toContain(SKILL.repair);
    expect(skillLevel(tagged, SKILL.repair)).toBe(skillLevel(c, SKILL.repair) + 20);
    expect(tagSkill(tagged, SKILL.science)).toBe(tagged);
    expect(tagSkill(hero(), SKILL.repair).tagged).toHaveLength(3);
  });
});
