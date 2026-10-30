// Text in the original's fonts in game windows: replacing characters without a glyph, trimming by width and word wrapping
// (no canvas: on a hand-built font).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { charCode, fitText, measureText, printable, type BitmapFont } from '../src/formats/font.ts';

type FontsModule = typeof import('../src/game/fonts.ts');
let fonts: FontsModule;

beforeAll(async () => {
  // fonts.ts pulls in platform.ts, which looks at window on load; tests have no window.
  vi.stubGlobal('window', {});
  fonts = await import('../src/game/fonts.ts');
});

/** A font where each character is 3 wide with a gap of 1 (i.e. 4 pixels per character); those listed in `missing` have no glyph. */
function stubFont(missing = ''): BitmapFont {
  const glyphs = Array.from({ length: 256 }, () => ({ width: 3, height: 1, pixels: new Uint8Array(3).fill(1) }));
  for (const ch of missing) glyphs[charCode(ch)] = { width: 0, height: 1, pixels: new Uint8Array(0) };
  return { format: 'fon', height: 1, letterSpacing: 1, spaceWidth: 3, lineSpacing: 0, levels: 1, glyphs };
}

describe('characters without a glyph', () => {
  it('are replaced by similar ones, and if there is none, by "?"', () => {
    const font = stubFont('ёЁ—…«»ж');
    expect(printable(font, 'Ёлка, ёж')).toBe('Елка, е?');
    expect(printable(font, 'а — б…')).toBe('а - б..');
    expect(printable(font, '«да»')).toBe('"да"');
    expect(printable(font, 'жук')).toBe('?ук');
  });

  it('characters the font has stay as they are', () => {
    const font = stubFont();
    expect(printable(font, 'Ёлка — «пример»…')).toBe('Ёлка — «пример»…');
  });

  it('a character outside the Russian encoding is replaced by "?" explicitly, not silently', () => {
    expect(printable(stubFont(), 'a☃b')).toBe('a?b');
  });

  it('width is computed from the replaced string', () => {
    const font = stubFont('ё');
    expect(fonts.labelWidth(font, 'ёж')).toBe(8);
    expect(measureText(font, 'ёж')).toBe(5);
  });
});

describe('trimming by width', () => {
  const font = stubFont();

  it('fits: as is', () => {
    expect(fitText(font, 'abcde', 20)).toBe('abcde');
  });

  it('does not fit: the end is cut and two dots are added', () => {
    // 4 pixels per character: 20 fits five characters, two of them dots, three letters remain.
    expect(fitText(font, 'abcdefgh', 20)).toBe('abc..');
    expect(measureText(font, fitText(font, 'abcdefgh', 20))).toBeLessThanOrEqual(20);
  });

  it('replaces characters without a glyph and leaves no space before the dots', () => {
    const real = stubFont('ё');
    expect(fitText(real, 'ёж', 40)).toBe('еж');
    expect(fitText(font, 'ab cdefg', 20)).toBe('ab..');
  });

  it('narrow space: only the dots remain', () => {
    expect(fitText(font, 'abcdefgh', 8)).toBe('..');
  });
});

describe('word wrapping', () => {
  const font = stubFont();

  it('fits: one line; does not fit: the next one', () => {
    expect(fonts.wrapText(font, 'ab cd', 20)).toEqual(['ab cd']);
    expect(fonts.wrapText(font, 'aaa bbb ccc', 20)).toEqual(['aaa', 'bbb', 'ccc']);
    expect(fonts.wrapText(font, 'aa bb cc', 20)).toEqual(['aa bb', 'cc']);
  });

  it('the first line may have its own width', () => {
    expect(fonts.wrapText(font, 'ab cd', 20, 12)).toEqual(['ab', 'cd']);
  });

  it('a word that is too long is cut by letters', () => {
    expect(fonts.wrapText(font, 'abcdefgh', 12)).toEqual(['abc', 'def', 'gh']);
    expect(fonts.wrapText(font, 'x abcdefgh', 12)).toEqual(['x', 'abc', 'def', 'gh']);
  });

  it('empty text and extra spaces', () => {
    expect(fonts.wrapText(font, '', 20)).toEqual([]);
    expect(fonts.wrapText(font, '  ab   cd ', 40)).toEqual(['ab cd']);
  });

  it('no line is wider than the window', () => {
    const text = 'Рентгенолюминесцентный экстракт Ёлки — «пример» с очень длинными словами внутри';
    const real = stubFont('ёЁ—');
    for (const line of fonts.wrapText(real, text, 60)) expect(measureText(real, line)).toBeLessThanOrEqual(60);
  });
});
