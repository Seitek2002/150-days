// The Glow, level 4 (GLOW2, floor 0) → glow-4.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'glow-4',
  constName: 'GLOW_4',
  title: { ru: 'Сияние, четвёртый уровень', en: 'The Glow, level 4' },
  doc: 'The Glow lab, level 4 (map GLOW2, elevation 0): the red and blue elevators.',
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
    red: { tile: 13886, facing: 'south' },
    blue: { tile: 13930, facing: 'south' },
    start: { tile: 20100, facing: 'south' },
  },
  // The elevators stand at the entry points (by the original's elevator doors; the floor lists are at the top of the levels file).
  elevators: { red: { floors: 'RED', current: 1 }, blue: { floors: 'BLUE', current: 0 } },
};

export default config;
