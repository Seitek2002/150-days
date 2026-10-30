// Signs on walls, as in the original: a slanted image is straightened, the slant tells the wall side (south or east),
// the sign hangs on the nearest wall above the street without going past its edge; the Junktown signs are in the map table.
import { describe, expect, it } from 'vitest';
import { buildLevel } from '../src/engine/level.ts';
import { decorOf, wallSignOf } from '../src/game/blocks.ts';
import { signPanel, straightenSign } from '../src/game/signs.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { MAP_SCRIPTS } from '../src/world/map-scripts.ts';

/** A slanted strip of width w and thickness thick: a wall horizontal with slope slope (down is plus), as on the original screen. */
function slantedBar(w: number, slope: number, thick = 4) {
  const h = Math.ceil(Math.abs(slope) * w) + thick + 2;
  const pixels = new Uint32Array(w * h);
  const y0 = slope < 0 ? Math.ceil(-slope * w) : 0;
  for (let x = 0; x < w; x++) for (let t = 0; t < thick; t++) pixels[(Math.round(y0 + slope * x) + t) * w + x] = 0xff00ffff;
  return { width: w, height: h, pixels };
}

/** A 24×16 level inside a fence: a wall (row 5, cells 2–9), the street to the south. */
const level = buildLevel(
  parseLevelDef({
    id: 'signs',
    music: '',
    floor: 'floor',
    ceiling: 'ceiling',
    fade: 10,
    outdoor: true,
    grid: Array.from({ length: 16 }, (_, y) => Array.from({ length: 24 }, (_, x) => (x === 0 || y === 0 || x === 23 || y === 15 || (y === 5 && x >= 2 && x <= 9) ? '#' : '.')).join('')),
    entries: { s: { x: 5.5, y: 8.5, angle: 0 } },
  }),
);

describe('signs on walls', () => {
  it('a slanted sign is straightened, the slant tells the wall side', () => {
    const south = straightenSign(slantedBar(40, 0.75))!;
    expect(south.face).toBe('south');
    // The horizontal became horizontal: the height is the strip thickness, the width is the length of the slanted line.
    expect(south.picture.h).toBeLessThanOrEqual(6);
    expect(south.picture.w).toBeGreaterThanOrEqual(48);
    const east = straightenSign(slantedBar(40, -0.25))!;
    expect(east.face).toBe('east');
    expect(east.picture.h).toBeLessThanOrEqual(6);
    expect(straightenSign({ width: 3, height: 3, pixels: new Uint32Array(9) })).toBeNull();
  });

  it('a sign hangs on the nearest wall above the street without going past its edge', () => {
    const sign = straightenSign(slantedBar(40, 0.75))!;
    const panel = signPanel(level, { x: 9.4, y: 5.6 }, sign)!;
    expect(panel.face).toBe('south');
    expect(panel.at).toBe(6);
    expect(panel.a1).toBeLessThanOrEqual(10);
    expect(panel.a0).toBeGreaterThanOrEqual(2);
    expect(panel.to).toBeLessThanOrEqual(1);
    expect(panel.from).toBeLessThan(panel.to);
    expect(panel.image).toBe(sign.picture);
    // Far from walls — nowhere to hang it.
    expect(signPanel(level, { x: 17.5, y: 10.5 }, sign)).toBeNull();
  });

  it('a flag sign (slanted along its own plane) goes across the nearest wall', () => {
    const flag = straightenSign(slantedBar(30, -0.25))!;
    // The east end of the wall (cell 9) is far from the spot — the south side is closer.
    const panel = signPanel(level, { x: 5.5, y: 5.9 }, flag)!;
    expect(panel.face).toBe('south');
  });

  it('by image name: on a wall, on a post, a signpost', () => {
    expect(wallSignOf('sign01.frm')).toBe(true);
    expect(wallSignOf('skum.frm')).toBe(true);
    expect(wallSignOf('barsign.frm')).toBe(true);
    expect(wallSignOf('sign12.frm')).toBe(false);
    expect(wallSignOf('strsign1.frm')).toBe(false);
    expect(decorOf('sign12.frm')?.solid).toBeGreaterThan(0);
    expect(decorOf('gizbase.frm')?.solid).toBeGreaterThan(0);
  });

  it('the Junktown signs are in the map table', () => {
    expect(MAP_SCRIPTS.JUNKKILL?.signs).toHaveLength(4);
    expect(MAP_SCRIPTS.JUNKCSNO?.signs).toHaveLength(2);
    expect(MAP_SCRIPTS.JUNKENT?.signs).toHaveLength(2);
  });
});
