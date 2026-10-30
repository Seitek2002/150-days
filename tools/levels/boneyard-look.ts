// The Boneyard's look as in the original (client, 2026-10-25: "all of Adytum as in the original"): maps LAADYTUM, LABLADES, LARIPPER,
// LAGUNRUN, LAFOLLWR. Streets (BONEYARD_LOOK): the ruins of Los Angeles, dark concrete panels (nec* pieces) with a parapet
// and weeds on top, the ceiling is concrete slabs; inside the houses, light plaster partitions; a chain-link fence on
// posts (fence* pieces) that you can see through; tents are canvas without a roof (the original's tent roof is yrf*); sheds are
// planks and corrugated iron; the gun runners' warehouse (ware*) is ribbed siding under tar paper; open ground and sidewalks around.
// Underground floors (BONEYARD_INDOOR): dark concrete, concrete ceiling, floor following the original's tiles.
// Wall letters are not among the converter's exit letters (X, Y, Z, W, U, T, Q, P, N, M, K, J, H, G, F, E) and not R, V, L.
import type { LevelConfig } from '../map-to-level.ts';

export const BONEYARD_LOOK: Partial<LevelConfig> = {
  wallTexture: 'hubPanel',
  walls: { '#': 'hubPanel', I: 'hubPlaster', B: 'oldBrick', C: 'canvas', A: 'junkPlanks', D: 'junkSheet', S: 'plankWall', O: 'wareSiding' },
  wallArts: [
    [/^nec0[5-6]\d/i, 'B'],
    [/^(ybk|ylf|yrt)/i, 'C'],
    [/^ware/i, 'O'],
    [/^ja/i, 'A'],
    [/^j[b-d]/i, 'D'],
    [/^(cni|cnx|corn)/i, 'S'],
  ],
  insideWall: { from: '#', to: 'I' },
  chainFences: { art: /^fence\d/i, texture: 'chainLink', height: 1.1 },
  floor: 'wasteland',
  paint: true,
  // The top of the roof cannot be seen from the ground; what you see is the ceiling indoors and the overhang above openings: concrete slabs, as in the Hub.
  roofs: 'hubRoof',
  roofSkip: /^yrf/i,
  roofByWall: { A: 'junkRoof', D: 'junkRoof', O: 'wareRoof' },
  roofEdges: { '#': 'hubParapet', O: 'wareSiding' },
  streetRoofs: false,
  doorways: true,
};

/** The Boneyard's underground floors (the deathclaw nest under the Rippers, the Followers' library): closed rooms in the void. */
export const BONEYARD_INDOOR: Partial<LevelConfig> = {
  outdoor: false,
  wallTexture: 'darkConcrete',
  walls: { '#': 'darkConcrete' },
  floor: 'darkTiles',
  ceiling: 'hubRoof',
  fade: 10,
  paint: true,
  // The original's invisible walls under tables and shelves are not walls; floor that cannot be reached is rock; do not carve
  // tunnels in the rock (the rooms in the void are connected by the original's doors and openings).
  furnitureBlocks: true,
  seal: true,
  carve: false,
  // Doorless room openings (a missing hex in the wall line) are open: otherwise the rooms would be walled up.
  doorways: true,
};
