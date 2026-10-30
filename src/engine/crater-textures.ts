// Drawings for the Glow crater (client request, 2026-10-25: "a huge crater whose bottom you can't see; we'll need to make lots of
// drawings for the blocks"): a rim of broken concrete and asphalt slabs, a scorched slope with debris and protruding
// rebar, dark shaft walls with hanging rods and cables; slabs lying along the edge (top and side), a steel
// beam at the edge and the same beam with a rope tied to it. Our own drawings in code, nothing from Fallout files.
import { build, cracks, fbm, hash, noise, put, rng, smooth, TEX, varied, worley, type Texture } from './textures.ts';

export type CraterTexture = 'craterLip' | 'craterSlope' | 'craterShaft' | 'craterScorch' | 'craterSlab' | 'craterSlabTop' | 'girderSteel' | 'girderRope';

/** Rebar rods and cables hanging down: n thin lines, each with its own spacing, slight bend and length. */
function rebars(seed: number, n: number) {
  const rand = rng(seed);
  const bars = Array.from({ length: n }, () => ({
    x: rand() * TEX,
    bend: (rand() - 0.5) * 6,
    wave: 1 + rand() * 3,
    from: rand() * TEX * 0.4,
    len: TEX * (0.35 + rand() * 0.65),
    w: 1 + rand() * 1.2,
    bright: 0.55 + rand() * 0.45,
  }));
  /** Rod strength at a point (0 — none) and its brightness. */
  return (x: number, y: number): number => {
    let best = 0;
    for (const b of bars) {
      const yy = (y - b.from + TEX) % TEX;
      if (yy > b.len) continue;
      const cx = b.x + b.bend * Math.sin((yy / TEX) * Math.PI * b.wave);
      let d = Math.abs(x - cx);
      d = Math.min(d, TEX - d);
      if (d < b.w) best = Math.max(best, b.bright * (1 - d / b.w) * (1 - (yy / b.len) * 0.4));
    }
    return best;
  };
}

/** The rim at the edge: chunks of concrete and asphalt slabs of different sizes, dark, mixed with gravel and soot. */
function craterLip(): Texture {
  const big = worley(1201, 4);
  const small = worley(1207, 11);
  const grain = fbm(1202, 16, 4);
  const soot = fbm(1203, 4, 3);
  const crack = cracks(1204, 6, 0.012, 0.55);
  return build((x, y, p) => {
    const n = grain(x, y);
    const w = big(x, y);
    const v = small(x, y);
    // A big chunk where the "cell" is large and not at its edge; gravel between them.
    const slab = hash(w.id, 2, 1208) < 0.55 && w.f2 - w.f1 > 3 + hash(w.id, 5, 1209) * 6;
    const s = 0.5 + soot(x, y) * 0.7;
    if (slab) {
      const asphalt = hash(w.id, 7, 1206) < 0.4;
      const tone = 0.7 + hash(w.id, 3, 1205) * 0.5;
      put(p, asphalt ? 50 : 84, asphalt ? 50 : 80, asphalt ? 52 : 74, tone * s * (0.85 + n * 0.3) * (1 - crack(x, y) * 0.6));
      p.h = 0.65 + Math.min(1, (w.f2 - w.f1) / 14) * 0.3;
      return;
    }
    if (v.f2 - v.f1 < 1.4) {
      put(p, 16, 14, 13, 0.8 + n * 0.4);
      p.h = 0.1;
      return;
    }
    const tone = 0.55 + hash(v.id, 1, 1210) * 0.6;
    put(p, 70, 62, 54, tone * s * (0.8 + n * 0.35));
    p.h = 0.3 + (1 - v.f1 / v.size) * 0.35;
  }, 1.5);
}

/** Slope: scorched earth and gravel, chunks of concrete, rebar and cables running top to bottom; darker with soot lower down. */
function craterSlope(): Texture {
  const soil = fbm(1211, 8, 5);
  const soot = fbm(1212, 3, 3);
  const stones = worley(1213, 10);
  const bars = rebars(1214, 14);
  return build((x, y, p) => {
    const n = soil(x, y);
    const st = stones(x, y);
    const chunk = st.f1 < st.size * (0.18 + hash(st.id, 1, 1215) * 0.22) && hash(st.id, 2, 1216) < 0.55;
    const s = 0.55 + soot(x, y) * 0.6;
    if (chunk) {
      // Concrete chunk: lighter, with its own shadow below.
      const k = (0.7 + hash(st.id, 3, 1217) * 0.5) * s;
      put(p, 96, 92, 86, k);
      p.h = 0.85 - st.f1 / st.size;
    } else {
      put(p, 62, 50, 40, (0.6 + n * 0.55) * s);
      p.h = 0.35 + n * 0.2;
    }
    const bar = bars(x, y);
    if (bar > 0) {
      const rust = hash(Math.floor(x), Math.floor(y / 4), 1218) < 0.3;
      put(p, rust ? 120 : 150, rust ? 84 : 146, rust ? 56 : 138, bar);
      p.h = 0.9;
    }
  }, 1.2);
}

