// Original movies (ART\CUTS\*.MVE from the player's copy): full screen, with sound, subtitles (TEXT\ENGLISH\CUTS\*.SVE) and
// fades from the movie's settings file (*.CFG). Esc, space, Enter or a click skips.
import type { Sound } from '../audio/sound.ts';
import { decodeMveAudio, decodeMveFrames, readMveInfo } from '../formats/mve.ts';
import { decodeText } from '../formats/text.ts';
import { t, tf } from '../i18n.ts';
import { padLabels, usingPad } from './gamepad.ts';
import { platform } from '../platform.ts';

/** Script movies (play_gmovie): by number, in the original's order. */
export const SCRIPT_MOVIES = ['IPLOGO', 'MPLOGO', 'INTRO', 'VEXPLD', 'CATHEXP', 'OVRINTRO', 'BOIL3', 'OVRRUN', 'WALKM', 'WALKW', 'DIPEDV', 'BOIL1', 'BOIL2', 'RAEKILLS'];

interface Fade {
  frame: number;
  out: boolean;
  /** Fade color, 0–255. */
  color: [number, number, number];
  steps: number;
}

/** Fades from CFG: [info] effect_frames=…, then a section per frame (fade_type, fade_color 0–63, fade_steps). */
export function parseFades(text: string): Fade[] {
  const sections = new Map<string, Map<string, string>>();
  let current = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split(';')[0]!.trim();
    const head = /^\[(.+)\]$/.exec(line);
    if (head) {
      current = new Map();
      sections.set(head[1]!.trim(), current);
    } else if (line.includes('=')) {
      const at = line.indexOf('=');
      current.set(line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim());
    }
  }
  const frames = (sections.get('info')?.get('effect_frames') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const fades: Fade[] = [];
  for (const f of frames) {
    const s = sections.get(f);
    if (!s) continue;
    const [r = 0, g = 0, b = 0] = (s.get('fade_color') ?? '0,0,0').split(',').map((v) => Math.min(63, Number(v) || 0) * 255 / 63);
    fades.push({ frame: Number(f), out: s.get('fade_type') === 'out', color: [r, g, b], steps: Math.max(1, Number(s.get('fade_steps')) || 1) });
  }
  return fades.sort((a, b) => a.frame - b.frame);
}

/** How much of the frame is covered by the fade color (0 means fully visible, 1 means color only). */
export function fadeAt(fades: readonly Fade[], frame: number): { alpha: number; color: [number, number, number] } {
  let state = { alpha: 0, color: [0, 0, 0] as [number, number, number] };
  for (const f of fades) {
    if (f.frame > frame) break;
    const progress = Math.min(1, (frame - f.frame) / f.steps);
    state = { alpha: f.out ? progress : 1 - progress, color: f.color };
  }
  return state;
}

/** SVE subtitles: lines "frame:text"; the text is visible from that frame until the next line. */
export function parseSubtitles(text: string): { frame: number; text: string }[] {
  const out: { frame: number; text: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s*:(.*)$/.exec(line);
    if (m) out.push({ frame: Number(m[1]), text: m[2]!.trim() });
  }
  return out.sort((a, b) => a.frame - b.frame);
}

const STYLE = `
.movie-host { position: fixed; inset: 0; z-index: 30; background: #000; display: grid; grid-template-rows: 1fr auto; place-items: center; cursor: none; }
.movie-frame { width: min(100vw, calc((100vh - 7.5rem) * 432 / 320)); height: auto; aspect-ratio: 432 / 320; display: block; }
.movie-subs { box-sizing: border-box; width: min(100vw, 52rem); height: 5.5rem; padding: 0.5rem 1rem; margin-bottom: 2rem; text-align: center;
  color: #f2ead8; font: 1.25rem/1.4 var(--font, sans-serif); text-shadow: 0 1px 2px #000; overflow: hidden; }
.movie-skip { position: fixed; right: 1rem; bottom: 0.6rem; color: #a39a88; font: 0.85rem/1.2 var(--font, sans-serif); }
`;

