// Sounds and music — from the player's copy of Fallout (ACM files), decoded by our decoder.
// Sound in the world: quieter with distance and left/right — by position relative to the player.
import { decodeAcm } from '../formats/acm.ts';
import { platform } from '../platform.ts';

const SFX_VOLUME = 0.8;
const MUSIC_VOLUME = 0.45;

/**
 * Sounds not from the game copy but from the player's files (WAV, OGG in a block library folder — a custom door): sound name → how to read
 * its bytes. Such sound names start with "b:"; the block library fills them in.
 */
export const FILE_SOUNDS = new Map<string, () => Promise<Uint8Array | null>>();

export interface Listener {
  x: number;
  y: number;
  angle: number;
}

export class Sound {
  private readonly ctx: AudioContext | null;
  private readonly master: GainNode | null;
  private readonly sfx: GainNode | null;
  private readonly music: GainNode | null;
  private readonly cache = new Map<string, Promise<AudioBuffer | null>>();
  private musicSource: AudioBufferSourceNode | null = null;
  private musicName = '';
  muted = false;
  /** Sound was on when the window was hidden — turn it back on when the window is shown. */
  private resumeOnShow = false;
  /** The game was closed or the dev server is gone — sound is no longer needed. */
  private shutDown = false;

  constructor() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.ctx = Ctx ? new Ctx() : null;
    if (!this.ctx) {
      this.master = this.sfx = this.music = null;
      return;
    }
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = SFX_VOLUME;
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = MUSIC_VOLUME;
    this.music.connect(this.master);
    // The game window was hidden (minimized, switched away, preview panel closed) — silence until it is shown.
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.shutdown());
  }

  /** Where to connect our own code-built effect sounds (Geiger counter): volume — same as sounds. */
  get effects(): { ctx: AudioContext; node: AudioNode } | null {
    return this.ctx && this.sfx && !this.shutDown ? { ctx: this.ctx, node: this.sfx } : null;
  }

  /** The browser only allows sound after a player action (click, key). */
  resume(): void {
    if (this.shutDown || document.hidden) return;
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  private onVisibility(): void {
    if (!this.ctx || this.shutDown) return;
    if (document.hidden) {
      this.resumeOnShow = this.ctx.state === 'running';
      void this.ctx.suspend().catch(() => {});
    } else if (this.resumeOnShow) {
      this.resumeOnShow = false;
      void this.ctx.resume().catch(() => {});
    }
  }

  /** Turn sound off for good: the game was closed or the dev server is gone (otherwise music would keep playing from memory). */
  shutdown(): void {
    this.shutDown = true;
    this.stopMusic();
    void this.ctx?.suspend().catch(() => {});
  }

  /** Sound and music volume from 0 to 1 (1 — as intended; "Settings" in the pause menu). */
  setSfxVolume(level: number): void {
    if (this.sfx) this.sfx.gain.value = SFX_VOLUME * Math.max(0, Math.min(1, level));
  }

  setMusicVolume(level: number): void {
    if (this.music) this.music.gain.value = MUSIC_VOLUME * Math.max(0, Math.min(1, level));
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    return this.muted;
  }

  /** Decode sounds in advance so the first shot isn't late. */
  preload(names: string[]): Promise<unknown> {
    return Promise.all(names.map((n) => this.buffer(n)));
  }

  /** Effect sound by file name without extension, e.g. "WA01XXX1". No file — silence. */
  play(name: string, volume = 1, pan = 0): void {
    void this.buffer(name).then((buffer) => {
      if (!buffer || !this.ctx || !this.sfx) return;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(gain).connect(panner).connect(this.sfx);
      source.start();
    });
  }

  /** Sound at a world point: volume and side — from the player's position. */
  playAt(name: string, x: number, y: number, listener: Listener, volume = 1): void {
    const dx = x - listener.x;
    const dy = y - listener.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 16) return;
    const rel = Math.atan2(dy, dx) - listener.angle;
    const pan = dist < 0.3 ? 0 : Math.sin(rel) * 0.8;
    this.play(name, volume / (1 + dist * 0.3), pan);
  }

  /** Looping music. If the same track is already playing — do nothing. */
  async playMusic(name: string): Promise<void> {
    if (this.musicName === name) return;
    this.stopMusic();
    this.musicName = name;
    const buffer = await this.load('SOUND\\MUSIC\\' + name + '.ACM');
    if (!buffer || !this.ctx || !this.music || this.musicName !== name) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.music);
    source.start();
    this.musicSource = source;
  }

  /** Music goes quiet for the length of a movie (and resumes from the same spot when the movie ends). */
  holdMusic(hold: boolean): void {
    if (!this.music || !this.master) return;
    this.music.disconnect();
    if (!hold) this.music.connect(this.master);
  }

  /**
   * Movie sound: 16-bit, stereo interleaved. Returns the movie clock (seconds since the sound started) and a stop function.
   * No sound (the browser refused) — the clock runs on its own.
   */
  playPcm(samples: Int16Array, channels: number, rate: number): { time(): number; stop(): void } {
    const started = performance.now();
    const wall = { time: () => (performance.now() - started) / 1000, stop: () => {} };
    const frames = Math.floor(samples.length / Math.max(1, channels));
    if (!this.ctx || !this.sfx || this.ctx.state !== 'running' || frames === 0 || !rate) return wall;
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(channels, frames, rate);
    for (let ch = 0; ch < channels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < frames; i++) data[i] = samples[i * channels + ch]! / 32768;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // Movie — at sound volume (speech and noise), not music volume.
    source.connect(this.sfx);
    const at = ctx.currentTime + 0.05;
    source.start(at);
    return {
      time: () => Math.max(0, ctx.currentTime - at),
      stop: () => {
        try {
          source.stop();
        } catch {
          // already ended
        }
      },
    };
  }

  stopMusic(): void {
    this.musicSource?.stop();
    this.musicSource = null;
    this.musicName = '';
  }

  private buffer(name: string): Promise<AudioBuffer | null> {
    const file = FILE_SOUNDS.get(name);
    if (file) return this.loadFile(name, file);
    return this.load('SOUND\\SFX\\' + name + '.ACM');
  }

  /** Sound from a player's file (WAV, OGG): the browser decodes it. Unreadable — silence. */
  private loadFile(name: string, read: () => Promise<Uint8Array | null>): Promise<AudioBuffer | null> {
    let pending = this.cache.get(name);
    if (!pending) {
      const ctx = this.ctx;
      pending = read()
        .then((bytes) => (bytes && ctx ? ctx.decodeAudioData(bytes.slice().buffer) : null))
        .catch(() => null);
      this.cache.set(name, pending);
    }
    return pending;
  }

  /** Forget sounds decoded from player files (the block library was reread). */
  forgetFileSounds(): void {
    for (const name of [...this.cache.keys()]) if (name.startsWith('b:')) this.cache.delete(name);
  }

  /**
   * Narrator speech (endings, death screen): file by full path (SOUND\SPEECH\…). Returns the duration and a stop function;
   * no file or the browser refused sound — null (the endings screen then holds the slide for its own time).
   */
  async speech(path: string): Promise<{ duration: number; stop(): void } | null> {
    const buffer = await this.load(path);
    if (!buffer || !this.ctx || !this.sfx || this.ctx.state !== 'running' || this.shutDown) return null;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.sfx);
    source.start();
    return {
      duration: buffer.duration,
      stop: () => {
        try {
          source.stop();
        } catch {
          // already ended
        }
      },
    };
  }

  private load(path: string): Promise<AudioBuffer | null> {
    let pending = this.cache.get(path);
    if (!pending) {
      // First ask whether the file exists: some people lack some sounds, and requesting such a file logs a 404 to the console.
      // The "no file" answer is remembered too (null in the cache), so we don't ask a second time.
      pending = platform
        .gameFileExists(path)
        .then((found) => (found ? platform.readGameFile(path).then((bytes) => this.toBuffer(bytes)) : null))
        .catch(() => null);
      this.cache.set(path, pending);
    }
    return pending;
  }

  private toBuffer(bytes: Uint8Array): AudioBuffer | null {
    if (!this.ctx) return null;
    const audio = decodeAcm(bytes);
    const channels = Math.max(1, audio.channels);
    const frames = Math.floor(audio.samples.length / channels);
    if (frames === 0) return null;
    const buffer = this.ctx.createBuffer(channels, frames, audio.rate || 22050);
    for (let ch = 0; ch < channels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < frames; i++) data[i] = audio.samples[i * channels + ch]! / 32768;
    }
    return buffer;
  }
}
