// Level format (version 2). A level is data: a grid of walls as letters plus items, critters, doors,
// exits and elevators. The engine and the scene do not know levels by name: new maps are added as data only.
import type { PanelName, PanelPicture } from '../engine/cathedral-textures.ts';
import type { TextureName } from '../engine/textures.ts';

/** Where an exit or elevator leads: a map and an entry point on it. The map "worldmap" is the world map. */
export interface Destination {
  map: string;
  entry: string;
  /** Exact original hex on that map (a script moved the hero with move_to): takes precedence over the entry point. */
  tile?: number;
}

/** Player spawn point. angle: 0 is east, −π/2 is north (up the grid), π/2 is south. */
export interface Entry {
  x: number;
  y: number;
  angle: number;
}

/** Kind of descent on the floor at an exit: manhole, trapdoor (a lid in the floor), pit. */
export const EXIT_LOOKS = ['manhole', 'trapdoor', 'pit'] as const;
export type ExitLook = (typeof EXIT_LOOKS)[number];

/** Directions for convenience: north = −π/2 and so on. */
export const FACING = { east: 0, south: Math.PI / 2, west: Math.PI, north: -Math.PI / 2 } as const;

export type ObjectDef =
  /**
   * Hostile critter: attacks when it sees the player. pid is the critter prototype from the game copy.
   * home (npc has it too): where the critter stood in the game level, if a location editor variant moved it; it gets
   * the items from the original map by this spot.
   */
  | { kind: 'critter'; pid: number; x: number; y: number; facing?: number; script?: string; weapon?: number; home?: { x: number; y: number } }
  /**
   * Peaceful NPC: stands in place, does not attack. E starts a conversation.
   * script is the script name from SCRIPTS.LST of the player's copy (for example "OVER" for the Overseer): the original script runs the conversation.
   * weapon (critter has it too) is the PID of the weapon in hand: with it the critter shoots (pistol, rifle…) or strikes (knife, club),
   * with "armed" images, as in the original. None means it fights with fists (or bites).
   * roam: a crowd extra from a location editor variant, wanders around its spot (src/world/people.ts); not used in game levels.
   */
  | { kind: 'npc'; pid: number; x: number; y: number; facing?: number; script?: string; weapon?: number; home?: { x: number; y: number }; roam?: true }
  /**
   * Dead body from the original map: lies as a corpse from its first appearance and can be searched (items: what is in its pockets:
   * [PID, how many]). script is the body's script (description on examination).
   */
  | { kind: 'corpse'; pid: number; x: number; y: number; facing?: number; script?: string; items?: [number, number][] }
  /** Item on the floor. count is for ammo: how many rounds (by default, a box from the prototype). */
  | { kind: 'item'; pid: number; x: number; y: number; count?: number }
  /** Sliding door in a passage (the grid cell is floor). sound is the door sound letter (SODOORS<letter>). */
  // openFrom: from this side the door always opens (exit from inside out), its script is not asked then.
  | { kind: 'door'; x: number; y: number; texture?: TextureName; sound?: string; locked?: boolean; keyPid?: number; openFrom?: 'north' | 'south' | 'east' | 'west' }
  /** Exit: step into the cell (walk) or press E while looking at it (use, for example on a blast door in a wall). */
  /** look is the kind of descent on the floor (manhole, trapdoor, pit; from the location editor); none means a colored exit zone. */
  | { kind: 'exit'; x: number; y: number; to: Destination; use?: boolean; look?: ExitLook }
  /** Elevator: E on a neighboring cell opens the floor choice. floors are ordered top to bottom; current is this floor's index. */
  | { kind: 'elevator'; x: number; y: number; floors: Destination[]; current: number; art?: number };

/** A column storey from the location editor: a texture, and for a window, the frame texture. */
export interface ColumnStorey {
  texture: TextureName;
  /** Window: true is rectangular (sill and top of the opening from texture); 'round' is round: texture is a wall with a round hole. */
  window?: boolean | 'round';
}

/** The same without coordinates, for marks in the grid. */
type Placed<T> = T extends unknown ? Omit<T, 'x' | 'y'> : never;
export type MarkDef = Placed<ObjectDef> | { kind: 'entry'; name: string; angle: number };

/**
 * Round tower (dome drum, dome tier, spire): center (x, y) in cells, radius and height (storeys), texture.
 * A dome is assembled from several round towers with a common center, each narrower and higher. Stands only in wall cells.
 */
export interface LevelRound {
  x: number;
  y: number;
  radius: number;
  height: number;
  texture: TextureName;
}

/**
 * Large picture on a building wall (stained glass, relief): side face, wall line at (x for east and west, y for north
 * and south), along the wall from a0 to a1 (cells), in height from storey from to storey to. Transparent pixels of the picture are plain wall.
 * The picture is our texture (picture) or a ready image (image: a sign from the player's copy, hung by the scene, src/game/signs.ts).
 */
