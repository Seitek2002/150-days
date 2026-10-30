// The original's hexes and our grid: steps, distances, directions and conversion both ways.
// The last block checks the placement of the Vault 13 levels against the original's map from the game copy (no copy: skipped).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { createProtoTypes, hexToPlan, parseMap, parseMapHeader } from '../src/formats/map.ts';
import { HEX_WIDTH, hexAt, hexCenter, ROTATION, ROTATION_COUNT, rotationFromAngle, tileDir, tileDist, tileInDirection, tileOnEdge, validTile, type HexFrame } from '../src/game/hex.ts';
import { LEVELS } from '../src/world/levels/index.ts';
import { parseLevelDef } from '../src/world/defs.ts';

/** Middle tiles: an even and an odd number in the row. */
const EVEN = 100 * HEX_WIDTH + 100;
const ODD = 100 * HEX_WIDTH + 101;

describe('steps on hexes', () => {
  it('neighbours in six directions: distance 1, the same direction', () => {
    for (const tile of [EVEN, ODD]) {
      for (let rotation = 0; rotation < ROTATION_COUNT; rotation++) {
        const next = tileInDirection(tile, rotation, 1);
        expect(next, `tile ${tile}, direction ${rotation}`).not.toBe(tile);
        expect(tileDist(tile, next)).toBe(1);
        expect(tileDir(tile, next)).toBe(rotation);
      }
    }
  });

  it('steps in a straight line: n steps in one direction is distance n', () => {
    for (const tile of [EVEN, ODD]) {
      for (let rotation = 0; rotation < ROTATION_COUNT; rotation++) {
        for (const n of [2, 5, 9]) expect(tileDist(tile, tileInDirection(tile, rotation, n)), `direction ${rotation}, steps ${n}`).toBe(n);
      }
    }
  });

  it('neighbour table: even and odd rows shift differently', () => {
    expect(tileInDirection(EVEN, ROTATION.e, 1)).toBe(EVEN + HEX_WIDTH - 1);
    expect(tileInDirection(ODD, ROTATION.e, 1)).toBe(ODD - 1);
    expect(tileInDirection(EVEN, ROTATION.se, 1)).toBe(EVEN + HEX_WIDTH);
    expect(tileInDirection(ODD, ROTATION.se, 1)).toBe(ODD + HEX_WIDTH);
    expect(tileInDirection(EVEN, ROTATION.nw, 1)).toBe(EVEN - HEX_WIDTH);
    expect(tileInDirection(EVEN, ROTATION.w, 1)).toBe(EVEN + 1);
  });

  it('distance from a tile to itself is 0, an invalid tile is 9999, and it is symmetric', () => {
    expect(tileDist(EVEN, EVEN)).toBe(0);
    expect(tileDist(-1, EVEN)).toBe(9999);
    expect(tileDist(EVEN, 40000)).toBe(9999);
    for (const [a, b] of [[EVEN, EVEN + 3 * HEX_WIDTH + 7], [ODD, ODD - 5 * HEX_WIDTH + 2], [EVEN, ODD + 9 * HEX_WIDTH]] as const) {
      expect(tileDist(a, b)).toBe(tileDist(b, a));
    }
  });

  it('along the row and along the number in the row the distance is one hex per unit', () => {
    expect(tileDist(EVEN, EVEN + 6 * HEX_WIDTH)).toBe(6);
    expect(tileDist(EVEN, EVEN + 8)).toBe(8);
  });

  it('grid edge: we do not step past it', () => {
    expect(tileOnEdge(5)).toBe(true);
    expect(tileOnEdge(HEX_WIDTH * 50)).toBe(true);
    expect(tileOnEdge(HEX_WIDTH * 50 + 199)).toBe(true);
    expect(tileOnEdge(40000 - 3)).toBe(true);
    expect(tileOnEdge(EVEN)).toBe(false);
    // A step onto a tile at the edge is possible (onto tile 199 in the row), further is not.
    expect(tileInDirection(HEX_WIDTH * 50 + 198, ROTATION.w, 5)).toBe(HEX_WIDTH * 50 + 199);
    expect(validTile(-1)).toBe(false);
    expect(validTile(39999)).toBe(true);
    expect(validTile(40000)).toBe(false);
  });

  it('direction to a tile: by the compass points of the original\'s screen', () => {
    expect(tileDir(EVEN, EVEN + 3 * HEX_WIDTH)).toBe(ROTATION.se);
    expect(tileDir(EVEN, EVEN - 3 * HEX_WIDTH)).toBe(ROTATION.nw);
    expect(tileDir(EVEN, EVEN)).toBe(ROTATION.se);
    expect(tileDir(-1, EVEN)).toBe(0);
  });
});

