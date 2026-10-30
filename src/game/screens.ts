// The inventory and corpse search screens. Backgrounds, buttons and item images come from the player's copy of Fallout,
// the layout is as in the original (a 499×377 / 537×376 window at point 80,0 of a 640×480 screen), labels use the original font.
// The cursor, as in the original, comes in two kinds: a hand (a click uses, takes in hand, moves) and binoculars (a click
// examines: name, description and weight on the dark screen); switched with the right mouse button or V. There are two hands (Hand 1 and Hand 2): any
// item can be dragged with the mouse to a hand and back to the list; clicking a hand makes it active (it is highlighted).
// Holding the mouse button on an item (without moving) opens the action menu, as in the original: examine, use, drop (when
// searching: examine, take or put). A book is not read with a click: the click opens this same menu.
import type { GameData } from '../assets/gamedata.ts';
import { lineHeight, measureText, type BitmapFont } from '../formats/font.ts';
import type { ItemProto } from '../formats/pro.ts';
import { ITEM_TYPE } from '../formats/pro.ts';
import { t, tf, type StringKey } from '../i18n.ts';
import { drawLabel, wrapText } from './fonts.ts';
import { isBook } from './books.ts';
import { canWield, type Hero, type WeaponItem } from './hero.ts';
import { AMMO_WEIGHT, type Inventory, type Stack } from './inventory.ts';

const WINDOW = { x: 80, y: 0 };
const SLOT = { w: 64, h: 48, pad: 4 };
const ROWS = 6;
const LIST_HERO = { x: 46, y: 35 };
const LIST_OTHER = { x: 424, y: 35 };
const HAND_RIGHT = { x: 245, y: 286, w: 90, h: 61 };
/** The "Hand 1" window (left of "Hand 2"). */
const HAND_LEFT = { x: 154, y: 286, w: 90, h: 61 };
/** The "Armor" window in the original's inventory window. */
const ARMOR_SLOT = { x: 154, y: 183, w: 90, h: 61 };
/** The dark screen on the right of the inventory: width and height within the frame on the image. */
const SUMMARY = { x: 297, y: 44, w: 143, h: 175 };
const DONE_INVENTORY = { x: 437, y: 329, w: 15, h: 16 };
const DONE_LOOT = { x: 288, y: 328, w: 15, h: 16 };
const LOOT_TITLE = { x: 176, y: 44, w: 181 };
/** Labels above the lists in the search window: the top of the plate and the largest text width. */
const LOOT_LABEL_Y = 20;
const LOOT_LABEL_MAX = 120;
const TEXT = '#4fd65a';
const TEXT_DIM = '#3fae4a';
const COUNT = '#ffffff';

/** How many milliseconds to hold the mouse button on an item to open the action menu. */
const HOLD_MS = 350;
/** Action menu: width and line height. */
const MENU_W = 132;
const MENU_ROW = 16;

/** Interface image numbers in INTRFACE.LST. */
const ART = { inventory: 48, loot: 114, doneUp: 8, doneDown: 9 };

export interface ScreenArt {
  inventory: HTMLCanvasElement;
  loot: HTMLCanvasElement;
  doneUp: HTMLCanvasElement;
  doneDown: HTMLCanvasElement;
}

export async function loadScreenArt(data: GameData): Promise<ScreenArt> {
  const [inventory, loot, doneUp, doneDown] = await Promise.all([
    data.interfaceImage(ART.inventory),
    data.interfaceImage(ART.loot),
    data.interfaceImage(ART.doneUp),
    data.interfaceImage(ART.doneDown),
  ]);
  return { inventory, loot, doneUp, doneDown };
}

