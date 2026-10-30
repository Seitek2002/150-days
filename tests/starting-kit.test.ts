// Starting items as in the original: the cave script (V13CAVE) hands them out on the first visit, a base set for everyone
// plus extras for tagged skills. The script is taken from the player's copy (no copy — the script tests are skipped).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { ItemProto, WeaponData } from '../src/formats/pro.ts';
import { newCharacter, SKILL, skillLevel, specialLevel, SPECIAL_NAMES, type Character } from '../src/game/character.ts';
import { ammoFits, ATTACK_PAUSE, canWield, FISTS, Hero, HURT_STUN, type WeaponItem } from '../src/game/hero.ts';
import { isGrenade } from '../src/game/combat.ts';
import { callGameFunction } from '../src/script/game-functions.ts';
import { IntProgram } from '../src/script/int.ts';
import { ScriptVM } from '../src/script/vm.ts';
import { makeContext } from './helpers/script-context.ts';

const require = createRequire(import.meta.url);
const { openGame, checkGameFolder } = require('../electron/gamefiles.cjs');
let gameDir = '';
try {
  gameDir = JSON.parse(fs.readFileSync('.local/config.json', 'utf8')).gameDir ?? '';
} catch {
  gameDir = '';
}
const available = Boolean(gameDir) && checkGameFolder(gameDir).ok;
const B = String.fromCharCode(92);

/** PIDs of the original items: knife, 10mm pistol, 10mm ammo, stimpak, flare, lockpicks, brass knuckles. */
const PID = { knife: 4, pistol: 8, ammo10mm: 29, stimpak: 40, flare: 79, lockpicks: 84, brassKnuckles: 21 } as const;

/** Which items the cave script gives the hero on the first visit: pid → how many (in pieces, as in the script). */
async function kitFor(character: Character, firstRun = true): Promise<Map<number, number>> {
  const game = openGame(gameDir);
  try {
    const got = new Map<number, number>();
    const ctx = makeContext({
      isFirstRun: () => firstRun,
      stat: (o, stat) => (o.kind === 'dude' && stat < SPECIAL_NAMES.length ? specialLevel(character, SPECIAL_NAMES[stat]!) : 5),
      skill: (o, skill) => (o.kind === 'dude' ? skillLevel(character, skill) : 0),
      hasTrait: (trait) => character.traits.includes(trait),
      addItems: (o, proto, count) => {
        if (o.kind === 'dude') got.set(proto.pid, (got.get(proto.pid) ?? 0) + count);
      },
    });
    const vm = new ScriptVM(new IntProgram('V13CAVE', game.read(`SCRIPTS${B}V13CAVE.INT`)), {
      call: (machine, code, args) => callGameFunction(ctx, machine, code, args),
      now: () => 0,
    });
    await vm.init();
    await vm.call('map_enter_p_proc');
    return got;
  } finally {
    game.close();
  }
}

const tagged = (...skills: number[]): Character => ({ ...newCharacter(), tagged: skills });

describe.skipIf(!available)('starting items from the cave script', () => {
  it('everyone gets a knife, a pistol, two boxes of ammo, four stimpaks and two flares', async () => {
    const kit = await kitFor(tagged(SKILL.speech, SKILL.barter, SKILL.gambling));
    expect(kit.get(PID.knife)).toBe(1);
    expect(kit.get(PID.pistol)).toBe(1);
    expect(kit.get(PID.ammo10mm)).toBe(2);
    expect(kit.get(PID.stimpak)).toBe(4);
    expect(kit.get(PID.flare)).toBe(2);
    expect(kit.has(PID.lockpicks)).toBe(false);
  });

  it('a tagged skill adds its item: "Lockpick" — lockpicks, "Unarmed" — brass knuckles, "Small Guns" — another box of ammo', async () => {
    const kit = await kitFor(tagged(SKILL.lockpick, SKILL.unarmed, SKILL.smallGuns));
    expect(kit.get(PID.lockpicks)).toBe(1);
    expect(kit.get(PID.brassKnuckles)).toBe(1);
    expect(kit.get(PID.ammo10mm)).toBe(3);
  });

  it('a second visit to the cave gives no items', async () => {
    const kit = await kitFor(tagged(SKILL.lockpick, SKILL.unarmed, SKILL.smallGuns), false);
    expect(kit.size).toBe(0);
  });
});

