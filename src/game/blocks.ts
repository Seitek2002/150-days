// The original's scenery, containers and furniture that we place as solid objects rather than flat images: our own
// drawing on all sides, the object stands with its back to the wall and its face to the room, it can't be walked through. They come as a box
// (a locker, a terminal), a cylinder (a barrel, a column) and composite (a chair: legs, seat, back; a table: a top on
// legs). Which object becomes what is decided by the name of its image in the player's copy (only the file name, the image itself isn't
// needed). Irregular things (plants, rocks, junk, cars) can't be done this way — they aren't here.
import { blocksIn, removeBlock, wallAt, type Block, type Level } from '../engine/level.ts';
import type { TextureName } from '../engine/textures.ts';

/**
 * A part of a composite object in the object's own fractions: across — l0..l1 (left to right, as seen from the front), in depth —
 * d0..d1 (0 — the face, 1 — the back at the wall); height — from base to height (a wall is 1).
 */
export interface PartShape {
  l0: number;
  l1: number;
  d0: number;
  d1: number;
  base: number;
  height: number;
  front: TextureName;
  side: TextureName;
  top: TextureName;
  round?: boolean;
  /** A round part: the middle of the drawing faces the viewer (a body in a Glow tank). */
  toViewer?: boolean;
}

/** An object's shape: drawings, height, width along the wall and depth from the wall (in cells); parts; light. */
export interface BlockShape {
  front: TextureName;
  side: TextureName;
  top: TextureName;
  height: number;
  width: number;
  depth: number;
  /** A cylinder (width = depth). */
  round?: boolean;
  /** Composite: only the parts are drawn, the object itself is a boundary that can't be passed through. */
  parts?: PartShape[];
  /** Gives light (a burning barrel): radius in cells and strength, like the original's lamps. */
  light?: { radius: number; intensity: number };
  /** Bottom above the floor (a wall console). */
  base?: number;
  /** A ladder: it also stands on the exit cell for E (the level's stair transition) — E triggers the exit, and the ladder is visible. */
  exit?: boolean;
  /** Hangs on a wall. No wall nearby — fallback (a console — a floor terminal), and if there's none — stands on the floor. */
  wall?: boolean;
  fallback?: BlockShape;
  /**
   * Larger than a cell (a car, a truck, a cart): width — across, depth — length; placed at the original's location with its long
   * side where there's free space, and lies in every cell it occupies.
   */
  span?: boolean;
  /** An invisible stopper: the level draws the object itself (the beam at the Glow's crater — src/engine/crater.ts), there's no image. */
  hidden?: boolean;
}

/**
 * Goods on a counter (the original's tbltop — "Items" you can rummage through): a stack of boxes — two below and one on top.
 * top — at what height it lies (a tabletop under it; 0 — on the floor). Client, 2026-10-26: at Killian's these were flat images.
 */
export const TABLETOP_GOODS = /^tbltop/i;
export function goodsShape(top: number): BlockShape {
  const box = { front: 'crateSide', side: 'crateSide', top: 'crateTop' } as const;
  return {
    ...box,
    height: top + 0.25,
    width: 0.62,
    depth: 0.44,
    parts: [
      // For parts, height is the height of the top edge above the floor, not the thickness.
      { l0: 0.02, l1: 0.54, d0: 0.06, d1: 0.94, base: top, height: top + 0.16, ...box },
      { l0: 0.58, l1: 0.98, d0: 0.18, d1: 0.82, base: top, height: top + 0.12, ...box },
      { l0: 0.12, l1: 0.46, d0: 0.2, d1: 0.74, base: top + 0.16, height: top + 0.25, ...box },
    ],
  };
}

/**
 * The original's large objects assembled from pieces: casino tables (the craps table and the roulette — five images in a row each) and
 * a stairway up (stair00–07 — seven images of one flight). With us, the pieces of one object are one large object along
 * the row of pieces (scene.ts — joinPieces). Client, 2026-10-29: in the Junktown casino the pieces stood as separate small tables and
 * flat images, the stairs between floors were flat.
 */
export const PIECED = /^(crptbl|roltbl|stair0[0-7])/i;
export function piecedShape(art: string): BlockShape {
  return /^stair/i.test(art) ? stairsUp() : casinoTable(art);
}

/** A Glow storage tank: a base with railings, a vessel (intact or broken), a cap, a machine by the wall and an arc of pipe to it. */
function stasisPod(broken: boolean): BlockShape {
  const RUST = { front: 'vaultRust', side: 'vaultRust', top: 'vaultRust' } as const;
  const tube = broken ? 'stasisTubeBroken' : 'stasisTube';
  const posts: PartShape[] = [
    [0.04, 0.46],
    [0.46, 0.04],
    [0.88, 0.46],
    [0.46, 0.88],
  ].map(([l, d]) => ({ l0: l!, l1: l! + 0.06, d0: d!, d1: d! + 0.06, base: 0.08, height: 0.3, ...METAL }));
  return {
    ...RUST,
    height: 0.95,
    width: 0.95,
    depth: 0.95,
    parts: [
      { l0: 0, l1: 1, d0: 0, d1: 1, base: 0, height: 0.08, ...RUST, round: true },
      ...posts,
      { l0: 0.15, l1: 0.62, d0: 0.08, d1: 0.55, base: 0.08, height: 0.82, front: tube, side: tube, top: 'metalTop', round: true, toViewer: true },
      { l0: 0.11, l1: 0.66, d0: 0.04, d1: 0.59, base: 0.82, height: 0.92, ...RUST, round: true },
      { l0: 0.6, l1: 0.96, d0: 0.58, d1: 0.98, base: 0.08, height: 0.6, front: 'pipeMachine', side: 'metalSide', top: 'metalTop' },
      { l0: 0.42, l1: 0.82, d0: 0.4, d1: 0.5, base: 0.84, height: 0.9, front: 'pipeRiser', side: 'pipeRiser', top: 'pipeRiser' },
      { l0: 0.74, l1: 0.82, d0: 0.4, d1: 0.7, base: 0.6, height: 0.9, front: 'pipeRiser', side: 'pipeRiser', top: 'pipeRiser' },
    ],
  };
}

/** A stairway up: steps from the face to the back, the top one touches the ceiling (back to the wall, if there is one). */
function stairsUp(): BlockShape {
  const steps = 8;
  const parts: PartShape[] = Array.from({ length: steps }, (_, k) => ({ l0: 0, l1: 1, d0: k / steps, d1: (k + 1) / steps, base: 0, height: (k + 1) / steps, ...WOOD }));
  return { ...WOOD, height: 1, width: 0.9, depth: 1.8, span: true, exit: true, parts };
}

/** A casino table: a pedestal, cloth with a rim; the roulette has a wheel at the edge. */
function casinoTable(art: string): BlockShape {
  const roulette = /^roltbl/i.test(art);
  const rim = { base: 0.24, height: 0.27, ...WOOD };
  const parts: PartShape[] = [
    { l0: 0.07, l1: 0.93, d0: 0.05, d1: 0.95, base: 0, height: 0.2, ...WOOD },
    { l0: 0, l1: 1, d0: 0, d1: 1, base: 0.2, height: 0.24, ...WOOD, top: 'feltTop' },
    { l0: 0, l1: 0.05, d0: 0, d1: 1, ...rim },
    { l0: 0.95, l1: 1, d0: 0, d1: 1, ...rim },
    { l0: 0.05, l1: 0.95, d0: 0, d1: 0.03, ...rim },
    { l0: 0.05, l1: 0.95, d0: 0.97, d1: 1, ...rim },
  ];
  if (roulette) parts.push({ l0: 0.3, l1: 0.7, d0: 0.05, d1: 0.27, base: 0.24, height: 0.3, ...WOOD, round: true });
  return { ...WOOD, top: 'feltTop', height: 0.3, width: 0.95, depth: roulette ? 1.7 : 2, span: true, parts };
}

/** Computers, consoles, monitors, control panels — our terminal. Thin: people walk past it at a wall. */
const TERMINAL: BlockShape = { front: 'terminalFront', side: 'terminalSide', top: 'terminalTop', height: 0.72, width: 0.8, depth: 0.28 };
/** Mainframe cabinets with tape reels (the Brotherhood, the Glow): taller than a man. */
const MAINFRAME: BlockShape = { front: 'mainframeFront', side: 'terminalSide', top: 'terminalTop', height: 0.95, width: 0.72, depth: 0.34 };
/** A locker: tall and narrow, on the floor. */
const LOCKER: BlockShape = { front: 'lockerFront', side: 'metalSide', top: 'metalTop', height: 0.92, width: 0.48, depth: 0.3 };
/** The Shady Sands stone monument (pillar): a base slab and a narrow stele almost as tall as a wall. */
const OBELISK: BlockShape = {
  front: 'obelisk',
  side: 'obelisk',
  top: 'obelisk',
  height: 0.98,
  width: 0.5,
  depth: 0.5,
  parts: [
    { l0: 0, l1: 1, d0: 0, d1: 1, base: 0, height: 0.12, front: 'obelisk', side: 'obelisk', top: 'obelisk' },
    { l0: 0.27, l1: 0.73, d0: 0.27, d1: 0.73, base: 0.12, height: 0.98, front: 'obelisk', side: 'obelisk', top: 'obelisk' },
  ],
};
/** Two pipes along a wall. */
const PIPE_RUN: BlockShape = { front: 'pipeRun', side: 'pipeRun', top: 'metalTop', base: 0.62, height: 0.76, width: 0.98, depth: 0.12, wall: true };

/**
 * Pipes on vault walls. In the original these are wall pieces (not scenery), so they get into the map table (tools/map-scripts.ts →
 * wallDecor) separately: by the wall image name — the pipe kind (our word), and the shape is here.
 */
