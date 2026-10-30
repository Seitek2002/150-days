// Original objects on the map for the location editor: furniture and scenery without a script (cabinets, tables, trees, rocks,
// markings), containers and scenery with a script. Where they stand comes from the original hex (the map-scripts.ts table and
// the level's hexFrame); what they become (block, picture, markings) is decided by the game from the image name in the player's copy.
// What the editor allows (Opus decision, stage 5): furniture and scenery can be moved, removed, or new ones placed from the list;
// containers (they hold items and appear in quests) and scripted scenery (computers, hatches) can only be moved.
import { hexCenter } from '../game/hex.ts';
import type { LevelDecor, LevelDef } from './defs.ts';
import { MAP_SCRIPTS } from './map-scripts.ts';

/** Kind of object: furniture without a script, container, scenery with a script. */
export type DecorKind = 'furniture' | 'container' | 'prop';

/** An original object on this level: key (f<number> furniture, k<number> container, s<hex> scripted). */
export interface DecorItem {
  key: string;
  kind: DecorKind;
  /** Prototype: scenery (furniture, scripted) or item (container). */
  pid: number;
  /** Where it stands in the game level (cells, fractional). */
  x: number;
  y: number;
}

/** Original objects of the level (this floor of the original map). No link to the original means empty. */
export function levelDecor(def: LevelDef): DecorItem[] {
  const table = MAP_SCRIPTS[(def.original ?? '').toUpperCase()];
  const frame = def.hexFrame;
  if (!table || !frame) return [];
  const elevation = def.elevation ?? 0;
  const at = (tile: number) => def.spots?.[tile] ?? hexCenter(frame, tile);
  const items: DecorItem[] = [];
  table.furniture.forEach(([e, tile, pid], i) => {
    if (e === elevation) items.push({ key: `f${i}`, kind: 'furniture', pid, ...at(tile) });
  });
  table.containers.forEach(([e, tile, pid], i) => {
    if (e === elevation) items.push({ key: `k${i}`, kind: 'container', pid, ...at(tile) });
  });
  for (const [e, tile, pid] of table.scenery ?? []) if (e === elevation) items.push({ key: `s${tile}`, kind: 'prop', pid, ...at(tile) });
  return items;
}

/** Fence pieces of the level (for us they are not walls, the game places them as blocks): crowds do not stand behind a fence (brahmin stay in the pen). */
export function levelFences(def: LevelDef): { x: number; y: number }[] {
  const table = MAP_SCRIPTS[(def.original ?? '').toUpperCase()];
  const frame = def.hexFrame;
  if (!table || !frame) return [];
  const elevation = def.elevation ?? 0;
  return (table.wallDecor ?? []).filter(([e, , kind]) => e === elevation && kind === 'fence').map(([, tile]) => def.spots?.[tile] ?? hexCenter(frame, tile));
}

/** All original furniture prototypes: the "Place object" list is built from them (and only they can be placed from a foreign file). */
let furniturePids: Set<number> | null = null;
export function furnitureKinds(): ReadonlySet<number> {
  if (!furniturePids) {
    furniturePids = new Set();
    for (const table of Object.values(MAP_SCRIPTS)) for (const [, , pid] of table.furniture) furniturePids.add(pid);
  }
  return furniturePids;
}

/** Level objects with editor changes: where each one stands (removed ones are absent) plus newly placed ones. */
export function placedDecor(def: LevelDef, decor: LevelDecor | undefined): { x: number; y: number }[] {
  const removed = new Set(decor?.removed ?? []);
  const moved = decor?.moved ?? {};
  return [...levelDecor(def).filter((d) => !removed.has(d.key)).map((d) => moved[d.key] ?? d), ...(decor?.added ?? [])];
}
