// Location config generator: node tools/levels/gen.ts <spec>.json [--dry]
// From the location's maps it finds: exit marks (where to and onto which tile), arrival points (from exits of the location's other levels, from script stairs
// and the map's "entering tile"), stairs and hatches with scripts (move_to to another floor), and writes tools/levels/<MAP>[-<floor>].ts.
// Left to finish by hand: hull/crop/seeds, names, facing at the entries, furniture (skipItems).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createProtoTypes, hexToPlan, parseMap } from '../../src/formats/map.ts';
import { OBJ_TYPE, SCENERY_TYPE, idType } from '../../src/formats/pro.ts';
import { parseLst } from '../../src/formats/text.ts';
import { IntProgram } from '../../src/script/int.ts';
import { listing } from '../../src/script/disasm.ts';

const require = createRequire(import.meta.url);
const { openGame } = require('../../electron/gamefiles.cjs');
const root = fileURLToPath(new URL('../../', import.meta.url));
const cfg = JSON.parse(fs.readFileSync(root + '.local/config.json', 'utf8'));
const game = openGame(cfg.gameDir);
const B = String.fromCharCode(92);
const read = (n: string) => game.read(n);
const types = createProtoTypes(read);
const MAP_NAMES = 'DESERT1 DESERT2 DESERT3 HALLDED HOTEL WATRSHD VAULT13 VAULTENT VAULTBUR VAULTNEC JUNKENT JUNKCSNO JUNKKILL BROHDENT BROHD12 BROHD34 CAVES CHILDRN1 CHILDRN2 CITY1 COAST1 COAST2 COLATRUK FSAUSER RAIDERS SHADYE SHADYW GLOWENT LAADYTUM LAFOLLWR MBENT MBSTRG12 MBVATS12 MSTRLR12 MSTRLR34 V13ENT HUBENT DETHCLAW HUBDWNTN HUBHEIGT HUBOLDTN HUBWATER GLOW1 GLOW2 LABLADES LARIPPER LAGUNRUN CHILDEAD MBDEAD MOUNTN1 MOUNTN2 FOOT TARDIS TALKCOW USEDCAR BRODEAD DESCRVN1 DESCRVN2 MNTCRVN1 MNTCRVN2 VIPERS DESCRVN3 MNTCRVN3 DESCRVN4 MNTCRVN4 HUBMIS1'.split(' ');
const EXIT_LETTERS = 'YZWUTQPNMKJHGFE';
const scriptNames = parseLst(read(`SCRIPTS${B}SCRIPTS.LST`)!).map((l: string) => l.split('.')[0]!.trim().toUpperCase());

const specFile = process.argv[2]!;
const dry = process.argv.includes('--dry');
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8')) as {
  worldKey: string;
  music: string;
  /** Transitions via load_map: the script on the stairs/hatch, from where, to where, and at which script on that level the hero appears. */
  links?: { script: string; from: string; to: string; arriveAt?: string; arriveTile?: number }[];
  levels: { music?: string; map: string; elev: number; id: string; const: string; ru: string; en: string; doc: string; outdoor?: boolean; wallTexture?: string; hull?: boolean; floor?: string; ceiling?: string; fade?: number; skipItems?: number[]; extra?: Record<string, string> }[];
};
const key = (map: string, elev: number) => `${map}:${elev}`;
const levelOf = new Map(spec.levels.map((l) => [key(l.map, l.elev), l]));

/** Where a stairs script moves the hero: the tile and floor from `move_to(dude_obj, tile, floor)`. */
const moveCache = new Map<string, { tile: number; elev: number } | null>();
function moveTarget(script: string): { tile: number; elev: number } | null {
  if (moveCache.has(script)) return moveCache.get(script)!;
  let found: { tile: number; elev: number } | null = null;
  const bytes = read(`SCRIPTS${B}${script}.INT`);
  if (bytes) {
    const lines = listing(new IntProgram(script, bytes)).split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!/\bmove_to\b/.test(lines[i]!)) continue;
      const pushes: number[] = [];
      for (let j = i - 1; j >= 0 && pushes.length < 2; j--) {
        const m = /^\s*\d+\s+push (\d+)\s*$/.exec(lines[j]!);
        if (m) pushes.unshift(Number(m[1]));
        else if (/dude_obj/.test(lines[j]!)) break;
      }
      if (pushes.length === 2 && pushes[1]! <= 2 && pushes[0]! > 0) {
        found = { tile: pushes[0]!, elev: pushes[1]! };
        break;
      }
    }
  }
  moveCache.set(script, found);
  return found;
}

