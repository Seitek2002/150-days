// Interplay MVE movies (ART\CUTS\*.MVE) — Fallout's intro, the Overseer's speech, the endings.
// Our parser, from the format description: a 26-byte header, then chunks, each with opcodes: timer,
// audio buffers, video mode, palette, a "method map" for blocks and frame data, audio, frame display.
// The image is 8 bits per point with a palette; the frame is split into 8×8 blocks, each encoded with one of 16 methods (a copy from
// the previous frame with an offset, 2- or 4-color patterns, a fill, raw points). Audio is 16-bit with "delta" compression:
// each byte is a step index from a table, the step is added to the previous value.

const SIGNATURE = 'Interplay MVE File\x1a\0';

/** Audio steps: byte index → increment (Interplay's overflows at 16 bits, hence the "jumps" in the middle). */
const DELTAS = new Int32Array([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 47, 51, 56, 61, 66, 72, 79, 86, 94, 102, 112, 122, 133, 145, 158, 173,
  189, 206, 225, 245, 267, 292, 318, 348, 379, 414, 452, 493, 538, 587, 640, 699, 763, 832, 908, 991, 1081, 1180, 1288,
  1405, 1534, 1673, 1826, 1993, 2175, 2373, 2590, 2826, 3084, 3365, 3672, 4008, 4373, 4772, 5208, 5683, 6202, 6767, 7385,
  8059, 8794, 9597, 10472, 11428, 12471, 13609, 14851, 16206, 17685, 19298, 21060, 22981, 25078, 27367, 29864, 32589,
  -29973, -26728, -23186, -19322, -15105, -10503, -5481, -1, 1, 1, 5481, 10503, 15105, 19322, 23186, 26728, 29973, -32589,
  -29864, -27367, -25078, -22981, -21060, -19298, -17685, -16206, -14851, -13609, -12471, -11428, -10472, -9597, -8794,
  -8059, -7385, -6767, -6202, -5683, -5208, -4772, -4373, -4008, -3672, -3365, -3084, -2826, -2590, -2373, -2175, -1993,
  -1826, -1673, -1534, -1405, -1288, -1180, -1081, -991, -908, -832, -763, -699, -640, -587, -538, -493, -452, -414, -379,
  -348, -318, -292, -267, -245, -225, -206, -189, -173, -158, -145, -133, -122, -112, -102, -94, -86, -79, -72, -66, -61,
  -56, -51, -47, -43, -42, -41, -40, -39, -38, -37, -36, -35, -34, -33, -32, -31, -30, -29, -28, -27, -26, -25, -24, -23,
  -22, -21, -20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1,
]);

export interface MveInfo {
  width: number;
  height: number;
  /** Frame duration, ms. */
  frameMs: number;
  /** Audio: sample rate and channel count (0 — no audio). */
  rate: number;
  channels: number;
}

/** One displayed frame: point color indices and the palette (RGBA for the canvas, 4 bytes per color). */
export interface MveFrame {
  index: number;
  pixels: Uint8Array;
  palette: Uint8ClampedArray;
}

interface Op {
  type: number;
  version: number;
  data: Uint8Array;
}

/** All the movie's opcodes in order. */
function* opcodes(bytes: Uint8Array): Generator<Op> {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 20));
  if (head !== SIGNATURE) throw new Error('Not an MVE movie');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 26;
  while (p + 4 <= bytes.length) {
    const size = view.getUint16(p, true);
    let q = p + 4;
    const end = Math.min(bytes.length, q + size);
    while (q + 4 <= end) {
      const len = view.getUint16(q, true);
      const type = bytes[q + 2]!;
      const version = bytes[q + 3]!;
      yield { type, version, data: bytes.subarray(q + 4, q + 4 + len) };
      if (type === 0) return;
      q += 4 + len;
    }
    p = end;
  }
}

const u16 = (d: Uint8Array, at: number) => d[at]! | (d[at + 1]! << 8);
const u32 = (d: Uint8Array, at: number) => (d[at]! | (d[at + 1]! << 8) | (d[at + 2]! << 16) | (d[at + 3]! << 24)) >>> 0;

/** Movie info: frame size, speed, audio. */
export function readMveInfo(bytes: Uint8Array): MveInfo {
  const info: MveInfo = { width: 0, height: 0, frameMs: 66, rate: 0, channels: 0 };
  for (const op of opcodes(bytes)) {
    if (op.type === 0x02) info.frameMs = (u32(op.data, 0) * u16(op.data, 4)) / 1000;
    else if (op.type === 0x03) {
      const flags = u16(op.data, 2);
      info.rate = u16(op.data, 4);
      info.channels = (flags & 1) + 1;
    } else if (op.type === 0x05) {
      info.width = u16(op.data, 0) * 8;
      info.height = u16(op.data, 2) * 8;
    }
    if (info.width && info.rate && op.type === 0x07) break;
  }
  return info;
}

