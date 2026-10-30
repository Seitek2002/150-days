/**
 * Patches for those who already have the game: only the game code (page, window, package.json), without Electron — under a
 * megabyte instead of the whole folder. Saves and settings live in the user's folder and are not changed.
 * Run: npm run patch (builds the game first) → in the "patches" folder of the project:
 *   150-Days-update-<version>-windows.zip — resources/app.asar, extract into the game folder replacing files;
 *   150-Days-update-<version>-mac.zip — the app folder, put inside the application (Contents/Resources) replacing files.
 * Publish on GitHub — npm run release (tools/release.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
export const PATCH_DIR = path.join(root, 'patches');

/** A zip archive from a list of [name inside the archive, data]. Our own, not Compress-Archive: that one writes "\" in names, and the Mac does not understand them. */
function writeZip(file, entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // names in UTF-8
    head.writeUInt16LE(8, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    locals.push(head, nameBuf, packed);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(0x031e, 4); // made "on unix": file permissions are in the high bits of the external attributes
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(date, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(file, Buffer.concat([...locals, centralBuf, end]));
}

/** All files of a folder: [path relative to base with "/", data]. */
function filesOf(dir, base) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesOf(full, `${base}/${e.name}`));
    else out.push([`${base}/${e.name}`, fs.readFileSync(full)]);
  }
  return out;
}

const text = (lines) => Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
/** The instructions file in the archive. */
const HOW_TO = 'HOW TO UPDATE.txt';

function main() {
  fs.mkdirSync(PATCH_DIR, { recursive: true });

  // Windows: the packager puts the game code into one file resources/app.asar (or an app folder if packed without asar).
  const game = path.join(root, 'out', '150 Days-win32-x64', 'resources');
  const asar = path.join(game, 'app.asar');
  const folder = path.join(game, 'app');
  if (!fs.existsSync(asar) && !fs.existsSync(folder)) {
    console.error('No built game for Windows: run npm run package first');
    process.exit(1);
  }
  const win = path.join(PATCH_DIR, `150-Days-update-${version}-windows.zip`);
  writeZip(win, [
    ...(fs.existsSync(asar) ? [['resources/app.asar', fs.readFileSync(asar)]] : filesOf(folder, 'resources/app')),
    [
      HOW_TO,
      text([
        `150 Days — update to version ${version} (Windows).`,
        '',
        'Extract this archive into the game folder (where "150 Days.exe" is): right-click → "Extract All…" →',
        'choose the game folder → "Extract" → "Replace the files in the destination".',
        'Saves and settings are kept separately and will not be lost. The game version is shown at the bottom of the main menu.',
      ]),
    ],
  ]);
  console.log(`Done: ${win} (${(fs.statSync(win).size / 1048576).toFixed(1)} MB)`);

  // Mac: the game code is an app folder inside the application (as tools/package-mac.mjs builds it).
  const mac = path.join(PATCH_DIR, `150-Days-update-${version}-mac.zip`);
  writeZip(mac, [
    ...filesOf(path.join(root, 'dist'), 'app/dist'),
    ...filesOf(path.join(root, 'electron'), 'app/electron'),
    ['app/package.json', fs.readFileSync(path.join(root, 'package.json'))],
    [
      HOW_TO,
      text([
        `150 Days — update to version ${version} (Mac).`,
        '',
        '1. Double-click this archive — a folder with an "app" folder inside appears.',
        '2. Applications → right-click "150 Days" → "Show Package Contents" → Contents → Resources.',
        '3. Drag the "app" folder from the archive there and choose "Replace".',
        '4. Open "Terminal" and paste these two lines one by one, pressing Enter after each:',
        '   xattr -cr "/Applications/150 Days.app"',
        '   codesign --force --deep --sign - "/Applications/150 Days.app"',
        '',
        'Saves and settings are kept separately and will not be lost. The game version is shown at the bottom of the main menu.',
      ]),
    ],
  ]);
  console.log(`Done: ${mac} (${(fs.statSync(mac).size / 1048576).toFixed(1)} MB)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
