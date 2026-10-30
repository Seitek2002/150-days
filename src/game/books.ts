// Books that raise skills, as in the original (client task, 2026-10-23). Each book has its own skill; the
// lower it is, the more reading gives: a tenth of what's missing to 100% (skill 40% — +6 points; for a tagged
// skill a point counts double). At 91% and above it's "nothing new", the book stays. Reading takes long — 11 hours minus
// Intelligence (a smart one reads faster), so not in combat. A book that has been read disappears.
import { SKILL } from './character.ts';
import { PID } from '../world/pids.ts';

/** Book → the skill it raises. */
export const BOOK_SKILL: Readonly<Record<number, number>> = {
  [PID.bigBookOfScience]: SKILL.science,
  [PID.deansElectronics]: SKILL.repair,
  [PID.firstAidBook]: SKILL.firstAid,
  [PID.scoutHandbook]: SKILL.outdoorsman,
  [PID.gunsAndBullets]: SKILL.smallGuns,
};

export const isBook = (pid: number): boolean => BOOK_SKILL[pid] !== undefined;

/** How many skill points a book gives at this skill value (in percent); 0 — nothing new. */
export const bookGain = (skillValue: number): number => Math.max(0, Math.floor((100 - skillValue) / 10));

/** How many hours reading takes at this Intelligence. */
export const readingHours = (intelligence: number): number => Math.max(1, 11 - intelligence);
