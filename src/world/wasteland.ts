// First-person wasteland (client decision): assembled by itself from the world map squares (src/world/worldmap.ts).
// A world map square is a SQUARE_CELLS×SQUARE_CELLS patch of our cells. The terrain type decides how many rocks,
// cliffs and ruins are there; water is a wall. The game holds a 3×3-square window around the hero at a time: step into a neighboring square and
// the window is rebuilt around it. Everything in a square is predictable: the same square has the same cliffs and the same animals
// (killed ones do not come back: the session remembers them by their tags). Closer to the Boneyard are city ruins: first one-storey houses,
// then two or three storeys, and high-rises right by the Boneyard (CITY_RUINS).
import type { TextureName } from '../engine/textures.ts';
import { FACING, type Destination, type Entry, type LevelDef, type ObjectDef } from './defs.ts';
import { PID } from './pids.ts';
import { insideWorld, PLACES, terrainAt, type PlaceKey, type Square, type Terrain } from './worldmap.ts';

export const WASTELAND = 'wasteland';
/** Side of a world map square in our cells: about 25 seconds walking, 15 running. */
export const SQUARE_CELLS = 64;
/** How many kilometers a square spans (for the compass). */
export const SQUARE_KM = 15;
/** How many game hours a square takes on foot: travel time counts toward the 150 days. */
export const SQUARE_HOURS = 8;
/**
 * A location's zone is a green circle around the center of its square (as on the original world map): inside, time passes normally,
 * not at "road" speed. Closer than ARRIVE_RADIUS to the center of a built location means a transition to its level.
 */
export const ZONE_RADIUS = 12;
export const ARRIVE_RADIUS = 4;

/** Encounters on the road (besides packs that live in squares): after how many cells of travel the next one comes. */
export const EVENT_EVERY = { min: 30, max: 55 } as const;

/** Finds on the road: what can lie on the ground and how many (min to max). */
export const STASH: { pid: number; min: number; max: number }[] = [
  { pid: PID.ammo10mmJhp, min: 6, max: 18 },
  { pid: PID.stimpak, min: 1, max: 1 },
  { pid: PID.caps, min: 5, max: 40 },
  { pid: PID.flare, min: 1, max: 2 },
];
/** The window is 3×3 squares. */
const WINDOW = 3;

/** Where a location leads if it is already built (reaching the center of its square triggers a transition). */
export const PLACE_ENTRANCES: Partial<Record<PlaceKey, Destination>> = {
  vault13: { map: 'cave', entry: 'outside' },
  vault15: { map: 'vault15-entrance', entry: 'wasteland' },
  shadySands: { map: 'shady-sands-w', entry: 'wasteland' },
  junktown: { map: 'junktown-ent', entry: 'wasteland' },
  hub: { map: 'hub-ent', entry: 'wasteland' },
  raiders: { map: 'raiders', entry: 'wasteland' },
  necropolis: { map: 'necro-hotel', entry: 'wasteland' },
  brotherhood: { map: 'brotherhood-ent', entry: 'wasteland' },
  glow: { map: 'glow-ent', entry: 'wasteland' },
  boneyard: { map: 'boneyard-followers', entry: 'wasteland' },
  militaryBase: { map: 'mbase-ent', entry: 'wasteland' },
  cathedral: { map: 'cathedral-ent', entry: 'wasteland' },
};

/**
 * Locations the story destroys: when the original story variable is nonzero, the entrance leads to the ruins (our "after the
 * end" maps, `src/world/levels/after-end.ts`). 17: the Military Base vats are blown up, 18: the Cathedral is destroyed by a bomb.
 */
export const PLACE_RUINS: Partial<Record<PlaceKey, { gvar: number; door: Destination }>> = {
  militaryBase: { gvar: 17, door: { map: 'mbase-dead', entry: 'wasteland' } },
  cathedral: { gvar: 18, door: { map: 'cathedral-dead', entry: 'wasteland' } },
};

/** Where a location leads now: to the ruins if the story destroyed it, otherwise the normal entrance. */
export function placeEntrance(key: PlaceKey, vars: Readonly<Record<string, number>>): Destination | undefined {
  const ruins = PLACE_RUINS[key];
  if (ruins && (vars[`g${ruins.gvar}`] ?? 0) !== 0) return ruins.door;
  return PLACE_ENTRANCES[key];
}