export const WALL_DECOR_RULES: [RegExp, WallDecorKind][] = [
  [/^pap/i, 'pipe'],
  [/^pbp/i, 'riser'],
  [/^pbc/i, 'valve'],
  [/^(pac|pbm|paf)/i, 'machine'],
  [/^fen\d/i, 'fence'],
];
export type WallDecorKind = 'pipe' | 'riser' | 'valve' | 'machine' | 'fence';
/**
 * A pen fence (Shady Sands, the Hub's farms): waist-high, you can see through it (a drawing with holes); the thickness is so the hero doesn't
 * slip through it while walking. It's placed along the axis where the neighbouring fence pieces are (scene.ts).
 */
export const FENCE = { height: 0.42, depth: 0.24 } as const;
/** A pen gate (an original door with a gate image) — slightly higher than the fence (a frame of beams). */
export const GATE_HEIGHT = 0.5;

/**
 * A fence block (gate — a gate leaf) in cell (cx, cy) along the x or y axis. style — a different fence (the mesh around the Brotherhood
 * bunker, LevelDef.fences): drawing and height.
 */
export function fenceBlock(cx: number, cy: number, along: 'x' | 'y', gate = false, style?: { texture: TextureName; height: number }): Block {
  const half = FENCE.depth / 2;
  const rail = style?.texture ?? (gate ? ('fenceGate' as const) : ('fenceRail' as const));
  const look = { front: rail, side: rail, height: style?.height ?? (gate ? GATE_HEIGHT : FENCE.height), fill: false };
  const top = style ? style.texture : ('fenceTop' as const);
  return along === 'x'
    ? { ...look, top, x0: cx, x1: cx + 1, y0: cy + 0.5 - half, y1: cy + 0.5 + half, facing: 3 }
    : { ...look, top, x0: cx + 0.5 - half, x1: cx + 0.5 + half, y0: cy, y1: cy + 1, facing: 0 };
}
const WALL_DECOR: Record<WallDecorKind, BlockShape> = {
  pipe: PIPE_RUN,
  riser: { front: 'pipeRiser', side: 'pipeRiser', top: 'metalTop', height: 1, width: 0.16, depth: 0.16, round: true, wall: true },
  valve: { front: 'valveFront', side: 'pipeRiser', top: 'metalTop', height: 1, width: 0.42, depth: 0.14, wall: true },
  machine: { front: 'pipeMachine', side: 'metalSide', top: 'metalTop', height: 0.86, width: 0.72, depth: 0.3, wall: true },
  // The scene places the fence itself (fenceBlock) — by the direction of the neighbouring pieces; this shape is just in case.
  fence: { front: 'fenceRail', side: 'fenceRail', top: 'fenceTop', height: FENCE.height, width: 1, depth: FENCE.depth },
};

/** The pipe kind by the original's wall image name; not a pipe — null. */
export function wallDecorOf(art: string): WallDecorKind | null {
  return WALL_DECOR_RULES.find(([re]) => re.test(art))?.[1] ?? null;
}

/** The shape of a pipe on a wall. */
export function wallDecorShape(kind: WallDecorKind): BlockShape {
  return WALL_DECOR[kind];
}

/** In ruined locations (a level with ruined) — the same computers, only broken: a smashed screen, dead lights. */
const BROKEN = new Map<BlockShape, BlockShape>([
  [TERMINAL, { ...TERMINAL, front: 'terminalBroken' }],
  [MAINFRAME, { ...MAINFRAME, front: 'mainframeBroken' }],
]);

type Look = Pick<PartShape, 'front' | 'side' | 'top'>;
const WOOD: Look = { front: 'woodSide', side: 'woodSide', top: 'woodTop' };
const METAL: Look = { front: 'metalSide', side: 'metalSide', top: 'metalTop' };
const FABRIC: Look = { front: 'fabric', side: 'fabric', top: 'fabric' };
const ENAMEL: Look = { front: 'fridgeSide', side: 'fridgeSide', top: 'fridgeSide' };
const DIRTY: Look = { front: 'dirtyEnamel', side: 'dirtyEnamel', top: 'dirtyEnamel' };

/** A toilet: a bowl and a tank against the wall. */
function toilet(look: Look): BlockShape {
  return {
    ...look,
    height: 0.42,
    width: 0.42,
    depth: 0.5,
    parts: [
      { l0: 0.18, l1: 0.82, d0: 0, d1: 0.72, base: 0, height: 0.22, ...look },
      { l0: 0.05, l1: 0.95, d0: 0.7, d1: 1, base: 0, height: 0.42, ...look },
    ],
  };
}

/** Four legs at the corners: thickness in fractions, height. */
function legs(size: number, height: number, look: Look): PartShape[] {
  return [
    [0, 0],
    [1 - size, 0],
    [0, 1 - size],
    [1 - size, 1 - size],
  ].map(([l, d]) => ({ l0: l!, l1: l! + size, d0: d!, d1: d! + size, base: 0, height, ...look }));
}

/** A table: a top on four legs. */
function table(height: number, look: Look, top: TextureName = look.top): PartShape[] {
  return [{ l0: 0, l1: 1, d0: 0, d1: 1, base: height - 0.04, height, ...look, top }, ...legs(0.09, height - 0.04, look)];
}

/** A car: a body on four wheels and what's on top (a cab, a truck bed). width — across, length — length. */
function vehicle(width: number, length: number, body: TextureName, top: PartShape[]): BlockShape {
  const tires: Look = { front: 'tire', side: 'tire', top: 'tire' };
  const wheels: PartShape[] = [
    [0, 0.1],
    [0.88, 0.1],
    [0, 0.7],
    [0.88, 0.7],
  ].map(([l, d]) => ({ l0: l!, l1: l! + 0.12, d0: d!, d1: d! + 0.2, base: 0, height: 0.22, ...tires }));
  return {
    front: body,
    side: body,
    top: body,
    height: 0.74,
    width,
    depth: length,
    span: true,
    parts: [...wheels, { l0: 0, l1: 1, d0: 0, d1: 1, base: 0.12, height: 0.36, front: body, side: body, top: body }, ...top],
  };
}

/** A sign on a post: a round post and a thin plate on top. */
function sign(face: TextureName): BlockShape {
  return {
    ...METAL,
    height: 0.95,
    width: 0.44,
    depth: 0.44,
    parts: [
      { l0: 0.45, l1: 0.55, d0: 0.45, d1: 0.55, base: 0, height: 0.62, ...METAL, round: true },
      { l0: 0, l1: 1, d0: 0.42, d1: 0.5, base: 0.58, height: 0.95, front: face, side: 'metalSide', top: 'metalTop' },
    ],
  };
}

/** A chair: legs, seat, back at the rear edge. */
function chair(look: Look): PartShape[] {
  return [...legs(0.12, 0.22, look), { l0: 0, l1: 1, d0: 0, d1: 1, base: 0.22, height: 0.26, ...look }, { l0: 0, l1: 1, d0: 0.86, d1: 1, base: 0.26, height: 0.6, ...look }];
}

/**
 * Shapes by the original's image name. Height — in fractions of a wall (eyes are at 0.45: what's lower is seen from above). Deeper than 0.3 —
 * the object occupies the middle of the cell (critters walk around it).
 */
/**
 * The blue booth of a special encounter (the original's TARDIS.FRM would stand as a flat image; client, 2026-10-27: "make it solid"):
 * a plinth, a body with doors, a stepped roof and a lamp.
 */
const POLICE_BOX: BlockShape = {
  front: 'policeBoxFront',
  side: 'policeBoxFront',
  top: 'policeBoxTop',
  height: 0.88,
  width: 0.62,
  depth: 0.62,
  parts: [
    { l0: 0, l1: 1, d0: 0, d1: 1, base: 0, height: 0.04, front: 'policeBoxTop', side: 'policeBoxTop', top: 'policeBoxTop' },
    { l0: 0.05, l1: 0.95, d0: 0.05, d1: 0.95, base: 0.04, height: 0.74, front: 'policeBoxFront', side: 'policeBoxFront', top: 'policeBoxTop' },
    { l0: 0.02, l1: 0.98, d0: 0.02, d1: 0.98, base: 0.74, height: 0.78, front: 'policeBoxTop', side: 'policeBoxTop', top: 'policeBoxTop' },
    { l0: 0.14, l1: 0.86, d0: 0.14, d1: 0.86, base: 0.78, height: 0.81, front: 'policeBoxTop', side: 'policeBoxTop', top: 'policeBoxTop' },
    { l0: 0.41, l1: 0.59, d0: 0.41, d1: 0.59, base: 0.81, height: 0.88, front: 'policeBoxLamp', side: 'policeBoxLamp', top: 'policeBoxTop' },
  ],
};

