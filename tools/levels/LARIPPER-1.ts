// Boneyard, Rippers, second floor (LARIPPER, floor 1) → boneyard-rippers-2.
import type { LevelConfig } from '../map-to-level.ts';
import { BONEYARD_INDOOR } from './boneyard-look.ts';

const config: LevelConfig = {
  id: 'boneyard-rippers-2',
  constName: 'BONEYARD_RIPPERS_2',
  // Previously named "Rippers, second floor", but this floor of the original map holds the deathclaw mother's nest with eggs
  // (the gun runners' quest), in the Rippers' house, down the stairs.
  title: { ru: 'Свалка, гнездо когтя смерти', en: 'Boneyard, deathclaw nest' },
  doc: 'Deathclaw mother\'s nest (map LARIPPER, elevation 1): a storehouse with barrels and crates, the mother and eggs in the far room; a ladder up.',
  music: '10LABONE',
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...BONEYARD_INDOOR,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96, 0x9a, 0x9c],
  entries: {
    t13883: { tile: 13883, facing: 'south' },
  },
  // Stairs and hatches (used with E) must be reachable.
  reach: [[6, 11]],
  extraObjects: [
    // Ladder or hatch (script RIPDN2UP in the original): press E.
    (o) => `{ kind: 'exit', x: ${6.5 - o.ox}, y: ${11.5 - o.oy}, use: true, to: { map: 'boneyard-rippers', entry: 't14277' } },`,
  ],
};

export default config;
