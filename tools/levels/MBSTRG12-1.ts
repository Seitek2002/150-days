// Military Base, level 2 (MBSTRG12, floor 1) → mbase-2.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'mbase-2',
  constName: 'MBASE_2',
  title: { ru: 'Военная база, второй уровень', en: 'Military base, level 2' },
  doc: 'Base level 2, storage (map MBSTRG12, elevation 1): an elevator.',
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
  entrances: { 1: 'lift' },
  entries: {
    lift: { tile: 14521, facing: 'south' },
  },
  // The elevator stands at the "lift" entry point (in the original's elevator shaft; the LIFT floor list is at the top of the levels file).
  elevators: { lift: { floors: 'LIFT', current: 1 } },
};

export default config;