/** What to tell the game after an action on the screen. */
export interface ScreenHost {
  say(message: string): void;
  useStimpak(): void;
  /** Take a drug (stimpak, Rad-X, RadAway, Mentats…). */
  useDrug(item: ItemProto): void;
  /** Read a book (books.ts): the skill grows, hours pass. */
  readBook(item: ItemProto): void;
  /** Drop this many of these items on the floor in front of the hero. */
  drop(item: ItemProto, count: number): void;
  /** Reload the weapon in hand; ammo means with exactly this ammo (any of the same caliber). */
  reload(ammo?: ItemProto): void;
  /** Take a weapon in hand. */
  equip(item: WeaponItem): void;
  /** Put on armor (already worn means take it off). */
  wear(item: ItemProto): void;
  /** Use an item: explosives are planted, the rest is used on whatever is in front of the hero (the chip on the computer). */
  useItem(item: ItemProto): void;
  /** Put an item in a hand (0 is Hand 1, 1 is Hand 2; null frees it). */
  putInHand(hand: 0 | 1, item: ItemProto | null): void;
  /** Make a hand active. */
  setActiveHand(hand: 0 | 1): void;
}

interface Corpse {
  name: string;
  inventory: Inventory;
}

type Hit = { list: 'hero' | 'other'; index: number } | { slot: 'hand1' | 'hand2' | 'armor' } | { button: 'done' } | null;

/** An action from the item menu. */
type MenuAction = 'look' | 'use' | 'drop' | 'take' | 'give' | 'takeOff';
const MENU_LABEL: Record<MenuAction, StringKey> = { look: 'itemLook', use: 'itemUse', drop: 'itemDrop', take: 'itemTake', give: 'itemGive', takeOff: 'itemTakeOff' };

/** The item action menu: where it is, with which item (from where and how many), what is in it and what is under the mouse. */
interface ItemMenu {
  x: number;
  y: number;
  proto: ItemProto;
  count: number;
  from: 'hero' | 'other' | 'hand' | 'armor';
  actions: MenuAction[];
  hover: number;
  pressed: number;
  /** Opened by holding and the button has not been released yet: releasing on an action chooses it. */
  holding: boolean;
}

/** Hand window → hand number. */
const handOf = (slot: 'hand1' | 'hand2'): 0 | 1 => (slot === 'hand1' ? 0 : 1);

export class ItemScreens {
  private mode: 'inventory' | 'loot' | null = null;
  private hero: Hero | null = null;
  private corpse: Corpse | null = null;
  private hovered: Stack | null = null;
  /** Binoculars cursor: a click examines the item instead of using it. */
  private look = false;
  /** What was examined with the binoculars (its description is on the dark screen until something else is examined). */
  private examined: ItemProto | null = null;
  /** The dragged item: from where (a list or a hand), where it was pressed, whether the mouse has moved yet. */
  private drag: { proto: ItemProto; from: 'list' | 0 | 1 | 'armor'; x: number; y: number; moved: boolean } | null = null;
  private pointer = { x: 0, y: 0 };
  private pressed = false;
  /** The mouse button is held on an item: when and where it was pressed (hold for HOLD_MS without moving to get the action menu). */
  private hold: { at: number; x: number; y: number; hit: Hit } | null = null;
  private menu: ItemMenu | null = null;
  private scroll = { hero: 0, other: 0 };
  private readonly images = new Map<number, HTMLCanvasElement | null>();
  private readonly art: ScreenArt;
  private readonly data: GameData;
  private readonly font: BitmapFont;

  constructor(art: ScreenArt, data: GameData, font: BitmapFont) {
    this.art = art;
    this.data = data;
    this.font = font;
  }

  get open(): boolean {
    return this.mode !== null;
  }

  /** The cursor is now binoculars (the game draws it instead of the arrow). */
  get lookMode(): boolean {
    return this.mode !== null && this.look;
  }

  /** Hand ↔ binoculars. */
  private toggleLook(): void {
    this.look = !this.look;
    if (!this.look) this.examined = null;
  }

  openInventory(hero: Hero): void {
    this.mode = 'inventory';
    this.hero = hero;
    this.corpse = null;
    this.reset();
  }

  openLoot(hero: Hero, corpse: Corpse): void {
    this.mode = 'loot';
    this.hero = hero;
    this.corpse = corpse;
    this.reset();
  }

  close(): void {
    this.mode = null;
    this.hero = null;
    this.corpse = null;
    this.menu = null;
    this.hold = null;
  }

  private reset(): void {
    this.menu = null;
    this.hold = null;
    this.hovered = null;
    this.look = false;
    this.examined = null;
    this.drag = null;
    this.pressed = false;
    this.scroll = { hero: 0, other: 0 };
  }

