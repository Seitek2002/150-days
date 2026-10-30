// Our furniture drawings for 3D blocks (src/game/blocks.ts): lockers, bookcases, tables, crates, small chests,
// a fridge, a dresser, beds, a slot machine, a casino table, a sink. Drawn in code, like walls; nothing from Fallout
// files. Front side: y = 0 — top of the object, y = 127 — floor. Top: y = 0 — at the back wall, y = 127 — at the front.
// Point 0 — a hole (what is behind shows through between the table legs).
import { build, dome, fbm, hash, lerp, noise, put, withGlow, TEX, type Px, type Texture } from './textures.ts';

export type FurnitureTexture =
  | 'lockerFront'
  | 'wallLockerFront'
  | 'metalSide'
  | 'metalTop'
  | 'shelfFront'
  | 'woodSide'
  | 'woodTop'
  | 'deskFront'
  | 'tableFront'
  | 'feltTop'
  | 'crateSide'
  | 'crateTop'
  | 'chestFront'
  | 'chestSide'
  | 'chestTop'
  | 'fridgeFront'
  | 'fridgeSide'
  | 'dresserFront'
  | 'bedSide'
  | 'bedTop'
  | 'bunkFront'
  | 'slotFront'
  | 'slotSide'
  | 'sinkFront'
  | 'sinkTop'
  | 'barrelSide'
  | 'barrelTop'
  | 'fireTop'
  | 'fabric'
  | 'poleMetal'
  | 'lampHead'
  | 'hydrant'
  | 'drawersFront'
  | 'mattressSide'
  | 'panelFront'
  | 'stripeLine'
  | 'stripeCross'
  | 'floorMat'
  | 'drain'
  | 'manhole'
  | 'trapdoor'
  | 'pit'
  | 'policeBoxFront'
  | 'policeBoxTop'
  | 'policeBoxLamp'
  | 'ventGrille'
  | 'pipeRun'
  | 'wireRun'
  | 'glassWindow'
  | 'signStop'
  | 'signYield'
  | 'signArrow'
  | 'carBody'
  | 'carCabin'
  | 'tire'
  | 'wellStone'
  | 'wellTop'
  | 'shaftBroken'
  | 'shaftRope'
  | 'stairsDown'
  | 'noticeBoard'
  | 'vendingFront'
  | 'gateBars'
  | 'barrierStripe'
  | 'bridgePlanks'
  | 'liftGrate'
  | 'stasisTube'
  | 'stasisTubeBroken';

type Rgb3 = [number, number, number];
type Paint = (x: number, y: number, p: Px, k?: number) => void;

/** Wood: grain along x, planks plank points tall (0 — solid), each plank with its own shade. */
function wood(seed: number, base: Rgb3, plank = 0): Paint {
  const wave = noise(seed, 3, 6);
  const fine = noise(seed + 1, 6, 64);
  return (x, y, p, k = 1) => {
    const board = plank ? Math.floor(y / plank) : 0;
    const tone = plank ? 0.86 + hash(board, 3, seed) * 0.24 : 1;
    const ring = Math.sin((y + wave(x, y + board * 37) * 18) * 1.1) * 0.5 + 0.5;
    const t = 0.76 + ring * 0.14 + fine(x, y) * 0.14;
    const seam = plank > 0 && y % plank === 0;
    put(p, base[0], base[1], base[2], (seam ? 0.42 : t * tone) * k);
    p.h = seam ? 0.1 : 0.55 + ring * 0.1;
  };
}

/** Painted metal: grain, scuffs down to the steel, orange rust patches. */
function painted(seed: number, base: Rgb3): Paint {
  const grain = fbm(seed, 8, 4);
  const scuff = fbm(seed + 1, 4, 3);
  const rust = fbm(seed + 2, 6, 3);
  return (x, y, p, k = 1) => {
    const worn = Math.max(0, Math.min(1, (scuff(x, y) - 0.64) * 4));
    const rusty = Math.max(0, Math.min(1, (rust(x, y) - 0.6) * 3));
    const g = (0.84 + grain(x, y) * 0.24) * k;
    put(p, lerp(lerp(base[0], 150, worn), 120, rusty), lerp(lerp(base[1], 146, worn), 70, rusty), lerp(lerp(base[2], 140, worn), 42, rusty), g);
    p.h = 0.7;
  };
}

/** The object's edges are darker (bevel), d — how many points from the edge. */
const rim = (x: number, y: number) => Math.min(x, 127 - x, y, 127 - y);

/** Remove points (holes): what is behind the object shows through. */
export function withHoles(texture: Texture, hole: (x: number, y: number) => boolean): Texture {
  const pixels = texture.pixels.slice();
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) if (hole(x, y)) pixels[y * TEX + x] = 0;
  return { ...texture, pixels, variants: [pixels] };
}

const OAK: Rgb3 = [128, 88, 54];
const PINE: Rgb3 = [150, 112, 70];
const LOCKER: Rgb3 = [96, 108, 98];
const ENAMEL: Rgb3 = [214, 208, 190];
/** Blue paint of the booth (a special encounter in the wasteland). */
const BOX_BLUE: Rgb3 = [34, 58, 112];

/**
 * Side of the blue booth (the "booth" special encounter, our own drawing): a frame, a dark sign strip under the roof with light
 * rectangles (no lettering), two doors — at the top each has a six-pane window, below that three recessed panels;
 * a post with a handle in the middle.
 */
function policeBoxFront(): Texture {
  const paint = painted(231, BOX_BLUE);
  return build((x, y, p) => {
    const edge = rim(x, y);
    const post = x >= 60 && x <= 67;
    const door = x < 64 ? x - 8 : x - 72;
    const inDoor = x >= 8 && x <= 119 && !post && door >= 0 && door <= 47;
    // Sign strip: dark, with light bar "letters".
    if (y >= 6 && y <= 17 && edge >= 4) {
      const letter = y >= 9 && y <= 14 && x >= 14 && x <= 113 && x % 7 < 4;
      put(p, letter ? 210 : 22, letter ? 214 : 24, letter ? 220 : 30, letter ? 0.85 : 1);
      p.h = 0.5;
      return;
    }
    // Window: 2 × 3 panes in a frame.
    const wx = door - 6;
    const wy = y - 24;
    if (inDoor && wx >= 0 && wx <= 35 && wy >= 0 && wy <= 22) {
      const bar = wx % 12 < 2 || wy % 11 < 2 || wx >= 34 || wy >= 21;
      if (bar) paint(x, y, p, 0.9);
      else put(p, 196, 214, 222, 0.85 + (wy / 22) * 0.1);
      p.h = bar ? 0.6 : 0.2;
      return;
    }
    // Panels: three down each door.
    const py = y - 52;
    const panel = inDoor && door >= 6 && door <= 41 && py >= 0 && py <= 68 && py % 23 >= 3 && py % 23 <= 20;
    const handle = x >= 55 && x <= 58 && y >= 66 && y <= 74;
    paint(x, y, p, edge < 4 ? 0.7 : post ? 0.8 : panel ? 0.82 : 1);
    if (handle) put(p, 168, 164, 150, 0.9);
    p.h = edge < 4 ? 0.95 : panel ? 0.35 : handle ? 1 : 0.65;
  });
}

/** Booth roof and plinth: the same blue paint, darker. */
function policeBoxTop(): Texture {
  const paint = painted(232, BOX_BLUE);
  return build((x, y, p) => {
    paint(x, y, p, 0.72);
    p.h = 0.5;
  });
}

/** Lamp on the booth roof: frosted glass in a dark setting. */
function policeBoxLamp(): Texture {
  return build((x, y, p) => {
    const frame = rim(x, y) < 10 || y % 42 < 6;
    put(p, frame ? 30 : 236, frame ? 34 : 238, frame ? 44 : 226, 1);
    p.h = frame ? 0.8 : 0.3;
  });
}

/** Locker: a door with ventilation slots at the top and bottom, a label, a handle, seams along the edge. */
function lockerFront(): Texture {
  const paint = painted(201, LOCKER);
  return build((x, y, p) => {
    const edge = rim(x, y);
    const vent = x >= 34 && x <= 94 && ((y >= 10 && y <= 30) || (y >= 98 && y <= 114)) && (y - 10) % 5 < 2;
    const card = x >= 36 && x <= 66 && y >= 40 && y <= 50;
    const handle = x >= 100 && x <= 105 && y >= 56 && y <= 78;
    const seam = x === 6 || x === 121;
    paint(x, y, p, edge < 2 ? 0.55 : vent ? 0.25 : seam ? 0.5 : 1);
    if (card) put(p, 196, 190, 168, 0.9);
    if (handle) put(p, 170, 172, 170, 0.8 + dome(Math.abs(x - 102.5), 3) * 0.4);
    p.h = vent || seam ? 0.1 : handle ? 0.95 : card ? 0.75 : edge < 2 ? 0.9 : 0.65;
  });
}

