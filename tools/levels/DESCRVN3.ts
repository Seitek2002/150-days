// Caravan ambush (DESCRVN3, floor 0) → caravan-desert-3.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'caravan-desert-3',
  constName: 'CARAVAN_DESERT_3',
  title: { ru: 'Засада на караван (пустыня, 3)', en: 'Caravan ambush (desert, 3)' },
  doc: 'Caravan ambush (map DESCRVN3): the attackers and the caravan people are placed by the CARENCTR map script; after the fight the caravan driver takes you on. The edge exit leads to the wasteland.',
  music: '03WRLDMP',
  outdoor: true,
  wallTexture: 'rock',
  hull: true,
  // Map edges: the world map (X) and the ambush continuing on other floors of the map (Y); for us, an exit to the wasteland, to where the hero is.
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'middle' } }",
    Y: "{ kind: 'exit', to: { map: 'wasteland', entry: 'middle' } }",
  },
  // The caravan scripts use the entrance number only to pick the attackers; the hero always starts at the map's starting point.
  entrances: { 0: 'start', 1: 'start', 2: 'start', 3: 'start' },
  entries: { start: { tile: 20100, facing: 'north' } },
};

export default config;
