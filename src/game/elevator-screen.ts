// The elevator window from images in the player's copy of Fallout (ART\INTRFACE): a panel with floor buttons and a pointer arrow.
// Layout as in the original: the window is centred above the interface bar, buttons 13 pixels from the left, every 60 pixels
// top to bottom starting at 40, the arrow in the small window on the right. The buttons are real page buttons: mouse, Tab and Enter work.
import type { GameData } from '../assets/gamedata.ts';
import { t, tf } from '../i18n.ts';

/** Image numbers in INTRFACE.LST: vault elevator panel (default), button pressed, button released, arrow. */
export const DEFAULT_ELEVATOR_ART = 148;
const ART = { buttonDown: 141, buttonUp: 142, gauge: 149 };

/** The original's layout in window pixels: the first button, the step between buttons, the arrow's place. */
const LAYOUT = { buttonX: 13, buttonY: 40, buttonStep: 60, gaugeX: 121, gaugeY: 41, gaugeWidth: 92, gaugeFrames: 13 };

interface ElevatorArt {
  background: HTMLCanvasElement;
  buttonUp: HTMLCanvasElement;
  buttonDown: HTMLCanvasElement;
  gauge: HTMLCanvasElement;
}

/** An elevator as the window sees it: how many floors and which one we're on. */
export interface ElevatorView {
  floors: readonly unknown[];
  current: number;
  /** Panel image number in INTRFACE.LST (default 148 — the vault elevator). */
  art?: number;
}

export interface ElevatorHandlers {
  /** A floor button was pressed (zero-based index). */
  onChoose(index: number): void;
  /** The window was closed (Esc): the caller hides the window and returns to the game. */
  onClose(): void;
}

const STYLE_ID = 'elevator-screen-style';

