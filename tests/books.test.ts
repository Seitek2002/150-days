// Books raise skills (as in the original): the lower the skill, the more a book gives; reading takes 11 hours minus Intelligence.
import { describe, expect, it } from 'vitest';
import { BOOK_SKILL, bookGain, isBook, readingHours } from '../src/game/books.ts';
import { SKILL } from '../src/game/character.ts';
import { PID } from '../src/world/pids.ts';

describe('skill books', () => {
  it('each book has its own skill', () => {
    expect(BOOK_SKILL[PID.bigBookOfScience]).toBe(SKILL.science);
    expect(BOOK_SKILL[PID.deansElectronics]).toBe(SKILL.repair);
    expect(BOOK_SKILL[PID.firstAidBook]).toBe(SKILL.firstAid);
    expect(BOOK_SKILL[PID.scoutHandbook]).toBe(SKILL.outdoorsman);
    expect(BOOK_SKILL[PID.gunsAndBullets]).toBe(SKILL.smallGuns);
    expect(isBook(PID.rope)).toBe(false);
  });

  it('the lower the skill, the more a book gives; from 91% nothing more', () => {
    expect(bookGain(10)).toBe(9);
    expect(bookGain(40)).toBe(6);
    expect(bookGain(85)).toBe(1);
    expect(bookGain(91)).toBe(0);
    expect(bookGain(150)).toBe(0);
  });

  it('a smart hero reads faster, but not under an hour', () => {
    expect(readingHours(5)).toBe(6);
    expect(readingHours(10)).toBe(1);
    expect(readingHours(1)).toBe(10);
  });
});
