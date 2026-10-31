// The Glow, level 3 (GLOW1, floor 2) → glow-3.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'glow-3',
  constName: 'GLOW_3',
  title: { ru: 'Сияние, третий уровень', en: 'The Glow, level 3' },
  doc: 'The Glow lab, level 3 (map GLOW1, elevation 2): the yellow and red elevators.',
  music: '09GLOW',
  // A ruined location: the computers are broken.
  ruined: true,
  // Layout re-converted (2026-10-26): saves from the old layout forget this location's state.
  revision: 1,
  // As in the original (client, 2026-10-25): pinkish-brown concrete wall slabs, brown tiles and rusty floor grating,
  // brown doors (previously grey concrete panels and grey tiles).
  wallTexture: 'glowLuxWall',
  floor: 'glowLuxFloor',
  ceiling: 'glowLuxCeiling',
  paint: true,
  // Rooms behind doors that hold only furniture (the lab with tanks) are floor, not rock (they used to disappear).
  doorSeeds: true,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entries: {
    yellow: { tile: 22326, facing: 'south' },
    red: { tile: 13886, facing: 'south' },
  },
  // The elevators stand at the entry points (by the original's elevator doors; the floor lists are at the top of the levels file).
  elevators: { yellow: { floors: 'YELLOW', current: 2 }, red: { floors: 'RED', current: 0 } },
};

export default config;
