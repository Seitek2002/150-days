// Conversations with a companion that aren't in the original (client, 2026-10-26). E on a companion first opens his menu in the dialogue
// window: "Let's talk" (the dialogue from his script), "Wait here" / "Come with me", "Keep your distance" / "closer",
// skills (the companion-sheet.ts window), "Take ammo", "Put on better armor". And the companion comes over to talk on his own:
// - skill points have stayed unspent for long — asks what to improve (or "decide yourself");
// - the hero has a gun better than his among his items, and the companion handles it better than the hero — asks for it;
// - a trader on this map (a real one: his script has barter — scripts.ts → trades) has a better gun —
//   offers to buy it (and ammo) with the hero's money at the price without markup ("from a friend, at a discount"): once a day per
//   map, whatever the answer;
// - he shot all his ammo in a fight (client, 2026-10-31) — after it asks for the hero's ammo for his gun, and if the hero has none, for
//   money to buy it himself; with money of his own he buys ammo from this map's trader on his own.
// The texts are our own (i18n.ts, "comp…"), the head in the window is the one the companion's script talks with (scripts.ts remembers it).
import { ITEM_TYPE, type ItemProto } from '../formats/pro.ts';
import type { DialogueUI } from '../script/game-functions.ts';
import { t, tf } from '../i18n.ts';
import { CAPS_PID, unitPrice } from './barter.ts';
import { isGrenade } from './combat.ts';
import { ASK_POINTS_AFTER, autoSpend, weaponScore, wieldScore } from './companion.ts';
import type { Creature } from './creature.ts';
import type { Inventory } from './inventory.ts';
import { weaponSkillIndex } from './fighter.ts';
import { ammoFits } from './hero.ts';
import { STIMS_WANTED, type PartyMember, type Session } from './session.ts';
import { declinedKey } from './scripts.ts';
import { PID } from '../world/pids.ts';

/** How many seconds on a map before the companion speaks up on his own, and how many between such conversations. */
const FIRST_OFFER = 10;
const OFFER_GAP = 45;
/** How often to check whether there's something to offer (seconds), and how close to the hero the companion must be (cells). */
const CHECK_EVERY = 3;
const OFFER_REACH = 6;
/** How much ammo the companion buys for a new gun: two magazines (no less than a box), if the trader has that much. */
const AMMO_MAGAZINES = 2;
const SAYS_COLOR = '#f0d58c';

/** A gun the companion can carry: a firearm with a magazine (not a grenade, not a knife). */
const isGun = (p: ItemProto): boolean => !!p.weapon && p.weapon.capacity > 0 && p.weapon.range > 2 && !isGrenade(p);

interface ShopDeal {
  merchant: Creature;
  /** Where the trader's goods are (his chest or his items): items come from there and money goes there. */
  stock: Inventory;
  gun: ItemProto;
  gunPrice: number;
  ammo: ItemProto | null;
  ammoCount: number;
  ammoPrice: number;
}

export interface CompanionTalkHost {
  session(): Session;
  ui: DialogueUI;
  /** Whether the companion may speak up now: the game is running, no windows or dialogues. */
  free(): boolean;
  /** The dialogue from the companion's script (like E on a critter). */
  talkScript(creature: Creature): Promise<void>;
  /** The companion's skills window; finishes when it's closed. */
  openSheet(member: PartyMember): Promise<void>;
  /** The critter's goods if he's a real trader (his script has barter): his chest or his items; none — null. */
  stock(creature: Creature): Promise<Inventory | null>;
}

export class CompanionTalk {
  private readonly host: CompanionTalkHost;
  /** Our conversation with the companion is open now. */
  busy = false;
  private mapId = '';
  private mapTime = 0;
  private since = OFFER_GAP;
  private checkWait = 0;
  private checking = false;

  constructor(host: CompanionTalkHost) {
    this.host = host;
  }

  private get session(): Session {
    return this.host.session();
  }

  /** The dialogue window with the companion's head (his script remembered it; hasn't talked yet — no head). */
  private openWindow(m: PartyMember): void {
    const vars = this.session.vars;
    this.host.ui.open(m.creature.stats.name, vars[`head:${m.kind.pid}`] ?? -1, vars[`headbg:${m.kind.pid}`] ?? -1);
  }

