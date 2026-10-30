// Khans camp (RAIDERS, floor 0) → raiders. The map's diamond is fenced with world map exit marks (X).
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'raiders',
  constName: 'RAIDERS',
  title: { ru: 'Лагерь Ханов', en: 'Raiders camp' },
  doc: 'The Khans\' camp (map RAIDERS): dugouts and houses in the middle of a big plain, an exit to the wasteland along the edge of the diamond.',
  music: '05RAIDER',
  outdoor: true,
  // As in the original (client, 2026-10-24): brown wasteland, a dark house with a brick base and a plank floor, flat roof,
  // doorless openings; tents are canvas without a roof (the original's tent roof is yrf*, otherwise the tent would come out two storeys tall).
  walls: { '#': 'darkConcrete', 'B': 'oldBrick', 'T': 'canvas', 'W': 'plankWall' },
  wallArts: [
    [/^nec0[5-6]\d/i, 'B'],
    [/^(ybk|ylf|yrt)/i, 'T'],
    // Wooden door frames of the tent entrances (j?s*) and the poles (cni) are planks.
    [/^(j[a-d][a-z][0-9]|cni)/i, 'W'],
  ],
  floor: 'wasteland',
  paint: true,
  roofs: 'darkConcrete',
  roofSkip: /^yrf/i,
  doorways: true,
  revision: 1,
  blockers: [0x02000043, 0x02000158],
  hull: true,
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'raiders' } }",
  },
  // From the wasteland: the map's starting cell per the RAIDMAP script (default entrance): by the eastern edge of the camp.
  // Tandi's cell (under the RAIDDOOR door): the map floor there is an "empty tile", which makes us give those cells to rock; the script places Tandi here (tile 17905).
  patches: [[23, 38, '.'], [23, 39, '.'], [24, 38, '.']],
  entrances: { 0: 'wasteland', 1: 'wasteland' },
  entries: { wasteland: { tile: 26696, facing: 'west' } },
};

export default config;
