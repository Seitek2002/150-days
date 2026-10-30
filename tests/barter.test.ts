// Trading by the original's rules (barter.ts), the barter panel (barter-panel.ts) and containers with critters' items from the original's maps.
import { describe, expect, it } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import { Player } from '../src/engine/player.ts';
import type { ItemProto } from '../src/formats/pro.ts';
import { askValue, CAPS_PID, offerValue, Trade, type BarterTerms } from '../src/game/barter.ts';
import type { CreatureArt } from '../src/game/creature.ts';
import { hexCenter } from '../src/game/hex.ts';
import type { Hero } from '../src/game/hero.ts';
import { Inventory } from '../src/game/inventory.ts';
import type { CritterKind, Resources } from '../src/game/resources.ts';
import type { SceneHost } from '../src/game/scene.ts';
import { t } from '../src/i18n.ts';
import type { LevelDef } from '../src/world/defs.ts';
import { MAP_SCRIPTS } from '../src/world/map-scripts.ts';

// The scene pulls in the game resources, and they pull in the platform, which needs a browser window: tests have none, so we stub an empty one.
(globalThis as { window?: unknown }).window ??= {};
const SceneClass = (await import('../src/game/scene.ts')).Scene;
const { BarterPanel } = await import('../src/game/barter-panel.ts');

const item = (pid: number, cost: number): ItemProto => ({ pid, messageId: 0, fid: 0, type: 5, weight: 1, cost, inventoryFid: 0 });
const caps = item(CAPS_PID, 1);
const rifle = item(10, 100);
const knife = item(4, 40);
const even: BarterTerms = { heroBarter: 0, merchantBarter: 0, modifier: 0 };

describe('prices', () => {
  it('the merchant buys our items at their price and sells his own at double; caps at face value', () => {
    expect(offerValue([{ proto: knife, count: 2 }, { proto: caps, count: 15 }])).toBe(95);
    expect(askValue([{ proto: rifle, count: 1 }], even)).toBe(200);
    expect(askValue([{ proto: caps, count: 30 }], even)).toBe(30);
  });

  it('our ammo is per round, the prototype price is per box', () => {
    const ammo: ItemProto = { ...item(29, 75), type: 4, ammo: { quantity: 24 } as ItemProto['ammo'] };
    expect(offerValue([{ proto: ammo, count: 24 }])).toBe(75);
    expect(offerValue([{ proto: ammo, count: 12 }])).toBe(37);
    expect(askValue([{ proto: ammo, count: 24 }], even)).toBe(150);
  });

  it('the "Barter" skills and the script modifier change the markup', () => {
    // The hero trades better (160 vs 0): half the price.
    expect(askValue([{ proto: rifle, count: 1 }], { heroBarter: 160, merchantBarter: 0, modifier: 0 })).toBe(100);
    // The merchant trades better: dearer.
    expect(askValue([{ proto: rifle, count: 1 }], { heroBarter: 0, merchantBarter: 80, modifier: 0 })).toBe(300);
    // A 10% discount from the script.
    expect(askValue([{ proto: rifle, count: 1 }], { ...even, modifier: -10 })).toBe(180);
  });
});

function trade(): Trade {
  const hero = new Inventory();
  hero.add(caps, 250);
  hero.add(knife, 1);
  const merchant = new Inventory();
  merchant.add(rifle, 1);
  merchant.add(caps, 40);
  return new Trade(hero, merchant, even);
}

