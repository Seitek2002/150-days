// A caravan on foot across the wasteland (src/game/caravan.ts): the road along the square passages, formation, members, trip outcome.
import { describe, expect, it } from 'vitest';
import { ambushPack, CARAVAN, caravanMiddle, crewSpot, JOB, newCaravanTrip, routeAt, routeLength, settleJob, tripRoute, type Point } from '../src/game/caravan.ts';
import { PID } from '../src/world/pids.ts';
import { SQUARE_CELLS, wastelandWindow, windowOrigin } from '../src/world/wasteland.ts';
import { PLACES, terrainAt, type PlaceKey } from '../src/world/worldmap.ts';

/** Trips of the original's caravan drivers: from the Hub to four towns and back. */
const TRIPS: [PlaceKey, PlaceKey][] = [
  ['hub', 'junktown'],
  ['hub', 'boneyard'],
  ['hub', 'necropolis'],
  ['hub', 'brotherhood'],
  ['junktown', 'hub'],
  ['boneyard', 'hub'],
  ['necropolis', 'hub'],
  ['brotherhood', 'hub'],
];

const middleOf = (key: PlaceKey): Point => ({ x: (PLACES[key].column + 0.5) * SQUARE_CELLS + 0.5, y: (PLACES[key].row + 0.5) * SQUARE_CELLS + 0.5 });

/** Whether a wasteland cell is free (in whole-wasteland cells): we build a window around its square. */
const windows = new Map<string, ReturnType<typeof wastelandWindow>>();
function freeAt(x: number, y: number): boolean {
  const column = Math.floor(x / SQUARE_CELLS);
  const row = Math.floor(y / SQUARE_CELLS);
  const key = `${column},${row}`;
  let w = windows.get(key);
  if (!w) windows.set(key, (w = wastelandWindow({ column, row }, () => false)));
  const o = windowOrigin(w.center);
  return w.def.grid[Math.floor(y - o.y)]![Math.floor(x - o.x)] === '.';
}

describe('caravan road', () => {
  it.each(TRIPS)('%s → %s: from the middle of a location to the middle of a location, in straight segments, avoiding water', (from, to) => {
    const route = tripRoute({ from, to });
    expect(route[0]).toEqual(middleOf(from));
    expect(route.at(-1)).toEqual(middleOf(to));
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!;
      const b = route[i]!;
      // Only along rows and columns of squares, through the cross-shaped passages.
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
    // Every cell of the path and the formation (up to 0.8 sideways) is free: the caravan will not run into rocks.
    const length = routeLength(route);
    for (let d = 0; d <= length; d += 0.5) {
      const p = routeAt(route, d);
      expect(terrainAt(Math.floor(p.x / SQUARE_CELLS), Math.floor(p.y / SQUARE_CELLS))).not.toBe('water');
      for (const side of [-0.8, 0, 0.8]) expect(freeAt(p.x - Math.sin(p.heading) * side, p.y + Math.cos(p.heading) * side)).toBe(true);
    }
  });

  it('road point: before the start is the start, after the end is the end', () => {
    const route = tripRoute({ from: 'hub', to: 'junktown' });
    expect(routeAt(route, -5)).toMatchObject(route[0]!);
    expect(routeAt(route, 1e6)).toMatchObject(route.at(-1)!);
    // The Hub and Junktown are in the same column: four squares to the north.
    expect(routeLength(route)).toBe(4 * SQUARE_CELLS);
    expect(routeAt(route, 10).y).toBeCloseTo(route[0]!.y - 10);
  });
});

describe('trip with a caravan', () => {
  const arrive = { map: 'junktown-ent', entry: 'wasteland' };

  it('members as in the ambush script: driver, two guards by the driver\'s variables, two brahmin', () => {
    const trip = newCaravanTrip('hub', 'junktown', false, arrive, { g215: 1, g216: 2, g200: JOB.arrived });
    expect(trip.members.map((m) => m.role)).toEqual(['driver', 'guard', 'brahmin', 'brahmin', 'guard']);
    expect(trip.members[0]!.pid).toBe(PID.leatherJacketMan);
    expect(trip.ambushAt).toBeNull();
    expect(trip.job).toBe(200);
  });

  it('without variables: driver and one guard; the ambush is somewhere mid-way', () => {
    const trip = newCaravanTrip('hub', 'brotherhood', true, arrive, { g199: JOB.onWay }, () => 0.5);
    expect(trip.members.map((m) => m.role)).toEqual(['driver', 'guard', 'brahmin', 'brahmin']);
    const length = routeLength(tripRoute(trip));
    expect(trip.ambushAt!).toBeGreaterThan(length * 0.3);
    expect(trip.ambushAt!).toBeLessThan(length * 0.7);
    expect(trip.job).toBe(199);
  });

  it('the formation starts behind the head: the whole caravan is on the road, the middle of the zone is between head and tail', () => {
    const trip = newCaravanTrip('hub', 'junktown', false, arrive, { g215: 1, g216: 2 });
    const route = tripRoute(trip);
    const head = crewSpot(route, trip.done, 0, 'driver');
    const tail = crewSpot(route, trip.done, trip.members.length - 1, 'guard');
    expect(Math.hypot(head.x - tail.x, head.y - tail.y)).toBeGreaterThan(CARAVAN.gap * 3);
    const middle = caravanMiddle(route, trip);
    expect(Math.hypot(middle.x - head.x, middle.y - head.y)).toBeLessThan(CARAVAN.zone);
  });

  it('the trip outcome is in the hiring variable: arrived, abandoned, died', () => {
    const trip = newCaravanTrip('hub', 'junktown', true, arrive, { g201: JOB.onWay });
    const vars: Record<string, number> = { g201: JOB.onWay };
    settleJob(trip, vars, 'arrived');
    expect(vars.g201).toBe(JOB.arrived);
    settleJob(trip, vars, 'fled');
    expect(vars.g201).toBe(JOB.fled);
    settleJob(trip, vars, 'lost');
    expect(vars.g201).toBe(JOB.lost);
  });

  it('ambush: armed mercenaries or a pack of mantises, more of them for a strong hero', () => {
    const weak = ambushPack(1, () => 0.9);
    const strong = ambushPack(8, () => 0.9);
    expect(weak.length).toBeLessThan(strong.length);
    expect(weak.every((a) => a.weaponPid > 0)).toBe(true);
    expect(ambushPack(3, () => 0.1).every((a) => a.pid === PID.mantis)).toBe(true);
  });
});