const FLOOR = 46; // '.'
const ROCK = 82; // 'R': rock
const RUIN = 35; // '#': wall rubble
const WATER = 119; // 'w': water

/** Line numbers of location names in GAME\MAP.MSG of the player's copy: the game reads the names themselves from there. */
export const PLACE_NAME_MSG: Record<PlaceKey, number> = {
  vault13: 106,
  vault15: 107,
  shadySands: 125,
  junktown: 110,
  hub: 136,
  necropolis: 103,
  brotherhood: 113,
  boneyard: 128,
  militaryBase: 130,
  cathedral: 117,
  raiders: 124,
  glow: 127,
};

/** Obstacles in a square: how many "patches" per cell, their radius and how many wall fragments. */
const OBSTACLES: Record<Terrain, { blobs: number; min: number; max: number; ruins: number }> = {
  desert: { blobs: 0.0016, min: 0, max: 2, ruins: 0 },
  mountains: { blobs: 0.009, min: 1, max: 4, ruins: 0 },
  ruins: { blobs: 0.0015, min: 0, max: 1, ruins: 0.004 },
  town: { blobs: 0.0006, min: 0, max: 1, ruins: 0 },
  water: { blobs: 0, min: 0, max: 0, ruins: 0 },
};

/**
 * Ruins on the way to the Boneyard (Los Angeles; client, 2026-10-24): the closer a square is to it (in world map squares),
 * the more buildings and the taller they are. Rows go from nearest: up to what distance, how many buildings, storey count.
 */
const CITY = PLACES.boneyard;
export const CITY_RUINS: readonly { within: number; count: number; min: number; max: number }[] = [
  { within: 1.5, count: 8, min: 6, max: 18 },
  { within: 2.5, count: 7, min: 3, max: 6 },
  { within: 3.5, count: 6, min: 2, max: 3 },
  { within: 4.5, count: 5, min: 1, max: 2 },
  { within: 5.5, count: 3, min: 1, max: 1 },
];
/** Walls by storey count: houses get plaster and brick, taller ones dark concrete, high-rises a facade with empty windows. */
const ruinTexture = (storeys: number): TextureName =>
  storeys <= 1 ? 'stucco' : storeys <= 3 ? 'oldBrick' : storeys <= 6 ? 'darkConcrete' : 'ruinFacade';

/**
 * Wasteland animals: the chance of a pack in a square and which kinds occur (the same for road encounters). A pack is in 20% of squares
 * (client decision, 2026-10-20: it was 30–50%, and ammo went to the road rather than to quests).
 */
export const ENCOUNTERS: Record<Terrain, { chance: number; kinds: number[] }> = {
  desert: { chance: 0.2, kinds: [PID.pigRat, PID.smallRadscorpion, PID.caveRat] },
  mountains: { chance: 0.2, kinds: [PID.weakMoleRat, PID.smallRadscorpion, PID.radRat] },
  ruins: { chance: 0.2, kinds: [PID.radRat, PID.pigRat, PID.toughRat] },
  town: { chance: 0, kinds: [] },
  water: { chance: 0, kinds: [] },
};

/** Squad fighter: prototype and weapon in hand (0 means its own). The first in the squad is the leader. */
export interface SquadMember {
  pid: number;
  weaponPid: number;
}
export type SquadKind = 'mutants' | 'deathclaws' | 'curse';
export interface Squad {
  kind: SquadKind;
  members: SquadMember[];
}

/**
 * Late wasteland enemies: squads with a leader (client, 2026-10-27: there was no fear left in the late game). From which hero
 * level, what share of animal encounters become such an encounter, where they occur and how many fighters besides the leader.
 * Super mutants follow a lieutenant; deathclaws come as a pack, sometimes led by a mother.
 */
export const LATE_SQUADS = {
  mutants: {
    fromLevel: 9,
    share: 0.3,
    terrain: ['desert', 'mountains', 'ruins'] as Terrain[],
    leader: { pid: PID.superMutantLieutenant, weaponPid: PID.minigun },
    followers: [
      { pid: PID.superMutantEvil, weaponPid: PID.minigun },
      { pid: PID.superMutantMad, weaponPid: PID.minigun },
      { pid: PID.superMutantDeadly, weaponPid: PID.rocketLauncher },
    ],
    count: { min: 2, max: 3 },
  },
  deathclaws: {
    fromLevel: 12,
    share: 0.15,
    terrain: ['desert', 'mountains'] as Terrain[],
    /** Share of packs led by a mother. */
    mother: 0.35,
    count: { min: 2, max: 3 },
  },
} as const;

