// Drawings for wasteland towns — for "like the original" locations (Shady Sands, Junktown, the Hub, the Boneyard, raiders, vaults,
// the Brotherhood): brown wasteland earth, clean road asphalt, concrete sidewalks, pinkish cement, plank floors; walls of
// planks, dark ruin concrete, old brick, clay plaster, a chain-link fence; greenish vault concrete and slabs,
// the Brotherhood's ribbed steel and dark tiles. Our own drawings in code, nothing from Fallout files.
import { build, cracks, dome, fbm, hash, lerp, noise, put, rng, smooth, TEX, varied, worley, wrap, type Px, type Texture } from './textures.ts';
import { withHoles } from './furniture-textures.ts';

export type TownTexture =
  | 'wasteland'
  | 'road'
  | 'pavement'
  | 'cement'
  | 'planks'
  | 'plankWall'
  | 'darkConcrete'
  | 'oldBrick'
  | 'stucco'
  | 'chainFence'
  | 'chainLink'
  | 'brownConcrete'
  | 'vaultWall'
  | 'vaultFloor'
  | 'ribbedSteel'
  | 'darkTiles'
  | 'carpet'
  | 'brownTile'
  | 'adobeLight'
  | 'adobeRoof'
  | 'adobePost'
  | 'fenceRail'
  | 'fenceTop'
  | 'fenceGate'
  | 'adobeWindow'
  | 'canvas'
  | 'obelisk'
  | 'ruinFacade'
  | 'baseFacade'
  | 'baseGate'
  | 'guardBooth'
  | 'junkPlanks'
  | 'junkSheet'
  | 'junkBraced'
  | 'junkRoof'
  | 'bunkerPanel'
  | 'bunkerPylon'
  | 'bunkerDoor'
  | 'bunkerDome'
  | 'gearFace'
  | 'gearRim'
  | 'vaultSlab'
  | 'hubPanel'
  | 'hubRoof'
  | 'hubParapet'
  | 'hubPlaster'
  | 'palisade'
  | 'wareSiding'
  | 'wareRoof'
  | 'toxicSlime'
  | 'glowPanel'
  | 'glowTile'
  | 'glowGrate'
  | 'glowCeiling'
  | 'baseWall'
  | 'baseFloor';

/** Wasteland earth: brown trampled soil, small pebbles (light and dark), blotches and thin drought cracks. */
function wasteland(): Texture {
  const body = fbm(501, 4, 5);
  const patch = fbm(502, 3, 4);
  const grain = rng(503);
  const crack = cracks(504, 3, 0.009, 0.35);
  const rand = rng(505);
  const stones = Array.from({ length: 48 }, () => ({ x: rand() * TEX, y: rand() * TEX, r: 0.7 + rand() * 1.6, dark: rand() < 0.6 }));
  return build((x, y, p) => {
    const n = body(x, y);
    const m = smooth(0.35, 0.7, patch(x, y));
    const g = grain();
    const c = crack(x, y);
    put(p, lerp(132, 112, m), lerp(104, 88, m), lerp(76, 66, m), (0.72 + n * 0.4 + (g - 0.5) * 0.22) * (1 - c * 0.4));
    p.h = n * 0.45 + g * 0.12 - c * 0.3;
    for (const s of stones) {
      const d = Math.hypot(wrap(x - s.x), wrap(y - s.y));
      if (d >= s.r) continue;
      if (s.dark) put(p, 70, 58, 46, 0.9);
      else put(p, 170, 150, 122, 0.95);
      p.h = 0.6 + dome(d, s.r) * 0.5;
    }
  }, 1.1);
}

/** Road asphalt: dark, fine gravel grain, occasional cracks and patches. */
function road(): Texture {
  const body = fbm(511, 8, 4);
  const crack = cracks(512, 3, 0.008, 0.3);
  const patch = fbm(513, 2, 3);
  const speck = rng(514);
  return build((x, y, p) => {
    const n = body(x, y);
    const s = speck();
    const c = crack(x, y);
    const fix = smooth(0.66, 0.7, patch(x, y));
    const base = lerp(44, 34, fix);
    put(p, base, base, base + 3, (0.8 + n * 0.35 + (s > 0.9 ? 0.45 : 0) - (s < 0.06 ? 0.25 : 0)) * (1 - c * 0.5));
    p.h = 0.55 + n * 0.12 + s * 0.1 - c * 0.4;
  }, 0.9);
}

/** Sidewalk: dark grey concrete slabs (two by two), seams, chips at the edges, dust in the seams. */
function pavement(): Texture {
  const body = fbm(521, 6, 4);
  const crack = cracks(522, 3, 0.01, 0.35);
  const grain = rng(523);
  const chip = fbm(524, 8, 3);
  return build((x, y, p) => {
    const sx = x & 63;
    const sy = y & 63;
    const edge = Math.min(sx, sy, 63 - sx, 63 - sy);
    const seam = 1 - smooth(0.5, 2.5, edge);
    const worn = edge < 6 ? smooth(0.62, 0.72, chip(x, y)) : 0;
    const tone = hash(x >> 6, y >> 6, 521);
    const n = body(x, y);
    const c = crack(x, y);
    const g = grain();
    const k = (0.66 + n * 0.35 + tone * 0.12 + (g - 0.5) * 0.1) * (1 - c * 0.4) * (1 - worn * 0.3);
    put(p, lerp(82, 108, seam), lerp(82, 94, seam), lerp(84, 76, seam), seam > 0.5 ? 0.55 : k);
    p.h = 0.75 + n * 0.12 - seam * 0.4 - worn * 0.35 - c * 0.3;
  }, 0.8);
}

/** Cement (Junktown, basements): pinkish brown, worn grey patches, small chips, thin cracks. */
function cement(): Texture {
  const body = fbm(531, 4, 5);
  const wear = fbm(532, 5, 4);
  const crack = cracks(533, 3, 0.01, 0.5);
  const grain = rng(534);
  const rand = rng(535);
  const pits = Array.from({ length: 26 }, () => ({ x: rand() * TEX, y: rand() * TEX, r: 1 + rand() * 2.5 }));
  return build((x, y, p) => {
    const n = body(x, y);
    const w = smooth(0.55, 0.7, wear(x, y));
    const g = grain();
    const c = crack(x, y);
    put(p, lerp(156, 128, w), lerp(118, 124, w), lerp(104, 122, w), (0.74 + n * 0.3 + (g - 0.5) * 0.12) * (1 - c * 0.5));
    p.h = 0.6 + n * 0.2 - c * 0.35;
    for (const s of pits) {
      const d = Math.hypot(wrap(x - s.x), wrap(y - s.y));
      if (d >= s.r) continue;
      put(p, 96, 92, 90, 0.85);
      p.h = 0.6 - dome(d, s.r) * 0.5;
    }
  }, 1.1);
}

/** Plank floor: dark planks running across, each with its own shade and length, grain, gaps, nail heads at the joints. */
function planks(): Texture {
  const grainN = noise(541, 4, 48);
  const body = fbm(542, 4, 4);
  const grime = fbm(543, 3, 4);
  return build((x, y, p) => {
    const row = y >> 4;
    const by = y & 15;
    const shift = Math.floor(hash(row, 0, 541) * TEX);
    const bx = (x + shift) & (TEX - 1);
    const piece = bx >> 6;
    const joint = bx & 63;
    const gap = by < 1 || joint < 1;
    const tone = hash(row, piece, 542);
    const w = grainN(x, (y + tone * 40) % TEX);
    const n = body(x, y);
    const dirt = smooth(0.55, 0.8, grime(x, y));
    const nail = joint >= 3 && joint <= 4 && (by === 4 || by === 11) ? 1 : 0;
    if (gap) {
      put(p, 22, 16, 12);
      p.h = 0.05;
      return;
    }
    const k = (0.55 + tone * 0.3 + w * 0.25 + n * 0.2) * (1 - dirt * 0.3);
    if (nail) put(p, 120, 116, 108, 0.8);
    else put(p, 92, 68, 50, k);
    p.h = 0.6 + w * 0.15 + nail * 0.3 - (by === 15 ? 0.2 : 0);
  }, 1.1);
}

/** Plank wall (Junktown): grey-brown weathered vertical planks, nailed cross beams at the top and bottom. */
function plankWall(): Texture {
  const grainN = noise(551, 6, 3);
  const fine = noise(552, 64, 6);
  const body = fbm(553, 4, 4);
  const stain = fbm(554, 3, 4);
  return build((x, y, p) => {
    const col = x >> 4;
    const bx = x & 15;
    const tone = hash(col, 0, 551);
    const n = body(x, y);
    const s = smooth(0.58, 0.8, stain(x, y));
    const beam = (y >= 10 && y < 22) || (y >= 104 && y < 116);
    if (beam) {
      const by = y < 64 ? y - 10 : y - 104;
      const nail = (bx === 7 || bx === 8) && (by === 5 || by === 6);
      const k = (0.6 + fine(x, y) * 0.3 + n * 0.2) * (by === 0 ? 1.15 : by === 11 ? 0.6 : 1);
      if (nail) put(p, 60, 56, 52, 0.9);
      else put(p, 122, 78, 52, k);
      p.h = 0.95 - (by === 11 ? 0.3 : 0) - (nail ? 0.2 : 0);
      return;
    }
    const gap = bx === 0;
    const w = grainN(x + tone * 50, y) * 0.5 + fine(x, y + tone * 30) * 0.5;
    const k = gap ? 0.3 : (0.6 + tone * 0.25 + w * 0.3 + n * 0.15) * (1 - s * 0.3);
    put(p, lerp(118, 100, tone), lerp(104, 92, tone), lerp(88, 82, tone), k);
    p.h = gap ? 0.1 : 0.55 + w * 0.2 - (bx === 15 ? 0.15 : 0);
  }, 1.2);
}

