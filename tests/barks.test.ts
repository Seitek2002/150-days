// Combat barks by speaker class: each class has two lines per occasion in both languages; the class comes from the
// image and the script.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BarkKey } from '../src/game/creature.ts';
import { barkClassOf, barkText, type BarkClass } from '../src/game/barks.ts';
import { setLang, t } from '../src/i18n.ts';

const CLASSES: BarkClass[] = ['raider', 'guard', 'soldier', 'mutant', 'citizen'];
const KEYS: BarkKey[] = ['contact', 'reload', 'cover', 'flankLeft', 'flankRight', 'lost', 'search', 'hurt', 'retreat', 'manDown', 'grenade'];

describe('combat barks', () => {
  // setLang writes the language into the page document; tests have no document.
  beforeAll(() => vi.stubGlobal('document', { documentElement: {} }));
  afterAll(() => {
    setLang('ru');
    vi.unstubAllGlobals();
  });

  it('each class has two different lines per occasion, in Russian and English', () => {
    for (const lang of ['ru', 'en'] as const) {
      setLang(lang);
      for (const cls of CLASSES) {
        for (const key of KEYS) {
          const a = t(barkText(cls, key, 1));
          const b = t(barkText(cls, key, 2));
          expect(a, `${lang} ${cls} ${key}`).not.toMatch(/^bark/);
          expect(b, `${lang} ${cls} ${key}`).not.toMatch(/^bark/);
          expect(a).not.toBe(b);
        }
      }
    }
  });

  it('a bandit does not shout like a soldier: classes have different lines', () => {
    setLang('ru');
    expect(t(barkText('raider', 'contact', 1))).not.toBe(t(barkText('soldier', 'contact', 1)));
    expect(t(barkText('mutant', 'hurt', 1))).not.toBe(t(barkText('guard', 'hurt', 1)));
  });

  it('class: mutant and soldier by image, guards and bandits by script, no script means bandit, the rest are townsfolk', () => {
    expect(barkClassOf('MAMTN2', 'GENMUTAN')).toBe('mutant');
    expect(barkClassOf('NAPOWR', 'HALLGRD')).toBe('soldier');
    expect(barkClassOf('HMLTHR', 'HCHDGRD')).toBe('guard');
    expect(barkClassOf('HMMAXX', 'CRVNENMY')).toBe('raider');
    expect(barkClassOf('HMBMET', 'KHANGRD')).toBe('guard');
    expect(barkClassOf('HMBMET', null)).toBe('raider');
    expect(barkClassOf('NMGRCH', 'HBARTEND')).toBe('citizen');
  });
});