  /** E on a companion: the command menu. */
  async menu(creature: Creature): Promise<void> {
    const s = this.session;
    const m = s.memberOf(creature);
    if (!m) return this.host.talkScript(creature);
    // The dog doesn't talk: it only gets commands and skills, and it answers like a dog.
    const dog = m.kind.bites;
    let after: 'talk' | 'sheet' | null = null;
    this.busy = true;
    try {
      this.openWindow(m);
      let reply = t(dog ? 'compDogMenu' : 'compMenu');
      const ok = (key: Parameters<typeof t>[0]) => t(dog ? 'compDogOk' : key);
      for (;;) {
        const items: [string, () => Promise<string | null> | string | null][] = [];
        if (!dog) items.push([t('compTalk'), () => ((after = 'talk'), null)]);
        items.push(
          m.orders.wait
            ? [t('compFollow'), () => ((m.orders.wait = null), ok('compFollowOk'))]
            : [t('compWait'), () => ((m.orders.wait = { x: creature.x, y: creature.y }), ok('compWaitOk'))],
        );
        items.push(m.orders.far ? [t('compNear'), () => ((m.orders.far = false), ok('compNearOk'))] : [t('compFar'), () => ((m.orders.far = true), ok('compFarOk'))]);
        const points = s.progressOf(m).points;
        items.push([points > 0 ? tf('compSkillsPoints', { n: points }) : t('compSkills'), () => ((after = 'sheet'), null)]);
        const gift = dog ? null : this.ammoGift(m);
        if (gift) items.push([tf('compGiveAmmo', { ammo: s.res.itemName(gift.proto), n: gift.count }), () => this.giveAmmo(m, gift)]);
        const stims = dog ? 0 : Math.min(s.hero.inventory.count(PID.stimpak), STIMS_WANTED - creature.inventory.count(PID.stimpak));
        if (stims > 0) items.push([tf('compGiveStims', { n: stims }), () => this.giveStims(m, stims)]);
        if (!dog && creature.inventory.items.some((st) => st.proto.type === ITEM_TYPE.armor)) items.push([t('compArmor'), () => this.wearBest(m)]);
        // The dog can be dismissed: it stays where it is; to call it again — E on it.
        if (dog)
          items.push([
            t('compDogStay'),
            () => {
              s.vars[declinedKey(m.script?.name ?? '', m.kind.pid)] = 1;
              s.leaveParty(creature);
              return null;
            },
          ]);
        items.push([t('compBye'), () => null]);
        const choice = await this.host.ui.ask(reply, items.map(([text]) => text));
        const next = await items[choice]?.[1]();
        if (next === null || next === undefined) break;
        reply = next;
      }
    } finally {
      this.host.ui.close();
      this.busy = false;
    }
    if (after === 'talk') await this.host.talkScript(creature);
    else if (after === 'sheet') await this.host.openSheet(m);
  }

  /**
   * How much ammo to give the companion: for his best gun, whatever the hero has. If the hero shoots the same kind himself — half,
   * otherwise all.
   */
  private ammoGift(m: PartyMember): { proto: ItemProto; count: number } | null {
    const hero = this.session.hero;
    const guns = m.creature.inventory.items.map((st) => st.proto).filter(isGun).sort((a, b) => weaponScore(b) - weaponScore(a));
    for (const gun of guns) {
      const stack = hero.inventory.items.filter((st) => ammoFits(st.proto, gun.weapon!)).sort((a, b) => b.count - a.count)[0];
      if (!stack) continue;
      const own = [hero.handItem(0), hero.handItem(1)].some((h) => h?.weapon && ammoFits(stack.proto, h.weapon));
      return { proto: stack.proto, count: own ? Math.ceil(stack.count / 2) : stack.count };
    }
    return null;
  }

  private async giveAmmo(m: PartyMember, gift: { proto: ItemProto; count: number }): Promise<string> {
    const n = this.session.hero.inventory.remove(gift.proto.pid, gift.count);
    m.creature.inventory.add(gift.proto, n);
    await this.session.equipCompanion(m.creature);
    return t('compAmmoThanks');
  }

