/**
 * Mac build on Windows: out/150 Days-mac-apple.tar.gz (Apple chip, M1 and newer) and out/150 Days-mac-intel.tar.gz.
 * Run: npm run package:mac
 *
 * The Electron packager on Windows does not build the Mac version: a Mac app contains links (symlinks), and Windows
 * without administrator rights does not allow creating them. So we build the archive ourselves without unpacking files to
 * disk: take the prebuilt Electron for Mac (a zip with links), rename the app to "150 Days", put our game into
 * Contents/Resources/app and write a tar.gz — links in it stay links. There is no Apple signature: how to open it on a
 * Mac — docs/PLAY-ON-MAC.md.
 * Fan game: we do not put a copy of Fallout 1 into the build; the player points to their own on first launch.
 */
import { downloadArtifact } from '@electron/get';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
const APP = '150 Days.app';

/** Zip entries: name, permissions (from the unix "external attributes"), data. */
function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a zip: ' + file);
  let count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  // zip64: entry count and offset are in a separate record.
  if (count === 0xffff || offset === 0xffffffff) {
    const loc = buf.readUInt32LE(eocd - 20) === 0x07064b50 ? Number(buf.readBigUInt64LE(eocd - 20 + 8)) : -1;
    if (loc < 0) throw new Error('zip64 without a locator');
    count = Number(buf.readBigUInt64LE(loc + 32));
    offset = Number(buf.readBigUInt64LE(loc + 48));
  }
  const entries = [];
  let p = offset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupted zip directory');
    const method = buf.readUInt16LE(p + 10);
    let compSize = buf.readUInt32LE(p + 20);
    let size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const attrs = buf.readUInt32LE(p + 38);
    let local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    // Large values are in the zip64 extra field.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = buf.readUInt16LE(e);
      const len = buf.readUInt16LE(e + 2);
      if (id === 1) {
        let q = e + 4;
        if (size === 0xffffffff) (size = Number(buf.readBigUInt64LE(q)), (q += 8));
        if (compSize === 0xffffffff) (compSize = Number(buf.readBigUInt64LE(q)), (q += 8));
        if (local === 0xffffffff) local = Number(buf.readBigUInt64LE(q));
      }
      e += 4 + len;
    }
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (!data) throw new Error(`Compression ${method} is not supported: ${name}`);
    if (data.length !== size) throw new Error('Wrong size: ' + name);
    entries.push({ name, mode: attrs >>> 16, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Tar archive (ustar + PAX for long names). */
class Tar {
  chunks = [];
  header(name, type, size, mode, linkname = '') {
    // A long or non-ASCII name goes into a PAX extended header, which every unpacker reads.
    const plain = (s) => Buffer.byteLength(s) <= 99 && /^[\x20-\x7e]*$/.test(s);
    const long = !plain(name) || !plain(linkname);
    if (long) {
      const rec = (k, v) => {
        const body = ` ${k}=${v}\n`;
        let len = Buffer.byteLength(body) + 1;
        while (String(len).length + Buffer.byteLength(body) !== len) len = String(len).length + Buffer.byteLength(body);
        return `${len}${body}`;
      };
      const pax = Buffer.from(rec('path', name) + (linkname ? rec('linkpath', linkname) : ''));
      this.block('PaxHeader', 'x', pax.length, 0o644, '');
      this.data(pax);
    }
    this.block(long ? name.slice(0, 99) : name, type, size, mode, long ? linkname.slice(0, 99) : linkname);
  }
  block(name, type, size, mode, linkname) {
    const h = Buffer.alloc(512);
    const put = (s, off, len) => h.write(s, off, len, 'utf8');
    const oct = (n, off, len) => put(n.toString(8).padStart(len - 1, '0') + '\0', off, len);
    put(name, 0, 100);
    oct(mode, 100, 8);
    oct(0, 108, 8);
    oct(0, 116, 8);
    oct(size, 124, 12);
    oct(Math.floor(Date.now() / 1000), 136, 12);
    h.fill(' ', 148, 156);
    put(type, 156, 1);
    put(linkname, 157, 100);
    put('ustar\0', 257, 6);
    put('00', 263, 2);
    let sum = 0;
    for (const b of h) sum += b;
    put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    this.chunks.push(h);
  }
  data(buf) {
    this.chunks.push(buf);
    const pad = (512 - (buf.length % 512)) % 512;
    if (pad) this.chunks.push(Buffer.alloc(pad));
  }
  dir(name) {
    this.header(name.endsWith('/') ? name : name + '/', '5', 0, 0o755);
  }
  file(name, buf, mode) {
    this.header(name, '0', buf.length, mode);
    this.data(buf);
  }
  link(name, target) {
    this.header(name, '2', 0, 0o755, target);
  }
  finish() {
    this.chunks.push(Buffer.alloc(1024));
    return Buffer.concat(this.chunks);
  }
}

/** Our game for Contents/Resources/app: the built page, the window and package.json (as in the Windows build). */
function gameFiles() {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(full, r);
      else out.push([r, fs.readFileSync(full)]);
    }
  };
  walk(path.join(root, 'dist'), 'dist');
  walk(path.join(root, 'electron'), 'electron');
  out.push(['package.json', fs.readFileSync(path.join(root, 'package.json'))]);
  return out;
}

