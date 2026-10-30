// The Master's lair, level 3 (MSTRLR34, floor 0) → master-3.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'master-3',
  constName: 'MASTER_3',
  title: { ru: 'Логово Мастера, третий уровень', en: 'Master\'s lair, level 3' },
  doc: 'Lair level 3 (map MSTRLR34, elevation 0): an elevator.',
  music: '02MSTRLR',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entrances: { 0: 't16912', 2: 't16912', 5: 'lift', 12: 't13655' },
  entries: {
    lift: { tile: 15741, facing: 'south' },
    // Starting cell for entrance #12: the MORPH script moves the hero here (load_map("mstrlr34.map", 12)).
    t13655: { tile: 13655, facing: 'south' },
    t16912: { tile: 16912, facing: 'south' },
  },
  // The lair elevator stands at the "lift" entry point (in the original's elevator shaft; the LIFT floor list is at the top of the levels file).
  elevators: { lift: { floors: 'LIFT', current: 2 } },
};

export default config;
