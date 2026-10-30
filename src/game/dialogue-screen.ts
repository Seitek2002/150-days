// The dialogue window on the original's images: a talking head in a frame, the speaker's line on a green screen,
// reply options as a list (each with a "bullet", lights up under the mouse). All images and fonts are from the player's copy.
// Choosing — with the mouse, digits 1–9 or Tab and Enter (on a gamepad — the D-pad and A, src/game/gamepad.ts); Up/Down and the wheel scroll a long line. The button on the left ("Review") shows
// what has already been said. The head "fidgets" with the original's idle animation (no lip movement); for those without a head, the level itself is visible behind the frame.
// The "fidgets" depend on the speaker's mood (good, neutral, bad — files G, N, B).
// The interface for scripts is the same as the old window's: open / ask / close (DialogueUI), plus barter — trading:
// the bottom panel is replaced by the barter panel (barter-panel.ts) until the hero presses "Talk".
import { GameAssets, type SpriteFrame, type SpriteSheet } from '../assets/sprites.ts';
import type { Sound } from '../audio/sound.ts';
import { lineHeight, type BitmapFont } from '../formats/font.ts';
import { parseLst } from '../formats/text.ts';
import { t, tf } from '../i18n.ts';
import { platform } from '../platform.ts';
import type { DialogueUI } from '../script/game-functions.ts';
import type { ItemProto } from '../formats/pro.ts';
import { BarterPanel, type ItemLook } from './barter-panel.ts';
import type { Trade } from './barter.ts';
import { drawLabel, loadInterfaceFonts, wrapText } from './fonts.ts';
import { padLabels, usingPad } from './gamepad.ts';

/** Image numbers in INTRFACE.LST: the bottom panel, the window background, the red button (released and pressed), the "Review" button (released and pressed). */
const ART = { panel: 99, background: 103, redUp: 95, redDown: 96, restUp: 97, restDown: 98, barter: 111 };

/** The original's layout in 640×480 screen pixels. */
const HEAD = { x: 126, y: 14, w: 388, h: 200 };
const REPLY = { x: 135, y: 225, w: 379, h: 58 };
/** Where the text goes in the line window (inside the screen frame). */
const REPLY_TEXT = { x: 5, y: 10, w: 369, h: 48 };
const OPTIONS = { x: 127, y: 335, w: 393, h: 117 };
const OPTIONS_TEXT = { x: 5, y: 5, w: 383, h: 107 };
/** The "Review" button — in bottom panel coordinates. */
const REVIEW_BUTTON = { x: 13, y: 154, w: 51, h: 29 };
/** The "Barter" button (the label and the red button at the top right of the panel) and where to draw the pressed red button. */
const BARTER_BUTTON = { x: 578, y: 14, w: 52, h: 48 };
const BARTER_DOT = { x: 591, y: 43 };
/** The four corners and four edges of the head frame: after the head they are restored from the background so the head doesn't stick out of the frame. */
const FRAME_STRIPS = [
  { x: 126, y: 14, w: 26, h: 26 },
  { x: 488, y: 14, w: 26, h: 26 },
  { x: 126, y: 188, w: 26, h: 26 },
  { x: 488, y: 188, w: 26, h: 26 },
  { x: 152, y: 14, w: 336, h: 10 },
  { x: 152, y: 204, w: 336, h: 10 },
  { x: 126, y: 40, w: 10, h: 148 },
  { x: 504, y: 40, w: 10, h: 148 },
];
const SCREEN_H = 480;
const CLICK = 'IB1P1XX1';
const HISTORY_MAX = 80;

const GREEN = '#4fd65a';
const BRIGHT = '#f8f858';
const DIM = '#2f9a39';
const OPTION_GAP = 2;

/** One reply option laid out in lines: top — from the start of the list (in pixels). */
export interface OptionBlock {
  index: number;
  lines: string[];
  top: number;
  height: number;
}

/** Option layout: a "bullet", wrapping by width, two pixels between options. Empty text — "end the conversation". */
export function layoutOptions(font: BitmapFont, options: readonly string[], width: number): OptionBlock[] {
  const pitch = lineHeight(font);
  let top = 0;
  return options.map((text, index) => {
    const lines = wrapText(font, `• ${text.trim() || t('dialogEnd')}`, width);
    const block = { index, lines: lines.length ? lines : ['•'], top, height: Math.max(1, lines.length) * pitch };
    top += block.height + OPTION_GAP;
    return block;
  });
}

/**
 * Which option to start showing from so that option `focus` fits into `height` pixels:
 * don't shift without need (`first` — as now), otherwise shift exactly enough for the needed option to be fully visible.
 */
