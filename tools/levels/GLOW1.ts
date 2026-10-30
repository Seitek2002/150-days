// The Glow, level 1 (GLOW1, floor 0) → glow-1.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'glow-1',
  constName: 'GLOW_1',
  title: { ru: 'Сияние, первый уровень', en: 'The Glow, level 1' },
  doc: 'The Glow lab, level 1 (map GLOW1, elevation 0): the entrance from the surface, the yellow elevator.',
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
  entrances: { 0: 't13117', 1: 't13117' },
  entries: {
    yellow: { tile: 22326, facing: 'south' },
    t13117: { tile: 13117, facing: 'south' },
  },
  extraObjects: [
    // Ladder or hatch (script GLV12ENT in the original): press E.
    (o) => `{ kind: 'exit', x: ${11.5 - o.ox}, y: ${31.5 - o.oy}, use: true, to: { map: 'glow-ent', entry: 't21316' } },`,
  ],
  // The elevators stand at the entry points (by the original's elevator doors; the floor lists are at the top of the levels file).
  elevators: { yellow: { floors: 'YELLOW', current: 0 } },
};

export default config;
