// Re-converts levels from the configs in this folder and compares them with the level files (src/world/levels).
//   node tools/levels/check.ts                    — all levels in the list: "matches" or how many lines differ
//   node tools/levels/check.ts HUBENT JUNKKILL    — only these configs (file name without .ts)
//   node tools/levels/check.ts --show HUBENT      — show the differing lines
//   node tools/levels/check.ts --write HUBENT     — write the new snapshot into the level file (only this level is replaced)
// The list below is the only place where a config is tied to a map, a floor and a level file; the same list is in README.md.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Entry {
  /** Config file name in this folder (without .ts). */
  config: string;
  /** Original map and floor. */
  map: string;
  elevation: number;
  /** Level file in src/world/levels. */
  source: string;
  /** The level in the repository is finished by hand: differences are expected and are not an error. */
  hand?: boolean;
}

export const LEVELS: readonly Entry[] = [
  { config: 'VAULTENT', map: 'VAULTENT', elevation: 0, source: 'vault15.ts', hand: true },
  { config: 'VAULTBUR', map: 'VAULTBUR', elevation: 0, source: 'vault15.ts', hand: true },
  { config: 'VAULTBUR-1', map: 'VAULTBUR', elevation: 1, source: 'vault15.ts' },
  { config: 'VAULTBUR-2', map: 'VAULTBUR', elevation: 2, source: 'vault15.ts' },
  { config: 'SHADYE', map: 'SHADYE', elevation: 0, source: 'shady-sands.ts', hand: true },
  { config: 'SHADYW', map: 'SHADYW', elevation: 0, source: 'shady-sands.ts' },
  { config: 'JUNKENT', map: 'JUNKENT', elevation: 0, source: 'junktown.ts' },
  { config: 'JUNKENT-1', map: 'JUNKENT', elevation: 1, source: 'junktown.ts' },
  { config: 'JUNKKILL', map: 'JUNKKILL', elevation: 0, source: 'junktown.ts' },
  { config: 'JUNKCSNO', map: 'JUNKCSNO', elevation: 0, source: 'junktown.ts' },
  { config: 'HUBENT', map: 'HUBENT', elevation: 0, source: 'hub.ts' },
  { config: 'HUBDWNTN', map: 'HUBDWNTN', elevation: 0, source: 'hub.ts' },
  { config: 'HUBDWNTN-1', map: 'HUBDWNTN', elevation: 1, source: 'hub.ts' },
  { config: 'HUBOLDTN', map: 'HUBOLDTN', elevation: 0, source: 'hub.ts' },
  { config: 'HUBOLDTN-1', map: 'HUBOLDTN', elevation: 1, source: 'hub.ts' },
  { config: 'HUBHEIGT', map: 'HUBHEIGT', elevation: 0, source: 'hub.ts' },
  { config: 'HUBWATER', map: 'HUBWATER', elevation: 0, source: 'hub.ts' },
  { config: 'RAIDERS', map: 'RAIDERS', elevation: 0, source: 'raiders.ts' },
  { config: 'RAIDERS-1', map: 'RAIDERS', elevation: 1, source: 'raiders.ts' },
  { config: 'HUBMIS1', map: 'HUBMIS1', elevation: 0, source: 'hub.ts' },
  { config: 'HOTEL-1', map: 'HOTEL', elevation: 1, source: 'necropolis.ts' },
  { config: 'HOTEL', map: 'HOTEL', elevation: 0, source: 'necropolis.ts' },
  { config: 'HALLDED-1', map: 'HALLDED', elevation: 1, source: 'necropolis.ts' },
  { config: 'HALLDED', map: 'HALLDED', elevation: 0, source: 'necropolis.ts' },
  { config: 'WATRSHD-1', map: 'WATRSHD', elevation: 1, source: 'necropolis.ts' },
  { config: 'WATRSHD', map: 'WATRSHD', elevation: 0, source: 'necropolis.ts' },
  { config: 'VAULT13', map: 'VAULT13', elevation: 0, source: 'vault13.ts' },
  { config: 'VAULT13-1', map: 'VAULT13', elevation: 1, source: 'vault13.ts' },
  { config: 'VAULT13-2', map: 'VAULT13', elevation: 2, source: 'vault13.ts' },
  { config: 'VAULTNEC', map: 'VAULTNEC', elevation: 0, source: 'vault12.ts' },
  { config: 'VAULTNEC-1', map: 'VAULTNEC', elevation: 1, source: 'vault12.ts' },
  { config: 'VAULTNEC-2', map: 'VAULTNEC', elevation: 2, source: 'vault12.ts' },
  { config: 'BROHDENT', map: 'BROHDENT', elevation: 0, source: 'brotherhood.ts', hand: true },
  { config: 'BROHD12', map: 'BROHD12', elevation: 0, source: 'brotherhood.ts' },
  { config: 'BROHD12-1', map: 'BROHD12', elevation: 1, source: 'brotherhood.ts' },
  { config: 'BROHD34', map: 'BROHD34', elevation: 0, source: 'brotherhood.ts' },
  { config: 'BROHD34-1', map: 'BROHD34', elevation: 1, source: 'brotherhood.ts' },
  { config: 'GLOWENT', map: 'GLOWENT', elevation: 0, source: 'glow.ts', hand: true },
  { config: 'GLOW1', map: 'GLOW1', elevation: 0, source: 'glow.ts' },
  { config: 'GLOW1-1', map: 'GLOW1', elevation: 1, source: 'glow.ts' },
  { config: 'GLOW1-2', map: 'GLOW1', elevation: 2, source: 'glow.ts' },
  { config: 'GLOW2', map: 'GLOW2', elevation: 0, source: 'glow.ts' },
  { config: 'GLOW2-1', map: 'GLOW2', elevation: 1, source: 'glow.ts' },
  { config: 'GLOW2-2', map: 'GLOW2', elevation: 2, source: 'glow.ts' },
  { config: 'LAADYTUM', map: 'LAADYTUM', elevation: 0, source: 'boneyard.ts' },
  { config: 'LAADYTUM-1', map: 'LAADYTUM', elevation: 1, source: 'boneyard.ts' },
  { config: 'LABLADES', map: 'LABLADES', elevation: 0, source: 'boneyard.ts' },
  { config: 'LARIPPER', map: 'LARIPPER', elevation: 0, source: 'boneyard.ts' },
  { config: 'LARIPPER-1', map: 'LARIPPER', elevation: 1, source: 'boneyard.ts' },
  { config: 'LARIPPER-2', map: 'LARIPPER', elevation: 2, source: 'boneyard.ts' },
  { config: 'LAGUNRUN', map: 'LAGUNRUN', elevation: 0, source: 'boneyard.ts' },
  { config: 'LAFOLLWR', map: 'LAFOLLWR', elevation: 0, source: 'boneyard.ts' },
  { config: 'LAFOLLWR-1', map: 'LAFOLLWR', elevation: 1, source: 'boneyard.ts' },
  { config: 'DETHCLAW', map: 'DETHCLAW', elevation: 0, source: 'boneyard.ts' },
  { config: 'MBENT', map: 'MBENT', elevation: 0, source: 'mbase.ts', hand: true },
  { config: 'MBSTRG12', map: 'MBSTRG12', elevation: 0, source: 'mbase.ts' },
  { config: 'MBSTRG12-1', map: 'MBSTRG12', elevation: 1, source: 'mbase.ts' },
  { config: 'MBVATS12', map: 'MBVATS12', elevation: 0, source: 'mbase.ts' },
  { config: 'MBVATS12-1', map: 'MBVATS12', elevation: 1, source: 'mbase.ts' },
  { config: 'CHILDRN1', map: 'CHILDRN1', elevation: 0, source: 'cathedral.ts' },
  { config: 'CHILDRN1-1', map: 'CHILDRN1', elevation: 1, source: 'cathedral.ts' },
  { config: 'CHILDRN2', map: 'CHILDRN2', elevation: 0, source: 'cathedral.ts' },
  { config: 'CHILDRN2-1', map: 'CHILDRN2', elevation: 1, source: 'cathedral.ts' },
  { config: 'CHILDRN2-2', map: 'CHILDRN2', elevation: 2, source: 'cathedral.ts' },
  { config: 'MSTRLR12', map: 'MSTRLR12', elevation: 0, source: 'cathedral.ts' },
  { config: 'MSTRLR12-1', map: 'MSTRLR12', elevation: 1, source: 'cathedral.ts' },
  { config: 'MSTRLR34', map: 'MSTRLR34', elevation: 0, source: 'cathedral.ts' },
  { config: 'MSTRLR34-1', map: 'MSTRLR34', elevation: 1, source: 'cathedral.ts' },
  { config: 'CAVES', map: 'CAVES', elevation: 0, source: 'shady-caves.ts' },
  { config: 'V13ENT', map: 'V13ENT', elevation: 0, source: 'cave.ts', hand: true },
  { config: 'DESCRVN1', map: 'DESCRVN1', elevation: 0, source: 'encounters.ts' },
  { config: 'DESCRVN2', map: 'DESCRVN2', elevation: 0, source: 'encounters.ts' },
  { config: 'DESCRVN3', map: 'DESCRVN3', elevation: 0, source: 'encounters.ts' },
  { config: 'DESCRVN4', map: 'DESCRVN4', elevation: 0, source: 'encounters.ts' },
  { config: 'MNTCRVN1', map: 'MNTCRVN1', elevation: 0, source: 'encounters.ts' },
  { config: 'MNTCRVN2', map: 'MNTCRVN2', elevation: 0, source: 'encounters.ts' },
  { config: 'MNTCRVN3', map: 'MNTCRVN3', elevation: 0, source: 'encounters.ts' },
  { config: 'MNTCRVN4', map: 'MNTCRVN4', elevation: 0, source: 'encounters.ts' },
];

