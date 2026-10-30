// Cathedral tower, third floor (CHILDRN2, floor 2) → cathedral-tower-3.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'cathedral-tower-3',
  constName: 'CATHEDRAL_TOWER_3',
  title: { ru: 'Башня собора, третий этаж', en: 'Cathedral tower, floor 3' },
  doc: 'Cathedral tower (map CHILDRN2, elevation 2).',
  music: '11CHILRN',
  wallTexture: 'plaster',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entrances: { 2: 't19294' },
  entries: {
    t19294: { tile: 19294, facing: 'south' },
  },
  // Stairs and hatches (used with E) must be reachable.
  reach: [[5, 4]],
  extraObjects: [
    // Ladder or hatch (script CTOWER2 in the original): press E.
    (o) => `{ kind: 'exit', x: ${5.5 - o.ox}, y: ${4.5 - o.oy}, use: true, to: { map: 'cathedral-tower-2', entry: 't19101' } },`,
  ],
};

export default config;