  /** Keys: Esc / I close (Tab now opens the automap), A takes everything when searching. Returns true if the key was handled. */
  key(code: string): boolean {
    if (!this.mode) return false;
    // Esc only closes an open item menu.
    if (this.menu && code === 'Escape') {
      this.menu = null;
      return true;
    }
    if (code === 'Escape' || code === 'KeyI' || (this.mode === 'loot' && code === 'KeyE')) {
      this.close();
      return true;
    }
    if (code === 'KeyV') {
      this.toggleLook();
      return true;
    }
    if (code === 'KeyA' && this.mode === 'loot' && this.corpse && this.hero) {
      if (!this.corpse.inventory.empty) {
        this.corpse.inventory.moveAllTo(this.hero.inventory);
      }
      return true;
    }
    return true;
  }

  pointerMove(x: number, y: number): void {
    this.pointer = { x, y };
    if (this.menu) {
      this.menu.hover = this.menuRowAt(x, y);
      return;
    }
    if (this.hold && Math.hypot(x - this.hold.x, y - this.hold.y) > 4) this.hold = null;
    if (this.drag && Math.hypot(x - this.drag.x, y - this.drag.y) > 4) this.drag.moved = true;
    const hit = this.hitTest(x, y);
    this.hovered = hit && 'list' in hit ? (this.listStacks(hit.list)[hit.index] ?? null) : null;
  }

  /** A mouse button was pressed: right button toggles hand ↔ binoculars, left button on "Done" presses the button. */
  pointerDown(x: number, y: number, button = 0): void {
    // Item menu: pressing on an action chooses it on release; pressing elsewhere closes the menu.
    if (this.menu) {
      const row = this.menuRowAt(x, y);
      if (row >= 0) this.menu.pressed = row;
      else this.menu = null;
      this.hold = null;
      this.drag = null;
      return;
    }
    if (button === 2) {
      this.toggleLook();
      return;
    }
    const hit = this.hitTest(x, y);
    this.pressed = !!hit && 'button' in hit;
    this.hold = button === 0 && !this.look && this.menuFor(hit, x, y) ? { at: performance.now(), x, y, hit } : null;
    // With the hand in the inventory an item can be picked up and dragged (from the list to a hand, from a hand to the other hand or to the list).
    this.drag = null;
    if (this.mode !== 'inventory' || this.look || !hit || !this.hero) return;
    if ('list' in hit && hit.list === 'hero') {
      const stack = this.listStacks('hero')[hit.index];
      if (stack) this.drag = { proto: stack.proto, from: 'list', x, y, moved: false };
    } else if ('slot' in hit && hit.slot !== 'armor') {
      const hand = handOf(hit.slot);
      const item = this.hero.handItem(hand);
      if (item) this.drag = { proto: item, from: hand, x, y, moved: false };
    } else if ('slot' in hit) {
      const worn = this.hero.armorItem;
      if (worn) this.drag = { proto: worn, from: 'armor', x, y, moved: false };
    }
  }