  /** Give the companion stimpaks (up to STIMS_WANTED in his inventory). */
  private async giveStims(m: PartyMember, n: number): Promise<string> {
    const s = this.session;
    const given = s.hero.inventory.remove(PID.stimpak, n);
    if (given > 0) m.creature.inventory.add(await s.res.item(PID.stimpak), given);
    return t('compStimsThanks');
  }

  private async wearBest(m: PartyMember): Promise<string> {
    const before = m.armor?.pid ?? 0;
    await this.session.equipCompanion(m.creature);
    if (!m.armor) return t('compArmorNone');
    const name = this.session.res.itemName(m.armor);
    return m.armor.pid === before ? tf('compArmorSame', { armor: name }) : tf('compArmorOn', { armor: name });
  }

  /** Every game frame: isn't it time for the companion to speak up on his own. */
  tick(dt: number): void {
    const s = this.session;
    if (s.scene.def.id !== this.mapId) {
      this.mapId = s.scene.def.id;
      this.mapTime = 0;
    }
    this.mapTime += dt;
    this.since += dt;
    this.checkWait -= dt;
    if (this.busy || this.checking || this.checkWait > 0 || !this.host.free()) return;
    if (this.mapTime < FIRST_OFFER || this.since < OFFER_GAP || s.hero.inCombat || s.hero.calmFor < 5) return;
    this.checkWait = CHECK_EVERY;
    const { player } = s;
    const m = s.party.find((p) => p.creature.alive && p.creature.present && !p.kind.bites && !p.orders.wait && Math.hypot(p.creature.x - player.x, p.creature.y - player.y) <= OFFER_REACH);
    if (!m) return;
    this.checking = true;
    void this.findOffer(m)
      .then((offer) => {
        if (!offer || !this.host.free() || s !== this.session) return;
        this.since = 0;
        this.busy = true;
        return offer().finally(() => {
          this.host.ui.close();
          this.busy = false;
        });
      })
      .catch((e) => console.error(e))
      .finally(() => {
        this.checking = false;
      });
  }

  /**
   * What the companion should say on his own (by importance): out of ammo, skill points, the hero's gun, a trader's gun. Nothing — null.
   */
  private async findOffer(m: PartyMember): Promise<(() => Promise<void>) | null> {
    const s = this.session;
    const empty = await this.emptyGun(m);
    if (empty) {
      if (m.creature.inventory.count(CAPS_PID) > 0) {
        const deal = await this.ammoShop(m, empty, m.creature.inventory.count(CAPS_PID));
        if (deal) return () => this.buyOwnAmmo(m, deal);
      }
      if (m.outOfAmmo) return () => this.askAmmo(m, empty);
    }
    const p = s.progressOf(m);
    if (p.points > 0 && p.idle >= ASK_POINTS_AFTER) return () => this.askPoints(m);
    const own = await this.bestOwned(m);
    const gun = await this.heroGunFor(m, own);
    if (gun) return () => this.askHeroGun(m, gun);
    const shopKey = `shop:${m.kind.pid}:${s.scene.def.id}`;
    if (s.companionNotes[shopKey] === s.clock.day) return null;
    const deal = await this.shopFor(m, own);
    if (deal) return () => this.askShop(m, deal, shopKey);
    return null;
  }

  /** The companion's best gun (one he can hold) that has no ammo among his items; all have ammo or there are none — null. */
  private async emptyGun(m: PartyMember): Promise<ItemProto | null> {
    const items = m.creature.inventory.items;
    let best: ItemProto | null = null;
    for (const st of items) {
      const gun = st.proto;
      if (!isGun(gun) || (best && wieldScore(gun, m.kind.fighter) <= wieldScore(best, m.kind.fighter))) continue;
      if (!(await this.session.res.canWield(m.kind.pid, gun))) continue;
      best = gun;
    }
    if (!best || items.some((st) => ammoFits(st.proto, best.weapon!))) return null;
    return best;
  }

