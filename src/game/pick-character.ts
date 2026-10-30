// The "Choose character" screen, as in the original: the PICKCHAR.FRM image (INTRFACE.LST #174, 640×480) and the original fonts.
// The monitor shows one of the three premade heroes (`premade.ts`): portrait on the left, in the middle the name and numbers (stats,
// health, armor class, action points, melee damage, tag skills, traits), on the right the hero's story from his BIO file.
// The arrows between the buttons flip through heroes. "Take" starts with him, "Modify" opens him in the editor, "Create" makes your own
// hero from scratch, "Back" returns to the main menu. The button labels are drawn on the image itself; the buttons are red (#8 and #9).
// Keyboard: ← → another hero, Tab the next button, Enter or Space presses, Esc goes back.
// The layout does not change from hero to hero: lines stay in place, nothing jumps.
import { GameAssets } from '../assets/sprites.ts';
import { fitText, type BitmapFont } from '../formats/font.ts';
import { parseLst, parseMsg } from '../formats/text.ts';
import { t, tf, type StringKey } from '../i18n.ts';
import { platform } from '../platform.ts';
import { derivedStats, skillLevel, SPECIAL_NAMES, type Character } from './character.ts';
import { drawLabel, loadInterfaceFonts } from './fonts.ts';
import { padLabels, usingPad } from './gamepad.ts';
import type { Premade } from './premade.ts';

const SCREEN = { w: 640, h: 480 };
const ART = { background: 174, redUp: 8, redDown: 9, leftUp: 122, leftDown: 123, rightUp: 124, rightDown: 125 };
/** The 212×187 portrait is at the left edge of the monitor. */
const PORTRAIT = { x: 44, y: 54 };
/** Middle column: the name in a large font, below it lines of numbers 10 points apart (groups separated by five points). */
const STATS = { left: 268, right: 410, nameY: 40, top: 74, row: 10, gap: 5 };
/** The hero's story is the right column (lines in the file are already broken for its width). */
const BIO = { x: 424, y: 44, w: 184, row: 10, rows: 21 };
const HINT = { x: 326, y: 262 };
/** Buttons: the red button is in the middle of its screwed plate, the label can be clicked too. */
type ButtonId = 'take' | 'modify' | 'create' | 'back';
const BUTTONS: readonly { id: ButtonId; red: { x: number; y: number }; area: { x: number; y: number; w: number; h: number }; label: StringKey }[] = [
  { id: 'take', red: { x: 81, y: 320 }, area: { x: 64, y: 312, w: 110, h: 32 }, label: 'pcTake' },
  { id: 'modify', red: { x: 434, y: 317 }, area: { x: 418, y: 309, w: 156, h: 32 }, label: 'pcModify' },
  { id: 'create', red: { x: 80, y: 422 }, area: { x: 63, y: 414, w: 165, h: 32 }, label: 'pcCreate' },
  { id: 'back', red: { x: 461, y: 422 }, area: { x: 444, y: 414, w: 120, h: 32 }, label: 'pcBack' },
];
const ARROWS = { prev: { x: 291, y: 321, w: 20, h: 18 }, next: { x: 314, y: 322, w: 20, h: 18 } } as const;
type ArrowId = keyof typeof ARROWS;
type Hit = { kind: 'button'; id: ButtonId } | { kind: 'arrow'; id: ArrowId };

const GREEN = '#4fd65a';
const DIM = '#2f9a39';
const BRIGHT = '#b8ffb8';
const FOCUS = '#f8f858';
const HOVER = 'rgba(248, 248, 88, 0.12)';
const SOUND = { press: 'IB1P1XX1', release: 'IB1LU1X1' };

export type PickResult = { action: 'take' | 'modify'; character: Character } | { action: 'create' } | { action: 'back' };

export interface PickSound {
  play(name: string): void;
}