  /** Click: with binoculars, examine; with the hand in the inventory, use the item; when searching, move the stack. */
  pointerUp(x: number, y: number, host: ScreenHost, button = 0): void {
    if (button !== 0) return;
    this.hold = null;
    const menu = this.menu;
    if (menu) {
      const row = this.menuRowAt(x, y);
      // Opened by holding: released on an action means choose it; released in place means the menu stays and is used with a click.
      if (menu.holding) {
        menu.holding = false;
        if (row >= 0) this.choose(menu, row, host);
        return;
      }
      if (row >= 0 && row === menu.pressed) this.choose(menu, row, host);
      else menu.pressed = -1;
      return;
    }
    const wasPressed = this.pressed;
    this.pressed = false;
    const hit = this.hitTest(x, y);
    const drag = this.drag;
    this.drag = null;
    // Dragged: onto a hand window, put it in that hand; from a hand elsewhere, free the hand. Armor onto the armor window:
    // put it on; from the armor window anywhere, take it off (2026-10-24: worn armor could not be taken off).
    if (drag?.moved && this.hero) {
      const toArmor = !!hit && 'slot' in hit && hit.slot === 'armor';
      if (drag.from === 'armor') {
        if (!toArmor) host.wear(drag.proto);
      } else if (toArmor) {
        if (drag.proto.armor) {
          if (drag.from !== 'list') host.putInHand(drag.from, null);
          if (this.hero.armorItem?.pid !== drag.proto.pid) host.wear(drag.proto);
        }
      } else if (hit && 'slot' in hit && hit.slot !== 'armor') {
        const to = handOf(hit.slot);
        if (drag.from !== 'list' && drag.from !== to) host.putInHand(drag.from, null);
        if (drag.from !== to) host.putInHand(to, drag.proto);
      } else if (drag.from !== 'list') host.putInHand(drag.from, null);
      return;
    }
    if (!hit || !this.hero) return;
    if ('button' in hit) {
      if (wasPressed) this.close();
      return;
    }
    if ('slot' in hit) {
      const worn = this.hero.armorItem;
      if (this.look) this.examined = (hit.slot === 'armor' ? worn : this.hero.handItem(handOf(hit.slot))) ?? null;
      else if (hit.slot !== 'armor') host.setActiveHand(handOf(hit.slot));
      // Clicking worn armor takes it off.
      else if (worn) host.wear(worn);
      return;
    }
    const stack = this.listStacks(hit.list)[hit.index];
    if (stack && this.look) {
      this.examined = stack.proto;
      return;
    }
    if (!stack) return;
    if (this.mode === 'loot' && this.corpse) {
      this.moveLoot(hit.list, stack, host);
      return;
    }
    // A book is not read with a click (reading takes hours): the click opens the action menu.
    if (isBook(stack.proto.pid)) {
      this.openMenu(this.menuFor(hit, x, y), false);
      return;
    }
    this.useStack(stack.proto, host);
  }

  /** "Use": a weapon goes in hand, armor is put on or taken off, a drug is taken, ammo is loaded, a book is read. */
  private useStack(proto: ItemProto, host: ScreenHost): void {
    if (isBook(proto.pid)) host.readBook(proto);
    else if (canWield(proto)) host.equip(proto);
    else if (proto.armor) host.wear(proto);
    else if (proto.type === ITEM_TYPE.drug) host.useDrug(proto);
    else if (proto.type === ITEM_TYPE.ammo) host.reload(proto);
    else host.useItem(proto);
  }

  /** Search: from the other list to yours, from yours to there. */
  private moveLoot(list: 'hero' | 'other', stack: Stack, host: ScreenHost): void {
    if (!this.corpse || !this.hero) return;
    const name = this.data.itemName(stack.proto);
    if (list === 'other') {
      const n = this.corpse.inventory.moveTo(this.hero.inventory, stack.proto.pid);
      host.say(n > 1 ? tf('msgPickupCount', { name, n }) : tf('msgPickup', { name }));
    } else {
      // A stack in the list excludes the pistol in hand: only what is visible is moved.
      this.corpse.inventory.add(stack.proto, this.hero.inventory.remove(stack.proto.pid, stack.count));
    }
  }

  /** Which menu would open for what was pressed (null means not an item). */
  private menuFor(hit: Hit, x: number, y: number): Omit<ItemMenu, 'hover' | 'pressed' | 'holding'> | null {
    if (!hit || !this.hero) return null;
    if ('list' in hit) {
      const stack = this.listStacks(hit.list)[hit.index];
      if (!stack) return null;
      const actions: MenuAction[] = this.mode === 'loot' ? ['look', hit.list === 'other' ? 'take' : 'give'] : ['look', 'use', 'drop'];
      return { x, y, proto: stack.proto, count: stack.count, from: hit.list, actions };
    }
    if ('slot' in hit && this.mode === 'inventory') {
      const proto = hit.slot === 'armor' ? this.hero.armorItem : this.hero.handItem(handOf(hit.slot));
      if (!proto) return null;
      return { x, y, proto, count: 1, from: hit.slot === 'armor' ? 'armor' : 'hand', actions: hit.slot === 'armor' ? ['look', 'takeOff', 'drop'] : ['look', 'drop'] };
    }
    return null;
  }

