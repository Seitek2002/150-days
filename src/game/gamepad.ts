// Gamepad (Xbox, PlayStation — the browser's "standard" mapping): polled once a frame by its own loop, from the main menu to the end of the game.
// The game reads walking, looking, firing, jumping and running itself (play.ts → padState); the other buttons turn into the same keys
// as the keyboard's — so menus, dialogue, character creation and game windows obey the gamepad without code of their own for it.
// What's on screen is told by the game (setPadHost): in the game A is "E", in menus — select, B — back, the D-pad — through the items.
import { t, type StringKey } from '../i18n.ts';

/** Button numbers in the "standard" mapping (PlayStation has the same places: A — cross, B — circle, X — square, Y — triangle). */
export const PAD = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  select: 8,
  start: 9,
  ls: 10,
  rs: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;
export type PadName = keyof typeof PAD;

/**
 * What's on screen: the game is running (buttons — the hero's actions), a dialogue (the D-pad — through the replies), menus and windows (the D-pad — through
 * the items, A — select, B — back), game over (A — start again, Y — quick load).
 */
export type PadContext = 'game' | 'dialogue' | 'menu' | 'ended';

export interface PadHost {
  context(): PadContext;
  /** A press in the game (before conversion to a key); true — the game handled it itself. */
  press?(name: PadName): boolean;
}

/** Stick dead zones: larger for the left one (walking doesn't creep from a worn stick), smaller for the right one (more precise aim). */
export const MOVE_DEAD = 0.22;
export const LOOK_DEAD = 0.14;
/** A stick in menus acts like a pressed arrow if deflected further than this. */
const MENU_TILT = 0.55;
/** Holding a direction in menus: repeat after this many milliseconds, then faster. */
const REPEAT_FIRST = 380;
const REPEAT_NEXT = 110;
/** Hold X longer — holster or draw the weapon (Q), a short press — reload (R); Select — character (K) and inventory (I). */
const HOLD_MS = 450;
/** Triggers count as pressed if pulled further than this. */
const TRIGGER = 0.4;

/** Radial dead zone: inside — zero, beyond — smoothly from 0 to 1; power > 1 — fine movement near the centre (aiming). */
export function deadzone(x: number, y: number, dead: number, power = 1): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len <= dead) return { x: 0, y: 0 };
  const k = Math.min(1, (len - dead) / (1 - dead)) ** power / len;
  return { x: x * k, y: y * k };
}

/** Looking with the right stick: radians per second sideways and pixels per second up and down at full deflection. */
const LOOK_TURN = 2.4;
const LOOK_PITCH = 230;
/** Turn acceleration: stick fully sideways for longer than BOOST_AFTER s — speed smoothly grows to ×BOOST over BOOST_RAMP s. */
const BOOST = 2;
const BOOST_AFTER = 0.2;
const BOOST_RAMP = 0.45;
const BOOST_FULL = 0.9;

/** Look speed from the right stick (already past the dead zone) with smooth turn acceleration. */
export class LookAccel {
  private held = 0;

  update(x: number, y: number, dt: number): { turn: number; pitch: number } {
    this.held = Math.abs(x) >= BOOST_FULL ? this.held + dt : 0;
    const boost = 1 + (BOOST - 1) * Math.min(1, Math.max(0, (this.held - BOOST_AFTER) / BOOST_RAMP));
    // Stick up (y < 0) — look up.
    return { turn: x * LOOK_TURN * boost, pitch: -y * LOOK_PITCH };
  }
}

/**
 * Keys for buttons while the game is running (the game takes RT, LT, Y, X, Select and the left stick itself). Holding LT — a targeted attack
 * (client, 2026-10-29), so "examine" is on pressing the right stick, and the character sheet is a long Select.
 */
const GAME_KEYS: Partial<Record<PadName, string>> = {
  a: 'KeyE',
  b: 'KeyC',
  lb: 'KeyH',
  rb: 'KeyF',
  start: 'F10',
  rs: 'KeyV',
  up: 'KeyP',
  down: 'Tab',
  left: 'KeyM',
  right: 'KeyU',
};
/** In menus and windows: B — back, Select — close (opened the inventory — close it the same way), Start — pause, bumpers — like Tab. */
const MENU_KEYS: Partial<Record<PadName, string>> = {
  b: 'Escape',
  select: 'Escape',
  start: 'F10',
  lt: 'PageUp',
  rt: 'PageDown',
};

