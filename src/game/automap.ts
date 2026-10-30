// Automap (Tab). The window is the AUTOMAP.FRM image from the player's copy of Fallout; the "screen" shows only what the player has seen:
// walls, doors, floor, the exit (a marker) and the player (an arrow). While the map is open, the game is paused.
import type { GameData } from '../assets/gamedata.ts';
import type { Level } from '../engine/level.ts';
import type { BitmapFont } from '../formats/font.ts';
import { t } from '../i18n.ts';
import { drawLabel } from './fonts.ts';

/** Image number in INTRFACE.LST. */
const ART_AUTOMAP = 171;

/** The original's 519×480 window is centred on the 640×480 screen. */
const WINDOW = { x: 60, y: 0, w: 519, h: 480 };
/** The dark "screen" inside the frame (coordinates are in the window). */
const SCREEN = { x: 52, y: 72, w: 372, h: 334 };
/** The "Cancel" button on the image (closes the map); its label is drawn on the image itself. */
const CANCEL = { x: 268, y: 452, w: 103, h: 22 };

const TEXT = '#4fd65a';
const FLOOR = '#123a1a';
const WALL: Record<string, string> = { rock: '#2f9e3a', metal: '#7be585', door: '#c9a24a', daylight: '#d8ffd8' };
const EXIT = '#ffe27a';
const LIFT = '#7fd8ff';

export async function loadAutomap(data: GameData, font: BitmapFont): Promise<AutoMap> {
  return new AutoMap(await data.interfaceImage(ART_AUTOMAP), font);
}

/** The player on the map: the cell is the integer part of the coordinates, the angle is like the camera's (0 — east, clockwise). */
export interface MapViewer {
  x: number;
  y: number;
  angle: number;
}

export class AutoMap {
  private opened = false;
  private pressed = false;
  private readonly art: HTMLCanvasElement;
  private readonly font: BitmapFont;

  constructor(art: HTMLCanvasElement, font: BitmapFont) {
    this.art = art;
    this.font = font;
  }

  get open(): boolean {
    return this.opened;
  }

  show(): void {
    this.opened = true;
    this.pressed = false;
  }

  hide(): void {
    this.opened = false;
    this.pressed = false;
  }

  private onCancel(x: number, y: number): boolean {
    const left = WINDOW.x + CANCEL.x;
    return x >= left && x < left + CANCEL.w && y >= WINDOW.y + CANCEL.y && y < WINDOW.y + CANCEL.y + CANCEL.h;
  }

  pointerDown(x: number, y: number): void {
    this.pressed = this.onCancel(x, y);
  }

  /** Mouse button released; true — the "Cancel" button was pressed, time to close the map. */
  pointerUp(x: number, y: number): boolean {
    const wasPressed = this.pressed;
    this.pressed = false;
    return wasPressed && this.onCancel(x, y);
  }

  /** seen — cells the player has seen (by index y * width + x); the world renderer fills them in. */
  draw(ctx: CanvasRenderingContext2D, level: Level, seen: Uint8Array, viewer: MapViewer): void {
    if (!this.opened) return;
    ctx.drawImage(this.art, WINDOW.x, WINDOW.y);

    const area = { x: WINDOW.x + SCREEN.x, y: WINDOW.y + SCREEN.y, w: SCREEN.w, h: SCREEN.h };
    // Cell size is a whole number of pixels, the map is centred on the screen.
    const cell = Math.max(2, Math.floor(Math.min(area.w / level.width, area.h / level.height)));
    const originX = area.x + Math.floor((area.w - cell * level.width) / 2);
    const originY = area.y + Math.floor((area.h - cell * level.height) / 2);

    // An elevator cell in a wall (doors on the wall) is visible if the floor next to it has been seen.
    const seenAround = (index: number) => [-1, 1, -level.width, level.width].some((d) => seen[index + d]);
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x, area.y, area.w, area.h);
    ctx.clip();
    for (let cy = 0; cy < level.height; cy++) {
      for (let cx = 0; cx < level.width; cx++) {
        const index = cy * level.width + cx;
        if (!seen[index]) continue;
        const x = originX + cx * cell;
        const y = originY + cy * cell;
        const wall = level.walls[index];
        if (wall) {
          ctx.fillStyle = WALL[wall] ?? WALL.rock!;
          ctx.fillRect(x, y, cell, cell);
        } else if (level.exits.has(index)) {
          // Exit: a bright cell with a dark cross.
          ctx.fillStyle = EXIT;
          ctx.fillRect(x, y, cell, cell);
          ctx.strokeStyle = '#1a1206';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 3, y + 3);
          ctx.lineTo(x + cell - 3, y + cell - 3);
          ctx.moveTo(x + cell - 3, y + 3);
          ctx.lineTo(x + 3, y + cell - 3);
          ctx.stroke();
        } else {
          ctx.fillStyle = FLOOR;
          ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        }
      }
    }

    // Elevators (client, 2026-10-29: "elevators don't show on the automap"): a light-blue cell with up and down arrows.
    for (const index of new Set(level.lifts ?? [])) {
      if (!seen[index] && !seenAround(index)) continue;
      const x = originX + (index % level.width) * cell;
      const y = originY + Math.floor(index / level.width) * cell;
      ctx.fillStyle = LIFT;
      ctx.fillRect(x, y, cell, cell);
      ctx.fillStyle = '#06222e';
      const m = x + cell / 2;
      const h = Math.max(2, cell * 0.3);
      ctx.beginPath();
      ctx.moveTo(m, y + cell * 0.1);
      ctx.lineTo(m - h, y + cell * 0.1 + h);
      ctx.lineTo(m + h, y + cell * 0.1 + h);
      ctx.closePath();
      ctx.moveTo(m, y + cell * 0.9);
      ctx.lineTo(m - h, y + cell * 0.9 - h);
      ctx.lineTo(m + h, y + cell * 0.9 - h);
      ctx.closePath();
      ctx.fill();
    }

    // The player — an arrow in the direction of gaze.
    const px = originX + viewer.x * cell;
    const py = originY + viewer.y * cell;
    const tip = cell * 0.85;
    const back = cell * 0.55;
    const spread = 2.5;
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(viewer.angle) * tip, py + Math.sin(viewer.angle) * tip);
    ctx.lineTo(px + Math.cos(viewer.angle + spread) * back, py + Math.sin(viewer.angle + spread) * back);
    ctx.lineTo(px + Math.cos(viewer.angle - spread) * back, py + Math.sin(viewer.angle - spread) * back);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    drawLabel(ctx, this.font, t('automapTitle'), area.x + 12, area.y + 12, TEXT);
    drawLabel(ctx, this.font, t('automapHint'), area.x + area.w / 2, area.y + area.h - 20, TEXT, 'center');
  }
}