const weapon = {
  pid: PID.pistol,
  messageId: 0,
  fid: 0,
  type: 3,
  weight: 0,
  cost: 0,
  inventoryFid: 0,
  weapon: { capacity: 12, ammoPid: PID.ammo10mm, apCost: 5, minDamage: 5, maxDamage: 12, animationCode: 5, range: 25 } as WeaponData,
} as ItemProto & { weapon: WeaponData };
const ammo: ItemProto = { pid: PID.ammo10mm, messageId: 0, fid: 0, type: 4, weight: 0, cost: 0, inventoryFid: 0 };
const stimpak: ItemProto = { pid: PID.stimpak, messageId: 0, fid: 0, type: 2, weight: 0, cost: 0, inventoryFid: 0 };

describe('the weapon is an inventory item', () => {
  const knife: WeaponItem = {
    pid: PID.knife,
    messageId: 0,
    fid: 0,
    type: 3,
    weight: 0,
    cost: 0,
    inventoryFid: 0,
    weapon: { minDamage: 1, maxDamage: 6, damageType: 0, range: 1, minStrength: 0, apCost: 3, apCostMode2: 3, caliber: 0, ammoPid: -1, capacity: 0, animationCode: 1 },
  };

  it('no weapon — fists: they hit without ammo using the "Unarmed" skill, no reloading', () => {
    const hero = new Hero({ weapon, ammo, stimpak });
    hero.inventory.add(ammo, 24);
    expect(hero.armed).toBe(false);
    expect(hero.melee).toBe(true);
    expect(hero.weapon).toBe(FISTS);
    expect(hero.gunSkill).toBe(hero.fighter.skills[SKILL.unarmed]);
    expect(hero.fire()).toBe('fired');
    expect(hero.reload()).toBe('no');
  });

  it('a pistol in the inventory is in hand by itself and loaded', () => {
    const hero = new Hero({ weapon, ammo, stimpak });
    hero.inventory.add(weapon, 1);
    expect(hero.armed).toBe(true);
    expect(hero.melee).toBe(false);
    expect(hero.magazine).toBe(12);
    expect(hero.fire()).toBe('fired');
    expect(hero.magazine).toBe(11);
  });

  it('a knife in hand — melee with the "Melee Weapons" skill; the pistol magazine waits for its turn', () => {
    const hero = new Hero({ weapon, ammo, stimpak });
    hero.inventory.add(weapon, 1);
    hero.inventory.add(knife, 1);
    hero.fire();
    expect(canWield(knife)).toBe(true);
    hero.equip(knife);
    expect(hero.melee).toBe(true);
    expect(hero.gunSkill).toBe(hero.fighter.skills[SKILL.melee]);
    hero.equip(weapon);
    expect(hero.magazine).toBe(11);
  });

  it('gave away the weapon in hand — fists; a grenade cannot be held in hand', () => {
    const hero = new Hero({ weapon, ammo, stimpak });
    hero.inventory.add(weapon, 1);
    hero.inventory.remove(PID.pistol);
    expect(hero.weapon).toBe(FISTS);
    // A grenade (explosion) and a flare (damage 1) are thrown, but they cannot be held as a weapon — they are used.
    const grenade = { ...knife, pid: 25, weapon: { ...knife.weapon, animationCode: 0, range: 15, damageType: 6, maxDamage: 35 } };
    expect(canWield(grenade)).toBe(false);
    const flare = { ...knife, pid: 79, weapon: { ...knife.weapon, animationCode: 0, range: 15, minDamage: 1, maxDamage: 1 } };
    expect(canWield(flare)).toBe(false);
    const spear = { ...knife, pid: 7, weapon: { ...knife.weapon, animationCode: 4, range: 2 } };
    expect(canWield(spear)).toBe(true);
  });

  it('a throwing knife is a weapon in hand: thrown with the "Throwing" skill, does not explode', () => {
    const throwing: WeaponItem = { ...knife, pid: 45, weapon: { ...knife.weapon, minDamage: 3, maxDamage: 6, range: 16, apCost: 5, projectilePid: 0x05000006 } };
    expect(canWield(throwing)).toBe(true);
    expect(isGrenade(throwing)).toBe(false);
    const hero = new Hero({ weapon, ammo, stimpak });
    hero.inventory.add(throwing, 3);
    hero.equip(throwing);
    expect(hero.thrown).toBe(true);
    expect(hero.melee).toBe(false);
    expect(hero.gunSkill).toBe(hero.fighter.skills[SKILL.throwing]);
    expect(hero.reserve).toBe(3);
    hero.update(1);
    expect(hero.fire()).toBe('fired');
    expect(hero.reload()).toBe('no');
  });
});

