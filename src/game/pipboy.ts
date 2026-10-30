// Pip-Boy (P): the PIP.FRM window from the player's copy of Fallout. On the left, the date and time in the original's digits and the note "Find the water chip"
// with the number of days left; on the screen on the right, where the hero is, the date and time, the game day, the water supply, and below that quests by location
// (`quests.ts`; if they do not fit, the mouse wheel and arrows; the "Status" button returns here from the alarm clock and the archives).
// "Archives" is a vault dweller's handbook whose section about life on the surface is empty: there is no tutorial in the game because
// nobody has ever been outside (the client's idea, 2026-10-24). Labels use the original fonts (`fonts.ts`).
// The alarm clock button next to the time opens resting: ten minutes, hours, until morning, until noon… The time runs on screen,
// as in the original, and wounds heal by themselves (session.naturalHealing counts the game time that passed).
// Mouse and keyboard: A (or Enter) opens the alarm clock; in it the arrows choose a line, Enter rests, ← or A goes back; hovering the mouse highlights a line.
// The buttons sound as in the original; at the end of resting, a bell. While the window is open the game is paused; P or Esc closes it, as does the "Close" button on the image itself.
import type { GameData } from '../assets/gamedata.ts';
import { fitText, lineHeight, type BitmapFont } from '../formats/font.ts';
import { parseMsg } from '../formats/text.ts';
import { t, tf } from '../i18n.ts';
import { platform } from '../platform.ts';
import type { Clock } from './clock.ts';
import { drawLabel, loadInterfaceFonts, wrapText } from './fonts.ts';
import type { QuestGroup } from './quests.ts';

/**
 * Image numbers in INTRFACE.LST: the window, the note, month names, note digits, date digits, red button (up, down),
 * alarm clock button (up, down).
 */
const ART = { window: 127, note: 128, months: 129, noteDigits: 130, digits: 82, lampUp: 8, lampDown: 9, alarmUp: 132, alarmDown: 131 };

/** The original layout in pixels of the 640×480 window. */
const LAYOUT = {
  day: { x: 20, y: 17 },
  month: { x: 46, y: 18 },
  year: { x: 83, y: 17 },
  time: { x: 155, y: 17 },
  note: { x: 32, y: 83 },
  /** Digits of the days left on the note: ones on the right, then leftward 12 pixels apart, each a little lower than the previous. */
  noteDigits: { x: 92, y: 180 },
  /** Red buttons on the left: 27 pixels apart; the second button has no lamp. */
  lamps: { x: 53, y: 341, step: 27 },
  /** The screen on the right where the Pip-Boy writes. */
  screen: { x: 270, y: 62, w: 340 },
  /** Alarm clock: the button next to the time and the rest option lines on the screen. */
  alarm: { x: 124, y: 13 },
  rows: { top: 150, step: 22 },
  /** The "where you are / date / game day" lines: label on the left, value indented by `value`. */
  info: { top: 96, step: 13, value: 80 },
  /** Quest list: from `top` to `bottom`; quests indented under the location name; space on the right for scroll arrows. */
  quests: { top: 184, bottom: 434, indent: 10, gutter: 12 },
};
/** The "Status" and "Close" buttons: the first and last red buttons together with their label (it is drawn on the image itself). */
const STATUS = { x: 48, y: 336, w: 120, h: 24 };
/** "Archives" is the fourth red button. */
const ARCHIVE = { x: 48, y: 417, w: 120, h: 24 };
const CLOSE = { x: 48, y: 444, w: 120, h: 24 };
/** The alarm clock button: a 28×24 image. */
const ALARM = { x: LAYOUT.alarm.x, y: LAYOUT.alarm.y, w: 28, h: 24 };

const GREEN = '#4fd65a';
const DIM = '#2f9a39';
const BRIGHT = '#b8ffb8';
const WARN = '#ffb04a';
const ROW_SELECTED = 'rgba(79, 214, 90, 0.22)';
const ROW_CURSOR = 'rgba(79, 214, 90, 0.1)';

