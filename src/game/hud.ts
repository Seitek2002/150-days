// The panel at the bottom of the screen: images come from the player's copy of Fallout, the layout matches the original.
// Health and armor class use the "mechanical" digits from NUMBERS.FRM, the message screen is on the left, labels use the original font.
import { lineHeight, type BitmapFont } from '../formats/font.ts';
import type { ItemProto } from '../formats/pro.ts';
import { t } from '../i18n.ts';
import { drawLabel, labelWidth, wrapText } from './fonts.ts';
import type { Hero } from './hero.ts';

/** Coordinates inside the 640×100 panel (from the original Fallout layout). */
const HP_AT = { x: 473, y: 40 };
const AC_AT = { x: 473, y: 75 };
const ITEM_SLOT = { x: 267, y: 26, w: 188, h: 67 };
const MONITOR = { x: 23, y: 24, w: 167, h: 60 };
/** The mark before each message (in the original it is character 0x95, a "dot"). */
const KNOB = '•';
/** The digit strip holds three color sets of 120 pixels each: normal, yellow, red. */
const COLOR_SET = { normal: 0, yellow: 120, red: 240 };

/** Health is colored like the digits on the original panel: under half is yellow, under a quarter is red. */
export type HpTone = 'normal' | 'yellow' | 'red';
export function hpTone(hp: number, maxHp: number): HpTone {
  const share = hp / Math.max(1, maxHp);
  return share < 0.25 ? 'red' : share < 0.5 ? 'yellow' : 'normal';
}
const MESSAGE_COLOR = '#4fd65a';
const SLOT_COLOR = '#f0d58c';
/**
 * Status plates above the message screen (indicators.ts): a 130×21 frame from the player's copy, in a row from the left edge of the panel
 * (a row holds as many as fit the panel width, the rest go in a row above); the label is centered: bad ones in red, good ones in green.
 */
const INDICATOR = { w: 130, h: 21, bad: '#ff0000', good: '#00ff00' } as const;

/** A plate for the panel: the finished label and whether the status is bad. */
export interface HudIndicator {
  text: string;
  bad: boolean;
}

export interface HudArt {
  bar: HTMLCanvasElement;
  itemSlot: HTMLCanvasElement;
  weapon: HTMLCanvasElement;
  numbers: HTMLCanvasElement;
  font: BitmapFont;
  /** Action point light. */
  apLight: HTMLCanvasElement;
  /** Status plate frame (WARNBOX.FRM); missing from the copy means plates without a frame. */
  indicatorBox?: HTMLCanvasElement | null;
  /** Image of the item for the slot (a non-weapon in hand); none means the slot shows the weapon image. */
  itemImage?: (item: ItemProto) => Promise<HTMLCanvasElement>;
}

/** The row of AP lights on the panel: 10 lights, 9 pixels apart (original layout). */
const AP_LIGHTS = { x: 316, y: 14, step: 9, count: 10 };

export class Hud {
  readonly height: number;
  private readonly art: HudArt;

  constructor(art: HudArt) {
    this.art = art;
    this.height = art.bar.height;
  }

  /** spoken: how many messages have been said in total (Session.spoken); the screen uses it to notice new ones. */
  draw(ctx: CanvasRenderingContext2D, top: number, hero: Hero, messages: readonly string[], spoken = messages.length, indicators: readonly HudIndicator[] = []): void {
    const { bar, itemSlot, font } = this.art;
    ctx.drawImage(bar, 0, top);
    ctx.drawImage(itemSlot, ITEM_SLOT.x, top + ITEM_SLOT.y);
    // Action points are lit only in combat (outside combat they are not spent).
    if (hero.inCombat) {
      const lit = Math.min(AP_LIGHTS.count, Math.floor(hero.ap));
      for (let i = 0; i < lit; i++) ctx.drawImage(this.art.apLight, AP_LIGHTS.x + i * AP_LIGHTS.step, top + AP_LIGHTS.y);
    }

    // The item in the active hand goes in the slot, centered (weapon or not: a flare, a grenade). Empty hand means an empty slot.
    if (hero.activeItem) this.weaponSlot(ctx, top, hero);
    drawLabel(ctx, font, `${t('hudStimpaks')} ${hero.stimpaks}`, ITEM_SLOT.x + ITEM_SLOT.w - 8, top + ITEM_SLOT.y + ITEM_SLOT.h - 6 - font.height, SLOT_COLOR, 'right');
    this.indicators(ctx, top, indicators);

    this.counter(ctx, HP_AT.x, top + HP_AT.y, hero.hp, COLOR_SET[hpTone(hero.hp, hero.maxHp)]);
    this.counter(ctx, AC_AT.x, top + AC_AT.y, hero.ac, COLOR_SET.normal);

    this.monitor(ctx, top, messages, spoken);
  }

