import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parseFrm } from '../src/formats/frm.ts';
import { parsePalette } from '../src/formats/pal.ts';
import { spriteDirection } from '../src/game/creature.ts';

const require = createRequire(import.meta.url);
const { lzss } = require('../electron/gamefiles.cjs');

describe('LZSS from Fallout archives', () => {
  it('unpacks literal bytes and dictionary references', () => {
    // Flags 0b0000_0111: three literal bytes "ABC", then a reference: offset 4078, length 3 → "ABC" again.
    const packed = Buffer.from([0x07, 0x41, 0x42, 0x43, 0xee, 0xf0]);
    expect(lzss(packed).toString('latin1')).toBe('ABCABC');
  });

  it('the empty dictionary is filled with spaces', () => {
    const packed = Buffer.from([0x00, 0x00, 0x01]);
    expect(lzss(packed).toString('latin1')).toBe('    ');
  });
});

function makeFrm(width: number, height: number): Uint8Array {
  const size = width * height;
  const buf = new Uint8Array(62 + 12 + size);
  const v = new DataView(buf.buffer);
  v.setUint32(0, 4);
  v.setUint16(4, 8); // fps
  v.setUint16(8, 1); // frames per direction
  v.setInt16(10, 3); // X shift of direction 0
  // All 6 directions point to the same data.
  v.setUint16(62, width);
  v.setUint16(64, height);
  v.setUint32(66, size);
  for (let i = 0; i < size; i++) buf[74 + i] = i + 1;
  return buf;
}

describe('FRM', () => {
  it('reads frames and repeats the only direction 6 times', () => {
    const frm = parseFrm(makeFrm(2, 3));
    expect(frm.fps).toBe(8);
    expect(frm.directions).toHaveLength(6);
    expect(frm.directions[5]).toBe(frm.directions[0]);
    expect(frm.directions[0]?.shiftX).toBe(3);
    expect(frm.directions[0]?.frames[0]?.pixels).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  it('refuses to read a corrupted file', () => {
    const bad = makeFrm(2, 3);
    new DataView(bad.buffer).setUint32(66, 999);
    expect(() => parseFrm(bad)).toThrow();
  });
});

describe('Palette', () => {
  it('colour 0 is transparent, 63 → 255', () => {
    const data = new Uint8Array(768);
    data.set([63, 0, 0], 3);
    const pal = parsePalette(data);
    expect(pal[0]).toBe(0);
    expect((pal[1]! >>> 0) & 0xff).toBe(255);
    expect((pal[1]! >>> 24) & 0xff).toBe(255);
  });
});

describe('Sprite direction', () => {
  const cam = { x: 0, y: 0, angle: 0, pitch: 0 };
  const rat = { x: 5, y: 0 };
  it('facing the player: one of the "toward the viewer" directions', () => {
    expect([2, 3]).toContain(spriteDirection(Math.PI, rat, cam));
  });
  it('back to the player: "away from the viewer"', () => {
    expect([0, 5]).toContain(spriteDirection(0, rat, cam));
  });
  it('sideways: right on screen and left on screen', () => {
    // The camera looks along +X, the right side of the screen is +Y.
    expect(spriteDirection(Math.PI / 2, rat, cam)).toBe(1);
    expect(spriteDirection(-Math.PI / 2, rat, cam)).toBe(4);
  });
});
