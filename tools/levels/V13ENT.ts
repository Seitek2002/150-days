// Vault 13 cave (V13ENT, floor 0) → cave. A new game starts here.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'cave',
  constName: 'CAVE',
  title: { ru: 'Пещера у Убежища 13', en: 'Vault 13 cave' },
  doc: 'The cave at the Vault 13 entrance (map V13ENT): the vault door to the west, halls with rats, a long passage outside to the south.',
  comment: [
    'The vault door is our round one (two wall cells D/E at the end of the corridor, E on it leads into the vault); the corridor behind the door (inside the vault) is rock.',
    'From the cave the door is seen from the east: the wall texture runs south to north, so the northern cell gets the right half and the southern one the left half.',
  ],
  music: '06VAULT',
  // Like the cave by Vault 15 (client, 2026-10-25): blue-black wet rock.
  wallTexture: 'caveWall',
  floor: 'caveFloor',
  ceiling: 'caveCeiling',
  fade: 10,
  blockers: [0x02000043, 0x02000158],
  // Only rats in the cave: all are enemies.
  people: 'critter',
  walls: { R: 'caveWall', D: 'vaultDoorR', E: 'vaultDoorL' },
  fills: [
    // The corridor behind the vault door (the vault side) is rock.
    [0, 24, 8, 32, 'R'],
  ],
  patches: [
    // The door at the end of the corridor and the passage to it (in the original the big door's frame blocks it).
    [9, 27, 'D'],
    [9, 28, 'E'],
    [9, 29, 'R'],
    [10, 27, '.'],
    [10, 28, '.'],
    [11, 27, '.'],
    [11, 28, '.'],
  ],
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'vault13' } }",
  },
  entries: {
    // New game: by the vault door, back to it.
    start: { cell: [11, 28], facing: 'east' },
    // From the vault: the same spot.
    vault: { cell: [11, 27], facing: 'east' },
    // From the wasteland: by the exit in the south, facing into the cave.
    outside: { cell: [33, 59], facing: 'north' },
  },
  extraObjects: [
    // Vault door: E enters the vault.
    (o) => `{ kind: 'exit', x: ${9.5 - o.ox}, y: ${27.5 - o.oy}, use: true, to: { map: 'vault13-1', entry: 'cave' } },`,
    (o) => `{ kind: 'exit', x: ${9.5 - o.ox}, y: ${28.5 - o.oy}, use: true, to: { map: 'vault13-1', entry: 'cave' } },`,
  ],
};

export default config;
