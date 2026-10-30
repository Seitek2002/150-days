// A location from the location editor: a variant of a game level drawn by storeys, plus the "storeys ↔ level" conversion.
// Storey 0 is the floor (a texture per cell; empty means the level's floor), storeys 1, 2… are blocks at that height: a solid column from the bottom is
// a wall of that height, each storey with its own texture; above a gap, a hanging block (lintel over a door, arch, ceiling);
// a window is a sill and the top of the opening with a frame from its column's wall; a door is on storey 1 (`columns` in defs.ts).
// Transitions (entrances, exits and elevators (stairs) with a floor choice) are edited in the editor (`marks`). NPCs (`people`): important ones
// stand at their spots (they can be moved), enemies are placed in the editor, the crowd stands at random near their own
// spot (not behind a door or fence) and in the game wanders around it (`roam`, `src/world/people.ts`); anyone stuck in a wall goes to
// the nearest free cell, as do items. The original's furniture, containers and scenery (`decor`, `src/world/decor.ts`)
// can be moved, furniture removed and new furniture placed; the game arranges them (`scene.ts`). Domes and paintings come from the game level as is.
// A variant file is data only (JSON) in the folder locations/<level>/<name>.json: it can be given to a friend, it contains no code;
// a foreign file is validated (decodeLocation): anything unknown is read as empty.
import { buildLevel, roofTexture } from '../engine/level.ts';
import type { TextureName } from '../engine/textures.ts';
import { blockIn, CUSTOM_BLOCK_ID, DOOR_BLOCK, DOOR_SOUND, floorBlockFor, ROUND_WINDOW_BLOCK, wallBlockFor, WINDOW_BLOCK, type BlockDef, type CustomBlock } from './block-catalog.ts';
import { furnitureKinds, levelDecor, levelFences, placedDecor } from './decor.ts';
import { EXIT_LOOKS, parseLevelDef, type ColumnStorey, type Destination, type Entry, type ExitLook, type LevelDecor, type LevelDef, type ObjectDef } from './defs.ts';
import { enemyMark, enemyScriptAllowed, levelPeople, roams, type EnemyMark } from './people.ts';

export const LOCATION_FORMAT = '150days-location';
/** No more storeys and cells than this: protection against corrupted and foreign files. */
export const LOCATION_LIMITS = { floors: 64, size: 400 } as const;

/** Location transitions: entrances (name → point), exits (cell → where to) and elevators (cell → floors, this one is current). */
export interface EditorMarks {
  entries: Record<string, Entry>;
  exits: { x: number; y: number; to: Destination; use?: boolean; look?: ExitLook }[];
  lifts: { x: number; y: number; floors: Destination[]; current: number; art?: number }[];
}

/** Location NPCs: where important ones were moved (key: see levelPeople) and all of the location's enemies. */
export interface EditorPeople {
  moved: Record<string, { x: number; y: number }>;
  enemies: EnemyMark[];
}

/** A location in the editor: blocks by storey (cell index y * width + x; null means empty). */
export interface EditorLocation {
  /** The game level the variant replaces ("shady-sands-e"). */
  base: string;
  /** Variant name (also the file name). */
  name: string;
  width: number;
  height: number;
  floors: (string | null)[][];
  /** Transitions; absent means as in the game level (files from the editor's first stage). */
  marks?: EditorMarks;
  /** NPCs; absent means important ones at their spots and enemies as in the game level (files from stages 1–3). */
  people?: EditorPeople;
  /** Original objects: moved, removed, new (see LevelDecor); absent means as in the game level. */
  decor?: LevelDecor;
  /** The location's custom blocks from the file (stage 5, before the block library): the editor moves them into the library. */
  blocks?: CustomBlock[];
  /** Whether a door is locked (edited in the editor): cell index → yes/no; no entry means as for the level's door. */
  locks?: Record<number, boolean>;
  /** Location ceiling texture; absent means as in the game level. */
  ceiling?: TextureName;
}

