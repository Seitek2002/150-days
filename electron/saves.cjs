// Game saves on disk: one file per slot (quick, 1…10). Shared code for the Electron window and the dev server.
const fs = require('node:fs');
const path = require('node:path');

const SLOT = /^(quick|[1-9]|10)$/;

function slotFile(dir, slot) {
  if (!SLOT.test(String(slot))) throw new Error('Invalid save slot: ' + slot);
  return path.join(dir, `slot-${slot}.json`);
}

/** The list of saves: slot, when saved, label. Damaged files are skipped. */
function listSaves(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const match = /^slot-(.+)\.json$/.exec(name);
    if (!match || !SLOT.test(match[1])) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      out.push({ slot: match[1], savedAt: String(data.savedAt ?? ''), label: String(data.label ?? '') });
    } catch {
      // A broken file does not affect the others.
    }
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

function readSave(dir, slot) {
  const file = slotFile(dir, slot);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Writes via a temporary file: if the game crashes mid-write, the old save stays intact. */
function writeSave(dir, slot, data) {
  const file = slotFile(dir, slot);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
  return true;
}

module.exports = { listSaves, readSave, writeSave };
