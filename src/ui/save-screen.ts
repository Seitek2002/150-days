// Save and load screen: the LSGAME.FRM window from the player's Fallout copy, ten slots on the left, the selected one's caption on the right.
// Labels use the original font (`game/fonts.ts`). Works with mouse and keyboard: ↑↓ and digits select a slot, Enter — action, Esc — cancel.
// What exactly to save and how to load, the screen does not know: that is done by the save and load handlers (provided by the game).
import { GameAssets } from '../assets/sprites.ts';
import type { Sound } from '../audio/sound.ts';
import { fitText, type BitmapFont } from '../formats/font.ts';
import { parseLst } from '../formats/text.ts';
import { drawLabel, loadInterfaceFonts } from '../game/fonts.ts';
import { getLang, t } from '../i18n.ts';
import { platform, type SaveListEntry } from '../platform.ts';

export type SaveScreenMode = 'save' | 'load';

export interface SaveScreenOptions {
  /** Where to add the window (page root). */
  root: HTMLElement;
  mode: SaveScreenMode;
  /** Click sound (if absent — the screen is silent). */
  sound?: Sound;
  /** Write the game into a slot; true — done. Needed in 'save' mode. */
  save?(slot: string): Promise<boolean>;
  /** Load the game from a slot; true — done (the screen will close). Needed in 'load' mode. */
  load?(slot: string): Promise<boolean>;
}

/** Slots on screen — as in the original, ten of them (quick save F6/F7 lives separately). */
export const SAVE_SLOTS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

/** Image numbers in INTRFACE.LST: the window, the "cover" instead of a snapshot, red button released and pressed. */
const ART = { screen: 237, cover: 239, lampUp: 8, lampDown: 9 };
const CLICK = 'IB1P1XX1';

/** Window layout in pixels of a 640×480 screen (from the LSGAME.FRM image). */
const LIST = { x: 48, y: 51, w: 244, rowH: 39 };
const PREVIEW = { x: 366, y: 58, w: 224, h: 130 };
const INFO = { x: 395, y: 249, w: 170 };
const PLATES = {
  action: { x: 381, y: 347, w: 94, h: 20 },
  cancel: { x: 485, y: 347, w: 95, h: 20 },
};

const COLORS = {
  selected: '#ffe27a',
  normal: '#b9a95a',
  empty: '#7a7352',
  info: '#4fd65a',
  warn: '#ffb04a',
  plate: '#e0c878',
  plateOff: '#7a7352',
};

interface Art {
  screen: HTMLCanvasElement;
  cover: HTMLCanvasElement;
  lampUp: HTMLCanvasElement;
  lampDown: HTMLCanvasElement;
  font: BitmapFont;
}

let artPromise: Promise<Art> | null = null;

function loadArt(): Promise<Art> {
  if (!artPromise) {
    artPromise = (async () => {
      const [assets, list, fonts] = await Promise.all([
        GameAssets.load(),
        platform.readGameFile('ART\\INTRFACE\\INTRFACE.LST').then(parseLst),
        loadInterfaceFonts(),
      ]);
      const image = (index: number) => {
        const file = list[index];
        if (!file) throw new Error('No interface image ' + index);
        return assets.image('ART\\INTRFACE\\' + file);
      };
      const [screen, cover, lampUp, lampDown] = await Promise.all([image(ART.screen), image(ART.cover), image(ART.lampUp), image(ART.lampDown)]);
      return { screen, cover, lampUp, lampDown, font: fonts.main };
    })();
    // Did not work — try again next time.
    artPromise.catch(() => (artPromise = null));
  }
  return artPromise;
}

