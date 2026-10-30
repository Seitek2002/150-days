// The character creation screen: the original's editor image (INTRFACE.LST #169, EDTRCRTE.FRM, 640×480) and the original's fonts.
// On the left — seven stats with "+" and "−" buttons (digits from BIGNUM.FRM, #170), in the middle — the name, the "Done" and "Cancel" buttons
// and derived stats, on the right — skills (click — tag skill, three in total) and a description of what is pointed at or where the cursor is,
// bottom left — sixteen traits in two columns (no more than two). Names and descriptions of stats, skills and traits
// are read from the player's copy's STAT.MSG, SKILL.MSG and TRAIT.MSG; our labels are in i18n.
// Rules — `character.ts` (C5): each stat from 1 to 10, five free points on top of five for each, three tag skills,
// up to two traits; everything on the right is recalculated immediately. "Done" doesn't work until the points are spent and three skills are chosen.
// The layout doesn't change: nothing jumps, and why "Done" isn't available yet is written in the status line next to the buttons.
// A self-contained module: `new CharacterScreen(parent).open(start)` returns a character or null (cancelled). Mouse and keyboard.
import { GameAssets } from '../assets/sprites.ts';
import { fitText, measureText, type BitmapFont } from '../formats/font.ts';
import { parseLst, parseMsg } from '../formats/text.ts';
import { t, tf, type StringKey } from '../i18n.ts';
import { platform } from '../platform.ts';
import {
  AGE_DEFAULT,
  AGE_MAX,
  AGE_MIN,
  creationPointsLeft,
  derivedStats,
  isValidSpecial,
  isValidTagged,
  isValidTraits,
  MAX_TRAITS,
  skillLevel,
  SKILL_COUNT,
  SPECIAL_MAX,
  SPECIAL_MIN,
  SPECIAL_NAMES,
  TAGGED_SKILLS,
  TRAIT_COUNT,
  type Character,
  type Gender,
  type Special,
} from './character.ts';
import { drawLabel, loadInterfaceFonts, wrapText } from './fonts.ts';
import { padLabels, usingPad } from './gamepad.ts';

// ---------- the original's window geometry (640×480) ----------

const SCREEN = { w: 640, h: 480 };
/** INTRFACE.LST images: the editor window and drum digits (white 0–9, then red; each digit 14×24). */
const ART = { background: 169, digits: 170 };
const DIGIT = { w: 14, h: 24, redFrom: 168 };

/** Stat rows: the vertical middle of the row. */
export const specialCenter = (index: number): number => 49 + 33 * index;
const SPECIAL = { x: 20, w: 130, numberX: 59, numberW: 31, wordX: 100, wordW: 46, plusX: 151, plusW: 16 };
/** The "points left" box bottom left and "tag skills left" on the right. */
const POINTS_WINDOW = { x: 126, y: 284, w: 31, h: 22 };
const POINTS_LABEL = { x: 26, y: 285, w: 98 };
const TAGS_WINDOW = { x: 522, y: 230, w: 31, h: 21 };
const TAGS_LABEL = { right: 516, y: 236, w: 170 };
/** Skill list: the black window on the right (18 rows of 11 pixels). */
const SKILLS = { x: 369, y: 27, w: 247, row: 11, markX: 372, nameX: 380, valueRight: 608, titleX: 484, titleY: 9 };
/** Traits: two columns of eight, lamps at the sides of the window (row middles). */
const TRAIT_ROWS = [357, 370, 384, 397, 410, 423, 437, 450];
const TRAITS = { leftText: 49, rightText: 176, textW: 118, leftLamp: 24, rightLamp: 297, lampW: 17, lampH: 11, rowH: 13, titleX: 171, titleY: 331 };
/** Name, status line and buttons — in the top middle frame. */
const NAME = { labelX: 194, labelY: 42, x: 192, y: 54, w: 121, h: 17, textX: 196, textY: 58 };
const STATUS = { x: 194, y: 80, w: 117, lines: 4 };
const BUTTONS = { done: { x: 192, y: 126, w: 58, h: 22 }, cancel: { x: 255, y: 126, w: 58, h: 22 } };
/** Derived stats — in the bottom middle frame. */
const DERIVED = { x: 188, w: 130, labelX: 193, valueRight: 312, top: 177, step: 12.6 };
/** Description — on the parchment bottom right. */
const PARCHMENT = { x: 352, y: 274, w: 264, lineH: 11, lines: 13 };
const HINT = { x: 358, y: 452, w: 258, lineH: 10 };
const TITLE = { x: 86, y: 10 };
/** Age and sex — on the two top plates: label on top, value below (age has "−" and "+" buttons). */
const AGE = { labelX: 194, labelY: 5, valueX: 194, valueY: 16, minus: { x: 160, y: 14, w: 14, h: 12 }, plus: { x: 214, y: 14, w: 14, h: 12 } };
const GENDER = { labelX: 275, labelY: 5, valueY: 16, box: { x: 242, y: 13, w: 66, h: 14 } };

