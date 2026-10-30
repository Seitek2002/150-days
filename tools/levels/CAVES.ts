// Scorpion cave (CAVES, floor 0) → shady-caves.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'shady-caves',
  constName: 'SHADY_CAVES',
  title: { ru: 'Пещера скорпионов', en: 'Radscorpion cave' },
  doc: 'The radscorpion cave near Shady Sands (map CAVES): Seth leads into it; exit to the wasteland.',
  music: '13CARVRN',
  // Rocks that ended up in our wall go along the walls (client, 2026-10-24: compared with the original).
  rubble: true,
  wallTexture: 'rock',
  floor: 'dirt',
  ceiling: 'rockCeiling',
  fade: 10,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  // Radscorpions are enemies (in the original they are on the cave's side); they keep the SSRADSCO script.
  hostile: ['SSRADSCO'],
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'shadySands' } }",
  },
  entrances: { 0: 't21356', 1: 't21356' },
  entries: {
    wasteland: { tile: 21554, facing: 'south' },
    // Starting cell for entrance #1: Seth leads the hero here (the SETH script calls load_map("caves.map", 1)).
    t21356: { tile: 21356, facing: 'south' },
  },
};

export default config;