/** Shaft walls: nearly black layered rock, wet streaks, many hanging rods and cables. */
function craterShaft(): Texture {
  const rock = fbm(1221, 6, 5);
  const layers = noise(1222, 1, 9);
  const bars = rebars(1223, 22);
  return build((x, y, p) => {
    const n = rock(x, y);
    const strata = 0.75 + Math.sin((y / TEX) * Math.PI * 2 * 5 + layers(x, y) * 4) * 0.12;
    put(p, 44, 40, 38, (0.55 + n * 0.6) * strata);
    p.h = 0.3 + n * 0.4;
    const bar = bars(x, y);
    if (bar > 0) {
      put(p, 128, 126, 120, bar * 0.85);
      p.h = 0.95;
    }
  }, 1.3);
}

/** Shallow crater: scorched earth — patches of ash and soot, here and there light sand drifts and small stones. */
function craterScorch(): Texture {
  const ash = fbm(1261, 5, 5);
  const sand = fbm(1262, 3, 4);
  const stones = worley(1263, 14);
  return build((x, y, p) => {
    const n = ash(x, y);
    const st = stones(x, y);
    const k = 0.35 + n * 0.55;
    put(p, 58, 50, 44, k);
    const drift = smooth(0.55, 0.85, sand(x, y)) * 0.55;
    p.r += (150 - p.r) * drift;
    p.g += (126 - p.g) * drift;
    p.b += (94 - p.b) * drift;
    p.h = 0.4 + n * 0.2;
    if (st.f1 < st.size * 0.12 && hash(st.id, 1, 1264) < 0.4) {
      put(p, 80, 74, 66, 0.8 + hash(st.id, 2, 1265) * 0.4);
      p.h = 0.8;
    }
  }, 1.1);
}

/** Slab at the edge, side view: broken concrete — uneven layers, chips, protruding rebar ends. */
function craterSlab(): Texture {
  const grain = fbm(1231, 12, 4);
  const chip = fbm(1232, 6, 3);
  const wave = noise(1234, 4, 2);
  return build((x, y, p) => {
    const n = grain(x, y);
    const layer = Math.floor((y + wave(x, y) * 14) / 26);
    const k = (0.6 + n * 0.4) * (0.85 + hash(layer, 1, 1233) * 0.3);
    put(p, 78, 76, 72, k);
    p.h = 0.5 + n * 0.25;
    if (chip(x, y) > 0.62) {
      put(p, 40, 38, 36, 0.9 + n * 0.2);
      p.h = 0.2;
    }
    if (Math.abs((x % 37) - 18) < 1.5 && Math.abs((y % 53) - 30) < 1.5) {
      put(p, 112, 74, 48, 1);
      p.h = 1;
    }
  }, 1.3);
}

/** Slab at the edge, top view: broken concrete with cracks, dust. */
function craterSlabTop(): Texture {
  const grain = fbm(1241, 10, 4);
  const crack = cracks(1242, 5, 0.014, 0.6);
  const dust = fbm(1243, 3, 3);
  return build((x, y, p) => {
    const n = grain(x, y);
    put(p, 96, 94, 90, (0.78 + n * 0.3) * (1 - crack(x, y) * 0.7));
    const d = smooth(0.45, 0.8, dust(x, y)) * 0.45;
    p.r += (138 - p.r) * d;
    p.g += (118 - p.g) * d;
    p.b += (92 - p.b) * d;
    p.h = 0.5 + n * 0.2 - crack(x, y) * 0.4;
  }, 1.1);
}

/** Steel beam (I-beam): dark steel, rust patches and streaks, flanges at the edges, rivets; with a rope — coils in the middle. */
function girder(rope: boolean): Texture {
  const rust = fbm(1251, 8, 4);
  const spots = fbm(1252, 5, 3);
  return build((x, y, p) => {
    const n = rust(x, y);
    const flange = y < 16 || y > 112;
    const k = (flange ? 0.95 : 0.75) * (0.75 + n * 0.35);
    put(p, 74, 76, 80, k);
    const r = smooth(0.55, 0.8, spots(x, y));
    p.r += (118 - p.r) * r;
    p.g += (70 - p.g) * r;
    p.b += (44 - p.b) * r;
    p.h = flange ? 0.85 : 0.45;
    if (x % 32 === 16 && (y === 8 || y === 120)) {
      put(p, 96, 98, 100, 1);
      p.h = 1;
    }
    if (rope && Math.abs(x - 64) < 18) {
      // Rope coils: slanted strands, light hemp.
      const strand = ((x + y * 0.6) % 9) / 9;
      put(p, 168, 140, 96, 0.7 + Math.sin(strand * Math.PI) * 0.4);
      p.h = 0.6 + Math.sin(strand * Math.PI) * 0.4;
    }
  }, 1.2);
}

export function craterTextures(): Record<CraterTexture, () => Texture> {
  return {
    craterLip: () => varied(craterLip),
    craterSlope: () => varied(craterSlope),
    craterShaft: () => craterShaft(),
    craterScorch: () => varied(craterScorch),
    craterSlab: () => varied(craterSlab),
    craterSlabTop: () => varied(craterSlabTop),
    girderSteel: () => girder(false),
    girderRope: () => girder(true),
  };
}