describe('our grid and hexes', () => {
  const frame: HexFrame = { col: 119, row: 80 };

  it('hex centre → the hex under it is the same tile (for all tiles around)', () => {
    for (let row = 70; row < 130; row++) {
      for (let inRow = 40; inRow < 130; inRow++) {
        const tile = row * HEX_WIDTH + inRow;
        const centre = hexCenter(frame, tile);
        expect(hexAt(frame, centre.x, centre.y), `tile ${tile}`).toBe(tile);
      }
    }
  });

  it('a cell is a 2×2 hex square: plan neighbours are half a cell apart', () => {
    const tile = 90 * HEX_WIDTH + 70;
    const a = hexCenter(frame, tile);
    const se = hexCenter(frame, tileInDirection(tile, ROTATION.se, 1));
    expect(se.x - a.x).toBeCloseTo(0.5);
    expect(se.y - a.y).toBeCloseTo(0);
    const nw = hexCenter(frame, tileInDirection(tile, ROTATION.nw, 1));
    expect(nw.x - a.x).toBeCloseTo(-0.5);
    // Two hexes along the row and along the number in the row are exactly a cell.
    expect(hexCenter(frame, tile + 2).y - a.y).toBeCloseTo(1);
    expect(hexCenter(frame, tile + 2 * HEX_WIDTH).x - a.x).toBeCloseTo(1);
  });

  it('a point outside the original\'s grid is −1', () => {
    expect(hexAt(frame, -100, 5)).toBe(-1);
    expect(hexAt(frame, 5, 500)).toBe(-1);
  });

  it('view angle → direction: east is hex south-east, south is south-west, west is north-west', () => {
    expect(rotationFromAngle(0)).toBe(ROTATION.se);
    expect(rotationFromAngle(Math.PI)).toBe(ROTATION.nw);
    expect(rotationFromAngle(Math.PI / 2)).toBeOneOf([ROTATION.sw, ROTATION.w]);
    expect(rotationFromAngle(-Math.PI / 2)).toBeOneOf([ROTATION.ne, ROTATION.e]);
    // Any angle gives one of the six directions.
    for (let a = -3.2; a < 3.2; a += 0.1) expect(rotationFromAngle(a)).toBeLessThan(ROTATION_COUNT);
  });
});

