// Barter by the original's rules. The hero puts his items on the table, the trader puts his; the deal goes through if what
// the hero offers is worth no less than what the trader asks. The trader values the hero's items at their price, and his own higher: double, adjusted
// for the Barter skills (his and the hero's) and for the script's modifier (the trader's mood, a discount), in percent. Caps are at face value.
// Giving something away for free (the trader puts nothing down) is always possible.
import { ITEM_TYPE, type ItemProto } from '../formats/pro.ts';
import { Inventory, type Stack } from './inventory.ts';

/** Prototype number of caps: money, no markup. */
export const CAPS_PID = 41;
/** How many times the trader's items cost more than their price when skills are equal. */
const MARKUP = 2;
/** Base of the skills formula: at skills 0 and 160 the price differs by a factor of two. */
const SKILL_BASE = 160;
/** The price modifier never goes below this (a discount doesn't make goods free). */
const MIN_FACTOR = 0.01;

export interface BarterTerms {
  /** The Barter skill of the hero and the trader. */
  heroBarter: number;
  merchantBarter: number;
  /** Price modifier from the script, percent: −10 — a 10% discount, +25 — a quarter more expensive. */
  modifier: number;
}

const isCaps = (proto: ItemProto) => proto.pid === CAPS_PID;

/** Price of one unit. We count ammo by the round, while the prototype's price is per box: a round costs a fraction of the box. */
export function unitPrice(proto: ItemProto): number {
  if (isCaps(proto)) return 1;
  if (proto.type === ITEM_TYPE.ammo) return proto.cost / Math.max(1, proto.ammo?.quantity ?? 1);
  return proto.cost;
}

/** What the hero's items are worth to the trader: just their price (caps at face value). */
export function offerValue(stacks: readonly Stack[]): number {
  return Math.floor(stacks.reduce((sum, s) => sum + unitPrice(s.proto) * s.count, 0));
}

/** What the trader asks for his items: items with the markup from skills and the modifier, caps at face value. */
export function askValue(stacks: readonly Stack[], terms: BarterTerms): number {
  let goods = 0;
  let caps = 0;
  for (const s of stacks) {
    if (isCaps(s.proto)) caps += s.count;
    else goods += unitPrice(s.proto) * s.count;
  }
  const skills = (SKILL_BASE + terms.merchantBarter) / (SKILL_BASE + terms.heroBarter);
  const factor = Math.max(MIN_FACTOR, (100 + terms.modifier) / 100);
  return Math.floor(goods * MARKUP * skills * factor) + caps;
}

/** One barter session: the hero's and the trader's items, their tables and the terms. */
export class Trade {
  readonly heroTable = new Inventory();
  readonly merchantTable = new Inventory();
  readonly hero: Inventory;
  readonly merchant: Inventory;
  readonly terms: BarterTerms;

  constructor(hero: Inventory, merchant: Inventory, terms: BarterTerms) {
    this.hero = hero;
    this.merchant = merchant;
    this.terms = terms;
  }

  /** What the hero's offer is worth. */
  get offered(): number {
    return offerValue(this.heroTable.items);
  }

  /** What the trader asks for what he put on the table. */
  get asked(): number {
    return askValue(this.merchantTable.items, this.terms);
  }

  /** Move count units (no more than there are) from one list to another. */
  move(from: Inventory, to: Inventory, pid: number, count: number): number {
    const stack = from.items.find((s) => s.proto.pid === pid);
    if (!stack || count <= 0) return 0;
    const { proto } = stack;
    const moved = from.remove(pid, count);
    to.add(proto, moved);
    return moved;
  }

  /**
   * "Offer": deal — the items swap places; refused — the hero offered less than the trader asks;
   * nothing — the table is empty.
   */
  deal(): 'done' | 'refused' | 'nothing' {
    if (this.heroTable.empty && this.merchantTable.empty) return 'nothing';
    if (!this.merchantTable.empty && this.offered < this.asked) return 'refused';
    // Overpayment — change in caps from the trader's pocket (as much as he has; Opus decision, night 14: in the original the surplus
    // was lost, and the player lost money without noticing). A gift (the trader puts nothing down) — no change.
    const over = this.merchantTable.empty ? 0 : this.offered - this.asked;
    this.heroTable.moveAllTo(this.merchant);
    this.merchantTable.moveAllTo(this.hero);
    this.change = over > 0 ? this.move(this.merchant, this.hero, CAPS_PID, over) : 0;
    return 'done';
  }

  /** How many caps of change the trader gave in the last deal. */
  change = 0;

  /** End of barter without a deal: everything on the tables goes back to its owners. */
  cancel(): void {
    this.heroTable.moveAllTo(this.hero);
    this.merchantTable.moveAllTo(this.merchant);
  }
}
