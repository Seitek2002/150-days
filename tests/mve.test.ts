// Checks our MVE movie decoder against ffmpeg on real movies from the player's copy.
// If there is no game copy or no ffmpeg, the test is skipped.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeMveAudio, decodeMveFrames, readMveInfo } from '../src/formats/mve.ts';

const require = createRequire(import.meta.url);
const { openGame, checkGameFolder } = require('../electron/gamefiles.cjs');

let gameDir = '';
try {
  gameDir = JSON.parse(fs.readFileSync('.local/config.json', 'utf8')).gameDir ?? '';
} catch {
  gameDir = '';
}
let hasFfmpeg = false;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  hasFfmpeg = true;
} catch {
  hasFfmpeg = false;
}
const available = Boolean(gameDir) && checkGameFolder(gameDir).ok && hasFfmpeg;

/** ffmpeg: frames (color indices + a palette at the end of each frame) and 16-bit sound. */
function ffmpegDecode(bytes: Uint8Array, frames: number): { video: Buffer; audio: Int16Array } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mve-'));
  try {
    const input = path.join(dir, 'in.mve');
    fs.writeFileSync(input, bytes);
    const v = path.join(dir, 'v.raw');
    const a = path.join(dir, 'a.raw');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-fps_mode', 'passthrough', '-frames:v', String(frames), '-f', 'rawvideo', '-pix_fmt', 'pal8', v], { stdio: 'ignore' });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-map', '0:a:0', '-f', 's16le', '-acodec', 'pcm_s16le', a], { stdio: 'ignore' });
    const raw = fs.readFileSync(a);
    return { video: fs.readFileSync(v), audio: new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// A whole movie plus ffmpeg — up to a minute on a busy machine.
describe.skipIf(!available)('the MVE decoder matches ffmpeg', () => {
  for (const name of ['ART\\CUTS\\OVRINTRO.MVE', 'ART\\CUTS\\IPLOGO.MVE']) {
    it(name, () => {
      const game = openGame(gameDir);
      const bytes: Uint8Array = game.read(name);
      expect(bytes, 'file found').toBeTruthy();
      const info = readMveInfo(bytes);
      const FRAMES = 150;
      const theirs = ffmpegDecode(bytes, FRAMES);
      const size = info.width * info.height;
      const step = size + 1024;
      const count = Math.min(FRAMES, Math.floor(theirs.video.length / step));
      expect(count).toBeGreaterThan(10);
      let badFrame = -1;
      let badPixels = 0;
      for (const frame of decodeMveFrames(bytes)) {
        if (frame.index >= count) break;
        const ref = theirs.video.subarray(frame.index * step, frame.index * step + size);
        let bad = 0;
        for (let i = 0; i < size; i++) if (ref[i] !== frame.pixels[i]) bad++;
        if (bad && badFrame < 0) {
          badFrame = frame.index;
          badPixels = bad;
        }
      }
      expect(badFrame, `frame ${badFrame}: ${badPixels} pixels did not match`).toBe(-1);

      const ours = decodeMveAudio(bytes, false);
      const n = Math.min(ours.length, theirs.audio.length);
      expect(ours.length).toBe(theirs.audio.length);
      let firstBad = -1;
      for (let i = 0; i < n; i++) {
        if (ours[i] !== theirs.audio[i]) {
          firstBad = i;
          break;
        }
      }
      expect(firstBad, `sound diverges from sample ${firstBad}`).toBe(-1);
    }, 120_000);
  }
});