/** Variant file on disk. */
export interface LocationFile {
  format: typeof LOCATION_FORMAT;
  version: 1;
  base: string;
  name: string;
  width: number;
  height: number;
  /** Letter → block, shared by all storeys; "." means empty. */
  legend: Record<string, string>;
  /** Storeys from bottom to top: grid rows in letters from legend. */
  floors: string[][];
  marks?: EditorMarks;
  people?: EditorPeople;
  decor?: LevelDecor;
  blocks?: CustomBlock[];
  locks?: Record<number, boolean>;
  ceiling?: string;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#$%&*+=?@^~';

const emptyFloor = (width: number, height: number): (string | null)[] => new Array<string | null>(width * height).fill(null);

/** Game level transitions: its entrances, exits and elevators. */
export function marksFromLevel(def: LevelDef): EditorMarks {
  const parsed = parseLevelDef(def);
  const marks: EditorMarks = { entries: { ...parsed.entries }, exits: [], lifts: [] };
  for (const o of parsed.objects) {
    if (o.kind === 'exit') marks.exits.push({ x: o.x, y: o.y, to: { ...o.to }, ...(o.use ? { use: true } : {}), ...(o.look ? { look: o.look } : {}) });
    else if (o.kind === 'elevator') marks.lifts.push({ x: o.x, y: o.y, floors: o.floors.map((f) => ({ ...f })), current: o.current, ...(o.art !== undefined ? { art: o.art } : {}) });
  }
  return marks;
}

/** Game level NPCs: nobody moved, enemies as in the level. */
export function peopleFromLevel(def: LevelDef): EditorPeople {
  return { moved: {}, enemies: levelPeople(def).filter((p) => p.role === 'enemy').map((p) => enemyMark(p.def)) };
}

/**
 * The crowd stands at random no farther than this many cells from their spot, in the same room or yard, not behind a door or
 * fence (if there is no room there, as close to it as possible).
 */
export const SCATTER = 8;

/** Grid of the assembled location: where the floor is, what transitions occupy, where you enter from. */
interface Layout {
  width: number;
  height: number;
  grid: string[];
  columns: NonNullable<LevelDef['columns']>;
  /** Doors, exits, elevators, entrances: NPCs do not stand on them. */
  reserved: { x: number; y: number }[];
  /** Entrances: reachability is computed from them. */
  starts: { x: number; y: number }[];
  /** Furniture, containers, scenery: the crowd does not stand there. */
  furniture: { x: number; y: number }[];
  /** Doors and fences: the crowd stays on its own side of them. */
  doors: { x: number; y: number }[];
  fences: { x: number; y: number }[];
}

/**
 * Arrange NPCs and items in the assembled location. One can stand on the floor (not in a wall or a window) that is reachable from the
 * entrances; not on a door, exit, elevator or entrance; one per cell. Important ones at their spot or where they were moved,
 * enemies from the editor, the crowd at random near their spot (random); items and bodies from walls go to the nearest floor.
 * objects: the level's objects with their indices in parseLevelDef(base). Returns objects without level enemies, with new positions (moved NPCs have home where they stood), and at the end
 * the editor's enemies (so the other indices do not depend on how many enemies were placed).
 */
function arrangePeople(objects: [index: number, o: ObjectDef][], people: EditorPeople, base: LevelDef, layout: Layout, random: () => number): ObjectDef[] {
  const { width, height } = layout;
  const cellOf = (p: { x: number; y: number }) => Math.floor(p.y) * width + Math.floor(p.x);
  const centre = (cell: number) => ({ x: (cell % width) + 0.5, y: Math.floor(cell / width) + 0.5 });
  const floor = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) floor[y * width + x] = layout.grid[y]?.[x] === '.' ? 1 : 0;
  for (const c of layout.columns) if (c.storeys[0]?.window) floor[c.y * width + c.x] = 0;
  // Where you can get to from the entrances (doors are passable); with no entrances, everywhere there is floor.
  const reach = new Uint8Array(width * height);
  const queue: number[] = [];
  for (const s of layout.starts) {
    const cell = cellOf(s);
    if (cell >= 0 && cell < reach.length && !reach[cell]) {
      reach[cell] = 1;
      queue.push(cell);
    }
  }
  if (!queue.length) reach.set(floor);
  while (queue.length) {
    const cell = queue.pop()!;
    const x = cell % width;
    const y = (cell - x) / width;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      const next = ny * width + nx;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || reach[next] || !floor[next]) continue;
      reach[next] = 1;
      queue.push(next);
    }
  }
  const reserved = new Set(layout.reserved.map(cellOf));
  const taken = new Set<number>();
  const standable = (cell: number) => !!floor[cell] && !!reach[cell] && !reserved.has(cell) && !taken.has(cell);
  /** Nearest cell to the point where ok holds: in rings around it. */
  const nearest = (p: { x: number; y: number }, ok: (cell: number) => boolean): number | null => {
    const px = Math.min(width - 0.5, Math.max(0.5, p.x));
    const py = Math.min(height - 0.5, Math.max(0.5, p.y));
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    for (let r = 0; r < Math.max(width, height); r++) {
      let best: number | null = null;
      let bestDist = Infinity;
      for (let y = Math.max(0, cy - r); y <= Math.min(height - 1, cy + r); y++) {
        for (let x = Math.max(0, cx - r); x <= Math.min(width - 1, cx + r); x++) {
          if (Math.abs(x - cx) !== r && Math.abs(y - cy) !== r) continue;
          const dist = Math.hypot(x + 0.5 - px, y + 0.5 - py);
          if (dist < bestDist && ok(y * width + x)) {
            best = y * width + x;
            bestDist = dist;
          }
        }
      }
      if (best !== null) return best;
    }
    return null;
  };
  /**
   * Take a cell at the point: the point itself if there is floor there and nobody on this point (a guard in a passage, two prisoners in one
   * cell, as in the game level), otherwise the nearest one where one can stand.
   */
  const spots = new Set<string>();
  const place = (p: { x: number; y: number }): { x: number; y: number } | null => {
    const inside = p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
    const cell = inside && floor[cellOf(p)] && !spots.has(`${p.x},${p.y}`) ? cellOf(p) : nearest(p, standable);
    if (cell === null) return null;
    taken.add(cell);
    const at = cell === cellOf(p) && inside ? { x: p.x, y: p.y } : centre(cell);
    spots.add(`${at.x},${at.y}`);
    return at;
  };

  const roles = new Map(levelPeople(base).map((p) => [p.index, p]));
  const where = new Map<number, { x: number; y: number }>();
  // Important ones first (their spots matter more), then enemies, then the crowd.
  for (const [index, p] of roles) {
    if (p.role !== 'important') continue;
    const at = place(people.moved[p.key] ?? p.def);
    if (at) where.set(index, at);
  }
  const enemies = people.enemies.map((e): ObjectDef => {
    const at = place(e) ?? { x: e.x, y: e.y };
    return {
      kind: e.npc ? 'npc' : 'critter',
      pid: e.pid,
      x: at.x,
      y: at.y,
      ...(e.facing !== undefined ? { facing: e.facing } : {}),
      ...(e.script ? { script: e.script } : {}),
      ...(e.weapon ? { weapon: e.weapon } : {}),
    };
  });
  // The crowd does not stand where furniture and containers are: the game will not place an object with an NPC in the same cell.
  const furnished = new Set(layout.furniture.map(cellOf));
  const roomy = (cell: number) => standable(cell) && !furnished.has(cell);
  // Own room or yard: floor cells no farther than SCATTER from the spot, reachable without passing a door or fence.
  const barriers = new Set([...layout.doors, ...layout.fences].map(cellOf));
  const open = (cell: number) => !!floor[cell] && !barriers.has(cell);
  const yard = (start: number): number[] => {
    const sx = start % width;
    const sy = (start - sx) / width;
    const seen = new Set([start]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const x = queue[i]! % width;
      const y = (queue[i]! - x) / width;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        const next = ny * width + nx;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || Math.abs(nx - sx) > SCATTER || Math.abs(ny - sy) > SCATTER || seen.has(next) || !open(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return queue.filter(roomy);
  };
  for (const [index, p] of roles) {
    if (p.role !== 'crowd') continue;
    const home = p.def.x >= 0 && p.def.y >= 0 && p.def.x < width && p.def.y < height && open(cellOf(p.def)) ? cellOf(p.def) : nearest(p.def, open);
    const near = home === null ? [] : yard(home);
    const cell = near.length ? near[Math.min(near.length - 1, Math.floor(random() * near.length))]! : (nearest(p.def, roomy) ?? nearest(p.def, standable));
    if (cell === null) continue;
    taken.add(cell);
    where.set(index, centre(cell));
  }

  const out: ObjectDef[] = [];
  for (const [index, o] of objects) {
    const person = roles.get(index);
    if (person?.role === 'enemy') continue;
    const at = where.get(index);
    if (person && at) {
      const moved = at.x !== o.x || at.y !== o.y;
      // The crowd (always peaceful, npc) wanders in the game around the spot where it stood; the Brotherhood of Steel stays at its posts.
      const roam = roams(person);
      out.push({ ...person.def, x: at.x, y: at.y, ...(moved ? { home: { x: o.x, y: o.y } } : {}), ...(roam ? { roam: true as const } : {}) });
      continue;
    }
    // An item or body in a wall goes to the nearest floor.
    if ((o.kind === 'item' || o.kind === 'corpse') && !floor[cellOf(o)]) {
      const free = nearest(o, (c) => !!floor[c] && !reserved.has(c));
      if (free !== null) {
        out.push({ ...o, ...centre(free) });
        continue;
      }
    }
    out.push(o);
  }
  return [...out, ...enemies];
}

/** Game level into editor storeys: the level's floor is empty on storey 0, a wall of height h is one block on storeys 1…h. */
export function locationFromLevel(def: LevelDef, name = ''): EditorLocation {
  const parsed = parseLevelDef(def);
  const level = buildLevel(parsed);
  const { width, height } = parsed;
  const ground = emptyFloor(width, height);
  def.floorPaint?.forEach((texture, cell) => {
    if (texture && cell < ground.length) ground[cell] = floorBlockFor(texture);
  });
  def.paint?.rows.forEach((row, y) => {
    for (let x = 0; x < Math.min(row.length, width); x++) {
      const texture = def.paint!.legend[row[x]!];
      if (texture && y < height) ground[y * width + x] = floorBlockFor(texture);
    }
  });
  const floors: (string | null)[][] = [ground, emptyFloor(width, height)];
  for (let cell = 0; cell < width * height; cell++) {
    const texture = level.walls[cell];
    if (!texture) continue;
    const block = wallBlockFor(texture);
    const tall = Math.max(1, Math.ceil((level.heights?.[cell] || 1) - 1e-6));
    for (let f = 1; f <= Math.min(tall, LOCATION_LIMITS.floors - 1); f++) {
      while (floors.length <= f) floors.push(emptyFloor(width, height));
      floors[f]![cell] = block;
    }
  }
  // Hanging storeys of columns (ceilings, windows) and flat roofs go to their own storeys.
  const storeyBlock = (s: ColumnStorey): string => (s.window === 'round' ? ROUND_WINDOW_BLOCK : s.window ? WINDOW_BLOCK : wallBlockFor(s.texture));
  const putStorey = (x: number, y: number, storey: number, s: ColumnStorey) => {
    if (x < 0 || y < 0 || x >= width || y >= height || storey + 1 >= LOCATION_LIMITS.floors) return;
    while (floors.length <= storey + 1) floors.push(emptyFloor(width, height));
    floors[storey + 1]![y * width + x] = storeyBlock(s);
  };
  def.roof?.rows.forEach((row, y) => {
    for (let x = 0; x < Math.min(row.length, width); x++) {
      const texture = roofTexture(def.roof!, row[x]!);
      const edge = level.walls[y * width + x] ? def.roof!.edges?.[row[x]!] : undefined;
      if (texture) putStorey(x, y, 1, { texture: edge ?? texture });
    }
  });
  for (const c of def.columns ?? []) c.storeys.forEach((s, k) => s && putStorey(c.x, c.y, k, s));
  for (const o of parsed.objects) {
    if (o.kind !== 'door') continue;
    const cell = Math.floor(o.y) * width + Math.floor(o.x);
    if (cell >= 0 && cell < width * height) floors[1]![cell] = DOOR_BLOCK;
  }
  return { base: def.id, name, width, height, floors, marks: marksFromLevel(def), people: peopleFromLevel(def) };
}

/** Window frame without a wall in the column. */
const WINDOW_FRAME: TextureName = 'concrete';

/**
 * Editor storeys into a game level on top of level base: wall grid, columns (height, storey textures, hanging blocks,
 * windows), doors and floor. Doors that stood on the same cells keep their lock, key, sound and texture; NPCs: see
 * arrangePeople (random is for the crowd); other level objects stay as they were.
 */
export function levelFromLocation(loc: EditorLocation, base: LevelDef, random: () => number = Math.random): LevelDef {
  const parsed = parseLevelDef(base);
  const { width, height } = loc;
  const letters = new Map<TextureName, string>();
  const walls: Record<string, TextureName> = {};
  const letterFor = (texture: TextureName): string => {
    let letter = letters.get(texture);
    if (!letter) {
      letter = LETTERS[letters.size] ?? 'R';
      letters.set(texture, letter);
      walls[letter] = texture;
    }
    return letter;
  };
  const oldDoors = new Map<number, ObjectDef>();
  for (const o of parsed.objects) if (o.kind === 'door') oldDoors.set(Math.floor(o.y) * width + Math.floor(o.x), o);

  const grid: string[] = [];
  const columns: NonNullable<LevelDef['columns']> = [];
  const doors: ObjectDef[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const cell = y * width + x;
      // Cell storeys from bottom to top (storey 1 is storeys[0]): wall, window or gap; the door is separate, on storey 1.
      const storeys: (ColumnStorey | null)[] = [];
      /** Windows with their own frame (a window block from the library): their frame is not taken from the wall. */
      const ownFrames = new Set<ColumnStorey>();
      let door: BlockDef | null = null;
      for (let f = 1; f < loc.floors.length; f++) {
        const id = loc.floors[f]?.[cell] ?? null;
        const block = id ? blockIn(id, loc.blocks) : null;
        if (block?.kind === 'door' && f === 1) door = block;
        // A door above the first storey and a "floor" on a wall storey are a plain block with their own texture.
        const solid: ColumnStorey | null = block && (block.kind !== 'door' || f > 1) ? { texture: block.texture, window: block.id === ROUND_WINDOW_BLOCK ? 'round' : block.kind === 'window' || undefined } : null;
        if (solid?.window && block!.id !== WINDOW_BLOCK) ownFrames.add(solid);
        storeys.push(solid);
      }
      while (storeys.length && !storeys[storeys.length - 1]) storeys.pop();
      // The window frame comes from its column's wall.
      const frame = storeys.find((s) => s && !s.window)?.texture ?? WINDOW_FRAME;
      for (const s of storeys) if (s?.window && !ownFrames.has(s)) s.texture = frame;
      // A plain door stays as it was in the level (lock, key, sound, texture); a door from the library has its own texture and sound.
      // Whether it is locked is this door's edit on the map (locks); old custom blocks use their own lock.
      const lock = loc.locks?.[cell] ?? loc.blocks?.find((b) => b.id === door?.id)?.locked;
      if (door && door.id !== DOOR_BLOCK) {
        doors.push({ kind: 'door', x: x + 0.5, y: y + 0.5, texture: door.texture, ...(door.sound ? { sound: door.sound } : {}), ...(lock ? { locked: true } : {}) });
      } else if (door) {
        const old: ObjectDef = oldDoors.get(cell) ?? { kind: 'door', x: x + 0.5, y: y + 0.5 };
        doors.push(old.kind === 'door' && lock !== undefined ? { ...old, locked: lock || undefined } : old);
      }
      const first = storeys[0];
      row += first && !first.window ? letterFor(first.texture) : '.';
      // A one-storey wall is just a letter in the grid; the rest is a column.
      if (storeys.length > 1 || first?.window || (!first && storeys.length)) columns.push({ x, y, storeys });
    }
    grid.push(row);
  }
  const ground = loc.floors[0] ?? [];
  const floorPaint = Array.from({ length: width * height }, (_, cell) => {
    const id = ground[cell];
    return id ? (blockIn(id, loc.blocks)?.texture ?? null) : null;
  });
  const inside = (o: { x: number; y: number }) => o.x >= 0 && o.y >= 0 && o.x < width && o.y < height;
  // Transitions from the editor replace the level's exits, elevators and entrances; without them, as in the game level.
  const marks = loc.marks;
  // NPCs: all of them (anyone beyond the edge will stand inside); everything else only inside the location.
  const kept = [...parsed.objects.entries()].filter(([, o]) => o.kind !== 'door' && (!marks || (o.kind !== 'exit' && o.kind !== 'elevator')) && (o.kind === 'npc' || o.kind === 'critter' || inside(o)));
  const marked: ObjectDef[] = marks
    ? [
        ...marks.exits.map((e): ObjectDef => ({ kind: 'exit', x: e.x, y: e.y, to: { ...e.to }, ...(e.use ? { use: true } : {}), ...(e.look ? { look: e.look } : {}) })),
        ...marks.lifts.map((l): ObjectDef => ({ kind: 'elevator', x: l.x, y: l.y, floors: l.floors.map((f) => ({ ...f })), current: l.current, ...(l.art !== undefined ? { art: l.art } : {}) })),
      ]
    : [];
  const entries = Object.fromEntries(Object.entries(marks ? marks.entries : parsed.entries).filter(([, e]) => inside(e)));
  const transits = [...marked.filter(inside), ...doors];
  const decor = loc.decor && (Object.keys(loc.decor.moved).length || loc.decor.removed.length || loc.decor.added.length) ? loc.decor : undefined;
  const furniture = placedDecor(base, decor);
  const layout = { width, height, grid, columns, reserved: [...transits, ...Object.values(entries)], starts: Object.values(entries), furniture, doors, fences: levelFences(base) };
  const people = arrangePeople(kept, loc.people ?? peopleFromLevel(base), base, layout, random);
  return {
    ...base,
    grid,
    walls,
    marks: undefined,
    towers: undefined,
    // The level's roofs and floor are already in the columns and in floorPaint.
    roof: undefined,
    paint: undefined,
    columns: columns.length ? columns : undefined,
    decor,
    ceiling: loc.ceiling ?? base.ceiling,
    floorPaint: floorPaint.some(Boolean) ? floorPaint : undefined,
    objects: [...people, ...transits],
    entries,
  };
}