/**
 * The deathclaw mother's curse (client, 2026-10-27): with the mother's blood on the hero's hands, deathclaws follow his trail across the whole
 * wasteland. A session variable; what share of road encounters are deathclaws; how many; experience for them as for this animal (rat);
 * at what share of the route of a caravan the hero travels with they attack the caravan.
 */
export const CURSE = {
  variable: 'pc:clawCurse',
  share: 0.5,
  count: { min: 2, max: 3 },
  experienceOf: PID.caveRat,
  caravanAt: 0.4,
} as const;

/** Deathclaw pack that follows the cursed hero's trail. */
export function curseSquad(rand: () => number = Math.random): Squad {
  const n = CURSE.count.min + Math.floor(rand() * (CURSE.count.max - CURSE.count.min + 1));
  return { kind: 'curse', members: Array.from({ length: n }, () => ({ pid: PID.deathclaw, weaponPid: 0 })) };
}

/** Squad for a road encounter (null means the terrain's usual animals). */
export function lateSquad(heroLevel: number, terrain: Terrain, cursed: boolean, rand: () => number = Math.random): Squad | null {
  const between = (r: { min: number; max: number }) => r.min + Math.floor(rand() * (r.max - r.min + 1));
  if (terrain === 'town' || terrain === 'water') return null;
  if (cursed && rand() < CURSE.share) return curseSquad(rand);
  const claws = LATE_SQUADS.deathclaws;
  if (heroLevel >= claws.fromLevel && claws.terrain.includes(terrain) && rand() < claws.share) {
    const pack = Array.from({ length: between(claws.count) }, () => ({ pid: PID.deathclaw, weaponPid: 0 }));
    return { kind: 'deathclaws', members: rand() < claws.mother ? [{ pid: PID.motherDeathclaw, weaponPid: 0 }, ...pack] : pack };
  }
  const mutants = LATE_SQUADS.mutants;
  if (heroLevel >= mutants.fromLevel && mutants.terrain.includes(terrain) && rand() < mutants.share) {
    const followers = Array.from({ length: between(mutants.count) }, () => ({ ...mutants.followers[Math.floor(rand() * mutants.followers.length)]! }));
    return { kind: 'mutants', members: [{ ...mutants.leader }, ...followers] };
  }
  return null;
}

export interface WastelandWindow {
  center: Square;
  def: LevelDef;
  /** Tag of each level object in order ("column,row:index"): the session remembers the killed by it. */
  tags: string[];
}

/** Top-left corner of the window in cells of the whole wasteland. */
export const windowOrigin = (center: Square) => ({ x: (center.column - 1) * SQUARE_CELLS, y: (center.row - 1) * SQUARE_CELLS });

/** World map square under a window point. */
export function squareAt(center: Square, x: number, y: number): Square {
  const o = windowOrigin(center);
  return { column: Math.floor((o.x + x) / SQUARE_CELLS), row: Math.floor((o.y + y) / SQUARE_CELLS) };
}

/** Center of a square in window coordinates (may be outside the window, for the compass). */
export function squareMiddle(center: Square, square: Square): { x: number; y: number } {
  const o = windowOrigin(center);
  return { x: (square.column + 0.5) * SQUARE_CELLS - o.x, y: (square.row + 0.5) * SQUARE_CELLS - o.y };
}

