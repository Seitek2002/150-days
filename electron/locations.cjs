// Location variants from the editor on disk: the locations folder with one folder per game level holding variant files
// (<name>.json). Shared code for the Electron window and the dev server. Names are checked: writing and reading only inside
// the locations folder and only the editor's JSON data files.
const fs = require('node:fs');
const path = require('node:path');

const BASE = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Variant name: letters of any language, digits, space, hyphen, underscore; at most 60 characters. */
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,59}$/u;
const FORMAT = '150days-location';
/** Never larger: even the Cathedral with all its floors is under a megabyte. */
const MAX_BYTES = 8 * 1024 * 1024;

function fileOf(dir, base, name) {
  if (!BASE.test(String(base))) throw new Error('Invalid level: ' + base);
  const clean = String(name).trim();
  if (!NAME.test(clean)) throw new Error('Invalid variant name: ' + name);
  return path.join(dir, base, clean + '.json');
}

/** All variants: level, name, when saved. Damaged files and foreign folders are skipped. */
function listLocations(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const base of fs.readdirSync(dir)) {
    if (!BASE.test(base)) continue;
    const folder = path.join(dir, base);
    if (!fs.statSync(folder).isDirectory()) continue;
    for (const file of fs.readdirSync(folder)) {
      const match = /^(.+)\.json$/.exec(file);
      if (!match || !NAME.test(match[1])) continue;
      out.push({ base, name: match[1], savedAt: fs.statSync(path.join(folder, file)).mtime.toISOString() });
    }
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function readLocation(dir, base, name) {
  const file = fileOf(dir, base, name);
  if (!fs.existsSync(file) || fs.statSync(file).size > MAX_BYTES) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Writes via a temporary file. Returns the file path (to show the player where it was saved). */
function writeLocation(dir, base, name, data) {
  const file = fileOf(dir, base, name);
  if (!data || typeof data !== 'object' || data.format !== FORMAT) throw new Error('This is not a location variant');
  const text = JSON.stringify(data);
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('The location variant is too large');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
  return file;
}

/** The choice of own locations (main menu settings): level → variant name; the file choice.json at the root of the locations folder. */
const CHOICE = 'choice.json';

/** Only known fields of the right type: level and name — as for variant files. */
function cleanChoice(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [base, name] of Object.entries(raw).slice(0, 500)) {
    if (BASE.test(base) && typeof name === 'string' && NAME.test(name.trim())) out[base] = name.trim();
  }
  return out;
}

function readChoice(dir) {
  try {
    return cleanChoice(JSON.parse(fs.readFileSync(path.join(dir, CHOICE), 'utf8')));
  } catch {
    return {};
  }
}

function writeChoice(dir, choice) {
  const clean = cleanChoice(choice);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, CHOICE);
  fs.writeFileSync(file + '.tmp', JSON.stringify(clean, null, 2));
  fs.renameSync(file + '.tmp', file);
  return clean;
}

module.exports = { listLocations, readLocation, writeLocation, readChoice, writeChoice };
