// Necropolis, Hall of the Dead, lower (HALLDED, floor 0) → necro-hall-low.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'necro-hall-low',
  constName: 'NECRO_HALL_LOW',
  title: { ru: 'Некрополис, Зал мёртвых, низ', en: 'Necropolis, Hall of the Dead, lower' },
  doc: 'Hall of the Dead lower level (map HALLDED, elevation 0): cellars and tunnels.',
  music: '14NECRO',
  wallTexture: 'brick',
  floor: 'dirt',
  ceiling: 'rockCeiling',
  fade: 10,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  marks: {
    Y: "{ kind: 'exit', to: { map: 'necro-water-low', entry: 't28877' } }",
    Z: "{ kind: 'exit', to: { map: 'necro-hotel-low', entry: 't10343' } }",
  },
  entrances: { 12: 't11103', 13: 't26341' },
  entries: {
    t11103: { tile: 11103, facing: 'south' },
    t15891: { tile: 15891, facing: 'south' },
    t26341: { tile: 26341, facing: 'south' },
    t27097: { tile: 27097, facing: 'south' },
  },
  extraObjects: [
    // Ladder or hatch (script NDWN2UP1 in the original): press E.
    (o) => `{ kind: 'exit', x: ${29.5 - o.ox}, y: ${31.5 - o.oy}, use: true, to: { map: 'necro-hall', entry: 't17074' } },`,
    // Ladder or hatch (script NDWN2UP2 in the original): press E.
    (o) => `{ kind: 'exit', x: ${57.5 - o.ox}, y: ${34.5 - o.oy}, use: true, to: { map: 'necro-hall', entry: 't28276' } },`,
  ],
};

export default config;
