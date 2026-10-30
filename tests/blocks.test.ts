import { describe, expect, it } from 'vitest';
import { addBlock, blocksIn, removeBlock, solidAt, type Level } from '../src/engine/level.ts';
import { findPath } from '../src/engine/path.ts';
import { blockAt, blockShapeOf, clearNarrowPassages, decorOf, floorMarkOf, PIECED, piecedShape, unblockPassages, wallSignOf, wallSignScale } from '../src/game/blocks.ts';
import { lineOfSight } from '../src/game/creature.ts';

/** A 5×5 room in walls: 3×3 inside (cells 1..3). */
function room(): Level {
  const walls = Array.from({ length: 25 }, (_, i) => (i % 5 === 0 || i % 5 === 4 || i < 5 || i >= 20 ? ('metal' as const) : null));
  return { width: 5, height: 5, walls, floor: 'floor', ceiling: 'ceiling', fade: 10, doors: new Map(), exits: new Set() };
}

describe('blocks (terminals)', () => {
  it('computers and ladders become a block, force fields do not', () => {
    expect(blockShapeOf('comp2.frm')).not.toBeNull();
    expect(blockShapeOf('keybrd01.frm')).not.toBeNull();
    expect(blockShapeOf('ladder.frm')).not.toBeNull();
    expect(blockShapeOf('ffield01.frm')).toBeNull();
  });

  it('by a wall: back to it, facing into the room, thin', () => {
    const level = room();
    const shape = blockShapeOf('comp1.frm')!;
    // Cell (2,3) is by the south wall; in the original the computer stood in the wall to the south.
    const b = blockAt(level, { x: 2.5, y: 3.5 }, { x: 2.5, y: 4.5 }, shape);
    expect(b.facing).toBe(2);
    expect(b.y1).toBe(4);
    expect(b.y1 - b.y0).toBeCloseTo(shape.depth);
    expect(b.fill).toBe(false);
  });

  it('you cannot walk through a block, you can see over it, there is a path past a thin block', () => {
    const level = room();
    const b = blockAt(level, { x: 2.5, y: 3.5 }, { x: 2.5, y: 4.5 }, blockShapeOf('comp1.frm')!);
    level.blocks = new Map([[3 * 5 + 2, b]]);
    expect(solidAt(level, 2.5, 3.9)).toBe(true);
    expect(solidAt(level, 2.5, 3.2)).toBe(false);
    expect(lineOfSight(level, 1.5, 3.9, 3.5, 3.9)).toBe(true);
    expect(findPath(level, 1.5, 3.5, 3.5, 3.5)).not.toBeNull();
  });

  it('with no wall nearby: in the middle of the cell, critters walk around it', () => {
    const level = room();
    const b = blockAt(level, { x: 2.5, y: 2.5 }, { x: 2.5, y: 2.4 }, blockShapeOf('comp1.frm')!);
    expect(b.fill).toBe(true);
    expect(b.x0).toBeGreaterThan(2);
    expect(b.x1).toBeLessThan(3);
  });

  it('furniture in a passage is removed; a crate only if nothing else is blocking', () => {
    // A 5×3 corridor: the passage is the middle row (cells 1..3, 1).
    const walls = Array.from({ length: 15 }, (_, i) => (Math.floor(i / 5) === 1 && i % 5 > 0 && i % 5 < 4 ? null : ('metal' as const)));
    const level: Level = { width: 5, height: 3, walls, floor: 'floor', ceiling: 'ceiling', fade: 10, doors: new Map(), exits: new Set() };
    const shape = blockShapeOf('desk1.frm')!;
    const desk = { ...blockAt(level, { x: 2.5, y: 1.5 }, { x: 2.5, y: 1.5 }, shape), fill: true };
    level.blocks = new Map([[7, desk]]);
    // Furniture with no purpose is removed.
    expect(unblockPassages(level, new Set([7]))).toEqual([7]);
    expect(level.blocks.size).toBe(0);
    // A crate (not in the furniture list) is removed too, since otherwise the passage is blocked.
    level.blocks.set(7, desk);
    expect(unblockPassages(level, new Set())).toEqual([7]);
  });

  it('several items in a cell: by the wall, where they were in the original, side by side; removing one leaves the other', () => {
    const level = room();
    const shape = blockShapeOf('locker1.frm')!;
    // Two lockers by the south wall of cell (2,3): in the original, one further left and one further right.
    const left = blockAt(level, { x: 2.5, y: 3.5 }, { x: 2.25, y: 4.2 }, shape);
    const right = blockAt(level, { x: 2.5, y: 3.5 }, { x: 2.75, y: 4.2 }, shape);
    expect(left.x1).toBeLessThanOrEqual(right.x0 + 1e-9);
    addBlock(level, 17, left);
    addBlock(level, 17, right);
    expect(blocksIn(level, 17)).toHaveLength(2);
    expect(solidAt(level, 2.25, 3.9)).toBe(true);
    expect(solidAt(level, 2.75, 3.9)).toBe(true);
    removeBlock(level, 17, left);
    expect(blocksIn(level, 17)).toEqual([right]);
    expect(solidAt(level, 2.25, 3.9)).toBe(false);
  });

  it('well: the well1 and well2 images have a shape: round, with parts (frame, posts, crossbar, bucket)', () => {
    for (const art of ['well1.frm', 'well2.frm']) {
      const shape = blockShapeOf(art);
      expect(shape).not.toBeNull();
      expect(shape!.round).toBe(true);
      expect(shape!.parts!.length).toBeGreaterThanOrEqual(4);
      expect(shape!.parts!.some((p) => p.round && p.front === 'wellStone' && p.top === 'wellTop')).toBe(true);
    }
    // A well in an open area: a square at the original's spot, it cannot block a passage (it can be walked around).
    const level = room();
    const b = blockAt(level, { x: 2.5, y: 2.5 }, { x: 2.5, y: 2.5 }, blockShapeOf('well1.frm')!);
    expect(b.round).toBe(true);
    expect(b.parts).toHaveLength(5);
    expect(b.x1 - b.x0).toBeCloseTo(0.9);
  });

  it('"local" passage: cabinets by both corridor walls and "staggered" are removed, a row of tables across a hall is not', () => {
    const block = (x0: number, y0: number, x1: number, y1: number, fill = false) => ({ x0, y0, x1, y1, height: 1, front: 'metal' as const, side: 'metal' as const, top: 'metal' as const, facing: 0 as const, fill });
    // A 9×3 corridor: the passage is the middle row; it can be bypassed only from outside (the map has no bypass, but the check is "local").
    const corridor = (): Level => {
      const walls = Array.from({ length: 27 }, (_, i) => (Math.floor(i / 9) === 1 && i % 9 > 0 && i % 9 < 8 ? null : ('metal' as const)));
      return { width: 9, height: 3, walls, floor: 'floor', ceiling: 'ceiling', fade: 10, doors: new Map(), exits: new Set() };
    };
    // Cabinets by the north and south wall of cell (4,1): 0.3 between them, the hero (0.44) cannot pass.
    let level = corridor();
    addBlock(level, 13, block(4, 1, 5, 1.35));
    addBlock(level, 13, block(4, 1.65, 5, 2));
    expect(clearNarrowPassages(level, new Set([13]), new Set())).toEqual([13]);
    expect(blocksIn(level, 13)).toHaveLength(0);
    // A single cabinet by a wall: there is a passage, it stays.
    level = corridor();
    addBlock(level, 13, block(4, 1, 5, 1.3));
    expect(clearNarrowPassages(level, new Set([13]), new Set())).toEqual([]);
    // "Staggered": at (3,1) by the north wall, at (4,1) by the south: passable separately, not together; one goes (furniture).
    level = corridor();
    addBlock(level, 12, block(3, 1, 4, 1.42));
    addBlock(level, 13, block(4, 1.58, 5, 2));
    expect(clearNarrowPassages(level, new Set([12, 13]), new Set([13]))).toEqual([13]);
    expect(blocksIn(level, 12)).toHaveLength(1);
    // A 9×9 hall: a row of tables across the middle (without edges) is walked around, it is not a passage.
    const walls = Array.from({ length: 81 }, (_, i) => (i % 9 === 0 || i % 9 === 8 || i < 9 || i >= 72 ? ('metal' as const) : null));
    level = { width: 9, height: 9, walls, floor: 'floor', ceiling: 'ceiling', fade: 10, doors: new Map(), exits: new Set() };
    const row = [2, 3, 4, 5, 6].map((x) => 4 * 9 + x);
    for (const cell of row) addBlock(level, cell, block(cell % 9, 4, (cell % 9) + 1, 5, true));
    expect(clearNarrowPassages(level, new Set(row), new Set(row))).toEqual([]);
  });
});

