// Boneyard, Rippers (LARIPPER, floor 0) → boneyard-rippers.
import type { LevelConfig } from '../map-to-level.ts';
import { BONEYARD_LOOK } from './boneyard-look.ts';

const config: LevelConfig = {
  id: 'boneyard-rippers',
  constName: 'BONEYARD_RIPPERS',
  title: { ru: 'Свалка, Рипперы', en: 'Boneyard, Rippers' },
  doc: 'The Rippers\' lair (map LARIPPER, elevation 0).',
  music: '10LABONE',
  outdoor: true,
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...BONEYARD_LOOK,
  // Open ground all around (the original's edge blockers 0x02000158 would become a wall along the location edge).
  blockers: [0x02000043],
  skipItems: [0x94, 0x96, 0x9a, 0x9c],
  marks: {
    Y: "{ kind: 'exit', to: { map: 'boneyard-rippers-3', entry: 't29487' } }",
    Z: "{ kind: 'exit', to: { map: 'boneyard-gunrunners', entry: 't25548' } }",
    W: "{ kind: 'exit', to: { map: 'boneyard-blades', entry: 't18254' } }",
  },
  entrances: { 0: 'start' },
  entries: {
    start: { tile: 24503, facing: 'south' },
    t11302: { tile: 11302, facing: 'south' },
    t14277: { tile: 14277, facing: 'south' },
    t14658: { tile: 14658, facing: 'south' },
    t16267: { tile: 16267, facing: 'south' },
    t22117: { tile: 22117, facing: 'south' },
  },
  // Stairs and hatches (used with E) must be reachable.
  reach: [[16, 20]],
  extraObjects: [
    // Ladder or hatch (script RIPUP2DN in the original): press E.
    (o) => `{ kind: 'exit', x: ${16.5 - o.ox}, y: ${20.5 - o.oy}, use: true, to: { map: 'boneyard-rippers-2', entry: 't13883' } },`,
  ],
};

export default config;
