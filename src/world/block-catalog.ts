// Location editor blocks: what locations are drawn with. A block is a texture; the storey decides where it goes: on storey 0 it is floor, above it
// a wall (a solid column), above a gap a hanging block (lintel, ceiling). Special blocks are the door (storey 1 only)
// and the window (sill and top of the opening, see-through in the middle).
// Block library: the blocks folder (src/world/block-library.ts); a block's name is its folder name. The game exports our
// textures (src/engine/textures.ts) there as images itself; a block with our texture is tex:<texture>, a custom block from a
// folder is b:<name>. Old names (wall-…, floor-…, door, window, own-…) are still read.
import type { TextureName } from '../engine/textures.ts';

export type BlockKind = 'floor' | 'wall' | 'door' | 'window';

export interface BlockDef {
  id: string;
  kind: BlockKind;
  texture: TextureName;
  name: { ru: string; en: string };
  /** Door: sound letter from the player's copy (SODOORS<letter>) or b:<name> for custom sounds from the block folder. */
  sound?: string;
}

const floor = (texture: TextureName, ru: string, en: string): BlockDef => ({ id: `floor-${texture}`, kind: 'floor', texture, name: { ru, en } });
const wall = (texture: TextureName, ru: string, en: string): BlockDef => ({ id: `wall-${texture}`, kind: 'wall', texture, name: { ru, en } });

export const DOOR_BLOCK = 'door';
/** Window: sill and top of the opening, see-through in the middle; the frame comes from its column's wall. */
export const WINDOW_BLOCK = 'window';
/** Shady Sands round window: a block filling the whole storey, see-through hole, impassable (ColumnStorey.window = 'round'). */
export const ROUND_WINDOW_BLOCK = 'window-round';

/** Blocks from the editor's early stages (old names in variant files). */
export const BLOCKS: readonly BlockDef[] = [
  floor('sand', 'Песок', 'Sand'),
  floor('dirt', 'Земля', 'Dirt'),
  floor('floor', 'Пол убежища', 'Vault floor'),
  floor('asphalt', 'Асфальт', 'Asphalt'),
  floor('concrete', 'Бетонный пол', 'Concrete floor'),
  floor('retroFloor', 'Пол Братства', 'Brotherhood floor'),
  floor('chromeFloor', 'Пол Убежища 13 (хром)', 'Vault 13 floor (chrome)'),
  floor('rustFloor', 'Пол Убежища 15 (ржавый)', 'Vault 15 floor (rusty)'),
  wall('rock', 'Скала', 'Rock'),
  wall('metal', 'Металл убежища', 'Vault metal'),
  wall('military', 'Военный металл', 'Military metal'),
  wall('adobe', 'Саман (глина)', 'Adobe'),
  wall('scrap', 'Металлолом', 'Scrap metal'),
  wall('ruin', 'Руины', 'Ruins'),
  wall('brick', 'Кирпич', 'Brick'),
  wall('concrete', 'Бетон', 'Concrete'),
  wall('plaster', 'Штукатурка', 'Plaster'),
  wall('retroWall', 'Стена Братства', 'Brotherhood wall'),
  wall('chromeWall', 'Хром Убежища 13', 'Vault 13 chrome'),
  wall('canvas', 'Брезент палатки', 'Tent canvas'),
  wall('vaultRust', 'Ржавые панели Убежища 15', 'Vault 15 rusty panels'),
  wall('gothicWall', 'Камень Собора', 'Cathedral stone'),
  { id: DOOR_BLOCK, kind: 'door', texture: 'slidingDoor', name: { ru: 'Дверь', en: 'Door' } },
  { id: WINDOW_BLOCK, kind: 'window', texture: 'concrete', name: { ru: 'Окно', en: 'Window' } },
  { id: ROUND_WINDOW_BLOCK, kind: 'window', texture: 'adobeWindow', name: { ru: 'Окно круглое (Шэйди Сэндс)', en: 'Round window (Shady Sands)' } },
];

