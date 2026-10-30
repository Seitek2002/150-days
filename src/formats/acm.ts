// Interplay ACM audio — Fallout's sounds and music are stored in it.
// Our decoder: a 14-byte header, then a bit stream (low bits first).
// The sound comes in blocks: each column of a block is encoded with one of the "packing methods",
// then the block goes through the inverse transform (several levels of sums and differences of neighbors).

export interface AcmAudio {
  channels: number;
  rate: number;
  /** Samples, stereo interleaved: left, right, left… */
  samples: Int16Array;
}

const SIGNATURE = 0x01032897;

class Bits {
  private pos: number;
  private buffer = 0;
  private count = 0;
  private readonly data: Uint8Array;

  constructor(data: Uint8Array, start: number) {
    this.data = data;
    this.pos = start;
  }

  /** Up to 16 bits at a time; past the end of the data — zeros. */
  read(n: number): number {
    while (this.count < n) {
      const byte = this.pos < this.data.length ? this.data[this.pos]! : 0;
      this.pos++;
      this.buffer |= byte << this.count;
      this.count += 8;
    }
    const value = this.buffer & ((1 << n) - 1);
    this.buffer >>>= n;
    this.count -= n;
    return value;
  }
}

export function readAcmHeader(bytes: Uint8Array): { samples: number; channels: number; rate: number; levels: number; rows: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 14 || view.getUint32(0, true) !== SIGNATURE) throw new Error('Not an ACM sound');
  const packed = view.getUint16(12, true);
  return {
    samples: view.getUint32(4, true),
    channels: view.getUint16(8, true) || 1,
    rate: view.getUint16(10, true),
    levels: packed & 0x0f,
    rows: packed >> 4,
  };
}

export function decodeAcm(bytes: Uint8Array, channelsOverride?: number): AcmAudio {
  const header = readAcmHeader(bytes);
  const { levels, rows } = header;
  const cols = 1 << levels;
  const blockSize = rows * cols;
  const bits = new Bits(bytes, 14);
  const block = new Int32Array(blockSize);
  // Tails of the previous block: the inverse transform continues across block boundaries.
  const carry = new Int32Array(Math.max(2, cols * 2));
  // The volume table lives between blocks: each block rewrites only its own middle.
  const levelsTable = new Int32Array(AMP_SIZE * 2);
  const out = new Int16Array(header.samples);
  let written = 0;

  while (written < header.samples) {
    unpackBlock(bits, block, rows, cols, levelsTable);
    if (levels > 0) restoreBlock(block, carry, levels, rows);
    for (let i = 0; i < blockSize && written < header.samples; i++) {
      const v = block[i]! >> levels;
      out[written++] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
    }
  }
  return { channels: channelsOverride ?? header.channels, rate: header.rate, samples: out };
}

const AMP_SIZE = 0x8000;

/** Unpacking a block: the volume step, then each column with its own method. */
function unpackBlock(bits: Bits, block: Int32Array, rows: number, cols: number, table: Int32Array): void {
  const power = bits.read(4);
  const step = bits.read(16);
  const range = 1 << power;
  // Level k (from −range to range−1) sounds as k × step. Outside that — whatever is left from previous blocks.
  for (let k = 0; k < range; k++) table[AMP_SIZE + k] = k * step;
  for (let k = 1; k <= range; k++) table[AMP_SIZE - k] = -k * step;
  const amp = (k: number) => table[Math.max(0, Math.min(table.length - 1, AMP_SIZE + k))]!;
  for (let col = 0; col < cols; col++) {
    const method = bits.read(5);
    fillColumn(method, bits, amp, (row, value) => (block[row * cols + col] = value), rows);
  }
}

