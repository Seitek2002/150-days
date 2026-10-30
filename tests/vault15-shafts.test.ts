// Vault 15: between floors there are broken lift shafts (the original's BVELV… scripts), not our game's lifts.
// Down by a tied rope, up by a hanging one; where the shaft script puts the hero (move_to), we have an entry point there.
import { describe, expect, it } from 'vitest';
import { blockShapeOf } from '../src/game/blocks.ts';
import { hexCenter } from '../src/game/hex.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';
import { MAP_SCRIPTS } from '../src/world/map-scripts.ts';

const FLOORS = ['vault15-1', 'vault15-2', 'vault15-3'] as const;

describe('Vault 15 shafts', () => {
  it('there are no lifts of our game: without a rope you cannot get between floors', () => {
    for (const id of FLOORS) expect(parseLevelDef(LEVELS[id]!).objects.filter((o) => o.kind === 'elevator'), id).toEqual([]);
  });

  it('every floor has a shaft with a script', () => {
    const shafts = MAP_SCRIPTS.VAULTBUR!.scenery.filter(([, , , script]) => /^BVELV/.test(script));
    expect(shafts.map(([elevation]) => elevation).sort()).toEqual([0, 1, 1, 2]);
  });

  it('the shaft is drawn with our full-wall block: broken and with a rope', () => {
    expect(blockShapeOf('velev04.frm')?.front).toBe('shaftBroken');
    expect(blockShapeOf('velev09.frm')?.front).toBe('shaftRope');
    expect(blockShapeOf('velev10.frm')?.front).toBe('shaftRope');
    expect(blockShapeOf('velev04.frm')?.height).toBe(1);
  });

  it('where the shaft scripts put the hero (the original hex and elevation) — a floor entry point is nearby', () => {
    // From the shaft scripts: upper west → middle floor, middle west → upper, middle east → lower,
    // lower → middle.
    const targets: [number, number][] = [
      [23118, 1],
      [14304, 0],
      [17108, 2],
      [23102, 1],
    ];
    for (const [tile, elevation] of targets) {
      const def = LEVELS[FLOORS[elevation]!]!;
      const at = hexCenter(def.hexFrame!, tile);
      const near = Object.values(def.entries ?? {}).some((e) => Math.hypot(e.x - at.x, e.y - at.y) <= 3);
      expect(near, `${def.id}: hex ${tile}`).toBe(true);
    }
  });
});
