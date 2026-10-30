// Sound names by Fallout rules: checked on examples that can be seen in the game copy's files themselves
// (for example, the 10mm pistol shot is WAA1XXX1).
import { describe, expect, it } from 'vitest';
import {
  ambientSfxName,
  animationLetters,
  ANIM,
  CHARACTER_SOUND,
  characterSfxName,
  interfaceSfxName,
  openSfxName,
  scenerySfxName,
  weaponSfxName,
} from '../src/script/sfx-names.ts';

describe('ambient, interface and scenery sounds', () => {
  it('ambient and interface: a letter, six name characters, a one', () => {
    expect(ambientSfxName('birds1')).toBe('ABIRDS11');
    expect(interfaceSfxName('ib1p1x')).toBe('NIB1P1X1');
  });

  it('a short name is padded with spaces on the left (like "%6s" in the original)', () => {
    expect(ambientSfxName('wind')).toBe('A  WIND1');
  });

  it('scenery: active or passive, an action letter, four name characters', () => {
    expect(scenerySfxName(false, 0, 'door')).toBe('SAODOOR1');
    expect(scenerySfxName(true, 1, 'door')).toBe('SPCDOOR1');
    expect(scenerySfxName(false, 4, 'lock')).toBe('SAULOCK1');
  });

  it('opening: door — SODOORS?, container — IOCNTNR?; for a door it matches doorSfx from resources.ts', () => {
    expect(openSfxName(false, 0, 'B')).toBe('SODOORSB');
    expect(openSfxName(false, 1, 'a')).toBe('SCDOORSA');
    expect(openSfxName(true, 2, 'c')).toBe('ILCNTNRC');
    // doorSfx('O', 'A') and doorSfx('L', 'A') give the same names ("S" + action + "DOORS" + letter).
    expect(openSfxName(false, 0, 'A')).toBe('SODOORSA');
    expect(openSfxName(false, 2, 'A')).toBe('SLDOORSA');
  });
});

describe('weapon sounds', () => {
  const pistol = (targetMaterial: number | null, damageType = 0) => ({ soundCode: 'A', damageType, targetMaterial });

  it('shot and hit — the same names as weaponSfx in resources.ts', () => {
    // weaponSfx('A', 'A', 1) = WAA1XXX1, weaponSfx('H', 'A', 1, 'M') = WHA1MXX1, and so on.
    expect(weaponSfxName(1, 2, pistol(null))).toBe('WAA1XXX1');
    expect(weaponSfxName(4, 2, pistol(1))).toBe('WHA1MXX1');
    expect(weaponSfxName(2, 2, pistol(null))).toBe('WOA1XXX1');
    expect(weaponSfxName(0, 2, pistol(null))).toBe('WRA1XXX1');
  });

  it('the second weapon mode is variant "2", ready and "out of ammo" are always "1"', () => {
    expect(weaponSfxName(1, 3, pistol(null))).toBe('WAA2XXX1');
    expect(weaponSfxName(0, 3, pistol(null))).toBe('WRA1XXX1');
    expect(weaponSfxName(2, 3, pistol(null))).toBe('WOA1XXX1');
    expect(weaponSfxName(1, 4, pistol(null))).toBe('WAA1XXX1');
  });

  it('target material: metal, glass and plastic — M; wood — W; stone, dirt and concrete — S; otherwise flesh — F', () => {
    const letters = [0, 1, 2, 3, 4, 5, 6, 7, -1].map((m) => weaponSfxName(4, 2, pistol(m))[4]);
    expect(letters).toEqual(['M', 'M', 'M', 'W', 'S', 'S', 'S', 'F', 'F']);
  });

  it('no target, an explosion, plasma and EMP need no material', () => {
    expect(weaponSfxName(4, 2, pistol(null))).toBe('WHA1XXX1');
    for (const damage of [3, 5, 6]) expect(weaponSfxName(4, 2, pistol(1, damage))).toBe('WHA1XXX1');
  });
});

describe('critter sounds', () => {
  it('animation letters: stance, walking with a weapon, falling, drawing a weapon', () => {
    expect(animationLetters(0, 0)).toEqual(['a', 'a']);
    expect(animationLetters(1, 4)).toEqual(['g', 'b']);
    expect(animationLetters(20, 0)).toEqual(['b', 'a']);
    expect(animationLetters(ANIM.fallBackSf, 0)).toEqual(['r', 'a']);
    expect(animationLetters(ANIM.takeOut, 5)).toEqual(['h', 'c']);
    expect(animationLetters(ANIM.takeOut, 0)).toBeNull();
    expect(animationLetters(0, 11)).toBeNull();
    expect(animationLetters(ANIM.dodge, 0)).toEqual(['n', 'a']);
    expect(animationLetters(ANIM.throwAnim, 1)).toEqual(['d', 'm']);
    expect(animationLetters(ANIM.throwAnim, 4)).toEqual(['g', 'm']);
    expect(animationLetters(ANIM.throwAnim, 7)).toEqual(['a', 's']);
    expect(animationLetters(ANIM.proneToStanding, 0)).toEqual(['c', 'h']);
    expect(animationLetters(ANIM.calledShotPic, 0)).toEqual(['n', 'a']);
  });

  it('sound name: images + weapon letter + action letter, in capitals', () => {
    expect(characterSfxName('hmwarr', 0, 0, 0)).toBe('HMWARRAA');
    expect(characterSfxName('hmwarr', 1, 4, 0)).toBe('HMWARRGB');
    expect(characterSfxName('hmwarr', ANIM.takeOut, 0, 4)).toBe('HMWARRGC');
  });

  it('falling: "knocked out" and "died" change the first letter; a punch on a target too', () => {
    expect(characterSfxName('hmwarr', ANIM.fallBack, 0, CHARACTER_SOUND.passOut)).toBe('HMWARRYA');
    expect(characterSfxName('hmwarr', ANIM.fallFront, 0, CHARACTER_SOUND.die)).toBe('HMWARRZB');
    expect(characterSfxName('hmwarr', ANIM.fallFront, 0, CHARACTER_SOUND.knockdown)).toBe('HMWARRBB');
    expect(characterSfxName('hmwarr', ANIM.throwPunch, 0, CHARACTER_SOUND.contact)).toBe('HMWARRZQ');
    expect(characterSfxName('hmwarr', ANIM.kickLeg, 0, CHARACTER_SOUND.unused)).toBe('HMWARRAR');
  });

  it('no image name or no such animation — an empty string', () => {
    expect(characterSfxName(undefined, 0, 0, 0)).toBe('');
    expect(characterSfxName('hmwarr', ANIM.takeOut, 0, 0)).toBe('');
  });
});
