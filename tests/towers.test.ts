// Tall buildings (the Cathedral): walls in a rectangle get their own image and height, round towers get their own cells,
// paintings get their own cell sides; passages do not change.
import { describe, expect, it } from 'vitest';
import { panelPicture } from '../src/engine/cathedral-textures.ts';
import { buildLevel } from '../src/engine/level.ts';
import { parseLevelDef } from '../src/world/defs.ts';
import { LEVELS } from '../src/world/levels/index.ts';

describe('tall buildings', () => {
  const parsed = parseLevelDef(LEVELS['cathedral-ent']!);
  const level = buildLevel(parsed);
  const at = (x: number, y: number) => y * level.width + x;

  it('the Cathedral has a lower hall with doors, a central tower, buttresses; the floor stays floor', () => {
    expect(level.walls[at(16, 30)]).toBe('cathBase');
    expect(level.heights![at(16, 30)]).toBeCloseTo(4.5);
    expect(level.walls[at(15, 31)]).toBe('gothicDoor');
    expect(level.walls[at(13, 30)]).toBe('cathTower');
    expect(level.heights![at(13, 30)]).toBe(23);
    expect(level.walls[at(13, 27)]).toBe('cathPier');
    expect(level.maxHeight).toBe(42);
    for (let i = 0; i < parsed.walls.length; i++) if (parsed.walls[i] === null) expect(level.walls[i]).toBeNull();
  });

  it('domes: circles in the cells they touch; the corners of the square around them do not; only in walls', () => {
    const rounds = level.rounds!;
    const center = level.roundsAt![at(4, 31)]!;
    expect(center.length).toBeGreaterThan(3);
    expect(Math.max(...center.map((n) => rounds[n]!.height))).toBe(42);
    expect(level.heights![at(4, 31)]).toBe(42);
    // A corner of the square around the dome at the corner of the facade.
    expect(level.roundsAt![at(13, 27)]).toBeUndefined();
    for (let i = 0; i < level.walls.length; i++) if (level.roundsAt![i]) expect(level.walls[i]).not.toBeNull();
    // The doors did not become domes.
    for (const y of [28, 31, 34]) expect(level.roundsAt![at(15, y)]).toBeUndefined();
  });

  it('paintings on the east wall of the tower: a winged figure, a relief and a stained-glass window, one above the other', () => {
    const list = level.panelAt!.get(at(13, 30) * 4 + 1)!;
    expect(list.map((n) => level.panels![n]!.picture)).toEqual(['wingedFigure', 'frieze', 'greatWindow']);
    expect(level.panelAt!.get(at(13, 30) * 4 + 0)).toBeUndefined();
  });

  it('painting images: size in cells and floors, the stained glass glows, the figure has transparent pixels', () => {
    const win = panelPicture('greatWindow');
    expect(win.pixels.length).toBe(win.w * win.h);
    expect(win.glow.some((g) => g === 1)).toBe(true);
    const fig = panelPicture('wingedFigure');
    expect(fig.pixels.some((p) => p === 0)).toBe(true);
    expect(fig.pixels.some((p) => p !== 0)).toBe(true);
  });
});

describe('the mountain above the Military Base', () => {
  const def = LEVELS['mbase-ent']!;
  const level = buildLevel(parseLevelDef(def));
  const at = (x: number, y: number) => y * level.width + x;

  it('a two-storey facade with a gate in it (a door with a script), the mountain is higher than the facade and grows from the slope inward; the floor has no height', () => {
    expect(level.walls[at(20, 14)]).toBe('baseFacade');
    expect(level.heights![at(20, 14)]).toBe(2);
    expect(level.doors.has(at(23, 14))).toBe(true);
    expect((def.objects ?? []).some((o) => o.kind === 'exit' && o.to.map === 'mbase-1')).toBe(false);
    for (let x = 9; x <= 36; x++) {
      expect(level.heights![at(x, 13)], `above the facade, cell ${x}`).toBeGreaterThan(2);
      expect(level.heights![at(x, 2)], `deep inside, cell ${x}`).toBeGreaterThan(level.heights![at(x, 13)]! - 1);
    }
    expect(level.maxHeight).toBe(14);
    for (let i = 0; i < level.walls.length; i++) if (level.walls[i] === null) expect(level.heights![i] ?? 0).toBe(0);
  });

  it('height digits: rows like the grid, a letter means tens of floors', () => {
    const tiny = buildLevel(parseLevelDef({ ...def, id: 'tiny', grid: ['RRRR', 'RMMR', 'R..R', 'RRRR'], storeys: ['....', '.3c.', '.99.', '....'], objects: [], entries: { a: { x: 1.5, y: 2.5, angle: 0 } } }));
    expect(tiny.heights![1 * 4 + 1]).toBe(3);
    expect(tiny.heights![1 * 4 + 2]).toBe(12);
    // On the floor a digit does nothing.
    expect(tiny.heights![2 * 4 + 1]).toBe(0);
  });
});
