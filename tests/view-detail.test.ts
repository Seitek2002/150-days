// The "Picture quality" setting: fast is a 320×190 frame (four times fewer pixels), normal is 640×380; the renderer
// adjusts itself on the next frame, and saved settings without the new field read as "normal".
import { afterEach, describe, expect, it } from 'vitest';
import { buildLevel } from '../src/engine/level.ts';
import { FULL_RES, PROJ, RES, Renderer, setViewDetail, VIEW_H, VIEW_W } from '../src/engine/renderer.ts';
import { TEX, type Texture } from '../src/engine/textures.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/ui/settings.ts';

// There is no browser in the tests: the renderer only needs memory for the frame.
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
  parseLevelDef({
    id: 't',
    music: '',
    floor: 'floor',
    ceiling: 'ceiling',
    fade: 10,
    grid: ['######', '#....#', '#....#', '######'],
    entries: { s: { x: 1.5, y: 1.5, angle: 0 } },
  }),
);
const cam = { x: 1.5, y: 1.5, angle: 0, pitch: 0 };
const painted = (r: Renderer) => new Uint32Array(r.image.data.buffer).filter((c) => c !== 0).length;

afterEach(() => setViewDetail(FULL_RES));

describe('picture quality', () => {
  it('fast is a 320×190 frame, normal is 640×380; the renderer adjusts on the next frame', () => {
    const renderer = new Renderer(textures as never);
    renderer.render(level, cam, []);
    expect([renderer.image.width, renderer.image.height]).toEqual([640, 380]);
    expect(painted(renderer)).toBe(640 * 380);

    setViewDetail(1);
    expect([RES, VIEW_W, VIEW_H, PROJ]).toEqual([1, 320, 190, 160]);
    renderer.render(level, cam, []);
    expect([renderer.image.width, renderer.image.height]).toEqual([320, 190]);
    expect(painted(renderer)).toBe(320 * 190);

    setViewDetail(FULL_RES);
    renderer.render(level, cam, []);
    expect([renderer.image.width, renderer.image.height]).toEqual([640, 380]);
  });

  it('in the settings: normal by default, old settings without the field too', () => {
    expect(DEFAULT_SETTINGS.fastGraphics).toBe(false);
    expect(normalizeSettings({ sfx: 50 }).fastGraphics).toBe(false);
    expect(normalizeSettings({ fastGraphics: true }).fastGraphics).toBe(true);
  });
});