describe('Vault 13 and cave levels are tied to hexes', () => {
  const levels = ['vault13-1', 'vault13-2', 'vault13-3', 'cave'] as const;

  it('each has an elevation and a frame; the vault elevations go in order', () => {
    const elevations = levels.map((id) => LEVELS[id]!.elevation);
    expect(elevations).toEqual([0, 1, 2, 0]);
    for (const id of levels) {
      const frame = LEVELS[id]!.hexFrame;
      expect(frame, id).toBeDefined();
      expect(frame!.col).toBeGreaterThan(0);
      expect(frame!.row).toBeGreaterThan(0);
    }
  });

  it('every level object: tile → hex centre → the same tile, and the centre is near the object', () => {
    for (const id of levels) {
      const level = parseLevelDef(LEVELS[id]!);
      const frame = LEVELS[id]!.hexFrame!;
      for (const o of level.objects) {
        const tile = hexAt(frame, o.x, o.y);
        expect(validTile(tile), `${id}: ${o.kind} at ${o.x},${o.y}`).toBe(true);
        const centre = hexCenter(frame, tile);
        expect(hexAt(frame, centre.x, centre.y), `${id}: ${o.kind}`).toBe(tile);
        // The hex under a point is the nearest one: the centre is no further than half a cell.
        expect(Math.hypot(centre.x - o.x, centre.y - o.y)).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it('the whole level grid fits into the original\'s map (200×200)', () => {
    for (const id of levels) {
      const level = parseLevelDef(LEVELS[id]!);
      const frame = LEVELS[id]!.hexFrame!;
      for (const [x, y] of [[0, 0], [level.width - 1, 0], [0, level.height - 1], [level.width - 1, level.height - 1]] as const) {
        expect(validTile(hexAt(frame, x + 0.5, y + 0.5)), `${id}: corner ${x},${y}`).toBe(true);
      }
    }
  });
});

const require = createRequire(import.meta.url);
const { openGame, checkGameFolder } = require('../electron/gamefiles.cjs');
let gameDir = '';
try {
  gameDir = JSON.parse(fs.readFileSync('.local/config.json', 'utf8')).gameDir ?? '';
} catch {
  gameDir = '';
}
const available = Boolean(gameDir) && checkGameFolder(gameDir).ok;
const B = String.fromCharCode(92);

describe.skipIf(!available)('our elevations against the original\'s map from the game copy', () => {
  it('critters and items of elevations 2 and 3 lie near the same ones in the original (within a few hexes)', () => {
    const game = openGame(gameDir);
    try {
      const map = parseMap(game.read(`MAPS${B}VAULT13.MAP`), createProtoTypes((name: string) => game.read(name)));
      for (const [id, elevation, share] of [['vault13-2', 1, 0.5], ['vault13-3', 2, 0.4]] as const) {
        const level = parseLevelDef(LEVELS[id]!);
        const frame = LEVELS[id]!.hexFrame!;
        const originals = (map.objects[elevation] ?? []).filter((o) => o.tile >= 0);
        let matched = 0;
        let total = 0;
        for (const o of level.objects) {
          if (o.kind !== 'npc' && o.kind !== 'critter' && o.kind !== 'item') continue;
          total++;
          const tile = hexAt(frame, o.x, o.y);
          const near = originals.some((m) => (m.pid >>> 0) === (o.pid >>> 0) && tileDist(tile, m.tile) <= 4);
          if (near) matched++;
        }
        expect(matched / total, `${id}: matched ${matched} of ${total}`).toBeGreaterThanOrEqual(share);
      }
    } finally {
      game.close();
    }
  });

  it('hex conversion matches the plan from tools/map-view.ts: row along the x axis, number in the row along the y axis', () => {
    const plan = hexToPlan(100 * HEX_WIDTH + 100);
    expect(plan).toEqual({ x: 100.5, y: 100 });
    expect(hexToPlan(100 * HEX_WIDTH + 101)).toEqual({ x: 100, y: 101 });
  });

  it('map number from the header: V13ENT and VAULT13 differ, read without parsing the whole map', () => {
    const game = openGame(gameDir);
    try {
      const numbers = ['V13ENT', 'VAULT13'].map((name) => parseMapHeader(game.read(`MAPS${B}${name}.MAP`)).mapNumber);
      expect(numbers[0]).not.toBe(numbers[1]);
      expect(numbers.every((n) => n >= 0)).toBe(true);
      const header = parseMap(game.read(`MAPS${B}VAULT13.MAP`), createProtoTypes((name: string) => game.read(name))).header;
      expect(header.mapNumber).toBe(numbers[1]);
    } finally {
      game.close();
    }
  });
});