/** Variant into a file: blocks are replaced with letters (one table for all storeys). */
export function encodeLocation(loc: EditorLocation): LocationFile {
  const legend: Record<string, string> = {};
  const letterOf = new Map<string, string>();
  const floors = loc.floors.map((floor) => {
    const rows: string[] = [];
    for (let y = 0; y < loc.height; y++) {
      let row = '';
      for (let x = 0; x < loc.width; x++) {
        const id = floor[y * loc.width + x];
        if (!id) {
          row += '.';
          continue;
        }
        let letter = letterOf.get(id);
        if (!letter) {
          letter = LETTERS[letterOf.size] ?? '.';
          letterOf.set(id, letter);
          legend[letter] = id;
        }
        row += letter;
      }
      rows.push(row);
    }
    return rows;
  });
  return { format: LOCATION_FORMAT, version: 1, base: loc.base, name: loc.name, width: loc.width, height: loc.height, legend, floors, ...(loc.marks ? { marks: loc.marks } : {}), ...(loc.people ? { people: loc.people } : {}), ...(loc.decor ? { decor: loc.decor } : {}), ...(loc.blocks?.length ? { blocks: loc.blocks } : {}), ...(loc.locks && Object.keys(loc.locks).length ? { locks: loc.locks } : {}), ...(loc.ceiling ? { ceiling: loc.ceiling } : {}) };
}

