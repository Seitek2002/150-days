// Data from the player's copy of Fallout: item and critter prototypes, names, image paths.
import { parseFrm, type Frm } from '../formats/frm.ts';
import { idIndex, parseCritterProto, parseItemProto, parseProto, type CritterProto, type ItemProto, type SceneryProto } from '../formats/pro.ts';
import { parseLst, parseMsg } from '../formats/text.ts';
import { platform } from '../platform.ts';
import type { GameAssets, SpriteSheet } from './sprites.ts';

const read = (name: string) => platform.readGameFile(name);

/** Critter animations: the last letter of the file name (as in Fallout). */
export const ANIM = {
  stand: 'AA',
  walk: 'AB',
  dodge: 'AN',
  hit: 'AO',
  attack: 'AQ',
  deathBack: 'BA',
  deathBlood: 'BO',
} as const;

type ListName = 'protoItems' | 'protoCritters' | 'artItems' | 'artInven' | 'artCritters' | 'artIntrface';

export class GameData {
  private readonly itemCache = new Map<number, ItemProto>();
  private readonly critterCache = new Map<number, CritterProto>();
  private readonly assets: GameAssets;
  private readonly lists: Record<ListName, string[]>;
  private readonly itemNames: Map<number, string>;
  private readonly critterNames: Map<number, string>;
  /** Scenery: prototype and image lists and names — read on first request. */
  private sceneryPending: Promise<{ protos: string[]; art: string[]; names: Map<number, string> }> | null = null;
  private readonly sceneryCache = new Map<number, Promise<SceneryProto | null>>();

  private constructor(
    assets: GameAssets,
    lists: Record<ListName, string[]>,
    itemNames: Map<number, string>,
    critterNames: Map<number, string>,
  ) {
    this.assets = assets;
    this.lists = lists;
    this.itemNames = itemNames;
    this.critterNames = critterNames;
  }

  static async load(assets: GameAssets): Promise<GameData> {
    const lst = async (name: string) => parseLst(await read(name));
    const msg = async (name: string) => parseMsg(await read(name));
    const [protoItems, protoCritters, artItems, artInven, artCritters, artIntrface, itemNames, critterNames] = await Promise.all([
      lst('PROTO\\ITEMS\\ITEMS.LST'),
      lst('PROTO\\CRITTERS\\CRITTERS.LST'),
      lst('ART\\ITEMS\\ITEMS.LST'),
      lst('ART\\INVEN\\INVEN.LST'),
      lst('ART\\CRITTERS\\CRITTERS.LST'),
      lst('ART\\INTRFACE\\INTRFACE.LST'),
      msg('TEXT\\ENGLISH\\GAME\\PRO_ITEM.MSG'),
      msg('TEXT\\ENGLISH\\GAME\\PRO_CRIT.MSG'),
    ]);
    return new GameData(
      assets,
      { protoItems, protoCritters, artItems, artInven, artCritters, artIntrface },
      itemNames,
      critterNames,
    );
  }

  async item(pid: number): Promise<ItemProto> {
    let proto = this.itemCache.get(pid);
    if (!proto) {
      const file = this.lists.protoItems[idIndex(pid) - 1];
      if (!file) throw new Error('No item ' + pid);
      proto = parseItemProto(await read('PROTO\\ITEMS\\' + file));
      this.itemCache.set(pid, proto);
    }
    return proto;
  }

  async critter(pid: number): Promise<CritterProto> {
    let proto = this.critterCache.get(pid);
    if (!proto) {
      const file = this.lists.protoCritters[idIndex(pid) - 1];
      if (!file) throw new Error('No critter ' + pid);
      proto = parseCritterProto(await read('PROTO\\CRITTERS\\' + file));
      this.critterCache.set(pid, proto);
    }
    return proto;
  }

  itemName(proto: ItemProto): string {
    return this.itemNames.get(proto.messageId) ?? '?';
  }

  /** Item description — the line after the name in PRO_ITEM.MSG. */
  itemDescription(proto: ItemProto): string {
    return this.itemNames.get(proto.messageId + 1) ?? '';
  }

  critterName(proto: CritterProto): string {
    return this.critterNames.get(proto.messageId) ?? '?';
  }

  /** Critter description — the line after the name in PRO_CRIT.MSG. */
  critterDescription(proto: CritterProto): string {
    return this.critterNames.get(proto.messageId + 1) ?? '';
  }

  /** File name of the item's ground image (this is how a crate or locker becomes our block). */
  itemArtName(proto: ItemProto): string {
    return this.lists.artItems[idIndex(proto.fid)] ?? '';
  }

