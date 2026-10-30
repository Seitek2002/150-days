// Vault 15, surface (VAULTENT, floor 0) → vault15-entrance.
// In the repository this level is built by hand (a small clearing with a shack, the frame is tied to the rope); with this config the converter
// produces the whole original map (the clearing's diamond with exit marks along the edge), so the comparison (`check.ts`) shows differences; they are expected (see README.md).
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'vault15-entrance',
  constName: 'VAULT15_ENTRANCE',
  title: { ru: 'Убежище 15, вход', en: 'Vault 15 entrance' },
  doc: 'Surface (map VAULTENT): a clearing with a ruined shack; in the shack, a rope down into the vault.',
  music: '13CARVRN',
  outdoor: true,
  hull: true,
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'vault15' } }",
  },
  // From the wasteland: in the north of the clearing, facing south; from the vault: by the shack (in the original a step ladder stands on it).
  entries: {
    wasteland: { cell: [25, 18], facing: 'south' },
    rope: { cell: [27, 36], facing: 'north' },
  },
  extraObjects: [(o) => `{ kind: 'exit', x: ${27.5 - o.ox}, y: ${33.5 - o.oy}, use: true, to: { map: 'vault15-1', entry: 'rope' } },`],
};

export default config;