/** Sizes as fractions of the 640×480 game screen (cqw — a fraction of the width), so the window grows with the game and keeps 4:3. */
const STYLE = `
.elevator { position: fixed; inset: 0; z-index: 8; display: grid; place-items: center; background: rgba(11, 10, 8, 0.6); cursor: default; }
.elevator[hidden] { display: none; }
.el-stage { position: relative; width: min(100vw, calc(100vh * 4 / 3)); aspect-ratio: 4 / 3; container-type: inline-size; }
.el-panel { position: absolute; }
.el-bg, .el-gauge { position: absolute; image-rendering: pixelated; }
.el-bg { inset: 0; width: 100%; height: 100%; }
.el-button {
  position: absolute;
  padding: 0;
  border: 0;
  background: var(--btn-up) center / 100% 100% no-repeat;
  image-rendering: pixelated;
  cursor: pointer;
}
.el-button:active:not(:disabled), .el-button[aria-current='true'] { background-image: var(--btn-down); }
.el-button:disabled { cursor: default; }
.el-button:focus-visible { outline: 0.5cqw solid var(--focus); outline-offset: 0.3cqw; border-radius: 50%; }
.el-hint {
  position: absolute;
  left: 0;
  right: 0;
  margin: 0;
  text-align: center;
  font-size: 3.1cqw;
  line-height: 1.2;
  color: var(--muted);
  text-shadow: 0 1px 0 #000;
}
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.append(style);
}

const artCache = new Map<number, Promise<ElevatorArt>>();

function loadArt(data: GameData, background: number): Promise<ElevatorArt> {
  let pending = artCache.get(background);
  if (!pending) {
    pending = Promise.all([
      data.interfaceImage(background),
      data.interfaceImage(ART.buttonUp),
      data.interfaceImage(ART.buttonDown),
      data.interfaceImage(ART.gauge),
    ]).then(([bg, buttonUp, buttonDown, gauge]) => ({ background: bg, buttonUp, buttonDown, gauge }));
    artCache.set(background, pending);
    // Failed — try again next time.
    pending.catch(() => artCache.delete(background));
  }
  return pending;
}

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

/** Arrow frame for a floor: 13 frames for the elevator's full travel. */
const gaugeFrame = (index: number, count: number) => Math.round((index * (LAYOUT.gaugeFrames - 1)) / Math.max(1, count - 1));

export class ElevatorScreen {
  private readonly host: HTMLElement;
  private readonly data: GameData;
  private gauge: { canvas: HTMLCanvasElement; art: HTMLCanvasElement; count: number } | null = null;
  private opening = 0;

  constructor(host: HTMLElement, data: GameData) {
    this.host = host;
    this.data = data;
  }

  /**
   * Shows the window. viewHeight — height of the game part of the screen above the interface bar (the window is centred in it).
   * If the window was already closed (close) while the images were loading, shows nothing.
   */
  async open(view: ElevatorView, viewHeight: number, handlers: ElevatorHandlers): Promise<void> {
    ensureStyle();
    const ticket = ++this.opening;
    const art = await loadArt(this.data, view.art ?? DEFAULT_ELEVATOR_ART);
    if (ticket !== this.opening) return;

    const panelW = art.background.width;
    const panelH = art.background.height;
    const x = Math.floor((640 - panelW) / 2);
    const y = Math.floor((viewHeight - panelH) / 2);
    const count = view.floors.length;

    const stage = document.createElement('div');
    stage.className = 'el-stage';
    stage.style.setProperty('--btn-up', `url(${art.buttonUp.toDataURL()})`);
    stage.style.setProperty('--btn-down', `url(${art.buttonDown.toDataURL()})`);
    const panel = document.createElement('div');
    panel.className = 'el-panel';
    panel.style.left = pct(x, 640);
    panel.style.top = pct(y, 480);
    panel.style.width = pct(panelW, 640);
    panel.style.height = pct(panelH, 480);
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', t('elevatorTitle'));
    // We don't touch the cached images: we draw copies of them.
    const background = document.createElement('canvas');
    background.className = 'el-bg';
    background.width = panelW;
    background.height = panelH;
    background.setAttribute('aria-hidden', 'true');
    background.getContext('2d')!.drawImage(art.background, 0, 0);
    panel.append(background);

    for (let i = 0; i < count; i++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'el-button';
      button.style.left = pct(LAYOUT.buttonX, panelW);
      button.style.top = pct(LAYOUT.buttonY + i * LAYOUT.buttonStep, panelH);
      button.style.width = pct(art.buttonUp.width, panelW);
      button.style.height = pct(art.buttonUp.height, panelH);
      const label = tf('elevatorFloor', { n: i + 1 }) + (i === view.current ? ` — ${t('elevatorHere')}` : '');
      button.setAttribute('aria-label', label);
      button.title = label;
      if (i === view.current) {
        button.setAttribute('aria-current', 'true');
        button.disabled = true;
      }
      button.addEventListener('click', () => handlers.onChoose(i));
      panel.append(button);
    }

    // The pointer arrow: a strip of 13 frames, we show the frame of the right floor.
    const frameH = art.gauge.height / LAYOUT.gaugeFrames;
    const gaugeCanvas = document.createElement('canvas');
    gaugeCanvas.className = 'el-gauge';
    gaugeCanvas.width = art.gauge.width;
    gaugeCanvas.height = frameH;
    gaugeCanvas.style.left = pct(LAYOUT.gaugeX, panelW);
    gaugeCanvas.style.top = pct(LAYOUT.gaugeY, panelH);
    gaugeCanvas.style.width = pct(art.gauge.width, panelW);
    gaugeCanvas.style.height = pct(frameH, panelH);
    gaugeCanvas.setAttribute('aria-hidden', 'true');
    panel.append(gaugeCanvas);
    this.gauge = { canvas: gaugeCanvas, art: art.gauge, count };
    this.showFrame(gaugeFrame(view.current, count));

    const hint = document.createElement('p');
    hint.className = 'el-hint';
    hint.style.top = pct(y + panelH + 6, 480);
    hint.textContent = t('elevatorHint');
    stage.append(panel, hint);
    this.host.replaceChildren(stage);
    this.host.hidden = false;

    this.host.onkeydown = (e) => {
      // Arrows and Tab move between buttons; the game listens to Esc and digits.
      if (e.code !== 'Tab' && e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return;
      e.preventDefault();
      const buttons = [...this.host.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (buttons.length === 0) return;
      const back = e.code === 'ArrowUp' || (e.code === 'Tab' && e.shiftKey);
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(at + (back ? -1 : 1) + buttons.length) % buttons.length]!.focus();
    };
    this.host.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  /** Riding: the arrow moves smoothly from floor to floor while the new map is being prepared. */
  ride(from: number, to: number): Promise<void> {
    const gauge = this.gauge;
    if (!gauge) return Promise.resolve();
    const start = gaugeFrame(from, gauge.count);
    const end = gaugeFrame(to, gauge.count);
    const steps = Math.abs(end - start);
    if (steps === 0) return Promise.resolve();
    return new Promise((resolve) => {
      let step = 0;
      const timer = window.setInterval(() => {
        step++;
        this.showFrame(start + Math.sign(end - start) * step);
        if (step >= steps) {
          window.clearInterval(timer);
          resolve();
        }
      }, 70);
    });
  }

  close(): void {
    this.opening++;
    this.host.hidden = true;
    this.host.onkeydown = null;
    this.host.replaceChildren();
    this.gauge = null;
  }

  private showFrame(frame: number): void {
    const gauge = this.gauge;
    if (!gauge) return;
    const ctx = gauge.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, gauge.canvas.width, gauge.canvas.height);
    ctx.drawImage(gauge.art, 0, frame * gauge.canvas.height, gauge.canvas.width, gauge.canvas.height, 0, 0, gauge.canvas.width, gauge.canvas.height);
  }
}

const screens = new WeakMap<HTMLElement, ElevatorScreen>();

/** One elevator window per page: its markup lives in `host`. */
export function elevatorScreen(host: HTMLElement, data: GameData): ElevatorScreen {
  let screen = screens.get(host);
  if (!screen) {
    screen = new ElevatorScreen(host, data);
    screens.set(host, screen);
  }
  return screen;
}
