// Startup: if the Fallout copy isn't set yet — the setup screen, then the main menu, then the game.
import './ui/styles.css';
import { Sound } from './audio/sound.ts';
import { newCharacter, SKILL, type Character } from './game/character.ts';
import { CharacterScreen } from './game/character-screen.ts';
import { playMovie } from './game/movie-player.ts';
import { PickCharacterScreen } from './game/pick-character.ts';
import { loadPremades } from './game/premade.ts';
import { gamepad } from './game/gamepad.ts';
import { latestSave, startGame } from './game/play.ts';
import { detectLang, setLang, t } from './i18n.ts';
import { platform } from './platform.ts';
import { showIntroCard } from './ui/intro-card.ts';
import { showLocationEditor } from './ui/location-editor.ts';
import { showMainMenu } from './ui/main-menu.ts';
import { showLoadingCard } from './ui/loading-card.ts';
import { showSetup } from './ui/setup.ts';
import { parseLevelDef } from './world/defs.ts';
import { textureNames } from './world/known-textures.ts';
import { loadBlockLibrary } from './world/block-library.ts';
import { LEVELS } from './world/levels/index.ts';
import { decodeLocation, encodeLocation, levelFromLocation, type EditorLocation } from './world/location-file.ts';

const root = document.getElementById('app')!;
/** One audio engine for the whole game: menus and maps. */
const sound = new Sound();
// The gamepad is listened to from the first screen: main menu, character creation, the game (src/game/gamepad.ts).
gamepad.start();
// Dev mode: the server was stopped — the page stays open, but sound is switched off at once.
if (import.meta.hot) import.meta.hot.on('vite:ws:disconnect', () => sound.shutdown());

/**
 * Location editor ↔ "Walk it yourself" — via a page reload: the game can't stop in the middle of a run, and this way
 * nothing of it remains, neither sound nor keys. The drawing is carried over by sessionStorage (lives while the window is open).
 */
const EDITOR_HANDOFF = '150days.editor';
interface Handoff {
  action: 'walk' | 'edit';
  file: unknown;
  dirty: boolean;
}
function handOff(handoff: Handoff): void {
  try {
    sessionStorage.setItem(EDITOR_HANDOFF, JSON.stringify(handoff));
  } catch {
    // Without storage the drawing can't be carried over — the main menu opens.
  }
  window.location.reload();
}
function takeHandoff(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(EDITOR_HANDOFF);
    sessionStorage.removeItem(EDITOR_HANDOFF);
    return raw ? (JSON.parse(raw) as Handoff) : null;
  } catch {
    return null;
  }
}

/** A ready-made hero without the creation screen: for testing and for "Walk it yourself" in the location editor. */
function readyHero(): Character {
  const character = newCharacter();
  character.special = { ...character.special, strength: 7, perception: 7, agility: 6 };
  character.tagged = [SKILL.smallGuns, SKILL.lockpick, SKILL.speech];
  return character;
}

/** No ready-made test hero: then no movies are shown either. */
const quickStart = () => Boolean((window as unknown as { __skipCharacter?: boolean }).__skipCharacter);

/**
 * Hero selection, as in the original: one of three premade ones (take as is or change in the editor) or your own from scratch.
 * Cancel in the editor — back to selection, "Back" in selection — null. If the game copy has no premade heroes — straight to the editor.
 */
async function chooseCharacter(): Promise<Character | null> {
  const premades = await loadPremades();
  const editor = new CharacterScreen(root);
  if (premades.length === 0) return editor.open(newCharacter());
  const picker = new PickCharacterScreen(root, premades, sound);
  for (;;) {
    const choice = await picker.open();
    if (choice.action === 'back') return null;
    if (choice.action === 'take') return choice.character;
    const made = await editor.open(choice.action === 'modify' ? choice.character : newCharacter());
    if (made) return made;
  }
}

/**
 * "New Game": the intro movie (how the world works), hero selection (cancel — back to the main menu), then
 * the Overseer's speech (what has to be done) — and the game. Movies are skipped with Esc.
 * For testing: `window.__skipCharacter = true` in the console — "New Game" starts right away with a ready-made hero
 * (tag skills — "Small Guns", "Lockpick", "Speech"; five free points — into Strength, Perception and Agility).
 */
async function createCharacter(): Promise<Character | null> {
  if (quickStart()) return readyHero();
  root.innerHTML = '';
  await playMovie(root, 'INTRO', sound).catch((e: unknown) => console.error(e));
  const character = await chooseCharacter();
  if (character) {
    await playMovie(root, 'OVRINTRO', sound).catch((e: unknown) => console.error(e));
    // Why there's no tutorial: nobody has been outside — you'll have to figure things out yourself.
    await showIntroCard(root);
  }
  return character;
}

/** While the game loads — a loading screen with a tip (src/ui/loading-card.ts). */
function showLoading(): void {
  showLoadingCard(root);
}

async function boot(error = ''): Promise<void> {
  const config = await platform.getConfig();
  setLang(detectLang(config.lang));
  document.title = t('title');
  const failed = (e: unknown) => {
    console.error(e);
    showSetup(root, config.gameDir, () => void boot(), t('errorLoad'));
  };
  if (!config.gameOk || error) {
    showSetup(root, config.gameDir, () => void boot(), error);
    return;
  }
  // The block library (the blocks folder) — before locations from the editor: they may contain custom blocks.
  await loadBlockLibrary();
  // Came back from the location editor or leaving for "Walk it yourself".
  const handoff = takeHandoff();
  const back = handoff ? decodeLocation(handoff.file, LEVELS, textureNames()) : null;
  if (handoff && back) {
    if (handoff.action === 'edit') {
      openEditor(back, handoff.dirty);
      return;
    }
    const def = levelFromLocation(back, LEVELS[back.base]!);
    LEVELS[back.base] = def;
    const entry = Object.keys(parseLevelDef(def).entries)[0] ?? '';
    showLoading();
    const onBack = () => handOff({ action: 'edit', file: handoff.file, dirty: handoff.dirty });
    startGame(root, { sound, character: readyHero(), walk: { map: back.base, entry, onBack } }).catch(failed);
    return;
  }
  showLoading();
  try {
    const save = await latestSave();
    await showMainMenu(root, {
      sound,
      canContinue: !!save,
      onNewGame: () => {
        void createCharacter().then((character) => {
          if (!character) return void boot();
          showLoading();
          startGame(root, { sound, character }).catch(failed);
        });
      },
      onContinue: () => {
        showLoading();
        startGame(root, { sound, load: save ?? undefined }).catch(failed);
      },
      onPolygon: () => {
        showLoading();
        startGame(root, { sound, polygon: true }).catch(failed);
      },
      onEditor: () => openEditor(),
    });
  } catch (e) {
    failed(e);
  }
}

/** The location editor; resume — the location we returned with from "Walk it yourself". */
function openEditor(resume?: EditorLocation, resumeDirty = false): void {
  void showLocationEditor(root, {
    sound,
    resume,
    resumeDirty,
    onExit: () => void boot(),
    onWalk: (location, dirty) => handOff({ action: 'walk', file: encodeLocation(location), dirty }),
  }).catch((e: unknown) => {
    console.error(e);
    void boot();
  });
}

void boot();