/** Names of our textures, also their folder names in the block library (a texture without a name gets a folder with its code name). */
export const BUILTIN_NAMES: Partial<Record<TextureName, string>> = {
  metal: 'Vault metal',
  military: 'Military metal',
  rock: 'Rock',
  floor: 'Vault floor',
  ceiling: 'Vault ceiling',
  dirt: 'Dirt',
  rockCeiling: 'Cave ceiling',
  door: 'Blast door',
  daylight: 'Daylight',
  elevator: 'Elevator doors',
  slidingDoor: 'Sliding door',
  forcefield: 'Force field',
  water: 'Water',
  sand: 'Sand',
  pressedSand: 'Packed sand',
  policeBoxFront: 'Blue box (doors)',
  policeBoxTop: 'Blue box (roof)',
  policeBoxLamp: 'Blue box (lamp)',
  adobe: 'Adobe (clay)',
  adobeLight: 'Light adobe (Shady Sands)',
  adobeRoof: 'House roof (Shady Sands)',
  adobePost: 'Fence post',
  chromeWall: 'Vault 13 chrome',
  canvas: 'Tent canvas',
  chromeFloor: 'Vault 13 floor (chrome)',
  rustFloor: 'Vault 15 floor (rusty)',
  chromeCeiling: 'Vault 13 ceiling (chrome)',
  chromeDoor: 'Vault 13 door (chrome)',
  rustCeiling: 'Vault 15 ceiling (rusty)',
  adobeWindow: 'Adobe with round window',
  fenceGate: 'Pen gate',
  fenceRail: 'Fence',
  fenceTop: 'Fence (top)',
  obelisk: 'Stone monument',
  ruinFacade: 'Ruined high-rise facade',
  scrap: 'Scrap metal',
  ruin: 'Ruins',
  brick: 'Brick',
  concrete: 'Concrete',
  plaster: 'Plaster',
  asphalt: 'Asphalt',
  vaultDoorL: 'Vault door (left)',
  vaultDoorR: 'Vault door (right)',
  terminalFront: 'Terminal front',
  terminalSide: 'Terminal side',
  terminalTop: 'Terminal top',
  lockerFront: 'Locker',
  wallLockerFront: 'Wall locker',
  metalSide: 'Metal (side)',
  metalTop: 'Metal (top)',
  shelfFront: 'Shelving',
  woodSide: 'Wood (side)',
  woodTop: 'Wood (top)',
  deskFront: 'Desk',
  tableFront: 'Table',
  feltTop: 'Felt',
  crateSide: 'Crate (side)',
  crateTop: 'Crate (top)',
  chestFront: 'Chest front',
  chestSide: 'Chest side',
  chestTop: 'Chest top',
  fridgeFront: 'Fridge',
  fridgeSide: 'Enamel',
  dresserFront: 'Dresser',
  bedSide: 'Bed (side)',
  bedTop: 'Bedding',
  bunkFront: 'Bunk bed',
  slotFront: 'Slot machine',
  slotSide: 'Slot machine (side)',
  sinkFront: 'Sink',
  sinkTop: 'Sink (top)',
  barrelSide: 'Barrel (side)',
  barrelTop: 'Barrel (top)',
  fireTop: 'Fire',
  fabric: 'Fabric',
  poleMetal: 'Metal pole',
  lampHead: 'Lamp',
  hydrant: 'Fire hydrant',
  drawersFront: 'Desk drawers',
  mattressSide: 'Mattress',
  panelFront: 'Electrical panel',
  stripeLine: 'Road marking line',
  stripeCross: 'Road marking crossing',
  floorMat: 'Floor mat',
  drain: 'Drain',
  manhole: 'Manhole',
  trapdoor: 'Trapdoor',
  pit: 'Pit',
  ventGrille: 'Vent grille',
  pipeRun: 'Pipes',
  wireRun: 'Wires',
  glassWindow: 'Glass',
  signStop: 'Stop sign',
  signYield: 'Yield sign',
  signArrow: 'Arrow sign',
  carBody: 'Car body',
  carCabin: 'Car cabin',
  tire: 'Tires',
  wellStone: 'Well stone',
  wellTop: 'Well (top)',
  shaftBroken: 'Shaft (broken)',
  shaftRope: 'Shaft with rope',
  stairsDown: 'Stairs down',
  noticeBoard: 'Notice board',
  vendingFront: 'Soda machine',
  gateBars: 'Wrought iron gate',
  barrierStripe: 'Barrier arm',
  bridgePlanks: 'Plank walkway',
  liftGrate: 'Elevator grate',
  stasisTube: 'Storage tube',
  stasisTubeBroken: 'Broken tube',
  retroWall: 'Brotherhood wall',
  retroFloor: 'Brotherhood floor',
  retroCeiling: 'Brotherhood ceiling',
  retroDoor: 'Brotherhood door',
  gothicWall: 'Cathedral stone',
  gothicSpire: 'Cathedral spire',
  gothicDoor: 'Cathedral door',
  cathBase: 'Cathedral plinth',
  cathTower: 'Cathedral tower',
  cathPier: 'Cathedral pier',
  cathDrum: 'Dome drum',
  cathDome: 'Cathedral dome',
  caveWall: 'Dark rock',
  caveFloor: 'Cave stone',
  cobbles: 'Cobblestone',
  caveCeiling: 'Dark ceiling',
  vaultClean: 'Clean vault wall',
  vaultRust: 'Rusty copper wall',
  rubble: 'Rubble',
  wasteland: 'Wasteland dirt',
  road: 'Road',
  pavement: 'Pavement',
  cement: 'Cement',
  planks: 'Plank floor',
  plankWall: 'Plank wall',
  darkConcrete: 'Dark concrete',
  oldBrick: 'Old brick',
  stucco: 'Clay plaster',
  chainFence: 'Mesh fence',
  chainLink: 'Chain link (see-through)',
  baseFacade: 'Military base facade',
  baseGate: 'Base bar gate',
  guardBooth: 'Guard booth',
  junkPlanks: 'Junktown planks',
  junkSheet: 'Junktown rusty sheeting',
  junkBraced: 'Junktown patchwork wall',
  junkRoof: 'Junktown roof',
  hubPanel: 'Hub concrete panels',
  hubRoof: 'Hub roof (ceiling)',
  hubParapet: 'Hub parapet',
  hubPlaster: 'Hub plaster',
  palisade: 'Palisade',
  wareSiding: 'Warehouse siding',
  wareRoof: 'Warehouse roof (tar paper)',
  toxicSlime: 'Toxic sludge',
  glowPanel: 'Glow concrete slabs',
  glowTile: 'Glow tiles',
  glowGrate: 'Glow floor grate',
  glowCeiling: 'Glow ceiling',
  baseWall: 'Military Base steel sheets',
  baseFloor: 'Military Base ribbed floor',
  bunkerPanel: 'Brotherhood bunker panels',
  bunkerPylon: 'Bunker buttress',
  bunkerDoor: 'Bunker blast door',
  bunkerDome: 'Bunker dome',
  gearFace: 'Torn-off blast door (top)',
  gearRim: 'Torn-off blast door (side)',
  vaultSlab: 'Vault entrance concrete slab',
  craterLip: 'Crater rim (cracked slabs)',
  craterSlope: 'Crater slope (rubble and rebar)',
  craterShaft: 'Crater shaft wall',
  craterScorch: 'Scorched crater earth',
  craterSlab: 'Crater slab (side)',
  craterSlabTop: 'Crater slab (top)',
  girderSteel: 'Steel girder',
  girderRope: 'Girder with tied rope',
  brownConcrete: 'Brown concrete',
  vaultWall: 'Vault wall',
  vaultFloor: 'Vault floor tiles',
  ribbedSteel: 'Ribbed steel',
  darkTiles: 'Dark tiles',
  carpet: 'Carpet',
  brownTile: 'Brown slab',
  woodDoor: 'Plank door',
  panelDoor: 'Panel door',
  curtain: 'Curtain',
  woodGate: 'Wooden gate',
  barsDoor: 'Bar door',
  grayDoor: 'Gray door',
  brownDoor: 'Brown door',
  terminalBroken: 'Broken terminal',
  mainframeFront: 'Mainframe cabinet',
  mainframeBroken: 'Broken mainframe cabinet',
  stoveBody: 'Stove',
  stoveTop: 'Stove top',
  dirtyEnamel: 'Dirty porcelain',
  pipeRiser: 'Riser pipe',
  valveFront: 'Valve',
  pipeMachine: 'Pump and tanks',
  cageLamp: 'Caged lamp',
  brickPatch: 'Brick patch',
  trailerPaint: 'Trailer paint',
};

