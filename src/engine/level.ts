// The level during play: the wall grid and doors. Built from level data (src/world/defs.ts).
import type { ColumnStorey, LevelDef, LevelPanel, LevelRound, ParsedLevel } from '../world/defs.ts';
import type { TextureName } from './textures.ts';
import { buildCrater, craterBlocks, craterPieces, type Crater } from './crater.ts';

/** A sliding door in a passage cell. Drawn as a thin wall in the middle of the cell and slides sideways. */
export interface Door {
  cx: number;
  cy: number;
  /** 'x' — the door stands across a north–south passage (along the x axis), 'y' — across a west–east passage. */
  axis: 'x' | 'y';
  /** 0 — closed, 1 — fully open. */
  open: number;
  texture: TextureName;
  /** Pen gate: not a full-height wall but a waist-high leaf — drawn by scene blocks (scene.ts), not by the ray. */
  gate?: boolean;
}

/** Door images that are actually pen gates (the original's gates in a fence line). */
export const GATE_DOORS: ReadonlySet<TextureName> = new Set<TextureName>(['woodGate']);

/**
 * A block is a low 3D object in a cell (terminal, vending machine, table): a rectangle on the floor (in level coordinates),
 * height as a fraction of a wall, images for the front, sides and top. You can't walk through it, but you can look and shoot over it.
 */
export interface Block {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Height (wall — 1). */
  height: number;
  front: TextureName;
  side: TextureName;
  top: TextureName;
  /** Where the front faces: 0 — west (−x), 1 — east, 2 — north (−y), 3 — south. */
  facing: 0 | 1 | 2 | 3;
  /** Occupies the middle of the cell: critters walk around the cell (a thin block by a wall doesn't stop them passing). */
  fill: boolean;
  /** Bottom above the floor (tabletop, lamp shade); none — stands on the floor. */
  base?: number;
  /** Round (barrel, column): a cylinder inscribed in the rectangle x0..x1, y0..y1. */
  round?: boolean;
  /** Round: the middle of the drawing always faces the viewer (the body in a Glow storage tube is visible from any side, and only one). */
  toViewer?: boolean;
  /**
   * Composite object (chair: seat, back, legs): only the parts are drawn, and the block itself is a boundary you can't
   * walk through.
   */
  parts?: Block[];
  /** Original scenery prototype (furniture without a script): "examine" takes the name and description from it. */
  pid?: number;
  /** Next block in the same cell (a cell can hold several objects: a table and chairs). */
  next?: Block;
  /** Invisible stop (under a tree or rock drawn as a picture): only blocks movement. */
  hidden?: boolean;
  /** Low berm (the rim of a huge footprint in the wasteland): visible, but you step over it. */
  walkable?: boolean;
  /**
   * Block from the location editor (lintel, ceiling, window): the image repeats per cell and storey rather than stretching; visible
   * above its cell's wall too. A big block lies as copies in all its cells — copies with the same number are drawn once.
   */
  group?: number;
}

/** Floor marking in a cell (stripe, mat, drain grate): an image covering the whole cell (point 0 — the floor shows), rotated by 90°×turn. */
export interface FloorMark {
  texture: TextureName;
  turn: 0 | 1 | 2 | 3;
}

/** Color: red, green, blue (0–255). */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Open sky: instead of a ceiling — sky (above and at the horizon), distant things fade into haze rather than darkness;
 * brightness — overall light (less at night). The game changes the colors by time of day.
 */
export interface Outdoor {
  skyTop: Rgb;
  skyHorizon: Rgb;
  fog: Rgb;
  brightness: number;
  /** Sun: direction (like the view angle: 0 — east) and height above the horizon (radians, below zero — night). */
  sun?: { azimuth: number; elevation: number };
  /** Cloud offset (they drift over time). */
  clouds?: number;
  /** Local sidereal time (radians, stars.ts): real stars are placed by it. None — background stars, as before. */
  sidereal?: number;
  /** The Moon on the celestial sphere and its phase (stars.ts → moonPlace). None — no Moon. */
  moon?: { ra: number; dec: number; lit: number; waxing: boolean };
}

/** Light source (lamp, campfire): where it is, how many cells it lights and how brightly (0–1). */
export interface StaticLight {
  x: number;
  y: number;
  radius: number;
  intensity: number;
}

