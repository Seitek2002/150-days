// Cathedral, hall (CHILDRN1, floor 1) → cathedral-1.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'cathedral-1',
  constName: 'CATHEDRAL_1',
  title: { ru: 'Собор, зал', en: 'Cathedral, hall' },
  doc: 'Cathedral hall and chambers (map CHILDRN1, elevation 1): doors to the courtyard, ladders to the tower and down into the Master\'s lair.',
  music: '11CHILRN',
  wallTexture: 'plaster',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  // The original's doors that move the hero to another floor become exits used with E.
  doorExits: {
    CHOCDOOR: { map: 'cathedral-ent', entry: 't19701' },
  },
  entrances: { 1: 't22499', 3: 't12696', 4: 't12685' },
  entries: {
    t12685: { tile: 12685, facing: 'south' },
    t12696: { tile: 12696, facing: 'south' },
    t22499: { tile: 22499, facing: 'south' },
    // The original map's point for entrance #1 (in the original the entrance number picks one of five map points).
    t22699: { tile: 22699, facing: 'south' },
  },
  // Stairs and hatches (used with E) must be reachable.
  reach: [[11, 29], [13, 17]],
  extraObjects: [
    // Ladder or hatch (script CHID2MAS in the original): press E.
    (o) => `{ kind: 'exit', x: ${11.5 - o.ox}, y: ${29.5 - o.oy}, use: true, to: { map: 'master-1', entry: 't21536' } },`,
    // Ladder or hatch (script CHID2TWR in the original): press E.
    (o) => `{ kind: 'exit', x: ${13.5 - o.ox}, y: ${17.5 - o.oy}, use: true, to: { map: 'cathedral-tower-1', entry: 't19101' } },`,
  ],
};

export default config;
