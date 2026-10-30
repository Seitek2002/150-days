// Checks our ACM sound decoder against ffmpeg on real files from the player's copy.
// Without a game copy or ffmpeg the test is skipped.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeAcm, readAcmHeader } from '../src/formats/acm.ts';

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

function ffmpegDecode(bytes: Uint8Array): Int16Array {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-'));
  try {
    const input = path.join(dir, 'in.acm');
    const output = path.join(dir, 'out.raw');
    fs.writeFileSync(input, bytes);
    let failed = false;
    try {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-f', 's16le', '-acodec', 'pcm_s16le', output], { stdio: 'ignore' });
    } catch {
      // ffmpeg is stricter than the original game and gives up on some Fallout files
      // ("Too large b"). Then we compare only what it managed to decode before the error.
      failed = true;
    }
    const raw = fs.readFileSync(output);
    const all = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
    return failed ? all.subarray(0, Math.max(0, all.length - 4096)) : all;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!available)('ACM decoder matches ffmpeg', () => {
  const files = [
    'SOUND\\SFX\\WA01XXX1.ACM',
    'SOUND\\SFX\\MASRATAQ.ACM',
    'SOUND\\SFX\\MASRATBA.ACM',
    'SOUND\\SFX\\IB1P1XX1.ACM',
    'SOUND\\MUSIC\\13CARVRN.ACM',
  ];
  for (const name of files) {
    it(name, () => {
      const game = openGame(gameDir);
      try {
        const bytes: Uint8Array = game.read(name);
        expect(bytes, 'file found').toBeTruthy();
        const ours = decodeAcm(bytes);
        const theirs = ffmpegDecode(bytes);
        expect(ours.rate).toBe(readAcmHeader(bytes).rate);
        const n = Math.min(ours.samples.length, theirs.length);
        expect(n).toBeGreaterThan(1000);
        let maxDiff = 0;
        let firstBad = -1;
        for (let i = 0; i < n; i++) {
          const d = Math.abs(ours.samples[i]! - theirs[i]!);
          if (d > maxDiff) maxDiff = d;
          // Up to ±2 out of 32768 is inaudible: on rare "invalid" codes ffmpeg substitutes its own values,
          // and how the original game handled them is unknown.
          if (d > 2 && firstBad < 0) firstBad = i;
        }
        expect({ ours: ours.samples.length, theirs: theirs.length, maxDiff, firstBad }).toMatchObject({ maxDiff: expect.any(Number) });
        expect(firstBad, `mismatch from sample ${firstBad}, max ${maxDiff}`).toBe(-1);
      } finally {
        game.close();
      }
    }, 30_000); // A whole music file plus ffmpeg: in a full test run 5 seconds is sometimes not enough.
  }
});