/** Button sounds are original files (SOUND\SFX): the red button and the middle one (alarm clock) press and release, "can't" is a refusal. */
const SOUND = { redPress: 'IB1P1XX1', redRelease: 'IB1LU1X1', medPress: 'IB2P1XX1', medRelease: 'IB2LU1X1', refuse: 'IISXXXX1' };

/** What is needed from sound (it can be `Sound`): play a file by name. */
export interface PipSound {
  play(name: string): void;
}

// ---------- resting ----------

/** A rest option: for how many minutes, until what hour, or until healed. */
export type RestChoice = { kind: 'minutes'; minutes: number } | { kind: 'until'; hour: number } | { kind: 'healed' };

/** The options in order, as in the original's alarm clock. */
export const REST_CHOICES: readonly RestChoice[] = [
  { kind: 'minutes', minutes: 10 },
  { kind: 'minutes', minutes: 30 },
  ...[1, 2, 3, 4, 5, 6].map((hours): RestChoice => ({ kind: 'minutes', minutes: hours * 60 })),
  { kind: 'until', hour: 6 },
  { kind: 'until', hour: 12 },
  { kind: 'until', hour: 18 },
  { kind: 'until', hour: 0 },
  { kind: 'healed' },
];

/** PIPBOY.MSG lines from the player's copy: "no quests", "can't rest", the title and "health"; the first rest option is the next one after them. */
const MSG = { noQuests: 203, noRest: 215, title: 300, health: 301, firstRow: 302 };

/** How many game seconds the rest lasts: until an hour as in the original (if it is already that time, wait a day), "until healed" by health. */
export function restSeconds(choice: RestChoice, now: { hour: number; minute: number }, secondsToHeal: number): number {
  switch (choice.kind) {
    case 'minutes':
      return choice.minutes * 60;
    case 'until': {
      const minutes = (choice.hour * 60 - (now.hour * 60 + now.minute) + 1440) % 1440;
      return (minutes === 0 ? 1440 : minutes) * 60;
    }
    default:
      return Math.max(0, Math.ceil(secondsToHeal));
  }
}

/** What to show: the game clock and the location name (in the game's language) and everything the alarm clock needs. */
export interface PipView {
  clock: Clock;
  place: string;
  /** Whether resting is allowed (no enemy nearby: `!hero.inCombat`); not set means allowed. */
  canRest?: boolean;
  /** Hero health for the alarm clock line; not set means no line. */
  health?: { hp: number; max: number };
  /** How many game seconds to rest until full health (`session.secondsToHeal()`); not set means no "until healed" option. */
  secondsToHeal?: () => number;
  /** Quests the player has already seen (`questGroups`); not set means no quests. */
  quests?: QuestGroup[];
}

/** How long a rest is shown on screen: the longer it is, the longer the clock runs, but no less than half a second and no more than a second and a half. */
const REST_SCREEN_SECONDS = { min: 0.5, max: 1.5, perHour: 0.06 };

/**
 * Rest progress: which option is chosen, how much game time is left and how fast it runs on screen.
 * It draws nothing and knows nothing about the window: `step` says how many game seconds to add to the clock this frame.
 */
export class AlarmClock {
  /** Index of the chosen option among the shown ones; −1 means no rest. */
  chosen = -1;
  /** The line under the options: for example "can't rest"; empty means nothing. */
  notice = '';
  private left = 0;
  private rate = 0;

  get busy(): boolean {
    return this.left > 0;
  }

  /** The options we show: "until healed" only if the game can compute the time until it. */
  choices(view: PipView): RestChoice[] {
    return REST_CHOICES.filter((c) => c.kind !== 'healed' || view.secondsToHeal !== undefined);
  }

