// Delayed script events (add_timer_event): after some time timed_event_p_proc fires with a numeric parameter.
// Scripts count time in "ticks" of a tenth of a second. Short delays (walk around, say a phrase in 3 seconds)
// the original measures in almost real time, and so do we: seconds while the hero is on this map. On maps game time
// runs LOCAL_SPEED times faster than real time, and by the game clock critters would talk and run ten times as often.
// Long delays (from an hour) are the story: "will be back in two days". They are counted by the game clock and fire
// even if the time flew by on the road or in sleep.

/** A delayed event. left is how many seconds on the map remain (short delay); at is the game second (long). */
export interface ScriptTimer {
  /** Script instance key: "<level>:o<number>" for critters, "map:<original map>" for a map script. */
  key: string;
  param: number;
  left?: number;
  at?: number;
}

/** From what delay an event is counted by the game clock: an hour in ticks. */
export const LONG_TIMER_TICKS = 60 * 60 * 10;

export function makeTimer(key: string, ticks: number, param: number, now: number): ScriptTimer {
  const seconds = Math.max(0, ticks) / 10;
  return ticks >= LONG_TIMER_TICKS ? { key, param, at: now + seconds } : { key, param, left: seconds };
}

/**
 * dt real seconds have passed on the map, the game clock shows now. Short events of those who are here (`here`)
 * count down; ripe ones (and long ones whose time has passed, also only for those who are here) are removed from the list
 * and returned in firing order.
 */
export function takeDueTimers(timers: ScriptTimer[], dt: number, now: number, here: (key: string) => boolean): ScriptTimer[] {
  const due: ScriptTimer[] = [];
  for (let i = 0; i < timers.length; i++) {
    const timer = timers[i]!;
    if (!here(timer.key)) continue;
    if (timer.left !== undefined) timer.left -= dt;
    if ((timer.left !== undefined && timer.left <= 0) || (timer.at !== undefined && timer.at <= now)) {
      due.push(timer);
      timers.splice(i--, 1);
    }
  }
  return due;
}

/** Validation of what was read from a save. */
export function isScriptTimer(value: unknown): value is ScriptTimer {
  const t = value as ScriptTimer | null;
  return !!t && typeof t.key === 'string' && typeof t.param === 'number' && (typeof t.left === 'number' || typeof t.at === 'number');
}
