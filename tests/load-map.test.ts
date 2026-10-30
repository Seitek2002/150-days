// load_map in scripts: a map by name or by number in the original's list, the entry by the original's entry number (the entrances field).
import { describe, expect, it } from 'vitest';
import { ORIGINAL_MAPS } from '../src/world/map-list.ts';

// Scripts pull in the platform, which needs a browser window: tests have none, so we stub an empty one.
(globalThis as { window?: unknown }).window ??= {};
const { destinationOf } = await import('../src/game/scripts.ts');

describe('load_map', () => {
  it('the map number is the position in the original\'s list', () => {
    expect(ORIGINAL_MAPS[17]).toBe('CHILDRN1');
    expect(ORIGINAL_MAPS[32]).toBe('MBVATS12');
  });

  it('by entry number: the right elevation and point', () => {
    // Jeremiah: load_map(17, 2) is the yard by the cathedral doors.
    expect(destinationOf(17, 2)).toEqual({ map: 'cathedral-ent', entry: 't17300' });
    // Entry #3 of the same map is already the hall (height 1).
    expect(destinationOf('CHILDRN1.MAP', 3)?.map).toBe('cathedral-1');
    // Seth: the scorpion cave, entry #1.
    expect(destinationOf('caves.map', 1)).toEqual({ map: 'shady-caves', entry: 't21356' });
  });

  it('entry not in the dictionary: the map\'s lowest elevation, entry from the world map (if none, the first); no map: nothing', () => {
    // The base vats, entry #5 (the guards' script trap), is in the dictionary.
    expect(destinationOf(32, 5)?.map.startsWith('mbase')).toBe(true);
    expect(destinationOf('HUBENT.MAP', 99)).toEqual({ map: 'hub-ent', entry: 'wasteland' });
    // Maxson and Rhombus kick out a caught thief: load_map(13, 1) goes outside, to the wasteland exit, not to the elevator in the bunker.
    expect(destinationOf(13, 1)).toEqual({ map: 'brotherhood-ent', entry: 'wasteland' });
    expect(destinationOf('NOSUCH.MAP', 0)).toBeNull();
    expect(destinationOf(999, 0)).toBeNull();
  });
});
