// Resting in the Pip-Boy (alarm clock): how long each option lasts and how time runs on screen.
import { describe, expect, it, vi } from 'vitest';
import { Clock } from '../src/game/clock.ts';
import { getLang, setLang, t } from '../src/i18n.ts';

vi.mock('../src/platform.ts', () => ({ platform: { readGameFile: async () => new Uint8Array(0) } }));

const { AlarmClock, REST_CHOICES, restSeconds } = await import('../src/game/pipboy.ts');

const HOUR = 3600;
const at = (hour: number, minute: number) => ({ hour, minute });
const view = (clock: Clock, extra: Record<string, unknown> = {}) => ({ clock, place: '', ...extra });

describe('how long a rest lasts', () => {
  it('by minutes and hours — as the option says', () => {
    const seconds = REST_CHOICES.slice(0, 8).map((c) => restSeconds(c, at(9, 30), 0));
    expect(seconds).toEqual([600, 1800, HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 5 * HOUR, 6 * HOUR]);
  });

  it('until morning, noon, evening and midnight — until the nearest such hour', () => {
    const [morning, noon, evening, midnight] = REST_CHOICES.slice(8, 12);
    expect(restSeconds(morning!, at(23, 0), 0)).toBe(7 * HOUR);
    expect(restSeconds(morning!, at(2, 15), 0)).toBe(3 * HOUR + 45 * 60);
    expect(restSeconds(noon!, at(9, 30), 0)).toBe(2 * HOUR + 30 * 60);
    expect(restSeconds(evening!, at(20, 0), 0)).toBe(22 * HOUR);
    expect(restSeconds(midnight!, at(18, 45), 0)).toBe(5 * HOUR + 15 * 60);
  });

  it('if the wanted hour is exactly now — wait a full day, as in the original', () => {
    expect(restSeconds({ kind: 'until', hour: 6 }, at(6, 0), 0)).toBe(24 * HOUR);
    expect(restSeconds({ kind: 'until', hour: 0 }, at(0, 0), 0)).toBe(24 * HOUR);
    // A minute after — almost a full day.
    expect(restSeconds({ kind: 'until', hour: 6 }, at(6, 1), 0)).toBe(24 * HOUR - 60);
  });

  it('until healed — as long as the game computed (whole seconds rounded up); healthy — zero', () => {
    expect(restSeconds({ kind: 'healed' }, at(10, 0), 5400.2)).toBe(5401);
    expect(restSeconds({ kind: 'healed' }, at(10, 0), 0)).toBe(0);
  });
});

describe('resting progress', () => {
  it('options in the original order; "until healed" only when the game can compute it', () => {
    const clock = new Clock();
    const alarm = new AlarmClock();
    expect(REST_CHOICES).toHaveLength(13);
    expect(alarm.choices(view(clock))).toHaveLength(12);
    expect(alarm.choices(view(clock, { secondsToHeal: () => 0 }))).toHaveLength(13);
  });

  it('time runs on screen for half a second to one and a half and adds up exactly to the rest length', () => {
    const clock = new Clock();
    const alarm = new AlarmClock();
    expect(alarm.start(2, view(clock), 'not allowed')).toBe(true);
    expect(alarm.busy).toBe(true);
    expect(alarm.chosen).toBe(2);
    let total = 0;
    let frames = 0;
    while (alarm.busy && frames < 1000) {
      total += alarm.step(1 / 60);
      frames++;
    }
    expect(total).toBeCloseTo(HOUR, 6);
    // An hour is about 0.56 s of screen time.
    expect(frames).toBeGreaterThan(25);
    expect(frames).toBeLessThan(45);
    expect(alarm.busy).toBe(false);
    expect(alarm.chosen).toBe(-1);
  });

  it('a long rest does not take longer than one and a half seconds', () => {
    const alarm = new AlarmClock();
    alarm.start(8, view(new Clock()), '');
    let frames = 0;
    while (alarm.busy && frames < 1000) {
      alarm.step(1 / 60);
      frames++;
    }
    expect(frames).toBeLessThanOrEqual(91);
  });

  it('while a rest is running, another cannot start', () => {
    const clock = new Clock();
    const alarm = new AlarmClock();
    expect(alarm.start(3, view(clock), '')).toBe(true);
    expect(alarm.start(0, view(clock), '')).toBe(false);
    expect(alarm.chosen).toBe(3);
  });

  it('an enemy nearby — no resting, time does not run and there is a message', () => {
    const clock = new Clock();
    const alarm = new AlarmClock();
    expect(alarm.start(2, view(clock, { canRest: false }), 'You cannot rest!')).toBe(false);
    expect(alarm.notice).toBe('You cannot rest!');
    expect(alarm.busy).toBe(false);
    expect(alarm.step(1)).toBe(0);
    // The enemy left — the message disappears.
    expect(alarm.start(2, view(clock, { canRest: true }), '')).toBe(true);
    expect(alarm.notice).toBe('');
  });

  it('healthy — "until healed" does nothing; a wrong number neither', () => {
    const clock = new Clock();
    const alarm = new AlarmClock();
    expect(alarm.start(12, view(clock, { secondsToHeal: () => 0 }), '')).toBe(false);
    expect(alarm.start(12, view(clock, { secondsToHeal: () => 7200 }), '')).toBe(true);
    alarm.reset();
    expect(alarm.start(99, view(clock), '')).toBe(false);
    expect(alarm.start(-1, view(clock), '')).toBe(false);
  });

  it('the game clock really moves forward, and closing the window cuts the rest short', () => {
    const clock = new Clock();
    const alarm = new AlarmClock();
    const before = clock.seconds;
    alarm.start(5, view(clock), '');
    for (let i = 0; i < 20; i++) clock.advance(alarm.step(1 / 60));
    const partway = clock.seconds - before;
    expect(partway).toBeGreaterThan(0);
    expect(partway).toBeLessThan(4 * HOUR);
    alarm.reset();
    expect(alarm.busy).toBe(false);
    expect(alarm.step(1)).toBe(0);
    expect(clock.seconds - before).toBe(partway);
  });
});