const STYLE_ID = 'save-screen-style';
const STYLE = `
.sv-host { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(11, 10, 8, 0.82); cursor: default; }
.sv-stage { width: min(100vw, calc(100vh * 4 / 3)); aspect-ratio: 4 / 3; }
.sv-canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
.sv-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.append(style);
}

const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Save date and time for the caption ("20.10.2026, 04:45"); an unrecognised string — as is. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Opens the screen. The promise resolves when the screen is closed: true — something was saved or loaded, false — cancelled.
 * While the screen is open, only it hears the keys (intercepted before the other handlers).
 */
export async function openSaveScreen(options: SaveScreenOptions): Promise<boolean> {
  ensureStyle();
  const [art, list] = await Promise.all([loadArt(), platform.listSaves().catch((): SaveListEntry[] => [])]);
  const entries = new Map<string, SaveListEntry>();
  for (const entry of list) if (SAVE_SLOTS.includes(entry.slot)) entries.set(entry.slot, entry);

  const isSave = options.mode === 'save';
  // Choose smartly: when saving — the first empty slot, when loading — the newest save (the list is already sorted by date, descending).
  let selected = isSave
    ? Math.max(0, SAVE_SLOTS.findIndex((s) => !entries.has(s)))
    : Math.max(0, SAVE_SLOTS.indexOf(list.find((e) => SAVE_SLOTS.includes(e.slot))?.slot ?? '1'));
  let message = '';
  let warn = false;
  let confirming = false;
  let busy = false;
  let pressed: 'action' | 'cancel' | null = null;

  const host = document.createElement('div');
  host.className = 'sv-host';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-label', t(isSave ? 'saveTitle' : 'loadTitle'));
  const stage = document.createElement('div');
  stage.className = 'sv-stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'sv-canvas';
  canvas.width = 640;
  canvas.height = 480;
  stage.append(canvas);
  const live = document.createElement('div');
  live.className = 'sv-live';
  live.setAttribute('aria-live', 'polite');
  host.append(stage, live);
  options.root.append(host);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const slotText = (slot: string) => {
    const entry = entries.get(slot);
    return entry ? `${slot}. ${entry.label}` : `${slot}. ${t('saveEmpty')}`;
  };

  /** A string in the original font, cut to width (characters missing from the font are replaced by `fitText`). */
  const write = (text: string, x: number, y: number, color: string, maxWidth: number) => {
    drawLabel(ctx, art.font, fitText(art.font, text, maxWidth), x, y, color);
  };

  const draw = () => {
    ctx.clearRect(0, 0, 640, 480);
    ctx.drawImage(art.screen, 0, 0);
    // A cover instead of a screenshot: saves have no snapshots.
    ctx.drawImage(art.cover, 0, 0, art.cover.width, art.cover.height, PREVIEW.x, PREVIEW.y, PREVIEW.w, PREVIEW.h);
    // Slots.
    SAVE_SLOTS.forEach((slot, i) => {
      const y = LIST.y + i * LIST.rowH;
      const entry = entries.get(slot);
      if (i === selected) {
        ctx.fillStyle = 'rgba(190, 170, 60, 0.2)';
        ctx.fillRect(LIST.x, y, LIST.w, LIST.rowH - 2);
        ctx.strokeStyle = '#8a7d2a';
        ctx.lineWidth = 1;
        ctx.strokeRect(LIST.x + 0.5, y + 0.5, LIST.w - 1, LIST.rowH - 3);
      }
      const color = i === selected ? COLORS.selected : entry ? COLORS.normal : COLORS.empty;
      write(slotText(slot), LIST.x + 6, y + 7, color, LIST.w - 12);
      if (entry) write(formatDate(entry.savedAt), LIST.x + 20, y + 22, i === selected ? COLORS.normal : COLORS.empty, LIST.w - 26);
    });
    // Caption of the selected slot on the right.
    const entry = entries.get(SAVE_SLOTS[selected]!);
    // The "Map · day N" caption is split into two lines to fit the box; below — the date and message.
    const parts = entry ? entry.label.split(' · ') : [];
    write(entry ? (parts[0] ?? entry.label) : t('saveEmpty'), INFO.x, INFO.y, COLORS.info, INFO.w);
    if (entry) {
      if (parts.length > 1) write(parts.slice(1).join(' - '), INFO.x, INFO.y + 13, COLORS.info, INFO.w);
      write(formatDate(entry.savedAt), INFO.x, INFO.y + 26, COLORS.info, INFO.w);
    }
    if (message) write(message, INFO.x, INFO.y + 39, warn ? COLORS.warn : COLORS.info, INFO.w);
    // Buttons: a red lamp to the left of the label.
    const canAct = !busy && (isSave || !!entry);
    const plate = (key: 'action' | 'cancel', label: string, enabled: boolean) => {
      const rect = PLATES[key];
      ctx.drawImage(pressed === key && enabled ? art.lampDown : art.lampUp, rect.x + 4, rect.y + 2);
      write(label, rect.x + 24, rect.y + 5, enabled ? COLORS.plate : COLORS.plateOff, rect.w - 28);
    };
    plate('action', t(isSave ? 'saveDo' : 'loadDo'), canAct);
    plate('cancel', t('saveCancel'), !busy);
  };

  const say = (text: string, isWarning = false) => {
    message = text;
    warn = isWarning;
    live.textContent = text;
  };

  return new Promise<boolean>((resolve) => {
    let finished = false;
    const finish = (result: boolean) => {
      if (finished) return;
      finished = true;
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mouseup', onUp);
      host.remove();
      resolve(result);
    };

    const select = (index: number) => {
      const next = Math.max(0, Math.min(SAVE_SLOTS.length - 1, index));
      if (next !== selected) options.sound?.play(CLICK);
      selected = next;
      confirming = false;
      say('');
      const entry = entries.get(SAVE_SLOTS[selected]!);
      live.textContent = entry ? `${slotText(SAVE_SLOTS[selected]!)}, ${formatDate(entry.savedAt)}` : slotText(SAVE_SLOTS[selected]!);
      draw();
    };

    const act = async () => {
      if (busy) return;
      const slot = SAVE_SLOTS[selected]!;
      const entry = entries.get(slot);
      if (isSave) {
        if (entry && !confirming) {
          confirming = true;
          say(t('saveOverwrite'), true);
          draw();
          return;
        }
        busy = true;
        say(t('saveSaving'));
        draw();
        const ok = await (options.save?.(slot) ?? Promise.resolve(false)).catch(() => false);
        busy = false;
        if (ok) finish(true);
        else {
          confirming = false;
          say(t('msgSaveFailed'), true);
          draw();
        }
        return;
      }
      if (!entry) {
        say(t('saveNothing'), true);
        draw();
        return;
      }
      busy = true;
      say(t('saveLoading'));
      draw();
      const ok = await (options.load?.(slot) ?? Promise.resolve(false)).catch(() => false);
      busy = false;
      if (ok) finish(true);
      else {
        say(t('msgLoadFailed'), true);
        draw();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      // The game, the pause and the menu under us do not need the keys.
      e.stopPropagation();
      options.sound?.resume();
      if (busy) {
        e.preventDefault();
        return;
      }
      const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
      if (e.code === 'Escape' || e.code === 'F10') {
        e.preventDefault();
        if (!e.repeat) finish(false);
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        select(selected - 1);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        select(selected + 1);
      } else if (e.code === 'Home' || e.code === 'PageUp') {
        e.preventDefault();
        select(0);
      } else if (e.code === 'End' || e.code === 'PageDown') {
        e.preventDefault();
        select(SAVE_SLOTS.length - 1);
      } else if (digit) {
        e.preventDefault();
        // Digit 0 — the tenth slot.
        select(digit[1] === '0' ? 9 : Number(digit[1]) - 1);
      } else if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') && !e.repeat) {
        e.preventDefault();
        options.sound?.play(CLICK);
        void act();
      } else if (e.code === 'Tab' || e.code.startsWith('F')) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey, true);

    /** Mouse coordinates in pixels of the 640×480 window (the screen may be stretched). */
    const toWindow = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: ((e.clientX - rect.left) * 640) / rect.width, y: ((e.clientY - rect.top) * 480) / rect.height };
    };
    let lastClick = { index: -1, time: 0 };
    canvas.addEventListener('mousedown', (e) => {
      options.sound?.resume();
      if (busy || e.button !== 0) return;
      const p = toWindow(e);
      if (inRect({ x: LIST.x, y: LIST.y, w: LIST.w, h: LIST.rowH * SAVE_SLOTS.length }, p.x, p.y)) {
        const index = Math.floor((p.y - LIST.y) / LIST.rowH);
        const again = lastClick.index === index && performance.now() - lastClick.time < 450;
        lastClick = { index, time: performance.now() };
        select(index);
        // Double-click on a slot — the same as the action button.
        if (again) void act();
      } else if (inRect(PLATES.action, p.x, p.y)) {
        pressed = 'action';
        draw();
      } else if (inRect(PLATES.cancel, p.x, p.y)) {
        pressed = 'cancel';
        draw();
      }
    });
    const onUp = (e: MouseEvent) => {
      if (!pressed || finished) return;
      const was = pressed;
      pressed = null;
      const p = toWindow(e);
      draw();
      if (busy || !inRect(PLATES[was], p.x, p.y)) return;
      options.sound?.play(CLICK);
      if (was === 'cancel') finish(false);
      else void act();
    };
    window.addEventListener('mouseup', onUp);

    draw();
    say('');
    const entry = entries.get(SAVE_SLOTS[selected]!);
    live.textContent = `${t(isSave ? 'saveTitle' : 'loadTitle')}. ${slotText(SAVE_SLOTS[selected]!)}${entry ? ', ' + formatDate(entry.savedAt) : ''}`;
  });
}