/** Predictable random number generator (mulberry32). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedOf = (square: Square) => (Math.imul(square.column + 101, 73856093) ^ Math.imul(square.row + 211, 19349663)) >>> 0;

/** Build the 3×3-square window around center. isDead tells whether the animal with this tag was killed. */
export function wastelandWindow(center: Square, isDead: (tag: string) => boolean): WastelandWindow {
  const size = SQUARE_CELLS * WINDOW;
  const cells = new Uint8Array(size * size).fill(FLOOR);
  const objects: ObjectDef[] = [];
  const tags: string[] = [];
  const towers: NonNullable<LevelDef['towers']> = [];
  for (let dy = 0; dy < WINDOW; dy++) {
    for (let dx = 0; dx < WINDOW; dx++) {
      const square = { column: center.column - 1 + dx, row: center.row - 1 + dy };
      fillSquare(cells, size, dx * SQUARE_CELLS, dy * SQUARE_CELLS, square, objects, tags, isDead, towers);
    }
  }
  // Entry points at the locations in the window: slightly south of the center (inside the green zone), facing south, from the location into the wasteland.
  const entries: Record<string, Entry> = {};
  const glow: { x: number; y: number; radius: number }[] = [];
  for (const key of Object.keys(PLACES) as PlaceKey[]) {
    const p = PLACES[key];
    if (Math.abs(p.column - center.column) > 1 || Math.abs(p.row - center.row) > 1) continue;
    const m = squareMiddle(center, p);
    entries[key] = { x: m.x, y: m.y + ARRIVE_RADIUS + 3, angle: FACING.south };
    glow.push({ x: m.x, y: m.y, radius: ZONE_RADIUS });
  }
  // The window center, in case of loading without a location.
  entries.middle = { x: size / 2, y: size / 2, angle: FACING.south };
  const grid: string[] = [];
  for (let y = 0; y < size; y++) grid.push(String.fromCharCode(...cells.subarray(y * size, (y + 1) * size)));
  const def: LevelDef = {
    id: WASTELAND,
    title: { ru: 'Пустошь', en: 'Wasteland' },
    original: 'WASTELAND',
    outdoor: true,
    glow,
    // Music of the original world map.
    music: '03WRLDMP',
    floor: 'sand',
    ceiling: 'rockCeiling',
    fade: 22,
    grid,
    // Wall rubble in the wasteland is concrete ruins.
    walls: { w: 'water', '#': 'ruin' },
    ...(towers.length ? { towers } : {}),
    objects,
    entries,
  };
  return { center, def, tags };
}

function fillSquare(
  cells: Uint8Array,
  size: number,
  ox: number,
  oy: number,
  square: Square,
  objects: ObjectDef[],
  tags: string[],
  isDead: (tag: string) => boolean,
  towers: NonNullable<LevelDef['towers']>,
): void {
  const S = SQUARE_CELLS;
  const set = (x: number, y: number, code: number) => {
    if (x >= 0 && y >= 0 && x < S && y < S) cells[(oy + y) * size + ox + x] = code;
  };
  const get = (x: number, y: number) => cells[(oy + y) * size + ox + x];
  const fill = (code: number) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) set(x, y, code);
  };
  // Beyond the edge of the world, cliffs; water is a wall: it cannot be crossed.
  if (!insideWorld(square.column, square.row)) return fill(ROCK);
  const terrain = terrainAt(square.column, square.row) ?? 'water';
  if (terrain === 'water') return fill(WATER);

  const rand = rng(seedOf(square));
  const o = OBSTACLES[terrain];
  // Rocks and cliffs are irregular "patches".
  for (let i = Math.round(S * S * o.blobs); i > 0; i--) {
    const cx = Math.floor(rand() * S);
    const cy = Math.floor(rand() * S);
    const r = o.min + Math.floor(rand() * (o.max - o.min + 1));
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r + rand() * r) set(cx + x, cy + y, ROCK);
      }
    }
  }
  // Ruins are wall fragments in a straight line, sometimes with a corner.
  for (let i = Math.round(S * S * o.ruins); i > 0; i--) {
    let x = Math.floor(rand() * S);
    let y = Math.floor(rand() * S);
    const horizontal = rand() < 0.5;
    const length = 3 + Math.floor(rand() * 7);
    for (let k = 0; k < length; k++) set(horizontal ? x + k : x, horizontal ? y : y + k, RUIN);
    if (rand() < 0.4) {
      x = horizontal ? x + length - 1 : x;
      y = horizontal ? y : y + length - 1;
      for (let k = 0; k < 4; k++) set(horizontal ? x : x + k, horizontal ? y + k : y, RUIN);
    }
  }
  cityRuins(square, ox, oy, set, towers);
  // Passages: a cross through the square's center and the area around the center are kept free, so one can always pass into a neighboring square.
  const mid = S / 2;
  for (let t = 0; t < S; t++) {
    for (let w = -1; w <= 1; w++) {
      set(t, mid + w, FLOOR);
      set(mid + w, t, FLOOR);
    }
  }
  // The whole green zone at a location is free, so it is fully visible.
  const clear = terrain === 'town' ? ZONE_RADIUS + 1 : 8;
  for (let y = -clear; y <= clear; y++) for (let x = -clear; x <= clear; x++) if (x * x + y * y <= clear * clear) set(mid + x, mid + y, FLOOR);

  // An animal pack: farther from the center (the road runs there and the locations stand there), on free cells.
  const e = ENCOUNTERS[terrain];
  if (rand() >= e.chance || e.kinds.length === 0) return;
  const pid = e.kinds[Math.floor(rand() * e.kinds.length)]!;
  const count = 2 + Math.floor(rand() * 3);
  let cx = 0;
  let cy = 0;
  for (let tries = 0; tries < 30; tries++) {
    cx = 4 + Math.floor(rand() * (S - 8));
    cy = 4 + Math.floor(rand() * (S - 8));
    if (Math.hypot(cx - mid, cy - mid) >= ZONE_RADIUS + 4 && get(cx, cy) === FLOOR) break;
  }
  for (let i = 0; i < count; i++) {
    const tag = `${square.column},${square.row}:${i}`;
    for (let tries = 0; tries < 12; tries++) {
      const x = cx + Math.floor(rand() * 5) - 2;
      const y = cy + Math.floor(rand() * 5) - 2;
      if (x < 0 || y < 0 || x >= S || y >= S || get(x, y) !== FLOOR) continue;
      if (!isDead(tag)) {
        objects.push({ kind: 'critter', pid, x: ox + x + 0.5, y: oy + y + 0.5 });
        tags.push(tag);
      }
      break;
    }
  }
}

