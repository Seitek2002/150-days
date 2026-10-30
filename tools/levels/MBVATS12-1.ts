// Military Base, level 4 (MBVATS12, floor 1) → mbase-4.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'mbase-4',
  constName: 'MBASE_4',
  title: { ru: 'Военная база, четвёртый уровень', en: 'Military base, level 4' },
  doc: 'Base level 4, vats (map MBVATS12, elevation 1): an elevator.',
  music: '08VATS',
  // Layout re-converted (2026-10-26): saves from the old layout forget this location's state.
  revision: 1,
  // As in the original (client, 2026-10-25): light grey riveted steel sheets with cross braces, along the bottom
  // a yellow-and-black stripe; the floor is light ribbed plates (previously green army panels and grey tiles).
  wallTexture: 'baseWall',
  floor: 'baseFloor',
  paint: true,
  // Rooms behind doors and doorless openings that hold only furniture (barracks, washrooms, control rooms) are floor, not rock.
  doorSeeds: true,
  doorways: true,
  dropInvisibleWalls: true,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entrances: { 3: 'lift', 4: 't24492', 5: 't23271' },
  entries: {
    lift: { tile: 24121, facing: 'south' },
    t24492: { tile: 24492, facing: 'south' },
    t23271: { tile: 23271, facing: 'south' },
  },
  // The elevator stands at the "lift" entry point (in the original's elevator shaft; the LIFT floor list is at the top of the levels file).
  elevators: { lift: { floors: 'LIFT', current: 3 } },
};

export default config;
