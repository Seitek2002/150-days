import { describe, expect, it } from 'vitest';
import { parseLevelDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';

// A level entry must not lie on a "step" exit cell, otherwise the hero is thrown out as soon as he appears.
describe('entry points', () => {
  it('no entry stands on an exit (step) or in a wall', () => {
    const bad: string[] = [];
    for (const def of Object.values(LEVELS)) {
      const level = parseLevelDef(def);
      const exits = level.objects.filter((o) => o.kind === 'exit' && !o.use);
      for (const [name, e] of Object.entries(level.entries)) {
        const cx = Math.floor(e.x);
        const cy = Math.floor(e.y);
        if (level.walls[cy * level.width + cx]) bad.push(`${def.id}/${name}: in a wall`);
        else if (exits.some((o) => Math.floor(o.x) === cx && Math.floor(o.y) === cy)) bad.push(`${def.id}/${name}: on an exit (${cx},${cy})`);
      }
    }
    expect(bad).toEqual([]);
  });
});
