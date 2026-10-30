// Travel target and fast travel on the world map (the client's decision): calculations only, no screen.
// The target is a location or any point on the world map; it is stored in session variables, so it ends up in the save.
import { SQUARE_HOURS } from '../world/wasteland.ts';
import { insideWorld, PLACE_GVARS, PLACES, type PlaceKey } from '../world/worldmap.ts';

/** Travel target: a location or any point on the world map, in squares, fractional (16.5 is the middle of square 16). */
export type TravelTarget = { place: PlaceKey } | { point: { x: number; y: number } };

export const PLACE_KEYS = Object.keys(PLACES) as PlaceKey[];

/**
 * World map fog (the client's decision): open are the squares the hero walked through or saw around himself.
 * How many squares around are visible is constant for now; later it will depend on Perception (plan, section 5, SPECIAL).
 */
export const REVEAL_RADIUS = 1;

/** Whether a world map square is open. */
export const isRevealed = (vars: Record<string, number>, column: number, row: number): boolean => vars[`wm:${column},${row}`] === 1;

/** Open the squares around a world map point (in squares, fractional). */
export function revealAround(vars: Record<string, number>, at: { x: number; y: number }, radius = REVEAL_RADIUS): void {
  const cx = Math.floor(at.x);
  const cy = Math.floor(at.y);
  for (let row = cy - radius; row <= cy + radius; row++) {
    for (let column = cx - radius; column <= cx + radius; column++) {
      if (insideWorld(column, row)) vars[`wm:${column},${row}`] = 1;
    }
  }
}

/** Open the squares along the road (fast travel): the step is half a square. */
export function revealPath(vars: Record<string, number>, from: { x: number; y: number }, to: { x: number; y: number }, radius = REVEAL_RADIUS): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 2));
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    revealAround(vars, { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }, radius);
  }
}

/**
 * What the hero knows about a location: 0 nothing, 1 heard of it (the location is on the map), 2 has been there. Heard can also come from critters: their scripts
 * set the original's location variable (PLACE_GVARS); "has been" is remembered both by us and in it.
 */
export const placeState = (vars: Record<string, number>, key: PlaceKey): number =>
  Math.min(2, Math.max(vars[`place:${key}`] ?? 0, ...PLACE_GVARS[key].map((n) => vars[`g${n}`] ?? 0)));

/** The hero arrived at a location: "has been there" is stored by us and in the original's variable (scripts ask whether the hero has been, for example, to the Brotherhood). */
export function markVisited(vars: Record<string, number>, key: PlaceKey): void {
  vars[`place:${key}`] = 2;
  vars[`g${PLACE_GVARS[key][0]!}`] = 2;
}

/** The middle of a location on the world map (in squares). */
export const placePoint = (key: PlaceKey) => ({ x: PLACES[key].column + 0.5, y: PLACES[key].row + 0.5 });

/** Where the target is on the world map (in squares). */
export const targetPoint = (target: TravelTarget) => ('place' in target ? placePoint(target.place) : target.point);

/** How many game hours to walk in a straight line between world map points (the same as on foot: SQUARE_HOURS per square). */
export const travelHours = (from: { x: number; y: number }, to: { x: number; y: number }) => Math.hypot(to.x - from.x, to.y - from.y) * SQUARE_HOURS;

/**
 * The target from session variables. Not chosen means the first location the hero has heard of but has not visited yet;
 * removed by the player (wl:target = −1) means no targets.
 */
export function readTarget(vars: Record<string, number>): TravelTarget | null {
  const chosen = vars['wl:target'] ?? 0;
  if (chosen === -1) return null;
  const place = PLACE_KEYS[chosen - 1];
  if (place && placeState(vars, place) >= 1) return { place };
  const x = vars['wl:tx'];
  const y = vars['wl:ty'];
  if (x !== undefined && y !== undefined) return { point: { x, y } };
  const next = PLACE_KEYS.find((key) => placeState(vars, key) === 1);
  return next ? { place: next } : null;
}

/** Write the target to session variables; null removes the target. */
export function writeTarget(vars: Record<string, number>, target: TravelTarget | null): void {
  delete vars['wl:tx'];
  delete vars['wl:ty'];
  if (!target) {
    vars['wl:target'] = -1;
    return;
  }
  if ('place' in target) {
    vars['wl:target'] = PLACE_KEYS.indexOf(target.place) + 1;
    return;
  }
  vars['wl:target'] = 0;
  vars['wl:tx'] = target.point.x;
  vars['wl:ty'] = target.point.y;
}