  /** How many rounds the companion wants for a gun: two magazines, no less than a box. */
  private ammoWanted(gun: ItemProto, ammo: ItemProto | null): number {
    return AMMO_MAGAZINES * Math.max(gun.weapon!.capacity, ammo?.ammo?.quantity ?? 1);
  }

  /**
   * Out of ammo (after a fight): in the dialogue window asks for the hero's ammo for his gun; the hero has none — for money to buy it
   * himself (the price of two magazines of the gun's own ammo without markup; as much as the hero has, if less, but no less than one
   * magazine). Refused or nothing to give — doesn't ask again until he runs out the next time.
   */
  private async askAmmo(m: PartyMember, gun: ItemProto): Promise<void> {
    const s = this.session;
    m.outOfAmmo = false;
    const weapon = s.res.itemName(gun);
    const gift = this.ammoGift(m);
    if (gift && ammoFits(gift.proto, gun.weapon!)) {
      const n = Math.min(gift.count, Math.max(gun.weapon!.capacity, this.ammoWanted(gun, gift.proto)));
      this.openWindow(m);
      const choice = await this.host.ui.ask(tf('compAskAmmo', { weapon, ammo: s.res.itemName(gift.proto), n }), [tf('compAskAmmoYes', { n }), t('compAskAmmoNo')]);
      if (choice !== 0) return;
      this.says(m, await this.giveAmmo(m, { proto: gift.proto, count: n }));
      return;
    }
    const ammo = gun.weapon!.ammoPid > 0 ? await s.res.item(gun.weapon!.ammoPid).catch(() => null) : null;
    if (!ammo) return;
    const unit = unitPrice(ammo);
    const caps = s.hero.inventory.count(CAPS_PID);
    const price = Math.min(Math.ceil(unit * this.ammoWanted(gun, ammo)), caps);
    if (price < Math.ceil(unit * gun.weapon!.capacity) || price <= 0) return;
    this.openWindow(m);
    const choice = await this.host.ui.ask(tf('compAskMoney', { weapon, ammo: s.res.itemName(ammo), price }), [tf('compAskMoneyYes', { price }), t('compAskMoneyNo')]);
    if (choice !== 0) return;
    const given = s.hero.inventory.remove(CAPS_PID, price);
    if (given <= 0) return;
    m.creature.inventory.add(await s.res.item(CAPS_PID), given);
    // A trader right here — buys at once; otherwise at the first trader on the way (findOffer → buyOwnAmmo).
    const deal = await this.ammoShop(m, gun, given);
    this.host.ui.close();
    if (deal) await this.buyOwnAmmo(m, deal);
    else this.says(m, t('compMoneyThanks'));
  }

  /** Ammo for the gun from this map's traders that the companion can pay for with caps; the most rounds for the money. None — null. */
  private async ammoShop(m: PartyMember, gun: ItemProto, caps: number): Promise<ShopDeal | null> {
    const s = this.session;
    let best: ShopDeal | null = null;
    for (const c of s.scene.creatures) {
      if (!c.alive || !c.present || c.hostile || s.scene.allies.has(c)) continue;
      const stock = await this.host.stock(c);
      if (!stock) continue;
      for (const st of stock.items) {
        if (!ammoFits(st.proto, gun.weapon!)) continue;
        const unit = unitPrice(st.proto);
        const count = Math.min(st.count, this.ammoWanted(gun, st.proto), unit > 0 ? Math.floor(caps / unit) : st.count);
        if (count <= 0 || (best && count <= best.ammoCount)) continue;
        best = { merchant: c, stock, gun, gunPrice: 0, ammo: st.proto, ammoCount: count, ammoPrice: Math.ceil(unit * count) };
      }
    }
    return best;
  }

  /** The companion buys ammo with his own money: his caps go to the trader, the rounds to him. */
  private async buyOwnAmmo(m: PartyMember, deal: ShopDeal): Promise<void> {
    const s = this.session;
    if (!deal.ammo) return;
    const n = deal.stock.remove(deal.ammo.pid, deal.ammoCount);
    if (n <= 0) return;
    const price = Math.min(m.creature.inventory.count(CAPS_PID), Math.ceil(unitPrice(deal.ammo) * n));
    m.creature.inventory.add(deal.ammo, n);
    m.creature.inventory.remove(CAPS_PID, price);
    deal.stock.add(await s.res.item(CAPS_PID), price);
    await s.equipCompanion(m.creature);
    s.say(tf('msgCompanionBoughtOwn', { name: m.creature.stats.name, items: `${s.res.itemName(deal.ammo)} ×${n}`, price }));
    this.says(m, t('compBoughtOwn'));
  }

