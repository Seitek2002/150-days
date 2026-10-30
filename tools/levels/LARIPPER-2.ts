// Boneyard, Rippers, basement (LARIPPER, floor 2) → boneyard-rippers-3.
import type { LevelConfig } from '../map-to-level.ts';
import { BONEYARD_LOOK } from './boneyard-look.ts';

const config: LevelConfig = {
  id: 'boneyard-rippers-3',
  constName: 'BONEYARD_RIPPERS_3',
  // Previously named "Rippers, basement", but this floor of the original map holds the Regulators' yard and headquarters (deputies
  // Fry, Rutger, Tangler), under the open sky; you come out here from the edge of the Rippers' map.
  title: { ru: 'Свалка, Регуляторы', en: 'Boneyard, Regulators' },
  doc: 'Regulators\' headquarters in the Boneyard (map LARIPPER, elevation 2): a house with rooms, a road, cars; from the edge, to the Rippers.',
  music: '10LABONE',
  outdoor: true,
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...BONEYARD_LOOK,
  // Open ground all around (the original's edge blockers 0x02000158 would become a wall along the location edge).
  blockers: [0x02000043],
  skipItems: [0x94, 0x96, 0x9a, 0x9c],
  marks: {
    Y: "{ kind: 'exit', to: { map: 'boneyard-rippers', entry: 't11302' } }",
  },
  entries: {
    t29487: { tile: 29487, facing: 'south' },
  },
};

export default config;
