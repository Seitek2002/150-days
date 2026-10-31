// A session is one playthrough: the hero, time, the state of all maps the hero has visited, and transitions between maps.
// A game save is the session written to JSON (src/game/save.ts).
import { openFacing } from '../engine/level.ts';
import { Player } from '../engine/player.ts';
import { getLang, t, tf, type StringKey } from '../i18n.ts';
import type { Destination, LevelDef } from '../world/defs.ts';
import { LEVELS, NEW_GAME } from '../world/levels/index.ts';
import { Clock, WATER_DAYS } from './clock.ts';
import { waterDays } from './endings.ts';
import { derivedStats, SKILL, skillLevel, TRAIT, type Character } from './character.ts';
import { ammoFits, healTicks, Hero } from './hero.ts';
import type { Resources } from './resources.ts';
import { emptyMapState, SAVE_VERSION, type CreatedObject, type MapState, type SaveData, type SavedPartyMember } from './save.ts';
import { activeVariants } from '../world/location-variants.ts';
import { Creature } from './creature.ts';
import { CRIPPLE, isGrenade, isThrownWeapon } from './combat.ts';
import { combineEffects, drugEffects, withdrawalDeltas, WITHDRAWAL_SECONDS, type Addiction, POISON_TICK, RADIATION_DEATH, RADIATION_LEVELS, radiationLevel, STAT_CURRENT_HP, STAT_POISON_LEVEL, STAT_RADIATION_LEVEL } from './conditions.ts';
import type { ItemProto } from '../formats/pro.ts';
import type { CritterKind } from './resources.ts';
import { QUEST_READY } from './quests.ts';
import { Scene, type AllyOrders, type SceneHost } from './scene.ts';
import { addCompanionXp, ASK_POINTS_AFTER, autoSpend, bestArmor, BEAST_SKILLS, grownKind, progressFrom, refundUnusable, usableSkills, wieldScore, type CompanionProgress } from './companion.ts';
import { healsHp, type Fighter } from './fighter.ts';
import { isScriptTimer, type ScriptTimer } from './script-timers.ts';
import { CURSE, SQUARE_CELLS, WASTELAND, wastelandWindow, windowOrigin } from '../world/wasteland.ts';
import { PID } from '../world/pids.ts';
import { placePoint, readTarget, travelHours, writeTarget, type TravelTarget } from './travel.ts';
import { PLACES, type PlaceKey, type Square } from '../world/worldmap.ts';
import { crewSpot, tripRoute, type CaravanTrip } from './caravan.ts';
import { placeDose, protectedDose, radiationField, type RadSpot } from './radiation.ts';

const MAX_MESSAGES = 100;
/**
 * Drug traits (client, 2026-10-27; as in the original description): "Chem Reliant" gets addicted twice as often, but also
 * recovers twice as fast; "Chem Resistant" gets addicted half as often, but drugs last half as long.
 */
export const CHEM = { reliantAddicts: 2, reliantRecovers: 0.5, resistantAddicts: 0.5, resistantLasts: 0.5 } as const;
/** How many times more often (above 1) or less often the hero gets addicted to a drug (CHEM). */
export function addictionFactor(traits: readonly number[]): number {
  return (traits.includes(TRAIT.chemReliant) ? CHEM.reliantAddicts : 1) * (traits.includes(TRAIT.chemResistant) ? CHEM.resistantAddicts : 1);
}
/** How many milliseconds the big caption stays up (announce). */
const BANNER_MS = 9000;
/** Numbers of companion critters built from a save (they don't overlap with map numbers). */
let partyId = 2_000_000;

/** The hero's companion: the critter, his kind, script and where he comes from. */
export interface PartyMember {
  creature: Creature;
  kind: CritterKind;
  script: { name: string; key: string } | null;
  origin: { map: string; key: string } | null;
  /** Orders to the companion ("wait here", "keep your distance"); waiting — only on this map. */
  orders: AllyOrders;
  /** A companion without leveling: skills from the prototype (growth is added to them — companion.ts). */
  base?: Fighter;
  /** Worn armor (the best among his items). */
  armor?: ItemProto | null;
  /** Skills that will be useful to him (by the weapons he can hold — companion.ts → usableSkills). */
  skills?: readonly number[];
  /** Shot all his ammo and said so: in a dialogue with him — "Take some ammo". */
  outOfAmmo?: boolean;
  /** Was in a fight: once everything is quiet — will bandage himself (First Aid). */
  fought?: boolean;
  /** Whether he had drugs last frame and whether he has already asked for stimpaks (asks when they run out). */
  hadStims?: boolean;
  stimsAsked?: boolean;
}
/** How many stimpaks a companion who has run out asks for (client, 2026-10-26). */
export const STIMS_WANTED = 3;
/** How many seconds of quiet after a fight before a companion bandages his wounds. */
const AID_CALM = 6;
/** Wounds heal once every this many game seconds (6 hours — as in the original) by the hero's "healing rate". */
const HEAL_PERIOD = 6 * 3600;

