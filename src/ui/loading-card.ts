// Loading screen (client request, 2026-10-28): while the game or another location loads — an original talking head on its dialogue
// background and a deliberately dumb tip at the bottom, like meme subtitles ("People die if they are killed"). The head and background come from the player's
// copy; the tips are ours (i18n, tip01…). Tips go as a "deck": one at a time in random order until all have been shown —
// so they almost never repeat (the deck is remembered between launches). A short load does not show the card — nothing
// flickers; a shown card stays until the tip can be read. No head in the copy — the tip on black. "Avatar face" memes
// (client request, 2026-10-29) — without a picture: instead of it the file name "*compressed avatar face meme.jpg*", question on top, answer at the bottom.
import { GameAssets } from '../assets/sprites.ts';
import { getLang, t, type Lang, type StringKey } from '../i18n.ts';
import { platform } from '../platform.ts';

/**
 * A tip and who "says" it: a head from ART\HEADS (file name without the mood). No head — a meme without a picture: the text has
 * question and answer separated by "|".
 */
export interface LoadingTip {
  text: StringKey;
  head?: string;
  /** Only for this game language (puns that do not translate). */
  lang?: Lang;
}

/** Dialogue background for each head — by the location where the critter lives. */
export const HEAD_SCENES: Readonly<Record<string, string>> = {
  OVRSR: 'VAULT.FRM',
  ARDSH: 'SHADY.FRM',
  TANDI: 'SHADY.FRM',
  SETTT: 'SHADY.FRM',
  KILLN: 'JUNKTOWN.FRM',
  GIZMO: 'JUNKTOWN.FRM',
  HARLD: 'HUB.FRM',
  DEKKR: 'HUB.FRM',
  BUTCH: 'HUB.FRM',
  LOXLY: 'HUB.FRM',
  HARRY: 'NECRO.FRM',
  LIEUT: 'MILITARY.FRM',
  MASTR: 'MASTER.FRM',
  MAXSN: 'BHOOD.FRM',
  RHOMB: 'BHOOD.FRM',
  CABBT: 'BHOOD.FRM',
  VVREE: 'BHOOD.FRM',
  NICOL: 'FOLLOW.FRM',
  MORPH: 'CATH.FRM',
  JAINN: 'CATH.FRM',
  LAURA: 'CATH.FRM',
};

export const LOADING_TIPS: readonly LoadingTip[] = [
  { text: 'tip01', head: 'SETTT' },
  { text: 'tip02', head: 'ARDSH' },
  { text: 'tip03', head: 'RHOMB' },
  { text: 'tip04', head: 'KILLN' },
  { text: 'tip05', head: 'MAXSN' },
  { text: 'tip06', head: 'HARRY' },
  { text: 'tip07', head: 'JAINN' },
  { text: 'tip08', head: 'OVRSR' },
  { text: 'tip09', head: 'CABBT' },
  { text: 'tip10', head: 'LAURA' },
  { text: 'tip11', head: 'BUTCH' },
  { text: 'tip12', head: 'GIZMO' },
  { text: 'tip13', head: 'DEKKR' },
  { text: 'tip14', head: 'LOXLY' },
  { text: 'tip15', head: 'TANDI' },
  { text: 'tip16', head: 'VVREE' },
  { text: 'tip17', head: 'HARLD' },
  { text: 'tip18', head: 'LIEUT' },
  { text: 'tip19', head: 'KILLN' },
  { text: 'tip20', head: 'LOXLY' },
  { text: 'tip21', head: 'ARDSH' },
  { text: 'tip22', head: 'NICOL' },
  { text: 'tip23', head: 'VVREE' },
  { text: 'tip24', head: 'MORPH' },
  { text: 'tip25', head: 'LAURA' },
  { text: 'tip26', head: 'TANDI' },
  { text: 'tip27', head: 'MASTR' },
  { text: 'tip28', head: 'GIZMO' },
  { text: 'tip29', head: 'SETTT' },
  { text: 'tip30', head: 'OVRSR' },
  { text: 'tip31', head: 'DEKKR' },
  { text: 'tip32', head: 'CABBT' },
  { text: 'tip33', head: 'HARRY' },
  { text: 'tip34' },
  { text: 'tip35' },
  { text: 'tip36', lang: 'en' },
  { text: 'tip37', lang: 'en' },
  { text: 'tip38', lang: 'en' },
  { text: 'tip39' },
  { text: 'tip40', lang: 'en' },
  { text: 'tip41', head: 'MAXSN' },
  { text: 'tip42', head: 'GIZMO' },
  { text: 'tip43', head: 'LOXLY' },
  { text: 'tip44', head: 'SETTT' },
];

/** The head window in the original's dialogue (background size), in pixels. */
const PICTURE = { w: 388, h: 200 };
/** A load shorter than delay (ms) does not show the card; a shown one stays at least hold. */
export const LOADING_CARD = { delay: 250, hold: 2200 };
/** The tip deck between launches (numbers not shown yet). */
const DECK_KEY = '150days.tips';