type Dir = 'up' | 'down' | 'left' | 'right';
const ARROWS: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

/** Press a key for the player: keydown and right away keyup — to wherever the focus is (window listeners get it as if from the keyboard). */
function sendKey(code: string, opts: { shift?: boolean; repeat?: boolean } = {}): KeyboardEvent {
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  // For letters key is the letter itself, for the rest (Enter, Escape, Tab, arrows, F10) it matches code.
  const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
  const init: KeyboardEventInit = { code, key, bubbles: true, cancelable: true, shiftKey: !!opts.shift, repeat: !!opts.repeat };
  const down = new KeyboardEvent('keydown', init);
  target.dispatchEvent(down);
  target.dispatchEvent(new KeyboardEvent('keyup', init));
  return down;
}

const visible = (el: HTMLElement) => el.isConnected && el.getClientRects().length > 0 && !el.closest('[hidden]');
/** The element is visible and not covered by anything (a movie or a canvas window over the menu — then we don't press its button). */
function onTop(el: HTMLElement): boolean {
  if (!visible(el)) return false;
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  // The button's centre is beyond the window's edge — nothing to check with, trust the visibility.
  return !hit || hit === el || el.contains(hit);
}

/** Controls of the same window as the focus (a fallback move if the window doesn't listen to arrows — for example, skills). */
function stepFocus(from: HTMLElement, delta: number): void {
  const box = from.closest<HTMLElement>('[role="dialog"], nav, .panel, .pause-card') ?? document.body;
  const list = [...box.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')].filter(visible);
  const at = list.indexOf(from);
  if (at < 0 || list.length < 2) return;
  list[(at + delta + list.length) % list.length]!.focus();
}

/** The right stick in menus scrolls the window (the list of buttons in pause): pixels per frame at full deflection. */
const SCROLL_SPEED = 14;
function scrollNear(from: Element | null, dy: number): void {
  for (let el = from instanceof HTMLElement ? from : null; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
      el.scrollTop += dy;
      return;
    }
  }
}

