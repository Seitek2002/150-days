// The Hub, old town (HUBOLDTN, floor 0) → hub-oldtown.
import type { LevelConfig } from '../map-to-level.ts';
import { HUB_LOOK } from './hub-look.ts';

const config: LevelConfig = {
  id: 'hub-oldtown',
  constName: 'HUB_OLDTOWN',
  title: { ru: 'Хаб, старый город', en: 'Hub, old town' },
  doc: 'Hub old town (map HUBOLDTN): the way to downtown is in the southwest.',
  music: '01HUB',
  outdoor: true,
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...HUB_LOOK,
  // Open desert around the Hub (the original's edge blockers 0x02000158 would become a wall along the location edge).
  blockers: [0x02000043],
  skipItems: [0x94, 0x96],
  marks: {
    Y: "{ kind: 'exit', to: { map: 'hub-downtown', entry: 'fromOldTown' } }",
  },
  entrances: { 0: 'fromDowntown' },
  entries: {
    fromDowntown: { tile: 17528, facing: 'north' },
    fromUpstairs: { tile: 19278, facing: 'east' },
  },
  // Stairs to the second floor: press E at the end of the corridor (in the original they carry the THFU2D script).
  extraObjects: [(o) => `{ kind: 'exit', x: ${48.5 - o.ox}, y: ${40.5 - o.oy}, use: true, to: { map: 'hub-oldtown-2', entry: 'stairs' } },`],
};

export default config;