const SHAPES: [RegExp, BlockShape][] = [
  [/^tardis/i, POLICE_BOX],
  // Force field consoles and the door computer — a flat panel on the wall, empty below.
  [/^(forcont|doorcomp)/i, { front: 'panelFront', side: 'metalSide', top: 'metalTop', base: 0.3, height: 0.74, width: 0.56, depth: 0.1, wall: true, fallback: TERMINAL }],
  // Mainframe cabinets with tape reels: the Brotherhood, the Glow.
  [/^(stcomp|glcomp|compglw)/i, MAINFRAME],
  // Computers, monitors, screens, equipment and the base's "robo-receivers".
  [/^(comp\d|keybrd|cathcmp|mstr54|acomp|bvs(1[789]|2[09]|3[0-5]|4[3-9]|50)|ccmnitr|mdesk|monitr|screens|scomp|robcomp)/i, TERMINAL],
  // Lockers: tall and narrow; the wall-mounted one (vaults, client, 2026-10-24) hangs on the wall, empty below it, and if there's
  // no room by a wall — stands on the floor like a regular one.
  [/^walllkr/i, { front: 'wallLockerFront', side: 'metalSide', top: 'metalTop', base: 0.3, height: 0.86, width: 0.58, depth: 0.2, wall: true, fallback: LOCKER }],
  [/^locker/i, LOCKER],
  // Bookcases and shelves.
  [/^(bokcas|bkshlf|wshelv|sttools|bigshlf)/i, { front: 'shelfFront', side: 'woodSide', top: 'woodTop', height: 0.88, width: 0.9, depth: 0.3 }],
  // Desks: a top on two pedestals with drawers, space for the legs between them.
  [
    /^(desk\d|dskglow|bvs26|medtbl)/i,
    {
      ...WOOD,
      height: 0.38,
      width: 0.9,
      depth: 0.5,
      parts: [
        { l0: 0, l1: 1, d0: 0, d1: 1, base: 0.34, height: 0.38, ...WOOD },
        { l0: 0.02, l1: 0.38, d0: 0.04, d1: 1, base: 0, height: 0.34, ...WOOD, front: 'drawersFront' },
        { l0: 0.62, l1: 0.98, d0: 0.04, d1: 1, base: 0, height: 0.34, ...WOOD, front: 'drawersFront' },
      ],
    },
  ],
  // Tables on legs, a workbench; metal ones — in vaults and at the Brotherhood.
  [/^(ltable|tbl[12]000|table\d|ss10[1-3])/i, { ...WOOD, height: 0.36, width: 0.85, depth: 0.6, parts: table(0.36, WOOD) }],
  [/^(tblmetl|tblrust|tbl[34]000|bvs2[578]|sttable|brotbl)/i, { ...METAL, height: 0.36, width: 0.85, depth: 0.6, parts: table(0.36, METAL) }],
  // Casino tables: craps and roulette.
  [/^(crptbl|roltbl)/i, { ...WOOD, top: 'feltTop', height: 0.36, width: 0.9, depth: 0.7, parts: table(0.36, WOOD, 'feltTop') }],
  // Chairs: wooden in towns, metal in vaults and at the Brotherhood.
  [/^(ss10[4-9]|ss11[0-9]|char0[1-3]|chair\d)/i, { ...WOOD, height: 0.6, width: 0.44, depth: 0.44, parts: chair(WOOD) }],
  [/^(chr[\da]000|chrb000|bvs0[1-8]|bvs3[6-9])/i, { ...METAL, height: 0.6, width: 0.44, depth: 0.44, parts: chair(METAL) }],
  // Sofas: seat, back, armrests.
  [
    /^char0[4-6]/i,
    {
      ...FABRIC,
      height: 0.42,
      width: 0.9,
      depth: 0.5,
      parts: [
        { l0: 0.1, l1: 0.9, d0: 0, d1: 0.78, base: 0.04, height: 0.22, ...FABRIC },
        { l0: 0, l1: 1, d0: 0.75, d1: 1, base: 0.04, height: 0.42, ...FABRIC },
        { l0: 0, l1: 0.1, d0: 0, d1: 0.78, base: 0.04, height: 0.3, ...FABRIC },
        { l0: 0.9, l1: 1, d0: 0, d1: 0.78, base: 0.04, height: 0.3, ...FABRIC },
      ],
    },
  ],
  // High-backed benches (church ones, the Brotherhood's).
  [
    /^(pue01|necpew|bspew|altar3)/i,
    {
      ...WOOD,
      height: 0.46,
      width: 0.92,
      depth: 0.4,
      parts: [
        { l0: 0, l1: 0.06, d0: 0.1, d1: 0.9, base: 0, height: 0.2, ...WOOD },
        { l0: 0.94, l1: 1, d0: 0.1, d1: 0.9, base: 0, height: 0.2, ...WOOD },
        { l0: 0, l1: 1, d0: 0, d1: 1, base: 0.18, height: 0.22, ...WOOD },
        { l0: 0, l1: 1, d0: 0.86, d1: 1, base: 0.22, height: 0.46, ...WOOD },
      ],
    },
  ],
  // Goods on a counter — a stack of boxes (scene.ts → placeContainers puts it on the tabletop).
  [TABLETOP_GOODS, goodsShape(0)],
  // Crates, boxes, ice chests.
  [/^(crate|boxes|ibox|iceche|njunk[56])/i, { front: 'crateSide', side: 'crateSide', top: 'crateTop', height: 0.34, width: 0.6, depth: 0.5 }],
  // Small chests.
  [/^footlkr/i, { front: 'chestFront', side: 'chestSide', top: 'chestTop', height: 0.26, width: 0.66, depth: 0.38 }],
  [/^fridge/i, { front: 'fridgeFront', side: 'fridgeSide', top: 'fridgeSide', height: 0.86, width: 0.6, depth: 0.45 }],
  // Dressers and wardrobes.
  [/^dresr/i, { front: 'dresserFront', side: 'woodSide', top: 'woodTop', height: 0.56, width: 0.8, depth: 0.36 }],
  // Old mattresses right on the floor.
  [/^bed[12]\./i, { front: 'mattressSide', side: 'mattressSide', top: 'bedTop', height: 0.1, width: 0.92, depth: 0.55 }],
  // Beds: a mattress on a frame and legs, long side along the wall.
  [
    /^(bed\d|ss12[0-3]|bedmilt|bedchld|vbed|bvs1[3-6]|stbed0[56])/i,
    {
      front: 'mattressSide',
      side: 'mattressSide',
      top: 'bedTop',
      height: 0.26,
      width: 0.92,
      depth: 0.55,
      parts: [...legs(0.06, 0.1, METAL), { l0: 0, l1: 1, d0: 0, d1: 1, base: 0.08, height: 0.26, front: 'mattressSide', side: 'mattressSide', top: 'bedTop' }],
    },
  ],
  [/^stbed/i, { front: 'bunkFront', side: 'bunkFront', top: 'bedTop', height: 0.8, width: 0.92, depth: 0.5 }],
  // Furniture that didn't exist at all before (client, 2026-10-29: furniture and cars should be solid).
  // Gunsmiths' machines, Vault 12's air purifier, the Glow's equipment: a frame with a console in front.
  [/^(mach0\d|unit000|holo0\d)/i, { front: 'panelFront', side: 'metalSide', top: 'metalTop', height: 0.62, width: 0.85, depth: 0.55 }],
  // The Brotherhood's main computer — mainframe cabinets.
  [/^stmain0\d/i, MAINFRAME],
  // The Military Base vats and the Hub's water works tanks: a large round tank.
  [/^(vats\d|tanktop)/i, { front: 'vaultRust', side: 'vaultRust', top: 'metalTop', height: 0.9, width: 0.85, depth: 0.85, round: true }],
  // The Brotherhood's exercise machines. A treadmill: a belt on the floor, railings and a console at the far end.
  [
    /^extrdml/i,
    {
      ...METAL,
      height: 0.44,
      width: 0.5,
      depth: 0.85,
      parts: [
        { l0: 0, l1: 1, d0: 0, d1: 1, base: 0, height: 0.07, front: 'tire', side: 'metalSide', top: 'tire' },
        { l0: 0, l1: 0.1, d0: 0.78, d1: 0.88, base: 0.07, height: 0.44, ...METAL },
        { l0: 0.9, l1: 1, d0: 0.78, d1: 0.88, base: 0.07, height: 0.44, ...METAL },
        { l0: 0, l1: 1, d0: 0.78, d1: 0.95, base: 0.38, height: 0.44, front: 'panelFront', side: 'metalSide', top: 'metalTop' },
      ],
    },
  ],
  // Bench press: a bench, two uprights and a barbell with plates.
  [
    /^exwtlft/i,
    {
      ...METAL,
      height: 0.42,
      width: 0.85,
      depth: 0.6,
      parts: [
        { l0: 0.35, l1: 0.65, d0: 0.1, d1: 1, base: 0.08, height: 0.16, front: 'mattressSide', side: 'mattressSide', top: 'mattressSide' },
        { l0: 0.42, l1: 0.58, d0: 0.4, d1: 0.7, base: 0, height: 0.08, ...METAL },
        { l0: 0.25, l1: 0.3, d0: 0.2, d1: 0.26, base: 0, height: 0.38, ...METAL },
        { l0: 0.7, l1: 0.75, d0: 0.2, d1: 0.26, base: 0, height: 0.38, ...METAL },
        { l0: 0.05, l1: 0.95, d0: 0.21, d1: 0.25, base: 0.36, height: 0.38, ...METAL },
        { l0: 0.05, l1: 0.13, d0: 0.15, d1: 0.31, base: 0.31, height: 0.43, front: 'tire', side: 'tire', top: 'tire' },
        { l0: 0.87, l1: 0.95, d0: 0.15, d1: 0.31, base: 0.31, height: 0.43, front: 'tire', side: 'tire', top: 'tire' },
      ],
    },
  ],
  // Punching bag: hangs on a chain from the ceiling.
  [
    /^expnch/i,
    {
      ...FABRIC,
      height: 1,
      width: 0.34,
      depth: 0.34,
      parts: [
        { l0: 0, l1: 1, d0: 0, d1: 1, base: 0.2, height: 0.72, front: 'mattressSide', side: 'mattressSide', top: 'mattressSide', round: true },
        { l0: 0.45, l1: 0.55, d0: 0.45, d1: 0.55, base: 0.72, height: 1, ...METAL },
      ],
    },
  ],
  // Wall bars (a "ladder"): uprights and rungs against the wall.
  [
    /^exstr/i,
    {
      ...WOOD,
      height: 0.9,
      width: 0.8,
      depth: 0.1,
      wall: true,
      parts: [
        { l0: 0, l1: 0.07, d0: 0.2, d1: 0.8, base: 0, height: 0.9, ...WOOD },
        { l0: 0.93, l1: 1, d0: 0.2, d1: 0.8, base: 0, height: 0.9, ...WOOD },
        ...Array.from({ length: 8 }, (_, k) => ({ l0: 0.07, l1: 0.93, d0: 0.35, d1: 0.65, base: 0.06 + k * 0.11, height: 0.09 + k * 0.11, ...WOOD })),
      ],
    },
  ],
  // A soda machine (Necropolis).
  [/^cola\./i, { front: 'vendingFront', side: 'fridgeSide', top: 'metalTop', height: 0.86, width: 0.55, depth: 0.45 }],
  // Altars of the Cathedral and the Brotherhood: a stone pedestal with cloth on top.
  [/^(ccaltar|bsaltar)/i, { front: 'concrete', side: 'concrete', top: 'fabric', height: 0.4, width: 0.9, depth: 0.5 }],
  // Podiums: a pedestal and a slanted top (with a step).
  [
    /^(ccpodium|bspodium)/i,
    {
      ...WOOD,
      height: 0.56,
      width: 0.5,
      depth: 0.4,
      parts: [
        { l0: 0.1, l1: 0.9, d0: 0.15, d1: 0.85, base: 0, height: 0.48, ...WOOD },
        { l0: 0, l1: 1, d0: 0, d1: 0.5, base: 0.46, height: 0.52, ...WOOD },
        { l0: 0, l1: 1, d0: 0.5, d1: 1, base: 0.46, height: 0.56, ...WOOD },
      ],
    },
  ],
  // A bar counter (the casino, the Rippers).
  [/^bar0\d/i, { ...WOOD, height: 0.4, width: 0.95, depth: 0.45 }],
  // A forklift: a body, a mast and forks in front.
  [
    /^fork\d/i,
    {
      front: 'carBody',
      side: 'carBody',
      top: 'carBody',
      height: 0.95,
      width: 0.6,
      depth: 0.9,
      parts: [
        { l0: 0, l1: 1, d0: 0.3, d1: 1, base: 0, height: 0.45, front: 'carBody', side: 'carBody', top: 'carBody' },
        { l0: 0.15, l1: 0.85, d0: 0.55, d1: 0.95, base: 0.45, height: 0.7, front: 'carCabin', side: 'carCabin', top: 'carBody' },
        { l0: 0.1, l1: 0.2, d0: 0.22, d1: 0.3, base: 0, height: 0.95, ...METAL },
        { l0: 0.8, l1: 0.9, d0: 0.22, d1: 0.3, base: 0, height: 0.95, ...METAL },
        { l0: 0.15, l1: 0.3, d0: 0, d1: 0.24, base: 0.03, height: 0.06, ...METAL },
        { l0: 0.7, l1: 0.85, d0: 0, d1: 0.24, base: 0.03, height: 0.06, ...METAL },
      ],
    },
  ],
  // The Military Base guard booth: the whole cell, a window in front.
  [
    /^shack\./i,
    {
      front: 'vaultRust',
      side: 'vaultRust',
      top: 'metalTop',
      height: 0.95,
      width: 0.95,
      depth: 0.95,
      parts: [
        { l0: 0, l1: 1, d0: 0, d1: 1, base: 0, height: 0.95, front: 'vaultRust', side: 'vaultRust', top: 'metalTop' },
        { l0: 0.2, l1: 0.8, d0: -0.01, d1: 0.02, base: 0.45, height: 0.75, front: 'glassWindow', side: 'metalSide', top: 'metalTop' },
      ],
    },
  ],
  // Urinals (Necropolis): white enamel on the wall.
  [/^urinal/i, { ...ENAMEL, front: 'sinkFront', base: 0.1, height: 0.4, width: 0.3, depth: 0.2, wall: true }],
  // A vent (Vault 13, the Master's lair): a box with a grille on the wall.
  [/^vosv000/i, { front: 'ventGrille', side: 'metalSide', top: 'metalTop', base: 0.5, height: 0.9, width: 0.6, depth: 0.2, wall: true }],
  // The raiders' campfire: stones in a ring, fire in the middle — gives light.
  [
    /^woodfire/i,
    {
      front: 'rock',
      side: 'rock',
      top: 'fireTop',
      height: 0.1,
      width: 0.6,
      depth: 0.6,
      light: { radius: 3, intensity: 0.6 },
      parts: [
        { l0: 0.2, l1: 0.8, d0: 0.2, d1: 0.8, base: 0, height: 0.05, front: 'fireTop', side: 'fireTop', top: 'fireTop' },
        { l0: 0, l1: 0.22, d0: 0.3, d1: 0.7, base: 0, height: 0.1, front: 'rock', side: 'rock', top: 'rock' },
        { l0: 0.78, l1: 1, d0: 0.3, d1: 0.7, base: 0, height: 0.1, front: 'rock', side: 'rock', top: 'rock' },
        { l0: 0.3, l1: 0.7, d0: 0, d1: 0.22, base: 0, height: 0.1, front: 'rock', side: 'rock', top: 'rock' },
        { l0: 0.3, l1: 0.7, d0: 0.78, d1: 1, base: 0, height: 0.1, front: 'rock', side: 'rock', top: 'rock' },
      ],
    },
  ],
  // Shady Sands pots: clay, with soil.
  [/^bucket\d/i, { front: 'woodSide', side: 'woodSide', top: 'dirt', height: 0.22, width: 0.3, depth: 0.3, round: true }],
  // A traffic light (Necropolis): a post and a box with lamps.
  [
    /^stplit/i,
    {
      ...METAL,
      height: 0.98,
      width: 0.3,
      depth: 0.3,
      parts: [
        { l0: 0.4, l1: 0.6, d0: 0.4, d1: 0.6, base: 0, height: 0.75, ...METAL, round: true },
        { l0: 0.2, l1: 0.8, d0: 0.25, d1: 0.75, base: 0.72, height: 0.98, front: 'lampHead', side: 'metalSide', top: 'metalTop' },
      ],
    },
  ],
  // Wrought-iron gates (Necropolis): a grille a cell wide, you can see through it.
  [/^gate001/i, { front: 'gateBars', side: 'gateBars', top: 'metalTop', height: 0.95, width: 1, depth: 0.08 }],
  // The barrier at the Military Base entrance: a pedestal with a mechanism, the boom raised.
  [
    /^milgate/i,
    {
      ...METAL,
      height: 1,
      width: 0.4,
      depth: 0.4,
      parts: [
        { l0: 0.1, l1: 0.9, d0: 0.1, d1: 0.9, base: 0, height: 0.36, ...METAL },
        { l0: 0, l1: 1, d0: 0.25, d1: 0.75, base: 0.28, height: 0.46, front: 'pipeMachine', side: 'metalSide', top: 'metalTop' },
        { l0: 0.42, l1: 0.58, d0: 0.42, d1: 0.58, base: 0.4, height: 1, front: 'barrierStripe', side: 'barrierStripe', top: 'barrierStripe' },
      ],
    },
  ],
  // Piles of pipes on the ground (Junktown): pipes side by side and one on top; a single pipe — garpipe2.
  [/^garpipe2/i, { front: 'pipeRiser', side: 'pipeRiser', top: 'pipeRiser', height: 0.12, width: 0.95, depth: 0.14 }],
  [
    /^garpipe/i,
    {
      front: 'pipeRiser',
      side: 'pipeRiser',
      top: 'pipeRiser',
      height: 0.24,
      width: 0.95,
      depth: 0.5,
      parts: [
        { l0: 0, l1: 1, d0: 0, d1: 0.3, base: 0, height: 0.12, front: 'pipeRiser', side: 'pipeRiser', top: 'pipeRiser' },
        { l0: 0.04, l1: 0.96, d0: 0.34, d1: 0.64, base: 0, height: 0.12, front: 'pipeRiser', side: 'pipeRiser', top: 'pipeRiser' },
        { l0: 0, l1: 0.92, d0: 0.68, d1: 0.98, base: 0, height: 0.12, front: 'pipeRiser', side: 'pipeRiser', top: 'pipeRiser' },
        { l0: 0.08, l1: 0.9, d0: 0.17, d1: 0.47, base: 0.12, height: 0.24, front: 'pipeRiser', side: 'pipeRiser', top: 'pipeRiser' },
      ],
    },
  ],
  // A pipe with a valve at the Military Base entrance.
  [
    /^mbpipe1/i,
    {
      front: 'pipeRiser',
      side: 'pipeRiser',
      top: 'metalTop',
      height: 0.9,
      width: 0.4,
      depth: 0.4,
      parts: [
        { l0: 0.3, l1: 0.7, d0: 0.3, d1: 0.7, base: 0, height: 0.9, front: 'pipeRiser', side: 'pipeRiser', top: 'metalTop', round: true },
        { l0: 0.1, l1: 0.9, d0: 0.44, d1: 0.56, base: 0.5, height: 0.62, front: 'valveFront', side: 'pipeRiser', top: 'metalTop' },
      ],
    },
  ],
  // A column of pipes (Vault 13).
  [/^vosb000/i, { front: 'pipeRiser', side: 'pipeRiser', top: 'metalTop', height: 0.75, width: 0.5, depth: 0.5, round: true }],
  // A stairway down (stway): steps go into darkness, railings on the sides; back to the wall.
  [
    /^stway/i,
    {
      ...METAL,
      height: 0.32,
      width: 0.9,
      depth: 0.9,
      exit: true,
      parts: [
        { l0: 0, l1: 1, d0: 0, d1: 1, base: 0, height: 0.01, front: 'stairsDown', side: 'stairsDown', top: 'stairsDown' },
        { l0: 0, l1: 0.05, d0: 0, d1: 1, base: 0.28, height: 0.32, ...METAL },
        { l0: 0.95, l1: 1, d0: 0, d1: 1, base: 0.28, height: 0.32, ...METAL },
        ...[0, 0.47, 0.94].flatMap((d) => [
          { l0: 0, l1: 0.05, d0: d, d1: d + 0.06, base: 0, height: 0.28, ...METAL },
          { l0: 0.95, l1: 1, d0: d, d1: d + 0.06, base: 0, height: 0.28, ...METAL },
        ]),
      ],
    },
  ],
  // A rope ladder up (ladder): two uprights and rungs against the wall, up to the ceiling.
  [
    /^ladder\./i,
    {
      ...METAL,
      height: 1,
      width: 0.5,
      depth: 0.12,
      wall: true,
      exit: true,
      parts: [
        { l0: 0.08, l1: 0.18, d0: 0.2, d1: 0.8, base: 0, height: 1, ...METAL },
        { l0: 0.82, l1: 0.92, d0: 0.2, d1: 0.8, base: 0, height: 1, ...METAL },
        ...Array.from({ length: 8 }, (_, k) => ({ l0: 0.18, l1: 0.82, d0: 0.35, d1: 0.65, base: 0.08 + k * 0.12, height: 0.11 + k * 0.12, front: 'poleMetal' as const, side: 'poleMetal' as const, top: 'poleMetal' as const })),
      ],
    },
  ],
  // Plot items (client, 2026-10-29: they were flat images).
  // The Necropolis water pump: a frame, a tank, a console, a pipe into the wall.
  [
    /^pumpnec/i,
    {
      ...METAL,
      height: 0.62,
      width: 0.7,
      depth: 0.55,
      parts: [
        { l0: 0, l1: 1, d0: 0.1, d1: 1, base: 0, height: 0.12, ...METAL },
        { l0: 0.08, l1: 0.5, d0: 0.3, d1: 0.85, base: 0.12, height: 0.55, front: 'barrelSide', side: 'barrelSide', top: 'barrelTop', round: true },
        { l0: 0.55, l1: 0.95, d0: 0.3, d1: 0.9, base: 0.12, height: 0.4, front: 'panelFront', side: 'metalSide', top: 'metalTop' },
        { l0: 0.24, l1: 0.34, d0: 0.85, d1: 1, base: 0.42, height: 0.62, ...METAL },
      ],
    },
  ],
  // Brotherhood power armor parts: on a workbench — a breastplate and a helmet.
  [
    /^pwrarmor/i,
    {
      ...METAL,
      height: 0.58,
      width: 0.85,
      depth: 0.5,
      parts: [
        ...table(0.36, METAL),
        { l0: 0.28, l1: 0.68, d0: 0.25, d1: 0.75, base: 0.36, height: 0.56, front: 'lockerFront', side: 'metalSide', top: 'metalTop' },
        { l0: 0.74, l1: 0.92, d0: 0.35, d1: 0.65, base: 0.36, height: 0.46, ...METAL, round: true },
      ],
    },
  ],
  // A generator (the Glow): a box with a console in front and a grille on top.
  [/^power1/i, { front: 'panelFront', side: 'metalSide', top: 'ventGrille', height: 0.78, width: 0.9, depth: 0.6 }],
  // The bomb in the Master's lair: a concrete slab, a casing, a top.
  [
    /^abomb1/i,
    {
      ...METAL,
      height: 0.7,
      width: 0.5,
      depth: 0.5,
      parts: [
        { l0: 0, l1: 1, d0: 0, d1: 1, base: 0, height: 0.1, front: 'concrete', side: 'concrete', top: 'concrete' },
        { l0: 0.15, l1: 0.85, d0: 0.15, d1: 0.85, base: 0.1, height: 0.62, front: 'barrelSide', side: 'barrelSide', top: 'metalTop', round: true },
        { l0: 0.3, l1: 0.7, d0: 0.3, d1: 0.7, base: 0.62, height: 0.7, ...METAL, round: true },
      ],
    },
  ],
  // The rubble at the Glow's entrance (glowslid) and the cave wall to be blown up (rock04/05 with a script — scenery without a script keeps them
  // as an image, DECOR): a pile of rocks.
  [
    /^(glowslid|rock0[45])/i,
    {
      front: 'rock',
      side: 'rock',
      top: 'rubble',
      height: 0.8,
      width: 0.95,
      depth: 0.9,
      parts: [
        { l0: 0, l1: 1, d0: 0.35, d1: 1, base: 0, height: 0.8, front: 'rock', side: 'rock', top: 'rubble' },
        { l0: 0.05, l1: 0.6, d0: 0, d1: 0.4, base: 0, height: 0.42, front: 'rock', side: 'rock', top: 'rubble' },
        { l0: 0.55, l1: 0.95, d0: 0.08, d1: 0.4, base: 0, height: 0.26, front: 'rock', side: 'rock', top: 'rubble' },
      ],
    },
  ],
  // The Hub's notice board and the Iguana Bob's stand board (the bib container): on two posts.
  [
    /^(posts|bib\.)/i,
    {
      ...WOOD,
      height: 0.72,
      width: 0.8,
      depth: 0.2,
      parts: [
        { l0: 0.04, l1: 0.12, d0: 0.35, d1: 0.65, base: 0, height: 0.72, ...WOOD },
        { l0: 0.88, l1: 0.96, d0: 0.35, d1: 0.65, base: 0, height: 0.72, ...WOOD },
        { l0: 0, l1: 1, d0: 0.4, d1: 0.6, base: 0.32, height: 0.7, front: 'noticeBoard', side: 'woodSide', top: 'woodTop' },
      ],
    },
  ],
  // A bar counter with a trophy (the Junktown casino).
  [
    /^trophyb/i,
    {
      ...WOOD,
      height: 0.5,
      width: 0.95,
      depth: 0.45,
      parts: [
        { l0: 0, l1: 1, d0: 0, d1: 1, base: 0, height: 0.4, ...WOOD },
        { l0: 0.42, l1: 0.58, d0: 0.35, d1: 0.65, base: 0.4, height: 0.5, front: 'lampHead', side: 'lampHead', top: 'lampHead', round: true },
      ],
    },
  ],
  // The Glow's elevator door (velev07): doors on the wall.
  [/^velev07/i, { front: 'shaftBroken', side: 'metalSide', top: 'metalTop', height: 1, width: 0.96, depth: 0.06, wall: true }],
  [/^slmach/i, { front: 'slotFront', side: 'slotSide', top: 'metalTop', height: 0.8, width: 0.5, depth: 0.42 }],
  [/^(bath0[37]|sink\d)/i, { front: 'sinkFront', side: 'sinkFront', top: 'sinkTop', height: 0.42, width: 0.55, depth: 0.36 }],
  // Urinals — porcelain on the wall.
  [/^bath0[58]/i, { ...ENAMEL, base: 0.16, height: 0.52, width: 0.3, depth: 0.16, wall: true }],
  // Shower stalls.
  [/^(bath09|bath1[0-2]|bshowr)/i, { ...ENAMEL, height: 0.95, width: 0.62, depth: 0.55 }],
  // Newspaper machines — a red box; mailboxes — a box on a post.
  [/^newsp/i, { front: 'hydrant', side: 'hydrant', top: 'hydrant', height: 0.5, width: 0.4, depth: 0.34 }],
  [
    /^mailbx/i,
    {
      ...METAL,
      height: 0.55,
      width: 0.34,
      depth: 0.3,
      parts: [
        { l0: 0.4, l1: 0.6, d0: 0.4, d1: 0.6, base: 0, height: 0.36, ...METAL, round: true },
        { l0: 0, l1: 1, d0: 0, d1: 1, base: 0.36, height: 0.55, ...METAL },
      ],
    },
  ],
  // Clay pots, vases, bowls.
  [/^(pot\d|vase\d)/i, { front: 'adobe', side: 'adobe', top: 'adobe', height: 0.26, width: 0.26, depth: 0.26, round: true }],
  [/^bowl\d/i, { front: 'adobe', side: 'adobe', top: 'adobe', height: 0.08, width: 0.24, depth: 0.24, round: true }],
  // Toilets: a bowl and a tank against the wall; clean in vaults and at the Brotherhood, dirty in towns.
  [/^bath0[46]/i, toilet(ENAMEL)],
  [/^toilet/i, toilet(DIRTY)],
  // Wall-mounted: lamps (give light), vent grilles, pipes, wires, windows.
  [/^wlamp/i, { front: 'lampHead', side: 'lampHead', top: 'poleMetal', base: 0.6, height: 0.78, width: 0.26, depth: 0.12, wall: true, light: { radius: 2.5, intensity: 0.45 } }],
  [/^(bvs2[1-4]|bvs4[12]|vent\d)/i, { front: 'ventGrille', side: 'metalSide', top: 'metalTop', base: 0.5, height: 0.9, width: 0.6, depth: 0.12, wall: true }],
  // A large fan on the wall of the ruined vault (Vault 15).
  [/^bvs40/i, { front: 'ventGrille', side: 'metalSide', top: 'metalTop', base: 0.22, height: 0.92, width: 0.9, depth: 0.16, wall: true }],
  // Supports of the ruined vault (Vault 15): square columns in rusty copper cladding; broken ones — waist-high.
  [/^bvs(09|10)/i, { front: 'vaultRust', side: 'vaultRust', top: 'metalTop', height: 1, width: 0.34, depth: 0.34 }],
  [/^bvs1[12]/i, { front: 'vaultRust', side: 'vaultRust', top: 'rubble', height: 0.5, width: 0.34, depth: 0.34 }],
  // The shaft of the broken elevator (Vault 15): our drawing on the whole wall — doors pried apart and darkness; with a rope — you climb down it.
  [/^velev04/i, { front: 'shaftBroken', side: 'metalSide', top: 'metalTop', height: 1, width: 0.96, depth: 0.06, wall: true }],
  [/^velev(09|10)/i, { front: 'shaftRope', side: 'metalSide', top: 'metalTop', height: 1, width: 0.96, depth: 0.06, wall: true }],
  [/^(pipes|vosp)/i, PIPE_RUN],
  // Caged lamps on the Military Base walls: give light.
  [/^mblight/i, { front: 'cageLamp', side: 'metalSide', top: 'metalTop', base: 0.58, height: 0.76, width: 0.2, depth: 0.1, wall: true, light: { radius: 2.5, intensity: 0.5 } }],
  // Necropolis sewers: patches of old brickwork on the rock walls.
  [/^sewer0/i, { front: 'brickPatch', side: 'oldBrick', top: 'oldBrick', height: 0.92, width: 0.94, depth: 0.05, wall: true }],
  [/^wire/i, { front: 'wireRun', side: 'wireRun', top: 'wireRun', base: 0.25, height: 0.95, width: 0.3, depth: 0.03, wall: true }],
  [/^(vwin|wareh)/i, { front: 'glassWindow', side: 'metalSide', top: 'metalTop', base: 0.35, height: 0.85, width: 0.85, depth: 0.05, wall: true }],
  // The torn-off Vault 15 blast door lies on the cave floor at the entrance: a thick rusty disc with teeth around the edge.
  [/^firedoor\./i, { front: 'gearRim', side: 'gearRim', top: 'gearFace', height: 0.14, width: 0.96, depth: 0.96, round: true }],
  // The beam at the Glow's crater: the crater draws the beam over the drop itself (src/engine/crater.ts), the scenery is only for E and
  // the rope; a tied rope — a coil at the end of the beam (and the crater draws it down the slope).
  [/^beam\.frm$/i, { front: 'girderSteel', side: 'girderSteel', top: 'girderSteel', height: 0.13, width: 0.2, depth: 0.2, hidden: true }],
  [/^beamrope\.frm$/i, { front: 'girderRope', side: 'girderRope', top: 'girderRope', height: 0.2, width: 0.34, depth: 0.34, round: true }],
  // Road signs and signposts: a post and a plate; stakes — thin round posts.
  [/^stop\d/i, sign('signStop')],
  [/^yield\d/i, sign('signYield')],
  [/^(arrow|strsign)/i, sign('signArrow')],
  [/^(yrope|ypole)/i, { ...WOOD, height: 0.7, width: 0.12, depth: 0.12, round: true }],
  // Cars, trucks, carts — larger than a cell.
  [/^car\d/i, vehicle(0.95, 1.9, 'carBody', [{ l0: 0.06, l1: 0.94, d0: 0.3, d1: 0.78, base: 0.36, height: 0.6, front: 'carCabin', side: 'carCabin', top: 'carBody' }])],
  [/^truck\d/i, vehicle(1.05, 2.4, 'carBody', [{ l0: 0.04, l1: 0.96, d0: 0, d1: 0.3, base: 0.36, height: 0.74, front: 'carCabin', side: 'carCabin', top: 'carBody' }, { l0: 0, l1: 1, d0: 0.32, d1: 1, base: 0.36, height: 0.62, front: 'crateSide', side: 'crateSide', top: 'crateTop' }])],
  // Caravan carts: a trailer made from the rear half of an old car — a body with tail fins on two wheels,
  // a shaft in front (for the brahmin), crates and a bale under a tarp in the body.
  [
    /^ccart/i,
    {
      front: 'trailerPaint',
      side: 'trailerPaint',
      top: 'trailerPaint',
      height: 0.68,
      width: 0.9,
      depth: 1.7,
      span: true,
      parts: [
        { l0: 0.46, l1: 0.54, d0: 0, d1: 0.3, base: 0.2, height: 0.26, ...METAL },
        { l0: 0.04, l1: 0.96, d0: 0.26, d1: 1, base: 0.16, height: 0.42, front: 'trailerPaint', side: 'trailerPaint', top: 'crateTop' },
        { l0: 0.04, l1: 0.14, d0: 0.7, d1: 1, base: 0.42, height: 0.5, front: 'trailerPaint', side: 'trailerPaint', top: 'trailerPaint' },
        { l0: 0.86, l1: 0.96, d0: 0.7, d1: 1, base: 0.42, height: 0.5, front: 'trailerPaint', side: 'trailerPaint', top: 'trailerPaint' },
        { l0: 0, l1: 0.06, d0: 0.46, d1: 0.7, base: 0, height: 0.26, front: 'tire', side: 'tire', top: 'tire' },
        { l0: 0.94, l1: 1, d0: 0.46, d1: 0.7, base: 0, height: 0.26, front: 'tire', side: 'tire', top: 'tire' },
        { l0: 0.16, l1: 0.5, d0: 0.32, d1: 0.6, base: 0.42, height: 0.64, front: 'crateSide', side: 'crateSide', top: 'crateTop' },
        { l0: 0.52, l1: 0.84, d0: 0.4, d1: 0.7, base: 0.42, height: 0.58, front: 'crateSide', side: 'crateSide', top: 'crateTop' },
        { l0: 0.18, l1: 0.82, d0: 0.66, d1: 0.94, base: 0.42, height: 0.68, front: 'curtain', side: 'curtain', top: 'curtain' },
      ],
    },
  ],
  // A wheelbarrow, bathtubs, large tanks, a stove, wooden props, mirrors on the wall, the Brotherhood's shower.
  [/^cart\d/i, { front: 'crateSide', side: 'crateSide', top: 'crateTop', height: 0.34, width: 0.45, depth: 0.7 }],
  [/^pillar/i, OBELISK],
  [/^tub\d/i, { ...ENAMEL, height: 0.34, width: 0.9, depth: 0.48 }],
  // Glow storage tanks (gtank01 — intact, gtank02 — broken; client, 2026-10-29: "big tanks for bodies"): on
  // a round rusty base with railings — a glass vessel with liquid and a body, a cap on top and an arc of pipe to the machine at the side.
  [/^gtank01/i, stasisPod(false)],
  [/^gtank02/i, stasisPod(true)],
  [/^watrtank/i, { ...METAL, height: 0.9, width: 0.8, depth: 0.8, round: true }],
  // A cooking stove (Shady Sands): round, cast iron, the fire behind the door gives light; a pot on the hob.
  [
    /^sstove/i,
    {
      front: 'stoveBody',
      side: 'stoveBody',
      top: 'stoveTop',
      height: 0.56,
      width: 0.6,
      depth: 0.6,
      round: true,
      light: { radius: 2.5, intensity: 0.55 },
      parts: [
        { l0: 0, l1: 1, d0: 0, d1: 1, base: 0, height: 0.44, front: 'stoveBody', side: 'stoveBody', top: 'stoveTop', round: true },
        { l0: 0.18, l1: 0.5, d0: 0.34, d1: 0.66, base: 0.44, height: 0.56, ...METAL, round: true },
      ],
    },
  ],
  [/^brace/i, { ...WOOD, height: 1, width: 0.18, depth: 0.18, round: true }],
  [/^bath0[12]/i, { front: 'glassWindow', side: 'metalSide', top: 'metalTop', base: 0.45, height: 0.78, width: 0.4, depth: 0.03, wall: true }],
  // A burning barrel: fire on top and light around.
  [/^barrel\./i, { front: 'barrelSide', side: 'barrelSide', top: 'fireTop', height: 0.5, width: 0.5, depth: 0.5, round: true, light: { radius: 3.5, intensity: 0.9 } }],
  // Barrels.
  [/^(barrel\d|brl[12]000)/i, { front: 'barrelSide', side: 'barrelSide', top: 'barrelTop', height: 0.5, width: 0.5, depth: 0.5, round: true }],
  // Columns: stone in caves, concrete in vaults.
  [/^cvcolum/i, { front: 'caveWall', side: 'caveWall', top: 'caveWall', height: 1, width: 0.6, depth: 0.6, round: true }],
  [/^(colsmal|bvs09|bvs12)/i, { front: 'concrete', side: 'concrete', top: 'concrete', height: 1, width: 0.5, depth: 0.5, round: true }],
  [/^firehy/i, { front: 'hydrant', side: 'hydrant', top: 'hydrant', height: 0.3, width: 0.22, depth: 0.22, round: true }],
  // A well (Shady Sands): a round stone shaft with a windlass on top: two uprights, a crossbar and a bucket. You can walk around it.
  [
    /^well\d/i,
    {
      front: 'wellStone',
      side: 'wellStone',
      top: 'wellTop',
      height: 0.9,
      width: 0.9,
      depth: 0.9,
      round: true,
      parts: [
        { l0: 0, l1: 1, d0: 0, d1: 1, base: 0, height: 0.4, front: 'wellStone', side: 'wellStone', top: 'wellTop', round: true },
        { l0: 0.06, l1: 0.14, d0: 0.46, d1: 0.54, base: 0.36, height: 0.9, ...WOOD },
        { l0: 0.86, l1: 0.94, d0: 0.46, d1: 0.54, base: 0.36, height: 0.9, ...WOOD },
        { l0: 0.06, l1: 0.94, d0: 0.47, d1: 0.53, base: 0.78, height: 0.86, ...WOOD },
        { l0: 0.44, l1: 0.56, d0: 0.44, d1: 0.56, base: 0.5, height: 0.66, ...WOOD, round: true },
      ],
    },
  ],
  // Lamp posts: a thin post and a head with glowing glass.
  [
    /^(strlit|flamp|junklit)/i,
    {
      front: 'poleMetal',
      side: 'poleMetal',
      top: 'poleMetal',
      height: 1.02,
      width: 0.3,
      depth: 0.3,
      parts: [
        { l0: 0.35, l1: 0.65, d0: 0.35, d1: 0.65, base: 0, height: 0.9, front: 'poleMetal', side: 'poleMetal', top: 'poleMetal', round: true },
        { l0: 0.05, l1: 0.95, d0: 0.05, d1: 0.95, base: 0.9, height: 1.02, front: 'lampHead', side: 'lampHead', top: 'poleMetal' },
      ],
    },
  ],
];