/** Library block name (folder name): letters, digits, space, hyphen, underscore, parentheses; up to 60 characters. */
export const BLOCK_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _()-]{0,59}$/u;
/** Door sound letter. */
export const DOOR_SOUND = /^[A-Z]$/;

/** Library block: name (folder name), name in location files (tex:… or b:…), texture, block kind, door sound. */
export interface LibraryBlock {
  name: string;
  id: string;
  texture: TextureName;
  kind: 'wall' | 'door' | 'window';
  sound?: string;
}

/** Block library read from the blocks folder (src/world/block-library.ts); empty until read. */
let library = new Map<string, LibraryBlock>();
export function setLibrary(blocks: readonly LibraryBlock[]): void {
  library = new Map(blocks.map((b) => [b.id, b]));
}
export const libraryBlocks = (): LibraryBlock[] => [...library.values()];

const BY_ID = new Map(BLOCKS.map((b) => [b.id, b]));
/** Texture for a block missing from the library (a location from a friend without its folder): a noticeable checkered placeholder. */
export const MISSING_TEXTURE: TextureName = 'missingBlock';

/**
 * Block by name: old names; tex:<texture> is our texture (name from the library); b:<name> is a block from a folder
 * (if there is no such folder, a placeholder, and the name is not lost).
 */