/** Wall cabinet: two doors with ventilation slots, handles at the middle seam, a label, a bevel along the edge. */
function wallLockerFront(): Texture {
  const paint = painted(203, LOCKER);
  return build((x, y, p) => {
    const edge = rim(x, y);
    const door = x < 64 ? x : x - 64;
    const seam = x === 63 || x === 64;
    const vent = door >= 14 && door <= 50 && y >= 14 && y <= 40 && (y - 14) % 6 < 2;
    const handle = (x >= 54 && x <= 58 && y >= 54 && y <= 76) || (x >= 69 && x <= 73 && y >= 54 && y <= 76);
    const card = x >= 18 && x <= 44 && y >= 92 && y <= 104;
    paint(x, y, p, edge < 3 ? 0.55 : seam ? 0.35 : vent ? 0.25 : 1);
    if (card) put(p, 196, 190, 168, 0.85);
    if (handle) put(p, 170, 172, 170, 0.85);
    p.h = seam || vent ? 0.1 : handle ? 0.95 : card ? 0.75 : edge < 3 ? 0.9 : 0.65;
  });
}

function metalSide(): Texture {
  const paint = painted(205, LOCKER);
  return build((x, y, p) => {
    const edge = rim(x, y);
    paint(x, y, p, edge < 2 ? 0.6 : y % 42 === 0 ? 0.6 : 1);
    p.h = edge < 2 ? 0.9 : 0.65;
  });
}

function metalTop(): Texture {
  const paint = painted(207, LOCKER);
  return build((x, y, p) => {
    paint(x, y, p, rim(x, y) < 3 ? 0.7 : 0.95);
    p.h = rim(x, y) < 3 ? 0.9 : 0.6;
  });
}

/** Bookcase: a wooden frame, four shelves with books of different heights and colors, empty in places. */
function shelfFront(): Texture {
  const frame = wood(211, OAK);
  const BOOKS: Rgb3[] = [
    [120, 40, 34],
    [52, 70, 100],
    [60, 84, 50],
    [140, 110, 60],
    [90, 60, 40],
    [150, 140, 120],
    [70, 40, 60],
  ];
  const SHELVES = [8, 38, 68, 98];
  return build((x, y, p) => {
    if (x < 7 || x > 120 || y < 6 || y > 120) {
      frame(x, y, p, 0.9);
      p.h = 0.9;
      return;
    }
    const shelf = SHELVES.findIndex((s) => y >= s - 2 && y < s + 3);
    if (shelf >= 0 && y >= SHELVES[0]! + 3) {
      frame(x, y, p, 1.05);
      p.h = 0.85;
      return;
    }
    // Cell between shelves: books stand on the cell's lower shelf.
    const row = SHELVES.filter((s) => s <= y).length - 1;
    const floor = (SHELVES[row + 1] ?? 121) - 2;
    const roof = (SHELVES[row] ?? 6) + 3;
    // Books: columns 4–9 points wide, per hash slot; some slots are empty.
    let start = 8;
    let book = -1;
    for (let i = 0; start <= 120; i++) {
      const w = 4 + Math.floor(hash(i, row, 213) * 6);
      if (x >= start && x < start + w) {
        book = i;
        break;
      }
      start += w;
    }
    const empty = book < 0 || hash(book, row, 214) < 0.14;
    const height = 0.6 + hash(book, row, 215) * 0.35;
    const top = floor - (floor - roof) * height;
    if (empty || y < top) {
      frame(x, y, p, 0.22);
      p.h = 0.05;
      return;
    }
    const c = BOOKS[Math.floor(hash(book, row, 216) * BOOKS.length)]!;
    const spine = x === start;
    const band = Math.abs(y - (top + 6)) < 1 || Math.abs(y - (floor - 6)) < 1;
    put(p, c[0], c[1], c[2], spine ? 0.55 : band ? 1.25 : 0.9);
    p.h = spine ? 0.3 : 0.6;
  });
}

function woodSide(): Texture {
  const w = wood(221, OAK);
  return build((x, y, p) => {
    w(x, y, p, rim(x, y) < 3 ? 0.8 : 1);
    if (rim(x, y) < 3) p.h = 0.85;
  });
}

function woodTop(): Texture {
  const w = wood(223, OAK, 26);
  return build((x, y, p) => {
    w(y, x, p, rim(x, y) < 2 ? 0.8 : 1.05);
  });
}

/** Desk from the front: a desktop, two pedestals with drawers, a shadow under the desk in the middle. */
function deskFront(): Texture {
  const w = wood(231, OAK, 0);
  return build((x, y, p) => {
    if (y < 10) {
      w(x, y, p, y < 2 || y > 7 ? 0.75 : 1.1);
      p.h = 0.85;
      return;
    }
    const knee = x > 44 && x < 84 && y > 22;
    if (knee) {
      put(p, 22, 18, 14);
      p.h = 0.05;
      return;
    }
    // Drawers: three on the left and right, one narrow one in the middle.
    const inPed = x <= 44 || x >= 84;
    const row = inPed ? Math.floor((y - 10) / 39) : 0;
    const top = inPed ? 10 + row * 39 : 10;
    const bottom = inPed ? top + 38 : 22;
    const left = x <= 44 ? 4 : x >= 84 ? 84 : 44;
    const right = x <= 44 ? 44 : x >= 84 ? 124 : 84;
    const gap = y === top || y === bottom || x === left || x === right;
    const knob = Math.hypot(x - (left + right) / 2, y - (top + bottom) / 2) < 2.6;
    w(x, y, p, gap ? 0.45 : knob ? 1.4 : 0.95);
    p.h = gap ? 0.1 : knob ? 1 : 0.6;
  });
}

/** Table on legs: a tabletop, an apron, legs at the edges; empty between the legs. */
function tableFront(): Texture {
  const w = wood(241, PINE);
  const leg = (x: number) => (x >= 4 && x <= 15) || (x >= 112 && x <= 123);
  const tex = build((x, y, p) => {
    w(x, y, p, y < 16 ? (y < 2 || y > 13 ? 0.75 : 1.1) : 0.85);
    p.h = y < 16 ? 0.85 : 0.6;
  });
  return withHoles(tex, (x, y) => y >= 28 && !leg(x));
}

/** Casino table from above: green cloth in a wooden rail. */
function feltTop(): Texture {
  const w = wood(245, OAK);
  const n = fbm(246, 16, 3);
  return build((x, y, p) => {
    const edge = rim(x, y);
    if (edge < 10) {
      w(x, y, p, edge < 2 ? 0.7 : 1);
      p.h = 0.9 - (edge > 7 ? 0.2 : 0);
      return;
    }
    const line = Math.abs(x - 64) < 1 || Math.abs(y - 64) < 1;
    put(p, 34, 104, 58, (0.82 + n(x, y) * 0.2) * (line ? 1.5 : 1));
    p.h = 0.5;
  });
}

/** Wooden crate: planks, a nailed frame along the edge, a diagonal brace. */
function crateSide(): Texture {
  const planks = wood(251, PINE, 21);
  const frame = wood(252, [118, 84, 50]);
  return build((x, y, p) => {
    const edge = rim(x, y);
    const brace = Math.abs(x - y) < 7 && edge >= 12;
    if (edge < 12 || brace) {
      frame(x, y, p, edge < 2 ? 0.6 : 1);
      const nail = edge >= 4 && edge <= 8 && (x < 12 || x > 115) && (y < 12 || y > 115);
      if (nail) put(p, 70, 66, 60);
      p.h = 0.85 + (nail ? 0.1 : 0);
      return;
    }
    planks(x, y, p, 0.92);
    p.h = 0.5;
  });
}

function crateTop(): Texture {
  const planks = wood(255, PINE, 21);
  return build((x, y, p) => {
    planks(y, x, p, rim(x, y) < 3 ? 0.7 : 0.95);
  });
}

/** Small chest: olive body, metal bands, a lid with a lock in the middle. */
function chestFront(): Texture {
  const paint = painted(261, [86, 92, 62]);
  return build((x, y, p) => {
    const band = Math.abs(x - 22) < 4 || Math.abs(x - 105) < 4;
    const lid = y === 34 || y === 35;
    const lock = x >= 56 && x <= 71 && y >= 26 && y <= 46;
    paint(x, y, p, rim(x, y) < 3 ? 0.6 : lid ? 0.4 : 1);
    if (band) put(p, 104, 98, 88, 0.85);
    if (lock) put(p, 170, 150, 90, Math.hypot(x - 63.5, y - 38) < 2 ? 0.3 : 0.95);
    p.h = lid ? 0.1 : band || lock ? 0.9 : 0.65;
  });
}

