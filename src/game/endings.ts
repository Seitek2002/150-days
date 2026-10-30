// End of the game: a loss when Vault 13 runs out of water (the chip wasn't brought) or the mutants arrive there (the Master and the vats
// weren't destroyed in time), and a win — the finale from the cave's script (endgame_slideshow). Outcomes by location are decided by the original's
// story variables (VAULT13.GAM); the texts are ours, short (the original's data has no ending slides: they are hardcoded
// in the game's program, and the narrator's voice-over has no text).
import type { StringKey } from '../i18n.ts';

/** Numbers of the original's story variables. */
export const GVAR = {
  vaultWater: 10,
  shadySandsInvaded: 12,
  necropolisInvaded: 13,
  hubInvaded: 14,
  junktownInvaded: 15,
  brotherhoodInvaded: 16,
  vatsBlown: 17,
  masterBlown: 18,
  tandiStatus: 26,
  tandiDead: 27,
  necropMutantsKilled: 29,
  necropPumpFixed: 31,
  killianDead: 37,
  gizmoDead: 38,
  findWaterChip: 101,
  totalRaiders: 115,
  warnedBrotherhood: 110,
  vault13InvadedDate: 154,
} as const;

/** Initial values if scripts haven't changed them yet (as in VAULT13.GAM). */
const DEFAULTS: Partial<Record<number, number>> = { [GVAR.vaultWater]: 150, [GVAR.totalRaiders]: 16, [GVAR.vault13InvadedDate]: 1095 };

const gvar = (vars: Readonly<Record<string, number>>, n: number) => vars[`g${n}`] ?? DEFAULTS[n] ?? 0;

/** How many days of water Vault 13 has (the VAULT_WATER variable: the water caravan from the Hub increases it). */
export const waterDays = (vars: Readonly<Record<string, number>>): number => gvar(vars, GVAR.vaultWater);

export type GameOver = 'water' | 'invasion' | 'won' | null;

/**
 * How the game ended on this day: the water ran out and the chip wasn't brought; the mutants reached the Vault while the Master and the vats are alive;
 * the finale from the cave's script (vars.endgame). day — day number from the start (the first is 1).
 */
export function gameOver(vars: Readonly<Record<string, number>>, day: number): GameOver {
  if (vars['endgame']) return 'won';
  const chip = gvar(vars, GVAR.findWaterChip) === 2;
  if (!chip && day - 1 >= waterDays(vars)) return 'water';
  const threatGone = gvar(vars, GVAR.vatsBlown) !== 0 && gvar(vars, GVAR.masterBlown) !== 0;
  if (chip && !threatGone && day - 1 >= gvar(vars, GVAR.vault13InvadedDate)) return 'invasion';
  return null;
}

/**
 * Ending slides, as in the original: an image (ART\INTRFACE\<image>.FRM with its own palette), the narrator's voice and subtitles
 * (record number NAR_<nar>). Which record goes with which outcome is our table, by the meaning of the records and the story variables
 * (in the original's program it is hardcoded; docs/STATUS.md). image '' — a black screen (the last record, "what became of you").
 * Order: the Cathedral (win) → Shady Sands → Junktown → the Hub → Necropolis → the Brotherhood → raiders.
 */
export interface EndingSlide {
  image: string;
  nar: number;
}

export function endingSlides(vars: Readonly<Record<string, number>>, over: 'won' | 'invasion'): EndingSlide[] {
  const g = (n: number) => gvar(vars, n);
  const invaded = (n: number) => over === 'invasion' || g(n) !== 0;
  const out: EndingSlide[] = [];
  // The Cathedral destroyed (with the Cathedral intact — variant SEQ3A, which is for the "joined the Unity" ending, we don't have it).
  if (over === 'won') out.push({ image: 'SEQ3C', nar: 11 });
  // Shady Sands: destroyed by the mutant army / Tandi killed — Aradesh grieving / Tandi helps her father (the beginning of the NCR).
  if (invaded(GVAR.shadySandsInvaded)) out.push({ image: 'SEQ4DE', nar: 23 });
  else out.push({ image: 'SEQ4ABC', nar: g(GVAR.tandiDead) ? 20 : 19 });
  // Junktown: as in the original, a slide only when one of the two died; both alive — the town isn't in the outcomes.
  if (invaded(GVAR.junktownInvaded)) out.push({ image: 'SEQ5D', nar: 27 });
  else if (g(GVAR.killianDead) && !g(GVAR.gizmoDead)) out.push({ image: 'SEQ5B', nar: 25 });
  else if (g(GVAR.gizmoDead)) out.push({ image: 'SEQ5A', nar: 24 });
  // The Hub.
  out.push(invaded(GVAR.hubInvaded) ? { image: 'SEQ7C', nar: 34 } : { image: 'SEQ7A', nar: 32 });
  // Necropolis: wiped out by the mutants / pump repaired — the ghouls live on (a night city with lights) / without the chip the city dried up.
  if (invaded(GVAR.necropolisInvaded)) out.push({ image: 'SEQ2AD', nar: 15 });
  else if (g(GVAR.necropPumpFixed)) out.push({ image: 'SEQ2B', nar: 13 });
  else out.push({ image: 'SEQ2AD', nar: 12 });
  // The Brotherhood of Steel.
  out.push(invaded(GVAR.brotherhoodInvaded) ? { image: 'SEQ6B', nar: 31 } : { image: 'SEQ6A', nar: 28 });
  // Raiders.
  out.push({ image: 'SEQ8ABC', nar: g(GVAR.totalRaiders) <= 0 ? 35 : over === 'invasion' ? 37 : 36 });
  // "What finally happened to you?" — only for a win.
  if (over === 'won') out.push({ image: '', nar: 40 });
  return out;
}

/** Outcomes by location for the finale: i18n string keys in order. */
export function endingLines(vars: Readonly<Record<string, number>>): StringKey[] {
  const out: StringKey[] = ['endVault'];
  out.push(gvar(vars, GVAR.tandiDead) ? 'endShadyTandiDead' : gvar(vars, GVAR.tandiStatus) >= 2 ? 'endShadyTandiSaved' : 'endShady');
  if (gvar(vars, GVAR.totalRaiders) <= 0) out.push('endRaidersGone');
  if (gvar(vars, GVAR.gizmoDead) && !gvar(vars, GVAR.killianDead)) out.push('endJunktownKillian');
  else if (gvar(vars, GVAR.killianDead) && !gvar(vars, GVAR.gizmoDead)) out.push('endJunktownGizmo');
  else out.push('endJunktown');
  out.push(gvar(vars, GVAR.necropPumpFixed) ? 'endNecropolisPump' : 'endNecropolisDry');
  if (gvar(vars, GVAR.warnedBrotherhood)) out.push('endBrotherhood');
  return out;
}