/** A cell in a location's green zone: inside and on the boundary ring. */
export const GLOW = { inside: 1, ring: 2 } as const;
/** Exit marker: near — to another part of the same location (green), out — out of the location (orange). */
export const EXIT_MARK = { near: 1, out: 2 } as const;

/**
 * Mark exit cells on the floor: cells — cell number → marker kind (EXIT_MARK). The border goes on the sides where the neighboring
 * cell is not the same exit.
 */
export function markExits(level: Level, cells: ReadonlyMap<number, number>): void {
  if (cells.size === 0) return;
  const marks = new Uint8Array(level.width * level.height);
  const same = (x: number, y: number, kind: number) =>
    x >= 0 && y >= 0 && x < level.width && y < level.height && cells.get(y * level.width + x) === kind;
  for (const [cell, kind] of cells) {
    const x = cell % level.width;
    const y = Math.floor(cell / level.width);
    const edges = (same(x - 1, y, kind) ? 0 : 1) | (same(x + 1, y, kind) ? 0 : 2) | (same(x, y - 1, kind) ? 0 : 4) | (same(x, y + 1, kind) ? 0 : 8);
    marks[cell] = kind | (edges << 2);
  }
  level.exitMarks = marks;
}

export interface Level {
  /** Open sky (the wasteland); none — a dungeon or building. */
  outdoor?: Outdoor;
  /** Green zones of locations (by cell number: 0 — none, GLOW.inside, GLOW.ring); no field — no zones. */
  glow?: Uint8Array;
  /**
   * Exit markers on the floor (by cell number): the low two bits — EXIT_MARK (a transition within the location or an exit from it),
   * the next four — which sides of the cell have no exit neighbor (west, east, north, south: the border goes there). 0 — not an exit.
   */
  exitMarks?: Uint8Array;
  width: number;
  height: number;
  /** null — passage, otherwise — the wall texture. */
  walls: (TextureName | null)[];
  floor: TextureName;
  ceiling: TextureName;
  /** At what distance everything fades into darkness. */
  fade: number;
  /** Doors by cell number y * width + x. */
  doors: Map<number, Door>;
  /** Exit cells (step in — transition): for the automap. */
  exits: Set<number>;
  /** Map light sources (from the original maps). */
  lights?: StaticLight[];
  /** Grows when walls change during play (cave-in, force field): tells the renderer to recompute shadows. */
  wallsVersion?: number;
  /** Bullet marks on walls: by cell side (wallFaceKey) — a list of marks. */
  decals?: Map<number, Decal[]>;
  /** Order in which marks appeared (old ones are erased first). */
  decalOrder?: number[];
  /** Blocks (terminals, vending machines) by cell number y * width + x: the first in the cell, the rest via the next chain. */
  blocks?: Map<number, Block>;
  /** Grows when blocks change (placed, removed): tells the renderer to rebuild its block grid. */
  blocksVersion?: number;
  /** Floor markings by cell number. */
  floorMarks?: Map<number, FloorMark>;
  /** Elevator cells (cab, doors or elevator spot) — for the automap. */
  lifts?: number[];
  /** Wall height per cell (in storeys; 0 — normal, 1). No field — all walls are one storey. */
  heights?: Float32Array;
  /** Per-storey wall images per cell (location editor: brick below, plaster above); none — the whole wall is one image. */
  wallLayers?: (TextureName[] | undefined)[];
  /** The level's tallest wall (storeys): the sky haze uses it — only the top of the whole building fades. */
  maxHeight?: number;
  /** Round towers and domes; per cell — the numbers of those touching it (the renderer looks up the circles themselves in the cell). */
  rounds?: LevelRound[];
  roundsAt?: (number[] | undefined)[];
  /** Holes in the ground (the Glow crater): drawn as a pit, you can't get to the center (src/engine/crater.ts). */
  craters?: Crater[];
  /** Pictures on walls; by cell side ((y * width + x) * 4 + side, as in wallFaceKey) — the numbers of the pictures on it. */
  panels?: LevelPanel[];
  panelAt?: Map<number, number[]>;
  /** Sky haze around tall buildings (see LevelDef.haze). */
  haze?: { from: number; to: number; max?: number };
}

