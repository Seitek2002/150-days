// Checks on a real game copy. The path is taken from .local/config.json (development mode);
// if there is no copy, the tests are skipped.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { parseFrm } from '../src/formats/frm.ts';
import { parsePalette } from '../src/formats/pal.ts';
import { parseCritterProto, parseItemProto, STAT } from '../src/formats/pro.ts';
import { parseLst, parseMsg } from '../src/formats/text.ts';

const require = createRequire(import.meta.url);
const { openGame, checkGameFolder } = require('../electron/gamefiles.cjs');

let gameDir = '';
try {
  gameDir = JSON.parse(fs.readFileSync('.local/config.json', 'utf8')).gameDir ?? '';
} catch {
  gameDir = '';
}
const available = Boolean(gameDir) && checkGameFolder(gameDir).ok;

describe.skipIf(!available)('the player\'s Fallout 1 copy', () => {
  it('stage 0 files are read', () => {
    const game = openGame(gameDir);
    try {
      expect(parsePalette(game.read('COLOR.PAL'))).toHaveLength(256);
      for (const name of ['ART\\CRITTERS\\MAMRATAA.FRM', 'ART\\CRITTERS\\MAMRATAB.FRM']) {
        const frm = parseFrm(game.read(name));
        expect(frm.directions).toHaveLength(6);
        expect(frm.framesPerDirection).toBeGreaterThan(0);
      }
      const bar = parseFrm(game.read('ART\\INTRFACE\\IFACE.FRM')).directions[0]!.frames[0]!;
      expect(bar.width).toBe(640);
    } finally {
      game.close();
    }
  });

  it('stage 1 prototypes: pistol, ammo, stimpak, cave rat', () => {
    const game = openGame(gameDir);
    try {
      const items = parseLst(game.read('PROTO\\ITEMS\\ITEMS.LST'));
      const pistol = parseItemProto(game.read('PROTO\\ITEMS\\' + items[8 - 1]));
      expect(pistol.weapon).toMatchObject({ minDamage: 5, maxDamage: 12, capacity: 12, ammoPid: 29 });
      const ammo = parseItemProto(game.read('PROTO\\ITEMS\\' + items[29 - 1]));
      expect(ammo.ammo?.quantity).toBeGreaterThan(0);
      const stim = parseItemProto(game.read('PROTO\\ITEMS\\' + items[40 - 1]));
      expect(stim.drug?.stats[0]).toBe(-2);

      const critters = parseLst(game.read('PROTO\\CRITTERS\\CRITTERS.LST'));
      const rat = parseCritterProto(game.read('PROTO\\CRITTERS\\' + critters[48 - 1]));
      expect(rat.stats[STAT.maxHp]).toBeGreaterThan(0);
      expect(rat.experience).toBeGreaterThan(0);
      const names = parseMsg(game.read('TEXT\\ENGLISH\\GAME\\PRO_CRIT.MSG'));
      expect(names.get(rat.messageId)).toBeTruthy();
    } finally {
      game.close();
    }
  });

  it('a nonexistent file and leaving the folder give null', () => {
    const game = openGame(gameDir);
    try {
      expect(game.read('NO\\SUCH.FRM')).toBeNull();
      expect(game.read('..\\..\\secret.txt')).toBeNull();
    } finally {
      game.close();
    }
  });
});
