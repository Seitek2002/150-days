// Necropolis, watershed, lower (WATRSHD, floor 0) → necro-water-low.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'necro-water-low',
  constName: 'NECRO_WATER_LOW',
  title: { ru: 'Некрополис, водосбор, низ', en: 'Necropolis, watershed, lower' },
  doc: 'Watershed lower level (map WATRSHD, elevation 0): cellars and tunnels.',
  music: '14NECRO',
  wallTexture: 'brick',
  floor: 'dirt',
  ceiling: 'rockCeiling',
  fade: 10,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  marks: {
    Y: "{ kind: 'exit', to: { map: 'necro-hall-low', entry: 't11103' } }",
  },
  entrances: { 12: 't19653' },
  entries: {
    t16289: { tile: 16289, facing: 'south' },
    t19653: { tile: 19653, facing: 'south' },
    t19943: { tile: 19943, facing: 'south' },
    t20053: { tile: 20053, facing: 'south' },
    t24058: { tile: 24058, facing: 'south' },
    t28877: { tile: 28877, facing: 'south' },
  },
  extraObjects: [
    // Ladder or hatch (script NWDN2UP1 in the original): press E.
    (o) => `{ kind: 'exit', x: ${17.5 - o.ox}, y: ${31.5 - o.oy}, use: true, to: { map: 'necro-water', entry: 't17089' } },`,
    // Ladder or hatch (script WTRLADR in the original): press E.
    (o) => `{ kind: 'exit', x: ${25.5 - o.ox}, y: ${13.5 - o.oy}, use: true, to: { map: 'necro-water', entry: 't19057' } },`,
    // Ladder or hatch (script NWDN2UP2 in the original): press E.
    (o) => `{ kind: 'exit', x: ${26.5 - o.ox}, y: ${58.5 - o.oy}, use: true, to: { map: 'necro-water', entry: 't22531' } },`,
    // Ladder or hatch (script NWDN2UP3 in the original): press E.
    (o) => `{ kind: 'exit', x: ${37.5 - o.ox}, y: ${16.5 - o.oy}, use: true, to: { map: 'necro-water', entry: 't26857' } },`,
    // Ladder or hatch (script NECVHOLE in the original): press E.
    (o) => `{ kind: 'exit', x: ${28.5 - o.ox}, y: ${13.5 - o.oy}, use: true, to: { map: 'vault12-1', entry: 't26704' } },`,
  ],
};

export default config;
