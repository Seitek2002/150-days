// Map cells the player has already seen (for the automap), as a short string for the save.
// String format: "widthxheight:data", the data is one bit per cell (8 cells per byte), bytes in base64.
// The size at the start is needed so that after a level edit an old record does not land on the wrong cells: it is simply discarded.

/** Pack the "seen" array (by index `y * width + x`, 1 means seen). An empty map gives an empty string. */
export function packSeen(seen: Uint8Array, width: number): string {
  const bytes = new Uint8Array(Math.ceil(seen.length / 8));
  let any = false;
  for (let i = 0; i < seen.length; i++) {
    if (!seen[i]) continue;
    bytes[i >> 3]! |= 1 << (i & 7);
    any = true;
  }
  if (!any) return '';
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `${width}x${seen.length / width}:${btoa(binary)}`;
}

/** Unpack into the `seen` array (the same size as when packing). A different size or a corrupted string is silently skipped. */
export function unpackSeen(text: string | undefined, seen: Uint8Array, width: number): void {
  if (!text) return;
  const colon = text.indexOf(':');
  if (colon < 0 || text.slice(0, colon) !== `${width}x${seen.length / width}`) return;
  let binary: string;
  try {
    binary = atob(text.slice(colon + 1));
  } catch {
    return;
  }
  const cells = Math.min(seen.length, binary.length * 8);
  for (let i = 0; i < cells; i++) if ((binary.charCodeAt(i >> 3) >> (i & 7)) & 1) seen[i] = 1;
}