/**
 * Tip deck: numbers in random order; when it runs out — a new one, and its first tip is not the one shown last. The result is
 * the tip number and the deck after it.
 */
export function drawTip(deck: readonly number[], count: number, last: number, random: () => number = Math.random): { tip: number; deck: number[] } {
  let rest = deck.filter((i) => Number.isInteger(i) && i >= 0 && i < count);
  if (rest.length === 0) {
    rest = Array.from({ length: count }, (_, i) => i);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [rest[i], rest[j]] = [rest[j]!, rest[i]!];
    }
    if (rest.length > 1 && rest[0] === last) rest.push(rest.shift()!);
  }
  const [tip, ...next] = rest;
  return { tip: tip!, deck: next };
}

/** A tip for the game language: the deck skips tips of the other language (puns that do not translate). */
export function drawTipFor(deck: readonly number[], last: number, lang: Lang, random: () => number = Math.random): { tip: number; deck: number[] } {
  let next = drawTip(deck, LOADING_TIPS.length, last, random);
  for (let n = 0; n < LOADING_TIPS.length * 2 && (LOADING_TIPS[next.tip]!.lang ?? lang) !== lang; n++) next = drawTip(next.deck, LOADING_TIPS.length, next.tip, random);
  return next;
}

let lastTip = -1;

/** The next tip from the deck (the deck lives in the window's storage; none — start a new one). */
function nextTip(): LoadingTip {
  let deck: number[] = [];
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(DECK_KEY) ?? '[]');
    if (Array.isArray(saved)) deck = saved.filter((n): n is number => typeof n === 'number');
  } catch {
    deck = [];
  }
  const { tip, deck: rest } = drawTipFor(deck, lastTip, getLang());
  lastTip = tip;
  try {
    localStorage.setItem(DECK_KEY, JSON.stringify(rest));
  } catch {
    // No window storage — the deck lives until restart.
  }
  return LOADING_TIPS[tip]!;
}