/** A bullet mark on a wall: position along the wall (u, 0..1), by height (v, 0 — top, 1 — bottom) and size (as a fraction of a cell). */
export interface Decal {
  u: number;
  v: number;
  r: number;
}

/** How many marks the map remembers. */
const MAX_DECALS = 300;

/** Side of a wall cell: 0 — west, 1 — east, 2 — north, 3 — south. */
export const wallFaceKey = (level: Level, cx: number, cy: number, face: number): number => (cy * level.width + cx) * 4 + face;

/** Leave a mark on a wall; old ones are erased when there are too many. */
export function addDecal(level: Level, key: number, decal: Decal): void {
  level.decals ??= new Map();
  level.decalOrder ??= [];
  const list = level.decals.get(key) ?? [];
  list.push(decal);
  level.decals.set(key, list);
  level.decalOrder.push(key);
  while (level.decalOrder.length > MAX_DECALS) {
    const old = level.decalOrder.shift()!;
    const oldList = level.decals.get(old);
    oldList?.shift();
    if (oldList && oldList.length === 0) level.decals.delete(old);
  }
}

/**
 * Hang a picture on a wall (the level — its own pictures, the scene — signs): each cell side along the wall line knows
 * its own pictures. The level's picture list is its own (we don't touch the one in the level definition).
 */
export function addPanel(level: Level, p: LevelPanel): void {
  const faces = { west: 0, east: 1, north: 2, south: 3 } as const;
  const n = level.panels?.length ?? 0;
  level.panels = [...(level.panels ?? []), p];
  level.panelAt ??= new Map();
  const face = faces[p.face];
  for (let a = Math.floor(p.a0); a < Math.ceil(p.a1); a++) {
    const cx = p.face === 'east' ? p.at - 1 : p.face === 'west' ? p.at : a;
    const cy = p.face === 'south' ? p.at - 1 : p.face === 'north' ? p.at : a;
    if (cx < 0 || cy < 0 || cx >= level.width || cy >= level.height) continue;
    const key = (cy * level.width + cx) * 4 + face;
    level.panelAt.set(key, [...(level.panelAt.get(key) ?? []), n]);
  }
}

/** A door can be passed through when it is open this far. */
export const DOOR_PASSABLE = 0.8;

