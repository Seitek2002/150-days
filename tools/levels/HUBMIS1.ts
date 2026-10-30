// The Hub, mission (HUBMIS1, floor 0) → hub-mission. A small building in the middle of an empty diamond-shaped plain; exits to Hub downtown along the diamond's edge.
import type { LevelConfig } from '../map-to-level.ts';
import { HUB_LOOK } from './hub-look.ts';

const config: LevelConfig = {
  id: 'hub-mission',
  constName: 'HUB_MISSION',
  title: { ru: 'Хаб, задание', en: 'Hub, mission' },
  doc: 'Hub mission location (map HUBMIS1): a small building in the middle of an empty plain, with exits back to Hub downtown along the edge.',
  music: '01HUB',
  outdoor: true,
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...HUB_LOOK,
  // A rusty corrugated-iron shed in the middle of the plain (j* pieces) with a corrugated roof: not a Hub house.
  wallTexture: 'junkSheet',
  walls: { ...HUB_LOOK.walls, '#': 'junkSheet' },
  roofs: 'junkRoof',
  roofEdges: {},
  insideWall: undefined,
  // Open desert around the Hub (the original's edge blockers 0x02000158 would become a wall along the location edge).
  blockers: [0x02000043],
  // The plain around the building is flood-filled with floor from a point by its corner (it has no objects of its own).
  seeds: [[20, 36]],
  marks: {
    Y: "{ kind: 'exit', to: { map: 'hub-downtown', entry: 'fromMission' } }",
  },
  // Entry: the original map's starting cell (inside the building); a script moves the hero here, and the exits lead to Hub downtown.
  entrances: { 0: 't20322' },
  entries: { start: { tile: 21906, facing: 'south' }, t20322: { tile: 20322, facing: 'south' } },
};

export default config;
