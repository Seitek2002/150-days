// Brotherhood of Steel, level 1 (BROHD12, floor 0) → brotherhood-1.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'brotherhood-1',
  constName: 'BROTHERHOOD_1',
  title: { ru: 'Братство Стали, первый уровень', en: 'Brotherhood of Steel, level 1' },
  doc: 'Brotherhood of Steel bunker, level 1 (map BROHD12, elevation 0).',
  music: '04BRTHRH',
  // The bunker is retro-futuristic: enamel and chrome, mainframe cabinets, lamps (src/engine/retro-textures.ts).
  wallTexture: 'retroWall',
  // The rock behind the walls (the void around) is also visible in the bunker: steel.
  walls: { R: 'retroWall' },
  floor: 'retroFloor',
  ceiling: 'retroCeiling',
  doorTexture: 'retroDoor',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entrances: { 0: 'liftUp', 2: 'liftUp' },
  entries: {
    liftUp: { tile: 13910, facing: 'east' },
    lift: { tile: 17938, facing: 'south' },
    start: { tile: 20100, facing: 'south' },
  },
  // The elevators stand at the "lift" entry points (on the original's "elevator roof"; the floor lists are at the top of the levels file).
  elevators: { liftUp: { floors: 'SURFACE', current: 1 }, lift: { floors: 'LIFT', current: 0 } },
};

export default config;
