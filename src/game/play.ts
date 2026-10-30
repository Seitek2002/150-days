// The game on screen: picture, controls, pause, inventory, automap, elevator, map transitions, saves.
// What happens on the map is in scene.ts, the whole playthrough in session.ts.
import type { Sound } from '../audio/sound.ts';
import { FULL_RES, NO_FRAME, Renderer, setViewDetail, VIEW_H, VIEW_W, type Billboard } from '../engine/renderer.ts';
import { lineHeight, renderText, type BitmapFont } from '../formats/font.ts';
import { createTextures } from '../engine/textures.ts';
import { formatDecimal, getLang, setLang, t, tf, type StringKey } from '../i18n.ts';
import { platform } from '../platform.ts';
import { PauseMenu } from '../ui/pause.ts';
import { openSaveScreen } from '../ui/save-screen.ts';
import { loadSettings, saveSettings } from '../ui/settings.ts';
import { parseLevelDef, type Destination, type LevelDef } from '../world/defs.ts';
import { LEVELS, POLYGON_START } from '../world/levels/index.ts';
import { useLocationVariants } from '../world/location-variants.ts';
import { applyLibrary, exportBuiltinsOnce } from '../world/block-library.ts';
import { PID } from '../world/pids.ts';
import { PolygonPanel, type PolygonChoice } from './polygon-panel.ts';
import { groupPlaces, JumpPanel, type JumpGroup } from './jump-panel.ts';
import { parseMsg } from '../formats/text.ts';
import { INDICATOR_TEXT, indicators, type IndicatorKey } from './indicators.ts';
import { radiationLevel } from './conditions.ts';
import { hpTone, type HudIndicator, type HpTone } from './hud.ts';
import {
  windowOrigin,
  ARRIVE_RADIUS,
  CURSE,
  curseSquad,
  ENCOUNTERS,
  EVENT_EVERY,
  lateSquad,
  type Squad,
  PLACE_ENTRANCES,
  placeEntrance,
  PLACE_NAME_MSG,
  SQUARE_CELLS,
  SQUARE_HOURS,
  SQUARE_KM,
  STASH,
  WASTELAND,
  squareAt,
  squareMiddle,
  ZONE_RADIUS,
} from '../world/wasteland.ts';
import { PLACES, terrainAt, type PlaceKey } from '../world/worldmap.ts';
import { cacheCaps, isSpecialRoll, pickSpecial, SPECIAL_PARTS, specialVar, type SpecialKey } from '../world/special-encounters.ts';
import { wallAt } from '../engine/level.ts';
import { drawCompass, type CompassTarget } from './compass.ts';
import { isRevealed, markVisited, placePoint, placeState, revealAround, revealPath, targetPoint, travelHours } from './travel.ts';
import { placeOfLevel } from '../world/places.ts';
import { ambushPack, CARAVAN, CARAVAN_DRIVERS, CARAVAN_JOBS, caravanMiddle, crewAlive, crewSpot, JOB, newCaravanTrip, routeAt, routeLength, settleJob, tripRoute } from './caravan.ts';

/** Where the caravan ambushed on this map was heading (in the original the destination is set by the ambush map number — script CARENCTR). */
const AMBUSH_DESTINATION: Record<string, PlaceKey> = {
  'caravan-desert-1': 'boneyard',
  'caravan-desert-2': 'necropolis',
  'caravan-mountain-1': 'junktown',
  'caravan-mountain-2': 'brotherhood',
  // The way back to the Hub (the caravan master in town, CARVLEAD).
  'caravan-desert-4': 'hub',
  'caravan-mountain-4': 'hub',
};
import { formatHours, WorldMapScreen, type WorldMapData } from './worldmap-screen.ts';
import { outdoorAt } from './daylight.ts';
import { localSiderealTime, moonPlace } from '../engine/stars.ts';
import { drawLabel, labelWidth, wrapText } from './fonts.ts';
import { elevatorScreen } from './elevator-screen.ts';
import { gamepad, LookAccel, padLabels, padPrompt, padState, usingPad } from './gamepad.ts';
import { loadPipBoy } from './pipboy.ts';
import { questGroups, questNews } from './quests.ts';
import { Resources, SFX } from './resources.ts';
import { isSaveData, type SaveData } from './save.ts';
import { FLARE_LIGHT, type Elevator, type Examined, type FloatText, type Scene, type SceneDoor, type SceneProp } from './scene.ts';
import { LOCAL_SPEED } from './clock.ts';
import { Session, type PartyMember } from './session.ts';
import { CompanionSheet } from './companion-sheet.ts';
import { skillsFor } from './companion.ts';
import { CompanionTalk } from './companion-talk.ts';
import { LLOYD_CHANCE, LLOYD_PID, LloydEggs, lloydMark, WORKER_PID } from './lloyd.ts';
import { ownPicture } from './weapon-pixels.ts';
import { drawWeapon, FILE_PICTURE_AREAS, filePicture, weaponPicture, type FlashKind, type WeaponLook, type WeaponPicture } from './weapon-view.ts';
import { CharacterSheet } from './character-sheet.ts';
import { loadSkillNames, Skilldex, skillTitle } from './skilldex.ts';
import { SpeedRays } from './speed-rays.ts';
import { Geiger } from '../audio/geiger.ts';
import { geigerRate, geigerVolume, lookVisible, radiationLook, type RadiationLook } from './radiation.ts';
import { RadiationView, YELLOW_TINT, yellowShade } from './radiation-view.ts';
import { endingLines, endingSlides, gameOver, type GameOver } from './endings.ts';
import { playEndingSlides } from './ending-screen.ts';
import { DialogueScreen } from './dialogue-screen.ts';
import { playMovie, SCRIPT_MOVIES } from './movie-player.ts';
import { declinedKey, ScriptRuntime } from './scripts.ts';
import { externalVars } from '../script/vm.ts';
import { levelForExperience, PERK, perkRank, SKILL, skillLevel, type Character } from './character.ts';
import { BOOK_SKILL, bookGain, isBook, readingHours } from './books.ts';
import { drugHeal, healsHp, revealRadius } from './fighter.ts';
import { DAMAGE_TYPE, ITEM_TYPE, type ItemProto } from '../formats/pro.ts';
import { AIM_PARTS, aimedChance, isGrenade, KNOCKDOWN_TIME, knockView, type AimPart } from './combat.ts';
import { rollCheck, rollIsSuccess } from './rolls.ts';
import { AP_COST, canWield, type Hero, type WeaponItem } from './hero.ts';
import type { Creature } from './creature.ts';
import { afterLoadingCard, LoadingCard } from '../ui/loading-card.ts';

const SCREEN_W = 640;
const SCREEN_H = 480;
const QUICK_SLOT = 'quick';
/** Overhead lines farther than this (cells) are not visible: unreadable. */
const FLOAT_RANGE = 9;
/** Width of an overhead line (screen pixels); a long line is wider — up to FLOAT_MAX_WIDTH, so there are no more than FLOAT_LINES lines. */
const FLOAT_WIDTH = 180;
const FLOAT_MAX_WIDTH = 600;
const FLOAT_LINES = 3;
/** How often the "what you see" hint asks the critter's look-at script again (seconds). */
const SEEN_REFRESH_SECONDS = 1.5;
/** The critter's script was busy — how long until asking again (seconds). */
const SEEN_RETRY_SECONDS = 0.2;
/** Width of the "what you see" line above the key hint (screen pixels); longer wraps to a second line. */
const SEEN_WIDTH = 560;
/** Line width of the big caption (drawBanner). */
const BANNER_WIDTH = 520;
/** How many seconds the booth flickers before disappearing. */
const TARDIS_VANISH = 2.4;
/** What is shown when the hero stumbles on a special encounter (our own words: the original lines of five encounters out of six are broken). */
const SPECIAL_TEXT: Record<SpecialKey, StringKey> = {
  foot: 'msgSpecialFoot',
  cows: 'msgSpecialCows',
  usedCars: 'msgSpecialUsedCars',
  tardis: 'msgSpecialTardis',
  saucer: 'msgSpecialSaucer',
  capsCache: 'msgSpecialCapsCache',
};
/** "Night Vision" (as in the original description — 10% less darkness per rank): in the dark you see sight farther, light by light. */
const NIGHT_VISION = { sight: 0.1, light: 0.1 } as const;
/** "Scrounger" (as in the original description): twice as much ammo in finds on the road (and in the pockets of the dead in the wasteland — scene.ts). */
const SCROUNGER = { ammo: 2 } as const;
/** "Mysterious Stranger": chance (%), bonus per Luck point, after how many seconds he arrives, prototype, weapon, when he leaves. */
const STRANGER = { chance: 30, perLuck: 2, delay: 2.5, pid: PID.mysteriousStranger, weapons: [PID.assaultRifle, PID.huntingRifle], calm: 8 } as const;

export interface StartOptions {
  /** Shared sound engine (the same as the main menu's). */
  sound: Sound;
  /** Load this save instead of a new game. */
  load?: SaveData;
  /** Start on the test range (main menu). */
  polygon?: boolean;
  /** New game: the hero from the character creation screen. */
  character?: Character;
  /** "Walk it yourself" from the location editor: start at this location; "To the editor" in the pause menu — onBack. */
  walk?: { map: string; entry: string; onBack: () => void };
}

/** The last save (for "Continue" in the main menu). */
export async function latestSave(): Promise<SaveData | null> {
  const list = await platform.listSaves().catch(() => []);
  for (const entry of list) {
    const data = await platform.readSave(entry.slot).catch(() => null);
    if (isSaveData(data)) return data;
  }
  return null;
}

/** The original's explosives: PID → damage (dynamite 30–50, plastic explosives 40–80, as in Fallout). */
const EXPLOSIVES: Record<number, { min: number; max: number }> = { 51: { min: 30, max: 50 }, 85: { min: 40, max: 80 } };
/**
 * Flare (prototype 79), as in the original: "use" lights it (light around the hero), again — throws it forward,
 * and it burns on the floor; it burns out in an hour of game time (on maps — LOCAL_SPEED game seconds per real one) and is gone
 * without a trace. Throw range is like a thrown weapon's: 3 hexes per Strength point, but no farther than its own 15.
 */
const FLARE_PID = 79;
const FLARE_SECONDS = 3600 / LOCAL_SPEED;
const FLARE_THROW_HEXES = 15;
/** Grenade: beyond how many cells it can't be thrown, and how long it flies (seconds). */
const GRENADE_RANGE = 8;
const GRENADE_FLIGHT = 0.7;
/**
 * After a fight, once everything is quiet (this many seconds without fighting or shots), the hero lowers the weapon on his own — where there are peaceful
 * NPCs: otherwise the Junktown guards demand it be put away, and if it isn't, they attack. A shot (LMB) or Q draws it again.
 */
const CALM_HOLSTER_SECONDS = 2;
/** After how many seconds the charge explodes (Traps success and failure). */
const CHARGE_SECONDS = 10;
const CHARGE_FUMBLE_SECONDS = 3;
/**
 * Momentum: from which speed (cells per second; walk 2.6, run 4.4) it is felt, and how much more is full strength
 * (bunny hopping accelerates without limit). FOV grows from 90° to RUSH_FOV_MAX (client decision, 2026-10-22: up to 130°);
 * RUSH_EASE — how fast the FOV adjusts (per second). Speed rays start at RAYS_FROM momentum, full strength at full.
 */
const RUSH_FROM = 3.2;
const RUSH_SPAN = 9;
const RUSH_FOV_MAX = 130;
const RUSH_EASE = 6;
const RAYS_FROM = 0.4;
/** Speed in the top-right corner — just a number, km/h = cells per second × KMH_PER_CELL (walk about 5, run about 9). */
const KMH_PER_CELL = 2;
/** How fast the crosshair circle catches up with the spread (per second): smoothly, but without lag. */
const SPREAD_EASE = 14;
/** Ammo label at the crosshair: offset from the aim point, color, and the "low ammo" color (a quarter of the magazine or less). */
/** How many pixels wide a label fits into a status plate (frame 130, 3 pixels from each edge). */
const INDICATOR_FIT = 124;
/** Radius of the delay ring at the crosshair when there is no spread circle or it is smaller (melee, aimed shot). */
const COOLDOWN_RING = 9;
const AMMO_LABEL = { dx: 12, dy: 8, color: '#e9dcc0', low: '#ff8070', shadow: '#0b0a08' } as const;
/** Camera shake from a hit on the hero: how far the view is knocked sideways (radians) and up-down (pitch pixels). */
const HURT_JOLT = { angle: 0.035, pitch: 10 };
/**
 * Constellations (client, 2026-10-24): how many seconds to look at the starry night sky for the stars to join with lines,
 * how long you may look away without resetting the count, and how fast the lines appear and fade (per second).
 */
/**
 * Night sky watching (client, 2026-10-26): stand still and look at the sky for seconds seconds — the eyes adapt
 * to the dark (Renderer.nightAdapt): more and more stars, clouds thin out, the Milky Way, galaxies and Moon craters show, and at the end —
 * constellations and, once per game, +5% to the "Outdoorsman" skill. Turning your head and looking into the inventory is fine; a step
 * farther than stay cells — the count pauses until you stand still again. Adapted eyes stay that way until morning — on any map
 * (client, 2026-10-26; the count is in the pc:skyGaze variable, which is also saved). show and hide — how fast the constellation
 * lines appear and fade, forget — how fast the adaptation fades at dawn.
 */
const STAR_GAZE = { seconds: 75, stay: 0.3, show: 0.6, hide: 2.5, forget: 1.5 };
/**
 * Shooting stars at night (client, 2026-10-26): a new one every `every` seconds (min and max), off to the side of the view; size — 1 (small,
 * more often), 2, 3 (bright, rarer); speed across the sky, tail length and lifetime depend on size.
 */
const METEORS = { every: [1, 5], speed: [0.55, 1.1], life: [0.45, 1.2] } as const;
/**
 * Sky watching hint (client, 2026-10-26): Tikhon in the party, night under the open sky, quiet for after seconds —
 * he says more stars appear if you look long enough. Once per night (variable hint:sky — the day), until the hero
 * finds the constellations on his own.
 */
const SKY_HINT = { script: 'TYCHO', after: 20, reach: 8 } as const;
/** Reward for the constellations: this many percent of the "Outdoorsman" skill, once per game (variable pc:stargazer). */
const STARGAZER_BONUS = 5;

/** How much momentum the hero has: 0 — walking, 1 — full strength. */
const speedRush = (speed: number): number => Math.max(0, Math.min(1, (speed - RUSH_FROM) / RUSH_SPAN));

/** A skill in use is interrupted if the hero moves farther than this many cells from where he started. */
const SKILL_CANCEL_DISTANCE = 0.6;

/** Which weapon picture to draw in hand — by the weapon animation code (like the letters of the original's pictures). */
/** Fallout 1's "12 gauge" caliber — shotguns. */
const CALIBER_SHOTGUN = 11;

/**
 * Which weapon picture in hand: by the original's animation code (1 — knife, 2–3 — club and hammer, 4 — spear, 5 — pistol,
 * 6 — SMG, 7 — rifle, 8 — flamer and heavy, 9 — minigun, 10 — rocket launcher), caliber and damage type.
 */
/**
 * Items with their own in-hand picture (file public/weapons/<name>.png), even though their weapon kind is shared with others: the combat knife
 * is not a plain knife (client's pictures, 2026-10-21). The rest — by weapon kind (pistol, smg, knife…).
 */
const ITEM_PICTURES: Readonly<Record<number, string>> = { [PID.combatKnife]: 'combatKnife' };

function weaponLook(hero: Hero): WeaponLook {
  if (!hero.weaponItem) return 'fist';
  const w = hero.weapon;
  const code = w.animationCode ?? 0;
  // A throwing knife in hand looks like a knife (the throw is a thrust forward), a rock has no picture of its own.
  if (hero.melee || hero.thrown) return code === 4 ? 'spear' : code === 0 ? 'fist' : code === 2 || code === 3 ? 'club' : 'knife';
  const laser = w.damageType === DAMAGE_TYPE.laser;
  const plasma = w.damageType === DAMAGE_TYPE.plasma || w.damageType === DAMAGE_TYPE.electrical;
  switch (code) {
    case 5:
      return laser ? 'laserPistol' : plasma ? 'plasmaPistol' : 'pistol';
    case 6:
      return 'smg';
    case 8:
      return 'flamer';
    case 9:
      return laser ? 'laserRifle' : 'minigun';
    case 10:
      return 'rocket';
    default:
      return laser ? 'laserRifle' : plasma ? 'plasmaRifle' : w.caliber === CALIBER_SHOTGUN ? 'shotgun' : 'rifle';
  }
}

/** Muzzle flash color by damage type. */
function flashKind(hero: Hero): FlashKind {
  const type = hero.weapon.damageType;
  if (type === DAMAGE_TYPE.laser) return 'laser';
  if (type === DAMAGE_TYPE.plasma || type === DAMAGE_TYPE.electrical) return 'plasma';
  return type === DAMAGE_TYPE.fire ? 'fire' : 'bullet';
}