const COLOR = {
  text: '#cdb864',
  dim: '#8d7e4c',
  bright: '#ffe58a',
  warn: '#ff9d4a',
  good: '#9fe08a',
  word: '#d8c060',
  parchment: '#3a2508',
  parchmentDim: '#5a4020',
  border: '#7a6a42',
  hint: '#a9987a',
  field: '#050a05',
  panel: '#0b0b0a',
  lamp: 'rgba(255, 214, 102, 0.8)',
  hover: 'rgba(224, 192, 96, 0.14)',
  tagged: 'rgba(224, 192, 96, 0.2)',
  disabled: 'rgba(0, 0, 0, 0.5)',
};

export const NAME_MAX = 24;

// ---------- derived stats (rows of the middle frame) ----------

interface DerivedRow {
  label: StringKey;
  value: (s: ReturnType<typeof derivedStats>) => string;
  /** STAT.MSG line numbers: name and description. */
  nameId: number;
  textId: number;
  /** Our own description instead of the STAT.MSG line — where our stat works differently from the turn-based original. */
  ownText?: StringKey;
}

const DERIVED_ROWS: readonly DerivedRow[] = [
  { label: 'ceHp', value: (s) => String(s.maxHp), nameId: 107, textId: 207 },
  { label: 'ceAp', value: (s) => String(s.maxAp), nameId: 108, textId: 208 },
  { label: 'ceAc', value: (s) => String(s.armorClass), nameId: 109, textId: 209 },
  { label: 'ceCarry', value: (s) => String(s.carryWeight), nameId: 112, textId: 212 },
  { label: 'ceMelee', value: (s) => String(s.meleeDamage), nameId: 110, textId: 210 },
  { label: 'ceSequence', value: (s) => String(s.sequence), nameId: 113, textId: 213, ownText: 'descSequence' },
  { label: 'ceHealing', value: (s) => String(s.healingRate), nameId: 114, textId: 214 },
  { label: 'ceCritical', value: (s) => `${s.criticalChance}%`, nameId: 115, textId: 215 },
  { label: 'ceBetterCritical', value: (s) => `${s.betterCriticals}%`, nameId: 116, textId: 216 },
  { label: 'ceRadResist', value: (s) => `${s.radiationResistance}%`, nameId: 131, textId: 231 },
  { label: 'cePoisonResist', value: (s) => `${s.poisonResistance}%`, nameId: 132, textId: 232 },
] as const;

const derivedTop = (index: number): number => DERIVED.top + Math.round(index * DERIVED.step);

// ---------- what's under the mouse cursor ----------

export type Hit =
  | { kind: 'special'; index: number; part: 'row' | 'plus' | 'minus' }
  | { kind: 'derived'; index: number }
  | { kind: 'skill'; index: number }
  | { kind: 'trait'; index: number }
  | { kind: 'name' }
  | { kind: 'age'; part: 'minus' | 'plus' }
  | { kind: 'gender' }
  | { kind: 'button'; id: 'done' | 'cancel' };

const inside = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/** What is at a point of the window (640×480): a row, a button, a field; empty — null. */
export function hitTest(x: number, y: number): Hit | null {
  for (let i = 0; i < SPECIAL_NAMES.length; i++) {
    const c = specialCenter(i);
    if (inside(x, y, { x: SPECIAL.plusX, y: c - 14, w: SPECIAL.plusW, h: 13 })) return { kind: 'special', index: i, part: 'plus' };
    if (inside(x, y, { x: SPECIAL.plusX, y: c, w: SPECIAL.plusW, h: 13 })) return { kind: 'special', index: i, part: 'minus' };
    if (inside(x, y, { x: SPECIAL.x, y: c - 16, w: SPECIAL.w, h: 32 })) return { kind: 'special', index: i, part: 'row' };
  }
  if (inside(x, y, { x: SKILLS.x, y: SKILLS.y, w: SKILLS.w, h: SKILL_COUNT * SKILLS.row })) return { kind: 'skill', index: Math.floor((y - SKILLS.y) / SKILLS.row) };
  for (let i = 0; i < TRAIT_COUNT; i++) {
    const col = i < 8 ? 0 : 1;
    const c = TRAIT_ROWS[i % 8]!;
    const left = col === 0 ? TRAITS.leftLamp - 2 : TRAITS.rightText - 4;
    const width = col === 0 ? TRAITS.rightText - 6 - left : TRAITS.rightLamp + TRAITS.lampW + 2 - left;
    if (inside(x, y, { x: left, y: c - 6, w: width, h: TRAITS.rowH })) return { kind: 'trait', index: i };
  }
  if (inside(x, y, AGE.minus)) return { kind: 'age', part: 'minus' };
  if (inside(x, y, AGE.plus)) return { kind: 'age', part: 'plus' };
  if (inside(x, y, GENDER.box)) return { kind: 'gender' };
  if (inside(x, y, BUTTONS.done)) return { kind: 'button', id: 'done' };
  if (inside(x, y, BUTTONS.cancel)) return { kind: 'button', id: 'cancel' };
  if (inside(x, y, NAME)) return { kind: 'name' };
  for (let i = 0; i < DERIVED_ROWS.length; i++) if (inside(x, y, { x: DERIVED.x, y: derivedTop(i), w: DERIVED.w, h: Math.round(DERIVED.step) })) return { kind: 'derived', index: i };
  return null;
}