export class Session implements SceneHost {
  readonly res: Resources;
  readonly hero: Hero;
  readonly player: Player;
  readonly clock: Clock;
  readonly messages: string[] = [];
  /**
   * How many messages have been said in total (always grows; the length of messages is capped at MAX_MESSAGES): it shows
   * whether a script said something.
   */
  spoken = 0;
  /** Script variables: plot, maps and NPCs. */
  readonly vars: Record<string, number>;
  /** Delayed script events. */
  readonly timers: ScriptTimer[];
  /** State of maps the hero has already visited (except the current one — it lives in scene). */
  private readonly maps: Record<string, MapState>;
  scene!: Scene;
  /** The hero in the wasteland: around which world map square the window is built, and the marks of its animals. */
  wasteland: { center: Square; tags: string[] } | null = null;
  /** Up to which game second the wounds have already healed (see naturalHealing). */
  private healedAt: number;
  /** Companions: they go with the hero from map to map. */
  readonly party: PartyMember[] = [];
  /** Companions' growth by critter PID (including those not in the party now: if they come back, the growth is still theirs). */
  readonly companions = new Map<number, CompanionProgress>();
  /** What companions have already offered and what the hero answered (companion-talk.ts): the key is a number (day, PID, etc.). */
  companionNotes: Record<string, number> = {};
  /**
   * NPCs that a script moves to another floor of the same map following the hero (Garl takes the hero to the arena): they will come
   * there along with him (to — level, at and tile — where to stand) and will stay there as NPCs.
   */
  private carried: (PartyMember & { to: string; at: { x: number; y: number }; tile: number })[] = [];
  /** The hero is walking with a caravan (src/game/caravan.ts); null — not walking. */
  caravan: CaravanTrip | null = null;
  /** The caravan's people and brahmin in the wasteland — in formation order (caravan.members); dead or not yet appeared — null. */
  crew: ({ creature: Creature; kind: CritterKind } | null)[] = [];
  /** Drugs: active modifiers and delayed ones (withdrawal) by game time. */
  private drugMods: Record<number, number> = {};
  private drugQueue: { at: number; deltas: [number, number][] }[] = [];
  /** When poison last took health (game seconds). */
  private poisonAt = 0;
  /** The last known radiation level (for a log line when it changes). */
  private radLevel = -1;
  /** Our radiation dose that hasn't reached a whole number yet (exposure is counted in whole units). */
  private radCarry = 0;
  /** What the hero died of: from radiation — the death screen has its own text. */
  killedBy: 'radiation' | null = null;
  /** How many more seconds the hero's lit flare burns (0 — not lit); it burns out in play.ts. */
  flare = 0;
  /** Drug addictions. */
  private addictions: Addiction[] = [];

  private constructor(res: Resources, hero: Hero, clock: Clock, maps: Record<string, MapState>, vars: Record<string, number>, timers: ScriptTimer[] = []) {
    this.res = res;
    this.hero = hero;
    this.clock = clock;
    this.maps = maps;
    this.vars = vars;
    this.timers = timers;
    this.healedAt = clock.seconds;
    hero.findAmmo = (pid) => res.item(pid);
    this.player = new Player({ x: 0, y: 0, angle: 0 });
  }

  /**
   * A new playthrough with hero `character`. Items at the start of the game are given by the original's cave script (V13CAVE) based on tag skills;
   * on the test range there is no script — there it's a pistol, ammo and a stimpak.
   */
  static async newGame(res: Resources, start: Destination = NEW_GAME, character?: Character): Promise<Session> {
    const { loadout } = res;
    const hero = new Hero(loadout, character);
    if (start !== NEW_GAME) {
      hero.inventory.add(loadout.weapon, 1);
      hero.inventory.add(loadout.ammo, loadout.weapon.weapon.capacity);
      hero.inventory.add(loadout.stimpak, 1);
    }
    // As in the original: Vault 13 is home, the Overseer tells about Vault 15 right away.
    const session = new Session(res, hero, new Clock(), {}, { 'place:vault13': 2, 'place:vault15': 1 });
    // Quest news from the first minute (the water chip is announced first).
    session.vars[QUEST_READY] = 1;
    await session.enter(start);
    if (start === NEW_GAME) session.say(t('msgStart'));
    return session;
  }

  static async fromSave(res: Resources, data: SaveData): Promise<Session> {
    const hero = new Hero(res.loadout, data.hero.character);
    hero.hp = data.hero.hp;
    hero.experience = data.hero.experience;
    hero.kills = data.hero.kills;
    hero.restoreWeapons(data.hero.held, data.hero.magazines ?? [[res.loadout.weapon.pid, data.hero.magazine]], data.hero.hand1 ?? null, data.hero.activeHand ?? 1, data.hero.loadedAmmo ?? []);
    for (const [pid, count] of data.hero.inventory) hero.inventory.add(await res.item(pid), count);
    // Earlier the hero always had the pistol and it wasn't in the inventory.
    if (!data.hero.weaponInInventory) hero.inventory.add(res.loadout.weapon, 1);
    if (data.hero.worn) hero.wear(await res.item(data.hero.worn));
    const timers = (data.timers ?? []).filter(isScriptTimer).map((timer) => ({ ...timer }));
    const session = new Session(res, hero, Clock.from(data.clock), { ...data.maps }, { ...data.vars }, timers);
    session.addictions = (data.addictions ?? []).map((a) => ({ ...a, deltas: a.deltas.map(([s, n]) => [s, n] as [number, number]) }));
    if (data.drugs) {
      session.drugMods = { ...data.drugs.mods };
      session.drugQueue = data.drugs.queue.map((q) => ({ at: q.at, deltas: q.deltas.map(([s, n]) => [s, n] as [number, number]) }));
    }
    session.radLevel = radiationLevel(session.vars['pc:radiation'] ?? 0);
    hero.crippledArm = session.vars['pc:crippledArm'] !== undefined;
    hero.crippledLeg = session.vars['pc:crippledLeg'] !== undefined;
    hero.armLeft = session.vars['pc:crippledArmLeft'] !== undefined;
    hero.legLeft = session.vars['pc:crippledLegLeft'] !== undefined;
    session.poisonAt = session.clock.seconds;
    session.flare = data.flare ?? 0;
    for (const [pid, progress] of Object.entries(data.companions ?? {})) session.companions.set(Number(pid), progressFrom(progress));
    session.companionNotes = { ...data.companionNotes };
    const savedHp = new Map<Creature, number>();
    for (const m of data.party ?? []) {
      const kind = await res.critterKind(m.pid, m.weaponPid);
      const creature = new Creature(partyId++, data.player.x, data.player.y, kind.stats, kind.art, false, undefined, kind.weapon);
      savedHp.set(creature, m.hp);
      for (const [pid, count] of m.inventory) creature.inventory.add(await res.item(pid), count);
      session.party.push({ creature, kind, script: m.script, origin: m.origin, orders: { wait: null, far: !!m.far } });
      await session.handsToInventory(creature, kind);
    }
    session.caravan = data.caravan ? { ...data.caravan, members: data.caravan.members.map((m) => ({ ...m })) } : null;
    await session.enter({ map: data.map, entry: '' }, data.player);
    for (const m of session.party) {
      await session.equipCompanion(m.creature);
      // Health — after growth: the maximum is for a companion with more levels than in the prototype.
      m.creature.hp = Math.max(1, Math.min(m.creature.stats.maxHp, savedHp.get(m.creature) ?? m.creature.hp));
    }
    return session;
  }

