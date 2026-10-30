// Brotherhood of Steel, level 4 (BROHD34, floor 1) → brotherhood-4.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'brotherhood-4',
  constName: 'BROTHERHOOD_4',
  title: { ru: 'Братство Стали, четвёртый уровень', en: 'Brotherhood of Steel, level 4' },
  doc: 'Brotherhood of Steel bunker, level 4 (map BROHD34, elevation 1).',
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
  entrances: { 5: 'lift' },
  entries: {
    lift: { tile: 20338, facing: 'south' },
  },
  // The elevators stand at the "lift" entry points (on the original's "elevator roof"; the floor lists are at the top of the levels file).
  elevators: { lift: { floors: 'LIFT', current: 3 } },
};

export default config;