export function blockInfo(id: string, textures?: ReadonlySet<string>): BlockDef | null {
  const known = BY_ID.get(id);
  if (known) return known;
  const own = library.get(id);
  if (own) return { id, kind: own.kind, texture: own.texture, name: { ru: own.name, en: own.name }, ...(own.sound ? { sound: own.sound } : {}) };
  if (id.startsWith('b:') && BLOCK_NAME.test(id.slice(2))) {
    const name = id.slice(2);
    return { id, kind: 'wall', texture: MISSING_TEXTURE, name: { ru: `Нет блока «${name}»`, en: `Missing block “${name}”` } };
  }
  if (!id.startsWith('tex:')) return null;
  const texture = id.slice(4);
  if (textures && !textures.has(texture)) return null;
  const name = BUILTIN_NAMES[texture as TextureName] ?? texture;
  return { id, kind: 'wall', texture: texture as TextureName, name: { ru: name, en: texture } };
}

/**
 * A location's custom block from a variant file (editor stage 5, before the library): kind, our texture, name; a door also has a sound from
 * the player's copy and a lock. The editor moves such blocks into the library; the game still reads them.
 */
export interface CustomBlock {
  id: string;
  kind: 'floor' | 'wall' | 'door';
  texture: TextureName;
  name: string;
  sound?: string;
  locked?: boolean;
}

export const CUSTOM_BLOCK_ID = /^own-\d{1,4}$/;

/** Block by name, taking the location's custom blocks into account (old ones, from the variant file). */
export function blockIn(id: string, custom: readonly CustomBlock[] | undefined, textures?: ReadonlySet<string>): BlockDef | null {
  const own = custom?.find((c) => c.id === id);
  return own ? { id: own.id, kind: own.kind, texture: own.texture, name: { ru: own.name, en: own.name }, ...(own.sound ? { sound: own.sound } : {}) } : blockInfo(id, textures);
}

/** Wall block with this texture. */
export const wallBlockFor = (texture: TextureName): string => `tex:${texture}`;

/** Floor block with this texture. */
export const floorBlockFor = (texture: TextureName): string => `tex:${texture}`;
