// Special encounters on the road, the original's easter eggs (client, 2026-10-27: "the easter eggs the original has when traveling
// across the wasteland"). The game copy has six: a huge footprint, a brahmin herd with a "talking" cow, Bob's used car
// lot, a police box that vanishes, a crashed saucer and abandoned crates with caps. Selection works as in the original's
// code (it is not in the data but in the game itself): an encounter happens when an animal encounter would, and it is special if
// 3d6 + (Luck − 5) ≥ 18; which one is chosen by the weights below; each happens once per game. We do not build the original maps: at the encounter site
// we place its own critters, scenery and items (images and names from the player's copy), and what the map scripts did is done by
// play.ts (meetSpecial).
import { PID } from './pids.ts';

export type SpecialKey = 'foot' | 'cows' | 'usedCars' | 'tardis' | 'saucer' | 'capsCache';

/** Encounter weights (out of a hundred), as in the original. */
export const SPECIAL_WEIGHTS: readonly [SpecialKey, number][] = [
  ['foot', 30],
  ['cows', 20],
  ['usedCars', 20],
  ['tardis', 10],
  ['saucer', 10],
  ['capsCache', 10],
];

/** Session variable "already happened" for the encounter. */
export const specialVar = (key: SpecialKey): string => `egg:${key}`;

/** Special encounter: 3d6 + (Luck − 5) is at least 18. */
export function isSpecialRoll(luck: number, rand: () => number = Math.random): boolean {
  const d6 = () => 1 + Math.floor(rand() * 6);
  return d6() + d6() + d6() + (luck - 5) >= 18;
}

/** Which of the ones not yet seen (null means all have happened). If a previous one comes up, roll again, as in the original. */
export function pickSpecial(seen: (key: SpecialKey) => boolean, rand: () => number = Math.random): SpecialKey | null {
  const left = SPECIAL_WEIGHTS.filter(([key]) => !seen(key));
  if (left.length === 0) return null;
  const total = left.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [key, w] of left) {
    roll -= w;
    if (roll < 0) return key;
  }
  return left[left.length - 1]![0];
}

const scenery = (index: number) => 0x02000000 + index;
const critter = (index: number) => 0x01000000 + index;

/** What is placed at the encounter site (numbers from the original maps FOOT, TALKCOW, USEDCAR, TARDIS, FSAUSER, COLATRUK). */
export const SPECIAL_PARTS = {
  foot: {
    /** Dead peasant by the footprint, with a "Stealth Boy" in his pockets. */
    corpse: critter(30),
    items: [[PID.stealthBoy, 1]] as [number, number][],
  },
  cows: { brahmin: critter(28), count: 6 },
  usedCars: {
    dealer: critter(13),
    dealerScript: 'DEALER',
    /** Cars, trucks and the lot's sign. */
    scenery: [scenery(224), scenery(226), scenery(227), scenery(228), scenery(323), scenery(324), scenery(876)],
    /** Locked footlocker with a BB gun and BBs, and a crate with a special rifle. */
    footlocker: 128,
    footlockerItems: [[PID.redRyderBbGun, 1], [163, 5]] as [number, number][],
    crate: 180,
    crateItems: [[162, 1]] as [number, number][],
  },
  tardis: {
    box: scenery(658),
    /** The box vanishes when the hero comes closer than near cells; a motion sensor is left in its place. */
    near: 5,
    sound: 'STARDIS1',
    item: PID.motionSensor,
  },
  saucer: {
    dome: scenery(400),
    /** Strange bones: some hold an alien blaster (with batteries), others a faded picture. */
    bones: [
      { pid: 107, items: [[120, 1], [PID.smallEnergyCell, 30]] as [number, number][] },
      { pid: 108, items: [[78, 1]] as [number, number][] },
    ],
  },
  capsCache: {
    crates: [scenery(402), scenery(403)],
    crate: 180,
  },
} as const;

/**
 * Caps in the abandoned crate depend on Luck, as in the original script (Luck 1…10); "Fortune Finder" doubles them.
 */
export const CACHE_CAPS = [1, 32, 105, 298, 730, 1645, 2976, 5709, 8443, 10765] as const;
export const cacheCaps = (luck: number, fortuneFinder: boolean): number => CACHE_CAPS[Math.max(1, Math.min(10, luck)) - 1]! * (fortuneFinder ? 2 : 1);
