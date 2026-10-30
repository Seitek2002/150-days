// The Glow, surface (GLOWENT, floor 0) → glow-ent.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'glow-ent',
  constName: 'GLOW_ENT',
  title: { ru: 'Сияние, поверхность', en: 'The Glow, surface' },
  doc: 'The Glow surface (map GLOWENT): wasteland around the entrance to the underground lab; exit to the wasteland along the edge.',
  music: '09GLOW',
  outdoor: true,
  wallTexture: 'ruin',
  // The "auto-invisibility" ring around the pit is not walls: our crater is there (craters in glow.ts, the level is finished by hand).
  blockers: [0x02000043],
  skipItems: [0x94, 0x96],
  hull: true,
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'glow' } }",
  },
  entrances: { 0: 'wasteland', 2: 't21316' },
  entries: {
    // From the wasteland: the map's starting cell per the GLOWENT script (entrance #0), facing the surface.
    wasteland: { tile: 26107, facing: 'west' },
    t21316: { tile: 21316, facing: 'south' },
  },
  // The way down is as in the original: a rope to the beam (scenery with the GENT2LV1 script), then E; there is no separate exit.
};

export default config;
