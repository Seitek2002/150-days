// World map window (M): the original's world map image from the player's copy (INTRFACE.LST #135, 1400×1500) in the original's frame
// (#136). The map scrolls (mouse, wheel, arrows); you can see the hero, known locations (green circles with names, visited ones
// brighter) and the travel target. Squares the hero has not been to and has not seen are covered by dark fog with soft edges (the circles of known
// locations are visible in the fog too); the frame's windows show the date and time, as in the Pip-Boy. Clicking a location or any point sets the target, clicking again removes it; a visited location gets "Go".
// What the window receives and which actions it calls (WorldMapData, WorldMapActions) is shared by any kind of window:
// the game does not depend on the window's look.
import { GameAssets } from '../assets/sprites.ts';
import { fitText, type BitmapFont } from '../formats/font.ts';
import { parseLst } from '../formats/text.ts';
import { getLang, t, tf } from '../i18n.ts';
import { platform } from '../platform.ts';
import { SQUARE_KM } from '../world/wasteland.ts';
import { insideWorld, PLACES, terrainAt, WORLD_COLUMNS, WORLD_ROWS, WORLD_SQUARE_PIXELS, type PlaceKey, type Square } from '../world/worldmap.ts';
import { drawLabel, labelWidth, loadInterfaceFonts } from './fonts.ts';
import { placePoint, travelHours, type TravelTarget } from './travel.ts';
import type { Clock } from './clock.ts';

export interface WorldMapPlace {
  key: PlaceKey;
  /** Name from the player's copy. */
  name: string;
  square: Square;
  /** Whether the hero has been there (fast travel only goes there). */
  visited: boolean;
  /** How many game hours to walk there (under half an hour means the hero is already here). */
  hours: number;
  km: number;
}

export interface WorldMapData {
  /** Where the hero is on the world map: in squares, fractional (16.5 is the middle of square 16). */
  hero: { x: number; y: number };
  /** Only known locations (that the hero has heard of or been to). */
  places: WorldMapPlace[];
  target: TravelTarget | null;
  /** Whether fast travel is possible now (not in combat). */
  canTravel: boolean;
  /** The game clock, for the date and time windows on the frame (as in the Pip-Boy); not set means the windows are empty. */
  clock?: Clock;
  /** World map fog: whether a square is open (the hero walked there or saw it); not set means everything is open. */
  revealed?: (column: number, row: number) => boolean;
}

export interface WorldMapActions {
  /** Choose a travel target (a location or a world map point); null removes the target. */
  setTarget(target: TravelTarget | null): void;
  /** Fast travel to a location the hero has already been to (the game closes the window). */
  travel(place: PlaceKey): void;
  close(): void;
}

