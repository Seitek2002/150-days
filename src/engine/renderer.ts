// Doom 1-style rendering: textured walls, floor and ceiling, distance darkening in "steps", flat sprites
// always turned toward the player. On top — light (lightmap.ts): soft shadow by walls and in corners, pools of light from the original's lamps,
// flashes of shots and explosions.
import { buildLightMap, LAMP_SCALE, sampleGrid, wallShade, type DynamicLight, type LightMap } from './lightmap.ts';
import { craterEdge, depthAt, LIP, SHAFT } from './crater.ts';
import { EXIT_MARK, GLOW, wallAt, wallFaceKey, type Block, type Door, type FloorMark, type Level, type Outdoor, type Rgb } from './level.ts';
import { CLOUD_HEIGHT, CLOUD_SCALE, cloudAt, moonAt, mountainsAt, starAt } from './sky.ts';
import { CONSTELLATIONS, DEEP_SKY, GALACTIC_POLE, SKY_LATITUDE, skyPosition, STAR_INDEX, STARS } from './stars.ts';
import { EMISSIVE, hash, TEX, variantIndex, variantOf, type Texture, type TextureName } from './textures.ts';
import { panelPicture, type PanelName, type PanelPicture } from './cathedral-textures.ts';
import type { LevelPanel, LevelRound } from '../world/defs.ts';
import type { SpriteFrame } from '../assets/sprites.ts';

/**
 * How many times more detailed the frame is than the "DOS" 320×190 (Opus's decision at the visual-style stage: 640×380 — the game screen
 * above the panel almost pixel for pixel). View pitch, weapon sizes and other "pixels" are still counted
 * in 320×190 units and multiplied by RES.
 * The "Picture quality → Fast" setting (setViewDetail) switches to 1: a 320×190 frame, as in Doom itself — four times
 * fewer pixels, for weak computers. That is why the sizes below are not constants: they are read on every access.
 */
export const FULL_RES = 2;
export let RES = FULL_RES;
export let VIEW_W = 320 * RES;
export let VIEW_H = 190 * RES;
/** 90° field of view, as in Doom (normal; wider when speeding — Renderer.widen). */
export let PROJ = VIEW_W / 2;
let CENTER = VIEW_H / 2;

/** Frame detail: FULL_RES — normal (640×380), 1 — fast (320×190). The Renderer adapts on the next frame. */
export function setViewDetail(res: number): void {
  RES = res === 1 ? 1 : FULL_RES;
  VIEW_W = 320 * RES;
  VIEW_H = 190 * RES;
  PROJ = VIEW_W / 2;
  CENTER = VIEW_H / 2;
}
/**
 * How far the view can be raised and lowered (in pixels of a 320×190 frame): the horizon goes far past the edge of the frame, and
 * the top (bottom) row looks 68° up (down) — almost to the zenith and at your feet (client request, 2026-10-24: "look
 * all the way up and down"). Straight up is impossible with this kind of rendering: wall columns stay vertical, only the horizon moves.
 */
export const MAX_PITCH = 600;
export const MIN_PITCH = -600;
/** Eye height above the floor (wall height = 1). */
export const EYE = 0.45;
/** How many world units in one Fallout sprite pixel. */
export const SPRITE_SCALE = 1 / 110;
const LIGHT_STEPS = 32;
/** How much a light source adds (underground; outdoors — only in the dark). */
const LAMP_GAIN = 0.8;
/** How many times closer it gets dark underground on maps with light sources. */
const LIT_FADE = 0.6;
/** Corner shadow on a wall is taken from the floor shadow at this distance from the wall. */
const CORNER_PROBE = 0.3;
/** Floor and ceiling light is computed every this many row points, smoothly between them. */
const LIGHT_SPAN = 8;
/** Light is never brighter than this (otherwise everything turns white near a lamp). */
const MAX_LIGHT = 1.15;
/** Beyond this distance (in cells) what you see doesn't go onto the automap: it's almost dark there. */
const SEEN_RANGE = 10;
/** How many blocks and their parts (table legs, chair back) are drawn in one frame column. */
const MAX_BLOCKS = 24;
/** How much fog at height dims glowing windows (1 — like a wall): the light of big windows pierces the fog. */
const GLOW_THROUGH = 0.28;
/** Sky latitude (stars.ts): sine and cosine — to convert the view direction into a point on the celestial sphere. */
const SIN_LAT = Math.sin((SKY_LATITUDE * Math.PI) / 180);
const COS_LAT = Math.cos((SKY_LATITUDE * Math.PI) / 180);
/** Catalog star colors by tint (stars.ts → StarTint): white, blue, yellow, orange, red. */
const STAR_TINTS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [0.78, 0.9, 1.18],
  [1.1, 1.02, 0.78],
  [1.15, 0.86, 0.58],
  [1.2, 0.72, 0.52],
];
/** Constellation lines: color and how far to the sides of the view a star is still projected (radians). */
const CONSTELLATION_LINE = { r: 95, g: 130, b: 185 };
const STAR_VIEW = 1.25;
/** Brightness of small background stars with the real sky (without it — 200). */
const FIELD_STAR = 120;
/** Constellation lines by star index (stars.ts). */
const CONSTELLATION_LINES = CONSTELLATIONS.map((c) => c.lines.map(([a, b]) => [STAR_INDEX.get(a)!, STAR_INDEX.get(b)!] as const));
/**
 * The eyes adapt to the dark (client request, 2026-10-26; nightAdapt — from 0 to 1): at first no more than FIRST_STARS of the brightest
 * stars are visible, then more and more, the clouds thin out, background stars, the Milky Way and galaxies appear, the Moon becomes sharp.
 */
const FIRST_STARS = 10;
/** Catalog stars from brightest to dimmest (indices into STARS). */
const STARS_BY_MAG = STARS.map((_, i) => i).sort((a, b) => STARS[a]!.mag - STARS[b]!.mag);
/** Galactic pole: sine and cosine of declination — for the Milky Way's latitude. */
const SIN_GP = Math.sin(GALACTIC_POLE.dec);
const COS_GP = Math.cos(GALACTIC_POLE.dec);
/** The Moon's apparent radius (radians): larger than the real one, otherwise the craters can't be made out. */
const MOON_RADIUS = 0.032;
const MOON_COLOR = { r: 236, g: 232, b: 214 };
/** Course of dark adaptation: on which stretch of nightAdapt what appears. */
const ADAPT = { field: [0.08, 0.6], clouds: [0.1, 0.7], galaxies: [0.45, 0.8], moon: [0.6, 0.9] } as const;
const adaptStep = (range: readonly [number, number], adapt: number): number => smoothstep(range[0], range[1], adapt);
const CONSTELLATION_STARS = CONSTELLATIONS.map((c) => [...new Set([...c.lines.flat(), ...(c.extra ?? [])])].map((n) => STAR_INDEX.get(n)!));

/**
 * A shooting star (set and moved by the game — play.ts): the head is a view direction az (like Camera.angle) and elevation el
 * (radians), it flies in direction (dAz, dEl) at speed speed — the tail trails back length radians; size — 1 small, 2 medium, 3 bright;
 * age and life — how many seconds it has been flying and for how long in total (flares up and fades).
 */
export interface Meteor {
  az: number;
  el: number;
  dAz: number;
  dEl: number;
  length: number;
  size: number;
  /** Speed across the sky, radians per second. */
  speed: number;
  age: number;
  life: number;
}

export interface Camera {
  x: number;
  y: number;
  angle: number;
  /** View pitch: above zero — looking up. The horizon shifts, as in Heretic and Duke Nukem 3D. */
  pitch: number;
  /** Height above the floor (jump): the eyes rise by the same amount. */
  z?: number;
  /** How much lower than usual the eyes are (lying down): cells. */
  eyeDrop?: number;
}

export interface Billboard {
  x: number;
  y: number;
  frame: SpriteFrame;
  /** Anchor point offset in Fallout pixels: x — right, y — down. */
  shiftX: number;
  shiftY: number;
  /** Object number — to tell whom a bullet hit. */
  id?: number;
  /**
   * Light pillar (a location beacon in the wasteland): a translucent green beam from the ground into the sky. No image needed, its on-screen width is
   * at least a few points, so it is visible from afar too; haze doesn't hide it, walls block it.
   */
  beam?: 'green' | 'blue';
  /** How many times larger than a normal sprite (effects: fire, smoke). */
  scale?: number;
  /** Glows by itself: doesn't darken with distance (sparks, fire). */
  glow?: boolean;
  /** Opacity 0..1 (smoke and dust fade); none — opaque. */
  alpha?: number;
  /**
   * Lies on the floor (a corpse): the image doesn't stand but lies on the ground, "top" away from the viewer — as if seen from above
   * (the original's death images are drawn almost from above anyway). Doesn't block the view.
   */
  flat?: boolean;
  /** Where the "top" of a lying image points (world angle): lies as it fell; none — top away from the viewer. */
  angle?: number;
}

/** A lying image in this frame: center, size on the floor (cells) and frame. */
interface FlatSprite {
  x: number;
  y: number;
  w: number;
  h: number;
  frame: SpriteFrame;
  /** Where the "top" of the image points (unit vector); none — away from the viewer. */
  dirX?: number;
  dirY?: number;
}

/** The original's images are drawn obliquely from above — on the floor we stretch them in depth so the body isn't squashed. */
const FLAT_DEPTH_STRETCH = 1.7;

/** A beam needs no image — an empty point (Billboard requires a frame). */
export const NO_FRAME: SpriteFrame = { width: 1, height: 1, pixels: new Uint32Array(1) };

/** Where the sprite ended up on screen in the last frame. */
/** Visible part of the frame (without transparent margins): computed once per frame. */
const opaqueBoxes = new WeakMap<object, { x0: number; y0: number; x1: number; y1: number }>();
function opaqueBox(frame: { width: number; height: number; pixels: ArrayLike<number> }): { x0: number; y0: number; x1: number; y1: number } {
  let box = opaqueBoxes.get(frame);
  if (box) return box;
  let x0 = frame.width;
  let y0 = frame.height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if ((frame.pixels[y * frame.width + x] ?? 0) === 0) continue;
      if (x < x0) x0 = x;
      if (x + 1 > x1) x1 = x + 1;
      if (y < y0) y0 = y;
      if (y + 1 > y1) y1 = y + 1;
    }
  }
  box = x1 > x0 ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: frame.width, y1: frame.height };
  opaqueBoxes.set(frame, box);
  return box;
}

interface Placement {
  b: Billboard;
  left: number;
  top: number;
  width: number;
  height: number;
  depth: number;
}

/**
 * Point color under light light; under open sky distant things fade into haze: haze — how much (0 — none), fog — its color.
 * warm — share of warm lamp light (yellows it). Frame color is ABGR: red in the low byte.
 */
function shade(color: number, light: number, fog: Rgb | null = null, haze = 0, warm = 0): number {
  let r = (color & 0xff) * light;
  let g = ((color >>> 8) & 0xff) * Math.max(0, light - warm * 0.1);
  let b = ((color >>> 16) & 0xff) * Math.max(0, light - warm * 0.32);
  if (fog) {
    r += fog.r * haze;
    g += fog.g * haze;
    b += fog.b * haze;
  }
  return (0xff << 24) | ((Math.min(255, b) & 0xff) << 16) | ((Math.min(255, g) & 0xff) << 8) | (Math.min(255, r) & 0xff);
}

const pack = (c: Rgb): number => (0xff << 24) | ((c.b & 0xff) << 16) | ((c.g & 0xff) << 8) | (c.r & 0xff);
/** The same from three numbers (without an extra object for every sky point). */
const packRgb = (r: number, g: number, b: number): number => (0xff << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff);

/** Green glow of location zones (like the location circles on the original's world map). */
const GLOW_COLOR = pack({ r: 90, g: 240, b: 120 });
const BEAM_COLOR = pack({ r: 120, g: 255, b: 150 });
/** An exit to another part of the same location — green, out of the location — orange (floor markers). */
const EXIT_NEAR_COLOR = pack({ r: 70, g: 230, b: 100 });
const EXIT_OUT_COLOR = pack({ r: 255, g: 140, b: 30 });
/** Path target beam — light blue. */
const BEAM_BLUE = pack({ r: 110, g: 190, b: 255 });
/** Caravan zone — blue. */
const ZONE_BLUE = pack({ r: 60, g: 120, b: 255 });
/** Width of the caravan zone's glowing ring (cells): wider than a location ring — visible from afar. */
const ZONE_EDGE = 1.5;

/** Closer than this (cells) the hole isn't computed — to avoid dividing by zero right at your feet. */
const CRATER_NEAR = 0.05;
/** Step through the hole along the ray (cells; further away — larger) and how many frame columns per computation. */
const CRATER_STEP = 0.05;
const CRATER_COLUMNS = 2;
/** Hole darkness by depth (table: DEEP_STEPS steps per storey up to DEEP_MAX storeys): deeper than a third of a storey — darker. */
const DEEP_STEPS = 64;
const DEEP_MAX = 8;
const DEEP_DARK = Float32Array.from({ length: DEEP_STEPS * DEEP_MAX }, (_, i) => {
  const deep = i / DEEP_STEPS;
  return deep < 0.35 ? 1 : Math.exp(-(deep - 0.35) / 0.9);
});
/** The rope hangs slightly to the side of the beam (cells). */
const ROPE_SIDE = 0.16;

/** Angle from two numbers — faster than Math.atan2, error under 0.01 radian (enough for the hole). */
function fastAtan2(y: number, x: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const a = Math.min(ax, ay) / (Math.max(ax, ay) || 1);
  const q = a * a;
  let r = ((-0.0464964749 * q + 0.15931422) * q - 0.327622764) * q * a + a;
  if (ay > ax) r = Math.PI / 2 - r;
  if (x < 0) r = Math.PI - r;
  return y < 0 ? -r : r;
}
/** Rope in the hole: half-thickness (cells) and hemp color. */
const ROPE_HALF = 0.035;
const ROPE_COLOR = packRgb(170, 138, 92);

/** Darken a frame color (k from 0 to 1) — hole depth dims both light and haze. */
function darken(c: number, k: number): number {
  return (0xff << 24) | ((((c >>> 16) & 0xff) * k) << 16) | ((((c >>> 8) & 0xff) * k) << 8) | ((c & 0xff) * k);
}

