// Boneyard, gun runners (LAGUNRUN, floor 0) → boneyard-gunrunners.
import type { LevelConfig } from '../map-to-level.ts';
import { BONEYARD_LOOK } from './boneyard-look.ts';

const config: LevelConfig = {
  id: 'boneyard-gunrunners',
  constName: 'BONEYARD_GUNRUNNERS',
  title: { ru: 'Свалка, торговцы оружием', en: 'Boneyard, gun runners' },
  doc: 'Gun runners in the Boneyard (map LAGUNRUN).',
  music: '10LABONE',
  outdoor: true,
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...BONEYARD_LOOK,
  // Open ground all around (the original's edge blockers 0x02000158 would become a wall along the location edge).
  blockers: [0x02000043],
  skipItems: [0x94, 0x96, 0x9a, 0x9c],
  marks: {
    Y: "{ kind: 'exit', to: { map: 'boneyard-rippers', entry: 't16267' } }",
    Z: "{ kind: 'exit', to: { map: 'boneyard-rippers', entry: 't14658' } }",
  },
  entrances: { 0: 't28699' },
  entries: {
    t25548: { tile: 25548, facing: 'south' },
    t28699: { tile: 28699, facing: 'south' },
  },
};

export default config;
