// Game settings: data, saving and the "Settings" screen (used by the pause and, later, the main menu).
import { getLang, t, tf, type Lang } from '../i18n.ts';
import { platform } from '../platform.ts';

export interface Settings {
  /** Sound and music volume, percent (100 — as intended). */
  sfx: number;
  music: number;
  /** Mouse sensitivity multiplier (1 — as intended). */
  sensitivity: number;
  /** Vertical mouse inversion. */
  invertY: boolean;
  /** Fast picture: the view is drawn at 320×190 instead of 640×380 (four times fewer pixels) — for weak computers. */
  fastGraphics: boolean;
}

export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Readonly<Settings> = { sfx: 100, music: 100, sensitivity: 1, invertY: false, fastGraphics: false };

/** Slider bounds: volume — percent, sensitivity — percent of normal. */
const VOLUME = { min: 0, max: 100, step: 5 };
const SENSITIVITY = { min: 25, max: 300, step: 5 };

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Brings saved data (possibly incomplete or corrupted) to settings within allowed bounds. */
export function normalizeSettings(raw: unknown): Settings {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    sfx: clamp(input.sfx, VOLUME.min, VOLUME.max, DEFAULT_SETTINGS.sfx),
    music: clamp(input.music, VOLUME.min, VOLUME.max, DEFAULT_SETTINGS.music),
    sensitivity: clamp(input.sensitivity, SENSITIVITY.min / 100, SENSITIVITY.max / 100, DEFAULT_SETTINGS.sensitivity),
    invertY: input.invertY === true,
    fastGraphics: input.fastGraphics === true,
  };
}