function chestSide(): Texture {
  const paint = painted(263, [86, 92, 62]);
  return build((x, y, p) => {
    const handle = x >= 44 && x <= 84 && Math.abs(y - 52) < 3;
    paint(x, y, p, rim(x, y) < 3 ? 0.6 : y === 34 ? 0.4 : 1);
    if (handle) put(p, 60, 58, 54);
    p.h = handle ? 0.95 : y === 34 ? 0.1 : 0.65;
  });
}

function chestTop(): Texture {
  const paint = painted(265, [86, 92, 62]);
  return build((x, y, p) => {
    const band = Math.abs(x - 22) < 4 || Math.abs(x - 105) < 4;
    paint(x, y, p, rim(x, y) < 3 ? 0.6 : 1);
    if (band) put(p, 104, 98, 88, 0.85);
    p.h = band ? 0.9 : 0.65;
  });
}

/** Fridge: grimy enamel, a freezer at the top, handles, a grille at the bottom. */
function fridgeFront(): Texture {
  const paint = painted(271, ENAMEL);
  return build((x, y, p) => {
    const edge = rim(x, y);
    const split = y === 42 || y === 43;
    const handle = x >= 104 && x <= 110 && ((y >= 12 && y <= 34) || (y >= 52 && y <= 92));
    const grille = y >= 114 && x > 10 && x < 117 && y % 3 === 0;
    paint(x, y, p, edge < 4 ? 0.7 + edge * 0.06 : split ? 0.45 : grille ? 0.3 : 1);
    if (handle) put(p, 184, 186, 186, 0.9 + dome(Math.abs(x - 107), 4) * 0.3);
    p.h = handle ? 1 : split || grille ? 0.1 : edge < 4 ? 0.85 : 0.6;
  });
}

function fridgeSide(): Texture {
  const paint = painted(273, ENAMEL);
  return build((x, y, p) => {
    paint(x, y, p, rim(x, y) < 4 ? 0.75 : 0.95);
    p.h = 0.6;
  });
}

/** Dresser: three rows of drawers with two handles each, legs; empty between the legs. */
function dresserFront(): Texture {
  const w = wood(281, OAK);
  const tex = build((x, y, p) => {
    if (y < 6) {
      w(x, y, p, 1.1);
      p.h = 0.85;
      return;
    }
    const row = Math.min(2, Math.floor((y - 6) / 37));
    const top = 6 + row * 37;
    const gap = y === top || y === top + 36 || x <= 5 || x >= 122;
    const knob = (Math.hypot(x - 36, y - top - 18) < 3 || Math.hypot(x - 91, y - top - 18) < 3) && y < 117;
    w(x, y, p, gap ? 0.45 : knob ? 1.45 : 0.95);
    p.h = gap ? 0.1 : knob ? 1 : 0.6;
  });
  return withHoles(tex, (x, y) => y >= 118 && x > 12 && x < 115);
}

/** Bed from the side: a blanket hanging in folds, a frame beneath it, legs, darkness under the bed. */
function bedSide(): Texture {
  const blanket = fbm(291, 6, 3);
  const frame = painted(292, [70, 74, 70]);
  return build((x, y, p) => {
    if (y < 64) {
      const fold = Math.sin(x * 0.35 + blanket(x, y) * 6) * 0.5 + 0.5;
      const hem = y > 58;
      put(p, 92, 100, 72, (0.78 + fold * 0.2) * (hem ? 0.75 : 1) * (y < 3 ? 1.15 : 1));
      p.h = 0.4 + fold * 0.3;
      return;
    }
    const legs = x < 9 || x > 118;
    if (y < 78 || legs) {
      frame(x, y, p, 0.9);
      p.h = 0.8;
      return;
    }
    put(p, 14, 13, 12);
    p.h = 0.05;
  });
}

/** Bed from above: a pillow by the wall, a folded-back sheet, a blanket in folds. */
function bedTop(): Texture {
  const blanket = fbm(295, 6, 3);
  return build((x, y, p) => {
    const edge = rim(x, y);
    if (y < 30) {
      const pillow = x > 14 && x < 113 && y > 4 && y < 27;
      if (pillow) {
        const d = Math.min(x - 14, 113 - x, y - 4, 27 - y);
        put(p, 196, 192, 176, 0.75 + Math.min(1, d / 6) * 0.3);
        p.h = 0.4 + Math.min(1, d / 6) * 0.5;
      } else {
        put(p, 178, 174, 160, 0.85);
        p.h = 0.3;
      }
      return;
    }
    if (y < 40) {
      put(p, 190, 186, 170, y === 39 ? 0.6 : 0.95);
      p.h = 0.6;
      return;
    }
    const fold = Math.sin(y * 0.22 + blanket(x, y) * 7) * 0.5 + 0.5;
    put(p, 92, 100, 72, (0.8 + fold * 0.2) * (edge < 3 ? 0.8 : 1));
    p.h = 0.4 + fold * 0.3;
  });
}

/** Bunk bed from the front: steel posts, two mattresses with blankets; empty between the tiers. */
function bunkFront(): Texture {
  const frame = painted(297, [80, 86, 80]);
  const blanket = fbm(298, 6, 3);
  const post = (x: number) => x < 8 || x > 119;
  const bunk = (y: number, top: number) => y >= top && y < top + 24;
  const tex = build((x, y, p) => {
    if (post(x) || y === 30 || y === 100 || (y >= 28 && y <= 31) || (y >= 98 && y <= 101)) {
      frame(x, y, p, 0.95);
      p.h = 0.85;
      return;
    }
    const fold = Math.sin(x * 0.35 + blanket(x, y) * 6) * 0.5 + 0.5;
    put(p, 92, 100, 72, 0.78 + fold * 0.2);
    p.h = 0.4 + fold * 0.3;
  });
  return withHoles(tex, (x, y) => !post(x) && !bunk(y, 6) && !bunk(y, 76) && !(y >= 28 && y <= 31) && !(y >= 98 && y <= 101));
}

/** Slot machine: a glowing sign, a window with three reels, a coin tray, case panels. */
function slotFront(): Texture {
  const paint = painted(301, [120, 34, 30]);
  const SYMBOLS: Rgb3[] = [
    [220, 40, 40],
    [240, 200, 40],
    [60, 160, 220],
  ];
  const sign = (x: number, y: number) => x >= 12 && x <= 115 && y >= 6 && y <= 24;
  const reel = (x: number, y: number) => y >= 34 && y <= 62 && [18, 50, 82].some((r) => x >= r && x <= r + 27);
  const tex = build((x, y, p) => {
    if (sign(x, y)) {
      const bulbs = (x + y) % 6 < 2 && (y === 7 || y === 23 || x === 13 || x === 114);
      put(p, 255, bulbs ? 250 : 170, bulbs ? 200 : 40, 1);
      p.h = 0.8;
      return;
    }
    if (reel(x, y)) {
      const i = x < 50 ? 0 : x < 82 ? 1 : 2;
      const cx = [31.5, 63.5, 95.5][i]!;
      const c = SYMBOLS[i]!;
      const sym = Math.hypot(x - cx, y - 48) < 7;
      put(p, sym ? c[0] : 236, sym ? c[1] : 232, sym ? c[2] : 220, y < 37 || y > 59 ? 0.7 : 1);
      p.h = 0.3;
      return;
    }
    const tray = x >= 30 && x <= 98 && y >= 84 && y <= 94;
    const panel = y > 100 && (x === 20 || x === 107 || y === 101);
    paint(x, y, p, rim(x, y) < 3 ? 0.55 : tray ? 0.2 : panel ? 0.5 : 1);
    if (x >= 40 && x <= 52 && y >= 68 && y <= 74) put(p, 220, 210, 160);
    p.h = tray || panel ? 0.1 : 0.7;
  });
  return withGlow(tex, (x, y) => sign(x, y) || reel(x, y));
}

function slotSide(): Texture {
  const paint = painted(305, [120, 34, 30]);
  return build((x, y, p) => {
    paint(x, y, p, rim(x, y) < 3 ? 0.6 : y === 30 || y === 100 ? 0.5 : 1);
    p.h = 0.65;
  });
}