interface Art {
  background: HTMLCanvasElement;
  red: { up: HTMLCanvasElement; down: HTMLCanvasElement };
  arrows: Record<ArrowId, { up: HTMLCanvasElement; down: HTMLCanvasElement }>;
  portraits: ReadonlyMap<number, HTMLCanvasElement>;
  font: BitmapFont;
  big: BitmapFont;
  stat: ReadonlyMap<number, string>;
  skill: ReadonlyMap<number, string>;
  trait: ReadonlyMap<number, string>;
}

const inside = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

function hitTest(x: number, y: number): Hit | null {
  for (const id of ['prev', 'next'] as const) if (inside(x, y, ARROWS[id])) return { kind: 'arrow', id };
  for (const b of BUTTONS) if (inside(x, y, b.area)) return { kind: 'button', id: b.id };
  return null;
}

const sameHit = (a: Hit | null, b: Hit | null) => a !== null && b !== null && a.kind === b.kind && a.id === b.id;

async function loadArt(premades: readonly Premade[]): Promise<Art> {
  const [assets, list, fonts] = await Promise.all([GameAssets.load(), platform.readGameFile('ART\\INTRFACE\\INTRFACE.LST').then(parseLst), loadInterfaceFonts()]);
  const image = (n: number) => assets.image('ART\\INTRFACE\\' + list[n]);
  const msg = (name: string) =>
    platform
      .readGameFile(`TEXT\\ENGLISH\\GAME\\${name}`)
      .then(parseMsg)
      .catch(() => new Map<number, string>());
  const [background, redUp, redDown, leftUp, leftDown, rightUp, rightDown, stat, skill, trait, ...portraits] = await Promise.all([
    image(ART.background),
    image(ART.redUp),
    image(ART.redDown),
    image(ART.leftUp),
    image(ART.leftDown),
    image(ART.rightUp),
    image(ART.rightDown),
    msg('STAT.MSG'),
    msg('SKILL.MSG'),
    msg('TRAIT.MSG'),
    ...premades.map((p) => image(p.portrait).catch(() => null)),
  ]);
  const pictures = new Map<number, HTMLCanvasElement>();
  premades.forEach((p, i) => {
    const picture = portraits[i];
    if (picture) pictures.set(p.portrait, picture);
  });
  return {
    background,
    red: { up: redUp, down: redDown },
    arrows: { prev: { up: leftUp, down: leftDown }, next: { up: rightUp, down: rightDown } },
    portraits: pictures,
    font: fonts.main,
    big: fonts.big,
    stat,
    skill,
    trait,
  };
}

export class PickCharacterScreen {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly live: HTMLElement;
  private readonly premades: readonly Premade[];
  private readonly sound: PickSound | undefined;
  private art: Art | null = null;
  private artPending: Promise<Art> | null = null;
  /** Which hero is on screen (remembered between openings: cancelling in the editor returns to him). */
  private index = 0;
  private focus: ButtonId = 'take';
  /** The focus frame is visible when the keyboard is used (like :focus-visible). */
  private keyboard = false;
  private hover: Hit | null = null;
  private pressed: Hit | null = null;
  private finish: ((result: PickResult) => void) | null = null;
  private readonly keys = (e: KeyboardEvent) => this.onKey(e);

