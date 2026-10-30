// Status plates above the message screen in the bottom left, as in the original: the WARNBOX.FRM frame (INTRFACE.LST #126, 130×21),
// labels from INTRFACE.MSG in the player's copy (100–104: sneak, level up, addiction, poisoned, radiation sickness);
// bad ones in red, good ones in green. In the original, broken arms and legs show only in the character window (the labels there are long
// and do not fit the frame); the client (2026-10-27) asked for them here too, with our own short labels. The order is the original's,
// arms and legs come after. Overloaded and the deathclaw mother's curse (2026-10-27) are our own plates, last.
import type { StringKey } from '../i18n.ts';

export type IndicatorKey = 'addict' | 'sneak' | 'level' | 'poison' | 'rad' | 'armRight' | 'armLeft' | 'legRight' | 'legLeft' | 'overload' | 'curse';

export interface Indicator {
  key: IndicatorKey;
  bad: boolean;
}

/** Where the label comes from: file and line in the player's copy (missing, or no file given, means our own string, i18n). */
export const INDICATOR_TEXT: Record<IndicatorKey, { file?: 'INTRFACE.MSG'; id?: number; fallback: StringKey }> = {
  addict: { file: 'INTRFACE.MSG', id: 102, fallback: 'indAddict' },
  sneak: { file: 'INTRFACE.MSG', id: 100, fallback: 'indSneak' },
  level: { file: 'INTRFACE.MSG', id: 101, fallback: 'indLevel' },
  poison: { file: 'INTRFACE.MSG', id: 103, fallback: 'indPoison' },
  rad: { file: 'INTRFACE.MSG', id: 104, fallback: 'indRad' },
  armRight: { fallback: 'indArmRight' },
  armLeft: { fallback: 'indArmLeft' },
  legRight: { fallback: 'indLegRight' },
  legLeft: { fallback: 'indLegLeft' },
  overload: { fallback: 'indOverload' },
  curse: { fallback: 'indCurse' },
};

export interface IndicatorState {
  addicted: boolean;
  sneaking: boolean;
  /** Level up, and the character window has not been opened since. */
  levelUp: boolean;
  poisoned: boolean;
  irradiated: boolean;
  /** Broken arm and leg: which one (null means intact). */
  arm: 'left' | 'right' | null;
  leg: 'left' | 'right' | null;
  /** Carrying more than can be carried (hero.ts → OVERLOAD). */
  overloaded?: boolean;
  /** Cursed: killed the deathclaw mother (wasteland.ts → CURSE). */
  cursed?: boolean;
}

export function indicators(s: IndicatorState): Indicator[] {
  const out: Indicator[] = [];
  if (s.addicted) out.push({ key: 'addict', bad: true });
  if (s.sneaking) out.push({ key: 'sneak', bad: false });
  if (s.levelUp) out.push({ key: 'level', bad: false });
  if (s.poisoned) out.push({ key: 'poison', bad: true });
  if (s.irradiated) out.push({ key: 'rad', bad: true });
  if (s.arm) out.push({ key: s.arm === 'left' ? 'armLeft' : 'armRight', bad: true });
  if (s.leg) out.push({ key: s.leg === 'left' ? 'legLeft' : 'legRight', bad: true });
  if (s.overloaded) out.push({ key: 'overload', bad: true });
  if (s.cursed) out.push({ key: 'curse', bad: true });
  return out;
}