/**
 * Irregular scenery that can't be made a block (grass, bushes, trees, rocks, junk, bones, the "goo" in the Master's lair):
 * stands as an image from the player's copy turned towards the player (like plants in Doom). solid — radius of the invisible stopper under it
 * (a tree, a rock), 0 — it can be walked through.
 */
export interface DecorKind {
  solid: number;
  /** Lies on the floor (a body, a skeleton, a wire) instead of standing. */
  flat?: boolean;
}
const DECOR: [RegExp, DecorKind][] = [
  // Patches of "earth" (weed11–13, weed19–23) are flat, as a standing image they look wrong: we don't place them.
  [/^weed(1[1-3]|19|2[0-3])\./i, { solid: -1 }],
  [/^(weed|bush|grass|cab\d|corn\d|mushrm|bone\d|junk\d|njunk[1-47]|trash|tirs|eggs|alien|mstr\d)/i, { solid: 0 }],
  [/^(tree|cac\d)/i, { solid: 0.22 }],
  [/^(rock\d|roks|cstalag|boulder)/i, { solid: 0.28 }],
  // Signs on a post and a stand: the "Water Merchants" in the Hub; a car made of junk under Gizmo's casino sign (the sign itself
  // has a script, it's placed separately).
  [/^sign12\./i, { solid: 0.08 }],
  [/^gizbase/i, { solid: 0.3 }],
  // A flagpole with a banner at the gap in the Brotherhood of Steel fence; Children of the Cathedral banners on a stand, a weathervane, a shovel.
  [/^(staff\.|chdflag3|awpc|shovel)/i, { solid: 0.08 }],
  // The Boneyard's dead tree and tumbleweed, rocks.
  [/^tre\d{4}/i, { solid: 0.22 }],
  [/^tum\d/i, { solid: 0 }],
  [/^drock/i, { solid: 0.28 }],
  // Bodies at the gunsmiths', a skeleton in Vault 13, wires at the bomb — lie on the floor.
  [/^(dead0\d|v13bones|awire)/i, { solid: 0, flat: true }],
];
export function decorOf(art: string): DecorKind | null {
  const kind = DECOR.find(([pattern]) => pattern.test(art))?.[1] ?? null;
  return kind && kind.solid >= 0 ? kind : null;
}

