// "Lloyd is water" easter eggs (client, 2026-10-26; a reference to the meme about water magnate Lloyd Frontera). Only
// lines over heads, no new figures or conversations:
// 1) at the Water Merchants in the Hub the workers mutter the mantra now and then; stand nearby and listen for LISTEN seconds, and once per
//    game you get "brainwashed" for a day (a note on the character sheet, with no benefit or harm);
// 2) a rare wasteland encounter (once per game): "Lloyd" and three workers shout the mantra back and forth; if the hero was
//    brainwashed, he joins in involuntarily.
import { t, type StringKey } from '../i18n.ts';
import type { Creature } from './creature.ts';
import type { Session } from './session.ts';

/** Scripts of the Water Merchants' workers (the Hub): they are the ones who mutter. */
const CHANTERS: ReadonlySet<string> = new Set(['WMGROUP', 'WMCARVN']);
/** How often one of the workers mutters (seconds, min and max) and from what distance the hero hears what they say. */
const CHANT_EVERY = [6, 11] as const;
const CHANT_HEAR = 14;
/** How many seconds to stand nearby (no farther than NEAR cells) to "pick it up". */
const LISTEN = 20;
const NEAR = 4;
/** Brainwashing lasts one day of game time. */
export const HYPNO_SECONDS = 24 * 3600;
/** Chance of meeting Lloyd per wasteland encounter (once per game). */
export const LLOYD_CHANCE = 0.03;
/** Original prototypes: "Lloyd" is a citizen in a suit, the workers are peasants. */
export const LLOYD_PID = 16777300;
export const WORKER_PID = 16777302;
const CHANT_COLOR = '#9fd0ff';

/** Lloyd and the workers' call and response: his question, their answer. */
const CALLS: readonly [StringKey, StringKey][] = [
  ['lloydCall1', 'lloydReply1'],
  ['lloydCall2', 'lloydReply2'],
  ['lloydCall3', 'lloydReply3'],
];

export class LloydEggs {
  private chantWait = 4;
  private listened = 0;
  private group: { lloyd: Creature; workers: Creature[]; step: number; wait: number } | null = null;

  /** Brainwashed right now (for the character sheet). */
  static hypnotized(session: Session): boolean {
    const at = session.vars['egg:lloydHypno'];
    return at !== undefined && session.clock.seconds - at < HYPNO_SECONDS;
  }

  /** Wasteland encounter: "Lloyd" and the workers have appeared (play.ts → roadEvent). */
  meet(lloyd: Creature, workers: Creature[]): void {
    for (const c of [lloyd, ...workers]) {
      c.hostile = false;
      c.calm();
    }
    this.group = { lloyd, workers, step: 0, wait: 1 };
  }

  /** Every game frame (while the game is running). */
  tick(dt: number, session: Session): void {
    this.hubChant(dt, session);
    this.chorus(dt, session);
  }

  private hubChant(dt: number, session: Session): void {
    const { scene, player, hero } = session;
    const chanters = scene.creatures.filter((c) => c.alive && c.present && !c.hostile && CHANTERS.has(scene.scriptOf(c)?.name.toUpperCase() ?? ''));
    if (!chanters.length) {
      this.listened = 0;
      return;
    }
    const dist = (c: Creature) => Math.hypot(c.x - player.x, c.y - player.y);
    if ((this.chantWait -= dt) <= 0) {
      this.chantWait = CHANT_EVERY[0] + Math.random() * (CHANT_EVERY[1] - CHANT_EVERY[0]);
      const near = chanters.filter((c) => dist(c) <= CHANT_HEAR);
      const who = near[Math.floor(Math.random() * near.length)];
      if (who) scene.float(who, t('lloydMantra'), CHANT_COLOR);
    }
    // Stood nearby and listened: picked it up (once per game).
    if (session.vars['egg:lloydHypno'] !== undefined) return;
    this.listened = !hero.inCombat && chanters.some((c) => dist(c) <= NEAR) ? this.listened + dt : 0;
    if (this.listened >= LISTEN) {
      session.vars['egg:lloydHypno'] = session.clock.seconds;
      session.say(t('msgLloydHypno'));
    }
  }

  private chorus(dt: number, session: Session): void {
    const g = this.group;
    if (!g) return;
    const { scene, player } = session;
    // Left this wasteland window or everyone ran off: the encounter is over.
    if (!scene.creatures.includes(g.lloyd) || !g.lloyd.alive || g.lloyd.hostile) {
      this.group = null;
      return;
    }
    const d = Math.hypot(g.lloyd.x - player.x, g.lloyd.y - player.y);
    if (d > 30) return;
    // Was brainwashed: joins in by himself (once per game).
    if (d < 7 && session.vars['egg:lloydHypno'] !== undefined && !session.vars['egg:lloydEcho']) {
      session.vars['egg:lloydEcho'] = 1;
      session.say(t('msgLloydEcho'));
    }
    if ((g.wait -= dt) > 0) return;
    const [call, reply] = CALLS[Math.floor(g.step / 2) % CALLS.length]!;
    // The question and the answer do not hang at the same time (they stand close, the labels would overlap): a new line removes the previous one.
    if (g.step % 2 === 0) {
      for (const w of g.workers) scene.float(w, '', CHANT_COLOR);
      scene.float(g.lloyd, t(call), CHANT_COLOR);
    } else {
      scene.float(g.lloyd, '', CHANT_COLOR);
      for (const w of g.workers) if (w.alive && !w.hostile) scene.float(w, t(reply), CHANT_COLOR);
    }
    g.step++;
    // After a full call and response, a pause.
    g.wait = g.step % (CALLS.length * 2) === 0 ? 5 : 2.2;
  }
}

/** A note on the character sheet while the brainwashing lasts. */
export const lloydMark = (session: Session): string | null => (LloydEggs.hypnotized(session) ? t('markLloyd') : null);