/** Sink from the front: porcelain, a dark niche with a pipe under the basin. */
function sinkFront(): Texture {
  const n = fbm(311, 8, 3);
  return build((x, y, p) => {
    if (y < 40) {
      put(p, 222, 220, 210, (0.84 + n(x, y) * 0.16) * (y < 3 ? 1.1 : y > 36 ? 0.7 : 1));
      p.h = 0.7;
      return;
    }
    const pipe = Math.abs(x - 64) < 5 && y < 110;
    put(p, pipe ? 120 : 20, pipe ? 118 : 18, pipe ? 112 : 16, pipe ? 0.9 : 1);
    p.h = pipe ? 0.9 : 0.05;
  });
}

/** Sink from above: the rim, a basin with a drain, a tap by the wall. */
function sinkTop(): Texture {
  const n = fbm(313, 8, 3);
  return build((x, y, p) => {
    const bowl = ((x - 64) / 48) ** 2 + ((y - 74) / 42) ** 2;
    const tap = Math.abs(x - 64) < 4 && y > 8 && y < 34;
    const drain = Math.hypot(x - 64, y - 78) < 4;
    if (tap) {
      put(p, 176, 178, 180, 1);
      p.h = 1;
      return;
    }
    if (drain) {
      put(p, 40, 40, 40);
      p.h = 0.1;
      return;
    }
    const k = bowl < 1 ? 0.7 + bowl * 0.25 : 0.95;
    put(p, 222, 220, 210, k * (0.86 + n(x, y) * 0.14));
    p.h = bowl < 1 ? 0.2 + bowl * 0.4 : 0.8;
  });
}

/** Barrel from the side (wraps around the cylinder twice): rusty paint, two hoops, streaks, a dark top edge. */
function barrelSide(): Texture {
  const paint = painted(321, [112, 64, 42]);
  const drips = noise(322, 24, 2);
  return build((x, y, p) => {
    const rib = Math.abs(y - 34) < 3 || Math.abs(y - 94) < 3;
    const lip = y < 4 || y > 123;
    const drip = drips(x, y) > 0.62 ? 0.82 : 1;
    paint(x, y, p, lip ? 0.6 : rib ? 1.15 : drip);
    p.h = rib ? 0.9 : lip ? 0.8 : 0.55;
  });
}

/** Barrel lid: rim, concentric mark, bung. */
function barrelTop(): Texture {
  const paint = painted(325, [96, 60, 44]);
  return build((x, y, p) => {
    const d = Math.hypot(x - 63.5, y - 63.5);
    const plug = Math.hypot(x - 88, y - 50) < 7;
    paint(x, y, p, d > 58 ? 0.6 : Math.abs(d - 46) < 2 ? 0.75 : plug ? 0.5 : 1);
    p.h = d > 58 ? 0.9 : plug ? 0.95 : 0.55;
  });
}

/** Fire in a barrel from above: tongues of flame, glows by itself. */
function fireTop(): Texture {
  const n = fbm(331, 6, 4);
  const tex = build((x, y, p) => {
    const d = Math.hypot(x - 63.5, y - 63.5) / 64;
    const heat = Math.max(0, Math.min(1, n(x, y) * 1.4 - d * 0.6));
    put(p, 255, 120 + heat * 130, 30 + heat * 90, 0.55 + heat * 0.5);
    p.h = 0.5;
  }, 0);
  return withGlow(tex, () => true);
}

/** Sofa upholstery: worn fabric, sparse vertical seams (cushions), stains. */
function fabric(): Texture {
  const n = fbm(341, 16, 4);
  const stains = fbm(342, 4, 3);
  return build((x, y, p) => {
    const seam = x % 64 === 0;
    const stain = stains(x, y) > 0.62 ? 0.75 : 1;
    put(p, 112, 58, 46, (0.75 + n(x, y) * 0.3) * stain * (seam ? 0.6 : 1));
    p.h = seam ? 0.2 : 0.5 + n(x, y) * 0.3;
  });
}

/** Lamp post: dark metal with vertical streaks. */
function poleMetal(): Texture {
  const paint = painted(351, [70, 74, 72]);
  return build((x, y, p) => {
    paint(x, y, p, y % 40 === 0 ? 0.6 : 1);
    p.h = 0.6;
  });
}

/** Lamp head from the side: a cap on top, glowing glass below. */
function lampHead(): Texture {
  const paint = painted(355, [62, 66, 64]);
  const glass = (y: number) => y >= 56;
  const tex = build((x, y, p) => {
    if (glass(y)) {
      put(p, 255, 236, 170, 0.9 + (y > 100 ? 0.1 : 0));
      p.h = 0.4;
      return;
    }
    paint(x, y, p, y > 50 ? 0.6 : 1);
    p.h = 0.7;
  });
  return withGlow(tex, (_x, y) => glass(y));
}

/** Fire hydrant: red paint, peeling. */
function hydrant(): Texture {
  const paint = painted(361, [168, 40, 32]);
  return build((x, y, p) => {
    const cap = Math.abs(y - 50) < 10 && x % 64 > 20 && x % 64 < 44;
    paint(x, y, p, y < 10 ? 0.75 : cap ? 1.15 : 1);
    p.h = cap ? 0.95 : 0.6;
  });
}

/** Desk pedestal from the front: three drawers with handles. */
function drawersFront(): Texture {
  const w = wood(371, OAK);
  return build((x, y, p) => {
    const row = Math.min(2, Math.floor(y / 43));
    const top = row * 43;
    const gap = y === top || y === top + 42 || x <= 3 || x >= 124 || y >= 125;
    const knob = Math.hypot(x - 64, y - top - 21) < 4;
    w(x, y, p, gap ? 0.45 : knob ? 1.45 : 0.95);
    p.h = gap ? 0.1 : knob ? 1 : 0.6;
  });
}

/** Mattress from the side: a blanket hanging in folds, a frame at the bottom. */
function mattressSide(): Texture {
  const blanket = fbm(381, 6, 3);
  const frame = painted(382, [70, 74, 70]);
  return build((x, y, p) => {
    if (y >= 96) {
      frame(x, y, p, 0.9);
      p.h = 0.8;
      return;
    }
    const fold = Math.sin(x * 0.35 + blanket(x, y) * 6) * 0.5 + 0.5;
    put(p, 92, 100, 72, (0.78 + fold * 0.2) * (y > 88 ? 0.75 : 1) * (y < 4 ? 1.15 : 1));
    p.h = 0.4 + fold * 0.3;
  });
}

/**
 * Wall control panel (field or door control): a screwed-on steel case, a small green screen at the top, beneath it
 * two rows of toggle switches, buttons and lamps (the screen and lamps glow by themselves).
 */
function panelFront(): Texture {
  const paint = painted(391, [92, 98, 96]);
  const screen = (x: number, y: number) => x >= 16 && x <= 111 && y >= 12 && y <= 44;
  const LAMPS: [number, Rgb3][] = [
    [24, [255, 70, 50]],
    [44, [255, 190, 60]],
    [64, [90, 255, 120]],
    [84, [90, 255, 120]],
    [104, [255, 70, 50]],
  ];
  const lamp = (x: number, y: number) => LAMPS.find(([lx]) => Math.hypot(x - lx, y - 110) < 4);
  const tex = build((x, y, p) => {
    const edge = rim(x, y);
    if (edge < 4) {
      paint(x, y, p, 0.55 + edge * 0.1);
      p.h = 0.9;
      return;
    }
    if (screen(x, y)) {
      const line = (y - 16) % 7 < 2 && x > 20 && x < 20 + 20 + hash(Math.floor((y - 16) / 7), 3, 392) * 70;
      put(p, line ? 110 : 10, line ? 250 : 52, line ? 140 : 24, (y & 1) === 0 ? 1 : 0.8);
      p.h = 0.3;
      return;
    }
    // Toggle switches: two rows of six, lever up or down.
    for (const row of [60, 84]) {
      for (let i = 0; i < 6; i++) {
        const cx = 20 + i * 17.5;
        if (Math.abs(x - cx) <= 5 && Math.abs(y - row) <= 7) {
          const up = hash(i, row, 393) > 0.5;
          const lever = Math.abs(x - cx) <= 1.5 && (up ? y < row && y > row - 7 : y > row && y < row + 7);
          if (lever) put(p, 200, 200, 196, 1);
          else put(p, 36, 36, 36, 0.9);
          p.h = lever ? 1 : 0.4;
          return;
        }
      }
    }
    const l = lamp(x, y);
    if (l) {
      put(p, l[1][0], l[1][1], l[1][2], 1);
      p.h = 0.8;
      return;
    }
    paint(x, y, p, 1);
    const screw = [10, 117].some((sx) => [10, 117].some((sy) => Math.hypot(x - sx, y - sy) < 2.5));
    p.h = screw ? 0.95 : 0.65;
  });
  return withGlow(tex, (x, y) => screen(x, y) || !!lamp(x, y));
}

