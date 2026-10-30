// Fallout palette (COLOR.PAL): 256 colors of 3 bytes each, brightness 0..63.
// Color 0 is transparent. We return colors in ABGR format for writing into a Uint32Array (ImageData).

export type Palette = Uint32Array;

export function parsePalette(data: Uint8Array): Palette {
  if (data.length < 768) throw new Error('COLOR.PAL too short');
  const out = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const r = data[i * 3] ?? 0;
    const g = data[i * 3 + 1] ?? 0;
    const b = data[i * 3 + 2] ?? 0;
    // Values above 63 in the Fallout palette mean "no color".
    if (r > 63 || g > 63 || b > 63) {
      out[i] = 0;
      continue;
    }
    const scale = (v: number) => Math.round((v * 255) / 63);
    out[i] = (0xff << 24) | (scale(b) << 16) | (scale(g) << 8) | scale(r);
  }
  out[0] = 0;
  return out;
}