function ensureStyle(): void {
  if (document.getElementById('movie-style')) return;
  const style = document.createElement('style');
  style.id = 'movie-style';
  style.textContent = STYLE;
  document.head.append(style);
}

async function readOptional(name: string): Promise<string> {
  if (!(await platform.gameFileExists(name))) return '';
  return decodeText(await platform.readGameFile(name));
}

/** Play a movie by file name without extension (for example "INTRO"). No file means it ends right away. */
export async function playMovie(parent: HTMLElement, name: string, sound: Sound): Promise<void> {
  const path = `ART\\CUTS\\${name}.MVE`;
  if (!(await platform.gameFileExists(path))) return;
  const [bytes, cfg, sve] = await Promise.all([
    platform.readGameFile(path),
    readOptional(`ART\\CUTS\\${name}.CFG`),
    readOptional(`TEXT\\ENGLISH\\CUTS\\${name}.SVE`),
  ]);
  const info = readMveInfo(bytes);
  if (!info.width || !info.height) return;
  const fades = parseFades(cfg);
  const subtitles = parseSubtitles(sve);

  ensureStyle();
  const host = document.createElement('div');
  host.className = 'movie-host';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  const canvas = document.createElement('canvas');
  canvas.className = 'movie-frame';
  canvas.width = info.width;
  canvas.height = info.height;
  const subs = document.createElement('p');
  subs.className = 'movie-subs';
  subs.setAttribute('aria-live', 'polite');
  const skip = document.createElement('p');
  skip.className = 'movie-skip';
  skip.textContent = usingPad() ? tf('movieSkipPad', padLabels()) : t('movieSkip');
  host.append(canvas, subs, skip);
  parent.append(host);

  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(info.width, info.height);
  const rgba = new Uint32Array(image.data.buffer);
  const colors = new Uint32Array(256);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, info.width, info.height);

  sound.holdMusic(true);
  const clock = sound.playPcm(decodeMveAudio(bytes), info.channels, info.rate);
  const frames = decodeMveFrames(bytes);
  let shown = -1;
  let subtitle = -1;

  await new Promise<void>((done) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener('keydown', onKey, true);
      host.removeEventListener('mousedown', onMouse);
      clock.stop();
      done();
    };
    const onKey = (e: KeyboardEvent) => {
      // The movie takes all keys: the game under it does not see them.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') finish();
    };
    const onMouse = (e: MouseEvent) => {
      e.preventDefault();
      finish();
    };
    window.addEventListener('keydown', onKey, true);
    host.addEventListener('mousedown', onMouse);

    const tick = () => {
      if (finished) return;
      const target = Math.floor((clock.time() * 1000) / info.frameMs);
      let frame = null;
      // Skipped frames are still decoded: the next ones are built from previous ones.
      while (shown < target) {
        const next = frames.next();
        if (next.done) return finish();
        frame = next.value;
        shown = frame.index;
      }
      if (frame) {
        const pal = frame.palette;
        for (let i = 0; i < 256; i++) colors[i] = (255 << 24) | (pal[i * 4 + 2]! << 16) | (pal[i * 4 + 1]! << 8) | pal[i * 4]!;
        const px = frame.pixels;
        for (let i = 0; i < px.length; i++) rgba[i] = colors[px[i]!]!;
        ctx.putImageData(image, 0, 0);
        const fade = fadeAt(fades, shown);
        if (fade.alpha > 0) {
          ctx.fillStyle = `rgba(${fade.color.join(',')},${fade.alpha})`;
          ctx.fillRect(0, 0, info.width, info.height);
        }
        let line = -1;
        for (let i = 0; i < subtitles.length && subtitles[i]!.frame <= shown; i++) line = i;
        if (line !== subtitle) {
          subtitle = line;
          subs.textContent = line >= 0 ? subtitles[line]!.text : '';
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  host.remove();
  sound.holdMusic(false);
}
