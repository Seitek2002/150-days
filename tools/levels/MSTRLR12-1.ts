// The Master's lair, level 2 (MSTRLR12, floor 1) → master-2.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'master-2',
  constName: 'MASTER_2',
  title: { ru: 'Логово Мастера, второй уровень', en: 'Master\'s lair, level 2' },
  doc: 'Lair level 2 (map MSTRLR12, elevation 1): an elevator.',
  music: '02MSTRLR',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entrances: { 1: 'lift' },
  entries: {
    lift: { tile: 19695, facing: 'south' },
  },
  // The lair elevator stands at the "lift" entry point (in the original's elevator shaft; the LIFT floor list is at the top of the levels file).
  elevators: { lift: { floors: 'LIFT', current: 1 } },
};

export default config;
