// The Hub, downtown (HUBDWNTN, floor 0) → hub-downtown.
import type { LevelConfig } from '../map-to-level.ts';
import { HUB_LOOK } from './hub-look.ts';

const config: LevelConfig = {
  id: 'hub-downtown',
  constName: 'HUB_DOWNTOWN',
  title: { ru: 'Хаб, центр', en: 'Hub, downtown' },
  doc: 'Hub downtown (map HUBDWNTN): shops and houses in the middle, transitions at the cardinal points: west to the entrance, north to the old town, south to the heights, east to the water merchants.',
  music: '01HUB',
  outdoor: true,
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...HUB_LOOK,
  // Open desert around the Hub (the original's edge blockers 0x02000158 would become a wall along the location edge).
  blockers: [0x02000043],
  skipItems: [0x94, 0x96],
  marks: {
    Y: "{ kind: 'exit', to: { map: 'hub-ent', entry: 'fromDowntown' } }",
    Z: "{ kind: 'exit', to: { map: 'hub-oldtown', entry: 'fromDowntown' } }",
    W: "{ kind: 'exit', to: { map: 'hub-heights', entry: 'fromDowntown' } }",
    U: "{ kind: 'exit', to: { map: 'hub-water', entry: 'fromDowntown' } }",
  },
  entrances: { 3: 'fromEnt' },
  entries: {
    fromEnt: { tile: 12096, facing: 'east' },
    fromOldTown: { tile: 19648, facing: 'south' },
    fromHeights: { tile: 26931, facing: 'west' },
    fromWater: { tile: 29280, facing: 'west' },
    fromUpstairs: { tile: 25539, facing: 'south' },
    // From the mission location (HUBMIS1).
    fromMission: { tile: 28712, facing: 'north' },
  },
  // Stairs to the second floor: press E on the steps (in the original they carry the HDTUP2DN script).
  extraObjects: [(o) => `{ kind: 'exit', x: ${49.5 - o.ox}, y: ${61.5 - o.oy}, use: true, to: { map: 'hub-downtown-2', entry: 'stairs' } },`],
};

export default config;
