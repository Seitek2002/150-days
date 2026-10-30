// Boneyard, Blades (LABLADES, floor 0) → boneyard-blades.
import type { LevelConfig } from '../map-to-level.ts';
import { BONEYARD_LOOK } from './boneyard-look.ts';

const config: LevelConfig = {
  id: 'boneyard-blades',
  constName: 'BONEYARD_BLADES',
  title: { ru: 'Свалка, Клинки', en: 'Boneyard, Blades' },
  doc: 'The Blades\' camp in the Boneyard (map LABLADES): exits to the wasteland, Adytum, the Rippers and the Followers.',
  music: '10LABONE',
  outdoor: true,
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...BONEYARD_LOOK,
  // Open ground all around (the original's edge blockers 0x02000158 would become a wall along the location edge).
  blockers: [0x02000043],
  skipItems: [0x94, 0x96, 0x9a, 0x9c],
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'boneyard' } }",
    Y: "{ kind: 'exit', to: { map: 'boneyard-rippers', entry: 't22117' } }",
    Z: "{ kind: 'exit', to: { map: 'boneyard-followers', entry: 't23680' } }",
    W: "{ kind: 'exit', to: { map: 'boneyard-adytum', entry: 't10500' } }",
  },
  entries: {
    t18254: { tile: 18254, facing: 'south' },
    t22145: { tile: 22145, facing: 'south' },
    t29304: { tile: 29304, facing: 'south' },
  },
};

export default config;