/** Entrance name: letters, digits, hyphen, underscore (up to 40 characters). */
export const ENTRY_NAME = /^[\p{L}\p{N}_-]{1,40}$/u;

/** Transitions from a foreign file: only addresses of existing locations and points inside the map; anything invalid is dropped. */
function decodeMarks(raw: unknown, width: number, height: number, levels: Readonly<Record<string, LevelDef>>): EditorMarks | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<Record<keyof EditorMarks, unknown>>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  const at = (o: Record<string, unknown>) => {
    const x = num(o.x);
    const y = num(o.y);
    return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
  };
  const dest = (d: unknown): Destination | null => {
    if (!d || typeof d !== 'object') return null;
    const { map, entry } = d as Record<string, unknown>;
    if (typeof map !== 'string' || typeof entry !== 'string' || !ENTRY_NAME.test(entry)) return null;
    return map === 'wasteland' || map === 'worldmap' || Object.hasOwn(levels, map) ? { map, entry } : null;
  };
  const marks: EditorMarks = { entries: {}, exits: [], lifts: [] };
  if (r.entries && typeof r.entries === 'object') {
    for (const [name, e] of Object.entries(r.entries as Record<string, unknown>).slice(0, 64)) {
      const p = e && typeof e === 'object' ? at(e as Record<string, unknown>) : null;
      const angle = num((e as Record<string, unknown> | null)?.angle);
      if (p && ENTRY_NAME.test(name) && Number.isFinite(angle)) marks.entries[name] = { ...p, angle };
    }
  }
  for (const e of Array.isArray(r.exits) ? r.exits.slice(0, 256) : []) {
    const p = e && typeof e === 'object' ? at(e as Record<string, unknown>) : null;
    const to = dest((e as Record<string, unknown> | null)?.to);
    const look = (e as Record<string, unknown> | null)?.look;
    if (p && to)
      marks.exits.push({
        ...p,
        to,
        ...((e as Record<string, unknown>).use === true ? { use: true } : {}),
        ...((EXIT_LOOKS as readonly unknown[]).includes(look) ? { look: look as ExitLook } : {}),
      });
  }
  for (const l of Array.isArray(r.lifts) ? r.lifts.slice(0, 64) : []) {
    if (!l || typeof l !== 'object') continue;
    const o = l as Record<string, unknown>;
    const p = at(o);
    const floors = Array.isArray(o.floors) ? o.floors.slice(0, 12).map(dest) : [];
    const current = num(o.current);
    const art = num(o.art);
    if (!p || !floors.length || floors.some((f) => !f) || !Number.isInteger(current) || current < 0 || current >= floors.length) continue;
    marks.lifts.push({ ...p, floors: floors as Destination[], current, ...(Number.isInteger(art) && art >= 0 && art < 10000 ? { art } : {}) });
  }
  return marks;
}

