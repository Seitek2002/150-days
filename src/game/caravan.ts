// A caravan on the road through the wasteland (client decision, 2026-10-23). Having signed on as a guard, the hero chooses how the trip goes:
// fast — as in the original (the screen fades, time passes by itself, an ambush — on the ambush map) or the whole way on foot with the caravan.
// On foot the caravan (driver, guards, brahmin) walks the wasteland from location to location — through the middle of the squares, where there is always
// a passage. Around the caravan is a blue zone that moves with it: if the hero leaves it and doesn't come back within a few seconds,
// he has abandoned the caravan, no pay (like fleeing an ambush in the original). An ambush happens right on the road if the caravan master's script
// rolled one (the same Luck check as in the fast trip).
import type { Destination } from '../world/defs.ts';
import { PID } from '../world/pids.ts';
import { SQUARE_CELLS, SQUARE_HOURS } from '../world/wasteland.ts';
import { insideWorld, PLACES, terrainAt, type PlaceKey } from '../world/worldmap.ts';

export const CARAVAN = {
  /** Caravan speed, cells per second (the hero walking — 2.6: keeps up even walking). */
  speed: 1.8,
  /** Radius of the blue zone around the middle of the caravan, cells. */
  zone: 14,
  /** How many seconds one can stay outside the zone before the caravan leaves without the hero. */
  grace: 8,
  /** An enemy closer than this many cells to the caravan — the caravan stops, the guards fight back. */
  halt: 18,
  /** Distance between those walking in formation, cells. */
  gap: 2.2,
  /** How many game seconds one cell of the road takes (as on foot through the wasteland: a square — 8 hours). */
  secondsPerCell: (SQUARE_HOURS * 3600) / SQUARE_CELLS,
} as const;

/** Script global variables: caravan hiring ("Crimson Caravan", "Water Merchants", "Far Go Traders"). */
export const CARAVAN_JOBS = [199, 200, 201] as const;
/** Whether the caravan has a driver and how many guards (the CARENCTR ambush script places them by these variables). */
const DRIVER_VAR = 215;
const GUARDS_VAR = 216;
/** Hiring states with the caravan master in town: on the road, arrived, abandoned (the caravan's people are alive), the caravan died. */
export const JOB = { onWay: 1, arrived: 2, fled: 3, lost: 5 } as const;

/** Scripts that take the hero along with a caravan (drivers and caravan masters). */
export const CARAVAN_DRIVERS: ReadonlySet<string> = new Set(['KERI', 'WMCARVN', 'CARVLEAD', 'CCVAN', 'FGTVAN', 'WMVAN']);

export type CaravanRole = 'driver' | 'guard' | 'brahmin';

/** A person or brahmin of the caravan; hp — how much health is left (null — full, 0 — dead). */
export interface CaravanMember {
  pid: number;
  weaponPid: number;
  role: CaravanRole;
  hp: number | null;
}

/** A trip on foot with a caravan (saved in the game). */
export interface CaravanTrip {
  from: PlaceKey;
  to: PlaceKey;
  /** How many cells of road the head of the caravan has covered. */
  done: number;
  /** At which cell of the road the ambush is (null — no ambush). */
  ambushAt: number | null;
  ambushed: boolean;
  /** Where to enter when the caravan arrives (the entrance to the destination town). */
  arrive: Destination;
  /** The hiring variable (199–201) of this trip — by it the caravan master in town pays or not. */
  job: number | null;
  /** Formation: the driver in front, brahmin in the middle, guards on the flanks. */
  members: CaravanMember[];
  /** How many seconds the hero has already been outside the zone. */
  away: number;
  /** Deathclaws from the hero's curse have already attacked this caravan (wasteland.ts → CURSE). */
  clawed?: boolean;
}

export interface Point {
  x: number;
  y: number;
}

/** The middle of a square in cells of the whole wasteland — a free passage runs through it (a cross through the middle of the square). */
const middle = (column: number, row: number): Point => ({ x: column * SQUARE_CELLS + SQUARE_CELLS / 2 + 0.5, y: row * SQUARE_CELLS + SQUARE_CELLS / 2 + 0.5 });

