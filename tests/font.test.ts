// Fallout fonts. The first part runs on hand-built files (always runs),
// the second on a real game copy (path from .local/config.json; no copy: skipped).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
import { charCode, lineHeight, measureText, parseAaf, parseColor, parseFon, parseFont, renderText, type BitmapFont } from '../src/formats/font.ts';

/** A FON with two glyphs: "A" 3 wide (three rows of bits) and "B" 2 wide; the rest up to 256 are not needed (num = 2). */
function tinyFon(): Uint8Array {
  const out: number[] = [];
  const int = (v: number) => out.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255);
  int(2); // glyph count
  int(3); // height
  int(1); // gap between letters
  int(0); // reserved
  int(0); // reserved
  int(3); int(0); // glyph 0: width 3, offset 0
  int(2); int(3); // glyph 1: width 2, offset 3
  out.push(0b10100000, 0b01000000, 0b11100000); // glyph 0: "X.X", ".X.", "XXX"
  out.push(0b11000000, 0b01000000, 0b10000000); // glyph 1: "XX", ".X", "X."
  return Uint8Array.from(out);
}

/** AAF: height 4, gap 1, space 3; "A" (65) is 2×2, "B" (66) is 2×4. */
function tinyAaf(): Uint8Array {
  const out: number[] = [0x41, 0x41, 0x46, 0x46];
  const short = (v: number) => out.push((v >> 8) & 255, v & 255);
  const long = (v: number) => out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  short(4);
  short(1);
  short(3);
  short(2);
  for (let code = 0; code < 256; code++) {
    if (code === 65) {
      short(2);
      short(2);
      long(0);
    } else if (code === 66) {
      short(2);
      short(4);
      long(4);
    } else {
      short(0);
      short(0);
      long(0);
    }
  }
  out.push(7, 0, 0, 3); // "A"
  out.push(7, 7, 7, 7, 1, 2, 3, 9); // "B"; the nine is beyond the levels and counts as fully filled
  return Uint8Array.from(out);
}

const alphaAt = (image: { width: number; pixels: Uint8ClampedArray }, x: number, y: number) => image.pixels[(y * image.width + x) * 4 + 3];

describe('fonts on hand-built files', () => {
  it('FON: width, height and glyph pixels', () => {
    const font = parseFon(tinyFon());
    expect(font).toMatchObject({ format: 'fon', height: 3, letterSpacing: 1, levels: 1 });
    expect(font.glyphs).toHaveLength(256);
    expect(font.glyphs[0]).toMatchObject({ width: 3, height: 3 });
    expect([...font.glyphs[0]!.pixels]).toEqual([1, 0, 1, 0, 1, 0, 1, 1, 1]);
    expect([...font.glyphs[1]!.pixels]).toEqual([1, 1, 0, 1, 1, 0]);
  });

  it('AAF: gaps, glyphs and levels', () => {
    const font = parseAaf(tinyAaf());
    expect(font).toMatchObject({ format: 'aaf', height: 4, letterSpacing: 1, spaceWidth: 3, lineSpacing: 2, levels: 7 });
    expect([...font.glyphs[65]!.pixels]).toEqual([7, 0, 0, 3]);
    expect([...font.glyphs[66]!.pixels]).toEqual([7, 7, 7, 7, 1, 2, 3, 7]);
    expect(parseFont(tinyAaf()).format).toBe('aaf');
    expect(parseFont(tinyFon()).format).toBe('fon');
  });

  it('draws a string: width with gaps, pixels in place, colour and transparency', () => {
    const font = parseAaf(tinyAaf());
    expect(measureText(font, 'AB')).toBe(2 + 1 + 2 + 1);
    expect(measureText(font, 'A B')).toBe(2 + 1 + 3 + 1 + 2 + 1);
    const image = renderText(font, 'AB', '#336699');
    expect(image).toMatchObject({ width: 6, height: 4 });
    // "A" is lower: height 2 with a line height of 4, it stands on the baseline, i.e. from the third row.
    expect(alphaAt(image, 0, 0)).toBe(0);
    expect(alphaAt(image, 0, 2)).toBe(255);
    expect(alphaAt(image, 1, 3)).toBe(Math.round((3 / 7) * 255));
    expect([...image.pixels.slice((2 * image.width) * 4, (2 * image.width) * 4 + 3)]).toEqual([0x33, 0x66, 0x99]);
    // "B" starts at the fourth column and takes the full height.
    expect(alphaAt(image, 3, 0)).toBe(255);
  });

  it('FON is drawn from the top line and several lines are separated', () => {
    const font = parseFon(tinyFon());
    const image = renderText(font, '\u0000\n\u0001', [255, 0, 0]);
    expect(image).toMatchObject({ width: 4, height: 3 + lineHeight(font) });
    expect(alphaAt(image, 0, 0)).toBe(255);
    expect(alphaAt(image, 1, 0)).toBe(0);
    expect(alphaAt(image, 0, lineHeight(font))).toBe(255);
  });

  it('a character without a glyph becomes "?", Russian letters go by windows-1251', () => {
    expect(charCode('A')).toBe(65);
    expect(charCode('А')).toBe(0xc0);
    expect(charCode('я')).toBe(0xff);
    expect(charCode('Ё')).toBe(0xa8);
    expect(charCode('€')).toBe(0x88);
    expect(charCode('☃')).toBe(63);
  });

  it('colours and corrupted files', () => {
    expect(parseColor('#f0b43c')).toEqual([0xf0, 0xb4, 0x3c]);
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(() => parseColor('yellow')).toThrow();
    expect(() => parseFon(tinyFon().subarray(0, 30))).toThrow();
    expect(() => parseAaf(tinyAaf().subarray(0, 100))).toThrow();
    expect(() => parseAaf(tinyFon())).toThrow();
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

describe.skipIf(!available)('fonts from the player\'s Fallout 1 copy', () => {
  const game = available ? openGame(gameDir) : null;
  afterAll(() => game?.close());

  /** All fonts of the copy: FONT0…FONT9 in both formats (some numbers may be missing). */
  const fonts = (): { name: string; font: BitmapFont }[] => {
    const found: { name: string; font: BitmapFont }[] = [];
    for (let n = 0; n <= 9; n++) {
      for (const ext of ['FON', 'AAF']) {
        const name = `FONT${n}.${ext}`;
        const bytes = game.read(name);
        if (bytes) found.push({ name, font: parseFont(bytes) });
      }
    }
    return found;
  };

  it('all fonts read and match the format of their extension', () => {
    const all = fonts();
    expect(all.length).toBeGreaterThanOrEqual(5);
    for (const { name, font } of all) {
      expect(font.format, name).toBe(name.endsWith('.AAF') ? 'aaf' : 'fon');
      expect(font.glyphs, name).toHaveLength(256);
      expect(font.height, name).toBeGreaterThan(0);
      expect(font.glyphs[65]!.width, name + ' "A"').toBeGreaterThan(0);
    }
  });

  it('each font draws a word: there are filled pixels, the width matches the computation', () => {
    for (const { name, font } of fonts()) {
      for (const word of ['Hello, World', '150 ДНЕЙ']) {
        const image = renderText(font, word, '#f0b43c');
        expect(image.width, `${name} "${word}"`).toBe(measureText(font, word));
        expect(image.width, `${name} "${word}"`).toBeGreaterThan(font.height / 2);
        let ink = 0;
        for (let i = 3; i < image.pixels.length; i += 4) if (image.pixels[i]! > 0) ink++;
        expect(ink, `${name} "${word}"`).toBeGreaterThan(word.length);
      }
    }
  });
});
