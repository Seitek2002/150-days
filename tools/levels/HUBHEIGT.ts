// The Hub, heights (HUBHEIGT, floor 0) → hub-heights.
import type { LevelConfig } from '../map-to-level.ts';
import { HUB_LOOK } from './hub-look.ts';

const config: LevelConfig = {
  id: 'hub-heights',
  constName: 'HUB_HEIGHTS',
  title: { ru: 'Хаб, холмы', en: 'Hub, heights' },
  doc: 'Hub heights (map HUBHEIGT): the way to downtown is in the north.',
  music: '01HUB',
  outdoor: true,
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...HUB_LOOK,
  // Open desert around the Hub (the original's edge blockers 0x02000158 would become a wall along the location edge).
  blockers: [0x02000043],
  skipItems: [0x94, 0x96],
  marks: {
    Y: "{ kind: 'exit', to: { map: 'hub-downtown', entry: 'fromHeights' } }",
  },
  entrances: { 0: 't17694' },
  entries: {
    fromDowntown: { tile: 19485, facing: 'south' },
    t17694: { tile: 17694, facing: 'south' },
  },
};

export default config;