/**
 * The caravan's road: from the middle of a square to the middle of a neighbouring one (up, down, sideways — through the passages, every square has them),
 * around water. Points are in cells of the whole wasteland, turns only.
 */
export function caravanRoute(from: PlaceKey, to: PlaceKey): Point[] {
  const a = PLACES[from];
  const b = PLACES[to];
  const key = (c: number, r: number) => `${c},${r}`;
  const prev = new Map<string, string | null>([[key(a.column, a.row), null]]);
  const queue: [number, number][] = [[a.column, a.row]];
  // First — a step towards the target: the road is straighter (fewer turns among equally short paths).
  const steps = (c: number, r: number): [number, number][] => {
    const all: [number, number][] = [
      [c + Math.sign(b.column - c), r],
      [c, r + Math.sign(b.row - r)],
      [c + 1, r],
      [c - 1, r],
      [c, r + 1],
      [c, r - 1],
    ];
    return all.filter(([x, y]) => x !== c || y !== r);
  };
  while (queue.length) {
    const [c, r] = queue.shift()!;
    if (c === b.column && r === b.row) break;
    for (const [nc, nr] of steps(c, r)) {
      const k = key(nc, nr);
      if (prev.has(k) || !insideWorld(nc, nr) || terrainAt(nc, nr) === 'water') continue;
      prev.set(k, key(c, r));
      queue.push([nc, nr]);
    }
  }
  const squares: Point[] = [];
  for (let k: string | null | undefined = key(b.column, b.row); k; k = prev.get(k)) {
    const [c, r] = k.split(',').map(Number) as [number, number];
    squares.unshift(middle(c, r));
  }
  if (squares.length === 0 || prev.get(key(b.column, b.row)) === undefined) return [middle(a.column, a.row), middle(b.column, b.row)];
  // Turns only: points on the same straight line aren't needed.
  return squares.filter((p, i) => {
    const before = squares[i - 1];
    const after = squares[i + 1];
    return !before || !after || (before.x - p.x) * (after.y - p.y) !== (before.y - p.y) * (after.x - p.x);
  });
}

const routes = new Map<string, Point[]>();
/** The trip's road (once per pair of locations). */
export function tripRoute(trip: Pick<CaravanTrip, 'from' | 'to'>): Point[] {
  const key = `${trip.from}>${trip.to}`;
  let route = routes.get(key);
  if (!route) routes.set(key, (route = caravanRoute(trip.from, trip.to)));
  return route;
}

/** Road length in cells. */
export function routeLength(route: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < route.length; i++) length += Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.y - route[i - 1]!.y);
  return length;
}

/** The road point `distance` cells from the start (before the start and after the end — the end itself) and the direction of travel there. */
export function routeAt(route: readonly Point[], distance: number): Point & { heading: number } {
  let left = Math.max(0, distance);
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!;
    const b = route[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const heading = Math.atan2(b.y - a.y, b.x - a.x);
    if (left <= length || i === route.length - 1) {
      const t = length > 0 ? Math.min(1, left / length) : 1;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading };
    }
    left -= length;
  }
  const only = route[0] ?? { x: 0, y: 0 };
  return { x: only.x, y: only.y, heading: 0 };
}

/** Place in formation: the i-th walks i gaps behind the head, slightly to the side (alternating left and right), brahmin in the middle. */
export function crewSpot(route: readonly Point[], done: number, index: number, role: CaravanRole): Point & { heading: number } {
  const p = routeAt(route, done - index * CARAVAN.gap);
  const side = role === 'brahmin' || index === 0 ? 0 : index % 2 ? 0.8 : -0.8;
  return { x: p.x - Math.sin(p.heading) * side, y: p.y + Math.cos(p.heading) * side, heading: p.heading };
}