// ---------- character editing (no screen: covered by tests) ----------

export type Area = 'special' | 'skills' | 'traits' | 'name' | 'age' | 'gender' | 'buttons';
const AREAS: readonly Area[] = ['special', 'skills', 'traits', 'name', 'age', 'gender', 'buttons'];

/** What a key did: whether the window needs it and whether editing has ended. */
export type KeyResult = 'handled' | 'cancel' | 'done' | 'ignored';

export class CharacterEditor {
  special: Special;
  traits: number[];
  tagged: number[];
  name: string;
  age: number;
  gender: Gender;
  area: Area = 'special';
  /** Where the cursor is in each area (for buttons: 0 — "Done", 1 — "Cancel"). */
  cursor: Record<Area, number> = { special: 0, skills: 0, traits: 0, name: 0, age: 0, gender: 0, buttons: 0 };
  /** The last refusal ("can't go lower", "three already chosen…") — shown in the status line until the next successful action. */
  notice = '';
  private readonly start: Character;

  constructor(start: Character) {
    this.start = start;
    this.special = { ...start.special };
    this.traits = [...start.traits];
    this.tagged = [...start.tagged];
    this.name = (start.name ?? '').slice(0, NAME_MAX);
    this.age = Math.min(AGE_MAX, Math.max(AGE_MIN, Math.round(start.age ?? AGE_DEFAULT)));
    this.gender = start.gender ?? 'male';
  }

  /** The character as it is now. */
  get character(): Character {
    return { ...this.start, special: { ...this.special }, traits: [...this.traits], tagged: [...this.tagged], name: this.name, age: this.age, gender: this.gender };
  }

  pointsLeft(): number {
    return creationPointsLeft(this.special);
  }

  tagsLeft(): number {
    return TAGGED_SKILLS - this.tagged.length;
  }

  /** What is still missing for "Done": stat points or tag skills. */
  missing(): 'points' | 'tags' | null {
    if (!isValidSpecial(this.special)) return 'points';
    if (!isValidTagged(this.tagged) || !isValidTraits(this.traits)) return 'tags';
    return null;
  }

  /** Status line: a refusal, and if there is none — what's missing or "all set". */
  status(): string {
    if (this.notice) return this.notice;
    const missing = this.missing();
    return missing === 'points' ? t('ceNeedPoints') : missing === 'tags' ? t('ceNeedTags') : t('ceReady');
  }

  canRaise(index: number): boolean {
    const name = SPECIAL_NAMES[index];
    return name !== undefined && this.special[name] < SPECIAL_MAX && this.pointsLeft() > 0;
  }

  canLower(index: number): boolean {
    const name = SPECIAL_NAMES[index];
    return name !== undefined && this.special[name] > SPECIAL_MIN;
  }

  /** Change a stat by +1 or −1: from 1 to 10 and no more than the free points. */
  adjust(index: number, delta: 1 | -1): boolean {
    const name = SPECIAL_NAMES[index];
    if (name === undefined) return false;
    if (delta < 0 ? !this.canLower(index) : !this.canRaise(index)) {
      this.notice = delta < 0 ? t('ceMin') : this.special[name] >= SPECIAL_MAX ? t('ceMax') : t('ceNoPoints');
      return false;
    }
    this.special[name] += delta;
    this.notice = '';
    return true;
  }

  /** Age one year more or less: from 16 to 35. */
  adjustAge(delta: 1 | -1): boolean {
    const next = this.age + delta;
    if (next < AGE_MIN || next > AGE_MAX) {
      this.notice = next < AGE_MIN ? t('ceAgeMin') : t('ceAgeMax');
      return false;
    }
    this.age = next;
    this.notice = '';
    return true;
  }

  toggleGender(): void {
    this.gender = this.gender === 'male' ? 'female' : 'male';
    this.notice = '';
  }

  toggleSkill(skill: number): boolean {
    if (skill < 0 || skill >= SKILL_COUNT) return false;
    const at = this.tagged.indexOf(skill);
    if (at >= 0) this.tagged.splice(at, 1);
    else if (this.tagged.length >= TAGGED_SKILLS) {
      this.notice = t('ceTagsFull');
      return false;
    } else this.tagged = [...this.tagged, skill].sort((a, b) => a - b);
    this.notice = '';
    return true;
  }

  toggleTrait(trait: number): boolean {
    if (trait < 0 || trait >= TRAIT_COUNT) return false;
    const at = this.traits.indexOf(trait);
    if (at >= 0) this.traits.splice(at, 1);
    else if (this.traits.length >= MAX_TRAITS) {
      this.notice = t('ceTraitsFull');
      return false;
    } else this.traits = [...this.traits, trait].sort((a, b) => a - b);
    this.notice = '';
    return true;
  }