/** Dark ruin concrete (the Hub, the Boneyard): rough grey, streaks running down, chips, soot at the bottom. */
function darkConcrete(): Texture {
  const body = fbm(561, 4, 5);
  const rough = noise(562, 64, 64);
  const streak = noise(563, 28, 3);
  const crack = cracks(564, 3, 0.008, 0.4);
  const holes = worley(565, 9);
  const holeMask = fbm(566, 3, 3);
  return build((x, y, p) => {
    const n = body(x, y);
    const r = rough(x, y);
    const st = smooth(0.55, 0.85, streak(x, y)) * (0.4 + y / TEX * 0.6);
    const c = crack(x, y);
    const hw = holes(x, y);
    const hole = smooth(0.7, 0.76, holeMask(x, y)) * (1 - smooth(hw.size * 0.08, hw.size * 0.2, hw.f1));
    const soot = y > 96 ? ((y - 96) / 32) * 0.3 : 0;
    const k = (0.56 + n * 0.38 + r * 0.16) * (1 - st * 0.3) * (1 - c * 0.45) * (1 - hole * 0.45) * (1 - soot);
    put(p, 78, 78, 80, k);
    p.h = 0.6 + n * 0.25 + r * 0.15 - c * 0.35 - hole * 0.5;
  }, 1.4);
}

/**
 * Facade of a ruined high-rise (the Necropolis, the ruins on the way to the Boneyard): grey concrete, per storey — a floor slab and a row of two
 * empty windows per cell (dark holes with ragged edges — the frames are knocked out), streaks, cracks, chipped concrete here and there.
 */
function ruinFacade(): Texture {
  const body = fbm(571, 4, 5);
  const streak = noise(572, 20, 3);
  const crack = cracks(573, 3, 0.01, 0.45);
  const edge = fbm(574, 6, 3);
  const chip = fbm(575, 3, 4);
  return build((x, y, p) => {
    const n = body(x, y);
    let k = 0.58 + n * 0.3;
    let h = 0.65 + n * 0.2;
    let r = 112;
    let g = 110;
    let b = 106;
    // Floor slab: a light band at the top of the storey and a shadow beneath it.
    if (y < 10) {
      k *= 1.12;
      h = 0.8;
    } else if (y < 13) {
      k *= 0.7;
      h = 0.4;
    }
    // Two windows per cell: a ragged edge, darkness inside (the deeper from the edge, the darker).
    const wx = x % 64;
    const inside = Math.min(wx - 12, 51 - wx, y - 26, 97 - y) + (edge(x, y) - 0.5) * 9;
    if (inside > 0) {
      const depth = Math.min(1, inside / 6);
      k = lerp(k * 0.55, 0.07, depth);
      h = 0.05;
      r = 64;
      g = 62;
      b = 60;
    } else {
      const st = smooth(0.55, 0.82, streak(x, y)) * 0.35;
      const c = crack(x, y);
      const ch = smooth(0.68, 0.72, chip(x, y));
      k *= (1 - st) * (1 - c * 0.5) * (1 - ch * 0.4);
      h -= c * 0.3 + ch * 0.4;
    }
    put(p, r, g, b, k);
    p.h = h;
  }, 1.3);
}

/** Old brick: dark red, bricks of different shades, deep dark joints, soot and chipped corners. */
function oldBrick(): Texture {
  const body = fbm(571, 6, 4);
  const soot = fbm(572, 3, 4);
  const chip = fbm(573, 10, 3);
  return build((x, y, p) => {
    const row = y >> 4;
    const shift = (row & 1) * 16;
    const bx = (x + shift) & 31;
    const by = y & 15;
    const mortar = bx < 3 || by < 3;
    const tone = hash(((x + shift) >> 5) & 3, row, 571);
    const n = body(x, y);
    const s = smooth(0.5, 0.8, soot(x, y));
    const broken = !mortar && (bx < 6 || by < 6) && chip(x, y) > 0.66;
    if (mortar || broken) {
      put(p, 64, 56, 50, (0.6 + n * 0.3) * (1 - s * 0.4));
      p.h = broken ? 0.3 : 0.15;
      return;
    }
    put(p, lerp(128, 98, tone), lerp(62, 50, tone), lerp(44, 40, tone), (0.62 + n * 0.4) * (1 - s * 0.45));
    p.h = 0.8 + n * 0.15 - (by === 15 || bx === 31 ? 0.15 : 0);
  }, 1.3);
}

/** Clay plaster (Shady Sands): pinkish brown, smooth, with stains and chips; a dark wooden beam at the top. */
function stucco(): Texture {
  const body = fbm(581, 4, 5);
  const mottle = fbm(582, 6, 4);
  const crack = cracks(583, 2, 0.009, 0.4);
  const chip = fbm(584, 5, 3);
  const wood = noise(585, 6, 48);
  return build((x, y, p) => {
    const n = body(x, y);
    if (y >= 6 && y < 16) {
      const k = (0.5 + wood(x, y) * 0.35) * (y === 6 ? 1.2 : y === 15 ? 0.6 : 1);
      put(p, 70, 50, 38, k);
      p.h = 0.95;
      return;
    }
    const m = mottle(x, y);
    const c = crack(x, y);
    const off = smooth(0.74, 0.8, chip(x, y)) * 0.6;
    const k = (0.72 + n * 0.3 + (m - 0.5) * 0.2) * (1 - c * 0.4) * (1 - off * 0.25) * (y > 104 ? 1 - ((y - 104) / 24) * 0.25 : 1);
    put(p, lerp(140, 124, off), lerp(108, 100, off), lerp(94, 86, off), k);
    p.h = 0.8 + n * 0.12 - c * 0.3 - off * 0.4 - (y === 16 ? 0.3 : 0);
  }, 1.1);
}

/** Chain-link fence: posts at the edges, diagonal chain-link mesh against a dusty haze, barbed wire along the top. */
function chainFence(): Texture {
  const haze = fbm(591, 3, 4);
  const rust = fbm(592, 6, 3);
  return build((x, y, p) => {
    const hz = haze(x, y);
    // Background — the dusty distance behind the mesh.
    put(p, 120, 106, 88, 0.55 + hz * 0.3);
    p.h = 0.2;
    const post = x < 6 || x > TEX - 7;
    if (post) {
      const t = x < 6 ? x : TEX - 1 - x;
      put(p, 96, 92, 88, 0.6 + (t === 1 ? 0.5 : t === 5 ? -0.2 : 0.15));
      p.h = 0.9;
      return;
    }
    // Barbed wire: two lines with barbs at the top.
    if (y === 4 || y === 12 || ((y === 3 || y === 5 || y === 11 || y === 13) && x % 10 === 0)) {
      put(p, 70, 66, 62, 0.9);
      p.h = 0.8;
      return;
    }
    if (y === 20) {
      put(p, 100, 96, 92, 0.85);
      p.h = 0.85;
      return;
    }
    if (y < 20) return;
    const a = ((x + y) % 12 + 12) % 12;
    const b = ((x - y) % 12 + 12) % 12;
    if (a < 1.5 || b < 1.5) {
      const r = smooth(0.6, 0.8, rust(x, y));
      put(p, lerp(138, 120, r), lerp(138, 84, r), lerp(140, 58, r), 0.7 + (a < 1 || b < 1 ? 0.25 : 0));
      p.h = 0.75;
    }
  }, 1);
}

/**
 * See-through chain-link (the fence around the Brotherhood of Steel bunker): posts at the edges, diagonal mesh, a crossbar and barbed
 * wire along the top; holes between the wire — what is behind the fence shows through them.
 */
function chainLink(): Texture {
  const rust = fbm(593, 6, 3);
  const post = (x: number) => x < 6 || x > TEX - 7;
  const barb = (x: number, y: number) => y === 4 || y === 12 || ((y === 3 || y === 5 || y === 11 || y === 13) && x % 10 === 0);
  const mesh = (x: number, y: number) => {
    const a = (((x + y) % 12) + 12) % 12;
    const b = (((x - y) % 12) + 12) % 12;
    return y > 20 && (a < 1.5 || b < 1.5);
  };
  const solid = (x: number, y: number) => post(x) || barb(x, y) || y === 20 || y === TEX - 3 || mesh(x, y);
  const texture = build((x, y, p) => {
    if (post(x)) {
      const t = x < 6 ? x : TEX - 1 - x;
      put(p, 96, 92, 88, 0.6 + (t === 1 ? 0.5 : t === 5 ? -0.2 : 0.15));
      p.h = 0.9;
      return;
    }
    if (barb(x, y)) {
      put(p, 70, 66, 62, 0.9);
      p.h = 0.8;
      return;
    }
    if (y === 20 || y === TEX - 3) {
      put(p, 100, 96, 92, 0.85);
      p.h = 0.85;
      return;
    }
    const r = smooth(0.6, 0.8, rust(x, y));
    put(p, lerp(138, 120, r), lerp(138, 84, r), lerp(140, 58, r), 0.8);
    p.h = 0.75;
  }, 1);
  return withHoles(texture, (x, y) => !solid(x, y));
}

/** Brown concrete of a ruined vault (Vault 15): coarse grey-brown grain, chips, rust streaks, a dark bottom. */
function brownConcrete(): Texture {
  const body = fbm(601, 4, 5);
  const grain = rng(602);
  const rust = noise(603, 20, 3);
  const crack = cracks(604, 3, 0.008, 0.4);
  return build((x, y, p) => {
    const n = body(x, y);
    const g = grain();
    const r = smooth(0.6, 0.85, rust(x, y)) * (0.3 + (y / TEX) * 0.7);
    const c = crack(x, y);
    const k = (0.55 + n * 0.35 + (g - 0.5) * 0.45) * (1 - c * 0.45) * (y > 108 ? 1 - ((y - 108) / 20) * 0.3 : 1);
    put(p, lerp(118, 122, r), lerp(104, 84, r), lerp(94, 62, r), k);
    p.h = 0.6 + n * 0.2 + g * 0.2 - c * 0.35;
  }, 1.3);
}

/**
 * Vault wall (Vaults 13 and 12): smooth greenish-grey concrete in large slabs, thin vertical seams, damp stains
 * and blotches, a dark strip of dirt by the floor.
 */