/** Floor markings by image name: stripes, mats, drain grates; null — not a marking. */
export type FloorMarkKind = 'stripe' | 'mat' | 'rug' | 'drain' | 'manhole' | 'trapdoor' | 'pit' | 'planks';
export function floorMarkOf(art: string): FloorMarkKind | null {
  if (/^strp/i.test(art)) return 'stripe';
  if (/^exmat/i.test(art)) return 'mat';
  // Rugs on house floors (Shady Sands).
  if (/^rug\d/i.test(art)) return 'rug';
  if (/^sewer(0[789]|10)/i.test(art)) return 'drain';
  // Hatches and holes you climb down through (client, 2026-10-21: the original's images stood upright and looked bad).
  if (/^sewer11/i.test(art)) return 'manhole';
  if (/^traphol/i.test(art)) return 'trapdoor';
  if (/^hole\d/i.test(art)) return 'pit';
  // The Boneyard's plank walkways — as decking on the floor; the grate in the Vault 13 floor — like a drain.
  if (/^gbridge/i.test(art)) return 'planks';
  if (/^vosfloor/i.test(art)) return 'drain';
  return null;
}

/**
 * A sign on a wall (Killian's store, the "Crash House", a bar, the Hub's shops, the Slaughterhouse posters): its image from the player's copy
 * hangs on our wall as a straight plate (src/game/signs.ts). Signs on a post — as an image, like trees (DECOR).
 */
