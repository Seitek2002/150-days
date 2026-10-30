// Enemy combat lines by speaker class (client, 2026-10-20: a bandit shouted "Target sighted!" like a soldier).
import type { BarkKey } from './creature.ts';
import type { StringKey } from '../i18n.ts';

/**
 * Who speaks in combat (client, 2026-10-20: a bandit shouted "Target sighted!" like a soldier): bandits and raiders, town guards,
 * Brotherhood soldiers and paladins, super mutants, townsfolk. Each class has its own lines (i18n.ts, bark<Class><Case>1/2;
 * soldiers use bark<Case>1/2).
 */
export type BarkClass = 'raider' | 'guard' | 'soldier' | 'mutant' | 'citizen';
const BARK_PREFIX: Record<BarkClass, string> = { soldier: '', raider: 'Raider', guard: 'Guard', mutant: 'Mutant', citizen: 'Citizen' };

/** An enemy's line above its head: two variants per case so they don't repeat. */
export function barkText(cls: BarkClass, key: BarkKey, variant: 1 | 2): StringKey {
  return `bark${BARK_PREFIX[cls]}${key[0]!.toUpperCase()}${key.slice(1)}${variant}` as StringKey;
}

/**
 * Speaker class: a super mutant and a soldier in power armor — by sprite; guards and bandits — by the original's script name;
 * a human without a script (wasteland encounters) — a bandit; everyone else — townsfolk.
 */
export function barkClassOf(art: string, script: string | null): BarkClass {
  if (/^MAMTN/i.test(art)) return 'mutant';
  if (/POWR|BRWN/i.test(art)) return 'soldier';
  if (!script) return 'raider';
  if (/GRD|GUARD|COP|DEPUT|SHERIF|GATE|POLIC|WATCH|SECUR|PATROL/i.test(script)) return 'guard';
  if (/KHAN|RAID|BAND|THUG|MERC|CRVNENMY|CRVNMSTR|GANG|SKUL|JACKAL|VIPER|SLAV|RIPPER|ASSASS|KILLER|CUTTHR/i.test(script)) return 'raider';
  return 'citizen';
}

