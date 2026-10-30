// The Hub's look as in the original (client, 2026-10-25), shared by maps HUBENT, HUBDWNTN, HUBOLDTN, HUBHEIGT, HUBWATER and HUBMIS1:
// houses are dark concrete panels (nec* pieces), inside are light plaster partitions (a wall whose neighbouring floor is
// all under a roof), brick houses (nec05*–06*) are brick, old town warehouses (ware*) are ribbed siding under a black
// tar-paper roof, sheds (j*) are planks and corrugated iron, the palisade by the entrance (tfenc*) is upright logs; street asphalt, concrete sidewalks,
// plank floors in houses follow the original's tiles; house roofs are a grassy parapet outside and a concrete ceiling inside.
// Wall letters are not among the converter's exit letters (X, Y, Z, W, U, T, Q, P, N, M, K, J, H, G, F, E) and not R, V, L (rock, door, opening).
import type { LevelConfig } from '../map-to-level.ts';

export const HUB_LOOK: Partial<LevelConfig> = {
  wallTexture: 'hubPanel',
  walls: { '#': 'hubPanel', I: 'hubPlaster', B: 'oldBrick', O: 'palisade', D: 'wareSiding', A: 'junkPlanks', C: 'junkSheet', S: 'plankWall' },
  wallArts: [
    [/^nec0[5-6]\d/i, 'B'],
    [/^tfenc/i, 'O'],
    [/^ware/i, 'D'],
    [/^ja/i, 'A'],
    [/^j[b-d]/i, 'C'],
    [/^(cni|cnx|corn|bar|rl)/i, 'S'],
  ],
  insideWall: { from: '#', to: 'I' },
  floor: 'wasteland',
  paint: true,
  roofs: 'hubRoof',
  // The original's roof layer reaches one street cell past the facade; the roof edge over the street is trimmed.
  streetRoofs: false,
  roofByWall: { D: 'wareRoof', A: 'junkRoof', C: 'junkRoof' },
  // The roof storey above a wall, seen from outside, is the top of the facade: a parapet with a cornice and grass on houses, siding on warehouses.
  roofEdges: { '#': 'hubParapet', D: 'wareSiding' },
  doorways: true,
};