export function firstVisibleOption(blocks: readonly OptionBlock[], first: number, focus: number, height: number): number {
  if (blocks.length === 0) return 0;
  let start = Math.min(Math.max(0, first), blocks.length - 1);
  const target = Math.min(Math.max(0, focus), blocks.length - 1);
  if (target < start) start = target;
  // Move the start forward until the needed option fits (if it's longer than the window itself — show it from its start).
  while (start < target && blocks[target]!.top + blocks[target]!.height - blocks[start]!.top > height) start++;
  return start;
}

/** The lines that fit into a window of height `height` starting from option `first` (the last one won't be cut off). */
export function visibleOptions(blocks: readonly OptionBlock[], first: number, height: number): OptionBlock[] {
  if (first >= blocks.length) return [];
  const base = blocks[first]!.top;
  const out: OptionBlock[] = [];
  for (let i = first; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (out.length > 0 && block.top + block.height - base > height) break;
    out.push(block);
  }
  return out;
}

/** A head from HEADS.LST: the file name and how many "fidgets" it has for good, neutral and bad mood. */
export interface HeadInfo {
  name: string;
  good: number;
  neutral: number;
  bad: number;
}

/** The speaker's mood → the letter in the head's file names: 1 — good (G), 7 — bad (B), everything else — neutral (N). */
export function moodLetter(mood: number): 'G' | 'N' | 'B' {
  return mood === 1 ? 'G' : mood === 7 ? 'B' : 'N';
}

/** How many "fidgets" a head has for this mood. */
export function fidgetCount(head: HeadInfo, mood: number): number {
  const letter = moodLetter(mood);
  return letter === 'G' ? head.good : letter === 'B' ? head.bad : head.neutral;
}

interface Art {
  background: HTMLCanvasElement;
  panel: HTMLCanvasElement;
  /** The barter panel (trading). */
  barter: HTMLCanvasElement;
  redUp: HTMLCanvasElement;
  redDown: HTMLCanvasElement;
  restUp: HTMLCanvasElement;
  restDown: HTMLCanvasElement;
  font: BitmapFont;
  heads: HeadInfo[];
  backgrounds: string[];
  assets: GameAssets;
}

let artPromise: Promise<Art> | null = null;

function loadArt(): Promise<Art> {
  if (!artPromise) {
    artPromise = (async () => {
      const B = String.fromCharCode(92);
      const [assets, list, fonts, headsRaw, backgroundsRaw] = await Promise.all([
        GameAssets.load(),
        platform.readGameFile(`ART${B}INTRFACE${B}INTRFACE.LST`).then(parseLst),
        loadInterfaceFonts(),
        platform.readGameFile(`ART${B}HEADS${B}HEADS.LST`).then((bytes) => new TextDecoder('windows-1251').decode(bytes)),
        platform.readGameFile(`ART${B}BACKGRND${B}BACKGRND.LST`).then(parseLst),
      ]);
      const image = (index: number) => {
        const file = list[index];
        if (!file) throw new Error('No interface image ' + index);
        return assets.image(`ART${B}INTRFACE${B}` + file);
      };
      const [background, panel, redUp, redDown, restUp, restDown, barter] = await Promise.all([
        image(ART.background),
        image(ART.panel),
        image(ART.redUp),
        image(ART.redDown),
        image(ART.restUp),
        image(ART.restDown),
        image(ART.barter),
      ]);
      // HEADS.LST: "name,good,neutral,bad" — the name and the number of "fidgets" for each mood.
      const count = (text: string | undefined) => Number.parseInt(text ?? '0', 10) || 0;
      const heads = headsRaw
        .split(/\r?\n/)
        .map((line) => line.split(/[;]/)[0]!.split(','))
        .map((p) => ({ name: (p[0] ?? '').trim().toUpperCase(), good: count(p[1]), neutral: count(p[2]), bad: count(p[3]) }));
      return { background, panel, redUp, redDown, restUp, restDown, barter, font: fonts.main, heads, backgrounds: backgroundsRaw, assets };
    })();
    // Failed — try again next time.
    artPromise.catch(() => (artPromise = null));
  }
  return artPromise;
}