/**
 * A hole in the ground (src/engine/crater.ts): center, edge radius by direction (cells; clockwise from east, evenly
 * around the circle), whether it is deep, with a drop into a bottomless shaft (otherwise a shallow crater); slope and shaft wall textures.
 */
export interface LevelCrater {
  x: number;
  y: number;
  radius: number[];
  shaft?: boolean;
  lip: TextureName;
  slope: TextureName;
  wall?: TextureName;
  /** Concrete slabs along the edge: how many and their textures (side, top). */
  slabs?: { count: number; side: TextureName; top: TextureName };
  /** Steel girder from a point at the edge toward the center (used to climb down on a rope); length in cells. */
  beam?: { x: number; y: number; length?: number; texture: TextureName };
}

export interface LevelPanel {
  face: 'east' | 'west' | 'north' | 'south';
  at: number;
  a0: number;
  a1: number;
  from: number;
  to: number;
  picture?: PanelName;
  image?: PanelPicture;
}

/**
 * Location editor edits over the original objects (src/world/decor.ts): object key (f<number> furniture, k<number> container,
 * s<hex> scripted scenery) → new spot; removed is removed furniture; added is custom furniture (scenery
 * prototype and cell).
 */
export interface LevelDecor {
  moved: Record<string, { x: number; y: number }>;
  removed: string[];
  added: { x: number; y: number; pid: number }[];
}

export interface LevelDef {
  /** Map name, transitions use it: "cave", "vault13-1"… */
  id: string;
  /** Name for saves and the Pip-Boy: ours, in two languages. */
  title?: { ru: string; en: string };
  /** Original map the level is based on: scripts take the map variables from it (MAPS\<name>.GAM). */
  original?: string;
  /** Elevation (floor) 0–2 of the original map that the level corresponds to (for scripts: elevation). */
  elevation?: number;
  /**
   * Binding to the original hexes (for scripts: tile_num, move_to…): which hex
   * ended up in the top-left corner of our grid. Our cell is a 2×2 hex square (as in tools/map-view.ts).
   */
  hexFrame?: { col: number; row: number };
  /**
   * Levels with their own layout (the cave near Vault 13): where we have the original container or scenery with this
   * hex, if by the frame it would land in rock.
   */
  spots?: Record<number, { x: number; y: number }>;
  /** Original entrances: entrance number (second load_map parameter) → name of our entrance on this level (`entries` key). Table: `node tools/load-map-calls.ts`. */
  entrances?: Record<number, string>;
  /**
   * The map's own script from SCRIPTS.LST of the copy (for VAULT13 it is "VAULT13"): map_enter_p_proc, map_update_p_proc…
   * All levels of one original map share it; moving between its floors does not repeat the map entry.
   */
  script?: string;
  /** Open sky (the wasteland): sky instead of a ceiling, haze in the distance, light by time of day. */
  outdoor?: boolean;
  /** Green location zones in the wasteland (like the circles on the original world map): center and radius in cells. */
  glow?: { x: number; y: number; radius: number }[];
  /** Music from the game copy (SOUND\MUSIC\<name>.ACM). */
  music: string;
  floor: TextureName;
  ceiling: TextureName;
  /** Door texture for this level (none means the plain sliding door). */
  doorTexture?: TextureName;
  /**
   * Tall buildings (under open sky): walls in the cell rectangle [x0, x1) × [y0, y1) get this texture and this
   * height (in storeys). Later entries take precedence (the spire over the cathedral).
   */
  towers?: { x0: number; y0: number; x1: number; y1: number; height: number; texture: TextureName }[];
  /**
   * Wall heights by cell (rows like the grid): a digit is storeys, then letters (a is 10, b is 11…), "." keeps as is.
   * The mountain above the military base: the farther from the slope, the higher, with an uneven top.
   */
  storeys?: string[];
  /** Round towers and domes (see LevelRound). */
  rounds?: LevelRound[];
  /** Large pictures on the walls of tall buildings (see LevelPanel). */
  panels?: LevelPanel[];
  /** Holes in the ground, real pits (the Glow crater, see LevelCrater). */
  craters?: LevelCrater[];
  /** Floor texture by cell (location editor): cell index y * width + x → texture; null means the level's floor. */
  floorPaint?: (TextureName | null)[];
  /** The same, compact (levels taken from the original maps): letter → texture, rows like the grid; "." means the level's floor. */
  paint?: { legend: Record<string, TextureName>; rows: string[] };
  /**
   * House roofs: a second storey of full blocks over "#" cells (over a wall, a two-storey wall), texture texture; other
   * letters use their own textures from legend (in the Hub's old town, a black roof over the warehouses, concrete over the houses).
   */
  roof?: {
    texture: TextureName;
    rows: string[];
    legend?: Record<string, TextureName>;
    /**
     * Texture of the roof storey over a wall, by the roof letter ("#" or a legend letter): outside it is the top of the facade (the Hub parapet with
     * a cornice and grass), while texture is seen from below as the ceiling. No letter means the same as texture.
     */
    edges?: Record<string, TextureName>;
  };
  /**
   * Fence by mask (around the Brotherhood of Steel bunker, chain link): "F" in rows is a floor cell, with a thin fence along it
   * by neighboring pieces (in a corner, along both), see-through; height is the height (storeys).
   */
  fences?: { texture: TextureName; height: number; rows: string[] };
  /**
   * Columns from the location editor: a cell and its storeys from the bottom up (null is a gap). A solid bottom is a wall of that height,
   * each storey with its own texture; above a gap, hanging blocks (lintel, arch, ceiling); a window is a sill and the top
   * of the opening, see-through in the middle.
   */
  columns?: { x: number; y: number; storeys: (ColumnStorey | null)[] }[];
  /**
   * Half-ruined high-rises (Necropolis): thick solid wall masses rise in storeys, the deeper a cell is in the mass,
   * the higher, with a ragged top and collapses in places; some walls along the streets are 2–3 storeys. Computed from the finished walls, so it works
   * with location editor variants too. Above the first storey (for masses, top to bottom) the facade texture is used.
   */
  highRise?: { seed: number; facade: TextureName; maxStoreys: number };
  /** Original furniture, containers and scenery moved, removed and added in the location editor (see LevelDecor). */
  decor?: LevelDecor;
  /** A ruined location (the Glow): computers and mainframe cabinets there are broken (src/game/blocks.ts, blockShapeOf). */
  ruined?: boolean;
  /**
   * Layout revision number (the location was re-taken from the original map). The map state in a save remembers the number; if it differs,
   * the state from the old layout (NPCs, items, doors by object index) is not applied and the hero stands at the entrance.
   */
  revision?: number;
  /**
   * A location of separate parts, each with its own entrance (the basements and the fungus caves under Adytum, each with its own ladder from above):
   * from an entrance you only reach its own part; the level check requires every object to be reachable from at least one.
   */
  separateParts?: boolean;
  /**
   * Cave-ins (Vault 15): original rocks that landed in our wall (our walls are thicker, and buried corridors are wall)
   * drop onto the nearest floor, so a dead end shows a pile of rocks rather than a smooth wall.
   */
  rubble?: boolean;
  /**
   * Fog near tall buildings: from height from (storeys) the walls start to fade, by to they are almost sky (how much remains is max, default
   * 0.97). Lit windows shine through it. None means haze based on the tallest wall.
   */
  haze?: { from: number; to: number; max?: number };
  /** Distance at which everything dissolves into darkness. */
  fade: number;
  /**
   * Grid: walls as letters (# metal, R rock, V blast door, L daylight), "." is floor.
   * Other letters are marks from marks: floor and an object in their place. Short rows are padded with rock.
   */
  grid: string[];
  /** Custom walls over the shared ones: letter → texture. */
  walls?: Record<string, TextureName>;
  /** Marks in the grid: letter → object (or entry point). One letter can appear in several places. */
  marks?: Record<string, MarkDef>;
  /** Objects with exact coordinates (cell + 0.5 is the cell center). */
  objects?: ObjectDef[];
  /** Entry points with exact coordinates (they complement the marks). */
  entries?: Record<string, Entry>;
}

