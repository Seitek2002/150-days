// "Share" a location: pack — the location and its own blocks in one folder; unpack at a friend's — the location into locations,
// the blocks into blocks; an identical block is not copied, a different one with the same name arrives as "… (2)", and the location is rewritten to use it.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { packLocation, listPacks, unpackLocation } = require('../electron/packs.cjs') as {
  packLocation(dirs: Dirs, base: string, name: string): { path: string; blocks: string[]; missing: string[] };
  listPacks(dir: string): string[];
  unpackLocation(dirs: Dirs, packDir: string): { base: string; name: string; added: string[]; same: string[]; renamed: [string, string][] };
};
const { writeLocation, readLocation } = require('../electron/locations.cjs') as {
  writeLocation(dir: string, base: string, name: string, data: unknown): string;
  readLocation(dir: string, base: string, name: string): { legend: Record<string, string>; name: string } | null;
};
const { writeBlockFile, listBlocks } = require('../electron/blocks.cjs') as {
  writeBlockFile(dir: string, name: string, file: string, bytes: Uint8Array): string;
  listBlocks(dir: string): { name: string; files: { file: string }[] }[];
};
interface Dirs {
  locations: string;
  blocks: string;
  packs: string;
}

const home = (): Dirs => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-'));
  return { locations: path.join(root, 'locations'), blocks: path.join(root, 'blocks'), packs: path.join(root, 'packs') };
};
const place = { format: '150days-location', version: 1, base: 'shady-sands-e', name: 'My house', legend: { A: 'b:Oak door', B: 'tex:brick', C: 'b:Tile' }, floors: [] };

describe('packing a location', () => {
  it('a folder with the location, its own blocks and a readme; our blocks are not there, missing ones are in the answer', () => {
    const me = home();
    writeLocation(me.locations, 'shady-sands-e', 'My house', place);
    writeBlockFile(me.blocks, 'Oak door', 'block.png', new Uint8Array([1, 2]));
    writeBlockFile(me.blocks, 'Oak door', 'open.wav', new Uint8Array([3]));
    writeBlockFile(me.blocks, 'Someone else', 'block.png', new Uint8Array([9]));
    const packed = packLocation(me, 'shady-sands-e', 'My house');
    expect(packed.path).toBe(path.join(me.packs, 'My house'));
    expect(packed).toMatchObject({ blocks: ['Oak door'], missing: ['Tile'] });
    expect(fs.readdirSync(packed.path).sort()).toEqual(['blocks', 'place.json', 'README.txt'].sort());
    expect(listBlocks(path.join(packed.path, 'blocks'))).toMatchObject([{ name: 'Oak door', files: [{ file: 'block.png' }, { file: 'open.wav' }] }]);
    expect(listPacks(me.packs)).toEqual(['My house']);
    // A second time — next to it, "(2)": the previous folder is not overwritten.
    expect(packLocation(me, 'shady-sands-e', 'My house').path).toBe(path.join(me.packs, 'My house (2)'));
  });

  it('an unsaved location cannot be packed', () => {
    expect(() => packLocation(home(), 'shady-sands-e', 'No such')).toThrow();
  });
});

describe('unpacking a location at a friend\'s', () => {
  const packed = () => {
    const me = home();
    writeLocation(me.locations, 'shady-sands-e', 'My house', place);
    writeBlockFile(me.blocks, 'Oak door', 'block.png', new Uint8Array([1, 2]));
    writeBlockFile(me.blocks, 'Tile', 'a.png', new Uint8Array([5]));
    return packLocation(me, 'shady-sands-e', 'My house').path;
  };

  it('the friend has nothing — the location and blocks are laid out as is', () => {
    const friend = home();
    const result = unpackLocation(friend, packed());
    expect(result).toEqual({ base: 'shady-sands-e', name: 'My house', added: ['Oak door', 'Tile'], same: [], renamed: [] });
    expect(listBlocks(friend.blocks).map((b) => b.name)).toEqual(['Oak door', 'Tile']);
    expect(readLocation(friend.locations, 'shady-sands-e', 'My house')?.legend).toEqual(place.legend);
  });

  it('an identical block is not copied; a different one with the same name becomes "(2)" and the location uses it; a second location becomes "… 2"', () => {
    const friend = home();
    writeLocation(friend.locations, 'shady-sands-e', 'My house', place);
    writeBlockFile(friend.blocks, 'Oak door', 'block.png', new Uint8Array([1, 2]));
    writeBlockFile(friend.blocks, 'Tile', 'a.png', new Uint8Array([7, 7, 7]));
    const result = unpackLocation(friend, packed());
    expect(result).toEqual({ base: 'shady-sands-e', name: 'My house 2', added: [], same: ['Oak door'], renamed: [['Tile', 'Tile (2)']] });
    expect(readLocation(friend.locations, 'shady-sands-e', 'My house 2')?.legend.C).toBe('b:Tile (2)');
    // The friend's own "Tile" is untouched.
    expect([...fs.readFileSync(path.join(friend.blocks, 'Tile', 'a.png'))]).toEqual([7, 7, 7]);
    // The same location again — "Tile (2)" is already the right one: no new copy.
    const again = unpackLocation(friend, packed());
    expect(again.renamed).toEqual([['Tile', 'Tile (2)']]);
    expect(listBlocks(friend.blocks).map((b) => b.name)).toEqual(['Oak door', 'Tile', 'Tile (2)']);
  });

  it('a folder without a location or with a foreign file is an error, nothing is written', () => {
    const friend = home();
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-'));
    expect(() => unpackLocation(friend, empty)).toThrow();
    fs.writeFileSync(path.join(empty, 'old-place.json'), '{"format":"other"}');
    expect(() => unpackLocation(friend, empty)).toThrow();
    expect(fs.existsSync(friend.locations)).toBe(false);
  });
});
