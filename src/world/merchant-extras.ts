// Our additions to merchant stock, a departure from the original (client decision, 2026-10-20: "a few 10mm rounds
// at the Shady Sands merchant"). In the original the Shady Sands merchant's stock box (script BARTRBOX) first gives only knives,
// and ammo appears with the restock once a week of game time; without it the first chapter is hard to beat without cheats.
// The addition goes into the box once, when it first appears on the map; after that the box lives by its own script.

export interface MerchantExtra {
  /** Original map (MAP file name). */
  map: string;
  /** Script of the stock box or merchant that gets the extra goods. */
  script: string;
  /** What to add: [PID, how many], ammo in packs, as in the original. */
  items: readonly (readonly [number, number])[];
}

/** PID 29: 10mm JHP ammo (pack). */
export const MERCHANT_EXTRAS: readonly MerchantExtra[] = [{ map: 'SHADYW', script: 'BARTRBOX', items: [[29, 2]] }];