/** Warning stripe on the floor: yellow and black diagonal hatching, paint worn off by feet. along — along x, cross — a cross. */
function stripe(cross: boolean): Texture {
  const worn = fbm(401, 6, 4);
  const inBand = (v: number) => Math.abs(v - 63.5) < 18;
  const tex = build((x, y, p) => {
    const diag = ((x + y) >> 3) & 1;
    const k = 0.75 + worn(x, y) * 0.35;
    if (diag) put(p, 214, 172, 40, k);
    else put(p, 34, 32, 28, k);
    p.h = 0.5;
  }, 0.3);
  return withHoles(tex, (x, y) => !(inBand(y) || (cross && inBand(x))) || worn(x * 2, y * 2) < 0.3);
}

/** Floor mat (gym): dark blue rubber with a border and a seam in the middle. */
function floorMat(): Texture {
  const n = fbm(405, 8, 3);
  const tex = build((x, y, p) => {
    const edge = rim(x, y);
    const border = edge < 16;
    const seam = Math.abs(x - 64) < 1;
    put(p, border ? 120 : 52, border ? 40 : 70, border ? 36 : 104, (0.8 + n(x, y) * 0.25) * (seam ? 0.6 : 1));
    p.h = border ? 0.7 : 0.5;
  });
  return withHoles(tex, (x, y) => rim(x, y) < 8);
}

/** Drain grate: a round cast-iron frame, bars, darkness beneath them. */
function drain(): Texture {
  const tex = build((x, y, p) => {
    const d = Math.hypot(x - 63.5, y - 63.5);
    if (d > 30) {
      put(p, 64, 62, 58, 0.9);
      p.h = 0.6;
      return;
    }
    const bar = d < 26 && x % 8 < 3;
    put(p, bar ? 92 : 12, bar ? 90 : 12, bar ? 84 : 10, bar ? 0.9 + (x % 8) * 0.05 : 1);
    p.h = bar ? 0.8 : 0.1;
  });
  return withHoles(tex, (x, y) => Math.hypot(x - 63.5, y - 63.5) > 34);
}

/**
 * Ladder rungs in a shaft (top view): two rails and rungs across; the further down (along y — "deeper"), the
 * darker. The result is the point's brightness, 0 — not ladder.
 */
function rungs(x: number, y: number, cx: number, half: number, top: number): number {
  const rail = Math.abs(x - (cx - half)) < 2.5 || Math.abs(x - (cx + half)) < 2.5;
  const step = Math.abs(x - cx) < half && (y - top) % 13 < 3;
  if (!rail && !step) return 0;
  return Math.max(0.25, 1 - (y - top) / 90);
}

/**
 * Open sewer manhole (top view, lying on the floor): a riveted cast-iron ring, inside — a dark shaft with
 * ladder rungs; the shifted lid is in the corner of the cell. Outside the manhole — transparent (the floor shows).
 */
function manhole(): Texture {
  const iron = painted(731, [70, 68, 64]);
  const R = 40;
  const tex = build((x, y, p) => {
    const d = Math.hypot(x - 58, y - 58);
    // Lid: round, with a grid of raised strips, pushed to the edge.
    const dc = Math.hypot(x - 106, y - 106);
    if (dc < 26 && d > R + 6) {
      const ridge = (x + y) % 9 < 3;
      iron(x, y, p, dc > 23 ? 0.55 : ridge ? 1.2 : 0.95);
      p.h = dc > 23 ? 0.3 : ridge ? 0.9 : 0.6;
      return;
    }
    if (d >= R && d < R + 7) {
      const rivet = Math.abs(d - (R + 3.5)) < 1.6 && Math.round((Math.atan2(y - 58, x - 58) / (Math.PI * 2)) * 24) % 2 === 0;
      iron(x, y, p, rivet ? 1.35 : d < R + 1.5 ? 0.5 : 1);
      p.h = rivet ? 1 : 0.8;
      return;
    }
    // Shaft: darker toward the middle, a ladder along one side.
    const rung = rungs(x, y, 58, 11, 24);
    if (rung > 0) {
      put(p, 96 * rung, 88 * rung, 76 * rung);
      p.h = 0.6;
      return;
    }
    const k = 0.25 + 0.35 * (d / R) ** 2;
    put(p, 30 * k, 30 * k, 28 * k);
    p.h = 0.05;
  });
  return withHoles(tex, (x, y) => Math.hypot(x - 58, y - 58) >= R + 7 && Math.hypot(x - 106, y - 106) >= 26);
}

/** Open floor hatch: a plank frame, a dark opening with a ladder, the hatch lid folded back along the top edge. */
function trapdoor(): Texture {
  const wood = painted(741, OAK);
  const tex = build((x, y, p) => {
    // Folded-back lid: planks across, iron hinges.
    if (y < 22 && x >= 18 && x <= 110) {
      const seam = (x - 18) % 15 === 0;
      const hinge = y > 16 && (Math.abs(x - 34) < 4 || Math.abs(x - 94) < 4);
      if (hinge) put(p, 60, 58, 56);
      else wood(x, y, p, seam ? 0.55 : 1);
      p.h = seam ? 0.3 : 0.7;
      return;
    }
    const inFrame = x >= 14 && x <= 114 && y >= 24 && y <= 118;
    const inHole = x >= 24 && x <= 104 && y >= 34 && y <= 108;
    if (inFrame && !inHole) {
      wood(x, y, p, x < 18 || x > 110 || y < 28 || y > 114 ? 0.65 : 1.05);
      p.h = 0.85;
      return;
    }
    const rung = rungs(x, y, 64, 18, 36);
    if (rung > 0) {
      put(p, 110 * rung, 84 * rung, 56 * rung);
      p.h = 0.6;
      return;
    }
    const depth = Math.min(x - 24, 104 - x, y - 34, 108 - y);
    const k = 0.2 + 0.3 * Math.max(0, 1 - depth / 30);
    put(p, 28 * k, 26 * k, 24 * k);
    p.h = 0.05;
  });
  return withHoles(tex, (x, y) => !(y < 22 && x >= 18 && x <= 110) && !(x >= 14 && x <= 114 && y >= 24 && y <= 118));
}

/** Pit in the ground: an uneven edge of crumbling earth and pebbles, darkness inside; outside the pit — the floor. */
function pit(): Texture {
  const edge = noise(751, 10, 10);
  const grain = fbm(752, 16, 3);
  const radius = (x: number, y: number) => 40 + (edge(x, y) - 0.5) * 18;
  const tex = build((x, y, p) => {
    const d = Math.hypot(x - 63.5, y - 63.5);
    const r = radius(x, y);
    if (d > r - 7) {
      const k = (0.65 + grain(x, y) * 0.4) * (d > r ? 1 : 0.7);
      put(p, 92 * k, 74 * k, 54 * k);
      p.h = 0.5 + grain(x, y) * 0.4;
      return;
    }
    const k = 0.15 + 0.35 * (d / r) ** 3;
    put(p, 30 * k, 26 * k, 22 * k);
    p.h = 0.05;
  });
  return withHoles(tex, (x, y) => Math.hypot(x - 63.5, y - 63.5) > radius(x, y) + 4);
}

/** Exhaust grille: a steel frame, slanted louvers, darkness between them. */
function ventGrille(): Texture {
  const paint = painted(411, [96, 100, 98]);
  return build((x, y, p) => {
    const edge = rim(x, y);
    if (edge < 10) {
      paint(x, y, p, edge < 3 ? 0.6 : 1);
      p.h = 0.9;
      return;
    }
    const slat = (y - 10) % 12;
    if (slat < 7) {
      paint(x, y, p, 0.75 + slat * 0.06);
      p.h = 0.5 + slat * 0.05;
    } else {
      put(p, 14, 14, 13);
      p.h = 0.05;
    }
  });
}

/** Pipes along a wall: two pipes with flanges, rust; empty between them (the wall shows). */
function pipeRun(): Texture {
  const paint = painted(415, [110, 104, 92]);
  const pipe = (y: number) => (y >= 18 && y < 54 ? 36 - Math.abs(y - 36) : y >= 74 && y < 110 ? 18 - Math.abs(y - 92) : -1);
  const tex = build((x, y, p) => {
    const r = pipe(y);
    const flange = x % 64 < 6;
    paint(x, y, p, 0.55 + (r / 18) * 0.5 + (flange ? 0.15 : 0));
    p.h = 0.4 + (r / 18) * 0.5 + (flange ? 0.2 : 0);
  });
  return withHoles(tex, (_x, y) => pipe(y) < 0);
}

