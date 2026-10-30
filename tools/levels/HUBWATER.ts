// The Hub, water merchants (HUBWATER, floor 0) → hub-water.
import type { LevelConfig } from '../map-to-level.ts';
import { HUB_LOOK } from './hub-look.ts';

const config: LevelConfig = {
  id: 'hub-water',
  constName: 'HUB_WATER',
  title: { ru: 'Хаб, торговцы водой', en: 'Hub, water merchants' },
  doc: 'Water merchants in the Hub (map HUBWATER): the way to downtown is in the west.',
  music: '01HUB',
  outdoor: true,
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...HUB_LOOK,
  // Open desert around the Hub (the original's edge blockers 0x02000158 would become a wall along the location edge).
  blockers: [0x02000043],
  skipItems: [0x94, 0x96],
  marks: {
    Y: "{ kind: 'exit', to: { map: 'hub-downtown', entry: 'fromWater' } }",
  },
  entrances: { 0: 'fromDowntown' },
  entries: {
    fromDowntown: { tile: 11672, facing: 'east' },
  },
};

export default config;
