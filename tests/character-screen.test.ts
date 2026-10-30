// Character creation screen: the editor (points, tag skills, traits, keys) and what is under the mouse cursor.
import { describe, expect, it, vi } from 'vitest';
import { newCharacter, SPECIAL_NAMES } from '../src/game/character.ts';
import { t } from '../src/i18n.ts';

vi.mock('../src/platform.ts', () => ({ platform: { readGameFile: async () => new Uint8Array(0) } }));

const { CharacterEditor, hitTest, specialCenter, NAME_MAX } = await import('../src/game/character-screen.ts');

/** An editor with all points already spent (strength 10, the rest 5 each → 40 in total). */
function spent(): InstanceType<typeof CharacterEditor> {
  const editor = new CharacterEditor(newCharacter());
  for (let i = 0; i < 5; i++) editor.adjust(0, 1);
  return editor;
}

describe('stats', () => {
  it('five each at the start, five free points', () => {
    const editor = new CharacterEditor(newCharacter());
    expect(SPECIAL_NAMES.map((n) => editor.special[n])).toEqual([5, 5, 5, 5, 5, 5, 5]);
    expect(editor.pointsLeft()).toBe(5);
  });

  it('a point can be taken from one stat and given to another; no more than forty in total', () => {
    const editor = new CharacterEditor(newCharacter());
    expect(editor.adjust(1, -1)).toBe(true);
    expect(editor.pointsLeft()).toBe(6);
    for (let i = 0; i < 5; i++) expect(editor.adjust(2, 1)).toBe(true);
    expect(editor.adjust(3, 1)).toBe(true);
    expect(editor.special.endurance).toBe(10);
    expect(editor.pointsLeft()).toBe(0);
    expect(editor.adjust(0, 1)).toBe(false);
    expect(editor.notice).toBe(t('ceNoPoints'));
  });

  it('not above ten and not below one', () => {
    const editor = spent();
    expect(editor.special.strength).toBe(10);
    editor.adjust(1, -1);
    expect(editor.adjust(0, 1)).toBe(false);
    expect(editor.notice).toBe(t('ceMax'));
    for (let i = 0; i < 4; i++) expect(editor.adjust(3, -1)).toBe(true);
    expect(editor.special.charisma).toBe(1);
    expect(editor.adjust(3, -1)).toBe(false);
    expect(editor.notice).toBe(t('ceMin'));
  });

  it('a successful action clears the previous refusal', () => {
    const editor = spent();
    editor.adjust(0, 1);
    expect(editor.notice).not.toBe('');
    editor.adjust(0, -1);
    expect(editor.notice).toBe('');
  });
});

describe('tag skills and traits', () => {
  it('three tag skills: a fourth cannot be picked, an extra one can be removed', () => {
    const editor = new CharacterEditor(newCharacter());
    for (const s of [9, 0, 5]) expect(editor.toggleSkill(s)).toBe(true);
    expect(editor.tagged).toEqual([0, 5, 9]);
    expect(editor.tagsLeft()).toBe(0);
    expect(editor.toggleSkill(3)).toBe(false);
    expect(editor.notice).toBe(t('ceTagsFull'));
    expect(editor.toggleSkill(5)).toBe(true);
    expect(editor.tagged).toEqual([0, 9]);
    expect(editor.toggleSkill(18)).toBe(false);
  });

  it('no more than two traits', () => {
    const editor = new CharacterEditor(newCharacter());
    expect(editor.toggleTrait(10)).toBe(true);
    expect(editor.toggleTrait(2)).toBe(true);
    expect(editor.traits).toEqual([2, 10]);
    expect(editor.toggleTrait(7)).toBe(false);
    expect(editor.notice).toBe(t('ceTraitsFull'));
    expect(editor.toggleTrait(2)).toBe(true);
    expect(editor.traits).toEqual([10]);
  });

  it('the skill grows at once: a tag skill gets the bonus', () => {
    const editor = new CharacterEditor(newCharacter());
    const before = editor.character;
    editor.toggleSkill(0);
    expect(editor.character.tagged).toEqual([0]);
    expect(before.tagged).toEqual([]);
  });
});

