// The Glow crater is a real pit (client, 2026-10-25): depth grows from the edge to the middle, the shaft has no bottom; you cannot
// reach the middle, but you can see and shoot over the pit; on the Glow's surface the crater follows the original's map, a beam at the south edge.
import { describe, expect, it } from 'vitest';
import { buildCrater, craterBlocks, craterDepth, craterEdge, craterPieces, isCraterBeam, WALK } from '../src/engine/crater.ts';
import { buildLevel, solidAt } from '../src/engine/level.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';

const round = { x: 10, y: 10, radius: [5, 5, 5, 5], shaft: true, lip: 'craterLip', slope: 'craterSlope', wall: 'craterShaft' } as const;

describe('pit', () => {
  it('depth: 0 outside, a little at the edge, more toward the shaft, an abyss in the shaft', () => {
    const c = buildCrater({ ...round, radius: [...round.radius] });
    const edge = craterEdge(c, 0);
    expect(edge).toBeGreaterThan(4.5);
    expect(edge).toBeLessThan(5.5);
    expect(craterDepth(c, 10 + edge + 0.2, 10)).toBe(0);
    const lip = craterDepth(c, 10 + edge * 0.95, 10);
    const slope = craterDepth(c, 10 + edge * 0.7, 10);
    const shaft = craterDepth(c, 10 + edge * 0.2, 10);
    expect(lip).toBeGreaterThan(0);
    expect(lip).toBeLessThan(0.1);
    expect(slope).toBeGreaterThan(lip);
    expect(shaft).toBeGreaterThan(10);
  });

  it('a crater without a shaft is a shallow bowl', () => {
    const c = buildCrater({ ...round, radius: [2, 2, 2, 2], shaft: false });
    expect(craterDepth(c, 10, 10)).toBeGreaterThan(0.2);
    expect(craterDepth(c, 10, 10)).toBeLessThan(0.5);
  });

  it('the middle cannot be reached (closer than WALK to the edge), the edge can', () => {
    const c = buildCrater({ ...round, radius: [...round.radius] });
    const edge = craterEdge(c, Math.PI / 2);
    expect(craterBlocks(c, 10, 10 + edge * (WALK - 0.05))).toBe(true);
    expect(craterBlocks(c, 10, 10 + edge * (WALK + 0.05))).toBe(false);
  });
});

describe('the Glow surface', () => {
  const def = LEVELS['glow-ent']!;
  const level = buildLevel(parseLevelDef(def));
  const crater = def.craters![0]!;

  it('no walls where the pit is: you cannot walk to the middle, but you can see over it', () => {
    for (let y = 33; y <= 41; y++) for (let x = 33; x <= 41; x++) expect(level.walls[y * level.width + x], `${x},${y}`).toBeNull();
    expect(solidAt(level, crater.x, crater.y)).toBe(true);
    expect(solidAt(level, crater.x, crater.y, false)).toBe(false);
  });

  it('arrival points are not in the pit or the crater; you can stand by the beam', () => {
    for (const [name, e] of Object.entries(def.entries ?? {})) expect(solidAt(level, e.x, e.y), name).toBe(false);
    const beam = crater.beam!;
    expect(solidAt(level, beam.x, beam.y + 0.6)).toBe(false);
  });

  it('the beam runs from the edge to the middle and not a single slab ended up in a wall', () => {
    const c = level.craters![0]!;
    const pieces = craterPieces(c, crater, level.width, level.height, (x, y) => level.walls[y * level.width + x] !== null);
    const beam = pieces.find((p) => isCraterBeam(p.block))!;
    expect(beam.cells.length).toBeGreaterThan(1);
    expect(beam.block.y0).toBeLessThan(crater.beam!.y - 1);
    const slabs = pieces.filter((p) => !isCraterBeam(p.block));
    expect(slabs.length).toBeGreaterThan(10);
    for (const s of slabs) expect(level.walls[s.cells[0]!]).toBeNull();
  });

  it('descent is via the beam with a script (rope), there is no separate exit into the pit', () => {
    expect((def.objects ?? []).some((o) => o.kind === 'exit' && o.use)).toBe(false);
  });
});