/** A number 0..1 by cell and index: the same on every level build. */
const cellHash = (x: number, y: number, k: number): number => {
  let h = Math.imul(x + 374761, 668265263) ^ Math.imul(y + 9187, 2246822519) ^ Math.imul(k + 31, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Half-ruined high-rises (LevelDef.highRise): a cell's depth in a block of walls — steps to the nearest floor. Deeper than two —
 * a high-rise: 3 storeys plus 3 for each step inward, a ragged top, sometimes collapsed down to half, a facade from top to bottom. A wall by
 * the street next to the block or in a house-sized noise "patch" — 2–3 storeys, the ground floor with its own image.
 */
function raiseRuins(level: Level, rise: { seed: number; facade: TextureName; maxStoreys: number }): void {
  const { width, height } = level;
  const depth = new Int32Array(width * height).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < width * height; i++) {
    if (!level.walls[i]) {
      depth[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const x = i % width;
    const y = (i - x) / width;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (depth[j] === -1) {
        depth[j] = depth[i]! + 1;
        queue.push(j);
      }
    }
  }
  const heights = (level.heights ??= new Float32Array(width * height));
  const layers = (level.wallLayers ??= new Array<TextureName[] | undefined>(width * height));
  const deep = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && (depth[y * width + x] ?? 0) >= 2;
  let top = level.maxHeight ?? 0;
  for (let i = 0; i < width * height; i++) {
    const wall = level.walls[i];
    if (!wall || (heights[i] ?? 0) > 1) continue;
    const x = i % width;
    const y = (i - x) / width;
    const d = depth[i]!;
    let storeys: number;
    let whole = false;
    if (d >= 2) {
      storeys = 3 + (d - 2) * 3 + Math.floor(cellHash(x, y, rise.seed) * 4);
      if (cellHash(x, y, rise.seed + 1) < 0.18) storeys = Math.max(2, Math.floor(storeys * 0.45));
      whole = true;
    } else {
      const nearMass = deep(x + 1, y) || deep(x - 1, y) || deep(x, y + 1) || deep(x, y - 1);
      const block = cellHash(Math.floor(x / 6), Math.floor(y / 6), rise.seed + 2) > 0.62;
      if (!nearMass && !block) continue;
      storeys = 2 + (cellHash(x, y, rise.seed + 3) < 0.5 ? 1 : 0);
    }
    storeys = Math.min(rise.maxStoreys, storeys);
    if (storeys <= 1) continue;
    heights[i] = storeys;
    layers[i] = Array.from({ length: storeys }, (_, k) => (k === 0 && !whole ? wall : rise.facade));
    if (whole) level.walls[i] = rise.facade;
    top = Math.max(top, storeys);
  }
  level.maxHeight = top;
}

/** Window from the location editor (fractions of a storey): sill up to sill, top of the opening from head; you can see through the middle. */
export const WINDOW_PARTS = { sill: 0.35, head: 0.8 } as const;
/** Numbers of big editor blocks (copies of one block in different cells — one number). */
let nextGroup = 1;

/**
 * Window in a cell on storey storey (0 — the first): the sill and the top of the opening; on the first storey you can't walk through it.
 * A round window (round, Shady Sands houses) — a block covering the whole storey with the wall image and a round hole: you can see through it.
 */
function addWindow(level: Level, cell: number, x: number, y: number, storey: number, texture: TextureName, round = false): void {
  const part = (base: number, height: number): Block => ({ x0: x, y0: y, x1: x + 1, y1: y + 1, base, height, front: texture, side: texture, top: texture, facing: 0, fill: false });
  const frame = part(storey, storey + 1);
  if (storey === 0) delete frame.base;
  const parts = round ? {} : { parts: [part(storey, storey + WINDOW_PARTS.sill), part(storey + WINDOW_PARTS.head, storey + 1)] };
  addBlock(level, cell, { ...frame, fill: storey === 0, ...parts, group: nextGroup++ });
}

/**
 * Columns from the location editor: the solid bottom is a wall (height and per-storey images), above the gap — hanging blocks. Identical
 * hanging pieces of neighboring cells (image, bottom and top) merge into rectangles: a room ceiling is one block, not
 * a hundred (the renderer has its own block limit per screen column).
 */
function addColumns(level: Level, columns: readonly { x: number; y: number; storeys: readonly (ColumnStorey | null)[] }[]): void {
  const { width, height } = level;
  const heights = (level.heights ??= new Float32Array(width * height));
  const layers = (level.wallLayers ??= new Array<TextureName[] | undefined>(width * height));
  /** Hanging pieces: "image|bottom|top" → cells. */
  const pieces = new Map<string, Set<number>>();
  let top = level.maxHeight ?? 0;
  for (const c of columns) {
    if (c.x < 0 || c.y < 0 || c.x >= width || c.y >= height) continue;
    const cell = c.y * width + c.x;
    const s = c.storeys;
    let run = 0;
    while (run < s.length && s[run] && !s[run]!.window) run++;
    if (run > 0) {
      const names = s.slice(0, run).map((p) => p!.texture);
      level.walls[cell] = names[0]!;
      heights[cell] = run;
      if (names.some((n) => n !== names[0])) layers[cell] = names;
      top = Math.max(top, run);
    }
    for (let k = run; k < s.length; k++) {
      const p = s[k];
      if (!p) continue;
      if (p.window) {
        addWindow(level, cell, c.x, c.y, k, p.texture, p.window === 'round');
        top = Math.max(top, k + 1);
        continue;
      }
      let end = k + 1;
      while (end < s.length && s[end] && !s[end]!.window && s[end]!.texture === p.texture) end++;
      const key = `${p.texture}|${k}|${end}`;
      let set = pieces.get(key);
      if (!set) pieces.set(key, (set = new Set()));
      set.add(cell);
      top = Math.max(top, end);
      k = end - 1;
    }
  }
  for (const [key, cells] of pieces) {
    const [name, from, to] = key.split('|') as [TextureName, string, string];
    const base = Number(from);
    for (const first of [...cells].sort((a, b) => a - b)) {
      if (!cells.has(first)) continue;
      const x0 = first % width;
      const y0 = Math.floor(first / width);
      let x1 = x0 + 1;
      while (x1 < width && cells.has(y0 * width + x1)) x1++;
      let y1 = y0 + 1;
      grow: while (y1 < height) {
        for (let x = x0; x < x1; x++) if (!cells.has(y1 * width + x)) break grow;
        y1++;
      }
      const group = nextGroup++;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const cell = y * width + x;
          cells.delete(cell);
          addBlock(level, cell, { x0, y0, x1, y1, base, height: Number(to), front: name, side: name, top: name, facing: 0, fill: base < 1, group });
        }
      }
    }
  }
  level.maxHeight = top;
}

