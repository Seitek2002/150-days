// Pause menu: "Continue", "Settings", "Quit" and the key list. Over the game; the menu window is always the same size,
// so nothing jumps when going to settings and back. While the menu is open, only it hears the keys.
// Buttons and keys in one column; above the keys — a "Keyboard / Gamepad" toggle (client request, 2026-10-29),
// initially set to whatever is being used to play right now.
import { padLabels, usingPad } from '../game/gamepad.ts';
import { t, tf, type Lang } from '../i18n.ts';
import { focusStep, SettingsPanel, type SettingKey, type Settings } from './settings.ts';

export interface PauseHandlers {
  /** Current settings (read every time the "Settings" screen opens). */
  settings(): Settings;
  onSettingsChange(settings: Settings, key: SettingKey, commit: boolean): void;
  onLanguage(lang: Lang): void;
  /** "Continue", Esc or F10: the caller closes the menu (hide) and resumes the game. */
  onResume(): void;
  /**
   * "Save" and "Load": the caller opens the slot screen and reports done when the screen is closed
   * (after a successful load it closes the menu itself — hide). While the screen is open, the pause window is hidden and the game is stopped.
   */
  onSave(done: () => void): void;
  onLoad(done: () => void): void;
  onQuit(): void;
  /** "Walk it yourself" from the location editor: instead of "Quit" — "To the editor". */
  toEditor?: boolean;
}

type View = 'menu' | 'settings';

export class PauseMenu {
  private readonly host: HTMLElement;
  private readonly card: HTMLElement;
  private readonly handlers: PauseHandlers;
  private view: View = 'menu';
  private panel: SettingsPanel | null = null;
  private opened = false;
  /** The window is hidden under the save screen, but the game stays paused. */
  private covered = false;
  private coveredBy: 'save' | 'load' | null = null;
  /** Whose keys are in the list: keyboard or gamepad. */
  private keysFor: 'keyboard' | 'pad' = 'keyboard';
  private readonly keyListener = (e: KeyboardEvent) => this.key(e);

  constructor(parent: HTMLElement, handlers: PauseHandlers) {
    this.handlers = handlers;
    this.host = document.createElement('div');
    this.host.className = 'pause';
    this.host.hidden = true;
    this.host.setAttribute('role', 'dialog');
    this.host.setAttribute('aria-modal', 'true');
    this.card = document.createElement('div');
    this.card.className = 'pause-card';
    // Five buttons and the key list do not fit in the usual pause window.
    this.card.style.height = 'min(520px, 100%)';
    this.host.append(this.card);
    parent.append(this.host);
  }

  get open(): boolean {
    return this.opened;
  }

  show(): void {
    if (this.opened) return;
    this.opened = true;
    this.view = 'menu';
    this.keysFor = usingPad() ? 'pad' : 'keyboard';
    this.host.hidden = false;
    this.render('resume');
    // Intercept keys before the game (capture), so WASD, R, H and the rest do not reach it.
    window.addEventListener('keydown', this.keyListener, true);
  }

  hide(): void {
    if (!this.opened) return;
    this.opened = false;
    this.covered = false;
    window.removeEventListener('keydown', this.keyListener, true);
    this.host.hidden = true;
    this.panel = null;
    this.card.replaceChildren();
  }

  /** Hide the window without unpausing (the save screen opens on top: it listens to keys itself). */
  private cover(by: 'save' | 'load'): void {
    if (!this.opened || this.covered) return;
    this.covered = true;
    this.coveredBy = by;
    this.host.hidden = true;
    window.removeEventListener('keydown', this.keyListener, true);
  }

  private uncover(): void {
    // The window may have been closed for good (after loading a game) — then there is nothing to return to.
    if (!this.opened || !this.covered) return;
    this.covered = false;
    this.host.hidden = false;
    window.addEventListener('keydown', this.keyListener, true);
    this.card.querySelector<HTMLElement>(this.coveredBy === 'load' ? '#pause-load' : '#pause-save')?.focus();
  }

