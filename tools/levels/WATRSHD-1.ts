// Necropolis, watershed (WATRSHD, floor 1) → necro-water.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'necro-water',
  constName: 'NECRO_WATER',
  title: { ru: 'Некрополис, водосбор', en: 'Necropolis, watershed' },
  doc: 'Necropolis, watershed (map WATRSHD, elevation 1): upper level, streets and an exit to the wasteland.',
  music: '14NECRO',
  outdoor: true,
  wallTexture: 'ruin',
  floor: 'asphalt',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'necropolis' } }",
  },
  entrances: { 0: 't14110', 1: 't14110' },
  entries: {
    t17089: { tile: 17089, facing: 'south' },
    t19057: { tile: 19057, facing: 'south' },
    t22531: { tile: 22531, facing: 'south' },
    t26857: { tile: 26857, facing: 'south' },
    t14110: { tile: 14110, facing: 'south' },
  },
  extraObjects: [
    // Ladder or hatch (script NWUP2DN2 in the original): press E.
    (o) => `{ kind: 'exit', x: ${29.5 - o.ox}, y: ${43.5 - o.oy}, use: true, to: { map: 'necro-water-low', entry: 't16289' } },`,
    // Ladder or hatch (script WTRHOLE in the original): press E.
    (o) => `{ kind: 'exit', x: ${33.5 - o.ox}, y: ${27.5 - o.oy}, use: true, to: { map: 'necro-water-low', entry: 't19653' } },`,
    // Ladder or hatch (script NWUP2DN1 in the original): press E.
    (o) => `{ kind: 'exit', x: ${43.5 - o.ox}, y: ${64.5 - o.oy}, use: true, to: { map: 'necro-water-low', entry: 't19943' } },`,
    // Ladder or hatch (script NWUP2DN3 in the original): press E.
    (o) => `{ kind: 'exit', x: ${53.5 - o.ox}, y: ${26.5 - o.oy}, use: true, to: { map: 'necro-water-low', entry: 't24058' } },`,
  ],
};

export default config;
