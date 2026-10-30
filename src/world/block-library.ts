// Block library: the blocks folder (next to the game; during development, in the project folder), like a resource pack: one folder per
// block, the folder name is the block name, the image name inside does not matter.
// - Images (PNG, JPG): several are variants of one block (the game alternates them by cell so a wall does not look like wallpaper).
//   Any size up to 2048 pixels; they are scaled down to the size of our textures (128×128).
// - Door sounds (WAV, OGG): a name containing "close" (or its Russian stem) is closing, the other is opening; a single one is used for both.
// - block.json holds settings written by the editor: block kind (plain, door, window), door sound from the game copy,
//   whether it rings from bullets (metal), whether it glows. Our blocks also store which of our textures it is (builtin) and the size of the exported
//   image (exported): if the image was changed, our texture is replaced throughout the game.
// The game exports our textures into the folder itself (one image each) if they are not there.
import { FILE_SOUNDS } from '../audio/sound.ts';
import { EMISSIVE, METALLIC, TEX, type Texture, type TextureName } from '../engine/textures.ts';
import { platform, type BlockFolderEntry } from '../platform.ts';
import { BLOCK_NAME, BUILTIN_NAMES, DOOR_SOUND, setLibrary, type LibraryBlock } from './block-catalog.ts';

/** Block settings (block.json). */
export interface BlockSettings {
  kind?: 'door' | 'window';
  sound?: string;
  metal?: boolean;
  glow?: boolean;
  builtin?: TextureName;
  exported?: number;
}

export const SETTINGS_FILE = 'block.json';
/** Images larger than this (per side) are skipped. */
export const MAX_IMAGE = 2048;
/** No more variants of one block are read. */
const MAX_VARIANTS = 8;

const BUILTINS = Object.keys(BUILTIN_NAMES) as TextureName[];

/** Settings from the file: only known fields of the right type. */
export function parseSettings(raw: unknown): BlockSettings {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: BlockSettings = {};
  if (r.kind === 'door' || r.kind === 'window') out.kind = r.kind;
  if (typeof r.sound === 'string' && DOOR_SOUND.test(r.sound)) out.sound = r.sound;
  if (r.metal === true) out.metal = true;
  if (r.glow === true) out.glow = true;
  if (typeof r.builtin === 'string' && (BUILTINS as string[]).includes(r.builtin)) out.builtin = r.builtin as TextureName;
  if (typeof r.exported === 'number' && Number.isInteger(r.exported) && r.exported > 0) out.exported = r.exported;
  return out;
}

/** Block folder files by kind: images (by name), open and close sounds, whether there are settings. */
export function sortFiles(files: readonly { file: string; size: number }[]): { images: { file: string; size: number }[]; open?: string; close?: string; settings: boolean } {
  const images = files.filter((f) => /\.(png|jpe?g)$/i.test(f.file)).sort((a, b) => a.file.localeCompare(b.file));
  const sounds = files.filter((f) => /\.(wav|ogg)$/i.test(f.file)).map((f) => f.file);
  const close = sounds.find((f) => /close/i.test(f));
  const open = sounds.find((f) => f !== close) ?? close;
  return { images, ...(open ? { open } : {}), ...(close ?? open ? { close: close ?? open } : {}), settings: files.some((f) => f.file === SETTINGS_FILE) };
}

/** Textures the library replaced or added: our texture → the player's images; a custom block (b:<name>) → its images. */
const textures = new Map<TextureName, Texture>();
/** What was skipped while reading (image too large, not an image), to show in the editor. */
let problems: string[] = [];
export const libraryProblems = (): readonly string[] => problems;
/** Block settings by name (for the block window in the editor). */
const settingsOf = new Map<string, BlockSettings>();
export const blockSettings = (name: string): BlockSettings => ({ ...(settingsOf.get(name) ?? {}) });
/** Folders that exist (name → files). */
let folders: BlockFolderEntry[] = [];
export const blockFolders = (): readonly BlockFolderEntry[] => folders;

let loading: Promise<void> | null = null;

/** Read the library (once; reload reads it again, after the folder changes). If it cannot be read, only our blocks. */
export function loadBlockLibrary(reload = false): Promise<void> {
  if (reload) loading = null;
  return (loading ??= readLibrary().catch((e: unknown) => {
    console.error(e);
    setLibrary(BUILTINS.map((t) => ({ name: BUILTIN_NAMES[t] ?? t, id: `tex:${t}`, texture: t, kind: 'wall' as const })));
  }));
}

