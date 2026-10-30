// Military Base, level 1 (MBSTRG12, floor 0) → mbase-1.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'mbase-1',
  constName: 'MBASE_1',
  title: { ru: 'Военная база, первый уровень', en: 'Military base, level 1' },
  doc: 'Base level 1, storage (map MBSTRG12, elevation 0): the entrance from the surface in the east, an elevator.',
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
  marks: {
    Y: "{ kind: 'exit', to: { map: 'mbase-ent', entry: 't21473' } }",
  },
  entrances: { 0: 'lift', 12: 'door' },
  entries: {
    door: { tile: 27092, facing: 'west' },
    lift: { tile: 14521, facing: 'south' },
  },
  // The elevator stands at the "lift" entry point (in the original's elevator shaft; the LIFT floor list is at the top of the levels file).
  elevators: { lift: { floors: 'LIFT', current: 0 } },
};

export default config;