interface Frame { x0: number; y0: number }
const maps = new Map<string, ReturnType<typeof parseMap>>();
const mapOf = (name: string) => {
  if (!maps.has(name)) maps.set(name, parseMap(read(`MAPS${B}${name}.MAP`)!, types));
  return maps.get(name)!;
};
function frameOf(name: string, elev: number): Frame {
  const m = mapOf(name);
  const objects = (m.objects[elev] ?? []).filter((o) => o.tile >= 0);
  const points = objects.map((o) => hexToPlan(o.tile));
  if (m.header.enteringElevation === elev && m.header.enteringTile >= 0) points.push(hexToPlan(m.header.enteringTile));
  return { x0: Math.floor(Math.min(...points.map((p) => p.x))) - 3, y0: Math.floor(Math.min(...points.map((p) => p.y))) - 3 };
}

// ---- what arrives on which levels ----
const arrivals = new Map<string, Set<number>>(); // level key → arrival tiles
const addArrival = (k: string, tile: number) => {
  if (!arrivals.has(k)) arrivals.set(k, new Set());
  arrivals.get(k)!.add(tile);
};
interface Link { level: (typeof spec.levels)[number]; cell: [number, number]; script: string; target: { tile: number; elev: number } }
const links = new Map<string, Link[]>();
const doorExits = new Map<string, Map<string, { map: string; entry: string }>>();
/** Cell (tile) of the first object with script `script` on level `k` ("MAP:floor"). */
function scriptTile(k: string, script: string): { tile: number; plan: { x: number; y: number } } | null {
  const [mp, el] = k.split(':');
  const m = mapOf(mp!);
  const all = (m.objects[Number(el)] ?? []).filter((o) => o.tile >= 0 && o.scriptIndex > 0 && o.scriptId !== -1 && scriptNames[o.scriptIndex] === script);
  if (all.length === 0) return null;
  const pts = all.map((o) => ({ o, p: hexToPlan(o.tile) }));
  const cx = pts.reduce((a, q) => a + q.p.x, 0) / pts.length;
  const cy = pts.reduce((a, q) => a + q.p.y, 0) / pts.length;
  const best = [...pts].sort((a, b) => Math.hypot(a.p.x - cx, a.p.y - cy) - Math.hypot(b.p.x - cx, b.p.y - cy))[0]!;
  return { tile: best.o.tile, plan: best.p };
}
const notes: string[] = [];
for (const l of spec.levels) {
  const m = mapOf(l.map);
  const objects = (m.objects[l.elev] ?? []).filter((o) => o.tile >= 0);
  for (const o of objects) {
    if (o.exit && o.exit.map >= 0) {
      const dest = levelOf.get(key(MAP_NAMES[o.exit.map]!, o.exit.elevation));
      if (dest) addArrival(key(dest.map, dest.elev), o.exit.tile);
      else notes.push(`${l.map}:${l.elev}: exit to ${MAP_NAMES[o.exit.map]} floor ${o.exit.elevation}: the spec has no such level`);
    }
  }
  // Doors with a teleport script (move_to in use_p_proc).
  const doorMap = new Map<string, { map: string; entry: string }>();
  for (const o of objects) {
    if (idType(o.pid) !== OBJ_TYPE.scenery || o.scriptIndex <= 0 || o.scriptId === -1) continue;
    if (types.sceneryType(o.pid) !== SCENERY_TYPE.door) continue;
    const script = scriptNames[o.scriptIndex]!;
    const target = moveTarget(script);
    if (!target) continue;
    const dest = levelOf.get(key(l.map, target.elev));
    if (!dest) {
      notes.push(l.map + ':' + l.elev + ': door ' + script + ' leads to floor ' + target.elev + ', the spec has no such level');
      continue;
    }
    addArrival(key(dest.map, dest.elev), target.tile);
    doorMap.set(script, { map: dest.id, entry: 't' + target.tile });
  }
  doorExits.set(key(l.map, l.elev), doorMap);
  // Stairs and hatches with scripts.
  const groups = new Map<string, { objs: ReturnType<typeof hexToPlan>[]; target: { tile: number; elev: number } }>();
  for (const o of objects) {
    if (idType(o.pid) !== OBJ_TYPE.scenery || o.scriptIndex <= 0 || o.scriptId === -1) continue;
    const kind = types.sceneryType(o.pid);
    if (kind !== SCENERY_TYPE.stairs && kind !== SCENERY_TYPE.ladderUp && kind !== SCENERY_TYPE.ladderDown && kind !== SCENERY_TYPE.elevator) continue;
    const script = scriptNames[o.scriptIndex]!;
    const target = moveTarget(script);
    if (!target) {
      notes.push(`${l.map}:${l.elev}: script ${script} on the stairs: no move found`);
      continue;
    }
    const gk = `${script}|${target.tile}|${target.elev}`;
    if (!groups.has(gk)) groups.set(gk, { objs: [], target });
    groups.get(gk)!.objs.push(hexToPlan(o.tile));
  }
  const f = frameOf(l.map, l.elev);
  const list: Link[] = [];
  for (const [gk, g] of groups) {
    const cx = g.objs.reduce((a, p) => a + p.x, 0) / g.objs.length;
    const cy = g.objs.reduce((a, p) => a + p.y, 0) / g.objs.length;
    const pick = [...g.objs].sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0]!;
    const dest = levelOf.get(key(l.map, g.target.elev));
    if (!dest) {
      notes.push(`${l.map}:${l.elev}: stairs ${gk} lead to floor ${g.target.elev}, the spec has no such level`);
      continue;
    }
    addArrival(key(dest.map, dest.elev), g.target.tile);
    list.push({ level: l, cell: [Math.floor((pick.x - f.x0) / 2) + 0.5, Math.floor((pick.y - f.y0) / 2) + 0.5], script: gk.split('|')[0]!, target: g.target });
  }
  for (const ln of spec.links ?? []) {
    if (ln.from !== key(l.map, l.elev)) continue;
    const src = scriptTile(ln.from, ln.script);
    const dst = levelOf.get(ln.to);
    const at = ln.arriveTile !== undefined ? { tile: ln.arriveTile, plan: hexToPlan(ln.arriveTile) } : scriptTile(ln.to, ln.arriveAt!);
    if (!src || !dst || !at) {
      notes.push('transition ' + ln.script + ': object or level not found');
      continue;
    }
    addArrival(ln.to, at.tile);
    list.push({ level: l, cell: [Math.floor((src.plan.x - f.x0) / 2) + 0.5, Math.floor((src.plan.y - f.y0) / 2) + 0.5], script: ln.script, target: { tile: at.tile, elev: dst.elev } });
  }
  links.set(key(l.map, l.elev), list);
}