/**
 * Level roofs (LevelDef.roof) — a second storey of full blocks (client request, 2026-10-24): above a wall — a two-storey wall,
 * above a floor — a hanging block covering the whole storey (a ceiling inside a house). As columns, like from the location editor.
 */
/** Roof image in a cell by the letter of the roof row: "#" — the main one, others — by legend; "." and unknown — no roof. */
export function roofTexture(roof: NonNullable<LevelDef['roof']>, ch: string): TextureName | null {
  if (ch === '#') return roof.texture;
  return roof.legend?.[ch] ?? null;
}

function roofColumns(def: LevelDef, walls: readonly (TextureName | null)[], width: number, height: number): { x: number; y: number; storeys: (ColumnStorey | null)[] }[] {
  const roof = def.roof;
  if (!roof) return [];
  const out: { x: number; y: number; storeys: (ColumnStorey | null)[] }[] = [];
  roof.rows.forEach((row, y) => {
    if (y >= height) return;
    for (let x = 0; x < Math.min(row.length, width); x++) {
      const texture = roofTexture(roof, row[x]!);
      if (!texture) continue;
      const wall = walls[y * width + x];
      const storey: ColumnStorey = { texture: wall ? (roof.edges?.[row[x]!] ?? texture) : texture };
      out.push({ x, y, storeys: wall ? [{ texture: wall }, storey] : [null, storey] });
    }
  });
  return out;
}

