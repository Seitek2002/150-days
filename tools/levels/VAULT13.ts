// Vault 13, level 1 (VAULT13, floor 0) → vault13-1.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'vault13-1',
  constName: 'VAULT13_1',
  title: { ru: 'Убежище 13, этаж 1', en: 'Vault 13, level 1' },
  doc: 'Floor 1 (the original\'s elevation 0): the vault door to the cave, living rooms and the medical bay, the elevator to the lower floors.',
  music: '06VAULT',
  // Re-converted from the original map on 2026-10-24 (previously a simplified hand-made layout): saves from the old layout
  // forget the floor's state.
  revision: 1,
  // The vault is lived in and well kept, all chrome and retro-futurism (client, 2026-10-24): polished panels, consoles,
  // a mirror floor, ceiling lights, chrome doors.
  wallTexture: 'chromeWall',
  floor: 'chromeFloor',
  ceiling: 'chromeCeiling',
  doorTexture: 'chromeDoor',
  doorLooks: { grayDoor: 'chromeDoor' },
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  // The exit grid by the vault door leads to the cave (V13ENT).
  marks: { Y: "{ kind: 'exit', to: { map: 'cave', entry: 'vault' } }" },
  entrances: { 0: 'cave', 1: 'elevator' },
  entries: {
    cave: { cell: [19, 19], facing: 'west' },
    elevator: { cell: [12, 23], facing: 'east' },
  },
  // The elevator is by its door (FLOORS is the floor list at the top of the levels file).
  elevators: { elevator: { floors: 'FLOORS', current: 0 } },
};

export default config;
