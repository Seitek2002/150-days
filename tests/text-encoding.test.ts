// Encoding of the original's texts: a Cyrillic translation is windows-1251 even in a short single-phrase file, English is Latin.
import { describe, expect, it } from 'vitest';
import { decodeText, parseMsg } from '../src/formats/text.ts';

const cp1251 = (text: string) =>
  Uint8Array.from([...text].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c < 0x80) return c;
    if (c >= 0x410 && c <= 0x44f) return c - 0x410 + 0xc0;
    return 0x3f;
  }));

describe('text encoding', () => {
  it('a short Cyrillic phrase — windows-1251', () => {
    expect(decodeText(cp1251('{101}{}{Уходи.}'))).toBe('{101}{}{Уходи.}');
  });
  it('English text with a rare accented letter — Latin', () => {
    expect(decodeText(Uint8Array.from([...'{1}{}{Caf', 0xe9, ...'}'].map((x) => (typeof x === 'string' ? x.charCodeAt(0) : x))))).toBe('{1}{}{Café}');
  });
});

describe('message texts', () => {
  it('a space at the edge stays (scripts glue phrases together), a line break at the edge is removed', () => {
    const msg = parseMsg(new TextEncoder().encode('{118}{}{Hello, }\n{119}{}{.}\n{120}{}{\n  Two\n  lines  \n}\n'));
    expect(msg.get(118)).toBe('Hello, ');
    expect(msg.get(119)).toBe('.');
    expect(msg.get(120)).toBe('Two lines');
  });
});