  /**
   * Start resting by index among the shown options. noRest is the refusal text (an enemy nearby).
   * Returns whether it started: not if the choice is invalid, a rest is in progress, resting is not allowed or there is nothing to rest for (already healthy).
   */
  start(index: number, view: PipView, noRest: string): boolean {
    const choice = this.choices(view)[index];
    if (!choice || this.busy) return false;
    if (view.canRest === false) {
      this.notice = noRest;
      return false;
    }
    this.notice = '';
    const seconds = restSeconds(choice, view.clock.date, view.secondsToHeal?.() ?? 0);
    if (seconds <= 0) return false;
    const hours = seconds / 3600;
    const real = Math.min(REST_SCREEN_SECONDS.max, Math.max(REST_SCREEN_SECONDS.min, REST_SCREEN_SECONDS.min + hours * REST_SCREEN_SECONDS.perHour));
    this.chosen = index;
    this.left = seconds;
    this.rate = seconds / real;
    return true;
  }

  /** `dt` real seconds have passed: how many game seconds to add to the clock (at the end of the rest the choice is cleared). */
  step(dt: number): number {
    if (!this.busy) return 0;
    const add = Math.min(this.left, this.rate * Math.max(0, dt));
    this.left -= add;
    if (this.left < 1e-6) {
      this.left = 0;
      this.chosen = -1;
    }
    return add;
  }

  /** The window was closed or the alarm clock was left: the rest stops where it was, messages are cleared. */
  reset(): void {
    this.chosen = -1;
    this.left = 0;
    this.notice = '';
  }
}

interface PipArt {
  window: HTMLCanvasElement;
  note: HTMLCanvasElement;
  months: HTMLCanvasElement;
  noteDigits: HTMLCanvasElement;
  digits: HTMLCanvasElement;
  lampDown: HTMLCanvasElement;
  alarmUp: HTMLCanvasElement;
  alarmDown: HTMLCanvasElement;
  /** The small font for labels, the large one for the title and values. */
  small: BitmapFont;
  large: BitmapFont;
  /** PIPBOY.MSG texts from the player's copy (line number → text); not found means empty, and ours are used (i18n). */
  messages: Map<number, string>;
}

export async function loadPipBoy(data: GameData, sound?: PipSound): Promise<PipBoy> {
  const [window, note, months, noteDigits, digits, lampDown, alarmUp, alarmDown, fonts, messages] = await Promise.all([
    data.interfaceImage(ART.window),
    data.interfaceImage(ART.note),
    data.interfaceImage(ART.months),
    data.interfaceImage(ART.noteDigits),
    data.interfaceImage(ART.digits),
    data.interfaceImage(ART.lampDown),
    data.interfaceImage(ART.alarmUp),
    data.interfaceImage(ART.alarmDown),
    loadInterfaceFonts(),
    platform
      .readGameFile('TEXT\\ENGLISH\\GAME\\PIPBOY.MSG')
      .then(parseMsg)
      .catch(() => new Map<number, string>()),
  ]);
  return new PipBoy({ window, note, months, noteDigits, digits, lampDown, alarmUp, alarmDown, small: fonts.main, large: fonts.big, messages }, sound);
}

const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Scroll arrow: a triangle 8 wide and 6 pixels high, pointing up or down; `y` is the top edge. */
function arrow(ctx: CanvasRenderingContext2D, cx: number, y: number, up: boolean): void {
  ctx.beginPath();
  if (up) {
    ctx.moveTo(cx, y);
    ctx.lineTo(cx + 4, y + 6);
    ctx.lineTo(cx - 4, y + 6);
  } else {
    ctx.moveTo(cx - 4, y);
    ctx.lineTo(cx + 4, y);
    ctx.lineTo(cx, y + 6);
  }
  ctx.closePath();
  ctx.fill();
}

