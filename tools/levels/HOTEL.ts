// Necropolis, hotel, lower (HOTEL, floor 0) → necro-hotel-low.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'necro-hotel-low',
  constName: 'NECRO_HOTEL_LOW',
  title: { ru: 'Некрополис, гостиница, низ', en: 'Necropolis, hotel, lower' },
  doc: 'Hotel lower level (map HOTEL, elevation 0): cellars and tunnels under the town.',
  music: '14NECRO',
  wallTexture: 'brick',
  floor: 'dirt',
  ceiling: 'rockCeiling',
  fade: 10,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  marks: {
    Y: "{ kind: 'exit', to: { map: 'necro-hall-low', entry: 't26341' } }",
  },
  entrances: { 12: 't12943' },
  entries: {
    t10343: { tile: 10343, facing: 'south' },
    t15499: { tile: 15499, facing: 'south' },
    t19139: { tile: 19139, facing: 'south' },
    t22698: { tile: 22698, facing: 'south' },
    t12943: { tile: 12943, facing: 'south' },
  },
  extraObjects: [
    // Ladder or hatch (script NHDN2UP1 in the original): press E.
    (o) => `{ kind: 'exit', x: ${24.5 - o.ox}, y: ${24.5 - o.oy}, use: true, to: { map: 'necro-hotel', entry: 't16307' } },`,
    // Ladder or hatch (script NHDN2UP2 in the original): press E.
    (o) => `{ kind: 'exit', x: ${33.5 - o.ox}, y: ${44.5 - o.oy}, use: true, to: { map: 'necro-hotel', entry: 't19146' } },`,
    // Ladder or hatch (script NHDN2UP3 in the original): press E.
    (o) => `{ kind: 'exit', x: ${42.5 - o.ox}, y: ${24.5 - o.oy}, use: true, to: { map: 'necro-hotel', entry: 't22298' } },`,
  ],
};

export default config;
