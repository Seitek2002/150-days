// The Hub, entrance (HUBENT, floor 0) → hub-ent.
import type { LevelConfig } from '../map-to-level.ts';
import { HUB_LOOK } from './hub-look.ts';

const config: LevelConfig = {
  id: 'hub-ent',
  constName: 'HUB_ENT',
  title: { ru: 'Хаб, вход', en: 'Hub, entrance' },
  doc: 'The Hub entrance (map HUBENT): to the west, the road from the wasteland and fenced farms; to the east, the way into downtown.',
  music: '01HUB',
  outdoor: true,
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...HUB_LOOK,
  // Open desert around the Hub (the original's edge blockers 0x02000158 would become a wall along the location edge).
  blockers: [0x02000043],
  skipItems: [0x94, 0x96],
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'hub' } }",
    Y: "{ kind: 'exit', to: { map: 'hub-downtown', entry: 'fromEnt' } }",
  },
  entrances: { 0: 'wasteland' },
  entries: {
    wasteland: { tile: 9907, facing: 'east' },
    fromDowntown: { tile: 29907, facing: 'west' },
  },
};

export default config;
