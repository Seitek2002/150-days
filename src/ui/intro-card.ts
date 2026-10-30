// The card after the Overseer's speech (new game): why the game has no tutorial — neither the hero nor the player has ever been
// outside, they will have to figure things out themselves (client's idea, 2026-10-24). Lines appear one by one — only
// by opacity, the space for each is taken at once, nothing shifts; with "reduce motion" in the system — all at once.
// A key or click: while not all lines are visible — show them all, then — move on.
import { t } from '../i18n.ts';

/** How long until the next line appears (ms), and the delay before the first. */
const LINE = { first: 400, step: 1500 };
/** The key that skipped the movie is not counted: wait this long before listening. */
const IGNORE_MS = 400;

export function showIntroCard(root: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    root.innerHTML = '<main class="intro-card"><div class="intro-lines"></div><p class="intro-hint"></p></main>';
    const box = root.querySelector('.intro-lines')!;
    const hint = root.querySelector<HTMLElement>('.intro-hint')!;
    hint.textContent = t('introCardHint');
    const lines = t('introCard')
      .split('|')
      .map((text) => {
        const p = document.createElement('p');
        p.className = 'intro-line';
        p.textContent = text;
        box.append(p);
        return p;
      });
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const showAll = () => {
      for (const p of lines) p.classList.add('shown');
      hint.classList.add('shown');
    };
    const timers = still
      ? []
      : [...lines, hint].map((el, i) => window.setTimeout(() => el.classList.add('shown'), LINE.first + i * LINE.step));
    if (still) showAll();
    const opened = performance.now();
    const next = (e: Event) => {
      if (performance.now() - opened < IGNORE_MS) return;
      e.preventDefault();
      if (!lines.every((p) => p.classList.contains('shown'))) {
        timers.forEach((id) => window.clearTimeout(id));
        showAll();
        return;
      }
      window.removeEventListener('keydown', next);
      window.removeEventListener('pointerdown', next);
      resolve();
    };
    window.addEventListener('keydown', next);
    window.addEventListener('pointerdown', next);
  });
}
