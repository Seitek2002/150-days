// Vault 15, lower level (VAULTBUR, floor 2) → vault15-3.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'vault15-3',
  constName: 'VAULT15_3',
  title: { ru: 'Убежище 15, нижний этаж', en: 'Vault 15, lower level' },
  doc: 'Lower floor (elevation 2): control rooms with computers, a storeroom; this is where most of the rats and molerats are.',
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
  crop: [9, 7, 31, 37],
  entrances: { 3: 'shaftE' },
  // Buried corridors to the Control Center (in the original, piles of rocks with the RUBCHIP script): the dead ends of the east hall and
  // the north corridor are a "K" rubble pile across the whole passage.
  walls: { K: 'rubble' },
  patches: [
    [28, 12, 'K'],
    [29, 12, 'K'],
    [18, 7, 'K'],
    [19, 7, 'K'],
  ],
  entries: { shaftE: { cell: [12, 19], facing: 'east' } },
  // Up: by the rope in the shaft (BVELV3 script), no elevator.
};

export default config;