describe('"Done"', () => {
  it('while points are not spent or skills not picked it is not allowed, and the status says what is missing', () => {
    const editor = new CharacterEditor(newCharacter());
    expect(editor.missing()).toBe('points');
    expect(editor.finish()).toBeNull();
    expect(editor.status()).toBe(t('ceNeedPoints'));
    for (let i = 0; i < 5; i++) editor.adjust(0, 1);
    expect(editor.missing()).toBe('tags');
    expect(editor.finish()).toBeNull();
    expect(editor.status()).toBe(t('ceNeedTags'));
    for (const s of [0, 1, 2]) editor.toggleSkill(s);
    expect(editor.missing()).toBeNull();
    expect(editor.status()).toBe(t('ceReady'));
  });

  it('a finished character can be obtained; an empty name becomes the default name, extra spaces are trimmed', () => {
    const editor = spent();
    for (const s of [3, 4, 5]) editor.toggleSkill(s);
    editor.toggleTrait(1);
    expect(editor.finish()?.name).toBe(t('ceDefaultName'));
    editor.name = '  Ned  ';
    const result = editor.finish()!;
    expect(result.name).toBe('Ned');
    expect(result.special.strength).toBe(10);
    expect(result.tagged).toEqual([3, 4, 5]);
    expect(result.traits).toEqual([1]);
    expect(result.skillPoints).toEqual(newCharacter().skillPoints);
  });

  it('the starting character is not spoiled by edits', () => {
    const start = newCharacter();
    const editor = new CharacterEditor(start);
    editor.adjust(0, 1);
    editor.toggleSkill(0);
    editor.toggleTrait(0);
    expect(start.special.strength).toBe(5);
    expect(start.tagged).toEqual([]);
    expect(start.traits).toEqual([]);
  });
});

describe('keys', () => {
  it('Esc cancels, Tab cycles through the areas', () => {
    const editor = new CharacterEditor(newCharacter());
    expect(editor.key('Escape', 'Escape')).toBe('cancel');
    const seen = [editor.area];
    for (let i = 0; i < 7; i++) {
      expect(editor.key('Tab', 'Tab')).toBe('handled');
      seen.push(editor.area);
    }
    expect(seen).toEqual(['special', 'skills', 'traits', 'name', 'age', 'gender', 'buttons', 'special']);
    editor.key('Tab', 'Tab', { shift: true });
    expect(editor.area).toBe('buttons');
  });

  it('for stats up/down select, left/right change, the cursor wraps around', () => {
    const editor = new CharacterEditor(newCharacter());
    editor.key('ArrowUp', 'ArrowUp');
    expect(editor.cursor.special).toBe(6);
    editor.key('ArrowDown', 'ArrowDown');
    expect(editor.cursor.special).toBe(0);
    editor.key('ArrowRight', 'ArrowRight');
    expect(editor.special.strength).toBe(6);
    editor.key('ArrowLeft', 'ArrowLeft');
    editor.key('-', '-');
    expect(editor.special.strength).toBe(4);
    editor.key('Equal', '+');
    expect(editor.special.strength).toBe(5);
  });

  it('for skills Space and Enter pick a tag skill, PageDown and End jump', () => {
    const editor = new CharacterEditor(newCharacter());
    editor.key('Tab', 'Tab');
    expect(editor.area).toBe('skills');
    editor.key('Space', ' ');
    expect(editor.tagged).toEqual([0]);
    editor.key('PageDown', 'PageDown');
    expect(editor.cursor.skills).toBe(6);
    editor.key('End', 'End');
    expect(editor.cursor.skills).toBe(17);
    editor.key('Enter', 'Enter');
    expect(editor.tagged).toEqual([0, 17]);
    editor.key('Home', 'Home');
    editor.key('Space', ' ');
    expect(editor.tagged).toEqual([17]);
  });

  it('traits are two columns of eight: up/down within a column, left/right between columns', () => {
    const editor = new CharacterEditor(newCharacter());
    editor.focus('traits', 0);
    editor.key('ArrowUp', 'ArrowUp');
    expect(editor.cursor.traits).toBe(7);
    editor.key('ArrowRight', 'ArrowRight');
    expect(editor.cursor.traits).toBe(15);
    editor.key('ArrowDown', 'ArrowDown');
    expect(editor.cursor.traits).toBe(8);
    editor.key('Space', ' ');
    expect(editor.traits).toEqual([8]);
    editor.key('ArrowLeft', 'ArrowLeft');
    expect(editor.cursor.traits).toBe(0);
  });

  it('name: letters are typed, Backspace erases, nothing past the limit; arrows in this area move to neighbouring ones', () => {
    const editor = new CharacterEditor(newCharacter());
    editor.focus('name');
    for (const ch of 'Ned') expect(editor.key('KeyA', ch)).toBe('handled');
    expect(editor.name).toBe('Ned');
    editor.key('Backspace', 'Backspace');
    expect(editor.name).toBe('Ne');
    for (let i = 0; i < NAME_MAX + 5; i++) editor.key('KeyA', 'z');
    expect(editor.name.length).toBe(NAME_MAX);
    expect(editor.key('KeyC', 'c', { ctrl: true })).toBe('ignored');
    editor.key('Enter', 'Enter');
    expect(editor.area).toBe('age');
  });

  it('buttons: left/right select, Enter on "Done" only when everything is ready, on "Cancel" it cancels', () => {
    const editor = new CharacterEditor(newCharacter());
    editor.focus('buttons', 0);
    expect(editor.key('Enter', 'Enter')).toBe('handled');
    expect(editor.notice).toBe(t('ceNeedPoints'));
    for (let i = 0; i < 5; i++) editor.adjust(0, 1);
    for (const s of [0, 1, 2]) editor.toggleSkill(s);
    expect(editor.key('Enter', 'Enter')).toBe('done');
    editor.key('ArrowRight', 'ArrowRight');
    expect(editor.cursor.buttons).toBe(1);
    expect(editor.key('Enter', 'Enter')).toBe('cancel');
  });

  it('the screen does not take other keys', () => {
    const editor = new CharacterEditor(newCharacter());
    expect(editor.key('KeyW', 'w')).toBe('ignored');
    expect(editor.key('F5', 'F5')).toBe('ignored');
  });
});

