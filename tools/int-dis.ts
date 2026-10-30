// Disassembler for a script from the player's copy: node tools/int-dis.ts OVER
// Writes docs/data/script-<name>.txt (local to this computer only) and prints which game functions the script needs.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { IntProgram } from '../src/script/int.ts';
import { listing, usedFunctions } from '../src/script/disasm.ts';

const require = createRequire(import.meta.url);
const { openGame } = require('../electron/gamefiles.cjs');

const name = (process.argv[2] ?? '').toUpperCase();
if (!name) {
  console.error('Specify a script: node tools/int-dis.ts OVER');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync('.local/config.json', 'utf8'));
const game = openGame(config.gameDir);
const B = String.fromCharCode(92);
const bytes = game.read(`SCRIPTS${B}${name}.INT`);
if (!bytes) {
  console.error('No such script: ' + name);
  process.exit(1);
}
const program = new IntProgram(name, bytes);
fs.mkdirSync('docs/data', { recursive: true });
const out = path.join('docs', 'data', `script-${name}.txt`);
fs.writeFileSync(out, listing(program));
console.log(`Written: ${out}`);
const used = [...usedFunctions(program).entries()].sort((a, b) => b[1] - a[1]);
console.log('Game functions:', used.map(([n, c]) => `${n}×${c}`).join(', '));
game.close();