/** Wires on a wall: three cables, sagging slightly. */
function wireRun(): Texture {
  const tex = build((x, y, p) => {
    put(p, 24, 22, 20, 0.9 + ((x + y) % 7 === 0 ? 0.3 : 0));
    p.h = 0.7;
  }, 0.2);
  const cable = (x: number, y: number) => [32, 64, 96].some((c, i) => Math.abs(x - (c + Math.sin(y * 0.05 + i) * 6)) < 3);
  return withHoles(tex, (x, y) => !cable(x, y));
}

/** Window: a steel frame with a crossbar, dark cloudy glass with highlights. */
function glassWindow(): Texture {
  const n = fbm(421, 4, 3);
  const paint = painted(422, [86, 92, 90]);
  return build((x, y, p) => {
    const edge = rim(x, y);
    if (edge < 8 || Math.abs(x - 64) < 3) {
      paint(x, y, p, edge < 2 ? 0.6 : 1);
      p.h = 0.9;
      return;
    }
    const shine = Math.abs(((x + y) % 64) - 20) < 5 ? 1.5 : 1;
    put(p, 40, 58, 66, (0.6 + n(x, y) * 0.4) * shine);
    p.h = 0.2;
  });
}

/** "Stop" sign: a red octagon with a white border (no lettering). */
function signStop(): Texture {
  const oct = (x: number, y: number, r: number) => {
    const dx = Math.abs(x - 63.5);
    const dy = Math.abs(y - 63.5);
    return dx < r && dy < r && dx + dy < r * 1.42;
  };
  const tex = build((x, y, p) => {
    put(p, oct(x, y, 54) ? 196 : 232, oct(x, y, 54) ? 40 : 228, oct(x, y, 54) ? 34 : 220, 0.95);
    p.h = 0.6;
  }, 0.3);
  return withHoles(tex, (x, y) => !oct(x, y, 62));
}

/** "Yield" sign: a white triangle, point down, with a red border. */
function signYield(): Texture {
  const tri = (x: number, y: number, inset: number) => y >= 8 + inset && y <= 120 - inset && Math.abs(x - 63.5) <= ((120 - inset - y) / 112) * (60 - inset);
  const tex = build((x, y, p) => {
    const inner = tri(x, y, 14);
    put(p, inner ? 232 : 196, inner ? 228 : 40, inner ? 220 : 34, 0.95);
    p.h = 0.6;
  }, 0.3);
  return withHoles(tex, (x, y) => !tri(x, y, 0));
}

/** Signpost: a board with an arrow, the paint peeling. */
function signArrow(): Texture {
  const board = wood(431, PINE);
  const arrow = (x: number, y: number) => (x > 20 && x < 84 && Math.abs(y - 64) < 10) || (x >= 84 && x < 112 && Math.abs(y - 64) < (112 - x) * 0.9);
  const tex = build((x, y, p) => {
    if (arrow(x, y)) put(p, 224, 214, 190, 0.9);
    else board(x, y, p, 0.95);
    p.h = arrow(x, y) ? 0.7 : 0.55;
  });
  return withHoles(tex, (_x, y) => y < 30 || y > 98);
}

/** Body of an abandoned car: peeling paint, rust, a door seam, a molding strip. */
function carBody(): Texture {
  const paint = painted(441, [70, 96, 112]);
  return build((x, y, p) => {
    const seam = x === 42 || x === 86 || y === 12;
    const trim = Math.abs(y - 56) < 2;
    paint(x, y, p, seam ? 0.45 : trim ? 1.25 : 1);
    p.h = seam ? 0.1 : trim ? 0.9 : 0.6;
  });
}

/** Cab: pillars and frame, dark glass with a highlight, the edge of the body at the bottom. */
function carCabin(): Texture {
  const paint = painted(445, [70, 96, 112]);
  return build((x, y, p) => {
    const pillar = x < 10 || x > 117 || Math.abs(x - 64) < 4;
    if (pillar || y < 10 || y > 112) {
      paint(x, y, p, 1);
      p.h = 0.8;
      return;
    }
    const shine = Math.abs(((x + y) % 70) - 24) < 4 ? 1.6 : 1;
    put(p, 26, 34, 40, shine);
    p.h = 0.2;
  });
}

/** Tire: black rubber, tread running across. */
function tire(): Texture {
  return build((x, y, p) => {
    const tread = (x + (y >> 3) * 3) % 10 < 3;
    put(p, 30, 30, 30, tread ? 0.7 : 1);
    p.h = tread ? 0.3 : 0.7;
  });
}

/**
 * Well wall from the side (wraps around the cylinder twice): six rows of dressed stone in different shades, joints offset every other row,
 * chips and dark water streaks near the bottom edge.
 */
function wellStone(): Texture {
  const grain = fbm(451, 8, 4);
  const damp = fbm(452, 6, 3);
  const ROWS = 6;
  const rowH = TEX / ROWS;
  return build((x, y, p) => {
    const row = Math.floor(y / rowH);
    const shift = row % 2 === 0 ? 0 : 16;
    const col = Math.floor(((x + shift) % TEX) / 32);
    const inY = y - row * rowH;
    const inX = (x + shift) % 32;
    // Joint: a strip of mortar around the stone.
    const seam = inY < 2 || inX < 2;
    const tone = 0.7 + hash(col, row, 453) * 0.5;
    const warm = hash(col, row, 454);
    // Stone bulge: lower toward the edge.
    const edge = Math.min(inX, 31 - inX, inY, rowH - 1 - inY);
    const g = 0.82 + grain(x, y) * 0.3;
    const wet = Math.max(0, Math.min(1, (damp(x, y) - 0.55) * 2.2)) * (0.4 + (y / TEX) * 0.8);
    if (seam) {
      put(p, 86, 80, 70, 0.8 + grain(x, y) * 0.2);
      p.h = 0.1;
      return;
    }
    put(p, lerp(162, 126, warm) * tone * g * (1 - wet * 0.35), lerp(136, 118, warm) * tone * g * (1 - wet * 0.3), lerp(100, 104, warm) * tone * g * (1 - wet * 0.2));
    p.h = 0.55 + Math.min(1, edge / 6) * 0.3 + grain(x, y) * 0.1;
  });
}

/** Top of the well: around the circle — a stone rim of slabs, in the middle — dark water with a glint (the deeper, the darker). */
function wellTop(): Texture {
  const grain = fbm(461, 8, 4);
  const ripple = fbm(462, 10, 3);
  return build((x, y, p) => {
    const dx = x - 63.5;
    const dy = y - 63.5;
    const d = Math.hypot(dx, dy);
    if (d > 44) {
      // Rim: slabs around the circle (angular sectors), joints between them and along the inner edge.
      const a = Math.atan2(dy, dx);
      const sector = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16);
      const into = (((a + Math.PI) / (Math.PI * 2)) * 16) % 1;
      const seam = into < 0.05 || d > 62 || Math.abs(d - 44.5) < 1.2;
      const tone = 0.8 + hash(sector, 1, 463) * 0.3;
      if (seam) {
        put(p, 84, 78, 68, 0.8 + grain(x, y) * 0.2);
        p.h = 0.15;
        return;
      }
      put(p, 160 * tone, 136 * tone, 104 * tone, 0.85 + grain(x, y) * 0.3);
      p.h = 0.7 + grain(x, y) * 0.1;
      return;
    }
    // Water: dark, even darker toward the middle; ripples and a glint near the upper left edge.
    const depth = Math.max(0, 1 - d / 44);
    const wave = ripple(x, y);
    const glint = Math.max(0, 1 - Math.hypot(x - 44, y - 42) / 11);
    const k = 0.55 - depth * 0.3 + wave * 0.18;
    put(p, 22 * k + glint * 150, 40 * k + glint * 170, 52 * k + glint * 180, 1);
    p.h = 0.3 + wave * 0.06;
  });
}

/**
 * Broken elevator (Vault 15): a steel frame, a smashed lamp above the opening, the doors forced apart and bent, behind them —
 * a dark shaft with guide rails and snapped cables, yellow-and-black stripes on the threshold. rope — a rope tied to the crossbar in the opening
 * hangs down (people climb down it).
 */
/** Stairs going down, top view (top of the object): concrete steps recede from the front toward the back wall into darkness. */
function stairsDown(): Texture {
  const grain = fbm(761, 12, 3);
  return build((x, y, p) => {
    const deep = 1 - y / 127;
    const edge = (127 - y) % 16 < 3;
    const side = x < 6 || x > 121 ? 0.6 : 1;
    const k = (1 - deep * 0.85) * side * (edge ? 0.45 : 0.85 + grain(x, y) * 0.3);
    put(p, 118 * k, 110 * k, 98 * k);
    p.h = edge ? 0.2 : 0.6;
  });
}

