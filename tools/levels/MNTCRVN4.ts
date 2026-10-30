// Caravan ambush (MNTCRVN4, floor 0) → caravan-mountain-4.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'caravan-mountain-4',
  constName: 'CARAVAN_MOUNTAIN_4',
  title: { ru: 'Засада на караван (горный перевал, 4)', en: 'Caravan ambush (mountain pass, 4)' },
  doc: 'Caravan ambush (map MNTCRVN4): the attackers and the caravan people are placed by the CARENCTR map script; after the fight the caravan moves on: the edge exit leads to the Hub (the way back from the caravan driver in town, CARVLEAD).',
  music: '03WRLDMP',
  outdoor: true,
  wallTexture: 'rock',
  hull: true,
  // Map edges: the caravan travels on, back to the Hub (in the original the ambush map number itself sets the destination, see CARENCTR);
  // the caravan master in the Hub pays. Half of the road is before the ambush, half after it (play.ts).
  marks: {
    X: "{ kind: 'exit', to: { map: 'hub-ent', entry: 'wasteland' } }",
    Y: "{ kind: 'exit', to: { map: 'hub-ent', entry: 'wasteland' } }",
  },
  // The caravan scripts use the entrance number only to pick the attackers; the hero always starts at the map's starting point.
  entrances: { 0: 'start', 1: 'start', 2: 'start', 3: 'start' },
  entries: { start: { tile: 18688, facing: 'north' } },
};

export default config;