export async function startGame(root: HTMLElement, options: StartOptions): Promise<void> {
  const walkStart = options.walk ? { map: options.walk.map, entry: options.walk.entry } : undefined;
  const res = await Resources.load(options.sound);
  /** Our own locations: when loading — those the save was made with, in a new game — those chosen in settings (except "Walk it yourself"). */
  const placeVariants = async (data?: SaveData) => {
    if (options.walk) return;
    await useLocationVariants(data ? (data.locations ?? {}) : await platform.readLocationChoice());
  };
  await placeVariants(options.load);
  let session = options.load
    ? await Session.fromSave(res, options.load)
    : await Session.newGame(res, walkStart ?? (options.polygon ? POLYGON_START : undefined), options.character);
  // The tip on the loading screen has been read — now the game.
  await afterLoadingCard();

  root.innerHTML = `
    <main class="game">
      <canvas class="screen" width="${SCREEN_W}" height="${SCREEN_H}"></canvas>
      <div class="hint"><div class="hint-main"></div><div class="status"></div></div>
      <div class="overlay" hidden role="dialog" aria-live="assertive">
        <h2 class="overlay-title"></h2>
        <p class="overlay-text"></p>
        <p class="overlay-stats"></p>
        <p class="overlay-hint"></p>
        <p class="overlay-hint overlay-load"></p>
      </div>
      <div class="elevator" hidden role="dialog" aria-modal="true"></div>
      <div class="rad-yellow" hidden aria-hidden="true"></div>
      <canvas class="rad-noise" width="${SCREEN_W}" height="${SCREEN_H}" hidden aria-hidden="true"></canvas>
    </main>`;
  const canvas = root.querySelector('canvas')!;
  const hint = root.querySelector<HTMLElement>('.hint')!;
  const [hintMain, hintMove] = hint.querySelectorAll<HTMLElement>('div');
  /** Labels outside the game screen: updated in place when the language changes in settings. */
  const fillTexts = () => {
    document.title = t('title');
    canvas.setAttribute('aria-label', t('title'));
    hintMain!.textContent = t('hintClick');
    hintMove!.textContent = t('hintControls');
  };
  fillTexts();
  const overlay = root.querySelector<HTMLElement>('.overlay')!;
  const elevatorBox = root.querySelector<HTMLElement>('.elevator')!;
  /** Loading screen with a tip — for travel to another location and for loading a save. */
  const loadingCard = new LoadingCard(root.querySelector<HTMLElement>('.game')!);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  // The 3D view is drawn at low resolution and stretched 2x — like in Doom.
  const view = document.createElement('canvas');
  view.width = VIEW_W;
  view.height = VIEW_H;
  const viewCtx = view.getContext('2d')!;
  const viewHeight = SCREEN_H - res.hud.height;
  // Our drawings and the block library on top; our drawings are also written to the blocks folder (once per launch, in the background).
  const textures = applyLibrary(createTextures());
  exportBuiltinsOnce(textures);
  const renderer = new Renderer(textures);
  // The weapon in hand is the inventory picture from the player's copy (loaded once per weapon kind; while loading — nothing).
  const pictures = new Map<number, WeaponPicture | null>();
  const heldPicture = (item: ItemProto | null): WeaponPicture | null => {
    if (!item) return null;
    if (!pictures.has(item.pid)) {
      pictures.set(item.pid, null);
      void res.data
        .inventoryImage(item)
        .then((canvas) => {
          const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
          // The spear in the inventory is drawn with the tip to the left, but the tip is "thicker" than the shaft — we say so explicitly.
          const spear = (item.weapon?.animationCode ?? 0) === 4;
          if (data) pictures.set(item.pid, weaponPicture(data, spear ? 'left' : undefined));
        })
        .catch(() => {});
    }
    return pictures.get(item.pid) ?? null;
  };
  // Our own first-person weapon pictures are files public/weapons/<name>.png (the client puts them there): an item from
  // ITEM_PICTURES has its own name, otherwise by weapon kind; no file — null (then the kind's picture, then its own, then the inventory one).
  const files = new Map<string, WeaponPicture | null | 'loading'>();
  const fileByName = (name: string, look: WeaponLook): WeaponPicture | null => {
    if (!files.has(name)) {
      files.set(name, 'loading');
      // .png first, then .webp (generators often produce it).
      const tryLoad = (ext: string, next?: () => void) => {
        const image = new Image();
        image.onload = () => files.set(name, filePicture(image, FILE_PICTURE_AREAS[look]));
        image.onerror = () => (next ? next() : files.set(name, null));
        image.src = `weapons/${name}.${ext}`;
      };
      tryLoad('png', () => tryLoad('webp'));
    }
    const pic = files.get(name);
    return pic && pic !== 'loading' ? pic : null;
  };
  const filePictureOf = (item: ItemProto, look: WeaponLook): WeaponPicture | null => {
    const own = ITEM_PICTURES[item.pid];
    return (own ? fileByName(own, look) : null) ?? fileByName(look, look);
  };

  const { sound, screens, automap } = res;
  const pipboy = await loadPipBoy(res.data, sound);
  // Dialogues are run by the original's scripts from the player's copy (src/game/scripts.ts); the window uses the original's pictures (dialogue-screen.ts).
  const dialogue = new DialogueScreen(root.querySelector('.game')!, sound);
  // Trading in the dialogue window: item names and pictures come from the player's copy.
  dialogue.items = { name: (proto) => res.itemName(proto), image: (proto) => res.data.inventoryImage(proto) };
  /** An original movie is playing (play_gmovie): the game is paused. */
  let movieOpen = false;
  // World map (M): travel destination, fast travel to locations the hero has visited.
  const worldMap = new WorldMapScreen(root.querySelector('.game')!);
  // Test range: panel (F2) — enemies, items, time.
  const polygon = new PolygonPanel(root.querySelector('.game')!);
  // "Go to location" (F9, hidden — for testing): any location at once, without travel.
  const jump = new JumpPanel(root.querySelector('.game')!);
  // Character screen (K): level, skills, perks.
  const sheet = new CharacterSheet(root.querySelector('.game')!);
  const companionSheet = new CompanionSheet(root.querySelector('.game')!);
  /** The hero's or a companion's sheet is open. */
  const sheetOpen = () => sheet.isOpen || companionSheet.isOpen;
  // Skilldex (U): a skill on whatever is in front of the hero.
  const skilldex = new Skilldex(root.querySelector('.game')!);
  const onPolygon = () => session.scene.def.id === POLYGON_START.map;
  if (onPolygon()) session.say(t('msgPolygon'));
  const scripts = await ScriptRuntime.load(res, dialogue);
  scripts.useSession(session);
  await scripts.enterMap(null);

  // World map location names come from the player's copy (GAME\MAP.MSG); no file — our keys remain.
  const placeNames = new Map<PlaceKey, string>();
  const PLACE_KEYS = Object.keys(PLACES) as PlaceKey[];
  try {
    const B = String.fromCharCode(92);
    const msg = parseMsg(await platform.readGameFile(`TEXT${B}ENGLISH${B}GAME${B}MAP.MSG`));
    for (const key of PLACE_KEYS) {
      const name = msg.get(PLACE_NAME_MSG[key]);
      if (name) placeNames.set(key, name);
    }
  } catch {
    // Without names the compass shows the location keys.
  }
  const placeName = (key: PlaceKey) => placeNames.get(key) ?? key;
  // Status plate labels above the message screen (indicators.ts) come from the player's copy; no file — ours.
  const indicatorMsgs = new Map<string, Map<number, string>>();
  for (const file of ['INTRFACE.MSG']) {
    const B = String.fromCharCode(92);
    const bytes = await platform.readGameFile(`TEXT${B}ENGLISH${B}GAME${B}${file}`).catch(() => null);
    if (bytes) indicatorMsgs.set(file, parseMsg(bytes));
  }
  const indicatorText = (key: IndicatorKey) => {
    const d = INDICATOR_TEXT[key];
    const text = d.file && d.id !== undefined ? indicatorMsgs.get(d.file)?.get(d.id)?.trim() : undefined;
    // Doesn't fit in the frame (in another copy of the game the label is longer) — ours.
    return text && labelWidth(res.fonts.main, text.toUpperCase()) <= INDICATOR_FIT ? text.toUpperCase() : t(d.fallback);
  };
  let detach = session.player.attach(canvas);
  let firingMouse = false;
  /** Gamepad fire: right trigger is pressed while a weapon is in hand (released — stopped). */
  let firingPad = false;
  /** Right-stick look with smooth turn acceleration. */
  const padLook = new LookAccel();
  /** "Examine" mode (V): the crosshair is binoculars, LMB examines what is in the crosshair instead of shooting. */
  let looking = false;
  /**
   * Aimed attack (client, 2026-10-29; combat.ts → AIMED): RMB toggles it on and off, on the gamepad — hold LT. With the crosshair on
   * an enemy — a list of body parts with chances on the right; wheel, 1–8 or the d-pad — choose, LMB or RT — attack.
   */
  let aimMode = false;
  let aimPart: AimPart = 'torso';
  /** A transition to another map or a load is in progress — the game is paused. */
  let busy = false;
  /** A dialogue started by an NPC is in progress (the window may not have opened yet): the next request comes after it. */
  let talking = false;
  /** Who the dialogue is with (script key): a quest taken in it is remembered under them (quests.ts → giverVar). */
  let talkKey: string | undefined;
  /** On-screen radius of the crosshair circle (catches up with the spread smoothly). */
  let shownSpread = 0;
  /** Current FOV (degrees; catches up with momentum smoothly) and speed rays. */
  let shownFov = 90;
  /** How bright the hero's flare has grown (0–1): the light comes on and fades smoothly. */
  let flareShine = 0;
  /** How many seconds the hero has looked at the stars and how many not (constellations). */
  /** How many seconds of quiet night under the open sky with Tikhon nearby (SKY_HINT). */
  let skyHintWait = 0;
  /** Until the next shooting star (seconds). */
  let meteorWait = 2;
  /** Whether the hero was knocked down last frame (to say so once). */
  let wasKnocked = false;
  /** Where the hero stands while looking at the sky (moved — the count pauses until he stands still again). */
  let gazeFrom: { x: number; y: number; scene: unknown } = { x: 0, y: 0, scene: null };
  const speedRays = new SpeedRays();
  /** Radiation at the Glow: screen noise and the Geiger counter (src/game/radiation.ts). */
  const radiationView = new RadiationView();
  const geiger = new Geiger(sound);
  // In windows the noise is on top of the window: a yellow tint layer and a transparent canvas exactly over the game screen (styles.css — .rad-noise).
  const radYellow = root.querySelector<HTMLElement>('.rad-yellow')!;
  radYellow.style.background = YELLOW_TINT;
  const radNoise = root.querySelector<HTMLCanvasElement>('.rad-noise')!;
  const radNoiseCtx = radNoise.getContext('2d')!;
  /** Show noise over windows (look = null — remove). */
  const radOverlay = (look: RadiationLook | null, dt: number) => {
    radYellow.hidden = !look || look.yellow <= 0;
    radNoise.hidden = !look;
    if (!look) return;
    const r = canvas.getBoundingClientRect();
    for (const el of [radYellow, radNoise]) {
      Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    }
    radYellow.style.opacity = String(yellowShade(look.yellow));
    radNoiseCtx.clearRect(0, 0, SCREEN_W, SCREEN_H);
    radiationView.draw(radNoiseCtx, SCREEN_W, viewHeight, look, dt, SCREEN_H);
  };
  let state: 'play' | 'dead' | 'won' | 'lost' = 'play';
  /** How the playthrough ended (finale, water, invasion) — for the results screen. */
  let ending: GameOver = null;
  let elevator: Elevator | null = null;
  const locked = () => document.pointerLockElement === canvas;

  // Settings from the pause menu: volume to sound, mouse to the player, picture quality to the frame size.
  const settings = await loadSettings();
  const applySettings = () => {
    sound.setSfxVolume(settings.sfx / 100);
    sound.setMusicVolume(settings.music / 100);
    session.player.sensitivity = settings.sensitivity;
    session.player.invertY = settings.invertY;
    setViewDetail(settings.fastGraphics ? 1 : FULL_RES);
  };
  applySettings();

  /** Switch playthrough (new game or load): the player is new — reconnect controls, map scripts from the start. */
  const useSession = async (next: Session) => {
    detach();
    session = next;
    debug.session = next;
    detach = session.player.attach(canvas);
    scripts.useSession(next);
    applySettings();
    state = 'play';
    ending = null;
    overlay.hidden = true;
    await scripts.enterMap(null);
  };

  // For testing and debugging: the game state and the option to play without mouse capture.
  const debug = {
    session,
    screens,
    automap,
    pipboy,
    scripts,
    dialogue,
    talk: (c: Creature) => talk(c),
    renderer,
    sound,
    settings,
    /** Apply changed settings (for testing: e.g. settings.fastGraphics = true). */
    applySettings: () => applySettings(),
    pause: null as PauseMenu | null,
    examine: null as (() => Promise<void>) | null,
    unpause: false,
    fire: false,
    travel: (to: Destination) => travel(to),
    quickSave: () => quickSave(),
    quickLoad: () => quickLoad(),
    /** Wasteland: set up an encounter or a find ahead right now (for testing). */
    roadEvent: () => roadEvent(),
    /** Use an inventory item by PID — the same as clicking it in the inventory (for testing). */
    useItem: (pid: number) => {
      const stack = session.hero.inventory.items.find((s) => s.proto.pid === pid);
      if (stack) void useItem(stack.proto);
    },
    /** Use an item by PID from the hand — the same as LMB with it in hand (for testing). */
    useInHand: (pid: number) => {
      const stack = session.hero.inventory.items.find((s) => s.proto.pid === pid);
      if (stack) useHeld(stack.proto);
    },
    /** Shared script variables (export_var / store_external) — for testing. */
    externals: () => externalVars(),
    /** Radiation where the hero is (for testing): field strength and accumulated exposure. */
    radiation: () => ({ field: session.radiationField(), rads: session.vars['pc:radiation'] ?? 0 }),
    /** Run the game forward (set below, at the frame loop). */
    step: (_seconds: number) => {},
    /** A special encounter and a squad in front of the hero (set below). */
    meetSpecial: (_key: SpecialKey): Promise<void> => Promise.resolve(),
    spawnSquad: (_squad: Squad, _hunt?: boolean): Promise<Creature[]> => Promise.resolve([]),
    /** Test range: the same as the panel buttons (for testing). */
    polygon: {
      spawn: (pid: number, weapon = 0, count = 1, hostile = true) => polygonSpawn(pid, weapon, count, hostile),
      get actions() {
        return polygonActions;
      },
    },
  };
  (window as unknown as { __game: typeof debug }).__game = debug;

  /** A window over the game is open: pause, inventory, Pip-Boy, dialogue, map, character sheet and others. */
  const windowOpen = () =>
    screens.open || automap.open || pipboy.open || pause.open || !!elevator || dialogue.isOpen || worldMap.isOpen || polygon.isOpen || jump.isOpen || sheetOpen() || skilldex.isOpen;
  const syncHint = () => {
    // With a gamepad people play without mouse capture — the "Click to play" hint isn't needed.
    hint.hidden = locked() || windowOpen() || usingPad();
  };
  const pause: PauseMenu = new PauseMenu(root.querySelector('.game')!, {
    settings: () => settings,
    onSettingsChange: (next, key, commit) => {
      Object.assign(settings, next);
      applySettings();
      if (!commit) return;
      saveSettings(settings);
      // The sound slider was released — a click at the new volume so it can be heard.
      if (key === 'sfx') sound.play(SFX.click);
    },
    onLanguage: (lang) => {
      setLang(lang);
      void platform.setLang(lang);
      fillTexts();
    },
    onResume: () => closePause(),
    // The slot screen (src/ui/save-screen.ts) opens over the pause menu; the game is paused while it is open. Saving and loading work like quickSave and quickLoad.
    onSave: (done) => {
      void openSaveScreen({
        root,
        mode: 'save',
        sound,
        save: async (slot) => {
          const ok = await platform.writeSave(slot, session.toSave()).catch(() => false);
          if (ok) session.say(t('msgSaved'));
          return ok;
        },
      }).then(() => done());
    },
    onLoad: (done) => {
      void openSaveScreen({
        root,
        mode: 'load',
        sound,
        load: async (slot) => {
          const data = await platform.readSave(slot).catch(() => null);
          if (!isSaveData(data)) return false;
          busy = true;
          try {
            await placeVariants(data);
            const next = await Session.fromSave(res, data);
            await useSession(next);
            next.say(t('msgLoaded'));
            return true;
          } finally {
            busy = false;
          }
        },
      }).then((loaded) => {
        // Loaded — no need for the pause menu: close it and return to the game.
        if (loaded) closePause();
        done();
      });
    },
    onQuit: () => (options.walk ? options.walk.onBack() : platform.quit()),
    toEditor: Boolean(options.walk),
  });
  debug.pause = pause;
  // For testing: "examine" without mouse capture (LMB in V mode).
  debug.examine = () => examine();

  // Mouse capture with "raw" movement (no Windows acceleration): with it Chromium doesn't send the spikes that made the camera
  // fly off on a fast turn. Not supported — regular capture.
  // Playing with a gamepad — don't capture the mouse (the game runs without capture too).
  const capture = () =>
    usingPad()
      ? Promise.resolve()
      : Promise.resolve(canvas.requestPointerLock({ unadjustedMovement: true }))
      .catch(() => canvas.requestPointerLock())
      .catch(() => {});
  const stopFiring = () => {
    firingMouse = false;
    firingPad = false;
  };

  /** Pause: the game is stopped, the mouse is free. Doesn't open over other windows or after death or victory. */
  const openPause = () => {
    if (
      pause.open ||
      screens.open ||
      automap.open ||
      pipboy.open ||
      elevator ||
      dialogue.isOpen ||
      movieOpen ||
      worldMap.isOpen ||
      polygon.isOpen ||
      sheetOpen() ||
      skilldex.isOpen ||
      busy ||
      state !== 'play' ||
      !session.hero.alive
    )
      return;
    stopFiring();
    sound.play(SFX.click);
    pause.show();
    syncHint();
    if (locked()) document.exitPointerLock();
  };
  const closePause = () => {
    pause.hide();
    sound.play(SFX.click);
    syncHint();
    // If the browser won't allow mouse capture without a click, the "Click to play" hint stays.
    capture();
  };

  /** Mouse coordinates in pixels of the 640×480 game screen (the window may be stretched). */
  const toScreen = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) * SCREEN_W) / rect.width, y: ((e.clientY - rect.top) * SCREEN_H) / rect.height };
  };
  const openScreen = (open: () => void) => {
    if (state !== 'play' || busy || !session.hero.alive) return;
    open();
    sound.play(SFX.click);
    stopFiring();
    hint.hidden = true;
    canvas.style.cursor = 'default';
    if (locked()) document.exitPointerLock();
  };
  const afterScreen = () => {
    if (screens.open || automap.open || pipboy.open || elevator || dialogue.isOpen || worldMap.isOpen || polygon.isOpen || jump.isOpen || sheetOpen() || skilldex.isOpen) return;
    sound.play(SFX.click);
    canvas.style.cursor = '';
    // The window was closed with a click or a key — return to the game right away.
    capture();
  };

  // ---------- wasteland: travel on foot, compass, location zones, encounters ----------
  /** Which location's green zone the hero is in and at which entrance he stands (so as not to "arrive" every frame). */
  let zoneAt: PlaceKey | null = null;
  let arrivedAt: PlaceKey | null = null;
  let recentering = false;
  /** How many cells of travel until the next encounter or find. */
  let untilEvent: number = EVENT_EVERY.max;
  const between = (a: number, b: number) => a + Math.random() * (b - a);
  const knownPlaces = () => PLACE_KEYS.filter((key) => placeState(session.vars, key) >= 1);
  /** G — the next known location as the destination (quick, without the world map). */
  const nextTarget = () => {
    const known = knownPlaces();
    if (known.length === 0) {
      session.say(t('msgNoTargets'));
      return;
    }
    const current = session.target;
    const at = current && 'place' in current ? known.indexOf(current.place) : -1;
    const next = known[(at + 1) % known.length]!;
    session.setTarget({ place: next });
    session.say(tf('msgTarget', { name: placeName(next) }));
  };
  /** A world map point (in squares) in wasteland window coordinates. */
  const toWindow = (p: { x: number; y: number }) => {
    const o = windowOrigin(session.wasteland!.center);
    return { x: p.x * SQUARE_CELLS - o.x, y: p.y * SQUARE_CELLS - o.y };
  };
  /** Beams in the wasteland: green at locations, light blue at the travel destination (location or marker). */
  const beacons = (): Billboard[] => {
    const wl = session.wasteland;
    if (!wl) return [];
    const target = session.target;
    const targetPlace = target && 'place' in target ? target.place : null;
    const list: Billboard[] = [];
    const near = (p: { x: number; y: number }) => p.x >= -2 && p.y >= -2 && p.x <= 3 * SQUARE_CELLS + 2 && p.y <= 3 * SQUARE_CELLS + 2;
    for (const key of PLACE_KEYS) {
      const m = toWindow(placePoint(key));
      if (near(m)) list.push({ x: m.x, y: m.y, frame: NO_FRAME, shiftX: 0, shiftY: 0, beam: key === targetPlace ? 'blue' : 'green' });
    }
    if (target && 'point' in target) {
      const m = toWindow(target.point);
      if (near(m)) list.push({ x: m.x, y: m.y, frame: NO_FRAME, shiftX: 0, shiftY: 0, beam: 'blue' });
    }
    return list;
  };
  const worldMapData = (): WorldMapData => {
    const hero = session.heroOnMap();
    // Whatever is where the hero is now is open (even if he didn't arrive on foot — e.g. at the start of the game).
    revealAround(session.vars, hero);
    return {
      hero,
      clock: session.clock,
      revealed: (column, row) => isRevealed(session.vars, column, row),
      target: session.target,
      canTravel: !session.hero.inCombat,
      places: knownPlaces().map((key) => {
        const p = placePoint(key);
        return {
          key,
          name: placeName(key),
          square: PLACES[key],
          visited: placeState(session.vars, key) === 2,
          // In a location's green zone the hero is already there — nowhere to go.
          hours: Math.hypot(p.x - hero.x, p.y - hero.y) * SQUARE_CELLS < ZONE_RADIUS ? 0 : session.fastTravelHours(key),
          km: Math.hypot(p.x - hero.x, p.y - hero.y) * SQUARE_KM,
        };
      }),
    };
  };
  const closeWorldMap = () => {
    worldMap.close();
    afterScreen();
  };
  const openWorldMap = () =>
    openScreen(() =>
      worldMap.open(worldMapData(), {
        setTarget: (target) => session.setTarget(target),
        travel: (key) => {
          closeWorldMap();
          void fastTravel(key);
        },
        close: closeWorldMap,
      }),
    );
  // ---------- test range ----------
  /** Who can be placed and with what (names come from the player's copy). */
  const POLYGON_CREATURES = [
    PID.caveRat,
    PID.pigRat,
    PID.radRat,
    PID.strongMoleRat,
    PID.smallRadscorpion,
    PID.dog,
    PID.raider,
    PID.thug,
    PID.guard,
    PID.villagerGuard,
    PID.townsman,
    PID.vaultDwellerMale,
  ];
  const POLYGON_WEAPONS = [PID.knife, 5, 7, PID.pistol10mm, 9, 18, 22, PID.shotgun];
  let polygonChoices: { creatures: PolygonChoice[]; weapons: PolygonChoice[] } | null = null;
  const loadPolygonChoices = async () => {
    polygonChoices ??= {
      creatures: await Promise.all(
        POLYGON_CREATURES.map(async (pid) => ({ pid, name: await res.data.critter(pid).then((p) => res.data.critterName(p)).catch(() => pid.toString(16)) })),
      ),
      weapons: await Promise.all(POLYGON_WEAPONS.map(async (pid) => ({ pid, name: await res.item(pid).then((p) => res.itemName(p)).catch(() => String(pid)) }))),
    };
    return polygonChoices;
  };
  /** Place enemies ahead of the hero: 8–14 cells away, in a fan, on free ground. */
  const polygonSpawn = async (pid: number, weapon: number, count: number, hostile: boolean) => {
    const { player, scene } = session;
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const a = player.angle + (Math.random() - 0.5) * 1.2;
        const d = 8 + Math.random() * 6;
        const x = player.x + Math.cos(a) * d;
        const y = player.y + Math.sin(a) * d;
        if (wallAt(scene.level, x, y)) continue;
        const c = await scene.spawnCreature(pid, x, y, weapon);
        c.hostile = hostile;
        // Humans get a stimpak each (like the hero): to check whether the wounded heal.
        if (!scene.kindOfCreature(c)?.bites) c.inventory.add(res.loadout.stimpak, 1);
        c.turnTo(Math.atan2(player.y - y, player.x - x));
        break;
      }
    }
  };
  const polygonActions = {
    spawn: (pid: number, weapon: number, count: number, hostile: boolean) => void polygonSpawn(pid, weapon, count, hostile),
    clear: () => {
      for (const c of session.scene.creatures) c.gone = true;
    },
    immortal: () => session.hero.immortal,
    setImmortal: (on: boolean) => (session.hero.immortal = on),
    heal: () => (session.hero.hp = session.hero.maxHp),
    addAmmo: () => session.hero.inventory.add(res.loadout.ammo, 50),
    addStimpaks: () => session.hero.inventory.add(res.loadout.stimpak, 5),
    setHour: (hour: number) => {
      const d = session.clock.date;
      let hours = (hour - d.hour - d.minute / 60 + 24) % 24;
      if (hours < 0.01) hours = 24;
      session.clock.advance(hours * 3600);
    },
    close: () => closePolygon(),
  };
  const openPolygon = async () => {
    const choices = await loadPolygonChoices();
    openScreen(() => polygon.open(choices.creatures, choices.weapons, polygonActions));
  };
  const closePolygon = () => {
    polygon.close();
    afterScreen();
  };
  /** Entrance where to put the hero when jumping from the "Go to location" window: from the wasteland side if there is one, otherwise the first. */
  const jumpEntry = (def: LevelDef): string => {
    const entries = Object.keys(def.entries ?? {});
    if (entries.includes('wasteland')) return 'wasteland';
    return entries[0] ?? Object.keys(parseLevelDef(def).entries)[0] ?? '';
  };
  /** Locations for the "Go to location" window: the wasteland at each world map location, then all maps by town. */
  const jumpGroups = (): JumpGroup[] => {
    const lang = getLang();
    const levels = Object.values(LEVELS).map((def) => ({ id: def.id, title: def.title?.[lang] ?? def.id, to: { map: def.id, entry: jumpEntry(def) } }));
    const wasteland = PLACE_KEYS.map((key) => ({ label: placeName(key), name: `${t('jumpWasteland')}: ${placeName(key)}`, id: `${WASTELAND}:${key}`, to: { map: WASTELAND, entry: key } }));
    return [{ title: t('jumpWasteland'), places: wasteland }, ...groupPlaces(levels, t('jumpOther'))];
  };
  const closeJump = () => {
    jump.close();
    afterScreen();
  };
  const openJump = () =>
    openScreen(() =>
      jump.open(jumpGroups(), session.scene.def.id, (to) => {
        closeJump();
        void travel(to);
      }),
    );
  /** What to do when the companion sheet is closed (his numbers are recalculated from the points spent). */
  let companionSheetDone: (() => void) | null = null;
  const closeSheet = () => {
    if (companionSheet.isOpen) {
      companionSheet.close();
      companionSheetDone?.();
      companionSheetDone = null;
    } else sheet.close();
    afterScreen();
  };
  sheet.onDone(closeSheet);
  companionSheet.onDone(closeSheet);
  /** Companion sheet: skills and points (companion-sheet.ts); ends when it is closed. */
  const openCompanionSheet = async (m: PartyMember): Promise<void> => {
    const gun = m.kind.weaponPid ? await res.item(m.kind.weaponPid) : null;
    const c = m.creature;
    await new Promise<void>((resolve) => {
      companionSheetDone = () => {
        void session.equipCompanion(c);
        resolve();
      };
      openScreen(() =>
        companionSheet.open(session.progressOf(m), m.base ?? m.kind.fighter, {
          name: c.stats.name,
          hp: c.hp,
          maxHp: c.stats.maxHp,
          ac: m.kind.fighter.ac,
          weapon: gun ? res.itemName(gun) : t(m.kind.bites ? 'compSheetTeeth' : 'compSheetFists'),
          skills: m.skills ?? skillsFor(m.kind),
          armor: m.armor ? res.itemName(m.armor) : t('compSheetNoArmor'),
          ...(gun?.weapon ? { gun: gun.weapon } : {}),
        }),
      );
      if (!companionSheet.isOpen) {
        companionSheetDone = null;
        resolve();
      }
    });
  };
  const closeSkilldex = () => {
    skilldex.close();
    afterScreen();
  };
  skilldex.onClose(closeSkilldex);
  /** Skilldex: the target is whatever is in front of the hero (nothing — the hero himself: heal yourself). */
  const openSkilldex = () => {
    const focus = session.scene.focus(session.player);
    const name =
      focus?.kind === 'prop'
        ? focus.prop.name
        : focus?.kind === 'npc' || focus?.kind === 'corpse'
          ? focus.creature.stats.name
          : focus?.kind === 'door'
            ? t('skilldexDoor')
            : focus?.kind === 'container'
              ? res.itemName(focus.container.proto)
              : t('skilldexSelf');
    openScreen(() => skilldex.open(session.hero.character, tf('skilldexTarget', { name }), (skill) => void useSkill(skill, focus)));
  };
  /**
   * A skill in the hero's hands (lockpick, healing, repair): the hands are busy for a few seconds — the higher the Agility, the faster
   * (Hero.startSkill), — then the action. Walked away, died, left the map or loaded a game — cancelled. While the hands are busy,
   * a second skill doesn't start.
   */
  let skillAction: { skill: number; x: number; y: number; hero: Hero; scene: Scene; done: () => void | Promise<void> } | null = null;
  let skillNames: ReadonlyMap<number, string> = new Map();
  void loadSkillNames().then((names) => (skillNames = names));
  /** lock — the hero went for a lock: NPCs around see it (scene.witnessPick). */
  const withSkill = (skill: number, done: () => void | Promise<void>, lock = false) => {
    const { hero, player, scene } = session;
    if (skillAction || !hero.alive) return;
    stopFiring();
    hero.startSkill();
    if (lock) scene.witnessPick(player);
    skillAction = { skill, x: player.x, y: player.y, hero, scene, done };
  };
  /** Skill progress per frame: cancel or, once the hands are free, the action itself. */
  const stepSkill = () => {
    const a = skillAction;
    if (!a) return;
    const { hero, player, scene } = session;
    const away = Math.hypot(player.x - a.x, player.y - a.y) > SKILL_CANCEL_DISTANCE;
    if (a.hero !== hero || a.scene !== scene || !hero.alive || away) {
      a.hero.cancelSkill();
      skillAction = null;
      if (away && hero.alive) session.say(t('msgSkillCancelled'));
      return;
    }
    if (hero.skillBusy) return;
    skillAction = null;
    void Promise.resolve()
      .then(a.done)
      .catch((e: unknown) => console.error(e));
  };
  /** Can't heal yourself anymore (health is full or three times a day) — say so at once, without occupying the hands. */
  const healRefused = (skill: number): boolean => {
    const { hero, clock, vars } = session;
    const key = `pc:${skill === SKILL.doctor ? 'doctor' : 'firstaid'}`;
    if (vars[`${key}:day`] === clock.day && (vars[`${key}:n`] ?? 0) >= 3) {
      session.say(t('msgHealTired'));
      return true;
    }
    // "Doctor" sets crippled arms and legs — even at full health.
    const limbs = skill === SKILL.doctor && (hero.crippledArm || hero.crippledLeg);
    if (hero.hp >= hero.maxHp && !limbs) {
      session.say(t('msgFullHp'));
      return true;
    }
    return false;
  };
  /**
   * Companion's items (client, 2026-10-23): with "Steal" the hero gives him weapons, ammo, stimpaks and takes them back —
   * without a roll and without offence, while he is a companion. The window is closed — the companion takes the best weapon from his items.
   */
  let companionLoot: Creature | null = null;
  const openCompanionLoot = (c: Creature) => {
    companionLoot = c;
    openScreen(() => screens.openLoot(session.hero, { name: c.stats.name, inventory: c.inventory }));
  };
  /** A skill from the Skilldex: hands busy (depending on Agility), then applySkill. Stealing from a companion — immediately. */
  const useSkill = (skill: number, focus: ReturnType<Scene['focus']>) => {
    if (skill === SKILL.steal && focus?.kind === 'npc' && session.isCompanion(focus.creature)) {
      openCompanionLoot(focus.creature);
      return;
    }
    if ((skill === SKILL.firstAid || skill === SKILL.doctor) && (!focus || focus.kind !== 'npc') && healRefused(skill)) return;
    withSkill(skill, () => applySkill(skill, focus), skill === SKILL.lockpick && (focus?.kind === 'door' || focus?.kind === 'container'));
  };
  /** Apply a skill: first the target's script, and if there is none — the game rule (lockpick, steal, heal yourself). */
  const applySkill = async (skill: number, focus: ReturnType<Scene['focus']>) => {
    const { scene, hero } = session;
    const target =
      focus?.kind === 'prop' ? { prop: focus.prop } : focus?.kind === 'door' ? { door: focus.door } : focus?.kind === 'container' ? { container: focus.container } : focus?.kind === 'npc' ? { creature: focus.creature } : null;
    if (target && skill !== SKILL.lockpick) {
      const r = await scripts.useSkillOn(target, skill);
      // The script refused (script_overrides) — done. Didn't refuse — for stealing the normal game action still runs, as in
      // the original (otherwise stealing silently did nothing on NPCs with their own skill script).
      if (r === 'refused' || (r === 'done' && skill !== SKILL.steal)) return;
    }
    if (skill === SKILL.lockpick && focus?.kind === 'door') {
      if (focus.door.script) await scripts.useDoor(focus.door, true);
      else scene.pickLock(focus.door);
      return;
    }
    if (skill === SKILL.lockpick && focus?.kind === 'container') {
      const open = focus.container.script ? await scripts.useContainer(focus.container, true) : scene.pickContainer(focus.container);
      if (open) openScreen(() => screens.openLoot(hero, { name: res.itemName(focus.container.proto), inventory: focus.container.inventory }));
      return;
    }
    if (skill === SKILL.steal && focus?.kind === 'npc') {
      stealFrom(focus.creature);
      return;
    }
    if ((skill === SKILL.firstAid || skill === SKILL.doctor) && (!focus || focus.kind !== 'npc')) {
      healSelf(skill);
      return;
    }
    // A force field with no answer of its own to the skill (the field at the vats: on alarm its consoles end up behind it) — with "Repair"
    // or "Science" it can be knocked down, like the first-floor field emitters (Opus decision: otherwise a dead end).
    if (focus?.kind === 'prop' && focus.prop.field && !focus.prop.hidden && (skill === SKILL.repair || skill === SKILL.science)) {
      const dice = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
      if (rollIsSuccess(rollCheck(hero.fighter.skills[skill] ?? 0, -20, dice, false).result) === 1) {
        scene.setPropVisible(focus.prop, false);
        session.say(t('msgFieldOff'));
      } else session.say(t('msgFieldFail'));
      return;
    }
    session.say(t('msgNothingHappens'));
  };
  /**
   * First Aid and Doctor on yourself, as in the original: a skill check, time (half an hour and an hour) and no more than three times
   * a day each. Success — health: First Aid 1–10, Doctor 5–15.
   */
  const healSelf = (skill: number) => {
    const { hero, clock, vars } = session;
    const day = clock.day;
    const key = `pc:${skill === SKILL.doctor ? 'doctor' : 'firstaid'}`;
    if (vars[`${key}:day`] !== day) {
      vars[`${key}:day`] = day;
      vars[`${key}:n`] = 0;
    }
    if ((vars[`${key}:n`] ?? 0) >= 3) {
      session.say(t('msgHealTired'));
      return;
    }
    const limbs = skill === SKILL.doctor && (hero.crippledArm || hero.crippledLeg);
    if (hero.hp >= hero.maxHp && !limbs) {
      session.say(t('msgFullHp'));
      return;
    }
    vars[`${key}:n`] = (vars[`${key}:n`] ?? 0) + 1;
    // Half an hour and an hour — at Agility 5; an agile hero is quicker.
    clock.advance((skill === SKILL.doctor ? 3600 : 1800) * hero.agilityFactor);
    const dice = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
    if (rollIsSuccess(rollCheck(hero.fighter.skills[skill] ?? 0, 0, dice, false).result) !== 1) {
      session.say(t('msgHealFail'));
      return;
    }
    const before = hero.hp;
    hero.hp = Math.min(hero.maxHp, hero.hp + (skill === SKILL.doctor ? dice(5, 15) : dice(1, 10)));
    if (hero.hp > before) session.say(tf('msgHealSkill', { n: hero.hp - before }));
    // "Doctor", as in the original, sets crippled arms and legs (combat.ts → CRIPPLE).
    if (limbs) {
      hero.crippledArm = false;
      hero.crippledLeg = false;
      session.say(t('msgDoctorLimbs'));
    }
  };
  /** Steal: a skill check — success opens the NPC's items, failure — he notices and gets angry. */
  const stealFrom = (c: Creature) => {
    const dice = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
    if (rollIsSuccess(rollCheck(session.hero.fighter.skills[SKILL.steal] ?? 0, 0, dice, false).result) === 1) {
      openScreen(() => screens.openLoot(session.hero, { name: c.stats.name, inventory: c.inventory }));
      return;
    }
    session.say(tf('msgStealCaught', { name: c.stats.name }));
    c.provoke();
  };

  /** The hero's status plates above the message screen (indicators.ts → hud.ts). */
  const heroIndicators = (): HudIndicator[] => {
    const { hero, vars, player } = session;
    const seen = (vars['pc:levelSeen'] ??= hero.level);
    return indicators({
      addicted: session.addictionList().length > 0,
      sneaking: player.sneaking,
      levelUp: hero.level > seen,
      poisoned: (vars['pc:poison'] ?? 0) > 0,
      irradiated: radiationLevel(vars['pc:radiation'] ?? 0) > 0,
      arm: hero.crippledArm ? (hero.armLeft ? 'left' : 'right') : null,
      leg: hero.crippledLeg ? (hero.legLeft ? 'left' : 'right') : null,
      overloaded: hero.overloaded,
      cursed: (vars[CURSE.variable] ?? 0) > 0,
    }).map((i) => ({ text: indicatorText(i.key), bad: i.bad }));
  };

  /** Fast travel to a location the hero has already visited: travel time is as on foot; the hero ends up in the location's green zone. */
  const fastTravel = async (key: PlaceKey) => {
    if (placeState(session.vars, key) !== 2) return;
    if (session.caravan) {
      session.say(t('msgCaravanBusy'));
      return;
    }
    if (session.hero.inCombat) {
      session.say(t('msgNoTravelInCombat'));
      return;
    }
    const hours = session.fastTravelHours(key);
    // The road reveals the map along the way.
    revealPath(session.vars, session.heroOnMap(), placePoint(key));
    session.clock.advance(hours * 3600);
    session.say(tf('msgFastTravel', { name: placeName(key), time: formatHours(hours) }));
    await travel({ map: 'wasteland', entry: key });
  };
  /** Entered a location's green zone: the location is revealed and visited; a built one — a hint on how to enter. */
  const enterZone = (key: PlaceKey) => {
    markVisited(session.vars, key);
    // Reached the destination — it is completed.
    const target = session.target;
    if (target && 'place' in target && target.place === key) session.setTarget(null);
    // With a caravan you don't enter locations — so the hint on how to enter isn't needed.
    if (!session.caravan) session.say(tf(PLACE_ENTRANCES[key] ? 'msgPlaceHere' : 'msgPlaceNotReady', { name: placeName(key) }));
  };
  /** The location zone under a point (null — the wasteland). */
  const zoneOf = (x: number, y: number): PlaceKey | null => {
    const wl = session.wasteland;
    if (!wl) return null;
    for (const key of PLACE_KEYS) {
      const m = squareMiddle(wl.center, PLACES[key]);
      if (Math.hypot(m.x - x, m.y - y) < ZONE_RADIUS) return key;
    }
    return null;
  };
  /**
   * An encounter or a find ahead: a pack of animals farther away (visible from afar — can be avoided), a find closer. The road is
   * gentler for a newcomer (Opus decision on night 14: a level 1–2 hero died on the Shady Sands → Junktown road): at level 1–2 encounters
   * are 1.5 times rarer, animals in every other one, 1–2 of them; at 3–4 — 2–3 each; beyond that — as before.
   */
  /** "Lloyd is water" easter eggs (lloyd.ts). */
  const lloydEggs = new LloydEggs();
  /** Encounter with Lloyd in the wasteland: him and three workers (ordinary figures from the original), peaceful, only calling back and forth. */
  const meetLloyd = async (x: number, y: number) => {
    session.vars['egg:lloyd'] = 1;
    const sc = session.scene;
    const calm = (c: Creature) => {
      c.hostile = false;
      return c;
    };
    const lloyd = calm(await sc.spawnCreature(LLOYD_PID, x, y));
    const workers: Creature[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const wx = x + Math.cos(a) * 1.3;
      const wy = y + Math.sin(a) * 1.3;
      if (!wallAt(sc.level, wx, wy)) workers.push(calm(await sc.spawnCreature(WORKER_PID, wx, wy)));
    }
    lloydEggs.meet(lloyd, workers);
  };
  /**
   * A squad in the wasteland (wasteland.ts → lateSquad): the first is the leader, the rest keep behind him. Deathclaws from the curse
   * go straight for the hero, and the XP for them is like for a rat. Returns the fighters (empty if the wasteland window has already changed).
   */
  const spawnSquad = async (squad: Squad, x: number, y: number, hunt: { x: number; y: number } | null): Promise<Creature[]> => {
    await Promise.all(squad.members.map((m) => res.critterKind(m.pid, m.weaponPid)));
    const cheap = squad.kind === 'curse' ? (await res.critterKind(CURSE.experienceOf)).stats.experience : null;
    const { scene } = session;
    const out: Creature[] = [];
    for (const [i, m] of squad.members.entries()) {
      for (let tries = 0; tries < 12; tries++) {
        const r = i === 0 ? 0 : between(1.2, 2.6);
        const a = Math.random() * Math.PI * 2;
        const cx = x + Math.cos(a) * r;
        const cy = y + Math.sin(a) * r;
        if (wallAt(scene.level, cx, cy)) continue;
        const c = await scene.spawnCreature(m.pid, cx, cy, m.weaponPid);
        if (session.scene !== scene) return [];
        if (cheap !== null) c.stats = { ...c.stats, experience: cheap };
        out.push(c);
        break;
      }
    }
    const leader = out[0];
    if (!leader) return out;
    // The leader roams the wasteland, the squad follows him.
    leader.wanders = true;
    for (const c of out.slice(1)) c.leader = leader;
    if (hunt) for (const c of out) c.alertTo(hunt.x, hunt.y);
    return out;
  };
  /**
   * "Outdoorsman" on the road (client, 2026-10-27: the skill was useless): a dangerous encounter is avoided with a chance of skill × avoidPer %
   * (no more than avoidMax); if not — with the skill's chance (no more than warnMax) the hero notices it in advance
   * by tracks and noise, and the enemies appear farther cells farther away. Deathclaws from the curse follow the trail — avoiding them
   * is twice as hard, and noticing them is only possible by hearing a roar behind your back.
   */
  const OUTDOORS = { avoidPer: 0.25, avoidMax: 50, warnMax: 95, farther: 6 } as const;
  const TRACKS: Record<'beasts' | Squad['kind'], { avoid: StringKey; warn: StringKey }> = {
    beasts: { avoid: 'msgTrackAvoid', warn: 'msgTrackWarn' },
    mutants: { avoid: 'msgTrackAvoidMutants', warn: 'msgTrackWarnMutants' },
    deathclaws: { avoid: 'msgTrackAvoidClaws', warn: 'msgTrackWarnClaws' },
    curse: { avoid: 'msgTrackAvoidCurse', warn: 'msgCurseHunt' },
  };
  /** Avoid ('avoid'), notice in advance ('warn') or run into it (null). */
  const readTracks = (kind: 'beasts' | Squad['kind']): 'avoid' | 'warn' | null => {
    const skill = skillLevel(session.hero.character, SKILL.outdoorsman);
    const avoid = Math.min(OUTDOORS.avoidMax, skill * OUTDOORS.avoidPer) / (kind === 'curse' ? 2 : 1);
    if (Math.random() * 100 < avoid) return 'avoid';
    if (Math.random() * 100 < Math.min(OUTDOORS.warnMax, skill)) return 'warn';
    return null;
  };
  /**
   * "Mysterious Stranger" (perk; client, 2026-10-27): on a dangerous road encounter, with a chance of STRANGER.chance% +
   * STRANGER.perLuck per Luck point, a stranger with a rifle appears next to the hero and fights on his side; once the fight is over
   * (nobody has chased anyone for STRANGER.calm seconds) — he leaves the way he came.
   */
  let stranger: { creature: Creature; calm: number } | null = null;
  const maybeStranger = () => {
    const hc = session.hero.character;
    if (!perkRank(hc, PERK.mysteriousStranger) || stranger) return;
    if (Math.random() * 100 >= STRANGER.chance + STRANGER.perLuck * session.hero.fighter.special.luck) return;
    const { scene, player } = session;
    window.setTimeout(() => {
      if (session.scene !== scene) return;
      void (async () => {
        for (let tries = 0; tries < 12; tries++) {
          const a = player.angle + Math.PI + (Math.random() - 0.5) * 1.6;
          const x = player.x + Math.cos(a) * between(2, 3.5);
          const y = player.y + Math.sin(a) * between(2, 3.5);
          if (wallAt(scene.level, x, y)) continue;
          const weapon = STRANGER.weapons[Math.floor(Math.random() * STRANGER.weapons.length)]!;
          const c = await scene.spawnCreature(STRANGER.pid, x, y, weapon);
          if (session.scene !== scene) return;
          scene.addDefender(c);
          stranger = { creature: c, calm: 0 };
          session.say(t('msgStrangerCame'));
          return;
        }
      })();
    }, STRANGER.delay * 1000);
  };
  /** The stranger leaves when the fight has died down (or he is dead). */
  const strangerStep = (dt: number) => {
    if (!stranger) return;
    const { creature: c } = stranger;
    const { scene } = session;
    if (!scene.creatures.includes(c) || !c.alive) {
      stranger = null;
      return;
    }
    const fighting = scene.creatures.some((o) => o.alive && o.present && o.hostile && !scene.allies.has(o) && (o.chasing || o.searching !== null));
    stranger.calm = fighting ? 0 : stranger.calm + dt;
    if (stranger.calm < STRANGER.calm) return;
    c.gone = true;
    session.say(t('msgStrangerLeft'));
    stranger = null;
  };
  /**
   * A special encounter — an easter egg of the original (special-encounters.ts): at the encounter site — its creatures, scenery and items, and what
   * the scripts of its maps did, we do here: the booth vanishes when the hero approaches, cows moo, Bob has his dialogue.
   * The encounter lives until the wasteland window is rebuilt (the original didn't save random encounter maps either).
   */
  let special: { tardis: { prop: SceneProp; x: number; y: number; vanish: number | null } | null; cows: Creature[]; moo: number } = { tardis: null, cows: [], moo: 3 };
  let cowTalk: string | null = null;
  const meetSpecial = async (key: SpecialKey, x: number, y: number) => {
    session.vars[specialVar(key)] = 1;
    const { scene } = session;
    const around = (r: number) => {
      for (let tries = 0; tries < 12; tries++) {
        const a = Math.random() * Math.PI * 2;
        const px = x + Math.cos(a) * r * (0.5 + Math.random() * 0.5);
        const py = y + Math.sin(a) * r * (0.5 + Math.random() * 0.5);
        if (!wallAt(scene.level, px, py)) return { x: px, y: py };
      }
      return { x, y };
    };
    session.say(t(SPECIAL_TEXT[key]));
    if (key === 'foot') {
      const p = SPECIAL_PARTS.foot;
      scene.pressFootprint(x, y, Math.random() * Math.PI * 2);
      const body = around(8);
      const c = await scene.spawnCreature(p.corpse, body.x, body.y);
      c.restore({ x: c.x, y: c.y, hp: 0, facing: Math.random() * Math.PI * 2, dead: true, hostile: false });
      for (const [pid, n] of p.items) c.inventory.add(await res.item(pid), n);
    } else if (key === 'cows') {
      const p = SPECIAL_PARTS.cows;
      special = { ...special, cows: [], moo: 3 };
      for (let i = 0; i < p.count; i++) {
        const at = around(4);
        const c = await scene.spawnCreature(p.brahmin, at.x, at.y);
        c.hostile = false;
        c.tame = true;
        special.cows.push(c);
      }
      cowTalk ??= await platform
        .readGameFile('TEXT\\ENGLISH\\DIALOG\\COW.MSG')
        .then((b) => parseMsg(b).get(102) ?? null)
        .catch(() => null);
    } else if (key === 'usedCars') {
      const p = SPECIAL_PARTS.usedCars;
      for (const [i, pid] of p.scenery.entries()) {
        const a = (i / p.scenery.length) * Math.PI * 2;
        await scene.placeScenery(pid, x + Math.cos(a) * 4, y + Math.sin(a) * 4);
      }
      const bob = await scene.spawnCreature(p.dealer, x, y);
      bob.hostile = false;
      scene.attachScript(bob, p.dealerScript);
      const a = around(3);
      await scene.placeContainer(p.footlocker, a.x, a.y, p.footlockerItems, true);
      const b = around(3);
      await scene.placeContainer(p.crate, b.x, b.y, p.crateItems);
    } else if (key === 'tardis') {
      const prop = await scene.placeScenery(SPECIAL_PARTS.tardis.box, x, y);
      if (prop) special = { ...special, tardis: { prop, x: prop.x, y: prop.y, vanish: null } };
    } else if (key === 'saucer') {
      const p = SPECIAL_PARTS.saucer;
      await scene.placeScenery(p.dome, x, y);
      for (const bones of p.bones) {
        const at = around(3);
        await scene.placeContainer(bones.pid, at.x, at.y, bones.items);
      }
    } else {
      const p = SPECIAL_PARTS.capsCache;
      for (const pid of p.crates) {
        const at = around(2.5);
        await scene.placeScenery(pid, at.x, at.y);
      }
      const caps = cacheCaps(session.hero.fighter.special.luck, perkRank(session.hero.character, PERK.fortuneFinder) > 0);
      await scene.placeContainer(p.crate, x, y, [[PID.caps, caps]]);
    }
  };
  /** Special encounter frame: the booth vanishes when the hero comes near; the cows sometimes moo, and one "talks". */
  const specialStep = (dt: number) => {
    const { scene, player } = session;
    const box = special.tardis;
    // The hero came near — a hum, the booth flickers less and less often and vanishes (VANISH seconds), a motion sensor in its place.
    if (box && box.vanish === null && Math.hypot(box.x - player.x, box.y - player.y) < SPECIAL_PARTS.tardis.near) {
      box.vanish = 0;
      res.sound.playAt(SPECIAL_PARTS.tardis.sound, box.x, box.y, player);
    }
    if (box && box.vanish !== null) {
      box.vanish += dt;
      const k = box.vanish / TARDIS_VANISH;
      if (k >= 1) {
        special = { ...special, tardis: null };
        scene.destroyProp(box.prop);
        void scene.spawnItem(SPECIAL_PARTS.tardis.item, 1, box.x, box.y);
        session.say(t('msgTardisGone'));
      } else scene.setPropVisible(box.prop, Math.sin(box.vanish * 14) > k * 2 - 1);
    }
    const cows = special.cows.filter((c) => c.alive && scene.creatures.includes(c));
    if (cows.length === 0) return;
    special.moo -= dt;
    if (special.moo > 0) return;
    special.moo = 4 + Math.random() * 5;
    const near = cows.filter((c) => Math.hypot(c.x - player.x, c.y - player.y) < 8);
    const cow = near[Math.floor(Math.random() * near.length)];
    if (!cow) return;
    // As in the original's script: one line in three is the "talking" one.
    const text = cowTalk && Math.random() < 1 / 3 ? cowTalk : t('floatMoo');
    scene.float(cow, text, '#d8d0b8');
  };
  const roadEvent = () => {
    const level = levelForExperience(session.hero.experience);
    const early = level <= 2;
    untilEvent = between(EVENT_EVERY.min, EVENT_EVERY.max) * (early ? 1.5 : 1);
    const wl = session.wasteland;
    if (!wl) return;
    const { player, scene } = session;
    const cursed = (session.vars[CURSE.variable] ?? 0) > 0;
    // Luck: a find more often than animals (Luck 5 — three encounters out of four with animals, each point ±5%). The cursed one is found by
    // deathclaws even when a find would have come up.
    const beastShare = Math.max(0.4, Math.min(0.9, 0.75 - (session.hero.fighter.special.luck - 5) * 0.05)) - (early ? 0.25 : 0);
    const beasts = cursed || Math.random() < beastShare;
    // A rare encounter with Lloyd (once per game) — instead of the usual one.
    const lloydNow = !session.vars['egg:lloyd'] && Math.random() < LLOYD_CHANCE;
    const here = squareAt(wl.center, player.x, player.y);
    const hereTerrain = terrainAt(here.column, here.row);
    const squad = beasts && !lloydNow && hereTerrain ? lateSquad(level, hereTerrain, cursed) : null;
    // An easter egg of the original — instead of the usual animals (not instead of the curse deathclaws).
    const egg =
      beasts && !lloydNow && squad?.kind !== 'curse' && isSpecialRoll(session.hero.fighter.special.luck)
        ? pickSpecial((k) => (session.vars[specialVar(k)] ?? 0) > 0)
        : null;
    if (egg) {
      for (let tries = 0; tries < 12; tries++) {
        const a = player.angle + (Math.random() - 0.5) * 1.0;
        const d = between(9, 13);
        const x = player.x + Math.cos(a) * d;
        const y = player.y + Math.sin(a) * d;
        if (wallAt(scene.level, x, y) || zoneOf(x, y)) continue;
        void meetSpecial(egg, x, y);
        return;
      }
    }
    const kind = squad?.kind ?? 'beasts';
    const tracks = beasts && !lloydNow ? readTracks(kind) : null;
    if (tracks === 'avoid') {
      session.say(t(TRACKS[kind].avoid));
      return;
    }
    if (tracks === 'warn') session.say(t(TRACKS[kind].warn));
    const extra = tracks === 'warn' ? OUTDOORS.farther : 0;
    for (let tries = 0; tries < 12; tries++) {
      // Curse deathclaws also come from behind.
      const a = kind === 'curse' ? player.angle + Math.PI + (Math.random() - 0.5) * 2.4 : player.angle + (Math.random() - 0.5) * 1.2;
      const d = beasts ? between(14, 22) + (squad ? 4 : 0) + extra : between(7, 11);
      const x = player.x + Math.cos(a) * d;
      const y = player.y + Math.sin(a) * d;
      if (wallAt(scene.level, x, y) || zoneOf(x, y)) continue;
      const square = squareAt(wl.center, x, y);
      const terrain = terrainAt(square.column, square.row);
      if (!terrain) return;
      if (lloydNow) {
        void meetLloyd(x, y);
        return;
      }
      if (beasts) maybeStranger();
      if (squad) {
        void spawnSquad(squad, x, y, kind === 'curse' ? { x: player.x, y: player.y } : null);
        return;
      }
      if (beasts) {
        const kinds = ENCOUNTERS[terrain].kinds;
        if (kinds.length === 0) return;
        const pid = kinds[Math.floor(Math.random() * kinds.length)]!;
        const pack = early ? 1 + Math.floor(Math.random() * 2) : level <= 4 ? 2 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 3);
        for (let i = pack; i > 0; i--) {
          const bx = x + between(-1.5, 1.5);
          const by = y + between(-1.5, 1.5);
          if (!wallAt(scene.level, bx, by)) void scene.spawnCreature(pid, bx, by);
        }
      } else {
        const s = STASH[Math.floor(Math.random() * STASH.length)]!;
        // "Fortune Finder": finds are twice as rich.
        const rich = 1 + perkRank(session.hero.character, PERK.fortuneFinder);
        // "Scrounger": twice as much ammo in a find.
        const ammo = s.pid === PID.ammo10mmJhp && perkRank(session.hero.character, PERK.scrounger) ? SCROUNGER.ammo : 1;
        void scene.spawnItem(s.pid, Math.round(between(s.min, s.max) * rich * ammo), x, y);
      }
      return;
    }
  };
  /**
   * Wasteland frame. Outside location zones time passes only with the distance travelled (stand still — it stands still too) and encounters happen.
   * In the green zone, as inside locations, time stands still (client decision): only actions move it — rest, healing, reading.
   * At the middle of a built location — a transition to its level. Left the square — the window is rebuilt around the new one.
   */
  const wastelandStep = (moved: number) => {
    const wl = session.wasteland;
    if (!wl) return;
    const { player } = session;
    const zone = zoneOf(player.x, player.y);
    // World map fog: reveal the squares around the hero (a sharp-eyed one — farther).
    // "Scout" — one more square farther.
    const hc = session.hero.character;
    revealAround(session.vars, session.heroOnMap(), revealRadius(session.hero.fighter.special.perception) + perkRank(hc, PERK.scout));
    if (zone !== zoneAt) {
      zoneAt = zone;
      if (zone) enterZone(zone);
    }
    // With a caravan time passes along its route, there are no road encounters (the ambush is its own): caravanStep.
    if (!zone && !session.caravan) {
      // "Pathfinder": the road takes 25% less time per rank.
      session.clock.advance(((moved * SQUARE_HOURS * 3600) / SQUARE_CELLS) * (1 - 0.25 * perkRank(hc, PERK.pathfinder)));
      untilEvent -= moved;
      if (untilEvent <= 0) roadEvent();
    }
    const target = session.target;
    if (target && 'point' in target) {
      const m = toWindow(target.point);
      if (Math.hypot(m.x - player.x, m.y - player.y) < ARRIVE_RADIUS) {
        session.setTarget(null);
        session.say(t('msgTargetReached'));
      }
    }
    let near: PlaceKey | null = null;
    if (zone) {
      const m = squareMiddle(wl.center, PLACES[zone]);
      if (Math.hypot(m.x - player.x, m.y - player.y) < ARRIVE_RADIUS) near = zone;
    }
    if (near !== arrivedAt) {
      arrivedAt = near;
      const door = near ? placeEntrance(near, session.vars) : undefined;
      // With a caravan you don't enter locations — get it there first.
      if (door && session.caravan) session.say(t('msgCaravanBusy'));
      else if (door) void travel(door);
    }
    const square = squareAt(wl.center, player.x, player.y);
    if (recentering || (square.column === wl.center.column && square.row === wl.center.row)) return;
    // The window is rebuilt when the hero has moved a few cells past the edge of his square (no "jitter" at the border).
    const past = Math.max(SQUARE_CELLS - player.x, player.x - 2 * SQUARE_CELLS, SQUARE_CELLS - player.y, player.y - 2 * SQUARE_CELLS);
    if (past < 4) return;
    recentering = true;
    void session.recenter(square).finally(() => (recentering = false));
  };
  /**
   * Travel destination for the compass. In the wasteland — from the hero; at a location (town, vault; client, 2026-10-24: the compass disappeared) — from
   * this location's point on the world map, cardinal directions the same. A destination that is where the hero is now has no marker.
   */
  const compassTarget = (): CompassTarget | null => {
    const target = session.target;
    if (!target) return null;
    const name = 'place' in target ? placeName(target.place) : t('compassPoint');
    if (!session.wasteland) {
      const here = placeOfLevel(session.scene.def.id);
      if (!here || ('place' in target && target.place === here)) return null;
      const from = placePoint(here);
      const to = targetPoint(target);
      return { name, bearing: Math.atan2(to.y - from.y, to.x - from.x), km: Math.hypot(to.x - from.x, to.y - from.y) * SQUARE_KM };
    }
    const m = toWindow(targetPoint(target));
    const dx = m.x - session.player.x;
    const dy = m.y - session.player.y;
    return { name, bearing: Math.atan2(dy, dx), km: (Math.hypot(dx, dy) / SQUARE_CELLS) * SQUARE_KM };
  };

  /** Transition to another map: the game is paused until the new map is ready. */
  /**
   * A caravan journey interrupted by an ambush: the caravan master's script takes the hero to the ambush map (its number in the original is the
   * trip's destination), the exit from it leads to the destination town. Half the travel time is before the ambush, half after.
   */
  const caravanLeg = (from: PlaceKey, to: PlaceKey) => {
    const hours = travelHours(placePoint(from), placePoint(to)) / 2;
    session.clock.advance(hours * 3600);
    return hours;
  };
  /** quiet — without a loading screen (elevator: it has its own window). */
  const travel = async (to: Destination, quiet = false) => {
    if (busy) return;
    // Left the wasteland while the caravan is on the way (location, fast travel, script) — abandoned the caravan.
    if (session.caravan && session.scene.def.id === WASTELAND) abandonCaravan('fled');
    // Leaving the ambush for the destination town — the second half of the caravan's road.
    const fromAmbush = session.scene.def.id.startsWith('caravan-');
    const arrive = fromAmbush ? placeOfLevel(to.map) : null;
    // This trip's hire: on exit the ambush script decides — arrived, abandoned (attackers alive) or the caravan's people died.
    const job = arrive ? CARAVAN_JOBS.find((n) => session.vars[`g${n}`] === JOB.onWay) : undefined;
    let ambushNote = '';
    if (fromAmbush && arrive) {
      const from = PLACE_KEYS.find((k) => PLACES[k].column === session.vars['cvan:col'] && PLACES[k].row === session.vars['cvan:row']);
      const hours = from ? caravanLeg(from, arrive) : 0;
      session.vars['wl:col'] = PLACES[arrive].column;
      session.vars['wl:row'] = PLACES[arrive].row;
      ambushNote = tf('msgCaravanArrived', { name: placeName(arrive), time: formatHours(hours) });
    }
    busy = true;
    arrivedAt = null;
    zoneAt = null;
    stopFiring();
    const go = async () => {
      // Scripts learn about leaving and arriving (map_exit_p_proc, map_enter_p_proc).
      const previous = session.scene.def;
      await scripts.leaveMap(to.map === 'worldmap' ? null : (LEVELS[to.map] ?? null));
      if (ambushNote) {
        const outcome = job === undefined ? JOB.arrived : session.vars[`g${job}`];
        session.say(outcome === JOB.fled ? t('msgCaravanFled') : outcome === JOB.lost ? t('msgCaravanLost') : ambushNote);
      }
      const result = await session.travel(to);
      if (result === 'worldmap') {
        state = 'won';
        showOverlay();
      } else {
        // Arrived at a location (and not through the wasteland: caravan, script) — "been there", as in the original.
        const place = placeOfLevel(session.scene.def.id);
        if (place) markVisited(session.vars, place);
        seen.clear();
        await scripts.enterMap(previous);
        // A caravan ambush and the hero is cursed — deathclaws come here too (the caravan is attacked only if the hero is with it).
        if (session.scene.def.id.startsWith('caravan-') && (session.vars[CURSE.variable] ?? 0) > 0) void clawsAtAmbush();
      }
    };
    try {
      // A long road — under a loading screen with a tip (the elevator has its own window with an arrow).
      await (quiet ? go() : loadingCard.during(go));
    } finally {
      busy = false;
    }
  };

  // ---------- caravan: fast or the whole way on foot (src/game/caravan.ts) ----------
  /** A script sent the hero on (load_map): the road to another location takes time, as on foot across the wasteland. */
  const scriptTravel = (go: Destination) => {
    const from = placeOfLevel(session.scene.def.id);
    const to = placeOfLevel(go.map);
    const ambush = AMBUSH_DESTINATION[go.map];
    if (from && ambush) {
      // The caravan was ambushed halfway: remember where it came from.
      const hours = caravanLeg(from, ambush);
      session.vars['cvan:col'] = PLACES[from].column;
      session.vars['cvan:row'] = PLACES[from].row;
      session.say(tf('msgCaravanAmbush', { time: formatHours(hours) }));
    } else if (from && to && from !== to) {
      const hours = travelHours(placePoint(from), placePoint(to));
      session.clock.advance(hours * 3600);
      session.vars['wl:col'] = PLACES[to].column;
      session.vars['wl:row'] = PLACES[to].row;
      session.say(tf('msgFastTravel', { name: placeName(to), time: formatHours(hours) }));
    }
    void travel(go);
  };
  interface CaravanJob {
    go: Destination;
    from: PlaceKey;
    to: PlaceKey;
    ambush: boolean;
  }
  /** The caravan driver is taking the hero — wait until the dialogue closes and ask how to travel. */
  let caravanAsk: CaravanJob | null = null;
  /** Ambush attackers on the road (while they are near, the caravan stands still). */
  let caravanAttackers: Creature[] = [];
  /** The caravan driver is taking the hero to another location (or into an ambush on the way there) — this is a caravan trip. */
  const caravanJob = (go: Destination & { by?: string }): CaravanJob | null => {
    if (!go.by || !CARAVAN_DRIVERS.has(go.by)) return null;
    const from = placeOfLevel(session.scene.def.id);
    const ambushTo = AMBUSH_DESTINATION[go.map];
    const to = ambushTo ?? placeOfLevel(go.map);
    if (!from || !to || from === to) return null;
    return { go, from, to, ambush: !!ambushTo };
  };
  /** Choice in the dialogue window (client, 2026-10-23): fast, as in the original, or walk the whole way with the caravan. */
  const askCaravan = async (job: CaravanJob) => {
    caravanAsk = null;
    const hours = travelHours(placePoint(job.from), placePoint(job.to));
    dialogue.open(t('caravanTitle'));
    const choice = await dialogue.ask(tf('caravanAsk', { name: placeName(job.to), time: formatHours(hours) }), [t('caravanQuick'), t('caravanWalk')]);
    dialogue.close();
    if (choice === 1) await startCaravan(job);
    else scriptTravel(job.go);
  };
  /** On foot: the caravan gathers at the location it leaves from, the hero — next to it in the wasteland. */
  const startCaravan = async (job: CaravanJob) => {
    const arrive = job.ambush ? placeEntrance(job.to, session.vars) : job.go;
    if (!arrive) {
      scriptTravel(job.go);
      return;
    }
    session.caravan = newCaravanTrip(job.from, job.to, job.ambush, arrive, session.vars);
    caravanAttackers = [];
    session.setTarget({ place: job.to });
    await travel({ map: WASTELAND, entry: job.from });
    // The hero is to the side of the caravan's middle, facing the direction of travel: in the zone, next to his own.
    const zone = caravanZone();
    const trip = session.caravan;
    if (zone && trip) {
      const heading = routeAt(tripRoute(trip), trip.done).heading;
      session.player.placeAt(zone.x - Math.sin(heading) * 2.5, zone.y + Math.cos(heading) * 2.5, heading);
    }
    session.say(tf('msgCaravanStart', { name: placeName(job.to) }));
  };
  /** The trip ended without arriving: abandoned (fled) or all the caravan's people died (lost) — no pay. */
  const abandonCaravan = (why: 'fled' | 'lost') => {
    const trip = session.caravan;
    if (!trip) return;
    settleJob(trip, session.vars, why);
    session.say(t(why === 'fled' ? 'msgCaravanFled' : 'msgCaravanLost'));
    session.endCaravan();
    caravanAttackers = [];
  };
  /** The blue zone around the caravan's middle — in wasteland window coordinates (null — no caravan). */
  const caravanZone = (): { x: number; y: number; radius: number } | null => {
    const trip = session.caravan;
    const wl = session.wasteland;
    if (!trip || !wl || session.scene.def.id !== WASTELAND) return null;
    const o = windowOrigin(wl.center);
    const m = caravanMiddle(tripRoute(trip), trip);
    return { x: m.x - o.x, y: m.y - o.y, radius: CARAVAN.zone };
  };
  /** Ambush on the road: attackers run out from the sides of the road ahead of the caravan and run at it. */
  const springAmbush = async () => {
    session.say(t('msgCaravanAmbushWalk'));
    // First the attackers' pictures and rules: while they load, the wasteland window may be rebuilt.
    const pack = ambushPack(levelForExperience(session.hero.experience));
    await Promise.all(pack.map((a) => res.critterKind(a.pid, a.weaponPid)));
    const trip = session.caravan;
    const wl = session.wasteland;
    if (!trip || !wl) return;
    const { scene } = session;
    const o = windowOrigin(wl.center);
    const head = routeAt(tripRoute(trip), trip.done + 8);
    const hx = head.x - o.x;
    const hy = head.y - o.y;
    for (const [i, a] of pack.entries()) {
      for (let tries = 0; tries < 12; tries++) {
        const side = (i % 2 ? 1 : -1) * between(4, 8);
        const ahead = between(-2, 8);
        const x = hx + Math.cos(head.heading) * ahead - Math.sin(head.heading) * side;
        const y = hy + Math.sin(head.heading) * ahead + Math.cos(head.heading) * side;
        if (wallAt(scene.level, x, y)) continue;
        const c = await scene.spawnCreature(a.pid, x, y, a.weaponPid);
        if (session.scene !== scene) return;
        c.alertTo(hx, hy);
        caravanAttackers.push(c);
        break;
      }
    }
  };
  /** A cursed hero travels with a caravan: deathclaws come out from the sides of the road ahead and run at the caravan. */
  const clawCaravan = async () => {
    const trip = session.caravan;
    const wl = session.wasteland;
    if (!trip || !wl) return;
    session.say(t('msgCaravanClaws'));
    const o = windowOrigin(wl.center);
    const head = routeAt(tripRoute(trip), trip.done + 10);
    const side = (Math.random() < 0.5 ? -1 : 1) * between(8, 12);
    const x = head.x - o.x - Math.sin(head.heading) * side;
    const y = head.y - o.y + Math.cos(head.heading) * side;
    const m = caravanMiddle(tripRoute(trip), trip);
    caravanAttackers.push(...(await spawnSquad(curseSquad(), x, y, { x: m.x - o.x, y: m.y - o.y })));
  };
  /** A caravan ambush (fast trip), and the hero is cursed: deathclaws come to the noise of the fight. */
  const clawsAtAmbush = async () => {
    const { scene, player } = session;
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = between(12, 18);
      const x = player.x + Math.cos(a) * d;
      const y = player.y + Math.sin(a) * d;
      if (x < 1 || y < 1 || x >= scene.level.width - 1 || y >= scene.level.height - 1 || wallAt(scene.level, x, y)) continue;
      session.say(t('msgCaravanClaws'));
      await spawnSquad(curseSquad(), x, y, { x: player.x, y: player.y });
      return;
    }
  };
  /**
   * Caravan frame in the wasteland: enemies near — it stands (the guards fight back), none — it moves; time passes along the caravan's route. The hero outside
   * the blue zone for longer than CARAVAN.grace seconds — abandoned the caravan. Reached the end of the road — the entrance to the destination town.
   */
  const caravanStep = (dt: number) => {
    const trip = session.caravan;
    const wl = session.wasteland;
    if (!trip || !wl || busy) return;
    const { scene, player } = session;
    const route = tripRoute(trip);
    const o = windowOrigin(wl.center);
    session.crew.forEach((m, i) => {
      if (m && !m.creature.alive) {
        trip.members[i]!.hp = 0;
        session.crew[i] = null;
      }
    });
    if (!crewAlive(trip)) {
      abandonCaravan('lost');
      return;
    }
    const middle = caravanMiddle(route, trip);
    const mx = middle.x - o.x;
    const my = middle.y - o.y;
    const danger = scene.creatures.some(
      (c) => c.alive && c.present && c.hostile && !scene.allies.has(c) && (c.chasing || caravanAttackers.includes(c)) && Math.hypot(c.x - mx, c.y - my) < CARAVAN.halt,
    );
    const length = routeLength(route);
    const moved = danger ? 0 : Math.min(CARAVAN.speed * dt, length - trip.done);
    trip.done += moved;
    session.clock.advance(moved * CARAVAN.secondsPerCell);
    session.crew.forEach((m, i) => {
      if (!m) return;
      const s = crewSpot(route, trip.done, i, trip.members[i]!.role);
      scene.setEscortSpot(m.creature, s.x - o.x, s.y - o.y, s.heading, danger ? 0 : CARAVAN.speed);
    });
    if (trip.ambushAt !== null && !trip.ambushed && trip.done >= trip.ambushAt) {
      trip.ambushed = true;
      void springAmbush();
    }
    if (!trip.clawed && (session.vars[CURSE.variable] ?? 0) > 0 && trip.done >= length * CURSE.caravanAt) {
      trip.clawed = true;
      void clawCaravan();
    }
    if (Math.hypot(player.x - mx, player.y - my) <= CARAVAN.zone) {
      if (trip.away > 0) session.say(t('msgCaravanBack'));
      trip.away = 0;
    } else {
      if (trip.away === 0) session.say(tf('msgCaravanOut', { n: CARAVAN.grace }));
      trip.away += dt;
      if (trip.away >= CARAVAN.grace) {
        abandonCaravan('fled');
        return;
      }
    }
    if (trip.done >= length && !danger) {
      settleJob(trip, session.vars, 'arrived');
      session.vars['wl:col'] = PLACES[trip.to].column;
      session.vars['wl:row'] = PLACES[trip.to].row;
      session.say(tf('msgCaravanDone', { name: placeName(trip.to) }));
      session.endCaravan();
      caravanAttackers = [];
      void travel(trip.arrive);
    }
  };

  // Elevator: a window using the original's pictures (elevator-screen.ts). Digits 1–9 and Esc are handled by the key handler below, the buttons by the window itself.
  const openElevator = (el: Elevator) => {
    openScreen(() => {
      elevator = el;
      elevatorScreen(elevatorBox, res.data)
        .open(el, viewHeight, { onChoose: chooseFloor, onClose: closeElevator })
        .catch(() => closeElevator());
    });
  };
  const closeElevator = () => {
    elevator = null;
    elevatorScreen(elevatorBox, res.data).close();
    afterScreen();
  };
  const chooseFloor = (index: number) => {
    const el = elevator;
    if (!el || index === el.current || !el.floors[index]) return;
    elevator = null;
    sound.play(index < el.current ? SFX.elevatorUp : SFX.elevatorDown);
    canvas.style.cursor = '';
    const screen = elevatorScreen(elevatorBox, res.data);
    // The arrow moves while the new map loads; the window closes when both are done.
    void Promise.allSettled([travel(el.floors[index]!, true), screen.ride(el.current, index)]).then(() => {
      screen.close();
      void capture();
    });
  };

  // Dialogue: the window opened — the game is paused and the mouse is free; closed — back to the game.
  dialogue.onToggle = (open) => {
    if (open) {
      stopFiring();
      canvas.style.cursor = 'default';
      if (locked()) document.exitPointerLock();
    } else {
      afterScreen();
    }
    syncHint();
  };
  // A scripted movie (explosion, ending): the game is paused, the mouse is free; it ended — back to the game.
  dialogue.movie = async (index) => {
    const name = SCRIPT_MOVIES[index];
    if (!name || movieOpen) return;
    movieOpen = true;
    stopFiring();
    if (locked()) document.exitPointerLock();
    syncHint();
    try {
      await playMovie(root.querySelector('.game')!, name, sound);
    } catch (e) {
      console.error(e);
    }
    movieOpen = false;
    afterScreen();
    syncHint();
  };
  /** Talk to an NPC: if he has an original script, it runs the dialogue. */
  /** asked — the NPC started talking on his own (the script called dialogue_system_enter): guards demanding the weapon be put away, etc. */
  const talk = async (creature: Creature, asked = false) => {
    const script = session.scene.scriptOf(creature);
    if (!script || !creature.alive) {
      // No script — the description from the prototype, like "examine" in the original.
      const pid = session.scene.pidOf(creature);
      const proto = pid ? await res.data.critter(pid).catch(() => null) : null;
      const text = proto && creature.alive ? res.data.critterDescription(proto) : '';
      session.say(text || tf('msgSilent', { name: creature.stats.name }));
      return;
    }
    if (dialogue.isOpen || busy) return;
    talking = true;
    talkKey = script.key;
    try {
      // A dog that wasn't taken into the party (or was let go): call him along.
      const declined = declinedKey(script.name, session.scene.pidOf(creature));
      if (!asked && session.vars[declined] && session.scene.kindOfCreature(creature)?.bites && !session.isCompanion(creature)) {
        dialogue.open(creature.stats.name);
        const choice = await dialogue.ask(tf('dogCallAsk', { name: creature.stats.name }), [t('dogCall'), t('dogNotNow')]);
        dialogue.close();
        if (choice === 0) {
          delete session.vars[declined];
          session.joinParty(creature);
        }
        return;
      }
      // Companion: first his command menu (companion-talk.ts), the scripted dialogue from there, "Let's talk".
      if (!asked && session.isCompanion(creature)) await companionTalk.menu(creature);
      else await talkWith(creature, script, asked);
    } finally {
      talking = false;
      talkKey = undefined;
    }
  };
  const companionTalk = new CompanionTalk({
    session: () => session,
    ui: dialogue,
    free: () => state === 'play' && session.hero.alive && !windowOpen() && !busy && !talking && !movieOpen && (locked() || debug.unpause || usingPad()),
    talkScript: async (c: Creature) => {
      const script = session.scene.scriptOf(c);
      if (script && c.alive) await talkWith(c, script, false);
    },
    openSheet: (m) => openCompanionSheet(m),
    stock: async (c: Creature) => {
      const script = session.scene.scriptOf(c);
      if (!script || !(await scripts.trades(script.name))) return null;
      return (await scripts.stockOf(script.name)) ?? c.inventory;
    },
  });
  /** The dialogue itself with the NPC's script (talk — checks and the "dialogue in progress" mark). */
  const talkWith = async (creature: Creature, script: { name: string; key: string }, asked: boolean) => {
    const { hero } = session;
    // Outside combat the hero enters a dialogue with the weapon put away (many NPCs won't talk otherwise). If the NPC started talking — the weapon
    // stays as it was: he sees it and demands it be put away (the script picks this branch based on the hero's hands).
    if (!hero.inCombat && !asked) hero.holstered = true;
    const armed = !hero.holstered;
    await scripts.talk(creature, script.name, script.key);
    // After the dialogue the NPC may have introduced himself — the hover hint will ask his script again.
    seen.clear();
    // The NPC demanded, the hero listened and didn't start a fight — he puts the weapon away (in the original the player did this: not put away within
    // a second — the guards attack). If he wants to fight — he draws it again (Q), and the script acts its own way.
    if (asked && armed && creature.alive && !creature.hostile && !hero.inCombat && !hero.holstered) {
      hero.holstered = true;
      session.say(t('msgHolstered'));
    }
  };

  const quickSave = async () => {
    if (busy || state !== 'play') return;
    const ok = await platform.writeSave(QUICK_SLOT, session.toSave()).catch(() => false);
    session.say(t(ok ? 'msgSaved' : 'msgSaveFailed'));
  };
  const quickLoad = async () => {
    if (busy) return;
    const data = await platform.readSave(QUICK_SLOT).catch(() => null);
    if (!isSaveData(data)) {
      session.say(t('msgNoQuickSave'));
      // The death screen covers the log — the answer goes on it too.
      if (!overlay.hidden) overlay.querySelector('.overlay-load')!.textContent = t('msgNoQuickSave');
      return;
    }
    busy = true;
    // Loading takes seconds; the death screen covered the "Loading…" label, and it seemed F7 didn't work (client, 2026-10-27).
    overlay.hidden = true;
    try {
      await loadingCard.during(async () => {
        await placeVariants(data);
        const next = await Session.fromSave(res, data);
        await useSession(next);
        next.say(t('msgLoaded'));
      });
    } finally {
      busy = false;
      // Didn't load — the death screen back.
      if (state !== 'play') overlay.hidden = false;
    }
  };
  const newGame = async () => {
    if (busy) return;
    busy = true;
    try {
      // On the test range "restart" means the test range again; after death — again with the same hero (own locations — per settings).
      await loadingCard.during(async () => {
        await placeVariants();
        await useSession(await Session.newGame(res, walkStart ?? (options.polygon ? POLYGON_START : undefined), session.hero.character));
      });
      if (onPolygon()) session.say(t('msgPolygon'));
    } finally {
      busy = false;
    }
  };

  /** Take a weapon in hand (null — fists): from the inventory or with the F key. */
  const equip = (item: WeaponItem | null) => {
    const { hero } = session;
    hero.equip(item);
    hero.holstered = false;
    session.say(item ? tf('msgEquipped', { name: res.itemName(item) }) : t('msgFists'));
  };
  /** F — switch the active hand, as in the original: only it shoots and is visible on screen and to NPCs. */
  const switchHand = () => {
    const { hero } = session;
    hero.toggleHand();
    hero.holstered = false;
    const item = hero.activeItem;
    session.say(tf('msgHand', { n: hero.activeHand + 1, name: item ? res.itemName(item) : t('handEmpty') }));
  };

  /** "Examine" mode, LMB: what is in the crosshair — a description in the message window. */
  const examine = async () => {
    const target = session.scene.examineTarget(renderer);
    if (!target) session.say(t('msgLookNothing'));
    else await scripts.examine(target);
  };
  /**
   * What is seen when the gaze is on an NPC — like hovering the cursor in the original: the text of his look-at script (before meeting —
   * appearance, then — name); the script is silent — "You see: <name from the prototype>". The script isn't asked every frame.
   */
  const seen = new Map<object, { text: string | null; ready: boolean; at: number }>();
  /** A door with a script — the same (Military Base gates: the look-at script also remembers them for Katja); silent — no line. */
  const seenDoorText = (d: SceneDoor): string => lookedAt(d, () => scripts.lookAtDoor(d)) ?? '';
  const seenText = (c: Creature): string => {
    const text = lookedAt(c, () => scripts.lookAt(c));
    // Until the script has answered — no line, so a name the hero doesn't know yet doesn't flash.
    if (text === undefined) return '';
    return text ?? tf('msgLookSee', { name: c.stats.name });
  };
  /** Look-at text from the cache (undefined — the script hasn't answered yet, null — it is silent); stale — ask the script again. */
  const lookedAt = (target: object, ask: () => Promise<string | null | undefined>): string | null | undefined => {
    const now = performance.now() / 1000;
    let entry = seen.get(target);
    if (!entry || now - entry.at > SEEN_REFRESH_SECONDS) {
      const next = { text: entry?.text ?? null, ready: entry?.ready ?? false, at: now };
      seen.set(target, next);
      void ask()
        .then((text) => {
          // The script is busy (dialogue, its own procedure) — the previous text, ask again a bit later.
          if (text === undefined) next.at = now - SEEN_REFRESH_SECONDS + SEEN_RETRY_SECONDS;
          else {
            next.text = text;
            next.ready = true;
          }
        })
        .catch(() => (next.ready = true));
      entry = next;
    }
    return entry.ready ? entry.text : undefined;
  };
  /** Furniture names for the hint (from the player's copy, loaded once). */
  const sceneryNames = new Map<number, string>();
  const lookName = (target: Examined): string => {
    switch (target.kind) {
      case 'creature':
        return target.creature.stats.name;
      case 'pickup':
        return res.itemName(target.proto);
      case 'container':
        return res.itemName(target.container.proto);
      case 'prop':
        return target.prop.name;
      case 'scenery':
        if (!sceneryNames.has(target.pid)) {
          sceneryNames.set(target.pid, '');
          void res.data
            .scenery(target.pid)
            .then(async (proto) => {
              if (proto) sceneryNames.set(target.pid, (await res.data.sceneryText(proto)).name);
            })
            .catch(() => {});
        }
        return sceneryNames.get(target.pid) ?? '';
    }
  };

  /** E pressed: a door, exit, elevator, dialogue or search — depending on what is in front of the player. */
  const use = () => {
    const event = session.scene.use(session.player);
    if (!event) return;
    switch (event.type) {
      case 'travel':
        void travel(event.to);
        break;
      case 'elevator':
        openElevator(event.elevator);
        break;
      case 'loot':
        openScreen(() => screens.openLoot(session.hero, { name: event.creature.stats.name, inventory: event.creature.inventory }));
        break;
      case 'talk':
        void talk(event.creature);
        break;
      case 'door': {
        const door = event.door;
        if (event.pick) withSkill(SKILL.lockpick, () => scripts.useDoor(door, true), true);
        else void scripts.useDoor(door, false);
        break;
      }
      case 'container': {
        const box = event.container;
        const open = async (pick: boolean) => {
          if (await scripts.useContainer(box, pick)) openScreen(() => screens.openLoot(session.hero, { name: res.itemName(box.proto), inventory: box.inventory }));
        };
        if (event.pick) withSkill(SKILL.lockpick, () => open(true), true);
        else void open(false);
        break;
      }
      case 'pick': {
        // A lock without a script: hands busy with "Lockpick", then a skill roll.
        const { door, container } = event;
        withSkill(SKILL.lockpick, () => {
          if (door) session.scene.pickLock(door);
          else if (container && session.scene.pickContainer(container)) {
            openScreen(() => screens.openLoot(session.hero, { name: res.itemName(container.proto), inventory: container.inventory }));
          }
        }, true);
        break;
      }
      case 'open':
        openScreen(() => screens.openLoot(session.hero, { name: event.name, inventory: event.inventory }));
        break;
      case 'prop':
        void scripts.useProp(event.prop);
        break;
    }
  };

  /**
   * An item from the inventory: explosives — a charge at the hero's feet ("Traps" skill: success — 10 seconds to get away, failure —
   * a short fuse); the rest — use on whatever is in front of the hero (the target's script decides what happens).
   */
  /**
   * Read a book (books.ts, as in the original): the skill grows more the lower it is; it takes 11 hours minus Intelligence;
   * the book disappears. Not in combat; the skill is already high — "nothing new", the book and the time remain.
   */
  const readBook = (item: ItemProto) => {
    const { hero, clock } = session;
    const skill = BOOK_SKILL[item.pid];
    if (skill === undefined) return;
    const name = res.itemName(item);
    if (hero.inCombat) {
      session.say(t('msgBookCombat'));
      return;
    }
    const character = hero.character;
    const before = skillLevel(character, skill);
    const gain = bookGain(before);
    if (gain === 0) {
      session.say(tf('msgBookNothing', { name }));
      return;
    }
    if (!hero.inventory.remove(item.pid)) return;
    const points = [...character.skillPoints];
    points[skill] = (points[skill] ?? 0) + gain;
    hero.setCharacter({ ...character, skillPoints: points });
    const hours = readingHours(character.special.intelligence);
    clock.advance(hours * 3600);
    session.say(tf('msgBookRead', { name, hours, skill: skillTitle(skillNames, skill), n: skillLevel(hero.character, skill) - before }));
  };
  /** Drop items on the floor in front of the hero (from the item menu in the inventory): they stay on the map and can be picked up again. */
  const dropItem = async (item: ItemProto, count: number) => {
    const { hero, scene, player } = session;
    // Worn armor is taken off first if the last one is dropped.
    if (hero.armorItem?.pid === item.pid && hero.inventory.count(item.pid) <= count) hero.wear(null);
    const n = hero.inventory.remove(item.pid, count);
    if (n <= 0) return;
    const ahead = { x: player.x + Math.cos(player.angle) * 0.6, y: player.y + Math.sin(player.angle) * 0.6 };
    const at = wallAt(scene.level, ahead.x, ahead.y) ? { x: player.x, y: player.y } : ahead;
    await scene.addCreated({ kind: 'item', pid: item.pid, x: at.x, y: at.y, count: n });
    const name = res.itemName(item);
    session.say(n > 1 ? tf('msgDropCount', { name, n }) : tf('msgDrop', { name }));
  };
  const useItem = async (item: ItemProto, fromHand = false) => {
    const { hero, scene, player } = session;
    // From the inventory — the window closes; from the hand (LMB) there is no window — and no closing click either.
    const leaveScreen = () => {
      if (!screens.open) return;
      screens.close();
      afterScreen();
    };
    // Grenade (a thrown weapon with more damage than a flare): flies in an arc forward and explodes where it lands.
    const w = item.weapon;
    if (w && isGrenade(item)) {
      if (!hero.inventory.remove(item.pid)) return;
      leaveScreen();
      const reach = Math.min(GRENADE_RANGE, w.range / 2);
      const land = scene.throwTarget(player, reach);
      await scene.plantCharge(item, land.x, land.y, GRENADE_FLIGHT, { min: w.minDamage, max: w.maxDamage }, { x: player.x, y: player.y, flight: GRENADE_FLIGHT * 0.65 });
      session.say(tf('msgThrow', { name: res.itemName(item) }));
      return;
    }
    const blast = EXPLOSIVES[item.pid];
    if (blast) {
      if (!hero.inventory.remove(item.pid)) return;
      leaveScreen();
      const dice = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
      const ok = rollIsSuccess(rollCheck(hero.fighter.skills[SKILL.traps] ?? 0, 0, dice, false).result) === 1;
      const time = ok ? CHARGE_SECONDS : CHARGE_FUMBLE_SECONDS;
      await scene.plantCharge(item, player.x, player.y, time, blast);
      session.say(tf(ok ? 'msgCharge' : 'msgChargeFumble', { n: time }));
      return;
    }
    // Flare: the first use lights it (the light follows the hero), the second throws it forward to burn on the floor.
    if (item.pid === FLARE_PID) {
      leaveScreen();
      if (session.flare <= 0) {
        session.flare = FLARE_SECONDS;
        session.say(t('msgFlareLit'));
      } else {
        if (!hero.inventory.remove(item.pid)) return;
        const reach = Math.min(FLARE_THROW_HEXES, 3 * hero.fighter.special.strength) / 2;
        const land = scene.throwTarget(player, reach);
        await scene.throwFlare(item, land.x, land.y, session.flare, { x: player.x, y: player.y });
        session.flare = 0;
        session.say(tf('msgThrow', { name: res.itemName(item) }));
      }
      return;
    }
    // From the inventory an item is used only on yourself (client, 2026-10-26); on whoever or whatever is in front of the hero — from the hand.
    if (!fromHand) {
      session.say(tf('msgUseInHand', { name: res.itemName(item) }));
      return;
    }
    const focus = scene.focus(player);
    const target =
      focus?.kind === 'prop' ? { prop: focus.prop } : focus?.kind === 'door' ? { door: focus.door } : focus?.kind === 'container' ? { container: focus.container } : focus?.kind === 'npc' ? { creature: focus.creature } : null;
    if (target) {
      const said = session.spoken;
      const answer = await scripts.useItemOn(target, item);
      // Medicine for an NPC: the script took it on itself (antidote for Jarvis) — done; otherwise, as in the original, the medicine
      // acts on him himself.
      if (item.type === ITEM_TYPE.drug && target.creature?.alive && answer !== 'refused') {
        // The script answered the treat itself (iguana-on-a-stick for Dogmeat) — a non-healing item stays with the hero without "won't help".
        if (session.spoken !== said && !healsHp(item.drug)) return;
        giveDrug(target.creature, item);
        return;
      }
      if (answer !== 'none') return;
    }
    session.say(tf(item.type === ITEM_TYPE.drug ? 'msgGiveNobody' : 'msgUseNothing', { name: res.itemName(item) }));
  };
  /** Medicine for an NPC from the hand: a healing one adds health to him; the rest won't help him — the item stays with the hero. */
  const giveDrug = (creature: Creature, item: ItemProto) => {
    const name = res.itemName(item);
    const who = creature.stats.name;
    if (!healsHp(item.drug) || creature.hp >= creature.stats.maxHp) {
      session.say(tf('msgGiveUseless', { name, who }));
      return;
    }
    if (!session.hero.inventory.remove(item.pid)) return;
    const before = creature.hp;
    creature.hp = Math.min(creature.stats.maxHp, creature.hp + drugHeal(item.drug));
    session.say(tf('msgGiveHeal', { name, who, n: creature.hp - before }));
  };

  /**
   * An item in the active hand that isn't a weapon (flare, grenade, explosives, rope…): it is visible in hand, and LMB and Ctrl
   * use it — like "Use" in the inventory — instead of punching (2026-10-23: such an item was invisible and useless).
   */
  const heldTool = (): ItemProto | null => {
    const item = session.hero.activeItem;
    return item && !canWield(item) ? item : null;
  };
  /** Aimed attack: body parts of whoever is in the crosshair (nobody — all), and the one chosen among them (no such — torso). */
  const aimParts = (): readonly AimPart[] => session.scene.aimTarget(renderer, session.player)?.parts ?? AIM_PARTS;
  const shownAimPart = (parts: readonly AimPart[]): AimPart => (parts.includes(aimPart) ? aimPart : 'torso');
  const stepAim = (delta: number) => {
    const parts = aimParts();
    const at = parts.indexOf(shownAimPart(parts));
    aimPart = parts[(at + delta + parts.length) % parts.length]!;
  };
  const pickAim = (index: number) => {
    const part = aimParts()[index];
    if (part) aimPart = part;
  };
  /** Toggle the aimed attack on or off (quiet — no log line: on the gamepad it is held with LT). */
  const setAim = (on: boolean, quiet = false) => {
    const { hero } = session;
    if (on && (!hero.alive || hero.thrown || heldTool())) return;
    if (on === aimMode) return;
    aimMode = on;
    if (on) looking = false;
    if (!quiet) session.say(t(on ? 'msgAimOn' : 'msgAimOff'));
  };
  /**
   * Use the item from the hand: a holstered one is drawn; in combat — for AP, as an item action. An item in hand is used on
   * whoever or whatever is in front of the hero (client, 2026-10-26: medicine on an NPC, rope on a beam), on yourself — only from the
   * inventory (and a stimpak with the H key). A book in hand is read (2026-10-24: a book in hand did nothing on LMB).
   */
  const useHeld = (item: ItemProto) => {
    const { hero } = session;
    if (isBook(item.pid)) {
      readBook(item);
      return;
    }
    hero.holstered = false;
    const cost = hero.apCost(AP_COST.useItem);
    if (hero.spendAp(cost)) void useItem(item, true);
    else session.say(tf('msgNoAp', { n: formatDecimal(cost) }));
  };

  canvas.addEventListener('mousemove', (e) => {
    if (screens.open) {
      const p = toScreen(e);
      screens.pointerMove(p.x, p.y);
    } else if (pipboy.open) {
      const p = toScreen(e);
      pipboy.pointerMove(p.x, p.y);
    }
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (pipboy.open) {
        e.preventDefault();
        pipboy.wheel(e.deltaY);
        return;
      }
      // Aimed attack: the wheel picks where to hit.
      if (aimMode && !windowOpen()) {
        e.preventDefault();
        stepAim(e.deltaY > 0 ? 1 : -1);
        return;
      }
      if (!screens.open) return;
      e.preventDefault();
      screens.wheel(toScreen(e).x, e.deltaY);
    },
    { passive: false },
  );
  canvas.addEventListener('mousedown', (e) => {
    sound.resume();
    if (elevator) return;
    if (automap.open) {
      const p = toScreen(e);
      automap.pointerDown(p.x, p.y);
      return;
    }
    if (pipboy.open) {
      const p = toScreen(e);
      pipboy.pointerDown(p.x, p.y);
      return;
    }
    if (screens.open) {
      const p = toScreen(e);
      screens.pointerDown(p.x, p.y, e.button);
      return;
    }
    if (!locked()) {
      // In some windows (e.g. the built-in preview) mouse capture is forbidden — that's not a game error.
      capture();
      return;
    }
    // RMB — aimed attack (toggle on or off).
    if (e.button === 2) {
      setAim(!aimMode);
      return;
    }
    if (e.button === 0) {
      const tool = heldTool();
      if (looking) void examine();
      else if (tool) useHeld(tool);
      else firingMouse = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) firingMouse = false;
    if (automap.open && e.target === canvas) {
      const p = toScreen(e);
      if (automap.pointerUp(p.x, p.y)) {
        automap.hide();
        afterScreen();
      }
      return;
    }
    if (pipboy.open && e.target === canvas) {
      const p = toScreen(e);
      if (pipboy.pointerUp(p.x, p.y)) {
        pipboy.hide();
        afterScreen();
      }
      return;
    }
    if (screens.open && e.target === canvas) {
      const p = toScreen(e);
      screens.pointerUp(p.x, p.y, {
        say: (m) => session.say(m),
        // With the inventory open a stimpak is free: the AP were paid for opening it.
        useStimpak: () => session.scene.useStimpak(true),
        useDrug: (item) => {
          // A stimpak follows its own rule (AP in combat are already paid for the inventory); the rest — by the medicine data.
          if (item.pid === res.loadout.stimpak.pid) session.scene.useStimpak(true);
          else session.takeDrug(item);
        },
        equip: (item) => equip(item),
        wear: (item) => {
          const { hero } = session;
          const off = hero.armorItem?.pid === item.pid;
          hero.wear(off ? null : item);
          session.say(off ? tf('msgArmorOff', { name: res.itemName(item) }) : tf('msgArmorOn', { name: res.itemName(item), ac: hero.ac }));
        },
        useItem: (item) => void useItem(item),
        readBook: (item) => readBook(item),
        drop: (item, count) => void dropItem(item, count),
        reload: (ammo) => session.scene.reload(ammo ?? null),
        putInHand: (hand, item) => {
          session.hero.putInHand(hand, item);
          session.hero.holstered = false;
          session.say(item ? tf('msgInHand', { n: hand + 1, name: res.itemName(item) }) : tf('msgHandFree', { n: hand + 1 }));
        },
        setActiveHand: (hand) => {
          if (session.hero.activeHand !== hand) switchHand();
        },
      }, e.button);
      afterScreen();
    }
  });
  // RMB in game windows toggles the cursor (hand ↔ binoculars), not the browser menu.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  /** Binoculars cursor for the inventory window (our drawing, the same as the "examine" crosshair). */
  const binocularsCursor = (() => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 24;
    const g = c.getContext('2d');
    if (!g) return 'crosshair';
    drawBinoculars(g, 16, 12);
    return `url(${c.toDataURL()}) 16 12, crosshair`;
  })();
  let binocularsShown = false;
  window.addEventListener('keydown', (e) => {
    sound.resume();
    if (e.code === 'Tab' || e.code === 'F6' || e.code === 'F7') e.preventDefault();
    // An ending movie or slides are playing: keys go to them (Enter there means "next", not "restart").
    if (movieOpen) return;
    if (elevator) {
      if (e.code === 'Escape') closeElevator();
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit) chooseFloor(Number(digit[1]) - 1);
      // Arrows (and the gamepad d-pad) — a floor up or down (floors go from top to bottom).
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') chooseFloor(elevator.current + (e.code === 'ArrowUp' ? -1 : 1));
      return;
    }
    // Automap: Tab or Esc close it, it needs no other keys.
    if (automap.open) {
      if (e.code === 'Tab' || e.code === 'Escape') {
        automap.hide();
        afterScreen();
      }
      return;
    }
    // Skilldex: U or Esc close it (it catches the digits itself).
    if (skilldex.isOpen) {
      if (e.code === 'KeyU' || e.code === 'Escape') closeSkilldex();
      return;
    }
    // Character screen: K or Esc close it.
    if (sheetOpen()) {
      if (e.code === 'KeyK' || e.code === 'Escape') closeSheet();
      return;
    }
    // "Go to location": F9 or Esc close it, arrows and Tab move between buttons, letters go to the search line.
    if (jump.isOpen) {
      if (e.code === 'F9' || e.code === 'Escape') {
        e.preventDefault();
        closeJump();
      } else jump.key(e);
      return;
    }
    // Test range panel: F2 or Esc close it.
    if (polygon.isOpen) {
      if (e.code === 'F2' || e.code === 'Escape') closePolygon();
      return;
    }
    // World map: M or Esc close it.
    if (worldMap.isOpen) {
      if (e.code === 'KeyM' || e.code === 'Escape') closeWorldMap();
      return;
    }
    // Pip-Boy: P or Esc close it; other keys are for the alarm clock (arrows, Enter, A).
    if (pipboy.open) {
      if (e.code === 'KeyP' || e.code === 'Escape') {
        pipboy.hide();
        afterScreen();
      } else if (pipboy.key(e.code)) e.preventDefault();
      return;
    }
    if (screens.open) {
      screens.key(e.code);
      afterScreen();
      return;
    }
    if (e.code === 'F7' && !e.repeat) {
      void quickLoad();
      return;
    }
    if (state !== 'play') {
      if (e.code === 'Enter') void newGame();
      return;
    }
    // Pause: F10 always, Esc — when the mouse is already free (if the mouse is captured, Esc releases it itself, and the pause opens from that).
    if (e.code === 'F10' || (e.code === 'Escape' && !locked())) {
      e.preventDefault();
      if (!e.repeat) openPause();
      return;
    }
    // Up and down arrows scroll the message screen at the bottom left (hold — keeps scrolling).
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') res.hud.scrollLog(e.code === 'ArrowUp' ? 1 : -1);
    if (busy) return;
    if (e.code === 'F6' && !e.repeat) void quickSave();
    if (e.code === 'KeyI') {
      // In combat opening the inventory costs AP, as in the original.
      // "Quick Pockets" (perk, as in the original description) — 1 AP cheaper.
      const cost = Math.max(0, session.hero.apCost(AP_COST.inventory) - perkRank(session.hero.character, PERK.quickPockets));
      if (session.hero.spendAp(cost)) openScreen(() => screens.openInventory(session.hero));
      else session.say(tf('msgNoAp', { n: formatDecimal(cost) }));
    }
    if (e.code === 'Tab' && !e.repeat) openScreen(() => automap.show());
    if (e.code === 'KeyP' && !e.repeat) openScreen(() => pipboy.show());
    if (e.code === 'KeyK' && !e.repeat) {
      const mark = lloydMark(session);
      // The character window is open — the "Level Up" plate goes out, as in the original.
      session.vars['pc:levelSeen'] = session.hero.level;
      openScreen(() => sheet.open(session.hero, { rads: session.vars['pc:radiation'] ?? 0, poison: session.vars['pc:poison'] ?? 0, addictions: session.addictionList(), marks: mark ? [mark] : [] }));
    }
    if (e.code === 'KeyU' && !e.repeat) openSkilldex();
    if (e.code === 'KeyE' && !e.repeat) use();
    if (e.code === 'KeyV' && !e.repeat) {
      looking = !looking;
      firingMouse = false;
      if (looking) setAim(false, true);
    }
    // Aimed attack: digits pick where to hit (the number in the list on the right).
    const aimDigit = aimMode ? /^Digit([1-9])$/.exec(e.code) : null;
    if (aimDigit) pickAim(Number(aimDigit[1]) - 1);
    if (e.code === 'KeyR') session.scene.reload();
    if (e.code === 'KeyF' && !e.repeat) switchHand();
    if (e.code === 'KeyQ' && !e.repeat) {
      session.hero.holstered = !session.hero.holstered;
      session.say(t(session.hero.holstered ? 'msgHolstered' : 'msgDrawn'));
    }
    if (e.code === 'KeyH') session.scene.useStimpak();
    if (e.code === 'KeyN') session.say(t(sound.toggleMute() ? 'msgSoundOff' : 'msgSoundOn'));
    if (e.code === 'KeyC' && !e.repeat) {
      session.player.sneaking = !session.player.sneaking;
      session.say(t(session.player.sneaking ? 'msgSneakOn' : 'msgSneakOff'));
    }
    if (e.code === 'KeyM' && !e.repeat) openWorldMap();
    if (e.code === 'F2' && !e.repeat && onPolygon()) {
      e.preventDefault();
      void openPolygon();
    }
    if (e.code === 'KeyG' && !e.repeat && session.wasteland) nextTarget();
    if (e.code === 'F9' && !e.repeat) {
      e.preventDefault();
      openJump();
    }
  });
  window.addEventListener('blur', stopFiring);
  let wasLocked = false;
  document.addEventListener('pointerlockchange', () => {
    const now = locked();
    // The mouse is captured, but a window is already over the game: capture was requested before it, and the browser granted it later (client, 2026-10-28: stealing
    // from a companion from the skills window — the skills window closed and requested the mouse, the items opened right away, and the cursor was gone until
    // Esc). Release the mouse at once; no pause from this.
    if (now && windowOpen()) {
      wasLocked = false;
      document.exitPointerLock();
      return;
    }
    // The mouse was released during play (Esc, switching windows) — that's a pause.
    if (wasLocked && !now) openPause();
    wasLocked = now;
    syncHint();
    if (!now) firingMouse = false;
  });

  function showOverlay(): void {
    const won = state === 'won';
    overlay.classList.toggle('overlay-won', won);
    const radDeath = state === 'dead' && session.killedBy === 'radiation';
    overlay.classList.toggle('overlay-rad', radDeath);
    const [title, text] =
      ending === 'won'
        ? [t('endTitle'), endingLines(session.vars).map((k) => t(k)).join('\n\n')]
        : ending === 'water'
          ? [t('lostWaterTitle'), t('lostWaterText')]
          : ending === 'invasion'
            ? [t('lostInvasionTitle'), t('lostInvasionText')]
            : [t(won ? 'winTitle' : 'deathTitle'), t(won ? 'winText' : radDeath ? 'deathRadText' : 'deathText')];
    overlay.querySelector('.overlay-title')!.textContent = title;
    overlay.querySelector('.overlay-text')!.textContent = text;
    overlay.querySelector('.overlay-stats')!.textContent = tf('winStats', {
      // Killed — over the whole game (earlier "of" was counted per map and came out as "281 of 20").
      kills: session.hero.kills,
      xp: session.hero.experience,
      day: session.clock.day,
    });
    const pad = usingPad() ? padLabels() : null;
    overlay.querySelector('.overlay-hint')!.textContent = pad ? tf('restartHintPad', pad) : t('restartHint');
    overlay.querySelector('.overlay-load')!.textContent = pad ? tf('loadHintPad', pad) : t('loadHint');
    overlay.hidden = false;
  }

  // ---------- gamepad (src/game/gamepad.ts) ----------
  /** Running with a gamepad: pressed the left stick — runs while the stick is tilted (returned the stick to center — walking again). */
  let padRunning = false;
  let padCursor = false;
  /** Sticks and held buttons go into the hero for this frame (the game isn't running or the mouse is used — all zeros). */
  const feedPad = (player: typeof session.player, playing: boolean, dt: number) => {
    const on = playing && usingPad();
    // Without mouse capture the cursor over the game isn't needed (styles.css — .pad-play).
    const hide = on && !locked();
    if (hide !== padCursor) {
      padCursor = hide;
      canvas.classList.toggle('pad-play', hide);
    }
    const { move, look } = padState;
    if (!on || Math.hypot(move.x, move.y) < 0.3) padRunning = false;
    if (!on || !padState.held('rt')) firingPad = false;
    const speed = on ? padLook.update(look.x, look.y, dt) : { turn: 0, pitch: 0 };
    player.padMove = on ? move : { x: 0, y: 0 };
    player.padTurn = speed.turn;
    player.padPitch = speed.pitch;
    player.padRun = padRunning;
    player.padJump = on && padState.held('y');
    // Holding LT — aimed attack (released — normal shooting).
    if (usingPad()) setAim(on && padState.held('lt'), true);
  };
  /** The "examine" mode hint — for the mouse or for the gamepad. */
  const lookPrompt = (name: string) => {
    const pad = usingPad() ? padLabels() : null;
    if (pad) return name ? tf('promptLookAtPad', { ...pad, name }) : tf('promptLookPad', pad);
    return name ? tf('promptLookAt', { name }) : t('promptLook');
  };
  gamepad.setHost({
    // What's on screen: a movie and windows — menu, dialogue — its own buttons, end of playthrough — "restart", otherwise — the game.
    context: () => (movieOpen ? 'menu' : dialogue.isOpen ? 'dialogue' : windowOpen() || busy ? 'menu' : state !== 'play' ? 'ended' : 'game'),
    press: (name) => {
      if (name === 'ls') {
        padRunning = !padRunning;
        return true;
      }
      // Aimed attack: d-pad up-down picks where to hit (instead of the Pip-Boy and automap).
      if (aimMode && (name === 'up' || name === 'down')) {
        stepAim(name === 'down' ? 1 : -1);
        return true;
      }
      if (name !== 'rt') return false;
      // Right trigger works like LMB: in V mode — examine, an item in hand (not a weapon) — use, a weapon — fire while held.
      if (!session.hero.alive) return true;
      const tool = heldTool();
      if (looking) void examine();
      else if (tool) useHeld(tool);
      else firingPad = true;
      return true;
    },
  });
  // Picked up the gamepad or went back to the mouse — hints for whatever is being used.
  gamepad.onChange(() => {
    syncHint();
    if (!overlay.hidden) showOverlay();
  });
  // Came into the game already with a gamepad (from the menu) — hide the "Click" hint right away.
  syncHint();

  let last = performance.now();
  /** Global script variable for the quest list (quest variables start at 0). */
  const questVar = (n: number) => session.vars[`g${n}`] ?? 0;
  const frame = (now: number) => {
    // The browser's first frame time may be slightly earlier than the start — don't go negative.
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    step(dt);
    requestAnimationFrame(frame);
  };
  /** One game frame: time passing, the scene, scripts, the picture. */
  const step = (dt: number) => {
    const { scene, hero, player } = session;
    const playing =
      (locked() || debug.unpause || usingPad()) &&
      !screens.open &&
      !automap.open &&
      !pipboy.open &&
      !pause.open &&
      !elevator &&
      !dialogue.isOpen &&
      !movieOpen &&
      !worldMap.isOpen &&
      !polygon.isOpen &&
      !sheetOpen() &&
      !skilldex.isOpen &&
      !busy &&
      state === 'play';
    hero.update(playing ? dt : 0);
    stepSkill();
    if (companionLoot && !screens.open) {
      const c = companionLoot;
      companionLoot = null;
      void session.equipCompanion(c);
    }
    // Wounds heal over time — whether it passed on the road, in sleep or by script (and while windows are open — too).
    session.naturalHealing();
    // Radiation (at the Glow): the dose — while the game runs; the Geiger counter clicks in windows and on pause too (client, 2026-10-25),
    // silent after death.
    const radField = session.radiationField();
    if (playing) session.irradiate(dt, radField);
    // Body clock at a location (in the wasteland the calendar runs): drugs wear off here too (src/game/clock.ts — body).
    if (playing && session.scene.def.id !== WASTELAND) session.clock.tickPlace(dt);
    // A lit flare among the hero's items burns out and is gone without a trace (on the floor they burn out in scene.update).
    if (playing && session.flare > 0 && (session.flare -= dt) <= 0) {
      session.flare = 0;
      hero.inventory.remove(FLARE_PID);
      session.say(t('msgFlareOut'));
    }
    if (hero.alive && state === 'play') geiger.update(geigerRate(radField), geigerVolume(radField));
    else geiger.stop();
    session.updateConditions();
    // Quests: taken, completed or failed — a line at the bottom left (what has already been said is remembered by session.vars).
    for (const news of questNews(session.vars, questVar, (id) => pipboy.message(id), talkKey)) {
      const key = news.state === 'active' ? 'questGot' : news.state === 'done' ? 'questDone' : 'questFailed';
      session.say(tf(key, { text: news.text }));
    }
    // End of the game: an ending from a script, the water ran out or the mutants came.
    if (state === 'play') {
      const over = gameOver(session.vars, session.clock.day);
      if (over) {
        ending = over;
        state = over === 'won' ? 'won' : 'lost';
        stopFiring();
        // Endings, as in the original: slides with the narrator's voice and subtitles (victory and the mutant invasion),
        // then our results screen. The water ran out — straight to the results screen.
        if (over === 'won' || over === 'invasion') {
          movieOpen = true;
          sound.holdMusic(true);
          void playEndingSlides(root.querySelector<HTMLElement>('.game')!, sound, endingSlides(session.vars, over))
            .catch(() => {})
            .then(() => {
              movieOpen = false;
              sound.holdMusic(false);
              // While the slides were running a game may have been loaded — then no results.
              if (state === 'won' || state === 'lost') showOverlay();
            });
        } else showOverlay();
      }
    }
    // Gamepad: sticks and held buttons (walking, looking, running, jumping, fire) go into the hero for this frame.
    feedPad(player, playing, dt);
    if (playing) {
      const x0 = player.x;
      const y0 = player.y;
      // Aimed attack: which body part the shot hits (no target in the crosshair — the scene shoots as usual).
      if (aimMode && (!session.hero.alive || session.hero.thrown || heldTool())) aimMode = false;
      scene.aimedPart = aimMode ? shownAimPart(aimParts()) : null;
      const event = scene.update(dt, player, firingMouse || firingPad || debug.fire, renderer);
      if (session.wasteland && session.scene === scene) {
        wastelandStep(Math.hypot(player.x - x0, player.y - y0));
        if (session.scene === scene) caravanStep(dt);
        if (session.scene === scene) strangerStep(dt);
        if (session.scene === scene) specialStep(dt);
      }
      if (event?.type === 'dead') {
        state = 'dead';
        stopFiring();
        // The narrator's voice over the death screen, as in the original: for radiation — our own recordings.
        const nar = session.killedBy === 'radiation' ? (Math.random() < 0.5 ? 5 : 7) : [4, 6, 8][Math.floor(Math.random() * 3)]!;
        void sound.speech(`SOUND\\SPEECH\\NARRATOR\\NAR_${nar}.ACM`);
        showOverlay();
      } else if (event?.type === 'travel') {
        void travel(event.to);
      }
      // Map scripts: delayed events, NPC procedures.
      scripts.update(dt);
      // Companions: bandaging after a fight, time with unspent points, they start talking on their own (companion-talk.ts).
      session.tickCompanions(dt);
      companionTalk.tick(dt);
      lloydEggs.tick(dt, session);
      // An NPC started talking on his own (the script called dialogue_system_enter). Not one who has already attacked the hero: in the original
      // critter_p_proc doesn't run during combat (turn-based combat), but here it does — the Master, after a refusal, would call to talk again
      // and again, and the "[Done]" window wouldn't close (night 15).
      // Requests one at a time: the next one when the dialogue has ended (two asked at once — both get to talk).
      const asked = !dialogue.isOpen && !busy && !talking ? scripts.takeTalkRequest() : null;
      if (asked?.creature && asked.creature.alive && !asked.creature.hostile) void talk(asked.creature, true);
      // Dialogue with scenery (the vats computer terminal, etc.).
      else if (asked?.prop) void scripts.talkProp(asked.prop);
      // Dialogue with a location without an NPC (at the bed of a rented room: "go to sleep?"), a door, a container.
      else if (asked && !asked.creature) void scripts.talkObject(asked);
      // The fight is over and everything is quiet — the weapon is lowered by itself where there are peaceful NPCs (CALM_HOLSTER_SECONDS).
      const { hero } = session;
      if (hero.fought && !hero.inCombat && hero.calmFor >= CALM_HOLSTER_SECONDS) {
        hero.fought = false;
        if (!hero.holstered && hero.activeItem && session.scene.hasPeaceful()) {
          hero.holstered = true;
          session.say(t('msgHolsteredCalm'));
        }
      }
      // A script sent the hero to another map (load_map). The caravan driver — first a choice: fast or on foot.
      const go = scripts.takeTravelRequest();
      if (go) {
        const job = caravanJob(go);
        if (job) caravanAsk = job;
        else scriptTravel(go);
      }
      if (caravanAsk && !dialogue.isOpen && !busy) void askCaravan(caravanAsk);
      // A script opened the world map (e.g. Aradesh marks a location) — show our screen.
      if (!dialogue.isOpen && scripts.takeWorldMapRequest()) openWorldMap();
    }

    // Under the open sky the light depends on the time of day.
    if (scene.level.outdoor) {
      const date = session.clock.date;
      scene.level.outdoor = { ...outdoorAt(date.hour + date.minute / 60), sidereal: localSiderealTime(session.clock.dateMs), moon: moonPlace(session.clock.dateMs) };
    }
    // Sky watching (STAR_GAZE): stand and look at the night sky — the eyes adapt to the dark and stay that way until morning
    // (night — by the clock, on any map). In daytime no stars are visible — and however long you look at the sun, nothing will come together.
    const now = session.clock.date;
    const nightNow = outdoorAt(now.hour + now.minute / 60).brightness < 0.5;
    const still = gazeFrom.scene === scene && Math.hypot(player.x - gazeFrom.x, player.y - gazeFrom.y) <= STAR_GAZE.stay;
    if (!still) gazeFrom = { x: player.x, y: player.y, scene };
    const gazeBefore = session.vars['pc:skyGaze'] ?? 0;
    let gaze = gazeBefore;
    if (!nightNow) gaze = 0;
    else if (still && playing && renderer.skyGaze) gaze = Math.min(STAR_GAZE.seconds, gaze + dt);
    if (gaze !== gazeBefore) session.vars['pc:skyGaze'] = gaze;
    const adapt = gaze / STAR_GAZE.seconds;
    renderer.nightAdapt = adapt >= renderer.nightAdapt ? adapt : Math.max(adapt, renderer.nightAdapt - dt * STAR_GAZE.forget);
    // Tikhon hints that the night sky is worth a look (SKY_HINT).
    const tycho = session.party.find((m) => m.script?.name.toUpperCase() === SKY_HINT.script && m.creature.alive && m.creature.present);
    const hintNow =
      playing &&
      !!tycho &&
      !!scene.level.outdoor &&
      nightNow &&
      !hero.inCombat &&
      !session.vars['pc:stargazer'] &&
      session.vars['hint:sky'] !== session.clock.day &&
      Math.hypot(tycho.creature.x - player.x, tycho.creature.y - player.y) <= SKY_HINT.reach;
    skyHintWait = hintNow ? skyHintWait + dt : 0;
    if (tycho && skyHintWait >= SKY_HINT.after) {
      skyHintWait = 0;
      session.vars['hint:sky'] = session.clock.day;
      const text = t('compSkyHint');
      session.say(tf('msgCompanionSays', { name: tycho.creature.stats.name, text }));
      scene.float(tycho.creature, text, '#f0d58c');
    }
    // Shooting stars: at night under the open sky, while the game is running.
    const between = (range: readonly [number, number]) => range[0] + Math.random() * (range[1] - range[0]);
    if (playing) {
      for (const m of renderer.meteors) {
        m.az += m.dAz * m.speed * dt;
        m.el += m.dEl * m.speed * dt;
        m.age += dt;
      }
      renderer.meteors = renderer.meteors.filter((m) => m.age < m.life);
      if (scene.level.outdoor && nightNow && (meteorWait -= dt) <= 0) {
        meteorWait = between(METEORS.every);
        const roll = Math.random();
        const size = roll < 0.6 ? 1 : roll < 0.9 ? 2 : 3;
        const course = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.9);
        const dAz = Math.sin(course);
        const dEl = -Math.cos(course);
        renderer.meteors.push({
          az: player.angle + (Math.random() - 0.5) * 2.2,
          el: 0.4 + Math.random() * 0.8,
          dAz,
          dEl,
          length: 0.05 + size * 0.05 + Math.random() * 0.06,
          size,
          speed: between(METEORS.speed) * (size >= 3 ? 0.75 : 1),
          age: 0,
          life: between(METEORS.life) * (size >= 3 ? 1.3 : 1),
        });
      }
    }
    const starsWanted = gaze >= STAR_GAZE.seconds ? 1 : 0;
    if (starsWanted && gazeBefore < STAR_GAZE.seconds) {
      session.say(t('msgConstellations'));
      // Once per game: learned to find the way by the stars — "Outdoorsman" (for a primary skill one point is two percent).
      if (!session.vars['pc:stargazer']) {
        session.vars['pc:stargazer'] = 1;
        const character = hero.character;
        const before = skillLevel(character, SKILL.outdoorsman);
        const points = [...character.skillPoints];
        points[SKILL.outdoorsman] = (points[SKILL.outdoorsman] ?? 0) + Math.ceil(STARGAZER_BONUS / (character.tagged.includes(SKILL.outdoorsman) ? 2 : 1));
        hero.setCharacter({ ...character, skillPoints: points });
        session.say(tf('msgStargazer', { skill: skillTitle(skillNames, SKILL.outdoorsman), n: skillLevel(hero.character, SKILL.outdoorsman) - before }));
      }
    }
    renderer.constellations = starsWanted
      ? Math.min(1, renderer.constellations + dt * STAR_GAZE.show)
      : Math.max(0, renderer.constellations - dt * STAR_GAZE.hide);
    // The hero sees into the distance by his Perception — the same as NPCs (5 — normal range).
    renderer.sightScale = Math.max(0.6, Math.min(1.6, hero.fighter.special.perception / 5));
    // "Night Vision" (perk): in the dark — at night under the sky and underground — you see farther and brighter.
    const nightEyes = perkRank(hero.character, PERK.nightVision);
    const dark = !scene.level.outdoor || scene.level.outdoor.brightness < 0.6;
    if (nightEyes && dark) renderer.sightScale *= 1 + NIGHT_VISION.sight * nightEyes;
    renderer.darkSight = NIGHT_VISION.light * nightEyes;
    renderer.useSeen(scene.level, scene.seen);
    // Flashes: explosions and enemy shots — from the scene, the hero's shot — slightly in front of him.
    renderer.lights = scene.flashLights();
    // A lit flare on the hero: you see farther (lightBoost — smoothly flares up and fades), and the walls and floor nearby
    // are lit, with a flickering flame.
    flareShine += ((session.flare > 0 ? 1 : 0) - flareShine) * Math.min(1, dt * 4);
    renderer.lightBoost = 1 + Math.max(0, flareShine) * 0.7;
    if (flareShine > 0.02) {
      renderer.lights.push({ x: player.x, y: player.y, radius: FLARE_LIGHT.radius, strength: FLARE_LIGHT.strength * flareShine * (0.88 + Math.random() * 0.12) });
    }
    if (hero.flash > 0 && !hero.melee) {
      renderer.lights.push({ x: player.x + Math.cos(player.angle) * 0.5, y: player.y + Math.sin(player.angle) * 0.5, radius: 3.5, strength: 0.8 });
    }
    // Momentum is noticeable (client, 2026-10-22): the faster (running, bunny hopping), the wider the FOV — from 90° to 130°, like from a speed
    // potion in Minecraft, and at high momentum — rays from the edges toward the middle. On pause and in windows — calm.
    const speed = playing && hero.alive ? Math.hypot(player.vx, player.vy) : 0;
    const rush = speedRush(speed);
    shownFov += (90 + rush * (RUSH_FOV_MAX - 90) - shownFov) * Math.min(1, dt * RUSH_EASE);
    renderer.widen = Math.tan((shownFov * Math.PI) / 360);
    speedRays.update(dt, Math.max(0, (rush - RAYS_FROM) / (1 - RAYS_FROM)));
    renderer.zone = caravanZone();
    // A hit on the hero jerks the camera (hero.ts → takeDamage): for this frame the view is knocked slightly in a random direction.
    const jolt = playing && hero.alive ? hero.shake * hero.shake : 0;
    const joltAngle = (Math.random() * 2 - 1) * HURT_JOLT.angle * jolt;
    const joltPitch = (Math.random() * 2 - 1) * HURT_JOLT.pitch * jolt;
    // Knocked down (combat.ts → knockView): sharply looks up, eyes at ground level, then gets up and straightens.
    if (hero.knockLeft > 0 && !wasKnocked) session.say(t('msgKnockedDown'));
    wasKnocked = hero.knockLeft > 0;
    const knock = hero.knockLeft > 0 && hero.alive ? knockView(KNOCKDOWN_TIME - hero.knockLeft, hero.knockSide) : null;
    const ownPitch = player.pitch;
    if (knock) {
      player.pitch = ownPitch + (knock.pitch - ownPitch) * knock.w;
      player.angle += knock.sway;
      player.eyeDrop = knock.drop;
    }
    player.angle += joltAngle;
    player.pitch += joltPitch;
    renderer.render(scene.level, player, session.wasteland ? [...scene.billboards(player), ...beacons()] : scene.billboards(player));
    player.angle -= joltAngle;
    player.pitch -= joltPitch;
    if (knock) {
      player.pitch = ownPitch;
      player.angle -= knock.sway;
      player.eyeDrop = 0;
    }
    // The hero got hurt — straight from "examine" to the weapon: LMB shoots again.
    if (looking && (hero.hurtFlash > 0.9 || !hero.alive)) looking = false;
    if (hero.alive) {
      drawWeapon(renderer.image, {
        walkTime: scene.walkTime,
        moving: playing && scene.moving,
        recoil: hero.recoil,
        flash: hero.flash > 0,
        // While reloading the weapon is lowered; when looking down it also goes down so as not to get in the way; a holstered one is off the edge of the screen.
        lowered: Math.max(hero.reloadLeft > 0 ? 1 : 0, Math.min(1, Math.max(0, (-player.pitch - 40) / 90)), hero.holsterPos * 2.2, looking ? 0.45 : 0),
        look: weaponLook(hero),
        flashKind: flashKind(hero),
        // First our own picture from the weapons folder, then our own pixel art, otherwise the inventory picture (for items that are not
        // weapons — that one right away).
        picture: hero.weaponItem ? (filePictureOf(hero.weaponItem, weaponLook(hero)) ?? ownPicture(weaponLook(hero)) ?? heldPicture(hero.weaponItem)) : heldPicture(heldTool()),
        melee: hero.melee || hero.thrown,
      });
    }
    // The picture quality changed — the view canvas for the new frame size.
    if (view.width !== renderer.image.width || view.height !== renderer.image.height) {
      view.width = renderer.image.width;
      view.height = renderer.image.height;
    }
    viewCtx.putImageData(renderer.image, 0, 0);
    ctx.drawImage(view, 0, 0, view.width, view.height, 0, 0, SCREEN_W, viewHeight);
    speedRays.draw(ctx, 0, 0, SCREEN_W, viewHeight, Math.max(0, (rush - RAYS_FROM) / (1 - RAYS_FROM)));
    // Radiation: snow and white spots — from field strength, dead pixels and yellowing — from the hero's exposure. A window is open (pause,
    // inventory, Pip-Boy, dialogue, map…) — the noise continues and lies over it (client, 2026-10-25).
    const radLook = radiationLook(radField, session.vars['pc:radiation'] ?? 0);
    const radOver = windowOpen() && lookVisible(radLook);
    if (lookVisible(radLook) && !radOver) radiationView.draw(ctx, SCREEN_W, viewHeight, radLook, dt);
    radOverlay(radOver ? radLook : null, dt);
    // Died from radiation — the frame stays yellow, without red.
    const radDead = !hero.alive && session.killedBy === 'radiation';
    // Explosion flash.
    if (scene.blast > 0) {
      ctx.fillStyle = `rgba(255, 220, 160, ${scene.blast * 0.5})`;
      ctx.fillRect(0, 0, SCREEN_W, viewHeight);
    }
    if ((hero.hurtFlash > 0 || !hero.alive) && !radDead) {
      ctx.fillStyle = `rgba(170, 20, 10, ${hero.alive ? hero.hurtFlash * 0.35 : 0.45})`;
      ctx.fillRect(0, 0, SCREEN_W, viewHeight);
    }
    if (scene.hitFrom && hero.alive) drawHitDirection(ctx, scene.hitFrom, player.angle, viewHeight);
    drawFloats(ctx, res.fonts.main, scene, renderer, viewHeight);
    if (renderer.constellations > 0) drawConstellationNames(ctx, renderer, viewHeight);
    if (hero.alive && state === 'play') drawCompass(ctx, SCREEN_W, player.angle, compassTarget());
    const away = session.caravan?.away ?? 0;
    if (away > 0 && hero.alive && state === 'play') drawCaravanWarning(ctx, Math.max(1, Math.ceil(CARAVAN.grace - away)));
    if (hero.alive && state === 'play') drawSpeed(ctx, Math.round(Math.hypot(player.vx, player.vy) * KMH_PER_CELL));
    // The crosshair is the spread circle (where the bullet may land; smoothly grows and shrinks), for melee — a dot; in
    // "examine" mode — binoculars.
    shownSpread += (scene.heroSpread(player, renderer) - shownSpread) * Math.min(1, dt * SPREAD_EASE);
    if (hero.alive && looking) drawBinoculars(ctx, SCREEN_W / 2, viewHeight / 2);
    else if (hero.alive && hero.knockLeft <= 0) {
      drawCrosshair(ctx, SCREEN_W / 2, viewHeight / 2, hero.melee ? 0 : shownSpread, hero.attackLeft, hero.attackDelayTotal, res.fonts.main, hpTone(hero.hp, hero.maxHp));
      drawAmmoAtCrosshair(ctx, res.fonts.main, SCREEN_W / 2, viewHeight / 2, hero);
    }
    res.hud.draw(ctx, viewHeight, hero, session.messages, session.spoken, hero.alive ? heroIndicators() : []);
    if (!screens.open && !automap.open && !pipboy.open && !elevator && !dialogue.isOpen && !worldMap.isOpen && !polygon.isOpen && !sheetOpen() && !skilldex.isOpen && hero.alive && state === 'play' && !busy) {
      if (skillAction && hero.skillBusy) {
        const name = skillTitle(skillNames, skillAction.skill);
        drawPrompt(ctx, name ? tf('promptSkillBusy', { name }) : t('promptSkillBusyPlain'), viewHeight, 1 - hero.skillLeft / hero.skillTotal);
      } else if (aimMode) {
        // Aimed attack: on the right — the target's body parts with chances (the chosen one is yellow), at the bottom — how to choose.
        const target = scene.aimTarget(renderer, player);
        const parts = target?.parts ?? AIM_PARTS;
        const chosen = shownAimPart(parts);
        const rows = target
          ? parts.map((part) => ({ label: t(`aim${part[0]!.toUpperCase()}${part.slice(1)}` as Parameters<typeof t>[0]), chance: aimedChance(part, hero.fighter.special.luck), on: part === chosen }))
          : [];
        drawAimPanel(ctx, t('aimTitle'), target ? target.creature.stats.name : t('aimNoTarget'), rows);
        drawPrompt(ctx, usingPad() ? tf('aimHintPad', padLabels()) : tf('aimHint', { n: parts.length }), viewHeight);
      } else if (looking) {
        const target = scene.examineTarget(renderer);
        if (target?.kind === 'creature' && target.creature.alive) {
          drawSeen(ctx, seenText(target.creature), viewHeight);
          drawPrompt(ctx, lookPrompt(''), viewHeight);
        } else {
          drawPrompt(ctx, lookPrompt(target ? lookName(target) : ''), viewHeight);
        }
      } else {
        const focus = scene.focus(player);
        if (focus?.kind === 'npc') {
          drawSeen(ctx, seenText(focus.creature), viewHeight);
          drawPrompt(ctx, padPrompt(t('promptTalkPlain')), viewHeight);
        } else {
          if (focus?.kind === 'door' && focus.door.script) drawSeen(ctx, seenDoorText(focus.door), viewHeight);
          const prompt = scene.prompt(focus);
          if (prompt) drawPrompt(ctx, padPrompt(prompt), viewHeight);
        }
      }
    }
    if (busy) drawPrompt(ctx, t('loading'), viewHeight / 2 + 12);
    if (session.banner) {
      const left = session.banner.until - performance.now();
      if (left <= 0) session.banner = null;
      else drawBanner(ctx, session.banner.text, Math.min(1, left / 1000), viewHeight);
    }
    screens.draw(ctx);
    // In the inventory window the cursor is an arrow or binoculars.
    if (screens.open && screens.lookMode !== binocularsShown) {
      binocularsShown = screens.lookMode;
      canvas.style.cursor = binocularsShown ? binocularsCursor : 'default';
    } else if (!screens.open) binocularsShown = false;
    automap.draw(ctx, scene.level, renderer.seen, player);
    pipboy.draw(ctx, {
      clock: session.clock,
      place: session.mapTitle(),
      canRest: !session.hero.inCombat,
      health: { hp: session.hero.hp, max: session.hero.maxHp },
      secondsToHeal: () => session.secondsToHeal(),
      quests: pipboy.open ? questGroups(questVar, (id) => pipboy.message(id), session.vars) : [],
    });
  };
  requestAnimationFrame(frame);
  // For testing: run the game forward this many seconds (in frames of 0.05 s), even if the window is hidden.
  // For testing: a special encounter, a squad or the curse — right in front of the hero.
  debug.meetSpecial = (key: SpecialKey) => {
    const p = session.player;
    return meetSpecial(key, p.x + Math.cos(p.angle) * 8, p.y + Math.sin(p.angle) * 8);
  };
  debug.spawnSquad = (squad: Squad, hunt = false) => {
    const p = session.player;
    return spawnSquad(squad, p.x + Math.cos(p.angle) * 15, p.y + Math.sin(p.angle) * 15, hunt ? { x: p.x, y: p.y } : null);
  };
    debug.step = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.05) step(0.05);
  };
}