async function readLibrary(): Promise<void> {
  folders = await platform.listBlocks();
  textures.clear();
  settingsOf.clear();
  problems = [];
  for (const name of [...FILE_SOUNDS.keys()]) if (name.startsWith('b:')) FILE_SOUNDS.delete(name);
  const blocks: LibraryBlock[] = [];
  const linked = new Set<TextureName>();
  for (const folder of folders) {
    if (!BLOCK_NAME.test(folder.name)) continue;
    const files = sortFiles(folder.files);
    const settings = files.settings ? parseSettings(await readJson(folder.name)) : {};
    settingsOf.set(folder.name, settings);
    // Our block: if the image was not changed, our texture stays (with its variants); if changed, the player's images are used throughout the game.
    // A second folder with the same texture of ours (a copied folder) is already a custom block.
    if (settings.builtin && !linked.has(settings.builtin)) {
      linked.add(settings.builtin);
      const untouched = files.images.length === 1 && files.images[0]!.size === settings.exported;
      if (files.images.length && !untouched) {
        const tex = await readTexture(folder.name, files.images);
        if (tex) textures.set(settings.builtin, tex);
      }
      blocks.push({ name: folder.name, id: `tex:${settings.builtin}`, texture: settings.builtin, kind: 'wall' });
      continue;
    }
    if (!files.images.length) continue;
    const tex = await readTexture(folder.name, files.images);
    if (!tex) continue;
    const texture = `b:${folder.name}` as TextureName;
    textures.set(texture, tex);
    if (settings.metal) METALLIC.add(texture);
    if (settings.glow) EMISSIVE.add(texture);
    const block: LibraryBlock = { name: folder.name, id: `b:${folder.name}`, texture, kind: settings.kind ?? 'wall' };
    if (block.kind === 'door') {
      if (files.open && files.close) {
        const open = files.open;
        const close = files.close;
        FILE_SOUNDS.set(`b:${folder.name}:O`, () => platform.readBlockFile(folder.name, open));
        FILE_SOUNDS.set(`b:${folder.name}:C`, () => platform.readBlockFile(folder.name, close));
        block.sound = `b:${folder.name}`;
      } else if (settings.sound) block.sound = settings.sound;
    }
    blocks.push(block);
  }
  // Our textures missing from the folder are still in the library (under their own names).
  for (const t of BUILTINS) if (!linked.has(t)) blocks.push({ name: BUILTIN_NAMES[t] ?? t, id: `tex:${t}`, texture: t, kind: 'wall' });
  setLibrary(blocks);
}

async function readJson(name: string): Promise<unknown> {
  try {
    const bytes = await platform.readBlockFile(name, SETTINGS_FILE);
    return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;
  } catch {
    return null;
  }
}

/** Folder images into a 128×128 texture with variants. If none can be read, null. */
async function readTexture(name: string, images: readonly { file: string }[]): Promise<Texture | null> {
  const variants: Uint32Array[] = [];
  for (const { file } of images.slice(0, MAX_VARIANTS)) {
    const pixels = await readImage(name, file);
    if (pixels) variants.push(pixels);
  }
  return variants.length ? { pixels: variants[0]!, variants } : null;
}

async function readImage(name: string, file: string): Promise<Uint32Array | null> {
  try {
    const bytes = await platform.readBlockFile(name, file);
    if (!bytes) return null;
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
    if (bitmap.width > MAX_IMAGE || bitmap.height > MAX_IMAGE) {
      problems.push(`${name}/${file}: ${bitmap.width}×${bitmap.height}`);
      bitmap.close();
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TEX;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, TEX, TEX);
    bitmap.close();
    const pixels = new Uint32Array(ctx.getImageData(0, 0, TEX, TEX).data.buffer.slice(0));
    // Transparent becomes opaque: walls and floors are drawn solid.
    for (let i = 0; i < pixels.length; i++) pixels[i] = pixels[i]! | 0xff000000;
    return pixels;
  } catch {
    problems.push(`${name}/${file}`);
    return null;
  }
}

/** Put the library textures into the game's texture set (our replaced textures and custom blocks). */
export function applyLibrary<T extends Record<TextureName, Texture>>(set: T): T {
  for (const [name, tex] of textures) (set as Record<string, Texture>)[name] = tex;
  return set;
}

/** PNG image from our texture (bytes). */
export async function texturePng(tex: Texture): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(tex.pixels.slice().buffer), TEX, TEX), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create the image');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Write block settings (block.json). */
export function writeSettings(name: string, settings: BlockSettings): Promise<string> {
  return platform.writeBlockFile(name, SETTINGS_FILE, new TextEncoder().encode(JSON.stringify(settings, null, 2)));
}

/** Wait until the window is idle (if unsupported, until the next event loop turn). */
const idle = (): Promise<void> =>
  new Promise((resolve) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => resolve(), { timeout: 2000 }) : setTimeout(resolve, 0)));

let exportStarted = false;
/** Export our textures once per launch, in the background (the editor or the game start creates them; not created again). */
export function exportBuiltinsOnce(set: Record<TextureName, Texture>): void {
  if (exportStarted) return;
  exportStarted = true;
  void loadBlockLibrary()
    .then(() => exportBuiltins(set))
    .catch((e: unknown) => console.error(e));
}

/**
 * Export into the folder our textures that are not there: a folder named after the texture (if taken by a custom block, with " (built-in)"), containing
 * block.png and block.json. Returns how many were exported.
 */
export async function exportBuiltins(set: Record<TextureName, Texture>): Promise<number> {
  const linked = new Set<string>();
  const taken = new Set(folders.map((f) => f.name));
  for (const f of folders) {
    const builtin = settingsOf.get(f.name)?.builtin;
    if (builtin) linked.add(builtin);
  }
  let count = 0;
  for (const t of BUILTINS) {
    // First check whether it is already exported: town and door textures are drawn on first access, and accessing all of them in a row
    // drew them all on every launch (seconds of loading on a weak laptop).
    if (linked.has(t)) continue;
    let name = BUILTIN_NAMES[t] ?? t;
    if (taken.has(name)) name = `${name} (built-in)`;
    if (taken.has(name) || !BLOCK_NAME.test(name)) continue;
    // One texture at a time in idle time: exporting in the background does not stall the game.
    await idle();
    const tex = set[t];
    if (!tex) continue;
    const png = await texturePng(tex);
    await platform.writeBlockFile(name, 'block.png', png);
    await writeSettings(name, { builtin: t, exported: png.length });
    taken.add(name);
    count++;
  }
  return count;
}
