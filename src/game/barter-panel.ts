// The barter panel in the dialogue window — on the original's image (barter.frm, 640×191 at the bottom of the screen) instead of the reply panel.
// The large dark windows are the hero's items (left) and the trader's (right), with scroll arrows; on the wooden table — what
// each side puts down; in the narrow windows at the edges — what the hero's offer is worth and what the trader asks.
// Clicking an item moves it to the table or back; for a stack it first asks how many (wheel, arrows, digits, Enter).
// "Offer" — a deal by the rules of barter.ts, "Talk" (and Esc) — back to the dialogue, everything on the tables goes back to its owners.
// The trader puts nothing down while the hero does — that's a gift: first a question window "Give it away?" over the speaker's head.
import { lineHeight, measureText, type BitmapFont } from '../formats/font.ts';
import type { ItemProto } from '../formats/pro.ts';
import { t, tf } from '../i18n.ts';
import { askValue, offerValue, type Trade } from './barter.ts';
import { drawLabel, wrapText } from './fonts.ts';
import type { Inventory, Stack } from './inventory.ts';

/** How to get an item's name and image (the image loads as needed; until then — null). */
export interface ItemLook {
  name(proto: ItemProto): string;
  image(proto: ItemProto): HTMLCanvasElement | null;
}

type ListName = 'hero' | 'heroTable' | 'merchantTable' | 'merchant';

/** Layout in panel coordinates (its top is 191 pixels above the bottom of the screen). */
const SLOT = { h: 48, pad: 4 };
const ROWS = 3;
const LISTS: Record<ListName, { x: number; y: number; w: number }> = {
  hero: { x: 102, y: 28, w: 72 },
  heroTable: { x: 244, y: 28, w: 72 },
  merchantTable: { x: 330, y: 28, w: 72 },
  merchant: { x: 459, y: 28, w: 72 },
};
const ARROWS = {
  heroUp: { x: 190, y: 44, w: 28, h: 23 },
  heroDown: { x: 190, y: 67, w: 28, h: 25 },
  merchantUp: { x: 422, y: 44, w: 28, h: 23 },
  merchantDown: { x: 422, y: 67, w: 28, h: 25 },
};
const OFFER = { x: 14, y: 138, w: 80, h: 44 };
const TALK = { x: 548, y: 138, w: 84, h: 44 };
/** The red (pressed) buttons on the image: top-left. */
const OFFER_DOT = { x: 38, y: 161 };
const TALK_DOT = { x: 586, y: 161 };
const VALUE_LEFT = { x: 40, y: 40 };
const VALUE_RIGHT = { x: 583, y: 40 };

/** The gift question window — over the speaker's head window (640×480 screen coordinates); the buttons are inside it. */
const GIFT = { x: 150, y: 34, w: 340, h: 160 };
const GIFT_YES = { x: GIFT.x + 24, y: GIFT.y + GIFT.h - 46, w: 130, h: 26 };
const GIFT_NO = { x: GIFT.x + GIFT.w - 154, y: GIFT.y + GIFT.h - 46, w: 130, h: 26 };

const GREEN = '#4fd65a';
const DIM = '#2f9a39';
const YELLOW = '#fcd400';
const COUNT = '#ffffff';

const inside = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/** Choosing the amount for a stack: from where and to where, how many now, how many in total. */
interface Amount {
  from: ListName;
  pid: number;
  value: number;
  max: number;
  typed: string;
}

export class BarterPanel {
  private readonly trade: Trade;
  private readonly look: ItemLook;
  private readonly merchantName: string;
  private readonly scroll: Record<ListName, number> = { hero: 0, heroTable: 0, merchantTable: 0, merchant: 0 };
  private hovered: { list: ListName; stack: Stack } | null = null;
  private pressed: 'offer' | 'talk' | null = null;
  private amount: Amount | null = null;
  /** The last message (the deal's result); until there is one — a hint. */
  private note = '';
  /** The "Give it away?" question is open, and what's under the mouse in it. While it's open, the rest of the panel doesn't respond. */
  private gift: { hover: 'yes' | 'no' | null; pressed: 'yes' | 'no' | null } | null = null;

  /** The panel closed ("Talk" or Esc). */
  onClose: () => void = () => {};
  /** The deal went through or not (sound etc.). */
  onDeal: (result: 'done' | 'refused') => void = () => {};

  constructor(trade: Trade, look: ItemLook, merchantName: string) {
    this.trade = trade;
    this.look = look;
    this.merchantName = merchantName;
  }