/** Two zeros in a row, one zero, or a value — the common building block of the "k" methods. */
function fillColumn(
  method: number,
  bits: Bits,
  amp: (k: number) => number,
  put: (row: number, value: number) => void,
  rows: number,
): void {
  if (method === 0) {
    for (let r = 0; r < rows; r++) put(r, 0);
    return;
  }
  if (method >= 3 && method <= 16) {
    // Direct storage: method bits per value, offset toward the middle.
    const middle = 1 << (method - 1);
    for (let r = 0; r < rows; r++) put(r, amp(bits.read(method) - middle));
    return;
  }
  const near2 = [-2, -1, 1, 2];
  const far3 = [-3, -2, 2, 3];
  const four = [-4, -3, -2, -1, 1, 2, 3, 4];
  // "Triples": one n-bit number encodes count values in base base.
  const packed = (n: number, base: number, count: number) => {
    for (let r = 0; r < rows; ) {
      let code = bits.read(n);
      for (let i = 0; i < count && r < rows; i++, r++) {
        put(r, amp((code % base) - (base >> 1)));
        code = Math.floor(code / base);
      }
    }
  };
  switch (method) {
    case 17: // 1 bit: "0" — two zeros; "10" — zero; "11x" — ±1
      for (let r = 0; r < rows; r++) {
        if (!bits.read(1)) {
          put(r, 0);
          if (++r < rows) put(r, 0);
        } else if (!bits.read(1)) put(r, 0);
        else put(r, amp(bits.read(1) ? 1 : -1));
      }
      return;
    case 18: // "0" — zero; "1x" — ±1
      for (let r = 0; r < rows; r++) put(r, bits.read(1) ? amp(bits.read(1) ? 1 : -1) : 0);
      return;
    case 19:
      packed(5, 3, 3);
      return;
    case 20: // "0" — two zeros; "10" — zero; "11xx" — ±1, ±2
      for (let r = 0; r < rows; r++) {
        if (!bits.read(1)) {
          put(r, 0);
          if (++r < rows) put(r, 0);
        } else if (!bits.read(1)) put(r, 0);
        else put(r, amp(near2[bits.read(2)]!));
      }
      return;
    case 21: // "0" — zero; "1xx" — ±1, ±2
      for (let r = 0; r < rows; r++) put(r, bits.read(1) ? amp(near2[bits.read(2)]!) : 0);
      return;
    case 22:
      packed(7, 5, 3);
      return;
    case 23: // "0" — two zeros; "10" — zero; "110x" — ±1; "111xx" — ±2, ±3
      for (let r = 0; r < rows; r++) {
        if (!bits.read(1)) {
          put(r, 0);
          if (++r < rows) put(r, 0);
        } else if (!bits.read(1)) put(r, 0);
        else if (!bits.read(1)) put(r, amp(bits.read(1) ? 1 : -1));
        else put(r, amp(far3[bits.read(2)]!));
      }
      return;
    case 24: // "0" — zero; "10x" — ±1; "11xx" — ±2, ±3
      for (let r = 0; r < rows; r++) {
        if (!bits.read(1)) put(r, 0);
        else if (!bits.read(1)) put(r, amp(bits.read(1) ? 1 : -1));
        else put(r, amp(far3[bits.read(2)]!));
      }
      return;
    case 26: // "0" — two zeros; "10" — zero; "11xxx" — from −4 to 4
      for (let r = 0; r < rows; r++) {
        if (!bits.read(1)) {
          put(r, 0);
          if (++r < rows) put(r, 0);
        } else if (!bits.read(1)) put(r, 0);
        else put(r, amp(four[bits.read(3)]!));
      }
      return;
    case 27: // "0" — zero; "1xxx" — from −4 to 4
      for (let r = 0; r < rows; r++) put(r, bits.read(1) ? amp(four[bits.read(3)]!) : 0);
      return;
    case 29:
      packed(7, 11, 2);
      return;
    default:
      // Corrupted data: the column is silence.
      for (let r = 0; r < rows; r++) put(r, 0);
  }
}

/**
 * Inverse transform of one level: for each of the width columns we go down in pairs of rows,
 * restoring values from the neighbors. carry keeps the column's last two values between blocks.
 */
function restoreLevel(block: Int32Array, offset: number, carry: Int32Array, carryAt: number, width: number, height: number): void {
  for (let c = 0; c < width; c++) {
    let a = carry[carryAt + c * 2]!;
    let b = carry[carryAt + c * 2 + 1]!;
    let p = offset + c;
    for (let pair = 0; pair < height >> 1; pair++) {
      const x = block[p]!;
      block[p] = b * 2 + (a + x);
      p += width;
      const y = block[p]!;
      block[p] = x * 2 - (b + y);
      p += width;
      a = x;
      b = y;
    }
    carry[carryAt + c * 2] = a;
    carry[carryAt + c * 2 + 1] = b;
  }
}

/** The whole block: levels from wide to narrow; long blocks are processed in pieces. */
function restoreBlock(block: Int32Array, carry: Int32Array, levels: number, rows: number): void {
  const cols = 1 << levels;
  const chunkRows = levels > 9 ? 1 : (2048 >> levels) - 2;
  let left = rows;
  let offset = 0;
  for (;;) {
    const take = Math.min(chunkRows, left);
    let width = cols >> 1;
    let height = take * 2;
    let carryAt = 0;
    restoreLevel(block, offset, carry, carryAt, width, height);
    carryAt += width * 2;
    for (let i = 0, p = offset; i < height; i++, p += width) block[p] = block[p]! + 1;
    while (width > 1) {
      width >>= 1;
      height <<= 1;
      restoreLevel(block, offset, carry, carryAt, width, height);
      carryAt += width * 2;
    }
    if (left <= chunkRows) break;
    offset += chunkRows << levels;
    left -= chunkRows;
  }
}