const STYLE_ID = 'loading-card-style';
const STYLE = `
.ltip-host { position: fixed; inset: 0; z-index: 14; display: grid; place-items: center; background: #000; cursor: default; }
.ltip-host[hidden] { display: none; }
.ltip-stage { width: min(100vw, calc(100vh * 4 / 3)); aspect-ratio: 4 / 3; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2.5%; }
.ltip-frame { position: relative; width: 90%; aspect-ratio: ${PICTURE.w} / ${PICTURE.h}; background: #000; border: 2px solid #3d3626; }
.ltip-picture { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
.ltip-text { position: absolute; left: 4%; right: 4%; bottom: 5%; margin: 0; text-align: center; color: #fff; font-size: clamp(20px, 3.6vmin, 38px); line-height: 1.15; text-wrap: balance;
  text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000; }
.ltip-top { position: absolute; left: 4%; right: 4%; top: 5%; margin: 0; text-align: center; }
.ltip-missing { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: #8a8a8a; font-size: clamp(16px, 2.8vmin, 28px); font-style: italic; }
.ltip-frame [hidden] { display: none; }
.ltip-meme .ltip-frame { background: #10161c; }
.ltip-meme .ltip-text, .ltip-meme .ltip-top { color: #fff; font-family: Impact, 'Arial Black', sans-serif; font-size: clamp(22px, 4.6vmin, 46px); text-transform: uppercase; letter-spacing: 0.02em;
  text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 2px 0 #000, 0 -2px 0 #000, 2px 0 0 #000, -2px 0 0 #000; }
.ltip-status { width: 90%; margin: 0; text-align: right; color: var(--muted); font-size: clamp(16px, 2.6vmin, 26px); }
.ltip-host.ltip-fade { animation: ltip-in 160ms ease-out; }
@keyframes ltip-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .ltip-host.ltip-fade { animation: none; } }
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE;
  document.head.append(style);
}

let assetsPromise: Promise<GameAssets> | null = null;
const pictures = new Map<string, Promise<HTMLCanvasElement | null>>();

/** Tip picture: dialogue background and a still head (first frame of the calm "fidget"), as in the dialogue window. */
function pictureOf(head: string): Promise<HTMLCanvasElement | null> {
  let picture = pictures.get(head);
  if (!picture) {
    picture = (async () => {
      const B = String.fromCharCode(92);
      assetsPromise ??= GameAssets.load();
      const assets = await assetsPromise;
      const canvas = document.createElement('canvas');
      canvas.width = PICTURE.w;
      canvas.height = PICTURE.h;
      const ctx = canvas.getContext('2d')!;
      const back = `ART${B}BACKGRND${B}${HEAD_SCENES[head] ?? 'BACK1.FRM'}`;
      if (await platform.gameFileExists(back)) ctx.drawImage(await assets.image(back), 0, 0, PICTURE.w, PICTURE.h);
      const file = `ART${B}HEADS${B}${head}NF1.FRM`;
      if (await platform.gameFileExists(file)) {
        const frm = await assets.frm(file);
        const direction = frm.directions[0];
        const frame = direction?.frames[0];
        if (direction && frame) {
          const sprite = assets.colorize(frame.width, frame.height, frame.pixels);
          const still = document.createElement('canvas');
          still.width = sprite.width;
          still.height = sprite.height;
          const stillCtx = still.getContext('2d')!;
          const data = stillCtx.createImageData(sprite.width, sprite.height);
          new Uint32Array(data.data.buffer).set(sprite.pixels);
          stillCtx.putImageData(data, 0, 0);
          ctx.drawImage(still, Math.round((PICTURE.w - sprite.width) / 2) + direction.shiftX, PICTURE.h - sprite.height + direction.shiftY);
        }
      }
      return canvas;
    })().catch(() => null);
    pictures.set(head, picture);
  }
  return picture;
}

/**
 * Loading card in parent. show() — at once (game start: loading takes seconds); during(job) — for transitions: the card
 * appears only if job takes longer than LOADING_CARD.delay, and once shown, does not disappear before LOADING_CARD.hold.
 */
export class LoadingCard {
  private readonly host: HTMLElement;
  private readonly picture: HTMLCanvasElement;
  private readonly text: HTMLElement;
  private readonly top: HTMLElement;
  private readonly missing: HTMLElement;
  private readonly status: HTMLElement;
  private shownAt = 0;
  private token = 0;

  constructor(parent: HTMLElement) {
    ensureStyle();
    this.host = document.createElement('div');
    this.host.className = 'ltip-host';
    this.host.hidden = true;
    this.host.setAttribute('role', 'status');
    this.host.setAttribute('aria-live', 'polite');
    this.host.innerHTML =
      '<div class="ltip-stage"><div class="ltip-frame"><canvas class="ltip-picture" aria-hidden="true"></canvas><p class="ltip-missing" hidden></p><p class="ltip-top" hidden></p><p class="ltip-text"></p></div><p class="ltip-status"></p></div>';
    this.picture = this.host.querySelector('canvas')!;
    this.picture.width = PICTURE.w;
    this.picture.height = PICTURE.h;
    this.text = this.host.querySelector('.ltip-text')!;
    this.top = this.host.querySelector('.ltip-top')!;
    this.missing = this.host.querySelector('.ltip-missing')!;
    this.status = this.host.querySelector('.ltip-status')!;
    parent.append(this.host);
  }

  get isOpen(): boolean {
    return !this.host.hidden;
  }

  /** Show the card with the next tip. */
  show(): void {
    const token = ++this.token;
    const tip = nextTip();
    const meme = !tip.head;
    // Meme: question on top, answer at the bottom; no picture — only its name.
    const [question, answer] = t(tip.text).split('|');
    this.host.classList.toggle('ltip-meme', meme);
    this.top.hidden = !meme;
    this.missing.hidden = !meme;
    this.picture.hidden = meme;
    this.top.textContent = meme ? (question ?? '') : '';
    this.text.textContent = meme ? (answer ?? '') : t(tip.text);
    this.missing.textContent = meme ? t('tipMemePicture') : '';
    this.status.textContent = t('loading');
    const ctx = this.picture.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, PICTURE.w, PICTURE.h);
    if (tip.head) {
      void pictureOf(tip.head).then((canvas) => {
        if (canvas && token === this.token) ctx.drawImage(canvas, 0, 0);
      });
    }
    this.host.classList.add('ltip-fade');
    this.host.hidden = false;
    this.shownAt = performance.now();
  }

  hide(): void {
    this.token++;
    this.host.hidden = true;
    this.host.classList.remove('ltip-fade');
  }

  /** Load job under the card: a short one — without the card, a long one — with it, and the card stays while the tip is read. */
  async during<T>(job: () => Promise<T>): Promise<T> {
    const timer = window.setTimeout(() => this.show(), LOADING_CARD.delay);
    try {
      return await job();
    } finally {
      window.clearTimeout(timer);
      if (this.isOpen) {
        const left = LOADING_CARD.hold - (performance.now() - this.shownAt);
        if (left > 0) await new Promise((resolve) => window.setTimeout(resolve, left));
        this.hide();
      }
    }
  }
}

/** When the game start card was shown (0 — not shown). */
let startShownAt = 0;

/** Game start (new game, loading a save): the whole screen is the loading card; the game replaces it when ready. */
export function showLoadingCard(root: HTMLElement): void {
  root.innerHTML = '';
  new LoadingCard(root).show();
  startShownAt = performance.now();
}

/** The game is ready: wait until the start card's tip can be read (a fast load does not flash the card). */
export async function afterLoadingCard(): Promise<void> {
  if (!startShownAt) return;
  const left = LOADING_CARD.hold - (performance.now() - startShownAt);
  startShownAt = 0;
  if (left > 0) await new Promise((resolve) => window.setTimeout(resolve, left));
}