/** Critter prototype (type 1 in the high byte) and item prototype (type 0), as in the player's copy files. */
const isCritterPid = (v: unknown): v is number => Number.isInteger(v) && (v as number) >>> 24 === 1 && ((v as number) & 0xffffff) > 0 && ((v as number) & 0xffffff) < 10000;
const isItemPid = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) < 100000;
/** Script name from SCRIPTS.LST: Latin letters and digits. */
const SCRIPT_NAME = /^[A-Z0-9_]{1,12}$/;

/**
 * NPCs from a foreign file: only this level's important NPCs can be moved, within the map; enemies are critters
 * of the player's copy with an item weapon, and the script can only be a shared enemy script. Anything invalid is dropped.
 */
function decodePeople(raw: unknown, width: number, height: number, base: LevelDef): EditorPeople | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const inside = (o: Record<string, unknown>) =>
    typeof o.x === 'number' && typeof o.y === 'number' && o.x >= 0 && o.y >= 0 && o.x < width && o.y < height ? { x: o.x, y: o.y } : null;
  const keys = new Set(levelPeople(base).filter((p) => p.role === 'important').map((p) => p.key));
  const people: EditorPeople = { moved: {}, enemies: [] };
  if (r.moved && typeof r.moved === 'object') {
    for (const [key, p] of Object.entries(r.moved as Record<string, unknown>).slice(0, 512)) {
      const at = p && typeof p === 'object' ? inside(p as Record<string, unknown>) : null;
      if (at && keys.has(key)) people.moved[key] = at;
    }
  }
  for (const e of Array.isArray(r.enemies) ? r.enemies.slice(0, 256) : []) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const at = inside(o);
    if (!at || !isCritterPid(o.pid)) continue;
    const mark: EnemyMark = { ...at, pid: o.pid };
    if (isItemPid(o.weapon)) mark.weapon = o.weapon;
    if (typeof o.facing === 'number' && Number.isFinite(o.facing)) mark.facing = o.facing;
    if (typeof o.script === 'string' && SCRIPT_NAME.test(o.script) && enemyScriptAllowed(o.script, base)) mark.script = o.script;
    if (o.npc === true) mark.npc = true;
    people.enemies.push(mark);
  }
  return people;
}