describe('pause between attacks and stun (client request, 2026-10-24)', () => {
  it('a fist cannot strike more often than once every half second', () => {
    const hero = new Hero({ weapon, ammo, stimpak });
    expect(hero.fire()).toBe('fired');
    hero.update(0.4);
    expect(hero.fire()).toBe('busy');
    hero.update(0.11);
    expect(hero.fire()).toBe('fired');
    expect(ATTACK_PAUSE).toBe(0.5);
  });

  it('a hit on the hero (2026-10-26): a weak one knocks the aim off, a strong or critical one also stuns', () => {
    const hero = new Hero({ weapon, ammo, stimpak });
    hero.takeDamage(0, {});
    expect(hero.stunLeft).toBe(0);
    // A weak hit: the aim is knocked off (recoil), the camera jerks, but the hero does not freeze.
    hero.takeDamage(2, {});
    expect(hero.stunLeft).toBe(0);
    expect(hero.shake).toBe(1);
    expect(hero.spreadKick).toBeGreaterThan(1);
    expect(hero.fire()).toBe('fired');
    // A strong one (a quarter of health or more): freezes for HURT_STUN and does not strike.
    const fresh = new Hero({ weapon, ammo, stimpak });
    fresh.takeDamage(Math.ceil(fresh.maxHp * 0.25), {});
    expect(fresh.stunLeft).toBeCloseTo(HURT_STUN);
    expect(fresh.fire()).toBe('busy');
    fresh.update(HURT_STUN + 0.01);
    expect(fresh.stunLeft).toBe(0);
    // Right after a stun a new strong hit does not hold him in place (a pack does not "lock" the hero).
    fresh.takeDamage(1, { critical: true });
    expect(fresh.stunLeft).toBe(0);
    // Poison and radiation (without a hit) do not stun.
    const sick = new Hero({ weapon, ammo, stimpak });
    sick.takeDamage(20);
    expect(sick.stunLeft).toBe(0);
  });
});

describe('ammo of the same caliber (client request, 2026-10-24)', () => {
  const pistol = { ...weapon, weapon: { ...weapon.weapon, caliber: 8 } } as WeaponItem;
  const jhp: ItemProto = { ...ammo, ammo: { caliber: 8, quantity: 24 } };
  const ap: ItemProto = { ...ammo, pid: 30, ammo: { caliber: 8, quantity: 24 } };
  const shells: ItemProto = { ...ammo, pid: 95, ammo: { caliber: 11, quantity: 20 } };

  it('10mm AP fits the 10mm pistol, shotgun shells do not', () => {
    expect(ammoFits(ap, pistol.weapon)).toBe(true);
    expect(ammoFits(jhp, pistol.weapon)).toBe(true);
    expect(ammoFits(shells, pistol.weapon)).toBe(false);
  });

  it('own ammo ran out — R loads other suitable ones; choosing others returns the previous ones to the inventory', () => {
    const hero = new Hero({ weapon: pistol, ammo: jhp, stimpak });
    hero.inventory.add(pistol, 1);
    hero.inventory.add(ap, 30);
    hero.magazine = 0;
    expect(hero.reserve).toBe(30);
    expect(hero.reload()).toBe('started');
    hero.update(10);
    expect(hero.magazine).toBe(12);
    expect(hero.loadedAmmoPid).toBe(30);
    expect(hero.inventory.count(30)).toBe(18);
    // Chose the normal ones: the magazine has 12 AP — they go to the inventory, the magazine gets normal ones.
    hero.inventory.add(jhp, 20);
    hero.magazine = 5;
    expect(hero.reload(jhp)).toBe('started');
    hero.update(10);
    expect(hero.loadedAmmoPid).toBe(jhp.pid);
    expect(hero.magazine).toBe(12);
    expect(hero.inventory.count(30)).toBe(23);
    expect(hero.inventory.count(jhp.pid)).toBe(8);
    expect(hero.reload(shells)).toBe('wrong');
    // The save remembers what it is loaded with.
    expect(hero.loadedForSave).toEqual([]);
  });

  it('while own ammo remains, R tops up with it', () => {
    const hero = new Hero({ weapon: pistol, ammo: jhp, stimpak });
    hero.inventory.add(pistol, 1);
    hero.inventory.add(jhp, 5);
    hero.inventory.add(ap, 30);
    hero.magazine = 3;
    hero.reload();
    hero.update(10);
    expect(hero.loadedAmmoPid).toBe(jhp.pid);
    expect(hero.magazine).toBe(8);
    expect(hero.inventory.count(30)).toBe(30);
  });
});