// ---------- keys, mouse hover and sounds ----------

const { PipBoy } = await import('../src/game/pipboy.ts');

/** A Pip-Boy without images: no drawing, only frames (update), keys and mouse. */
function makePip() {
  const played: string[] = [];
  const pip = new PipBoy({ messages: new Map() } as unknown as ConstructorParameters<typeof PipBoy>[0], { play: (name: string) => void played.push(name) });
  const clock = new Clock();
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const frame = (ms: number, extra: Record<string, unknown> = {}) => {
    now += ms;
    pip.update({ clock, place: '', ...extra });
  };
  pip.show();
  frame(0);
  return { pip, played, clock, frame };
}

/** The middle of alarm row i (640×480 screen: rows from y=150 every 22). */
const rowY = (i: number) => 150 + i * 22 + 8;

describe('Pip-Boy: keys', () => {
  it('A or Enter open the alarm, ← and A close it; arrows page through quests; the window does not need other keys', () => {
    const { pip } = makePip();
    expect(pip.alarmShown).toBe(false);
    expect(pip.key('KeyX')).toBe(false);
    expect(pip.key('ArrowDown')).toBe(true);
    expect(pip.alarmShown).toBe(false);
    expect(pip.key('KeyA')).toBe(true);
    expect(pip.alarmShown).toBe(true);
    expect(pip.key('ArrowLeft')).toBe(true);
    expect(pip.alarmShown).toBe(false);
    expect(pip.key('Enter')).toBe(true);
    expect(pip.alarmShown).toBe(true);
    expect(pip.key('KeyQ')).toBe(false);
  });

  it('arrows wrap around, Enter starts a rest on the row under the cursor', () => {
    const { pip, clock, frame, played } = makePip();
    const start = clock.seconds;
    pip.key('KeyA');
    // Down twice — the third row: one hour.
    pip.key('ArrowDown');
    pip.key('ArrowDown');
    expect(pip.key('Enter')).toBe(true);
    for (let i = 0; i < 120; i++) frame(16);
    expect(clock.seconds - start).toBeCloseTo(3600, 3);
    expect(played).toEqual(['IB2P1XX1', 'IB1P1XX1', 'IB2LU1X1']);
  });

  it('up from the first row goes to the last ("until midnight", without "until healed" if the game does not compute it)', () => {
    const { pip, clock, frame } = makePip();
    pip.key('KeyA');
    pip.key('ArrowUp');
    pip.key('Enter');
    for (let i = 0; i < 200; i++) frame(16);
    // The game day starts at 07:00; until midnight is 17 hours.
    expect(clock.seconds).toBeCloseTo(17 * 3600, 3);
  });

  it('Home and End — the first and last rows; during a rest Enter does not start another', () => {
    const { pip, clock, frame } = makePip();
    pip.key('KeyA');
    pip.key('End');
    pip.key('Space');
    frame(16);
    const first = clock.seconds;
    pip.key('Home');
    pip.key('Enter');
    for (let i = 0; i < 200; i++) frame(16);
    // We rested only "until midnight" (the last row without "until healed"); ten minutes were not added.
    expect(clock.seconds).toBeCloseTo(17 * 3600, 3);
    expect(first).toBeGreaterThan(0);
  });
});