function vaultWall(): Texture {
  const body = fbm(611, 4, 5);
  const blotch = fbm(612, 6, 4);
  const fine = rng(613);
  const drip = noise(614, 32, 3);
  return build((x, y, p) => {
    const seam = (x & 63) < 2;
    const n = body(x, y);
    const b = smooth(0.55, 0.8, blotch(x, y));
    const d = smooth(0.62, 0.85, drip(x, y)) * (y / TEX);
    const g = fine();
    const dirt = y > 112 ? ((y - 112) / 16) * 0.35 : 0;
    const k = seam ? 0.5 : (0.7 + n * 0.3 + (g - 0.5) * 0.08) * (1 - b * 0.25) * (1 - d * 0.25) * (1 - dirt);
    put(p, lerp(112, 96, b), lerp(126, 108, b), lerp(116, 96, b), k);
    p.h = seam ? 0.2 : 0.75 + n * 0.1 - b * 0.08;
  }, 1);
}

/** Vault floor: smooth grey-green slabs (two by two), thin dark seams, scuffs. */
function vaultFloor(): Texture {
  const body = fbm(621, 4, 5);
  const wear = fbm(622, 5, 4);
  const fine = rng(623);
  return build((x, y, p) => {
    const sx = x & 63;
    const sy = y & 63;
    const seam = sx < 1 || sy < 1;
    const bevel = sx === 1 || sy === 1 ? 1.12 : sx === 63 || sy === 63 ? 0.85 : 1;
    const tone = hash(x >> 6, y >> 6, 621);
    const n = body(x, y);
    const w = smooth(0.6, 0.8, wear(x, y));
    const k = seam ? 0.45 : (0.68 + n * 0.25 + tone * 0.1 + (fine() - 0.5) * 0.06 + w * 0.12) * bevel;
    put(p, 104, 116, 110, k);
    p.h = seam ? 0.2 : 0.7 + n * 0.08;
  }, 0.8);
}

/** Ribbed steel (the Brotherhood): dark brown-black sheets with dense ribs running across, worn light rib edges. */
function ribbedSteel(): Texture {
  const body = fbm(631, 4, 4);
  const scuff = noise(632, 48, 6);
  const rust = fbm(633, 4, 3);
  return build((x, y, p) => {
    const rib = y % 8;
    const plate = (x & 63) < 2;
    const n = body(x, y);
    const r = smooth(0.6, 0.8, rust(x, y));
    const edge = rib === 1 ? 1.5 : rib === 6 ? 0.55 : rib === 7 ? 0.4 : 1;
    const k = plate ? 0.35 : (0.5 + n * 0.3 + scuff(x, y) * 0.2) * edge;
    put(p, lerp(62, 78, r), lerp(52, 50, r), lerp(46, 38, r), k);
    p.h = plate ? 0.1 : rib < 6 ? 0.8 : 0.3;
  }, 1.3);
}

/** Dark tiles (the Brotherhood): small almost black square tiles, slightly lighter joints, glints of worn spots. */
function darkTiles(): Texture {
  const body = fbm(641, 4, 4);
  const wear = fbm(642, 3, 4);
  return build((x, y, p) => {
    const tx = x & 15;
    const ty = y & 15;
    const seam = tx < 1 || ty < 1;
    const tone = hash(x >> 4, y >> 4, 641);
    const n = body(x, y);
    const w = smooth(0.55, 0.8, wear(x, y));
    if (seam) {
      put(p, 70, 60, 54, 0.8);
      p.h = 0.2;
      return;
    }
    put(p, 46, 40, 38, 0.7 + tone * 0.35 + n * 0.25 + w * 0.3);
    p.h = 0.7;
  }, 0.9);
}

/** Carpet (houses in the Hub, vault living quarters): brown pile, fine grain, worn and dark patches. */
function carpet(): Texture {
  const body = fbm(651, 4, 4);
  const worn = fbm(652, 3, 4);
  const fiber = rng(653);
  return build((x, y, p) => {
    const n = body(x, y);
    const w = smooth(0.58, 0.8, worn(x, y));
    const f = fiber();
    put(p, lerp(112, 124, w), lerp(74, 92, w), lerp(56, 72, w), 0.62 + n * 0.3 + (f - 0.5) * 0.3);
    p.h = 0.5 + f * 0.3;
  }, 0.7);
}

/** Brown slab (the Glow, Vaults 12 and 15): mottled grey-brown stone, one slab per cell, dark bevelled edges. */
function brownTile(): Texture {
  const body = fbm(661, 4, 4);
  const speck = rng(662);
  const crack = cracks(663, 3, 0.008, 0.3);
  return build((x, y, p) => {
    const edge = Math.min(x, y, TEX - 1 - x, TEX - 1 - y);
    const bevel = edge < 4 ? 0.55 + edge * 0.08 : 1;
    const n = body(x, y);
    const s = speck();
    const c = crack(x, y);
    put(p, 112, 100, 90, (0.62 + n * 0.3 + (s - 0.5) * 0.4) * bevel * (1 - c * 0.4));
    p.h = (edge < 4 ? edge / 4 : 1) * 0.7 + s * 0.1 - c * 0.3;
  }, 1);
}

/** How to draw each drawing (drawn on first access — addLazyTextures). */
/**
 * Shady Sands adobe (after the original's walls): light pinkish-sandy plaster with small pebbles, a whitewashed
 * top edge, darker and dirtier near the ground, thin cracks.
 */
function adobePaint(seed: number): (x: number, y: number, p: Px) => void {
  const body = fbm(seed, 4, 5);
  const mottle = fbm(seed + 1, 8, 3);
  const crack = cracks(seed + 2, 2, 0.008, 0.3);
  const rand = rng(seed + 3);
  const pebbles = Array.from({ length: 70 }, () => ({ x: rand() * TEX, y: rand() * TEX, r: 0.8 + rand() * 1.5, light: rand() < 0.5 }));
  return (x, y, p) => {
    const n = body(x, y);
    const m = smooth(0.4, 0.75, mottle(x, y));
    const c = crack(x, y);
    const cap = 1 - smooth(14, 22, y);
    const dirt = smooth(96, 126, y) * 0.5;
    const k = (0.82 + n * 0.3 - m * 0.12) * (1 - c * 0.4) * (1 - dirt * 0.25);
    put(p, lerp(188, 214, cap), lerp(160, 192, cap), lerp(136, 168, cap), k);
    p.h = 0.75 + n * 0.2 - c * 0.35 - m * 0.1;
    for (const s of pebbles) {
      const d = Math.hypot(wrap(x - s.x), wrap(y - s.y));
      if (d >= s.r) continue;
      if (s.light) put(p, 205, 180, 155, 0.95);
      else put(p, 140, 118, 98, 0.95);
      p.h = 0.8 + dome(d, s.r) * 0.4;
    }
  };
}

function adobeLight(): Texture {
  return build(adobePaint(531), 0.9);
}

/**
 * Shady Sands fence post (wall pieces with a round top): the same adobe, the post cell slightly taller than the wall (towers in
 * the level), a rounded cap on the projection: lighter in the middle, darker toward the edges; the post's sides are darker too.
 */
function adobePost(): Texture {
  const paint = adobePaint(571);
  return build((x, y, p) => {
    paint(x, y, p);
    const side = 1 - smooth(0, 14, Math.min(x, 127 - x)) * 0.35;
    const capRow = y < 20 ? 0.75 + 0.45 * Math.sin((Math.PI * x) / 128) : 1;
    p.r *= side * capRow;
    p.g *= side * capRow;
    p.b *= side * capRow;
    if (y < 20) p.h += 0.6 * Math.sin((Math.PI * x) / 128);
  }, 0.9);
}

/** Flat roof of an adobe house (after the original's roofs): very light sandy clay, dust patches, occasional pebbles. */
function adobeRoof(): Texture {
  const body = fbm(541, 5, 4);
  const dust = fbm(542, 3, 3);
  const rand = rng(543);
  const grit = Array.from({ length: 90 }, () => ({ x: rand() * TEX, y: rand() * TEX, r: 0.7 + rand() * 1.1 }));
  return build((x, y, p) => {
    const n = body(x, y);
    const d = smooth(0.45, 0.75, dust(x, y));
    put(p, lerp(222, 200, d), lerp(212, 188, d), lerp(190, 164, d), 0.84 + n * 0.26);
    p.h = 0.6 + n * 0.15;
    for (const s of grit) {
      const dd = Math.hypot(wrap(x - s.x), wrap(y - s.y));
      if (dd >= s.r) continue;
      put(p, 150, 134, 112, 0.9);
      p.h = 0.7 + dome(dd, s.r) * 0.3;
    }
  }, 0.6);
}

/** Fence rails: y — from the top of the block to the ground. */
const RAILS = [
  [12, 30],
  [64, 82],
] as const;
const POST_WIDTH = 14;
const onRail = (y: number) => RAILS.some(([a, b]) => y >= a && y < b);

/** Dark dry fence wood. */
function fenceWood(seed: number): (x: number, y: number, p: Px, edge: number) => void {
  const grain = noise(seed, 6, 48);
  return (x, y, p, edge) => {
    const g = grain(x, y);
    put(p, 104, 72, 44, (0.78 + g * 0.3) * (edge < 1 ? 0.6 : 1));
    p.h = 0.55 + g * 0.3 - (edge < 1 ? 0.3 : 0);
  };
}

/** Pen fence from the front: a post on the left and two rails; empty between them — what is behind the fence shows. */
function fenceRail(): Texture {
  const wood = fenceWood(551);
  const texture = build((x, y, p) => {
    const post = x < POST_WIDTH;
    const rail = RAILS.find(([a, b]) => y >= a && y < b);
    const edge = post ? Math.min(x, POST_WIDTH - 1 - x) : rail ? Math.min(y - rail[0], rail[1] - 1 - y) : 9;
    wood(x, y, p, edge);
  }, 0.9);
  return withHoles(texture, (x, y) => x >= POST_WIDTH && !onRail(y));
}

