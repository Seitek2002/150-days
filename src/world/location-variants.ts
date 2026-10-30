// Custom locations in the game: which variants from the location editor replace the game levels. The choice is in the main menu settings
// (the file locations/choice.json next to the variants); it applies from a new game, and a save remembers its locations: on
// load, the ones it was made with are substituted (otherwise the hero could end up inside a wall).
import { platform } from '../platform.ts';
import type { LevelDef } from './defs.ts';
import { textureNames } from './known-textures.ts';
import { LEVELS } from './levels/index.ts';
import { decodeLocation, levelFromLocation } from './location-file.ts';

/** Game levels as they were before substitution (taken on the first substitution). */
const ORIGINAL = new Map<string, LevelDef>();
/** What is substituted now: level → variant name. */
let active: Record<string, string> = {};

/** Variants substituted now (for saving). */
export const activeVariants = (): Record<string, string> => ({ ...active });

/**
 * Restore the game levels and substitute the variants from choice (level → name). A file that cannot be read or was made for another
 * level is skipped, and the game level stays there. Returns what was actually substituted.
 */
export async function useLocationVariants(choice: Readonly<Record<string, string>>): Promise<Record<string, string>> {
  for (const [id, def] of ORIGINAL) LEVELS[id] = def;
  active = {};
  const wanted = Object.entries(choice).filter(([base, name]) => Object.hasOwn(LEVELS, base) && typeof name === 'string' && name);
  if (!wanted.length) return {};
  const names = textureNames();
  for (const [base, name] of wanted) {
    const raw = await platform.readLocation(base, name).catch(() => null);
    const original = ORIGINAL.get(base) ?? LEVELS[base]!;
    const loc = decodeLocation(raw, { ...LEVELS, [base]: original }, names);
    if (!loc || loc.base !== base) continue;
    ORIGINAL.set(base, original);
    LEVELS[base] = levelFromLocation(loc, original);
    active[base] = name;
  }
  return activeVariants();
}
