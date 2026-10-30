// Loading sprites from the game copy and turning them into color images for the engine.
import { parseFrm, type Frm } from '../formats/frm.ts';
import { parsePalette, type Palette } from '../formats/pal.ts';
import { platform } from '../platform.ts';

/** A frame ready to draw: ABGR colors, 0 — transparent. */
export interface SpriteFrame {
  width: number;
  height: number;
  pixels: Uint32Array;
}

export interface Point {
  x: number;
  y: number;
}

export interface SpriteSheet {
  fps: number;
  /** The frame on which the action happens (blow, shot). */
  actionFrame: number;
  /** [direction 0..5][frame] */
  directions: SpriteFrame[][];
  /** Anchor point offset for each direction. */
  shifts: Point[];
  /** [direction][frame] — accumulated frame shift (an attack lunges, a fall rolls back). */
  offsets: Point[][];
}

export class GameAssets {
  readonly palette: Palette;

  private constructor(palette: Palette) {
    this.palette = palette;
  }

  static async load(): Promise<GameAssets> {
    return new GameAssets(parsePalette(await platform.readGameFile('COLOR.PAL')));
  }

  async frm(name: string): Promise<Frm> {
    return parseFrm(await platform.readGameFile(name));
  }

  async sheet(name: string): Promise<SpriteSheet> {
    const frm = await this.frm(name);
    const converted = new Map<object, SpriteFrame[]>();
    const directions = frm.directions.map((direction) => {
      let frames = converted.get(direction);
      if (!frames) {
        frames = direction.frames.map((frame) => this.colorize(frame.width, frame.height, frame.pixels));
        converted.set(direction, frames);
      }
      return frames;
    });
    const shifts = frm.directions.map((d) => ({ x: d.shiftX, y: d.shiftY }));
    const offsets = frm.directions.map((d) => {
      let x = 0;
      let y = 0;
      return d.frames.map((frame, i) => {
        if (i > 0) {
          x += frame.offsetX;
          y += frame.offsetY;
        }
        return { x, y };
      });
    });
    return { fps: frm.fps, actionFrame: frm.actionFrame, directions, shifts, offsets };
  }

  colorize(width: number, height: number, indices: Uint8Array): SpriteFrame {
    const pixels = new Uint32Array(width * height);
    for (let i = 0; i < pixels.length; i++) pixels[i] = this.palette[indices[i] ?? 0] ?? 0;
    return { width, height, pixels };
  }

  /** An interface image (one direction, one frame) as a canvas. */
  async image(name: string): Promise<HTMLCanvasElement> {
    const frm = await this.frm(name);
    const frame = frm.directions[0]?.frames[0];
    if (!frame) throw new Error('Empty FRM: ' + name);
    const sprite = this.colorize(frame.width, frame.height, frame.pixels);
    const canvas = document.createElement('canvas');
    canvas.width = sprite.width;
    canvas.height = sprite.height;
    const ctx = canvas.getContext('2d')!;
    const data = ctx.createImageData(sprite.width, sprite.height);
    new Uint32Array(data.data.buffer).set(sprite.pixels);
    ctx.putImageData(data, 0, 0);
    return canvas;
  }
}