  private openMenu(menu: Omit<ItemMenu, 'hover' | 'pressed' | 'holding'> | null, holding: boolean): void {
    if (!menu) return;
    // The whole menu on screen: at the right and bottom edges it goes left of and above the cursor.
    const h = MENU_ROW * (menu.actions.length + 1) + 6;
    const x = Math.min(menu.x, 640 - MENU_W - 4);
    const y = Math.min(menu.y, 378 - h);
    this.menu = { ...menu, x, y, hover: -1, pressed: -1, holding };
    this.drag = null;
    this.hovered = null;
  }

  /** The menu line under a point (-1 means none). The first line is the item name, actions start from the second. */
  private menuRowAt(x: number, y: number): number {
    const m = this.menu;
    if (!m || x < m.x || x >= m.x + MENU_W) return -1;
    const row = Math.floor((y - m.y - 3) / MENU_ROW) - 1;
    return row >= 0 && row < m.actions.length ? row : -1;
  }

  private choose(menu: ItemMenu, row: number, host: ScreenHost): void {
    this.menu = null;
    const action = menu.actions[row];
    if (!this.hero || !action) return;
    switch (action) {
      case 'look':
        this.examined = menu.proto;
        break;
      case 'use':
        this.useStack(menu.proto, host);
        break;
      case 'takeOff':
        host.wear(menu.proto);
        break;
      case 'drop':
        host.drop(menu.proto, menu.from === 'hero' ? menu.count : 1);
        break;
      case 'take':
      case 'give': {
        const stack = this.listStacks(menu.from === 'other' ? 'other' : 'hero').find((s) => s.proto.pid === menu.proto.pid);
        if (stack) this.moveLoot(menu.from === 'other' ? 'other' : 'hero', stack, host);
        break;
      }
    }
  }

  /** Item menu: the name at the top, actions as lines; the one under the mouse is highlighted. */
  private drawMenu(ctx: CanvasRenderingContext2D, menu: ItemMenu): void {
    const h = MENU_ROW * (menu.actions.length + 1) + 6;
    ctx.fillStyle = 'rgba(8, 10, 6, 0.95)';
    ctx.fillRect(menu.x, menu.y, MENU_W, h);
    ctx.strokeStyle = TEXT;
    ctx.lineWidth = 1;
    ctx.strokeRect(menu.x + 0.5, menu.y + 0.5, MENU_W - 1, h - 1);
    let name = this.data.itemName(menu.proto);
    while (name.length > 4 && measureText(this.font, name) > MENU_W - 12) name = name.slice(0, -2) + '…';
    drawLabel(ctx, this.font, name, menu.x + 6, menu.y + 6, TEXT_DIM);
    menu.actions.forEach((action, i) => {
      const y = menu.y + 3 + MENU_ROW * (i + 1);
      const active = menu.hover === i || menu.pressed === i;
      if (active) {
        ctx.fillStyle = 'rgba(79, 214, 90, 0.2)';
        ctx.fillRect(menu.x + 2, y, MENU_W - 4, MENU_ROW);
      }
      drawLabel(ctx, this.font, t(MENU_LABEL[action]), menu.x + 10, y + 3, active ? '#f8f858' : TEXT);
    });
  }

  wheel(x: number, deltaY: number): void {
    const list = this.mode === 'loot' && x >= WINDOW.x + 260 ? 'other' : 'hero';
    const total = this.listStacks(list).length;
    const next = this.scroll[list] + Math.sign(deltaY);
    this.scroll[list] = Math.max(0, Math.min(Math.max(0, total - ROWS), next));
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.mode || !this.hero) return;
    // The button is held on an item without moving: open the action menu.
    if (this.hold && !this.menu && performance.now() - this.hold.at >= HOLD_MS) {
      const hold = this.hold;
      this.hold = null;
      this.openMenu(this.menuFor(hold.hit, hold.x, hold.y), true);
    }
    // The game behind the window is dimmed.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, 640, 480);
    const loot = this.mode === 'loot';
    ctx.drawImage(loot ? this.art.loot : this.art.inventory, WINDOW.x, WINDOW.y);

