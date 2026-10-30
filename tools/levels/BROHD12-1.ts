// Brotherhood of Steel, level 2 (BROHD12, floor 1) → brotherhood-2.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'brotherhood-2',
  constName: 'BROTHERHOOD_2',
  title: { ru: 'Братство Стали, второй уровень', en: 'Brotherhood of Steel, level 2' },
  doc: 'Brotherhood of Steel bunker, level 2 (map BROHD12, elevation 1).',
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
  entrances: { 3: 'lift' },
  entries: {
    lift: { tile: 17934, facing: 'south' },
  },
  // The elevators stand at the "lift" entry points (on the original's "elevator roof"; the floor lists are at the top of the levels file).
  elevators: { lift: { floors: 'LIFT', current: 1 } },
};

export default config;