/**
 * Objects from a foreign file: only this level's original objects can be moved, only furniture can be removed, only
 * original furniture can be placed (prototypes from the map table); points inside the map. Anything invalid is dropped.
 */
function decodeDecor(raw: unknown, width: number, height: number, base: LevelDef): LevelDecor | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const inside = (o: unknown) => {
    if (!o || typeof o !== 'object') return null;
    const { x, y } = o as Record<string, unknown>;
    return typeof x === 'number' && typeof y === 'number' && x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
  };
  const items = new Map(levelDecor(base).map((d) => [d.key, d]));
  const decor: LevelDecor = { moved: {}, removed: [], added: [] };
  if (r.moved && typeof r.moved === 'object') {
    for (const [key, p] of Object.entries(r.moved as Record<string, unknown>).slice(0, 4096)) {
      const at = inside(p);
      if (at && items.has(key)) decor.moved[key] = at;
    }
  }
  for (const key of Array.isArray(r.removed) ? r.removed.slice(0, 4096) : []) {
    if (typeof key === 'string' && items.get(key)?.kind === 'furniture' && !decor.removed.includes(key)) decor.removed.push(key);
  }
  for (const a of Array.isArray(r.added) ? r.added.slice(0, 1024) : []) {
    const at = inside(a);
    const pid = (a as Record<string, unknown> | null)?.pid;
    if (at && typeof pid === 'number' && furnitureKinds().has(pid)) decor.added.push({ ...at, pid });
  }
  return decor;
}

