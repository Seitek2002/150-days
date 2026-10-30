// Game textures for the location editor and for checking variant files: created once (their samples are in the block list);
// on top of them, the block library textures (our replaced blocks and custom blocks, src/world/block-library.ts).
import { createTextures, type Texture, type TextureName } from '../engine/textures.ts';
import { BUILTIN_NAMES, libraryBlocks, MISSING_TEXTURE } from './block-catalog.ts';
import { applyLibrary } from './block-library.ts';

let made: Record<TextureName, Texture> | null = null;

export function gameTextures(): Record<TextureName, Texture> {
  return applyLibrary((made ??= createTextures()));
}

/**
 * Names of the textures that exist in the game: "texture ..." blocks in foreign files are checked against them. Without creating the textures
 * themselves (that takes about a second): ours from the list of names, custom ones from the library.
 */
export const textureNames = (): ReadonlySet<string> => new Set<string>([...Object.keys(BUILTIN_NAMES), MISSING_TEXTURE, ...libraryBlocks().map((b) => b.texture)]);
