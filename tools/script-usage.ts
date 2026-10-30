// Which game functions the scripts in the player's copy call, and which of them are already implemented:
// node tools/script-usage.ts  →  table "function, how many scripts, how many calls, implemented or not".
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parseLst } from '../src/formats/text.ts';
import { usedFunctions } from '../src/script/disasm.ts';
import { IMPLEMENTED } from '../src/script/game-functions.ts';
import { IntProgram } from '../src/script/int.ts';
import { FUNCTIONS } from '../src/script/signatures.ts';

const require = createRequire(import.meta.url);
const { openGame } = require('../electron/gamefiles.cjs');

const config = JSON.parse(fs.readFileSync('.local/config.json', 'utf8'));
const game = openGame(config.gameDir);
const B = String.fromCharCode(92);
const names = parseLst(game.read(`SCRIPTS${B}SCRIPTS.LST`)).map((l: string) => l.split('.')[0]!.trim().toUpperCase());

const calls = new Map<string, number>();
const scripts = new Map<string, number>();
for (const name of new Set(names)) {
  if (!name) continue;
  const bytes = game.read(`SCRIPTS${B}${name}.INT`);
  if (!bytes) continue;
  for (const [fn, count] of usedFunctions(new IntProgram(name, bytes))) {
    calls.set(fn, (calls.get(fn) ?? 0) + count);
    scripts.set(fn, (scripts.get(fn) ?? 0) + 1);
  }
}
game.close();

const rows = [...scripts.entries()].sort((a, b) => b[1] - a[1]);
const sig = (fn: string) => Object.values(FUNCTIONS).find((s) => s[0] === fn);
console.log('| Function | Scripts | Calls | Arguments | Result | Implemented |');
console.log('|---|---|---|---|---|---|');
for (const [fn, n] of rows) {
  const s = sig(fn);
  console.log(`| ${fn} | ${n} | ${calls.get(fn)} | ${s?.[1] ?? '?'} | ${s?.[2] ? 'yes' : 'no'} | ${IMPLEMENTED.has(fn) ? 'yes' : ''} |`);
}