  /** Big caption in the middle of the screen (the queen's curse): the text and until what time (ms, performance.now) to show it. */
  banner: { text: string; until: number } | null = null;

  /** Say it so it can't be missed: to the message window and big in the middle of the screen for BANNER_MS. */
  announce(message: string): void {
    this.say(message);
    this.banner = { text: message, until: performance.now() + BANNER_MS };
  }

  say(message: string): void {
    this.spoken++;
    this.messages.push(message);
    if (this.messages.length > MAX_MESSAGES) this.messages.shift();
  }

  /** The current map's name in the game language. */
  mapTitle(def: LevelDef = this.scene.def): string {
    return def.title?.[getLang()] ?? def.id;
  }

  /**
   * Take a drug from the inventory (as in the original — by its data): health, poison and radiation change at once,
   * the rest are stat modifiers; delayed modifiers (withdrawal) come after some game time.
   */
  takeDrug(proto: ItemProto): boolean {
    const drug = proto.drug;
    if (!drug || !this.hero.inventory.remove(proto.pid)) return false;
    const fx = drugEffects(drug);
    const hp0 = this.hero.hp;
    const traits = this.hero.character.traits;
    this.applyDeltas(fx.now);
    // "Chem Resistant": the effect ends twice as fast (delayed modifiers — earlier).
    const lasting = traits.includes(TRAIT.chemResistant) ? CHEM.resistantLasts : 1;
    // By the body clock: in locations where the calendar stands still, the drug wears off too.
    for (const l of fx.later) this.drugQueue.push({ at: this.clock.body + l.after * lasting, deltas: l.deltas });
    this.say(tf('msgDrugTaken', { name: this.res.itemName(proto) }) + (this.hero.hp > hp0 ? ' ' + tf('msgHpGain', { n: this.hero.hp - hp0 }) : ''));
    // Addiction: already addicted — the dose removes the withdrawal and postpones it; not — may get addicted (chance from the drug data).
    const onset = (drug.withdrawalOnset ?? 0) * 60;
    const known = this.addictions.find((a) => a.drugPid === proto.pid);
    if (known) known.withdrawalAt = this.clock.body + onset;
    else if (drug.addictionChance && drug.withdrawalEffect !== undefined && drug.withdrawalEffect >= 0 && Math.random() * 100 < drug.addictionChance * addictionFactor(traits)) {
      const deltas = withdrawalDeltas(fx.now);
      this.addictions.push({ drugPid: proto.pid, perk: drug.withdrawalEffect, withdrawalAt: this.clock.body + onset, deltas });
      this.say(tf('msgAddicted', { name: this.res.itemName(proto) }));
    }
    this.updateConditions();
    return true;
  }

  private applyDeltas(deltas: [number, number][]): void {
    const { hero, vars } = this;
    for (const [stat, n] of deltas) {
      if (stat === STAT_CURRENT_HP) hero.hp = Math.max(1, Math.min(hero.maxHp, hero.hp + n));
      else if (stat === STAT_POISON_LEVEL) vars['pc:poison'] = Math.max(0, (vars['pc:poison'] ?? 0) + n);
      else if (stat === STAT_RADIATION_LEVEL) vars['pc:radiation'] = Math.max(0, (vars['pc:radiation'] ?? 0) + n);
      else this.drugMods[stat] = (this.drugMods[stat] ?? 0) + n;
    }
  }

  /**
   * The hero's conditions every frame: delayed drug effects, poison (every 10 game minutes −1 health, and it weakens),
   * radiation (levels take away stats, at 1000 — death). Modifiers go into the character (statEffects).
   */
  /**
   * Crippled arm and leg (combat.ts → CRIPPLE): when they were crippled — in variables (pc:crippledArm, pc:crippledLeg,
   * game seconds; that way they get into the save), after a day of game time they heal by themselves. Healed by "Doctor" —
   * the mark is cleared.
   */
  private updateLimbs(): void {
    const { hero, clock, vars } = this;
    for (const [limb, key, healed, side] of [
      ['crippledArm', 'pc:crippledArm', 'msgArmHealed', 'armLeft'],
      ['crippledLeg', 'pc:crippledLeg', 'msgLegHealed', 'legLeft'],
    ] as const) {
      const since = vars[key];
      // Which one is broken (the left) — also in variables, so it gets into the save.
      const sideKey = `${key}Left`;
      if (!hero[limb]) {
        if (since !== undefined) delete vars[key];
        delete vars[sideKey];
        continue;
      }
      if (hero[side]) vars[sideKey] = 1;
      else delete vars[sideKey];
      if (since === undefined) vars[key] = clock.seconds;
      else if (clock.seconds - since >= CRIPPLE.heals) {
        hero[limb] = false;
        delete vars[key];
        delete vars[sideKey];
        this.say(t(healed));
      }
    }
  }

