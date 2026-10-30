// Location editor (main menu → "Location editor"). A top-down view, like the Tab map, but filling the window: on the left — blocks,
// on the right — floors (floor 0 is the ground, higher — walls and doors), in the middle — the location, painted with the mouse, as in Paint.
// The selected floor is fully visible, floors below are more transparent the further they are, floors above are hidden. Under the cursor — a hint: which
// block it is and what stands in the cell. The "Transitions" tab: entrances, exits and elevators (stairs) — place with a click, select,
// drag, remove with RMB; under the list — where the selected one leads. The "People" tab: key critters (green circle with a white rim)
// can only be moved, enemies (red diamond) — placed, moved, removed; the crowd (pale ring) stands
// at random near its spot in the game and strolls around it (`src/world/people.ts`). Items — as in the game level.
// "Save" — a variant file in the locations folder (`src/world/location-file.ts`); "Walk it yourself" — enter the location
// as a ready hero (`main.ts`), and "Back to editor" in the pause menu returns here with the same drawing.
import { GameData } from '../assets/gamedata.ts';
import type { Sound } from '../audio/sound.ts';
import { doorSfx } from '../game/resources.ts';
import { GameAssets } from '../assets/sprites.ts';
import { TEX, type TextureName } from '../engine/textures.ts';
import { getLang, t, tf } from '../i18n.ts';
import { platform, type LocationListEntry } from '../platform.ts';
import { BLOCK_NAME, blockIn, BUILTIN_NAMES, DOOR_BLOCK, libraryBlocks, MISSING_TEXTURE, ROUND_WINDOW_BLOCK, WINDOW_BLOCK, type BlockDef, type CustomBlock, type LibraryBlock } from '../world/block-catalog.ts';
import { blockFolders, blockSettings, exportBuiltinsOnce, libraryProblems, loadBlockLibrary, MAX_IMAGE, texturePng, writeSettings, type BlockSettings } from '../world/block-library.ts';
import { FACING, parseLevelDef, type Destination, type LevelDef, type ObjectDef } from '../world/defs.ts';
import { gameTextures, textureNames } from '../world/known-textures.ts';
import { LEVELS } from '../world/levels/index.ts';
import { decodeLocation, encodeLocation, ENTRY_NAME, locationFromLevel, LOCATION_LIMITS, marksFromLevel, peopleFromLevel, type EditorLocation, type EditorMarks, type EditorPeople } from '../world/location-file.ts';
import { enemyKinds, isPerson, levelPeople, type LevelPerson, type PersonRole } from '../world/people.ts';
import { blockShapeOf, decorOf, floorMarkOf } from '../game/blocks.ts';
import { furnitureKinds, levelDecor, type DecorItem } from '../world/decor.ts';
import type { ExitLook, LevelDecor } from '../world/defs.ts';
import { PLACES } from '../world/worldmap.ts';

/** Zoom: cell side on screen (pixels), wheel step. */
const ZOOM = { min: 4, max: 64, step: 1.25 };
/** Opacity of floors below the selected one: one below, two below, further. */
const BELOW_ALPHA = [0.45, 0.2, 0.1];
/** How many strokes "undo" remembers. */
const UNDO_LIMIT = 200;
/** Variant name — as checked when writing to the folder (electron/locations.cjs). */
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,59}$/u;

export interface EditorOptions {
  /** Sounds — "Listen" for a custom door. */
  sound?: Sound;
  /** Open this location right away (returned from "Walk it yourself") and whether it had unsaved changes. */
  resume?: EditorLocation;
  resumeDirty?: boolean;
  /** Exit to the main menu. */
  onExit(): void;
  /** "Walk it yourself": enter the drawn location (dirty — there are unsaved changes, return them along with the location). */
  onWalk(location: EditorLocation, dirty: boolean): void;
}

/** A transition on the map: an entrance (by name), an exit or an elevator (by index in the list). */
type MarkKind = 'entry' | 'exit' | 'lift';
type MarkRef = { kind: 'entry'; name: string } | { kind: 'exit' | 'lift'; index: number };
/** Where an entrance faces: labels and angles. */
const FACINGS = [
  ['edFacingN', FACING.north],
  ['edFacingE', FACING.east],
  ['edFacingS', FACING.south],
  ['edFacingW', FACING.west],
] as const;

/** Elevator panel images in INTRFACE.LST (in the order of the edPanels labels): vault, bunker, military, underground. */
const LIFT_PANELS = [148, 143, 150, 146, 147, 151, 152, 144, 145] as const;

/** An item on the editor map: an original item (by key) or one placed here (by index in the list). */
type DecorRef = { kind: 'item'; key: string } | { kind: 'added'; index: number };
/** What the item becomes in the game: a block (furniture), a sprite (tree, rock), a floor marking; null — it is not visible. */
type DecorLook = 'block' | 'picture' | 'mark' | null;
/** A furniture kind in the "Place item" list: prototype, name from the player's copy, what it becomes. */
interface DecorChoice {
  pid: number;
  label: string;
  look: Exclude<DecorLook, null>;
}
const lookOf = (art: string): DecorLook => (floorMarkOf(art) ? 'mark' : decorOf(art) ? 'picture' : blockShapeOf(art) ? 'block' : null);

/** A critter on the editor map: a key one (by key) or an enemy (by index in the list). */
type PersonRef = { kind: 'important'; key: string } | { kind: 'enemy'; index: number };

/** A mouse stroke: what was in the cells before it (floor, cell, block) — for "undo". */
type Stroke = [floor: number, cell: number, before: string | null][];

const levelTitle = (def: LevelDef) => (def.title ? def.title[getLang() === 'en' ? 'en' : 'ru'] : def.id);
const blockName = (b: BlockDef) => b.name[getLang() === 'en' ? 'en' : 'ru'];

