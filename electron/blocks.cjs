// The block library on disk: the blocks folder with one folder per block — the folder name is the block name. Inside — pictures
// (PNG, JPG; several — variants of one block), a door also has its own sounds (WAV, OGG) and the settings file block.json (written by
// the location editor). Shared code for the Electron window and the dev server. Names are checked: reading and writing only
// inside the blocks folder and only files of these kinds.
const fs = require('node:fs');
const path = require('node:path');

/** Block name (folder name): letters of any language, digits, space, hyphen, underscore, brackets; up to 60 characters. */
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _()-]{0,59}$/u;
/** A file in a block folder: a picture, a sound or settings. */
const FILE = /^[\p{L}\p{N}][\p{L}\p{N} _().-]{0,99}\.(png|jpe?g|wav|ogg|json)$/iu;
/** Larger files are neither read nor written (the game skips pictures over 2048 pixels anyway). */
const MAX_BYTES = 10 * 1024 * 1024;
/** This many folders and files in a folder is enough; we look no further (protection against an accidentally chosen huge folder). */
const MAX_BLOCKS = 2000;
const MAX_FILES = 64;

function folderOf(dir, name) {
  const clean = String(name).trim();
  if (!NAME.test(clean)) throw new Error('Invalid block name: ' + name);
  return path.join(dir, clean);
}

function fileOf(dir, name, file) {
  const clean = String(file).trim();
  if (!FILE.test(clean) || clean.includes('..')) throw new Error('Invalid file name: ' + file);
  return path.join(folderOf(dir, name), clean);
}

/** All blocks: name and files (name, size); foreign folders and files are skipped. */
function listBlocks(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).slice(0, MAX_BLOCKS)) {
    if (!NAME.test(name)) continue;
    const folder = path.join(dir, name);
    if (!fs.statSync(folder).isDirectory()) continue;
    const files = [];
    for (const file of fs.readdirSync(folder).slice(0, MAX_FILES * 4)) {
      if (!FILE.test(file)) continue;
      const stat = fs.statSync(path.join(folder, file));
      if (stat.isFile()) files.push({ file, size: stat.size });
      if (files.length >= MAX_FILES) break;
    }
    out.push({ name, files: files.sort((a, b) => a.file.localeCompare(b.file)) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** A block file (bytes); missing or too large — null. */
function readBlockFile(dir, name, file) {
  const target = fileOf(dir, name, file);
  if (!fs.existsSync(target) || fs.statSync(target).size > MAX_BYTES) return null;
  return fs.readFileSync(target);
}

/** Write a block file (via a temporary one); the block folder is created. Returns the path to the block folder. */
function writeBlockFile(dir, name, file, bytes) {
  const target = fileOf(dir, name, file);
  const data = Buffer.from(bytes);
  if (data.length > MAX_BYTES) throw new Error('File too large');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target + '.tmp', data);
  fs.renameSync(target + '.tmp', target);
  return path.dirname(target);
}

module.exports = { listBlocks, readBlockFile, writeBlockFile, folderOf };
