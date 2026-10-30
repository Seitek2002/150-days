// Caravan ambush (MNTCRVN2, floor 0) → caravan-mountain-2.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'caravan-mountain-2',
  constName: 'CARAVAN_MOUNTAIN_2',
  title: { ru: 'Засада на караван (горный перевал, 2)', en: 'Caravan ambush (mountain pass, 2)' },
  doc: 'Caravan ambush (map MNTCRVN2): the attackers and the caravan people are placed by the CARENCTR map script; after the fight the caravan moves on: the edge exit leads to the Brotherhood of Steel.',
  music: '03WRLDMP',
  outdoor: true,
  wallTexture: 'rock',
  hull: true,
  // Map edges: the caravan travels on to the Brotherhood of Steel (in the original the ambush map number itself sets the destination, see CARENCTR);
  // the caravan master in the town pays. Half of the road is before the ambush, half after it (play.ts).
  marks: {
    X: "{ kind: 'exit', to: { map: 'brotherhood-ent', entry: 'wasteland' } }",
    Y: "{ kind: 'exit', to: { map: 'brotherhood-ent', entry: 'wasteland' } }",
  },
  // The caravan scripts use the entrance number only to pick the attackers; the hero always starts at the map's starting point.
  entrances: { 0: 'start', 1: 'start', 2: 'start', 3: 'start' },
  entries: { start: { tile: 18688, facing: 'north' } },
};

export default config;
