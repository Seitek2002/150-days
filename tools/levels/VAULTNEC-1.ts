// Vault 12, middle level (VAULTNEC, floor 1) → vault12-2.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'vault12-2',
  constName: 'VAULT12_2',
  title: { ru: 'Убежище 12, средний этаж', en: 'Vault 12, middle level' },
  doc: 'Vault 12 (map VAULTNEC, elevation 1): middle floor.',
  music: '14NECRO',
  // Layout re-converted (2026-10-26): saves from the old layout forget this location's state.
  revision: 1,
  // As in the original (client, 2026-10-25): an abandoned vault with brown concrete wall slabs (the same dv* pieces as in
  // the Glow), brown tiles and floor gratings, cave tunnels are cave rock; previously grey metal panels.
  wallTexture: 'glowPanel',
  // The original's rock (ca* pieces) is only behind the vault walls here; for us it is inside the thick wall, no separate letter needed.
  floor: 'glowTile',
  ceiling: 'glowCeiling',
  paint: true,
  // Rooms behind doors and doorless openings that hold only furniture (bedrooms with washrooms) are floor, not rock; the original's
  // invisible walls around the beds and toilets are not walls (the game places the furniture as blocks).
  doorSeeds: true,
  doorways: true,
  dropInvisibleWalls: true,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entrances: { 2: 'lift' },
  entries: {
    lift: { cell: [28, 23], facing: 'east' },
  },
  extraObjects: [
    // Vault elevator: three floors (LIFT is the floor list at the top of the levels file); the original's elevator door is one cell to the left.
    (o) => `{ kind: 'elevator', x: ${27.5 - o.ox}, y: ${23.5 - o.oy}, floors: LIFT, current: 1 },`,
  ],
};

export default config;