  typeChar(ch: string): boolean {
    if (ch.length !== 1 || ch < ' ' || this.name.length >= NAME_MAX) return false;
    this.name += ch;
    return true;
  }

  backspace(): boolean {
    if (this.name === '') return false;
    this.name = this.name.slice(0, -1);
    return true;
  }

  focus(area: Area, index?: number): void {
    this.area = area;
    if (index !== undefined) this.cursor[area] = index;
  }

  private step(direction: 1 | -1): void {
    this.area = AREAS[(AREAS.indexOf(this.area) + direction + AREAS.length) % AREAS.length]!;
  }

  private move(area: 'special' | 'skills', direction: number, count: number): void {
    this.cursor[area] = (this.cursor[area] + direction + count) % count;
  }

  /** The finished character or null (and in the status line — what's missing). An empty name is replaced with the default name. */
  finish(): Character | null {
    const missing = this.missing();
    if (missing) {
      this.notice = missing === 'points' ? t('ceNeedPoints') : t('ceNeedTags');
      return null;
    }
    const named = this.name.trim();
    return { ...this.character, name: named === '' ? t('ceDefaultName') : named };
  }

  /** Key press: arrows move the cursor, Space selects, Tab switches area, Esc — cancel. */
  key(code: string, key: string, mods: { shift?: boolean; ctrl?: boolean; alt?: boolean } = {}): KeyResult {
    if (code === 'Escape') return 'cancel';
    if (code === 'Tab') {
      this.step(mods.shift ? -1 : 1);
      return 'handled';
    }
    const up = code === 'ArrowUp';
    const down = code === 'ArrowDown';
    const left = code === 'ArrowLeft';
    const right = code === 'ArrowRight';
    const pick = code === 'Space' || code === 'Enter' || code === 'NumpadEnter';
    switch (this.area) {
      case 'name':
        if (pick && code !== 'Space') this.step(1);
        else if (code === 'Backspace') this.backspace();
        else if (up) this.step(-1);
        else if (down) this.step(1);
        else if (!mods.ctrl && !mods.alt && key.length === 1) this.typeChar(key);
        else return 'ignored';
        return 'handled';
      case 'age':
        if (left || key === '-' || code === 'NumpadSubtract') this.adjustAge(-1);
        else if (right || key === '+' || key === '=' || code === 'NumpadAdd') this.adjustAge(1);
        else if (up) this.step(-1);
        else if (down || pick) this.step(1);
        else return 'ignored';
        return 'handled';
      case 'gender':
        if (left || right || code === 'Space') this.toggleGender();
        else if (up) this.step(-1);
        else if (down || pick) this.step(1);
        else return 'ignored';
        return 'handled';
      case 'special': {
        const minus = left || key === '-' || code === 'NumpadSubtract';
        const plus = right || key === '+' || key === '=' || code === 'NumpadAdd';
        if (up) this.move('special', -1, SPECIAL_NAMES.length);
        else if (down) this.move('special', 1, SPECIAL_NAMES.length);
        else if (minus) this.adjust(this.cursor.special, -1);
        else if (plus) this.adjust(this.cursor.special, 1);
        else if (code === 'Home') this.cursor.special = 0;
        else if (code === 'End') this.cursor.special = SPECIAL_NAMES.length - 1;
        else return 'ignored';
        return 'handled';
      }
      case 'skills':
        if (up) this.move('skills', -1, SKILL_COUNT);
        else if (down) this.move('skills', 1, SKILL_COUNT);
        else if (code === 'PageUp') this.cursor.skills = Math.max(0, this.cursor.skills - 6);
        else if (code === 'PageDown') this.cursor.skills = Math.min(SKILL_COUNT - 1, this.cursor.skills + 6);
        else if (code === 'Home') this.cursor.skills = 0;
        else if (code === 'End') this.cursor.skills = SKILL_COUNT - 1;
        else if (pick) this.toggleSkill(this.cursor.skills);
        else return 'ignored';
        return 'handled';
      case 'traits': {
        const i = this.cursor.traits;
        const row = i % 8;
        const col = i < 8 ? 0 : 1;
        if (up) this.cursor.traits = col * 8 + ((row + 7) % 8);
        else if (down) this.cursor.traits = col * 8 + ((row + 1) % 8);
        else if (left || right) this.cursor.traits = (1 - col) * 8 + row;
        else if (pick) this.toggleTrait(i);
        else return 'ignored';
        return 'handled';
      }
      case 'buttons':
        if (left || right || up || down) this.cursor.buttons = 1 - this.cursor.buttons;
        else if (pick) return this.cursor.buttons === 0 ? (this.finish() ? 'done' : 'handled') : 'cancel';
        else return 'ignored';
        return 'handled';
    }
  }
}

// ---------- images and texts ----------