export function buildLevel(parsed: ParsedLevel): Level {
  const { width, height, walls, def } = parsed;
  const level: Level = {
    width,
    height,
    walls: [...walls],
    floor: def.floor,
    ceiling: def.ceiling,
    fade: def.fade,
    doors: new Map(),
    exits: new Set(),
  };
  if (def.craters?.length) {
    level.craters = def.craters.map(buildCrater);
    // Slabs along the edge and the beam over the drop are level blocks.
    def.craters.forEach((d, i) => {
      for (const piece of craterPieces(level.craters![i]!, d, width, height, (x, y) => level.walls[y * width + x] !== null, i)) {
        for (const cell of piece.cells) addBlock(level, cell, piece.block);
      }
    });
  }
  // The game changes the sky and haze colors by time of day; until the first frame — noon.
  if (def.outdoor) level.outdoor = { skyTop: { r: 96, g: 132, b: 168 }, skyHorizon: { r: 206, g: 192, b: 160 }, fog: { r: 196, g: 182, b: 150 }, brightness: 1 };
  if (def.glow?.length) {
    const glow = new Uint8Array(width * height);
    for (const g of def.glow) {
      const r = Math.ceil(g.radius + 1);
      for (let cy = Math.floor(g.y) - r; cy <= Math.floor(g.y) + r; cy++) {
        for (let cx = Math.floor(g.x) - r; cx <= Math.floor(g.x) + r; cx++) {
          if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
          const d = Math.hypot(cx + 0.5 - g.x, cy + 0.5 - g.y);
          if (Math.abs(d - g.radius) < 1.1) glow[cy * width + cx] = GLOW.ring;
          else if (d < g.radius && !glow[cy * width + cx]) glow[cy * width + cx] = GLOW.inside;
        }
      }
    }
    level.glow = glow;
  }
  // Floor painted in the location editor: an image covering the whole cell on top of the level floor.
  if (def.floorPaint) {
    const marks = (level.floorMarks ??= new Map());
    def.floorPaint.forEach((texture, cell) => {
      if (texture && cell < width * height) marks.set(cell, { texture, turn: 0 });
    });
  }
  // The same, compactly: letters by rows (levels taken from the original maps).
  if (def.paint) {
    const marks = (level.floorMarks ??= new Map());
    const { legend } = def.paint;
    def.paint.rows.forEach((row, y) => {
      if (y >= height) return;
      for (let x = 0; x < Math.min(row.length, width); x++) {
        const texture = legend[row[x]!];
        if (texture) marks.set(y * width + x, { texture, turn: 0 });
      }
    });
  }
  // Tall buildings: walls in a rectangle — their own image and height.
  if (def.towers?.length) {
    const heights = new Float32Array(width * height);
    for (const t of def.towers) {
      for (let cy = Math.max(0, t.y0); cy < Math.min(height, t.y1); cy++) {
        for (let cx = Math.max(0, t.x0); cx < Math.min(width, t.x1); cx++) {
          const i = cy * width + cx;
          if (level.walls[i] === null) continue;
          level.walls[i] = t.texture;
          heights[i] = t.height;
        }
      }
    }
    level.heights = heights;
    level.maxHeight = Math.max(...def.towers.map((t) => t.height));
  }
  // Round towers: their cells are all the wall cells the circle touches; a cell's height is the tallest of the towers in it.
  if (def.rounds?.length) {
    const heights = (level.heights ??= new Float32Array(width * height));
    const at: (number[] | undefined)[] = new Array(width * height);
    def.rounds.forEach((r, n) => {
      for (let cy = Math.max(0, Math.floor(r.y - r.radius)); cy < Math.min(height, Math.ceil(r.y + r.radius)); cy++) {
        for (let cx = Math.max(0, Math.floor(r.x - r.radius)); cx < Math.min(width, Math.ceil(r.x + r.radius)); cx++) {
          const i = cy * width + cx;
          if (level.walls[i] === null) continue;
          const nx = Math.max(cx, Math.min(cx + 1, r.x)) - r.x;
          const ny = Math.max(cy, Math.min(cy + 1, r.y)) - r.y;
          if (nx * nx + ny * ny >= r.radius * r.radius) continue;
          (at[i] ??= []).push(n);
          heights[i] = Math.max(heights[i] ?? 0, r.height);
        }
      }
    });
    level.rounds = def.rounds;
    level.roundsAt = at;
    level.maxHeight = Math.max(level.maxHeight ?? 0, ...def.rounds.map((r) => r.height));
  }
  // Wall height per cell (the mountain over the Military Base): a digit — storeys, then letters (a — 10, b — 11…).
  if (def.storeys) {
    const heights = (level.heights ??= new Float32Array(width * height));
    let top = level.maxHeight ?? 0;
    def.storeys.forEach((row, y) => {
      if (y >= height) return;
      for (let x = 0; x < Math.min(row.length, width); x++) {
        const n = parseInt(row[x]!, 36);
        const i = y * width + x;
        if (!(n >= 1) || level.walls[i] === null) continue;
        heights[i] = n;
        top = Math.max(top, n);
      }
    });
    level.maxHeight = top;
  }
  const columns = [...(def.columns ?? []), ...roofColumns(def, walls, width, height)];
  if (columns.length) addColumns(level, columns);
  if (def.highRise) raiseRuins(level, def.highRise);
  for (const p of def.panels ?? []) addPanel(level, p);
  if (def.haze) level.haze = def.haze;
  for (const o of parsed.objects) {
    const cx = Math.floor(o.x);
    const cy = Math.floor(o.y);
    if (o.kind === 'door') {
      // Walls on the left and right — the door stands across a north–south passage. A wall on only one side (west or east) with
      // nothing above and below — also across that passage, against the wall (client request, 2026-10-27: a door in Junktown
      // stood along the passage, flat against the wall).
      const west = cellWall(level, cx - 1, cy) !== null;
      const east = cellWall(level, cx + 1, cy) !== null;
      const northSouth = cellWall(level, cx, cy - 1) !== null || cellWall(level, cx, cy + 1) !== null;
      const sideWalls = (west && east) || ((west || east) && !northSouth);
      const texture = o.texture ?? parsed.def.doorTexture ?? 'slidingDoor';
      level.doors.set(cy * width + cx, { cx, cy, axis: sideWalls ? 'x' : 'y', open: 0, texture, ...(GATE_DOORS.has(texture) ? { gate: true } : {}) });
    } else if (o.kind === 'exit' && !o.use) {
      level.exits.add(cy * width + cx);
    }
  }
  return level;
}