/** Travel time: "under an hour", "5 h", "2.5 days". */
export function formatHours(hours: number): string {
  if (hours < 1) return t('wmLessHour');
  if (hours < 24) return tf('wmHours', { n: Math.round(hours) });
  return tf('wmDays', { n: (Math.round((hours / 24) * 10) / 10).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-US') });
}

// ---------- geometry of the original's window (640×480) ----------

const SCREEN = { w: 640, h: 480 };
/** The window with the map inside the original's frame. */
const VIEW = { x: 22, y: 21, w: 450, h: 443 };
const MAP = { w: WORLD_COLUMNS * WORLD_SQUARE_PIXELS, h: WORLD_ROWS * WORLD_SQUARE_PIXELS };
/** INTRFACE.LST images: the world map, the frame, digits (the same as the Pip-Boy's) and month names. */
const ART = { map: 135, box: 136, digits: 82, months: 129 };
/** The frame's date and time windows: day, month, year, time (digits 9 points wide). */
const CLOCK = { day: { x: 487, y: 12 }, month: { x: 513, y: 12 }, year: { x: 548, y: 12 }, time: { x: 593, y: 12 }, cell: 9 };
/** Fog: the opacity of a closed square and its color (dark, like dust and dusk). */
const FOG = { alpha: 0.88, r: 11, g: 10, b: 8 };
/** A known location's circle stays visible in the fog: the radius of the clear circle and of the feathering (in image points). */
const PLACE_CLEAR = { inner: 26, outer: 36 };
/** The frame's right panel: twelve red lamps with lines next to them (lamp on the left, name on the right). */
const SLOTS = { ys: [68, 96, 123, 151, 179, 207, 236, 264, 290, 317, 345, 374], lampX: 513, labelX: 531, labelW: 82 };
/** The plate at the bottom right (in the original, "Town/World"): ours says "Close". */
const PLATE = { x: 512, y: 430, w: 115, h: 34 };
/** The line with the name and buttons at the bottom of the map window. */
const BAR = { h: 30 };
/** Click radius for a location (in image points) and for an already placed point. */
const PICK_RADIUS = 28;
const POINT_RADIUS = 14;
/** Arrow scroll step. */
const SCROLL_STEP = 60;
/** How many mouse points count as a click rather than a scroll. */
const DRAG_SLOP = 4;

const COLORS = {
  panel: 'rgba(22, 19, 14, 0.9)',
  border: '#7a6a42',
  text: '#e0cc8c',
  dim: '#a79a6c',
  place: '#8fe88f',
  visited: '#e8ffd0',
  target: '#59c8ff',
  warn: '#ffb04a',
  hero: '#ffcc33',
  outline: '#000000',
};

// ---------- pure calculations (for tests) ----------

/** The top left corner of the map window so that it does not go past the image. */
export function clampView(x: number, y: number): { x: number; y: number } {
  return { x: Math.min(MAP.w - VIEW.w, Math.max(0, Math.round(x))), y: Math.min(MAP.h - VIEW.h, Math.max(0, Math.round(y))) };
}

/** The window corner at which an image point is centered. */
export const viewCenteredOn = (px: number, py: number) => clampView(px - VIEW.w / 2, py - VIEW.h / 2);

/** An image point from world map squares. */
export const toPixels = (square: { x: number; y: number }) => ({ x: square.x * WORLD_SQUARE_PIXELS, y: square.y * WORLD_SQUARE_PIXELS });

/** A world map point in squares from an image point; outside the map, null. */
export function squareFromPixels(px: number, py: number): { x: number; y: number } | null {
  const x = px / WORLD_SQUARE_PIXELS;
  const y = py / WORLD_SQUARE_PIXELS;
  return insideWorld(Math.floor(x), Math.floor(y)) ? { x, y } : null;
}

/** The location a click hit: the nearest to the point within PICK_RADIUS. */
export function placeAtPixels(places: readonly WorldMapPlace[], px: number, py: number): WorldMapPlace | null {
  let best: WorldMapPlace | null = null;
  let bestDist = PICK_RADIUS;
  for (const p of places) {
    const c = toPixels(placePoint(p.key));
    const d = Math.hypot(c.x - px, c.y - py);
    if (d <= bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

/** Locations for the right panel lines: nearest first, no more than twelve (the number of lamps on the frame). */
export const slotPlaces = (places: readonly WorldMapPlace[]): WorldMapPlace[] => [...places].sort((a, b) => a.km - b.km).slice(0, SLOTS.ys.length);

/** Fog by world map squares (row by row): 0 means open, otherwise fog opacity 0–255; without `revealed` there is no fog (null). */
export function fogLevels(revealed: ((column: number, row: number) => boolean) | undefined): Uint8ClampedArray | null {
  if (!revealed) return null;
  const levels = new Uint8ClampedArray(WORLD_COLUMNS * WORLD_ROWS);
  for (let row = 0; row < WORLD_ROWS; row++) {
    for (let column = 0; column < WORLD_COLUMNS; column++) levels[row * WORLD_COLUMNS + column] = revealed(column, row) ? 0 : Math.round(255 * FOG.alpha);
  }
  return levels;
}

/** Is the target that very location? Or (for a point) an already placed point near the click? */
export function targetHit(target: TravelTarget | null, key: PlaceKey | null, px: number, py: number): boolean {
  if (!target) return false;
  if ('place' in target) return key !== null && target.place === key;
  const c = toPixels(target.point);
  return key === null && Math.hypot(c.x - px, c.y - py) <= POINT_RADIUS;
}

// ---------- images ----------

interface Art {
  map: HTMLCanvasElement;
  box: HTMLCanvasElement;
  digits: HTMLCanvasElement;
  months: HTMLCanvasElement;
  small: BitmapFont;
  large: BitmapFont;
}

let artPending: Promise<Art> | null = null;
/** The window's images from the player's copy (once per game). */
function loadArt(): Promise<Art> {
  artPending ??= (async () => {
    const [assets, list, fonts] = await Promise.all([GameAssets.load(), platform.readGameFile('ART\\INTRFACE\\INTRFACE.LST').then(parseLst), loadInterfaceFonts()]);
    const image = (n: number) => assets.image('ART\\INTRFACE\\' + list[n]);
    const [map, box, digits, months] = await Promise.all([image(ART.map), image(ART.box), image(ART.digits), image(ART.months)]);
    return { map, box, digits, months, small: fonts.main, large: fonts.big };
  })().catch((e: unknown) => {
    artPending = null;
    throw e;
  });
  return artPending;
}

/**
 * The map for display. The original image itself circles all twelve locations: the circles of locations the hero has not heard of yet
 * we cover with a nearby piece of the map (feathered edges), otherwise the image would give everything away. Then on top goes the fog of closed squares
 * (soft edges), and the circles of known locations are restored from the image: they are visible in the fog too.
 */
function buildMap(art: Art, known: ReadonlySet<PlaceKey>, revealed: WorldMapData['revealed']): HTMLCanvasElement {
  const work = document.createElement('canvas');
  work.width = art.map.width;
  work.height = art.map.height;
  const ctx = work.getContext('2d')!;
  ctx.drawImage(art.map, 0, 0);
  const size = 96;
  const half = size / 2;
  const centers = (Object.keys(PLACES) as PlaceKey[]).map((key) => toPixels(placePoint(key)));
  for (const key of Object.keys(PLACES) as PlaceKey[]) {
    if (known.has(key)) continue;
    const c = toPixels(placePoint(key));
    // Take a piece from the left or right, wherever there is no other circle nearby and it does not go past the image.
    const free = (dx: number) => c.x + dx - half >= 0 && c.x + dx + half <= art.map.width && centers.every((o) => Math.hypot(o.x - (c.x + dx), o.y - c.y) > 52);
    const dx = free(80) ? 80 : free(-80) ? -80 : free(130) ? 130 : -130;
    const patch = document.createElement('canvas');
    patch.width = patch.height = size;
    const pctx = patch.getContext('2d')!;
    pctx.drawImage(art.map, c.x + dx - half, c.y - half, size, size, 0, 0, size, size);
    const mask = pctx.createRadialGradient(half, half, 28, half, half, half - 2);
    mask.addColorStop(0, 'rgba(255, 255, 255, 1)');
    mask.addColorStop(1, 'rgba(255, 255, 255, 0)');
    pctx.globalCompositeOperation = 'destination-in';
    pctx.fillStyle = mask;
    pctx.fillRect(0, 0, size, size);
    ctx.drawImage(patch, c.x - half, c.y - half);
  }
  const fog = fogLevels(revealed);
  if (fog) {
    // The fog is a small image "one point per square" stretched with smoothing: the edges between open and closed come out soft.
    const low = document.createElement('canvas');
    low.width = WORLD_COLUMNS;
    low.height = WORLD_ROWS;
    const lctx = low.getContext('2d')!;
    const image = lctx.createImageData(WORLD_COLUMNS, WORLD_ROWS);
    fog.forEach((alpha, i) => image.data.set([FOG.r, FOG.g, FOG.b, alpha], i * 4));
    lctx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(low, 0, 0, work.width, work.height);
    // Known location circles come from the image: a clear middle and a soft edge.
    for (const key of known) {
      const c = toPixels(placePoint(key));
      const radius = PLACE_CLEAR.outer;
      const patch = document.createElement('canvas');
      patch.width = patch.height = radius * 2;
      const pctx = patch.getContext('2d')!;
      pctx.drawImage(art.map, c.x - radius, c.y - radius, radius * 2, radius * 2, 0, 0, radius * 2, radius * 2);
      const mask = pctx.createRadialGradient(radius, radius, PLACE_CLEAR.inner, radius, radius, radius);
      mask.addColorStop(0, 'rgba(255, 255, 255, 1)');
      mask.addColorStop(1, 'rgba(255, 255, 255, 0)');
      pctx.globalCompositeOperation = 'destination-in';
      pctx.fillStyle = mask;
      pctx.fillRect(0, 0, radius * 2, radius * 2);
      ctx.drawImage(patch, c.x - radius, c.y - radius);
    }
  }
  return work;
}

type Button = { id: 'go' | 'clear' | 'close'; x: number; y: number; w: number; h: number };

export class WorldMapScreen {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private data: WorldMapData | null = null;
  private actions: WorldMapActions | null = null;
  private art: Art | null = null;
  private work: HTMLCanvasElement | null = null;
  private view = { x: 0, y: 0 };
  /** The selected location (click, Tab) and the location under the mouse. */
  private selected: PlaceKey | null = null;
  private hover: PlaceKey | null = null;
  private notice = '';
  private drag: { x: number; y: number; viewX: number; viewY: number; moved: boolean } | null = null;
  private buttons: Button[] = [];
  private readonly keys = (e: KeyboardEvent) => this.onKey(e);

  constructor(parent: HTMLElement) {
    this.host = document.createElement('div');
    this.host.className = 'pause worldmap';
    this.host.hidden = true;
    this.host.setAttribute('role', 'dialog');
    this.host.setAttribute('aria-modal', 'true');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'worldmap-canvas';
    this.canvas.width = SCREEN.w;
    this.canvas.height = SCREEN.h;
    this.canvas.tabIndex = 0;
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onUp(e));
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.draw();
    });
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.host.append(this.canvas);
    parent.append(this.host);
    // Images are loaded in advance: by the first opening they are usually ready.
    void loadArt().catch(() => {});
  }

  get isOpen(): boolean {
    return !this.host.hidden;
  }

  open(data: WorldMapData, actions: WorldMapActions): void {
    this.data = data;
    this.actions = actions;
    this.selected = null;
    this.hover = null;
    this.notice = '';
    this.drag = null;
    this.host.hidden = false;
    this.canvas.setAttribute('aria-label', t('wmTitle'));
    window.addEventListener('keydown', this.keys, true);
    this.centerOnHero();
    this.draw();
    this.canvas.focus({ preventScroll: true });
    void loadArt().then(
      (art) => {
        this.art = art;
        this.refreshMap();
        this.draw();
      },
      () => this.draw(),
    );
  }

  close(): void {
    this.host.hidden = true;
    window.removeEventListener('keydown', this.keys, true);
    this.data = null;
    this.actions = null;
    this.drag = null;
  }

  // ---------- what we show ----------

  private refreshMap(): void {
    if (!this.art || !this.data) return;
    this.work = buildMap(this.art, new Set(this.data.places.map((p) => p.key)), this.data.revealed);
  }

  private centerOnHero(): void {
    if (!this.data) return;
    const hero = toPixels(this.data.hero);
    this.view = viewCenteredOn(hero.x, hero.y);
  }

  private place(key: PlaceKey | null): WorldMapPlace | null {
    return key ? (this.data?.places.find((p) => p.key === key) ?? null) : null;
  }

  /** The location the bottom line talks about: under the mouse, selected, or else the travel target. */
  private focus(): WorldMapPlace | null {
    const target = this.data?.target;
    return this.place(this.hover) ?? this.place(this.selected) ?? (target && 'place' in target ? this.place(target.place) : null);
  }

  // ---------- actions ----------

  private setTarget(next: TravelTarget | null): void {
    if (!this.data || !this.actions) return;
    this.actions.setTarget(next);
    this.data.target = next;
    this.notice = '';
  }

  private clickPlace(p: WorldMapPlace): void {
    this.selected = p.key;
    this.setTarget(targetHit(this.data?.target ?? null, p.key, 0, 0) ? null : { place: p.key });
  }

  private clickPoint(px: number, py: number): void {
    const point = squareFromPixels(px, py);
    if (!point) return;
    if (targetHit(this.data?.target ?? null, null, px, py)) {
      this.setTarget(null);
      return;
    }
    if (terrainAt(Math.floor(point.x), Math.floor(point.y)) === 'water') {
      this.notice = t('wmWater');
      return;
    }
    this.selected = null;
    this.setTarget({ point });
  }

  private canGo(p: WorldMapPlace | null): p is WorldMapPlace {
    return !!p && !!this.data && p.visited && p.hours >= 0.5 && this.data.canTravel;
  }

  private go(): void {
    const p = this.focus();
    if (this.canGo(p)) this.actions?.travel(p.key);
  }

  private cycle(step: number): void {
    if (!this.data) return;
    const list = slotPlaces(this.data.places);
    if (list.length === 0) return;
    const at = list.findIndex((p) => p.key === (this.selected ?? this.focus()?.key));
    const next = list[(at + step + list.length * 2) % list.length]!;
    this.selected = next.key;
    // Show the selected location: the map scrolls to it by itself.
    const c = toPixels(placePoint(next.key));
    this.view = viewCenteredOn(c.x, c.y);
  }

  private scroll(dx: number, dy: number): void {
    this.view = clampView(this.view.x + dx, this.view.y + dy);
  }

  // ---------- input ----------

  private onKey(e: KeyboardEvent): void {
    if (!this.data) return;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.scroll(-SCROLL_STEP, 0);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.scroll(SCROLL_STEP, 0);
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.scroll(0, -SCROLL_STEP);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.scroll(0, SCROLL_STEP);
        break;
      case 'Home':
        this.centerOnHero();
        break;
      case 'Tab':
        this.cycle(e.shiftKey ? -1 : 1);
        break;
      case 'Enter':
      case 'Space': {
        const p = this.place(this.selected);
        if (p) this.clickPlace(p);
        break;
      }
      case 'KeyG':
        this.go();
        break;
      case 'KeyC':
      case 'Delete':
      case 'Backspace':
        this.setTarget(null);
        break;
      default:
        // Esc and M close the window: the game handles that.
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.draw();
  }

  private pointer(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) * SCREEN.w) / rect.width, y: ((e.clientY - rect.top) * SCREEN.h) / rect.height };
  }

  private inView(x: number, y: number): boolean {
    return x >= VIEW.x && x < VIEW.x + VIEW.w && y >= VIEW.y && y < VIEW.y + VIEW.h;
  }

  /** The image point under a window point. */
  private mapAt(x: number, y: number): { x: number; y: number } {
    return { x: this.view.x + x - VIEW.x, y: this.view.y + y - VIEW.y };
  }

  private buttonAt(x: number, y: number): Button | undefined {
    return this.buttons.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  }

  private slotAt(x: number, y: number): WorldMapPlace | null {
    if (!this.data || x < SLOTS.lampX - 10 || x >= SLOTS.labelX + SLOTS.labelW + 4) return null;
    const list = slotPlaces(this.data.places);
    const i = SLOTS.ys.findIndex((cy) => Math.abs(y - cy) <= 13);
    return i >= 0 ? (list[i] ?? null) : null;
  }

  private onDown(e: PointerEvent): void {
    const p = this.pointer(e);
    this.canvas.setPointerCapture(e.pointerId);
    if (this.inView(p.x, p.y) && !this.buttonAt(p.x, p.y)) this.drag = { x: p.x, y: p.y, viewX: this.view.x, viewY: this.view.y, moved: false };
  }

  private onMove(e: PointerEvent): void {
    const p = this.pointer(e);
    if (this.drag) {
      if (Math.hypot(p.x - this.drag.x, p.y - this.drag.y) > DRAG_SLOP) this.drag.moved = true;
      if (this.drag.moved) this.view = clampView(this.drag.viewX - (p.x - this.drag.x), this.drag.viewY - (p.y - this.drag.y));
    }
    if (!this.drag?.moved) {
      const over = this.inView(p.x, p.y) && this.data ? placeAtPixels(this.data.places, this.mapAt(p.x, p.y).x, this.mapAt(p.x, p.y).y) : this.slotAt(p.x, p.y);
      this.hover = over?.key ?? null;
    }
    this.draw();
  }

  private onUp(e: PointerEvent): void {
    const p = this.pointer(e);
    const drag = this.drag;
    this.drag = null;
    if (!this.data || !this.actions) return;
    const button = this.buttonAt(p.x, p.y);
    if (button) {
      if (button.id === 'close') this.actions.close();
      else if (button.id === 'go') this.go();
      else this.setTarget(null);
    } else if (drag && !drag.moved && this.inView(p.x, p.y)) {
      const m = this.mapAt(p.x, p.y);
      const hit = placeAtPixels(this.data.places, m.x, m.y);
      if (hit) this.clickPlace(hit);
      else this.clickPoint(m.x, m.y);
    } else if (!drag) {
      const slot = this.slotAt(p.x, p.y);
      if (slot) {
        this.clickPlace(slot);
        const c = toPixels(placePoint(slot.key));
        this.view = viewCenteredOn(c.x, c.y);
      }
    }
    this.draw();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.scroll(e.shiftKey ? e.deltaY : e.deltaX, e.shiftKey ? 0 : e.deltaY);
    this.draw();
  }

  // ---------- drawing ----------

  private label(font: BitmapFont, text: string, x: number, y: number, color: string, align: 'left' | 'center' | 'right' = 'left'): void {
    drawLabel(this.ctx, font, text, x + 1, y + 1, COLORS.outline, align);
    drawLabel(this.ctx, font, text, x, y, color, align);
  }

  private draw(): void {
    const { ctx } = this;
    const data = this.data;
    if (!data) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
    const art = this.art;
    if (!art || !this.work) {
      // The images are still being read from the game copy.
      ctx.fillStyle = COLORS.dim;
      ctx.font = '16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(t('loading'), SCREEN.w / 2, SCREEN.h / 2);
      ctx.textAlign = 'start';
      return;
    }
    this.buttons = [];
    this.drawMap(art, data);
    ctx.drawImage(art.box, 0, 0);
    if (data.clock) this.drawClock(art, data.clock);
    this.drawSlots(art, data);
    this.drawBar(art, data);
    this.drawPlate(art);
    // A hint in the bottom edge of the frame: short, so it fits.
    this.label(art.small, fitText(art.small, t('wmHint2'), VIEW.w - 8), VIEW.x + 4, VIEW.y + VIEW.h + 1, COLORS.dim);
  }

  private drawMap(art: Art, data: WorldMapData): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    ctx.clip();
    ctx.drawImage(this.work!, this.view.x, this.view.y, VIEW.w, VIEW.h, VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    const screen = (square: { x: number; y: number }) => {
      const p = toPixels(square);
      return { x: VIEW.x + p.x - this.view.x, y: VIEW.y + p.y - this.view.y };
    };
    const focus = this.focus();
    const hero = screen(data.hero);

    // Path to the target: a dotted line from the hero.
    if (data.target) {
      const goal = screen('place' in data.target ? placePoint(data.target.place) : data.target.point);
      ctx.setLineDash([3, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.target;
      ctx.beginPath();
      ctx.moveTo(hero.x, hero.y);
      ctx.lineTo(goal.x, goal.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if ('point' in data.target) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = COLORS.outline;
        ctx.beginPath();
        ctx.arc(goal.x, goal.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = COLORS.target;
        ctx.beginPath();
        ctx.arc(goal.x, goal.y, 8, 0, Math.PI * 2);
        ctx.moveTo(goal.x - 12, goal.y);
        ctx.lineTo(goal.x + 12, goal.y);
        ctx.moveTo(goal.x, goal.y - 12);
        ctx.lineTo(goal.x, goal.y + 12);
        ctx.stroke();
      }
    }

    // Locations: rings over the image's circles, and names.
    const targetKey = data.target && 'place' in data.target ? data.target.place : null;
    for (const p of data.places) {
      const c = screen(placePoint(p.key));
      if (c.x < VIEW.x - 70 || c.x > VIEW.x + VIEW.w + 70 || c.y < VIEW.y - 40 || c.y > VIEW.y + VIEW.h + 40) continue;
      ctx.lineWidth = 2;
      if (p.visited) {
        ctx.strokeStyle = COLORS.visited;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 27, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (p.key === targetKey) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = COLORS.target;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 31, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (focus?.key === p.key) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 35, 0, Math.PI * 2);
        ctx.stroke();
      }
      this.label(art.small, fitText(art.small, p.name, 130), c.x, c.y + 38, p.visited ? COLORS.visited : COLORS.place, 'center');
    }

    // The hero: a yellow dot with a dark outline, in place, not blinking.
    ctx.fillStyle = COLORS.outline;
    ctx.beginPath();
    ctx.arc(hero.x, hero.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.hero;
    ctx.beginPath();
    ctx.arc(hero.x, hero.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Date and time in the frame's windows: the same digits and months as in the Pip-Boy. */
  private drawClock(art: Art, clock: Clock): void {
    const { ctx } = this;
    const { digits, months } = art;
    const date = clock.date;
    const number = (value: number, count: number, x: number, y: number) => {
      let rest = Math.max(0, Math.floor(value));
      for (let i = count - 1; i >= 0; i--) {
        ctx.drawImage(digits, CLOCK.cell * (rest % 10), 0, CLOCK.cell, digits.height, x + CLOCK.cell * i, y, CLOCK.cell, digits.height);
        rest = Math.floor(rest / 10);
      }
    };
    number(date.day, 2, CLOCK.day.x, CLOCK.day.y);
    ctx.drawImage(months, 0, 15 * (date.month - 1), months.width, 14, CLOCK.month.x, CLOCK.month.y, months.width, 14);
    number(date.year, 4, CLOCK.year.x, CLOCK.year.y);
    number(date.hour * 100 + date.minute, 4, CLOCK.time.x, CLOCK.time.y);
  }

  /** Right panel: known locations on the frame's lamps; the other lamps go dark. */
  private drawSlots(art: Art, data: WorldMapData): void {
    const { ctx } = this;
    const list = slotPlaces(data.places);
    const targetKey = data.target && 'place' in data.target ? data.target.place : null;
    const focus = this.focus();
    SLOTS.ys.forEach((cy, i) => {
      const p = list[i];
      if (!p) {
        ctx.fillStyle = 'rgba(14, 12, 9, 0.82)';
        ctx.fillRect(SLOTS.lampX - 9, cy - 10, SLOTS.labelX + SLOTS.labelW - SLOTS.lampX + 12, 20);
        return;
      }
      if (focus?.key === p.key) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.fillRect(SLOTS.labelX - 3, cy - 10, SLOTS.labelW + 6, 20);
      }
      // The target: the lamp glows bright blue around the red.
      if (p.key === targetKey) {
        ctx.fillStyle = COLORS.target;
        ctx.beginPath();
        ctx.arc(SLOTS.lampX, cy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff5a3c';
        ctx.beginPath();
        ctx.arc(SLOTS.lampX, cy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      const color = p.key === targetKey ? '#ffffff' : p.visited ? COLORS.text : COLORS.dim;
      this.label(art.small, fitText(art.small, p.name, SLOTS.labelW), SLOTS.labelX, cy - 6, color);
    });
  }

  /** The line at the bottom of the map: what it is about (location, target) and the "Go" and "Remove target" buttons. */
  private drawBar(art: Art, data: WorldMapData): void {
    const { ctx } = this;
    const y = VIEW.y + VIEW.h - BAR.h - 14;
    const x = VIEW.x + 6;
    const w = VIEW.w - 12;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(x, y, w, BAR.h);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, BAR.h - 1);

    const focus = this.focus();
    const target = data.target;
    // What to write on the left.
    let text = t('wmPick');
    let color = COLORS.dim;
    if (this.notice) {
      text = this.notice;
      color = COLORS.warn;
    } else if (focus) {
      const here = focus.hours < 0.5;
      const lead = target && 'place' in target && target.place === focus.key ? `${t('wmTarget')}: ` : '';
      text = `${lead}${focus.name} - ${here ? t('wmHere') : `${t(focus.visited ? 'wmVisited' : 'wmKnown')}, ${tf('wmDistance', { km: Math.round(focus.km), time: formatHours(focus.hours) })}`}`;
      color = COLORS.text;
    } else if (target && 'point' in target) {
      const hours = travelHours(data.hero, target.point);
      const km = Math.hypot(target.point.x - data.hero.x, target.point.y - data.hero.y) * SQUARE_KM;
      text = `${t('wmPoint')} - ${tf('wmDistance', { km: Math.round(km), time: formatHours(hours) })}`;
      color = COLORS.text;
    }
    // Buttons on the right.
    const buttons: { id: Button['id']; text: string }[] = [];
    if (this.canGo(focus)) buttons.push({ id: 'go', text: t('wmGo') });
    if (target) buttons.push({ id: 'clear', text: t('wmClear') });
    let right = x + w - 6;
    for (const b of [...buttons].reverse()) {
      const bw = labelWidth(art.small, b.text) + 16;
      const by = y + 5;
      right -= bw;
      this.buttons.push({ id: b.id, x: right, y: by, w: bw, h: BAR.h - 10 });
      ctx.fillStyle = 'rgba(122, 106, 66, 0.35)';
      ctx.fillRect(right, by, bw, BAR.h - 10);
      ctx.strokeStyle = COLORS.border;
      ctx.strokeRect(right + 0.5, by + 0.5, bw - 1, BAR.h - 11);
      this.label(art.small, b.text, right + 8, by + 3, COLORS.visited);
      right -= 6;
    }
    // In combat there is no "Go": we say why.
    const blocked = focus && focus.visited && focus.hours >= 0.5 && !data.canTravel && !this.notice;
    const shown = blocked ? t('msgNoTravelInCombat') : text;
    this.label(art.small, fitText(art.small, shown, right - x - 6), x + 8, y + 9, blocked ? COLORS.warn : color);
  }

  /** The "Close" plate in place of the original "Town/World" switch. */
  private drawPlate(art: Art): void {
    const { ctx } = this;
    ctx.fillStyle = '#2a251c';
    ctx.fillRect(PLATE.x, PLATE.y, PLATE.w, PLATE.h);
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(PLATE.x + 0.5, PLATE.y + 0.5, PLATE.w - 1, PLATE.h - 1);
    this.label(art.small, fitText(art.small, t('wmClose'), PLATE.w - 8), PLATE.x + PLATE.w / 2, PLATE.y + 11, COLORS.visited, 'center');
    this.buttons.push({ id: 'close', x: PLATE.x, y: PLATE.y, w: PLATE.w, h: PLATE.h });
  }
}
