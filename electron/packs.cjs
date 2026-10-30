// A location for a friend: "Pack" gathers into one folder (packs/<location name>) the location file and the folders of the
// own blocks used in it; "Unpack" lays such a folder out at the friend's: the location into locations, the blocks into blocks.
// A block with the same name but different content is not overwritten — it arrives under a new name ("… (2)") and the
// location is rewritten to use it. Shared code for the Electron window and the dev server. Only location and block files
// are read and written (with the same checks as theirs).
const fs = require('node:fs');
const path = require('node:path');
const { listLocations, readLocation, writeLocation } = require('./locations.cjs');
const { listBlocks, readBlockFile, writeBlockFile } = require('./blocks.cjs');

/** The location file in a packed folder and the note for the friend. */
const PLACE_FILE = 'place.json';
const README = 'README.txt';
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _()-]{0,59}$/u;
const FORMAT = '150days-location';

const README_TEXT = `A location for "150 Days" — from a friend.

Situation: someone sent you this folder.
Problem: it holds a location and blocks you don't have; placing them by hand takes long.
Solution:
1. Main menu → "Workshop" → "Location editor".
2. "Share…" → "Choose a folder…" → pick this folder.
3. The location appears in the list of variants of its game location, the blocks — in the library.

Situation: you already have a block with the same name, but a different one.
Solution: nothing to do — the new one comes as "… (2)", yours stays as it was.

Situation: you want to play in this location.
Solution: main menu → "Settings" → "Own locations" → pick it; works from a new game.
`;

/**
 * The location file of a packed folder: place.json; packs made by older versions named it differently, so otherwise any
 * other top-level .json file except block.json. None — null.
 */
function findPlaceFile(packDir) {
  const main = path.join(packDir, PLACE_FILE);
  if (fs.existsSync(main)) return main;
  if (!fs.existsSync(packDir)) return null;
  const other = fs
    .readdirSync(packDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json') && e.name.toLowerCase() !== 'block.json')
    .map((e) => e.name)
    .sort()[0];
  return other ? path.join(packDir, other) : null;
}

/** The location's own blocks (b:<name>) from the file's letter table. */
function placeBlocks(file) {
  const names = new Set();
  for (const id of Object.values(file && typeof file.legend === 'object' && file.legend ? file.legend : {})) {
    if (typeof id === 'string' && id.startsWith('b:') && NAME.test(id.slice(2))) names.add(id.slice(2));
  }
  return [...names];
}

/** A free folder name: name, name (2), name (3)… */
function freeName(dir, name) {
  if (!fs.existsSync(path.join(dir, name))) return name;
  for (let k = 2; k < 1000; k++) {
    const next = `${name.slice(0, 54)} (${k})`;
    if (!fs.existsSync(path.join(dir, next))) return next;
  }
  throw new Error('No free name: ' + name);
}

/** Copy a block folder (block files only) from one library to another under the name to. */
function copyBlock(fromDir, name, toDir, to) {
  const entry = listBlocks(fromDir).find((b) => b.name === name);
  if (!entry) return false;
  for (const { file } of entry.files) {
    const bytes = readBlockFile(fromDir, name, file);
    if (bytes) writeBlockFile(toDir, to, file, bytes);
  }
  return true;
}

/** Whether the blocks are identical: the same files with the same content. */
function sameBlock(aDir, bDir, name, otherName) {
  const a = listBlocks(aDir).find((b) => b.name === name);
  const b = listBlocks(bDir).find((x) => x.name === otherName);
  if (!a || !b || a.files.length !== b.files.length) return false;
  return a.files.every((f, i) => {
    const g = b.files[i];
    if (!g || g.file !== f.file || g.size !== f.size) return false;
    const x = readBlockFile(aDir, name, f.file);
    const y = readBlockFile(bDir, otherName, g.file);
    return !!x && !!y && x.equals(y);
  });
}

/**
 * Pack a saved location: folder packs/<location name> (taken — "(2)") with place.json, the folders of the location's own
 * blocks (blocks/<name>) and README.txt. Returns the folder path, which blocks were taken and which are missing from the library.
 */
function packLocation(dirs, base, name) {
  const file = readLocation(dirs.locations, base, name);
  if (!file) throw new Error('Location not found — save it first');
  fs.mkdirSync(dirs.packs, { recursive: true });
  const packName = freeName(dirs.packs, String(name).trim());
  const target = path.join(dirs.packs, packName);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, PLACE_FILE), JSON.stringify(file));
  fs.writeFileSync(path.join(target, README), README_TEXT);
  const blocks = [];
  const missing = [];
  for (const block of placeBlocks(file)) {
    if (copyBlock(dirs.blocks, block, path.join(target, 'blocks'), block)) blocks.push(block);
    else missing.push(block);
  }
  return { path: target, blocks, missing };
}

