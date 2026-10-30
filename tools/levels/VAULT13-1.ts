// Vault 13, level 2 (VAULT13, floor 1) → vault13-2.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'vault13-2',
  constName: 'VAULT13_2',
  title: { ru: 'Убежище 13, этаж 2', en: 'Vault 13, level 2' },
  doc: 'Floor 2 (the original\'s elevation 1): living quarters, rooms on both sides of the corridors, the elevator in the middle.',
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
  // Apartment bathrooms (client, 2026-10-24): in the original these are narrow rooms by the outer wall next to the bedroom; ours
  // merged into the wall, and the sinks and toilets did not fit. In each apartment we open two-by-two cells by the outer
  // wall and, where needed, a passage cell into the bedroom. Level cells; draft = level + (10, 13).
  patches: [
    [2, 3], [3, 3], [2, 4], [3, 4], [3, 5],
    [2, 9], [3, 9], [2, 10], [3, 10],
    [2, 15], [3, 15], [2, 16], [3, 16],
    [2, 21], [3, 21], [2, 22], [3, 22], [3, 23],
    [24, 3], [25, 3], [26, 3], [24, 4], [25, 4], [26, 4],
    [24, 9], [25, 9], [24, 10], [25, 10], [24, 11],
    [24, 15], [25, 15], [24, 16], [25, 16],
    [24, 21], [25, 21], [24, 22], [25, 22],
  ].map(([x, y]) => [x! + 10, y! + 13, '.'] as [number, number, string]),
  entrances: { 2: 'elevator' },
  entries: { elevator: { tile: 22504, facing: 'east' } },
  elevators: { elevator: { floors: 'FLOORS', current: 1 } },
};

export default config;
