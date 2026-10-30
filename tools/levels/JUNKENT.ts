// Junktown, entrance (JUNKENT, floor 0) → junktown-ent.
import type { LevelConfig } from '../map-to-level.ts';
import { JUNKTOWN_LOOK } from './junktown-look.ts';

const config: LevelConfig = {
  id: 'junktown-ent',
  constName: 'JUNKTOWN_ENT',
  title: { ru: 'Джанктаун, вход', en: 'Junktown, entrance' },
  doc: 'Town entrance (map JUNKENT): from the east, the road from the wasteland; to the west, the way to the centre; a ladder in one of the houses leads to the upper room.',
  music: '12JUNKTN',
  outdoor: true,
  ...JUNKTOWN_LOOK,
  blockers: [0x02000043, 0x02000158],
  crop: [1, 1, 73, 53],
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'junktown' } }",
    Y: "{ kind: 'exit', to: { map: 'junktown-center', entry: 'fromEnt' } }",
  },
  entrances: { 0: 'wasteland', 3: 'wasteland', 5: 't23103', 6: 't18261' },
  entries: {
    wasteland: { cell: [55, 41], facing: 'west' },
    fromCenter: { cell: [16, 24], facing: 'east' },
    ladder: { cell: [20, 37], facing: 'west' },
    t23103: { tile: 23103, facing: 'south' },
    t18261: { tile: 18261, facing: 'south' },
  },
  // Stairs to the upper room: press E on the steps (in the original they carry the JTUP2DN script).
  extraObjects: [(o) => `{ kind: 'exit', x: ${19.5 - o.ox}, y: ${37.5 - o.oy}, use: true, to: { map: 'junktown-ent-2', entry: 'ladder' } },`],
};

export default config;