export async function loadSettings(): Promise<Settings> {
  try {
    return normalizeSettings((await platform.getConfig()).settings);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Saves to config.json; if it fails — no big deal, the settings stay until the game exits. */
export function saveSettings(settings: Settings): void {
  void platform.setSettings(settings).catch(() => {});
}

/** Visible controls inside the container, in on-screen order. */
function controls(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')];
}

/** Moves focus to the neighbouring control (↑↓ arrows and Tab); from the last — to the first and back. */
export function focusStep(container: HTMLElement, delta: number): void {
  const list = controls(container);
  if (list.length === 0) return;
  const at = list.indexOf(document.activeElement as HTMLElement);
  const next = at < 0 ? (delta > 0 ? 0 : list.length - 1) : (at + delta + list.length) % list.length;
  list[next]!.focus();
}

export interface SettingsPanelOptions {
  settings: Settings;
  /** The value changed. commit — the slider was released (can save), otherwise dragging is in progress. */
  onChange(settings: Settings, key: SettingKey, commit: boolean): void;
  /** RU or EN pressed: the caller switches the language (setLang, saving), the panel redraws itself. */
  onLanguage(lang: Lang): void;
  onBack(): void;
  /** Custom locations (main menu only): which locations have variants from the editor and which are selected. */
  places?: PlacesOptions;
  /**
   * The Fallout 1 folder (client request, 2026-10-28: switch between copies of the game in different languages). inGame — the settings are open
   * during the game: before changing the folder, warn that unsaved progress will be lost (the game restarts).
   */
  folder?: { inGame: boolean };
}

/** A location with variants from the location editor: game level, its title, variant names. */
export interface PlaceVariants {
  base: string;
  title: string;
  variants: string[];
}

export interface PlacesOptions {
  list: PlaceVariants[];
  /** Selected: level → variant name (none — as in the game). */
  chosen: Record<string, string>;
  onChoose(chosen: Record<string, string>): void;
}

/** The "Settings" screen. Its size does not change while dragging: value labels take a fixed space. */
export class SettingsPanel {
  readonly element: HTMLElement;
  private readonly options: SettingsPanelOptions;
  private values: Settings;
  /** The custom locations list is shown instead of the usual settings. */
  private placesOpen = false;
  /** The warning about changing the Fallout folder is shown (during the game). */
  private folderOpen = false;

  constructor(options: SettingsPanelOptions) {
    this.options = options;
    this.values = { ...options.settings };
    this.element = document.createElement('section');
    this.element.className = 'panel';
    this.element.setAttribute('aria-labelledby', 'settings-title');
    this.render();
  }

  focusFirst(): void {
    controls(this.element)[0]?.focus();
  }

  /** Panel keys; true — the key was handled. */
  handleKey(e: KeyboardEvent): boolean {
    if (e.code === 'Escape') {
      if (this.placesOpen) this.showPlaces(false);
      else if (this.folderOpen) this.showFolderAsk(false);
      else this.options.onBack();
      return true;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      focusStep(this.element, e.code === 'ArrowDown' ? 1 : -1);
      return true;
    }
    if (e.code === 'Tab') {
      focusStep(this.element, e.shiftKey ? -1 : 1);
      return true;
    }
    return false;
  }

  /** Open or close the custom locations list (focus — on the first choice or on the button that opened it). */
  private showPlaces(open: boolean): void {
    this.placesOpen = open;
    if (open) this.renderPlaces();
    else this.render('set-places');
  }

  /** Warning before changing the folder during the game (or go back to the settings). */
  private showFolderAsk(open: boolean): void {
    this.folderOpen = open;
    if (open) this.renderFolderAsk();
    else this.render('set-folder');
  }

  /** During the game: the game restarts with another copy, unsaved progress is lost; choose a folder or go back. */
  private renderFolderAsk(): void {
    this.element.innerHTML = `
      <h2 class="panel-title" id="settings-title"></h2>
      <p class="settings-note" id="folder-note"></p>
      <div class="pause-buttons">
        <button class="menu-button menu-primary" id="folder-pick" type="button"></button>
        <button class="menu-button" id="folder-back" type="button"></button>
      </div>`;
    const $ = <T extends HTMLElement>(selector: string) => this.element.querySelector(selector) as T;
    $('#settings-title').textContent = t('settingsFolder');
    $('#folder-note').textContent = t('settingsFolderWarn');
    const pick = $<HTMLButtonElement>('#folder-pick');
    pick.textContent = t('settingsFolderPick');
    pick.addEventListener('click', () => void this.chooseFolder($('#folder-note')));
    const back = $<HTMLButtonElement>('#folder-back');
    back.textContent = t('settingsBack');
    back.addEventListener('click', () => this.showFolderAsk(false));
    pick.focus();
  }

  /**
   * Folder picker: if it fits (has master.dat and critter.dat) — the game restarts with it (images, sounds and texts
   * come from the new copy); cancelled — nothing; does not fit — an explanation in note.
   */
  private async chooseFolder(note: HTMLElement): Promise<void> {
    const result = await platform.chooseFolder();
    if (result.ok) {
      note.textContent = t('settingsFolderRestart');
      window.setTimeout(() => window.location.reload(), 300);
      return;
    }
    if (result.reason === 'cancelled') return;
    note.textContent = t(result.reason === 'missing' ? 'errorMissing' : 'errorNoDat');
    note.classList.add('settings-error');
  }

  /** Custom locations: for each location with variants — the choice "as in the game" or a variant. Takes effect from a new game. */
  private renderPlaces(): void {
    const places = this.options.places;
    if (!places) return;
    this.element.innerHTML = `
      <h2 class="panel-title" id="settings-title"></h2>
      <p class="settings-note"></p>
      <div class="settings-list places-list"></div>
      <button class="menu-button" id="places-back" type="button"></button>`;
    this.element.querySelector('#settings-title')!.textContent = t('settingsPlaces');
    this.element.querySelector('.settings-note')!.textContent = t('settingsPlacesNote');
    const list = this.element.querySelector('.places-list')!;
    places.list.forEach((place, i) => {
      const row = document.createElement('div');
      row.className = 'setting-row place-row';
      const label = document.createElement('label');
      label.className = 'setting-label';
      label.htmlFor = `place-${i}`;
      label.textContent = place.title;
      const select = document.createElement('select');
      select.className = 'place-select';
      select.id = `place-${i}`;
      for (const name of ['', ...place.variants]) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name || t('edVariantGame');
        select.append(option);
      }
      select.value = place.variants.includes(places.chosen[place.base] ?? '') ? places.chosen[place.base]! : '';
      select.addEventListener('change', () => {
        if (select.value) places.chosen[place.base] = select.value;
        else delete places.chosen[place.base];
        places.onChoose({ ...places.chosen });
      });
      row.append(label, select);
      list.append(row);
    });
    const back = this.element.querySelector<HTMLButtonElement>('#places-back')!;
    back.textContent = t('settingsBack');
    back.addEventListener('click', () => this.showPlaces(false));
    controls(this.element)[0]?.focus();
  }

  private render(focusId = ''): void {
    const slider = (id: string) => `
      <label class="setting-label" for="${id}"></label>
      <input class="slider" id="${id}" type="range" />
      <output class="setting-value" for="${id}"></output>`;
    this.element.innerHTML = `
      <h2 class="panel-title" id="settings-title"></h2>
      <div class="settings-list">
        <div class="setting-row">${slider('set-sfx')}</div>
        <div class="setting-row">${slider('set-music')}</div>
        <div class="setting-row">${slider('set-sensitivity')}</div>
        <div class="setting-row">
          <span class="setting-label" id="set-invert-label"></span>
          <button class="toggle" id="set-invert" type="button" role="switch" aria-labelledby="set-invert-label"></button>
        </div>
        <div class="setting-row">
          <span class="setting-label" id="set-quality-label"></span>
          <button class="toggle" id="set-quality" type="button" aria-labelledby="set-quality-label"></button>
        </div>
        <div class="setting-row" role="group" aria-labelledby="set-lang-label">
          <span class="setting-label" id="set-lang-label"></span>
          <div class="lang">
            <button class="lang-button" id="lang-ru" type="button" data-lang="ru">RU</button>
            <button class="lang-button" id="lang-en" type="button" data-lang="en">EN</button>
          </div>
        </div>
        ${
          this.options.folder && platform.hasFolderDialog
            ? `<div class="setting-row">
          <span class="setting-label"><span id="set-folder-label"></span><span class="setting-sub" id="set-folder-name"></span></span>
          <button class="toggle" id="set-folder" type="button" aria-labelledby="set-folder-label set-folder-name"></button>
        </div>
        <p class="settings-note" id="set-folder-note" hidden></p>`
            : ''
        }
        ${
          this.options.places
            ? `<div class="setting-row">
          <span class="setting-label" id="set-places-label"></span>
          <button class="toggle" id="set-places" type="button" aria-labelledby="set-places-label"></button>
        </div>`
            : ''
        }
      </div>
      <button class="menu-button" id="settings-back" type="button"></button>`;
    const $ = <T extends HTMLElement>(selector: string) => this.element.querySelector(selector) as T;
    $('#settings-title').textContent = t('settingsTitle');
    $('#set-invert-label').textContent = t('settingsInvert');
    $('#set-lang-label').textContent = t('language');
    $('#settings-back').textContent = t('settingsBack');

    this.bindSlider('set-sfx', 'sfx', t('settingsSfx'), VOLUME, 1);
    this.bindSlider('set-music', 'music', t('settingsMusic'), VOLUME, 1);
    this.bindSlider('set-sensitivity', 'sensitivity', t('settingsMouse'), SENSITIVITY, 100);

    const toggle = $<HTMLButtonElement>('#set-invert');
    const showToggle = () => {
      toggle.textContent = t(this.values.invertY ? 'settingsOn' : 'settingsOff');
      toggle.setAttribute('aria-checked', String(this.values.invertY));
    };
    showToggle();
    toggle.addEventListener('click', () => {
      this.values.invertY = !this.values.invertY;
      showToggle();
      this.options.onChange({ ...this.values }, 'invertY', true);
    });

    // Picture quality: normal (640×380) or fast (320×190) — for weak computers. Takes effect at once.
    $('#set-quality-label').textContent = t('settingsQuality');
    const quality = $<HTMLButtonElement>('#set-quality');
    quality.title = t('settingsQualityNote');
    const showQuality = () => {
      quality.textContent = t(this.values.fastGraphics ? 'settingsQualityFast' : 'settingsQualityNormal');
    };
    showQuality();
    quality.addEventListener('click', () => {
      this.values.fastGraphics = !this.values.fastGraphics;
      showQuality();
      this.options.onChange({ ...this.values }, 'fastGraphics', true);
    });

    this.element.querySelectorAll<HTMLButtonElement>('.lang-button').forEach((button) => {
      const lang = button.dataset.lang as Lang;
      button.setAttribute('aria-pressed', String(lang === getLang()));
      button.addEventListener('click', () => {
        this.options.onLanguage(lang);
        this.render(button.id);
      });
    });
    $('#settings-back').addEventListener('click', () => this.options.onBack());
    const folder = this.options.folder;
    if (folder && platform.hasFolderDialog) {
      $('#set-folder-label').textContent = t('settingsFolder');
      const button = $<HTMLButtonElement>('#set-folder');
      button.textContent = t('settingsFolderChange');
      // Under the label — the current folder name, the full path — in the tooltip.
      const name = $<HTMLElement>('#set-folder-name');
      void platform.getConfig().then((config) => {
        const dir = config.gameDir ?? '';
        name.textContent = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
        name.title = dir;
      });
      button.addEventListener('click', () => {
        if (folder.inGame) this.showFolderAsk(true);
        else {
          const note = $<HTMLElement>('#set-folder-note');
          note.hidden = false;
          note.textContent = '';
          void this.chooseFolder(note);
        }
      });
    }
    const places = this.options.places;
    if (places) {
      $('#set-places-label').textContent = t('settingsPlaces');
      const button = $<HTMLButtonElement>('#set-places');
      const chosen = places.list.filter((p) => places.chosen[p.base]).length;
      button.textContent = places.list.length ? tf('settingsPlacesCount', { n: chosen, m: places.list.length }) : t('settingsPlacesNone');
      button.disabled = places.list.length === 0;
      button.addEventListener('click', () => this.showPlaces(true));
    }
    if (focusId) this.element.querySelector<HTMLElement>('#' + focusId)?.focus();
  }

  /** Slider: the settings store value / scale (volume — percent, sensitivity — multiplier). */
  private bindSlider(
    id: string,
    key: 'sfx' | 'music' | 'sensitivity',
    label: string,
    range: { min: number; max: number; step: number },
    scale: number,
  ): void {
    const input = this.element.querySelector<HTMLInputElement>('#' + id)!;
    const output = this.element.querySelector<HTMLOutputElement>(`output[for="${id}"]`)!;
    this.element.querySelector<HTMLElement>(`label[for="${id}"]`)!.textContent = label;
    input.min = String(range.min);
    input.max = String(range.max);
    input.step = String(range.step);
    const show = () => {
      output.textContent = `${input.value}%`;
      input.style.setProperty('--fill', `${((Number(input.value) - range.min) / (range.max - range.min)) * 100}%`);
    };
    input.value = String(Math.round(this.values[key] * scale));
    show();
    const read = () => {
      this.values[key] = Number(input.value) / scale;
      show();
    };
    input.addEventListener('input', () => {
      read();
      this.options.onChange({ ...this.values }, key, false);
    });
    input.addEventListener('change', () => {
      read();
      this.options.onChange({ ...this.values }, key, true);
    });
  }
}