  /** Lines for the reply window above the panel: a hint, the item under the mouse, the amount choice or the deal's result. */
  replyText(): string {
    if (this.amount) {
      const name = this.look.name(this.stacks(this.amount.from).find((s) => s.proto.pid === this.amount!.pid)?.proto ?? ({} as ItemProto));
      return tf('barterAmount', { name, n: this.amount.value, max: this.amount.max });
    }
    if (this.hovered) {
      const { list, stack } = this.hovered;
      const merchantSide = list === 'merchant' || list === 'merchantTable';
      const one = { proto: stack.proto, count: 1 };
      const price = merchantSide ? askValue([one], this.trade.terms) : offerValue([one]);
      return tf('barterItem', { name: this.look.name(stack.proto), price });
    }
    return this.note || tf('barterHint', { name: this.merchantName });
  }

  draw(ctx: CanvasRenderingContext2D, font: BitmapFont, panel: HTMLCanvasElement, redDown: HTMLCanvasElement, top: number): void {
    ctx.drawImage(panel, 0, top);
    for (const list of Object.keys(LISTS) as ListName[]) this.drawList(ctx, font, list, top);
    if (this.pressed === 'offer') ctx.drawImage(redDown, OFFER_DOT.x, top + OFFER_DOT.y);
    if (this.pressed === 'talk') ctx.drawImage(redDown, TALK_DOT.x, top + TALK_DOT.y);
    // Prices: what the hero's offer is worth and what the trader asks.
    const pitch = lineHeight(font);
    drawLabel(ctx, font, t('barterOffered'), VALUE_LEFT.x, top + VALUE_LEFT.y, DIM, 'center');
    drawLabel(ctx, font, '$' + this.trade.offered, VALUE_LEFT.x, top + VALUE_LEFT.y + pitch + 2, YELLOW, 'center');
    drawLabel(ctx, font, t('barterAsked'), VALUE_RIGHT.x, top + VALUE_RIGHT.y, DIM, 'center');
    drawLabel(ctx, font, '$' + this.trade.asked, VALUE_RIGHT.x, top + VALUE_RIGHT.y + pitch + 2, YELLOW, 'center');
    if (this.gift) this.drawGift(ctx, font);
  }

  /** The "Give it away?" window: what will happen, two buttons and keys. */
  private drawGift(ctx: CanvasRenderingContext2D, font: BitmapFont): void {
    const gift = this.gift!;
    const pitch = lineHeight(font);
    ctx.fillStyle = 'rgba(8, 10, 6, 0.94)';
    ctx.fillRect(GIFT.x, GIFT.y, GIFT.w, GIFT.h);
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1;
    ctx.strokeRect(GIFT.x + 0.5, GIFT.y + 0.5, GIFT.w - 1, GIFT.h - 1);
    drawLabel(ctx, font, t('barterGiftTitle'), GIFT.x + GIFT.w / 2, GIFT.y + 10, YELLOW, 'center');
    const body = wrapText(font, tf('barterGiftBody', { name: this.merchantName, value: this.trade.offered }), GIFT.w - 32);
    body.forEach((line, i) => drawLabel(ctx, font, line, GIFT.x + 16, GIFT.y + 16 + pitch * (i + 1), GREEN));
    for (const [which, r, label] of [
      ['yes', GIFT_YES, t('barterGiftYes')],
      ['no', GIFT_NO, t('barterGiftNo')],
    ] as const) {
      const active = gift.hover === which || gift.pressed === which;
      ctx.fillStyle = gift.pressed === which ? 'rgba(79, 214, 90, 0.32)' : active ? 'rgba(79, 214, 90, 0.18)' : 'rgba(79, 214, 90, 0.06)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = active ? GREEN : DIM;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      drawLabel(ctx, font, label, r.x + r.w / 2, r.y + Math.round((r.h - pitch) / 2), active ? YELLOW : GREEN, 'center');
    }
    const keys = t('barterGiftKeys');
    drawLabel(ctx, font, keys, GIFT.x + (GIFT.w - measureText(font, keys)) / 2, GIFT.y + GIFT.h - 14, DIM);
  }

  /** The "Give it away?" window button under a screen point. */
  private giftButtonAt(x: number, y: number): 'yes' | 'no' | null {
    if (inside(GIFT_YES, x, y)) return 'yes';
    if (inside(GIFT_NO, x, y)) return 'no';
    return null;
  }

  private stacks(list: ListName): readonly Stack[] {
    return this.inventory(list).items;
  }

  private inventory(list: ListName): Inventory {
    switch (list) {
      case 'hero':
        return this.trade.hero;
      case 'heroTable':
        return this.trade.heroTable;
      case 'merchantTable':
        return this.trade.merchantTable;
      case 'merchant':
        return this.trade.merchant;
    }
  }