/** Fence from above: the top of the post and the tops of the rails as a strip; the renderer itself rotates the top by the block's front side. */
function fenceTop(): Texture {
  const wood = fenceWood(552);
  const strip = (x: number, y: number) => {
    return y >= 48 && y < 80;
  };
  const texture = build((x, y, p) => {
    const post = x < POST_WIDTH && y < POST_WIDTH;
    const across = y;
    const edge = post ? Math.min(x, y, POST_WIDTH - 1 - x, POST_WIDTH - 1 - y) : Math.min(across - 48, 79 - across);
    wood(x, y, p, edge);
  }, 0.9);
  return withHoles(texture, (x, y) => !(x < POST_WIDTH && y < POST_WIDTH) && !strip(x, y));
}

/** Shady Sands stone monument (after the original's stele): dark rough stone, columns of carved symbols, chips along the edges. */
function obelisk(): Texture {
  const body = fbm(561, 5, 4);
  const chip = fbm(562, 7, 3);
  const rand = rng(563);
  const marks = Array.from({ length: 70 }, () => ({ x: 20 + Math.floor(rand() * 5) * 20, y: 8 + Math.floor(rand() * 28) * 4, w: 3 + Math.floor(rand() * 9), tall: rand() < 0.25 }));
  return build((x, y, p) => {
    const n = body(x, y);
    const c = smooth(0.66, 0.8, chip(x, y));
    const rim = Math.min(x, 127 - x);
    const worn = rim < 4 ? 0.7 : 1;
    put(p, 98, 94, 88, (0.7 + n * 0.4) * (1 - c * 0.3) * worn);
    p.h = 0.7 + n * 0.25 - c * 0.5 - (rim < 4 ? 0.3 : 0);
    for (const m of marks) {
      const inside = m.tall ? x >= m.x && x < m.x + 3 && y >= m.y && y < m.y + 10 : x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + 3;
      if (!inside) continue;
      put(p, 150, 146, 136, 0.9);
      p.h = 0.35 + n * 0.1;
    }
  }, 1.2);
}

/**
 * Brahmin pen gate (after the original's image): a frame of dark beams — two posts, top and bottom crossbars —
 * and two boards crossed diagonally; empty between them, you can see into the pen. The top — as for the fence (fenceTop).
 */
function fenceGate(): Texture {
  const wood = fenceWood(553);
  const RAIL = 12;
  const TOP = 8;
  const BOTTOM = 104;
  const BRACE = 5;
  const inPost = (x: number) => x < POST_WIDTH || x >= TEX - POST_WIDTH;
  const inRail = (y: number) => (y >= TOP && y < TOP + RAIL) || (y >= BOTTOM && y < BOTTOM + RAIL);
  // Diagonals between the crossbars (the inner rectangle of the frame) — distance to the line in points.
  const x1 = POST_WIDTH;
  const x2 = TEX - POST_WIDTH;
  const y1 = TOP + RAIL;
  const y2 = BOTTOM;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const braceDist = (x: number, y: number) => {
    const d1 = Math.abs((y2 - y1) * (x + 0.5) - (x2 - x1) * (y + 0.5) + x2 * y1 - y2 * x1) / len;
    const d2 = Math.abs((y1 - y2) * (x + 0.5) - (x2 - x1) * (y + 0.5) + x2 * y2 - y1 * x1) / len;
    return Math.min(d1, d2);
  };
  const inBox = (x: number, y: number) => x >= x1 && x < x2 && y >= y1 && y < y2;
  const inBrace = (x: number, y: number) => inBox(x, y) && braceDist(x, y) < BRACE;
  const texture = build((x, y, p) => {
    const post = inPost(x);
    const rail = inRail(y);
    const edge = post
      ? Math.min(x < POST_WIDTH ? x : TEX - 1 - x, x < POST_WIDTH ? POST_WIDTH - 1 - x : x - (TEX - POST_WIDTH))
      : rail
        ? Math.min(y < BOTTOM ? y - TOP : y - BOTTOM, y < BOTTOM ? TOP + RAIL - 1 - y : BOTTOM + RAIL - 1 - y)
        : BRACE - braceDist(x, y);
    wood(x, y, p, edge);
  }, 0.9);
  return withHoles(texture, (x, y) => !inPost(x) && !inRail(y) && !inBrace(x, y));
}

/**
 * Adobe with a round window (the original's wall piece with a wheel window): a round hole with a wooden rim and three spokes,
 * you can see through it; around it — the same light adobe, slightly darker at the edge of the hole (depth of the opening).
 */
function adobeWindow(): Texture {
  const paint = adobePaint(591);
  const wood = fenceWood(592);
  const CX = 64;
  const CY = 58;
  const R = 27;
  const RIM = 4;
  const SPOKE = 2.5;
  const dist = (x: number, y: number) => Math.hypot(x + 0.5 - CX, y + 0.5 - CY);
  const onSpoke = (x: number, y: number) => {
    const dx = x + 0.5 - CX;
    const dy = y + 0.5 - CY;
    return [0, Math.PI / 3, (2 * Math.PI) / 3].some((a) => Math.abs(dx * Math.sin(a) - dy * Math.cos(a)) < SPOKE);
  };
  const texture = build((x, y, p) => {
    const d = dist(x, y);
    if (d >= R) {
      paint(x, y, p);
      if (d < R + 3) {
        p.r *= 0.8;
        p.g *= 0.8;
        p.b *= 0.8;
      }
      return;
    }
    // Rim and spokes — dark wood; darker right at the edge of the rim.
    const edge = d >= R - RIM ? Math.min(d - (R - RIM), R - d) : 2;
    wood(x, y, p, edge);
  }, 0.9);
  return withHoles(texture, (x, y) => dist(x, y) < R - RIM && !onSpoke(x, y));
}

/**
 * Tent canvas (tents of the Khans' camp): faded olive-brown fabric, vertical folds, stitched seams,
 * patches of a different shade, dust and dirt at the bottom.
 */
function canvas(): Texture {
  const weave = noise(581, 64, 6);
  const fade = fbm(582, 3, 3);
  const folds = noise(583, 7, 1);
  const grime = fbm(584, 4, 3);
  const rand = rng(585);
  const patches = Array.from({ length: 3 }, () => ({ x: rand() * TEX, y: 20 + rand() * 70, w: 14 + rand() * 18, h: 12 + rand() * 14, dark: rand() < 0.5 }));
  return build((x, y, p) => {
    const f = folds(x, y);
    const shade = 0.78 + f * 0.3;
    const sun = fade(x, y);
    const dirt = smooth(80, 126, y) * 0.35 + smooth(0.6, 0.8, grime(x, y)) * 0.3;
    let r = lerp(118, 142, sun);
    let g = lerp(104, 124, sun);
    let b = lerp(72, 86, sun);
    for (const q of patches) {
      const dx = wrap(x - q.x);
      const dy = y - q.y;
      if (Math.abs(dx) < q.w / 2 && Math.abs(dy) < q.h / 2) {
        const edge = Math.min(q.w / 2 - Math.abs(dx), q.h / 2 - Math.abs(dy));
        const stitch = edge < 2 && ((x + y) & 3) < 2;
        r = q.dark ? 92 : 136;
        g = q.dark ? 80 : 118;
        b = q.dark ? 58 : 80;
        if (stitch) {
          r = 60;
          g = 52;
          b = 40;
        }
      }
    }
    // Panel seams every 32 points — stitching.
    const seam = (x & 31) === 0 || (x & 31) === 1;
    const stitch = seam && (y & 3) < 2;
    const k = (shade + weave(x, y) * 0.08) * (1 - dirt) * (seam ? 0.85 : 1);
    put(p, stitch ? 70 : r, stitch ? 60 : g, stitch ? 44 : b, k);
    p.h = 0.5 + f * 0.3 - (seam ? 0.15 : 0);
  }, 0.6);
}

/**
 * Military Base facade (Mariposa): light sun-bleached concrete in large blocks, thin joints, dark cracks and
 * chips, streaks at the bottom; per cell — a dark metal lamp box with light glass.
 */
function baseFacade(): Texture {
  const body = fbm(801, 4, 5);
  const grain = rng(802);
  const crack = cracks(803, 3, 0.011, 0.55);
  const chip = fbm(804, 7, 3);
  const streak = noise(805, 24, 3);
  return build((x, y, p) => {
    const n = body(x, y);
    const g = grain();
    const c = crack(x, y);
    const ch = smooth(0.7, 0.74, chip(x, y));
    const st = smooth(0.6, 0.85, streak(x, y)) * smooth(40, 128, y) * 0.25;
    // 64×32 blocks, joints thin and slightly darker.
    const seam = (y & 31) < 2 || ((x + ((y >> 5) & 1) * 32) & 63) < 2;
    let k = (0.82 + n * 0.22 + (g - 0.5) * 0.08) * (1 - c * 0.6) * (1 - st) * (seam ? 0.82 : 1);
    let r = 196;
    let gr = 192;
    let b = 184;
    // Chips: dark grey concrete under the chipped layer.
    if (ch > 0.5) {
      r = 104;
      gr = 100;
      b = 96;
      k = 0.75 + n * 0.2;
    }
    p.h = 0.75 + n * 0.12 - c * 0.4 - ch * 0.45 - (seam ? 0.2 : 0);
    // Lamp: a 24×26 box at the top of the block, a light edge at the top, yellowish glass at the bottom.
    const lx = x - 52;
    const ly = y - 22;
    if (lx >= 0 && lx < 24 && ly >= 0 && ly < 26) {
      const edge = lx === 0 || lx === 23 || ly === 0 || ly === 25;
      r = 46;
      gr = 46;
      b = 50;
      k = edge ? 0.6 : 0.8 + (ly < 3 ? 0.4 : 0);
      if (ly >= 16 && ly < 22 && lx >= 4 && lx < 20) {
        r = 214;
        gr = 200;
        b = 140;
        k = 0.85;
      }
      p.h = edge ? 0.7 : 0.95;
    }
    put(p, r, gr, b, k);
  }, 1.2);
}