export function wallSignOf(art: string): boolean {
  // Brotherhood and Followers emblems, graffiti, posters, Brotherhood floor numbers and arrows, Children of the Cathedral banners on a
  // bracket — also on the wall as an image from the player's copy (client, 2026-10-29: "they should look like the original").
  return /^(sign\d+|barsign|bladsign|dwsign|flcsign\d*|mfsign|ripsign\d*|skum|jail|logo0\d|flwrlogo|graf\d+|num0\d|arow0\d|chdflag[12])\./i.test(art) && decorOf(art) === null;
}

/**
 * How many times smaller a picture on a wall is than a shop sign: signs are deliberately large so they can be read, while emblems, floor numbers,
 * arrows, graffiti, posters and banners — at real size (client, 2026-10-29: the Brotherhood's "1" took up half a wall).
 */
export function wallSignScale(art: string): number {
  return /^(logo0\d|flwrlogo|graf\d|num0\d|arow0\d|chdflag|ripsign\d)/i.test(art) ? 0.5 : 1;
}

/** Whether a cell has a neighbouring wall to hang a wall object on (a force field doesn't count). */
export function hasWallBeside(level: Level, x: number, y: number): boolean {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  return SIDES.some(([dx, dy]) => {
    const wall = wallAt(level, cx + dx + 0.5, cy + dy + 0.5);
    return !!wall && wall !== 'forcefield';
  });
}

