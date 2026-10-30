// Vault 15, upper level (VAULTBUR, floor 0) → vault15-1.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'vault15-1',
  constName: 'VAULT15_1',
  title: { ru: 'Убежище 15, верхний этаж', en: 'Vault 15, upper level' },
  doc: 'Upper floor (the original\'s elevation 0): on the left, the vault rooms; on the right, a cave with a rope up; rats in both parts.',
  comment: ['The frame is fitted to the original map objects (map frame, a margin of three hexes).'],
  music: '13CARVRN',
  // Ruined: the computers are smashed (client, 2026-10-24: "all monitors are broken"), rockfall boulders at the dead ends.
  ruined: true,
  rubble: true,
  // Abandoned vault (client, 2026-10-24): walls are rusty copper panels.
  wallTexture: 'vaultRust',
  floor: 'dirt',
  ceiling: 'rockCeiling',
  fade: 10,
  // Rats are hostile from the start: all creatures are critter.
  people: 'critter',
  // The left part is vault walls, the right part (from column 24) is cave rock.
  wallLetter: (x) => (x >= 24 ? 'R' : '#'),
  entrances: { 0: 'rope' },
  entries: { rope: { cell: [27, 30], facing: 'west' }, shaftW: { cell: [10, 22], facing: 'east' } },
  // Rope up (press E). Between floors are the original's shafts with their own scripts (BVELV…), no elevators.
  extraObjects: [(o) => `{ kind: 'exit', x: ${26.5 - o.ox}, y: ${30.5 - o.oy}, use: true, to: { map: 'vault15-entrance', entry: 'rope' } },`],
};

export default config;