  /** The item's ground image. */
  groundSprite(proto: ItemProto): Promise<SpriteSheet> {
    return this.assets.sheet('ART\\ITEMS\\' + this.listed(this.lists.artItems, proto.fid));
  }

  /** The item's image in the inventory and on the panel. */
  inventoryImage(proto: ItemProto): Promise<HTMLCanvasElement> {
    return this.assets.image('ART\\INVEN\\' + this.listed(this.lists.artInven, proto.inventoryFid));
  }

  interfaceImage(index: number): Promise<HTMLCanvasElement> {
    return this.assets.image('ART\\INTRFACE\\' + this.listed(this.lists.artIntrface, index));
  }

  private sceneryData(): Promise<{ protos: string[]; art: string[]; names: Map<number, string> }> {
    this.sceneryPending ??= Promise.all([
      read('PROTO\\SCENERY\\SCENERY.LST').then(parseLst),
      read('ART\\SCENERY\\SCENERY.LST').then(parseLst),
      read('TEXT\\ENGLISH\\GAME\\PRO_SCEN.MSG')
        .then(parseMsg)
        .catch(() => new Map<number, string>()),
    ]).then(([protos, art, names]) => ({ protos, art, names }));
    return this.sceneryPending;
  }

  /** Scenery prototype (wall, computer, rocks); none — null. */
  scenery(pid: number): Promise<SceneryProto | null> {
    let pending = this.sceneryCache.get(pid);
    if (!pending) {
      pending = this.sceneryData().then(async ({ protos }) => {
        const file = protos[idIndex(pid) - 1];
        if (!file) return null;
        const proto = parseProto(await read('PROTO\\SCENERY\\' + file));
        return proto.kind === 'scenery' ? proto : null;
      });
      pending = pending.catch(() => null);
      this.sceneryCache.set(pid, pending);
    }
    return pending;
  }

  /** Scenery name and description from PRO_SCEN.MSG. */
  async sceneryText(proto: SceneryProto): Promise<{ name: string; description: string }> {
    const { names } = await this.sceneryData();
    return { name: names.get(proto.messageId) ?? '', description: names.get(proto.messageId + 1) ?? '' };
  }

  /** File name of the scenery image (used to recognize, e.g., a force field — FFIELD). */
  async sceneryArtName(proto: SceneryProto): Promise<string> {
    const { art } = await this.sceneryData();
    return art[idIndex(proto.fid)] ?? '';
  }

  /** Scenery image (first frame of the first direction — for the map sprite). */
  async scenerySprite(proto: SceneryProto): Promise<SpriteSheet> {
    const { art } = await this.sceneryData();
    return this.assets.sheet('ART\\SCENERY\\' + this.listed(art, proto.fid));
  }

  interfaceFrm(name: string): Promise<Frm> {
    return this.assets.frm('ART\\INTRFACE\\' + name);
  }

  /** Name of the critter's images ("MASRAT"): its sounds are named after it too (MASRATAQ — bite). */
  critterArtBase(proto: CritterProto): string {
    return this.listed(this.lists.artCritters, proto.fid).toUpperCase();
  }

  /** Critter animation: one .FRM file or six .FR0–.FR5 files (one per direction). */
  async critterAnim(proto: CritterProto, anim: string): Promise<SpriteSheet> {
    const base = 'ART\\CRITTERS\\' + this.listed(this.lists.artCritters, proto.fid).toUpperCase() + anim;
    // First ask whether there is one shared .FRM file: we can't just try to load it and catch the error — the browser logs a 404 to the console.
    if (await platform.gameFileExists(base + '.FRM')) return this.assets.sheet(base + '.FRM');
    // No six separate files either — the critter has no such animation (the Overseer, for example, only has a stand).
    if (!(await platform.gameFileExists(base + '.FR0'))) throw new Error('No animation ' + base);
    const parts = await Promise.all([0, 1, 2, 3, 4, 5].map((d) => this.assets.sheet(base + '.FR' + d)));
    return {
      fps: parts[0]!.fps,
      actionFrame: parts[0]!.actionFrame,
      directions: parts.map((p) => p.directions[0]!),
      shifts: parts.map((p) => p.shifts[0]!),
      offsets: parts.map((p) => p.offsets[0]!),
    };
  }

  private listed(list: string[], id: number): string {
    const name = list[idIndex(id)];
    if (!name) throw new Error('No image ' + id.toString(16));
    return name;
  }
}

export { parseFrm };
