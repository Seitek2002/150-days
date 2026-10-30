// Main menu. The background and red buttons come from the player's Fallout copy (ART\INTRFACE), the labels are ours, in two languages.
// The layout (where the plates and buttons are) and the menu music (07DESERT) are as in the original.
import { GameAssets } from '../assets/sprites.ts';
import type { Sound } from '../audio/sound.ts';
import { startGame } from '../game/play.ts';
import { isSaveData, type SaveData } from '../game/save.ts';
import { getLang, setLang, t, type StringKey } from '../i18n.ts';
import { parseLst } from '../formats/text.ts';
import { platform } from '../platform.ts';
import { openSaveScreen } from './save-screen.ts';
import { focusStep, loadSettings, saveSettings, SettingsPanel, type Settings } from './settings.ts';
import { LEVELS } from '../world/levels/index.ts';
import { showLoadingCard } from './loading-card.ts';

/** Game version number (vite.config.ts → package.json). */
declare const __APP_VERSION__: string;

/** Image numbers in INTRFACE.LST: menu background, button released, button pressed. */
const ART = { background: 140, buttonUp: 299, buttonDown: 300 };
const MENU_MUSIC = '07DESERT';
/** Button click sound (SOUND\SFX). */
const CLICK = 'IB1P1XX1';

/** The original layout in pixels of a 640×480 screen: button lamp, rows every 41 pixels, label centre. */
const LAYOUT = { lampX: 425, firstY: 45, step: 41, lamp: 26, textCenterX: 520, right: 615, hitHeight: 36, hitPad: 5 };

type ItemId = 'new' | 'continue' | 'load' | 'settings' | 'workshop' | 'quit';

const ITEMS: { id: ItemId; label: StringKey }[] = [
  { id: 'new', label: 'menuNewGame' },
  { id: 'continue', label: 'menuContinue' },
  { id: 'load', label: 'menuLoad' },
  { id: 'settings', label: 'menuSettings' },
  { id: 'workshop', label: 'menuWorkshop' },
  { id: 'quit', label: 'menuQuit' },
];

const STYLE_ID = 'main-menu-style';

