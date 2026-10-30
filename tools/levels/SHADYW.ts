// Shady Sands, west (SHADYW, floor 0) → shady-sands-w.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'shady-sands-w',
  constName: 'SHADY_SANDS_W',
  title: { ru: 'Шэйди Сэндс, запад', en: 'Shady Sands, west' },
  doc: 'West part: the houses of Aradesh, Tandi, Seth and other villagers, dogs, boys and girls; the gate to the west leads to the wasteland, the road to the northeast to the east part.',
  music: '15SHADY',
  outdoor: true,
  // As in the original (client, 2026-10-24): light adobe, wooden doors, brown earth, garden beds, flat roofs.
  wallTexture: 'adobeLight',
  doorTexture: 'woodDoor',
  floor: 'wasteland',
  paint: true,
  roofs: true,
  doorways: true,
  // Fence posts with a round top (wall pieces adw1000, adw1013, adw1016–1019) are slightly taller than the wall.
  posts: { art: /^adw(1000|1013|101[6-9])/i, texture: 'adobePost', height: 1.15 },
  // Round house windows (wall piece adb1011 is a wheel window).
  windows: { art: /^adb1011/i, texture: 'adobeWindow' },
  // Seth's yard gate (client, 2026-10-24): the original's fence has an arch (pieces adw1022–adw1025) with a passage under it; in
  // the original it is held only by invisible blockers at the sides. The fence line zigzags along the border of two of our cells,
  // the converter does not see the opening, so we open the arch cells by hand (draft cells: level = draft + 1).
  patches: [
    [19, 41, '.'],
    [20, 41, '.'],
    [19, 42, '.'],
    [20, 42, '.'],
  ],
  // Do not carve passages: a critter standing inside a wall (the peasant woman in Aradesh's house) steps out of it in the game itself (clearOfWalls).
  carve: false,
  revision: 1,
  keep: 'XY',
  // Children get no weapon in hand (rocks and air guns stay in their inventory).
  noWeapon: ['CHILD'],
  // Open ground around the village, as in the original (previously rock with a passage carved through the western wall):
  // from the west, from the X exit marks, the way into the village goes around, through the open northern side.
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'shadySands' } }",
    Y: "{ kind: 'exit', to: { map: 'shady-sands-e', entry: 'fromWest' } }",
  },
  entries: { wasteland: { cell: [13, 38], facing: 'east' }, fromEast: { cell: [36, 13], facing: 'south' } },
};

export default config;
