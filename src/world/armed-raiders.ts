// Raiders and bandits carry firearms (client request, 2026-10-24: "give every raider/bandit/thug a
// firearm"). In the original maps many of them hold a spear, knife, sledgehammer or nothing; those get a gun from a
// short list (mostly a 10mm pistol, some a shotgun or hunting rifle). Anyone who already has a gun is left alone.
import { PID } from './pids.ts';

const critter = (n: number) => 0x01000000 + n;

/** Raiders (Khans camp) and thugs, by critter prototype from the player's copy (the "Raider" and "Thug" names). */
const RAIDER_PIDS: ReadonlySet<number> = new Set([70, 75, 99, 203, 218, 223, 229, 238, 241, 246, 251, 256, 261, 296, 299].map(critter));

/** Bandit scripts: Khan raiders (and camp women with their script), Junktown's Skulz gang. */
const RAIDER_SCRIPTS: ReadonlySet<string> = new Set(['GENRAIDR', 'RAIDGRD', 'GENSKULZ']);

/** Which guns are handed out: by the critter's index on the map, so the same one always gets the same gun. */
const RAIDER_GUNS: readonly number[] = [PID.pistol10mm, PID.pistol10mm, PID.shotgun, PID.pistol10mm, PID.huntingRifle];

/** Is this a raider or bandit (by prototype or by script)? */
export const isRaider = (pid: number, script?: string): boolean => RAIDER_PIDS.has(pid) || (!!script && RAIDER_SCRIPTS.has(script.toUpperCase()));

/** Gun for a raider without a firearm: seed is their index on the map (or any number that stays the same for them). */
export const raiderGun = (seed: number): number => RAIDER_GUNS[Math.abs(Math.floor(seed)) % RAIDER_GUNS.length]!;
