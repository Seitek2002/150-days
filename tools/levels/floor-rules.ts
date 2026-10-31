// Which original floor tile and which original wall becomes which of our textures: shared rules for the converters
// tools/map-to-level.ts (level floor) and tools/map-to-location.ts (the "as in the original" location variant). Only file
// names from the player's copy; no images or texts of the original here.
import type { TextureName } from '../../src/engine/textures.ts';

export type Rules = [RegExp, TextureName][];

/** Original floor tile (file name) → our texture. The first match wins. */
export const FLOOR_RULES: Rules = [
  [/^cav3/i, 'cobbles'],
  [/^cav/i, 'caveFloor'],
  [/^grt/i, 'ceiling'],
  [/^road0/i, 'road'],
  // Road edges (road2x, road3x) are mostly earth with remnants of asphalt.
  [/^road/i, 'wasteland'],
  [/^(edg|aft)/i, 'wasteland'],
  [/^curb/i, 'pavement'],
  [/^capb/i, 'carpet'],
  [/^brn/i, 'brownTile'],
  [/^gar/i, 'dirt'],
  [/^cmt/i, 'cement'],
  [/^tp\d/i, 'planks'],
  [/^slime/i, 'water'],
  [/^mstrflr/i, 'floor'],
  [/^rst/i, 'vaultFloor'],
  [/^plt/i, 'floor'],
  [/^stlflr/i, 'darkTiles'],
  [/^brick/i, 'oldBrick'],
];

/** Original wall (file name) → our texture; invisible walls (block) do not count. */
export const WALL_RULES: Rules = [
  [/^ca\d/i, 'caveWall'],
  [/^v/i, 'vaultWall'],
  [/^dv/i, 'brownConcrete'],
  [/^(mmb|mbw)/i, 'metal'],
  [/^st/i, 'ribbedSteel'],
  [/^ad[wb]/i, 'adobeLight'],
  [/^fence/i, 'chainFence'],
  [/^(fen|tfenc|cni|cnx|corn)/i, 'plankWall'],
  [/^j[a-d][a-z]\d/i, 'plankWall'],
  [/^nec0[5-6]\d/i, 'oldBrick'],
  [/^(nec|ybk|ylf)/i, 'darkConcrete'],
  [/^ware/i, 'scrap'],
];

/**
 * Per-map rules (original map name) take priority over the shared ones. The Vault 13 cave (accepted by the client on
 * 2026-10-23): the dark smooth tiles by the vault door are grating, the brown tiles by the entrance are earth.
 */
export const MAP_RULES: Record<string, { floor?: Rules; walls?: Rules }> = {
  V13ENT: { floor: [[/^road/i, 'ceiling'], [/^edg/i, 'dirt']], walls: [[/^v/i, 'concrete']] },
  // Vaults 15, 13 and 12: the same dark tiles by the vault doors.
  VAULTBUR: { floor: [[/^road/i, 'ceiling']] },
  VAULT13: { floor: [[/^road/i, 'ceiling']] },
  // Vault 12 (under the Necropolis): the same brown slabs and tiles as in the Glow (dv* pieces, brn* tiles), gratings, cave.
  VAULTNEC: { floor: [[/^road/i, 'ceiling'], [/^brn/i, 'glowTile'], [/^grt/i, 'glowGrate']] },
  // The Hub and the Boneyard: the capb tile is a strip along the map edge (the location border), not a carpet.
  ...Object.fromEntries(
    ['HUBENT', 'HUBDWNTN', 'HUBOLDTN', 'HUBHEIGT', 'HUBWATER', 'HUBMIS1', 'LAADYTUM', 'LABLADES', 'LARIPPER', 'LAFOLLWR'].map((m) => [m, { floor: [[/^capb/i, 'wasteland']] as Rules }]),
  ),
  // The Military Base: light ribbed steel plates (our own texture).
  MBSTRG12: { floor: [[/^plt/i, 'baseFloor']] },
  MBVATS12: { floor: [[/^plt/i, 'baseFloor']] },
  // The Glow: a marble floor where the original has brown tiles (client, 2026-10-31: a shelter for the powerful) and rusty floor grating.
  GLOW1: { floor: [[/^brn/i, 'glowLuxFloor'], [/^grt/i, 'glowGrate']] },
  GLOW2: { floor: [[/^brn/i, 'glowLuxFloor'], [/^grt/i, 'glowGrate']] },
  // The Boneyard, gun runners: the moat around the warehouse is bright green toxic sludge, not water.
  LAGUNRUN: { floor: [[/^slime/i, 'toxicSlime'], [/^capb/i, 'wasteland']] },
};

export const ruleOf = (rules: Rules, name: string): TextureName | null => rules.find(([re]) => re.test(name))?.[1] ?? null;

/** Floor and wall rules for a map: the map's own rules come before the shared ones. */
export function rulesFor(mapName: string): { floor: Rules; walls: Rules } {
  const own = MAP_RULES[mapName.toUpperCase()] ?? {};
  return { floor: [...(own.floor ?? []), ...FLOOR_RULES], walls: [...(own.walls ?? []), ...WALL_RULES] };
}