interface Art {
  background: HTMLCanvasElement;
  digits: HTMLCanvasElement;
  small: BitmapFont;
}

interface Texts {
  stat: ReadonlyMap<number, string>;
  skill: ReadonlyMap<number, string>;
  trait: ReadonlyMap<number, string>;
}

let artPending: Promise<Art> | null = null;
function loadArt(): Promise<Art> {
  artPending ??= (async () => {
    const [assets, list, fonts] = await Promise.all([GameAssets.load(), platform.readGameFile('ART\\INTRFACE\\INTRFACE.LST').then(parseLst), loadInterfaceFonts()]);
    const image = (n: number) => assets.image('ART\\INTRFACE\\' + list[n]);
    const [background, digits] = await Promise.all([image(ART.background), image(ART.digits)]);
    return { background, digits, small: fonts.main };
  })().catch((e: unknown) => {
    artPending = null;
    throw e;
  });
  return artPending;
}

let textsPending: Promise<Texts> | null = null;
function loadTexts(): Promise<Texts> {
  const read = (name: string) =>
    platform
      .readGameFile(`TEXT\\ENGLISH\\GAME\\${name}`)
      .then(parseMsg)
      .catch(() => new Map<number, string>());
  textsPending ??= Promise.all([read('STAT.MSG'), read('SKILL.MSG'), read('TRAIT.MSG')]).then(([stat, skill, trait]) => ({ stat, skill, trait }));
  return textsPending;
}

// ---------- window ----------

type Target = { kind: 'special'; index: number } | { kind: 'derived'; index: number } | { kind: 'skill'; index: number } | { kind: 'trait'; index: number } | null;

export class CharacterScreen {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private editor: CharacterEditor | null = null;
  private art: Art | null = null;
  private texts: Texts = { stat: new Map(), skill: new Map(), trait: new Map() };
  private hover: Hit | null = null;
  /** Description pinned by clicking a derived stat (they have no keyboard cursor). */
  private pinned: Target = null;
  private finish: ((result: Character | null) => void) | null = null;
  private readonly keys = (e: KeyboardEvent) => this.onKey(e);