export async function showLocationEditor(root: HTMLElement, options: EditorOptions): Promise<void> {
  root.innerHTML = `<main class="setup"><p class="status" role="status"></p></main>`;
  root.querySelector('.status')!.textContent = t('edLoading');
  // Let the "preparing" label appear while the images are being created.
  await new Promise((r) => setTimeout(r, 30));
  let tex = gameTextures();
  let names = textureNames();
  // Our images go to the blocks folder (once per launch, in the background) so they can be redrawn.
  exportBuiltinsOnce(tex);

  root.innerHTML = `
    <main class="editor">
      <header class="editor-top">
        <h1 class="editor-title"></h1>
        <label class="editor-field"><span id="ed-level-label"></span><select id="ed-level"></select></label>
        <label class="editor-field"><span id="ed-variant-label"></span><select id="ed-variant"></select></label>
        <label class="editor-field"><span id="ed-name-label"></span><input id="ed-name" maxlength="60" autocomplete="off" spellcheck="false" /></label>
        <div class="editor-actions">
          <button class="menu-button" id="ed-save" type="button"></button>
          <button class="menu-button menu-primary" id="ed-walk" type="button"></button>
          <button class="menu-button" id="ed-share" type="button"></button>
          <button class="menu-button" id="ed-exit" type="button"></button>
        </div>
      </header>
      <aside class="editor-side editor-blocks">
        <div class="editor-tabs" role="tablist">
          <button class="editor-tab" id="ed-tab-blocks" type="button" role="tab"></button>
          <button class="editor-tab" id="ed-tab-marks" type="button" role="tab"></button>
          <button class="editor-tab" id="ed-tab-people" type="button" role="tab"></button>
          <button class="editor-tab" id="ed-tab-decor" type="button" role="tab"></button>
        </div>
        <input class="editor-filter" id="ed-filter" type="search" autocomplete="off" spellcheck="false" />
        <ul id="ed-blocks" role="listbox"></ul>
        <div class="editor-props" id="ed-props" hidden></div>
      </aside>
      <section class="editor-map"><canvas id="ed-canvas"></canvas><div class="editor-tip" id="ed-tip" hidden></div></section>
      <aside class="editor-side editor-floors">
        <h2 id="ed-floors-title"></h2>
        <ul id="ed-floors" role="listbox"></ul>
        <div class="editor-floor-buttons">
          <button class="menu-button" id="ed-add" type="button"></button>
          <button class="menu-button" id="ed-remove" type="button"></button>
        </div>
        <label class="editor-field editor-ceiling"><span id="ed-ceiling-label"></span><select id="ed-ceiling"></select></label>
      </aside>
      <footer class="editor-status"><span id="ed-hint"></span><span id="ed-msg" role="status"></span></footer>
    </main>`;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  root.querySelector('.editor-title')!.textContent = t('edTitle');
  $('ed-level-label').textContent = t('edLevel');
  $('ed-variant-label').textContent = t('edVariant');
  $('ed-name-label').textContent = t('edName');
  $('ed-save').textContent = t('edSave');
  $('ed-walk').textContent = t('edWalk');
  $('ed-share').textContent = t('edShare');
  $('ed-exit').textContent = t('edExit');
  $('ed-tab-blocks').textContent = t('edBlocks');
  $('ed-tab-marks').textContent = t('edMarks');
  $('ed-tab-people').textContent = t('edPeople');
  $('ed-tab-decor').textContent = t('edDecor');
  $('ed-floors-title').textContent = t('edFloors');
  $('ed-add').textContent = t('edAddFloor');
  $('ed-remove').textContent = t('edRemoveFloor');
  $('ed-hint').textContent = t('edHint');
  const levelSelect = $<HTMLSelectElement>('ed-level');
  const variantSelect = $<HTMLSelectElement>('ed-variant');
  const nameInput = $<HTMLInputElement>('ed-name');
  const canvas = $<HTMLCanvasElement>('ed-canvas');
  const mapBox = root.querySelector<HTMLElement>('.editor-map')!;
  const tip = $('ed-tip');
  const msg = $('ed-msg');
  const say = (text: string, error = false) => {
    msg.textContent = text;
    msg.classList.toggle('editor-error', error);
  };

  // ---------- image samples ----------
  const tiles = new Map<string, HTMLCanvasElement>();
  /** A block image scaled down (averaging pixels — the pattern reads even in a small cell). */
  const tileOf = (texture: TextureName): HTMLCanvasElement | null => {
    let tile = tiles.get(texture);
    if (tile) return tile;
    const source = tex[texture];
    if (!source) return null;
    const full = document.createElement('canvas');
    full.width = full.height = TEX;
    const image = new ImageData(TEX, TEX);
    new Uint32Array(image.data.buffer).set(source.pixels);
    full.getContext('2d')!.putImageData(image, 0, 0);
    tile = document.createElement('canvas');
    tile.width = tile.height = 32;
    const c = tile.getContext('2d')!;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(full, 0, 0, 32, 32);
    tiles.set(texture, tile);
    return tile;
  };

  // ---------- state ----------
  const levels = Object.values(LEVELS).sort((a, b) => levelTitle(a).localeCompare(levelTitle(b)));
  let baseDef: LevelDef = LEVELS[options.resume?.base ?? 'shady-sands-e'] ?? levels[0]!;
  let loc: EditorLocation = options.resume ?? locationFromLevel(baseDef);
  let objects: ObjectDef[] = [];
  let floor = 1;
  /** The selected ground block and wall block separately: switching floors does not lose the choice for each kind; null — erase. */
  let pickFloor: string | null = 'tex:sand';
  let pickWall: string | null = 'tex:brick';
  let cell = 16;
  let offX = 0;
  let offY = 0;
  let hover: { x: number; y: number } | null = null;
  let dirty = false;
  const undo: Stroke[] = [];
  let stroke: Stroke | null = null;
  let last: { x: number; y: number } | null = null;
  let erasing = false;
  let pan: { x: number; y: number; ox: number; oy: number } | null = null;
  let space = false;
  /** The left tab: blocks, transitions or people; the transitions tool, the selected transition and the one being dragged. */
  let mode: 'blocks' | 'marks' | 'people' | 'decor' = 'blocks';
  let tool: MarkKind = 'exit';
  let selected: MarkRef | null = null;
  let dragMark: MarkRef | null = null;
  const marks = (): EditorMarks => (loc.marks ??= marksFromLevel(baseDef));
  /** Game level critters; the "People" tab tool (null — move, a number — enemy kind), the selected one and the one being dragged. */
  let people: LevelPerson[] = [];
  let personTool: number | null = null;
  let selectedPerson: PersonRef | null = null;
  let dragPerson: PersonRef | null = null;
  const crowd = (): EditorPeople => (loc.people ??= peopleFromLevel(baseDef));

  // ---------- critter and weapon names — from the player's copy (read in the background; until then — the prototype number) ----------
  let data: GameData | null = null;
  const critterNames = new Map<number, string>();
  const itemNames = new Map<number, string>();
  const asked = new Set<number>();
  const nameOf = (pid: number): string => {
    const name = critterNames.get(pid);
    if (name !== undefined) return name;
    if (data && !asked.has(pid)) {
      asked.add(pid);
      const d = data;
      void d
        .critter(pid)
        .then((p) => critterNames.set(pid, d.critterName(p)))
        .catch(() => critterNames.set(pid, `#${pid & 0xffffff}`))
        .then(() => renderProps());
    }
    return `#${pid & 0xffffff}`;
  };
  /** Enemy kinds for "Place enemy": name and weapon, alphabetical, identical labels — once. */
  let kinds: { pid: number; weapon: number; label: string }[] = enemyKinds().map((k) => ({ ...k, label: `#${k.pid & 0xffffff}` }));
  const loadNames = async () => {
    try {
      data = await GameData.load(await GameAssets.load());
    } catch {
      return;
    }
    const d = data;
    const named = await Promise.all(
      kinds.map(async (k) => {
        const who = await d.critter(k.pid).then((p) => d.critterName(p)).catch(() => `#${k.pid & 0xffffff}`);
        critterNames.set(k.pid, who);
        if (!k.weapon) return { ...k, label: who };
        const weapon = itemNames.get(k.weapon) ?? (await d.item(k.weapon).then((p) => d.itemName(p)).catch(() => ''));
        itemNames.set(k.weapon, weapon);
        return { ...k, label: weapon ? `${who} · ${weapon}` : who };
      }),
    );
    const seen = new Set<string>();
    kinds = named.sort((a, b) => a.label.localeCompare(b.label)).filter((k) => !seen.has(k.label) && seen.add(k.label));
    personTool = null;
    renderBlocks();
    renderProps();
    void readDecorLooks();
    if (mode === 'decor') void readDecorKinds();
  };

  /** Where a critter stands in the editor: a key one — where it was moved or at its own spot, an enemy — its point. */
  const personPoint = (ref: PersonRef): { x: number; y: number } | undefined => {
    if (ref.kind === 'enemy') return crowd().enemies[ref.index];
    const p = people.find((q) => q.key === ref.key);
    return p ? (crowd().moved[p.key] ?? p.def) : undefined;
  };
  /** A key critter or enemy in the cell (key ones first). */
  const personAt = (x: number, y: number): PersonRef | null => {
    const here = (p: { x: number; y: number }) => Math.floor(p.x) === x && Math.floor(p.y) === y;
    const important = people.find((p) => p.role === 'important' && here(crowd().moved[p.key] ?? p.def));
    if (important) return { kind: 'important', key: important.key };
    const enemy = crowd().enemies.findIndex(here);
    return enemy >= 0 ? { kind: 'enemy', index: enemy } : null;
  };
  const samePerson = (a: PersonRef | null, b: PersonRef | null) =>
    !!a && !!b && a.kind === b.kind && (a.kind === 'important' ? a.key === (b as typeof a).key : a.index === (b as { index: number }).index);
  /** One can stand on ground without a wall, door or window at human height, not on a transition, not next to another one and not in furniture. */
  const canStand = (x: number, y: number, who: PersonRef | null) => {
    const taken = personAt(x, y);
    return !loc.floors[1]?.[y * loc.width + x] && !markAt(x, y) && !decorAt(x, y) && (!taken || samePerson(taken, who));
  };

  // ---------- original items: furniture, containers, scenery ----------
  let decorItems: DecorItem[] = [];
  /** What an item becomes and what it is called (by prototype) — from the player's copy, in the background. */
  const decorLooks = new Map<number, DecorLook>();
  const decorNames = new Map<number, string>();
  /** The "Objects" tab tool: null — move, a number — a furniture kind from decorKinds. */
  let decorTool: number | null = null;
  let decorKinds: DecorChoice[] | null = null;
  let selectedDecor: DecorRef | null = null;
  let dragDecor: DecorRef | null = null;
  const edits = (): LevelDecor => (loc.decor ??= { moved: {}, removed: [], added: [] });
  const decorPoint = (ref: DecorRef): { x: number; y: number } | undefined => {
    if (ref.kind === 'added') return edits().added[ref.index];
    const d = decorItems.find((q) => q.key === ref.key);
    return d ? (edits().moved[d.key] ?? d) : undefined;
  };
  /** Original items that are visible in the game (removed, invisible and beyond the location edge — not). */
  const shownDecor = () => {
    const removed = new Set(edits().removed);
    const inside = (d: DecorItem) => d.x >= 0 && d.y >= 0 && d.x < loc.width && d.y < loc.height;
    return decorItems.filter((d) => inside(d) && !removed.has(d.key) && (d.kind !== 'furniture' || decorLooks.get(d.pid) !== null));
  };
  const decorAt = (x: number, y: number): DecorRef | null => {
    const here = (p: { x: number; y: number }) => Math.floor(p.x) === x && Math.floor(p.y) === y;
    const item = shownDecor().find((d) => here(edits().moved[d.key] ?? d));
    if (item) return { kind: 'item', key: item.key };
    const added = edits().added.findIndex(here);
    return added >= 0 ? { kind: 'added', index: added } : null;
  };
  const sameDecor = (a: DecorRef | null, b: DecorRef | null) =>
    !!a && !!b && a.kind === b.kind && (a.kind === 'item' ? a.key === (b as typeof a).key : a.index === (b as { index: number }).index);
  /** An item can be placed on ground without a wall at human height, not on a transition, not next to a critter and not next to another item. */
  const canPut = (x: number, y: number, what: DecorRef | null) => {
    const taken = decorAt(x, y);
    return !loc.floors[1]?.[y * loc.width + x] && !markAt(x, y) && !personAt(x, y) && (!taken || sameDecor(taken, what));
  };
  /** Name and kind of level items (furniture and scenery — scenery prototypes, containers — item prototypes). */
  const readDecorLooks = async () => {
    const d = data;
    if (!d) return;
    const added = edits().added.map((a): DecorItem => ({ key: '', kind: 'furniture', ...a }));
    const todo = [...decorItems, ...added].filter((i, n, all) => !decorNames.has(i.pid) && all.findIndex((j) => j.pid === i.pid) === n);
    await Promise.all(
      todo.map(async (i) => {
        if (i.kind === 'container') {
          const proto = await d.item(i.pid).catch(() => null);
          decorNames.set(i.pid, proto ? d.itemName(proto) : `#${i.pid}`);
          return;
        }
        const proto = await d.scenery(i.pid).catch(() => null);
        decorNames.set(i.pid, proto ? (await d.sceneryText(proto).catch(() => ({ name: '' }))).name || `#${i.pid & 0xffffff}` : `#${i.pid & 0xffffff}`);
        if (i.kind === 'furniture') decorLooks.set(i.pid, proto ? lookOf(await d.sceneryArtName(proto).catch(() => '')) : null);
      }),
    );
    renderProps();
    redraw();
  };
  /** The "Place item" list: all original furniture by section (furniture, plants and rocks, markings); one name per section — once. */
  let readingKinds = false;
  const readDecorKinds = async () => {
    const d = data;
    if (!d || decorKinds || readingKinds) return;
    readingKinds = true;
    const seen = new Set<string>();
    const kinds: DecorChoice[] = [];
    for (const pid of furnitureKinds()) {
      const proto = await d.scenery(pid).catch(() => null);
      if (!proto) continue;
      const look = lookOf(await d.sceneryArtName(proto).catch(() => ''));
      const label = (await d.sceneryText(proto).catch(() => ({ name: '' }))).name.trim();
      if (!look || !label || seen.has(`${look}:${label}`)) continue;
      seen.add(`${look}:${label}`);
      kinds.push({ pid, label, look });
    }
    const order: DecorLook[] = ['block', 'picture', 'mark'];
    decorKinds = kinds.sort((a, b) => order.indexOf(a.look) - order.indexOf(b.look) || a.label.localeCompare(b.label));
    if (mode === 'decor') renderBlocks();
  };

  /** A transition in the cell (entrances first). */
  const markAt = (x: number, y: number): MarkRef | null => {
    const m = marks();
    const here = (p: { x: number; y: number }) => Math.floor(p.x) === x && Math.floor(p.y) === y;
    const name = Object.keys(m.entries).find((n) => here(m.entries[n]!));
    if (name !== undefined) return { kind: 'entry', name };
    const exit = m.exits.findIndex(here);
    if (exit >= 0) return { kind: 'exit', index: exit };
    const lift = m.lifts.findIndex(here);
    return lift >= 0 ? { kind: 'lift', index: lift } : null;
  };
  /** A transition point (for dragging and the selection frame). */
  const markPoint = (ref: MarkRef): { x: number; y: number } | undefined => {
    const m = marks();
    return ref.kind === 'entry' ? m.entries[ref.name] : ref.kind === 'exit' ? m.exits[ref.index] : m.lifts[ref.index];
  };
  /** The selected door in the "Transitions" tab (cell number): it gets "Locked". */
  let selectedDoor: number | null = null;
  /** Whether the game level's doors are locked (by cell). */
  let baseLocks = new Map<number, boolean>();
  const isDoorCell = (cell: number) => {
    const id = loc.floors[1]?.[cell];
    return !!id && blockOf(id)?.kind === 'door';
  };
  /** Whether the door in the cell is locked: the editor's change, otherwise — as the level door (for a regular door). */
  const doorLocked = (cell: number) => loc.locks?.[cell] ?? (loc.floors[1]?.[cell] === DOOR_BLOCK ? (baseLocks.get(cell) ?? false) : false);
  const sameMark = (a: MarkRef | null, b: MarkRef | null) =>
    !!a && !!b && a.kind === b.kind && (a.kind === 'entry' ? a.name === (b as typeof a).name : a.index === (b as { index: number }).index);

  /** Names of wasteland locations — by the game location they are exited from (they have no names of their own in code). */
  const placeTitles = new Map<string, string>();
  for (const def of levels)
    for (const e of marksFromLevel(def).exits) if (e.to.map === 'wasteland' && !placeTitles.has(e.to.entry)) placeTitles.set(e.to.entry, levelTitle(def));
  const destName = (d: Destination): string =>
    d.map === 'wasteland' ? `${t('edWasteland')}: ${placeTitles.get(d.entry) ?? d.entry}` : `${levelTitle(LEVELS[d.map] ?? baseDef)} · ${d.entry}`;
  /** Entrances of a location: for this location — from its transitions (edited here), for others — from the game level, for the wasteland — locations. */
  const entryCache = new Map<string, string[]>();
  const entryNames = (map: string): string[] => {
    if (map === 'wasteland') return Object.keys(PLACES);
    if (map === baseDef.id) return Object.keys(marks().entries);
    let names = entryCache.get(map);
    if (!names) entryCache.set(map, (names = LEVELS[map] ? Object.keys(parseLevelDef(LEVELS[map]).entries) : []));
    return names;
  };

  /** A block by name: from the shared list, a location image or the location's own block. */
  const blockOf = (id: string): BlockDef | null => blockIn(id, loc.blocks, names);
  const picked = () => (floor === 0 ? pickFloor : pickWall);
  const setPicked = (id: string | null) => {
    if (floor === 0) pickFloor = id;
    else pickWall = id;
  };

  /** Game level objects (bodies, items) and critters — for markers and hints; transitions are our own, in marks. */
  const readObjects = () => {
    objects = parseLevelDef(baseDef).objects.filter((o) => o.kind !== 'door' && o.kind !== 'exit' && o.kind !== 'elevator' && !isPerson(o));
    people = levelPeople(baseDef);
    decorItems = levelDecor(baseDef);
    void readDecorLooks();
    baseLocks = new Map();
    for (const o of parseLevelDef(baseDef).objects) if (o.kind === 'door') baseLocks.set(Math.floor(o.y) * loc.width + Math.floor(o.x), !!o.locked);
    selectedDoor = null;
  };

  // ---------- view: fit the location in the window ----------
  const fit = () => {
    const w = mapBox.clientWidth;
    const h = mapBox.clientHeight;
    cell = Math.max(ZOOM.min, Math.min(ZOOM.max, Math.floor(Math.min((w - 24) / loc.width, (h - 24) / loc.height))));
    offX = Math.floor((w - cell * loc.width) / 2);
    offY = Math.floor((h - cell * loc.height) / 2);
  };

  // ---------- drawing the map ----------
  let queued = false;
  const redraw = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      draw();
    });
  };

  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = mapBox.clientWidth;
    const h = mapBox.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#07120a';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = cell < 32;
    const x0 = Math.max(0, Math.floor(-offX / cell));
    const y0 = Math.max(0, Math.floor(-offY / cell));
    const x1 = Math.min(loc.width, Math.ceil((w - offX) / cell));
    const y1 = Math.min(loc.height, Math.ceil((h - offY) / cell));
    const groundTile = tileOf(baseDef.floor);
    for (let f = 0; f <= floor; f++) {
      const alpha = f === floor ? 1 : (BELOW_ALPHA[floor - f - 1] ?? 0.06);
      ctx.globalAlpha = alpha;
      const blocks = loc.floors[f];
      if (!blocks) continue;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const id = blocks[y * loc.width + x];
          const px = offX + x * cell;
          const py = offY + y * cell;
          if (!id) {
            if (f === 0 && groundTile) ctx.drawImage(groundTile, px, py, cell, cell);
            continue;
          }
          const info = blockOf(id);
          const tile = info ? tileOf(info.texture) : null;
          if (tile) ctx.drawImage(tile, px, py, cell, cell);
          // A door (custom too) — with an orange frame, a window — with glass in the middle: not to be confused with a wall.
          if (info?.kind === 'door') {
            ctx.strokeStyle = '#f0b43c';
            ctx.lineWidth = Math.max(1, cell / 8);
            ctx.strokeRect(px + ctx.lineWidth / 2, py + ctx.lineWidth / 2, cell - ctx.lineWidth, cell - ctx.lineWidth);
          } else if (id === WINDOW_BLOCK || id === ROUND_WINDOW_BLOCK) drawPane(ctx, px, py, cell, id === ROUND_WINDOW_BLOCK);
        }
      }
    }
    ctx.globalAlpha = 1;
    // The grid — when cells are large.
    if (cell >= 12) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) {
        ctx.moveTo(offX + x * cell + 0.5, offY + y0 * cell);
        ctx.lineTo(offX + x * cell + 0.5, offY + y1 * cell);
      }
      for (let y = y0; y <= y1; y++) {
        ctx.moveTo(offX + x0 * cell, offY + y * cell + 0.5);
        ctx.lineTo(offX + x1 * cell, offY + y * cell + 0.5);
      }
      ctx.stroke();
    }
    drawObjects(ctx);
    if (hover) {
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 2;
      ctx.strokeRect(offX + hover.x * cell + 1, offY + hover.y * cell + 1, cell - 2, cell - 2);
    }
  };

  /** Window glass: a light blue square in the middle of the cell. */
  const drawPane = (ctx: CanvasRenderingContext2D, px: number, py: number, size: number, round = false) => {
    const m = Math.max(1, Math.round(size * 0.22));
    ctx.fillStyle = 'rgba(140, 200, 255, 0.85)';
    if (round) {
      ctx.beginPath();
      ctx.arc(px + size / 2, py + size / 2, (size - 2 * m) / 2, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(px + m, py + m, size - 2 * m, size - 2 * m);
  };

  /**
   * Markers: key critters — green circle with a white rim, the crowd — pale green ring, enemies — red diamond,
   * bodies — grey, items — small squares, entrances — white arrows, exits — yellow crosses.
   */
  const drawObjects = (ctx: CanvasRenderingContext2D) => {
    const r = Math.max(2, cell * 0.28);
    for (const o of objects) {
      const cx = offX + o.x * cell;
      const cy = offY + o.y * cell;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#000';
      if (o.kind === 'corpse') {
        ctx.fillStyle = '#9a9a9a';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (o.kind === 'item') {
        ctx.fillStyle = '#7fc8ff';
        ctx.fillRect(cx - r * 0.6, cy - r * 0.6, r * 1.2, r * 1.2);
        ctx.strokeRect(cx - r * 0.6, cy - r * 0.6, r * 1.2, r * 1.2);
      }
    }
    for (const d of shownDecor()) {
      const at = edits().moved[d.key] ?? d;
      drawDecor(ctx, d.kind === 'furniture' ? (decorLooks.get(d.pid) ?? 'block') : d.kind, offX + at.x * cell, offY + at.y * cell, r);
    }
    for (const a of edits().added) drawDecor(ctx, decorKinds?.find((k) => k.pid === a.pid)?.look ?? decorLooks.get(a.pid) ?? 'block', offX + a.x * cell, offY + a.y * cell, r);
    const decorChosen = selectedDecor ? decorPoint(selectedDecor) : undefined;
    if (decorChosen && mode === 'decor') {
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(offX + decorChosen.x * cell, offY + decorChosen.y * cell, r * 1.9 + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of people) if (p.role === 'crowd') drawPerson(ctx, 'crowd', offX + p.def.x * cell, offY + p.def.y * cell, r);
    for (const p of people) {
      if (p.role !== 'important') continue;
      const at = crowd().moved[p.key] ?? p.def;
      drawPerson(ctx, 'important', offX + at.x * cell, offY + at.y * cell, r);
    }
    for (const e of crowd().enemies) drawPerson(ctx, 'enemy', offX + e.x * cell, offY + e.y * cell, r);
    const chosen = selectedPerson ? personPoint(selectedPerson) : undefined;
    if (chosen && mode === 'people') {
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(offX + chosen.x * cell, offY + chosen.y * cell, r * 1.9 + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Locked doors — a small lock in the cell corner; the selected door — in a yellow circle.
    const first = loc.floors[1] ?? [];
    if (cell >= 10) {
      for (let i = 0; i < first.length; i++) {
        if (!first[i] || !isDoorCell(i) || !doorLocked(i)) continue;
        drawLock(ctx, offX + ((i % loc.width) + 0.78) * cell, offY + (Math.floor(i / loc.width) + 0.26) * cell, cell * 0.16);
      }
    }
    if (selectedDoor !== null && mode === 'marks') {
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(offX + ((selectedDoor % loc.width) + 0.5) * cell, offY + (Math.floor(selectedDoor / loc.width) + 0.5) * cell, r * 1.9 + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    const m = marks();
    for (const e of m.exits) drawMark(ctx, 'exit', offX + e.x * cell, offY + e.y * cell, r);
    for (const l of m.lifts) drawMark(ctx, 'lift', offX + l.x * cell, offY + l.y * cell, r);
    for (const e of Object.values(m.entries)) drawMark(ctx, 'entry', offX + e.x * cell, offY + e.y * cell, r, e.angle);
    // The selected transition — in a yellow circle.
    const point = selected ? markPoint(selected) : undefined;
    if (point && mode === 'marks') {
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(offX + point.x * cell, offY + point.y * cell, r * 1.9 + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  /**
   * Item icon: furniture — brown square, plant or rock — olive triangle, marking — yellow
   * strip; a container and an item with a script (move only) — with a white rim, like a key critter.
   */
  const drawDecor = (ctx: CanvasRenderingContext2D, look: Exclude<DecorLook, null> | 'container' | 'prop', cx: number, cy: number, r: number) => {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    if (look === 'picture') {
      ctx.fillStyle = '#8fae4a';
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy + r * 0.8);
      ctx.lineTo(cx - r, cy + r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return;
    }
    if (look === 'mark') {
      ctx.fillStyle = '#e0c44a';
      ctx.fillRect(cx - r, cy - r * 0.3, r * 2, r * 0.6);
      ctx.strokeRect(cx - r, cy - r * 0.3, r * 2, r * 0.6);
      return;
    }
    const s = r * 0.85;
    ctx.fillStyle = look === 'prop' ? '#b07ad8' : '#b08a5a';
    ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
    if (look === 'container' || look === 'prop') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, r / 3);
    }
    ctx.strokeRect(cx - s, cy - s, s * 2, s * 2);
  };

  /** Small lock: shackle and body (s — half the body width). */
  const drawLock = (ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) => {
    ctx.lineWidth = Math.max(1.5, s / 2.5);
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.2, s * 0.65, Math.PI, 0);
    ctx.stroke();
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = Math.max(1, s / 4);
    ctx.stroke();
    ctx.fillStyle = '#ffd27a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.fillRect(cx - s, cy - s * 0.2, s * 2, s * 1.4);
    ctx.strokeRect(cx - s, cy - s * 0.2, s * 2, s * 1.4);
  };

  /** Critter icon: each kind has its own shape (not just colour). */
  const drawPerson = (ctx: CanvasRenderingContext2D, role: PersonRole, cx: number, cy: number, r: number) => {
    if (role === 'crowd') {
      ctx.strokeStyle = 'rgba(79, 214, 90, 0.6)';
      ctx.lineWidth = Math.max(1, r / 3);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
      ctx.stroke();
    } else if (role === 'important') {
      ctx.fillStyle = '#4fd65a';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, r / 3);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ff6b4a';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 1.2);
      ctx.lineTo(cx + r * 1.2, cy);
      ctx.lineTo(cx, cy + r * 1.2);
      ctx.lineTo(cx - r * 1.2, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };

  /** Transition icon: exit — yellow cross, elevator — little ladder, entrance — white arrow by facing. */
  const drawMark = (ctx: CanvasRenderingContext2D, kind: MarkKind, cx: number, cy: number, r: number, angle = FACING.north) => {
    ctx.lineWidth = Math.max(1.5, r / 2.5);
    if (kind === 'exit') {
      ctx.strokeStyle = '#ffe27a';
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
    } else if (kind === 'lift') {
      ctx.strokeStyle = '#c9a2ff';
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.6, cy - r);
      ctx.lineTo(cx - r * 0.6, cy + r);
      ctx.moveTo(cx + r * 0.6, cy - r);
      ctx.lineTo(cx + r * 0.6, cy + r);
      for (const k of [-0.5, 0, 0.5]) {
        ctx.moveTo(cx - r * 0.6, cy + r * k);
        ctx.lineTo(cx + r * 0.6, cy + r * k);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r * 1.2, cy + Math.sin(angle) * r * 1.2);
      ctx.lineTo(cx + Math.cos(angle + 2.4) * r, cy + Math.sin(angle + 2.4) * r);
      ctx.lineTo(cx + Math.cos(angle - 2.4) * r, cy + Math.sin(angle - 2.4) * r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };

  // ---------- hint under the cursor ----------
  const objectText = (o: ObjectDef): string => {
    const script = 'script' in o && o.script ? ` (${tf('edScript', { name: o.script })})` : '';
    switch (o.kind) {
      case 'corpse':
        return t('edObjCorpse');
      case 'item':
        return t('edObjItem');
      default:
        return '';
    }
  };

  const showTip = (clientX: number, clientY: number) => {
    if (!hover || pan) {
      tip.hidden = true;
      return;
    }
    const index = hover.y * loc.width + hover.x;
    const id = loc.floors[floor]?.[index] ?? null;
    const info = id ? blockOf(id) : null;
    const what = info ? blockName(info) : floor === 0 ? t('edPlaceFloor') : t('edEmpty');
    const lines = [`${tf('edCell', { x: hover.x, y: hover.y })} · ${tf('edFloor', { n: floor })}: ${what}`];
    for (const o of objects) if (Math.floor(o.x) === hover.x && Math.floor(o.y) === hover.y) lines.push(objectText(o));
    const m = marks();
    const here = (p: { x: number; y: number }) => Math.floor(p.x) === hover!.x && Math.floor(p.y) === hover!.y;
    const script = (s?: string) => (s ? ` (${tf('edScript', { name: s })})` : '');
    for (const p of people) {
      if (p.role === 'enemy' || !here(p.role === 'important' ? (crowd().moved[p.key] ?? p.def) : p.def)) continue;
      lines.push(`${nameOf(p.def.pid)} — ${t(p.role === 'important' ? 'edRoleImportant' : 'edRoleCrowd')}${script(p.def.script)}`);
    }
    for (const e of crowd().enemies) if (here(e)) lines.push(`${t('edObjEnemy')}: ${nameOf(e.pid)}${script(e.script)}`);
    for (const d of shownDecor()) {
      if (!here(edits().moved[d.key] ?? d)) continue;
      const role = d.kind === 'furniture' ? 'edDecorFurniture' : d.kind === 'container' ? 'edDecorContainer' : 'edDecorProp';
      lines.push(`${decorNames.get(d.pid) ?? '…'} — ${t(role)}`);
    }
    for (const a of edits().added) if (here(a)) lines.push(`${decorNames.get(a.pid) ?? decorKinds?.find((k) => k.pid === a.pid)?.label ?? '…'} — ${t('edDecorAdded')}`);
    for (const [name, e] of Object.entries(m.entries)) if (here(e)) lines.push(tf('edObjEntry', { name }));
    for (const e of m.exits) if (here(e)) lines.push(`${t('edObjExit')} → ${destName(e.to)}${e.use ? ' (E)' : ''}`);
    for (const l of m.lifts) if (here(l)) lines.push(`${t('edObjElevator')}: ${l.floors.map(destName).join(' / ')}`);
    tip.textContent = lines.join('\n');
    tip.hidden = false;
    const box = mapBox.getBoundingClientRect();
    const left = Math.min(clientX - box.left + 16, box.width - tip.offsetWidth - 4);
    const top = Math.min(clientY - box.top + 18, box.height - tip.offsetHeight - 4);
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, top)}px`;
  };

  // ---------- block list ----------
  const blockList = $<HTMLUListElement>('ed-blocks');
  /** Block search by name ("Blocks" tab). */
  const filterBox = $<HTMLInputElement>('ed-filter');
  filterBox.placeholder = t('edFilter');
  filterBox.setAttribute('aria-label', t('edFilter'));
  filterBox.addEventListener('input', () => renderBlocks());
  const props = $('ed-props');
  const blocksAside = root.querySelector<HTMLElement>('.editor-blocks')!;

  /** The "Transitions" tab: three tools (entrance, exit, elevator) — a click on an empty cell places the selected one. */
  const renderTools = () => {
    blockList.innerHTML = '';
    for (const [kind, label] of [
      ['entry', 'edToolEntry'],
      ['exit', 'edToolExit'],
      ['lift', 'edToolLift'],
    ] as const) {
      const li = document.createElement('li');
      li.className = 'editor-item';
      li.setAttribute('role', 'option');
      li.tabIndex = 0;
      li.setAttribute('aria-selected', String(tool === kind));
      const swatch = document.createElement('canvas');
      swatch.width = swatch.height = 28;
      swatch.className = 'editor-swatch';
      const sc = swatch.getContext('2d')!;
      sc.fillStyle = '#07120a';
      sc.fillRect(0, 0, 28, 28);
      drawMark(sc, kind, 14, 14, 8, FACING.north);
      const name = document.createElement('span');
      name.textContent = t(label);
      li.append(swatch, name);
      const choose = () => {
        tool = kind;
        renderTools();
      };
      li.addEventListener('click', choose);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose();
        }
      });
      blockList.append(li);
    }
  };

  /** The "People" tab: "Move" and enemy kinds — a click on an empty cell places the selected one. */
  const renderPeopleTools = () => {
    blockList.innerHTML = '';
    const items: (number | null | 'group')[] = [null, 'group', ...kinds.map((_, i) => i)];
    for (const item of items) {
      const li = document.createElement('li');
      if (item === 'group') {
        li.className = 'editor-group';
        li.textContent = t('edAddEnemy');
        blockList.append(li);
        continue;
      }
      li.className = 'editor-item';
      li.setAttribute('role', 'option');
      li.tabIndex = 0;
      li.setAttribute('aria-selected', String(personTool === item));
      const swatch = document.createElement('canvas');
      swatch.width = swatch.height = 28;
      swatch.className = 'editor-swatch';
      const sc = swatch.getContext('2d')!;
      sc.fillStyle = '#07120a';
      sc.fillRect(0, 0, 28, 28);
      drawPerson(sc, item === null ? 'important' : 'enemy', 14, 14, 8);
      const label = document.createElement('span');
      label.textContent = item === null ? t('edToolMove') : kinds[item]!.label;
      li.append(swatch, label);
      const choose = () => {
        personTool = item;
        renderPeopleTools();
      };
      li.addEventListener('click', choose);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose();
        }
      });
      blockList.append(li);
    }
  };

  /** The "Objects" tab: "Move" and original furniture by section — a click on an empty cell places the selected one. */
  const renderDecorTools = () => {
    blockList.innerHTML = '';
    const item = (label: string, look: Exclude<DecorLook, null> | 'container', tool: number | null) => {
      const li = document.createElement('li');
      li.className = 'editor-item';
      li.setAttribute('role', 'option');
      li.tabIndex = 0;
      li.setAttribute('aria-selected', String(decorTool === tool));
      const swatch = document.createElement('canvas');
      swatch.width = swatch.height = 28;
      swatch.className = 'editor-swatch';
      const sc = swatch.getContext('2d')!;
      sc.fillStyle = '#07120a';
      sc.fillRect(0, 0, 28, 28);
      drawDecor(sc, look, 14, 14, 8);
      const span = document.createElement('span');
      span.textContent = label;
      li.append(swatch, span);
      const choose = () => {
        decorTool = tool;
        renderDecorTools();
      };
      li.addEventListener('click', choose);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose();
        }
      });
      blockList.append(li);
    };
    const group = (text: string) => {
      const li = document.createElement('li');
      li.className = 'editor-group';
      li.textContent = text;
      blockList.append(li);
    };
    item(t('edToolMove'), 'container', null);
    group(t('edAddDecor'));
    if (!decorKinds) {
      group(t('edDecorLoading'));
      void readDecorKinds();
      return;
    }
    let last: DecorLook = null;
    decorKinds.forEach((k, i) => {
      if (k.look !== last) group(t(k.look === 'block' ? 'edDecorGroupBlocks' : k.look === 'picture' ? 'edDecorGroupPictures' : 'edDecorGroupMarks'));
      last = k.look;
      item(k.label, k.look, i);
    });
  };

  /** Switch the left tab: blocks, transitions, people or objects. */
  const setMode = (next: 'blocks' | 'marks' | 'people' | 'decor') => {
    mode = next;
    $('ed-tab-blocks').setAttribute('aria-selected', String(mode === 'blocks'));
    $('ed-tab-marks').setAttribute('aria-selected', String(mode === 'marks'));
    $('ed-tab-people').setAttribute('aria-selected', String(mode === 'people'));
    $('ed-tab-decor').setAttribute('aria-selected', String(mode === 'decor'));
    blocksAside.classList.toggle('editor-marks-mode', mode === 'marks');
    blocksAside.classList.toggle('editor-people-mode', mode !== 'marks');
    filterBox.hidden = mode !== 'blocks';
    props.hidden = false;
    renderBlocks();
    renderProps();
    redraw();
  };

  const renderBlocks = () => {
    if (mode === 'marks') {
      renderTools();
      return;
    }
    if (mode === 'people') {
      renderPeopleTools();
      return;
    }
    if (mode === 'decor') {
      renderDecorTools();
      return;
    }
    // A block fits a floor: on floor 0 — only regular ones (ground), higher — windows too, a door — only on floor 1.
    const allowed = (b: BlockDef) => (floor === 0 ? b.kind === 'wall' || b.kind === 'floor' : b.kind !== 'door' || floor === 1);
    const query = filterBox.value.trim().toLowerCase();
    const match = (b: BlockDef) => !query || blockName(b).toLowerCase().includes(query);
    const special = [DOOR_BLOCK, WINDOW_BLOCK, ROUND_WINDOW_BLOCK].map((id) => blockOf(id)!).filter(allowed);
    const library = libraryBlocks()
      .map((b) => blockOf(b.id)!)
      .filter(allowed)
      .sort((a, b) => blockName(a).localeCompare(blockName(b)));
    // Location blocks missing from the library (a location from a friend without its folders) — in a separate section, as a placeholder.
    const known = new Set(libraryBlocks().map((b) => b.id));
    const missing = [...new Set(loc.floors.flat().filter((id): id is string => !!id && id.startsWith('b:') && !known.has(id)))].map((id) => blockOf(id)!).filter(allowed);
    const groups: [string | null, (BlockDef | 'erase')[]][] = [
      ['edSpecialBlocks', ['erase', ...special.filter(match)]],
      ['edLibraryBlocks', library.filter(match)],
      ['edMissingBlocks', missing.filter(match)],
    ];
    blockList.innerHTML = '';
    for (const [title, items] of groups) {
      if (!items.length) continue;
      if (title) {
        const li = document.createElement('li');
        li.className = 'editor-group';
        li.textContent = t(title as 'edSpecialBlocks');
        blockList.append(li);
      }
      for (const item of items) {
        const li = document.createElement('li');
        const id = item === 'erase' ? null : item.id;
        li.className = 'editor-item';
        li.setAttribute('role', 'option');
        li.tabIndex = 0;
        li.setAttribute('aria-selected', String(picked() === id));
        const entry = id ? libraryBlocks().find((b) => b.id === id) : undefined;
        if (entry) li.addEventListener('dblclick', () => void blockDialog(entry, null));
        const swatch = document.createElement('canvas');
        swatch.width = swatch.height = 28;
        swatch.className = 'editor-swatch';
        const sc = swatch.getContext('2d')!;
        if (item === 'erase') {
          const ground = floor === 0 ? tileOf(baseDef.floor) : null;
          if (ground) sc.drawImage(ground, 0, 0, 28, 28);
          else {
            sc.fillStyle = '#07120a';
            sc.fillRect(0, 0, 28, 28);
          }
          sc.strokeStyle = '#ff8a6b';
          sc.lineWidth = 2;
          sc.beginPath();
          sc.moveTo(5, 5);
          sc.lineTo(23, 23);
          sc.stroke();
        } else {
          const tile = tileOf(item.texture);
          if (tile) sc.drawImage(tile, 0, 0, 28, 28);
          if (item.kind === 'door') {
            sc.strokeStyle = '#f0b43c';
            sc.lineWidth = 3;
            sc.strokeRect(1.5, 1.5, 25, 25);
          } else if (item.kind === 'window') drawPane(sc, 0, 0, 28, item.id === ROUND_WINDOW_BLOCK);
        }
        const label = document.createElement('span');
        label.textContent = item === 'erase' ? t(floor === 0 ? 'edEraseFloor' : 'edEraseWall') : blockName(item);
        li.append(swatch, label);
        const choose = () => {
          setPicked(id);
          renderBlocks();
          renderProps();
        };
        li.addEventListener('click', choose);
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            choose();
          }
        });
        blockList.append(li);
      }
    }
    // The selected block does not fit this floor (a door above the first) — take the first fitting regular one.
    const current = picked();
    const fits = [...special, ...library, ...missing];
    if (current !== null && !fits.some((b) => b.id === current) && !(blockOf(current) && allowed(blockOf(current)!))) {
      setPicked(library.find((b) => b.kind === 'wall')?.id ?? null);
      renderBlocks();
    }
  };

  /** Under the block list: "+ Own block…", "Reload blocks", "Open blocks folder" and a hint about what a custom block is. */
  const renderBlockProps = () => {
    const buttons = document.createElement('div');
    buttons.className = 'editor-decor-buttons';
    const button = (key: 'edNewBlock' | 'edReloadBlocks' | 'edOpenBlocks', action: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-button editor-small';
      b.textContent = t(key);
      b.addEventListener('click', action);
      buttons.append(b);
    };
    button('edNewBlock', () => {
      const current = picked();
      const block = current ? blockOf(current) : null;
      void blockDialog(null, block && block.texture !== MISSING_TEXTURE ? { name: blockName(block), texture: block.texture } : null);
    });
    button('edReloadBlocks', () => void reloadLibrary(true));
    button('edOpenBlocks', () => void platform.openBlocksFolder().then((ok) => ok || say(t('edBlocksFolderHere'))));
    const hint = document.createElement('p');
    hint.className = 'editor-hint';
    hint.textContent = t('edBlocksHint');
    props.append(buttons, hint);
    const problems = libraryProblems();
    if (problems.length) {
      const warn = document.createElement('p');
      warn.className = 'editor-hint editor-error';
      warn.textContent = tf('edBlocksProblems', { list: problems.slice(0, 6).join(', ') });
      props.append(warn);
    }
  };

  /** Re-read the blocks folder: images, names, sounds (after "Reload blocks" and the block window). */
  const reloadLibrary = async (report = false) => {
    await loadBlockLibrary(true);
    tex = gameTextures();
    names = textureNames();
    tiles.clear();
    options.sound?.forgetFileSounds();
    renderBlocks();
    renderCeiling();
    renderProps();
    redraw();
    if (report) say(tf('edBlocksReloaded', { n: libraryBlocks().length }));
  };

  // ---------- custom block: the "+ Own block…" window and the library block window ----------
  /** Whether the player's copy has door sounds SODOORS<letter> (opening), by letter; read once. */
  let doorSounds: Promise<string[]> | null = null;
  const availableDoorSounds = () =>
    (doorSounds ??= Promise.all(
      [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l) =>
        platform
          .gameFileExists(`SOUND\\SFX\\${doorSfx('O', l)}.ACM`)
          .then((found) => (found ? l : ''))
          .catch(() => ''),
      ),
    ).then((list) => list.filter(Boolean)));

  /** A window over the editor; closed with Esc. The result is the window root and "close". */
  const modal = (html: string, onClose: () => void): { host: HTMLElement; close: () => void } => {
    const host = document.createElement('div');
    host.className = 'pause';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-labelledby', 'ed-block-title');
    host.innerHTML = html;
    const close = () => {
      window.removeEventListener('keydown', onKey, true);
      host.remove();
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    root.append(host);
    return { host, close };
  };

  /** Our block: the image is redrawn in the folder (changes across the whole game); custom behaviour — in a custom block based on it. */
  const builtinDialog = (entry: LibraryBlock): Promise<void> =>
    new Promise((resolve) => {
      const { host, close } = modal(
        `<div class="pause-card editor-ask"><section class="panel editor-block-panel">
          <h2 id="ed-block-title"></h2><p class="editor-hint" id="ed-bi-text"></p>
          <div class="pause-buttons editor-block-buttons">
            <button class="menu-button menu-primary" id="ed-bi-copy" type="button"></button>
            <button class="menu-button" id="ed-bi-folder" type="button"></button>
            <button class="menu-button" id="ed-bi-cancel" type="button"></button>
          </div></section></div>`,
        resolve,
      );
      const q = (id: string) => host.querySelector<HTMLElement>('#' + id)!;
      q('ed-block-title').textContent = tf('edBlockTitleEdit', { name: entry.name });
      q('ed-bi-text').textContent = t('edBlockBuiltin');
      q('ed-bi-copy').textContent = t('edBlockCopy');
      q('ed-bi-folder').textContent = t('edBlockOpenFolder');
      q('ed-bi-cancel').textContent = t('edBlockCancel');
      q('ed-bi-cancel').addEventListener('click', close);
      q('ed-bi-folder').addEventListener('click', () => void platform.openBlocksFolder(entry.name).then((ok) => ok || say(t('edBlocksFolderHere'))));
      q('ed-bi-copy').addEventListener('click', () => {
        close();
        void blockDialog(null, { name: entry.name, texture: entry.texture });
      });
      q('ed-bi-copy').focus();
    });

  /**
   * Custom block window: name (folder name; a finished one cannot be renamed here — rename the folder in the file explorer), block kind
   * (regular, door, window), image — our drawing or a file from disk (a finished one can keep its image), for a door —
   * a sound from the game copy ("Listen"; a custom sound — as a file in the folder), metal, glow. "Done" writes the folder into blocks.
   * template — which block to start from (the one selected in the list).
   */
  const blockDialog = async (entry: LibraryBlock | null, template: { name: string; texture: TextureName } | null): Promise<void> => {
    if (entry?.id.startsWith('tex:')) return builtinDialog(entry);
    const sounds = await availableDoorSounds();
    const settings = entry ? blockSettings(entry.name) : {};
    return new Promise((resolve) => {
      const { host, close } = modal(
        `<div class="pause-card editor-block-card">
          <section class="panel editor-block-panel">
            <h2 id="ed-block-title"></h2>
            <label class="editor-field"><span id="ed-bl-name-label"></span><input id="ed-bl-name" maxlength="60" autocomplete="off" spellcheck="false" /></label>
            <label class="editor-field"><span id="ed-bl-kind-label"></span><select id="ed-bl-kind"></select></label>
            <div class="editor-block-picture"><span class="editor-group" id="ed-bl-tex-label"></span><button class="menu-button editor-small" id="ed-bl-file" type="button"></button><input type="file" id="ed-bl-file-input" accept=".png,.jpg,.jpeg,image/png,image/jpeg" hidden /><canvas id="ed-bl-preview" width="40" height="40"></canvas></div>
            <div class="editor-texture-grid" id="ed-bl-tex" role="listbox"></div>
            <div class="editor-door-fields" id="ed-bl-door">
              <label class="editor-field"><span id="ed-bl-sound-label"></span><span class="editor-sound-row"><select id="ed-bl-sound"></select><button class="menu-button editor-small" id="ed-bl-listen" type="button"></button></span></label>
              <p class="editor-hint" id="ed-bl-own-sound"></p>
            </div>
            <label class="editor-check"><input type="checkbox" id="ed-bl-metal" /><span id="ed-bl-metal-label"></span></label>
            <label class="editor-check"><input type="checkbox" id="ed-bl-glow" /><span id="ed-bl-glow-label"></span></label>
            <p class="editor-hint editor-error" id="ed-bl-error" role="alert"></p>
            <div class="pause-buttons editor-block-buttons">
              <button class="menu-button menu-primary" id="ed-bl-save" type="button"></button>
              <button class="menu-button" id="ed-bl-cancel" type="button"></button>
              <button class="menu-button" id="ed-bl-folder" type="button"></button>
            </div>
          </section>
        </div>`,
        resolve,
      );
      const q = <T extends HTMLElement>(id: string) => host.querySelector<T>('#' + id)!;
      q('ed-block-title').textContent = entry ? tf('edBlockTitleEdit', { name: entry.name }) : t('edBlockTitleNew');
      q('ed-bl-name-label').textContent = t('edBlockName');
      q('ed-bl-kind-label').textContent = t('edBlockKind');
      q('ed-bl-tex-label').textContent = t('edBlockTexture');
      q('ed-bl-file').textContent = t('edBlockFile');
      q('ed-bl-sound-label').textContent = t('edBlockSound');
      q('ed-bl-own-sound').textContent = t('edBlockOwnSound');
      q('ed-bl-listen').textContent = t('edListen');
      q('ed-bl-metal-label').textContent = t('edBlockMetal');
      q('ed-bl-glow-label').textContent = t('edBlockGlow');
      q('ed-bl-save').textContent = t('edBlockSave');
      q('ed-bl-cancel').textContent = t('edBlockCancel');
      q('ed-bl-folder').textContent = t('edBlockOpenFolder');
      const nameBox = q<HTMLInputElement>('ed-bl-name');
      const kindBox = q<HTMLSelectElement>('ed-bl-kind');
      const soundBox = q<HTMLSelectElement>('ed-bl-sound');
      const metalBox = q<HTMLInputElement>('ed-bl-metal');
      const glowBox = q<HTMLInputElement>('ed-bl-glow');
      const error = q('ed-bl-error');
      const preview = q<HTMLCanvasElement>('ed-bl-preview');
      const taken = new Set([...blockFolders().map((f) => f.name.toLowerCase()), ...libraryBlocks().map((b) => b.name.toLowerCase())]);
      let n = 1;
      while (taken.has(tf('edBlockDefaultName', { n }).toLowerCase())) n++;
      let suggestion = template ? `${template.name} 2` : tf('edBlockDefaultName', { n });
      for (let k = 3; taken.has(suggestion.toLowerCase()) && k < 100; k++) suggestion = `${template?.name ?? ''} ${k}`.trim();
      nameBox.value = entry?.name ?? suggestion;
      nameBox.disabled = !!entry;
      for (const [value, key] of [
        ['wall', 'edKindBlock'],
        ['door', 'edKindDoor'],
        ['window', 'edKindWindow'],
      ] as const) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = t(key);
        kindBox.append(option);
      }
      kindBox.value = entry?.kind ?? 'wall';
      if (sounds.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = t('edNoSounds');
        soundBox.append(option);
      }
      for (const letter of sounds) {
        const option = document.createElement('option');
        option.value = letter;
        option.textContent = tf('edSoundN', { n: letter });
        soundBox.append(option);
      }
      soundBox.value = settings.sound && sounds.includes(settings.sound) ? settings.sound : sounds.includes('C') ? 'C' : (sounds[0] ?? '');
      metalBox.checked = !!settings.metal;
      glowBox.checked = !!settings.glow;
      const doorFields = q('ed-bl-door');
      const showDoor = () => {
        doorFields.hidden = kindBox.value !== 'door';
      };
      kindBox.addEventListener('change', showDoor);
      showDoor();
      q('ed-bl-listen').addEventListener('click', () => {
        if (soundBox.value) options.sound?.play(doorSfx('O', soundBox.value));
      });
      // Image: our drawing from the grid or a file from disk; for a finished block — "keep as is" until another is chosen.
      let picture: { texture: TextureName } | { bytes: Uint8Array; ext: string } | null = entry ? null : { texture: template?.texture ?? 'brick' };
      const showPreview = (source: CanvasImageSource | null) => {
        const c = preview.getContext('2d')!;
        c.clearRect(0, 0, 40, 40);
        if (source) c.drawImage(source, 0, 0, 40, 40);
      };
      const grid = q('ed-bl-tex');
      const swatches: HTMLButtonElement[] = [];
      const select = (button: HTMLButtonElement | null) => {
        for (const s of swatches) s.setAttribute('aria-selected', String(s === button));
      };
      for (const name of [...names].filter((n) => n !== MISSING_TEXTURE).sort((a, b) => (BUILTIN_NAMES[a as TextureName] ?? a).localeCompare(BUILTIN_NAMES[b as TextureName] ?? b))) {
        const tile = tileOf(name as TextureName);
        if (!tile) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'editor-texture';
        button.setAttribute('role', 'option');
        const label = BUILTIN_NAMES[name as TextureName] ?? name.replace(/^b:/, '');
        button.setAttribute('aria-label', label);
        button.title = label;
        button.setAttribute('aria-selected', String(!!picture && 'texture' in picture && picture.texture === name));
        const c = document.createElement('canvas');
        c.width = c.height = 32;
        c.getContext('2d')!.drawImage(tile, 0, 0, 32, 32);
        button.append(c);
        button.addEventListener('click', () => {
          picture = { texture: name as TextureName };
          select(button);
          showPreview(tile);
        });
        swatches.push(button);
        grid.append(button);
      }
      showPreview(picture && 'texture' in picture ? tileOf(picture.texture) : entry ? tileOf(entry.texture) : null);
      const fileInput = q<HTMLInputElement>('ed-bl-file-input');
      q('ed-bl-file').addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const ext = /\.jpe?g$/i.test(file.name) ? 'jpg' : 'png';
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
          const ok = bitmap.width <= MAX_IMAGE && bitmap.height <= MAX_IMAGE && bytes.length <= 10 * 1024 * 1024;
          if (ok) {
            picture = { bytes, ext };
            select(null);
            showPreview(bitmap);
            error.textContent = '';
          } else error.textContent = t('edBlockFileBad');
          bitmap.close();
        } catch {
          error.textContent = t('edBlockFileBad');
        }
      });
      const folderButton = q<HTMLButtonElement>('ed-bl-folder');
      folderButton.hidden = !entry;
      folderButton.addEventListener('click', () => void platform.openBlocksFolder(entry?.name).then((ok) => ok || say(t('edBlocksFolderHere'))));
      q('ed-bl-cancel').addEventListener('click', close);
      q('ed-bl-save').addEventListener('click', async () => {
        const name = entry?.name ?? nameBox.value.trim();
        if (!entry && (!BLOCK_NAME.test(name) || taken.has(name.toLowerCase()))) {
          error.textContent = t('edBlockBadName');
          nameBox.focus();
          return;
        }
        const kind = kindBox.value as LibraryBlock['kind'];
        const next: BlockSettings = {};
        if (kind !== 'wall') next.kind = kind;
        if (kind === 'door' && soundBox.value) next.sound = soundBox.value;
        if (metalBox.checked) next.metal = true;
        if (glowBox.checked) next.glow = true;
        try {
          if (picture && 'texture' in picture) await platform.writeBlockFile(name, 'block.png', await texturePng(tex[picture.texture]));
          else if (picture) await platform.writeBlockFile(name, `block.${picture.ext}`, picture.bytes);
          await writeSettings(name, next);
        } catch (e) {
          error.textContent = tf('edSaveFailed', { error: e instanceof Error ? e.message : String(e) });
          return;
        }
        close();
        await reloadLibrary();
        const id = `b:${name}`;
        if (libraryBlocks().some((b) => b.id === id)) {
          if (floor === 0 && kind !== 'wall') floor = 1;
          setPicked(id);
          renderFloors();
          renderBlocks();
        }
        say(tf('edBlockSaved', { name }));
      });
      (entry ? kindBox : nameBox).focus();
      if (!entry) nameBox.select();
    });
  };

  // ---------- transitions: place, remove, configure ----------
  const changed = () => {
    dirty = true;
    redraw();
  };

  /** A new transition in the cell: an entrance — with a free name, an exit — to the same place as the location's first exit, an elevator — to this floor. */
  const addMark = (kind: MarkKind, at: { x: number; y: number }): MarkRef => {
    const m = marks();
    const point = { x: at.x + 0.5, y: at.y + 0.5 };
    if (kind === 'entry') {
      let n = 1;
      while (m.entries[`${t('edEntryPrefix')}${n}`]) n++;
      const name = `${t('edEntryPrefix')}${n}`;
      m.entries[name] = { ...point, angle: FACING.north };
      return { kind, name };
    }
    const first = Object.keys(m.entries)[0] ?? '';
    if (kind === 'exit') {
      const to = m.exits[0]?.to ?? { map: 'wasteland', entry: Object.keys(PLACES)[0]! };
      m.exits.push({ ...point, to: { ...to } });
      return { kind, index: m.exits.length - 1 };
    }
    m.lifts.push({ ...point, floors: [{ map: baseDef.id, entry: first }], current: 0 });
    return { kind, index: m.lifts.length - 1 };
  };

  /** Remove a transition (not the last entrance: a location needs at least one). */
  const removeMark = (ref: MarkRef) => {
    const m = marks();
    if (ref.kind === 'entry') {
      if (Object.keys(m.entries).length <= 1) {
        say(t('edLastEntry'), true);
        return;
      }
      delete m.entries[ref.name];
    } else if (ref.kind === 'exit') m.exits.splice(ref.index, 1);
    else m.lifts.splice(ref.index, 1);
    if (sameMark(selected, ref) || (selected && selected.kind === ref.kind && ref.kind !== 'entry')) selected = null;
    changed();
    renderProps();
  };

  const moveMark = (ref: MarkRef, at: { x: number; y: number }) => {
    const point = markPoint(ref);
    if (!point || (Math.floor(point.x) === at.x && Math.floor(point.y) === at.y)) return;
    const taken = markAt(at.x, at.y);
    if (taken && !sameMark(taken, ref)) return;
    point.x = at.x + 0.5;
    point.y = at.y + 0.5;
    changed();
  };

  /** A choice list: values and labels; value is selected. */
  const selectOf = (pairs: readonly (readonly [string, string])[], value: string, onChange: (v: string) => void): HTMLSelectElement => {
    const select = document.createElement('select');
    for (const [v, label] of pairs) {
      const option = document.createElement('option');
      option.value = v;
      option.textContent = label;
      select.append(option);
    }
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    return select;
  };
  const field = (label: string, control: HTMLElement): HTMLElement => {
    const box = document.createElement('label');
    box.className = 'editor-field';
    const span = document.createElement('span');
    span.textContent = label;
    box.append(span, control);
    return box;
  };
  const mapPairs = (): [string, string][] => [['wasteland', t('edWasteland')], ...levels.map((d): [string, string] => [d.id, levelTitle(d)])];
  const entryPairs = (map: string): [string, string][] =>
    entryNames(map).map((n): [string, string] => [n, map === 'wasteland' ? (placeTitles.get(n) ?? n) : n]);
  /** Where it leads: a location and an entrance in it (changing the location — the first of its entrances). */
  const destFields = (d: Destination, onChange: () => void): HTMLElement[] => {
    const entry = selectOf(entryPairs(d.map), d.entry, (v) => {
      d.entry = v;
      onChange();
    });
    const map = selectOf(mapPairs(), d.map, (v) => {
      d.map = v;
      d.entry = entryNames(v)[0] ?? '';
      onChange();
      renderProps();
    });
    return [field(t('edPropTo'), map), field(t('edPropEntry'), entry)];
  };

  /** Under the "People" list: who is selected, a summary and a hint (the space under them does not jump: always three lines and a button). */
  const renderPeopleProps = () => {
    const who = document.createElement('p');
    who.className = 'editor-person';
    const role = document.createElement('p');
    role.className = 'editor-hint';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'menu-button editor-small';
    back.textContent = t('edPutBack');
    back.disabled = true;
    const sel = selectedPerson;
    if (sel?.kind === 'important') {
      const p = people.find((q) => q.key === sel.key);
      if (p) {
        who.textContent = nameOf(p.def.pid);
        role.textContent = t('edRoleImportant') + (p.def.script ? ` (${tf('edScript', { name: p.def.script })})` : '');
        back.disabled = !crowd().moved[p.key];
        back.addEventListener('click', () => {
          delete crowd().moved[p.key];
          changed();
          renderProps();
        });
      }
    } else if (sel?.kind === 'enemy') {
      const e = crowd().enemies[sel.index];
      if (e) {
        who.textContent = `${t('edObjEnemy')}: ${nameOf(e.pid)}`;
        role.textContent = e.script ? tf('edScript', { name: e.script }) : '';
      }
    }
    if (!who.textContent) who.textContent = '—';
    const summary = document.createElement('p');
    summary.className = 'editor-hint';
    summary.textContent = tf('edPeopleSummary', {
      important: people.filter((p) => p.role === 'important').length,
      crowd: people.filter((p) => p.role === 'crowd').length,
      enemies: crowd().enemies.length,
    });
    const hint = document.createElement('p');
    hint.className = 'editor-hint';
    hint.textContent = t('edPeopleHint');
    props.append(who, role, back, summary, hint);
  };

  /** Under the "Objects" list: what is selected, "Return to place", "Return removed", a summary and a hint. */
  const renderDecorProps = () => {
    const who = document.createElement('p');
    who.className = 'editor-person';
    const role = document.createElement('p');
    role.className = 'editor-hint';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'menu-button editor-small';
    back.textContent = t('edPutBack');
    back.disabled = true;
    const sel = selectedDecor;
    if (sel?.kind === 'item') {
      const d = decorItems.find((q) => q.key === sel.key);
      if (d) {
        who.textContent = decorNames.get(d.pid) ?? '…';
        role.textContent = t(d.kind === 'furniture' ? 'edDecorFurniture' : d.kind === 'container' ? 'edDecorContainer' : 'edDecorProp');
        back.disabled = !edits().moved[d.key];
        back.addEventListener('click', () => {
          delete edits().moved[d.key];
          changed();
          renderProps();
        });
      }
    } else if (sel?.kind === 'added') {
      const a = edits().added[sel.index];
      if (a) {
        who.textContent = decorNames.get(a.pid) ?? '…';
        role.textContent = t('edDecorAdded');
      }
    }
    if (!who.textContent) who.textContent = '—';
    const removed = edits().removed.length;
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'menu-button editor-small';
    restore.textContent = tf('edDecorRestore', { n: removed });
    restore.disabled = removed === 0;
    restore.addEventListener('click', () => {
      edits().removed = [];
      changed();
      renderProps();
    });
    const count = (kind: DecorItem['kind']) => shownDecor().filter((d) => d.kind === kind).length;
    const summary = document.createElement('p');
    summary.className = 'editor-hint';
    summary.textContent = tf('edDecorSummary', { furniture: count('furniture'), containers: count('container'), props: count('prop'), added: edits().added.length, removed });
    const hint = document.createElement('p');
    hint.className = 'editor-hint';
    hint.textContent = t('edDecorHint');
    const buttons = document.createElement('div');
    buttons.className = 'editor-decor-buttons';
    buttons.append(back, restore);
    props.append(who, role, buttons, summary, hint);
  };

  /** Settings of the selected transition (critter, item) under the tool list. */
  const renderProps = () => {
    props.innerHTML = '';
    if (mode === 'people') {
      renderPeopleProps();
      return;
    }
    if (mode === 'decor') {
      renderDecorProps();
      return;
    }
    if (mode === 'blocks') {
      renderBlockProps();
      return;
    }
    const hint = document.createElement('p');
    hint.className = 'editor-hint';
    hint.textContent = t('edMarksHint');
    const m = marks();
    if (selectedDoor !== null && isDoorCell(selectedDoor)) {
      const cell = selectedDoor;
      const title = document.createElement('p');
      title.className = 'editor-person';
      title.textContent = tf('edDoorTitle', { x: cell % loc.width, y: Math.floor(cell / loc.width) });
      const lock = document.createElement('input');
      lock.type = 'checkbox';
      lock.checked = doorLocked(cell);
      lock.addEventListener('change', () => {
        (loc.locks ??= {})[cell] = lock.checked;
        changed();
      });
      const lockBox = document.createElement('label');
      lockBox.className = 'editor-check';
      const lockText = document.createElement('span');
      lockText.textContent = t('edDoorLocked');
      lockBox.append(lock, lockText);
      props.append(title, lockBox);
    } else if (selected?.kind === 'entry' && m.entries[selected.name]) {
      const ref = selected;
      const entry = m.entries[ref.name]!;
      const name = document.createElement('input');
      name.value = ref.name;
      name.maxLength = 40;
      name.addEventListener('change', () => {
        const next = name.value.trim();
        if (next === ref.name) return;
        if (!ENTRY_NAME.test(next) || m.entries[next]) {
          say(t('edBadEntryName'), true);
          name.value = ref.name;
          return;
        }
        m.entries[next] = entry;
        delete m.entries[ref.name];
        selected = { kind: 'entry', name: next };
        changed();
        renderProps();
      });
      const facing = selectOf(
        FACINGS.map(([key, a]): [string, string] => [String(a), t(key)]),
        String(FACINGS.reduce((best, [, a]) => (Math.abs(a - entry.angle) < Math.abs(best - entry.angle) ? a : best), FACING.north as number)),
        (v) => {
          entry.angle = Number(v);
          changed();
        },
      );
      props.append(field(t('edPropName'), name), field(t('edPropFacing'), facing));
    } else if (selected?.kind === 'exit' && m.exits[selected.index]) {
      const exit = m.exits[selected.index]!;
      const use = document.createElement('input');
      use.type = 'checkbox';
      use.checked = !!exit.use;
      use.addEventListener('change', () => {
        if (use.checked) exit.use = true;
        else delete exit.use;
        changed();
      });
      const useBox = document.createElement('label');
      useBox.className = 'editor-check';
      const useText = document.createElement('span');
      useText.textContent = t('edPropUse');
      useBox.append(use, useText);
      // Look on the floor: a coloured zone or a way down (hatch, crawlway, pit) — with our drawing.
      const look = selectOf(
        [
          ['', t('edLookZone')],
          ['manhole', t('edLookManhole')],
          ['trapdoor', t('edLookTrapdoor')],
          ['pit', t('edLookPit')],
        ],
        exit.look ?? '',
        (v) => {
          if (v) exit.look = v as ExitLook;
          else delete exit.look;
          changed();
        },
      );
      props.append(...destFields(exit.to, changed), useBox, field(t('edPropLook'), look));
    } else if (selected?.kind === 'lift' && m.lifts[selected.index]) {
      const lift = m.lifts[selected.index]!;
      const title = document.createElement('p');
      title.className = 'editor-group';
      title.textContent = t('edPropFloors');
      props.append(title);
      lift.floors.forEach((d, i) => {
        const row = document.createElement('div');
        row.className = 'editor-lift-floor';
        const number = document.createElement('span');
        number.className = 'editor-count';
        number.textContent = `${i + 1}.`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'menu-button editor-small';
        remove.textContent = '×';
        remove.title = t('edRemoveLiftFloor');
        remove.setAttribute('aria-label', t('edRemoveLiftFloor'));
        remove.disabled = lift.floors.length <= 1;
        remove.addEventListener('click', () => {
          lift.floors.splice(i, 1);
          lift.current = Math.min(lift.current, lift.floors.length - 1);
          changed();
          renderProps();
        });
        row.append(number, ...destFields(d, changed), remove);
        props.append(row);
      });
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'menu-button editor-small';
      add.textContent = t('edAddLiftFloor');
      add.disabled = lift.floors.length >= 12;
      add.addEventListener('click', () => {
        lift.floors.push({ map: baseDef.id, entry: Object.keys(m.entries)[0] ?? '' });
        changed();
        renderProps();
      });
      const current = selectOf(
        lift.floors.map((_, i): [string, string] => [String(i), String(i + 1)]),
        String(lift.current),
        (v) => {
          lift.current = Number(v);
          changed();
        },
      );
      const labels = t('edPanels').split('|');
      const panel = selectOf(
        LIFT_PANELS.map((art, i): [string, string] => [String(art), labels[i] ?? String(art)]),
        String(lift.art ?? LIFT_PANELS[0]),
        (v) => {
          if (Number(v) === LIFT_PANELS[0]) delete lift.art;
          else lift.art = Number(v);
          changed();
        },
      );
      props.append(add, field(t('edPropCurrent'), current), field(t('edPropPanel'), panel));
    }
    props.append(hint);
  };

  $('ed-tab-blocks').addEventListener('click', () => setMode('blocks'));
  $('ed-tab-marks').addEventListener('click', () => setMode('marks'));
  $('ed-tab-people').addEventListener('click', () => setMode('people'));
  $('ed-tab-decor').addEventListener('click', () => setMode('decor'));

  // ---------- items: move, place, remove ----------
  const moveDecor = (ref: DecorRef, at: { x: number; y: number }) => {
    const point = decorPoint(ref);
    if (!point || (Math.floor(point.x) === at.x && Math.floor(point.y) === at.y) || !canPut(at.x, at.y, ref)) return;
    if (ref.kind === 'added') {
      const a = edits().added[ref.index]!;
      a.x = at.x + 0.5;
      a.y = at.y + 0.5;
    } else {
      const d = decorItems.find((q) => q.key === ref.key)!;
      // Returned to its own cell — back at its own spot.
      if (Math.floor(d.x) === at.x && Math.floor(d.y) === at.y) delete edits().moved[d.key];
      else edits().moved[d.key] = { x: at.x + 0.5, y: at.y + 0.5 };
    }
    changed();
  };

  const decorDown = (button: number, at: { x: number; y: number }) => {
    const found = decorAt(at.x, at.y);
    if (button === 2) {
      const furniture = found?.kind === 'item' && decorItems.find((d) => d.key === found.key)?.kind === 'furniture';
      if (found?.kind === 'added') edits().added.splice(found.index, 1);
      else if (found?.kind === 'item' && furniture) {
        edits().removed.push(found.key);
        delete edits().moved[found.key];
      } else if (found) say(t('edDecorCantRemove'), true);
      if (found?.kind === 'added' || furniture) {
        selectedDecor = null;
        changed();
      }
    } else if (found) {
      selectedDecor = found;
      dragDecor = found;
    } else if (decorTool !== null && decorKinds) {
      const kind = decorKinds[decorTool];
      if (!kind || !canPut(at.x, at.y, null)) say(t('edCantPlace'), true);
      else {
        edits().added.push({ x: at.x + 0.5, y: at.y + 0.5, pid: kind.pid });
        decorNames.set(kind.pid, kind.label);
        decorLooks.set(kind.pid, kind.look);
        selectedDecor = { kind: 'added', index: edits().added.length - 1 };
        changed();
      }
    } else selectedDecor = null;
    renderProps();
    redraw();
  };

  // ---------- critters: move, place, remove ----------
  const movePerson = (ref: PersonRef, at: { x: number; y: number }) => {
    const point = personPoint(ref);
    if (!point || (Math.floor(point.x) === at.x && Math.floor(point.y) === at.y) || !canStand(at.x, at.y, ref)) return;
    if (ref.kind === 'enemy') {
      const e = crowd().enemies[ref.index]!;
      e.x = at.x + 0.5;
      e.y = at.y + 0.5;
    } else {
      const p = people.find((q) => q.key === ref.key)!;
      // Returned to its own cell — back at its own spot (without writing to the file).
      if (Math.floor(p.def.x) === at.x && Math.floor(p.def.y) === at.y) delete crowd().moved[p.key];
      else crowd().moved[p.key] = { x: at.x + 0.5, y: at.y + 0.5 };
    }
    changed();
  };

  const personDown = (button: number, at: { x: number; y: number }) => {
    const found = personAt(at.x, at.y);
    const isCrowd = people.some((p) => p.role === 'crowd' && Math.floor(p.def.x) === at.x && Math.floor(p.def.y) === at.y);
    if (button === 2) {
      if (found?.kind === 'enemy') {
        crowd().enemies.splice(found.index, 1);
        selectedPerson = null;
        changed();
      } else if (found) say(t('edCantRemove'), true);
      else if (isCrowd) say(t('edCrowdNote'));
    } else if (found) {
      selectedPerson = found;
      dragPerson = found;
    } else if (personTool !== null) {
      const kind = kinds[personTool];
      if (!kind || !canStand(at.x, at.y, null)) say(t('edCantPlace'), true);
      else {
        crowd().enemies.push({ x: at.x + 0.5, y: at.y + 0.5, pid: kind.pid, ...(kind.weapon ? { weapon: kind.weapon } : {}) });
        selectedPerson = { kind: 'enemy', index: crowd().enemies.length - 1 };
        changed();
      }
    } else {
      selectedPerson = null;
      if (isCrowd) say(t('edCrowdNote'));
    }
    renderProps();
    redraw();
  };

  // ---------- floors ----------
  const floorList = $<HTMLUListElement>('ed-floors');
  const removeButton = $<HTMLButtonElement>('ed-remove');
  let removeArmed = false;
  // Location ceiling: "as in the game" or any library block (by image).
  const ceilingSelect = $<HTMLSelectElement>('ed-ceiling');
  $('ed-ceiling-label').textContent = t('edCeiling');
  const renderCeiling = () => {
    ceilingSelect.innerHTML = '';
    const game = document.createElement('option');
    game.value = '';
    game.textContent = tf('edCeilingGame', { name: BUILTIN_NAMES[baseDef.ceiling] ?? baseDef.ceiling });
    ceilingSelect.append(game);
    const seen = new Set<string>();
    for (const b of libraryBlocks().sort((a, c) => a.name.localeCompare(c.name))) {
      if (b.kind !== 'wall' || seen.has(b.texture)) continue;
      seen.add(b.texture);
      const option = document.createElement('option');
      option.value = b.texture;
      option.textContent = b.name;
      ceilingSelect.append(option);
    }
    ceilingSelect.value = loc.ceiling && seen.has(loc.ceiling) ? loc.ceiling : '';
  };
  ceilingSelect.addEventListener('change', () => {
    if (ceilingSelect.value) loc.ceiling = ceilingSelect.value as TextureName;
    else delete loc.ceiling;
    dirty = true;
  });

  const renderFloors = () => {
    floorList.innerHTML = '';
    for (let f = loc.floors.length - 1; f >= 0; f--) {
      const li = document.createElement('li');
      li.className = 'editor-item editor-floor';
      li.setAttribute('role', 'option');
      li.tabIndex = 0;
      li.setAttribute('aria-selected', String(f === floor));
      const name = document.createElement('span');
      name.textContent = f === 0 ? t('edFloorGround') : f === 1 ? t('edFloorFirst') : tf('edFloor', { n: f });
      const count = document.createElement('span');
      count.className = 'editor-count';
      count.textContent = tf('edFloorCount', { n: loc.floors[f]!.reduce((n, b) => n + (b ? 1 : 0), 0) });
      li.append(name, count);
      const choose = () => {
        floor = f;
        renderFloors();
        renderBlocks();
        redraw();
      };
      li.addEventListener('click', choose);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose();
        }
      });
      floorList.append(li);
    }
    $<HTMLButtonElement>('ed-add').disabled = loc.floors.length >= LOCATION_LIMITS.floors;
    removeButton.disabled = loc.floors.length <= 2;
  };
  $('ed-add').addEventListener('click', () => {
    if (loc.floors.length >= LOCATION_LIMITS.floors) return;
    loc.floors.push(new Array<string | null>(loc.width * loc.height).fill(null));
    floor = loc.floors.length - 1;
    dirty = true;
    renderFloors();
    renderBlocks();
    redraw();
  });
  // "Remove top" takes two steps if something is drawn on it: the label changes in place, the button does not move.
  removeButton.addEventListener('click', () => {
    if (loc.floors.length <= 2) return;
    const top = loc.floors[loc.floors.length - 1]!;
    if (top.some(Boolean) && !removeArmed) {
      removeArmed = true;
      removeButton.textContent = t('edRemoveFloorSure');
      return;
    }
    loc.floors.pop();
    undo.length = 0;
    floor = Math.min(floor, loc.floors.length - 1);
    dirty = true;
    removeArmed = false;
    removeButton.textContent = t('edRemoveFloor');
    renderFloors();
    renderBlocks();
    redraw();
  });
  removeButton.addEventListener('blur', () => {
    removeArmed = false;
    removeButton.textContent = t('edRemoveFloor');
  });

  // ---------- mouse drawing ----------
  const cellAt = (clientX: number, clientY: number) => {
    const box = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - box.left - offX) / cell);
    const y = Math.floor((clientY - box.top - offY) / cell);
    return x >= 0 && y >= 0 && x < loc.width && y < loc.height ? { x, y } : null;
  };

  const paint = (x: number, y: number) => {
    const blocks = loc.floors[floor];
    if (!blocks || !stroke) return;
    const index = y * loc.width + x;
    const next = erasing ? null : picked();
    if (blocks[index] === next) return;
    stroke.push([floor, index, blocks[index] ?? null]);
    blocks[index] = next;
    dirty = true;
  };

  /** A line from the previous cell to this one: a fast mouse swing leaves no holes. */
  const paintLine = (to: { x: number; y: number }) => {
    const from = last ?? to;
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    for (let i = 0; i <= steps; i++) {
      const k = steps === 0 ? 0 : i / steps;
      paint(Math.round(from.x + (to.x - from.x) * k), Math.round(from.y + (to.y - from.y) * k));
    }
    last = to;
  };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    // The mouse "holds on" to the map while the button is pressed (moved past the edge — the stroke does not break).
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // An event without a real mouse (tests) — draw anyway.
    }
    if (e.button === 1 || (e.button === 0 && space)) {
      e.preventDefault();
      pan = { x: e.clientX, y: e.clientY, ox: offX, oy: offY };
      canvas.style.cursor = 'grabbing';
      tip.hidden = true;
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    if (mode === 'people' || mode === 'decor') {
      const at = cellAt(e.clientX, e.clientY);
      if (at) (mode === 'people' ? personDown : decorDown)(e.button, at);
      return;
    }
    if (mode === 'marks') {
      const at = cellAt(e.clientX, e.clientY);
      if (!at) return;
      const found = markAt(at.x, at.y);
      if (e.button === 2) {
        if (found) removeMark(found);
        return;
      }
      // A door (without a transition in the cell) — select it: it has "Locked".
      const cell = at.y * loc.width + at.x;
      selectedDoor = !found && isDoorCell(cell) ? cell : null;
      if (selectedDoor !== null) {
        selected = null;
        renderProps();
        redraw();
        return;
      }
      if (found) {
        selected = found;
        dragMark = found;
      } else {
        selected = addMark(tool, at);
        changed();
      }
      renderProps();
      redraw();
      return;
    }
    erasing = e.button === 2;
    stroke = [];
    last = null;
    const at = cellAt(e.clientX, e.clientY);
    if (at) paintLine(at);
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pan) {
      offX = pan.ox + (e.clientX - pan.x);
      offY = pan.oy + (e.clientY - pan.y);
      redraw();
      return;
    }
    const at = cellAt(e.clientX, e.clientY);
    if (dragMark && at) moveMark(dragMark, at);
    if (dragPerson && at) movePerson(dragPerson, at);
    if (dragDecor && at) moveDecor(dragDecor, at);
    if (stroke && at) paintLine(at);
    if (at?.x !== hover?.x || at?.y !== hover?.y || stroke) redraw();
    hover = at;
    showTip(e.clientX, e.clientY);
  });
  const endStroke = () => {
    dragMark = null;
    if (dragPerson || dragDecor) {
      dragPerson = null;
      dragDecor = null;
      renderProps();
    }
    if (pan) {
      pan = null;
      canvas.style.cursor = space ? 'grab' : 'crosshair';
      return;
    }
    if (!stroke) return;
    if (stroke.length) {
      undo.push(stroke);
      if (undo.length > UNDO_LIMIT) undo.shift();
      renderFloors();
    }
    stroke = null;
    last = null;
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    tip.hidden = true;
    redraw();
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const box = canvas.getBoundingClientRect();
      const mx = e.clientX - box.left;
      const my = e.clientY - box.top;
      const next = Math.round(Math.max(ZOOM.min, Math.min(ZOOM.max, e.deltaY < 0 ? cell * ZOOM.step : cell / ZOOM.step)));
      if (next === cell) return;
      // The point under the cursor stays in place.
      offX = mx - ((mx - offX) / cell) * next;
      offY = my - ((my - offY) / cell) * next;
      cell = next;
      redraw();
    },
    { passive: false },
  );

  const undoLast = () => {
    const last = undo.pop();
    if (!last) {
      say(t('edUndoEmpty'));
      return;
    }
    for (let i = last.length - 1; i >= 0; i--) {
      const [f, index, before] = last[i]!;
      const blocks = loc.floors[f];
      if (blocks) blocks[index] = before;
    }
    dirty = true;
    renderFloors();
    renderBlocks();
    redraw();
  };

  const typing = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;
  const onKeyDown = (e: KeyboardEvent) => {
    if (!root.contains(canvas)) return;
    if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && !typing()) {
      e.preventDefault();
      undoLast();
    } else if (e.code === 'Space' && !typing()) {
      e.preventDefault();
      space = true;
      canvas.style.cursor = 'grab';
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return;
    space = false;
    if (!pan) canvas.style.cursor = 'crosshair';
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  const resize = new ResizeObserver(() => redraw());
  resize.observe(mapBox);
  /** Leaving the editor screen: remove the window listeners. */
  const leave = () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    resize.disconnect();
  };
  // Unsaved changes are asked about only by our own buttons ("Exit", changing location): blocking page close in Electron silently
  // prevents both closing the window and reloading the page. The question uses our own window (confirm in Electron is a Windows dialog).
  const sure = (): Promise<boolean> => {
    if (!dirty) return Promise.resolve(true);
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.className = 'pause';
      host.setAttribute('role', 'alertdialog');
      host.setAttribute('aria-modal', 'true');
      host.setAttribute('aria-labelledby', 'ed-ask-text');
      host.innerHTML = `
        <div class="pause-card editor-ask">
          <section class="panel">
            <p class="editor-ask-text" id="ed-ask-text"></p>
            <div class="pause-buttons">
              <button class="menu-button menu-primary" id="ed-ask-stay" type="button"></button>
              <button class="menu-button" id="ed-ask-leave" type="button"></button>
            </div>
          </section>
        </div>`;
      host.querySelector('#ed-ask-text')!.textContent = t('edUnsaved');
      const stay = host.querySelector<HTMLButtonElement>('#ed-ask-stay')!;
      const go = host.querySelector<HTMLButtonElement>('#ed-ask-leave')!;
      stay.textContent = t('edAskStay');
      go.textContent = t('edAskLeave');
      const done = (answer: boolean) => {
        window.removeEventListener('keydown', onAskKey, true);
        host.remove();
        resolve(answer);
      };
      const onAskKey = (e: KeyboardEvent) => {
        if (e.code !== 'Escape') return;
        e.stopPropagation();
        done(false);
      };
      window.addEventListener('keydown', onAskKey, true);
      stay.addEventListener('click', () => done(false));
      go.addEventListener('click', () => done(true));
      root.append(host);
      stay.focus();
    });
  };

  // ---------- location and variants ----------
  for (const def of levels) {
    const option = document.createElement('option');
    option.value = def.id;
    option.textContent = levelTitle(def);
    levelSelect.append(option);
  }
  let saved: LocationListEntry[] = [];
  const renderVariants = async (select?: string) => {
    saved = await platform.listLocations().catch(() => []);
    variantSelect.innerHTML = '';
    const game = document.createElement('option');
    game.value = '';
    game.textContent = t('edVariantGame');
    variantSelect.append(game);
    for (const entry of saved.filter((s) => s.base === baseDef.id)) {
      const option = document.createElement('option');
      option.value = entry.name;
      option.textContent = entry.name;
      variantSelect.append(option);
    }
    variantSelect.value = select && saved.some((s) => s.base === baseDef.id && s.name === select) ? select : '';
    variantShown = variantSelect.value;
  };

  /** Open a location: the game level as is or a saved variant (resume — the drawing returned with from a walk). */
  const open = async (def: LevelDef, variant: string, resume?: EditorLocation) => {
    baseDef = def;
    levelSelect.value = def.id;
    if (resume) loc = resume;
    else if (variant) {
      const raw = await platform.readLocation(def.id, variant).catch(() => null);
      const read = decodeLocation(raw, LEVELS, names);
      if (!read || read.base !== def.id) {
        say(t('edLoadFailed'), true);
        variantSelect.value = '';
        loc = locationFromLevel(def);
      } else {
        loc = read;
        say(tf('edLoaded', { name: variant }));
      }
    } else loc = locationFromLevel(def);
    nameInput.value = loc.name;
    loc.marks ??= marksFromLevel(def);
    loc.people ??= peopleFromLevel(def);
    selected = null;
    selectedPerson = null;
    selectedDecor = null;
    entryCache.clear();
    readObjects();
    floor = Math.min(1, loc.floors.length - 1);
    undo.length = 0;
    dirty = resume ? Boolean(options.resumeDirty) : false;
    await renderVariants(resume ? loc.name : variant);
    fit();
    renderFloors();
    renderCeiling();
    setMode(mode);
    await moveOwnBlocks();
  };

  /**
   * Custom location blocks from the file (stage 5, before the library) — into the library: a folder with the image and settings, cells — to the folder's
   * block, the custom door lock — on each such door on the map.
   */
  const moveOwnBlocks = async () => {
    const own = loc.blocks ?? [];
    if (!own.length) return;
    const taken = new Set([...blockFolders().map((f) => f.name.toLowerCase()), ...libraryBlocks().map((b) => b.name.toLowerCase())]);
    const moved: string[] = [];
    const rename = new Map<string, string>();
    for (const b of own) {
      let base = b.name
        .replace(/[^\p{L}\p{N} _()-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 50);
      if (!BLOCK_NAME.test(base)) base = tf('edBlockDefaultName', { n: moved.length + 1 });
      let name = base;
      for (let k = 2; taken.has(name.toLowerCase()); k++) name = `${base} ${k}`;
      try {
        await platform.writeBlockFile(name, 'block.png', await texturePng(tex[b.texture]));
        await writeSettings(name, b.kind === 'door' ? { kind: 'door', ...(b.sound ? { sound: b.sound } : {}) } : {});
      } catch {
        continue;
      }
      taken.add(name.toLowerCase());
      rename.set(b.id, `b:${name}`);
      moved.push(name);
      const first = loc.floors[1] ?? [];
      if (b.locked) for (let i = 0; i < first.length; i++) if (first[i] === b.id) (loc.locks ??= {})[i] = true;
    }
    for (const f of loc.floors) {
      for (let i = 0; i < f.length; i++) {
        const to = f[i] ? rename.get(f[i]!) : undefined;
        if (to) f[i] = to;
      }
    }
    loc.blocks = own.filter((b) => !rename.has(b.id));
    if (!loc.blocks.length) delete loc.blocks;
    if (!moved.length) return;
    dirty = true;
    await reloadLibrary();
    say(tf('edBlocksMoved', { list: moved.join(', ') }));
  };

  levelSelect.addEventListener('change', async () => {
    const def = LEVELS[levelSelect.value];
    const was = baseDef.id;
    if (!def || !(await sure())) {
      levelSelect.value = was;
      return;
    }
    void open(def, '');
  });
  let variantShown = '';
  variantSelect.addEventListener('change', async () => {
    const next = variantSelect.value;
    if (!(await sure())) {
      variantSelect.value = variantShown;
      return;
    }
    void open(baseDef, next);
  });
  nameInput.addEventListener('input', () => {
    loc.name = nameInput.value.trim();
  });

  $('ed-save').addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      say(t('edNeedName'), true);
      nameInput.focus();
      return;
    }
    if (!NAME.test(name)) {
      say(t('edBadName'), true);
      nameInput.focus();
      return;
    }
    loc.name = name;
    platform
      .writeLocation(loc.base, name, encodeLocation(loc))
      .then(async (path) => {
        dirty = false;
        say(tf('edSaved', { path }));
        await renderVariants(name);
      })
      .catch((e: unknown) => say(tf('edSaveFailed', { error: e instanceof Error ? e.message : String(e) }), true));
  });
  $('ed-walk').addEventListener('click', () => {
    leave();
    options.onWalk(loc, dirty);
  });
  /**
   * "Share": give this location to a friend (pack the saved one — the location and its custom blocks in one folder) or install
   * a location from a friend (choose the received folder or take one from the packs folder). An installed one opens at once.
   */
  const shareDialog = async () => {
    const packs = await platform.listPacks();
    const { host, close } = modal(
      `<div class="pause-card editor-block-card editor-share-card">
        <section class="panel editor-block-panel">
          <h2 id="ed-block-title"></h2>
          <h3 class="editor-group" id="ed-sh-out-title"></h3>
          <p class="editor-hint" id="ed-sh-out-text"></p>
          <button class="menu-button" id="ed-sh-pack" type="button"></button>
          <p class="editor-hint" id="ed-sh-out-result" role="status"></p>
          <h3 class="editor-group" id="ed-sh-in-title"></h3>
          <p class="editor-hint" id="ed-sh-in-text"></p>
          <div class="editor-share-list" id="ed-sh-list"></div>
          <p class="editor-hint editor-error" id="ed-sh-error" role="alert"></p>
          <div class="pause-buttons"><button class="menu-button" id="ed-sh-close" type="button"></button></div>
        </section>
      </div>`,
      () => {},
    );
    const q = <T extends HTMLElement>(id: string) => host.querySelector<T>('#' + id)!;
    q('ed-block-title').textContent = t('edShareTitle');
    q('ed-sh-out-title').textContent = t('edShareOutTitle');
    q('ed-sh-out-text').textContent = t('edShareOutText');
    q('ed-sh-in-title').textContent = t('edShareInTitle');
    q('ed-sh-in-text').textContent = t('edShareInText');
    q('ed-sh-close').textContent = t('edClose');
    q('ed-sh-close').addEventListener('click', close);
    const error = q('ed-sh-error');
    // Only a saved location without unsaved edits can be packed.
    const saved = variantSelect.value;
    const pack = q<HTMLButtonElement>('ed-sh-pack');
    const result = q('ed-sh-out-result');
    pack.textContent = tf('edPack', { name: saved || loc.name || '—' });
    pack.disabled = !saved || dirty;
    if (pack.disabled) result.textContent = t('edPackNeedSave');
    pack.addEventListener('click', async () => {
      try {
        const packed = await platform.packLocation(baseDef.id, saved);
        result.textContent = [
          tf('edPacked', { path: packed.path }),
          packed.blocks.length ? tf('edPackedBlocks', { list: packed.blocks.join(', ') }) : '',
          packed.missing.length ? tf('edPackedMissing', { list: packed.missing.join(', ') }) : '',
        ]
          .filter(Boolean)
          .join('\n');
        // Just packed — refresh the "install" list below.
        renderList(await platform.listPacks());
      } catch (e) {
        error.textContent = tf('edUnpackFailed', { error: e instanceof Error ? e.message : String(e) });
      }
    });
    // Install: choose a folder (game window) or one from the packs folder.
    const list = q('ed-sh-list');
    const unpack = async (name?: string) => {
      if (!(await sure())) return;
      try {
        const got = await platform.unpackLocation(name);
        if (!got) return;
        close();
        await reloadLibrary();
        const def = LEVELS[got.base];
        if (def) {
          dirty = false;
          await open(def, got.name);
        }
        say(
          [
            tf('edUnpacked', { name: got.name }),
            got.added.length ? tf('edUnpackedAdded', { list: got.added.join(', ') }) : '',
            got.renamed.length ? tf('edUnpackedRenamed', { list: got.renamed.map(([a, b]) => `${a} → ${b}`).join(', ') }) : '',
          ]
            .filter(Boolean)
            .join(' '),
        );
      } catch (e) {
        error.textContent = tf('edUnpackFailed', { error: e instanceof Error ? e.message : String(e) });
      }
    };
    const renderList = (names: string[]) => {
      list.innerHTML = '';
      if (platform.canChooseFolder()) {
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'menu-button menu-primary';
        choose.textContent = t('edUnpackChoose');
        choose.addEventListener('click', () => void unpack());
        list.append(choose);
      }
      for (const name of names) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu-button editor-small';
        button.textContent = tf('edUnpackFrom', { name });
        button.addEventListener('click', () => void unpack(name));
        list.append(button);
      }
      if (!names.length && !platform.canChooseFolder()) {
        const none = document.createElement('p');
        none.className = 'editor-hint';
        none.textContent = t('edNoPacks');
        list.append(none);
      }
    };
    renderList(packs);
    (pack.disabled ? q('ed-sh-close') : pack).focus();
  };
  $('ed-share').addEventListener('click', () => void shareDialog());
  $('ed-exit').addEventListener('click', async () => {
    if (!(await sure())) return;
    leave();
    options.onExit();
  });

  canvas.style.cursor = 'crosshair';
  // For tests: where the middle of a cell is on screen and what is in it on a floor.
  (window as unknown as { __editor?: unknown }).__editor = {
    cellCenter: (x: number, y: number) => {
      const box = canvas.getBoundingClientRect();
      return { x: box.left + offX + (x + 0.5) * cell, y: box.top + offY + (y + 0.5) * cell };
    },
    blockAt: (f: number, x: number, y: number) => loc.floors[f]?.[y * loc.width + x] ?? null,
    decor: () => shownDecor().map((d) => ({ key: d.key, kind: d.kind, pid: d.pid, look: decorLooks.get(d.pid), at: edits().moved[d.key] ?? { x: d.x, y: d.y } })),
    people: () => people.map((p) => ({ key: p.key, role: p.role, at: p.role === 'important' ? (crowd().moved[p.key] ?? p.def) : p.def })),
    get location() {
      return loc;
    },
  };
  await open(baseDef, '', options.resume);
  void loadNames();
}
