// Cathedral, courtyard (CHILDRN1, floor 0) → cathedral-ent.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'cathedral-ent',
  constName: 'CATHEDRAL_ENT',
  title: { ru: 'Собор, двор', en: 'Cathedral, courtyard' },
  doc: 'Cathedral courtyard (map CHILDRN1, elevation 0): exit to the wasteland and doors into the cathedral.',
  music: '11CHILRN',
  outdoor: true,
  wallTexture: 'ruin',
  floor: 'asphalt',
  // The cathedral itself, behind the facade with the doors (cells 0–16 × 25–36), follows the client's picture (2026-10-21: "make the same
  // building"): below, a long hall (4.5 storeys) with three doors; above it a central tower with a huge stained-glass window, a band of
  // relief and a winged figure above the entrance; on either side of the stained glass, pinnacled buttresses; wings with lancet windows;
  // domed turrets at the facade's corners, domes on drums and spires at the back. Tall walls are LevelDef.towers (later ones
  // in the list win), domes are rounds, the stained glass and reliefs are panels.
  towers: [
    { x0: 0, y0: 25, x1: 17, y1: 38, height: 4.5, texture: 'cathBase' },
    { x0: 0, y0: 25, x1: 12, y1: 28, height: 13, texture: 'gothicWall' },
    { x0: 0, y0: 34, x1: 12, y1: 37, height: 13, texture: 'gothicWall' },
    { x0: 0, y0: 28, x1: 8, y1: 34, height: 18, texture: 'gothicWall' },
    { x0: 8, y0: 28, x1: 14, y1: 34, height: 23, texture: 'cathTower' },
    { x0: 9, y0: 29, x1: 13, y1: 33, height: 26, texture: 'cathTower' },
    { x0: 10, y0: 30, x1: 12, y1: 32, height: 40, texture: 'gothicSpire' },
    { x0: 12, y0: 27, x1: 14, y1: 28, height: 30, texture: 'cathPier' },
    { x0: 12, y0: 34, x1: 14, y1: 35, height: 30, texture: 'cathPier' },
    { x0: 15, y0: 28, x1: 16, y1: 29, height: 3.6, texture: 'gothicDoor' },
    { x0: 15, y0: 31, x1: 16, y1: 32, height: 3.6, texture: 'gothicDoor' },
    { x0: 15, y0: 34, x1: 16, y1: 35, height: 3.6, texture: 'gothicDoor' },
  ],
  rounds: [
    { x: 14.6, y: 25.7, radius: 1.1, height: 14, texture: 'cathDrum' },
    { x: 14.6, y: 25.7, radius: 0.9, height: 15, texture: 'cathDome' },
    { x: 14.6, y: 25.7, radius: 0.65, height: 15.7, texture: 'cathDome' },
    { x: 14.6, y: 25.7, radius: 0.38, height: 16.2, texture: 'cathDome' },
    { x: 14.6, y: 25.7, radius: 0.12, height: 23, texture: 'gothicSpire' },
    { x: 14.6, y: 36.3, radius: 1.1, height: 14, texture: 'cathDrum' },
    { x: 14.6, y: 36.3, radius: 0.9, height: 15, texture: 'cathDome' },
    { x: 14.6, y: 36.3, radius: 0.65, height: 15.7, texture: 'cathDome' },
    { x: 14.6, y: 36.3, radius: 0.38, height: 16.2, texture: 'cathDome' },
    { x: 14.6, y: 36.3, radius: 0.12, height: 23, texture: 'gothicSpire' },
    { x: 3, y: 27, radius: 2, height: 19, texture: 'cathDrum' },
    { x: 3, y: 27, radius: 1.7, height: 20.2, texture: 'cathDome' },
    { x: 3, y: 27, radius: 1.3, height: 21.2, texture: 'cathDome' },
    { x: 3, y: 27, radius: 0.8, height: 21.9, texture: 'cathDome' },
    { x: 3, y: 27, radius: 0.45, height: 23.5, texture: 'cathDrum' },
    { x: 3, y: 27, radius: 0.15, height: 30, texture: 'gothicSpire' },
    { x: 3, y: 35, radius: 2, height: 19, texture: 'cathDrum' },
    { x: 3, y: 35, radius: 1.7, height: 20.2, texture: 'cathDome' },
    { x: 3, y: 35, radius: 1.3, height: 21.2, texture: 'cathDome' },
    { x: 3, y: 35, radius: 0.8, height: 21.9, texture: 'cathDome' },
    { x: 3, y: 35, radius: 0.45, height: 23.5, texture: 'cathDrum' },
    { x: 3, y: 35, radius: 0.15, height: 30, texture: 'gothicSpire' },
    { x: 4, y: 31, radius: 2.6, height: 25, texture: 'cathDrum' },
    { x: 4, y: 31, radius: 2.2, height: 26.5, texture: 'cathDome' },
    { x: 4, y: 31, radius: 1.7, height: 27.7, texture: 'cathDome' },
    { x: 4, y: 31, radius: 1.1, height: 28.6, texture: 'cathDome' },
    { x: 4, y: 31, radius: 0.5, height: 30.5, texture: 'cathDrum' },
    { x: 4, y: 31, radius: 0.18, height: 42, texture: 'gothicSpire' },
  ],
  panels: [
    { face: 'east', at: 14, a0: 28, a1: 34, from: 4.6, to: 8, picture: 'wingedFigure' },
    { face: 'east', at: 14, a0: 28, a1: 34, from: 8, to: 10, picture: 'frieze' },
    { face: 'east', at: 14, a0: 28, a1: 34, from: 10, to: 21.5, picture: 'greatWindow' },
  ],
  // Above the winged figure the cathedral sinks into fog; only the light of the big windows shows through it (client, 2026-10-21).
  haze: { from: 7.6, to: 11.5, max: 0.94 },
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  // The original's doors that move the hero to another floor become exits used with E.
  doorExits: {
    COCDOOR: { map: 'cathedral-1', entry: 't22499' },
  },
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'cathedral' } }",
  },
  entrances: { 0: 'wasteland', 2: 't17300' },
  entries: {
    wasteland: { tile: 20500, facing: 'south' },
    t19701: { tile: 19701, facing: 'south' },
    // The original map's point for entrance #2 (the JEREM script calls load_map(17, 2): the return to the cathedral).
    t17300: { tile: 17300, facing: 'south' },
  },
};

export default config;
