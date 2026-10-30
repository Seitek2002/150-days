import { describe, expect, it } from 'vitest';
import type { ItemProto } from '../src/formats/pro.ts';
import { Inventory } from '../src/game/inventory.ts';

const item = (pid: number): ItemProto => ({ pid, messageId: 0, fid: 0, type: 4, weight: 1, cost: 1, inventoryFid: 0 });
const ammo = item(29);
const stim = item(40);

describe('item list', () => {
  it('identical items stack', () => {
    const inv = new Inventory();
    inv.add(ammo, 12);
    inv.add(ammo, 24);
    inv.add(stim);
    expect(inv.items.map((s) => [s.proto.pid, s.count])).toEqual([[29, 36], [40, 1]]);
  });

  it('removes no more than there is, and an empty stack disappears', () => {
    const inv = new Inventory();
    inv.add(stim, 2);
    expect(inv.remove(40, 5)).toBe(2);
    expect(inv.empty).toBe(true);
    expect(inv.remove(40)).toBe(0);
  });

  it('moves a stack and everything at once to another list', () => {
    const hero = new Inventory();
    const corpse = new Inventory();
    corpse.add(ammo, 10);
    corpse.add(stim, 1);
    expect(corpse.moveTo(hero, 29)).toBe(10);
    expect(hero.count(29)).toBe(10);
    corpse.moveAllTo(hero);
    expect(corpse.empty).toBe(true);
    expect(hero.count(40)).toBe(1);
  });
});