/** Blend two frame colors: t — share of the second. */
function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >>> shift) & 0xff) * (1 - t) + ((b >>> shift) & 0xff) * t);
  return (0xff << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export class Renderer {
  // Everything frame-sized — set up in resize (on creation and when the frame detail changes).
  image!: ImageData;
  private frame!: Uint32Array;
  private depth!: Float32Array;
  /** Which wall is visible in each column — to know what a bullet that missed its target hit. */
  private wallTex!: (TextureName | null)[];
  /** View direction in each column (for the sky). */
  private colAz!: Float32Array;
  private colCos!: Float32Array;
  private colSin!: Float32Array;
  private colFar!: Float32Array;
  private colNear!: Float32Array;
  /** Which side of which cell is visible in a column (wallFaceKey; −1 — a door or nothing) and where on it (0..1). */
  private wallKey!: Int32Array;
  private wallU!: Float32Array;
  /** Where the wall is in a column (rows from and to): floor and ceiling under it aren't drawn. */
  private wallFrom!: Int16Array;
  /** Top of the column's near wall (before tall buildings behind are drawn in): blocks above that wall are visible above it. */
  private nearTop!: Int16Array;
  private wallTo!: Int16Array;
  /** Ray direction in each column (not unit length: distance along it is the frame depth). */
  private colRayX!: Float32Array;
  private colRayY!: Float32Array;
  /** Blocks in columns (MAX_BLOCKS per column, nearest first): which one, where the ray enters and exits, side, frame rows. */
  private blockCount!: Uint8Array;
  private blockRef!: (Block | null)[];
  private blockT0!: Float32Array;
  private blockT1!: Float32Array;
  private blockFace!: Uint8Array;
  /** Big editor block number for a part in a column (0 — an ordinary block) and the number of the one whose ray is being computed now. */
  private blockGroup!: Int32Array;
  private hitGroup = 0;
  private blockTop!: Int16Array;
  private blockBottom!: Int16Array;
  /**
   * Where in the frame a block painted a point — the distance to it (to the near side, where the ray enters the block). Holes in the image (between fence
   * rails, between chair legs) are not painted: a sprite behind them is visible. Only in columns with blocks (blockCount).
   */
  private blockDepth!: Float32Array;
  /** Blocks per cell as an array (faster than looking up a Map at every ray step); rebuilt when blocks change. */
  private blockGrid: (Block | undefined)[] = [];
  private blockGridLevel: Level | null = null;
  private blockGridVersion = -1;
  /** Floor markings per cell as an array (for fast lookup at each floor point). */
  private markGrid: (FloorMark | undefined)[] = [];
  private markGridLevel: Level | null = null;
  private markGridSize = -1;
  private horizon = CENTER;
  /**
   * Field of view width: 1 — 90°, as in Doom; more — wider (when speeding, like from a speed potion in Minecraft). This is the tangent
   * of half the angle: 1.6 — about 116°.
   */
  widen = 1;
  /** This frame's projection (pixels per unit "sideways per unit of depth"): this.proj at 90°, less with a wide view. */
  proj = PROJ;
  /** Eye height in this frame: normal plus the jump. */
  private eye = EYE;
  private fade = 11;
  /** How far the hero sees (by Perception — the same rule as for NPCs): multiplier of the distance to darkness and haze. */
  sightScale = 1;
  /** Light carried by the hero (a lit flare): multiplier of the same distance, 1 — no light. */
  lightBoost = 1;
  /** The hero's "Night Vision": the overall light under the sky is this much brighter (noticeable at night, by day capped at full light). */
  darkSight = 0;
  /** Open sky: distant haze and overall light (underground there is no haze, the light is full). */
  private fog: Rgb | null = null;
  private brightness = 1;
  /** How much it is night right now (0 — day, 1 — deep night): windows light up, the statue is lit from below. */
  private night = 0;
  /** Pictures on walls (stained glass, relief): drawn once, when first needed. */
  private panelPics = new Map<PanelName, PanelPicture>();
  /** Haze around this level's tall buildings (storeys): fading starts at from, by to — almost sky. */
  private hazeRange: { from: number; to: number; max?: number } | null = null;
  /** The last picture point glows by itself (stained glass) — the fog barely dims it. */
  private panelLit = false;
  private outdoor: Outdoor | null = null;
  private placements: Placement[] = [];
  /** Level cells the player has already seen (1 — seen), by index `y * width + x`. For the automap; filled in walls(). */
  seen = new Uint8Array(0);
  private seenLevel: Level | null = null;
  /** Momentary light (shots, explosions) in this frame — set by the game. */
  lights: DynamicLight[] = [];
  /** A moving blue zone on the ground (around a caravan): set by the game every frame; null — none. */
  zone: { x: number; y: number; radius: number } | null = null;
  /** Constellation lines at night: 0 — none, 1 — full strength (set by the game: the hero has looked at the night sky for a minute). */
  constellations = 0;
  /** Whether the hero is looking at the night starry sky right now (the middle of the frame is open sky high above the horizon). */
  skyGaze = false;
  /** How well the eyes have adapted to the dark at night (0 — just now, 1 — fully): set by the game while the hero stands looking at the sky. */
  nightAdapt = 1;
  /** Shooting stars in the night sky (set by the game). */
  meteors: Meteor[] = [];
  /** Catalog stars visible right now (by dark adaptation): 1 — visible. */
  private readonly starShown = new Uint8Array(STARS.length);
  /** Celestial sphere point for a sky column and row (celestial): right ascension and declination, radians. */
  private cRa = 0;
  private cDec = 0;
  /** Where in the frame to label constellations (when lines are visible): key from stars.ts and frame point. */
  readonly starLabels: { key: string; x: number; y: number }[] = [];
  /** Direction and altitude of catalog stars for sidereal time starSidereal (computed only when it changes). */
  private readonly starAz = new Float32Array(STARS.length);
  private readonly starEl = new Float32Array(STARS.length);
  private readonly starX = new Float32Array(STARS.length);
  private readonly starY = new Float32Array(STARS.length);
  private readonly starOn = new Uint8Array(STARS.length);
  private starSidereal = NaN;
  private lightMap: LightMap | null = null;
  private lightMapLevel: Level | null = null;
  private lightMapVersion = -1;

  private readonly textures: Record<TextureName, Texture>;

  constructor(textures: Record<TextureName, Texture>) {
    this.textures = textures;
    this.resize();
  }

  /** Set up everything frame-sized again (VIEW_W × VIEW_H — as currently set, see setViewDetail). */
  private resize(): void {
    this.image = new ImageData(VIEW_W, VIEW_H);
    this.frame = new Uint32Array(this.image.data.buffer);
    this.depth = new Float32Array(VIEW_W);
    this.wallTex = new Array<TextureName | null>(VIEW_W).fill(null);
    this.colAz = new Float32Array(VIEW_W);
    this.colCos = new Float32Array(VIEW_W);
    this.colSin = new Float32Array(VIEW_W);
    this.colFar = new Float32Array(VIEW_W);
    this.colNear = new Float32Array(VIEW_W);
    this.wallKey = new Int32Array(VIEW_W).fill(-1);
    this.wallU = new Float32Array(VIEW_W);
    this.wallFrom = new Int16Array(VIEW_W);
    this.nearTop = new Int16Array(VIEW_W);
    this.wallTo = new Int16Array(VIEW_W);
    this.colRayX = new Float32Array(VIEW_W);
    this.colRayY = new Float32Array(VIEW_W);
    this.blockCount = new Uint8Array(VIEW_W);
    this.blockRef = new Array<Block | null>(VIEW_W * MAX_BLOCKS).fill(null);
    this.blockT0 = new Float32Array(VIEW_W * MAX_BLOCKS);
    this.blockT1 = new Float32Array(VIEW_W * MAX_BLOCKS);
    this.blockFace = new Uint8Array(VIEW_W * MAX_BLOCKS);
    this.blockGroup = new Int32Array(VIEW_W * MAX_BLOCKS);
    this.blockTop = new Int16Array(VIEW_W * MAX_BLOCKS);
    this.blockBottom = new Int16Array(VIEW_W * MAX_BLOCKS);
    this.blockDepth = new Float32Array(VIEW_W * VIEW_H);
  }

  /** Mark what is seen into this level's ready array (kept by the scene): so the explored part of the map isn't lost on return and load. */
  useSeen(level: Level, seen: Uint8Array<ArrayBuffer>): void {
    this.seenLevel = level;
    this.seen = seen;
  }

  /** The map whose images are already prepared (see prepareTextures). */
  private preparedLevel: Level | null = null;
  private preparedBlocks = -1;

  /**
   * Draw all of the map's images in advance: they are drawn on first access, and without this the first look at a new wall
   * caused a frame hitch (noticeable on a weak laptop). Called on the map's first frame and when blocks change.
   */
  private prepareTextures(level: Level): void {
    const t = this.textures;
    const touch = (name: TextureName | null | undefined) => void (name && t[name]);
    touch(level.floor);
    touch(level.ceiling);
    for (const w of level.walls) touch(w);
    for (const layers of level.wallLayers ?? []) for (const name of layers ?? []) touch(name);
    for (const m of level.floorMarks?.values() ?? []) touch(m.texture);
    for (const d of level.doors.values()) touch(d.texture);
    for (const head of level.blocks?.values() ?? []) {
      for (let b: Block | undefined = head; b; b = b.next) {
        for (const part of [b, ...(b.parts ?? [])]) {
          touch(part.front);
          touch(part.side);
          touch(part.top);
        }
      }
    }
    this.preparedLevel = level;
    this.preparedBlocks = level.blocksVersion ?? 0;
  }

  render(level: Level, cam: Camera, billboards: Billboard[]): void {
    if (this.image.width !== VIEW_W || this.image.height !== VIEW_H) this.resize();
    if (this.preparedLevel !== level || this.preparedBlocks !== (level.blocksVersion ?? 0)) this.prepareTextures(level);
    this.proj = PROJ / this.widen;
    this.horizon = CENTER + Math.max(MIN_PITCH, Math.min(MAX_PITCH, cam.pitch)) * RES;
    this.eye = Math.max(0.06, Math.min(0.9, EYE + Math.max(0, cam.z ?? 0)) - (cam.eyeDrop ?? 0));
    // Underground, where the original has light sources, they light the rooms: the overall light fades faster (Opus's decision).
    // lightBoost — light carried by the hero (a lit flare): you see further while it burns.
    this.fade = level.fade * this.sightScale * this.lightBoost * (!level.outdoor && level.lights?.length ? LIT_FADE : 1);
    this.outdoor = level.outdoor ?? null;
    this.fog = this.outdoor?.fog ?? null;
    this.night = this.outdoor ? 1 - smoothstep(0.5, 0.82, this.outdoor.brightness) : 0;
    this.brightness = Math.min(1, (this.outdoor?.brightness ?? 1) + this.darkSight);
    // Shadows and lamp light are computed once per map and again when a script changes the walls.
    if (this.lightMapLevel !== level || this.lightMapVersion !== (level.wallsVersion ?? 0)) {
      this.lightMap = buildLightMap(level);
      this.lightMapLevel = level;
      this.lightMapVersion = level.wallsVersion ?? 0;
    }
    this.walls(level, cam);
    this.prepareFlats(level, billboards);
    this.floorAndCeiling(level, cam);
    this.craters(level, cam);
    this.drawCatalogStars(cam);
    this.drawBlocks(cam);
    this.sprites(cam, this.flatCount > 0 ? billboards.filter((b) => !b.flat) : billboards);
  }

  /** Lying images (corpses) by the floor cells they touch: the floor draws them on top of itself. */
  private readonly flatGrid = new Map<number, FlatSprite[]>();
  private flatCount = 0;

  private prepareFlats(level: Level, billboards: Billboard[]): void {
    this.flatGrid.clear();
    this.flatCount = 0;
    for (const b of billboards) {
      if (!b.flat) continue;
      const f: FlatSprite = { x: b.x, y: b.y, w: b.frame.width * SPRITE_SCALE, h: b.frame.height * SPRITE_SCALE * FLAT_DEPTH_STRETCH, frame: b.frame };
      if (b.angle !== undefined) {
        f.dirX = Math.cos(b.angle);
        f.dirY = Math.sin(b.angle);
      }
      // A lying image can be rotated any way — it occupies a circle with a radius of half its diagonal.
      const r = Math.hypot(f.w, f.h) / 2;
      for (let cy = Math.max(0, Math.floor(b.y - r)); cy <= Math.min(level.height - 1, Math.floor(b.y + r)); cy++) {
        for (let cx = Math.max(0, Math.floor(b.x - r)); cx <= Math.min(level.width - 1, Math.floor(b.x + r)); cx++) {
          const cell = cy * level.width + cx;
          const list = this.flatGrid.get(cell);
          if (list) list.push(f);
          else this.flatGrid.set(cell, [f]);
        }
      }
      this.flatCount++;
    }
  }

  /** Light by distance in "steps", as in Doom. */
  private lightAt(distance: number): number {
    const t = Math.max(0, 1 - distance / this.fade);
    return Math.max(0.1, Math.ceil(t * LIGHT_STEPS) / LIGHT_STEPS);
  }

  /** Beacon light pillar: translucent, brighter near the ground and in the middle, fading toward the sky and the edges. */
  private beam(depth: number, side: number, color: number): void {
    const centerX = VIEW_W / 2 + (side / depth) * this.proj;
    const half = Math.max(2 * RES, (0.3 * this.proj) / depth);
    const bottom = Math.min(VIEW_H, this.horizon + (this.eye * this.proj) / depth);
    const x0 = Math.max(0, Math.floor(centerX - half));
    const x1 = Math.min(VIEW_W, Math.ceil(centerX + half));
    for (let x = x0; x < x1; x++) {
      if ((this.depth[x] ?? 0) < depth) continue;
      const edge = 1 - Math.abs(x + 0.5 - centerX) / half;
      if (edge <= 0) continue;
      for (let y = 0; y < bottom; y++) {
        const up = (bottom - y) / Math.max(1, bottom);
        const alpha = Math.min(1, edge * 1.6) * (0.8 - 0.55 * up);
        const i = y * VIEW_W + x;
        this.frame[i] = mix(this.frame[i]!, color, alpha);
      }
    }
  }

  /** Exit marker on the floor: glows by itself (no darker than 0.8), fades slightly into haze in the distance. */
  private markLit(color: number, distance: number): number {
    const light = this.lightAt(distance);
    return this.fog ? shade(color, Math.max(0.8, light), this.fog, (1 - light) * 0.3) : shade(color, Math.max(0.8, light));
  }

  /** Location zone ring: glows by itself and is visible through haze further than ordinary ground. */
  private glowRing(color: number, distance: number, tint = GLOW_COLOR): number {
    const light = this.lightAt(distance);
    const c = mix(color, tint, tint === GLOW_COLOR ? 0.7 : 0.85);
    return this.fog ? shade(c, Math.max(0.85, light), this.fog, (1 - light) * 0.3) : shade(c, Math.max(0.85, light));
  }

  /**
   * A point at distance distance: under open sky — with haze in the distance, underground — it darkens. lamp — light from lamps
   * and flashes at this point, ao — shadow by walls (1 — none).
   */
  private paint(color: number, distance: number, extra = 1, lamp = 0, ao = 1): number {
    return this.paintLit(color, this.lightAt(distance), extra, lamp, ao);
  }

  /** The same, when light by distance is already computed (light = lightAt(distance)). */
  private paintLit(color: number, light: number, extra: number, lamp: number, ao: number): number {
    if (this.fog) {
      // By day lamps are barely visible; at night they shine at full strength and pierce the haze — visible from afar.
      const glow = lamp * LAMP_GAIN * 1.3 * Math.max(0, 1 - this.brightness * 0.9);
      return shade(color, Math.min(MAX_LIGHT, (light * this.brightness * extra + glow) * ao), this.fog, 1 - Math.max(light, Math.min(1, glow * 2)), glow * ao);
    }
    const glow = lamp * LAMP_GAIN;
    return shade(color, Math.min(MAX_LIGHT, (light * extra + glow) * ao), null, 0, glow * ao);
  }

  /** Shadow by walls at a level point (1 — no shadow). */
  private aoAt(x: number, y: number): number {
    return this.lightMap ? sampleGrid(this.lightMap.ao, this.lightMap, x, y) / 255 : 1;
  }

  /** Light from lamps and flashes at a level point (0 — dark, 1 — like at the lamp itself). */
  private lampAt(x: number, y: number): number {
    let lamp = this.lightMap?.lamp ? (sampleGrid(this.lightMap.lamp, this.lightMap, x, y) / 255) * LAMP_SCALE : 0;
    for (const l of this.lights) {
      const d = Math.hypot(x - l.x, y - l.y);
      if (d < l.radius) lamp += l.strength * (1 - d / l.radius) ** 2;
    }
    return lamp;
  }

  /** Where in a wall a bullet would hit for column x: the cell side (wallFaceKey) and position along it; a door or nothing — null. */
  wallSpotInColumn(x: number): { key: number; u: number } | null {
    const column = Math.max(0, Math.min(VIEW_W - 1, Math.round(x)));
    const key = this.wallKey[column] ?? -1;
    return key < 0 ? null : { key, u: this.wallU[column] ?? 0 };
  }

  /** Wall in a screen column: at what distance and which one. */
  wallInColumn(x: number): { depth: number; texture: TextureName | null } {
    const column = Math.max(0, Math.min(VIEW_W - 1, Math.round(x)));
    return { depth: this.depth[column] ?? Infinity, texture: this.wallTex[column] ?? null };
  }

  /**
   * Where above the sprite with number id to write text (overhead lines): the middle of the top edge in the VIEW_W×VIEW_H frame
   * and the distance. null — the sprite wasn't in the last frame or a wall hides its middle.
   */
  anchorOf(id: number): { x: number; y: number; depth: number } | null {
    const p = this.placements.find((placement) => placement.b.id === id);
    if (!p) return null;
    const x = p.left + p.width / 2;
    const column = Math.round(x);
    if (column < 0 || column >= VIEW_W || (this.depth[column] ?? Infinity) < p.depth) return null;
    return { x, y: p.top, depth: p.depth };
  }

  /** Half-width of the sprite with number id in the last frame — by opaque pixels, in frame points. */
  halfWidthOf(id: number): number | null {
    const p = this.placements.find((placement) => placement.b.id === id);
    if (!p) return null;
    const { frame } = p.b;
    let first = frame.width;
    let last = -1;
    for (let sx = 0; sx < frame.width; sx++) {
      for (let sy = 0; sy < frame.height; sy++) {
        if ((frame.pixels[sy * frame.width + sx] ?? 0) === 0) continue;
        first = Math.min(first, sx);
        last = sx;
        break;
      }
    }
    if (last < first) return null;
    return ((last - first + 1) / frame.width) * p.width * 0.5;
  }

  /**
   * Who a shot at screen column x (VIEW_W×VIEW_H frame) will hit. No need to aim vertically —
   * as in Doom 1, where the bullet found a target above or below the crosshair on its own. The nearest sprite
   * in front of the wall that has opaque pixels in this column is taken.
   * tolerance — margin in pixels, so as not to miss "between pixels".
   * solid — which sprites stop a bullet (corpses and items on the floor let it through); by default — all with a number.
   */
  pickColumn(x: number, tolerance = 1, solid: (id: number) => boolean = () => true): number | null {
    const column = Math.max(0, Math.min(VIEW_W - 1, Math.round(x)));
    const wall = this.depth[column] ?? Infinity;
    let best: Placement | null = null;
    for (const p of this.placements) {
      if (p.b.id === undefined || p.depth > wall || !solid(p.b.id)) continue;
      if (best && p.depth >= best.depth) continue;
      if (this.opaqueInColumn(p, x, tolerance)) best = p;
    }
    return best?.b.id ?? null;
  }

  /**
   * Who frame point (x, y) hit: the nearest sprite that stops bullets, with an opaque point nearby (tolerance —
   * margin in points), not behind a wall or a block. None — null.
   */
  pickPoint(x: number, y: number, tolerance: number, solid: (id: number) => boolean): number | null {
    const column = Math.max(0, Math.min(VIEW_W - 1, Math.round(x)));
    const row = Math.max(0, Math.min(VIEW_H - 1, Math.round(y)));
    const wall = this.depth[column] ?? Infinity;
    let best: Placement | null = null;
    for (const p of this.placements) {
      if (p.b.id === undefined || p.depth > wall || !solid(p.b.id)) continue;
      if (best && p.depth >= best.depth) continue;
      if (this.behindBlock(column, row, p.depth)) continue;
      if (this.opaqueNear(p, x, y, tolerance)) best = p;
    }
    return best?.b.id ?? null;
  }

  /**
   * Where in the image of critter id screen point (x, y) landed: u — left to right, v — top to bottom, 0–1 over the visible part
   * of the sprite (without the frame's transparent margins). No such image at the point — null. For hits on body parts.
   */
  spritePoint(x: number, y: number, id: number): { u: number; v: number } | null {
    let best: Placement | null = null;
    for (const p of this.placements) {
      if (p.b.id !== id || x < p.left || x >= p.left + p.width || y < p.top || y >= p.top + p.height) continue;
      if (!best || p.depth < best.depth) best = p;
    }
    if (!best) return null;
    const { frame } = best.b;
    const box = opaqueBox(frame);
    const fx = ((x - best.left) / best.width) * frame.width;
    const fy = ((y - best.top) / best.height) * frame.height;
    const u = (fx - box.x0) / Math.max(1, box.x1 - box.x0);
    const v = (fy - box.y0) / Math.max(1, box.y1 - box.y0);
    return { u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)) };
  }

  private opaqueNear(p: Placement, x: number, y: number, tolerance: number): boolean {
    const { frame } = p.b;
    for (let dy = -tolerance; dy <= tolerance; dy++) {
      const v = (y + dy - p.top) / p.height;
      if (v < 0 || v >= 1) continue;
      const sy = Math.floor(v * frame.height);
      for (let dx = -tolerance; dx <= tolerance; dx++) {
        const u = (x + dx - p.left) / p.width;
        if (u < 0 || u >= 1) continue;
        if ((frame.pixels[sy * frame.width + Math.floor(u * frame.width)] ?? 0) !== 0) return true;
      }
    }
    return false;
  }

  private opaqueInColumn(p: Placement, x: number, tolerance: number): boolean {
    const { frame } = p.b;
    for (let dx = -tolerance; dx <= tolerance; dx++) {
      const u = (x + dx - p.left) / p.width;
      if (u < 0 || u >= 1) continue;
      const sx = Math.floor(u * frame.width);
      for (let sy = 0; sy < frame.height; sy++) {
        if ((frame.pixels[sy * frame.width + sx] ?? 0) !== 0) return true;
      }
    }
    return false;
  }

  /**
   * A sky row: color by height above the horizon, clouds at CLOUD_HEIGHT, the sun with its glow, stars at night,
   * two rows of mountains at the bottom (the far ones in haze). Walls cover the sky.
   */
  private skyRow(y: number, offset: number, sky: Outdoor, cam: Camera): void {
    if (this.skyAngle !== cam.angle) this.skyColumns(cam);
    const row = y * VIEW_W;
    const e = Math.atan(offset / this.proj);
    const t = Math.min(1, offset / (110 * RES));
    const baseR = sky.skyHorizon.r + (sky.skyTop.r - sky.skyHorizon.r) * t;
    const baseG = sky.skyHorizon.g + (sky.skyTop.g - sky.skyHorizon.g) * t;
    const baseB = sky.skyHorizon.b + (sky.skyTop.b - sky.skyHorizon.b) * t;
    const light = sky.brightness;
    // Clouds: light by day, horizon-colored at sunset, dark at night.
    const cloudR = (sky.skyHorizon.r * 0.35 + 235 * 0.65) * (0.25 + 0.75 * light);
    const cloudG = (sky.skyHorizon.g * 0.35 + 230 * 0.65) * (0.25 + 0.75 * light);
    const cloudB = (sky.skyHorizon.b * 0.35 + 222 * 0.65) * (0.25 + 0.75 * light);
    const cloudDist = e > 0.015 ? CLOUD_HEIGHT / Math.tan(e) : 0;
    const cloudFade = smoothstep(0.015, 0.25, e);
    const drift = sky.clouds ?? 0;
    const stars = Math.max(0, Math.min(1, (0.62 - light) / 0.15));
    // Dark adaptation: background stars, the Milky Way, clouds thin out (by day the clouds stay as they were).
    const adapt = this.nightAdapt;
    const fieldK = adaptStep(ADAPT.field, adapt);
    const galaxy = adaptStep(ADAPT.galaxies, adapt) * stars;
    const clear = 1 - 0.8 * adaptStep(ADAPT.clouds, adapt) * stars;
    const sun = sky.sun;
    const sunUp = sun ? smoothstep(-0.15, 0.05, sun.elevation) : 0;
    // The sun near the horizon is orange, high up — almost white.
    const sunWarm = sun ? 1 - smoothstep(0, 0.5, sun.elevation) : 0;
    // Mountains: the color of the ground in haze, the near ones darker and sharper.
    const fog = sky.fog;
    const far = { r: fog.r * 0.78, g: fog.g * 0.76, b: fog.b * 0.8 };
    const cloudScale = cloudDist * CLOUD_SCALE;
    const cosE = Math.cos(e);
    const sinE = Math.sin(e);
    const sidereal = sky.sidereal;
    const sunDe = sun ? e - sun.elevation : 0;
    const sunNear = !!sun && sunUp > 0 && Math.abs(sunDe) < 0.7;
    const near = { r: fog.r * 0.55 * 0.9 + 20, g: fog.g * 0.52 * 0.9 + 16, b: fog.b * 0.5 * 0.9 + 14 };
    const frame = this.frame;
    const wallFrom = this.wallFrom;
    const wallTo = this.wallTo;
    // The sky is in "big pixels", like everything in the frame (RES = 2): one point for two adjacent columns — half the work.
    for (let x = 0; x < VIEW_W; x += 2) {
      const openA = y < (wallFrom[x] ?? 0) || y >= (wallTo[x] ?? 0);
      const openB = x + 1 < VIEW_W && (y < (wallFrom[x + 1] ?? 0) || y >= (wallTo[x + 1] ?? 0));
      if (!openA && !openB) continue;
      const az = this.colAz[x] ?? 0;
      const hillNear = this.colNear[x] ?? 0;
      const hillFar = this.colFar[x] ?? 0;
      let color: number;
      if (e < hillNear) {
        const k = 0.85 + 0.15 * (e / hillNear);
        color = packRgb(near.r * k, near.g * k, near.b * k);
      } else if (e < hillFar) {
        const k = 0.9 + 0.1 * (e / hillFar);
        color = packRgb(far.r * k, far.g * k, far.b * k);
      } else {
        let r = baseR;
        let g = baseG;
        let b = baseB;
        if (stars > 0 && e > 0.06) {
          // With the real sky the small background stars are dimmer: the bright ones are the catalog stars (drawCatalogStars).
          if (sidereal === undefined) {
            const s = starAt(az, e) * 200 * stars * fieldK;
            r += s;
            g += s;
            b += s;
          } else if (fieldK > 0 || galaxy > 0) {
            this.celestial(x, sinE, cosE, sidereal);
            const s = starAt(this.cRa * Math.cos(this.cDec), this.cDec) * FIELD_STAR * stars * fieldK;
            // Milky Way: a light uneven band along the plane of the Galaxy.
            let milk = 0;
            if (galaxy > 0) {
              const sinB = Math.sin(this.cDec) * SIN_GP + Math.cos(this.cDec) * COS_GP * Math.cos(this.cRa - GALACTIC_POLE.ra);
              const band = Math.exp(-(sinB * sinB) / 0.03);
              if (band > 0.02) milk = band * (0.35 + cloudAt(this.cRa * 70, this.cDec * 70 + 97) * 1.1) * 30 * galaxy;
            }
            r += s + milk * 0.9;
            g += s + milk * 0.95;
            b += s + milk * 1.12;
          }
        }
        // The sun's glow — only near it (no point computing further away).
        if (sunNear) {
          let daz = Math.abs(az - sun!.azimuth) % (Math.PI * 2);
          if (daz > Math.PI) daz = Math.PI * 2 - daz;
          if (daz < 0.7) {
            const dx = daz * cosE;
            const d = Math.sqrt(dx * dx + sunDe * sunDe);
            const glow = (Math.max(0, 1 - d / 0.6) ** 3 * 0.7 + (d < 0.035 ? 1.2 : 0)) * sunUp;
            r += glow * 255;
            g += glow * (235 - sunWarm * 80);
            b += glow * (200 - sunWarm * 130);
          }
        }
        if (cloudDist > 0) {
          const n = cloudAt((this.colCos[x] ?? 0) * cloudScale + drift, (this.colSin[x] ?? 0) * cloudScale);
          const a = smoothstep(0.5, 0.72, n) * 0.9 * cloudFade * clear;
          if (a > 0) {
            r += (cloudR * (0.85 + n * 0.3) - r) * a;
            g += (cloudG * (0.85 + n * 0.3) - g) * a;
            b += (cloudB * (0.85 + n * 0.3) - b) * a;
          }
        }
        color = packRgb(Math.min(255, r), Math.min(255, g), Math.min(255, b));
      }
      if (openA) frame[row + x] = color;
      if (openB) frame[row + x + 1] = color;
    }
  }

  /**
   * The celestial sphere point in the direction of column x at altitude e (into cRa, cDec): the small background stars and the Milky
   * Way are tied to it — they rotate together with the real stars by sidereal time.
   */
  private celestial(x: number, sinE: number, cosE: number, sidereal: number): void {
    // Column direction from north clockwise: cos — minus the world's "south", sin — "east".
    const cosA = -(this.colSin[x] ?? 0);
    const sinA = this.colCos[x] ?? 0;
    const dec = Math.asin(Math.max(-1, Math.min(1, sinE * SIN_LAT + cosE * COS_LAT * cosA)));
    const h = Math.atan2(-cosE * sinA, sinE * COS_LAT - cosE * cosA * SIN_LAT);
    this.cRa = (((sidereal - h) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    this.cDec = dec;
  }

  /**
   * At night — bright catalog stars (stars.ts) over the sky, brighter and larger by magnitude, in their own color; clouds hide them. Constellation
   * lines — when the game asks (constellations > 0), beneath the stars. Also: whether the hero is looking at the starry sky and where
   * to label the constellations.
   */
  private drawCatalogStars(cam: Camera): void {
    this.starLabels.length = 0;
    this.skyGaze = false;
    const sky = this.outdoor;
    const sidereal = sky?.sidereal;
    if (!sky || sidereal === undefined) return;
    const night = Math.max(0, Math.min(1, (0.62 - sky.brightness) / 0.15));
    if (night <= 0) return;
    if (this.skyAngle !== cam.angle) this.skyColumns(cam);
    if (this.starSidereal !== sidereal) {
      this.starSidereal = sidereal;
      STARS.forEach((star, i) => {
        const p = skyPosition(star.ra, star.dec, sidereal);
        this.starAz[i] = p.az;
        this.starEl[i] = p.el;
      });
    }
    for (let i = 0; i < STARS.length; i++) {
      const el = this.starEl[i] ?? 0;
      let daz = ((this.starAz[i] ?? 0) - cam.angle) % (Math.PI * 2);
      if (daz > Math.PI) daz -= Math.PI * 2;
      else if (daz < -Math.PI) daz += Math.PI * 2;
      const on = el > 0.005 && Math.abs(daz) < STAR_VIEW;
      this.starOn[i] = on ? 1 : 0;
      if (!on) continue;
      this.starX[i] = VIEW_W / 2 + this.proj * Math.tan(daz) - 0.5;
      this.starY[i] = this.horizon - this.proj * Math.tan(el);
    }
    // How many stars are visible: at first the FIRST_STARS brightest above the horizon; once adapted to the dark — all of them.
    let above = 0;
    for (let i = 0; i < STARS.length; i++) if ((this.starEl[i] ?? 0) > 0.005) above++;
    const limit = Math.round(FIRST_STARS + Math.max(0, above - FIRST_STARS) * Math.pow(this.nightAdapt, 1.4));
    this.starShown.fill(0);
    let shown = 0;
    for (const i of STARS_BY_MAG) {
      if ((this.starEl[i] ?? 0) <= 0.005) continue;
      if (shown++ >= limit) break;
      this.starShown[i] = 1;
    }
    this.drawDeepSky(cam, sidereal, night);
    const lines = this.constellations * night;
    if (lines > 0.01) {
      for (const pairs of CONSTELLATION_LINES) {
        for (const [a, b] of pairs) {
          if (this.starOn[a] && this.starOn[b]) this.skyLine(this.starX[a]!, this.starY[a]!, this.starX[b]!, this.starY[b]!, lines);
        }
      }
    }
    STARS.forEach((star, i) => {
      if (!this.starOn[i] || !this.starShown[i]) return;
      const x = Math.floor(this.starX[i]!) & ~1;
      const y = Math.floor(this.starY[i]!);
      if (!this.skyOpen(x, y)) return;
      const shine = Math.min(1.6, 1.25 * Math.pow(10, -0.12 * star.mag)) * night * (1 - this.cloudVeil(x, y));
      if (shine <= 0.02) return;
      const tint = STAR_TINTS[star.tint]!;
      const add = (px: number, py: number, k: number) => {
        if (!this.skyOpen(px, py)) return;
        const at = py * VIEW_W + px;
        const c = this.frame[at] ?? 0;
        const v = 230 * shine * k;
        this.frame[at] = packRgb(Math.min(255, (c & 0xff) + v * tint[0]), Math.min(255, ((c >>> 8) & 0xff) + v * tint[1]), Math.min(255, ((c >>> 16) & 0xff) + v * tint[2]));
      };
      // Core — a square of one "big point" of the frame (RES × RES), two for bright ones; around bright ones — a halo, for the brightest —
      // also cross-shaped rays: so real stars are noticeably larger than the small background stars.
      const size = star.mag < 1.5 ? 2 * RES : RES;
      const x0 = x - (size > RES ? RES / 2 : 0);
      const y0 = y - (size > RES ? RES / 2 : 0);
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) add(x0 + dx, y0 + dy, 1);
      if (star.mag < 2.6) {
        const glow = star.mag < 1.5 ? 0.45 : 0.3;
        for (let d = 0; d < size; d++) {
          add(x0 + d, y0 - 1, glow);
          add(x0 + d, y0 + size, glow);
          add(x0 - 1, y0 + d, glow);
          add(x0 + size, y0 + d, glow);
        }
      }
      if (star.mag < 0.6) {
        const cx = x0 + size / 2;
        const cy = y0 + size / 2;
        for (let d = 2; d <= 4; d++) {
          const k = 0.32 - d * 0.05;
          for (const o of [-1, 0]) {
            add(cx + o, y0 - d, k);
            add(cx + o, y0 + size - 1 + d, k);
            add(x0 - d, cy + o, k);
            add(x0 + size - 1 + d, cy + o, k);
          }
        }
      }
    });
    if (lines > 0.01) {
      CONSTELLATIONS.forEach((c, k) => {
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (const i of CONSTELLATION_STARS[k]!) {
          if (!this.starOn[i]) continue;
          const x = this.starX[i]!;
          const y = this.starY[i]!;
          if (x < 0 || x >= VIEW_W || y < 0 || y >= VIEW_H) continue;
          sx += x;
          sy += y;
          n++;
        }
        if (n > 0 && this.skyOpen(Math.floor(sx / n), Math.floor(sy / n))) this.starLabels.push({ key: c.key, x: sx / n, y: sy / n });
      });
    }
    this.drawMoon(cam, sidereal, night);
    this.drawMeteors(cam, night);
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    this.skyGaze = night > 0.8 && Math.atan((this.horizon - cy) / this.proj) > 0.3 && this.skyOpen(cx, cy);
  }

  /** Where in the frame a sky point is (direction az like the view angle, altitude el); outside the view — null. */
  private skyPoint(cam: Camera, az: number, el: number): { x: number; y: number } | null {
    let daz = (az - cam.angle) % (Math.PI * 2);
    if (daz > Math.PI) daz -= Math.PI * 2;
    else if (daz < -Math.PI) daz += Math.PI * 2;
    if (Math.abs(daz) > STAR_VIEW) return null;
    return { x: VIEW_W / 2 + this.proj * Math.tan(daz), y: this.horizon - this.proj * Math.tan(el) };
  }

  /**
   * Shooting stars: a light trail from tail to head (brighter toward the head), big ones thicker and tinted; clouds dim them.
   * They flare up and fade over their lifetime.
   */
  private drawMeteors(cam: Camera, night: number): void {
    for (const m of this.meteors) {
      const head = this.skyPoint(cam, m.az, m.el);
      if (!head || m.el <= 0.03) continue;
      const tail = this.skyPoint(cam, m.az - m.dAz * m.length, m.el - m.dEl * m.length);
      if (!tail) continue;
      const fade = Math.sin(Math.PI * Math.min(1, m.age / m.life));
      const shine = fade * night * (0.55 + 0.3 * m.size) * (1 - this.cloudVeil(Math.round(head.x), Math.round(head.y)));
      if (shine <= 0.02) continue;
      const steps = Math.ceil(Math.max(Math.abs(head.x - tail.x), Math.abs(head.y - tail.y)));
      if (steps <= 0 || steps > VIEW_W) continue;
      const width = m.size >= 3 ? 2 : 1;
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        const x = Math.round(tail.x + (head.x - tail.x) * k);
        const y = Math.round(tail.y + (head.y - tail.y) * k);
        const v = 255 * shine * k * k;
        for (let w = 0; w < width; w++) this.addSky(x, y + w, v, v * 0.97, v * (m.size >= 3 ? 0.8 : 1));
      }
      // The head of a bright one — a light speck.
      if (m.size >= 2) {
        const v = 200 * shine;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) this.addSky(Math.round(head.x) + dx, Math.round(head.y) + dy, v * 0.5, v * 0.5, v * 0.45);
      }
    }
  }

  /** Add light to a frame point (where the sky is visible). */
  private addSky(x: number, y: number, r: number, g: number, b: number): void {
    if (!this.skyOpen(x, y)) return;
    const at = y * VIEW_W + x;
    const c = this.frame[at] ?? 0;
    this.frame[at] = packRgb(Math.min(255, (c & 0xff) + r), Math.min(255, ((c >>> 8) & 0xff) + g), Math.min(255, ((c >>> 16) & 0xff) + b));
  }

  /** Distant galaxies and nebulae (stars.ts → DEEP_SKY): soft patches that appear once the eyes adapt to the dark. */
  private drawDeepSky(cam: Camera, sidereal: number, night: number): void {
    const show = adaptStep(ADAPT.galaxies, this.nightAdapt) * night;
    if (show <= 0.01) return;
    for (const g of DEEP_SKY) {
      const at = skyPosition(g.ra, g.dec, sidereal);
      if (at.el < 0.05) continue;
      const c = this.skyPoint(cam, at.az, at.el);
      if (!c) continue;
      const radius = g.size * this.proj;
      const reach = Math.ceil(radius * g.stretch);
      const cos = Math.cos(g.tilt);
      const sin = Math.sin(g.tilt);
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const u = (dx * cos + dy * sin) / (radius * g.stretch);
          const v = (-dx * sin + dy * cos) / radius;
          const d = u * u + v * v;
          if (d >= 1) continue;
          const x = Math.round(c.x) + dx;
          const y = Math.round(c.y) + dy;
          const k = (Math.exp(-d * 4) - Math.exp(-4)) * 34 * g.shine * show * (1 - this.cloudVeil(x, y));
          if (k > 0.5) this.addSky(x, y, k * 0.95, k * 0.92, k * 1.05);
        }
      }
    }
  }

  /**
   * The Moon (real position and phase by the game clock — stars.ts → moonPlace): a disc with a lit part, a halo around it.
   * Until the eyes adapt to the dark it's a light blurry blob; once adapted, the seas and craters are visible.
   */
  private drawMoon(cam: Camera, sidereal: number, night: number): void {
    const moon = this.outdoor?.moon;
    if (!moon || night <= 0) return;
    const at = skyPosition(moon.ra, moon.dec, sidereal);
    if (at.el < -MOON_RADIUS) return;
    const c = this.skyPoint(cam, at.az, at.el);
    if (!c) return;
    const sharp = adaptStep(ADAPT.moon, this.nightAdapt);
    const radius = MOON_RADIUS * this.proj;
    const reach = Math.ceil(radius * 2.2);
    const side = moon.waxing ? 1 : -1;
    const halo = (0.4 - 0.25 * sharp) * moon.lit;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const x = Math.round(c.x) + dx;
        const y = Math.round(c.y) + dy;
        if (!this.skyOpen(x, y)) continue;
        const u = dx / radius;
        const v = dy / radius;
        const r = Math.sqrt(u * u + v * v);
        const veil = this.cloudVeil(x, y);
        if (r > 1) {
          const glow = Math.exp(-(r - 1) * (2.5 + 2 * sharp)) * halo * 70 * night * (1 - veil * 0.5);
          if (glow > 0.5) this.addSky(x, y, glow, glow, glow * 0.95);
          continue;
        }
        // Lit part: the boundary of light and shadow is a half-ellipse, by phase; soft at the edge (blurred until adapted).
        const edge = (1 - 2 * moon.lit) * Math.sqrt(Math.max(0, 1 - v * v));
        const soft = 0.08 + 0.25 * (1 - sharp);
        const litK = smoothstep(edge - soft, edge + soft, side * u);
        const rim = smoothstep(1, 1 - soft, r);
        const surface = 0.82 + (moonAt(u, v) - 0.82) * sharp;
        const a = rim * night * (1 - veil * 0.8);
        const shine = (0.07 + 0.93 * litK) * surface;
        const at2 = y * VIEW_W + x;
        const old = this.frame[at2] ?? 0;
        const mix = (o: number, m: number) => Math.min(255, o + (m * shine - o) * a);
        this.frame[at2] = packRgb(mix(old & 0xff, MOON_COLOR.r), mix((old >>> 8) & 0xff, MOON_COLOR.g), mix((old >>> 16) & 0xff, MOON_COLOR.b));
      }
    }
  }

  /** Whether the sky is visible at this frame point: not a wall, above the horizon and above the mountains. */
  private skyOpen(x: number, y: number): boolean {
    if (x < 0 || x >= VIEW_W || y < 0 || y > this.horizon) return false;
    if (y >= (this.wallFrom[x] ?? 0) && y < (this.wallTo[x] ?? 0)) return false;
    const e = Math.atan((this.horizon - y) / this.proj);
    return e > 0.02 && e >= (this.colFar[x] ?? 0) && e >= (this.colNear[x] ?? 0);
  }

  /** How much cloud covers the sky at this frame point (0 — clear, 0.9 — dense cloud). */
  private cloudVeil(x: number, y: number): number {
    const e = Math.atan((this.horizon - y) / this.proj);
    if (e <= 0.015) return 0;
    const dist = (CLOUD_HEIGHT / Math.tan(e)) * CLOUD_SCALE;
    const n = cloudAt((this.colCos[x] ?? 0) * dist + (this.outdoor?.clouds ?? 0), (this.colSin[x] ?? 0) * dist);
    const night = Math.max(0, Math.min(1, (0.62 - (this.outdoor?.brightness ?? 1)) / 0.15));
    return smoothstep(0.5, 0.72, n) * 0.9 * smoothstep(0.015, 0.25, e) * (1 - 0.8 * adaptStep(ADAPT.clouds, this.nightAdapt) * night);
  }

  /** A constellation line across the sky: dim, beneath the stars, only where the sky is visible. */
  private skyLine(x0: number, y0: number, x1: number, y1: number, alpha: number): void {
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    if (steps <= 0 || steps > VIEW_W * 4) return;
    const k = alpha * 0.6;
    const r = CONSTELLATION_LINE.r * k;
    const g = CONSTELLATION_LINE.g * k;
    const b = CONSTELLATION_LINE.b * k;
    for (let i = 0; i <= steps; i++) {
      const x = Math.floor(x0 + ((x1 - x0) * i) / steps);
      const y = Math.floor(y0 + ((y1 - y0) * i) / steps);
      if (!this.skyOpen(x, y)) continue;
      const at = y * VIEW_W + x;
      const c = this.frame[at] ?? 0;
      this.frame[at] = packRgb(Math.min(255, (c & 0xff) + r), Math.min(255, ((c >>> 8) & 0xff) + g), Math.min(255, ((c >>> 16) & 0xff) + b));
    }
  }

  private skyAngle = NaN;

  /** Direction of each column — once per frame. */
  private skyColumns(cam: Camera): void {
    this.skyAngle = cam.angle;
    const turn = ((cam.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    for (let x = 0; x < VIEW_W; x++) {
      const az = turn + Math.atan((x + 0.5 - VIEW_W / 2) / this.proj);
      this.colAz[x] = az;
      this.colCos[x] = Math.cos(az);
      this.colSin[x] = Math.sin(az);
      const hills = mountainsAt(az);
      this.colFar[x] = hills.far;
      this.colNear[x] = hills.near;
    }
  }

  /** Fill row y with one color where there is no wall. */
  private fillOpen(y: number, color: number): void {
    const row = y * VIEW_W;
    for (let x = 0; x < VIEW_W; x++) if (y < (this.wallFrom[x] ?? 0) || y >= (this.wallTo[x] ?? 0)) this.frame[row + x] = color;
  }

  private floorAndCeiling(level: Level, cam: Camera): void {
    const floor = this.textures[level.floor];
    const ceiling = this.textures[level.ceiling];
    const dirX = Math.cos(cam.angle);
    const dirY = Math.sin(cam.angle);
    // Edges of the view: at 90° — 45° from the view direction, wider — further to the sides.
    const w = this.widen;
    const leftX = dirX + dirY * w;
    const leftY = dirY - dirX * w;
    const rightX = dirX - dirY * w;
    const rightY = dirY + dirX * w;
    const sky = this.outdoor;
    for (let y = 0; y < VIEW_H; y++) {
      const below = y > this.horizon;
      const offset = below ? y - this.horizon : this.horizon - y;
      const row = y * VIEW_W;
      if (offset < 0.5) {
        this.fillOpen(y, this.fog ? pack(this.fog) : 0xff000000);
        continue;
      }
      // Under open sky the top is sky: lighter near the horizon, darker higher up; mountains, clouds, sun, stars.
      if (sky && !below) {
        this.skyRow(y, offset, sky, cam);
        continue;
      }
      const height = below ? this.eye : 1 - this.eye;
      const distance = (height * this.proj) / offset;
      let wx = cam.x + distance * leftX;
      let wy = cam.y + distance * leftY;
      const stepX = (distance * (rightX - leftX)) / VIEW_W;
      const stepY = (distance * (rightY - leftY)) / VIEW_W;
      const tex = below ? floor : ceiling;
      const marks = below ? this.markGridOf(level) : null;
      // One texture variant (sand, earth) — without per-cell selection at every point.
      const plain = tex.variants.length === 1 ? tex.pixels : null;
      // Ceiling lights (and glowing things on the floor) don't darken.
      const glowMask = tex.glow;
      const glow = below ? level.glow : undefined;
      // Blue zone: squared radii — no square root at every point.
      const ring = below ? this.zone : null;
      const ringOut = ring ? ring.radius * ring.radius : 0;
      const ringIn = ring ? (ring.radius - ZONE_EDGE) ** 2 : 0;
      const lit =!!this.lightMap?.lamp || this.lights.length > 0;
      const light = this.lightAt(distance);
      // Shadow and lamp light — at the ends of LIGHT_SPAN-point segments, smoothly in between.
      let aoA = this.aoAt(wx, wy);
      let lampA = lit ? this.lampAt(wx, wy) : 0;
      const frame = this.frame;
      const wallFrom = this.wallFrom;
      const wallTo = this.wallTo;
      const width = level.width;
      const inside = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < width && cy < level.height;
      // The cell under the point and everything that depends on it (image variant, marking, location zone) — once per cell, not for
      // every point (floor and ceiling are more than half the frame).
      let lastCell = Number.NaN;
      let pixels = plain ?? tex.pixels;
      let mark: FloorMark | undefined;
      let markPixels: Uint32Array | null = null;
      let zone = 0;
      let exit = 0;
      const exits = below ? level.exitMarks : undefined;
      let flats: FlatSprite[] | undefined;
      const flatGrid = below && this.flatCount > 0 ? this.flatGrid : null;
      for (let x0 = 0; x0 < VIEW_W; x0 += LIGHT_SPAN) {
        const n = Math.min(LIGHT_SPAN, VIEW_W - x0);
        const aoB = this.aoAt(wx + stepX * n, wy + stepY * n);
        const lampB = lit ? this.lampAt(wx + stepX * n, wy + stepY * n) : 0;
        for (let k = 0; k < n; k++) {
          const x = x0 + k;
          // Floor and ceiling aren't visible under a wall.
          if (y < (wallFrom[x] ?? 0) || y >= (wallTo[x] ?? 0)) {
            const cx = Math.floor(wx);
            const cy = Math.floor(wy);
            const key = cy * 65536 + cx;
            if (key !== lastCell) {
              lastCell = key;
              if (!plain) pixels = variantOf(tex, cx, cy);
              const there = inside(cx, cy);
              mark = marks && there ? marks[cy * width + cx] : undefined;
              markPixels = mark ? this.textures[mark.texture].pixels : null;
              zone = glow && there ? (glow[cy * width + cx] ?? 0) : 0;
              exit = exits && there ? (exits[cy * width + cx] ?? 0) : 0;
              flats = flatGrid && there ? flatGrid.get(cy * width + cx) : undefined;
            }
            const tx = (Math.floor(wx * TEX) & (TEX - 1)) >>> 0;
            const ty = (Math.floor(wy * TEX) & (TEX - 1)) >>> 0;
            let color = pixels[ty * TEX + tx] ?? 0;
            // Marking over the floor (stripe, mat, grate): where its image is empty — the floor shows.
            // No temporary arrays and no image lookup at every point: the editor floor lies as a marking in almost every cell.
            if (mark && markPixels) {
              const turn = mark.turn;
              const mu = turn === 0 ? tx : turn === 1 ? ty : turn === 2 ? TEX - 1 - tx : TEX - 1 - ty;
              const mv = turn === 0 ? ty : turn === 1 ? TEX - 1 - tx : turn === 2 ? TEX - 1 - ty : tx;
              const over = markPixels[mv * TEX + mu] ?? 0;
              if (over !== 0) color = over;
            }
            // A corpse lies on the floor: the point of its image under this floor point (the image's "top" — the way it fell, otherwise away from the viewer).
            if (flats) {
              for (const f of flats) {
                const dx = wx - f.x;
                const dy = wy - f.y;
                const fdx = f.dirX ?? dirX;
                const fdy = f.dirY ?? dirY;
                const u = 0.5 + (dy * fdx - dx * fdy) / f.w;
                const v = 0.5 - (dx * fdx + dy * fdy) / f.h;
                if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
                const px = f.frame.pixels[Math.floor(v * f.frame.height) * f.frame.width + Math.floor(u * f.frame.width)] ?? 0;
                if (px !== 0) {
                  color = px;
                  break;
                }
              }
            }
            // Location zones: the ring glows, a faint green tint inside.
            const g = zone;
            // Caravan zone: 0 — outside, 1 — inside, 2 — ring.
            let blue = 0;
            if (ring) {
              const d2 = (wx - ring.x) ** 2 + (wy - ring.y) ** 2;
              blue = d2 > ringOut ? 0 : d2 > ringIn ? 2 : 1;
            }
            if (blue === 2) {
              frame[row + x] = this.glowRing(color, distance, ZONE_BLUE);
            } else if (exit) {
              // Exit: fill with its own color and a bright border along the zone edge; glows — visible in the dark too.
              const sides = exit >> 2;
              const edge = ((sides & 1) && tx < 9) || ((sides & 2) && tx > TEX - 10) || ((sides & 4) && ty < 9) || ((sides & 8) && ty > TEX - 10);
              frame[row + x] = this.markLit(mix(color, (exit & 3) === EXIT_MARK.near ? EXIT_NEAR_COLOR : EXIT_OUT_COLOR, edge ? 0.85 : 0.3), distance);
            } else if (glowMask?.[ty * TEX + tx]) {
              frame[row + x] = shade(color, 1);
            } else if (g === GLOW.ring) {
              frame[row + x] = this.glowRing(color, distance);
            } else {
              if (g === GLOW.inside) color = mix(color, GLOW_COLOR, 0.14);
              if (blue === 1) color = mix(color, ZONE_BLUE, 0.3);
              const t = k / n;
              frame[row + x] = this.paintLit(color, light, 1, lampA + (lampB - lampA) * t, aoA + (aoB - aoA) * t);
            }
          }
          wx += stepX;
          wy += stepY;
        }
        aoA = aoB;
        lampA = lampB;
      }
    }
  }

  /**
   * Holes in the ground (src/engine/crater.ts) — real pits. For each frame column — from near to far, as over
   * terrain: a hole point at distance t appears at row "horizon + (eye + depth) · proj / t"; each next
   * point paints the rows from itself up to the already painted ones (near covers far) — so both the near slope and
   * the far shaft wall are visible. The floor over the hole is already drawn and gets repainted; wall rows are left alone, we don't go past the column's
   * near wall. The deeper, the darker: the shaft's bottom can't be seen.
   */
  private craters(level: Level, cam: Camera): void {
    const list = level.craters;
    if (!list) return;
    const { proj, eye, horizon, frame } = this;
    for (const c of list) {
      const lip = this.textures[c.lip].pixels;
      const slope = this.textures[c.slope].pixels;
      const wall = this.textures[c.wall].pixels;
      const ox = cam.x - c.x;
      const oy = cam.y - c.y;
      const far = ox * ox + oy * oy - c.reach * c.reach;
      // Image along the edge: an image cell is half a level cell around the circle of average radius (image points around the circle).
      const around = 4 * Math.PI * c.mean * TEX;
      // The hole is computed for every second column and paints two (each with its own walls).
      for (let x = 0; x < VIEW_W; x += CRATER_COLUMNS) {
        const x2 = Math.min(VIEW_W - 1, x + CRATER_COLUMNS - 1);
        const rx = this.colRayX[x] ?? 0;
        const ry = this.colRayY[x] ?? 0;
        const a = rx * rx + ry * ry;
        const b = 2 * (ox * rx + oy * ry);
        const disc = b * b - 4 * a * far;
        if (disc <= 0) continue;
        const sq = Math.sqrt(disc);
        let t = Math.max(CRATER_NEAR, (-b - sq) / (2 * a));
        const end = Math.min((-b + sq) / (2 * a), Math.max(this.depth[x] ?? Infinity, this.depth[x2] ?? Infinity));
        if (t >= end) continue;
        // Nothing above this row is painted yet (below it — the near ground).
        let top = Math.min(VIEW_H, horizon + (eye * proj) / t);
        const speed = Math.sqrt(a);
        // Walls and their depth in two columns — once per column, not at every point.
        const depthA = this.depth[x] ?? Infinity;
        const depthB = this.depth[x2] ?? Infinity;
        const fromA = this.wallFrom[x] ?? 0;
        const toA = this.wallTo[x] ?? 0;
        const fromB = this.wallFrom[x2] ?? 0;
        const toB = this.wallTo[x2] ?? 0;
        while (t < end && top > horizon) {
          const px = cam.x + rx * t - c.x;
          const py = cam.y + ry * t - c.y;
          const d = Math.sqrt(px * px + py * py);
          let depth = 0;
          let s = 1;
          let angle = 0;
          if (d < c.reach) {
            angle = fastAtan2(py, px);
            const edge = craterEdge(c, angle);
            s = d / edge;
            if (s < 1) depth = depthAt(c, s);
            else if (px * rx + py * ry > 0) break;
            else {
              // Haven't reached the edge yet: this is ground (its rows are already right) — jump straight to the edge, with a margin (the edge is uneven).
              top = Math.min(top, horizon + (eye * proj) / t);
              t += Math.max(CRATER_STEP, ((d - edge) * 0.5) / speed);
              continue;
            }
          } else if (px * rx + py * ry > 0) break;
          const y = horizon + ((eye + depth) * proj) / t;
          if (y < top) {
            if (depth > 0) {
              const from = Math.max(0, Math.ceil(y));
              const to = Math.min(VIEW_H, Math.ceil(top));
              const tex = s > 1 - LIP ? lip : c.shaft && s < SHAFT ? wall : slope;
              // For a shallow crater and the rim the image lies by plan (per cell), for the slope and shaft — around the circle (rods converge downward).
              const flat = !c.shaft || tex === lip;
              const tx = ((flat ? Math.floor((px + c.x) * TEX) : Math.floor((angle / (Math.PI * 2)) * around)) & (TEX - 1)) >>> 0;
              const flatY = (Math.floor((py + c.y) * TEX) & (TEX - 1)) >>> 0;
              const light = this.lightAt(t);
              // Tied rope: from the beam down the slope and down the shaft wall.
              let rope = false;
              if (c.rope && s < c.rope.from) {
                let turn = angle - c.rope.angle;
                turn = Math.atan2(Math.sin(turn), Math.cos(turn));
                rope = Math.abs(turn * d - ROPE_SIDE) < ROPE_HALF;
              }
              const slopeY = (Math.floor((1 - s) * c.mean * TEX * 0.8) & (TEX - 1)) >>> 0;
              // At the rim and slope the image at a point is the same for the whole strip of rows — the color is computed once.
              const perRow = tex === wall && !rope;
              const same = perRow ? 0 : this.paintLit(rope ? ROPE_COLOR : (tex[(flat ? flatY : slopeY) * TEX + tx] ?? 0), light, 1, 0, 1);
              const step = t / proj;
              for (let row = from; row < to; row++) {
                // Point depth on this row (on the vertical shaft wall — by height, on the slope — almost the same).
                const deep = Math.max(0, (row - horizon) * step - eye);
                const dark = deep >= DEEP_MAX ? 0 : (DEEP_DARK[Math.floor(deep * DEEP_STEPS)] ?? 0);
                let color: number;
                if (dark < 0.02) color = 0xff000000;
                else {
                  color = perRow ? this.paintLit(tex[((Math.floor(deep * TEX * 0.6) & (TEX - 1)) >>> 0) * TEX + tx] ?? 0, light, 1, 0, 1) : same;
                  if (dark < 0.995) color = darken(color, dark);
                }
                const at = row * VIEW_W;
                if (t <= depthA && (row < fromA || row >= toA)) frame[at + x] = color;
                if (x2 !== x && t <= depthB && (row < fromB || row >= toB)) frame[at + x2] = color;
              }
            }
            top = y;
          }
          t += Math.max(CRATER_STEP, t * 0.014) / speed;
        }
      }
    }
  }

  /** The height by which the level's buildings fully fade into the sky (the tallest wall). */
  private hazeTop = 0;

  private walls(level: Level, cam: Camera): void {
    this.hazeTop = level.maxHeight ?? 0;
    this.hazeRange = level.haze ?? null;
    const dirX = Math.cos(cam.angle);
    const dirY = Math.sin(cam.angle);
    // New level (new attempt) — the map is empty again.
    if (this.seenLevel !== level) {
      this.seenLevel = level;
      this.seen = new Uint8Array(level.width * level.height);
    }
    const seen = this.seen;
    const markSeen = (cx: number, cy: number) => {
      if (cx >= 0 && cy >= 0 && cx < level.width && cy < level.height) seen[cy * level.width + cx] = 1;
    };
    const blocks = this.blockGridOf(level);
    for (let x = 0; x < VIEW_W; x++) {
      const camX = ((2 * (x + 0.5)) / VIEW_W - 1) * this.widen;
      const rayX = dirX - dirY * camX;
      const rayY = dirY + dirX * camX;
      this.colRayX[x] = rayX;
      this.colRayY[x] = rayY;
      this.blockCount[x] = 0;
      let mapX = Math.floor(cam.x);
      let mapY = Math.floor(cam.y);
      const deltaX = Math.abs(1 / rayX);
      const deltaY = Math.abs(1 / rayY);
      const stepX = rayX < 0 ? -1 : 1;
      const stepY = rayY < 0 ? -1 : 1;
      let sideX = rayX < 0 ? (cam.x - mapX) * deltaX : (mapX + 1 - cam.x) * deltaX;
      let sideY = rayY < 0 ? (cam.y - mapY) * deltaY : (mapY + 1 - cam.y) * deltaY;
      let side = 0;
      let texName: TextureName | null = null;
      markSeen(mapX, mapY);
      if (blocks) this.hitBlock(blocks[mapY * level.width + mapX], x, cam, rayX, rayY);
      // Door in a cell: a thin wall in the middle of the cell; the part that hasn't slid sideways yet is visible.
      let doorHit = hitDoor(level, mapX, mapY, cam, rayX, rayY, 0, Math.min(sideX, sideY));
      for (let guard = 0; guard < 128 && !doorHit; guard++) {
        if (sideX < sideY) {
          sideX += deltaX;
          mapX += stepX;
          side = 0;
        } else {
          sideY += deltaY;
          mapY += stepY;
          side = 1;
        }
        const enter = side === 0 ? sideX - deltaX : sideY - deltaY;
        if (enter <= SEEN_RANGE) markSeen(mapX, mapY);
        texName = wallAt(level, mapX + 0.5, mapY + 0.5);
        if (texName) {
          // Location editor blocks above this cell's wall (a second-floor window, a piece above a gap) are visible too.
          if (blocks) this.hitBlock(blocks[mapY * level.width + mapX], x, cam, rayX, rayY, true);
          break;
        }
        if (blocks) this.hitBlock(blocks[mapY * level.width + mapX], x, cam, rayX, rayY);
        doorHit = hitDoor(level, mapX, mapY, cam, rayX, rayY, enter, Math.min(sideX, sideY));
      }
      // Perpendicular distance — no "fisheye" effect.
      const dist = Math.max(0.0001, doorHit ? doorHit.t : side === 0 ? sideX - deltaX : sideY - deltaY);
      if (doorHit) {
        texName = doorHit.door.texture;
        side = doorHit.door.axis === 'x' ? 1 : 0;
      }
      // The ray went off into the open distance without hitting a wall — nothing blocks distant sprites (location beacons) in this column.
      this.depth[x] = texName || doorHit ? dist : Infinity;
      this.wallTex[x] = texName;
      this.wallFrom[x] = 0;
      this.wallTo[x] = 0;
      if (!texName) continue;
      let texture = this.textures[texName];
      const vi = doorHit ? 0 : variantIndex(texture, mapX, mapY);
      let tex = texture.variants[vi] ?? texture.pixels;
      // Glowing points (lamps, screens) don't darken.
      let glowMask = texture.glows?.[vi] ?? texture.glow;
      // A wall from the location editor: each storey has its own image (brick below, plaster above).
      const layers = doorHit ? undefined : level.wallLayers?.[mapY * level.width + mapX];
      let storey = 0;
      let tx: number;
      let marks: { u: number; v: number; r: number }[] | undefined;
      let wallU = 0;
      this.wallKey[x] = -1;
      if (doorHit) {
        tx = Math.min(TEX - 1, Math.max(0, Math.floor((doorHit.u - doorHit.door.open) * TEX)));
      } else {
        let hit = side === 0 ? cam.y + dist * rayY : cam.x + dist * rayX;
        hit -= Math.floor(hit);
        tx = Math.floor(hit * TEX);
        if ((side === 0 && rayX < 0) || (side === 1 && rayY > 0)) tx = TEX - 1 - tx;
        // The cell side we see (for bullet marks): a ray going right hits the west side, etc.
        const face = side === 0 ? (rayX > 0 ? 0 : 1) : rayY > 0 ? 2 : 3;
        const key = wallFaceKey(level, mapX, mapY, face);
        this.wallKey[x] = key;
        this.wallU[x] = hit;
        wallU = hit;
        marks = level.decals?.get(key);
      }
      // A tall building (the Cathedral): a multi-storey wall, the image repeats per storey; fades into haze at the top.
      const tall = !doorHit && level.heights ? level.heights[mapY * level.width + mapX] || 1 : 1;
      const unit = this.proj / dist;
      const top = this.horizon - (tall - this.eye) * unit;
      const bottom = this.horizon + this.eye * unit;
      const span = bottom - top;
      // Walls along one axis are slightly darker — so the volume reads better. Light from an opening doesn't darken.
      const emissive = EMISSIVE.has(texName);
      const sideLight = side === 1 ? 0.82 : 1;
      // Light at a wall is taken slightly in front of it (on the player's side), corner shadow — from the floor shadow in front of the wall.
      const hitX = cam.x + dist * rayX;
      const hitY = cam.y + dist * rayY;
      const nx = side === 0 ? -Math.sign(rayX) : 0;
      const ny = side === 1 ? -Math.sign(rayY) : 0;
      const lamp = this.lightMap?.lamp || this.lights.length > 0 ? this.lampAt(hitX + nx * 0.06, hitY + ny * 0.06) : 0;
      const corner = doorHit ? 1 : Math.min(1, this.aoAt(hitX + nx * CORNER_PROBE, hitY + ny * CORNER_PROBE) / wallShade(CORNER_PROBE));
      const indoor = !this.outdoor;
      const y0 = Math.max(0, Math.ceil(top));
      const y1 = Math.min(VIEW_H, Math.ceil(bottom));
      this.wallFrom[x] = y0;
      this.wallTo[x] = y1;
      this.nearTop[x] = y0;
      const light = this.lightAt(dist);
      // Pictures (Cathedral stained glass) and signs — on a wall, not on a door.
      const panel = !doorHit && level.panelAt ? this.panelOf(level, mapX, mapY, side, rayX, rayY) : null;
      const along = side === 0 ? hitY : hitX;
      for (let y = y0; y < y1; y++) {
        // v — position within the storey height (0 — top, 1 — bottom); up — the point's height above ground in storeys (for tall walls).
        const up = tall > 1 ? (bottom - y) / unit : 0;
        // Point height above ground for pictures — for any wall (a sign hangs on a one-storey one too).
        const high = panel ? (bottom - y) / unit : 0;
        if (layers) {
          const k = Math.min(layers.length - 1, Math.max(0, Math.floor(up)));
          if (k !== storey) {
            storey = k;
            texture = this.textures[layers[k] ?? texName];
            const vk = variantIndex(texture, mapX, mapY);
            tex = texture.variants[vk] ?? texture.pixels;
            glowMask = texture.glows?.[vk] ?? texture.glow;
          }
        }
        const rep = texture.repeat ?? 1;
        const v = tall > 1 ? 1 - (up / rep - Math.floor(up / rep)) : (y - top) / span;
        const ty = Math.min(TEX - 1, Math.floor(v * TEX));
        const color = tex[ty * TEX + tx] ?? 0;
        const pn = panel ? Renderer.panelAtHeight(panel, high) : null;
        if (pn) {
          const pc = this.panelPixel(pn, along, high, light, sideLight, lamp);
          if (pc !== 0) {
            this.frame[y * VIEW_W + x] = this.skyHaze(pc, high, tall, y, this.panelLit ? GLOW_THROUGH : 1);
            continue;
          }
        }
        if (tall > 1 && up > 1 / (texture.repeat ?? 1)) {
          // Above the first storey: no floor shadows or bullet marks; glowing windows glow; sky haze at the top.
          const shines = !!glowMask?.[ty * TEX + tx];
          const own = shines ? shade(color, 1) : this.paintLit(color, light, sideLight, lamp, 1);
          const lit = texture.windows && this.night > 0 ? this.windowGlow(texture, ty * TEX + tx, color, own, mapX, mapY, side, Math.floor(up / rep)) : own;
          this.frame[y * VIEW_W + x] = this.skyHaze(lit, up, tall, y, shines || lit !== own ? GLOW_THROUGH : 1);
          continue;
        }
        if (emissive || glowMask?.[ty * TEX + tx]) {
          this.frame[y * VIEW_W + x] = shade(color, 1);
          continue;
        }
        // Shadow by the floor and (under a roof) by the ceiling.
        let contact = (1 - 0.3 * (1 - smoothstep(0, 0.16, 1 - v))) * (indoor ? 1 - 0.22 * (1 - smoothstep(0, 0.1, v)) : 1);
        // Bullet marks: a dark pit, slightly lighter at the edge (chipped material).
        if (marks) {
          for (const m of marks) {
            const du = wallU - m.u;
            const dv = v - m.v;
            const d = Math.sqrt(du * du + dv * dv) / m.r;
            if (d < 1) contact *= d < 0.55 ? 0.22 + d * 0.4 : 1.12;
          }
        }
        const lit = this.paintLit(color, light, sideLight, lamp, corner * contact);
        this.frame[y * VIEW_W + x] = texture.windows && this.night > 0 ? this.windowGlow(texture, ty * TEX + tx, color, lit, mapX, mapY, side, 0) : lit;
      }
      // Tall buildings behind (the Cathedral behind a low courtyard wall): the ray goes further and draws what is visible above the wall.
      if (level.heights && y0 > 0) {
        let covered = y0;
        let fx = mapX;
        let fy = mapY;
        let sx = sideX;
        let sy = sideY;
        for (let guard = 0; guard < 96 && covered > 0; guard++) {
          let farSide: number;
          if (sx < sy) {
            sx += deltaX;
            fx += stepX;
            farSide = 0;
          } else {
            sy += deltaY;
            fy += stepY;
            farSide = 1;
          }
          if (fx < 0 || fy < 0 || fx >= level.width || fy >= level.height) break;
          const cell = fy * level.width + fx;
          const h = level.heights[cell] || 1;
          const name = level.walls[cell];
          if (!name || h <= 1) continue;
          // Round towers: the ray looks for the circles themselves; each is drawn in the cell where the ray hits it, the nearest first.
          const rounds = level.roundsAt?.[cell];
          if (rounds && level.rounds) {
            covered = this.drawRoundsInCell(x, level, rounds, fx, fy, cam, rayX, rayY, covered);
            continue;
          }
          const d = farSide === 0 ? sx - deltaX : sy - deltaY;
          const u2 = this.proj / d;
          const topRow = Math.max(0, Math.ceil(this.horizon - (h - this.eye) * u2));
          if (topRow >= covered) continue;
          covered = this.drawTallSpan(x, level, name, fx, fy, farSide, d, rayX, rayY, cam, h, topRow, covered);
        }
        this.wallFrom[x] = covered;
      }
    }
  }

  /**
   * Sky haze at height: the higher above ground (up, in storeys) on a building of height tall, the more the color turns into the sky —
   * into the sky color of this frame row (near the horizon — haze, higher — blue), so the top of a spire dissolves into it.
   * through — fog share for glowing points (windows shine through it), 1 — as for a wall.
   */
  private skyHaze(color: number, up: number, tall: number, y: number, through = 1): number {
    const sky = this.outdoor;
    if (!sky) return color;
    // By the height of the whole building (the level's tallest wall): lower tiers are sharp, only the top fades — the tip of the spire.
    const range = this.hazeRange;
    const top = Math.max(tall, this.hazeTop);
    // A building lower than three and a half storeys doesn't fade at all (otherwise the haze edges swap and the second storey disappears).
    const from = Math.max(3.5, top * 0.45);
    const t = (range ? Math.min(range.max ?? 0.97, smoothstep(range.from, range.to, up)) : top > from ? Math.min(0.97, smoothstep(from, top, up)) : 0) * through;
    if (t <= 0) return color;
    const k = Math.min(1, Math.max(0, this.horizon - y) / (110 * RES));
    const target = packRgb(
      (sky.skyHorizon.r + (sky.skyTop.r - sky.skyHorizon.r) * k),
      (sky.skyHorizon.g + (sky.skyTop.g - sky.skyHorizon.g) * k),
      (sky.skyHorizon.b + (sky.skyTop.b - sky.skyHorizon.b) * k),
    );
    return mix(color, target, t);
  }

  /**
   * The part of a far tall wall above the near one (frame rows from..to): image by storey, light by distance, haze.
   * Returns the new top boundary of the covered column.
   */
  private drawTallSpan(x: number, level: Level, name: TextureName, cx: number, cy: number, side: number, dist: number, rayX: number, rayY: number, cam: Camera, tall: number, from: number, to: number): number {
    let texture = this.textures[name];
    const vi = variantIndex(texture, cx, cy);
    let tex = texture.variants[vi] ?? texture.pixels;
    let glowMask = texture.glows?.[vi] ?? texture.glow;
    const layers = level.wallLayers?.[cy * level.width + cx];
    let storey = 0;
    const along = side === 0 ? cam.y + dist * rayY : cam.x + dist * rayX;
    const hit = along - Math.floor(along);
    let tx = Math.floor(hit * TEX);
    if ((side === 0 && rayX < 0) || (side === 1 && rayY > 0)) tx = TEX - 1 - tx;
    const unit = this.proj / dist;
    const bottom = this.horizon + this.eye * unit;
    const light = this.lightAt(dist);
    const sideLight = side === 1 ? 0.82 : 1;
    const panel = level.panelAt ? this.panelOf(level, cx, cy, side, rayX, rayY) : null;
    for (let y = from; y < to; y++) {
      const up = (bottom - y) / unit;
      if (layers) {
        const k = Math.min(layers.length - 1, Math.max(0, Math.floor(up)));
        if (k !== storey) {
          storey = k;
          texture = this.textures[layers[k] ?? name];
          const vk = variantIndex(texture, cx, cy);
          tex = texture.variants[vk] ?? texture.pixels;
          glowMask = texture.glows?.[vk] ?? texture.glow;
        }
      }
      const pn = panel ? Renderer.panelAtHeight(panel, up) : null;
      if (pn) {
        const pc = this.panelPixel(pn, along, up, light, sideLight);
        if (pc !== 0) {
          this.frame[y * VIEW_W + x] = this.skyHaze(pc, up, tall, y, this.panelLit ? GLOW_THROUGH : 1);
          continue;
        }
      }
      const rep = texture.repeat ?? 1;
      const ty = Math.min(TEX - 1, Math.floor((1 - (up / rep - Math.floor(up / rep))) * TEX));
      const color = tex[ty * TEX + tx] ?? 0;
      const shines = !!glowMask?.[ty * TEX + tx];
      const own = shines ? shade(color, 1) : this.paintLit(color, light, sideLight, 0, 1);
      const lit = texture.windows && this.night > 0 ? this.windowGlow(texture, ty * TEX + tx, color, own, cx, cy, side, Math.floor(up / rep)) : own;
      this.frame[y * VIEW_W + x] = this.skyHaze(lit, up, tall, y, shines || lit !== own ? GLOW_THROUGH : 1);
    }
    return from;
  }

  /**
   * A window at night: lit or not — by cell, side, storey and window number (at random, share — windowShare); a lit one —
   * with warm light (windowLight) or its own stained-glass color, only brighter (raw — the image point), the brighter the deeper the night.
   */
  private windowGlow(texture: Texture, idx: number, raw: number, color: number, cx: number, cy: number, side: number, storey: number): number {
    const id = texture.windows?.[idx];
    if (!id) return color;
    const h = hash(cx * 4 + side, cy * 131 + storey, id);
    const share = texture.windowShare ?? 0.55;
    if (h > share) return color;
    const k = 0.72 + (h / share) * 0.5;
    let lit: number;
    if (texture.windowLight) {
      const [r, g, b] = texture.windowLight;
      lit = packRgb(Math.min(255, r * k) | 0, Math.min(255, g * k) | 0, Math.min(255, b * k) | 0);
    } else {
      const boost = 2.9 * k;
      lit = packRgb(Math.min(255, (raw & 0xff) * boost + 20) | 0, Math.min(255, ((raw >>> 8) & 0xff) * boost + 12) | 0, Math.min(255, ((raw >>> 16) & 0xff) * boost) | 0);
    }
    return mix(color, lit, this.night * 0.92);
  }

  /** Pictures on this cell side (the side the ray hits); none — null. */
  private panelOf(level: Level, cx: number, cy: number, side: number, rayX: number, rayY: number): LevelPanel[] | null {
    const face = side === 0 ? (rayX > 0 ? 0 : 1) : rayY > 0 ? 2 : 3;
    const list = level.panelAt!.get((cy * level.width + cx) * 4 + face);
    return list ? list.map((n) => level.panels![n]!) : null;
  }

  /** The picture from the list that height up falls into; none — null. */
  private static panelAtHeight(list: LevelPanel[], up: number): LevelPanel | null {
    for (const p of list) if (up >= p.from && up < p.to) return p;
    return null;
  }

  /**
   * A picture point: along — position along the wall (cells), up — height (storeys). Glowing points (stained glass) — at full strength,
   * the rest — under the wall's light (and nearby lamps — lamp). A transparent point — 0 (the wall itself is drawn there).
   */
  private panelPixel(panel: LevelPanel, along: number, up: number, light: number, sideLight: number, lamp = 0): number {
    let pic = panel.image ?? (panel.picture ? this.panelPics.get(panel.picture) : undefined);
    if (!pic) {
      if (!panel.picture) return 0;
      pic = panelPicture(panel.picture);
      this.panelPics.set(panel.picture, pic);
    }
    // Left to right, as seen by someone looking at the wall: for east and north walls — against the coordinate direction.
    const len = panel.a1 - panel.a0;
    const u = panel.face === 'east' || panel.face === 'north' ? (panel.a1 - along) / len : (along - panel.a0) / len;
    // Off the picture (a sign is narrower than the wall cell) — the wall itself.
    if (u < -0.001 || u > 1.001) return 0;
    const px = Math.min(pic.w - 1, Math.max(0, Math.floor(u * pic.w)));
    const row = Math.min(pic.h - 1, Math.max(0, Math.floor(((panel.to - up) / (panel.to - panel.from)) * pic.h)));
    const i = px * pic.h + row;
    const color = pic.pixels[i] ?? 0;
    this.panelLit = !!pic.glow[i];
    if (color === 0) return 0;
    // Glows by itself, but still fades into haze in the distance (otherwise the stained glass hangs over it like a sticker).
    if (pic.glow[i]) return shade(color, 1 + this.night * 0.15, this.fog, (1 - light) * 0.55);
    return this.paintLit(color, light, sideLight, lamp, 1);
  }

  /** Where a ray from (ox, oy) in direction (dx, dy) hits a round tower (distance, as for walls); a miss — null. */
  private roundHit(r: LevelRound, ox: number, oy: number, dx: number, dy: number): number | null {
    const fx = ox - r.x;
    const fy = oy - r.y;
    const a = dx * dx + dy * dy;
    const b = fx * dx + fy * dy;
    const disc = b * b - a * (fx * fx + fy * fy - r.radius * r.radius);
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / a;
    return t > 0 ? t : null;
  }

  private readonly roundT: number[] = [];
  private readonly roundN: number[] = [];

  /** Round towers the ray touches in cell (cx, cy): from near to far, each over what is already drawn. */
  private drawRoundsInCell(x: number, level: Level, list: number[], cx: number, cy: number, cam: Camera, rayX: number, rayY: number, covered: number): number {
    const ts = this.roundT;
    const ns = this.roundN;
    ts.length = 0;
    ns.length = 0;
    for (const n of list) {
      const r = level.rounds![n]!;
      const t = this.roundHit(r, cam.x, cam.y, rayX, rayY);
      if (t === null || Math.floor(cam.x + t * rayX) !== cx || Math.floor(cam.y + t * rayY) !== cy) continue;
      let k = ts.length;
      while (k > 0 && ts[k - 1]! > t) {
        ts[k] = ts[k - 1]!;
        ns[k] = ns[k - 1]!;
        k--;
      }
      ts[k] = t;
      ns[k] = n;
    }
    for (let k = 0; k < ts.length && covered > 0; k++) {
      const r = level.rounds![ns[k]!]!;
      const t = ts[k]!;
      const topRow = Math.max(0, Math.ceil(this.horizon - (r.height - this.eye) * (this.proj / t)));
      if (topRow >= covered) continue;
      covered = this.drawRound(x, r, cam.x + t * rayX, cam.y + t * rayY, t, topRow, covered);
    }
    return covered;
  }

  /**
   * A round tower in column x (frame rows from..to): circle point (hx, hy) at distance dist. The image goes around
   * the tower (an image cell is a cell of length around the circumference) and by storey; the side facing the sun is lighter — you can tell it's round.
   */
  private drawRound(x: number, r: LevelRound, hx: number, hy: number, dist: number, from: number, to: number): number {
    const texture = this.textures[r.texture];
    const tex = texture.pixels;
    const glowMask = texture.glow;
    const ang = Math.atan2(hy - r.y, hx - r.x);
    const arc = (ang + Math.PI) * r.radius;
    const tx = Math.min(TEX - 1, Math.floor((arc - Math.floor(arc)) * TEX));
    const unit = this.proj / dist;
    const bottom = this.horizon + this.eye * unit;
    const light = this.lightAt(dist);
    const facing = Math.cos(ang - (this.outdoor?.sun?.azimuth ?? Math.PI / 4));
    const sideLight = 0.6 + 0.45 * Math.max(0, facing) - 0.12 * Math.max(0, -facing);
    const rep = texture.repeat ?? 1;
    const cx = Math.floor(hx);
    const cy = Math.floor(hy);
    for (let y = from; y < to; y++) {
      const up = (bottom - y) / unit;
      const ty = Math.min(TEX - 1, Math.floor((1 - (up / rep - Math.floor(up / rep))) * TEX));
      const color = tex[ty * TEX + tx] ?? 0;
      const shines = !!glowMask?.[ty * TEX + tx];
      const own = shines ? shade(color, 1) : this.paintLit(color, light, sideLight, 0, 1);
      const lit = texture.windows && this.night > 0 ? this.windowGlow(texture, ty * TEX + tx, color, own, cx, cy, Math.floor(ang * 4), Math.floor(up / rep)) : own;
      this.frame[y * VIEW_W + x] = this.skyHaze(lit, up, r.height, y, shines || lit !== own ? GLOW_THROUGH : 1);
    }
    return from;
  }

  /** Floor marking by cell number; none — null. */
  private markGridOf(level: Level): (FloorMark | undefined)[] | null {
    if (!level.floorMarks || level.floorMarks.size === 0) return null;
    if (this.markGridLevel !== level || this.markGridSize !== level.floorMarks.size) {
      this.markGrid = new Array<FloorMark | undefined>(level.width * level.height);
      for (const [cell, m] of level.floorMarks) this.markGrid[cell] = m;
      this.markGridLevel = level;
      this.markGridSize = level.floorMarks.size;
    }
    return this.markGrid;
  }

  /** Level blocks by cell number; no blocks — null. */
  private blockGridOf(level: Level): (Block | undefined)[] | null {
    if (!level.blocks || level.blocks.size === 0) return null;
    if (this.blockGridLevel !== level || this.blockGridVersion !== (level.blocksVersion ?? 0)) {
      this.blockGrid = new Array<Block | undefined>(level.width * level.height);
      for (const [cell, b] of level.blocks) this.blockGrid[cell] = b;
      this.blockGridLevel = level;
      this.blockGridVersion = level.blocksVersion ?? 0;
    }
    return this.blockGrid;
  }

  /**
   * The ray of column column passes through a cell with block b (or without it): remember the block parts the ray hits.
   */
  private hitBlock(head: Block | undefined, column: number, cam: Camera, rayX: number, rayY: number, aboveWall = false): void {
    for (let b = head; b; b = b.next) {
      if (b.hidden) continue;
      // In a wall cell — only editor blocks (above the wall); a big block — once per column.
      if (aboveWall && b.group === undefined) continue;
      if (b.group !== undefined && this.columnHasGroup(column, b.group)) continue;
      this.hitGroup = b.group ?? 0;
      if (!b.parts) this.hitPart(b, column, cam, rayX, rayY);
      else for (const part of b.parts) this.hitPart(part, column, cam, rayX, rayY);
    }
  }

  /** Whether the column already has a big block with this number (its copies lie in each of its cells). */
  private columnHasGroup(column: number, group: number): boolean {
    const n = this.blockCount[column] ?? 0;
    for (let k = 0; k < n; k++) if (this.blockGroup[column * MAX_BLOCKS + k] === group) return true;
    return false;
  }

  /**
   * The ray hit a block part: where it enters and exits and through which side (0–3 — box sides, 4 — round side).
   * In a column the parts are ordered from near to far.
   */
  private hitPart(b: Block, column: number, cam: Camera, rayX: number, rayY: number): void {
    const n = this.blockCount[column] ?? 0;
    if (n >= MAX_BLOCKS) return;
    let t0: number;
    let t1: number;
    let face: number;
    if (b.round) {
      const r = (b.x1 - b.x0) / 2;
      const ox = cam.x - (b.x0 + r);
      const oy = cam.y - (b.y0 + b.y1) / 2;
      const a = rayX * rayX + rayY * rayY;
      const half = ox * rayX + oy * rayY;
      const disc = half * half - a * (ox * ox + oy * oy - r * r);
      if (disc <= 0) return;
      const root = Math.sqrt(disc);
      t0 = (-half - root) / a;
      t1 = (-half + root) / a;
      face = 4;
    } else {
      let tx0 = -Infinity;
      let tx1 = Infinity;
      let ty0 = -Infinity;
      let ty1 = Infinity;
      if (Math.abs(rayX) > 1e-9) {
        const a = (b.x0 - cam.x) / rayX;
        const c = (b.x1 - cam.x) / rayX;
        tx0 = Math.min(a, c);
        tx1 = Math.max(a, c);
      } else if (cam.x <= b.x0 || cam.x >= b.x1) return;
      if (Math.abs(rayY) > 1e-9) {
        const a = (b.y0 - cam.y) / rayY;
        const c = (b.y1 - cam.y) / rayY;
        ty0 = Math.min(a, c);
        ty1 = Math.max(a, c);
      } else if (cam.y <= b.y0 || cam.y >= b.y1) return;
      t0 = Math.max(tx0, ty0);
      t1 = Math.min(tx1, ty1);
      face = tx0 > ty0 ? (rayX > 0 ? 0 : 1) : rayY > 0 ? 2 : 3;
    }
    if (t1 <= t0) return;
    // Camera above or below the block (an editor ceiling overhead) — only its bottom or top is visible; right against
    // a side or inside — don't draw.
    if (t0 < 0.05) {
      const below = this.eye < (b.base ?? 0) - 0.01;
      if (t1 <= 0.05 || (!below && this.eye <= b.height + 0.01)) return;
      t0 = 0.05;
      face = 5;
    }
    // Into its place by distance. If they start at the same distance (a roof slab and a window in the wall beneath it, both from the cell
    // edge) — the one that extends further is further: its visible part (the slab's underside) is behind the near one and drawn earlier. Distances
    // are stored as float32 — compare with a tolerance.
    let k = n;
    const row = column * MAX_BLOCKS;
    const farther = (j: number): boolean => {
      const d = (this.blockT0[j] ?? 0) - t0;
      return d > 1e-5 || (d > -1e-5 && (this.blockT1[j] ?? 0) > t1);
    };
    while (k > 0 && farther(row + k - 1)) {
      this.blockRef[row + k] = this.blockRef[row + k - 1] ?? null;
      this.blockT0[row + k] = this.blockT0[row + k - 1] ?? 0;
      this.blockT1[row + k] = this.blockT1[row + k - 1] ?? 0;
      this.blockFace[row + k] = this.blockFace[row + k - 1] ?? 0;
      this.blockGroup[row + k] = this.blockGroup[row + k - 1] ?? 0;
      k--;
    }
    this.blockRef[row + k] = b;
    this.blockT0[row + k] = t0;
    this.blockT1[row + k] = t1;
    this.blockFace[row + k] = face;
    this.blockGroup[row + k] = this.hitGroup;
    this.blockCount[column] = n + 1;
  }

  /**
   * Blocks over the floor, from far to near: the side the ray entered (the front has its own image; a round one — a side
   * shaded for volume by the light), the top if the eyes are above it, and the bottom if the eyes are below it (lamp shade). Where a block covered the column
   * is remembered for sprites behind it.
   */
  private drawBlocks(cam: Camera): void {
    const lit = !!this.lightMap?.lamp || this.lights.length > 0;
    for (let x = 0; x < VIEW_W; x++) {
      const n = this.blockCount[x] ?? 0;
      if (n === 0) continue;
      for (let y = 0; y < VIEW_H; y++) this.blockDepth[y * VIEW_W + x] = Infinity;
      const rayX = this.colRayX[x] ?? 0;
      const rayY = this.colRayY[x] ?? 0;
      // From far to near: the near block paints over, and it is the one left in blockDepth.
      for (let k = n - 1; k >= 0; k--) {
        const i = x * MAX_BLOCKS + k;
        const b = this.blockRef[i]!;
        const t0 = this.blockT0[i] ?? 1;
        const t1 = this.blockT1[i] ?? 1;
        const face = this.blockFace[i] ?? 0;
        const base = b.base ?? 0;
        const editor = (this.blockGroup[i] ?? 0) !== 0;
        // A block in the near wall's cell (above it) — visible only above the wall's top.
        const limit = t0 >= (this.depth[x] ?? Infinity) - 1e-4 ? (this.nearTop[x] ?? VIEW_H) : VIEW_H;
        const top = this.horizon - ((b.height - this.eye) * this.proj) / t0;
        const bottom = this.horizon + ((this.eye - base) * this.proj) / t0;
        const hitX = cam.x + t0 * rayX;
        const hitY = cam.y + t0 * rayY;
        let u: number;
        let nx: number;
        let ny: number;
        let sideLight: number;
        if (face === 4) {
          const r = (b.x1 - b.x0) / 2;
          nx = (hitX - b.x0 - r) / r;
          ny = (hitY - (b.y0 + b.y1) / 2) / r;
          // The image wraps around the cylinder twice; the side facing the light (upper left, as for walls) is lighter. For a tube with a body (toViewer)
          // the middle of the image (u = 0.5) faces the viewer.
          const toward = b.toViewer ? Math.atan2(cam.y - (b.y0 + b.y1) / 2, cam.x - b.x0 - r) - Math.PI / 2 : 0;
          u = ((((Math.atan2(ny, nx) - toward) / (Math.PI * 2) + 2) * 2) % 1 + 1) % 1;
          sideLight = 0.66 + 0.4 * (0.5 + 0.5 * (-0.6 * nx - 0.8 * ny));
        } else {
          // Position along the side from left to right, as seen by a viewer outside.
          // Editor block — image per world cell (a big block doesn't stretch it), an ordinary one — by its own width.
          const along = editor ? (face < 2 ? hitY : hitX) % 1 : face < 2 ? (hitY - b.y0) / (b.y1 - b.y0) : (hitX - b.x0) / (b.x1 - b.x0);
          u = face === 1 || face === 2 ? 1 - along : along;
          nx = face === 0 ? -1 : face === 1 ? 1 : 0;
          ny = face === 2 ? -1 : face === 3 ? 1 : 0;
          sideLight = face >= 2 ? 0.82 : 1;
        }
        const tex = this.textures[face === 4 || face === b.facing ? b.front : b.side];
        const tx = Math.min(TEX - 1, Math.max(0, Math.floor(u * TEX)));
        const lamp = lit ? this.lampAt(hitX + nx * 0.06, hitY + ny * 0.06) : 0;
        const ao = Math.sqrt(this.aoAt(hitX + nx * 0.1, hitY + ny * 0.1));
        const light = this.lightAt(t0);
        // Overhead or underfoot (face 5): no side — only the bottom or top up to the far edge.
        const inside = face === 5;
        const y0 = inside ? VIEW_H : Math.max(0, Math.ceil(top));
        const y1 = inside ? 0 : Math.min(VIEW_H, Math.ceil(bottom), limit);
        const span = bottom - top;
        const perUnit = t0 / this.proj;
        for (let y = y0; y < y1; y++) {
          // Editor block — an image for every storey of height, an ordinary one — one for the whole block.
          const up = editor ? this.eye + (this.horizon - y - 0.5) * perUnit : 0;
          const v = editor ? 1 - (up - Math.floor(up)) : (y - top) / span;
          const idx = Math.min(TEX - 1, Math.floor(v * TEX)) * TEX + tx;
          const color = tex.pixels[idx] ?? 0;
          // A hole in the image (between legs) — what is behind the block shows there.
          if (color === 0) continue;
          this.blockDepth[y * VIEW_W + x] = t0;
          if (tex.glow?.[idx]) {
            this.frame[y * VIEW_W + x] = shade(color, 1);
            continue;
          }
          // Shadow by the floor (for things standing on the floor).
          const contact = base > 0 ? 1 : 1 - 0.35 * (1 - smoothstep(0, 0.12, 1 - v));
          this.frame[y * VIEW_W + x] = this.paintLit(color, light, sideLight, lamp, ao * contact);
        }
        let from = y0;
        let to = y1;
        // Top — between the far and near edge (for a round one all points between them are inside the circle).
        if (this.eye > b.height + 0.01) {
          const lift = (this.eye - b.height) * this.proj;
          const ys = Math.max(0, Math.ceil(this.horizon + lift / t1));
          const ye = Math.min(VIEW_H, y0);
          const topTex = this.textures[b.top];
          // Lamp light on the top — one for the whole block (at the middle): computing it at every point is expensive.
          const topLamp = lit ? this.lampAt((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2) : 0;
          for (let y = ys; y < ye; y++) {
            const d = lift / Math.max(0.5, y + 0.5 - this.horizon);
            const fx = (cam.x + d * rayX - b.x0) / (b.x1 - b.x0);
            const fy = (cam.y + d * rayY - b.y0) / (b.y1 - b.y0);
            // The top is rotated by the front side: the bottom of the image is at the front, the top at the back wall (a round one doesn't care).
            const f = b.round ? 3 : b.facing;
            const tu = f === 3 ? fx : f === 2 ? 1 - fx : f === 1 ? 1 - fy : fy;
            const tv = f === 3 ? fy : f === 2 ? 1 - fy : f === 1 ? fx : 1 - fx;
            const idx = Math.min(TEX - 1, Math.max(0, Math.floor(tv * TEX))) * TEX + Math.min(TEX - 1, Math.max(0, Math.floor(tu * TEX)));
            const color = topTex.pixels[idx] ?? 0;
            if (color === 0) continue;
            this.blockDepth[y * VIEW_W + x] = t0;
            this.frame[y * VIEW_W + x] = topTex.glow?.[idx] ? shade(color, 1) : this.paintLit(color, this.lightAt(d), 1.08, topLamp, ao);
          }
          from = Math.min(from, ys);
        }
        // Bottom — if the eyes are below it (lamp shade, a shelf overhead): dark, with the same image as the side.
        if (this.eye < base - 0.01) {
          const drop = (base - this.eye) * this.proj;
          const ys = Math.max(0, y1);
          const ye = Math.min(VIEW_H, Math.ceil(this.horizon - drop / t1), limit);
          const sideTex = this.textures[b.side];
          for (let y = ys; y < ye; y++) {
            const d = drop / Math.max(0.5, this.horizon - y - 0.5);
            // Editor ceiling — image per world cell, like the floor; the underside of a lamp shade — as a strip of the side.
            let idx = (TEX - 8) * TEX + tx;
            if (editor) {
              const wx = cam.x + d * rayX;
              const wy = cam.y + d * rayY;
              idx = Math.min(TEX - 1, Math.floor((wy - Math.floor(wy)) * TEX)) * TEX + Math.min(TEX - 1, Math.floor((wx - Math.floor(wx)) * TEX));
            }
            const color = sideTex.pixels[idx] ?? 0;
            if (color === 0) continue;
            this.blockDepth[y * VIEW_W + x] = t0;
            this.frame[y * VIEW_W + x] = sideTex.glow?.[idx] ? shade(color, 1) : this.paintLit(color, this.lightAt(d), editor ? 0.7 : 0.55, lamp, ao);
          }
          to = Math.max(to, ye);
        }
        this.blockTop[i] = from;
        this.blockBottom[i] = to;
      }
    }
  }

  /**
   * What is in the crosshair (x, y) of the last frame ("examine"): a block part or a wall — right under the point; a sprite with a number
   * (critter, item) — in the crosshair column at any height, as for a shot (no need to pin a low rat with the point); the nearest
   * of them. Nothing (sky) — null.
   */
  pickAt(x: number, y: number): { id?: number; block?: Block; depth: number } | null {
    const column = Math.max(0, Math.min(VIEW_W - 1, Math.round(x)));
    const row = Math.max(0, Math.min(VIEW_H - 1, Math.round(y)));
    const wall = this.depth[column] ?? Infinity;
    let best: { id?: number; block?: Block; depth: number } | null = wall < Infinity ? { depth: wall } : null;
    const n = this.blockCount[column] ?? 0;
    for (let k = 0; k < n; k++) {
      const i = column * MAX_BLOCKS + k;
      if (row < (this.blockTop[i] ?? 0) || row >= (this.blockBottom[i] ?? 0)) continue;
      const depth = this.blockT0[i] ?? Infinity;
      if (!best || depth < best.depth) best = { block: this.blockRef[i]!, depth };
      break;
    }
    for (const p of this.placements) {
      if (p.b.id === undefined || (best && p.depth >= best.depth)) continue;
      if (this.opaqueInColumn(p, x, 2 * RES)) best = { id: p.b.id, depth: p.depth };
    }
    return best;
  }

  /**
   * Whether a sprite at distance depth at frame point (x, y) is hidden by a block: the block is painted there and closer. Through a hole in the block's
   * image the sprite is visible (client request, 2026-10-24: brahmin in a pen were not visible through the fence).
   */
  private behindBlock(x: number, y: number, depth: number): boolean {
    if (!(this.blockCount[x] ?? 0)) return false;
    return depth > (this.blockDepth[y * VIEW_W + x] ?? Infinity);
  }

  private sprites(cam: Camera, billboards: Billboard[]): void {
    const dirX = Math.cos(cam.angle);
    const dirY = Math.sin(cam.angle);
    const visible = billboards
      .map((b) => {
        const dx = b.x - cam.x;
        const dy = b.y - cam.y;
        // depth — along the view, side — to the right of the view.
        return { b, depth: dx * dirX + dy * dirY, side: -dx * dirY + dy * dirX };
      })
      .filter((s) => s.depth > 0.1)
      .sort((a, b) => b.depth - a.depth);

    this.placements = [];
    for (const { b, depth, side } of visible) {
      if (b.beam) {
        this.beam(depth, side, b.beam === 'blue' ? BEAM_BLUE : BEAM_COLOR);
        continue;
      }
      const scale = (SPRITE_SCALE * this.proj * (b.scale ?? 1)) / depth;
      const width = b.frame.width * scale;
      const height = b.frame.height * scale;
      const centerX = VIEW_W / 2 + (side / depth) * this.proj + b.shiftX * scale;
      const bottom = this.horizon + (this.eye * this.proj) / depth + b.shiftY * scale;
      const left = centerX - width / 2;
      const top = bottom - height;
      this.placements.push({ b, left, top, width, height, depth });
      const x0 = Math.max(0, Math.ceil(left));
      const x1 = Math.min(VIEW_W, Math.ceil(left + width));
      const y0 = Math.max(0, Math.ceil(top));
      const y1 = Math.min(VIEW_H, Math.ceil(bottom));
      // Light where the sprite stands; the wall shadow on it is weaker than on the floor.
      const lamp = this.lightMap?.lamp || this.lights.length > 0 ? this.lampAt(b.x, b.y) : 0;
      const ao = Math.sqrt(this.aoAt(b.x, b.y));
      const alpha = b.alpha ?? 1;
      if (alpha <= 0.02) continue;
      for (let x = x0; x < x1; x++) {
        if ((this.depth[x] ?? 0) < depth) continue;
        const sx = Math.min(b.frame.width - 1, Math.floor(((x - left) / width) * b.frame.width));
        const masked = (this.blockCount[x] ?? 0) > 0;
        for (let y = y0; y < y1; y++) {
          const sy = Math.min(b.frame.height - 1, Math.floor(((y - top) / height) * b.frame.height));
          const color = b.frame.pixels[sy * b.frame.width + sx] ?? 0;
          if (color === 0) continue;
          if (masked && this.behindBlock(x, y, depth)) continue;
          const i = y * VIEW_W + x;
          const lit = b.glow ? color : this.paint(color, depth, 1, lamp, ao);
          this.frame[i] = alpha < 1 ? mix(this.frame[i] ?? 0, lit, alpha) : lit;
        }
      }
    }
  }
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Intersection of the ray with the door in cell (cx, cy), if it is inside the cell (between enter and exit along the ray)
 * and hits the part of the door that hasn't slid away yet: u — position on the door from 0 to 1.
 */
function hitDoor(
  level: Level,
  cx: number,
  cy: number,
  cam: Camera,
  rayX: number,
  rayY: number,
  enter: number,
  exit: number,
): { t: number; u: number; door: Door } | null {
  const door = level.doors.get(cy * level.width + cx);
  // The scene draws the pen gate with waist-high blocks — the ray doesn't see it.
  if (!door || door.open >= 1 || door.gate) return null;
  let t: number;
  let u: number;
  if (door.axis === 'x') {
    if (Math.abs(rayY) < 1e-9) return null;
    t = (cy + 0.5 - cam.y) / rayY;
    u = cam.x + t * rayX - cx;
  } else {
    if (Math.abs(rayX) < 1e-9) return null;
    t = (cx + 0.5 - cam.x) / rayX;
    u = cam.y + t * rayY - cy;
  }
  if (t < enter || t > exit || t <= 0) return null;
  if (u < door.open || u >= 1) return null;
  return { t, u, door };
}
