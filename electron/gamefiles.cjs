// Reading files from the player's copy of Fallout 1: the master.dat / critter.dat archives (DAT1 format)
// and loose files from the data folder (they take priority over the archives — Fallout itself does the same).
// Our game contains no Fallout files: everything is taken from here, from the player's computer.
const fs = require('node:fs');
const path = require('node:path');

/** LZSS decompression from DAT1: a 4096-byte ring buffer filled with spaces, starting at 4078. */
function lzss(src) {
  const ring = Buffer.alloc(4096, 0x20);
  let ri = 4078;
  const out = [];
  let i = 0;
  while (i < src.length) {
    const flags = src[i++];
    for (let bit = 0; bit < 8 && i < src.length; bit++) {
      if (flags & (1 << bit)) {
        const b = src[i++];
        out.push(b);
        ring[ri] = b;
        ri = (ri + 1) & 0xfff;
      } else {
        if (i + 1 >= src.length) return Buffer.from(out);
        const lo = src[i++];
        const hi = src[i++];
        const offset = lo | ((hi & 0xf0) << 4);
        const length = (hi & 0x0f) + 3;
        for (let k = 0; k < length; k++) {
          const b = ring[(offset + k) & 0xfff];
          out.push(b);
          ring[ri] = b;
          ri = (ri + 1) & 0xfff;
        }
      }
    }
  }
  return Buffer.from(out);
}

/** A name inside the archive: "ART\CRITTERS\X.FRM", ignoring case and the kind of slash. */
function normalize(name) {
  return name.replace(/\//g, '\\').replace(/^\\+/, '').toUpperCase();
}

class Dat1 {
  constructor(file) {
    this.fd = fs.openSync(file, 'r');
    this.entries = new Map();
    const size = fs.fstatSync(this.fd).size;
    // The index lies at the start of the archive; read with a margin and read more if it is not enough.
    let head = this.readAt(0, Math.min(size, 4 * 1024 * 1024));
    let p = 0;
    const need = (n) => {
      if (p + n > head.length) head = this.readAt(0, Math.min(size, head.length * 2 + n));
      if (p + n > head.length) throw new Error('Damaged archive: ' + file);
    };
    const u32 = () => {
      need(4);
      const v = head.readUInt32BE(p);
      p += 4;
      return v;
    };
    const str = () => {
      need(1);
      const len = head[p++];
      need(len);
      const s = head.toString('latin1', p, p + len);
      p += len;
      return s;
    };
    const dirCount = u32();
    u32(); u32(); u32();
    const dirs = [];
    for (let d = 0; d < dirCount; d++) dirs.push(str());
    for (const dir of dirs) {
      const count = u32();
      u32(); u32(); u32();
      for (let f = 0; f < count; f++) {
        const name = str();
        const flags = u32();
        const offset = u32();
        const length = u32();
        const packed = u32();
        const key = normalize(dir === '.' ? name : dir + '\\' + name);
        this.entries.set(key, { flags, offset, length, packed });
      }
    }
  }

  readAt(offset, length) {
    const buf = Buffer.alloc(length);
    fs.readSync(this.fd, buf, 0, length, offset);
    return buf;
  }

  read(name) {
    const e = this.entries.get(normalize(name));
    if (!e) return null;
    const kind = (e.flags || 16) & 0xf0;
    if (kind === 32) return this.readAt(e.offset, e.length);
    if (kind === 16) return lzss(this.readAt(e.offset, e.packed)).subarray(0, e.length);
    // 64: the data is cut into blocks, each preceded by a 16-bit length.
    const parts = [];
    let total = 0;
    let pos = e.offset;
    while (total < e.length) {
      const n = this.readAt(pos, 2).readUInt16BE(0);
      pos += 2;
      const chunkLength = n & 0x7fff;
      const raw = this.readAt(pos, chunkLength);
      pos += chunkLength;
      const part = n & 0x8000 ? raw : lzss(raw);
      parts.push(part);
      total += part.length;
    }
    return Buffer.concat(parts).subarray(0, e.length);
  }

  close() {
    fs.closeSync(this.fd);
  }
}

/** Folder check: does it contain both Fallout 1 archives. */
function checkGameFolder(dir) {
  if (!dir) return { ok: false, reason: 'empty' };
  const has = (n) => fs.existsSync(path.join(dir, n));
  if (!fs.existsSync(dir)) return { ok: false, reason: 'missing' };
  if (!has('master.dat') || !has('critter.dat')) return { ok: false, reason: 'no-dat' };
  return { ok: true };
}

/** Opens the game copy. File lookup order: the data folder → critter.dat → master.dat. */
function openGame(dir) {
  const check = checkGameFolder(dir);
  if (!check.ok) throw new Error('Fallout 1 not found: ' + check.reason);
  const master = new Dat1(path.join(dir, 'master.dat'));
  const critter = new Dat1(path.join(dir, 'critter.dat'));
  const patches = path.join(dir, 'data');
  return {
    read(name) {
      const rel = normalize(name);
      if (rel.split('\\').includes('..')) return null;
      const loose = path.join(patches, ...rel.split('\\'));
      if (fs.existsSync(loose) && fs.statSync(loose).isFile()) return fs.readFileSync(loose);
      return critter.read(rel) ?? master.read(rel);
    },
    close() {
      master.close();
      critter.close();
    },
  };
}

module.exports = { lzss, Dat1, openGame, checkGameFolder, normalize };
