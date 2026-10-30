// Premade heroes: parsing GCD (4-byte numbers, most significant byte first) and BIO lines. The files are built right here — no game copy needed.
import { describe, expect, it } from 'vitest';
import { SKILL, TRAIT } from '../src/game/character.ts';
import { parseBio, parseGcd } from '../src/game/premade.ts';

/** GCD as in the original: 428 bytes; SPECIAL from byte 4, age and gender are stats 34 and 35, the name from byte 368. */
function gcd(o: { special: number[]; age: number; gender: number; name: string; tagged: number[]; traits: number[] }): Uint8Array {
  const bytes = new Uint8Array(428);
  const view = new DataView(bytes.buffer);
  const put = (offset: number, value: number) => view.setInt32(offset, value, false);
  o.special.forEach((v, i) => put(4 + i * 4, v));
  put(4 + 33 * 4, o.age);
  put(4 + 34 * 4, o.gender);
  bytes.set(new TextEncoder().encode(o.name), 368);
  [0, 1, 2, 3].forEach((i) => put(400 + i * 4, o.tagged[i] ?? -1));
  [0, 1].forEach((i) => put(416 + i * 4, o.traits[i] ?? -1));
  return bytes;
}

describe('premade heroes', () => {
  it('GCD: stats, age, gender, name, skills, traits', () => {
    const hero = parseGcd(
      gcd({ special: [8, 4, 9, 4, 4, 7, 4], age: 23, gender: 0, name: 'Max', tagged: [SKILL.smallGuns, SKILL.bigGuns, SKILL.unarmed], traits: [TRAIT.heavyHanded, TRAIT.bruiser] }),
    );
    expect(hero).not.toBeNull();
    expect(hero!.special).toEqual({ strength: 8, perception: 4, endurance: 9, charisma: 4, intelligence: 4, agility: 7, luck: 4 });
    expect(hero!.age).toBe(23);
    expect(hero!.gender).toBe('male');
    expect(hero!.name).toBe('Max');
    expect(hero!.tagged).toEqual([SKILL.smallGuns, SKILL.bigGuns, SKILL.unarmed]);
    expect(hero!.traits).toEqual([TRAIT.heavyHanded, TRAIT.bruiser]);
    expect(hero!.skillPoints).toHaveLength(18);
  });

  it('GCD: a woman, one trait, an odd age — the default', () => {
    const hero = parseGcd(gcd({ special: [3, 5, 5, 6, 7, 9, 5], age: 99, gender: 1, name: '', tagged: [8, 10, 3], traits: [TRAIT.gifted] }));
    expect(hero!.gender).toBe('female');
    expect(hero!.traits).toEqual([TRAIT.gifted]);
    expect(hero!.age).toBe(25);
    expect(hero!.name).toBeUndefined();
  });

  it('GCD not by creation rules or too short — null', () => {
    expect(parseGcd(gcd({ special: [10, 10, 10, 10, 10, 10, 10], age: 25, gender: 0, name: 'X', tagged: [0, 1, 2], traits: [] }))).toBeNull();
    expect(parseGcd(gcd({ special: [5, 5, 5, 5, 5, 5, 10], age: 25, gender: 0, name: 'X', tagged: [0, 1], traits: [] }))).toBeNull();
    expect(parseGcd(new Uint8Array(100))).toBeNull();
  });

  it('BIO: lines as in the file, without blank ones at the edges', () => {
    expect(parseBio('\r\nTITLE:\r\n\r\nline one -\r\nline two  \r\n\r\n')).toEqual(['TITLE:', '', 'line one -', 'line two']);
  });
});
