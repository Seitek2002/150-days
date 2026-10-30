// Khans camp, arena (RAIDERS, floor 1) → raiders-arena. Garl's script moves the hero and Garl here for the duel
// (move_to to floor 1); after the fight the same script returns the hero to the camp, to the cell it took him from.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'raiders-arena',
  constName: 'RAIDERS_ARENA',
  title: { ru: 'Лагерь Ханов, арена', en: 'Raiders camp, arena' },
  doc: 'The Khans\' camp arena (map RAIDERS, floor 1): a ground for the duel with Garl; there is no exit: the script brings you back from the arena.',
  music: '05RAIDER',
  outdoor: true,
  walls: { '#': 'darkConcrete' },
  floor: 'wasteland',
  blockers: [0x02000043, 0x02000158],
  // The hero stands where Garl's script puts him (hex 20102), facing Garl (20301).
  entries: { arena: { tile: 20102, facing: 'west' } },
};

export default config;
