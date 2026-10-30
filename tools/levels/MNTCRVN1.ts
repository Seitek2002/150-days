// Caravan ambush (MNTCRVN1, floor 0) → caravan-mountain-1.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'caravan-mountain-1',
  constName: 'CARAVAN_MOUNTAIN_1',
  title: { ru: 'Засада на караван (горный перевал, 1)', en: 'Caravan ambush (mountain pass, 1)' },
  doc: 'Caravan ambush (map MNTCRVN1): the attackers and the caravan people are placed by the CARENCTR map script; after the fight the caravan moves on: the edge exit leads to Junktown.',
  music: '03WRLDMP',
  outdoor: true,
  wallTexture: 'rock',
  hull: true,
  // Map edges: the caravan travels on to Junktown (in the original the ambush map number itself sets the destination, see CARENCTR);
  // the caravan master in the town pays. Half of the road is before the ambush, half after it (play.ts).
  marks: {
    X: "{ kind: 'exit', to: { map: 'junktown-ent', entry: 'wasteland' } }",
    Y: "{ kind: 'exit', to: { map: 'junktown-ent', entry: 'wasteland' } }",
  },
  // The caravan scripts use the entrance number only to pick the attackers; the hero always starts at the map's starting point.
  entrances: { 0: 'start', 1: 'start', 2: 'start', 3: 'start' },
  entries: { start: { tile: 18688, facing: 'north' } },
};

export default config;