// ---- config files ----
const q = (s: string) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
for (const l of spec.levels) {
  const m = mapOf(l.map);
  const objects = (m.objects[l.elev] ?? []).filter((o) => o.tile >= 0);
  // exit marks, in the same order as the converter's
  const groups: { map: number; elevation: number; tile: number }[] = [];
  let hasWorld = false;
  for (const o of objects) {
    if (!o.exit) continue;
    if (o.exit.map < 0) {
      hasWorld = true;
      continue;
    }
    if (!groups.some((g) => g.map === o.exit!.map && g.elevation === o.exit!.elevation && g.tile === o.exit!.tile)) groups.push({ map: o.exit.map, elevation: o.exit.elevation, tile: o.exit.tile });
  }
  const marks: string[] = [];
  if (hasWorld) marks.push(`    X: "{ kind: 'exit', to: { map: 'wasteland', entry: '${spec.worldKey}' } }",`);
  groups.forEach((g, i) => {
    const dest = levelOf.get(key(MAP_NAMES[g.map]!, g.elevation));
    if (dest) marks.push(`    ${EXIT_LETTERS[i]}: "{ kind: 'exit', to: { map: '${dest.id}', entry: 't${g.tile}' } }",`);
  });
  const entries: string[] = [];
  const entering = m.header.enteringElevation === l.elev && m.header.enteringTile >= 0;
  const arrive = [...(arrivals.get(key(l.map, l.elev)) ?? [])].sort((a, b) => a - b);
  // Entering tile 20100 is the "default" (the middle of the map); we treat it as a real point only if the level has no other arrivals.
  if (entering && (m.header.enteringTile !== 20100 || arrive.length === 0)) entries.push(`    ${hasWorld ? 'wasteland' : 'start'}: { tile: ${m.header.enteringTile}, facing: 'south' },`);
  for (const t of arrive) entries.push(`    t${t}: { tile: ${t}, facing: 'south' },`);
  const extra = (links.get(key(l.map, l.elev)) ?? []).map((k) => {
    const dest = (spec.links ?? []).find((x) => x.script === k.script && x.from === key(l.map, l.elev)) ? levelOf.get(spec.links!.find((x) => x.script === k.script && x.from === key(l.map, l.elev))!.to)! : levelOf.get(key(l.map, k.target.elev))!;
    return `    // Ladder or hatch (script ${k.script} in the original): press E.\n    (o) => \`{ kind: 'exit', x: \${${k.cell[0]} - o.ox}, y: \${${k.cell[1]} - o.oy}, use: true, to: { map: '${dest.id}', entry: 't${k.target.tile}' } },\`,`;
  });
  const file = l.elev === 0 ? `${l.map}.ts` : `${l.map}-${l.elev}.ts`;
  const body = [
    `// ${l.en} (${l.map}, floor ${l.elev}) → ${l.id}.`,
    "import type { LevelConfig } from '../map-to-level.ts';",
    '',
    'const config: LevelConfig = {',
    `  id: ${q(l.id)},`,
    `  constName: ${q(l.const)},`,
    `  title: { ru: ${q(l.ru)}, en: ${q(l.en)} },`,
    `  doc: ${q(l.doc)},`,
    `  music: ${q(l.music ?? spec.music)},`,
    ...(l.outdoor ? ['  outdoor: true,'] : []),
    ...(l.wallTexture ? [`  wallTexture: ${q(l.wallTexture)},`] : []),
    ...(l.floor ? [`  floor: ${q(l.floor)},`] : []),
    ...(l.ceiling ? [`  ceiling: ${q(l.ceiling)},`] : []),
    ...(l.fade !== undefined ? [`  fade: ${l.fade},`] : []),
    '  blockers: [0x02000043, 0x02000158],',
    `  skipItems: [${(l.skipItems ?? [0x94, 0x96]).map((v) => '0x' + v.toString(16)).join(', ')}],`,
    ...(l.hull ? ['  hull: true,'] : []),
    ...((doorExits.get(key(l.map, l.elev))?.size ?? 0) > 0 ? ['  // The original\'s doors that move the hero to another floor become exits used with E.', '  doorExits: {', ...[...doorExits.get(key(l.map, l.elev))!].map(([sc, d]) => `    ${sc}: { map: ${q(d.map)}, entry: ${q(d.entry)} },`), '  },'] : []),
    ...(l.extra ? Object.entries(l.extra).map(([k, v]) => `  ${k}: ${v},`) : []),
    ...(marks.length ? ['  marks: {', ...marks, '  },'] : []),
    '  entries: {',
    ...entries,
    '  },',
    ...(extra.length ? ['  // Stairs and hatches (used with E) must be reachable.', `  reach: [${(links.get(key(l.map, l.elev)) ?? []).map((k) => `[${Math.floor(k.cell[0])}, ${Math.floor(k.cell[1])}]`).join(', ')}],`, '  extraObjects: [', ...extra, '  ],'] : []),
    '};',
    '',
    'export default config;',
    '',
  ].join('\n');
  if (dry) console.log('=== ' + file + '\n' + body);
  else if (!fs.existsSync(root + 'tools/levels/' + file) || process.argv.includes('--force')) {
    fs.writeFileSync(root + 'tools/levels/' + file, body);
    console.log('written', file);
  } else console.log('already exists', file, '(--force to overwrite)');
}
for (const n of notes) console.log('! ' + n);
game.close();
