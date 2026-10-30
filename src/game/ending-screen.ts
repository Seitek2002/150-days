// The endings screen, as in the original: slides from the player's copy (ART\INTRFACE\SEQ*.FRM, each with its own SEQ*.PAL palette),
// the narrator's voice (SOUND\SPEECH\NARRATOR\NAR_n.ACM) and its subtitles (TEXT\ENGLISH\CUTS\NAR_n.TXT). Which slide and which
// record goes with which outcome is our endingSlides table (src/game/endings.ts). A slide stays while the speech plays, and a bit longer;
// a click or Enter — next, Esc — skip everything. No image, no sound and no text (no files) — the slide is skipped.
import type { Sound } from '../audio/sound.ts';
import { parseFrm } from '../formats/frm.ts';
import { parsePalette } from '../formats/pal.ts';
import { decodeText } from '../formats/text.ts';
import { t } from '../i18n.ts';
import { platform } from '../platform.ts';
import type { EndingSlide } from './endings.ts';

/** How many seconds a slide stays after the speech ends, and how long when there is no sound at all. */
const HOLD_AFTER_VOICE = 1.4;
const HOLD_SILENT = 8;

const STYLE = `
.ending-host { position: fixed; inset: 0; z-index: 30; background: #000; display: grid; grid-template-rows: 1fr auto; place-items: center; cursor: default; }
.ending-frame { width: min(100vw, calc((100vh - 7.5rem) * 4 / 3)); height: auto; aspect-ratio: 4 / 3; display: block; image-rendering: pixelated; }
.ending-subs { box-sizing: border-box; width: min(100vw, 52rem); min-height: 5.5rem; padding: 0.5rem 1rem; margin-bottom: 2rem; text-align: center;
  color: #f2ead8; font: 1.25rem/1.4 var(--font, sans-serif); text-shadow: 0 1px 2px #000; white-space: pre-line; }
.ending-skip { position: fixed; right: 1rem; bottom: 0.6rem; color: #a39a88; font: 0.85rem/1.2 var(--font, sans-serif); }
`;

function ensureStyle(): void {
  if (document.getElementById('ending-style')) return;
  const style = document.createElement('style');
  style.id = 'ending-style';
  style.textContent = STYLE;
  document.head.append(style);
}

/** The slide image with its own palette — onto a 640×480 canvas (no file — null). */
async function loadSlide(name: string): Promise<HTMLCanvasElement | null> {
  const frmPath = `ART\\INTRFACE\\${name}.FRM`;
  if (!(await platform.gameFileExists(frmPath))) return null;
  const [frmRaw, palRaw] = await Promise.all([
    platform.readGameFile(frmPath),
    platform
      .gameFileExists(`ART\\INTRFACE\\${name}.PAL`)
      .then((found) => (found ? platform.readGameFile(`ART\\INTRFACE\\${name}.PAL`) : null))
      .catch(() => null),
  ]);
  const palette = parsePalette(palRaw ?? (await platform.readGameFile('COLOR.PAL')));
  const frame = parseFrm(frmRaw).directions[0]?.frames[0];
  if (!frame) return null;
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(frame.width, frame.height);
  const px = new Uint32Array(image.data.buffer);
  for (let i = 0; i < frame.pixels.length; i++) px[i] = (0xff000000 | palette[frame.pixels[i]!]!) >>> 0;
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** The narrator record's subtitles as its own lines (without the "1:" numbers); no file — ''. */
async function loadNarration(nar: number): Promise<string> {
  const path = `TEXT\\ENGLISH\\CUTS\\NAR_${nar}.TXT`;
  if (!(await platform.gameFileExists(path))) return '';
  const text = decodeText(await platform.readGameFile(path));
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+\s*:/, '').trim())
    .filter(Boolean)
    .join('\n');
}

/** Show the ending slides one by one. Returns when all are shown or the player has skipped them. */
export async function playEndingSlides(parent: HTMLElement, sound: Sound, slides: EndingSlide[]): Promise<void> {
  ensureStyle();
  const host = document.createElement('div');
  host.className = 'ending-host';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  const canvas = document.createElement('canvas');
  canvas.className = 'ending-frame';
  canvas.width = 640;
  canvas.height = 480;
  const subs = document.createElement('div');
  subs.className = 'ending-subs';
  const skip = document.createElement('div');
  skip.className = 'ending-skip';
  skip.textContent = t('endingSkipHint');
  host.append(canvas, subs, skip);
  parent.append(host);
  const ctx = canvas.getContext('2d')!;

  // Click and Enter — next slide, Esc — skip everything. Keys are intercepted before the game.
  let next: (() => void) | null = null;
  let skipAll = false;
  const onKey = (e: KeyboardEvent) => {
    // All keys go only to the slides screen (as with movies): otherwise Enter on the game-over screen would start a new game.
    e.stopImmediatePropagation();
    if (e.code === 'Escape') skipAll = true;
    else if (e.code !== 'Enter' && e.code !== 'Space' && e.code !== 'NumpadEnter') return;
    e.preventDefault();
    next?.();
  };
  const onClick = () => next?.();
  window.addEventListener('keydown', onKey, true);
  host.addEventListener('pointerdown', onClick);

  try {
    for (const slide of slides) {
      if (skipAll) break;
      const [image, text, voice] = await Promise.all([
        slide.image ? loadSlide(slide.image).catch(() => null) : Promise.resolve(null),
        loadNarration(slide.nar).catch(() => ''),
        sound.speech(`SOUND\\SPEECH\\NARRATOR\\NAR_${slide.nar}.ACM`).catch(() => null),
      ]);
      if (!image && !text && !voice) continue;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (image) ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      subs.textContent = text;
      const hold = voice ? voice.duration + HOLD_AFTER_VOICE : HOLD_SILENT;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, hold * 1000);
        function done(): void {
          clearTimeout(timer);
          next = null;
          resolve();
        }
        next = done;
      });
      voice?.stop();
    }
  } finally {
    window.removeEventListener('keydown', onKey, true);
    host.remove();
  }
}