  updateConditions(): void {
    const { hero, clock, vars } = this;
    for (let i = this.drugQueue.length - 1; i >= 0; i--) {
      const q = this.drugQueue[i]!;
      if (q.at > clock.body) continue;
      this.drugQueue.splice(i, 1);
      this.applyDeltas(q.deltas);
    }
    const poison = vars['pc:poison'] ?? 0;
    if (poison <= 0) this.poisonAt = clock.seconds;
    else if (clock.seconds - this.poisonAt >= POISON_TICK) {
      const ticks = Math.min(poison, Math.floor((clock.seconds - this.poisonAt) / POISON_TICK));
      this.poisonAt += ticks * POISON_TICK;
      vars['pc:poison'] = poison - ticks;
      if (hero.alive) {
        hero.takeDamage(ticks);
        this.say(tf('msgPoisonHurt', { n: ticks }));
      }
    }
    this.updateLimbs();
    const rads = vars['pc:radiation'] ?? 0;
    const level = radiationLevel(rads);
    if (level !== this.radLevel) {
      if (level > this.radLevel && level >= 0) this.say(t(RADIATION_LEVELS[level]!.key as StringKey));
      else if (level < this.radLevel) this.say(t('radBetter'));
      this.radLevel = level;
    }
    // An immortal hero (testing) isn't killed by radiation — and doesn't write about it every frame.
    if (rads >= RADIATION_DEATH && hero.alive && !hero.immortal) {
      this.say(t('radDeath'));
      this.killedBy = 'radiation';
      hero.takeDamage(hero.hp);
    }
    // The Vault's water supply is a plot variable (a water caravan from the Hub increases it); the Pip-Boy counts by the clock.
    this.clock.extraDays = waterDays(vars) - WATER_DAYS;
    // Withdrawal: no dose for longer than the term — stats are lower; a week without a dose — the addiction is gone.
    const mods = { ...this.drugMods };
    for (let i = this.addictions.length - 1; i >= 0; i--) {
      const a = this.addictions[i]!;
      if (clock.body < a.withdrawalAt) continue;
      if (clock.body >= a.withdrawalAt + WITHDRAWAL_SECONDS * (hero.character.traits.includes(TRAIT.chemReliant) ? CHEM.reliantRecovers : 1)) {
        this.addictions.splice(i, 1);
        this.say(t('msgAddictionGone'));
        continue;
      }
      for (const [stat, n] of a.deltas) mods[stat] = (mods[stat] ?? 0) + n;
    }
    const effects = combineEffects(mods, rads);
    const now = hero.character.statEffects ?? {};
    if (JSON.stringify(effects) !== JSON.stringify(now)) hero.setCharacter({ ...hero.character, statEffects: effects });
  }

  /** Where the hero is — for radiation (src/game/radiation.ts): map, cell, in the wasteland — the window corner. */
  radSpot(): RadSpot {
    const { player } = this;
    return { map: this.scene.def.id, x: player.x, y: player.y, origin: this.wasteland ? windowOrigin(this.wasteland.center) : null };
  }

  /** Radiation strength where the hero is: 0 — none, 1 — like at the bottom of the Glow. */
  radiationField(): number {
    return radiationField(this.radSpot());
  }

  /**
   * dt seconds of game time in radiation: our dose (at the Glow in the wasteland, at the bottom of the Glow; map scripts irradiate by themselves) — with the hero's
   * protection: with Rad-X there is no dose of ours at the bottom of the Glow.
   */
  irradiate(dt: number, field = this.radiationField()): void {
    const dose = placeDose(this.radSpot(), field);
    if (dose <= 0 || !this.hero.alive) return;
    this.radCarry += protectedDose(dose, derivedStats(this.hero.character).radiationResistance) * dt;
    const whole = Math.floor(this.radCarry);
    if (whole <= 0) return;
    this.radCarry -= whole;
    this.vars['pc:radiation'] = (this.vars['pc:radiation'] ?? 0) + whole;
  }

  /** The hero's addictions (for the character screen): the perk number and whether withdrawal is on. */
  addictionList(): { perk: number; withdrawal: boolean }[] {
    return this.addictions.map((a) => ({ perk: a.perk, withdrawal: this.clock.body >= a.withdrawalAt }));
  }

  /** An NPC becomes a companion (party_add): follows the hero, hits his enemies, moves with him from map to map. */
  joinParty(creature: Creature): boolean {
    if (this.party.some((m) => m.creature === creature)) return false;
    const kind = this.scene.kindOfCreature(creature);
    if (!kind || !creature.alive) return false;
    const key = this.scene.keyOfCreature(creature);
    const member: PartyMember = { creature, kind, script: this.scene.scriptOf(creature), origin: key ? { map: this.scene.def.id, key } : null, orders: { wait: null, far: false } };
    this.party.push(member);
    this.scene.setAlly(creature, true);
    this.scene.orders.set(creature, member.orders);
    this.say(tf('msgJoined', { name: creature.stats.name }));
    // From now on — ammo from his own items and his own best weapon (what was in his hands is in the items too).
    void this.handsToInventory(creature, kind).then(() => this.equipCompanion(creature));
    return true;
  }

  /**
   * In the original the weapon an NPC holds is not in his items. For a companion it is put into the items (once —
   * on joining the party and for old saves): it is visible with "Steal", it can be taken or replaced.
   */
  private async handsToInventory(creature: Creature, kind: CritterKind): Promise<void> {
    if (kind.weaponPid && creature.inventory.count(kind.weaponPid) === 0) creature.inventory.add(await this.res.item(kind.weaponPid), 1);
  }

  /** Whether this is a companion now (walking with the hero). */
  isCompanion(creature: Creature): boolean {
    return this.party.some((m) => m.creature === creature && creature.alive);
  }