describe('deal', () => {
  it('too little offered: refusal, items stay on the tables; enough: they swap places', () => {
    const tr = trade();
    tr.move(tr.merchant, tr.merchantTable, rifle.pid, 1);
    tr.move(tr.hero, tr.heroTable, caps.pid, 150);
    expect(tr.asked).toBe(200);
    expect(tr.deal()).toBe('refused');
    expect(tr.heroTable.count(caps.pid)).toBe(150);
    tr.move(tr.hero, tr.heroTable, caps.pid, 50);
    expect(tr.deal()).toBe('done');
    expect(tr.hero.count(rifle.pid)).toBe(1);
    expect(tr.hero.count(caps.pid)).toBe(50);
    expect(tr.merchant.count(caps.pid)).toBe(240);
    expect(tr.heroTable.empty && tr.merchantTable.empty).toBe(true);
  });

  it('giving away for free is allowed; an empty table does nothing; ending the trade returns everything on the tables to the owners', () => {
    const tr = trade();
    expect(tr.deal()).toBe('nothing');
    tr.move(tr.hero, tr.heroTable, knife.pid, 1);
    expect(tr.deal()).toBe('done');
    expect(tr.merchant.count(knife.pid)).toBe(1);
    tr.move(tr.merchant, tr.merchantTable, rifle.pid, 1);
    tr.move(tr.hero, tr.heroTable, caps.pid, 10);
    tr.cancel();
    expect(tr.merchant.count(rifle.pid)).toBe(1);
    expect(tr.hero.count(caps.pid)).toBe(250);
  });

  it('overpayment: change in caps from the merchant\'s pocket', () => {
    const tr = trade();
    tr.move(tr.merchant, tr.merchantTable, rifle.pid, 1);
    tr.move(tr.hero, tr.heroTable, caps.pid, 230);
    expect(tr.deal()).toBe('done');
    expect(tr.change).toBe(30);
    expect(tr.hero.count(caps.pid)).toBe(50);
    expect(tr.merchant.count(caps.pid)).toBe(240);
  });
});

describe('barter panel', () => {
  const look = { name: (p: ItemProto) => `item ${p.pid}`, image: () => null };
  // The panel top is 191 pixels above the bottom of the 640×480 screen; the first cell of the hero's list is x 102…174, y +28…+76.
  const top = 289;
  const heroSlot = { x: 120, y: top + 40 };
  const merchantSlot = { x: 480, y: top + 40 };

  it('clicking an item puts it on the table; for a stack it first asks how many', () => {
    const tr = trade();
    const panel = new BarterPanel(tr, look, 'Merchant');
    // The hero's first stack is caps (250): pick 120.
    panel.pointerUp(heroSlot.x, heroSlot.y, top);
    expect(panel.replyText()).toContain('250');
    for (const code of ['Digit1', 'Digit2', 'Digit0']) panel.key(code, false);
    panel.key('Enter', false);
    expect(tr.heroTable.count(caps.pid)).toBe(120);
    // The merchant's rifle is a single item: straight onto the table.
    panel.pointerUp(merchantSlot.x, merchantSlot.y, top);
    expect(tr.merchantTable.count(rifle.pid)).toBe(1);
    // "Offer" (Enter): too little means refusal with the price.
    panel.key('Enter', false);
    expect(panel.replyText()).toBe(t('barterRefused').replace('{asked}', '200').replace('{offered}', '120'));
  });

  it('"Talk" (Esc) goes back to the conversation, everything is returned', () => {
    const tr = trade();
    const panel = new BarterPanel(tr, look, 'Merchant');
    let closed = false;
    panel.onClose = () => {
      closed = true;
    };
    panel.pointerUp(merchantSlot.x, merchantSlot.y, top);
    panel.key('Escape', false);
    expect(closed).toBe(true);
    expect(tr.merchant.count(rifle.pid)).toBe(1);
    expect(tr.merchantTable.empty).toBe(true);
  });
});

// ---------------- containers and critters' items in the scene ----------------

const sheet: SpriteSheet = {
  fps: 10,
  actionFrame: 0,
  directions: Array.from({ length: 6 }, () => [{ width: 1, height: 1, pixels: new Uint32Array(1) }]),
  shifts: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  offsets: Array.from({ length: 6 }, () => [{ x: 0, y: 0 }]),
};
const art: CreatureArt = { stand: sheet, walk: sheet, attack: sheet, hit: sheet, death: sheet };

function fakeRes(): Resources {
  return {
    preloadLevel: async () => {},
    critterKind: async (pid: number) =>
      ({
        pid,
        stats: { name: 'Critter', maxHp: 10, ac: 0, armor: { dt: 0, dr: 0 }, skill: 30, damage: { min: 1, max: 2 }, experience: 0 },
        art,
        soundBase: '',
        bites: false,
        weapon: null,
        fighter: { special: { perception: 5 } },
      }) as unknown as CritterKind,
    item: async (pid: number) => item(pid, 1),
    groundSprite: async () => sheet,
    itemName: () => 'box',
    sound: { playAt: () => {}, play: () => {} },
  } as unknown as Resources;
}

