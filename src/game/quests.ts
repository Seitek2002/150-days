// Quests: the list for the Pip-Boy and the "quest received / completed / failed" lines in the bottom left.
// The list is the same as in the player's copy (IniConfigs\Quests.ini of the fan build): location → quests, each with the number
// of a script global variable. Location and quest names are PIPBOY.MSG lines from the player's copy; here only numbers.
// Variable value: 0 means no quest, 1 taken, 2 and more completed. Exceptions were found in the original's scripts:
// the water chip is the main quest, visible from the start of the game (the scripts do not set it until the chip is brought); the Adytum
// farm has its own numbers; the original does not show failure separately, we show the failures visible from the scripts
// (the client's decision, 2026-10-23: we tell the player directly "quest failed").

export type QuestState = 'none' | 'active' | 'done' | 'failed';

export interface QuestDef {
  /** PIPBOY.MSG line with the location name. */
  place: number;
  /** PIPBOY.MSG line with the quest. */
  text: number;
  gvar: number;
  /** From which value the quest is visible; not set means from 1. */
  shownAt?: number;
  /** From which value the quest is completed; not set means from 2. */
  doneAt?: number;
  /** Whether it is failed (by the value and other variables). */
  failed?: (value: number, gvar: (n: number) => number) => boolean;
  /** Whether the quest is visible, instead of the shownAt threshold (the original's scripts never set it, see "Kill Killian"). */
  shown?: (value: number, gvar: (n: number) => number) => boolean;
  /** Whether it is completed, instead of the doneAt threshold. */
  done?: (value: number, gvar: (n: number) => number) => boolean;
  /** This number means "closed unfinished" (the Overseer after the chip): took the quest means failure, did not take it means no quest. */
  closedAt?: number;
  /** The script removes a taken quest (the number goes back to 0) when it can no longer be done; that is a failure. */
  droppedFails?: true;
}

/** Variables that show failure: TANDI_STATUS (3 means Tandi died). */
const TANDI_STATUS = 26;
const TANDI_DEAD = 3;
/** Junktown: KILLIAN_DEAD, GIZMO_DEAD, HIRED_BY_GIZMO (Gizmo hired you to kill Killian). */
const KILLIAN_DEAD = 37;
const GIZMO_DEAD = 38;
const HIRED_BY_GIZMO = 39;
/** "Closed unfinished": this is how the Overseer marks Vault quests when the chip is brought. */
const CLOSED_BY_OVERSEER = 3;

const quest = (place: number, text: number, gvar: number, more: Partial<QuestDef> = {}): QuestDef => ({ place, text, gvar, ...more });

export const QUESTS: readonly QuestDef[] = [
  // Vault 13; the Overseer closes "rebel faction" and "water thief" when the chip is brought (number 3).
  quest(700, 701, 238, { closedAt: CLOSED_BY_OVERSEER }),
  quest(700, 702, 309),
  quest(700, 703, 308),
  quest(700, 704, 101, { shownAt: 0 }),
  quest(700, 705, 188, { closedAt: CLOSED_BY_OVERSEER }),
  // Shady Sands; Tandi died before she was rescued means failure.
  quest(720, 721, 239),
  quest(720, 722, 240),
  quest(720, 723, 103, { failed: (v, gvar) => v === 1 && gvar(TANDI_STATUS) === TANDI_DEAD }),
  quest(720, 724, 43),
  // Junktown. "Kill Killian": the original's scripts do not set the number (Killian marks completion only if it is already 1),
  // so the quest follows Gizmo's hiring: hired means taken, Killian dead means completed, Gizmo dead first means failure
  // (docs/ORIGINAL-FIXES.md). "Gizmo's confession" cannot be handed in without Killian, so failure.
  quest(730, 731, 144),
  quest(730, 732, 105, {
    shown: (v, gvar) => v >= 1 || gvar(HIRED_BY_GIZMO) >= 1,
    done: (v, gvar) => v >= 2 || (gvar(HIRED_BY_GIZMO) >= 1 && gvar(KILLIAN_DEAD) >= 1),
    failed: (v, gvar) => v < 2 && gvar(HIRED_BY_GIZMO) >= 1 && gvar(GIZMO_DEAD) >= 1 && gvar(KILLIAN_DEAD) === 0,
  }),
  quest(730, 733, 143),
  quest(730, 734, 145),
  quest(730, 735, 104, { failed: (v, gvar) => v === 1 && gvar(KILLIAN_DEAD) >= 1 }),
  quest(730, 736, 555),
  quest(730, 737, 186),
  quest(730, 738, 635),
  // Necropolis
  quest(750, 751, 29),
  quest(750, 752, 31),
  // the Hub
  quest(760, 761, 100),
  quest(760, 762, 112),
  quest(760, 763, 111),
  quest(760, 764, 106),
  quest(760, 765, 107),
  quest(760, 766, 636),
  // the Brotherhood of Steel; the missing initiate died (the script writes 5) means failure.
  quest(770, 771, 108),
  quest(770, 772, 109, { failed: (v) => v === 5 }),
  // the Glow
  quest(790, 791, 140),
  quest(790, 792, 139),
  // the Boneyard; the farm: 1 means taken, then Miles's script keeps its own numbers, 9304 means fixed.
  quest(800, 801, 135),
  // Juliana's pendant: an angry answer makes her remove the quest (number 0), that is a failure.
  quest(800, 802, 127, { droppedFails: true }),
  quest(800, 803, 129),
  quest(800, 804, 133),
  quest(800, 805, 138, { doneAt: 9304 }),
  quest(800, 806, 130),
  quest(800, 807, 128),
  quest(800, 808, 642),
];

