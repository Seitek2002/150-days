// Sounds: if a file is not in the game copy, we do not request it (no 404 errors) and remember that it is missing.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Set<string>();
const calls = { exists: [] as string[], read: [] as string[] };

vi.mock('../src/platform.ts', () => ({
  platform: {
    gameFileExists: async (name: string) => {
      calls.exists.push(name);
      return files.has(name);
    },
    readGameFile: async (name: string) => {
      calls.read.push(name);
      if (!files.has(name)) throw new Error('404: ' + name);
      return new Uint8Array(4);
    },
  },
}));

// Without a sound card (as in tests): there is no AudioContext, decoded sound is "empty", but file requests go as in the game.
vi.stubGlobal('window', {});
vi.stubGlobal('document', { addEventListener: () => {}, hidden: false });

const { Sound } = await import('../src/audio/sound.ts');
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('loading sounds', () => {
  beforeEach(() => {
    files.clear();
    calls.exists.length = 0;
    calls.read.length = 0;
  });

  it('no file — it is not requested, only asked whether it exists', async () => {
    const sound = new Sound();
    sound.play('HMJMPSAO');
    await settle();
    expect(calls.exists).toEqual(['SOUND\\SFX\\HMJMPSAO.ACM']);
    expect(calls.read).toEqual([]);
  });

  it('the same missing file is not asked about a second time', async () => {
    const sound = new Sound();
    sound.play('HMJMPSAO');
    sound.play('HMJMPSAO');
    await settle();
    sound.play('HMJMPSAO');
    await sound.preload(['HMJMPSAO']);
    expect(calls.exists).toHaveLength(1);
  });

  it('the file exists — first a question, then a read, also once', async () => {
    files.add('SOUND\\SFX\\WA01XXX1.ACM');
    const sound = new Sound();
    await sound.preload(['WA01XXX1', 'WA01XXX1']);
    sound.play('WA01XXX1');
    await settle();
    expect(calls.exists).toEqual(['SOUND\\SFX\\WA01XXX1.ACM']);
    expect(calls.read).toEqual(['SOUND\\SFX\\WA01XXX1.ACM']);
  });

  it('music — the same order: no file — silence without a request', async () => {
    const sound = new Sound();
    await sound.playMusic('NOSUCH');
    expect(calls.exists).toEqual(['SOUND\\MUSIC\\NOSUCH.ACM']);
    expect(calls.read).toEqual([]);
  });
});
