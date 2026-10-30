// The Master's lair, level 4 (MSTRLR34, floor 1) → master-4.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'master-4',
  constName: 'MASTER_4',
  title: { ru: 'Логово Мастера, четвёртый уровень', en: 'Master\'s lair, level 4' },
  doc: 'Lair level 4 (map MSTRLR34, elevation 1): an elevator.',
  music: '02MSTRLR',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entrances: { 3: 'lift' },
  entries: {
    lift: { tile: 15741, facing: 'south' },
  },
  // The lair elevator stands at the "lift" entry point (in the original's elevator shaft; the LIFT floor list is at the top of the levels file).
  elevators: { lift: { floors: 'LIFT', current: 3 } },
};

export default config;
