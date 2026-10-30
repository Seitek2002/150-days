// Ending slides (client, 2026-10-25): the table "outcome → slide and narrator recording" is ours, based on the meaning of the
// original's recordings and the story variables (src/game/endings.ts). Recording numbers are the NAR_n file numbers from the player's copy.
import { describe, expect, it } from 'vitest';
import { endingSlides, GVAR } from '../src/game/endings.ts';

const g = (vars: Record<number, number>) => Object.fromEntries(Object.entries(vars).map(([n, v]) => [`g${n}`, v]));

describe('ending slides', () => {
  it('victory with no special outcomes: the Cathedral, Shady with Tandi, the Hub, a dry Necropolis, the Brotherhood, raiders, "what became of you"', () => {
    const slides = endingSlides({}, 'won');
    expect(slides.map((s) => s.nar)).toEqual([11, 19, 32, 12, 28, 36, 40]);
    expect(slides[0]).toEqual({ image: 'SEQ3C', nar: 11 });
    expect(slides.at(-1)).toEqual({ image: '', nar: 40 });
    // No Junktown: neither Killian nor Gizmo died, as in the original.
    expect(slides.some((s) => s.image.startsWith('SEQ5'))).toBe(false);
  });

  it('location outcomes: Tandi killed, Gizmo dead, Necropolis pump repaired, raiders wiped out', () => {
    const vars = g({ [GVAR.tandiDead]: 1, [GVAR.gizmoDead]: 1, [GVAR.necropPumpFixed]: 1, [GVAR.totalRaiders]: 0 });
    const slides = endingSlides(vars, 'won');
    expect(slides.map((s) => s.nar)).toEqual([11, 20, 24, 32, 13, 28, 35, 40]);
    // A living Necropolis is a night city with lights, Killian's Junktown is his slide.
    expect(slides.find((s) => s.nar === 13)!.image).toBe('SEQ2B');
    expect(slides.find((s) => s.nar === 24)!.image).toBe('SEQ5A');
  });

  it('Killian dead: Junktown goes to Gizmo', () => {
    const slides = endingSlides(g({ [GVAR.killianDead]: 1 }), 'won');
    expect(slides.find((s) => s.image === 'SEQ5B')!.nar).toBe(25);
  });

  it('mutant invasion: towns destroyed, no Cathedral and no "what became of you"', () => {
    const slides = endingSlides({}, 'invasion');
    expect(slides.map((s) => s.nar)).toEqual([23, 27, 34, 15, 31, 37]);
    expect(slides.map((s) => s.image)).toEqual(['SEQ4DE', 'SEQ5D', 'SEQ7C', 'SEQ2AD', 'SEQ6B', 'SEQ8ABC']);
  });

  it('a town ruined by mutants before the finale (invasion variable) is destroyed in the victory ending too', () => {
    const slides = endingSlides(g({ [GVAR.necropolisInvaded]: 1 }), 'won');
    expect(slides.find((s) => s.image === 'SEQ2AD')!.nar).toBe(15);
  });
});