export const DEFAULT_WALLS: Record<string, TextureName> = {
  '#': 'metal',
  R: 'rock',
  V: 'door',
  L: 'daylight',
};

/** Level after parsing: grid, objects with coordinates and all entry points. */
export interface ParsedLevel {
  def: LevelDef;
  width: number;
  height: number;
  walls: (TextureName | null)[];
  objects: ObjectDef[];
  entries: Record<string, Entry>;
}

export function parseLevelDef(def: LevelDef): ParsedLevel {
  const legend = { ...DEFAULT_WALLS, ...def.walls };
  const height = def.grid.length;
  const width = Math.max(...def.grid.map((r) => r.length));
  const walls: (TextureName | null)[] = [];
  const objects: ObjectDef[] = [];
  const entries: Record<string, Entry> = { ...def.entries };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = def.grid[y]?.[x] ?? 'R';
      const wall = legend[ch];
      walls.push(wall ?? null);
      if (wall || ch === '.') continue;
      const mark = def.marks?.[ch];
      if (!mark) throw new Error(`${def.id}: unknown mark "${ch}" in cell ${x},${y}`);
      if (mark.kind === 'entry') entries[mark.name] = { x: x + 0.5, y: y + 0.5, angle: mark.angle };
      else objects.push({ ...mark, x: x + 0.5, y: y + 0.5 } as ObjectDef);
    }
  }
  for (const o of def.objects ?? []) objects.push(o);
  return { def, width, height, walls, objects, entries };
}
