// Shady Sands, east (SHADYE, floor 0) → shady-sands-e.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'shady-sands-e',
  constName: 'SHADY_SANDS_E',
  title: { ru: 'Шэйди Сэндс, восток', en: 'Shady Sands, east' },
  doc: 'East part: a fenced village with four houses, brahmin in a pen at the top, a well; the road to the southwest leads to the west part.',
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
  // Round house windows (wall piece adb1011 is a wheel window); the eastern part has none, the setting is for re-conversion.
  windows: { art: /^adb1011/i, texture: 'adobeWindow' },
  revision: 1,
  noWeapon: ['CHILD'],
  crop: [9, 9, 61, 57],
  marks: {
    Y: "{ kind: 'exit', to: { map: 'shady-sands-w', entry: 'fromEast' } }",
  },
  entries: { fromWest: { cell: [26, 50], facing: 'east' } },
};

export default config;