/** Info.plist: our own name and identifier instead of Electron's (the executable itself stays Electron). */
function renamePlist(xml) {
  const set = (key, value) => {
    const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
    xml = re.test(xml) ? xml.replace(re, `$1${value}$2`) : xml.replace('</dict>\n</plist>', `\t<key>${key}</key>\n\t<string>${value}</string>\n</dict>\n</plist>`);
  };
  set('CFBundleName', '150 Days');
  set('CFBundleDisplayName', '150 Days');
  set('CFBundleIdentifier', 'local.fan.150days');
  return xml;
}

fs.mkdirSync(path.join(root, 'out'), { recursive: true });
const game = gameFiles();
for (const [arch, label] of [
  ['arm64', 'apple'],
  ['x64', 'intel'],
]) {
  const zipPath = await downloadArtifact({ version, platform: 'darwin', arch, artifactName: 'electron' });
  const tar = new Tar();
  const dirs = new Set();
  const ensureDirs = (name) => {
    const parts = name.split('/');
    for (let i = 1; i < parts.length; i++) {
      const d = parts.slice(0, i).join('/');
      if (!dirs.has(d)) {
        dirs.add(d);
        tar.dir(d);
      }
    }
  };
  for (const e of readZip(zipPath)) {
    if (!e.name.startsWith('Electron.app/')) continue;
    if (e.name.endsWith('Contents/Resources/default_app.asar')) continue;
    const name = APP + e.name.slice('Electron.app'.length);
    const kind = e.mode & 0o170000;
    if (e.name.endsWith('/')) {
      const d = name.replace(/\/$/, '');
      ensureDirs(d + '/x');
      continue;
    }
    ensureDirs(name);
    if (kind === 0o120000) tar.link(name, e.data.toString('utf8'));
    else if (e.name === 'Electron.app/Contents/Info.plist') tar.file(name, Buffer.from(renamePlist(e.data.toString('utf8'))), 0o644);
    else tar.file(name, e.data, (e.mode & 0o777) || 0o644);
  }
  for (const [rel, data] of game) {
    const name = `${APP}/Contents/Resources/app/${rel}`;
    ensureDirs(name);
    tar.file(name, data, 0o644);
  }
  const archive = path.join(root, 'out', `150 Days-mac-${label}.tar.gz`);
  fs.writeFileSync(archive, zlib.gzipSync(tar.finish(), { level: 6 }));
  console.log(`Done: ${archive} (${(fs.statSync(archive).size / 1048576).toFixed(0)} MB)`);
}
