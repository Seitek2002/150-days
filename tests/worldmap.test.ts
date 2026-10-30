// World map layout: the grid is rectangular, letters come from the legend, locations are inside the grid and not in water.
// With the second set of checks (no game copy — skipped): locations match the green circles on the original image.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parseFrm } from '../src/formats/frm.ts';
import { parsePalette } from '../src/formats/pal.ts';
import { parseLst } from '../src/formats/text.ts';
import {
  insideWorld,
  PLACES,
  placeAt,
  squareAtPixel,
  terrainAt,
  TERRAIN_LEGEND,
  WORLD_COLUMNS,
  WORLD_ROWS,
  WORLD_SQUARE_PIXELS,
  WORLD_TERRAIN,
  type PlaceKey,
} from '../src/world/worldmap.ts';

const keys = Object.keys(PLACES) as PlaceKey[];

describe('world map grid', () => {
  it('rectangular: the right number of rows and columns', () => {
    expect(WORLD_TERRAIN).toHaveLength(WORLD_ROWS);
    WORLD_TERRAIN.forEach((line, row) => expect(line, `row ${row}`).toHaveLength(WORLD_COLUMNS));
  });

  it('all letters are in the legend', () => {
    const allowed = new Set(Object.keys(TERRAIN_LEGEND));
    WORLD_TERRAIN.forEach((line, row) => [...line].forEach((letter, column) => expect(allowed.has(letter), `square ${column},${row}: "${letter}"`).toBe(true)));
  });

  it('all terrain types are present, with plenty of water and land', () => {
    const letters = WORLD_TERRAIN.join('');
    for (const letter of Object.keys(TERRAIN_LEGEND)) expect(letters.includes(letter), `no "${letter}"`).toBe(true);
    const count = (letter: string) => [...letters].filter((l) => l === letter).length;
    expect(count('~')).toBeGreaterThan(100);
    expect(count('.') + count('^')).toBeGreaterThan(300);
  });
});

describe('world map locations', () => {
  it('twelve locations, each with its own square inside the grid', () => {
    expect(keys).toHaveLength(12);
    const squares = keys.map((key) => `${PLACES[key].column},${PLACES[key].row}`);
    expect(new Set(squares).size).toBe(12);
    for (const key of keys) expect(insideWorld(PLACES[key].column, PLACES[key].row), key).toBe(true);
  });

  it('a location is not in water and is marked in the terrain with the letter "T"; there are no other "T"s', () => {
    for (const key of keys) {
      const { column, row } = PLACES[key];
      expect(terrainAt(column, row), key).toBe('town');
      expect(placeAt(column, row)).toBe(key);
    }
    const towns = WORLD_TERRAIN.join('').split('T').length - 1;
    expect(towns).toBe(keys.length);
  });

  it('Vault 13 is in the north, and the Glow is in the south-east (as on the original map)', () => {
    expect(PLACES.vault13.row).toBeLessThan(5);
    expect(PLACES.glow.row).toBeGreaterThan(20);
    expect(PLACES.glow.column).toBeGreaterThan(20);
  });
});

describe('sampling by grid', () => {
  it('terrainAt and placeAt: beyond the grid — null', () => {
    expect(terrainAt(-1, 0)).toBeNull();
    expect(terrainAt(WORLD_COLUMNS, 0)).toBeNull();
    expect(terrainAt(0, WORLD_ROWS)).toBeNull();
    expect(terrainAt(1.5, 2)).toBeNull();
    expect(terrainAt(0, WORLD_ROWS - 1)).toBe('water');
    expect(placeAt(0, 0)).toBeNull();
  });

  it('image point → square', () => {
    expect(squareAtPixel(0, 0)).toEqual({ column: 0, row: 0 });
    expect(squareAtPixel(WORLD_SQUARE_PIXELS * 16 + 25, WORLD_SQUARE_PIXELS * 1 + 25)).toEqual(PLACES.vault13);
    expect(squareAtPixel(WORLD_SQUARE_PIXELS - 1, WORLD_SQUARE_PIXELS)).toEqual({ column: 0, row: 1 });
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

describe.skipIf(!available)('locations and water on the original image', () => {
  /** Squares with many green pixels in the image (location circles), and squares that look like water (dark and bluish). */
  function scan() {
    const game = openGame(gameDir);
    try {
      const list = parseLst(game.read(`ART${B}INTRFACE${B}INTRFACE.LST`));
      const frame = parseFrm(game.read(`ART${B}INTRFACE${B}${list[135]}`)).directions[0]!.frames[0]!;
      const palette = parsePalette(game.read('COLOR.PAL'));
      const green: string[] = [];
      const waterish = (column: number, row: number) => {
        let r = 0;
        let b = 0;
        for (let y = row * WORLD_SQUARE_PIXELS; y < (row + 1) * WORLD_SQUARE_PIXELS; y++) {
          for (let x = column * WORLD_SQUARE_PIXELS; x < (column + 1) * WORLD_SQUARE_PIXELS; x++) {
            const px = palette[frame.pixels[y * frame.width + x] ?? 0] ?? 0;
            r += px & 255;
            b += (px >>> 16) & 255;
          }
        }
        const n = WORLD_SQUARE_PIXELS * WORLD_SQUARE_PIXELS;
        return b / n >= r / n + 4 && (r / n + b / n) / 2 < 95;
      };
      let wrongWater = 0;
      let water = 0;
      for (let row = 0; row < WORLD_ROWS; row++) {
        for (let column = 0; column < WORLD_COLUMNS; column++) {
          let count = 0;
          for (let y = row * WORLD_SQUARE_PIXELS; y < (row + 1) * WORLD_SQUARE_PIXELS; y++) {
            for (let x = column * WORLD_SQUARE_PIXELS; x < (column + 1) * WORLD_SQUARE_PIXELS; x++) {
              const px = palette[frame.pixels[y * frame.width + x] ?? 0] ?? 0;
              const r = px & 255;
              const g = (px >>> 8) & 255;
              const b = (px >>> 16) & 255;
              if (g > r + 30 && g > b + 30 && g > 90) count++;
            }
          }
          if (count > 40) green.push(`${column},${row}`);
          if (terrainAt(column, row) === 'water') {
            water++;
            if (!waterish(column, row)) wrongWater++;
          }
        }
      }
      return { size: [frame.width, frame.height], green, water, wrongWater };
    } finally {
      game.close();
    }
  }

  it('the image is the same grid; the green circles are exactly at our locations', () => {
    const { size, green } = scan();
    expect(size).toEqual([WORLD_COLUMNS * WORLD_SQUARE_PIXELS, WORLD_ROWS * WORLD_SQUARE_PIXELS]);
    expect(green.sort()).toEqual(keys.map((key) => `${PLACES[key].column},${PLACES[key].row}`).sort());
  });

  it('water squares in the image are dark and bluish (a few coastal ones are allowed)', () => {
    const { water, wrongWater } = scan();
    expect(wrongWater / water).toBeLessThan(0.05);
  });
});
