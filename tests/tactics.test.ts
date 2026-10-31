// AI-2…AI-4: enemy tactics. Shooters hide behind walls after a burst and to reload, peek out and shoot
// again; at the squad's command they flank the hero; wounded people retreat and hide, animals just flee;
// one cornered fights. People shout to their allies, animals are silent.
import { describe, expect, it } from 'vitest';
import type { SpriteSheet } from '../src/assets/sprites.ts';
import { buildLevel } from '../src/engine/level.ts';
import { findCover, findFlank, findPeek, findRetreat } from '../src/game/ai/cover.ts';
import { Creature, lineOfSight, MAX_MELEE_ATTACKERS, type BarkKey, type CreatureArt, type CreatureWeapon, type Target } from '../src/game/creature.ts';
import { parseLevelDef } from '../src/world/defs.ts';

const sheet: SpriteSheet = {
  fps: 10,
  actionFrame: 0,
  directions: Array.from({ length: 6 }, () => [{ width: 1, height: 1, pixels: new Uint32Array(1) }]),
  shifts: Array.from({ length: 6 }, () => ({ x: 0, y: 0 })),
  offsets: Array.from({ length: 6 }, () => [{ x: 0, y: 0 }]),
};
const art: CreatureArt = { stand: sheet, walk: sheet, attack: sheet, hit: sheet, death: sheet };
const stats = { name: 'Raider', maxHp: 30, ac: 0, armor: { dt: 0, dr: 0 }, skill: 50, damage: { min: 1, max: 2 }, experience: 0 };
const pistol: CreatureWeapon = { melee: false, range: 10, damage: { min: 3, max: 5 }, skill: 60, pause: 0.3, magazine: 12, reload: 0.9, spare: 24, sound: '' };
const level = (grid: string[]) =>
  buildLevel(parseLevelDef({ id: 't', music: '', floor: 'floor', ceiling: 'ceiling', fade: 10, grid, entries: { s: { x: 1.5, y: 1.5, angle: 0 } } }));
// A wall ledge at the top left: you can hide behind it from a hero on the right.
const ledge = level(['##############', '#..##........#', '#............#', '#............#', '##############']);
const field = level(['########################', ...Array.from({ length: 10 }, () => '#......................#'), '########################']);
const deadEnd = level(['#######', '#.....#', '#######']);

const east = 0;

interface Log {
  fired: number[];
  bitten: number;
  plans: string[];
  barks: BarkKey[];
  lostSight: boolean;
}

function run(c: Creature, lvl: ReturnType<typeof level>, target: Target, seconds: number, log?: Log): Log {
  const out = log ?? { fired: [], bitten: 0, plans: [], barks: [], lostSight: false };
  const start = out.fired.length ? out.fired[out.fired.length - 1]! : 0;
  for (let t = 0; t < seconds; t += 0.05) {
    c.update(
      0.05,
      lvl,
      target,
      [c],
      () => out.bitten++,
      () => out.fired.push(start + t),
    );
    if (out.plans[out.plans.length - 1] !== c.plan) out.plans.push(c.plan);
    const b = c.takeBark();
    if (b) out.barks.push(b);
    if (!c.chasing) out.lostSight = true;
  }
  return out;
}

describe('cover and positions', () => {
  it('cover is a cell by a wall from which the hero is not visible; peeking is next to it, from where he is visible', () => {
    const hero = { x: 11.5, y: 2.5 };
    const cover = findCover(ledge, { x: 2.5, y: 2.5 }, hero)!;
    expect(cover).not.toBeNull();
    expect(lineOfSight(ledge, cover.x, cover.y, hero.x, hero.y)).toBe(false);
    expect(Math.hypot(cover.x - 2.5, cover.y - 2.5)).toBeLessThan(2);
    const peek = findPeek(ledge, cover, hero, 10)!;
    expect(lineOfSight(ledge, peek.x, peek.y, hero.x, hero.y)).toBe(true);
    expect(Math.hypot(peek.x - cover.x, peek.y - cover.y)).toBeLessThanOrEqual(3.5);
  });

  it('does not take someone else\'s cover; there is no cover in an open field', () => {
    const hero = { x: 11.5, y: 2.5 };
    const first = findCover(ledge, { x: 2.5, y: 2.5 }, hero)!;
    const second = findCover(ledge, { x: 2.5, y: 2.5 }, hero, 7, [first]);
    expect(second).not.toEqual(first);
    expect(findCover(field, { x: 10.5, y: 5.5 }, { x: 14.5, y: 5.5 })).toBeNull();
  });

  it('flanking — to the side of the "hero — ally" line', () => {
    const hero = { x: 12.5, y: 5.5 };
    const ally = { x: 4.5, y: 5.5 };
    const spot = findFlank(field, { x: 5.5, y: 6.5 }, hero, ally, 1, 5)!;
    expect(spot).not.toBeNull();
    // The ally is west of the hero — the flanker ends up north or south of him, not behind the ally.
    expect(Math.abs(spot.y - hero.y)).toBeGreaterThan(2);
    expect(Math.abs(spot.x - hero.x)).toBeLessThan(3);
  });

  it('retreating — farther from the hero; in a dead end there is nowhere to retreat', () => {
    const away = findRetreat(field, { x: 10.5, y: 5.5 }, { x: 13.5, y: 5.5 })!;
    expect(Math.hypot(away.x - 13.5, away.y - 5.5)).toBeGreaterThan(8);
    expect(findRetreat(deadEnd, { x: 1.5, y: 1.5 }, { x: 3.5, y: 1.5 })).toBeNull();
  });
});

