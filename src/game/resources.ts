// Shared game resources: loaded from the copy of Fallout once and kept while the game is open.
// Level critters and items are loaded as needed and remembered.
import { ANIM, GameData } from '../assets/gamedata.ts';
import { GameAssets, type SpriteSheet } from '../assets/sprites.ts';
import { Sound } from '../audio/sound.ts';
import { STAT, type CritterProto, type ItemProto, type WeaponData } from '../formats/pro.ts';
import { parseAiPackets, type AiPacket } from '../formats/ai-txt.ts';
import { platform } from '../platform.ts';
import type { ParsedLevel } from '../world/defs.ts';
import { FAN_CRITTERS, PID } from '../world/pids.ts';
import { loadAutomap, type AutoMap } from './automap.ts';
import { isMeleeWeapon, isThrownWeapon, SECONDS_PER_AP, unarmedDamage, unarmedSkill, weaponArtLetter } from './combat.ts';
import type { CreatureArt, CreatureStats, CreatureWeapon } from './creature.ts';
import { critterFighter, RELOAD_SECONDS, weaponSkill, type Fighter } from './fighter.ts';
import { loadInterfaceFonts, type InterfaceFonts } from './fonts.ts';
import { Hud } from './hud.ts';
import { ItemScreens, loadScreenArt } from './screens.ts';

/** Sounds from the game copy (file names in SOUND\SFX without extension). */
export const SFX = {
  click: 'IB1P1XX1',
  pickup: 'IPICKUP1',
  heroHurt: 'HMXXXXAO',
  heroDeath: 'HMXXXXBA',
  elevatorUp: 'SELEVUX1',
  elevatorDown: 'SELEVDX1',
};

/**
 * Weapon sound by the Fallout rule: W + action + weapon sound code + mode + material + XX + variant.
 * Actions: A is a shot, H a hit, O out of ammo, R reload.
 * Material (only for a hit): F flesh, S stone, M metal, W wood.
 */
export function weaponSfx(action: 'A' | 'H' | 'O' | 'R', code: string, variant: number, material = 'F'): string {
  return `W${action}${code}1${action === 'H' ? material : 'X'}XX${variant}`;
}

/**
 * A creature's dry-fire click (WO<code>): the warning before its attack (combat.ts -> TELEGRAPH) and a jammed shot. Firearms have their
 * own click (the code is the third letter of the shot file, WA<code>...); melee weapons and beasts have none in the original, so they
 * click like the 10mm pistol (A).
 */
export function clickSfx(weapon: { melee: boolean; sound: string } | null | undefined): string {
  const sound = weapon && !weapon.melee ? weapon.sound : '';
  return weaponSfx('O', /^WA[A-Z]/.test(sound) ? sound[2]! : 'A', 1);
}

/** Door sound: S + O (open) / C (close) / L (locked) + DOORS + door letter. */
export function doorSfx(action: 'O' | 'C' | 'L', letter: string): string {
  // Our own door from the block library with its own sounds (b:<name>): open and close are its files, "locked" is the shared one.
  if (letter.startsWith('b:')) return action === 'L' ? 'SLDOORSA' : `${letter}:${action}`;
  return `S${action}DOORS${letter}`;
}

export interface CritterKind {
  pid: number;
  stats: CreatureStats;
  art: CreatureArt;
  /** Critter sound name: MASRAT + AQ (bite), AO (wound), BA (death). */
  soundBase: string;
  /** Bites (animals: "MA…" images); humans hit. */
  bites: boolean;
  /** Weapon in hand (if set in the level). */
  weapon: CreatureWeapon | null;
  /** The critter as a fighter, by the same rules as the hero (fighter.ts). */
  fighter: Fighter;
  /** PID of the weapon in hand (0 means unarmed): to rebuild the same critter (a companion in a save). */
  weaponPid: number;
  /** Never runs away, however badly wounded (its AI packet in AI.TXT says so: min_hp 1 or less — Gizmo, Killian, super mutants, deathclaws). */
  fightsToDeath?: boolean;
}

/** NPC "aim time" before a shot (seconds), on top of the shot time from AP, as for the hero. */
const AIM_SECONDS = 0.25;
/** NPC ammo supply until critter inventories are carried over from maps: this many full magazines. */
const SPARE_MAGAZINES = 3;
/** Throwing weapons: the next knife from the items goes into the hand in this many seconds. */
const THROW_READY = 0.35;