/** Notice board: a wooden frame, sheets pinned to the board (crooked rectangles with stripes for lines of text). */
function noticeBoard(): Texture {
  const w = wood(771, OAK);
  const sheets = [
    [14, 16, 40, 44],
    [60, 10, 98, 40],
    [104, 22, 120, 60],
    [20, 66, 56, 112],
    [64, 52, 100, 96],
    [80, 100, 116, 120],
  ];
  return build((x, y, p) => {
    const edge = rim(x, y);
    if (edge < 8) {
      w(x, y, p, edge < 3 ? 0.7 : 1);
      p.h = 0.8;
      return;
    }
    const sheet = sheets.findIndex(([x0, y0, x1, y1]) => x >= x0! && x <= x1! && y >= y0! && y <= y1!);
    if (sheet >= 0) {
      const [x0, y0] = sheets[sheet]!;
      const line = (y - y0! - 6) % 6 < 2 && y - y0! > 4 && x - x0! > 3;
      const pin = Math.hypot(x - x0! - 4, y - y0! - 3) < 2;
      if (pin) put(p, 170, 40, 30);
      else if (line) put(p, 90, 86, 78);
      else put(p, 214 - sheet * 6, 204 - sheet * 4, 176);
      p.h = 0.7;
      return;
    }
    w(x, y, p, 0.55);
    p.h = 0.5;
  });
}

/**
 * Soda machine from the front: chipped red paint, a light strip at the top, rows of bottles behind cloudy glass,
 * a coin slot on the right, a dispensing window at the bottom. Our own drawing, without lettering or logos.
 */
function vendingFront(): Texture {
  const paint = painted(781, [150, 34, 30]);
  const glass = fbm(782, 8, 3);
  const tex = build((x, y, p) => {
    const edge = rim(x, y);
    if (edge < 5) {
      paint(x, y, p, 0.7);
      p.h = 0.85;
      return;
    }
    if (y >= 8 && y <= 22 && x >= 10 && x <= 117) {
      put(p, 226, 214, 170, 0.85 + glass(x, y) * 0.2);
      p.h = 0.7;
      return;
    }
    if (y >= 28 && y <= 92 && x >= 12 && x <= 84) {
      // Bottles in rows: neck and body; dark glass between them.
      const row = (y - 28) % 16;
      const col = (x - 12) % 12;
      const bottle = col >= 3 && col <= 8 && (row >= 6 || (row >= 2 && col >= 5 && col <= 6));
      if (bottle) put(p, 70 + row * 4, 40, 28, 0.9 + glass(x, y) * 0.2);
      else put(p, 28, 30, 32, 0.8 + glass(x, y) * 0.4);
      p.h = 0.4;
      return;
    }
    if (x >= 94 && x <= 100 && y >= 40 && y <= 58) {
      put(p, 30, 28, 26);
      p.h = 0.1;
      return;
    }
    if (y >= 100 && y <= 116 && x >= 30 && x <= 98) {
      put(p, 22, 20, 20);
      p.h = 0.05;
      return;
    }
    paint(x, y, p, 1);
    p.h = 0.6;
  });
  // The light strip at the top glows in the dark.
  tex.glow = new Uint8Array(TEX * TEX);
  for (let y = 8; y <= 22; y++) for (let x = 10; x <= 117; x++) tex.glow[y * TEX + x] = 1;
  return tex;
}

/** Wrought-iron gate: spiked bars, two crossbars; what is behind the gate shows between the bars. */
function gateBars(): Texture {
  const iron = painted(791, [58, 60, 62]);
  const bar = (x: number) => (x + 4) % 14 < 4;
  const rail = (y: number) => (y >= 22 && y <= 27) || (y >= 104 && y <= 109);
  const tip = (x: number, y: number) => y >= 6 && y < 14 && Math.abs(((x + 4) % 14) - 1.5) <= (y - 6) / 4;
  const tex = build((x, y, p) => {
    const solid = rail(y) || (y >= 14 && bar(x)) || tip(x, y);
    iron(x, y, p, solid ? (rail(y) ? 1 : 0.9) : 1);
    p.h = rail(y) ? 0.9 : 0.75;
  });
  return withHoles(tex, (x, y) => !(rail(y) || (y >= 14 && bar(x)) || tip(x, y)));
}

/** Barrier arm: diagonal yellow and black stripes, worn. */
function barrierStripe(): Texture {
  const scuff = fbm(801, 8, 3);
  return build((x, y, p) => {
    const yellow = Math.floor((x + y) / 16) % 2 === 0;
    const k = 0.75 + scuff(x, y) * 0.35;
    if (yellow) put(p, 196 * k, 156 * k, 40 * k);
    else put(p, 30 * k, 28 * k, 26 * k);
    p.h = 0.7;
  });
}

/** Plank walkway, boards running across, top view (on the floor): gaps between the boards, nails near the edges. */
function bridgePlanks(): Texture {
  const w = wood(811, PINE, 16);
  return build((x, y, p) => {
    const gap = y % 16 === 0;
    const nail = (x === 10 || x === 117) && y % 16 === 8;
    w(y, x, p, gap ? 0.3 : nail ? 0.5 : 1);
    p.h = gap ? 0.1 : 0.7;
  });
}

/** Elevator cab floor: a steel grating (bars both ways), the dark shaft beneath it, a riveted frame along the edge. */
function liftGrate(): Texture {
  const steel = painted(821, [92, 96, 100]);
  return build((x, y, p) => {
    const edge = rim(x, y);
    if (edge < 8) {
      const rivet = edge >= 3 && edge <= 5 && (x + y) % 21 < 3;
      steel(x, y, p, rivet ? 1.35 : 0.85);
      p.h = rivet ? 1 : 0.8;
      return;
    }
    const barX = (x - 8) % 10 < 3;
    const barY = (y - 8) % 10 < 3;
    if (barX || barY) {
      steel(x, y, p, barX && barY ? 1.1 : 0.95);
      p.h = 0.7;
      return;
    }
    put(p, 14, 15, 16);
    p.h = 0.05;
  });
}

/**
 * A Glow storage tube (client request, 2026-10-29: "big storage tanks for bodies"): glass, behind it a pale green glowing
 * liquid with bubbles and the dark silhouette of a body; rusty hoops at the top and bottom. Broken: the glass is left as jagged teeth at the bottom
 * and top, dark inside, a green puddle at the bottom, no body.
 */
function stasisTube(broken: boolean): Texture {
  const rust = painted(831, [118, 76, 46]);
  const murk = fbm(832, 10, 3);
  // Body silhouette: head, shoulders, torso, legs — in the middle of the drawing; the tube turns its middle toward the viewer
  // (Block.toViewer), so the body is visible from any side, and only one.
  const body = (x: number, y: number) => {
    const dx = Math.abs(x - 64);
    // Head tilted slightly, neck, shoulders and chest, waist, hips, legs apart; arms hanging along the body.
    if (Math.hypot((x - 62.5) / 7, (y - 23) / 9) < 1) return true;
    if (y >= 31 && y < 37) return dx < 4;
    if (y >= 37 && y < 46) return dx < 9 + (y - 37) * 0.8;
    if (y >= 46 && y < 70) return dx < 15 - (y - 46) * 0.2;
    if (y >= 70 && y < 86) return dx < 10.5 + (y - 70) * 0.12;
    if (y >= 86 && y < 120) return dx > 1.5 + (y - 86) * 0.06 && dx < 11 - (y - 86) * 0.1;
    return false;
  };
  const arm = (x: number, y: number) => {
    const dx = Math.abs(x - 64);
    return y >= 40 && y < 80 && dx > 13 + (y - 40) * 0.02 && dx < 17.5 + (y - 40) * 0.04;
  };
  // Share of body around the point (5×5) — a soft silhouette edge, as if seen through cloudy liquid.
  const cover = new Float32Array(TEX * TEX);
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      let n = 0;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (body(x + ox, y + oy) || arm(x + ox, y + oy)) n++;
      cover[y * TEX + x] = n / 25;
    }
  }
  const tex = build((x, y, p) => {
    if (y < 5 || y > 122) {
      rust(x, y, p, y === 4 || y === 123 ? 0.6 : 1);
      p.h = 0.9;
      return;
    }
    const shine = Math.max(0, 1 - Math.abs(x - 22) / 6) * 0.5;
    if (broken) {
      // Glass teeth at the bottom and top; a dark empty tube between them.
      const low = 122 - (18 + 12 * Math.abs(Math.sin(x * 0.7)) + 8 * Math.abs(Math.sin(x * 1.9)));
      const high = 5 + 6 * Math.abs(Math.sin(x * 1.3)) + 4 * Math.abs(Math.sin(x * 0.45));
      if (y > low || y < high) {
        const k = 0.75 + murk(x, y) * 0.3 + shine;
        put(p, 120 * k, 176 * k, 150 * k);
        p.h = 0.6;
        return;
      }
      const puddle = y > 112;
      if (puddle) put(p, 40, 110, 70);
      else put(p, 14 + murk(x, y) * 10, 20 + murk(x, y) * 12, 17);
      p.h = 0.1;
      return;
    }
    const c = cover[y * TEX + x]!;
    if (c > 0.5) {
      const k = 0.8 + murk(x, y) * 0.3;
      const m = (c - 0.5) * 2;
      put(p, (96 - 64 * m) * k, (196 - 130 * m) * k, (146 - 96 * m) * k);
      p.h = 0.4;
      return;
    }
    const bubble = hash(Math.floor(x / 3), Math.floor((y + x * 7) / 3), 833) > 0.985;
    const k = 0.72 + murk(x, y) * 0.35 + shine + (bubble ? 0.5 : 0);
    put(p, 96 * k, 196 * k, 146 * k);
    p.h = 0.5;
  });
  // The liquid glows by itself (in the dark halls of the Glow the tubes are visible from afar); the body and hoops don't.
  if (!broken) {
    tex.glow = new Uint8Array(TEX * TEX);
    for (let y = 5; y <= 122; y++) for (let x = 0; x < TEX; x++) if (cover[y * TEX + x]! <= 0.5) tex.glow[y * TEX + x] = 1;
  }
  return tex;
}