/**
 * All of the movie's audio (the first track), 16-bit, stereo interleaved. Pauses (the "silence" opcode) — as zeros, so the audio doesn't
 * run ahead of the picture; withSilence = false — without them (as ffmpeg outputs it, for comparison).
 */
export function decodeMveAudio(bytes: Uint8Array, withSilence = true): Int16Array {
  const parts: Int16Array[] = [];
  let total = 0;
  let channels = 1;
  let compressed = false;
  let sixteen = true;
  for (const op of opcodes(bytes)) {
    if (op.type === 0x03) {
      const flags = u16(op.data, 2);
      channels = (flags & 1) + 1;
      sixteen = (flags & 2) !== 0;
      compressed = op.version >= 1 && (flags & 4) !== 0;
      continue;
    }
    if (op.type !== 0x08 && (op.type !== 0x09 || !withSilence)) continue;
    if ((u16(op.data, 2) & 1) === 0) continue;
    const len = u16(op.data, 4);
    const count = sixteen ? len / 2 : len;
    const out = new Int16Array(count);
    if (op.type === 0x08) {
      const src = op.data.subarray(6);
      if (compressed) {
        // First — the channels' initial values (which are also the first samples), then step indices, channels in turn.
        const pred = [0, 0];
        let o = 0;
        for (let c = 0; c < channels; c++) {
          pred[c] = (src[c * 2]! | (src[c * 2 + 1]! << 8)) << 16 >> 16;
          out[o++] = pred[c]!;
        }
        let ch = 0;
        for (let i = channels * 2; i < src.length && o < count; i++) {
          const v = Math.max(-32768, Math.min(32767, pred[ch]! + DELTAS[src[i]!]!));
          pred[ch] = v;
          out[o++] = v;
          ch = (ch + 1) % channels;
        }
      } else if (sixteen) {
        for (let i = 0; i < count; i++) out[i] = (src[i * 2]! | (src[i * 2 + 1]! << 8)) << 16 >> 16;
      } else {
        for (let i = 0; i < count; i++) out[i] = (src[i]! - 128) << 8;
      }
    }
    parts.push(out);
    total += count;
  }
  const all = new Int16Array(total);
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
}

/**
 * The movie's frames in order (one per "show" opcode). The decoder keeps three frames: the current one, the previous one and the one before —
 * blocks are copied from them (Interplay displays through two buffers in turn).
 */
export function* decodeMveFrames(bytes: Uint8Array): Generator<MveFrame> {
  let width = 0;
  let height = 0;
  let current = new Uint8Array(0);
  let last = new Uint8Array(0);
  let secondLast = new Uint8Array(0);
  let map: Uint8Array = new Uint8Array(0);
  const palette = new Uint8ClampedArray(256 * 4);
  let index = 0;
  for (const op of opcodes(bytes)) {
    switch (op.type) {
      case 0x05: {
        width = u16(op.data, 0) * 8;
        height = u16(op.data, 2) * 8;
        current = new Uint8Array(width * height);
        last = new Uint8Array(width * height);
        secondLast = new Uint8Array(width * height);
        break;
      }
      case 0x0c: {
        const start = u16(op.data, 0);
        const count = u16(op.data, 2);
        for (let i = 0; i < count && start + i < 256; i++) {
          // Palette colors are 6-bit; to 8 bits — by repeating the high bits (63 → 255).
          for (let c = 0; c < 3; c++) {
            const v = op.data[4 + i * 3 + c]! & 63;
            palette[(start + i) * 4 + c] = (v << 2) | (v >> 4);
          }
          palette[(start + i) * 4 + 3] = 255;
        }
        break;
      }
      case 0x0f:
        map = op.data;
        break;
      case 0x11:
        decodeVideo(op.data.subarray(14), map, current, last, secondLast, width, height);
        break;
      case 0x07: {
        yield { index: index++, pixels: current, palette };
        // Buffers rotate: the displayed one becomes the previous, the previous — the one before.
        const spare = secondLast;
        secondLast = last;
        last = current;
        current = spare;
        break;
      }
    }
  }
}

