// Loading screen with silly tips (client request, 2026-10-28): a deck without repeats, tips in two languages, talking heads and
// backgrounds come from the player's copy.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { drawTip, drawTipFor, HEAD_SCENES, LOADING_TIPS } from '../src/ui/loading-card.ts';

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

describe('loading screen tips', () => {
  it('the deck shows every tip once, then a new one starts — and not with the same tip', () => {
    let deck: number[] = [];
    let last = -1;
    const seen: number[] = [];
    for (let i = 0; i < LOADING_TIPS.length; i++) {
      const next = drawTip(deck, LOADING_TIPS.length, last);
      seen.push(next.tip);
      deck = next.deck;
      last = next.tip;
    }
    expect(new Set(seen).size).toBe(LOADING_TIPS.length);
    expect(deck).toEqual([]);
    for (let n = 0; n < 50; n++) expect(drawTip([], LOADING_TIPS.length, last).tip).not.toBe(last);
  });

  it('English puns are not shown in Russian but are shown in English', () => {
    const shown = (lang: 'ru' | 'en') => {
      const seen = new Set<string>();
      let deck: number[] = [];
      let last = -1;
      for (let i = 0; i < LOADING_TIPS.length * 3; i++) {
        const next = drawTipFor(deck, last, lang);
        seen.add(LOADING_TIPS[next.tip]!.text);
        deck = next.deck;
        last = next.tip;
      }
      return seen;
    };
    const ru = shown('ru');
    const en = shown('en');
    for (const tip of LOADING_TIPS) {
      expect(ru.has(tip.text), tip.text).toBe(tip.lang !== 'en');
      expect(en.has(tip.text), tip.text).toBe(true);
    }
  });

  it('a deck from window memory skips foreign numbers', () => {
    expect(drawTip([999, -1, 1.5, 4], LOADING_TIPS.length, -1)).toEqual({ tip: 4, deck: [] });
  });

  it('every tip has Russian and English text and a head with a background', () => {
    // In i18n.ts every tip has two strings: Russian and English.
    const source = fs.readFileSync('src/i18n.ts', 'utf8');
    for (const tip of LOADING_TIPS) {
      expect(source.match(new RegExp(`^\\s+${tip.text}: '`, 'gm'))?.length, tip.text).toBe(2);
      // No head — the "avatar face" meme: question and answer separated by "|".
      if (tip.head) expect(HEAD_SCENES[tip.head], tip.head).toBeTruthy();
      else expect(source.match(new RegExp(`^\\s+${tip.text}: '[^|\\n]+\\|[^|\\n]+',`, 'gm'))?.length, tip.text).toBe(2);
    }
  });

  it.skipIf(!available)('tip heads and backgrounds exist in the player\'s copy', () => {
    const game = openGame(gameDir);
    try {
      for (const [head, back] of Object.entries(HEAD_SCENES)) {
        expect(game.read(`ART${B}HEADS${B}${head}NF1.FRM`), head).toBeTruthy();
        expect(game.read(`ART${B}BACKGRND${B}${back}`), back).toBeTruthy();
      }
    } finally {
      game.close();
    }
  });
});
