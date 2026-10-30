// Vault 15, middle level (VAULTBUR, floor 1) → vault15-2.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'vault15-2',
  constName: 'VAULT15_2',
  title: { ru: 'Убежище 15, средний этаж', en: 'Vault 15, middle level' },
  doc: 'Middle floor (elevation 1): a long corridor with rooms on both sides, two elevator shafts, west and east.',
  music: '13CARVRN',
  // Ruined: the computers are smashed (client, 2026-10-24: "all monitors are broken"), rockfall boulders at the dead ends.
  ruined: true,
  rubble: true,
  // Abandoned vault (client, 2026-10-24): walls are rusty copper panels.
  wallTexture: 'vaultRust',
  // Abandoned (client, 2026-10-24): rust-streaked floor, rusty ceiling, some panels torn off.
  floor: 'rustFloor',
  ceiling: 'rustCeiling',
  people: 'critter',
  entrances: { 2: 'shaftE' },
  entries: {
    shaftW: { cell: [15, 26], facing: 'east' },
    shaftE: { cell: [15, 18], facing: 'east' },
  },
  // Between floors are the original's shafts with their own scripts (BVELV…), no elevators.
};

export default config;