  /**
   * A companion takes the best weapon from his items (the hero gives them to him with "Steal", client task 2026-10-23):
   * a firearm with ammo for it — the best for him by damage, magazine and his skill (companion.ts → wieldScore);
   * none — a thrown one, then melee; none of those either — fists. What he can't hold (Ian — a rifle) he doesn't take.
   * Shoots ammo from his items; he takes stimpaks from his items himself when wounded. Animals don't take weapons.
   */
  async equipCompanion(creature: Creature): Promise<void> {
    const m = this.party.find((p) => p.creature === creature);
    if (!m) return;
    // The dog takes no weapons or armor — only growth (health, the bite skill).
    if (m.kind.bites) {
      const plain = await this.res.critterKind(m.kind.pid, 0);
      m.base = plain.fighter;
      const kind = grownKind(plain, this.progressOf(m), null);
      creature.rearm(null, kind.art, null, kind.stats);
      m.kind = kind;
      this.scene.setKind(creature, kind);
      return;
    }
    const inv = creature.inventory;
    // Takes only what he can hold (there are pictures with this weapon); thrown weapons and brass knuckles — everyone.
    const codes = await this.res.wieldCodes(m.kind.pid);
    m.skills = usableSkills(codes, false);
    // Points spent on what he won't need (Ian — "Big Guns") are returned for distribution.
    const back = refundUnusable(this.progressOf(m), m.skills);
    if (back > 0) this.say(tf('msgCompanionRefund', { name: creature.stats.name, n: back }));
    const holds = (p: ItemProto) => isThrownWeapon(p.weapon) || (p.weapon?.animationCode ?? 0) === 0 || codes.has(p.weapon?.animationCode ?? 0);
    const weapons = inv.items.map((s) => s.proto).filter((p) => p.weapon && !isGrenade(p) && holds(p));
    const average = (p: ItemProto) => ((p.weapon?.minDamage ?? 0) + (p.weapon?.maxDamage ?? 0)) / 2;
    // Ammo — any of the same caliber that is in the items (takes the one he has most of).
    const ammoFor = (p: ItemProto) => inv.items.filter((s) => ammoFits(s.proto, p.weapon!)).sort((a, b) => b.count - a.count)[0]?.proto ?? null;
    const ranged = weapons.filter((p) => p.weapon!.capacity > 0 && p.weapon!.range > 2 && ammoFor(p));
    const melee = weapons.filter((p) => p.weapon!.capacity <= 0 && p.weapon!.range <= 2);
    // Thrown (knife, rock) — after guns: throws them one at a time from the items; ran out — a knife in hand or fists.
    const thrown = weapons.filter((p) => isThrownWeapon(p.weapon));
    const best =
      [...ranged].sort((a, b) => wieldScore(b, m.kind.fighter) - wieldScore(a, m.kind.fighter))[0] ??
      [...thrown].sort((a, b) => average(b) - average(a))[0] ??
      [...melee].sort((a, b) => average(b) - average(a))[0] ??
      null;
    const plain = await this.res.critterKind(m.kind.pid, best?.pid ?? 0);
    // Companion growth and the best armor from his items (companion.ts).
    m.base = plain.fighter;
    m.armor = bestArmor(inv.items.map((s) => s.proto));
    const kind = grownKind(plain, this.progressOf(m), m.armor, best?.weapon);
    const ammo = best && ranged.includes(best) ? ammoFor(best) : best && thrown.includes(best) ? best : null;
    creature.rearm(kind.weapon, kind.art, ammo, kind.stats);
    if (creature.ranged) m.outOfAmmo = false;
    m.kind = kind;
    this.scene.setKind(creature, kind);
  }

  /** Companion growth (created on first access). */
  progressOf(m: PartyMember): CompanionProgress {
    let p = this.companions.get(m.kind.pid);
    if (!p) {
      p = progressFrom(undefined);
      this.companions.set(m.kind.pid, p);
    }
    return p;
  }

  /** The party companion by critter (none — null). */
  memberOf(creature: Creature): PartyMember | null {
    return this.party.find((m) => m.creature === creature) ?? null;
  }

  /**
   * XP to the party (client, 2026-10-26): the hero and each living companion get it in full, whoever killed the enemy or
   * completed the quest. Returns what the hero got.
   */
  shareExperience(points: number): { gained: number; levels: number } {
    const result = this.hero.addExperience(points);
    for (const m of this.party) {
      if (!m.creature.alive) continue;
      const levels = addCompanionXp(this.progressOf(m), points, (m.base ?? m.kind.fighter).special);
      if (levels <= 0) continue;
      const p = this.progressOf(m);
      this.say(tf('msgCompanionLevel', { name: m.creature.stats.name, level: p.level, points: p.points }));
      void this.equipCompanion(m.creature);
    }
    return result;
  }

  /**
   * Died in combat (the scene). The deathclaw queen (client, 2026-10-27): her blood on the hero's hands — he is cursed, and deathclaws
   * now follow his trail across the whole wasteland (play.ts → roadEvent, caravan — caravanStep).
   */
  creatureKilled(_creature: Creature, pid: number): void {
    if (pid !== PID.motherDeathclaw || (this.vars[CURSE.variable] ?? 0) > 0) return;
    this.vars[CURSE.variable] = 1;
    this.announce(t('msgClawCurse'));
  }

  /**
   * A companion has shot all his ammo: takes another weapon from his items (one with ammo; none — a knife, none of that either —
   * fists) and says so. Completely out of ammo — only shouts about it: after the fight he comes to ask for ammo (or money for it) in the
   * dialogue window (companion-talk.ts → askAmmo; client, 2026-10-31: a request should not be just a line of text).
   */
  async companionRanOut(creature: Creature): Promise<void> {
    const m = this.memberOf(creature);
    if (!m) return;
    const before = m.kind.weaponPid;
    await this.equipCompanion(creature);
    const name = creature.stats.name;
    const now = m.kind.weaponPid ? await this.res.item(m.kind.weaponPid) : null;
    let text: string;
    const gunBefore = before ? await this.res.item(before) : null;
    if (creature.ranged && now) text = tf('compSwitchGun', { weapon: this.res.itemName(now) });
    else if (isThrownWeapon(gunBefore?.weapon)) {
      // Out of thrown weapons: doesn't ask for ammo — after the fight he picks up what he threw himself.
      text = now ? tf('compNoKnivesMelee', { weapon: this.res.itemName(now) }) : t('compNoKnives');
    } else {
      text = t('compOutOfAmmo');
      if (now) text += ' ' + tf('compTakeMelee', { weapon: this.res.itemName(now) });
      m.outOfAmmo = true;
    }
    this.say(tf('msgCompanionSays', { name, text }));
    this.scene.float(creature, text, '#f0d58c');
  }

