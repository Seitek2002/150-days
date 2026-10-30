/**
 * Builds a game folder that can be copied to another computer, plus an archive for sharing:
 * out/150 Days-win32-x64/150 Days.exe and out/150 Days-windows.zip
 * Run: npm run package (for Mac — npm run package:mac, tools/package-mac.mjs)
 * Fan game: we do not put a copy of Fallout 1 into the build; the player points to their own on first launch.
 */
import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// Only the built page (dist), the window (electron) and package.json go into the finished game.
const keep = [/^\/dist($|\/)/, /^\/electron($|\/)/, /^\/package\.json$/];

const paths = await packager({
  dir: root,
  name: '150 Days',
  platform: 'win32',
  arch: 'x64',
  out: `${root}out`,
  overwrite: true,
  prune: false,
  ignore: (path) => path !== '' && !keep.some((rule) => rule.test(path)),
});
console.log(`Done: ${paths.join(', ')}`);

// Archive for sharing (how to run it — docs/PLAY-ON-WINDOWS.md).
const zip = path.join(root, 'out', '150 Days-windows.zip');
fs.rmSync(zip, { force: true });
execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${paths[0]}' -DestinationPath '${zip}'`], { stdio: 'inherit' });
console.log(`Done: ${zip} (${(fs.statSync(zip).size / 1048576).toFixed(0)} MB)`);