/** Custom blocks from a foreign file: name own-<number>, kind floor, wall or door, texture from the game; anything invalid is dropped. */
function decodeBlocks(raw: unknown, textures: ReadonlySet<string>): CustomBlock[] {
  const blocks: CustomBlock[] = [];
  for (const b of Array.isArray(raw) ? raw.slice(0, 64) : []) {
    if (!b || typeof b !== 'object') continue;
    const { id, kind, texture, name, sound, locked } = b as Record<string, unknown>;
    if (typeof id !== 'string' || !CUSTOM_BLOCK_ID.test(id) || blocks.some((q) => q.id === id)) continue;
    if (kind !== 'floor' && kind !== 'wall' && kind !== 'door') continue;
    if (typeof texture !== 'string' || !textures.has(texture)) continue;
    const block: CustomBlock = { id, kind, texture: texture as TextureName, name: typeof name === 'string' ? name.trim().slice(0, 40) : id };
    if (kind === 'door' && typeof sound === 'string' && DOOR_SOUND.test(sound)) block.sound = sound;
    if (kind === 'door' && locked === true) block.locked = true;
    blocks.push(block);
  }
  return blocks;
}

/**
 * File into a variant, with validation: format and sizes, the game level is known (levels), blocks are from the list or textures
 * that exist in the game (textures). Unknown blocks and extra cells become empty. A corrupted file gives null.
 */