/** Packed locations in the packs folder (folders that hold a location file). */
function listPacks(packsDir) {
  if (!fs.existsSync(packsDir)) return [];
  return fs
    .readdirSync(packsDir)
    .filter((n) => NAME.test(n) && fs.statSync(path.join(packsDir, n)).isDirectory() && findPlaceFile(path.join(packsDir, n)) !== null)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Unpack a location folder: blocks into the library (an identical one exists — not copied; a different one with the same
 * name exists — the new one goes under "… (2)" and the location is rewritten to use it), the location into locations
 * (name taken — "(2)"). Returns the level and name of the location, the new, already present and renamed blocks.
 */
function unpackLocation(dirs, packDir) {
  const placePath = findPlaceFile(packDir);
  if (!placePath || fs.statSync(placePath).size > 8 * 1024 * 1024) throw new Error('The folder has no location (place.json)');
  let file;
  try {
    file = JSON.parse(fs.readFileSync(placePath, 'utf8'));
  } catch {
    throw new Error('The location file is damaged');
  }
  if (!file || file.format !== FORMAT || typeof file.base !== 'string') throw new Error('This is not a location from the editor');
  const packBlocks = path.join(packDir, 'blocks');
  const added = [];
  const same = [];
  const renamed = [];
  const rename = new Map();
  for (const block of placeBlocks(file)) {
    if (!listBlocks(packBlocks).some((b) => b.name === block)) continue;
    const exists = listBlocks(dirs.blocks).some((b) => b.name === block);
    if (exists && sameBlock(packBlocks, dirs.blocks, block, block)) {
      same.push(block);
      continue;
    }
    // The same block already arrived under another name ("… (2)") — use that one.
    const twin = exists ? listBlocks(dirs.blocks).find((b) => b.name.startsWith(`${block.slice(0, 54)} (`) && sameBlock(packBlocks, dirs.blocks, block, b.name)) : undefined;
    const to = twin ? twin.name : exists ? freeName(dirs.blocks, block) : block;
    if (!twin) copyBlock(packBlocks, block, dirs.blocks, to);
    if (to !== block) {
      rename.set(`b:${block}`, `b:${to}`);
      renamed.push([block, to]);
    } else added.push(block);
  }
  if (file.legend && typeof file.legend === 'object') {
    for (const [letter, id] of Object.entries(file.legend)) if (rename.has(id)) file.legend[letter] = rename.get(id);
  }
  // The location name follows the variant rules (no brackets); taken — "… 2".
  const PLACE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,59}$/u;
  const wanted = typeof file.name === 'string' && PLACE_NAME.test(file.name.trim()) ? file.name.trim() : 'Location from a friend';
  const taken = new Set(listLocations(dirs.locations).filter((l) => l.base === file.base).map((l) => l.name));
  let name = wanted;
  for (let k = 2; taken.has(name); k++) name = `${wanted.slice(0, 55)} ${k}`;
  file.name = name;
  writeLocation(dirs.locations, file.base, name, file);
  return { base: file.base, name, added, same, renamed };
}

module.exports = { packLocation, listPacks, unpackLocation, PLACE_FILE };
