// Vault 13 critters: each has an original script, and that script exists in the game copy (no copy — the second part is skipped).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parseLst } from '../src/formats/text.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';

const floors = ['vault13-1', 'vault13-2', 'vault13-3'] as const;
const residents = (id: string) => parseLevelDef(LEVELS[id]!).objects.filter((o) => o.kind === 'npc');

describe('Vault 13 critters', () => {
  it('every critter on every floor has a script', () => {
    for (const id of floors) {
      const npcs = residents(id);
      expect(npcs.length, id).toBeGreaterThan(5);
      for (const o of npcs) expect(o.kind === 'npc' && o.script, `${id}: critter at ${o.x},${o.y}`).toBeTruthy();
    }
  });

  it('there is one Overseer, on the lowest floor, with the OVER script', () => {
    const overseers = floors.flatMap((id) => residents(id).filter((o) => o.kind === 'npc' && o.script === 'OVER').map(() => id));
    expect(overseers).toEqual(['vault13-3']);
  });

  it('the floors have several different scripts (not one for everyone)', () => {
    const scripts = new Set(floors.flatMap((id) => residents(id).map((o) => (o.kind === 'npc' ? o.script : ''))));
    expect(scripts.size).toBeGreaterThanOrEqual(8);
  });

  it('one letter in the marks — one kind of critter and one script', () => {
    for (const id of floors) {
      const marks = LEVELS[id]!.marks ?? {};
      const seen = new Map<string, string>();
      for (const [letter, mark] of Object.entries(marks)) {
        if (mark.kind !== 'npc') continue;
        const key = `${mark.pid}:${mark.script}`;
        expect(seen.get(key), `${id}: "${letter}" repeats "${seen.get(key)}"`).toBeUndefined();
        seen.set(key, letter);
      }
    }
  });
});

const require = createRequire(import.meta.url);
const { openGame, checkGameFolder } = require('../electron/gamefiles.cjs');
let gameDir = '';
try {
  gameDir = JSON.parse(fs.readFileSync('.local/config.json', 'utf8')).gameDir ?? '';
} catch {
  gameDir = '';
}
const available = Boolean(gameDir) && checkGameFolder(gameDir).ok;
const B = String.fromCharCode(92);

describe.skipIf(!available)('Vault 13 critter scripts in the game copy', () => {
  it('each is named in SCRIPTS.LST and exists as an .INT file', () => {
    const game = openGame(gameDir);
    try {
      const names = new Set(parseLst(game.read(`SCRIPTS${B}SCRIPTS.LST`)).map((l: string) => l.split('.')[0]!.trim().toUpperCase()));
      for (const id of floors) {
        for (const o of residents(id)) {
          if (o.kind !== 'npc' || !o.script) continue;
          expect(names.has(o.script.toUpperCase()), `${id}: script ${o.script} is not in SCRIPTS.LST`).toBe(true);
          expect(game.read(`SCRIPTS${B}${o.script.toUpperCase()}.INT`), `${id}: no file ${o.script}.INT`).toBeTruthy();
        }
      }
    } finally {
      game.close();
    }
  });
});