export interface Loadout {
  weapon: ItemProto & { weapon: WeaponData };
  ammo: ItemProto;
  stimpak: ItemProto;
}

export class Resources {
  readonly data: GameData;
  readonly sound: Sound;
  readonly fonts: InterfaceFonts;
  readonly hud: Hud;
  readonly screens: ItemScreens;
  readonly automap: AutoMap;
  readonly loadout: Loadout;
  private readonly kinds = new Map<string, Promise<CritterKind>>();
  private readonly ground = new Map<number, Promise<SpriteSheet>>();

  private constructor(data: GameData, sound: Sound, fonts: InterfaceFonts, hud: Hud, screens: ItemScreens, automap: AutoMap, loadout: Loadout) {
    this.data = data;
    this.sound = sound;
    this.fonts = fonts;
    this.hud = hud;
    this.screens = screens;
    this.automap = automap;
    this.loadout = loadout;
  }

  /** sound is shared with the main menu (one sound engine for the whole game). */
  static async load(sound: Sound): Promise<Resources> {
    const assets = await GameAssets.load();
    const data = await GameData.load(assets);
    const [weapon, ammo, stimpak] = await Promise.all([data.item(PID.pistol10mm), data.item(PID.ammo10mmJhp), data.item(PID.stimpak)]);
    if (!weapon.weapon) throw new Error('The pistol prototype does not look like a weapon');
    const fonts = await loadInterfaceFonts();
    const [bar, itemSlot, weaponImage, numbers, screenArt, automap, apLight, indicatorBox] = await Promise.all([
      assets.image('ART\\INTRFACE\\IFACE.FRM'),
      data.interfaceImage(32),
      data.inventoryImage(weapon),
      assets.image('ART\\INTRFACE\\NUMBERS.FRM'),
      loadScreenArt(data),
      loadAutomap(data, fonts.main),
      // Green action point light (INTRFACE.LST #83).
      data.interfaceImage(83),
      // Status plate frame above the message screen (INTRFACE.LST #126, WARNBOX.FRM); without it, plates have no frame.
      data.interfaceImage(126).catch(() => null),
    ]);
    const loadout: Loadout = { weapon: weapon as ItemProto & { weapon: WeaponData }, ammo, stimpak };
    const hud = new Hud({ bar, itemSlot, weapon: weaponImage, numbers, font: fonts.main, apLight, indicatorBox, itemImage: (item) => data.inventoryImage(item) });
    const res = new Resources(data, sound, fonts, hud, new ItemScreens(screenArt, data, fonts.main), automap, loadout);
    const ai = await platform.readGameFile('DATA\\AI.TXT').catch(() => null);
    if (ai) res.aiPackets = parseAiPackets(new TextDecoder('windows-1252').decode(ai));
    const code = loadout.weapon.weapon.soundCode ?? '0';
    await sound.preload([
      ...Object.values(SFX),
      ...[1, 2].flatMap((v) => [weaponSfx('A', code, v), ...['F', 'S', 'M'].map((m) => weaponSfx('H', code, v, m))]),
      weaponSfx('O', code, 1),
      weaponSfx('O', 'A', 1),
      weaponSfx('R', code, 1),
    ]);
    return res;
  }

  item(pid: number): Promise<ItemProto> {
    return this.data.item(pid);
  }

  itemName(proto: ItemProto): string {
    return this.data.itemName(proto);
  }

  groundSprite(proto: ItemProto): Promise<SpriteSheet> {
    let sheet = this.ground.get(proto.pid);
    if (!sheet) {
      sheet = this.data.groundSprite(proto);
      this.ground.set(proto.pid, sheet);
    }
    return sheet;
  }

  /** The original's combat behavior packets (DATA\AI.TXT) by number; empty if the copy has no such file. */
  aiPackets = new Map<number, AiPacket>();

  /**
   * Whether a critter with this AI packet fights to the death (client, 2026-10-31: Gizmo ran away): in the original a critter turns to
   * run once its hit points fall to the packet's min_hp, and 1 or less means it never does.
   */
  fightsToDeath(packet: number): boolean {
    const p = this.aiPackets.get(packet);
    return !!p && p.minHp <= 1;
  }

  /** Critter look; weaponPid is the weapon in hand ("armed" images, shots or blows with that weapon). */
  critterKind(pid: number, weaponPid = 0): Promise<CritterKind> {
    const key = `${pid}:${weaponPid}`;
    let kind = this.kinds.get(key);
    if (!kind) {
      kind = this.loadCritterKind(pid, weaponPid);
      this.kinds.set(key, kind);
    }
    return kind;
  }

