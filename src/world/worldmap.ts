// World map: the wasteland divided into squares, data for travel (the screen and travel rules come later).
// The grid is the same as on the original world map image: 28 columns and 30 rows of squares (50×50 pixels each on the image).
// Columns count left to right, rows top to bottom, both from zero. Top-down view of the image with the grid and numbers:
// `node tools/worldmap-view.ts` (docs/img/worldmap.png), with our data on top: `node tools/worldmap-view.ts --terrain`.
// Terrain was read from the image (color and pattern of the square, ruins and coastline by eye), locations from the green
// circles on the image itself. Approximate: on borders (coast, foothills) a square goes to whatever it has more of.

/** Legend: one letter, one terrain type. */
export const TERRAIN_LEGEND = {
  /** Desert: plains, sand, grey dusty wasteland. */
  '.': 'desert',
  /** Mountains and hills: relief, canyons. */
  '^': 'mountains',
  /** Ruins: remains of large cities with lots of rubble. */
  r: 'ruins',
  /** Location: a square with a town, vault or base (one of the locations below). */
  T: 'town',
  /** Water: ocean and shore, impassable. */
  '~': 'water',
} as const;

export type TerrainLetter = keyof typeof TERRAIN_LEGEND;
export type Terrain = (typeof TERRAIN_LEGEND)[TerrainLetter];

export const WORLD_COLUMNS = 28;
export const WORLD_ROWS = 30;
/** Side of a square on the original world map image, in pixels (needed only to convert image coordinates). */
export const WORLD_SQUARE_PIXELS = 50;

/** Terrain by rows from top to bottom; each row is 28 letters from the legend. */
export const WORLD_TERRAIN: readonly string[] = [
  '^^......^^^^^^^^^^^^^^^.....',
  '^^.T....^^^^^^^^T^^^^T^^^T..',
  '^^^......^^^^^^^^^^^..^^^^..',
  '^^^^.......^.^^^^^^^.^T^^^..',
  '^^^^^......^^^^^^^^^^..^^...',
  '^^^^r^......^^^^^^r^^^^^....',
  '^^^^^^.......^^^^^^^^^.^.^rr',
  '~^^^^^......^^^^^^^^^^^^^.r^',
  '~^^^^.^.......r^^^^^^^^^...^',
  '~~^^^^......T^^^^^^^^^^^..^^',
  '~~^^^^^^....^^^^^T^^^^......',
  '~~~^r^^^..r.^^^^^^^^^.......',
  '~~~~r^^^.r^.^^^^^^^^^.r.....',
  '~~~~~^^^^^^^^^^^^^...rTr....',
  '~~~~~^^^^^..^^^^^T^..rr.....',
  '~~~~~rr^^^^^^^^.^^^.....^^^^',
  '~~~~~rrrr^^^^^^^..^....^^^^^',
  '~~~~~~~rrrrr^^rr^^.^^.^^^^^^',
  '~~~~~~~~~~rrrrrT^^^^^^^^^^^^',
  '~~~~~~~~~~~~rrrrr^^^^^^^^^^^',
  '~~~~~~~~~~~~~~rTr^^^^^^^^^^^',
  '~~~~~~~~~~~~~~~~^^^^^^^^^^^^',
  '~~~~~~~~~~~~~~~~~^^^^^^^^^^^',
  '~~~~~~~~~~~~~~~~~~r^^^^^^^^^',
  '~~~~~~~~~~~~~~~~~~r^^^^^^^^^',
  '~~~~~~~~~~~~~~~~~~~^^^^^T^^^',
  '~~~~~~~~~~~~~~~~~~~~^^^^^^^^',
  '~~~~~~~~~~~~~~~~~~~~^^^^^^^^',
  '~~~~~~~~~~~~~~~~~~~~^^^^^^^^',
  '~~~~~~~~~~~~~~~~~~~~~^^^^^^^',
];

/** World map locations: only our keys (names for the player come from the game). */
export type PlaceKey =
  | 'vault13'
  | 'vault15'
  | 'shadySands'
  | 'junktown'
  | 'hub'
  | 'necropolis'
  | 'brotherhood'
  | 'boneyard'
  | 'militaryBase'
  | 'cathedral'
  | 'raiders'
  | 'glow';

export interface Square {
  column: number;
  row: number;
}

/** Square of each location, as on the original image (green circle; in the square with the letter "T" in WORLD_TERRAIN). */
export const PLACES: Record<PlaceKey, Square> = {
  vault13: { column: 16, row: 1 },
  vault15: { column: 25, row: 1 },
  shadySands: { column: 21, row: 1 },
  junktown: { column: 17, row: 10 },
  hub: { column: 17, row: 14 },
  necropolis: { column: 22, row: 13 },
  brotherhood: { column: 12, row: 9 },
  boneyard: { column: 15, row: 18 },
  militaryBase: { column: 3, row: 1 },
  cathedral: { column: 15, row: 20 },
  raiders: { column: 22, row: 3 },
  glow: { column: 24, row: 25 },
};

/**
 * The original's global variables "what the hero knows about a location" (VAULT13.GAM, 67–79): 0 nothing, 1 heard of it, 2 visited.
 * When an NPC tells where a location is, their script sets 1 and the location appears on the world map; the game sets "visited" on entry.
 * The Cathedral has two: the Cathedral itself and the Master's lair beneath it.
 */
export const PLACE_GVARS: Record<PlaceKey, readonly number[]> = {
  vault13: [67],
  shadySands: [68],
  raiders: [69],
  vault15: [70],
  junktown: [71],
  necropolis: [72],
  hub: [73],
  brotherhood: [74],
  boneyard: [75],
  glow: [76],
  cathedral: [77, 79],
  militaryBase: [78],
};

/** Is the square inside the grid? */
export const insideWorld = (column: number, row: number): boolean => Number.isInteger(column) && Number.isInteger(row) && column >= 0 && column < WORLD_COLUMNS && row >= 0 && row < WORLD_ROWS;

/** Terrain of the square; outside the grid, null. */
export function terrainAt(column: number, row: number): Terrain | null {
  if (!insideWorld(column, row)) return null;
  const letter = WORLD_TERRAIN[row]![column] as TerrainLetter;
  return TERRAIN_LEGEND[letter];
}

/** Which location is in the square (null means none). */
export function placeAt(column: number, row: number): PlaceKey | null {
  for (const key of Object.keys(PLACES) as PlaceKey[]) if (PLACES[key].column === column && PLACES[key].row === row) return key;
  return null;
}

/** Square under a point of the original world map image (x, y in pixels from its top-left corner). */
export const squareAtPixel = (x: number, y: number): Square => ({ column: Math.floor(x / WORLD_SQUARE_PIXELS), row: Math.floor(y / WORLD_SQUARE_PIXELS) });