/** Military Base gate: a lattice of crossed steel bars over darkness, in a thick rust-orange frame. */
function baseGate(): Texture {
  const rust = fbm(811, 6, 3);
  const body = fbm(812, 4, 4);
  return build((x, y, p) => {
    const r = smooth(0.4, 0.8, rust(x, y));
    const n = body(x, y);
    const frame = x < 12 || x > TEX - 13 || y < 10;
    if (frame) {
      // Frame: brown rust, lighter at the inner edge.
      const inner = x === 11 || x === TEX - 12 || y === 9;
      put(p, lerp(118, 92, r), lerp(56, 44, r), lerp(36, 30, r), (0.7 + n * 0.3) * (inner ? 1.25 : 1));
      p.h = inner ? 0.9 : 0.8;
      return;
    }
    // Lattice: bars every 12 points, diagonal; dark depth behind it.
    const a = (((x + y) % 12) + 12) % 12;
    const b = (((x - y) % 12) + 12) % 12;
    const bar = a < 2.5 || b < 2.5;
    const rail = (y - 10) % 39 < 3;
    if (bar || rail) {
      put(p, lerp(84, 92, r), lerp(84, 64, r), lerp(88, 50, r), 0.75 + n * 0.25 + (a < 1 || b < 1 ? 0.2 : 0));
      p.h = 0.8;
    } else {
      put(p, 16, 16, 18, 0.9);
      p.h = 0.05;
    }
  }, 1.2);
}

/** Guard booth: grey-green painted metal sheets with rivets, a dark window at the top, peeling paint. */
function guardBooth(): Texture {
  const body = fbm(821, 4, 4);
  const peel = fbm(822, 8, 3);
  return build((x, y, p) => {
    const n = body(x, y);
    const off = smooth(0.66, 0.7, peel(x, y));
    const sheet = (x & 63) < 2 || y === 96 || y === 97;
    const rivet = ((x & 63) === 5 || (x & 63) === 58) && (y & 15) === 8;
    let k = (0.7 + n * 0.25) * (sheet ? 0.6 : 1) * (rivet ? 1.3 : 1);
    put(p, off ? 112 : 92, off ? 100 : 104, off ? 88 : 86, k);
    p.h = 0.7 + n * 0.1 - (sheet ? 0.3 : 0) + (rivet ? 0.3 : 0);
    // Framed window: dark glass reflecting the sky.
    if (x >= 14 && x < 114 && y >= 18 && y < 62) {
      const edge = x < 18 || x >= 110 || y < 22 || y >= 58;
      if (edge) {
        put(p, 60, 62, 58, 0.9);
        p.h = 0.9;
      } else {
        const glint = smooth(0, 1, 1 - Math.abs((x - y * 0.8 - 30) % 60) / 8);
        k = 0.5 + glint * 0.25;
        put(p, 40, 52, 60, k);
        p.h = 0.1;
      }
    }
  }, 1);
}

/**
 * Junktown plank wall (like the original's ja* pieces): dark weathered vertical planks of different widths, gaps,
 * a crossbar with a diagonal brace, rusty tin patches on nails, dirt near the ground.
 */
function junkPlanks(): Texture {
  const grainN = noise(831, 6, 64);
  const body = fbm(832, 4, 4);
  const rust = fbm(833, 5, 3);
  const rand = rng(834);
  const edges = [0];
  while (edges[edges.length - 1]! < TEX) edges.push(edges[edges.length - 1]! + 14 + Math.floor(rand() * 12));
  const patches = Array.from({ length: 2 }, () => ({ x: 10 + rand() * 90, y: 30 + rand() * 60, w: 18 + rand() * 16, h: 14 + rand() * 14 }));
  return build((x, y, p) => {
    const b = edges.findIndex((e) => e > x) - 1;
    const left = edges[b] ?? 0;
    const seam = x - left < 2;
    const tone = hash(b, 0, 831);
    const n = body(x, y);
    // Planks: dark grey-brown wood, grain running lengthwise.
    let r = lerp(86, 68, tone);
    let g = lerp(70, 58, tone);
    let bl = lerp(56, 50, tone);
    let k = (0.62 + grainN(x, y) * 0.3 + n * 0.2) * (seam ? 0.35 : 1);
    let h = seam ? 0.1 : 0.7 + grainN(x, y) * 0.2;
    // Crossbar and diagonal brace.
    const rail = y >= 56 && y < 66;
    const brace = Math.abs(((x - y * 0.9) % 128 + 128) % 128 - 64) < 5 && y > 66 && y < 120;
    if (rail || brace) {
      r = 92;
      g = 76;
      bl = 60;
      k = 0.75 + n * 0.2;
      h = 0.95;
    }
    // Rusty tin patches, nails at the corners.
    for (const q of patches) {
      const dx = wrap(x - q.x);
      const dy = y - q.y;
      if (dx >= 0 && dx < q.w && dy >= 0 && dy < q.h) {
        const rr = smooth(0.35, 0.75, rust(x, y));
        r = lerp(110, 132, rr);
        g = lerp(96, 64, rr);
        bl = lerp(88, 42, rr);
        k = 0.7 + n * 0.25;
        h = 0.85;
        const nail = (dx < 3 || dx > q.w - 3) && (dy < 3 || dy > q.h - 3);
        if (nail) k = 0.35;
      }
    }
    const dirt = smooth(104, 128, y) * 0.35;
    put(p, r, g, bl, k * (1 - dirt));
    p.h = h;
  }, 1.2);
}

/**
 * Junktown rusty corrugated iron (jb*, jc* pieces): vertical sheet ribs, grey-brown steel, rust streaks and blotches,
 * a riveted sheet joint, darker near the ground.
 */
function junkSheet(): Texture {
  const rust = fbm(841, 5, 4);
  const streak = noise(842, 16, 2);
  const body = fbm(843, 4, 4);
  const holes = fbm(844, 9, 3);
  return build((x, y, p) => {
    // Ribs large and soft (every 16 points): small ones shimmer in stripes from afar.
    const rib = Math.sin((x / 16) * Math.PI * 2);
    const n = body(x, y);
    const rr = smooth(0.38, 0.72, rust(x, y) + smooth(0.6, 0.9, streak(x, y)) * 0.25);
    const seam = (y & 63) < 2;
    const rivet = (y & 63) === 4 && (x & 15) === 4;
    let k = (0.64 + rib * 0.1 + n * 0.22) * (seam ? 0.55 : 1) * (rivet ? 1.4 : 1);
    const hole = smooth(0.76, 0.8, holes(x, y));
    if (hole > 0.5) k *= 0.25;
    put(p, lerp(118, 128, rr), lerp(108, 66, rr), lerp(100, 44, rr), k * (1 - smooth(100, 128, y) * 0.3));
    p.h = 0.55 + rib * 0.3 - (seam ? 0.3 : 0) - hole * 0.5;
  }, 1.3);
}

/** Junktown patchwork wall (jd* pieces): overlapping sheets with different rust, boards crossed diagonally, dark gaps. */
function junkBraced(): Texture {
  const body = fbm(851, 4, 4);
  const rust = fbm(852, 6, 3);
  return build((x, y, p) => {
    const n = body(x, y);
    const panel = hash(x >> 5, y >> 6, 851);
    const rr = smooth(0.35, 0.75, rust(x, y));
    let r = panel < 0.5 ? lerp(112, 130, rr) : 84;
    let g = panel < 0.5 ? lerp(100, 66, rr) : 70;
    let b = panel < 0.5 ? lerp(92, 44, rr) : 58;
    let k = 0.62 + n * 0.3;
    let h = 0.6 + n * 0.15;
    if ((x & 31) < 2 || (y & 63) < 2) {
      k *= 0.4;
      h = 0.1;
    }
    // Boards crossed diagonally over the sheets.
    const d1 = Math.abs(((x - y) % 64 + 64) % 64 - 32) < 4;
    const d2 = Math.abs(((x + y) % 64 + 64) % 64 - 32) < 4;
    if ((d1 || d2) && y > 20 && y < 116) {
      r = 92;
      g = 74;
      b = 58;
      k = 0.72 + n * 0.2;
      h = 0.95;
    }
    put(p, r, g, b, k);
    p.h = h;
  }, 1.2);
}

/** Junktown roof: overlapping rusty corrugated iron, ribs running across, grey-orange, light glints on the ribs. */
function junkRoof(): Texture {
  const rust = fbm(861, 4, 4);
  const body = fbm(862, 6, 3);
  return build((x, y, p) => {
    // Ribs every 32 points, faint: they don't shimmer either on the roof or from below (the ceiling under the roof).
    const rib = Math.sin((y / 32) * Math.PI * 2);
    const n = body(x, y);
    const rr = smooth(0.4, 0.7, rust(x, y));
    const lap = (x & 63) < 2;
    put(p, lerp(124, 136, rr), lerp(116, 84, rr), lerp(110, 64, rr), (0.62 + rib * 0.08 + n * 0.22) * (lap ? 0.7 : 1));
    p.h = 0.6 + rib * 0.2 - (lap ? 0.3 : 0);
  }, 1);
}

/**
 * Brotherhood of Steel bunker walls (like the original's st0* pieces): dark brown steel panels with dense horizontal
 * ribs, seams between sheets, rust streaks, a light edge at the top, dust near the ground.
 */
function bunkerPanel(): Texture {
  const body = fbm(841, 4, 4);
  const rust = fbm(842, 6, 3);
  const grain = rng(843);
  return build((x, y, p) => {
    const n = body(x, y);
    const r = smooth(0.55, 0.8, rust(x, y));
    const g = grain();
    const rib = y % 8;
    const seam = (x & 63) < 2;
    if (y < 6) {
      put(p, 104, 100, 94, 0.8 + n * 0.3 - (y === 5 ? 0.3 : 0));
      p.h = 0.9;
      return;
    }
    // Rib: a light top, a dark shadow beneath it.
    const lift = rib === 0 ? 0.35 : rib === 1 ? 0.15 : rib === 7 ? -0.3 : 0;
    const dust = smooth(100, 127, y) * 0.35;
    const k = (0.62 + n * 0.3 + lift + (g - 0.5) * 0.08) * (seam ? 0.55 : 1);
    put(p, lerp(lerp(54, 86, r), 112, dust), lerp(lerp(38, 48, r), 94, dust), lerp(lerp(31, 30, r), 72, dust), k);
    p.h = 0.6 + (rib < 2 ? 0.25 : rib === 7 ? -0.2 : 0) - (seam ? 0.3 : 0) + n * 0.1;
  }, 1);
}