// Casino tables from pieces (client, 2026-10-29: in Junktown the pieces stood as separate small tables and flat images).
describe('casino table from pieces', () => {
  it('the craps and roulette table pieces form one big table below waist height, the roulette one has a wheel', () => {
    expect(PIECED.test('crptbl06.frm') && PIECED.test('roltbl02.frm')).toBe(true);
    const craps = piecedShape('crptbl06.frm');
    const roulette = piecedShape('roltbl02.frm');
    expect(craps.span).toBe(true);
    expect(craps.depth).toBeGreaterThan(1.5);
    expect(craps.height).toBeLessThanOrEqual(0.3);
    expect(craps.parts?.some((p) => p.top === 'feltTop')).toBe(true);
    expect(roulette.parts?.some((p) => p.round)).toBe(true);
    expect(craps.parts?.some((p) => p.round)).toBe(false);
  });
});

// Stairs between floors (client, 2026-10-29: they were flat images).
describe('stairs', () => {
  it('up: made of pieces, steps rise from the front to the back up to the ceiling; down and rope ones are solid', () => {
    expect(PIECED.test('stair03.frm')).toBe(true);
    const up = piecedShape('stair03.frm');
    const steps = up.parts!.map((p) => p.height);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(steps.at(-1)).toBe(1);
    expect(blockShapeOf('stway.frm')?.parts?.some((p) => p.top === 'stairsDown')).toBe(true);
    expect(blockShapeOf('ladder.frm')?.wall).toBe(true);
  });
});

