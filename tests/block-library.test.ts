// Block library (the blocks folder): reading and writing is allowed only inside it and only for images, sounds and settings;
// a block's name is its folder name; each of our textures has a name; blocks from the folder and door locks reach the level.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTextures } from '../src/engine/textures.ts';
import { BLOCK_NAME, blockInfo, BUILTIN_NAMES, MISSING_TEXTURE, setLibrary } from '../src/world/block-catalog.ts';
import { parseSettings, sortFiles } from '../src/world/block-library.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';
import { decodeLocation, encodeLocation, levelFromLocation, locationFromLevel } from '../src/world/location-file.ts';

const require = createRequire(import.meta.url);
const { listBlocks, readBlockFile, writeBlockFile } = require('../electron/blocks.cjs') as {
  listBlocks(dir: string): { name: string; files: { file: string; size: number }[] }[];
  readBlockFile(dir: string, name: string, file: string): Buffer | null;
  writeBlockFile(dir: string, name: string, file: string, bytes: Uint8Array): string;
};
const TEXTURES = new Set(['sand', 'rock', 'brick', 'gothicDoor', 'b:Oak door']);

describe('blocks folder', () => {
  it('written: a block folder with the file, listed, readable; a non-ASCII name with spaces and brackets is allowed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blocks-'));
    const folder = writeBlockFile(dir, 'Porte en chêne (sombre)', 'block.png', new Uint8Array([1, 2, 3]));
    expect(folder).toBe(path.join(dir, 'Porte en chêne (sombre)'));
    writeBlockFile(dir, 'Porte en chêne (sombre)', 'open.wav', new Uint8Array([4]));
    expect(listBlocks(dir)).toEqual([
      {
        name: 'Porte en chêne (sombre)',
        files: [
          { file: 'block.png', size: 3 },
          { file: 'open.wav', size: 1 },
        ],
      },
    ]);
    expect([...readBlockFile(dir, 'Porte en chêne (sombre)', 'block.png')!]).toEqual([1, 2, 3]);
    expect(readBlockFile(dir, 'Porte en chêne (sombre)', 'none.png')).toBeNull();
  });

  it('cannot leave the folder; foreign files can be neither written nor shown', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blocks-'));
    expect(() => writeBlockFile(dir, '../x', 'a.png', new Uint8Array(1))).toThrow();
    expect(() => writeBlockFile(dir, 'a', '../a.png', new Uint8Array(1))).toThrow();
    expect(() => writeBlockFile(dir, 'a', 'run.exe', new Uint8Array(1))).toThrow();
    expect(() => readBlockFile(dir, 'a', 'a/../../b.png')).toThrow();
    fs.mkdirSync(path.join(dir, 'b'));
    fs.writeFileSync(path.join(dir, 'b', 'virus.exe'), 'x');
    fs.writeFileSync(path.join(dir, 'b', 'pic.jpg'), 'x');
    fs.writeFileSync(path.join(dir, 'loose.png'), 'x');
    expect(listBlocks(dir)).toEqual([{ name: 'b', files: [{ file: 'pic.jpg', size: 1 }] }]);
  });

  it('no folder: empty', () => {
    expect(listBlocks(path.join(os.tmpdir(), 'no-such-folder-blocks'))).toEqual([]);
  });
});

describe('block files and settings', () => {
  it('images by name are variants; a sound with "close" closes, another opens; a single sound does both', () => {
    const files = sortFiles([
      { file: 'b.png', size: 1 },
      { file: 'a.JPG', size: 1 },
      { file: 'door-close.ogg', size: 1 },
      { file: 'creak.wav', size: 1 },
      { file: 'block.json', size: 1 },
    ]);
    expect(files.images.map((f) => f.file)).toEqual(['a.JPG', 'b.png']);
    expect(files).toMatchObject({ open: 'creak.wav', close: 'door-close.ogg', settings: true });
    expect(sortFiles([{ file: 'door.wav', size: 1 }])).toMatchObject({ open: 'door.wav', close: 'door.wav', settings: false });
  });

  it('settings: only known keys of the right type', () => {
    expect(parseSettings({ kind: 'door', sound: 'E', metal: true, glow: true, builtin: 'brick', exported: 120, zzz: 1 })).toEqual({ kind: 'door', sound: 'E', metal: true, glow: true, builtin: 'brick', exported: 120 });
    expect(parseSettings({ kind: 'roof', sound: 'zz', metal: 'yes', builtin: 'none', exported: -1 })).toEqual({});
    expect(parseSettings('garbage')).toEqual({});
  });

  it('each of our textures has a name (folder name in the library)', () => {
    const names = Object.keys(createTextures()).filter((n) => n !== MISSING_TEXTURE).sort();
    expect(Object.keys(BUILTIN_NAMES).sort()).toEqual(names);
    expect(new Set(Object.values(BUILTIN_NAMES)).size).toBe(names.length);
    // Heavy test: under the load of a full run it does not fit into 5 seconds.
  }, 30_000);

  it('city and door textures are drawn on first access, a custom block replaces them', () => {
    const set = createTextures();
    const first = set.woodDoor;
    expect(first.pixels.length).toBe(128 * 128);
    expect(set.woodDoor).toBe(first);
    const own = { pixels: new Uint32Array(128 * 128), variants: [] };
    set.wasteland = own;
    expect(set.wasteland).toBe(own);
  });
});