/**
 * Which object the scenery with this image is; null — stays an image (ladders, lamps, fields). ruined —
 * a ruined location (the Glow): the computers there are broken.
 */
export function blockShapeOf(art: string, ruined = false): BlockShape | null {
  const shape = SHAPES.find(([pattern]) => pattern.test(art))?.[1] ?? null;
  return (ruined && shape && BROKEN.get(shape)) || shape;
}

/** Cell sides: the offset to the neighbour and the side number (0 — west, 1 — east, 2 — north, 3 — south). */
const SIDES = [
  [-1, 0, 0],
  [1, 0, 1],
  [0, -1, 2],
  [0, 1, 3],
] as const;
const OPPOSITE = [1, 0, 3, 2] as const;

/** A part of a composite object — into level coordinates by the object's boundary and its face. */
function partAt(whole: Block, p: PartShape): Block {
  const { x0, x1, y0, y1, facing } = whole;
  const w = x1 - x0;
  const h = y1 - y0;
  let box: { x0: number; x1: number; y0: number; y1: number };
  switch (facing) {
    case 3: // face to the south: left to right — along x, in depth — to the north
      box = { x0: x0 + p.l0 * w, x1: x0 + p.l1 * w, y0: y1 - p.d1 * h, y1: y1 - p.d0 * h };
      break;
    case 2: // face to the north: left to right — against x, in depth — to the south
      box = { x0: x1 - p.l1 * w, x1: x1 - p.l0 * w, y0: y0 + p.d0 * h, y1: y0 + p.d1 * h };
      break;
    case 1: // face to the east: left to right — against y, in depth — to the west
      box = { x0: x1 - p.d1 * w, x1: x1 - p.d0 * w, y0: y1 - p.l1 * h, y1: y1 - p.l0 * h };
      break;
    default: // face to the west: left to right — along y, in depth — to the east
      box = { x0: x0 + p.d0 * w, x1: x0 + p.d1 * w, y0: y0 + p.l0 * h, y1: y0 + p.l1 * h };
  }
  const part: Block = { ...box, height: p.height, front: p.front, side: p.side, top: p.top, facing, fill: false };
  if (p.toViewer) part.toViewer = true;
  if (p.base > 0) part.base = p.base;
  if (p.round) part.round = true;
  return part;
}

/**
 * A large object (a car) centred at point at (the original's location): along — the long side along x or y.
 * Parts — by the same layout as a regular object (the face is the front end).
 */
export function spanAt(at: { x: number; y: number }, along: 'x' | 'y', shape: BlockShape, flip = false): Block {
  const half = { w: shape.width / 2, l: shape.depth / 2 };
  const box = along === 'x' ? { x0: at.x - half.l, x1: at.x + half.l, y0: at.y - half.w, y1: at.y + half.w } : { x0: at.x - half.w, x1: at.x + half.w, y0: at.y - half.l, y1: at.y + half.l };
  // The face is to the east or south (flip — to the west or north).
  const facing = along === 'x' ? (flip ? 0 : 1) : flip ? 2 : 3;
  const whole: Block = { ...box, front: shape.front, side: shape.side, top: shape.top, height: shape.height, facing, fill: true };
  if (shape.parts) whole.parts = shape.parts.map((p) => partAt(whole, p));
  return whole;
}

/**
 * An object in the cell of point at. Back — to a neighbouring wall, preferably the one towards the object's location in the original (from):
 * in the original furniture stands flush against a wall, while we move it to the free cell in front of it. Along the wall — at the same place
 * as in the original (within the cell): two objects at the same wall stand side by side. No wall nearby — a square at the location
 * from the original (critters walk around the cell), facing away from from.
 */
export function blockAt(level: Level, at: { x: number; y: number }, from: { x: number; y: number }, shape: BlockShape): Block {
  const cx = Math.floor(at.x);
  const cy = Math.floor(at.y);
  const toX = from.x - (cx + 0.5);
  const toY = from.y - (cy + 0.5);
  let back = -1;
  let best = -Infinity;
  for (const [dx, dy, side] of SIDES) {
    // A force field isn't a wall: it gets switched off, and whatever hangs on it would be left in the air.
    const wall = wallAt(level, cx + dx + 0.5, cy + dy + 0.5);
    if (!wall || wall === 'forcefield') continue;
    const score = dx * toX + dy * toY;
    if (score > best) {
      best = score;
      back = side;
    }
  }
  if (back < 0 && shape.wall) {
    if (shape.fallback) return blockAt(level, at, from, shape.fallback);
    shape = { ...shape, base: 0, wall: false };
  }
  const look = { front: shape.front, side: shape.side, top: shape.top, height: shape.height };
  let whole: Block;
  // The place in the cell per the original (0..1), but so that the object doesn't stick out of the cell.
  const inside = (v: number, half: number) => Math.min(1 - half, Math.max(half, v));
  if (back < 0) {
    const half = Math.max(shape.width, shape.depth) / 2;
    const facing = Math.abs(toX) > Math.abs(toY) ? (toX > 0 ? 0 : 1) : toY > 0 ? 2 : 3;
    const mx = cx + inside(from.x - cx, half);
    const my = cy + inside(from.y - cy, half);
    whole = { ...look, x0: mx - half, x1: mx + half, y0: my - half, y1: my + half, facing, fill: true };
  } else {
    // Along the wall: a wall to the west or east — along y, to the north or south — along x.
    const along = back < 2 ? from.y - cy : from.x - cx;
    const mid = inside(along, shape.width / 2);
    const w0 = mid - shape.width / 2;
    const w1 = mid + shape.width / 2;
    const facing = OPPOSITE[back as 0 | 1 | 2 | 3];
    const fill = shape.depth > 0.3;
    switch (back) {
      case 0:
        whole = { ...look, x0: cx, x1: cx + shape.depth, y0: cy + w0, y1: cy + w1, facing, fill };
        break;
      case 1:
        whole = { ...look, x0: cx + 1 - shape.depth, x1: cx + 1, y0: cy + w0, y1: cy + w1, facing, fill };
        break;
      case 2:
        whole = { ...look, x0: cx + w0, x1: cx + w1, y0: cy, y1: cy + shape.depth, facing, fill };
        break;
      default:
        whole = { ...look, x0: cx + w0, x1: cx + w1, y0: cy + 1 - shape.depth, y1: cy + 1, facing, fill };
    }
  }
  if (shape.round) whole.round = true;
  if (shape.hidden) whole.hidden = true;
  if (shape.base) whole.base = shape.base;
  if (shape.parts) whole.parts = shape.parts.map((p) => partAt(whole, p));
  return whole;
}