  private drawList(ctx: CanvasRenderingContext2D, font: BitmapFont, list: ListName, top: number): void {
    const at = LISTS[list];
    const all = this.stacks(list);
    this.scroll[list] = Math.max(0, Math.min(this.scroll[list], Math.max(0, all.length - ROWS)));
    all.slice(this.scroll[list], this.scroll[list] + ROWS).forEach((stack, row) => {
      const x = at.x;
      const y = top + at.y + row * SLOT.h;
      if (this.hovered?.stack === stack) {
        ctx.fillStyle = 'rgba(79, 214, 90, 0.16)';
        ctx.fillRect(x, y, at.w, SLOT.h);
      }
      const image = this.look.image(stack.proto);
      if (image) {
        const w = at.w - SLOT.pad * 2;
        const h = SLOT.h - SLOT.pad * 2;
        const scale = Math.min(1, w / image.width, h / image.height);
        const dw = Math.round(image.width * scale);
        const dh = Math.round(image.height * scale);
        ctx.drawImage(image, Math.round(x + SLOT.pad + (w - dw) / 2), Math.round(y + SLOT.pad + (h - dh) / 2), dw, dh);
      }
      if (stack.count > 1) drawLabel(ctx, font, 'x' + stack.count, x + 2, y + 2, COUNT);
    });
    // There's something to scroll: the table has no arrows — an icon at the edge.
    if (all.length > ROWS && (list === 'heroTable' || list === 'merchantTable')) {
      drawLabel(ctx, font, `${this.scroll[list] + 1}–${Math.min(all.length, this.scroll[list] + ROWS)}/${all.length}`, at.x + at.w / 2, top + at.y + ROWS * SLOT.h + 1, GREEN, 'center');
    }
  }

  private listAt(x: number, y: number, top: number): { list: ListName; stack: Stack } | null {
    for (const list of Object.keys(LISTS) as ListName[]) {
      const at = LISTS[list];
      if (!inside({ x: at.x, y: top + at.y, w: at.w, h: SLOT.h * ROWS }, x, y)) continue;
      const stack = this.stacks(list)[this.scroll[list] + Math.floor((y - top - at.y) / SLOT.h)];
      return stack ? { list, stack } : null;
    }
    return null;
  }

  private listUnder(x: number, y: number, top: number): ListName | null {
    for (const list of Object.keys(LISTS) as ListName[]) {
      const at = LISTS[list];
      if (inside({ x: at.x, y: top + at.y, w: at.w, h: SLOT.h * ROWS }, x, y)) return list;
    }
    if (x < 320) return x < LISTS.heroTable.x ? 'hero' : 'heroTable';
    return x >= LISTS.merchant.x - 40 ? 'merchant' : 'merchantTable';
  }

  /** The mouse moves: highlight an item. Returns whether a redraw is needed. */
  move(x: number, y: number, top: number): boolean {
    if (this.gift) {
      const hover = this.giftButtonAt(x, y);
      if (hover === this.gift.hover) return false;
      this.gift.hover = hover;
      return true;
    }
    if (this.amount) return false;
    const hit = this.listAt(x, y, top);
    if (hit?.stack === this.hovered?.stack) return false;
    this.hovered = hit;
    return true;
  }

  pointerDown(x: number, y: number, top: number): void {
    if (this.gift) {
      this.gift.pressed = this.giftButtonAt(x, y);
      return;
    }
    if (inside({ ...OFFER, y: top + OFFER.y }, x, y)) this.pressed = 'offer';
    else if (inside({ ...TALK, y: top + TALK.y }, x, y)) this.pressed = 'talk';
  }

  /** Mouse button released: a button, an arrow or an item. */
  pointerUp(x: number, y: number, top: number): void {
    if (this.gift) {
      const pressed = this.gift.pressed;
      this.gift.pressed = null;
      if (pressed && pressed === this.giftButtonAt(x, y)) this.answerGift(pressed === 'yes');
      return;
    }
    const pressed = this.pressed;
    this.pressed = null;
    if (pressed === 'offer' && inside({ ...OFFER, y: top + OFFER.y }, x, y)) return this.offer();
    if (pressed === 'talk' && inside({ ...TALK, y: top + TALK.y }, x, y)) return this.leave();
    if (this.amount) return;
    for (const [name, r] of Object.entries(ARROWS)) {
      if (!inside({ ...r, y: top + r.y }, x, y)) continue;
      const list: ListName = name.startsWith('hero') ? 'hero' : 'merchant';
      this.scrollList(list, name.endsWith('Up') ? -1 : 1);
      return;
    }
    const hit = this.listAt(x, y, top);
    if (hit) this.pick(hit.list, hit.stack);
  }

