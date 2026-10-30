// The Hub, old town, second floor (HUBOLDTN, floor 1) → hub-oldtown-2.
import type { LevelConfig } from '../map-to-level.ts';
import { HUB_LOOK } from './hub-look.ts';

const config: LevelConfig = {
  id: 'hub-oldtown-2',
  constName: 'HUB_OLDTOWN_2',
  title: { ru: 'Хаб, старый город, второй этаж', en: 'Hub, old town, upper floor' },
  doc: 'Hub old town, upper floor (map HUBOLDTN, elevation 1): the ladder down is at the western edge; a long room with critters and items.',
  music: '01HUB',
  outdoor: true,
  ...HUB_LOOK,
  // The room on the second floor is fully under a roof (the original has no roof layer above it).
  roofAll: true,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entries: {
    stairs: { tile: 17279, facing: 'east' },
  },
  // Stairs down: press E in the cell with the steps (in the original it carries the THFD2U script).
  extraObjects: [(o) => `{ kind: 'exit', x: ${6.5 - o.ox}, y: ${21.5 - o.oy}, use: true, to: { map: 'hub-oldtown', entry: 'fromUpstairs' } },`],
};

export default config;
