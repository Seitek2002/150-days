// Junktown, centre (JUNKKILL, floor 0) → junktown-center.
import type { LevelConfig } from '../map-to-level.ts';
import { JUNKTOWN_LOOK } from './junktown-look.ts';

const config: LevelConfig = {
  id: 'junktown-center',
  constName: 'JUNKTOWN_CENTER',
  title: { ru: 'Джанктаун, центр', en: 'Junktown, centre' },
  doc: 'Town centre (map JUNKKILL): townsfolk\'s houses and shops, the road west to the casino, southeast to the entrance, east to the wasteland.',
  music: '12JUNKTN',
  outdoor: true,
  ...JUNKTOWN_LOOK,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x9a],
  crop: [1, 1, 78, 70],
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'junktown' } }",
    Y: "{ kind: 'exit', to: { map: 'junktown-casino', entry: 'fromCenter' } }",
    Z: "{ kind: 'exit', to: { map: 'junktown-ent', entry: 'fromCenter' } }",
  },
  entrances: { 0: 't22699' },
  entries: {
    wasteland: { cell: [66, 36], facing: 'west' },
    fromCasino: { cell: [25, 20], facing: 'east' },
    fromEnt: { cell: [57, 52], facing: 'north' },
    t22699: { tile: 22699, facing: 'south' },
  },
};

export default config;
