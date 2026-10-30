// A list of items: the hero's, a corpse's, later in boxes. Identical items are stacked.
import { ITEM_TYPE, type ItemProto } from '../formats/pro.ts';

/** Ammo is half as heavy as in the original (client, 2026-10-30: ammo weighed too much and kept the hero from fighting more often). */
export const AMMO_WEIGHT = 0.5;

/**
 * Weight of count items (pounds). An ammo prototype weighs a whole box (quantity rounds) while our stacks count rounds, so one round
 * weighs box / quantity (before 2026-10-30 every round weighed as much as a whole box), then × AMMO_WEIGHT.
 */
export function stackWeight(proto: ItemProto, count: number): number {
  if (proto.type !== ITEM_TYPE.ammo) return proto.weight * count;
  return (proto.weight * AMMO_WEIGHT * count) / Math.max(1, proto.ammo?.quantity ?? 1);
}

export interface Stack {
  proto: ItemProto;
  count: number;
}

export class Inventory {
  private readonly stacks: Stack[] = [];

  /** Items in order, as in Fallout: whatever was put in earlier is higher. */
  get items(): readonly Stack[] {
    return this.stacks;
  }

  get empty(): boolean {
    return this.stacks.length === 0;
  }

  count(pid: number): number {
    return this.stacks.find((s) => s.proto.pid === pid)?.count ?? 0;
  }

  add(proto: ItemProto, count = 1): void {
    if (count <= 0) return;
    const stack = this.stacks.find((s) => s.proto.pid === proto.pid);
    if (stack) stack.count += count;
    else this.stacks.push({ proto, count });
  }

  /** Remove up to count items. Returns how many were actually removed. */
  remove(pid: number, count = 1): number {
    const index = this.stacks.findIndex((s) => s.proto.pid === pid);
    const stack = this.stacks[index];
    if (!stack) return 0;
    const taken = Math.min(count, stack.count);
    stack.count -= taken;
    if (stack.count <= 0) this.stacks.splice(index, 1);
    return taken;
  }

  /** Move a whole stack to another list. */
  moveTo(other: Inventory, pid: number): number {
    const stack = this.stacks.find((s) => s.proto.pid === pid);
    if (!stack) return 0;
    const { proto } = stack;
    const moved = this.remove(pid, stack.count);
    other.add(proto, moved);
    return moved;
  }

  moveAllTo(other: Inventory): void {
    for (const stack of [...this.stacks]) this.moveTo(other, stack.proto.pid);
  }
}