/**
 * Corner buttress of the bunker over its full height (the image is stretched over PYLON_STOREYS storeys): grey cast concrete with
 * vertical streaks and dark bevelled edges, orange rust and dirt at the bottom, at the top — a dark steel
 * cap with a ring, two pipes down the side (like the original's st3* supports, slightly taller than the bunker walls).
 */
function bunkerPylon(): Texture {
  const body = fbm(851, 5, 4);
  const streak = noise(852, 24, 2);
  const grain = rng(853);
  return build((x, y, p) => {
    const n = body(x, y);
    if (y < 18) {
      const ring = y > 11 && y < 15;
      put(p, 84, 86, 90, (0.7 + n * 0.3) * (ring ? 1.3 : 1) * (y < 2 ? 1.25 : 1));
      p.h = ring ? 0.95 : 0.8;
      return;
    }
    if (((x >= 96 && x < 101) || (x >= 105 && x < 109)) && y < 96) {
      put(p, 46, 44, 42, x === 96 || x === 105 ? 1.4 : 1);
      p.h = 0.9;
      return;
    }
    const s = streak(x, y * 0.08);
    const g = grain();
    const edge = Math.min(x, TEX - 1 - x);
    const bevel = edge < 10 ? 0.7 + edge * 0.03 : 1;
    const rust = smooth(88, 126, y) * (0.6 + n * 0.5);
    const k = (0.72 + n * 0.25 + (s - 0.5) * 0.18 + (g - 0.5) * 0.08) * bevel;
    put(p, lerp(132, 150, rust), lerp(130, 96, rust), lerp(126, 62, rust), k);
    p.h = 0.6 + n * 0.2 + (edge < 10 ? -0.25 + edge * 0.025 : 0);
  }, 1);
}
/** Buttress height (storeys): the image is stretched over all of it. */
export const PYLON_STOREYS = 1.4;
/**
 * Bunker door: in a dark steel frame — a big round blast door, light steel, rings, bolts around the edge, in
 * the middle — a hub with a wheel.
 */
function bunkerDoor(): Texture {
  const body = fbm(861, 4, 3);
  const cx = TEX / 2;
  const cy = TEX / 2 + 4;
  return build((x, y, p) => {
    const n = body(x, y);
    const d = Math.hypot(x - cx, y - cy);
    const a = Math.atan2(y - cy, x - cx);
    if (d > 56) {
      // Frame: dark steel, a light edge at the opening.
      put(p, 58, 58, 62, (0.7 + n * 0.3) * (d < 59 ? 0.55 : 1));
      p.h = d < 59 ? 0.2 : 0.85;
      return;
    }
    const bolt = d > 47 && d < 53 && Math.abs(((a / (Math.PI * 2)) * 16 + 16) % 1 - 0.5) < 0.14;
    const ring = (d > 52 && d < 56) || (d > 38 && d < 41) || (d > 13 && d < 16);
    const spoke = d < 30 && d > 10 && Math.abs(((a / (Math.PI * 2)) * 4 + 4.125) % 1 - 0.5) < 0.05;
    const hub = d < 10;
    let k = 0.78 + n * 0.2 - d * 0.002;
    if (ring) k *= 0.62;
    if (bolt || spoke || hub) k *= 1.25;
    put(p, 150, 152, 156, k);
    p.h = 0.55 + (ring ? -0.3 : 0) + (bolt || spoke || hub ? 0.35 : 0) + (d < 38 ? 0.12 : 0);
  }, 1.2);
}

/** Dome on the bunker roof: grey steel sheets, riveted ring seams, darker toward the bottom. */
function bunkerDome(): Texture {
  const body = fbm(871, 4, 4);
  const grain = rng(872);
  return build((x, y, p) => {
    const n = body(x, y);
    const g = grain();
    const seam = y % 32 < 2 || (x & 31) < 1;
    const rivet = y % 32 === 4 && (x & 7) === 3;
    const k = (0.72 + n * 0.25 + (g - 0.5) * 0.08 - (y / TEX) * 0.12) * (seam ? 0.6 : 1) * (rivet ? 1.35 : 1);
    put(p, 120, 122, 126, k);
    p.h = 0.6 + n * 0.15 - (seam ? 0.3 : 0) + (rivet ? 0.3 : 0);
  }, 1);
}
/**
 * A torn-off vault blast door lying on the floor (Vault 15) — top: a rusty steel disc, ring grooves, bolts around
 * the circle, a hub, dents and soot; teeth around the edge (the floor between them).
 */
function gearFace(): Texture {
  const rust = fbm(881, 5, 4);
  const soot = fbm(882, 3, 3);
  const c = TEX / 2;
  const face = build((x, y, p) => {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    const a = Math.atan2(y + 0.5 - c, x + 0.5 - c);
    const r = smooth(0.45, 0.75, rust(x, y));
    const s = smooth(0.55, 0.8, soot(x, y));
    const groove = Math.abs(d - 50) < 1.5 || Math.abs(d - 37) < 1.2 || Math.abs(d - 22) < 1.2;
    const bolt = Math.abs(d - 44) < 2.4 && Math.abs(((a / (Math.PI * 2)) * 12 + 12) % 1 - 0.5) < 0.09;
    const hub = d < 10;
    const tooth = d >= 54;
    let k = (0.7 + (1 - r) * 0.15) * (groove ? 0.55 : 1) * (bolt || hub ? 1.3 : 1) * (1 - s * 0.45) * (tooth ? 0.85 : 1);
    put(p, lerp(120, 132, r), lerp(118, 74, r), lerp(116, 46, r), k);
    p.h = 0.6 + (groove ? -0.35 : 0) + (bolt || hub ? 0.35 : 0) + (tooth ? 0.1 : 0);
  }, 1.2);
  return withHoles(face, (x, y) => {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    if (d >= 63.5) return true;
    if (d < 54) return false;
    const a = Math.atan2(y + 0.5 - c, x + 0.5 - c);
    return ((a / (Math.PI * 2)) * 14 + 14) % 1 >= 0.55;
  });
}

/** Side of the lying blast door: rusty steel, teeth around the circle — light bumps and dark hollows. */
function gearRim(): Texture {
  const rust = fbm(886, 6, 3);
  return build((x, y, p) => {
    const r = smooth(0.45, 0.75, rust(x, y));
    const tooth = (x & 15) < 9;
    put(p, lerp(118, 128, r), lerp(116, 70, r), lerp(114, 44, r), tooth ? 0.85 : 0.4);
    p.h = tooth ? 0.8 : 0.2;
  }, 1.2);
}

/** Concrete slab of a vault entrance in the rock (like the original's st v13secr4 wall): light brown concrete, streaks, chips, cracks. */
function vaultSlab(): Texture {
  const body = fbm(891, 4, 5);
  const stain = noise(892, 20, 3);
  const crack = cracks(893, 3, 0.009, 0.4);
  const grain = rng(894);
  return build((x, y, p) => {
    const n = body(x, y);
    const s = smooth(0.55, 0.85, stain(x, y * 0.3));
    const c = crack(x, y);
    const g = grain();
    put(p, lerp(146, 104, s), lerp(128, 90, s), lerp(100, 72, s), (0.7 + n * 0.3 + (g - 0.5) * 0.1) * (1 - c * 0.45));
    p.h = 0.6 + n * 0.25 - c * 0.35 + (g - 0.5) * 0.05;
  }, 1);
}

/**
 * Houses of the Hub (like the original's nec* pieces from outside): dark grey concrete panels — two bays per cell, raised
 * grooved pilasters between them, a recessed chamfered rectangle in each bay; a shadowed cornice at the top, a dusty plinth at
 * the bottom; soot running down from the cornice, cracks, chips.
 */
function hubPanel(): Texture {
  const body = fbm(1201, 4, 5);
  const rough = noise(1202, 64, 64);
  const streak = noise(1203, 24, 3);
  const crack = cracks(1204, 3, 0.008, 0.35);
  const chip = fbm(1205, 9, 3);
  return build((x, y, p) => {
    const n = body(x, y);
    const r = rough(x, y);
    const bx = x & 63;
    const pil = bx < 10;
    const st = smooth(0.55, 0.85, streak(x, y)) * (1 - y / TEX * 0.5);
    const c = crack(x, y);
    const ch = smooth(0.79, 0.84, chip(x, y));
    let k = 0.6 + n * 0.32 + r * 0.14;
    let h = 0.6 + n * 0.2 + r * 0.12;
    if (y < 10) {
      // Cornice: lighter and projecting, a shadow beneath.
      k *= y === 9 ? 0.55 : 1.18;
      h = y === 9 ? 0.4 : 0.95;
    } else if (y < 13) {
      k *= 0.62;
      h = 0.3;
    } else if (y >= 114) {
      // Plinth: darker, dust near the ground.
      k *= y === 114 ? 1.12 : 0.8;
      h = 0.7;
    } else if (pil) {
      const groove = bx === 4 || bx === 5;
      k *= groove ? 0.62 : bx === 0 ? 1.15 : bx === 9 ? 0.7 : 1.1;
      h = groove ? 0.55 : 0.9;
    } else if (bx >= 15 && bx < 59 && y >= 20 && y < 106) {
      // Shallow panel: shadow at the top and left, a light chamfer at the bottom and right; the middle slightly darker than the wall.
      const top = y < 22 || bx < 17;
      const low = y >= 104 || bx >= 57;
      k *= top ? 0.7 : low ? 1.08 : 0.92;
      h = top || low ? 0.5 : 0.45;
    }
    const soot = y >= 114 ? 0 : st * 0.32;
    k *= (1 - soot) * (1 - c * 0.45) * (1 - ch * 0.35);
    const dust = y >= 114 ? (y - 114) / 14 : 0;
    put(p, lerp(76, 98, dust), lerp(76, 88, dust), lerp(80, 74, dust), k);
    p.h = h - c * 0.35 - ch * 0.3;
  }, 1.3);
}