  /**
   * Companions every game frame: accumulate time with unspent points (they'll ask themselves — companion-talk.ts) and after a fight
   * bandage themselves with "First Aid", like the hero: a skill check, 1–10 health, no more than three times a day.
   */
  tickCompanions(dt: number): void {
    const calm = !this.hero.inCombat && this.hero.calmFor >= AID_CALM;
    for (const m of this.party) {
      const c = m.creature;
      if (!c.alive) continue;
      const p = this.progressOf(m);
      if (p.points > 0 && calm) p.idle += dt;
      // The dog can't ask: if the points haven't been spent for a long time, he puts them into his teeth himself.
      if (m.kind.bites) {
        if (p.points > 0 && p.idle >= ASK_POINTS_AFTER) {
          autoSpend(p, m.base ?? m.kind.fighter, undefined, BEAST_SKILLS);
          p.idle = 0;
          this.say(tf('msgCompanionSelfSpent', { name: c.stats.name }));
          void this.equipCompanion(c);
        }
        continue;
      }
      // Out of drugs (or wounded with none) — asks the hero for three stimpaks; once given, he may ask again.
      const hasStims = c.inventory.items.some((st) => healsHp(st.proto.drug));
      if (hasStims) m.stimsAsked = false;
      else if (!m.stimsAsked && (m.hadStims || c.hp < c.stats.maxHp / 2)) {
        m.stimsAsked = true;
        const text = tf('compNoStims', { n: STIMS_WANTED });
        this.say(tf('msgCompanionSays', { name: c.stats.name, text }));
        this.scene.float(c, text, '#f0d58c');
      }
      m.hadStims = hasStims;
      if (c.hostile || this.hero.inCombat) m.fought = true;
      if (!m.fought || !calm) continue;
      m.fought = false;
      // The fight is over — picks up thrown knives and takes them in hand again.
      const picked = c.takeThrown();
      if (picked) {
        c.inventory.add(picked.item, picked.count);
        this.say(tf('msgCompanionPickup', { name: c.stats.name, item: this.res.itemName(picked.item), n: picked.count }));
        void this.equipCompanion(c);
      }
      if (c.hp >= c.stats.maxHp) continue;
      const key = `comp:${m.kind.pid}:aid`;
      if (this.vars[`${key}:day`] !== this.clock.day) {
        this.vars[`${key}:day`] = this.clock.day;
        this.vars[`${key}:n`] = 0;
      }
      if ((this.vars[`${key}:n`] ?? 0) >= 3) continue;
      this.vars[`${key}:n`] = (this.vars[`${key}:n`] ?? 0) + 1;
      const skill = Math.min(95, m.kind.fighter.skills[SKILL.firstAid] ?? 0);
      if (Math.random() * 100 < skill) {
        const heal = Math.min(c.stats.maxHp - c.hp, 1 + Math.floor(Math.random() * 10));
        c.hp += heal;
        this.say(tf('msgCompanionAid', { name: c.stats.name, hp: heal }));
      } else this.say(tf('msgCompanionAidFail', { name: c.stats.name }));
    }
  }

  /**
   * Items of a container on another map the hero has already visited (its state in memory): [PID, count] — a script may take and put
   * (Garl returns the hero's items from the chest in the camp when the duel on the arena is over). The map wasn't visited — null.
   */
  storedContainer(levelId: string, key: string): [number, number][] | null {
    const state = this.maps[levelId];
    if (!state) return null;
    return ((state.containers ??= {})[key] ??= []);
  }

  /** A script moves an NPC to level to (another floor of this map), where the hero also goes: the NPC will go with him. */
  carryAlong(creature: Creature, to: string, at: { x: number; y: number }, tile: number): boolean {
    const kind = this.scene.kindOfCreature(creature);
    if (!kind || !creature.alive) return false;
    if (this.carried.some((m) => m.creature === creature)) return true;
    const key = this.scene.keyOfCreature(creature);
    this.carried.push({ creature, kind, script: this.scene.scriptOf(creature), origin: key ? { map: this.scene.def.id, key } : null, orders: { wait: null, far: false }, to, at, tile });
    return true;
  }

  /** A companion leaves (party_remove): stays where he stands. */
  leaveParty(creature: Creature): boolean {
    const i = this.party.findIndex((m) => m.creature === creature);
    if (i < 0) return false;
    const [m] = this.party.splice(i, 1);
    this.scene.setAlly(creature, false);
    // Left not on his own map — stays an NPC of this one (otherwise he would vanish on save and return).
    if (m && m.origin?.map !== this.scene.def.id) this.scene.settle(creature, m.kind, m.script);
    if (creature.alive) this.say(tf('msgLeft', { name: creature.stats.name }));
    return true;
  }

  /** Companions came with the hero to a new map or a new wasteland window; the dead stay where they fell. */
  private bringParty(): void {
    // Unconscious (wasteland) — comes to and goes with the hero; the dead stay.
    for (const m of this.party) m.creature.wake();
    for (let i = this.party.length - 1; i >= 0; i--) if (!this.party[i]!.creature.alive) this.party.splice(i, 1);
    for (const m of this.party) {
      this.scene.adoptAlly(m.creature, m.kind, m.script, this.player);
      // "Wait here" — only on the map where it was ordered: on a new one the companion follows the hero again.
      m.orders.wait = null;
      this.scene.orders.set(m.creature, m.orders);
    }
  }

  /** Map state for remembering: a companion who left here with the hero no longer stands here. */
  private snapshotHere(): MapState {
    const state = this.scene.snapshot();
    for (const m of [...this.party, ...this.carried]) {
      if (m.origin?.map !== this.scene.def.id) continue;
      const c = m.creature;
      state.creatures[m.origin.key] = { ...(state.creatures[m.origin.key] ?? { x: c.x, y: c.y, hp: c.hp, facing: 0, dead: false, hostile: false }), gone: true };
      delete state.corpseItems[m.origin.key];
    }
    return state;
  }

  /**
   * Go to another map. The current one's state is remembered — on return the hero will find everything as he left it.
   * There is no world map yet: going to it returns 'worldmap', and the game shows the "got out" screen.
   */
  async travel(to: Destination): Promise<'ok' | 'worldmap'> {
    if (to.map === 'worldmap') return 'worldmap';
    // NPCs led away by a script go only where they were sent.
    this.carried = this.carried.filter((m) => m.to === to.map);
    if (this.scene) this.remember();
    await this.enter(to);
    return 'ok';
  }

  /**
   * The hero moved to another wasteland square: the window is rebuilt around this square, the hero stays where
   * he stood (only the window coordinates change). Killed animals don't come back.
   */
  async recenter(square: Square): Promise<void> {
    const wl = this.wasteland;
    const current = this.scene;
    if (!wl || current.def.id !== WASTELAND) return;
    this.remember();
    const window = wastelandWindow(square, (tag) => !!this.vars[`wl:dead:${tag}`]);
    const scene = await Scene.create(window.def, this);
    // While the window was being built, the hero may have left the wasteland (reached a location) — then the new window isn't needed.
    if (this.scene !== current) return;
    const dx = (wl.center.column - square.column) * SQUARE_CELLS;
    const dy = (wl.center.row - square.row) * SQUARE_CELLS;
    // Things met on the road (not in the square data) move to the new window with the hero; companions follow.
    await scene.takeOver(current, dx, dy, (c) => this.crew.some((m) => m?.creature === c));
    if (this.scene !== current) return;
    this.player.x += dx;
    this.player.y += dy;
    this.scene = scene;
    this.bringParty();
    // The caravan follows: the same people and brahmin, at the same place in the wasteland.
    this.crew.forEach((m, i) => {
      if (!m) return;
      current.release(m.creature);
      m.creature.placeAt(m.creature.x + dx, m.creature.y + dy);
      scene.addEscort(m.creature, m.kind, this.caravan?.members[i]?.role !== 'brahmin');
    });
    this.wasteland = { center: square, tags: window.tags };
    this.vars['wl:col'] = square.column;
    this.vars['wl:row'] = square.row;
  }

