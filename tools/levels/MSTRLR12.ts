// The Master's lair, level 1 (MSTRLR12, floor 0) → master-1.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'master-1',
  constName: 'MASTER_1',
  title: { ru: 'Логово Мастера, первый уровень', en: 'Master\'s lair, level 1' },
  doc: 'Lair level 1 (map MSTRLR12, elevation 0): a ladder up into the cathedral, an elevator.',
  music: '02MSTRLR',
  // Cave rocks that ended up in our wall go along the walls (client, 2026-10-24: compared with the original).
  rubble: true,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  entrances: { 0: 't21536', 4: 'lift' },
  entries: {
    // Starting cell for entrance #0 (this is where the original map puts a hero who came down the stairs from the cathedral).
    t21536: { tile: 21536, facing: 'south' },
    lift: { tile: 12099, facing: 'south' },
  },
  // The lair elevator stands at the "lift" entry point (in the original's elevator shaft; the LIFT floor list is at the top of the levels file).
  elevators: { lift: { floors: 'LIFT', current: 0 } },
  // Stairs and hatches (used with E) must be reachable.
  reach: [[34, 54]],
  extraObjects: [
    // Ladder or hatch (script MAS2CHID in the original): press E.
    (o) => `{ kind: 'exit', x: ${34.5 - o.ox}, y: ${54.5 - o.oy}, use: true, to: { map: 'cathedral-1', entry: 't12696' } },`,
  ],
};

export default config;
