// Which world map location a level belongs to: from each location's entrance its transitions and elevators are walked (except the exit
// to the wasteland). Needed when a script moves the hero to another location by itself (the Hub caravan goes to Junktown): the trip
// takes time, as on foot across the wasteland (Opus decision).
import { parseLevelDef } from './defs.ts';
import { LEVELS } from './levels/index.ts';
import { PLACE_ENTRANCES, PLACE_RUINS } from './wasteland.ts';
import type { PlaceKey } from './worldmap.ts';

let index: Map<string, PlaceKey> | null = null;

function build(): Map<string, PlaceKey> {
  const map = new Map<string, PlaceKey>();
  const starts: [PlaceKey, string][] = [];
  for (const [place, door] of Object.entries(PLACE_ENTRANCES) as [PlaceKey, { map: string }][]) starts.push([place, door.map]);
  for (const [place, ruins] of Object.entries(PLACE_RUINS) as [PlaceKey, { door: { map: string } }][]) starts.push([place, ruins.door.map]);
  for (const [place, first] of starts) {
    const queue = [first];
    while (queue.length) {
      const id = queue.shift()!;
      if (map.has(id) || !LEVELS[id]) continue;
      map.set(id, place);
      for (const o of parseLevelDef(LEVELS[id]).objects) {
        if (o.kind === 'exit') queue.push(o.to.map);
        else if (o.kind === 'elevator') for (const f of o.floors) queue.push(f.map);
      }
    }
  }
  return map;
}

/** World map location the level belongs to; null means the wasteland, the test range or unknown. */
export function placeOfLevel(id: string): PlaceKey | null {
  index ??= build();
  return index.get(id) ?? null;
}
