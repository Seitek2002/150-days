// Junktown, upper room (JUNKENT, floor 1) → junktown-ent-2.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'junktown-ent-2',
  constName: 'JUNKTOWN_ENT_2',
  title: { ru: 'Джанктаун, верхняя комната', en: 'Junktown, upper room' },
  doc: 'Upper room (map JUNKENT, elevation 1): one room with a critter and items; a ladder down.',
  music: '12JUNKTN',
  outdoor: true,
  wallTexture: 'scrap',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x95, 0x96, 0xa6, 0xa7],
  entries: { ladder: { cell: [7, 8], facing: 'west' } },
  extraObjects: [(o) => `{ kind: 'exit', x: ${4.5 - o.ox}, y: ${8.5 - o.oy}, use: true, to: { map: 'junktown-ent', entry: 'ladder' } },`],
};

export default config;