describe('age and sex', () => {
  it('by default twenty-five years and male; age from 16 to 35', () => {
    const editor = new CharacterEditor(newCharacter());
    expect(editor.age).toBe(25);
    expect(editor.gender).toBe('male');
    for (let i = 0; i < 9; i++) expect(editor.adjustAge(-1)).toBe(true);
    expect(editor.age).toBe(16);
    expect(editor.adjustAge(-1)).toBe(false);
    expect(editor.notice).toBe(t('ceAgeMin'));
    for (let i = 0; i < 19; i++) expect(editor.adjustAge(1)).toBe(true);
    expect(editor.age).toBe(35);
    expect(editor.adjustAge(1)).toBe(false);
    expect(editor.notice).toBe(t('ceAgeMax'));
  });

  it('sex toggles; starting values from the character are kept, extra is trimmed', () => {
    const start = { ...newCharacter(), age: 99, gender: 'female' as const };
    const editor = new CharacterEditor(start);
    expect(editor.age).toBe(35);
    expect(editor.gender).toBe('female');
    editor.toggleGender();
    expect(editor.gender).toBe('male');
  });

  it('keys: for age left/right and "+/−", for sex left/right and Space', () => {
    const editor = new CharacterEditor(newCharacter());
    editor.focus('age');
    editor.key('ArrowRight', 'ArrowRight');
    editor.key('Equal', '+');
    editor.key('ArrowLeft', 'ArrowLeft');
    expect(editor.age).toBe(26);
    editor.key('Tab', 'Tab');
    expect(editor.area).toBe('gender');
    editor.key('Space', ' ');
    expect(editor.gender).toBe('female');
    editor.key('ArrowLeft', 'ArrowLeft');
    expect(editor.gender).toBe('male');
  });

  it('the finished character carries name, age and sex', () => {
    const editor = spent();
    for (const s of [3, 4, 5]) editor.toggleSkill(s);
    editor.name = 'Nora';
    editor.adjustAge(-1);
    editor.toggleGender();
    const result = editor.finish()!;
    expect(result.name).toBe('Nora');
    expect(result.age).toBe(24);
    expect(result.gender).toBe('female');
  });
});

describe('what is under the mouse cursor', () => {
  it('"+", "−" and a stat row', () => {
    for (let i = 0; i < 7; i++) {
      const c = specialCenter(i);
      expect(hitTest(158, c - 6)).toEqual({ kind: 'special', index: i, part: 'plus' });
      expect(hitTest(158, c + 6)).toEqual({ kind: 'special', index: i, part: 'minus' });
      expect(hitTest(60, c)).toEqual({ kind: 'special', index: i, part: 'row' });
    }
  });

  it('skill rows', () => {
    expect(hitTest(400, 30)).toEqual({ kind: 'skill', index: 0 });
    expect(hitTest(400, 27 + 11 * 17 + 5)).toEqual({ kind: 'skill', index: 17 });
    expect(hitTest(400, 27 + 11 * 18 + 5)).toBeNull();
  });

  it('traits: the left column is the first eight, the right one the second', () => {
    expect(hitTest(100, 357)).toEqual({ kind: 'trait', index: 0 });
    expect(hitTest(100, 450)).toEqual({ kind: 'trait', index: 7 });
    expect(hitTest(30, 410)).toEqual({ kind: 'trait', index: 4 });
    expect(hitTest(230, 357)).toEqual({ kind: 'trait', index: 8 });
    expect(hitTest(305, 450)).toEqual({ kind: 'trait', index: 15 });
  });

  it('age ("−", "+") and sex are on the top bars', () => {
    expect(hitTest(166, 20)).toEqual({ kind: 'age', part: 'minus' });
    expect(hitTest(221, 20)).toEqual({ kind: 'age', part: 'plus' });
    expect(hitTest(270, 20)).toEqual({ kind: 'gender' });
  });

  it('name, buttons, derived stats; outside: nothing', () => {
    expect(hitTest(250, 60)).toEqual({ kind: 'name' });
    expect(hitTest(200, 135)).toEqual({ kind: 'button', id: 'done' });
    expect(hitTest(280, 135)).toEqual({ kind: 'button', id: 'cancel' });
    expect(hitTest(250, 180)).toEqual({ kind: 'derived', index: 0 });
    expect(hitTest(250, 305)).toEqual({ kind: 'derived', index: 10 });
    expect(hitTest(1, 1)).toBeNull();
    expect(hitTest(500, 350)).toBeNull();
  });
});