    this.drawList(ctx, LIST_HERO, 'hero');
    if (loot) {
      this.drawList(ctx, LIST_OTHER, 'other');
      this.drawLootTitle(ctx);
      this.drawLootLabels(ctx);
    } else {
      // Both hands; the active one in a green frame. An item being dragged from a hand is not drawn in the hand.
      ([HAND_LEFT, HAND_RIGHT] as const).forEach((box, hand) => {
        const item = this.hero!.handItem(hand as 0 | 1);
        if (item && !(this.drag?.moved && this.drag.from === hand)) this.drawItemImage(ctx, item, WINDOW.x + box.x, WINDOW.y + box.y, box.w, box.h);
        if (hand === this.hero!.activeHand) {
          ctx.strokeStyle = 'rgba(79, 214, 90, 0.8)';
          ctx.lineWidth = 2;
          ctx.strokeRect(WINDOW.x + box.x + 1, WINDOW.y + box.y + 1, box.w - 2, box.h - 2);
        }
      });
      const worn = this.hero.armorItem;
      if (worn) this.drawItemImage(ctx, worn, WINDOW.x + ARMOR_SLOT.x, WINDOW.y + ARMOR_SLOT.y, ARMOR_SLOT.w, ARMOR_SLOT.h);
      this.drawSummary(ctx);
    }

    const done = loot ? DONE_LOOT : DONE_INVENTORY;
    ctx.drawImage(this.pressed ? this.art.doneDown : this.art.doneUp, WINDOW.x + done.x, WINDOW.y + done.y);
    // The item being dragged is under the mouse.
    if (this.drag?.moved) this.drawItemImage(ctx, this.drag.proto, this.pointer.x - 32, this.pointer.y - 24, 64, 48);

