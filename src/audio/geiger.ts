// Geiger counter: our own sound, built in code (the game copy has none). Clicks come at random, like real decays:
// the average number per second is set by the radiation strength (src/game/radiation.ts — geigerRate), loudness by geigerVolume.
// Clicks are scheduled a fraction of a second ahead on the audio clock — so they stay even when frames are uneven.
import type { Sound } from './sound.ts';

/** How far ahead to schedule clicks (seconds). */
const LOOKAHEAD = 0.15;
/** Maximum clicks per second (beyond that it is a solid crackle). */
const MAX_RATE = 200;
/** Number of distinct clicks (slightly different ring — so the crackle doesn't sound mechanical). */
const VARIANTS = 4;

export class Geiger {
  private readonly sound: Sound;
  private clicks: AudioBuffer[] = [];
  /** When the next click is due on the audio clock; 0 — the counter is silent. */
  private next = 0;

  constructor(sound: Sound) {
    this.sound = sound;
  }

  /** Every frame: rate — clicks per second (0 — silence), volume — loudness 0–1. */
  update(rate: number, volume: number): void {
    const out = this.sound.effects;
    if (!out || rate <= 0 || volume <= 0 || out.ctx.state !== 'running') {
      this.next = 0;
      return;
    }
    const { ctx, node } = out;
    if (!this.clicks.length) this.clicks = makeClicks(ctx);
    const r = Math.min(MAX_RATE, rate);
    const now = ctx.currentTime;
    // Just switched on or not called for a long time (window was hidden) — start from now instead of catching up.
    if (this.next < now - LOOKAHEAD) this.next = now + gap(r);
    while (this.next < now + LOOKAHEAD) {
      const source = ctx.createBufferSource();
      source.buffer = this.clicks[Math.floor(Math.random() * this.clicks.length)]!;
      const gain = ctx.createGain();
      gain.gain.value = volume * (0.7 + Math.random() * 0.3);
      source.connect(gain).connect(node);
      source.start(Math.max(now, this.next));
      this.next += gap(r);
    }
  }

  /** Fall silent (pause, death, back to the menu). */
  stop(): void {
    this.next = 0;
  }
}

/** Gap until the next click: random, 1/rate on average. */
const gap = (rate: number) => -Math.log(1 - Math.random()) / rate;

/** A click — a short dry tap (noise dying out within fractions of a millisecond) and the ring of a small speaker. */
function makeClicks(ctx: BaseAudioContext): AudioBuffer[] {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * 0.012);
  const out: AudioBuffer[] = [];
  for (let v = 0; v < VARIANTS; v++) {
    const buffer = ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    const ring = 2300 + v * 450;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const snap = (Math.random() * 2 - 1) * Math.exp(-t / 0.00035);
      const tone = Math.sin(2 * Math.PI * ring * t) * Math.exp(-t / 0.0016) * 0.55;
      const body = Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t / 0.003) * 0.2;
      data[i] = (snap + tone + body) * 0.8;
    }
    out.push(buffer);
  }
  return out;
}
