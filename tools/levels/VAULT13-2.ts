// Vault 13, level 3 (VAULT13, floor 2) → vault13-3.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'vault13-3',
  constName: 'VAULT13_3',
  title: { ru: 'Убежище 13, этаж 3', en: 'Vault 13, level 3' },
  doc: 'Floor 3 (the original\'s elevation 2): the Overseer\'s office and control console, water purification, library, armory, a large hall and bedrooms.',
  music: '06VAULT',
  // Re-converted from the original map on 2026-10-24: saves from the old layout forget the floor's state.
  revision: 1,
  // Chrome and retro-futurism (client, 2026-10-24), as on the first floor.
  wallTexture: 'chromeWall',
  floor: 'chromeFloor',
  ceiling: 'chromeCeiling',
  doorTexture: 'chromeDoor',
  doorLooks: { grayDoor: 'chromeDoor' },
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  // In the original the Overseer carries the minigun in his inventory, not in his hands.
  noWeapon: ['OVER'],
  entrances: { 3: 'elevator' },
  entries: { elevator: { cell: [16, 37], facing: 'east' } },
  elevators: { elevator: { floors: 'FLOORS', current: 2 } },
};

export default config;