  constructor(parent: HTMLElement, premades: readonly Premade[], sound?: PickSound) {
    this.premades = premades;
    this.sound = sound;
    this.host = document.createElement('div');
    this.host.className = 'pause pick-character';
    this.host.hidden = true;
    this.host.setAttribute('role', 'dialog');
    this.host.setAttribute('aria-modal', 'true');
    this.host.setAttribute('aria-label', t('pcTitle'));
    this.canvas = document.createElement('canvas');
    this.canvas.width = SCREEN.w;
    this.canvas.height = SCREEN.h;
    this.canvas.tabIndex = 0;
    this.canvas.style.cssText = 'display:block;image-rendering:pixelated;width:min(100%, calc((100vh - 24px) * 4 / 3));aspect-ratio:4 / 3;background:#000;border:2px solid var(--border);touch-action:none;outline:none;';
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onUp(e));
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.pressed = null;
      this.draw();
    });
    // For screen readers: who is selected now and which button has focus.
    this.live = document.createElement('div');
    this.live.setAttribute('aria-live', 'polite');
    this.live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:pre-line;';
    this.host.append(this.canvas, this.live);
    parent.append(this.host);
  }

  /** Show the choice; the answer is what the player pressed. */
  open(): Promise<PickResult> {
    if (this.finish) this.close({ action: 'back' });
    this.hover = null;
    this.pressed = null;
    this.focus = 'take';
    this.host.hidden = false;
    window.addEventListener('keydown', this.keys, true);
    this.draw();
    this.canvas.focus({ preventScroll: true });
    this.announce();
    this.artPending ??= loadArt(this.premades);
    void this.artPending.then(
      (art) => {
        this.art = art;
        this.draw();
      },
      () => {
        // No images, nothing to choose from: go straight to creating your own hero.
        this.artPending = null;
        this.close({ action: 'create' });
      },
    );
    return new Promise((resolve) => {
      this.finish = resolve;
    });
  }

  private close(result: PickResult): void {
    this.host.hidden = true;
    window.removeEventListener('keydown', this.keys, true);
    const done = this.finish;
    this.finish = null;
    done?.(result);
  }

  private get current(): Premade {
    return this.premades[this.index]!;
  }

  // ---------- actions ----------

  private turn(step: 1 | -1): void {
    this.index = (this.index + step + this.premades.length) % this.premades.length;
    this.draw();
    this.announce();
  }

  private act(id: ButtonId): void {
    const character = this.current.character;
    if (id === 'take' || id === 'modify') this.close({ action: id, character });
    else this.close({ action: id });
  }

  private announce(): void {
    const premade = this.current;
    const button = BUTTONS.find((b) => b.id === this.focus)!;
    this.live.textContent = [premade.character.name ?? '', premade.bio.join(' '), t(button.label)].join('\n');
  }

  // ---------- input ----------

  private toScreen(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) * SCREEN.w) / rect.width, y: ((e.clientY - rect.top) * SCREEN.h) / rect.height };
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const p = this.toScreen(e);
    this.keyboard = false;
    this.pressed = hitTest(p.x, p.y);
    if (this.pressed) {
      e.preventDefault();
      this.sound?.play(SOUND.press);
    }
    this.draw();
  }

  private onMove(e: PointerEvent): void {
    const p = this.toScreen(e);
    const hover = hitTest(p.x, p.y);
    if (sameHit(hover, this.hover) || (hover === null && this.hover === null)) return;
    this.hover = hover;
    this.canvas.style.cursor = hover ? 'pointer' : 'default';
    this.draw();
  }

  private onUp(e: PointerEvent): void {
    const pressed = this.pressed;
    this.pressed = null;
    if (!pressed) return;
    const p = this.toScreen(e);
    this.sound?.play(SOUND.release);
    if (!sameHit(hitTest(p.x, p.y), pressed)) return this.draw();
    if (pressed.kind === 'arrow') this.turn(pressed.id === 'next' ? 1 : -1);
    else this.act(pressed.id);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.finish) return;
    const order = BUTTONS.map((b) => b.id);
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      handled();
      this.sound?.play(SOUND.release);
      this.turn(e.code === 'ArrowRight' ? 1 : -1);
    } else if (e.code === 'Tab' || e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      handled();
      const back = e.code === 'ArrowUp' || (e.code === 'Tab' && e.shiftKey);
      const at = order.indexOf(this.focus);
      this.focus = order[(at + (back ? order.length - 1 : 1)) % order.length]!;
      this.keyboard = true;
      this.draw();
      this.announce();
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') && !e.repeat) {
      handled();
      this.sound?.play(SOUND.release);
      this.act(this.focus);
    } else if (e.code === 'Escape') {
      handled();
      this.act('back');
    }
  }

  // ---------- drawing ----------

  private draw(): void {
    const ctx = this.ctx;
    const art = this.art;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SCREEN.w, SCREEN.h);
    if (!art) return;
    ctx.drawImage(art.background, 0, 0);
    const premade = this.current;
    const portrait = art.portraits.get(premade.portrait);
    if (portrait) ctx.drawImage(portrait, PORTRAIT.x, PORTRAIT.y);
    this.drawStats(ctx, art, premade.character);
    premade.bio.slice(0, BIO.rows).forEach((line, i) => drawLabel(ctx, art.font, fitText(art.font, line, BIO.w), BIO.x, BIO.y + i * BIO.row, i === 0 ? BRIGHT : GREEN));
    drawLabel(ctx, art.font, usingPad() ? tf('pcHintPad', padLabels()) : t('pcHint'), HINT.x, HINT.y, DIM, 'center');

    for (const id of ['prev', 'next'] as const) {
      const r = ARROWS[id];
      const down = this.pressed?.kind === 'arrow' && this.pressed.id === id;
      ctx.drawImage(down ? art.arrows[id].down : art.arrows[id].up, r.x, r.y);
    }
    for (const b of BUTTONS) {
      const down = this.pressed?.kind === 'button' && this.pressed.id === b.id;
      ctx.drawImage(down ? art.red.down : art.red.up, b.red.x, b.red.y);
      if (this.hover?.kind === 'button' && this.hover.id === b.id) {
        ctx.fillStyle = HOVER;
        ctx.fillRect(b.area.x, b.area.y, b.area.w, b.area.h);
      }
      if (this.keyboard && this.focus === b.id) {
        ctx.strokeStyle = FOCUS;
        ctx.lineWidth = 1;
        ctx.strokeRect(b.area.x + 0.5, b.area.y + 0.5, b.area.w - 1, b.area.h - 1);
      }
    }
  }

  /** The hero's name and numbers: lines in fixed places (empty places stay empty). */
  private drawStats(ctx: CanvasRenderingContext2D, art: Art, character: Character): void {
    const width = STATS.right - STATS.left;
    drawLabel(ctx, art.big, fitText(art.big, character.name ?? '', width), (STATS.left + STATS.right) / 2, STATS.nameY, BRIGHT, 'center');
    const derived = derivedStats(character);
    const rows: ([string, string] | null)[] = [
      ...SPECIAL_NAMES.map((name, i): [string, string] => [art.stat.get(100 + i) ?? '', String(character.special[name]).padStart(2, '0')]),
      null,
      [t('ceHp'), String(derived.maxHp)],
      [t('ceAc'), String(derived.armorClass)],
      [t('ceAp'), String(derived.maxAp)],
      [t('ceMelee'), String(derived.meleeDamage)],
      null,
      ...[0, 1, 2].map((i): [string, string] | ['', ''] => {
        const skill = character.tagged[i];
        return skill === undefined ? ['', ''] : [art.skill.get(100 + skill) ?? '', `${skillLevel(character, skill)}%`];
      }),
      null,
      ...[0, 1].map((i): [string, string] => {
        const trait = character.traits[i];
        return [trait === undefined ? '' : (art.trait.get(100 + trait) ?? ''), ''];
      }),
    ];
    let y = STATS.top;
    for (const row of rows) {
      if (!row) {
        y += STATS.gap;
        continue;
      }
      const [label, value] = row;
      const valueWidth = value ? drawLabel(ctx, art.font, value, STATS.right, y, BRIGHT, 'right') : 0;
      if (label) drawLabel(ctx, art.font, fitText(art.font, label, width - valueWidth - 6), STATS.left, y, GREEN);
      y += STATS.row;
    }
  }
}