/**
 * Who gave the quest: the script key of the critter being talked to when the quest was taken (questNews). If he died (deadVar,
 * scripts.ts, mournDead) and the quest is not completed, it is cancelled: it can no longer be handed in (the client, 2026-10-27).
 */
export const giverVar = (text: number, key: string): string => `quest:${text}:giver:${key}`;
export const deadVar = (key: string): string => `dead:${key}`;

function giverDead(vars: Record<string, number>, text: number): boolean {
  const prefix = `quest:${text}:giver:`;
  return Object.keys(vars).some((k) => k.startsWith(prefix) && !!vars[deadVar(k.slice(prefix.length))]);
}

/**
 * was: what the quest was for the player last time (a code from vars, see questNews): whether he had taken it. giverGone: whoever
 * gave it has died: unfinished means cancelled (the same state as failed).
 */
export function questState(q: QuestDef, gvar: (n: number) => number, was = 0, giverGone = false): QuestState {
  const value = gvar(q.gvar);
  const taken = was === STATE_CODE.active || was === STATE_CODE.failed;
  if (q.failed?.(value, gvar)) return 'failed';
  if (q.closedAt !== undefined && value === q.closedAt) return taken ? 'failed' : 'none';
  if (!(q.shown ? q.shown(value, gvar) : value >= (q.shownAt ?? 1))) return q.droppedFails && taken ? 'failed' : 'none';
  if (q.done ? q.done(value, gvar) : value >= (q.doneAt ?? 2)) return 'done';
  return giverGone ? 'failed' : 'active';
}

/** A location with quests the player has already seen, for the Pip-Boy. */
export interface QuestGroup {
  place: string;
  quests: { text: string; state: Exclude<QuestState, 'none'> }[];
}

/**
 * Quests by location in the original's order; quests with no text in PIPBOY.MSG (a different copy of the game) are skipped.
 * vars are the party variables: they show whether the player took a quest (questNews records it).
 */
export function questGroups(gvar: (n: number) => number, message: (id: number) => string | undefined, vars: Record<string, number> = {}): QuestGroup[] {
  const groups: QuestGroup[] = [];
  for (const q of QUESTS) {
    const state = questState(q, gvar, vars[`quest:${q.text}`] ?? 0, giverDead(vars, q.text));
    const text = message(q.text);
    if (state === 'none' || !text) continue;
    let group = groups.at(-1);
    const place = message(q.place) ?? '';
    if (!group || group.place !== place) groups.push((group = { place, quests: [] }));
    group.quests.push({ text, state });
  }
  return groups;
}

const STATE_CODE: Record<QuestState, number> = { none: 0, active: 1, done: 2, failed: 3 };
/**
 * A key in `session.vars`: quest news for this game is already running. A new game sets it right away (and the first quest is announced),
 * a save made before the quest list does not have it, so the first check silently remembers what is already taken.
 */
export const QUEST_READY = 'quest:ready';

/**
 * What to tell the player: quests whose state changed since the last check. Previous states are stored in `vars`
 * (keys quest:<line number>), so old news does not repeat after loading; without `QUEST_READY` the states are only
 * remembered. A quest that disappeared (the script removed it) gets no line. giver is the script key of the critter being
 * talked to: a quest taken now is remembered under him (giverVar).
 */
export function questNews(
  vars: Record<string, number>,
  gvar: (n: number) => number,
  message: (id: number) => string | undefined,
  giver?: string,
): { text: string; state: Exclude<QuestState, 'none'> }[] {
  const quiet = !vars[QUEST_READY];
  vars[QUEST_READY] = 1;
  const news: { text: string; state: Exclude<QuestState, 'none'> }[] = [];
  for (const q of QUESTS) {
    const key = `quest:${q.text}`;
    const was = vars[key] ?? 0;
    const state = questState(q, gvar, was, giverDead(vars, q.text));
    const code = STATE_CODE[state];
    if (was === code) continue;
    vars[key] = code;
    if (state === 'active' && was === STATE_CODE.none && giver) vars[giverVar(q.text, giver)] = 1;
    const text = message(q.text);
    if (quiet || state === 'none' || !text) continue;
    // "Taken" again after completion (the script rolled the number back) is not news.
    if (state === 'active' && was !== STATE_CODE.none) continue;
    news.push({ text, state });
  }
  return news;
}
