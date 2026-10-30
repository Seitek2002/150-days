// Boneyard, Followers (LAFOLLWR, floor 0) → boneyard-followers.
import type { LevelConfig } from '../map-to-level.ts';
import { BONEYARD_LOOK } from './boneyard-look.ts';

const config: LevelConfig = {
  id: 'boneyard-followers',
  constName: 'BONEYARD_FOLLOWERS',
  title: { ru: 'Свалка, Последователи', en: 'Boneyard, Followers' },
  doc: 'Followers of the Apocalypse in the Boneyard (map LAFOLLWR, elevation 0).',
  music: '16FOLLOW',
  outdoor: true,
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...BONEYARD_LOOK,
  // Open ground all around (the original's edge blockers 0x02000158 would become a wall along the location edge).
  blockers: [0x02000043],
  skipItems: [0x94, 0x96, 0x9a, 0x9c],
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'boneyard' } }",
    Y: "{ kind: 'exit', to: { map: 'boneyard-blades', entry: 't22145' } }",
  },
  entrances: { 0: 'wasteland' },
  entries: {
    wasteland: { tile: 22882, facing: 'south' },
    t15268: { tile: 15268, facing: 'south' },
    t23680: { tile: 23680, facing: 'south' },
  },
  // Stairs and hatches (used with E) must be reachable.
  reach: [[18, 12]],
  extraObjects: [
    // Ladder or hatch (script FOLUP2DN in the original): press E.
    (o) => `{ kind: 'exit', x: ${18.5 - o.ox}, y: ${12.5 - o.oy}, use: true, to: { map: 'boneyard-followers-2', entry: 't15072' } },`,
  ],
};

export default config;