/**
 * City buildings in a square (CITY_RUINS). A house of up to three storeys is a box: empty inside, an opening in the middle of one wall, part
 * of a wall collapsed, in places one storey lower. Taller ones are high-rises: a solid mass, ragged top, one quarter collapsed to half height.
 * Its own random numbers, so everything else in the square (cliffs, animals) does not change because of the buildings.
 */
function cityRuins(
  square: Square,
  ox: number,
  oy: number,
  set: (x: number, y: number, code: number) => void,
  towers: NonNullable<LevelDef['towers']>,
): void {
  const d = Math.hypot(square.column - CITY.column, square.row - CITY.row);
  const tier = CITY_RUINS.find((t) => d <= t.within);
  if (!tier) return;
  const S = SQUARE_CELLS;
  const rand = rng(seedOf(square) ^ 0x5bd1e995);
  for (let n = 0; n < tier.count; n++) {
    const storeys = tier.min + Math.floor(rand() * (tier.max - tier.min + 1));
    const w = 4 + Math.floor(rand() * 4);
    const h = 4 + Math.floor(rand() * 3);
    const x0 = 2 + Math.floor(rand() * (S - w - 4));
    const y0 = 2 + Math.floor(rand() * (S - h - 4));
    const texture = ruinTexture(storeys);
    const tall = storeys > 3;
    // The opening is in the middle of one of the house's walls.
    const side = Math.floor(rand() * 4);
    const door = side < 2 ? { x: x0 + Math.floor(w / 2), y: side === 0 ? y0 : y0 + h - 1 } : { x: side === 2 ? x0 : x0 + w - 1, y: y0 + Math.floor(h / 2) };
    const fallen = Math.floor(rand() * 4);
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
        const corner = (x === x0 || x === x0 + w - 1) && (y === y0 || y === y0 + h - 1);
        let cell: number;
        if (tall) {
          cell = Math.max(1, Math.round(storeys * (0.6 + 0.4 * rand())));
          const quarter = (x < x0 + w / 2 ? 0 : 1) + (y < y0 + h / 2 ? 0 : 2);
          if (quarter === fallen) cell = Math.max(2, Math.floor(cell * 0.5));
        } else {
          if (!edge || (x === door.x && y === door.y)) continue;
          if (!corner && rand() < 0.15) continue;
          cell = Math.max(1, storeys - (rand() < 0.3 ? 1 : 0));
        }
        set(x, y, RUIN);
        towers.push({ x0: ox + x, y0: oy + y, x1: ox + x + 1, y1: oy + y + 1, height: cell, texture });
      }
    }
  }
}
