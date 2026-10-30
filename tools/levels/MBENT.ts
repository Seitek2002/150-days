// Military Base, entrance (MBENT, floor 0) → mbase-ent. Since 2026-10-25 the level is finished by hand (mountain, facade, fence, shack; see
// the comment on MBASE_ENT); re-converting with this config gives the old "all rock" layout (hand in check.ts).
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'mbase-ent',
  constName: 'MBASE_ENT',
  title: { ru: 'Военная база, вход', en: 'Military base, entrance' },
  doc: 'Military Base entrance (map MBENT): a mountain slope with a door into the base and an exit to the wasteland at the foot.',
  music: '08VATS',
  // Rocks that ended up in our wall go along the walls (client, 2026-10-24: compared with the original).
  rubble: true,
  outdoor: true,
  wallTexture: 'rock',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  hull: true,
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'militaryBase' } }",
  },
  entrances: { 0: 'wasteland', 1: 't21473' },
  entries: {
    // From the wasteland: the map's starting cell per the MBENT script (entrance #0).
    wasteland: { tile: 22333, facing: 'north' },
    t21473: { tile: 21473, facing: 'south' },
  },
  // The door on the slope (in the original the MBOUT2IN script calls load_map) is an "E" exit straight into the base's level 1.
  doorExits: { MBOUT2IN: { map: 'mbase-1', entry: 'door' } },
};

export default config;