const root = fileURLToPath(new URL('../../', import.meta.url));

/** A level's block in the text: the comment line (two asterisks) above the constant (if any) and the constant itself up to the `};` line. */
function findBlock(text: string, constName: string): { start: number; end: number } | null {
  const head = `export const ${constName}: LevelDef = {`;
  const at = text.indexOf(head);
  if (at < 0) return null;
  const end = text.indexOf('\n};', at);
  if (end < 0) return null;
  let start = at;
  const before = text.slice(0, at).split('\n');
  // The last line before the constant is its comment (`/** … */`).
  if (before.length >= 2 && before[before.length - 2]!.startsWith('/**')) start = at - before[before.length - 2]!.length - 1;
  return { start, end: end + 3 };
}

const args = process.argv.slice(2);
const show = args.includes('--show');
const write = args.includes('--write');
const wanted = args.filter((a) => !a.startsWith('--'));
const chosen = LEVELS.filter((l) => wanted.length === 0 || wanted.includes(l.config));
if (wanted.length > 0 && chosen.length !== wanted.length) {
  console.error('Not in the list: ' + wanted.filter((w) => !LEVELS.some((l) => l.config === w)).join(', '));
  process.exit(1);
}

let bad = 0;
for (const level of chosen) {
  const out = execFileSync(
    process.execPath,
    ['tools/map-to-level.ts', level.map, String(level.elevation), '--config', `tools/levels/${level.config}.ts`],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 },
  ).replace(/\r\n/g, '\n');
  const constName = /export const (\w+): LevelDef/.exec(out)?.[1];
  const file = path.join(root, 'src', 'world', 'levels', level.source);
  const text = fs.readFileSync(file, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const source = text.replace(/\r\n/g, '\n');
  const mine = constName ? findBlock(source, constName) : null;
  const fresh = findBlock(out, constName ?? '');
  if (!constName || !fresh) {
    console.log(`${level.config}: the converter produced no level`);
    bad++;
    continue;
  }
  const newText = out.slice(fresh.start, fresh.end);
  if (!mine) {
    console.log(`${level.config}: ${level.source} has no constant ${constName}`);
    bad++;
    continue;
  }
  const oldText = source.slice(mine.start, mine.end);
  if (oldText === newText) {
    console.log(`${level.config}: matches`);
    continue;
  }
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const inB = new Set(b);
  const inA = new Set(a);
  const onlyA = a.filter((l) => !inB.has(l));
  const onlyB = b.filter((l) => !inA.has(l));
  console.log(`${level.config}: differs: ${a.length} lines in the file, ${b.length} in the snapshot; ${onlyA.length} only in the file, ${onlyB.length} only in the snapshot`);
  if (show) {
    for (const l of onlyA.slice(0, 40)) console.log('  - ' + l.slice(0, 160));
    for (const l of onlyB.slice(0, 40)) console.log('  + ' + l.slice(0, 160));
  }
  if (write) {
    const updated = source.slice(0, mine.start) + newText + source.slice(mine.end);
    fs.writeFileSync(file, eol === '\r\n' ? updated.replace(/\n/g, '\r\n') : updated);
    console.log(`  written to ${level.source}`);
  } else if (!level.hand) bad++;
  else console.log('  (finished by hand: differences are expected)');
}
if (bad > 0 && !write) process.exitCode = 1;
