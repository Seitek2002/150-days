// Junktown, casino (JUNKCSNO, floor 0) → junktown-casino.
import type { LevelConfig } from '../map-to-level.ts';
import { JUNKTOWN_LOOK } from './junktown-look.ts';

const config: LevelConfig = {
  id: 'junktown-casino',
  constName: 'JUNKTOWN_CASINO',
  title: { ru: 'Джанктаун, казино', en: 'Junktown, casino' },
  doc: 'The casino and the west part of town (map JUNKCSNO): gambling halls, townsfolk\'s houses; to the west, an exit to the wasteland; to the east, the way to the centre.',
  music: '12JUNKTN',
  outdoor: true,
  ...JUNKTOWN_LOOK,
  blockers: [0x02000043, 0x02000158],
  // The original's invisible stops around the casino sign's base would become a rusty box in the middle of the street: that is floor, and the base
  // and the sign are placed by the game (gizbase as a picture with a stop, the sign as scenery with a script).
  fills: [[55, 45, 56, 47, '.']],
  crop: [1, 1, 76, 64],
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'junktown' } }",
    Y: "{ kind: 'exit', to: { map: 'junktown-center', entry: 'fromCasino' } }",
  },
  entrances: { 1: 't18899', 4: 't17520', 7: 't18899' },
  entries: {
    wasteland: { cell: [16, 35], facing: 'east' },
    fromCenter: { cell: [58, 47], facing: 'west' },
    t18899: { tile: 18899, facing: 'south' },
    t17520: { tile: 17520, facing: 'south' },
  },
};

export default config;
