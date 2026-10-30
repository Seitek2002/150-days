// Game time. The game starts on December 5, 2161 (as in the original); the search for the water chip has 150 days.
// Time passes only while travelling the wasteland and only by distance travelled (client decisions): stand still and it stands still too.
// In locations (the cave, vaults, towns) and in their green zones in the wasteland it also stands still; only actions move it:
// resting, healing, reading, waiting by script (advance). tick (time passing on its own) is not used yet.
// Scripts, though, need time in locations too (the countdown to the base explosion, the Glow's radiation, "I'll be back in a minute"): they have their own
// clock — the calendar plus local seconds (how much real time the hero has spent in the game on maps). The calendar and the water
// deadline are not moved by local seconds (client decision), while script time always runs and only forward.
// The hero's body lives by its own clock (body): drugs wear off in locations too, where the calendar stands still — there 10 game seconds
// per real one (client, 2026-10-29: otherwise one Rad-X pill protected in the Glow for as long as you liked).

/** How many game seconds pass per one real second on a map. */
export const LOCAL_SPEED = 10;
export const WATER_DAYS = 150;
const DAY = 24 * 60 * 60;
const START_HOUR = 7;

export class Clock {
  /** Game seconds since the start of the game. */
  seconds = 0;
  /** Extra days added to the deadline (the water caravan from the Hub gives +100). */
  extraDays = 0;
  /** Local seconds: real play time on maps (for scripts only). */
  local = 0;
  /** Real seconds of play in locations (not in the wasteland, where the calendar runs): the body clock runs by them. */
  place = 0;

  /** Body clock (drugs, addiction): the calendar, and in locations — their real time × LOCAL_SPEED. */
  get body(): number {
    return this.seconds + this.place * LOCAL_SPEED;
  }

  /** dt real seconds of play passed in a location (not in the wasteland): the body clock runs. */
  tickPlace(dt: number): void {
    this.place += dt;
  }

  /** Script clock (game_time): the calendar and local seconds. */
  get scriptSeconds(): number {
    return this.seconds + this.local;
  }

  /** dt real seconds of play passed on a map: only the script clock runs. */
  tickLocal(dt: number): void {
    this.local += dt;
  }

  tick(realSeconds: number): void {
    this.seconds += realSeconds * LOCAL_SPEED;
  }

  /** Skip time (travel on the world map, resting). */
  advance(gameSeconds: number): void {
    this.seconds += gameSeconds;
  }

  /** Day number since the start of the game: the first day is 1. */
  get day(): number {
    return Math.floor((this.seconds + START_HOUR * 3600) / DAY) + 1;
  }

  /** How many days are left until the vault runs out of water. */
  get daysLeft(): number {
    return Math.max(0, WATER_DAYS + this.extraDays - (this.day - 1));
  }

  /** Date and time on the wasteland clock in milliseconds (like Date.UTC with local hours): for the sky (stars.ts). */
  get dateMs(): number {
    return Date.UTC(2161, 11, 5, START_HOUR, 0, 0) + this.seconds * 1000;
  }

  /** Date and time for the Pip-Boy: { year, month, day, hour, minute }. */
  get date(): { year: number; month: number; day: number; hour: number; minute: number } {
    const d = new Date(this.dateMs);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  }

  toJSON(): { seconds: number; extraDays: number; local: number; place: number } {
    return { seconds: this.seconds, extraDays: this.extraDays, local: this.local, place: this.place };
  }

  static from(data: { seconds?: number; extraDays?: number; local?: number; place?: number } | undefined): Clock {
    const clock = new Clock();
    clock.seconds = data?.seconds ?? 0;
    clock.extraDays = data?.extraDays ?? 0;
    clock.local = data?.local ?? 0;
    // An old save without a body clock: it starts from zero — drug timers in it ran by the calendar, so it will match.
    clock.place = data?.place ?? 0;
    return clock;
  }
}
