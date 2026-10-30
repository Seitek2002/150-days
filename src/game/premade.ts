// The original's premade heroes for the "Choose character" screen: numbers from PREMADE\<name>.GCD, the hero's story from PREMADE\<name>.BIO,
// portraits are INTRFACE.LST images #201–203. Everything is read from the player's copy; the code has only the file's field order.
// GCD is 428 bytes, 4-byte numbers (most significant byte first): a service number; 35 base stats (the first seven are SPECIAL,
// the 34th is age, the 35th is gender: 0 male, 1 female); 35 bonuses; 18 numbers of points invested in skills; 3 service numbers;
// the name, 32 bytes (cp1251, up to the zero byte); 4 tag skills and 2 traits (−1 means empty); unspent points.
import { platform } from '../platform.ts';
import {
  AGE_DEFAULT,
  AGE_MAX,
  AGE_MIN,
  isValidSpecial,
  isValidTagged,
  isValidTraits,
  SKILL_COUNT,
  SPECIAL_NAMES,
  type Character,
  type Special,
} from './character.ts';

/** Where things are in GCD (byte offsets). */
const GCD = { size: 428, stats: 4, skills: 4 + 70 * 4, name: 368, nameBytes: 32, tagged: 400, tags: 4, traits: 416, traitSlots: 2 };
const STAT_AGE = 33;
const STAT_GENDER = 34;

/** The order of heroes on screen, as in the original: fighter, scout, diplomat. */
export const PREMADE_FILES = [
  { file: 'COMBAT', portrait: 201 },
  { file: 'STEALTH', portrait: 202 },
  { file: 'DIPLOMAT', portrait: 203 },
] as const;

export interface Premade {
  /** File name without extension (COMBAT, STEALTH, DIPLOMAT). */
  file: string;
  /** Portrait number in INTRFACE.LST. */
  portrait: number;
  character: Character;
  /** The hero's story: lines as in the file (they are already broken for the window width); empty lines at the edges removed. */
  bio: string[];
}

/** A hero from GCD; a file of the wrong size or numbers that break the creation rules (SPECIAL sum, three skills) means null. */
export function parseGcd(bytes: Uint8Array): Character | null {
  if (bytes.length < GCD.size) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const int = (offset: number) => view.getInt32(offset, false);
  const stat = (index: number) => int(GCD.stats + index * 4);
  const slots = (offset: number, count: number) => Array.from({ length: count }, (_, i) => int(offset + i * 4)).filter((n) => n >= 0);
  const special = Object.fromEntries(SPECIAL_NAMES.map((name, i) => [name, stat(i)])) as Special;
  const tagged = slots(GCD.tagged, GCD.tags);
  const traits = slots(GCD.traits, GCD.traitSlots);
  if (!isValidSpecial(special) || !isValidTagged(tagged) || !isValidTraits(traits)) return null;
  const nameBytes = bytes.subarray(GCD.name, GCD.name + GCD.nameBytes);
  const end = nameBytes.indexOf(0);
  const name = new TextDecoder('windows-1251').decode(end < 0 ? nameBytes : nameBytes.subarray(0, end)).trim();
  const age = stat(STAT_AGE);
  return {
    special,
    traits,
    tagged,
    skillPoints: Array.from({ length: SKILL_COUNT }, (_, i) => Math.max(0, int(GCD.skills + i * 4))),
    age: age >= AGE_MIN && age <= AGE_MAX ? age : AGE_DEFAULT,
    gender: stat(STAT_GENDER) === 1 ? 'female' : 'male',
    ...(name ? { name } : {}),
  };
}

/** Story lines: line breaks as in the file, no trailing spaces and no empty lines at the edges. */
export function parseBio(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd());
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Premade heroes from the player's copy; any that could not be read are skipped (none at all means an empty list). */
export async function loadPremades(): Promise<Premade[]> {
  const all = await Promise.all(
    PREMADE_FILES.map(async ({ file, portrait }): Promise<Premade | null> => {
      const character = await platform
        .readGameFile(`PREMADE\\${file}.GCD`)
        .then(parseGcd)
        .catch(() => null);
      if (!character) return null;
      const bio = await platform
        .readGameFile(`PREMADE\\${file}.BIO`)
        .then((bytes) => parseBio(new TextDecoder('windows-1251').decode(bytes)))
        .catch(() => []);
      return { file, portrait, character, bio };
    }),
  );
  return all.filter((premade) => premade !== null);
}