describe('library blocks in a location', () => {
  afterEach(() => setLibrary([]));
  const base = LEVELS['shady-sands-e']!;

  it('a block from the folder has its texture; a door from the folder has texture and sound; no folder means a placeholder, the name is not lost', () => {
    setLibrary([
      { name: 'Oak door', id: 'b:Oak door', texture: 'b:Oak door' as never, kind: 'door', sound: 'b:Oak door' },
      { name: 'Brick', id: 'tex:brick', texture: 'brick', kind: 'wall' },
    ]);
    expect(blockInfo('tex:brick')?.name.ru).toBe('Brick');
    expect(blockInfo('b:Unknown block')).toMatchObject({ texture: MISSING_TEXTURE, kind: 'wall' });
    const loc = locationFromLevel(base);
    const cell = loc.floors[1]!.findIndex((b, i) => !b && !loc.floors[1]![i + 1] && i > loc.width * 5);
    loc.floors[1]![cell] = 'b:Oak door';
    loc.floors[1]![cell + 1] = 'b:Unknown block';
    loc.locks = { [cell]: true };
    const back = levelFromLocation(loc, base, () => 0.5);
    const x = (cell % loc.width) + 0.5;
    const y = Math.floor(cell / loc.width) + 0.5;
    expect(parseLevelDef(back).objects.find((o) => o.kind === 'door' && o.x === x && o.y === y)).toMatchObject({ texture: 'b:Oak door', sound: 'b:Oak door', locked: true });
    expect(back.walls?.[back.grid[y - 0.5]![x + 0.5]!]).toBe(MISSING_TEXTURE);
    // In the file a block that does not exist is kept under its own name.
    const file = JSON.parse(JSON.stringify(encodeLocation(loc)));
    const read = decodeLocation(file, LEVELS, TEXTURES);
    expect(read?.floors[1]![cell + 1]).toBe('b:Unknown block');
    expect(read?.locks).toEqual({ [cell]: true });
  });

  it('an ordinary level door can be locked and unlocked in the editor', () => {
    const def = LEVELS['vault13-1']!;
    const door = parseLevelDef(def).objects.find((o) => o.kind === 'door')!;
    const loc = locationFromLevel(def);
    const cell = Math.floor(door.y) * loc.width + Math.floor(door.x);
    const doorIn = () => parseLevelDef(levelFromLocation(loc, def, () => 0.5)).objects.find((o) => o.kind === 'door' && o.x === door.x && o.y === door.y);
    loc.locks = { [cell]: true };
    expect(doorIn()).toMatchObject({ locked: true });
    loc.locks = { [cell]: false };
    const open = doorIn();
    expect(open && 'locked' in open && open.locked).toBeFalsy();
  });
});

describe('our block names', () => {
  it('are valid folder names', () => {
    for (const name of Object.values(BUILTIN_NAMES)) expect(BLOCK_NAME.test(name!), name).toBe(true);
  });
});

describe('location ceiling', () => {
  it('a custom ceiling is kept in the level and in the file; an unknown texture from the file is dropped', () => {
    const base = LEVELS['cave']!;
    const loc = locationFromLevel(base, 'Ceiling');
    expect(levelFromLocation(loc, base, () => 0.5).ceiling).toBe(base.ceiling);
    loc.ceiling = 'caveCeiling';
    expect(levelFromLocation(loc, base, () => 0.5).ceiling).toBe('caveCeiling');
    const file = JSON.parse(JSON.stringify(encodeLocation(loc)));
    expect(decodeLocation(file, LEVELS, new Set(['caveCeiling']))?.ceiling).toBe('caveCeiling');
    file.ceiling = 'no-such-texture';
    expect(decodeLocation(file, LEVELS, new Set(['caveCeiling']))?.ceiling).toBeUndefined();
  });
});
