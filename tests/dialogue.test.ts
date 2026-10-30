// Layout of reply options in the dialogue window: wrapping by width, the "bullet", spacing and display in a window of limited height
// (no canvas: on a hand-built font).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { charCode, type BitmapFont } from '../src/formats/font.ts';

type Module = typeof import('../src/game/dialogue-screen.ts');
let dialogue: Module;

beforeAll(async () => {
  // dialogue-screen.ts pulls in platform.ts, which looks at window on load; tests have no window.
  vi.stubGlobal('window', {});
  dialogue = await import('../src/game/dialogue-screen.ts');
});

/** Font: each glyph is 3 wide with a 1 gap (4 pixels per glyph), a line is 10 pixels; glyphs in `missing` are absent. */
function stubFont(missing = ''): BitmapFont {
  const glyphs = Array.from({ length: 256 }, () => ({ width: 3, height: 1, pixels: new Uint8Array(3).fill(1) }));
  for (const ch of missing) glyphs[charCode(ch)] = { width: 0, height: 1, pixels: new Uint8Array(0) };
  return { format: 'fon', height: 9, letterSpacing: 1, spaceWidth: 3, lineSpacing: 1, levels: 1, glyphs };
}

describe('option layout', () => {
  it('each option has a "bullet", one under another, with a two-pixel gap', () => {
    const blocks = dialogue.layoutOptions(stubFont(), ['yes', 'no', 'maybe'], 400);
    expect(blocks.map((b) => b.lines)).toEqual([['• yes'], ['• no'], ['• maybe']]);
    expect(blocks.map((b) => b.top)).toEqual([0, 12, 24]);
    expect(blocks.map((b) => b.height)).toEqual([10, 10, 10]);
    expect(blocks.map((b) => b.index)).toEqual([0, 1, 2]);
  });

  it('a long option wraps by words, the next one starts lower', () => {
    // 40 pixels: ten glyphs per line
    const blocks = dialogue.layoutOptions(stubFont(), ['aaaa bbbb cccc', 'ok'], 40);
    expect(blocks[0]!.lines).toEqual(['• aaaa', 'bbbb cccc']);
    expect(blocks[0]!.height).toBe(20);
    expect(blocks[1]!.top).toBe(22);
  });

  it('an empty option means "end the conversation"', () => {
    const blocks = dialogue.layoutOptions(stubFont(), ['  '], 400);
    expect(blocks[0]!.lines[0]!.startsWith('• ')).toBe(true);
    expect(blocks[0]!.lines[0]!.length).toBeGreaterThan(3);
  });

  it('if the font has no "bullet", an asterisk is drawn', () => {
    const blocks = dialogue.layoutOptions(stubFont('•'), ['yes'], 400);
    expect(blocks[0]!.lines).toEqual(['* yes']);
  });

  it('no options: no blocks', () => {
    expect(dialogue.layoutOptions(stubFont(), [], 400)).toEqual([]);
  });
});

describe('showing options in a window of limited height', () => {
  // three options of 10 pixels with a gap of 2: tops 0, 12, 24
  const three = () => dialogue.layoutOptions(stubFont(), ['one', 'two', 'three'], 400);

  it('all fit: all are visible', () => {
    expect(dialogue.visibleOptions(three(), 0, 100).map((b) => b.index)).toEqual([0, 1, 2]);
  });

  it('two fit: two are shown, the rest scrolls', () => {
    expect(dialogue.visibleOptions(three(), 0, 25).map((b) => b.index)).toEqual([0, 1]);
    expect(dialogue.visibleOptions(three(), 1, 25).map((b) => b.index)).toEqual([1, 2]);
    expect(dialogue.visibleOptions(three(), 5, 25)).toEqual([]);
  });

  it('an option that does not fit entirely is still visible (at least one)', () => {
    const tall = dialogue.layoutOptions(stubFont(), ['aaaa bbbb cccc dddd eeee ffff gggg'], 40);
    expect(dialogue.visibleOptions(tall, 0, 15)).toHaveLength(1);
  });

  it('the needed option is always visible: the start moves exactly as much as needed', () => {
    expect(dialogue.firstVisibleOption(three(), 0, 0, 25)).toBe(0);
    expect(dialogue.firstVisibleOption(three(), 0, 1, 25)).toBe(0);
    expect(dialogue.firstVisibleOption(three(), 0, 2, 25)).toBe(1);
    // Back at the start: the window returns.
    expect(dialogue.firstVisibleOption(three(), 1, 0, 25)).toBe(0);
    // The needed one is already in the window: the window does not move.
    expect(dialogue.firstVisibleOption(three(), 1, 2, 25)).toBe(1);
  });

  it('empty list and going out of bounds', () => {
    expect(dialogue.firstVisibleOption([], 3, 9, 100)).toBe(0);
    expect(dialogue.firstVisibleOption(three(), -4, 99, 100)).toBe(0);
  });
});

describe('the speaker\'s mood and head "fidgets"', () => {
  const head = { name: 'OVRSR', good: 3, neutral: 2, bad: 1 };

  it('1 is good, 7 is bad, everything else is neutral', () => {
    expect(dialogue.moodLetter(1)).toBe('G');
    expect(dialogue.moodLetter(7)).toBe('B');
    expect(dialogue.moodLetter(4)).toBe('N');
    expect(dialogue.moodLetter(0)).toBe('N');
    expect(dialogue.moodLetter(22)).toBe('N');
    expect(dialogue.moodLetter(-1)).toBe('N');
  });

  it('the number of "fidgets" is taken by mood', () => {
    expect(dialogue.fidgetCount(head, 1)).toBe(3);
    expect(dialogue.fidgetCount(head, 4)).toBe(2);
    expect(dialogue.fidgetCount(head, 7)).toBe(1);
    expect(dialogue.fidgetCount(head, 9)).toBe(2);
  });
});