  /**
   * Whether the critter can hold this weapon: its images have a stance with it (Ian, as in the original, has pistols and
   * submachine guns). Brass knuckles and fists always.
   */
  async canWield(critterPid: number, item: ItemProto): Promise<boolean> {
    if (!item.weapon) return false;
    const code = item.weapon.animationCode ?? 0;
    return code === 0 || (await this.wieldCodes(critterPid)).has(code);
  }

  private readonly wields = new Map<number, Promise<ReadonlySet<number>>>();
  private readonly gores = new Map<number, Promise<SpriteSheet | null>>();
  private readonly scriptFiles = new Map<string, Promise<boolean>>();

  /**
   * Whether the script exists in the player's copy. The fan build added its own critters and items with their own scripts; the
   * official copy has neither these scripts nor these critters. If it cannot be checked (checks without a copy), assume it exists.
   */
  scriptExists(name: string): Promise<boolean> {
    const key = name.toUpperCase();
    let known = this.scriptFiles.get(key);
    if (!known) {
      known = platform.gameFileKnown(`SCRIPTS\\${key}.INT`).then((v) => v ?? true);
      this.scriptFiles.set(key, known);
    }
    return known;
  }

  /**
   * "Bloody Mess" (hero trait): the most violent death drawn for the critter, in order: chunks
   * ("BF"), a hole through ("BD"), cut in half ("BI"), blown apart ("BL"). None at all means null (dies normally).
   */
  goreDeath(critterPid: number): Promise<SpriteSheet | null> {
    let known = this.gores.get(critterPid);
    if (!known) {
      known = (async () => {
        const proto = await this.data.critter(critterPid);
        for (const code of ['BF', 'BD', 'BI', 'BL']) {
          const sheet = await this.data.critterAnim(proto, code).catch(() => null);
          if (sheet) return sheet;
        }
        return null;
      })();
      this.gores.set(critterPid, known);
    }
    return known;
  }

  /**
   * Which weapon types the critter can hold: weapon animation codes (1 knife … 10 rocket launcher) for which its
   * images have an armed stance. Ian: knife, pistol, submachine gun; Tycho: spear, pistol, rifle; Katja:
   * knife, spear, submachine gun; the dog: nothing.
   */
  wieldCodes(critterPid: number): Promise<ReadonlySet<number>> {
    let known = this.wields.get(critterPid);
    if (!known) {
      known = (async () => {
        const proto = await this.data.critter(critterPid);
        const codes = new Set<number>();
        for (let code = 1; code <= 10; code++) {
          const ok = await this.data.critterAnim(proto, weaponArtLetter(code) + 'A').then(
            () => true,
            () => false,
          );
          if (ok) codes.add(code);
        }
        return codes;
      })();
      this.wields.set(critterPid, known);
    }
    return known;
  }