/** Menu styles live next to the code: cqw units are fractions of the game screen width, so everything grows with the window. */
const STYLE = `
.main-menu { height: 100%; display: grid; place-items: center; background: var(--bg); }
.menu-stage {
  position: relative;
  width: min(100vw, calc(100vh * 4 / 3));
  aspect-ratio: 4 / 3;
  container-type: inline-size;
  overflow: hidden;
  background: #000;
}
.menu-bg { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
.menu-list { position: absolute; inset: 0; }
.menu-item {
  position: absolute;
  left: ${(LAYOUT.lampX / 640) * 100}%;
  width: ${((LAYOUT.right - LAYOUT.lampX) / 640) * 100}%;
  top: calc((var(--row) * ${LAYOUT.step} + ${LAYOUT.firstY - LAYOUT.hitPad}) / 480 * 100%);
  height: ${(LAYOUT.hitHeight / 480) * 100}%;
  display: flex;
  align-items: center;
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--accent);
  font-size: 3.4375cqw;
  line-height: 1;
  text-shadow: 0 1px 0 #000, 0 0 0.6cqw #000;
  cursor: pointer;
}
.menu-lamp {
  flex: 0 0 ${(LAYOUT.lamp / 640) * 100}cqw;
  aspect-ratio: 1;
  background: var(--lamp-up) center / 100% 100% no-repeat;
  image-rendering: pixelated;
}
.menu-item:active .menu-lamp { background-image: var(--lamp-down); }
.menu-item:focus .menu-lamp { filter: brightness(1.6); }
/* The label is centred on the plate: the right padding equals the lamp width. */
.menu-label { flex: 1; text-align: center; margin-right: ${(LAYOUT.lamp / 640) * 100}cqw; }
.menu-item:hover:not(:disabled) .menu-label,
.menu-item:focus .menu-label { color: #ffe3a0; }
.menu-item:disabled { cursor: default; opacity: 0.45; }
.menu-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 6cqw 2.3cqw 1.8cqw;
  background: linear-gradient(to top, rgba(11, 10, 8, 0.9), rgba(11, 10, 8, 0));
  pointer-events: none;
}
.menu-title { margin: 0; font-size: 6.9cqw; line-height: 1; font-weight: normal; letter-spacing: 0.6cqw; color: var(--accent); text-shadow: 0 0.3cqw 0 #000; }
.menu-disclaimer { margin: 0.8cqw 0 0; font-size: 2.8cqw; color: var(--muted); }
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.append(style);
}

export interface MainMenuOptions {
  /** The game's shared sound engine (one for the menu and the game). */
  sound: Sound;
  /** Whether there are saves — then "Continue" is enabled. */
  canContinue: boolean;
  onNewGame: () => void;
  onContinue: () => void;
  /** Test range: a map for checking mechanics (enemies, weapons, time). */
  onPolygon: () => void;
  /** Location editor: draw your own location variants. */
  onEditor: () => void;
  /** Game from the save chosen on the "Load" screen. Not set — the menu starts the game itself. */
  onLoad?: (data: SaveData) => void;
}

/**
 * Shows the main menu and plays the menu music. "New game" and "Continue" remove the menu and call their handler.
 * Returns when the menu is already on screen (an error reading the game files is an exception: then the caller decides).
 */
export async function showMainMenu(root: HTMLElement, options: MainMenuOptions): Promise<void> {
  const { sound } = options;
  ensureStyle();
  const [assets, settings, list] = await Promise.all([
    GameAssets.load(),
    loadSettings(),
    platform.readGameFile('ART\\INTRFACE\\INTRFACE.LST').then(parseLst),
  ]);
  const art = (index: number) => {
    const file = list[index];
    if (!file) throw new Error('No interface image ' + index);
    return assets.image('ART\\INTRFACE\\' + file);
  };
  const [background, lampUp, lampDown] = await Promise.all([art(ART.background), art(ART.buttonUp), art(ART.buttonDown)]);

  const applyVolume = (s: Settings) => {
    sound.setSfxVolume(s.sfx / 100);
    sound.setMusicVolume(s.music / 100);
  };
  applyVolume(settings);
  void sound.preload([CLICK]);
  // The music starts as soon as the browser allows sound (after the first click or key); in the game window — at once.
  void sound.playMusic(MENU_MUSIC);

  root.innerHTML = `
    <main class="main-menu">
      <div class="menu-stage">
        <nav class="menu-list"></nav>
        <div class="menu-footer">
          <h1 class="menu-title"></h1>
          <p class="menu-disclaimer"></p>
        </div>
      </div>
    </main>`;
  const stage = root.querySelector<HTMLElement>('.menu-stage')!;
  stage.style.setProperty('--lamp-up', `url(${lampUp.toDataURL()})`);
  stage.style.setProperty('--lamp-down', `url(${lampDown.toDataURL()})`);
  background.className = 'menu-bg';
  background.setAttribute('aria-hidden', 'true');
  stage.prepend(background);

  const nav = root.querySelector<HTMLElement>('.menu-list')!;
  const buttons = new Map<ItemId, HTMLButtonElement>();
  ITEMS.forEach((item, row) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-item';
    button.style.setProperty('--row', String(row));
    button.innerHTML = '<span class="menu-lamp" aria-hidden="true"></span><span class="menu-label"></span>';
    nav.append(button);
    buttons.set(item.id, button);
  });
  // "Continue" — the latest save; while there are no saves, the button is disabled.
  buttons.get('continue')!.disabled = !options.canContinue;
  buttons.get('load')!.disabled = !options.canContinue;

  const fillTexts = () => {
    document.title = t('title');
    root.querySelector('.menu-title')!.textContent = t('title');
    root.querySelector('.menu-disclaimer')!.textContent = `${t('disclaimer')} · v${__APP_VERSION__}`;
    nav.setAttribute('aria-label', t('title'));
    for (const item of ITEMS) {
      const button = buttons.get(item.id)!;
      button.querySelector('.menu-label')!.textContent = t(item.label);
      if ((item.id === 'continue' || item.id === 'load') && !options.canContinue) button.title = t('menuNoSaves');
    }
  };
  fillTexts();

  let settingsOpen = false;
  const onKey = (e: KeyboardEvent) => {
    sound.resume();
    if (settingsOpen) return;
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      focusStep(nav, e.code === 'ArrowDown' ? 1 : -1);
    } else if (e.code === 'Tab') {
      e.preventDefault();
      focusStep(nav, e.shiftKey ? -1 : 1);
    }
  };
  const onMouse = () => sound.resume();
  window.addEventListener('keydown', onKey);
  window.addEventListener('mousedown', onMouse);

  const openSettings = async () => {
    settingsOpen = true;
    // Custom locations: which locations have variants from the editor (names as in the game) and which are selected.
    const [variants, chosen] = await Promise.all([platform.listLocations().catch(() => []), platform.readLocationChoice()]);
    const byBase = new Map<string, string[]>();
    for (const v of variants) if (LEVELS[v.base]) byBase.set(v.base, [...(byBase.get(v.base) ?? []), v.name].sort());
    const placeList = [...byBase].map(([base, names]) => ({ base, title: LEVELS[base]!.title?.[getLang() === 'en' ? 'en' : 'ru'] ?? base, variants: names }));
    const host = document.createElement('div');
    host.className = 'pause';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-labelledby', 'settings-title');
    const card = document.createElement('div');
    card.className = 'pause-card';
    const panel = new SettingsPanel({
      settings: { ...settings },
      onChange: (next, key, commit) => {
        Object.assign(settings, next);
        applyVolume(settings);
        if (!commit) return;
        saveSettings(settings);
        if (key === 'sfx') sound.play(CLICK);
      },
      onLanguage: (lang) => {
        setLang(lang);
        void platform.setLang(lang);
        fillTexts();
      },
      folder: { inGame: false },
      places: {
        list: placeList.sort((a, b) => a.title.localeCompare(b.title)),
        chosen,
        onChoose: (next) => void platform.writeLocationChoice(next).catch(() => {}),
      },
      onBack: () => {
        window.removeEventListener('keydown', onSettingsKey, true);
        host.remove();
        settingsOpen = false;
        sound.play(CLICK);
        buttons.get('settings')!.focus();
      },
    });
    // While the settings are open, only they hear the keys (capture — before the menu handler).
    const onSettingsKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.code === 'Escape' && e.repeat) return;
      if (panel.handleKey(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onSettingsKey, true);
    card.append(panel.element);
    host.append(card);
    root.append(host);
    panel.focusFirst();
  };

  /**
   * "Workshop": test range and location editor. A window over the menu, like the settings: the menu panel has exactly
   * six slots drawn for buttons, a seventh would stick out of the frame.
   */
  const openWorkshop = () => {
    settingsOpen = true;
    const host = document.createElement('div');
    host.className = 'pause';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-labelledby', 'workshop-title');
    host.innerHTML = `
      <div class="pause-card">
        <section class="panel">
          <h2 class="panel-title" id="workshop-title"></h2>
          <div class="pause-buttons">
            <button class="menu-button" id="workshop-polygon" type="button"></button>
            <button class="menu-button" id="workshop-editor" type="button"></button>
            <button class="menu-button" id="workshop-back" type="button"></button>
          </div>
        </section>
      </div>`;
    const $ = (id: string) => host.querySelector<HTMLButtonElement>('#' + id)!;
    host.querySelector('#workshop-title')!.textContent = t('menuWorkshop');
    $('workshop-polygon').textContent = t('menuPolygon');
    $('workshop-editor').textContent = t('menuEditor');
    $('workshop-back').textContent = t('settingsBack');
    const close = () => {
      window.removeEventListener('keydown', onWorkshopKey, true);
      host.remove();
      settingsOpen = false;
    };
    const onWorkshopKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      close();
      sound.play(CLICK);
      buttons.get('workshop')!.focus();
    };
    window.addEventListener('keydown', onWorkshopKey, true);
    const go = (next: () => void) => () => {
      sound.play(CLICK);
      close();
      leave(next)();
    };
    $('workshop-polygon').addEventListener('click', go(options.onPolygon));
    $('workshop-editor').addEventListener('click', go(options.onEditor));
    $('workshop-back').addEventListener('click', () => {
      sound.play(CLICK);
      close();
      buttons.get('workshop')!.focus();
    });
    root.append(host);
    $('workshop-polygon').focus();
  };

  const leave = (next: () => void) => () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('mousedown', onMouse);
    sound.stopMusic();
    next();
  };

  /** Game from the chosen save: the handler from the menu settings or, if there is none, our own start with a return to the menu on error. */
  const startLoaded = (data: SaveData) => {
    if (options.onLoad) {
      options.onLoad(data);
      return;
    }
    showLoadingCard(root);
    startGame(root, { sound, load: data }).catch((e) => {
      console.error(e);
      void showMainMenu(root, options);
    });
  };

  /** "Load": the slot screen; once a save is chosen, the menu goes away and the game starts from it. */
  const openLoad = async () => {
    settingsOpen = true;
    const picked: { data: SaveData | null } = { data: null };
    await openSaveScreen({
      root,
      mode: 'load',
      sound,
      load: async (slot) => {
        const data = await platform.readSave(slot).catch(() => null);
        if (!isSaveData(data)) return false;
        picked.data = data;
        return true;
      },
    });
    settingsOpen = false;
    const data = picked.data;
    if (data) leave(() => startLoaded(data))();
    else buttons.get('load')!.focus();
  };

  const actions: Record<ItemId, () => void> = {
    new: leave(options.onNewGame),
    continue: leave(options.onContinue),
    load: () => void openLoad(),
    settings: () => void openSettings(),
    workshop: () => openWorkshop(),
    quit: () => platform.quit(),
  };
  for (const item of ITEMS) {
    buttons.get(item.id)!.addEventListener('click', () => {
      sound.play(CLICK);
      actions[item.id]();
    });
  }
  buttons.get(options.canContinue ? 'continue' : 'new')!.focus();
}
