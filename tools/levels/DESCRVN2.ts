// Caravan ambush (DESCRVN2, floor 0) → caravan-desert-2.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'caravan-desert-2',
  constName: 'CARAVAN_DESERT_2',
  title: { ru: 'Засада на караван (пустыня, 2)', en: 'Caravan ambush (desert, 2)' },
  doc: 'Caravan ambush (map DESCRVN2): the attackers and the caravan people are placed by the CARENCTR map script; after the fight the caravan moves on: the edge exit leads to Necropolis.',
  music: '03WRLDMP',
  outdoor: true,
  wallTexture: 'rock',
  hull: true,
  // Map edges: the caravan travels on to the Necropolis (in the original the ambush map number itself sets the destination, see CARENCTR);
  // the caravan master in the town pays. Half of the road is before the ambush, half after it (play.ts).
  marks: {
    X: "{ kind: 'exit', to: { map: 'necro-hotel', entry: 'wasteland' } }",
    Y: "{ kind: 'exit', to: { map: 'necro-hotel', entry: 'wasteland' } }",
  },
  // The caravan scripts use the entrance number only to pick the attackers; the hero always starts at the map's starting point.
  entrances: { 0: 'start', 1: 'start', 2: 'start', 3: 'start' },
  entries: { start: { tile: 20100, facing: 'north' } },
};

export default config;