  private key(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.code === 'F10' || (e.code === 'Escape' && this.view === 'menu')) {
      e.preventDefault();
      if (!e.repeat) this.handlers.onResume();
      return;
    }
    if (this.view === 'settings') {
      if (e.code === 'Escape' && e.repeat) return;
      if (this.panel?.handleKey(e)) e.preventDefault();
      return;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      focusStep(this.card, e.code === 'ArrowDown' ? 1 : -1);
    } else if (e.code === 'Tab') {
      e.preventDefault();
      focusStep(this.card, e.shiftKey ? -1 : 1);
    }
  }

  private render(focus: 'resume' | 'settings'): void {
    this.card.replaceChildren();
    this.panel = null;
    if (this.view === 'settings') {
      this.host.setAttribute('aria-labelledby', 'settings-title');
      this.panel = new SettingsPanel({
        settings: this.handlers.settings(),
        onChange: (settings, key, commit) => this.handlers.onSettingsChange(settings, key, commit),
        onLanguage: (lang) => this.handlers.onLanguage(lang),
        folder: { inGame: true },
        onBack: () => {
          this.view = 'menu';
          this.render('settings');
        },
      });
      this.card.append(this.panel.element);
      this.panel.focusFirst();
      return;
    }
    this.host.setAttribute('aria-labelledby', 'pause-title');
    const section = document.createElement('section');
    section.className = 'panel';
    section.innerHTML = `
      <h2 class="panel-title" id="pause-title"></h2>
      <div class="pause-buttons">
        <button class="menu-button menu-primary" id="pause-resume" type="button"></button>
        <button class="menu-button" id="pause-save" type="button"></button>
        <button class="menu-button" id="pause-load" type="button"></button>
        <button class="menu-button" id="pause-settings" type="button"></button>
        <button class="menu-button" id="pause-quit" type="button"></button>
      </div>
      <div class="keys-switch" role="radiogroup" id="keys-switch">
        <button class="toggle" role="radio" id="keys-keyboard" type="button"></button>
        <button class="toggle" role="radio" id="keys-pad" type="button"></button>
      </div>
      <dl class="pause-keys"></dl>`;
    const $ = <T extends HTMLElement>(selector: string) => section.querySelector(selector) as T;
    $('#pause-title').textContent = t('pauseTitle');
    $('#pause-resume').textContent = t('pauseResume');
    $('#pause-save').textContent = t('pauseSave');
    $('#pause-load').textContent = t('pauseLoad');
    $('#pause-settings').textContent = t('pauseSettings');
    const quit = $<HTMLButtonElement>('#pause-quit');
    quit.textContent = t(this.handlers.toEditor ? 'pauseToEditor' : 'pauseQuit');

    const keys = $('.pause-keys');
    $('#keys-switch').setAttribute('aria-label', t('pauseKeysLabel'));
    const keyboard = $<HTMLButtonElement>('#keys-keyboard');
    const pad = $<HTMLButtonElement>('#keys-pad');
    keyboard.textContent = t('pauseKeysKeyboard');
    pad.textContent = t('pauseKeysGamepad');
    // Key list for the selected one: keyboard or gamepad (button names as on the player's gamepad: Xbox or PlayStation).
    const fillKeys = () => {
      keyboard.setAttribute('aria-checked', String(this.keysFor === 'keyboard'));
      pad.setAttribute('aria-checked', String(this.keysFor === 'pad'));
      keys.replaceChildren();
      const list = this.keysFor === 'pad' ? tf('pauseKeysPad', padLabels()) : t('pauseKeys');
      for (const line of list.split('\n')) {
        const [name = '', action = ''] = line.split('|');
        const row = document.createElement('div');
        row.className = 'key-row';
        const dt = document.createElement('dt');
        dt.textContent = name;
        const dd = document.createElement('dd');
        dd.textContent = action;
        row.append(dt, dd);
        keys.append(row);
      }
    };
    fillKeys();
    keyboard.addEventListener('click', () => {
      this.keysFor = 'keyboard';
      fillKeys();
    });
    pad.addEventListener('click', () => {
      this.keysFor = 'pad';
      fillKeys();
    });

    $('#pause-resume').addEventListener('click', () => this.handlers.onResume());
    $('#pause-save').addEventListener('click', () => {
      this.cover('save');
      this.handlers.onSave(() => this.uncover());
    });
    $('#pause-load').addEventListener('click', () => {
      this.cover('load');
      this.handlers.onLoad(() => this.uncover());
    });
    $('#pause-settings').addEventListener('click', () => {
      this.view = 'settings';
      this.render('settings');
    });
    // "Quit" takes two steps, so the run is not lost by accident; the label changes in place, the button does not move.
    let armed = false;
    quit.addEventListener('click', () => {
      if (armed) {
        this.handlers.onQuit();
        return;
      }
      armed = true;
      quit.textContent = t(this.handlers.toEditor ? 'pauseToEditorSure' : 'pauseQuitSure');
    });
    quit.addEventListener('blur', () => {
      armed = false;
      quit.textContent = t(this.handlers.toEditor ? 'pauseToEditor' : 'pauseQuit');
    });

    this.card.append(section);
    $<HTMLElement>(focus === 'settings' ? '#pause-settings' : '#pause-resume').focus();
  }
}
