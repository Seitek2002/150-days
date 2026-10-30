// Necropolis, Hall of the Dead (HALLDED, floor 1) → necro-hall.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'necro-hall',
  constName: 'NECRO_HALL',
  title: { ru: 'Некрополис, Зал мёртвых', en: 'Necropolis, Hall of the Dead' },
  doc: 'Necropolis, Hall of the Dead (map HALLDED, elevation 1): upper level, streets and an exit to the wasteland.',
  music: '14NECRO',
  outdoor: true,
  wallTexture: 'ruin',
  floor: 'asphalt',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'necropolis' } }",
  },
  entrances: { 0: 't20153', 2: 't20153' },
  entries: {
    t17074: { tile: 17074, facing: 'south' },
    t28276: { tile: 28276, facing: 'south' },
    t20153: { tile: 20153, facing: 'south' },
  },
  extraObjects: [
    // Ladder or hatch (script NUP2DWN1 in the original): press E.
    (o) => `{ kind: 'exit', x: ${28.5 - o.ox}, y: ${32.5 - o.oy}, use: true, to: { map: 'necro-hall-low', entry: 't15891' } },`,
    // Ladder or hatch (script NUP2DWN2 in the original): press E.
    (o) => `{ kind: 'exit', x: ${56.5 - o.ox}, y: ${33.5 - o.oy}, use: true, to: { map: 'necro-hall-low', entry: 't27097' } },`,
  ],
};

export default config;