  /** How good the best gun among the companion's items is for himself (none — 0). */
  private async bestOwned(m: PartyMember): Promise<number> {
    let best = 0;
    for (const st of m.creature.inventory.items) {
      if (isGun(st.proto) && (await this.session.res.canWield(m.kind.pid, st.proto))) best = Math.max(best, wieldScore(st.proto, m.kind.fighter));
    }
    return best;
  }

  /** A gun of the hero's that is better than the companion's guns and that he handles better than the hero (not in the hero's hands). */
  private async heroGunFor(m: PartyMember, own: number): Promise<ItemProto | null> {
    const s = this.session;
    const hero = s.hero;
    let best: ItemProto | null = null;
    for (const st of hero.inventory.items) {
      const p = st.proto;
      const score = wieldScore(p, m.kind.fighter);
      if (!isGun(p) || score <= own || (best && score <= wieldScore(best, m.kind.fighter))) continue;
      if (s.companionNotes[`gun:${m.kind.pid}:${p.pid}`]) continue;
      // Without ammo for it (neither the hero nor the companion has any) there's no point asking: nothing to shoot with.
      if (![...hero.inventory.items, ...m.creature.inventory.items].some((a) => ammoFits(a.proto, p.weapon!))) continue;
      const inHands = [hero.handItem(0), hero.handItem(1)].filter((h) => h?.pid === p.pid).length;
      if (st.count - inHands <= 0) continue;
      const skill = weaponSkillIndex(p.weapon);
      if ((m.kind.fighter.skills[skill] ?? 0) <= (hero.fighter.skills[skill] ?? 0)) continue;
      if (await s.res.canWield(m.kind.pid, p)) best = p;
    }
    return best;
  }

  private async askHeroGun(m: PartyMember, gun: ItemProto): Promise<void> {
    const s = this.session;
    this.openWindow(m);
    const name = s.res.itemName(gun);
    const choice = await this.host.ui.ask(tf('compWantGun', { weapon: name }), [t('compWantGunYes'), t('compWantGunNo')]);
    if (choice !== 0) {
      s.companionNotes[`gun:${m.kind.pid}:${gun.pid}`] = 1;
      return;
    }
    if (s.hero.inventory.remove(gun.pid, 1) <= 0) return;
    m.creature.inventory.add(gun, 1);
    // Ammo for it — by the same rule as "Take ammo".
    const gift = this.ammoGift(m);
    if (gift && ammoFits(gift.proto, gun.weapon!)) {
      const n = s.hero.inventory.remove(gift.proto.pid, gift.count);
      m.creature.inventory.add(gift.proto, n);
    }
    await s.equipCompanion(m.creature);
    this.says(m, t('compWantGunThanks'));
  }

  /** The best gun among this map's traders that the hero can afford (at the price without markup), and ammo for it. */
  private async shopFor(m: PartyMember, own: number): Promise<ShopDeal | null> {
    const s = this.session;
    const caps = s.hero.inventory.count(CAPS_PID);
    if (caps <= 0) return null;
    let best: ShopDeal | null = null;
    for (const c of s.scene.creatures) {
      if (!c.alive || !c.present || c.hostile || s.scene.allies.has(c)) continue;
      const stock = await this.host.stock(c);
      if (!stock) continue;
      for (const st of stock.items) {
        const gun = st.proto;
        const score = wieldScore(gun, m.kind.fighter);
        if (!isGun(gun) || score <= own || (best && score <= wieldScore(best.gun, m.kind.fighter))) continue;
        const gunPrice = Math.ceil(unitPrice(gun));
        if (gunPrice > caps || !(await s.res.canWield(m.kind.pid, gun))) continue;
        const ammoStack = stock.items.filter((a) => ammoFits(a.proto, gun.weapon!)).sort((a, b) => b.count - a.count)[0];
        const want = AMMO_MAGAZINES * Math.max(gun.weapon!.capacity, ammoStack?.proto.ammo?.quantity ?? 1);
        const ammoCount = ammoStack ? Math.min(ammoStack.count, want) : 0;
        best = { merchant: c, stock, gun, gunPrice, ammo: ammoStack?.proto ?? null, ammoCount, ammoPrice: ammoStack ? Math.ceil(unitPrice(ammoStack.proto) * ammoCount) : 0 };
      }
    }
    return best;
  }