/** The middle of the caravan — the centre of the blue zone. */
export function caravanMiddle(route: readonly Point[], trip: Pick<CaravanTrip, 'done' | 'members'>): Point {
  return routeAt(route, trip.done - ((trip.members.length - 1) * CARAVAN.gap) / 2);
}

/**
 * A new trip on foot. The roster is as in the original's ambush script (CARENCTR): the driver, if there is one, and one or two
 * guards per the variables the driver set before departure (none — the driver and a guard), plus two brahmin.
 * ambush — the caravan master's script rolled an ambush: it will happen somewhere in the middle of the road.
 */
export function newCaravanTrip(from: PlaceKey, to: PlaceKey, ambush: boolean, arrive: Destination, vars: Readonly<Record<string, number>>, rand: () => number = Math.random): CaravanTrip {
  const driver = vars[`g${DRIVER_VAR}`] ?? 0;
  const guardsVar = vars[`g${GUARDS_VAR}`] ?? 0;
  const guards = driver === 0 && guardsVar === 0 ? 1 : guardsVar >= 2 ? 2 : guardsVar >= 1 ? 1 : 0;
  const members: CaravanMember[] = [];
  if (driver !== 0 || guardsVar === 0) members.push({ pid: PID.leatherJacketMan, weaponPid: PID.shotgun, role: 'driver', hp: null });
  if (guards >= 1) members.push({ pid: PID.mercenaryD, weaponPid: PID.desertEagle44, role: 'guard', hp: null });
  members.push({ pid: PID.brahmin, weaponPid: 0, role: 'brahmin', hp: null }, { pid: PID.brahmin, weaponPid: 0, role: 'brahmin', hp: null });
  if (guards >= 2) members.push({ pid: PID.mercenaryD, weaponPid: PID.desertEagle44, role: 'guard', hp: null });
  const length = routeLength(tripRoute({ from, to }));
  // The head of the caravan starts slightly ahead of the middle of the location — the whole formation right behind it, on open ground.
  const done = Math.min(length, members.length * CARAVAN.gap);
  // This trip's hiring: with an ambush the driver left "on the road", without one — already "arrived".
  const wanted = ambush ? JOB.onWay : JOB.arrived;
  const job = CARAVAN_JOBS.find((n) => vars[`g${n}`] === wanted) ?? null;
  return { from, to, done, ambushAt: ambush ? done + (length - done) * (0.35 + rand() * 0.3) : null, ambushed: false, arrive, job, members, away: 0 };
}

/**
 * Who attacks the caravan on the road. In the original — mercenaries or mantises (the ambush script picks by location and dice);
 * ours — the same: more often armed men, sometimes a pack of mantises. The number is by the hero's level, like packs on the road.
 */
export function ambushPack(heroLevel: number, rand: () => number = Math.random): { pid: number; weaponPid: number }[] {
  const count = heroLevel <= 2 ? 2 + Math.floor(rand() * 2) : heroLevel <= 4 ? 3 + Math.floor(rand() * 2) : 4 + Math.floor(rand() * 2);
  if (rand() < 0.3) return Array.from({ length: count + 1 }, () => ({ pid: PID.mantis, weaponPid: 0 }));
  const guns = [PID.pistol10mm, PID.pistol10mm, PID.huntingRifle, PID.desertEagle44, PID.knife];
  return Array.from({ length: count }, () => ({
    pid: rand() < 0.5 ? PID.mercenaryB : PID.mercenaryE,
    weaponPid: guns[Math.floor(rand() * guns.length)]!,
  }));
}

/** Whether there are living caravan people (driver or guards): without them the caravan won't arrive. */
export const crewAlive = (trip: CaravanTrip): boolean => trip.members.some((m) => m.role !== 'brahmin' && m.hp !== 0);

/** Record the trip's outcome in the hiring variable — by it the caravan master in town pays (arrived) or not. */
export function settleJob(trip: CaravanTrip, vars: Record<string, number>, outcome: 'arrived' | 'fled' | 'lost'): void {
  if (trip.job === null) return;
  vars[`g${trip.job}`] = JOB[outcome];
}