describe('Pip-Boy: mouse and sounds', () => {
  it('mouse hover moves the cursor to the row; Enter rests on it', () => {
    const { pip, clock, frame } = makePip();
    pip.key('KeyA');
    pip.pointerMove(300, rowY(3));
    pip.key('Enter');
    for (let i = 0; i < 120; i++) frame(16);
    expect(clock.seconds).toBeCloseTo(2 * 3600, 3);
    // Outside the list the cursor stays on the last row.
    pip.pointerMove(300, 20);
    pip.key('Enter');
    for (let i = 0; i < 120; i++) frame(16);
    expect(clock.seconds).toBeCloseTo(4 * 3600, 3);
  });

  it('hover without the alarm changes nothing', () => {
    const { pip } = makePip();
    pip.pointerMove(300, rowY(5));
    expect(pip.alarmShown).toBe(false);
    pip.key('KeyA');
    expect(pip.key('Enter')).toBe(true);
  });

  it('buttons sound: "Close" — red, the alarm — medium; close = true', () => {
    const { pip, played } = makePip();
    pip.pointerDown(60, 450);
    expect(pip.pointerUp(60, 450)).toBe(true);
    expect(played).toEqual(['IB1P1XX1', 'IB1LU1X1']);
    played.length = 0;
    pip.pointerDown(138, 25);
    expect(pip.pointerUp(138, 25)).toBe(false);
    expect(pip.alarmShown).toBe(true);
    expect(played).toEqual(['IB2P1XX1', 'IB2LU1X1']);
  });

  it('clicking a row starts a rest with a press sound, a bell at the end', () => {
    const { pip, played, clock, frame } = makePip();
    pip.key('KeyA');
    played.length = 0;
    pip.pointerDown(300, rowY(0));
    pip.pointerUp(300, rowY(0));
    expect(played).toEqual(['IB1P1XX1']);
    for (let i = 0; i < 60; i++) frame(16);
    expect(clock.seconds).toBeCloseTo(600, 3);
    expect(played).toEqual(['IB1P1XX1', 'IB2LU1X1']);
  });

  it('an enemy nearby — refused with a "not allowed" sound, time stands still, no bell', () => {
    const { pip, played, clock, frame } = makePip();
    frame(16, { canRest: false });
    pip.key('KeyA');
    played.length = 0;
    pip.key('Enter');
    for (let i = 0; i < 30; i++) frame(16, { canRest: false });
    expect(clock.seconds).toBe(0);
    expect(played).toEqual(['IISXXXX1']);
  });

  it('without sound (none was passed) everything works silently', () => {
    const pip = new PipBoy({ messages: new Map() } as unknown as ConstructorParameters<typeof PipBoy>[0]);
    pip.show();
    pip.update({ clock: new Clock(), place: '' });
    expect(() => {
      pip.pointerDown(60, 450);
      pip.pointerUp(60, 450);
      pip.key('KeyA');
      pip.key('Enter');
    }).not.toThrow();
  });
});

describe('hint at the bottom of the window', () => {
  it('on the normal screen — about the alarm and exit, in the alarm — about arrows, Enter and back (RU and EN)', () => {
    // setLang writes the language into the page document — there is no document in the test.
    vi.stubGlobal('document', { documentElement: {} });
    const was = getLang();
    try {
      for (const lang of ['ru', 'en'] as const) {
        setLang(lang);
        expect(t('pipHint')).toMatch(/A.*(P.*Esc)/);
        expect(t('pipHintAlarm')).toMatch(/Enter.*A.*Esc/);
        expect(t('pipHintAlarm')).not.toBe(t('pipHint'));
      }
    } finally {
      setLang(was);
      vi.unstubAllGlobals();
    }
  });
});

describe('Pip-Boy: archives', () => {
  it('"Archives" opens the notes, "Status" and ← go back to quests, A opens the alarm instead of the notes', () => {
    const { pip, played } = makePip();
    pip.show();
    pip.pointerDown(60, 428);
    expect(pip.pointerUp(60, 428)).toBe(false);
    expect(pip.archiveShown).toBe(true);
    expect(played).toContain('IB1P1XX1');
    pip.pointerDown(60, 346);
    pip.pointerUp(60, 346);
    expect(pip.archiveShown).toBe(false);
    pip.pointerDown(60, 428);
    pip.pointerUp(60, 428);
    expect(pip.key('ArrowLeft')).toBe(true);
    expect(pip.archiveShown).toBe(false);
    pip.pointerDown(60, 428);
    pip.pointerUp(60, 428);
    expect(pip.key('KeyA')).toBe(true);
    expect(pip.alarmShown).toBe(true);
    expect(pip.archiveShown).toBe(false);
  });
});
