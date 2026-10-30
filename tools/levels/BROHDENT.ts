// Brotherhood of Steel, entrance (BROHDENT, floor 0) → brotherhood-ent.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'brotherhood-ent',
  constName: 'BROTHERHOOD_ENT',
  title: { ru: 'Братство Стали, вход', en: 'Brotherhood of Steel, entrance' },
  doc: 'Brotherhood of Steel entrance (map BROHDENT): the surface around the bunker, the gate, an elevator down; exit to the wasteland along the edge.',
  music: '04BRTHRH',
  outdoor: true,
  wallTexture: 'concrete',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  hull: true,
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'brotherhood' } }",
  },
  entries: {
    lift: { tile: 19500, facing: 'south' },
    wasteland: { tile: 25103, facing: 'south' },
  },
  // The elevators stand at the "lift" entry points (on the original's "elevator roof"; the floor lists are at the top of the levels file).
  elevators: { lift: { floors: 'SURFACE', current: 0 } },
};

export default config;