  private async askShop(m: PartyMember, deal: ShopDeal, key: string): Promise<void> {
    const s = this.session;
    s.companionNotes[key] = s.clock.day;
    const caps = s.hero.inventory.count(CAPS_PID);
    const weapon = s.res.itemName(deal.gun);
    const total = deal.gunPrice + deal.ammoPrice;
    const text = deal.ammo ? tf('compShop', { weapon, ammo: s.res.itemName(deal.ammo), price: total }) : tf('compShopGunOnly', { weapon, price: deal.gunPrice });
    const options: [string, boolean, boolean][] = [[t('compShopNo'), false, false]];
    if (total <= caps) options.push([t('compShopYes'), true, !!deal.ammo]);
    if (deal.ammo && deal.gunPrice <= caps) options.push([tf('compShopGun', { weapon }), true, false]);
    if (deal.ammo && deal.ammoPrice <= caps) options.push([t('compShopAmmo'), false, true]);
    this.openWindow(m);
    const choice = await this.host.ui.ask(text, options.map(([o]) => o));
    const [, gun, ammo] = options[choice] ?? options[0]!;
    if (!gun && !ammo) return;
    await this.buy(m, deal, gun, ammo);
  }

  /** Buy from a trader: the hero's money goes to the trader, the items to the companion. */
  private async buy(m: PartyMember, deal: ShopDeal, gun: boolean, ammo: boolean): Promise<void> {
    const s = this.session;
    const bought: string[] = [];
    let price = 0;
    if (gun && deal.stock.remove(deal.gun.pid, 1) > 0) {
      m.creature.inventory.add(deal.gun, 1);
      price += deal.gunPrice;
      bought.push(s.res.itemName(deal.gun));
    }
    if (ammo && deal.ammo) {
      const n = deal.stock.remove(deal.ammo.pid, deal.ammoCount);
      if (n > 0) {
        m.creature.inventory.add(deal.ammo, n);
        price += Math.ceil(unitPrice(deal.ammo) * n);
        bought.push(`${s.res.itemName(deal.ammo)} ×${n}`);
      }
    }
    if (!bought.length) return;
    s.hero.inventory.remove(CAPS_PID, price);
    deal.stock.add(await s.res.item(CAPS_PID), price);
    await s.equipCompanion(m.creature);
    s.say(tf('msgCompanionBought', { name: m.creature.stats.name, items: bought.join(', '), price }));
    this.says(m, t('compShopThanks'));
  }

  private async askPoints(m: PartyMember): Promise<void> {
    const s = this.session;
    const p = s.progressOf(m);
    this.openWindow(m);
    const choice = await this.host.ui.ask(tf('compAskPoints', { n: p.points }), [t('compAskShow'), t('compAskSelf'), t('compAskLater')]);
    p.idle = 0;
    if (choice === 0) {
      this.host.ui.close();
      await this.host.openSheet(m);
    } else if (choice === 1) {
      const gun = m.kind.weaponPid ? (await s.res.item(m.kind.weaponPid)).weapon : undefined;
      autoSpend(p, m.base ?? m.kind.fighter, gun, m.skills);
      await s.equipCompanion(m.creature);
      this.says(m, t('compAskSelfOk'));
    }
  }

  /** The companion's line above his head and in the message window. */
  private says(m: PartyMember, text: string): void {
    this.session.say(tf('msgCompanionSays', { name: m.creature.stats.name, text }));
    this.session.scene.float(m.creature, text, SAYS_COLOR);
  }
}
