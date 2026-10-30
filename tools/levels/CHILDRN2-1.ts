// Cathedral tower, second floor (CHILDRN2, floor 1) → cathedral-tower-2.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'cathedral-tower-2',
  constName: 'CATHEDRAL_TOWER_2',
  title: { ru: 'Башня собора, второй этаж', en: 'Cathedral tower, floor 2' },
  doc: 'Cathedral tower (map CHILDRN2, elevation 1).',
  music: '11CHILRN',
  wallTexture: 'plaster',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entrances: { 1: 't19101' },
  entries: {
    t19101: { tile: 19101, facing: 'south' },
  },
  // Stairs and hatches (used with E) must be reachable.
  reach: [[6, 5], [6, 6]],
  extraObjects: [
    // Ladder or hatch (script CTOWER1 in the original): press E.
    (o) => `{ kind: 'exit', x: ${6.5 - o.ox}, y: ${5.5 - o.oy}, use: true, to: { map: 'cathedral-tower-1', entry: 't19101' } },`,
    // Ladder or hatch (script CTOWER3 in the original): press E.
    (o) => `{ kind: 'exit', x: ${6.5 - o.ox}, y: ${6.5 - o.oy}, use: true, to: { map: 'cathedral-tower-3', entry: 't19294' } },`,
  ],
};

export default config;
