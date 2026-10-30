// Boneyard, Followers, second floor (LAFOLLWR, floor 1) → boneyard-followers-2.
import type { LevelConfig } from '../map-to-level.ts';
import { BONEYARD_INDOOR } from './boneyard-look.ts';

const config: LevelConfig = {
  id: 'boneyard-followers-2',
  constName: 'BONEYARD_FOLLOWERS_2',
  // Previously named "second floor", but this floor of the original map holds the Followers' underground library.
  title: { ru: 'Свалка, библиотека Последователей', en: 'Boneyard, Followers library' },
  doc: 'The Followers of the Apocalypse underground library (map LAFOLLWR, elevation 1): a hall with shelves and tables, rooms; a ladder up.',
  music: '16FOLLOW',
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...BONEYARD_INDOOR,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96, 0x9a, 0x9c],
  entries: {
    t15072: { tile: 15072, facing: 'south' },
  },
  // Stairs and hatches (used with E) must be reachable.
  reach: [[8, 10]],
  extraObjects: [
    // Ladder or hatch (script FOLDN2UP in the original): press E.
    (o) => `{ kind: 'exit', x: ${8.5 - o.ox}, y: ${10.5 - o.oy}, use: true, to: { map: 'boneyard-followers', entry: 't15268' } },`,
  ],
};

export default config;