  /**
   * Wounds heal over time when nobody is chasing the hero: as in the original — "healing rate" hit points
   * per 6 game hours; travelling across the wasteland — twice as fast (SPECIAL decision: "on a long road wounds heal on the move").
   */
  naturalHealing(): void {
    const { hero } = this;
    // How much game time has passed since last time — by any means: the road, rest, waiting by script.
    const gameSeconds = this.clock.seconds - this.healedAt;
    this.healedAt = this.clock.seconds;
    if (!hero.alive || hero.hp >= hero.maxHp) {
      this.vars['pc:heal'] = 0;
      return;
    }
    if (gameSeconds <= 0 || hero.inCombat) return;
    const { times, carry } = healTicks(this.vars['pc:heal'] ?? 0, gameSeconds, this.healPeriod);
    if (times > 0) hero.hp = Math.min(hero.maxHp, hero.hp + times * this.healingRate);
    this.vars['pc:heal'] = carry;
  }

  /**
   * After how many game seconds the wounds heal by another "healing rate": in the wasteland twice as fast, and with "Outdoorsman"
   * (client, 2026-10-27: the skill was useless) — faster still: 100% of the skill — twice (the hero knows where water, shade and herbs are).
   */
  private get healPeriod(): number {
    if (!this.wasteland) return HEAL_PERIOD;
    return HEAL_PERIOD / 2 / (1 + skillLevel(this.hero.character, SKILL.outdoorsman) / 100);
  }

  /** How many hit points come back at a time — the hero's "healing rate". */
  private get healingRate(): number {
    return Math.max(1, derivedStats(this.hero.character).healingRate);
  }

  /** How many game seconds to rest until full health (0 — healthy). For resting in the Pip-Boy. */
  secondsToHeal(): number {
    const { hero } = this;
    if (!hero.alive || hero.hp >= hero.maxHp) return 0;
    const period = this.healPeriod;
    const times = Math.ceil((hero.maxHp - hero.hp) / this.healingRate);
    return Math.max(0, times * period - (this.vars['pc:heal'] ?? 0));
  }

  /** Travel destination: a location or a world map point (compass, beacon, world map). */
  get target(): TravelTarget | null {
    return readTarget(this.vars);
  }

  setTarget(target: TravelTarget | null): void {
    writeTarget(this.vars, target);
  }

  /** Where the hero is on the world map (in squares): in the wasteland — exactly, at a location — the square he entered it from. */
  heroOnMap(): { x: number; y: number } {
    const wl = this.wasteland;
    if (wl && this.scene.def.id === WASTELAND) {
      const o = windowOrigin(wl.center);
      return { x: (o.x + this.player.x) / SQUARE_CELLS, y: (o.y + this.player.y) / SQUARE_CELLS };
    }
    const column = this.vars['wl:col'];
    const row = this.vars['wl:row'];
    return column !== undefined && row !== undefined ? { x: column + 0.5, y: row + 0.5 } : placePoint('vault13');
  }

  /**
   * A script created a critter on another level (another floor of the same original map): it will appear there when the hero arrives.
   * Returns its record and its item list — the script may give it something right away.
   */
  createElsewhere(levelId: string, rec: Omit<CreatedObject, 'key'>): { record: CreatedObject; items: [number, number][] } {
    this.forgetStaleLayout(levelId);
    const state = (this.maps[levelId] ??= { ...emptyMapState(), ...(LEVELS[levelId]?.revision ? { revision: LEVELS[levelId]!.revision } : {}) });
    const created = (state.created ??= []);
    const record: CreatedObject = { ...rec, key: `c${created.length + 1}` };
    created.push(record);
    const items = (state.corpseItems[record.key] ??= []);
    return { record, items };
  }

  /** How many game hours a fast travel to a location takes (in a straight line, as on foot). */
  fastTravelHours(place: PlaceKey): number {
    return travelHours(this.heroOnMap(), placePoint(place));
  }

  /** Remember the current map's state (the wasteland — only killed animals: everything else in it is rebuilt). */
  private remember(): void {
    const { scene, wasteland } = this;
    if (scene.def.id !== WASTELAND) {
      this.maps[scene.def.id] = this.snapshotHere();
      return;
    }
    for (const c of scene.creatures) {
      const tag = wasteland?.tags[scene.indexOf(c)];
      if (tag && !c.alive) this.vars[`wl:dead:${tag}`] = 1;
    }
  }

  /** Wasteland window: at a location (entrance — the location key) or where the hero was (loading a save). */
  private wastelandDef(entry: string): LevelDef {
    const place = PLACES[entry as PlaceKey];
    const center: Square = place ?? { column: this.vars['wl:col'] ?? PLACES.vault13.column, row: this.vars['wl:row'] ?? PLACES.vault13.row };
    this.vars['wl:col'] = center.column;
    this.vars['wl:row'] = center.row;
    const window = wastelandWindow(center, (tag) => !!this.vars[`wl:dead:${tag}`]);
    this.wasteland = { center, tags: window.tags };
    return window.def;
  }

