// Quests: state by script variable, a list for the Pip-Boy and news at the bottom left (no repeats after loading).
import { describe, expect, it } from 'vitest';
import { deadVar, QUEST_READY, QUESTS, questGroups, questNews, questState } from '../src/game/quests.ts';

const byText = (text: number) => QUESTS.find((q) => q.text === text)!;
const gvars = (values: Record<number, number>) => (n: number) => values[n] ?? 0;
// Instead of PIPBOY.MSG — line numbers in words.
const message = (id: number) => `line ${id}`;

describe('quest state', () => {
  it('0 — none, 1 — taken, 2 and more — done', () => {
    const scorpions = byText(724);
    expect(questState(scorpions, gvars({}))).toBe('none');
    expect(questState(scorpions, gvars({ 43: 1 }))).toBe('active');
    expect(questState(scorpions, gvars({ 43: 2 }))).toBe('done');
  });

  it('the water chip is visible from the start of the game and done when the chip is brought', () => {
    expect(questState(byText(704), gvars({}))).toBe('active');
    expect(questState(byText(704), gvars({ 101: 2 }))).toBe('done');
  });

  it('Tandi died before she was rescued — failed; died after the rescue — the quest is still done', () => {
    expect(questState(byText(723), gvars({ 103: 1, 26: 3 }))).toBe('failed');
    expect(questState(byText(723), gvars({ 103: 2, 26: 3 }))).toBe('done');
  });

  it('the missing initiate died — failed; the farm is done only at the last script value', () => {
    expect(questState(byText(772), gvars({ 109: 5 }))).toBe('failed');
    expect(questState(byText(805), gvars({ 138: 9302 }))).toBe('active');
    expect(questState(byText(805), gvars({ 138: 9304 }))).toBe('done');
  });
});

describe('list for the Pip-Boy', () => {
  it('by location in the original order, only seen quests; those without text in the game copy are skipped', () => {
    const groups = questGroups(gvars({ 43: 1, 103: 2, 29: 1 }), (id) => (id === 751 ? undefined : message(id)));
    expect(groups).toEqual([
      { place: 'line 700', quests: [{ text: 'line 704', state: 'active' }] },
      {
        place: 'line 720',
        quests: [
          { text: 'line 723', state: 'done' },
          { text: 'line 724', state: 'active' },
        ],
      },
    ]);
  });
});

describe('quest news', () => {
  it('a new game announces the water chip, then every change once', () => {
    const vars: Record<string, number> = { [QUEST_READY]: 1 };
    const values: Record<number, number> = {};
    expect(questNews(vars, gvars(values), message)).toEqual([{ text: 'line 704', state: 'active' }]);
    expect(questNews(vars, gvars(values), message)).toEqual([]);
    values[43] = 1;
    expect(questNews(vars, gvars(values), message)).toEqual([{ text: 'line 724', state: 'active' }]);
    values[43] = 2;
    values[103] = 1;
    values[26] = 3;
    expect(questNews(vars, gvars(values), message)).toEqual([
      { text: 'line 723', state: 'failed' },
      { text: 'line 724', state: 'done' },
    ]);
    expect(questNews(vars, gvars(values), message)).toEqual([]);
  });

  it('an old save without the mark: the first check silently remembers what is taken, then as usual', () => {
    const vars: Record<string, number> = {};
    const values: Record<number, number> = { 43: 1 };
    expect(questNews(vars, gvars(values), message)).toEqual([]);
    values[43] = 2;
    expect(questNews(vars, gvars(values), message)).toEqual([{ text: 'line 724', state: 'done' }]);
  });

  it('the script removed a quest or rolled back a done one — no line', () => {
    const vars: Record<string, number> = { [QUEST_READY]: 1 };
    const values: Record<number, number> = { 101: 2, 133: 1 };
    questNews(vars, gvars(values), message);
    values[133] = 0;
    values[101] = 0;
    expect(questNews(vars, gvars(values), message)).toEqual([]);
  });

  it('Juliana removed the locket quest after a rude answer — failed, and it stays in the Pip-Boy', () => {
    const vars: Record<string, number> = { [QUEST_READY]: 1 };
    const values: Record<number, number> = { 127: 1 };
    questNews(vars, gvars(values), message);
    values[127] = 0;
    expect(questNews(vars, gvars(values), message)).toEqual([{ text: 'line 802', state: 'failed' }]);
    expect(questGroups(gvars(values), message, vars).find((g) => g.place === 'line 800')?.quests).toEqual([{ text: 'line 802', state: 'failed' }]);
  });
});

describe('fixes based on the original scripts', () => {
  it('"Kill Killian": taken when hired by Gizmo; done when Killian died; Gizmo died first — failed', () => {
    const kill = byText(732);
    expect(questState(kill, gvars({}))).toBe('none');
    expect(questState(kill, gvars({ 39: 1 }))).toBe('active');
    expect(questState(kill, gvars({ 39: 1, 37: 1 }))).toBe('done');
    expect(questState(kill, gvars({ 39: 2, 37: 1, 38: 1 }))).toBe('done');
    expect(questState(kill, gvars({ 39: 1, 38: 1 }))).toBe('failed');
    // Killed Killian without being hired — there was no quest.
    expect(questState(kill, gvars({ 37: 1 }))).toBe('none');
  });

  it('"Gizmo\'s confession": Killian died before the recording was handed over — failed', () => {
    expect(questState(byText(735), gvars({ 104: 1 }))).toBe('active');
    expect(questState(byText(735), gvars({ 104: 1, 37: 1 }))).toBe('failed');
    expect(questState(byText(735), gvars({ 104: 2, 37: 1 }))).toBe('done');
  });

  it('Vault 13: quests the Overseer closed after the chip — none if not taken; failed if taken', () => {
    const thief = byText(705);
    expect(questState(thief, gvars({ 188: 3 }))).toBe('none');
    expect(questState(thief, gvars({ 188: 3 }), 1)).toBe('failed');
    expect(questState(thief, gvars({ 188: 2 }))).toBe('done');
    const vars: Record<string, number> = { [QUEST_READY]: 1 };
    const values: Record<number, number> = { 101: 2, 188: 3, 238: 3 };
    questNews(vars, gvars(values), message);
    expect(questGroups(gvars(values), message, vars)[0]!.quests).toEqual([{ text: 'line 704', state: 'done' }]);
  });

  it('the quest giver died — an unfinished quest is cancelled, a finished one stays finished', () => {
    const vars: Record<string, number> = { [QUEST_READY]: 1 };
    const values: Record<number, number> = {};
    questNews(vars, gvars(values), message);
    values[43] = 1;
    expect(questNews(vars, gvars(values), message, 'shady:o5')).toEqual([{ text: 'line 724', state: 'active' }]);
    vars[deadVar('shady:o5')] = 1;
    expect(questNews(vars, gvars(values), message)).toEqual([{ text: 'line 724', state: 'failed' }]);
    const shady = () => questGroups(gvars(values), message, vars).find((g) => g.place === 'line 720')?.quests;
    expect(shady()).toEqual([{ text: 'line 724', state: 'failed' }]);
    values[43] = 2;
    expect(shady()).toEqual([{ text: 'line 724', state: 'done' }]);
    // The person talked to died, but the quest was not taken from them — their death changes nothing.
    const other: Record<string, number> = { [QUEST_READY]: 1, [deadVar('shady:o9')]: 1 };
    questNews(other, gvars({ 43: 1 }), message);
    expect(questGroups(gvars({ 43: 1 }), message, other).find((g) => g.place === 'line 720')?.quests).toEqual([{ text: 'line 724', state: 'active' }]);
  });
});