export class PipBoy {
  private opened = false;
  private pressed = false;
  private statusPressed = false;
  private archivePressed = false;
  /** The archives (handbook) are shown instead of the quest screen. */
  private archiveOpen = false;
  private alarmPressed = false;
  /** Quest list: the first shown line, how many lines can be scrolled and how many fit (as of the last frame). */
  private scroll = 0;
  private maxScroll = 0;
  private pageRows = 1;
  /** Whether the alarm clock is shown instead of the normal screen. */
  private alarmOpen = false;
  /** The alarm clock line where the mouse button was pressed (−1 means none). */
  private rowPressed = -1;
  private readonly alarm = new AlarmClock();
  /** The last thing drawn: mouse clicks need the clock and everything else too. */
  private view: PipView | null = null;
  /** The alarm clock line under the cursor: under the mouse or chosen with the arrows. */
  private cursor = 0;
  private lastDraw = 0;
  private readonly art: PipArt;
  private readonly sound: PipSound | undefined;

  constructor(art: PipArt, sound?: PipSound) {
    this.art = art;
    this.sound = sound;
  }

  get open(): boolean {
    return this.opened;
  }

  /** Whether the alarm clock is shown (for tests). */
  get alarmShown(): boolean {
    return this.alarmOpen;
  }

  /** Whether the archives are shown (for tests). */
  get archiveShown(): boolean {
    return this.archiveOpen;
  }

  show(): void {
    this.opened = true;
    this.pressed = false;
    this.statusPressed = false;
    this.archivePressed = false;
    this.archiveOpen = false;
    this.scroll = 0;
    this.alarmPressed = false;
    this.alarmOpen = false;
    this.rowPressed = -1;
    this.cursor = 0;
    this.alarm.reset();
    this.lastDraw = 0;
  }

  hide(): void {
    this.opened = false;
    this.pressed = false;
    this.statusPressed = false;
    this.archivePressed = false;
    this.archiveOpen = false;
    this.alarmPressed = false;
    this.alarmOpen = false;
    this.rowPressed = -1;
    this.alarm.reset();
  }

  pointerDown(x: number, y: number): void {
    this.pressed = inRect(CLOSE, x, y);
    this.statusPressed = inRect(STATUS, x, y);
    this.archivePressed = inRect(ARCHIVE, x, y);
    this.alarmPressed = inRect(ALARM, x, y);
    this.rowPressed = this.alarmOpen ? this.rowAt(x, y) : -1;
    if (this.rowPressed >= 0) this.cursor = this.rowPressed;
    if (this.pressed || this.statusPressed || this.archivePressed) this.sound?.play(SOUND.redPress);
    else if (this.alarmPressed) this.sound?.play(SOUND.medPress);
  }

  /** The mouse moves: in the alarm clock the line under it is highlighted (outside the list the highlight stays on the last one). */
  pointerMove(x: number, y: number): void {
    if (!this.opened || !this.alarmOpen) return;
    const row = this.rowAt(x, y);
    if (row >= 0) this.cursor = row;
  }

  /** The mouse button was released; true means "Close" was pressed and the window should close. */
  pointerUp(x: number, y: number): boolean {
    const wasClose = this.pressed;
    const wasStatus = this.statusPressed;
    const wasArchive = this.archivePressed;
    const wasAlarm = this.alarmPressed;
    const wasRow = this.rowPressed;
    this.pressed = false;
    this.statusPressed = false;
    this.archivePressed = false;
    this.alarmPressed = false;
    this.rowPressed = -1;
    if (wasStatus) {
      // "Status" is the quest screen: it returns here from the alarm clock and the archives (not during a rest).
      this.sound?.play(SOUND.redRelease);
      if (inRect(STATUS, x, y)) {
        this.archiveOpen = false;
        if (this.alarmOpen && !this.alarm.busy) this.toggleAlarm();
      }
      return false;
    }
    if (wasArchive) {
      // "Archives" is the handbook (during a rest we do not leave the alarm clock).
      this.sound?.play(SOUND.redRelease);
      if (inRect(ARCHIVE, x, y) && !this.alarm.busy) {
        this.alarmOpen = false;
        this.archiveOpen = true;
      }
      return false;
    }
    if (wasAlarm && inRect(ALARM, x, y)) {
      // The alarm clock is toggled by this same button; during a rest it is left alone.
      this.sound?.play(SOUND.medRelease);
      this.toggleAlarm();
      return false;
    }
    if (wasRow >= 0 && wasRow === this.rowAt(x, y)) this.begin(wasRow);
    const closed = wasClose && inRect(CLOSE, x, y);
    if (wasClose) this.sound?.play(SOUND.redRelease);
    return closed;
  }

