// Boneyard, deathclaw lair (DETHCLAW, floor 0) → boneyard-deathclaw.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'boneyard-deathclaw',
  constName: 'BONEYARD_DEATHCLAW',
  title: { ru: 'Свалка, логово когтей смерти', en: 'Boneyard, deathclaw lair' },
  doc: 'Deathclaw lair (map DETHCLAW): a cave with an exit to the wasteland.',
  music: '10LABONE',
  // Cave rocks that ended up in our wall go along the walls (client, 2026-10-24: compared with the original).
  rubble: true,
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  // As in the original (client, 2026-10-25): a blue-black cave, like those by Vaults 13 and 15; brown earth by the exit.
  wallTexture: 'caveWall',
  walls: { R: 'caveWall' },
  floor: 'caveFloor',
  ceiling: 'caveCeiling',
  paint: true,
  fade: 10,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96, 0x9a, 0x9c],
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'boneyard' } }",
  },
  entrances: { 0: 'wasteland' },
  entries: {
    wasteland: { tile: 14129, facing: 'south' },
  },
};

export default config;
