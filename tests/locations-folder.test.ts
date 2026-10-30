// The locations folder (location variants from the editor): reading and writing is allowed only inside it and only for editor data.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { listLocations, readLocation, writeLocation, readChoice, writeChoice } = require('../electron/locations.cjs') as {
  listLocations(dir: string): { base: string; name: string }[];
  readLocation(dir: string, base: string, name: string): unknown;
  writeLocation(dir: string, base: string, name: string, data: unknown): string;
  readChoice(dir: string): Record<string, string>;
  writeChoice(dir: string, choice: unknown): Record<string, string>;
};
const data = { format: '150days-location', version: 1 };

describe('locations folder', () => {
  it('written — the file is in the level folder, in the list, readable; a non-ASCII name with spaces is fine', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locations-'));
    const file = writeLocation(dir, 'shady-sands-e', 'Maison à côté 2', data);
    expect(file).toBe(path.join(dir, 'shady-sands-e', 'Maison à côté 2.json'));
    expect(listLocations(dir)).toMatchObject([{ base: 'shady-sands-e', name: 'Maison à côté 2' }]);
    expect(readLocation(dir, 'shady-sands-e', 'Maison à côté 2')).toEqual(data);
  });

  it('cannot leave the folder; foreign data cannot be written', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locations-'));
    expect(() => writeLocation(dir, '../x', 'a', data)).toThrow();
    expect(() => writeLocation(dir, 'shady-sands-e', '../a', data)).toThrow();
    expect(() => writeLocation(dir, 'shady-sands-e', 'a/b', data)).toThrow();
    expect(() => writeLocation(dir, 'shady-sands-e', '.hidden', data)).toThrow();
    expect(() => writeLocation(dir, 'shady-sands-e', 'ok', { hello: 1 })).toThrow();
    expect(() => readLocation(dir, '..', 'a')).toThrow();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('choosing own locations: only valid levels and names; no file — empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locations-'));
    expect(readChoice(dir)).toEqual({});
    expect(writeChoice(dir, { 'shady-sands-e': ' My house ', '../x': 'a', hub: '../b', junktown: 5 })).toEqual({ 'shady-sands-e': 'My house' });
    expect(readChoice(dir)).toEqual({ 'shady-sands-e': 'My house' });
    expect(listLocations(dir)).toEqual([]);
  });
});
