// Boneyard, Adytum (LAADYTUM, floor 0) → boneyard-adytum.
import type { LevelConfig } from '../map-to-level.ts';
import { BONEYARD_LOOK } from './boneyard-look.ts';

const config: LevelConfig = {
  id: 'boneyard-adytum',
  constName: 'BONEYARD_ADYTUM',
  title: { ru: 'Свалка, Адитум', en: 'Boneyard, Adytum' },
  doc: 'Adytum in the Boneyard (map LAADYTUM, elevation 0): a small town in the ruins, exits to the wasteland and to the Blades.',
  music: '10LABONE',
  outdoor: true,
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  ...BONEYARD_LOOK,
  // Open ground around Adytum (the original's edge blockers 0x02000158 would become a wall along the location edge).
  blockers: [0x02000043],
  skipItems: [0x94, 0x96, 0x9a, 0x9c],
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'boneyard' } }",
    Y: "{ kind: 'exit', to: { map: 'boneyard-blades', entry: 't29304' } }",
  },
  entrances: { 0: 't10500' },
  entries: {
    t10500: { tile: 10500, facing: 'south' },
    t11915: { tile: 11915, facing: 'south' },
    t17312: { tile: 17312, facing: 'south' },
    t23519: { tile: 23519, facing: 'south' },
  },
  // Stairs and hatches (used with E) must be reachable.
  reach: [[15, 44], [29, 41], [44, 46]],
  extraObjects: [
    // Ladder or hatch (script ADY2STOR in the original): press E.
    (o) => `{ kind: 'exit', x: ${15.5 - o.ox}, y: ${44.5 - o.oy}, use: true, to: { map: 'boneyard-adytum-2', entry: 't11715' } },`,
    // Ladder or hatch (script ADY2CELL in the original): press E.
    (o) => `{ kind: 'exit', x: ${29.5 - o.ox}, y: ${41.5 - o.oy}, use: true, to: { map: 'boneyard-adytum-2', entry: 't17111' } },`,
    // Ladder or hatch (script ADY2FARM in the original): press E.
    (o) => `{ kind: 'exit', x: ${44.5 - o.ox}, y: ${46.5 - o.oy}, use: true, to: { map: 'boneyard-adytum-2', entry: 't23521' } },`,
  ],
};

export default config;
