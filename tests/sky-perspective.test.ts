// The sky turns with the head (client, 2026-10-30): looking up, a frame point's sky direction and the frame point of a sky direction
// agree both ways, the horizon row is where the walls expect it, and looking straight up the frame holds tens of degrees of sky
// (before, a 5° strip was stretched over the whole frame and the Milky Way could not be seen).
import { describe, expect, it } from 'vitest';
import { buildLevel } from '../src/engine/level.ts';
import { Renderer, VIEW_H, VIEW_W } from '../src/engine/renderer.ts';
import { TEX, type Texture } from '../src/engine/textures.ts';
import { parseLevelDef } from '../src/world/defs.ts';

(globalThis as { ImageData?: unknown }).ImageData ??= class {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
};

const pixels = new Uint32Array(TEX * TEX).fill(0xff406080);
const plain: Texture = { pixels, variants: [pixels] };
const textures = new Proxy({} as Record<string, Texture>, { get: () => plain });
const level = buildLevel(
  parseLevelDef({ id: 't', music: '', floor: 'floor', ceiling: 'ceiling', fade: 10, grid: ['######', '#....#', '#....#', '######'], entries: { s: { x: 1.5, y: 1.5, angle: 0 } } }),
);

/** The renderer's private sky projection, opened for the test. */
interface Sky {
  skyDir(x: number, y: number): void;
  skyXY(daz: number, el: number): { x: number; y: number } | null;
  dirAz: number;
  dirEl: number;
  horizon: number;
}

function looking(pitch: number, angle = 0.4): Sky {
  const renderer = new Renderer(textures as never);
  renderer.render(level, { x: 1.5, y: 1.5, angle, pitch }, []);
  return renderer as unknown as Sky;
}

describe('the sky in perspective', () => {
  it('a frame point and its sky direction agree both ways, at any pitch', () => {
    for (const pitch of [0, 150, 400, 600]) {
      const sky = looking(pitch);
      for (const [x, y] of [[10, 10], [320, 190], [600, 40], [100, 300]] as const) {
        sky.skyDir(x, y);
        const at = sky.skyXY(sky.dirAz - 0.4, sky.dirEl);
        expect(at).not.toBeNull();
        expect(at!.x).toBeCloseTo(x + 0.5, 3);
        expect(at!.y).toBeCloseTo(y, 3);
      }
    }
  });

  it('the horizon row is level ground, where the walls and floor meet the sky', () => {
    const sky = looking(150);
    for (const x of [0, 320, VIEW_W - 1]) {
      sky.skyDir(x, sky.horizon);
      expect(sky.dirEl).toBeCloseTo(0, 5);
    }
  });

  it('looking straight up the frame holds tens of degrees of sky and goes past the zenith', () => {
    const sky = looking(600);
    sky.skyDir(VIEW_W / 2, 0);
    const top = sky.dirEl;
    const topAz = sky.dirAz;
    sky.skyDir(VIEW_W / 2, VIEW_H - 1);
    const bottom = sky.dirEl;
    // Past the zenith the top of the frame shows the sky behind the head.
    expect(Math.abs(Math.cos(topAz - sky.dirAz) + 1)).toBeLessThan(0.01);
    expect((Math.PI - top - bottom) * (180 / Math.PI)).toBeGreaterThan(40);
  });
});

describe('star clusters and the Milky Way grain', () => {
  it('the Pleiades sit at their real place, widened around their centre, with the brightest member first', async () => {
    const { CLUSTER_STARS } = await import('../src/engine/stars.ts');
    const alcyone = CLUSTER_STARS[0]!;
    expect(alcyone.mag).toBeCloseTo(2.9);
    // Right ascension 3h47m, declination +24°: near the cluster's centre.
    expect((alcyone.ra * 12) / Math.PI).toBeCloseTo(3.79, 1);
    expect((alcyone.dec * 180) / Math.PI).toBeCloseTo(24.1, 0);
    expect(CLUSTER_STARS.length).toBeGreaterThan(150);
  });

  it('a denser star field where asked: the Milky Way holds many more faint stars', async () => {
    const { starAt } = await import('../src/engine/sky.ts');
    let sparse = 0;
    let dense = 0;
    for (let i = 0; i < 20000; i++) {
      const az = (i % 200) / 300;
      const el = Math.floor(i / 200) / 300;
      if (starAt(az, el) > 0) sparse++;
      if (starAt(az, el, 0.04) > 0) dense++;
    }
    expect(dense).toBeGreaterThan(sparse * 5);
  });
});
