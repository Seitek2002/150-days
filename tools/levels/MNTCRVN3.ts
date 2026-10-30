// Caravan ambush (MNTCRVN3, floor 0) → caravan-mountain-3.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'caravan-mountain-3',
  constName: 'CARAVAN_MOUNTAIN_3',
  title: { ru: 'Засада на караван (горный перевал, 3)', en: 'Caravan ambush (mountain pass, 3)' },
  doc: 'Caravan ambush (map MNTCRVN3): the attackers and the caravan people are placed by the CARENCTR map script; after the fight the caravan driver takes you on. The edge exit leads to the wasteland.',
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
  entries: { start: { tile: 18688, facing: 'north' } },
};

export default config;
