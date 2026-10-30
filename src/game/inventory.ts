// A list of items: the hero's, a corpse's, later in boxes. Identical items are stacked.
import type { ItemProto } from '../formats/pro.ts';

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