  /** Toggle the alarm clock (not allowed during a rest). */
  private toggleAlarm(): void {
    if (this.alarm.busy) return;
    this.archiveOpen = false;
    this.alarmOpen = !this.alarmOpen;
    this.alarm.notice = '';
    this.cursor = 0;
  }

  /** Start resting from a line (mouse or Enter): a press sound, or a refusal if not allowed. */
  private begin(index: number): void {
    if (!this.view || this.alarm.busy) return;
    if (this.alarm.start(index, this.view, this.text(MSG.noRest, 'pipNoRest'))) this.sound?.play(SOUND.redPress);
    else if (this.alarm.notice) this.sound?.play(SOUND.refuse);
  }

  /** Scroll the quest list by `rows` lines (positive is down), no farther than its edges. */
  scrollBy(rows: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll + rows));
  }

  /** Mouse wheel: the quest list three lines at a time (the alarm clock does not need the wheel). */
  wheel(deltaY: number): void {
    if (this.opened && !this.alarmOpen && deltaY !== 0) this.scrollBy(Math.sign(deltaY) * 3);
  }

  /**
   * A key in the window (except P and Esc, the game listens to those). Returns whether the window needs it: then the game should not get it.
   * Normal screen: A or Enter opens the alarm clock; ↑ ↓, PageUp, PageDown, Home and End scroll the quests.
   * Alarm clock: ↑ and ↓ (wrapping), Home and End choose a line, Enter or space rests, ← or A goes back.
   */
  key(code: string): boolean {
    if (!this.opened) return false;
    if (this.archiveOpen && (code === 'ArrowLeft' || code === 'Backspace')) {
      this.sound?.play(SOUND.redPress);
      this.archiveOpen = false;
      return true;
    }
    if (!this.alarmOpen) {
      switch (code) {
        case 'ArrowUp':
          this.scrollBy(-1);
          return true;
        case 'ArrowDown':
          this.scrollBy(1);
          return true;
        case 'PageUp':
          this.scrollBy(-this.pageRows);
          return true;
        case 'PageDown':
          this.scrollBy(this.pageRows);
          return true;
        case 'Home':
          this.scroll = 0;
          return true;
        case 'End':
          this.scroll = this.maxScroll;
          return true;
        case 'KeyA':
        case 'Enter':
          this.sound?.play(SOUND.medPress);
          this.toggleAlarm();
          return true;
        default:
          return false;
      }
    }
    const count = this.view ? this.alarm.choices(this.view).length : 0;
    switch (code) {
      case 'ArrowUp':
        this.cursor = count > 0 ? (this.cursor - 1 + count) % count : 0;
        return true;
      case 'ArrowDown':
        this.cursor = count > 0 ? (this.cursor + 1) % count : 0;
        return true;
      case 'Home':
        this.cursor = 0;
        return true;
      case 'End':
        this.cursor = Math.max(0, count - 1);
        return true;
      case 'Enter':
      case 'Space':
        this.begin(this.cursor);
        return true;
      case 'ArrowLeft':
      case 'Backspace':
      case 'KeyA':
        this.sound?.play(SOUND.medPress);
        this.toggleAlarm();
        return true;
      default:
        return false;
    }
  }

  /** The alarm clock line under a point (index among the shown ones) or −1. */
  private rowAt(x: number, y: number): number {
    const { screen, rows } = LAYOUT;
    if (!this.view || x < screen.x || x >= screen.x + screen.w || y < rows.top) return -1;
    const index = Math.floor((y - rows.top) / rows.step);
    return index < this.alarm.choices(this.view).length ? index : -1;
  }

  /** A PIPBOY.MSG line from the player's copy (location and quest names); none means undefined. */
  message(id: number): string | undefined {
    return this.art.messages.get(id);
  }

  /** Text from PIPBOY.MSG in the player's copy, or ours if it is not there. */
  private text(id: number, fallbackKey: Parameters<typeof t>[0]): string {
    return this.art.messages.get(id) ?? t(fallbackKey);
  }

  /** A rest option label: in REST_CHOICES order (the PIPBOY.MSG lines follow one another). */
  private rowText(choice: RestChoice): string {
    const index = REST_CHOICES.indexOf(choice);
    return this.art.messages.get(MSG.firstRow + index) ?? t('pipRest').split('|')[index] ?? '';
  }

  /**
   * A frame without drawing: remember what we show and advance the rest. The clock runs on screen, the game time is real
   * (wounds heal, critters live by the new hour). At the end of the rest, a bell.
   */
  update(view: PipView): void {
    if (!this.opened) return;
    this.view = view;
    const now = performance.now();
    const dt = this.lastDraw > 0 ? Math.min(0.1, (now - this.lastDraw) / 1000) : 0;
    this.lastDraw = now;
    const wasBusy = this.alarm.busy;
    const add = this.alarm.step(dt);
    if (add > 0) view.clock.advance(add);
    if (wasBusy && !this.alarm.busy) this.sound?.play(SOUND.medRelease);
  }

  draw(ctx: CanvasRenderingContext2D, view: PipView): void {
    if (!this.opened) return;
    const { art } = this;
    this.update(view);

    ctx.drawImage(art.window, 0, 0);

    // Date and time in the original's digits in the top panel.
    const date = view.clock.date;
    this.digits(ctx, date.day, 2, LAYOUT.day.x, LAYOUT.day.y);
    ctx.drawImage(art.months, 0, 15 * (date.month - 1), art.months.width, 14, LAYOUT.month.x, LAYOUT.month.y, art.months.width, 14);
    this.digits(ctx, date.year, 4, LAYOUT.year.x, LAYOUT.year.y);
    this.digits(ctx, date.hour * 100 + date.minute, 4, LAYOUT.time.x, LAYOUT.time.y);
    // The alarm clock button: pressed in while it is held and while the alarm clock is open.
    ctx.drawImage(this.alarmPressed || this.alarmOpen ? art.alarmDown : art.alarmUp, LAYOUT.alarm.x, LAYOUT.alarm.y);

    // The note: how many days are left until the water runs out.
    ctx.drawImage(art.note, LAYOUT.note.x, LAYOUT.note.y);
    this.noteNumber(ctx, view.clock.daysLeft);

    // "Status" and "Close" pressed: the red button is pressed in.
    if (this.statusPressed) ctx.drawImage(art.lampDown, LAYOUT.lamps.x, LAYOUT.lamps.y);
    if (this.archivePressed) ctx.drawImage(art.lampDown, LAYOUT.lamps.x, LAYOUT.lamps.y + LAYOUT.lamps.step * 3);
    if (this.pressed) ctx.drawImage(art.lampDown, LAYOUT.lamps.x, LAYOUT.lamps.y + LAYOUT.lamps.step * 4);

    if (this.alarmOpen) this.alarmScreen(ctx, view);
    else if (this.archiveOpen) this.archiveScreen(ctx);
    else this.screen(ctx, view);
  }

  /** A number of `count` digits (with leading zeros) from the original's digit strip. */
  private digits(ctx: CanvasRenderingContext2D, value: number, count: number, x: number, y: number): void {
    const { digits } = this.art;
    const cell = 9;
    let rest = Math.max(0, Math.floor(value));
    for (let i = count - 1; i >= 0; i--) {
      ctx.drawImage(digits, cell * (rest % 10), 0, cell, digits.height, x + cell * i, y, cell, digits.height);
      rest = Math.floor(rest / 10);
    }
  }

  /** The number of days on the note: ones on the right, then leftward; each digit two pixels lower, as if handwritten. */
  private noteNumber(ctx: CanvasRenderingContext2D, days: number): void {
    const { noteDigits } = this.art;
    const cell = 12;
    let x = LAYOUT.noteDigits.x;
    let y = LAYOUT.noteDigits.y;
    let rest = Math.max(0, Math.floor(days));
    do {
      const digit = rest % 10;
      ctx.drawImage(noteDigits, cell * digit, 0, cell, noteDigits.height, x, y, cell, noteDigits.height);
      // The one is narrow: move the neighboring digit closer.
      if (digit === 1) x += 6;
      rest = Math.floor(rest / 10);
      x -= cell;
      y += 2;
    } while (rest > 0);
  }

  /** The large screen on the right: where you are, date and time, game day, days until the water runs out, quests below. */
  private screen(ctx: CanvasRenderingContext2D, view: PipView): void {
    const { small, large } = this.art;
    const { x, y, w } = LAYOUT.screen;
    const { info } = LAYOUT;
    // A line no wider than the screen (with the `tx - x` indent); characters missing from the font are not affected, `printable` replaces them.
    const write = (font: BitmapFont, text: string, tx: number, ty: number, color: string) =>
      drawLabel(ctx, font, fitText(font, text, w - (tx - x)), tx, ty, color);

    drawLabel(ctx, large, fitText(large, t('pipTitle'), w), x + w / 2, y, BRIGHT, 'center');

    const date = view.clock.date;
    const months = t('pipMonths').split('|');
    const time = `${String(date.hour).padStart(2, '0')}:${String(date.minute).padStart(2, '0')}`;
    const rows: [string, string][] = [
      [t('pipPlace'), view.place],
      [t('pipDate'), `${tf('pipDateText', { day: date.day, month: months[date.month - 1] ?? '', year: date.year })}, ${time}`],
      [t('pipDay'), String(view.clock.day)],
    ];
    let line = info.top;
    for (const [label, value] of rows) {
      write(small, label, x, line, DIM);
      write(small, value, x + info.value, line, GREEN);
      line += info.step;
    }

    // The main thing: how many days are left to find the water chip.
    const left = view.clock.daysLeft;
    write(small, t('pipWater'), x, line + 3, DIM);
    write(large, tf('pipDaysLeft', { n: left }), x + 8, line + 15, left <= 30 ? WARN : BRIGHT);
    ctx.fillStyle = DIM;
    ctx.fillRect(x, LAYOUT.quests.top - 7, w, 1);
    this.questList(ctx, view.quests ?? []);
    write(small, t('pipHint'), x, y + 380, DIM);
  }

  /**
   * Quests by location: the location bright, its quests under it indented and wrapped. The state shows both by color and by
   * a mark: completed is dim "(completed)", failed is orange "(failed)". If it does not fit, scrolling;
   * the arrows on the right show that there is more above or below.
   */
  private questList(ctx: CanvasRenderingContext2D, groups: QuestGroup[]): void {
    const { small } = this.art;
    const { x, w } = LAYOUT.screen;
    const { top, bottom, indent, gutter } = LAYOUT.quests;
    const step = lineHeight(small) + 3;
    const lines: { text: string; color: string; dx: number }[] = [];
    for (const group of groups) {
      if (lines.length > 0) lines.push({ text: '', color: DIM, dx: 0 });
      lines.push({ text: group.place, color: BRIGHT, dx: 0 });
      for (const quest of group.quests) {
        const mark = quest.state === 'done' ? ` (${t('pipQuestDone')})` : quest.state === 'failed' ? ` (${t('pipQuestFailed')})` : '';
        const color = quest.state === 'done' ? DIM : quest.state === 'failed' ? WARN : GREEN;
        for (const part of wrapText(small, quest.text + mark, w - indent - gutter)) lines.push({ text: part, color, dx: indent });
      }
    }
    if (lines.length === 0) lines.push({ text: fitText(small, this.text(MSG.noQuests, 'pipNoQuests'), w), color: GREEN, dx: 0 });
    this.pageRows = Math.max(1, Math.floor((bottom - top) / step));
    this.maxScroll = Math.max(0, lines.length - this.pageRows);
    this.scroll = Math.min(this.scroll, this.maxScroll);
    lines.slice(this.scroll, this.scroll + this.pageRows).forEach((l, i) => drawLabel(ctx, small, l.text, x + l.dx, top + i * step, l.color));
    ctx.fillStyle = GREEN;
    if (this.scroll > 0) arrow(ctx, x + w - 5, top, true);
    if (this.scroll < this.maxScroll) arrow(ctx, x + w - 5, top + this.pageRows * step - 9, false);
  }

  /**
   * Archives: a vault dweller's handbook, sections with a title and text; the last one ("Life on the surface") is not filled in and
   * dimmer than the rest.
   */
  private archiveScreen(ctx: CanvasRenderingContext2D): void {
    const { small, large } = this.art;
    const { x, y, w } = LAYOUT.screen;
    drawLabel(ctx, large, fitText(large, t('pipMemoTitle'), w), x + w / 2, y, BRIGHT, 'center');
    const step = lineHeight(small) + 3;
    const parts = t('pipMemo').split('|');
    let line = y + 44;
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const last = i + 2 >= parts.length;
      drawLabel(ctx, small, fitText(small, parts[i]!, w), x, line, BRIGHT);
      line += step;
      for (const part of wrapText(small, parts[i + 1]!, w - 10)) {
        drawLabel(ctx, small, part, x + 10, line, last ? DIM : GREEN);
        line += step;
      }
      line += 8;
    }
    drawLabel(ctx, small, fitText(small, t('pipHintArchive'), w), x, y + 380, DIM);
  }

  /** Alarm clock: title, health and a column of rest options; the chosen one (resting) and the pressed one light up. */
  private alarmScreen(ctx: CanvasRenderingContext2D, view: PipView): void {
    const { small, large } = this.art;
    const { x, y, w } = LAYOUT.screen;
    const write = (font: BitmapFont, text: string, tx: number, ty: number, color: string) =>
      drawLabel(ctx, font, fitText(font, text, w - (tx - x)), tx, ty, color);

    drawLabel(ctx, large, fitText(large, this.text(MSG.title, 'pipAlarm'), w), x + w / 2, y, BRIGHT, 'center');
    if (view.health) {
      write(small, this.text(MSG.health, 'pipHealth'), x, y + 44, DIM);
      write(large, `${Math.max(0, Math.round(view.health.hp))} / ${Math.round(view.health.max)}`, x + 8, y + 57, GREEN);
    }
    this.alarm.choices(view).forEach((choice, i) => {
      const top = LAYOUT.rows.top + i * LAYOUT.rows.step;
      const lit = i === this.alarm.chosen || i === this.rowPressed;
      const cursor = i === this.cursor;
      if (lit || cursor) {
        ctx.fillStyle = lit ? ROW_SELECTED : ROW_CURSOR;
        ctx.fillRect(x - 4, top - 3, w + 8, LAYOUT.rows.step - 2);
      }
      write(small, this.rowText(choice), x + 8, top, lit || cursor ? BRIGHT : GREEN);
    });
    // Under the options: why resting is not allowed, or if all is well, how to leave.
    write(small, this.alarm.notice || t('pipHintAlarm'), x, y + 380, this.alarm.notice ? WARN : DIM);
  }
}
