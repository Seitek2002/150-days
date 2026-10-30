// Cathedral tower, first floor (CHILDRN2, floor 0) → cathedral-tower-1.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'cathedral-tower-1',
  constName: 'CATHEDRAL_TOWER_1',
  title: { ru: 'Башня собора, первый этаж', en: 'Cathedral tower, floor 1' },
  doc: 'Cathedral tower (map CHILDRN2, elevation 0): a ladder down to the hall, and one up.',
  music: '11CHILRN',
  wallTexture: 'plaster',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entrances: { 0: 't19101' },
  entries: {
    t19101: { tile: 19101, facing: 'south' },
  },
  // Stairs and hatches (used with E) must be reachable.
  reach: [[7, 7], [6, 5]],
  extraObjects: [
    // Ladder or hatch (script CTOWER2 in the original): press E.
    (o) => `{ kind: 'exit', x: ${7.5 - o.ox}, y: ${7.5 - o.oy}, use: true, to: { map: 'cathedral-tower-2', entry: 't19101' } },`,
    // Ladder or hatch (script TOW2CHID in the original): press E.
    (o) => `{ kind: 'exit', x: ${6.5 - o.ox}, y: ${5.5 - o.oy}, use: true, to: { map: 'cathedral-1', entry: 't12685' } },`,
  ],
};

export default config;