const STYLE_ID = 'dialogue-screen-style';
const STYLE = `
.dlg-host { position: fixed; inset: 0; z-index: 15; display: grid; place-items: center; background: #000; cursor: default; }
.dlg-host[hidden] { display: none; }
.dlg-stage { width: min(100vw, calc(100vh * 4 / 3)); aspect-ratio: 4 / 3; }
.dlg-canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
.dlg-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: pre-line; }
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.append(style);
}

const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** A sprite frame as a canvas (for drawing with transparency). */
function frameCanvas(frame: SpriteFrame): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d')!;
  const data = ctx.createImageData(frame.width, frame.height);
  new Uint32Array(data.data.buffer).set(frame.pixels);
  ctx.putImageData(data, 0, 0);
  return canvas;
}

interface HeadAnimation {
  sheet: SpriteSheet;
  frames: HTMLCanvasElement[];
}

export class DialogueScreen implements DialogueUI {
  /** Tells the game the window opened or closed (pause, mouse). */
  onToggle: (open: boolean) => void = () => {};
  /** The "Barter" button: the dialogue script sets it (whom to trade with); the answer is why it's not possible. */
  onBarter: (() => Promise<string | void>) | null = null;
  /** An original movie by number (play_gmovie) — the game shows it. */
  movie?: (index: number) => Promise<void>;
  /** Item names and images for trading (set by the game: they come from the player's copy). */
  items: { name(proto: ItemProto): string; image(proto: ItemProto): Promise<HTMLCanvasElement | null> } | null = null;
  private barterPanel: BarterPanel | null = null;
  private readonly itemImages = new Map<number, HTMLCanvasElement | null>();
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly live: HTMLElement;
  private readonly parent: HTMLElement;
  private readonly sound: Sound | undefined;
  private readonly reduceMotion: boolean;
  private art: Art | null = null;
  private opened = false;
  private speaker = '';
  private headIndex = -1;
  private mood = 4;
  private backgroundIndex = 1;
  private backgroundImage: HTMLCanvasElement | null = null;
  private fallbackView: HTMLCanvasElement | null = null;
  /** The head's idle "fidget": the rest frame and the animation (loaded as needed). */
  private still: HTMLCanvasElement | null = null;
  private stillShift = { x: 0, y: 0 };
  private fidgets: HeadAnimation[] = [];
  private fidget: { animation: HeadAnimation; startedAt: number; frame: number } | null = null;
  private nextFidgetAt = 0;
  private timer = 0;
  private replyLines: string[] = [];
  private replyTop = 0;
  private options: string[] = [];
  private blocks: OptionBlock[] = [];
  private firstOption = 0;
  private hover = -1;
  private pressed: { option: number } | { review: true } | { barter: true } | null = null;
  /** The speaker's line awaiting an answer now (after trading — back in the line window). */
  private reply = '';
  private review = false;
  private reviewTop = 0;
  private history: { text: string; you: boolean }[] = [];
  private pending: ((choice: number) => void) | null = null;
  private loadToken = 0;

  constructor(parent: HTMLElement, sound?: Sound) {
    ensureStyle();
    this.parent = parent;
    this.sound = sound;
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.host = document.createElement('div');
    this.host.className = 'dlg-host';
    this.host.hidden = true;
    this.host.setAttribute('role', 'dialog');
    this.host.setAttribute('aria-modal', 'true');
    const stage = document.createElement('div');
    stage.className = 'dlg-stage';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dlg-canvas';
    this.canvas.width = 640;
    this.canvas.height = 480;
    stage.append(this.canvas);
    this.live = document.createElement('div');
    this.live.className = 'dlg-live';
    this.live.setAttribute('aria-live', 'polite');
    this.host.append(stage, this.live);
    parent.append(this.host);

    this.canvas.addEventListener('mousemove', (e) => this.onMove(e));
    this.canvas.addEventListener('mouseleave', () => this.setHover(-1));
    this.canvas.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mouseup', (e) => this.onUp(e));
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get isOpen(): boolean {
    return this.opened;
  }

  // ---------- interface for scripts ----------

  open(speaker: string, head = -1, background = -1, mood = 4): void {
    this.speaker = speaker;
    this.headIndex = head;
    this.mood = mood;
    if (background >= 0) this.backgroundIndex = background;
    this.host.setAttribute('aria-label', speaker);
    this.review = false;
    if (!this.opened) {
      this.opened = true;
      this.history = [];
      this.replyLines = [];
      this.options = [];
      this.blocks = [];
      this.hover = -1;
      // The previous speaker must not flash while the new one loads: the head is empty, the canvas is redrawn immediately.
      this.backgroundImage = null;
      this.still = null;
      this.fidgets = [];
      this.fidget = null;
      this.snapshotLevel();
      this.host.hidden = false;
      this.onToggle(true);
      this.startAnimation();
      this.draw();
    }
    void this.prepare();
  }

  async ask(reply: string, options: string[]): Promise<number> {
    if (!this.opened) this.open(this.speaker);
    // The text doesn't wait for the head: it finishes loading by itself (prepare from open).
    this.art ??= await loadArt();
    const art = this.art;
    if (!art || !this.opened) return 0;
    this.reply = reply;
    this.replyLines = wrapText(art.font, reply, REPLY_TEXT.w);
    this.replyTop = 0;
    this.options = options;
    this.blocks = layoutOptions(art.font, options, OPTIONS_TEXT.w);
    this.firstOption = 0;
    this.hover = -1;
    this.pressed = null;
    this.remember(reply, false);
    this.live.textContent = [reply, ...options.map((o, i) => `${i + 1}. ${o.trim() || t('dialogEnd')}`)].join('\n');
    this.draw();
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  /**
   * Trading (gdialog_barter): the bottom panel is replaced by the barter panel; finishes when the hero presses "Talk" (or Esc).
   * Everything left on the tables goes back to its owners.
   */
  async barter(trade: Trade, merchant: string): Promise<void> {
    if (!this.opened) this.open(merchant);
    await this.ready();
    if (!this.art || !this.opened || !this.items) {
      trade.cancel();
      return;
    }
    const items = this.items;
    const look: ItemLook = {
      name: (proto) => items.name(proto),
      image: (proto) => {
        if (!this.itemImages.has(proto.pid)) {
          this.itemImages.set(proto.pid, null);
          void items.image(proto).then(
            (img) => {
              this.itemImages.set(proto.pid, img);
              this.draw();
            },
            () => {},
          );
        }
        return this.itemImages.get(proto.pid) ?? null;
      },
    };
    const panel = new BarterPanel(trade, look, merchant);
    this.options = [];
    this.blocks = [];
    this.hover = -1;
    this.review = false;
    return new Promise((resolve) => {
      panel.onClose = () => {
        if (this.barterPanel === panel) this.barterPanel = null;
        this.sound?.play(CLICK);
        this.draw();
        resolve();
      };
      panel.onDeal = () => this.sound?.play(CLICK);
      this.barterPanel = panel;
      this.draw();
    });
  }

  close(): void {
    // Unfinished trading — items from the tables go back to their owners.
    this.barterPanel?.leave();
    // An unfinished choice is closed with the first option — the script won't hang.
    this.finish(0, false);
    if (!this.opened) return;
    this.opened = false;
    this.host.hidden = true;
    window.clearInterval(this.timer);
    this.timer = 0;
    this.fidget = null;
    this.live.textContent = '';
    this.onToggle(false);
  }

  // ---------- loading ----------

  private async ready(): Promise<void> {
    if (!this.art) this.art = await loadArt();
    await this.prepare();
  }

  /** Prepare the background and the head for the current numbers (whatever isn't loaded yet). */
  private async prepare(): Promise<void> {
    const token = ++this.loadToken;
    try {
      this.art ??= await loadArt();
    } catch {
      return;
    }
    const art = this.art;
    const B = String.fromCharCode(92);
    const backgroundFile = art.backgrounds[this.backgroundIndex];
    let background: HTMLCanvasElement | null = null;
    if (backgroundFile && (await platform.gameFileExists(`ART${B}BACKGRND${B}${backgroundFile}`))) {
      background = await art.assets.image(`ART${B}BACKGRND${B}${backgroundFile}`);
    }
    const head = this.headIndex > 0 ? art.heads[this.headIndex] : undefined;
    // "Fidget" files for this mood: <head name><G|N|B>F<number>. No first one — try the neutral mood.
    let letter: string = moodLetter(this.mood);
    let count = head ? fidgetCount(head, this.mood) : 0;
    let first: HeadAnimation | null = null;
    if (head?.name) {
      first = count > 0 ? await this.loadHeadSheet(art, `${head.name}${letter}F1`) : null;
      if (!first && letter !== 'N') {
        letter = 'N';
        count = head.neutral;
        first = await this.loadHeadSheet(art, `${head.name}NF1`);
      }
    }
    // While loading, the window might have closed or switched to another speaker.
    if (token !== this.loadToken) return;
    this.backgroundImage = background;
    this.still = first?.frames[0] ?? null;
    this.stillShift = { x: first?.sheet.shifts[0]?.x ?? 0, y: first?.sheet.shifts[0]?.y ?? 0 };
    this.fidgets = first ? [first] : [];
    this.fidget = null;
    this.nextFidgetAt = performance.now() + 1500;
    this.draw();
    if (!first || !head) return;
    // The head is already on screen; the remaining "fidgets" finish loading while the speaker talks.
    const fidgets = [first];
    for (let n = 2; n <= count; n++) {
      const animation = await this.loadHeadSheet(art, `${head.name}${letter}F${n}`);
      if (animation) fidgets.push(animation);
    }
    if (token !== this.loadToken) return;
    this.fidgets = fidgets;
  }

  private async loadHeadSheet(art: Art, name: string): Promise<HeadAnimation | null> {
    const B = String.fromCharCode(92);
    const path = `ART${B}HEADS${B}${name}.FRM`;
    if (!(await platform.gameFileExists(path))) return null;
    const sheet = await art.assets.sheet(path);
    const frames = (sheet.directions[0] ?? []).map(frameCanvas);
    return frames.length > 0 ? { sheet, frames } : null;
  }

  /** If there's no head, the level itself is visible behind the frame: we remember a piece of the game screen at the centre. */
  private snapshotLevel(): void {
    const game = this.parent.querySelector<HTMLCanvasElement>('canvas:not(.dlg-canvas)');
    this.fallbackView = null;
    if (!game) return;
    const view = document.createElement('canvas');
    view.width = HEAD.w;
    view.height = HEAD.h;
    // The game screen is 640×480, with the panel at the bottom; the middle of the view — by height without the panel.
    const viewHeight = Math.min(game.height, 380);
    view.getContext('2d')!.drawImage(game, (game.width - HEAD.w) / 2, Math.max(0, (viewHeight - HEAD.h) / 2), HEAD.w, HEAD.h, 0, 0, HEAD.w, HEAD.h);
    this.fallbackView = view;
  }

  // ---------- head animation ----------

  private startAnimation(): void {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 80);
  }

  private tick(): void {
    if (!this.opened || this.reduceMotion || this.fidgets.length === 0 || this.review) return;
    const now = performance.now();
    if (!this.fidget) {
      if (now < this.nextFidgetAt) return;
      const animation = this.fidgets[Math.floor(Math.random() * this.fidgets.length)]!;
      this.fidget = { animation, startedAt: now, frame: -1 };
    }
    const { animation, startedAt } = this.fidget;
    const frame = Math.floor(((now - startedAt) * Math.max(1, animation.sheet.fps)) / 1000);
    if (frame >= animation.frames.length) {
      // Finished: a pause of three to six seconds until the next "fidget".
      this.fidget = null;
      this.nextFidgetAt = now + 3000 + Math.random() * 3000;
      this.draw();
      return;
    }
    if (frame !== this.fidget.frame) {
      this.fidget.frame = frame;
      this.draw();
    }
  }

  // ---------- drawing ----------

  private draw(): void {
    const art = this.art;
    if (!art || !this.opened) return;
    const ctx = this.canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 640, 480);
    ctx.drawImage(art.background, 0, 0);
    this.drawHead(ctx, art);
    if (this.barterPanel) {
      // Trading: instead of the reply panel — the barter panel; in the line window — a hint, the item under the mouse or the deal's result.
      this.barterPanel.draw(ctx, art.font, art.barter, art.redDown, SCREEN_H - art.barter.height);
      this.replyLines = wrapText(art.font, this.barterPanel.replyText(), REPLY_TEXT.w);
      this.replyTop = 0;
      this.drawReply(ctx, art);
      return;
    }
    const panelY = SCREEN_H - art.panel.height;
    ctx.drawImage(art.panel, 0, panelY);
    ctx.drawImage(this.pressed && 'review' in this.pressed ? art.restDown : art.restUp, REVIEW_BUTTON.x, panelY + REVIEW_BUTTON.y);
    if (this.pressed && 'barter' in this.pressed) ctx.drawImage(art.redDown, BARTER_DOT.x, panelY + BARTER_DOT.y);
    this.drawReply(ctx, art);
    this.drawOptions(ctx, art);
    if (this.review) this.drawReview(ctx, art);
    // The hint under the bottom panel — large characters aren't needed, but it's useful to know the keys.
    drawLabel(ctx, art.font, usingPad() ? tf('dialogHintPad', padLabels()) : t('dialogHint'), 320, 465, DIM, 'center');
  }

  private drawHead(ctx: CanvasRenderingContext2D, art: Art): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(HEAD.x, HEAD.y, HEAD.w, HEAD.h);
    ctx.clip();
    if (this.headIndex > 0 && (this.backgroundImage || this.still)) {
      if (this.backgroundImage) ctx.drawImage(this.backgroundImage, HEAD.x, HEAD.y, HEAD.w, HEAD.h);
      else {
        ctx.fillStyle = '#000';
        ctx.fillRect(HEAD.x, HEAD.y, HEAD.w, HEAD.h);
      }
      const frame = this.fidget && this.fidget.frame >= 0 ? this.fidget.animation.frames[this.fidget.frame] : this.still;
      if (frame) {
        const x = HEAD.x + Math.round((HEAD.w - frame.width) / 2) + this.stillShift.x;
        const y = HEAD.y + HEAD.h - frame.height + this.stillShift.y;
        ctx.drawImage(frame, x, y);
      }
    } else if (this.fallbackView) {
      ctx.drawImage(this.fallbackView, HEAD.x, HEAD.y);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(HEAD.x, HEAD.y, HEAD.w, HEAD.h);
    }
    ctx.restore();
    // The frame's corners and edges — over the head.
    for (const s of FRAME_STRIPS) ctx.drawImage(art.background, s.x, s.y, s.w, s.h, s.x, s.y, s.w, s.h);
  }

  /** How many lines of the speaker's line fit into the window. */
  private replyRows(font: BitmapFont): number {
    return Math.max(1, Math.floor(REPLY_TEXT.h / lineHeight(font)));
  }

  private drawReply(ctx: CanvasRenderingContext2D, art: Art): void {
    const pitch = lineHeight(art.font);
    const rows = this.replyRows(art.font);
    ctx.save();
    ctx.beginPath();
    ctx.rect(REPLY.x + REPLY_TEXT.x, REPLY.y + REPLY_TEXT.y, REPLY_TEXT.w, REPLY_TEXT.h);
    ctx.clip();
    this.replyLines.slice(this.replyTop, this.replyTop + rows).forEach((line, i) => {
      drawLabel(ctx, art.font, line, REPLY.x + REPLY_TEXT.x, REPLY.y + REPLY_TEXT.y + i * pitch, GREEN);
    });
    ctx.restore();
    // Arrows at the right edge: there's something to scroll up or down.
    const arrowX = REPLY.x + REPLY.w - 12;
    ctx.fillStyle = GREEN;
    if (this.replyTop > 0) this.triangle(ctx, arrowX, REPLY.y + 14, -1);
    if (this.replyTop + rows < this.replyLines.length) this.triangle(ctx, arrowX, REPLY.y + REPLY.h - 8, 1);
  }

  private triangle(ctx: CanvasRenderingContext2D, x: number, y: number, direction: 1 | -1): void {
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 2 * direction);
    ctx.lineTo(x + 4, y - 2 * direction);
    ctx.lineTo(x, y + 3 * direction);
    ctx.closePath();
    ctx.fill();
  }

  private drawOptions(ctx: CanvasRenderingContext2D, art: Art): void {
    if (this.blocks.length === 0) return;
    const pitch = lineHeight(art.font);
    const first = firstVisibleOption(this.blocks, this.firstOption, Math.max(0, this.hover), OPTIONS_TEXT.h);
    this.firstOption = first;
    const shown = visibleOptions(this.blocks, first, OPTIONS_TEXT.h);
    const base = this.blocks[first]!.top;
    ctx.save();
    ctx.beginPath();
    ctx.rect(OPTIONS.x + OPTIONS_TEXT.x, OPTIONS.y + OPTIONS_TEXT.y, OPTIONS_TEXT.w, OPTIONS_TEXT.h);
    ctx.clip();
    for (const block of shown) {
      const top = OPTIONS.y + OPTIONS_TEXT.y + block.top - base;
      const active = block.index === this.hover;
      if (active) {
        ctx.fillStyle = 'rgba(79, 214, 90, 0.14)';
        ctx.fillRect(OPTIONS.x + OPTIONS_TEXT.x - 2, top - 1, OPTIONS_TEXT.w + 4, block.lines.length * pitch + 1);
      }
      block.lines.forEach((line, i) => drawLabel(ctx, art.font, line, OPTIONS.x + OPTIONS_TEXT.x, top + i * pitch, active ? BRIGHT : GREEN));
    }
    ctx.restore();
    const arrowX = OPTIONS.x + OPTIONS.w - 8;
    ctx.fillStyle = GREEN;
    if (first > 0) this.triangle(ctx, arrowX, OPTIONS.y + 8, -1);
    if (first + shown.length < this.blocks.length) this.triangle(ctx, arrowX, OPTIONS.y + OPTIONS.h - 6, 1);
  }

  /** Review: what has already been said (our replies — in a light colour). Over the head. */
  private drawReview(ctx: CanvasRenderingContext2D, art: Art): void {
    ctx.fillStyle = 'rgba(0, 12, 0, 0.92)';
    ctx.fillRect(HEAD.x, HEAD.y, HEAD.w, HEAD.h);
    const pitch = lineHeight(art.font);
    const lines = this.reviewLines(art.font);
    const rows = Math.floor((HEAD.h - 34) / pitch);
    this.reviewTop = Math.max(0, Math.min(this.reviewTop, Math.max(0, lines.length - rows)));
    drawLabel(ctx, art.font, t('dialogReview'), HEAD.x + HEAD.w / 2, HEAD.y + 6, BRIGHT, 'center');
    lines.slice(this.reviewTop, this.reviewTop + rows).forEach((line, i) => {
      drawLabel(ctx, art.font, line.text, HEAD.x + 12, HEAD.y + 24 + i * pitch, line.you ? BRIGHT : GREEN);
    });
    drawLabel(ctx, art.font, usingPad() ? tf('dialogReviewHintPad', padLabels()) : t('dialogReviewHint'), HEAD.x + HEAD.w / 2, HEAD.y + HEAD.h - 12, DIM, 'center');
    ctx.fillStyle = GREEN;
    if (this.reviewTop > 0) this.triangle(ctx, HEAD.x + HEAD.w - 14, HEAD.y + 28, -1);
    if (this.reviewTop + rows < lines.length) this.triangle(ctx, HEAD.x + HEAD.w - 14, HEAD.y + HEAD.h - 20, 1);
  }

  private reviewLines(font: BitmapFont): { text: string; you: boolean }[] {
    return this.history.flatMap((entry) => wrapText(font, entry.you ? `> ${entry.text}` : entry.text, HEAD.w - 36).map((text) => ({ text, you: entry.you })));
  }

  private remember(text: string, you: boolean): void {
    this.history.push({ text, you });
    if (this.history.length > HISTORY_MAX) this.history.shift();
  }

  // ---------- choice ----------

  private finish(index: number, played: boolean): void {
    const resolve = this.pending;
    if (!resolve) return;
    this.pending = null;
    const choice = Math.max(0, Math.min(this.options.length - 1, index));
    if (played) this.sound?.play(CLICK);
    const chosen = this.options[choice];
    if (chosen !== undefined) this.remember(chosen.trim() || t('dialogEnd'), true);
    // While the script is thinking, there are no options on screen — until the next question.
    this.options = [];
    this.blocks = [];
    this.hover = -1;
    this.pressed = null;
    this.draw();
    resolve(choice);
  }

  private setHover(index: number): void {
    if (index === this.hover) return;
    this.hover = index;
    this.canvas.style.cursor = index >= 0 ? 'pointer' : 'default';
    this.draw();
  }

  /** Mouse coordinates in 640×480 screen pixels (the window may be stretched). */
  private toScreen(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) * 640) / rect.width, y: ((e.clientY - rect.top) * 480) / rect.height };
  }

  /** Which option is under a screen point; −1 — none. */
  private optionAt(x: number, y: number): number {
    if (!this.art || this.blocks.length === 0 || !inRect({ x: OPTIONS.x, y: OPTIONS.y, w: OPTIONS.w, h: OPTIONS.h }, x, y)) return -1;
    const pitch = lineHeight(this.art.font);
    const base = this.blocks[this.firstOption]?.top ?? 0;
    const local = y - (OPTIONS.y + OPTIONS_TEXT.y) + base;
    const block = visibleOptions(this.blocks, this.firstOption, OPTIONS_TEXT.h).find((b) => local >= b.top - 1 && local < b.top + b.lines.length * pitch + OPTION_GAP);
    return block ? block.index : -1;
  }

  private reviewButtonAt(x: number, y: number): boolean {
    if (!this.art) return false;
    return inRect({ x: REVIEW_BUTTON.x, y: SCREEN_H - this.art.panel.height + REVIEW_BUTTON.y, w: REVIEW_BUTTON.w, h: REVIEW_BUTTON.h }, x, y);
  }

  private barterButtonAt(x: number, y: number): boolean {
    if (!this.art) return false;
    return inRect({ x: BARTER_BUTTON.x, y: SCREEN_H - this.art.panel.height + BARTER_BUTTON.y, w: BARTER_BUTTON.w, h: BARTER_BUTTON.h }, x, y);
  }

  /**
   * "Barter" in the middle of a conversation: trading instead of the reply panel, and after it — the same line and the same replies. If trading
   * isn't possible — an explanation under the line.
   */
  private async pressBarter(): Promise<void> {
    const act = this.onBarter;
    const art = this.art;
    if (!act || !art || this.barterPanel || this.review || !this.pending) return;
    this.sound?.play(CLICK);
    const saved = { options: this.options, blocks: this.blocks, first: this.firstOption };
    const notice = await act();
    if (!this.opened || !this.pending) return;
    this.options = saved.options;
    this.blocks = saved.blocks;
    this.firstOption = saved.first;
    this.hover = -1;
    this.replyLines = wrapText(art.font, this.reply, REPLY_TEXT.w);
    if (notice) this.replyLines = [...this.replyLines, '', ...wrapText(art.font, notice, REPLY_TEXT.w)];
    this.replyTop = 0;
    this.draw();
  }

  /** The top of the barter panel on screen. */
  private get barterTop(): number {
    return SCREEN_H - (this.art?.barter.height ?? 191);
  }

  private onMove(e: MouseEvent): void {
    if (!this.opened) return;
    const p = this.toScreen(e);
    if (this.barterPanel) {
      if (this.barterPanel.move(p.x, p.y, this.barterTop)) this.draw();
      return;
    }
    if (this.review) return this.setHover(-1);
    const option = this.optionAt(p.x, p.y);
    const overButton = this.reviewButtonAt(p.x, p.y) || (!!this.onBarter && this.barterButtonAt(p.x, p.y));
    this.setHover(option);
    if (overButton) this.canvas.style.cursor = 'pointer';
  }

  private onDown(e: MouseEvent): void {
    this.sound?.resume();
    if (!this.opened || e.button !== 0) return;
    const p = this.toScreen(e);
    if (this.barterPanel) {
      this.barterPanel.pointerDown(p.x, p.y, this.barterTop);
      this.draw();
      return;
    }
    if (this.reviewButtonAt(p.x, p.y)) {
      this.pressed = { review: true };
      this.draw();
      return;
    }
    if (this.review) return;
    if (this.onBarter && this.barterButtonAt(p.x, p.y)) {
      this.pressed = { barter: true };
      this.draw();
      return;
    }
    const option = this.optionAt(p.x, p.y);
    if (option >= 0) {
      this.pressed = { option };
      return;
    }
    // The upper half of the line window scrolls up, the lower — down.
    if (inRect(REPLY, p.x, p.y)) this.scrollReply(p.y < REPLY.y + REPLY.h / 2 ? -1 : 1);
  }

  private onUp(e: MouseEvent): void {
    if (this.barterPanel && this.opened && e.button === 0) {
      const p = this.toScreen(e);
      this.barterPanel.pointerUp(p.x, p.y, this.barterTop);
      this.draw();
      return;
    }
    const pressed = this.pressed;
    this.pressed = null;
    if (!pressed || !this.opened) return;
    const p = this.toScreen(e);
    if ('review' in pressed) {
      if (this.reviewButtonAt(p.x, p.y)) this.toggleReview();
      else this.draw();
      return;
    }
    if ('barter' in pressed) {
      this.draw();
      if (this.barterButtonAt(p.x, p.y)) void this.pressBarter();
      return;
    }
    if (!this.review && this.optionAt(p.x, p.y) === pressed.option) this.finish(pressed.option, true);
  }

  private onWheel(e: WheelEvent): void {
    if (!this.opened) return;
    e.preventDefault();
    const direction = e.deltaY > 0 ? 1 : -1;
    const p = this.toScreen(e);
    if (this.barterPanel) {
      this.barterPanel.wheel(p.x, p.y, this.barterTop, direction);
      this.draw();
      return;
    }
    if (this.review) return this.scrollReview(direction);
    if (inRect(OPTIONS, p.x, p.y)) {
      this.hover = -1;
      this.firstOption = Math.max(0, Math.min(this.blocks.length - 1, this.firstOption + direction));
      this.draw();
    } else {
      this.scrollReply(direction);
    }
  }

  private scrollReply(delta: number): void {
    if (!this.art) return;
    const max = Math.max(0, this.replyLines.length - this.replyRows(this.art.font));
    const next = Math.max(0, Math.min(max, this.replyTop + delta));
    if (next === this.replyTop) return;
    this.replyTop = next;
    this.draw();
  }

  private scrollReview(delta: number): void {
    this.reviewTop = Math.max(0, this.reviewTop + delta);
    this.draw();
  }

  private toggleReview(): void {
    this.sound?.play(CLICK);
    this.review = !this.review;
    this.reviewTop = 1e9;
    this.setHover(-1);
    this.draw();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.opened) return;
    // While a conversation is going on, only the dialogue window hears the keys.
    e.stopPropagation();
    this.sound?.resume();
    const code = e.code;
    if (this.barterPanel) {
      if (this.barterPanel.key(code, e.shiftKey)) {
        e.preventDefault();
        this.draw();
      }
      return;
    }
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (code === 'Escape') {
      e.preventDefault();
      if (this.review) this.toggleReview();
      return;
    }
    if (code === 'KeyR' && !e.repeat) {
      e.preventDefault();
      this.toggleReview();
      return;
    }
    if (code === 'KeyB' && !e.repeat && !this.review) {
      e.preventDefault();
      void this.pressBarter();
      return;
    }
    if (this.review) {
      if (code === 'ArrowUp') this.scrollReview(-1);
      else if (code === 'ArrowDown') this.scrollReview(1);
      else if (code === 'PageUp') this.scrollReview(-8);
      else if (code === 'PageDown') this.scrollReview(8);
      else return;
      e.preventDefault();
      return;
    }
    if (digit && Number(digit[1]) <= this.options.length) {
      e.preventDefault();
      this.finish(Number(digit[1]) - 1, true);
    } else if (code === 'ArrowUp' || code === 'ArrowDown') {
      e.preventDefault();
      this.scrollReply(code === 'ArrowUp' ? -1 : 1);
    } else if (code === 'PageUp' || code === 'PageDown') {
      e.preventDefault();
      this.scrollReply(code === 'PageUp' ? -3 : 3);
    } else if (code === 'Tab') {
      e.preventDefault();
      if (this.options.length > 0) this.setHover(this.hover < 0 ? (e.shiftKey ? this.options.length - 1 : 0) : (this.hover + (e.shiftKey ? this.options.length - 1 : 1)) % this.options.length);
    } else if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && !e.repeat) {
      e.preventDefault();
      // A single option is the choice itself; otherwise — the highlighted one (none highlighted — highlight the first).
      if (this.options.length === 1) this.finish(0, true);
      else if (this.hover >= 0) this.finish(this.hover, true);
      else if (this.options.length > 0) this.setHover(0);
    }
  }
}