/**
 * A red glow at the edge of the screen on the side you were bitten from: left, right, behind (bottom).
 * If the enemy is in front but very close — also bottom: it means he is right at your feet.
 */
function drawHitDirection(
  ctx: CanvasRenderingContext2D,
  hit: { angle: number; near: boolean; time: number },
  viewAngle: number,
  viewHeight: number,
): void {
  let rel = hit.angle - viewAngle;
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  const deg = (rel * 180) / Math.PI;
  const alpha = Math.min(1, hit.time) * 0.7;
  const size = 60;
  const glow = (x0: number, y0: number, x1: number, y1: number, rect: [number, number, number, number]) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(220, 30, 20, ${alpha})`);
    g.addColorStop(1, 'rgba(220, 30, 20, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(...rect);
  };
  const front = Math.abs(deg) < 40;
  if (front && !hit.near) return;
  if (front || Math.abs(deg) > 130) glow(0, viewHeight, 0, viewHeight - size, [0, viewHeight - size, SCREEN_W, size]);
  else if (deg > 0) glow(SCREEN_W, 0, SCREEN_W - size, 0, [SCREEN_W - size, 0, size, viewHeight]);
  else glow(0, 0, size, 0, [0, 0, size, viewHeight]);
}

/** Ready-made pictures of overhead lines: drawn once per line. */
const floatImages = new WeakMap<FloatText, HTMLCanvasElement>();

/**
 * A line: rows in the original's font with a black outline, the whole block centered. A short one — a narrow column above the head,
 * a long one (Ian about locations) — wider, so it doesn't stretch over half the screen.
 */
function floatImage(font: BitmapFont, f: FloatText): HTMLCanvasElement {
  let image = floatImages.get(f);
  if (image) return image;
  let wrap = FLOAT_WIDTH;
  let lines = wrapText(font, f.text, wrap);
  while (lines.length > FLOAT_LINES && wrap < FLOAT_MAX_WIDTH) {
    wrap = Math.min(FLOAT_MAX_WIDTH, wrap + 60);
    lines = wrapText(font, f.text, wrap);
  }
  const height = lineHeight(font);
  const rendered = lines.map((line) => ({ dark: renderText(font, line, '#000000'), light: renderText(font, line, f.color) }));
  const width = Math.max(1, ...rendered.map((r) => r.light.width)) + 2;
  image = document.createElement('canvas');
  image.width = width;
  image.height = lines.length * height + 2;
  const g = image.getContext('2d')!;
  rendered.forEach(({ dark, light }, i) => {
    if (light.width === 0) return;
    const layer = (r: typeof light) => {
      const c = document.createElement('canvas');
      c.width = r.width;
      c.height = r.height;
      c.getContext('2d')!.putImageData(new ImageData(r.pixels, r.width, r.height), 0, 0);
      return c;
    };
    const x = Math.round((width - light.width) / 2);
    const y = i * height;
    const shadow = layer(dark);
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]] as const) g.drawImage(shadow, x + dx, y + dy);
    g.drawImage(layer(light), x + 1, y + 1);
  });
  floatImages.set(f, image);
  return image;
}

/** Lines above NPCs' heads (float_msg of scripts) — above the sprite, if it is visible and not far away. */
function drawFloats(ctx: CanvasRenderingContext2D, font: BitmapFont, scene: Scene, renderer: Renderer, viewHeight: number): void {
  const sx = SCREEN_W / VIEW_W;
  const sy = viewHeight / VIEW_H;
  for (const [creature, f] of scene.floats) {
    const at = renderer.anchorOf(creature.id);
    if (!at || at.depth > FLOAT_RANGE) continue;
    const image = floatImage(font, f);
    const x = Math.round(Math.min(SCREEN_W - image.width, Math.max(0, at.x * sx - image.width / 2)));
    const y = Math.round(Math.max(2, at.y * sy - image.height - 4));
    ctx.drawImage(image, x, y);
  }
}

/** i18n key of a constellation name (stars.ts → key): ursaMajor → constellationUrsaMajor. */
const constellationName = (key: string): StringKey => `constellation${key[0]!.toUpperCase()}${key.slice(1)}` as StringKey;

/** Constellation captions (when their lines are visible): the name — at the middle of the visible stars, in pale blue. */
function drawConstellationNames(ctx: CanvasRenderingContext2D, renderer: Renderer, viewHeight: number): void {
  const sx = SCREEN_W / VIEW_W;
  const sy = viewHeight / VIEW_H;
  ctx.save();
  ctx.globalAlpha = Math.min(1, renderer.constellations) * 0.85;
  ctx.font = '15px VT323, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#a8c4f0';
  for (const label of renderer.starLabels) ctx.fillText(t(constellationName(label.key)), label.x * sx, label.y * sy - 8);
  ctx.restore();
}

/**
 * The hero's speed in the top-right corner — just a number (km/h; client, 2026-10-22): a fixed-width plate, the number —
 * right-aligned (nothing jumps).
 */
function drawSpeed(ctx: CanvasRenderingContext2D, kmh: number): void {
  const w = 48;
  const x = SCREEN_W - w - 8;
  ctx.fillStyle = 'rgba(11, 10, 8, 0.7)';
  ctx.fillRect(x, 6, w, 20);
  ctx.font = '18px VT323, monospace';
  ctx.fillStyle = '#f0b43c';
  ctx.textAlign = 'right';
  ctx.fillText(String(kmh), x + w - 6, 21);
}

/** The hero is outside the caravan's blue zone: how many seconds are left to return. */
function drawCaravanWarning(ctx: CanvasRenderingContext2D, seconds: number): void {
  const text = tf('caravanWarning', { n: seconds });
  ctx.font = '22px VT323, monospace';
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  const x = (SCREEN_W - w) / 2;
  ctx.fillStyle = 'rgba(11, 10, 8, 0.75)';
  ctx.fillRect(x, 48, w, 28);
  ctx.fillStyle = '#6f9bff';
  ctx.textAlign = 'center';
  ctx.fillText(text, SCREEN_W / 2, 69);
}

/**
 * Crosshair: a dot and a spread circle of radius radius (under three pixels — just a dot). A dark outline — to be visible on sand.
 * While the delay before the next attack runs (left of total seconds; client, 2026-10-27), the circle is drawn clockwise
 * from the top — closed, you can shoot; for melee the circle is small during this time; in the middle instead of the dot — how many seconds
 * are left (when there are at least a tenth).
 */
/**
 * Crosshair color follows the hero's health (client, 2026-10-27), like the health digits on the panel: normal, yellow, red.
 * dot — the dot and delay digits, ring — the circle.
 */
const CROSSHAIR_TONE: Record<HpTone, { dot: string; ring: string }> = {
  normal: { dot: '#e9dcc0', ring: 'rgba(233, 220, 192, 0.85)' },
  yellow: { dot: '#ffd23c', ring: 'rgba(255, 210, 60, 0.9)' },
  red: { dot: '#ff3c28', ring: 'rgba(255, 60, 40, 0.9)' },
};

function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, left: number, total: number, font: BitmapFont, tone: HpTone = 'normal'): void {
  const color = CROSSHAIR_TONE[tone];
  const waiting = left > 0;
  if (waiting && left >= 0.1) {
    const text = formatDecimal(left);
    drawLabel(ctx, font, text, x + 1, y - font.height / 2 + 1, AMMO_LABEL.shadow, 'center');
    drawLabel(ctx, font, text, x, y - font.height / 2, tone === 'normal' ? AMMO_LABEL.color : color.dot, 'center');
  } else {
    ctx.fillStyle = color.dot;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  if (waiting) radius = Math.max(radius, COOLDOWN_RING);
  if (radius < 3) return;
  const done = waiting ? 1 - left / Math.max(total, left) : 1;
  if (done <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * done);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = color.ring;
  ctx.stroke();
}

/**
 * Ammo at the crosshair (client, 2026-10-27): how many are in the magazine (the whole reserve — in the inventory and on the bottom panel), while
 * reloading — "Reloading…", for a thrown weapon — how many are left. The label's position is fixed (bottom right of the aim point) — it doesn't jump with the spread circle.
 */
function drawAmmoAtCrosshair(ctx: CanvasRenderingContext2D, font: BitmapFont, x: number, y: number, hero: Hero): void {
  if (hero.melee && !hero.thrown) return;
  const text = hero.thrown ? `×${hero.reserve}` : hero.reloadLeft > 0 ? t('hudReloading') : `${hero.magazine}`;
  const low = !hero.thrown && hero.reloadLeft <= 0 && hero.magazine <= Math.max(1, Math.floor(hero.weapon.capacity / 4));
  // A dark shadow — so it reads on light sand too.
  drawLabel(ctx, font, text, x + AMMO_LABEL.dx + 1, y + AMMO_LABEL.dy + 1, AMMO_LABEL.shadow);
  drawLabel(ctx, font, text, x + AMMO_LABEL.dx, y + AMMO_LABEL.dy, low ? AMMO_LABEL.low : AMMO_LABEL.color);
}

function drawBinoculars(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const shape = () => {
    ctx.beginPath();
    ctx.arc(x - 8, y + 2, 6, 0, Math.PI * 2);
    ctx.moveTo(x + 14, y + 2);
    ctx.arc(x + 8, y + 2, 6, 0, Math.PI * 2);
    ctx.moveTo(x - 3, y - 2);
    ctx.lineTo(x + 3, y - 2);
    ctx.moveTo(x - 12, y - 3);
    ctx.lineTo(x - 5, y - 7);
    ctx.moveTo(x + 12, y - 3);
    ctx.lineTo(x + 5, y - 7);
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(11, 10, 8, 0.8)';
  ctx.lineWidth = 4;
  shape();
  ctx.stroke();
  ctx.strokeStyle = '#e9dcc0';
  ctx.lineWidth = 2;
  shape();
  ctx.stroke();
  ctx.fillStyle = '#e9dcc0';
  ctx.fillRect(x - 1, y - 1, 2, 2);
  ctx.restore();
}

/** Action hint above the panel, centered. */
/** Hint at the bottom of the screen; progress (0..1) — a progress bar of the action along the bottom of the same plate (a skill in hand). */
/** "What you see" — above the key hint: the description from the look-at script, up to two lines. */
function drawSeen(ctx: CanvasRenderingContext2D, text: string, viewHeight: number): void {
  if (!text) return;
  ctx.font = '18px VT323, monospace';
  ctx.textAlign = 'center';
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > SEEN_WIDTH) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 2);
  if (lines.length > 2) shown[1] = shown[1]!.replace(/\s*\S*$/, '…');
  const width = Math.max(...shown.map((l) => ctx.measureText(l).width)) + 20;
  const top = viewHeight - 44 - shown.length * 20 - 4;
  ctx.fillStyle = 'rgba(11, 10, 8, 0.75)';
  ctx.fillRect(SCREEN_W / 2 - width / 2, top, width, shown.length * 20 + 4);
  ctx.fillStyle = '#d8d0b8';
  shown.forEach((l, i) => ctx.fillText(l, SCREEN_W / 2, top + 17 + i * 20));
}

/** Big caption in the upper third of the screen (session.announce): red, up to three lines, fades toward the end (alpha). */
function drawBanner(ctx: CanvasRenderingContext2D, text: string, alpha: number, viewHeight: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '24px VT323, monospace';
  ctx.textAlign = 'center';
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > BANNER_WIDTH) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 4);
  const width = Math.max(...shown.map((l) => ctx.measureText(l).width)) + 32;
  const top = Math.round(viewHeight * 0.22);
  ctx.fillStyle = 'rgba(11, 6, 4, 0.82)';
  ctx.fillRect(SCREEN_W / 2 - width / 2, top, width, shown.length * 26 + 14);
  ctx.fillStyle = '#ff5a40';
  shown.forEach((l, i) => ctx.fillText(l, SCREEN_W / 2, top + 28 + i * 26));
  ctx.restore();
}

/**
 * The aimed attack list on the right: header, who we're hitting (or "aim at a target"), body parts with number and chance; the chosen one is
 * yellow with an arrow. The window is one width, the rows don't jump.
 */
function drawAimPanel(ctx: CanvasRenderingContext2D, title: string, subtitle: string, rows: { label: string; chance: number; on: boolean }[]): void {
  const width = 200;
  const left = SCREEN_W - width - 10;
  const top = 64;
  ctx.font = '18px VT323, monospace';
  // The caption wraps by words to the window width, no more than two lines ("Aim the crosshair at an enemy" didn't fit on one).
  const lines: string[] = [];
  let line = '';
  for (const word of subtitle.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width - 20) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 2);
  if (lines.length > 2) shown[1] = shown[1]!.replace(/\s*\S*$/, '…');
  const rowsTop = top + 41 + (shown.length - 1) * 20;
  const height = 50 + (shown.length - 1) * 20 + rows.length * 20 + (rows.length ? 6 : 0);
  ctx.fillStyle = 'rgba(11, 10, 8, 0.8)';
  ctx.fillRect(left, top, width, height);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f0b43c';
  ctx.fillText(title, left + 10, top + 19);
  ctx.fillStyle = '#d8d0b8';
  shown.forEach((l, i) => ctx.fillText(l, left + 10, top + 39 + i * 20));
  rows.forEach((row, i) => {
    const y = rowsTop + 20 + i * 20;
    ctx.fillStyle = row.on ? '#f0b43c' : '#b3a585';
    ctx.textAlign = 'left';
    ctx.fillText(`${row.on ? '▶' : ' '} ${i + 1}. ${row.label}`, left + 6, y);
    ctx.textAlign = 'right';
    ctx.fillText(`${row.chance}%`, left + width - 10, y);
  });
  ctx.textAlign = 'center';
}

function drawPrompt(ctx: CanvasRenderingContext2D, text: string, viewHeight: number, progress?: number): void {
  ctx.font = '18px VT323, monospace';
  ctx.textAlign = 'center';
  const width = Math.max(ctx.measureText(text).width + 20, progress === undefined ? 0 : 160);
  const left = SCREEN_W / 2 - width / 2;
  ctx.fillStyle = 'rgba(11, 10, 8, 0.75)';
  ctx.fillRect(left, viewHeight - 40, width, 24);
  ctx.fillStyle = '#f0b43c';
  ctx.fillText(text, SCREEN_W / 2, viewHeight - 22);
  if (progress !== undefined) ctx.fillRect(left, viewHeight - 19, width * Math.max(0, Math.min(1, progress)), 3);
}