// Quest items (client, 2026-10-29: everything that works with E is solid).
describe('quest items', () => {
  it('pump, armor parts, generator, bomb, rubble, cave wall, notice board, bar, elevator door are solid', () => {
    for (const art of ['pumpnec.frm', 'pwrarmor.frm', 'power1.frm', 'abomb1.frm', 'glowslid.frm', 'rock04.frm', 'posts.frm', 'trophyb.frm', 'velev07.frm']) {
      expect(blockShapeOf(art), art).not.toBeNull();
    }
  });
});

// Furniture that was missing entirely before (client, 2026-10-29).
describe('furniture with no rule', () => {
  it('tables, beds, workbenches, vats, exercise machines, soda machine, altars, podiums, bar, forklift, booth, urinals, exhaust hood, campfire, pots, traffic light are solid', () => {
    for (const art of ['ss102.frm', 'ss103.frm', 'brotbl03.frm', 'bvs14.frm', 'mach04.frm', 'unit000.frm', 'holo02.frm', 'stmain01.frm', 'vats5.frm', 'tanktop.frm', 'extrdml1.frm', 'exwtlft2.frm', 'expnch.frm', 'exstr1.frm', 'cola.frm', 'ccaltar3.frm', 'bsaltar1.frm', 'ccpodium.frm', 'bar01.frm', 'fork1.frm', 'shack.frm', 'urinal2.frm', 'vosv000.frm', 'woodfire.frm', 'bucket1.frm', 'stplit1.frm', 'altar3.frm']) {
      expect(blockShapeOf(art), art).not.toBeNull();
    }
    expect(blockShapeOf('woodfire.frm')?.light).toBeTruthy();
  });
});

// The original's images on walls and floor, gates, barrier, pipes (client, 2026-10-29: "should look like the original").
describe('emblems, graffiti, gates, bodies', () => {
  it('emblems, graffiti, posters, numbers, arrows, banners are on the wall as an image, at real size', () => {
    for (const art of ['logo01.frm', 'flwrlogo.frm', 'graf13.frm', 'ripsign2.frm', 'num03.frm', 'arow01.frm', 'flcsign1.frm', 'chdflag2.frm']) expect(wallSignOf(art), art).toBe(true);
    expect(wallSignScale('num01.frm')).toBeLessThan(wallSignScale('barsign.frm'));
    expect(wallSignOf('chdflag3.frm')).toBe(false);
  });
  it('bodies lie, trees and the flagpole stand; walkways and grates are on the floor; gates, barrier, pipes are solid', () => {
    expect(decorOf('dead02.frm')?.flat).toBe(true);
    expect(decorOf('tre1000.frm')?.flat).toBeFalsy();
    expect(decorOf('chdflag3.frm')).not.toBeNull();
    expect(floorMarkOf('gbridge1.frm')).toBe('planks');
    expect(floorMarkOf('vosfloor.frm')).toBe('drain');
    for (const art of ['gate001.frm', 'milgate.frm', 'garpipe1.frm', 'garpipe2.frm', 'mbpipe1.frm', 'vosb000.frm']) expect(blockShapeOf(art), art).not.toBeNull();
  });
});