export function decodeLocation(raw: unknown, levels: Readonly<Record<string, LevelDef>>, textures: ReadonlySet<string>): EditorLocation | null {
  if (!raw || typeof raw !== 'object') return null;
  const file = raw as Partial<LocationFile>;
  if (file.format !== LOCATION_FORMAT || file.version !== 1) return null;
  if (typeof file.base !== 'string' || !Object.hasOwn(levels, file.base)) return null;
  const width = Number(file.width);
  const height = Number(file.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  if (width > LOCATION_LIMITS.size || height > LOCATION_LIMITS.size) return null;
  if (!Array.isArray(file.floors) || file.floors.length < 2) return null;
  const legend = file.legend && typeof file.legend === 'object' ? file.legend : {};
  const blocks = decodeBlocks(file.blocks, textures);
  const known = (id: unknown): string | null => (typeof id === 'string' && blockIn(id, blocks, textures) ? id : null);
  const floors = file.floors.slice(0, LOCATION_LIMITS.floors).map((rows) => {
    const floor = emptyFloor(width, height);
    if (!Array.isArray(rows)) return floor;
    for (let y = 0; y < Math.min(height, rows.length); y++) {
      const row = rows[y];
      if (typeof row !== 'string') continue;
      for (let x = 0; x < Math.min(width, row.length); x++) {
        const letter = row[x]!;
        if (letter !== '.' && Object.hasOwn(legend, letter)) floor[y * width + x] = known(legend[letter]);
      }
    }
    return floor;
  });
  const marks = decodeMarks(file.marks, width, height, levels);
  const people = decodePeople(file.people, width, height, levels[file.base]!);
  const decor = decodeDecor(file.decor, width, height, levels[file.base]!);
  // Door locks: cell index inside the map → yes/no.
  let locks: Record<number, boolean> | undefined;
  if (file.locks && typeof file.locks === 'object') {
    for (const [key, value] of Object.entries(file.locks).slice(0, 4096)) {
      const cell = Number(key);
      if (Number.isInteger(cell) && cell >= 0 && cell < width * height && typeof value === 'boolean') (locks ??= {})[cell] = value;
    }
  }
  return {
    base: file.base,
    name: typeof file.name === 'string' ? file.name.slice(0, 60) : '',
    width,
    height,
    floors,
    ...(marks ? { marks } : {}),
    ...(people ? { people } : {}),
    ...(decor ? { decor } : {}),
    ...(blocks.length ? { blocks } : {}),
    ...(locks ? { locks } : {}),
    ...(typeof file.ceiling === 'string' && textures.has(file.ceiling) ? { ceiling: file.ceiling as TextureName } : {}),
  };
}