  constructor(parent: HTMLElement) {
    this.host = document.createElement('div');
    this.host.className = 'pause character-screen';
    this.host.hidden = true;
    this.host.setAttribute('role', 'dialog');
    this.host.setAttribute('aria-modal', 'true');
    this.canvas = document.createElement('canvas');
    this.canvas.width = SCREEN.w;
    this.canvas.height = SCREEN.h;
    this.canvas.tabIndex = 0;
    this.canvas.style.cssText = 'display:block;image-rendering:pixelated;width:min(100%, calc((100vh - 24px) * 4 / 3));aspect-ratio:4 / 3;background:#000;border:2px solid var(--border);touch-action:none;';
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.draw();
    });
    this.host.append(this.canvas);
    parent.append(this.host);
    void loadArt().catch(() => {});
  }

  get isOpen(): boolean {
    return !this.host.hidden;
  }

  /** Show the window with character `start`; the result is the finished character or null if the player cancelled. */
  open(start: Character): Promise<Character | null> {
    if (this.finish) this.close(null);
    this.editor = new CharacterEditor(start);
    this.hover = null;
    this.pinned = null;
    this.host.hidden = false;
    this.canvas.setAttribute('aria-label', t('ceTitle'));
    window.addEventListener('keydown', this.keys, true);
    this.draw();
    this.canvas.focus({ preventScroll: true });
    void Promise.all([loadArt(), loadTexts()]).then(
      ([art, texts]) => {
        this.art = art;
        this.texts = texts;
        this.draw();
      },
      () => this.draw(),
    );
    return new Promise((resolve) => {
      this.finish = resolve;
    });
  }

  close(result: Character | null): void {
    this.host.hidden = true;
    window.removeEventListener('keydown', this.keys, true);
    const done = this.finish;
    this.finish = null;
    this.editor = null;
    done?.(result);
  }

  // ---------- input ----------

  private toScreen(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) * SCREEN.w) / rect.width, y: ((e.clientY - rect.top) * SCREEN.h) / rect.height };
  }

  private onKey(e: KeyboardEvent): void {
    const editor = this.editor;
    if (!editor) return;
    const result = editor.key(e.code, e.key, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });
    if (result === 'ignored') return;
    e.preventDefault();
    e.stopPropagation();
    this.pinned = null;
    if (result === 'cancel') this.close(null);
    else if (result === 'done') this.close(editor.finish());
    else this.draw();
  }

  private onMove(e: PointerEvent): void {
    const p = this.toScreen(e);
    const hit = hitTest(p.x, p.y);
    if (JSON.stringify(hit) === JSON.stringify(this.hover)) return;
    this.hover = hit;
    this.canvas.style.cursor = hit ? 'pointer' : 'default';
    this.draw();
  }

  private onDown(e: PointerEvent): void {
    const editor = this.editor;
    if (!editor || e.button !== 0) return;
    const p = this.toScreen(e);
    const hit = hitTest(p.x, p.y);
    this.hover = hit;
    this.pinned = null;
    if (hit) {
      switch (hit.kind) {
        case 'special':
          editor.focus('special', hit.index);
          if (hit.part === 'plus') editor.adjust(hit.index, 1);
          else if (hit.part === 'minus') editor.adjust(hit.index, -1);
          break;
        case 'skill':
          editor.focus('skills', hit.index);
          editor.toggleSkill(hit.index);
          break;
        case 'trait':
          editor.focus('traits', hit.index);
          editor.toggleTrait(hit.index);
          break;
        case 'name':
          editor.focus('name');
          break;
        case 'age':
          editor.focus('age');
          editor.adjustAge(hit.part === 'plus' ? 1 : -1);
          break;
        case 'gender':
          editor.focus('gender');
          editor.toggleGender();
          break;
        case 'derived':
          this.pinned = { kind: 'derived', index: hit.index };
          break;
        case 'button':
          editor.focus('buttons', hit.id === 'done' ? 0 : 1);
          if (hit.id === 'cancel') {
            this.close(null);
            return;
          }
          if (editor.finish()) {
            this.close(editor.finish());
            return;
          }
          break;
      }
    }
    this.draw();
  }

  // ---------- drawing ----------

  /** What the parchment is describing now: what the mouse points at, otherwise the pinned one, otherwise where the keyboard cursor is. */
  private target(editor: CharacterEditor): Target {
    const hover = this.hover;
    if (hover && (hover.kind === 'special' || hover.kind === 'derived' || hover.kind === 'skill' || hover.kind === 'trait')) return { kind: hover.kind, index: hover.index };
    if (this.pinned) return this.pinned;
    switch (editor.area) {
      case 'special':
        return { kind: 'special', index: editor.cursor.special };
      case 'skills':
        return { kind: 'skill', index: editor.cursor.skills };
      case 'traits':
        return { kind: 'trait', index: editor.cursor.traits };
      default:
        return null;
    }
  }

  private describe(target: Target): { title: string; body: string } {
    const { stat, skill, trait } = this.texts;
    if (!target) return { title: t('ceTitle'), body: t('ceIntro') };
    switch (target.kind) {
      case 'special':
        return { title: stat.get(100 + target.index) ?? '', body: stat.get(200 + target.index) ?? '' };
      case 'derived': {
        const row = DERIVED_ROWS[target.index]!;
        return { title: stat.get(row.nameId) ?? t(row.label), body: row.ownText ? t(row.ownText) : (stat.get(row.textId) ?? '') };
      }
      case 'skill':
        return { title: skill.get(100 + target.index) ?? '', body: skill.get(200 + target.index) ?? '' };
      case 'trait':
        return { title: trait.get(100 + target.index) ?? '', body: trait.get(200 + target.index) ?? '' };
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    const editor = this.editor;
    const art = this.art;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
    if (!editor || !art) return;
    const font = art.small;
    const text = (value: string, x: number, y: number, color: string, align: 'left' | 'center' | 'right' = 'left') => drawLabel(ctx, font, value, x, y, color, align);
    const outline = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    };
    /** Drum digits: two digits (or one/"10") in the middle of the box. */
    const digits = (value: string, centerX: number, top: number, red: boolean) => {
      const x0 = Math.round(centerX - (value.length * DIGIT.w) / 2);
      [...value].forEach((d, i) => ctx.drawImage(art.digits, Number(d) * DIGIT.w + (red ? DIGIT.redFrom : 0), 0, DIGIT.w, DIGIT.h, x0 + i * DIGIT.w, top, DIGIT.w, DIGIT.h));
    };
    const character = editor.character;
    const hover = this.hover;

    ctx.drawImage(art.background, 0, 0);
    text(t('ceTitle'), TITLE.x, TITLE.y, COLOR.bright, 'center');

    // Age and sex — on the top plates.
    text(t('ceAge'), AGE.labelX, AGE.labelY, COLOR.dim, 'center');
    for (const [part, rect, sign] of [['minus', AGE.minus, '-'], ['plus', AGE.plus, '+']] as const) {
      const active = hover?.kind === 'age' && hover.part === part;
      ctx.fillStyle = COLOR.field;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      if (active) {
        ctx.fillStyle = COLOR.hover;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      outline(rect.x, rect.y, rect.w, rect.h, COLOR.border);
      text(sign, rect.x + rect.w / 2, rect.y + 2, COLOR.bright, 'center');
    }
    text(String(editor.age), AGE.valueX, AGE.valueY, COLOR.bright, 'center');
    if (editor.area === 'age') outline(AGE.minus.x - 2, AGE.minus.y - 2, AGE.plus.x + AGE.plus.w - AGE.minus.x + 4, AGE.minus.h + 4, COLOR.bright);
    text(t('ceGender'), GENDER.labelX, GENDER.labelY, COLOR.dim, 'center');
    ctx.fillStyle = COLOR.field;
    ctx.fillRect(GENDER.box.x, GENDER.box.y, GENDER.box.w, GENDER.box.h);
    if (hover?.kind === 'gender') {
      ctx.fillStyle = COLOR.hover;
      ctx.fillRect(GENDER.box.x, GENDER.box.y, GENDER.box.w, GENDER.box.h);
    }
    outline(GENDER.box.x, GENDER.box.y, GENDER.box.w, GENDER.box.h, editor.area === 'gender' ? COLOR.bright : COLOR.border);
    text(editor.gender === 'male' ? t('ceMale') : t('ceFemale'), GENDER.box.x + GENDER.box.w / 2, GENDER.valueY, COLOR.bright, 'center');

    // Stats.
    SPECIAL_NAMES.forEach((name, i) => {
      const c = specialCenter(i);
      const value = editor.special[name];
      ctx.fillStyle = COLOR.panel;
      ctx.fillRect(SPECIAL.numberX, c - 12, SPECIAL.numberW, 24);
      digits(String(value), SPECIAL.numberX + SPECIAL.numberW / 2, c - 12, false);
      text(fitText(font, this.texts.stat.get(300 + value) ?? '', SPECIAL.wordW), SPECIAL.wordX, c - 4, COLOR.word);
      if (!editor.canRaise(i)) {
        ctx.fillStyle = COLOR.disabled;
        ctx.fillRect(SPECIAL.plusX + 1, c - 12, SPECIAL.plusW - 3, 11);
      }
      if (!editor.canLower(i)) {
        ctx.fillStyle = COLOR.disabled;
        ctx.fillRect(SPECIAL.plusX + 1, c + 1, SPECIAL.plusW - 3, 11);
      }
      if (hover?.kind === 'special' && hover.index === i) {
        if (hover.part === 'plus') outline(SPECIAL.plusX, c - 14, SPECIAL.plusW, 13, COLOR.bright);
        else if (hover.part === 'minus') outline(SPECIAL.plusX, c, SPECIAL.plusW, 13, COLOR.bright);
        else {
          ctx.fillStyle = COLOR.hover;
          ctx.fillRect(SPECIAL.x, c - 16, SPECIAL.w, 32);
        }
      }
      if (editor.area === 'special' && editor.cursor.special === i) outline(SPECIAL.x, c - 16, SPECIAL.w, 32, COLOR.bright);
    });

    // Free stat points.
    const left = editor.pointsLeft();
    ctx.fillStyle = COLOR.panel;
    ctx.fillRect(POINTS_WINDOW.x, POINTS_WINDOW.y, POINTS_WINDOW.w, POINTS_WINDOW.h);
    digits(String(Math.max(0, left)).padStart(2, '0'), POINTS_WINDOW.x + POINTS_WINDOW.w / 2, POINTS_WINDOW.y - 1, left > 0);
    wrapText(font, t('cePointsLeft'), POINTS_LABEL.w).forEach((line, i) => text(line, POINTS_LABEL.x, POINTS_LABEL.y + i * 11, COLOR.text));

    // Skills.
    text(t('ceSkills'), SKILLS.titleX, SKILLS.titleY, COLOR.bright, 'center');
    for (let i = 0; i < SKILL_COUNT; i++) {
      const y = SKILLS.y + i * SKILLS.row;
      const tagged = editor.tagged.includes(i);
      if (tagged) {
        ctx.fillStyle = COLOR.tagged;
        ctx.fillRect(SKILLS.x + 1, y - 1, SKILLS.w - 2, SKILLS.row);
        ctx.fillStyle = COLOR.bright;
        ctx.fillRect(SKILLS.markX, y + 2, 4, 4);
      }
      if (hover?.kind === 'skill' && hover.index === i) {
        ctx.fillStyle = COLOR.hover;
        ctx.fillRect(SKILLS.x + 1, y - 1, SKILLS.w - 2, SKILLS.row);
      }
      const color = tagged ? COLOR.bright : COLOR.text;
      text(fitText(font, this.texts.skill.get(100 + i) ?? '', SKILLS.valueRight - SKILLS.nameX - 36), SKILLS.nameX, y, color);
      text(`${skillLevel(character, i)}%`, SKILLS.valueRight, y, color, 'right');
      if (editor.area === 'skills' && editor.cursor.skills === i) outline(SKILLS.x + 1, y - 1, SKILLS.w - 2, SKILLS.row, COLOR.bright);
    }
    const tagsLeft = editor.tagsLeft();
    ctx.fillStyle = COLOR.panel;
    ctx.fillRect(TAGS_WINDOW.x, TAGS_WINDOW.y, TAGS_WINDOW.w, TAGS_WINDOW.h);
    digits(String(tagsLeft).padStart(2, '0'), TAGS_WINDOW.x + TAGS_WINDOW.w / 2, TAGS_WINDOW.y - 1, tagsLeft > 0);
    text(fitText(font, t('ceTagsLeft'), TAGS_LABEL.w), TAGS_LABEL.right, TAGS_LABEL.y, COLOR.text, 'right');

    // Traits.
    text(t('ceTraits'), TRAITS.titleX, TRAITS.titleY, COLOR.bright, 'center');
    for (let i = 0; i < TRAIT_COUNT; i++) {
      const col = i < 8 ? 0 : 1;
      const c = TRAIT_ROWS[i % 8]!;
      const chosen = editor.traits.includes(i);
      const lampX = col === 0 ? TRAITS.leftLamp : TRAITS.rightLamp;
      if (chosen) {
        ctx.fillStyle = COLOR.lamp;
        ctx.fillRect(lampX, c - 5, TRAITS.lampW, TRAITS.lampH);
      }
      const textX = col === 0 ? TRAITS.leftText : TRAITS.rightText;
      text(fitText(font, this.texts.trait.get(100 + i) ?? '', TRAITS.textW), textX, c - 4, chosen ? COLOR.bright : COLOR.text);
      const rowX = col === 0 ? TRAITS.leftLamp - 2 : TRAITS.rightText - 4;
      const rowW = col === 0 ? TRAITS.rightText - 6 - rowX : TRAITS.rightLamp + TRAITS.lampW + 2 - rowX;
      if (hover?.kind === 'trait' && hover.index === i) {
        ctx.fillStyle = COLOR.hover;
        ctx.fillRect(rowX, c - 6, rowW, TRAITS.rowH);
      }
      if (editor.area === 'traits' && editor.cursor.traits === i) outline(rowX, c - 6, rowW, TRAITS.rowH, COLOR.bright);
    }

    // Name, status, buttons.
    text(t('ceName'), NAME.labelX, NAME.labelY, COLOR.dim);
    ctx.fillStyle = COLOR.field;
    ctx.fillRect(NAME.x, NAME.y, NAME.w, NAME.h);
    outline(NAME.x, NAME.y, NAME.w, NAME.h, editor.area === 'name' ? COLOR.bright : COLOR.border);
    {
      const focused = editor.area === 'name';
      let shown = editor.name === '' && !focused ? t('ceDefaultName') : editor.name + (focused ? '_' : '');
      while (shown.length > 1 && measureText(font, shown) > NAME.w - 8) shown = shown.slice(1);
      text(shown, NAME.textX, NAME.textY, editor.name === '' && !focused ? COLOR.dim : COLOR.bright);
    }
    const ready = editor.missing() === null;
    wrapText(font, editor.status(), STATUS.w)
      .slice(0, STATUS.lines)
      .forEach((line, i) => text(line, STATUS.x, STATUS.y + i * 11, editor.notice ? COLOR.warn : ready ? COLOR.good : COLOR.text));
    for (const [id, rect, label, enabled] of [
      ['done', BUTTONS.done, t('ceDone'), ready],
      ['cancel', BUTTONS.cancel, t('ceCancel'), true],
    ] as const) {
      const focusedButton = editor.area === 'buttons' && editor.cursor.buttons === (id === 'done' ? 0 : 1);
      ctx.fillStyle = COLOR.field;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      if (hover?.kind === 'button' && hover.id === id) {
        ctx.fillStyle = COLOR.hover;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      outline(rect.x, rect.y, rect.w, rect.h, focusedButton ? COLOR.bright : COLOR.border);
      text(label, rect.x + rect.w / 2, rect.y + 7, enabled ? COLOR.bright : COLOR.dim, 'center');
    }

    // Derived stats.
    const stats = derivedStats(character);
    DERIVED_ROWS.forEach((row, i) => {
      const y = derivedTop(i);
      if (hover?.kind === 'derived' && hover.index === i) {
        ctx.fillStyle = COLOR.hover;
        ctx.fillRect(DERIVED.x, y, DERIVED.w, Math.round(DERIVED.step));
      }
      text(fitText(font, t(row.label), DERIVED.valueRight - DERIVED.labelX - 30), DERIVED.labelX, y + 2, COLOR.dim);
      text(row.value(stats), DERIVED.valueRight, y + 2, COLOR.bright, 'right');
    });

    // Description on the parchment.
    const about = this.describe(this.target(editor));
    text(fitText(font, about.title, PARCHMENT.w), PARCHMENT.x, PARCHMENT.y, COLOR.parchment);
    ctx.fillStyle = COLOR.parchmentDim;
    ctx.fillRect(PARCHMENT.x, PARCHMENT.y + 11, PARCHMENT.w, 1);
    wrapText(font, about.body, PARCHMENT.w)
      .slice(0, PARCHMENT.lines)
      .forEach((line, i) => text(line, PARCHMENT.x, PARCHMENT.y + 17 + i * PARCHMENT.lineH, COLOR.parchment));

    // Key hint — on the bottom plate.
    (usingPad() ? tf('ceHintPad', padLabels()) : t('ceHint'))
      .split('|')
      .slice(0, 2)
      .forEach((line, i) => text(fitText(font, line, HINT.w), HINT.x, HINT.y + i * HINT.lineH, COLOR.hint));
  }
}