  /**
   * The location was remade (re-taken from the original's map, LevelDef.revision): the state remembered on the old layout
   * is forgotten — NPCs, items, doors and local script variables went by object numbers, and the numbers are different now.
   * Returns whether it was forgotten.
   */
  private forgetStaleLayout(levelId: string): boolean {
    const state = this.maps[levelId];
    const def = LEVELS[levelId];
    if (!state || !def || (state.revision ?? 0) === (def.revision ?? 0)) return false;
    delete this.maps[levelId];
    for (const key of Object.keys(this.vars)) if (key.startsWith(`l:${levelId}:`)) delete this.vars[key];
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i]!.key.startsWith(`${levelId}:`)) this.timers.splice(i, 1);
    return true;
  }

  private async enter(to: Destination, at?: { x: number; y: number; angle: number }): Promise<void> {
    const def = to.map === WASTELAND ? this.wastelandDef(to.entry) : LEVELS[to.map];
    if (!def) throw new Error('No map ' + to.map);
    if (def.id !== WASTELAND) this.wasteland = null;
    // The save was made on the location's old layout — the hero stands at the entrance, not where he stood (there may be a wall there now).
    const stale = this.forgetStaleLayout(def.id);
    this.scene = await Scene.create(def, this, this.maps[def.id]);
    delete this.maps[def.id];
    // A script moved the hero to an exact hex (move_to to another floor) — there, otherwise — to the entry point.
    const spot = (stale ? undefined : at) ?? (to.tile !== undefined ? this.scene.tileSpot(to.tile, this.player.angle) : null) ?? this.scene.entry(to.entry);
    // At the new place — no running start and on the ground. Enemies don't follow the hero to another map: the fight stayed there.
    // A new entry (not a load): not facing a wall — at an elevator the hero appears with his back to its panel.
    this.player.placeAt(spot.x, spot.y, at ? spot.angle : openFacing(this.scene.level, spot.x, spot.y, spot.angle));
    // An NPC standing right on the hero's spawn point (in the original — next to the elevator) steps to a neighboring cell:
    // otherwise you can't hit him or get past him.
    this.scene.clearSpot(spot.x, spot.y);
    this.hero.inCombat = false;
    this.bringParty();
    for (const m of this.carried) this.scene.adoptResident(m.creature, m.kind, m.script, m.at, m.tile);
    this.carried = [];
    this.crew = [];
    if (this.caravan && def.id === WASTELAND) await this.spawnCrew(this.caravan);
    this.player.pitch = 0;
    void this.res.sound.playMusic(def.music);
  }

  /** The caravan appears in the wasteland (start of the trip, loading a save): each one in his place in the formation. */
  private async spawnCrew(trip: CaravanTrip): Promise<void> {
    const wl = this.wasteland;
    if (!wl) return;
    const o = windowOrigin(wl.center);
    const route = tripRoute(trip);
    for (const [i, m] of trip.members.entries()) {
      if (m.hp === 0) {
        this.crew[i] = null;
        continue;
      }
      const kind = await this.res.critterKind(m.pid, m.weaponPid);
      const spot = crewSpot(route, trip.done, i, m.role);
      const creature = new Creature(partyId++, spot.x - o.x, spot.y - o.y, kind.stats, kind.art, false, spot.heading, kind.weapon);
      if (m.hp !== null) creature.hp = Math.max(1, Math.min(kind.stats.maxHp, m.hp));
      this.scene.addEscort(creature, kind, m.role !== 'brahmin');
      this.crew[i] = { creature, kind };
    }
  }

  /** The caravan trip is over (arrived, abandoned, died): the caravan's people leave this map. */
  endCaravan(): void {
    for (const m of this.crew) if (m) this.scene.release(m.creature);
    this.crew = [];
    this.caravan = null;
  }

  toSave(): SaveData {
    const { hero, player, scene } = this;
    // The wasteland isn't saved in full: it is rebuilt, and the killed animals are in variables.
    if (scene.def.id === WASTELAND) this.remember();
    const here = scene.def.id === WASTELAND ? {} : { [scene.def.id]: this.snapshotHere() };
    return {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      label: `${this.mapTitle()} · ${t('saveDay')} ${this.clock.day}`,
      map: scene.def.id,
      ...(Object.keys(activeVariants()).length ? { locations: activeVariants() } : {}),
      player: { x: player.x, y: player.y, angle: player.angle },
      hero: {
        hp: hero.hp,
        experience: hero.experience,
        kills: hero.kills,
        magazine: hero.magazine,
        inventory: hero.inventory.items.map((s) => [s.proto.pid, s.count]),
        character: hero.character,
        weaponInInventory: true,
        held: hero.heldForSave,
        hand1: hero.firstHandForSave,
        activeHand: hero.activeHand,
        worn: hero.wornForSave,
        magazines: hero.magazines,
        loadedAmmo: hero.loadedForSave,
      },
      clock: this.clock.toJSON(),
      ...(this.flare > 0 ? { flare: this.flare } : {}),
      maps: { ...this.maps, ...here },
      vars: { ...this.vars },
      timers: this.timers.map((timer) => ({ ...timer })),
      addictions: this.addictions.map((a) => ({ ...a, deltas: a.deltas.map(([s, n]) => [s, n] as [number, number]) })),
      drugs: { mods: { ...this.drugMods }, queue: this.drugQueue.map((q) => ({ at: q.at, deltas: q.deltas.map(([s, n]) => [s, n] as [number, number]) })) },
      ...(this.caravan
        ? {
            caravan: {
              ...this.caravan,
              // Health of those walking now (the dead — 0); those not in the wasteland — as before.
              members: this.caravan.members.map((m, i) => {
                const c = this.crew[i]?.creature;
                return { ...m, hp: c ? (c.alive ? c.hp : 0) : m.hp };
              }),
            },
          }
        : {}),
      party: this.party
        .filter((m) => m.creature.alive || m.creature.unconscious)
        .map(
          (m): SavedPartyMember => ({
            pid: m.kind.pid,
            weaponPid: m.kind.weaponPid,
            hp: Math.max(1, m.creature.hp),
            inventory: m.creature.carried,
            script: m.script,
            origin: m.origin,
            ...(m.orders.far ? { far: true } : {}),
          }),
        ),
      ...(this.companions.size ? { companions: Object.fromEntries([...this.companions].map(([pid, p]) => [String(pid), { ...p, skills: [...p.skills] }])) } : {}),
      ...(Object.keys(this.companionNotes).length ? { companionNotes: { ...this.companionNotes } } : {}),
    };
  }
}
