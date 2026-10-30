// The Glow, level 5 (GLOW2, floor 1) → glow-5.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'glow-5',
  constName: 'GLOW_5',
  title: { ru: 'Сияние, пятый уровень', en: 'The Glow, level 5' },
  doc: 'The Glow lab, level 5 (map GLOW2, elevation 1): the blue elevator.',
  music: '09GLOW',
  // A ruined location: the computers are broken.
  ruined: true,
  // Layout re-converted (2026-10-26): saves from the old layout forget this location's state.
  revision: 1,
  // As in the original (client, 2026-10-25): pinkish-brown concrete wall slabs, brown tiles and rusty floor grating,
  // brown doors (previously grey concrete panels and grey tiles).
  wallTexture: 'glowPanel',
  floor: 'glowTile',
  ceiling: 'glowCeiling',
  paint: true,
  // Rooms behind doors that hold only furniture (the lab with tanks) are floor, not rock (they used to disappear).
  doorSeeds: true,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entries: {
    blue: { tile: 13930, facing: 'south' },
  },
  // The elevators stand at the entry points (by the original's elevator doors; the floor lists are at the top of the levels file).
  elevators: { blue: { floors: 'BLUE', current: 1 } },
};

export default config;