function liftShaft(rope: boolean): Texture {
  const frame = painted(761, [74, 80, 86]);
  const leaf = painted(767, [118, 122, 126]);
  const soot = fbm(771, 6, 3);
  // Door edges by height: the left one bent back in the middle, the right one higher up.
  const leftEdge = (y: number) => 30 + 11 * Math.exp(-(((y - 74) / 17) ** 2));
  const rightEdge = (y: number) => 97 - 9 * Math.exp(-(((y - 52) / 20) ** 2));
  const ropeX = (y: number) => 64 + 1.6 * Math.sin(y / 9);
  return build((x, y, p) => {
    // Frame and lintel.
    if (x < 10 || x > 117 || y < 18) {
      const lamp = Math.hypot(x - 64, y - 9) < 5.5;
      if (lamp) {
        // Smashed light fixture: dark red glass with cracks.
        const crack = Math.abs(((x - 64) * 0.8 + (y - 9) * 1.3) % 3) < 0.6 || Math.abs(x - y - 55) < 0.7;
        put(p, crack ? 30 : 92, crack ? 14 : 20, crack ? 14 : 18);
        p.h = 0.85;
        return;
      }
      const rivet = (y < 18 ? (x - 4) % 12 === 0 && (y === 4 || y === 13) : (y - 26) % 16 === 0 && (x === 4 || x === 123));
      frame(x, y, p, rivet ? 1.3 : x === 9 || x === 118 || y === 17 ? 0.45 : 1);
      p.h = rivet ? 1 : 0.9;
      return;
    }
    // Threshold: a steel plate with diagonal yellow-and-black stripes.
    if (y >= 117) {
      const band = Math.floor((x + y) / 7) % 2 === 0;
      if (band) put(p, 196, 156, 44, 0.8 + soot(x, y) * 0.25);
      else put(p, 26, 24, 22);
      p.h = y === 117 ? 0.95 : 0.75;
      return;
    }
    const le = leftEdge(y);
    const re = rightEdge(y);
    // Doors: vertical ribs, a darker (bent) edge, the bottom of the right one torn off.
    if (x < le || (x > re && y < 108)) {
      const edge = x < le ? le - x < 2.2 : x - re < 2.2;
      const rib = (x < le ? x - 10 : x - Math.ceil(re)) % 9 === 4;
      leaf(x, y, p, edge ? 0.38 : rib ? 1.15 : 0.95);
      p.h = edge ? 0.3 : rib ? 0.85 : 0.7;
      return;
    }
    // Rope: tied to the crossbar, hangs down to the threshold; the weave — slanted stripes.
    if (rope) {
      if (y >= 22 && y <= 26 && x >= 26 && x <= 102) {
        frame(x, y, p, y === 22 ? 1.2 : y === 26 ? 0.5 : 0.9);
        p.h = 0.9;
        return;
      }
      const knot = Math.hypot((x - 64) / 1.2, y - 29) < 5.5;
      const cord = Math.abs(x - ropeX(y)) < 2.6 && y > 24;
      if (knot || cord) {
        const twist = (Math.floor(y * 0.9 + x * 1.7) % 5) < 2;
        put(p, 176, 140, 86, twist ? 0.62 : 0.95);
        p.h = 0.85;
        return;
      }
    }
    // Shaft: darkness, slightly lighter at the top; two guide rails with brackets; snapped cables.
    const fall = Math.max(0, 1 - (y - 18) / 70);
    const rail = Math.abs(x - 46) < 1.6 || Math.abs(x - 84) < 1.6;
    const bracket = (y - 20) % 26 < 3 && (Math.abs(x - 46) < 5 || Math.abs(x - 84) < 5);
    const cableA = Math.abs(x - 57) < 0.9 && y < 96;
    const cableB = Math.abs(x - (72 + 6 * Math.sin((y - 18) / 30))) < 0.9 && y < 78;
    const fray = (y >= 96 && y < 101 && Math.abs(x - 57 - (y - 96) * ((x % 3) - 1)) < 0.9) || (y >= 78 && y < 82 && Math.abs(x - 72 - (y - 78) * 0.8) < 0.9);
    let k = 0.06 + fall * 0.16 + soot(x, y) * 0.05;
    if (rail || bracket) k = 0.16 + fall * 0.3;
    if (cableA || cableB || fray) k = 0.22 + fall * 0.25;
    put(p, 120, 122, 126, k);
    p.h = rail || bracket ? 0.35 : cableA || cableB || fray ? 0.3 : 0.02;
  });
}

export function furnitureTextures(): Record<FurnitureTexture, () => Texture> {
  return {
    lockerFront: () => lockerFront(),
    wallLockerFront: () => wallLockerFront(),
    metalSide: () => metalSide(),
    metalTop: () => metalTop(),
    shelfFront: () => shelfFront(),
    woodSide: () => woodSide(),
    woodTop: () => woodTop(),
    deskFront: () => deskFront(),
    tableFront: () => tableFront(),
    feltTop: () => feltTop(),
    crateSide: () => crateSide(),
    crateTop: () => crateTop(),
    chestFront: () => chestFront(),
    chestSide: () => chestSide(),
    chestTop: () => chestTop(),
    fridgeFront: () => fridgeFront(),
    fridgeSide: () => fridgeSide(),
    dresserFront: () => dresserFront(),
    bedSide: () => bedSide(),
    bedTop: () => bedTop(),
    bunkFront: () => bunkFront(),
    slotFront: () => slotFront(),
    slotSide: () => slotSide(),
    sinkFront: () => sinkFront(),
    sinkTop: () => sinkTop(),
    barrelSide: () => barrelSide(),
    barrelTop: () => barrelTop(),
    fireTop: () => fireTop(),
    fabric: () => fabric(),
    poleMetal: () => poleMetal(),
    lampHead: () => lampHead(),
    hydrant: () => hydrant(),
    drawersFront: () => drawersFront(),
    mattressSide: () => mattressSide(),
    panelFront: () => panelFront(),
    stripeLine: () => stripe(false),
    stripeCross: () => stripe(true),
    floorMat: () => floorMat(),
    drain: () => drain(),
    manhole: () => manhole(),
    trapdoor: () => trapdoor(),
    pit: () => pit(),
    policeBoxFront: () => policeBoxFront(),
    policeBoxTop: () => policeBoxTop(),
    policeBoxLamp: () => policeBoxLamp(),
    ventGrille: () => ventGrille(),
    pipeRun: () => pipeRun(),
    wireRun: () => wireRun(),
    glassWindow: () => glassWindow(),
    signStop: () => signStop(),
    signYield: () => signYield(),
    signArrow: () => signArrow(),
    carBody: () => carBody(),
    carCabin: () => carCabin(),
    tire: () => tire(),
    wellStone: () => wellStone(),
    wellTop: () => wellTop(),
    shaftBroken: () => liftShaft(false),
    shaftRope: () => liftShaft(true),
    stairsDown: () => stairsDown(),
    noticeBoard: () => noticeBoard(),
    vendingFront: () => vendingFront(),
    gateBars: () => gateBars(),
    barrierStripe: () => barrierStripe(),
    bridgePlanks: () => bridgePlanks(),
    liftGrate: () => liftGrate(),
    stasisTube: () => stasisTube(false),
    stasisTubeBroken: () => stasisTube(true),
  };
}