/** Underside of the Hub houses' roof (the ceiling inside): dark concrete floor slabs with seams, occasional streaks. */
function hubRoof(): Texture {
  const body = fbm(1211, 4, 5);
  const rough = noise(1212, 64, 64);
  const stain = fbm(1213, 3, 4);
  return build((x, y, p) => {
    const n = body(x, y);
    const r = rough(x, y);
    const seamH = (y & 63) === 63;
    const seamV = ((x + ((y >> 6) & 1) * 32) & 63) === 0;
    const st = smooth(0.62, 0.8, stain(x, y));
    const k = (0.6 + n * 0.3 + r * 0.12) * (seamH || seamV ? 0.55 : 1) * (1 - st * 0.22);
    put(p, lerp(80, 74, st), lerp(80, 72, st), lerp(82, 68, st), k);
    p.h = 0.6 + n * 0.2 + r * 0.1 - (seamH || seamV ? 0.3 : 0);
  }, 1.1);
}

/**
 * Top of the Hub houses' facade (the roof storey above the wall): smooth dark parapet concrete, a floor slab band in the middle,
 * a cornice at the top, and above it dry grass and weeds from the roof (grass grows on the original's roofs); soot from the cornice.
 */
function hubParapet(): Texture {
  const body = fbm(1261, 4, 5);
  const rough = noise(1262, 64, 64);
  const streak = noise(1263, 24, 3);
  const crack = cracks(1264, 3, 0.008, 0.3);
  const tuft = noise(1265, 64, 1);
  const rand = rng(1266);
  const blades = Array.from({ length: 70 }, () => ({ x: rand() * TEX, h: 4 + rand() * 14, lean: (rand() - 0.5) * 0.9, dry: rand() }));
  return build((x, y, p) => {
    const n = body(x, y);
    const r = rough(x, y);
    const st = smooth(0.55, 0.85, streak(x, y)) * (y < 40 ? 1 : 0.6);
    const c = crack(x, y);
    // Grass above the cornice: stalks from behind the roof edge, thicker where there's a tuft.
    const thick = tuft(x, 0);
    if (y < 22) {
      for (const b of blades) {
        if (b.dry > thick + 0.35) continue;
        const top = 22 - b.h * (0.6 + thick * 0.6);
        if (y < top) continue;
        const bx = b.x + (22 - y) * b.lean;
        if (Math.abs(wrap(x - bx)) < 0.9) {
          put(p, lerp(92, 128, b.dry), lerp(98, 108, b.dry), lerp(48, 70, b.dry), 0.7 + (22 - y) / 40);
          p.h = 0.9;
          return;
        }
      }
      put(p, 40, 38, 34, 0.5);
      p.h = 0.05;
      return;
    }
    let k = 0.58 + n * 0.3 + r * 0.14;
    let h = 0.6 + n * 0.2 + r * 0.1;
    if (y < 30) {
      // Cornice.
      k *= y === 29 ? 0.55 : 1.16;
      h = y === 29 ? 0.45 : 0.95;
    } else if (y >= 74 && y < 80) {
      // Floor slab band.
      k *= y === 74 ? 1.1 : y === 79 ? 0.6 : 0.95;
      h = 0.8;
    }
    k *= (1 - st * 0.3) * (1 - c * 0.45);
    put(p, 76, 76, 80, k);
    p.h = h - c * 0.35;
  }, 1.3);
}

/** Partitions in the Hub houses (the original's nec09x–12x pieces): light grey plaster, fine grain, chips down to the concrete. */
function hubPlaster(): Texture {
  const body = fbm(1221, 4, 4);
  const grain = rng(1222);
  const crack = cracks(1223, 3, 0.007, 0.35);
  const chip = fbm(1224, 8, 3);
  const dirt = fbm(1225, 3, 3);
  return build((x, y, p) => {
    const n = body(x, y);
    const g = grain();
    const c = crack(x, y);
    const ch = smooth(0.8, 0.84, chip(x, y));
    const d = smooth(0.5, 0.8, dirt(x, y)) * 0.25 + (y > 108 ? ((y - 108) / 20) * 0.3 : 0);
    put(p, lerp(136, 82, ch), lerp(134, 82, ch), lerp(128, 84, ch), (0.78 + n * 0.22 + (g - 0.5) * 0.1) * (1 - c * 0.45) * (1 - d));
    p.h = 0.6 + n * 0.15 - ch * 0.35 - c * 0.3;
  }, 0.9);
}

/**
 * Palisade at the entrance to the Hub (the original's tfenc* pieces): round vertical logs (eight per cell), grey-brown weathered
 * wood with grain, dark gaps, two wire bindings; the log tops are sharpened (a dark gap above them).
 */
function palisade(): Texture {
  const grainN = noise(1231, 8, 24);
  const fine = noise(1232, 32, 64);
  const body = fbm(1233, 4, 4);
  const rot = fbm(1234, 6, 3);
  return build((x, y, p) => {
    const log = x >> 4;
    const u = ((x & 15) + 0.5) / 16;
    const tone = hash(log, 0, 1231);
    const tip = 4 + Math.floor(tone * 5);
    // Sharpened top: a gap above the point.
    if (y < tip + 6 && Math.abs(u - 0.5) > ((y - tip) / 6) * 0.5) {
      put(p, 34, 30, 26, 0.6);
      p.h = 0;
      return;
    }
    const round = Math.sin(u * Math.PI);
    const gap = (x & 15) === 0;
    const band = (y >= 30 && y < 34) || (y >= 94 && y < 98);
    const w = grainN(x, y) * 0.55 + fine(x, y) * 0.45;
    const rr = smooth(0.62, 0.8, rot(x, y));
    if (band && !gap) {
      put(p, 92, 84, 76, 0.7 + round * 0.4);
      p.h = 1;
      return;
    }
    const k = gap ? 0.25 : (0.42 + round * 0.5 + w * 0.22 + body(x, y) * 0.12) * (1 - rr * 0.3);
    put(p, lerp(124, 108, tone), lerp(104, 98, tone), lerp(84, 86, tone), k * (y > 116 ? 0.8 : 1));
    p.h = gap ? 0 : 0.35 + round * 0.55 + w * 0.1;
  }, 1.3);
}

/** Warehouses of the Hub's old town (the original's ware* pieces): dark vertical ribbed cladding, rust streaks, a riveted seam. */
function wareSiding(): Texture {
  const rust = fbm(1241, 5, 4);
  const streak = noise(1242, 20, 3);
  const body = fbm(1243, 4, 4);
  return build((x, y, p) => {
    const rib = Math.sin(((x & 15) / 16) * Math.PI * 2);
    const n = body(x, y);
    const rr = smooth(0.45, 0.75, rust(x, y) * 0.7 + smooth(0.55, 0.9, streak(x, y)) * 0.45);
    const seam = y === 62 || y === 63;
    const rivet = y === 66 && (x & 15) === 8;
    const k = (0.55 + rib * 0.12 + n * 0.25) * (seam ? 0.5 : 1) * (rivet ? 1.5 : 1) * (y > 116 ? 0.78 : 1);
    put(p, lerp(84, 112, rr), lerp(76, 70, rr), lerp(70, 46, rr), k);
    p.h = 0.55 + rib * 0.3 - (seam ? 0.3 : 0) + (rivet ? 0.3 : 0);
  }, 1.2);
}

/** Flat warehouse roof: black roofing felt in overlapping strips, patches, a galvanized edge at the top. */
function wareRoof(): Texture {
  const body = fbm(1251, 5, 4);
  const patch = fbm(1252, 3, 3);
  const grain = rng(1253);
  return build((x, y, p) => {
    const n = body(x, y);
    const lap = (y & 31) === 31;
    const pt = smooth(0.66, 0.7, patch(x, y));
    const g = grain();
    if (y < 6) {
      put(p, 110, 112, 114, y === 5 ? 0.55 : 0.8 + n * 0.2);
      p.h = 0.9;
      return;
    }
    put(p, lerp(44, 58, pt), lerp(42, 54, pt), lerp(40, 50, pt), (0.7 + n * 0.3 + (g - 0.5) * 0.12) * (lap ? 0.6 : 1));
    p.h = 0.55 + n * 0.12 + (lap ? 0.2 : 0);
  }, 0.8);
}

/**
 * Toxic sludge (the moat around the arms dealers' warehouse in the Boneyard, the original's slime* tiles): bright green, with dark
 * swirls, bubbles and light foam at the bubble edges.
 */
function toxicSlime(): Texture {
  const body = fbm(1281, 4, 4);
  const swirl = fbm(1282, 6, 3);
  const rand = rng(1283);
  const bubbles = Array.from({ length: 40 }, () => ({ x: rand() * TEX, y: rand() * TEX, r: 1.2 + rand() * 3.2 }));
  return build((x, y, p) => {
    const n = body(x, y);
    const sw = smooth(0.45, 0.65, swirl(x + n * 18, y - n * 12));
    put(p, lerp(70, 34, sw), lerp(170, 110, sw), lerp(48, 30, sw), 0.72 + n * 0.32);
    p.h = 0.4 + n * 0.2;
    for (const b of bubbles) {
      const d = Math.hypot(wrap(x - b.x), wrap(y - b.y));
      if (d >= b.r) continue;
      const rim = d > b.r - 0.9;
      put(p, rim ? 170 : 96, rim ? 230 : 196, rim ? 130 : 70, rim ? 1 : 0.95);
      p.h = 0.5 + dome(d, b.r) * 0.5;
    }
  }, 0.7);
}

/**
 * Walls of the Glow (the original's dv* pieces): pinkish-brown vertical concrete slabs, four per cell, each with its own shade;
 * between slabs — a dark seam with a light edge; blotches, rust streaks from the ceiling, a dark plinth by the floor.
 */
