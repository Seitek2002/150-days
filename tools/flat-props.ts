// Flat props on our levels: what from the original maps we draw as an upright picture rather than a solid block
// (src/game/blocks.ts), and what is not placed at all. Across all levels (the `original` field and the `elevation` floor).
// Run: node tools/flat-props.ts → docs/data/flat-props.md (on this computer only: it holds names from the copy).
// Sections:
//   containers — boxes and cabinets with no rule in blocks.ts (they open with E);
//   scripted — scenery with a script and no rule (E runs the original script);
//   not placed — scenery without a script that has no block, no marking and no picture (we do not have them at all);
//   picture — grass, trees, rocks, junk (decorOf: meant to be flat);
//   special — stairs, elevators, ropes (their own scenery kind).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createProtoTypes, parseMap } from '../src/formats/map.ts';
import { ITEM_TYPE, OBJ_TYPE, SCENERY_TYPE, idType, parseProto } from '../src/formats/pro.ts';
import { parseLst, parseMsg } from '../src/formats/text.ts';
import { LEVELS } from '../src/world/levels/index.ts';
import { blockShapeOf, decorOf, floorMarkOf, TABLETOP_GOODS, wallSignOf } from '../src/game/blocks.ts';

const require = createRequire(import.meta.url);
const { openGame } = require('../electron/gamefiles.cjs');

const config = JSON.parse(fs.readFileSync('.local/config.json', 'utf8'));
const game = openGame(config.gameDir);
const B = String.fromCharCode(92);
const read = (name: string): Uint8Array | null => game.read(name);
const types = createProtoTypes(read);
const scripts = parseLst(read(`SCRIPTS${B}SCRIPTS.LST`)!).map((line: string) => line.split('.')[0]!.trim().toUpperCase());
const sceneryList = parseLst(read(`PROTO${B}SCENERY${B}SCENERY.LST`)!);
const sceneryArt = parseLst(read(`ART${B}SCENERY${B}SCENERY.LST`)!);
const itemList = parseLst(read(`PROTO${B}ITEMS${B}ITEMS.LST`)!);
const itemArt = parseLst(read(`ART${B}ITEMS${B}ITEMS.LST`)!);
const sceneryNames = parseMsg(read(`TEXT${B}ENGLISH${B}GAME${B}PRO_SCEN.MSG`)!);
const itemNames = parseMsg(read(`TEXT${B}ENGLISH${B}GAME${B}PRO_ITEM.MSG`)!);

const protoOf = (dir: string, list: string[], pid: number) => {
  const file = list[(pid & 0xffffff) - 1];
  const bytes = file ? read(`PROTO${B}${dir}${B}${file}`) : null;
  return bytes ? parseProto(bytes) : null;
};

type Section = 'containers' | 'scripted' | 'not placed' | 'picture' | 'special';
interface Row {
  section: Section;
  art: string;
  name: string;
  pid: number;
  scripts: Set<string>;
  levels: Map<string, number>;
}
const rows = new Map<string, Row>();
const add = (section: Section, art: string, name: string, pid: number, script: string, level: string) => {
  const key = `${section}|${art}`;
  let row = rows.get(key);
  if (!row) rows.set(key, (row = { section, art, name, pid, scripts: new Set(), levels: new Map() }));
  if (script) row.scripts.add(script);
  row.levels.set(level, (row.levels.get(level) ?? 0) + 1);
};
const SPECIAL = ['door', 'stairs', 'elevator', 'rope up', 'rope down'];

const maps = new Map<string, ReturnType<typeof parseMap>>();
for (const def of Object.values(LEVELS)) {
  const original = (def.original ?? '').toUpperCase();
  if (!original || !read(`MAPS${B}${original}.MAP`)) continue;
  let map = maps.get(original);
  if (!map) maps.set(original, (map = parseMap(read(`MAPS${B}${original}.MAP`)!, types)));
  const level = def.id;
  for (const o of map.objects[def.elevation ?? 0] ?? []) {
    if (o.tile < 0) continue;
    const type = idType(o.pid);
    const script = o.scriptId !== -1 && o.scriptIndex >= 0 ? (scripts[o.scriptIndex] ?? '') : '';
    if (type === OBJ_TYPE.item && types.itemType(o.pid) === ITEM_TYPE.container) {
      const proto = protoOf('ITEMS', itemList, o.pid);
      if (proto?.kind !== 'item') continue;
      const art = itemArt[proto.fid & 0xfff] ?? '';
      // Goods on a counter are a stack of boxes; bones and bodies lie on the floor (scene.ts — placeContainers).
      if (TABLETOP_GOODS.test(art) || /bone|body|corps|dead/i.test(art) || blockShapeOf(art)) continue;
      add('containers', art, itemNames.get(proto.messageId) ?? '', o.pid >>> 0, script, level);
      continue;
    }
    if (type !== OBJ_TYPE.scenery) continue;
    const proto = protoOf('SCENERY', sceneryList, o.pid);
    if (proto?.kind !== 'scenery') continue;
    const art = sceneryArt[proto.fid & 0xfff] ?? '';
    const name = sceneryNames.get(proto.messageId) ?? '';
    if (proto.type === SCENERY_TYPE.door) continue;
    if (proto.type !== SCENERY_TYPE.generic) {
      add('special', art, `${name} (${SPECIAL[proto.type] ?? proto.type})`, o.pid >>> 0, script, level);
      continue;
    }
    // Without a script, grass and rocks are a picture (scene.ts — placeFurniture checks them first); with a script, by shape.
    if (!script && decorOf(art)) add('picture', art, name, o.pid >>> 0, '', level);
    else if (blockShapeOf(art) || floorMarkOf(art) || wallSignOf(art)) continue;
    else if (script) add('scripted', art, name, o.pid >>> 0, script, level);
    else add('not placed', art, name, o.pid >>> 0, '', level);
  }
}
game.close();

const ORDER: Section[] = ['containers', 'scripted', 'not placed', 'special', 'picture'];
const out: string[] = ['# Flat props on levels', '', 'Generated by `node tools/flat-props.ts`, do not edit by hand.', ''];
for (const section of ORDER) {
  const list = [...rows.values()].filter((r) => r.section === section).sort((a, b) => sum(b) - sum(a) || a.art.localeCompare(b.art));
  out.push(`## ${section} (kinds ${list.length}, pieces ${list.reduce((s, r) => s + sum(r), 0)})`, '');
  out.push('| Art | Name | Script | Pieces | Levels |', '|---|---|---|---|---|');
  for (const r of list) {
    const levels = [...r.levels].map(([id, n]) => (n > 1 ? `${id}×${n}` : id)).join(', ');
    out.push(`| ${r.art} | ${r.name} | ${[...r.scripts].join(', ')} | ${sum(r)} | ${levels} |`);
  }
  out.push('');
}
fs.mkdirSync('docs/data', { recursive: true });
fs.writeFileSync('docs/data/flat-props.md', out.join('\n'));
console.log(ORDER.map((s) => `${s}: ${[...rows.values()].filter((r) => r.section === s).length}`).join(', '));

function sum(r: Row): number {
  let n = 0;
  for (const v of r.levels.values()) n += v;
  return n;
}