  /** Everything that appears in a level: critters, item images, their sounds. */
  async preloadLevel(parsed: ParsedLevel): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    for (const o of parsed.objects) {
      if (o.kind === 'critter' || o.kind === 'npc') jobs.push(this.critterKind(o.pid, o.weapon));
      else if (o.kind === 'corpse') jobs.push(this.critterKind(o.pid, 0));
      if (o.kind === 'item') jobs.push(this.item(o.pid).then((p) => this.groundSprite(p)));
      if (o.kind === 'door') {
        const letter = o.sound ?? 'A';
        jobs.push(this.sound.preload([doorSfx('O', letter), doorSfx('C', letter), doorSfx('L', letter)]));
      }
    }
    await Promise.all(jobs);
  }

  private async loadCritterKind(pid: number, weaponPid = 0): Promise<CritterKind> {
    // A fan build critter, but the copy is official: a similar one from the original (FAN_CRITTERS).
    const fallback = FAN_CRITTERS[pid];
    const proto: CritterProto = await this.data.critter(pid).catch((error: unknown) => {
      if (fallback === undefined) throw error;
      return this.data.critter(fallback);
    });
    const gun = weaponPid ? (await this.data.item(weaponPid).catch(() => null))?.weapon : undefined;
    const code = gun?.animationCode ?? 0;
    // Armed images: weapon letter + action letter (pistol: "HA" stance, "HB" walk, "HJ" shot).
    const letter = gun ? weaponArtLetter(code) : 'A';
    const anim = (name: string) => this.data.critterAnim(proto, name);
    const plain = await anim(ANIM.stand);
    // Humans and animals have different animation sets: whatever is missing shows the stance.
    const orStand = (p: Promise<SpriteSheet>) => p.catch(() => plain);
    const withWeapon = (action: string, fallback: string) =>
      letter === 'A' ? orStand(anim(fallback)) : anim(letter + action).catch(() => orStand(anim(fallback)));
    // Melee: knife and spear stab ("F"), club and sledgehammer swing ("G"); brass knuckles (code 0) are a punch.
    // Throwing weapons (knife, rock) are thrown from afar, one at a time (the client, 2026-10-26: Katja with throwing knives fought
    // with her fists); images with a knife in hand, the throw is a normal attack.
    const thrown = isThrownWeapon(gun);
    const melee = !!gun && !thrown && (isMeleeWeapon(code) || code === 0 || gun.range <= 2);
    const attackAction = !gun || thrown ? '' : code === 0 ? '' : melee ? (code === 1 || code === 4 ? 'F' : 'G') : 'J';
    const [stand, walk, attack, hit, death] = await Promise.all([
      letter === 'A' ? Promise.resolve(plain) : anim(letter + 'A').catch(() => plain),
      withWeapon('B', ANIM.walk),
      attackAction ? withWeapon(attackAction, ANIM.attack) : orStand(anim(ANIM.attack)),
      orStand(anim(ANIM.hit)),
      orStand(anim(ANIM.deathBack)),
    ]);
    const soundBase = this.data.critterArtBase(proto);
    // Critter sounds by the original's rule (image name + action letters, src/script/sfx-names.ts). Many humans
    // have none in the game copy, and there is nothing to request: first we ask which files exist and load only those (otherwise 404 errors).
    void Promise.all(
      ['AQ', 'AO', 'BA'].map(async (a) => ((await platform.gameFileExists(`SOUND\\SFX\\${soundBase}${a}.ACM`)) ? soundBase + a : null)),
    ).then((found) => this.sound.preload(found.filter((n): n is string => n !== null)));
    const s = proto.stats;
    const fighter = critterFighter(proto);
    const stats: CreatureStats = {
      name: this.data.critterName(proto),
      maxHp: s[STAT.maxHp] ?? 5,
      ac: s[STAT.armorClass] ?? 0,
      armor: { dt: s[STAT.damageThreshold] ?? 0, dr: s[STAT.damageResistance] ?? 0 },
      skill: unarmedSkill(s, proto.skillPoints[3] ?? 0),
      damage: unarmedDamage(s),
      experience: proto.experience,
    };
    let weapon: CreatureWeapon | null = null;
    if (gun) {
      // Skill with this weapon by the same rule as for the hero (fighter.ts).
      const skill = weaponSkill(fighter, gun);
      const damage = { min: gun.minDamage, max: gun.maxDamage + (melee ? fighter.meleeDamage : 0) };
      const sound = weaponSfx('A', gun.soundCode ?? '0', 1);
      void this.sound.preload([sound, clickSfx({ melee, sound })]);
      // Modifiers of the barrel's "native" ammo (as for the hero: armor piercing pierces armor, hollow point hurts more).
      const ammo = melee || thrown || gun.ammoPid < 0 ? undefined : (await this.data.item(gun.ammoPid).catch(() => null))?.ammo;
      weapon = {
        melee,
        ...(ammo ? { ammo } : {}),
        range: Math.max(1, gun.range / 2),
        damage,
        skill,
        pause: gun.apCost * SECONDS_PER_AP + AIM_SECONDS,
        magazine: thrown ? 1 : Math.max(1, gun.capacity || 6),
        reload: thrown ? THROW_READY : RELOAD_SECONDS,
        spare: melee || thrown ? 0 : Math.max(1, gun.capacity || 6) * SPARE_MAGAZINES,
        sound,
        ...(thrown ? { thrown: true } : {}),
      };
      // Knife and club hit at point blank, like a bite, but with their own damage and skill.
      if (melee) {
        stats.skill = skill;
        stats.damage = damage;
      }
    }
    return { pid, art: { stand, walk, attack, hit, death }, soundBase, bites: soundBase.startsWith('MA'), weapon, stats, fighter, weaponPid, fightsToDeath: this.fightsToDeath(proto.aiPacket) };
  }
}
