// Seen automap cells: packing into a string for saving and back.
import { describe, expect, it } from 'vitest';
import { packSeen, unpackSeen } from '../src/game/seen.ts';

/** An array from a picture: "#" — seen, "." — not. */
function grid(rows: string[]): Uint8Array {
  return Uint8Array.from(rows.join('').split('').map((c) => (c === '#' ? 1 : 0)));
}

describe('seen cells', () => {
  it('packs and unpacks without loss', () => {
    const seen = grid(['#..#.....', '.##.#...#', '........#']);
    const packed = packSeen(seen, 9);
    expect(packed.startsWith('9x3:')).toBe(true);
    const back = new Uint8Array(27);
    unpackSeen(packed, back, 9);
    expect([...back]).toEqual([...seen]);
  });

  it('an empty map is an empty string, and it changes nothing', () => {
    expect(packSeen(new Uint8Array(40), 8)).toBe('');
    const back = new Uint8Array(40);
    unpackSeen('', back, 8);
    unpackSeen(undefined, back, 8);
    expect(back.every((v) => v === 0)).toBe(true);
  });

  it('a fully revealed map, including when the cell count is not a multiple of eight', () => {
    const seen = new Uint8Array(13 * 7).fill(1);
    const back = new Uint8Array(13 * 7);
    unpackSeen(packSeen(seen, 13), back, 13);
    expect(back.every((v) => v === 1)).toBe(true);
  });

  it('a packed string is added to what is already revealed, not erasing it', () => {
    const packed = packSeen(grid(['#...', '....']), 4);
    const back = grid(['....', '...#']);
    unpackSeen(packed, back, 4);
    expect([...back]).toEqual([...grid(['#...', '...#'])]);
  });

  it('a record for a map of another size and a corrupted string are discarded', () => {
    const packed = packSeen(grid(['#..#', '.#..']), 4);
    const other = new Uint8Array(3 * 3);
    unpackSeen(packed, other, 3);
    expect(other.every((v) => v === 0)).toBe(true);
    const same = new Uint8Array(8);
    unpackSeen('4x2:%%%%', same, 4);
    unpackSeen('just text', same, 4);
    expect(same.every((v) => v === 0)).toBe(true);
  });
});
