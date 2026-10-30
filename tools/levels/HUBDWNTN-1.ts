// The Hub, downtown, second floor (HUBDWNTN, floor 1) → hub-downtown-2.
import type { LevelConfig } from '../map-to-level.ts';
import { HUB_LOOK } from './hub-look.ts';

const config: LevelConfig = {
  id: 'hub-downtown-2',
  constName: 'HUB_DOWNTOWN_2',
  title: { ru: 'Хаб, центр, второй этаж', en: 'Hub, downtown, upper floor' },
  doc: 'Hub downtown, upper floor (map HUBDWNTN, elevation 1): the ladder down is at the eastern edge; critters and items upstairs.',
  music: '01HUB',
  outdoor: true,
  ...HUB_LOOK,
  // The room on the second floor is fully under a roof (the original has no roof layer above it).
  roofAll: true,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entries: {
    stairs: { cell: [20, 16], facing: 'west' },
  },
  // Stairs down: press E in the cell with the steps (in the original it carries the HDTDN2UP script).
  extraObjects: [(o) => `{ kind: 'exit', x: ${19.5 - o.ox}, y: ${15.5 - o.oy}, use: true, to: { map: 'hub-downtown', entry: 'fromUpstairs' } },`],
};

export default config;
