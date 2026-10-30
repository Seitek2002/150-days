// Vault 12, upper level (VAULTNEC, floor 0) → vault12-1.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'vault12-1',
  constName: 'VAULT12_1',
  title: { ru: 'Убежище 12, верхний этаж', en: 'Vault 12, upper level' },
  doc: 'Vault 12 (map VAULTNEC, elevation 0): upper floor.',
  music: '14NECRO',
  // Layout re-converted (2026-10-26): saves from the old layout forget this location's state.
  revision: 1,
  // As in the original (client, 2026-10-25): an abandoned vault with brown concrete wall slabs (the same dv* pieces as in
  // the Glow), brown tiles and floor gratings, cave tunnels are cave rock; previously grey metal panels.
  wallTexture: 'glowPanel',
  walls: { '#': 'glowPanel', C: 'caveWall' },
  wallArts: [[/^ca\d/i, 'C']],
  floor: 'glowTile',
  ceiling: 'glowCeiling',
  paint: true,
  // Rooms behind doors and doorless openings that hold only furniture are floor, not rock. The original's invisible walls here
  // hold the vault's boundary with the cave, so we leave them alone.
  doorSeeds: true,
  doorways: true,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entrances: { 0: 't26704', 1: 'lift', 12: 't26704' },
  entries: {
    lift: { cell: [13, 31], facing: 'east' },
    t26704: { tile: 26704, facing: 'south' },
  },
  extraObjects: [
    // Vault elevator: three floors (LIFT is the floor list at the top of the levels file); the original's elevator door is one cell to the left.
    (o) => `{ kind: 'elevator', x: ${12.5 - o.ox}, y: ${31.5 - o.oy}, floors: LIFT, current: 0 },`,
    // Ladder or hatch (script NECVLADR in the original): press E.
    (o) => `{ kind: 'exit', x: ${44.5 - o.ox}, y: ${31.5 - o.oy}, use: true, to: { map: 'necro-water-low', entry: 't20053' } },`,
  ],
};

export default config;