  wheel(x: number, y: number, top: number, direction: number): void {
    if (this.gift) return;
    if (this.amount) {
      this.changeAmount(-direction);
      return;
    }
    const list = this.listUnder(x, y, top);
    if (list) this.scrollList(list, direction);
  }

  /** Keys: Esc — back to the dialogue (or cancel the amount choice), Enter — deal; while choosing an amount — digits and arrows. */
  key(code: string, shift: boolean): boolean {
    if (this.gift) {
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'KeyY') this.answerGift(true);
      else if (code === 'Escape' || code === 'KeyN') this.answerGift(false);
      return true;
    }
    if (this.amount) {
      const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
      if (code === 'Escape') this.amount = null;
      else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.confirmAmount();
      else if (code === 'ArrowUp' || code === 'ArrowRight') this.changeAmount(shift ? 10 : 1);
      else if (code === 'ArrowDown' || code === 'ArrowLeft') this.changeAmount(shift ? -10 : -1);
      else if (code === 'PageUp') this.changeAmount(100);
      else if (code === 'PageDown') this.changeAmount(-100);
      else if (code === 'Home') this.setAmount(this.amount.max);
      else if (code === 'End') this.setAmount(1);
      else if (code === 'Backspace') this.typeAmount(this.amount.typed.slice(0, -1));
      else if (digit) this.typeAmount(this.amount.typed + digit[1]);
      else return false;
      return true;
    }
    if (code === 'Escape') this.leave();
    else if (code === 'Enter' || code === 'NumpadEnter') this.offer();
    else return false;
    return true;
  }

  private scrollList(list: ListName, delta: number): void {
    const total = this.stacks(list).length;
    this.scroll[list] = Math.max(0, Math.min(Math.max(0, total - ROWS), this.scroll[list] + delta));
  }

  /** Click on an item: a single one goes straight to the other side, a stack — first choose how many (everything by default). */
  private pick(list: ListName, stack: Stack): void {
    this.note = '';
    if (stack.count > 1) {
      this.amount = { from: list, pid: stack.proto.pid, value: stack.count, max: stack.count, typed: '' };
      this.hovered = null;
      return;
    }
    this.transfer(list, stack.proto.pid, 1);
  }

  private transfer(list: ListName, pid: number, count: number): void {
    const target: Record<ListName, ListName> = { hero: 'heroTable', heroTable: 'hero', merchant: 'merchantTable', merchantTable: 'merchant' };
    this.trade.move(this.inventory(list), this.inventory(target[list]), pid, count);
    this.hovered = null;
  }

  private setAmount(n: number): void {
    if (!this.amount) return;
    this.amount.value = Math.max(1, Math.min(this.amount.max, n));
    this.amount.typed = '';
  }

  private changeAmount(delta: number): void {
    if (this.amount) this.setAmount(this.amount.value + delta);
  }

  private typeAmount(typed: string): void {
    if (!this.amount) return;
    const n = Number.parseInt(typed || '0', 10);
    this.amount.typed = typed;
    this.amount.value = Math.max(typed ? 0 : 1, Math.min(this.amount.max, n || (typed ? 0 : 1)));
  }

  private confirmAmount(): void {
    const amount = this.amount;
    this.amount = null;
    if (amount && amount.value > 0) this.transfer(amount.from, amount.pid, amount.value);
  }

  private offer(): void {
    this.amount = null;
    // The trader puts nothing down — that's a gift (as in the original). So as not to give an item away by mistake — a question first.
    if (this.trade.merchantTable.empty && !this.trade.heroTable.empty) {
      this.gift = { hover: null, pressed: null };
      this.hovered = null;
      return;
    }
    this.deal();
  }

  /** Answer to "Give it away?": yes — a deal (a gift), no — the items stay on the hero's table. */
  private answerGift(give: boolean): void {
    this.gift = null;
    if (give) this.deal();
    else this.note = t('barterGiftKept');
  }

  private deal(): void {
    const result = this.trade.deal();
    if (result === 'nothing') return;
    this.note = result === 'done' ? (this.trade.change > 0 ? tf('barterChange', { n: this.trade.change }) : t('barterDone')) : tf('barterRefused', { asked: this.trade.asked, offered: this.trade.offered });
    this.onDeal(result);
  }

  /** Back to the dialogue: everything on the tables goes to its owners. */
  leave(): void {
    this.amount = null;
    this.gift = null;
    this.trade.cancel();
    this.onClose();
  }
}
