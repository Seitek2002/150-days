// Fallout sprite (FRM): up to 6 directions, each with the same number of frames.
// All numbers are big-endian. Pixels are palette color indices.

export interface FrmFrame {
  width: number;
  height: number;
  /** Frame offset relative to the previous one (for the walking animation). */
  offsetX: number;
  offsetY: number;
  pixels: Uint8Array;
}

export interface FrmDirection {
  shiftX: number;
  shiftY: number;
  frames: FrmFrame[];
}

export interface Frm {
  fps: number;
  actionFrame: number;
  framesPerDirection: number;
  /** Always 6 elements; if the file has one direction, it is repeated. */
  directions: FrmDirection[];
}

const HEADER_SIZE = 62;

export function parseFrm(buffer: ArrayBuffer | Uint8Array): Frm {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < HEADER_SIZE) throw new Error('FRM too short');
  const fps = view.getUint16(4) || 10;
  const actionFrame = view.getUint16(6);
  const framesPerDirection = view.getUint16(8);
  const cache = new Map<number, FrmDirection>();
  const directions: FrmDirection[] = [];

  for (let d = 0; d < 6; d++) {
    const shiftX = view.getInt16(10 + d * 2);
    const shiftY = view.getInt16(22 + d * 2);
    const offset = view.getUint32(34 + d * 4);
    let direction = cache.get(offset);
    if (!direction) {
      const frames: FrmFrame[] = [];
      let p = HEADER_SIZE + offset;
      for (let f = 0; f < framesPerDirection; f++) {
        const width = view.getUint16(p);
        const height = view.getUint16(p + 2);
        const size = view.getUint32(p + 4);
        const offsetX = view.getInt16(p + 8);
        const offsetY = view.getInt16(p + 10);
        if (size !== width * height || p + 12 + size > bytes.byteLength) {
          throw new Error('Corrupted FRM frame');
        }
        frames.push({ width, height, offsetX, offsetY, pixels: bytes.slice(p + 12, p + 12 + size) });
        p += 12 + size;
      }
      direction = { shiftX, shiftY, frames };
      cache.set(offset, direction);
    }
    directions.push(direction);
  }
  return { fps, actionFrame, framesPerDirection, directions };
}
