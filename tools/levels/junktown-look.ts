// Junktown's look as in the original (client, 2026-10-25), shared by maps JUNKENT, JUNKKILL and JUNKCSNO: walls follow the
// original wall piece's image (ja* is dark planks with tin patches, jb*/jc* rusty corrugated iron, jd* a wall assembled
// from sheets and criss-crossed planks, posts and palisade are planks), brown earth, cement tiles and carpets by the entrances following the
// original's tiles, rusty corrugated roofs following the roof layer, doorless openings are open, doors are plank.
// Wall letters are not among the converter's exit letters (X, Y, Z, W, U, T, Q, P, N, M, K, J, H, G, F, E).
import type { LevelConfig } from '../map-to-level.ts';

export const JUNKTOWN_LOOK: Partial<LevelConfig> = {
  wallTexture: 'junkSheet',
  walls: { '#': 'junkSheet', A: 'junkPlanks', C: 'junkBraced', S: 'plankWall' },
  wallArts: [
    [/^ja/i, 'A'],
    [/^jd/i, 'C'],
    [/^(cni|cnx|corn|fen)/i, 'S'],
  ],
  floor: 'wasteland',
  doorTexture: 'woodDoor',
  paint: true,
  roofs: 'junkRoof',
  doorways: true,
};