/**
 * Blocks must not block passages. A block occupying the middle of a cell holds it like a wall; if because of such
 * blocks part of the map became unreachable (it was reachable without them), the block on the border of the cut-off part is removed — first
 * from preferred (idle furniture), and if it isn't to blame — any (a crate or a machine becomes an image again) — until
 * everything is reachable again. Returns the cells of the removed blocks.
 */
export function unblockPassages(level: Level, preferred: ReadonlySet<number>): number[] {
  const { width, height } = level;
  const blocks = level.blocks;
  if (!blocks || blocks.size === 0) return [];
  const n = width * height;
  const open = (i: number) => level.walls[i] === null;
  const filled = (i: number) => blocksIn(level, i).some((b) => b.fill);
  const passable = (i: number) => open(i) && !filled(i);
  const neighbours = (i: number): number[] => {
    const x = i % width;
    const out: number[] = [];
    if (x > 0) out.push(i - 1);
    if (x < width - 1) out.push(i + 1);
    if (i >= width) out.push(i - width);
    if (i < n - width) out.push(i + width);
    return out;
  };
  const flood = (seed: number, ok: (i: number) => boolean, mark: Int32Array, label: number) => {
    const stack = [seed];
    mark[seed] = label;
    while (stack.length > 0) {
      const i = stack.pop()!;
      for (const j of neighbours(i)) {
        if (mark[j] !== 0 || !ok(j)) continue;
        mark[j] = label;
        stack.push(j);
      }
    }
  };
  // Parts of the map without blocks.
  const part = new Int32Array(n);
  let parts = 0;
  for (let i = 0; i < n; i++) if (open(i) && part[i] === 0) flood(i, open, part, ++parts);
  const removed: number[] = [];
  for (let round = 0; round < 200; round++) {
    // From each part — a flood fill with blocks from the first free cell; not reached — the cell is cut off.
    const reach = new Int32Array(n);
    const seeded = new Uint8Array(parts + 1);
    for (let i = 0; i < n; i++) {
      const p = part[i]!;
      if (p === 0 || seeded[p] || !passable(i)) continue;
      seeded[p] = 1;
      flood(i, passable, reach, p);
    }
    let culprit = -1;
    let fallback = -1;
    for (let i = 0; i < n && culprit < 0; i++) {
      if (!passable(i) || reach[i] !== 0) continue;
      for (const j of neighbours(i)) {
        if (!filled(j)) continue;
        if (preferred.has(j)) culprit = j;
        else if (fallback < 0) fallback = j;
      }
    }
    if (culprit < 0) culprit = fallback;
    if (culprit < 0) break;
    // Those that hold the cell's middle leave it; thin ones at a wall stay.
    for (const b of blocksIn(level, culprit)) if (b.fill) removeBlock(level, culprit, b);
    removed.push(culprit);
  }
  return removed;
}

/** How much room the hero needs to pass: as much as himself (player.ts — radius 0.22). */
const PASS_RADIUS = 0.22;
/** The step for checking free space inside a cell. */
const PASS_STEP = 0.125;
/** A passage — no wider than this many cells between walls. */
const NARROW = 2;

/** A point inside a block (as in solidAt: those hanging at floor height don't count, round ones — by the circle). */
function blockHits(b: Block, x: number, y: number): boolean {
  if ((b.base ?? 0) >= 1) return false;
  if (x <= b.x0 || x >= b.x1 || y <= b.y0 || y >= b.y1) return false;
  if (!b.round) return true;
  const rx = (b.x1 - b.x0) / 2;
  return (x - b.x0 - rx) ** 2 + (y - (b.y0 + b.y1) / 2) ** 2 < rx * rx;
}

/**
 * A passage must stay a passage even where there's a long way around (unblockPassages lets such things through): cabinets at
 * both walls of a one-cell corridor, two objects "herringbone" in neighbouring cells, a cabinet across a corridor or in front of a door.
 * A passage is a cell between walls no wider than NARROW cells (along one of the axes; doors aren't walls) and the cells next to
 * it: a row of shelves in the middle of a big room doesn't count as a passage — people walk around it. The check is "local": in a window around the cell
 * with the block (3×3 cells, confirmation — 5×5) places where the hero fits and that lead to the window's edge are connected without
 * this cell's blocks, but not with them. Then the cell's blocks are removed (first — from preferred). Only cells
 * where movable (furniture, crates, scenery; not columns and not fences) can be cleared. Returns the cells of the removed blocks.
 */
export function clearNarrowPassages(level: Level, movable: ReadonlySet<number>, preferred: ReadonlySet<number>): number[] {
  const { width, height } = level;
  if (!level.blocks || level.blocks.size === 0) return [];
  const solid = (x: number, y: number, skip: number) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) return true;
    const cell = cy * width + cx;
    if (level.walls[cell] !== null) return true;
    return cell !== skip && blocksIn(level, cell).some((b) => blockHits(b, x, y));
  };
  const r = PASS_RADIUS;
  const fits = (x: number, y: number, skip: number) => !solid(x - r, y - r, skip) && !solid(x + r, y - r, skip) && !solid(x - r, y + r, skip) && !solid(x + r, y + r, skip);
  /** In a size×size window of cells around cell: does removing this cell's blocks connect places that lead to the window's edge. */
  const splits = (cell: number, size: number): boolean => {
    const n = Math.round(size / PASS_STEP);
    const x0 = (cell % width) - (size - 1) / 2;
    const y0 = Math.floor(cell / width) - (size - 1) / 2;
    const parts = (skip: number) => {
      const label = new Int32Array(n * n).fill(-1);
      const free = new Uint8Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) free[j * n + i] = fits(x0 + (i + 0.5) * PASS_STEP, y0 + (j + 0.5) * PASS_STEP, skip) ? 1 : 0;
      let count = 0;
      for (let s = 0; s < n * n; s++) {
        if (!free[s] || label[s]! >= 0) continue;
        const stack = [s];
        label[s] = count;
        while (stack.length > 0) {
          const p = stack.pop()!;
          const i = p % n;
          const j = (p - i) / n;
          for (const q of [i > 0 ? p - 1 : -1, i < n - 1 ? p + 1 : -1, j > 0 ? p - n : -1, j < n - 1 ? p + n : -1]) {
            if (q < 0 || !free[q] || label[q]! >= 0) continue;
            label[q] = count;
            stack.push(q);
          }
        }
        count++;
      }
      return label;
    };
    const withBlocks = parts(-1);
    const without = parts(cell);
    const edge = new Set<number>();
    for (let s = 0; s < n * n; s++) {
      const i = s % n;
      const j = (s - i) / n;
      if ((i === 0 || j === 0 || i === n - 1 || j === n - 1) && withBlocks[s]! >= 0) edge.add(withBlocks[s]!);
    }
    // Parts with blocks that lead to the edge, by parts without blocks: two in one — the block was separating them.
    const joined = new Map<number, number>();
    for (let s = 0; s < n * n; s++) {
      const a = withBlocks[s]!;
      if (a < 0 || !edge.has(a)) continue;
      const b = without[s]!;
      const first = joined.get(b);
      if (first === undefined) joined.set(b, a);
      else if (first !== a) return true;
    }
    return false;
  };
  // Passage along the walls: how many open cells in a row in both directions (no more than NARROW) — whether it's narrow here along x or y.
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && level.walls[y * width + x] === null;
  const run = (x: number, y: number, dx: number, dy: number) => {
    let k = 0;
    while (k < NARROW && open(x + dx * (k + 1), y + dy * (k + 1))) k++;
    return k;
  };
  const narrow = (x: number, y: number) => open(x, y) && (run(x, y, -1, 0) + run(x, y, 1, 0) < NARROW || run(x, y, 0, -1) + run(x, y, 0, 1) < NARROW);
  const inPassage = (cell: number) => {
    const x = cell % width;
    const y = (cell - x) / width;
    return narrow(x, y) || narrow(x - 1, y) || narrow(x + 1, y) || narrow(x, y - 1) || narrow(x, y + 1);
  };
  const cells = [...level.blocks.keys()].filter((cell) => movable.has(cell) && inPassage(cell) && blocksIn(level, cell).some((b) => (b.base ?? 0) < 1));
  // Idle furniture first: of a "herringbone" pair it is the one that leaves, and the crate stays.
  cells.sort((a, b) => Number(preferred.has(b)) - Number(preferred.has(a)));
  const removed: number[] = [];
  for (const cell of cells) {
    if (!splits(cell, 3) || !splits(cell, 5)) continue;
    for (const b of blocksIn(level, cell)) if ((b.base ?? 0) < 1) removeBlock(level, cell, b);
    removed.push(cell);
  }
  return removed;
}