function cellWall(level: Level, cx: number, cy: number): TextureName | null {
  if (cx < 0 || cy < 0 || cx >= level.width || cy >= level.height) return 'rock';
  return level.walls[cy * level.width + cx] ?? null;
}

/** Wall at a point (doors don't count — the engine draws and checks them separately). */
export function wallAt(level: Level, x: number, y: number): TextureName | null {
  return cellWall(level, Math.floor(x), Math.floor(y));
}

export function doorAt(level: Level, x: number, y: number): Door | undefined {
  return level.doors.get(Math.floor(y) * level.width + Math.floor(x));
}

/** Impassable: a wall, a door that isn't open, or a block (blocks = false — blocks don't count: you can see over them). */
export function solidAt(level: Level, x: number, y: number, blocks = true): boolean {
  if (wallAt(level, x, y)) return true;
  const door = doorAt(level, x, y);
  if (door && door.open < DOOR_PASSABLE) return true;
  if (!blocks) return false;
  // Hole: you can't get to the center, but you can see over it (blocks = false).
  if (level.craters?.some((c) => craterBlocks(c, x, y))) return true;
  if (!level.blocks) return false;
  for (let b = level.blocks.get(Math.floor(y) * level.width + Math.floor(x)); b; b = b.next) {
    // Hangs at storey height and above (lintel, ceiling) — you can walk under it.
    if ((b.base ?? 0) >= 1 || b.walkable) continue;
    if (x <= b.x0 || x >= b.x1 || y <= b.y0 || y >= b.y1) continue;
    if (!b.round) return true;
    const rx = (b.x1 - b.x0) / 2;
    if ((x - b.x0 - rx) ** 2 + (y - (b.y0 + b.y1) / 2) ** 2 < rx * rx) return true;
  }
  return false;
}

/** All blocks of a cell. */
export function blocksIn(level: Level, cell: number): Block[] {
  const out: Block[] = [];
  for (let b = level.blocks?.get(cell); b; b = b.next) out.push(b);
  return out;
}

/** Put a block into a cell (alongside those already there). */
export function addBlock(level: Level, cell: number, block: Block): void {
  level.blocks ??= new Map();
  block.next = level.blocks.get(cell);
  if (!block.next) delete block.next;
  level.blocks.set(cell, block);
  level.blocksVersion = (level.blocksVersion ?? 0) + 1;
}

/** Remove a block from a cell (the others stay). */
export function removeBlock(level: Level, cell: number, block: Block): void {
  const rest = blocksIn(level, cell).filter((b) => b !== block);
  rest.forEach((b, i) => {
    const next = rest[i + 1];
    if (next) b.next = next;
    else delete b.next;
  });
  delete block.next;
  if (rest[0]) level.blocks!.set(cell, rest[0]);
  else level.blocks?.delete(cell);
  level.blocksVersion = (level.blocksVersion ?? 0) + 1;
}

export function isExit(level: Level, x: number, y: number): boolean {
  return level.exits.has(Math.floor(y) * level.width + Math.floor(x));
}

/** How many cells are free from (x, y) in direction angle (no further than limit). */
function freeAhead(level: Level, x: number, y: number, angle: number, limit: number): number {
  for (let d = 0.25; d <= limit; d += 0.25) {
    const px = x + Math.cos(angle) * d;
    const py = y + Math.sin(angle) * d;
    // A door ahead is a path too (it will be opened): you came up in an elevator facing the booth door — you stay that way instead of looking into a corner.
    if (doorAt(level, px, py)) return limit;
    if (solidAt(level, px, py)) return d - 0.25;
  }
  return limit;
}

/**
 * Where to look on entering the map: as given, unless there is a wall right ahead (entrance by an elevator panel); otherwise —
 * where it is most open (out of eight directions).
 */
export function openFacing(level: Level, x: number, y: number, angle: number): number {
  if (freeAhead(level, x, y, angle, 1.5) >= 1.5) return angle;
  let best = angle;
  let bestFree = -1;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const free = freeAhead(level, x, y, a, 6);
    if (free > bestFree + 0.01) {
      best = a;
      bestFree = free;
    }
  }
  return best;
}
