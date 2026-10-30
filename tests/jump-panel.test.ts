// The "Go to location" window (F9): locations are grouped by town, single ones go into a common group; every game map has an entry.
import { describe, expect, it } from 'vitest';
import { groupPlaces } from '../src/game/jump-panel.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';

const place = (id: string, title: string) => ({ id, title, to: { map: id, entry: 'x' } });

describe('go to location', () => {
  it('towns by the part of the title before a comma or bracket, single ones into "Other locations"', () => {
    const groups = groupPlaces(
      [
        place('hub-ent', 'Hub, entrance'),
        place('raiders', 'Khans camp'),
        place('hub-downtown-2', 'Hub, downtown, second floor'),
        place('caravan-desert-1', 'Caravan ambush (desert, 1)'),
        place('caravan-desert-2', 'Caravan ambush (desert, 2)'),
      ],
      'Other locations',
    );
    expect(groups.map((g) => g.title)).toEqual(['Hub', 'Caravan ambush', 'Other locations']);
    expect(groups[0]!.places.map((p) => p.label)).toEqual(['entrance', 'downtown, second floor']);
    expect(groups[1]!.places.map((p) => p.label)).toEqual(['desert, 1', 'desert, 2']);
    expect(groups[2]!.places.map((p) => p.label)).toEqual(['Khans camp']);
    expect(groups[0]!.places[1]!.name).toBe('Hub, downtown, second floor');
  });

  it('every game map has a title and a place to stand', () => {
    for (const def of Object.values(LEVELS)) {
      expect(def.title?.ru, def.id).toBeTruthy();
      expect(Object.keys(parseLevelDef(def).entries).length, def.id).toBeGreaterThan(0);
    }
  });
});