    // The hint under the window is ours, on a dark strip so it does not blend into the panel.
    ctx.fillStyle = 'rgba(11, 10, 8, 0.9)';
    ctx.fillRect(0, 380, 640, 22);
    ctx.font = '16px VT323, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e9dcc0';
    ctx.fillText(t(this.look ? 'lookHint' : loot ? 'lootHint' : 'inventoryHint'), 320, 396);
    if (this.menu) this.drawMenu(ctx, this.menu);
  }

  private listStacks(list: 'hero' | 'other'): readonly Stack[] {
    if (list === 'other') return this.corpse?.inventory.items ?? [];
    const hero = this.hero;
    if (!hero) return [];
    // Items in hands and worn armor (as in the original) are not in the list; spare ones are.
    const used = [hero.handItem(0)?.pid, hero.handItem(1)?.pid, hero.armorItem?.pid];
    return hero.inventory.items.flatMap((s) => {
      const out = used.filter((pid) => pid === s.proto.pid).length;
      return s.count > out ? [out ? { proto: s.proto, count: s.count - out } : s] : [];
    });
  }

  private drawList(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, list: 'hero' | 'other'): void {
    const stacks = this.listStacks(list).slice(this.scroll[list], this.scroll[list] + ROWS);
    stacks.forEach((stack, row) => {
      const x = WINDOW.x + at.x;
      const y = WINDOW.y + at.y + row * SLOT.h;
      if (stack === this.hovered) {
        ctx.fillStyle = 'rgba(79, 214, 90, 0.14)';
        ctx.fillRect(x, y, SLOT.w, SLOT.h);
      }
      this.drawItemImage(ctx, stack.proto, x + SLOT.pad, y + SLOT.pad, SLOT.w - SLOT.pad * 2, SLOT.h - SLOT.pad * 2);
      // The number of items in a stack in white in the top left corner of the cell, as in the original.
      if (stack.count > 1) drawLabel(ctx, this.font, 'x' + stack.count, x + 2, y + 2, COUNT);
    });
    if (list === 'other' && stacks.length === 0) {
      drawLabel(ctx, this.font, t('lootEmpty'), WINDOW.x + at.x + SLOT.w / 2, WINDOW.y + at.y + 18, TEXT_DIM, 'center');
    }
  }

  private drawItemImage(ctx: CanvasRenderingContext2D, proto: ItemProto, x: number, y: number, w: number, h: number): void {
    const image = this.image(proto);
    if (!image) return;
    const scale = Math.min(1, w / image.width, h / image.height);
    const dw = Math.round(image.width * scale);
    const dh = Math.round(image.height * scale);
    ctx.drawImage(image, Math.round(x + (w - dw) / 2), Math.round(y + (h - dh) / 2), dw, dh);
  }

  /** Item images are loaded as needed and remembered. */
  private image(proto: ItemProto): HTMLCanvasElement | null {
    if (!this.images.has(proto.pid)) {
      this.images.set(proto.pid, null);
      void this.data.inventoryImage(proto).then((img) => this.images.set(proto.pid, img), () => {});
    }
    return this.images.get(proto.pid) ?? null;
  }

  /** What was examined with the binoculars: name, description, weight as lines of width width. */
  private aboutLines(proto: ItemProto, width: number): { text: string; dim?: boolean }[] {
    const lines: { text: string; dim?: boolean }[] = [{ text: this.data.itemName(proto) }, { text: '' }];
    for (const line of wrapText(this.font, this.data.itemDescription(proto), width)) lines.push({ text: line, dim: true });
    // Weight for every item, "Weight: 0" too (the client, 2026-10-29: keys and bottle caps had no such line, it looked like they had no weight).
    // Ammo: the weight of a whole box, lightened like all ammo (inventory.ts -> AMMO_WEIGHT).
    const weight = Math.max(0, proto.weight) * (proto.type === ITEM_TYPE.ammo ? AMMO_WEIGHT : 1);
    lines.push({ text: '' }, { text: tf('statWeight', { n: weight }), dim: true });
    return lines;
  }

  /** On the right: hero info, the item examined with the binoculars, or the name of the item under the mouse. */
  private drawSummary(ctx: CanvasRenderingContext2D): void {
    const hero = this.hero!;
    let lines: { text: string; dim?: boolean }[] = [];
    if (this.examined) {
      lines = this.aboutLines(this.examined, SUMMARY.w);
    } else if (this.hovered) {
      lines.push({ text: this.data.itemName(this.hovered.proto) });
      lines.push({ text: '' });
      lines.push({ text: t('lookTip'), dim: true });
    } else {
      const w = hero.weapon;
      lines.push({ text: hero.character.name || t('heroName') });
      lines.push({ text: '' });
      lines.push({ text: tf('statHp', { hp: hero.hp, max: hero.maxHp }) });
      lines.push({ text: tf('statAc', { ac: hero.ac }) });
      lines.push({ text: tf('statSkill', { skill: hero.gunSkill }) });
      lines.push({ text: tf('statXp', { xp: hero.experience }) });
      // Item weight and how much can be carried, as in the original's inventory window; more means overloaded (hero.ts → OVERLOAD).
      lines.push({ text: tf(hero.overloaded ? 'statLoadOver' : 'statLoad', { load: Math.round(hero.load), max: hero.carryWeight }) });
      lines.push({ text: '' });
      const held = hero.activeItem;
      lines.push({ text: tf('statHand', { n: hero.activeHand + 1, name: held ? this.data.itemName(held) : t('fists') }) });
      const bonus = hero.melee ? hero.fighter.meleeDamage : 0;
      lines.push({ text: tf('statDamage', { min: w.minDamage, max: w.maxDamage + bonus }), dim: true });
      if (w.capacity > 0) {
        lines.push({ text: tf('statAmmo', { mag: hero.magazine, cap: w.capacity }), dim: true });
        const ammo = hero.loadedAmmo;
        if (ammo) lines.push({ text: this.data.itemName(ammo), dim: true });
      } else if (hero.thrown) lines.push({ text: tf('statThrown', { n: hero.reserve }), dim: true });
    }
    const pitch = lineHeight(this.font) + 2;
    lines.slice(0, Math.floor(SUMMARY.h / pitch)).forEach((line, i) => {
      drawLabel(ctx, this.font, line.text, WINDOW.x + SUMMARY.x, WINDOW.y + SUMMARY.y + 2 + i * pitch, line.dim ? TEXT_DIM : TEXT);
    });
  }

  /**
   * Labels above the lists in the search window (the client, 2026-10-22: it was unclear where the hero's items were): on the left "Your items",
   * on the right whose they are (a corpse, a box). A dark plate above the top of the list so the label reads against the metal of the frame.
   */
  private drawLootLabels(ctx: CanvasRenderingContext2D): void {
    const label = (text: string, center: number) => {
      if (!text) return;
      let shown = text;
      while (shown.length > 3 && measureText(this.font, shown) > LOOT_LABEL_MAX) shown = shown.slice(0, -2) + '…';
      const w = measureText(this.font, shown) + 10;
      const x = Math.max(WINDOW.x + 4, Math.min(WINDOW.x + this.art.loot.width - 4 - w, Math.round(center - w / 2)));
      ctx.fillStyle = 'rgba(11, 10, 8, 0.88)';
      ctx.fillRect(x, WINDOW.y + LOOT_LABEL_Y, w, lineHeight(this.font) + 4);
      drawLabel(ctx, this.font, shown, x + w / 2, WINDOW.y + LOOT_LABEL_Y + 2, TEXT, 'center');
    };
    label(t('lootYours'), WINDOW.x + LIST_HERO.x + SLOT.w / 2);
    label(this.corpse?.name ?? '', WINDOW.x + LIST_OTHER.x + SLOT.w / 2);
  }

  private drawLootTitle(ctx: CanvasRenderingContext2D): void {
    const center = WINDOW.x + LOOT_TITLE.x + LOOT_TITLE.w / 2;
    drawLabel(ctx, this.font, this.corpse?.name ?? '', center, WINDOW.y + LOOT_TITLE.y + 128, TEXT, 'center');
    if (this.examined) {
      // What was examined with the binoculars: under the name, in the middle of the window.
      const pitch = lineHeight(this.font) + 2;
      this.aboutLines(this.examined, LOOT_TITLE.w)
        .slice(0, 8)
        .forEach((line, i) => drawLabel(ctx, this.font, line.text, center, WINDOW.y + LOOT_TITLE.y + 148 + i * pitch, line.dim ? TEXT_DIM : TEXT, 'center'));
    } else if (this.hovered) drawLabel(ctx, this.font, this.data.itemName(this.hovered.proto), center, WINDOW.y + LOOT_TITLE.y + 148, TEXT_DIM, 'center');
  }

  private hitTest(x: number, y: number): Hit {
    if (!this.mode) return null;
    const done = this.mode === 'loot' ? DONE_LOOT : DONE_INVENTORY;
    if (inside(x, y, WINDOW.x + done.x - 3, WINDOW.y + done.y - 3, done.w + 6, done.h + 6)) return { button: 'done' };
    if (this.mode === 'inventory') {
      if (inside(x, y, WINDOW.x + HAND_LEFT.x, WINDOW.y + HAND_LEFT.y, HAND_LEFT.w, HAND_LEFT.h)) return { slot: 'hand1' };
      if (inside(x, y, WINDOW.x + HAND_RIGHT.x, WINDOW.y + HAND_RIGHT.y, HAND_RIGHT.w, HAND_RIGHT.h)) return { slot: 'hand2' };
      if (inside(x, y, WINDOW.x + ARMOR_SLOT.x, WINDOW.y + ARMOR_SLOT.y, ARMOR_SLOT.w, ARMOR_SLOT.h)) return { slot: 'armor' };
    }
    const lists: ['hero' | 'other', { x: number; y: number }][] = [['hero', LIST_HERO]];
    if (this.mode === 'loot') lists.push(['other', LIST_OTHER]);
    for (const [list, at] of lists) {
      const lx = WINDOW.x + at.x;
      const ly = WINDOW.y + at.y;
      if (!inside(x, y, lx, ly, SLOT.w, SLOT.h * ROWS)) continue;
      const index = this.scroll[list] + Math.floor((y - ly) / SLOT.h);
      if (index < this.listStacks(list).length) return { list, index };
    }
    return null;
  }
}

function inside(x: number, y: number, rx: number, ry: number, w: number, h: number): boolean {
  return x >= rx && y >= ry && x < rx + w && y < ry + h;
}