describe('a shooter in combat', () => {
  it('after a burst hides behind the ledge, peeks out and shoots again without losing the hero', () => {
    const c = new Creature(1, 2.5, 2.5, stats, art, true, east, pistol);
    c.talks = true;
    const log = run(c, ledge, { x: 11.5, y: 2.5, alive: true }, 8);
    expect(log.plans).toContain('hide');
    expect(log.plans).toContain('peek');
    const hid = log.plans.indexOf('hide');
    expect(hid).toBeGreaterThan(0);
    // Shot both before cover and after (having peeked out).
    expect(log.fired.length).toBeGreaterThanOrEqual(5);
    expect(log.lostSight).toBe(false);
    expect(log.barks[0]).toBe('contact');
  });

  it('in an open field there is nowhere to take cover — shoots while dodging with a step sideways', () => {
    const c = new Creature(1, 6.5, 5.5, stats, art, true, east, pistol);
    const log = run(c, field, { x: 14.5, y: 5.5, alive: true }, 4);
    expect(log.fired.length).toBeGreaterThanOrEqual(3);
    expect(log.plans).not.toContain('hide');
    expect(c.x).toBeLessThan(8);
  });

  it('the squad ordered flanking — it goes around; it does not go a second time right away', () => {
    const c = new Creature(1, 6.5, 5.5, stats, art, true, east, { ...pistol, magazine: 100 });
    c.talks = true;
    // Shouts no more often than once every few seconds: first "target spotted", 5 s later — about flanking.
    run(c, field, { x: 14.5, y: 5.5, alive: true }, 5);
    expect(c.readyToFlank).toBe(true);
    const spot = { x: 13.5, y: 1.5 };
    const before = Math.hypot(spot.x - c.x, spot.y - c.y);
    c.flankTo(spot, -1);
    expect(c.plan).toBe('flank');
    expect(c.takeBark()).toBe('flankLeft');
    expect(c.readyToFlank).toBe(false);
    run(c, field, { x: 14.5, y: 5.5, alive: true }, 2.5);
    expect(Math.hypot(spot.x - c.x, spot.y - c.y)).toBeLessThan(before - 3);
  });
});

describe('the wounded', () => {
  it('a person without stimpaks at a quarter of health retreats and shouts about it', () => {
    const c = new Creature(1, 10.5, 5.5, stats, art, true, east, pistol);
    c.talks = true;
    const hero = { x: 14.5, y: 5.5, alive: true };
    run(c, field, hero, 0.1);
    c.takeBark();
    c.hurt(23);
    const log = run(c, field, hero, 3);
    expect(c.plan).toBe('flee');
    expect(Math.hypot(c.x - hero.x, c.y - hero.y)).toBeGreaterThan(7.5);
    expect(log.barks).toContain('retreat');
  });

  it('one who fights to the death (its AI packet says so, like Gizmo) does not retreat even at a quarter of health', () => {
    const c = new Creature(1, 10.5, 5.5, stats, art, true, east, pistol);
    c.talks = true;
    c.fightsToDeath = true;
    const hero = { x: 14.5, y: 5.5, alive: true };
    run(c, field, hero, 0.1);
    c.hurt(23);
    const log = run(c, field, hero, 3);
    expect(c.plan).not.toBe('flee');
    expect(log.fired.length).toBeGreaterThan(0);
  });

  it('an animal at a third of health flees and stays silent', () => {
    const c = new Creature(1, 10.5, 5.5, stats, art, true, east);
    const hero = { x: 13.5, y: 5.5, alive: true };
    run(c, field, hero, 0.1);
    c.hurt(22);
    const log = run(c, field, hero, 3);
    expect(Math.hypot(c.x - hero.x, c.y - hero.y)).toBeGreaterThan(6.5);
    expect(log.barks).toEqual([]);
  });

  it('a wounded animal right next to the hero does not bite but flees (does not run past the hero)', () => {
    const c = new Creature(1, 10.5, 5.5, stats, art, true, east);
    const hero = { x: 11.3, y: 5.5, alive: true };
    run(c, field, hero, 0.1);
    c.hurt(25);
    const log = run(c, field, hero, 2);
    expect(log.bitten).toBe(0);
    expect(c.x).toBeLessThan(hero.x - 3);
  });

  it('one cornered fights', () => {
    const c = new Creature(1, 1.5, 1.5, stats, art, true, east);
    const hero = { x: 2.6, y: 1.5, alive: true };
    run(c, deadEnd, hero, 0.1);
    c.hurt(25);
    const log = run(c, deadEnd, hero, 3);
    expect(log.bitten).toBeGreaterThan(0);
  });
});

describe('a pack at the hero', () => {
  it('six animals point-blank, but no more than three bite at once; the rest wait their turn', () => {
    const hero: Target = { x: 10.5, y: 5.5, alive: true };
    const pack = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      const c = new Creature(i + 1, hero.x + Math.cos(a) * 0.6, hero.y + Math.sin(a) * 0.6, { ...stats, name: 'Rat' }, art, true);
      c.alertTo(hero.x, hero.y);
      return c;
    });
    let most = 0;
    let bites = 0;
    for (let t = 0; t < 6; t += 0.05) {
      for (const c of pack) c.update(0.05, field, hero, pack, () => bites++);
      most = Math.max(most, pack.filter((c) => c.striking).length);
    }
    expect(most).toBeLessThanOrEqual(MAX_MELEE_ATTACKERS);
    expect(bites).toBeGreaterThan(6);
  });
});