/** 8×8 frame blocks by the "method map" (4 bits per block, low bits first). */
function decodeVideo(src: Uint8Array, map: Uint8Array, cur: Uint8Array, last: Uint8Array, second: Uint8Array, w: number, h: number): void {
  let p = 0;
  const byte = () => src[p++] ?? 0;
  const le16 = () => byte() | (byte() << 8);
  const le32 = () => (le16() | (le16() << 16)) >>> 0;
  const bw = w >> 3;
  const bh = h >> 3;
  /** Copy an 8×8 block from frame from with offset (dx, dy); past the edge — skip. */
  const copy = (from: Uint8Array, bx: number, by: number, dx: number, dy: number) => {
    const sx = bx + dx;
    const sy = by + dy;
    if (sx < 0 || sy < 0 || sx + 8 > w || sy + 8 > h) return;
    for (let y = 0; y < 8; y++) {
      const s = (sy + y) * w + sx;
      const d = (by + y) * w + bx;
      if (from === cur) for (let x = 0; x < 8; x++) cur[d + x] = cur[s + x]!;
      else cur.set(from.subarray(s, s + 8), d);
    }
  };
  for (let b = 0; b < bw * bh; b++) {
    const code = ((map[b >> 1] ?? 0) >> ((b & 1) * 4)) & 0x0f;
    const bx = (b % bw) * 8;
    const by = Math.floor(b / bw) * 8;
    const at = (x: number, y: number) => (by + y) * w + bx + x;
    switch (code) {
      case 0x0:
        copy(last, bx, by, 0, 0);
        break;
      case 0x1:
        copy(second, bx, by, 0, 0);
        break;
      case 0x2: {
        const B = byte();
        if (B < 56) copy(second, bx, by, 8 + (B % 7), Math.floor(B / 7));
        else copy(second, bx, by, -14 + ((B - 56) % 29), 8 + Math.floor((B - 56) / 29));
        break;
      }
      case 0x3: {
        const B = byte();
        if (B < 56) copy(cur, bx, by, -(8 + (B % 7)), -Math.floor(B / 7));
        else copy(cur, bx, by, -(-14 + ((B - 56) % 29)), -(8 + Math.floor((B - 56) / 29)));
        break;
      }
      case 0x4: {
        const B = byte();
        copy(last, bx, by, -8 + (B & 0x0f), -8 + (B >> 4));
        break;
      }
      case 0x5: {
        const dx = (byte() << 24) >> 24;
        const dy = (byte() << 24) >> 24;
        copy(last, bx, by, dx, dy);
        break;
      }
      case 0x6:
        // Doesn't occur in 8-bit movies.
        break;
      case 0x7: {
        const P = [byte(), byte()];
        if (P[0]! <= P[1]!) {
          for (let y = 0; y < 8; y++) {
            let flags = byte();
            for (let x = 0; x < 8; x++, flags >>= 1) cur[at(x, y)] = P[flags & 1]!;
          }
        } else {
          let flags = le16();
          for (let y = 0; y < 8; y += 2) {
            for (let x = 0; x < 8; x += 2, flags >>= 1) {
              const c = P[flags & 1]!;
              cur[at(x, y)] = cur[at(x + 1, y)] = cur[at(x, y + 1)] = cur[at(x + 1, y + 1)] = c;
            }
          }
        }
        break;
      }
      case 0x8: {
        const P = [byte(), byte(), 0, 0];
        if (P[0]! <= P[1]!) {
          // Four quarters with 2 colors each: first the left half (top, bottom), then the right.
          let flags = 0;
          for (let y = 0; y < 16; y++) {
            if ((y & 3) === 0) {
              if (y) {
                P[0] = byte();
                P[1] = byte();
              }
              flags = le16();
            }
            const row = y & 7;
            const col = y < 8 ? 0 : 4;
            for (let x = 0; x < 4; x++, flags >>= 1) cur[at(col + x, row)] = P[flags & 1]!;
          }
        } else {
          let flags = le32();
          P[2] = byte();
          P[3] = byte();
          if (P[2] <= P[3]) {
            // Left and right halves, each with its own 2 colors.
            for (let y = 0; y < 16; y++) {
              const row = y & 7;
              const col = y < 8 ? 0 : 4;
              for (let x = 0; x < 4; x++, flags >>>= 1) cur[at(col + x, row)] = P[flags & 1]!;
              if (y === 7) {
                P[0] = P[2];
                P[1] = P[3];
                flags = le32();
              }
            }
          } else {
            // Top and bottom halves.
            for (let y = 0; y < 8; y++) {
              if (y === 4) {
                P[0] = P[2];
                P[1] = P[3];
                flags = le32();
              }
              for (let x = 0; x < 8; x++, flags >>>= 1) cur[at(x, y)] = P[flags & 1]!;
            }
          }
        }
        break;
      }
      case 0x9: {
        const P = [byte(), byte(), byte(), byte()];
        if (P[0]! <= P[1]!) {
          if (P[2]! <= P[3]!) {
            for (let y = 0; y < 8; y++) {
              let flags = le16();
              for (let x = 0; x < 8; x++, flags >>= 2) cur[at(x, y)] = P[flags & 3]!;
            }
          } else {
            let flags = le32();
            for (let y = 0; y < 8; y += 2) {
              for (let x = 0; x < 8; x += 2, flags >>>= 2) {
                const c = P[flags & 3]!;
                cur[at(x, y)] = cur[at(x + 1, y)] = cur[at(x, y + 1)] = cur[at(x + 1, y + 1)] = c;
              }
            }
          }
        } else {
          // 64 bits of flags: two halves of 32.
          let lo = le32();
          let hi = le32();
          const next = () => {
            const v = lo & 3;
            lo = ((lo >>> 2) | ((hi & 3) << 30)) >>> 0;
            hi >>>= 2;
            return v;
          };
          if (P[2]! <= P[3]!) {
            for (let y = 0; y < 8; y++) {
              for (let x = 0; x < 8; x += 2) {
                const c = P[next()]!;
                cur[at(x, y)] = cur[at(x + 1, y)] = c;
              }
            }
          } else {
            for (let y = 0; y < 8; y += 2) {
              for (let x = 0; x < 8; x++) {
                const c = P[next()]!;
                cur[at(x, y)] = cur[at(x, y + 1)] = c;
              }
            }
          }
        }
        break;
      }
      case 0xa: {
        const P = [byte(), byte(), byte(), byte(), 0, 0, 0, 0];
        if (P[0]! <= P[1]!) {
          // Four quarters with 4 colors each (left half — top and bottom, then the right).
          let flags = 0;
          for (let y = 0; y < 16; y++) {
            if ((y & 3) === 0) {
              if (y) for (let i = 0; i < 4; i++) P[i] = byte();
              flags = le32();
            }
            const row = y & 7;
            const col = y < 8 ? 0 : 4;
            for (let x = 0; x < 4; x++, flags >>>= 2) cur[at(col + x, row)] = P[flags & 3]!;
          }
        } else {
          let lo = le32();
          let hi = le32();
          const next = () => {
            const v = lo & 3;
            lo = ((lo >>> 2) | ((hi & 3) << 30)) >>> 0;
            hi >>>= 2;
            return v;
          };
          for (let i = 4; i < 8; i++) P[i] = byte();
          const vertical = P[4]! <= P[5]!;
          // Halves with 4 colors each: left and right (vertical) or top and bottom.
          for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 4; x++) {
              const c = P[next()]!;
              if (vertical) cur[at((y < 8 ? 0 : 4) + x, y & 7)] = c;
              else cur[at((y & 1) * 4 + x, y >> 1)] = c;
            }
            if (y === 7) {
              for (let i = 0; i < 4; i++) P[i] = P[i + 4]!;
              lo = le32();
              hi = le32();
            }
          }
        }
        break;
      }
      case 0xb:
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) cur[at(x, y)] = byte();
        break;
      case 0xc:
        for (let y = 0; y < 8; y += 2) {
          for (let x = 0; x < 8; x += 2) {
            const c = byte();
            cur[at(x, y)] = cur[at(x + 1, y)] = cur[at(x, y + 1)] = cur[at(x + 1, y + 1)] = c;
          }
        }
        break;
      case 0xd: {
        let a = 0;
        let c = 0;
        for (let y = 0; y < 8; y++) {
          if ((y & 3) === 0) {
            a = byte();
            c = byte();
          }
          for (let x = 0; x < 4; x++) {
            cur[at(x, y)] = a;
            cur[at(x + 4, y)] = c;
          }
        }
        break;
      }
      case 0xe: {
        const c = byte();
        for (let y = 0; y < 8; y++) cur.fill(c, at(0, y), at(0, y) + 8);
        break;
      }
      case 0xf: {
        const s = [byte(), byte()];
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x += 2) {
            cur[at(x, y)] = s[y & 1]!;
            cur[at(x + 1, y)] = s[(y & 1) ^ 1]!;
          }
        }
        break;
      }
    }
  }
}
