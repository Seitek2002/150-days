// Through holes in the image of a low block (between fence rails, between chair legs) and through windows you can also see what is
// behind them: a critter or brahmin behind the pen fence and a critter in a house behind a window do not vanish entirely (client request, 2026-10-24).
// A solid block and a wall hide the figure behind them as before; the renderer is checked on a frame without a game window.
import { describe, expect, it } from 'vitest';
import type { SpriteFrame } from '../src/assets/sprites.ts';
import { addBlock, buildLevel, type Block, type Level } from '../src/engine/level.ts';
import { Renderer, VIEW_H, VIEW_W, type Billboard } from '../src/engine/renderer.ts';
import { TEX, type Texture } from '../src/engine/textures.ts';
import { parseLevelDef, type LevelDef } from '../src/world/defs.ts';

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

const texture = (opaque: (u: number, v: number) => boolean): Texture => {
  const pixels = new Uint32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) pixels[y * TEX + x] = opaque(x / TEX, y / TEX) ? 0xff406080 : 0;
  return { pixels, variants: [pixels] };
};
const plain = texture(() => true);
/** A fence: two rails (top and bottom), empty between them. */
const rails = texture((_, v) => (v > 0.1 && v < 0.3) || (v > 0.65 && v < 0.85));
/** A round window: a wall with a round hole in the middle. */
const roundWindow = texture((u, v) => Math.hypot(u - 0.5, v - 0.45) > 0.3);
const textures = new Proxy({} as Record<string, Texture>, {
  get: (_, name) => (name === 'fenceRail' ? rails : name === 'adobeWindow' ? roundWindow : plain),
});

/** A figure is a solid frame of one color that glows by itself (the color in the frame does not change with light). */
const MARK = 0xff0000ff;
const sprite = (width: number, height: number): SpriteFrame => ({ width, height, pixels: new Uint32Array(width * height).fill(MARK) });

const field = (columns?: LevelDef['columns']): Level =>
  buildLevel(
    parseLevelDef({
      id: 't',
      music: '',
      floor: 'floor',
      ceiling: 'ceiling',
      fade: 10,
      grid: ['##########', ...Array.from({ length: 8 }, () => '#........#'), '##########'],
      entries: { s: { x: 1.5, y: 1.5, angle: 0 } },
      ...(columns ? { columns } : {}),
    }),
  );

/** How many figure pixels are visible from the west (the hero looks east). */
function visible(level: Level, eye: { x: number; y: number }, figure: Billboard): number {
  const renderer = new Renderer(textures as never);
  renderer.render(level, { ...eye, angle: 0, pitch: 0 }, [figure]);
  const pixels = new Uint32Array(renderer.image.data.buffer);
  let count = 0;
  for (let i = 0; i < VIEW_W * VIEW_H; i++) if (pixels[i] === MARK) count++;
  return count;
}

describe('a figure behind a low block', () => {
  /** A brahmin three cells away, the block one and a half away. */
  const brahmin = (fence: 'none' | 'rails' | 'solid') => {
    const level = field();
    if (fence !== 'none') {
      const look = fence === 'rails' ? 'fenceRail' : 'concrete';
      for (let y = 3; y <= 6; y++) {
        const block = { x0: 4.4, x1: 4.6, y0: y, y1: y + 1, height: 0.42, front: look, side: look, top: 'concrete', facing: 0, fill: false } as Block;
        addBlock(level, y * level.width + 4, block);
      }
    }
    return visible(level, { x: 3, y: 4.5 }, { x: 6, y: 4.5, frame: sprite(60, 40), shiftX: 0, shiftY: 0, id: 1, glow: true });
  };

  it('behind a solid block only the top is visible, through the fence — between the rails too', () => {
    const none = brahmin('none');
    const solid = brahmin('solid');
    const fence = brahmin('rails');
    expect(none).toBeGreaterThan(100);
    // A waist-high solid block hides the brahmin's lower part.
    expect(solid).toBeLessThan(none * 0.6);
    // The fence hides only with its rails: more is visible than behind a solid block and less than without it.
    expect(fence).toBeGreaterThan(solid + (none - solid) * 0.3);
    expect(fence).toBeLessThan(none);
  });
});

describe('a critter behind a window', () => {
  /** A critter four cells away; in cell 4, 4 on the first floor is a window (or a wall). */
  const resident = (storey: NonNullable<LevelDef['columns']>[number]['storeys'][number] | 'none') =>
    visible(field(storey === 'none' ? undefined : [{ x: 4, y: 4, storeys: [storey] }]), { x: 2.5, y: 4.5 }, { x: 6.5, y: 4.5, frame: sprite(30, 80), shiftX: 0, shiftY: 0, id: 1, glow: true });

  it('through a round window (a wall with a hole) it is visible, through a normal one — between the sill and the top, behind a wall — no', () => {
    const none = resident('none');
    const round = resident({ texture: 'adobeWindow', window: 'round' });
    const window = resident({ texture: 'concrete', window: true });
    const wall = resident({ texture: 'concrete' });
    expect(none).toBeGreaterThan(300);
    expect(round).toBeGreaterThan(none * 0.5);
    expect(window).toBeGreaterThan(none * 0.3);
    // The sill hides the legs.
    expect(window).toBeLessThan(none);
    expect(wall).toBe(0);
  });
});