function glowPanel(): Texture {
  const body = fbm(1291, 4, 5);
  const mottle = fbm(1292, 8, 3);
  const streak = noise(1293, 32, 3);
  const crack = cracks(1294, 3, 0.007, 0.3);
  return build((x, y, p) => {
    const slab = x >> 5;
    const bx = x & 31;
    const tone = hash(slab, 0, 1291);
    const n = body(x, y);
    const m = mottle(x, y);
    const rust = smooth(0.62, 0.86, streak(x, y)) * (1 - y / TEX);
    const c = crack(x, y);
    const seam = bx === 0 || bx === 1;
    const edge = bx === 2 || bx === 31;
    let k = (0.62 + n * 0.28 + m * 0.18 + (tone - 0.5) * 0.12) * (1 - c * 0.4);
    if (seam) k *= 0.42;
    else if (edge) k *= bx === 2 ? 1.12 : 0.85;
    if (y >= 118) k *= y === 118 ? 0.6 : 0.78;
    put(p, lerp(150, 132, rust) + tone * 10, lerp(118, 84, rust) + tone * 6, lerp(108, 64, rust), k);
    p.h = seam ? 0.15 : 0.6 + n * 0.15 + m * 0.1 - c * 0.3 - (y >= 118 ? 0.1 : 0);
  }, 1.2);
}

/** Floor of the Glow (the original's brn* tiles): brown square tiles, four by four per cell, dark joints, a light edge, scuffs. */
function glowTile(): Texture {
  const body = fbm(1301, 4, 4);
  const wear = fbm(1302, 6, 3);
  const grain = rng(1303);
  return build((x, y, p) => {
    const tx = x & 31;
    const ty = y & 31;
    const tone = hash(x >> 5, y >> 5, 1301);
    const n = body(x, y);
    const w = smooth(0.6, 0.78, wear(x, y));
    const g = grain();
    const seam = tx < 2 || ty < 2;
    const lip = tx === 2 || ty === 2;
    let k = (0.6 + n * 0.25 + (tone - 0.5) * 0.14 + (g - 0.5) * 0.08) * (1 + w * 0.18);
    if (seam) k *= 0.45;
    else if (lip) k *= 1.12;
    put(p, 128, 104, 82, k);
    p.h = seam ? 0.2 : 0.65 + n * 0.1 - w * 0.1;
  }, 1);
}

/** Floor grating of the Glow (the original's grt* tiles): rust-red cast-iron bars in a dense grid, darkness beneath them. */
function glowGrate(): Texture {
  const rust = fbm(1311, 5, 4);
  const body = fbm(1312, 6, 3);
  return build((x, y, p) => {
    const rr = smooth(0.4, 0.75, rust(x, y));
    const n = body(x, y);
    const barX = (x & 7) < 2;
    const barY = (y & 15) < 3;
    if (!barX && !barY) {
      put(p, 22, 14, 12, 0.8);
      p.h = 0;
      return;
    }
    const k = (barY ? 0.85 : 0.7) + n * 0.25;
    put(p, lerp(124, 104, rr), lerp(64, 44, rr), lerp(48, 32, rr), k);
    p.h = barY ? 0.9 : 0.75;
  }, 1.1);
}

/** Ceiling of the Glow: pinkish-brown concrete floor slabs with seams, dark soot stains here and there. */
function glowCeiling(): Texture {
  const body = fbm(1321, 4, 5);
  const soot = fbm(1322, 3, 4);
  return build((x, y, p) => {
    const n = body(x, y);
    const s = smooth(0.6, 0.8, soot(x, y));
    const seam = (x & 63) < 2 || (y & 63) < 2;
    put(p, 124, 102, 94, (0.58 + n * 0.28) * (seam ? 0.5 : 1) * (1 - s * 0.35));
    p.h = seam ? 0.2 : 0.6 + n * 0.15;
  }, 1);
}

/**
 * Walls of the Military Base (the original's mmb* pieces): light grey vertical steel sheets, two per cell, riveted along the edges,
 * a band in the middle and a diagonal cross brace on some sheets; at the bottom — a yellow-and-black hazard stripe, dirt above it;
 * dark streaks, dents.
 */
function baseWall(): Texture {
  const body = fbm(1331, 4, 5);
  const grime = fbm(1332, 6, 3);
  const streak = noise(1333, 24, 3);
  const dent = fbm(1334, 8, 3);
  return build((x, y, p) => {
    const sheet = x >> 6;
    const bx = x & 63;
    const tone = hash(sheet, 0, 1331);
    const braced = hash(sheet, 1, 1332) > 0.55;
    const n = body(x, y);
    const g = smooth(0.55, 0.8, grime(x, y));
    const st = smooth(0.6, 0.88, streak(x, y)) * (1 - y / TEX * 0.6);
    const d = smooth(0.74, 0.8, dent(x, y));
    let r = 156;
    let gg = 158;
    let b = 160;
    let k = (0.66 + n * 0.22 + (tone - 0.5) * 0.1) * (1 - st * 0.25) * (1 - g * 0.15) * (1 - d * 0.18);
    let h = 0.6 + n * 0.12 - d * 0.2;
    const seam = bx < 2;
    const rim = bx === 2 || bx === 63 || y === 6 || y === 59 || y === 66;
    const rivet = (bx === 6 || bx === 58) && (y % 12 === 4) && y > 6 && y < 104;
    if (seam || y < 4) {
      k *= 0.4;
      h = 0.1;
    } else if (rim) {
      k *= bx === 63 || y === 59 ? 0.7 : 1.12;
    } else if (rivet) {
      k *= 1.3;
      h = 0.95;
    } else if (y >= 60 && y < 66) {
      // Band in the middle of the sheet.
      k *= y === 60 ? 1.15 : 0.92;
      h = 0.85;
    } else if (braced && y > 8 && y < 104) {
      // Cross brace: two strips along the diagonals of the upper and lower halves of the sheet.
      const half = y < 60 ? y - 8 : y - 66;
      const span = y < 60 ? 51 : 38;
      const u = (bx - 6) / 52;
      const v = half / span;
      const diag = Math.min(Math.abs(u - v), Math.abs(u - (1 - v)));
      if (diag < 0.06 && u > 0 && u < 1) {
        k *= diag < 0.025 ? 1.18 : 0.78;
        h = 0.9;
      }
    }
    if (y >= 104 && y < 116) {
      // Hazard stripe: yellow and black diagonal stripes.
      const stripe = ((x + y) >> 3) & 1;
      if (stripe) {
        r = 200;
        gg = 168;
        b = 52;
      } else {
        r = 40;
        gg = 38;
        b = 36;
      }
      k = (0.78 + n * 0.2) * (1 - g * 0.3);
      h = 0.7;
    } else if (y >= 116) {
      k *= 0.62;
      h = 0.5;
    }
    put(p, r, gg, b, k);
    p.h = h;
  }, 1.2);
}

/** Floor of the Military Base (the original's plt* tiles): light steel plates, two by two per cell, diamond-ribbed, dark seams. */
function baseFloor(): Texture {
  const body = fbm(1341, 4, 4);
  const grime = fbm(1342, 5, 3);
  return build((x, y, p) => {
    const tx = x & 63;
    const ty = y & 63;
    const tone = hash(x >> 6, y >> 6, 1341);
    const n = body(x, y);
    const g = smooth(0.55, 0.78, grime(x, y));
    const seam = tx < 2 || ty < 2;
    // Ribbing: short diagonal diamond notches every 8 points.
    const cx = (tx & 7) - 3.5;
    const cy = (ty & 7) - 3.5;
    const flip = ((tx >> 3) + (ty >> 3)) & 1;
    const tread = Math.abs(flip ? cx - cy : cx + cy) < 1.1 && Math.abs(cx) < 3 && Math.abs(cy) < 3;
    let k = (0.62 + n * 0.22 + (tone - 0.5) * 0.08) * (1 - g * 0.22);
    if (seam) k *= 0.45;
    else if (tread) k *= 1.16;
    put(p, 150, 152, 154, k);
    p.h = seam ? 0.15 : tread ? 0.8 : 0.55 + n * 0.08;
  }, 1);
}

export function townTextures(): Record<TownTexture, () => Texture> {
  return {
    adobeLight: () => varied(adobeLight),
    canvas: () => varied(canvas),
    adobeRoof: () => varied(adobeRoof),
    adobePost: () => adobePost(),
    adobeWindow: () => adobeWindow(),
    fenceRail: () => fenceRail(),
    fenceTop: () => fenceTop(),
    fenceGate: () => fenceGate(),
    obelisk: () => obelisk(),
    ruinFacade: () => varied(ruinFacade),
    wasteland: () => varied(wasteland),
    road: () => varied(road),
    pavement: () => varied(pavement),
    cement: () => varied(cement),
    planks: () => varied(planks),
    plankWall: () => varied(plankWall),
    darkConcrete: () => varied(darkConcrete),
    oldBrick: () => varied(oldBrick),
    stucco: () => varied(stucco),
    chainFence,
    chainLink,
    brownConcrete: () => varied(brownConcrete),
    vaultWall: () => varied(vaultWall),
    vaultFloor: () => varied(vaultFloor),
    ribbedSteel: () => varied(ribbedSteel),
    darkTiles: () => varied(darkTiles),
    carpet: () => varied(carpet),
    brownTile: () => varied(brownTile),
    baseFacade: () => varied(baseFacade),
    baseGate: () => baseGate(),
    guardBooth: () => guardBooth(),
    junkPlanks: () => varied(junkPlanks),
    junkSheet: () => varied(junkSheet),
    junkBraced: () => varied(junkBraced),
    junkRoof: () => varied(junkRoof),
    bunkerPanel: () => varied(bunkerPanel),
    bunkerPylon: () => ({ ...varied(bunkerPylon), repeat: PYLON_STOREYS }),
    bunkerDoor: () => bunkerDoor(),
    bunkerDome: () => varied(bunkerDome),
    gearFace: () => gearFace(),
    gearRim: () => varied(gearRim),
    vaultSlab: () => varied(vaultSlab),
    hubPanel: () => varied(hubPanel),
    hubRoof: () => varied(hubRoof),
    hubParapet: () => varied(hubParapet),
    hubPlaster: () => varied(hubPlaster),
    palisade: () => varied(palisade),
    wareSiding: () => varied(wareSiding),
    wareRoof: () => varied(wareRoof),
    toxicSlime: () => varied(toxicSlime),
    glowPanel: () => varied(glowPanel),
    glowTile: () => varied(glowTile),
    glowGrate: () => varied(glowGrate),
    glowCeiling: () => varied(glowCeiling),
    baseWall: () => varied(baseWall),
    baseFloor: () => varied(baseFloor),
  };
}
