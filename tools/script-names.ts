// Script names by number from SCRIPTS.LST, and map scripts: node tools/script-names.ts 129 183 184 [--map VAULT13]
// The number is as in the original maps (zero-based). Prints only file names — no script texts here.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parseMapHeader } from '../src/formats/map.ts';
import { parseLst } from '../src/formats/text.ts';

const require = createRequire(import.meta.url);
const { openGame } = require('../electron/gamefiles.cjs');

const config = JSON.parse(fs.readFileSync('.local/config.json', 'utf8'));
const game = openGame(config.gameDir);
const B = String.fromCharCode(92);
const names = parseLst(game.read(`SCRIPTS${B}SCRIPTS.LST`)).map((line: string) => line.split('.')[0]!.trim().toUpperCase());
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--map') {
    const map = args[++i]!.toUpperCase();
    const header = parseMapHeader(game.read(`MAPS${B}${map}.MAP`));
    const index = header.scriptIndex - 1;
    console.log(`map ${map}: script ${index >= 0 ? `${index} ${names[index]}` : 'none'}`);
  } else {
    const n = Number(args[i]);
    console.log(`${n}: ${names[n] ?? '—'}`);
  }
}
game.close();