/** A level "inspired by" central Junktown: Killian's safe (locked, a pile of his items on the floor) and Killian himself. */
const frame = { col: 184, row: 28 };
const table = MAP_SCRIPTS.JUNKKILL!;
const safe = table.containers.find(([, , , script]) => script === 'KILLSAFE')!;
const killian = table.critters.find(([, , , script]) => script === 'KILLIAN')!;
const safeAt = hexCenter(frame, safe[1]);
const killianAt = hexCenter(frame, killian[1]);
const pile = { x: Math.floor(safeAt.x) + 0.25, y: Math.floor(safeAt.y) + 0.5 };

function junkDef(): LevelDef {
  const width = 70;
  const height = 60;
  const grid = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.')).join(''),
  );
  return {
    id: 'junk-test',
    original: 'JUNKKILL',
    elevation: 0,
    hexFrame: frame,
    music: '',
    floor: 'floor',
    ceiling: 'ceiling',
    fade: 10,
    grid,
    entries: { start: { x: 3.5, y: 3.5, angle: 0 } },
    objects: [
      ...safe[5].map(([pid, count]) => ({ kind: 'item' as const, pid, x: pile.x, y: pile.y, count })),
      // Someone else's item nearby, but not in the container's pile: stays on the floor.
      { kind: 'item', pid: 999, x: pile.x + 0.5, y: pile.y },
      { kind: 'npc', pid: killian[2], x: killianAt.x, y: killianAt.y, script: 'KILLIAN', weapon: 18 },
    ],
  };
}

function host() {
  const said: string[] = [];
  const h: SceneHost = {
    res: fakeRes(),
    hero: { inventory: { count: () => 0 }, fighter: { skills: new Array(18).fill(0) }, critChance: 0 } as unknown as Hero,
    player: new Player({ x: 3.5, y: 3.5, angle: 0 }),
    clock: { seconds: 0 },
    say: (m) => void said.push(m),
  };
  return { h, said };
}

describe('containers and critters\' items', () => {
  it('the safe\'s item pile moves from the floor into the safe; the safe is locked and scripted', async () => {
    const scene = await SceneClass.create(junkDef(), host().h);
    const boxes = scene.scriptedContainers();
    const box = boxes.find((c) => c.script!.name === 'KILLSAFE')!;
    expect(box.locked).toBe(true);
    expect(box.inventory.count(CAPS_PID)).toBe(2016);
    expect(box.x).toBe(pile.x);
    // Only someone else's item is left on the floor.
    const state = scene.snapshot();
    expect(state.containers?.[box.key]).toEqual(safe[5]);
    expect(boxes.map((c) => c.script!.name).sort()).toEqual(['CRASHBOX', 'KILLSAFE', 'KILLSTOR', 'KILLSTOR', 'KILLSTOR']);
  });

  it('locked container: "locked", then pick it; once picked and emptied it stays so', async () => {
    const { h } = host();
    const scene = await SceneClass.create(junkDef(), h);
    const box = scene.scriptedContainers().find((c) => c.script!.name === 'KILLSAFE')!;
    expect(scene.operateContainer(box)).toBe(false);
    expect(box.knownLocked).toBe(true);
    scene.setDoorLocked(box, false);
    expect(scene.pickContainer(box)).toBe(true);
    box.inventory.remove(CAPS_PID, 2016);
    const again = await SceneClass.create(junkDef(), host().h, scene.snapshot());
    const same = again.scriptedContainers().find((c) => c.script!.name === 'KILLSAFE')!;
    expect(same.locked).toBe(false);
    expect(same.inventory.count(CAPS_PID)).toBe(0);
  });

  it('a critter on the first visit gets its items from the original\'s map, except the weapon in hand', async () => {
    const scene = await SceneClass.create(junkDef(), host().h);
    const k = scene.creatures[0]!;
    for (const [pid, count] of killian[4]) expect(k.inventory.count(pid), `pid ${pid}`).toBe(pid === 18 ? count - 1 : count);
  });
});