/** A slider or a select under focus: left-right change the value (the browser itself doesn't respond to fake keys). */
function adjustControl(el: Element | null, delta: number): boolean {
  if (el instanceof HTMLInputElement && el.type === 'range' && visible(el)) {
    if (delta > 0) el.stepUp();
    else el.stepDown();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (el instanceof HTMLSelectElement && visible(el) && el.options.length > 0) {
    el.selectedIndex = (el.selectedIndex + delta + el.options.length) % el.options.length;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}

/** Gamepad state for a game frame. */
export interface PadState {
  /** Left stick after the dead zone: x — right, y — forward. */
  move: { x: number; y: number };
  /** Right stick after the dead zone and the curve (precise aim near the centre): x — right, y — down. */
  look: { x: number; y: number };
  held(name: PadName): boolean;
}

class Gamepads implements PadState {
  move = { x: 0, y: 0 };
  look = { x: 0, y: 0 };
  /** The gamepad was used last, not the mouse and keyboard: gamepad hints and play without mouse capture. */
  using = false;
  /** Whose gamepad — button names in hints depend on it. */
  kind: 'xbox' | 'ps' = 'xbox';
  private host: PadHost | null = null;
  private down: boolean[] = [];
  /** When a button was pressed (for a long X) and whether the long press has already fired. */
  private since: number[] = [];
  private longDone = false;
  private longSelectDone = false;
  /** Whether the button was pressed while the game was running (releasing X counts as reload only then). */
  private inGame: boolean[] = [];
  /** The direction being held in menus, and when to repeat it. */
  private dir: Dir | null = null;
  private dirSource: 'pad' | 'stick' | 'look' = 'pad';
  private repeatAt = 0;
  private readonly listeners = new Set<() => void>();
  private started = false;

  start(): void {
    if (this.started || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    this.started = true;
    // Mouse or keyboard — hints are for them again (real events only: the gamepad sends its own presses itself).
    const off = (e: Event) => {
      if (e.isTrusted) this.setUsing(false);
    };
    const offMove = (e: MouseEvent) => {
      if (e.isTrusted && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) this.setUsing(false);
    };
    window.addEventListener('keydown', off, true);
    window.addEventListener('mousedown', off, true);
    window.addEventListener('mousemove', offMove, true);
    const loop = () => {
      this.poll();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  setHost(host: PadHost | null): void {
    this.host = host;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  held(name: PadName): boolean {
    return !!this.down[PAD[name]];
  }

  private setUsing(on: boolean): void {
    if (this.using === on) return;
    this.using = on;
    document.documentElement.classList.toggle('pad-nav', on);
    for (const l of this.listeners) l();
  }

  private poll(): void {
    const pad = [...navigator.getGamepads()].find((p): p is Gamepad => !!p && p.connected);
    if (!pad) {
      this.move = { x: 0, y: 0 };
      this.look = { x: 0, y: 0 };
      this.down = [];
      this.dir = null;
      if (this.using) this.setUsing(false);
      return;
    }
    const kind = /054c|playstation|dualshock|dualsense|wireless controller/i.test(pad.id) ? 'ps' : 'xbox';
    if (kind !== this.kind) {
      this.kind = kind;
      for (const l of this.listeners) l();
    }
    const ax = (i: number) => pad.axes[i] ?? 0;
    const left = deadzone(ax(0), ax(1), MOVE_DEAD);
    this.move = { x: left.x, y: -left.y };
    this.look = deadzone(ax(2), ax(3), LOOK_DEAD, 2);
    const now = performance.now();
    const next: boolean[] = pad.buttons.map((b, i) => (i === PAD.lt || i === PAD.rt ? b.value > TRIGGER || b.pressed : b.pressed));
    let active = this.move.x !== 0 || this.move.y !== 0 || this.look.x !== 0 || this.look.y !== 0;
    const context = this.host?.context() ?? 'menu';
    for (let i = 0; i < next.length; i++) {
      if (next[i]) active = true;
      if (next[i] && !this.down[i]) {
        this.since[i] = now;
        this.inGame[i] = context === 'game';
        if (i === PAD.x) this.longDone = false;
        if (i === PAD.select) this.longSelectDone = false;
        this.press(i, context);
      } else if (!next[i] && this.down[i]) this.release(i, context);
    }
    // A long Select in the game — character (skills and perks).
    if (next[PAD.select] && !this.longSelectDone && context === 'game' && this.inGame[PAD.select] && now - (this.since[PAD.select] ?? now) >= HOLD_MS) {
      this.longSelectDone = true;
      sendKey('KeyK');
    }
    // A long X in the game — holster or draw the weapon.
    if (next[PAD.x] && !this.longDone && context === 'game' && this.inGame[PAD.x] && now - (this.since[PAD.x] ?? now) >= HOLD_MS) {
      this.longDone = true;
      sendKey('KeyQ');
    }
    this.down = next;
    if (active) this.setUsing(true);
    if (context !== 'game') this.menuDirection(next, context, now);
    else this.dir = null;
    if (context === 'menu' && this.look.y !== 0) scrollNear(document.activeElement, this.look.y * SCROLL_SPEED);
  }

  private press(i: number, context: PadContext): void {
    const name = (Object.keys(PAD) as PadName[]).find((n) => PAD[n] === i);
    if (!name) return;
    if (context === 'game') {
      if (this.host?.press?.(name)) return;
      const code = GAME_KEYS[name];
      if (code) sendKey(code);
      return;
    }
    // Directions go to menuDirection (with repeat).
    if (name === 'up' || name === 'down' || name === 'left' || name === 'right') return;
    if (context === 'ended') {
      if (name === 'a') sendKey('Enter');
      else if (name === 'y') sendKey('F7');
      return;
    }
    if (name === 'a') {
      this.activate(context);
      return;
    }
    if (context === 'dialogue') {
      // Dialogue: X — what has been said (R), Y — barter (B), B — back from the review.
      if (name === 'x') sendKey('KeyR');
      else if (name === 'y') sendKey('KeyB');
      else if (name === 'b') sendKey('Escape');
      return;
    }
    if (name === 'lb' || name === 'rb') {
      sendKey('Tab', { shift: name === 'lb' });
      return;
    }
    const code = MENU_KEYS[name];
    if (code) sendKey(code);
  }

  private release(i: number, context: PadContext): void {
    // A short X in the game — reload (the long one already holstered the weapon); a short Select — inventory.
    if (i === PAD.x && context === 'game' && this.inGame[i] && !this.longDone) sendKey('KeyR');
    if (i === PAD.select && context === 'game' && this.inGame[i] && !this.longSelectDone) sendKey('KeyI');
  }

  /** A in menus: first Enter (canvas windows select with it themselves), if not accepted — press the button under focus. */
  private activate(context: PadContext): void {
    const ev = sendKey('Enter');
    if (ev.defaultPrevented || context === 'dialogue') return;
    const el = document.activeElement;
    if (el instanceof HTMLSelectElement && onTop(el)) adjustControl(el, 1);
    else if ((el instanceof HTMLButtonElement || (el instanceof HTMLInputElement && el.type === 'checkbox')) && onTop(el)) el.click();
  }

  /** D-pad or stick in menus — arrows with repeat; in dialogue up-down — through the replies, the right stick — scroll the line. */
  private menuDirection(buttons: boolean[], context: PadContext, now: number): void {
    const fromPad: Dir | null = buttons[PAD.up] ? 'up' : buttons[PAD.down] ? 'down' : buttons[PAD.left] ? 'left' : buttons[PAD.right] ? 'right' : null;
    const tilt = (x: number, y: number): Dir | null =>
      Math.max(Math.abs(x), Math.abs(y)) < MENU_TILT ? null : Math.abs(y) >= Math.abs(x) ? (y < 0 ? 'up' : 'down') : x < 0 ? 'left' : 'right';
    const stick = tilt(this.move.x, -this.move.y);
    const look = context === 'dialogue' ? tilt(0, this.look.y) : null;
    const dir = fromPad ?? stick ?? look;
    const source = fromPad ? 'pad' : stick ? 'stick' : 'look';
    if (!dir) {
      this.dir = null;
      return;
    }
    const fresh = dir !== this.dir || source !== this.dirSource;
    if (!fresh && now < this.repeatAt) return;
    this.repeatAt = now + (fresh ? REPEAT_FIRST : REPEAT_NEXT);
    this.dir = dir;
    this.dirSource = source;
    if (context === 'dialogue') {
      if (source === 'look') sendKey(ARROWS[dir], { repeat: !fresh });
      else if (dir === 'up' || dir === 'down') sendKey('Tab', { shift: dir === 'up', repeat: !fresh });
      return;
    }
    const el = document.activeElement;
    if ((dir === 'left' || dir === 'right') && adjustControl(el, dir === 'right' ? 1 : -1)) return;
    const ev = sendKey(ARROWS[dir], { repeat: !fresh });
    // The window doesn't listen to arrows (for example, skills) — we move the focus between buttons ourselves.
    if (!ev.defaultPrevented && el instanceof HTMLElement && el === document.activeElement && visible(el) && (dir === 'up' || dir === 'down')) {
      if (el.matches('button, input, select')) stepFocus(el, dir === 'down' ? 1 : -1);
    }
  }
}

/** One gamepad for the whole game. */
export const gamepad = new Gamepads();
export const padState: PadState = gamepad;
export const usingPad = (): boolean => gamepad.using;

/** Button name for a hint: Xbox has letters, PlayStation has its own names (texts — i18n). */
export function padLabel(name: PadName): string {
  const word = `${name[0]!.toUpperCase()}${name.slice(1)}`;
  // The D-pad is the same for everyone; the other buttons are named differently.
  const common = name === 'up' || name === 'down' || name === 'left' || name === 'right';
  return t(`pad${common ? '' : gamepad.kind === 'ps' ? 'Ps' : 'Xb'}${word}` as StringKey);
}

/** Names of all buttons — for substitution into hint texts ({a}, {rt}, …). */
export function padLabels(): Record<PadName, string> {
  const out = {} as Record<PadName, string>;
  for (const name of Object.keys(PAD) as PadName[]) out[name] = padLabel(name);
  return out;
}

/** A hint "E — …" for the gamepad: "A — …" (hint texts start with the key). */
export function padPrompt(text: string): string {
  return gamepad.using && text.startsWith('E — ') ? `${padLabel('a')} — ${text.slice(4)}` : text;
}
