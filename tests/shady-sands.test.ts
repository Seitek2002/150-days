// Shady Sands as in the original (client request, 2026-10-24): round house windows are a block with a see-through hole that cannot be walked through;
// the brahmin pen gate is in the fence row, see-through, with its own image.
import { describe, expect, it } from 'vitest';
import { blocksIn, buildLevel, DOOR_PASSABLE, solidAt } from '../src/engine/level.ts';
import { fenceBlock } from '../src/game/blocks.ts';
import { ROUND_WINDOW_BLOCK } from '../src/world/block-catalog.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';
import { levelFromLocation, locationFromLevel } from '../src/world/location-file.ts';

describe('Shady Sands round windows', () => {
  const def = LEVELS['shady-sands-w']!;
  const windows = (def.columns ?? []).filter((c) => c.storeys[0]?.window === 'round');

  it('four windows in the western part, as in the original: the cell is not a wall but impassable; a full-storey block with a hole', () => {
    expect(windows).toHaveLength(4);
    const level = buildLevel(parseLevelDef(def));
    for (const w of windows) {
      const cell = w.y * level.width + w.x;
      expect(level.walls[cell]).toBeNull();
      expect(solidAt(level, w.x + 0.5, w.y + 0.5)).toBe(true);
      const block = blocksIn(level, cell).find((b) => b.fill);
      expect(block).toMatchObject({ front: 'adobeWindow', height: 1 });
      expect(block!.parts).toBeUndefined();
    }
  });

  it('in the editor — the "Round window" block, back — the same window', () => {
    const loc = locationFromLevel(def);
    const w = windows[0]!;
    expect(loc.floors[1]?.[w.y * loc.width + w.x]).toBe(ROUND_WINDOW_BLOCK);
    const back = levelFromLocation(loc, def);
    expect(back.columns?.find((c) => c.x === w.x && c.y === w.y)?.storeys[0]).toMatchObject({ texture: 'adobeWindow', window: 'round' });
    const level = buildLevel(parseLevelDef(back));
    expect(solidAt(level, w.x + 0.5, w.y + 0.5)).toBe(true);
  });
});

describe('brahmin pen gate', () => {
  it('the original gate is a door with a gate image: in the level it is a gate (Door.gate), closed — impassable, open — passable', () => {
    const level = buildLevel(parseLevelDef(LEVELS['shady-sands-e']!));
    const door = level.doors.get(11 * level.width + 17);
    expect(door).toMatchObject({ texture: 'woodGate', gate: true });
    expect(solidAt(level, 17.5, 11.5)).toBe(true);
    door!.open = DOOR_PASSABLE;
    expect(solidAt(level, 17.5, 11.5)).toBe(false);
  });

  it('the gate leaf is a see-through block like the fence, but a little higher; a gate image', () => {
    const gate = fenceBlock(3, 4, 'x', true);
    const fence = fenceBlock(3, 4, 'x');
    expect(gate).toMatchObject({ front: 'fenceGate', side: 'fenceGate', top: 'fenceTop', fill: false });
    expect(gate.height).toBeGreaterThan(fence.height);
    expect(gate.y1 - gate.y0).toBeCloseTo(fence.y1 - fence.y0);
  });
});
