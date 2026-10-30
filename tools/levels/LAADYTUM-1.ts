// Boneyard, Adytum, cellars (LAADYTUM, floor 1) → boneyard-adytum-2.
import type { LevelConfig } from '../map-to-level.ts';

type Rect = [number, number, number, number];

/** Parts of the location in draft cells (level = draft + 1): storeroom, room with beds, mushroom farm. */
const ROOMS: Rect[] = [
  [3, 25, 10, 33],
  [17, 25, 23, 31],
];
const CAVE: Rect = [30, 20, 48, 39];
const inside = (x: number, y: number, [x0, y0, x1, y1]: Rect, pad = 0) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
const inRoom = (x: number, y: number) => ROOMS.some((r) => inside(x, y, r, 1));

const config: LevelConfig = {
  id: 'boneyard-adytum-2',
  constName: 'BONEYARD_ADYTUM_2',
  title: { ru: 'Свалка, Адитум, подвалы', en: 'Boneyard, Adytum, cellars' },
  doc: 'Under Adytum (map LAADYTUM, elevation 1): two cellars under the houses (a storeroom and a room with beds) and a mushroom cave; a ladder leads down into each from above.',
  music: '10LABONE',
  // Layout re-converted (2026-10-25): saves from the old layout forget this location's state.
  revision: 1,
  // Cave rocks that ended up in our wall go along the walls (client, 2026-10-24: compared with the original).
  rubble: true,
  // As in the original (client, 2026-10-25): cellars have adobe walls and a pinkish cement floor, the mushroom farm is a cave.
  wallTexture: 'adobeLight',
  walls: { '#': 'adobeLight', C: 'caveWall' },
  // Cellar walls (and the original's invisible front walls of the cellars) are adobe; the mushroom farm walls are cave rock.
  wallLetter: (x, y) => (inRoom(x, y) ? '#' : 'C'),
  floor: 'caveFloor',
  ceiling: 'caveCeiling',
  fade: 10,
  paint: true,
  // The cellars and the cave are separate areas (each has its own stairs from above): do not carve passages between them; the original's invisible
  // walls under the tables and beds are not walls (the game places the table and the bed as blocks).
  carve: false,
  furnitureBlocks: true,
  separateParts: true,
  // The original's cellars are drawn without their top walls: shelves stand where the wall would be, with an empty dark tile behind them. Around the
  // cellars is their wall, everything else outside the cellars and the cave is rock; floor that cannot be reached is rock too.
  transform: (rows) =>
    rows.forEach((row, y) =>
      row.forEach((_, x) => {
        if (ROOMS.some((r) => inside(x, y, r)) || inside(x, y, CAVE)) return;
        row[x] = inRoom(x, y) ? '#' : 'R';
      }),
    ),
  seal: true,
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96, 0x9a, 0x9c],
  entries: {
    t11715: { tile: 11715, facing: 'south' },
    t17111: { tile: 17111, facing: 'south' },
    t23521: { tile: 23521, facing: 'south' },
  },
  // Stairs and hatches (used with E) must be reachable.
  reach: [[4, 28], [18, 26], [33, 31]],
  extraObjects: [
    // Ladder or hatch (script STOR2ADY in the original): press E.
    (o) => `{ kind: 'exit', x: ${4.5 - o.ox}, y: ${28.5 - o.oy}, use: true, to: { map: 'boneyard-adytum', entry: 't11915' } },`,
    // Ladder or hatch (script CELL2ADY in the original): press E.
    (o) => `{ kind: 'exit', x: ${18.5 - o.ox}, y: ${26.5 - o.oy}, use: true, to: { map: 'boneyard-adytum', entry: 't17312' } },`,
    // Ladder or hatch (script FARM2ADY in the original): press E.
    (o) => `{ kind: 'exit', x: ${33.5 - o.ox}, y: ${31.5 - o.oy}, use: true, to: { map: 'boneyard-adytum', entry: 't23519' } },`,
  ],
};

export default config;