  private indicators(ctx: CanvasRenderingContext2D, top: number, list: readonly HudIndicator[]): void {
    const { font, indicatorBox } = this.art;
    const perRow = Math.max(1, Math.floor(this.art.bar.width / INDICATOR.w));
    list.forEach((item, i) => {
      const x = (i % perRow) * INDICATOR.w;
      const y = top - INDICATOR.h * (1 + Math.floor(i / perRow));
      if (indicatorBox) ctx.drawImage(indicatorBox, x, y);
      else {
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, INDICATOR.w, INDICATOR.h);
      }
      drawLabel(ctx, font, item.text, x + INDICATOR.w / 2, y + Math.round((INDICATOR.h - font.height) / 2), item.bad ? INDICATOR.bad : INDICATOR.good, 'center');
    });
  }

  /** Weapon image in the slot and ammo: in the magazine and in reserve. */
  /** Weapon images for the slot by PID (loaded from the player's copy on first use). */
  private readonly images = new Map<number, HTMLCanvasElement | null>();

  private imageOf(item: ItemProto): HTMLCanvasElement | null {
    if (!this.art.itemImage) return this.art.weapon;
    if (!this.images.has(item.pid)) {
      this.images.set(item.pid, null);
      void this.art.itemImage(item).then(
        (image) => this.images.set(item.pid, image),
        () => this.images.set(item.pid, null),
      );
    }
    return this.images.get(item.pid) ?? null;
  }

  private weaponSlot(ctx: CanvasRenderingContext2D, top: number, hero: Hero): void {
    const { font } = this.art;
    // The panel shows the item in the active hand (weapon or not).
    const weapon = hero.activeItem ? this.imageOf(hero.activeItem) : null;
    const slotBottom = top + ITEM_SLOT.y + ITEM_SLOT.h - 6 - font.height;
    if (hero.thrown) drawLabel(ctx, font, `×${hero.reserve}`, ITEM_SLOT.x + 8, slotBottom, SLOT_COLOR);
    else if (!hero.melee) drawLabel(ctx, font, hero.reloadLeft > 0 ? t('hudReloading') : `${hero.magazine}/${hero.weapon.capacity} · ${hero.reserve}`, ITEM_SLOT.x + 8, slotBottom, SLOT_COLOR);
    if (!weapon) return;
    const scale = Math.min(1, (ITEM_SLOT.w - 20) / weapon.width, (ITEM_SLOT.h - 16) / weapon.height);
    const w = Math.round(weapon.width * scale);
    const h = Math.round(weapon.height * scale);
    ctx.drawImage(weapon, ITEM_SLOT.x + (ITEM_SLOT.w - w) / 2, top + ITEM_SLOT.y + (ITEM_SLOT.h - h) / 2 - 4, w, h);
  }

  /**
   * Message screen: the latest lines, new ones at the bottom, in green, as in the original. Each message starts with a mark;
   * each next line is shifted one pixel to the right (the screen is "tilted", and the original looks the same).
   * The up and down arrows scroll the screen back to older messages (the last 100 are kept, session.ts → MAX_MESSAGES).
   */
  private monitor(ctx: CanvasRenderingContext2D, top: number, messages: readonly string[], spoken: number): void {
    const { font } = this.art;
    const pitch = lineHeight(font);
    const rows = Math.floor(MONITOR.h / pitch);
    const lines = this.logLines(messages, spoken, rows);
    // Scrolled back and new messages arrive: the screen stays put (the offset grows by their lines).
    if (this.scroll > 0 && spoken > this.seen) this.scroll += this.lineCount(messages.slice(-(spoken - this.seen)), rows);
    this.seen = spoken;
    this.scroll = Math.max(0, Math.min(this.scroll, lines.length - rows));
    const end = lines.length - this.scroll;
    ctx.save();
    ctx.beginPath();
    ctx.rect(MONITOR.x, top + MONITOR.y, MONITOR.w, MONITOR.h);
    ctx.clip();
    lines.slice(Math.max(0, end - rows), end).forEach((line, i) => drawLabel(ctx, font, line, MONITOR.x + i, top + MONITOR.y + i * pitch, MESSAGE_COLOR));
    ctx.restore();
    // Viewing older messages: a triangle in the bottom right means "newer below".
    if (this.scroll > 0) {
      const x = MONITOR.x + MONITOR.w - 4;
      const y = top + MONITOR.y + MONITOR.h - 2;
      ctx.fillStyle = MESSAGE_COLOR;
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 4);
      ctx.lineTo(x + 4, y - 4);
      ctx.lineTo(x, y);
      ctx.fill();
    }
  }

  /** How many lines back from the last one the message screen is scrolled (0 means the new ones are visible). */
  private scroll = 0;
  /** How many messages had been said on the previous frame (session.spoken). */
  private seen = 0;
  /** Message screen lines: wrapping is expensive, so it is recomputed only on a new message. */
  private cache: { spoken: number; count: number; lines: string[] } = { spoken: -1, count: -1, lines: [] };

  /** Scroll the message screen: +1 is one line back (to older ones), −1 is toward newer ones. */
  scrollLog(delta: number): void {
    this.scroll = Math.max(0, this.scroll + delta);
  }

  private wrapMessage(message: string, rows: number): string[] {
    const { font } = this.art;
    const room = MONITOR.w - rows;
    return wrapText(font, message, room, room - labelWidth(font, KNOB)).map((line, i) => (i === 0 ? KNOB + line : line));
  }

  private lineCount(messages: readonly string[], rows: number): number {
    return messages.reduce((n, m) => n + this.wrapMessage(m, rows).length, 0);
  }

  private logLines(messages: readonly string[], spoken: number, rows: number): string[] {
    if (this.cache.spoken !== spoken || this.cache.count !== messages.length) {
      this.cache = { spoken, count: messages.length, lines: messages.flatMap((m) => this.wrapMessage(m, rows)) };
    }
    return this.cache.lines;
  }

  /** Sign and three digits: "+030". */
  private counter(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, set: number): void {
    const n = this.art.numbers;
    const v = Math.max(-999, Math.min(999, Math.round(value)));
    const abs = Math.abs(v);
    const digits = [Math.floor(abs / 100), Math.floor(abs / 10) % 10, abs % 10];
    ctx.drawImage(n, set + (v >= 0 ? 114 : 108), 0, 6, 17, x, y, 6, 17);
    digits.forEach((d, i) => ctx.drawImage(n, set + d * 9, 0, 9, 17, x + 6 + i * 9, y, 9, 17));
  }
}
