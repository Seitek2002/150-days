// Fallout text files: lists (LST) and messages (MSG of the form {number}{sound}{text}).

/**
 * Encoding: Cyrillic translations use windows-1251, the original uses Latin. Cyrillic — if almost all non-Latin bytes are
 * Cyrillic letters (0xC0–0xFF) and there are at least three of them: that way even a short one-phrase file is read correctly, and a rare "é" in English isn't.
 */
export function decodeText(bytes: Uint8Array): string {
  let high = 0;
  let cyrillic = 0;
  for (const b of bytes) {
    if (b >= 0x80) high++;
    if (b >= 0xc0) cyrillic++;
  }
  return new TextDecoder(cyrillic >= 3 && cyrillic >= high * 0.6 ? 'windows-1251' : 'windows-1252').decode(bytes);
}

const decode = decodeText;

/** List lines without comments: "mamrat,19 ; rat" → "mamrat". */
export function parseLst(bytes: Uint8Array): string[] {
  return decode(bytes)
    .split(/\r?\n/)
    .map((line) => (line.split(';')[0] ?? '').split(',')[0]!.trim());
}

export function parseMsg(bytes: Uint8Array): Map<number, string> {
  const out = new Map<number, string>();
  const re = /\{(\d+)\}\{[^}]*\}\{([^}]*)\}/g;
  for (const m of decode(bytes).matchAll(re)) out.set(Number(m[1]), msgText(m[2] ?? ''));
  return out;
}

/**
 * Message text: line breaks and runs of spaces become one space. A space at the edge of the line stays (scripts glue phrases together:
 * "Good day, " + name + "."), while a line break at the edge is removed.
 */
function msgText(raw: string): string {
  let text = raw.replace(/\s+/g, ' ');
  if (/^\s*[\r\n]/.test(raw) || /^\s+$/.test(raw)) text = text.trimStart();
  if (/[\r\n]\s*$/.test(raw)) text = text.trimEnd();
  return text;
}
