// Uniform access to settings and game files in Electron and in the browser (dev mode).

export interface GameConfig {
  gameDir: string;
  gameOk: boolean;
  lang: string;
  /** Saved game settings (volume, mouse); null — not saved yet. Parsing — in ui/settings.ts. */
  settings?: Record<string, unknown> | null;
}

export interface SaveListEntry {
  slot: string;
  savedAt: string;
  label: string;
}

/** A location variant from the location editor (the locations folder): game level, variant name, when saved. */
export interface LocationListEntry {
  base: string;
  name: string;
  savedAt: string;
}

/** A library block (the blocks folder): name (folder name) and its files. */
export interface BlockFolderEntry {
  name: string;
  files: { file: string; size: number }[];
}

/** A packed location: folder, blocks taken, which blocks are missing from the library. */
export interface PackResult {
  path: string;
  blocks: string[];
  missing: string[];
}

/** An unpacked location: level and variant name; new, already existing and renamed ("… (2)") blocks. */
export interface UnpackResult {
  base: string;
  name: string;
  added: string[];
  same: string[];
  renamed: [string, string][];
}

export interface FolderResult {
  ok: boolean;
  reason?: string;
  gameDir?: string;
}

interface DesktopApi {
  getConfig(): Promise<GameConfig>;
  setLang(lang: string): Promise<void>;
  setSettings(settings: object): Promise<void>;
  chooseFolder(): Promise<FolderResult>;
  setFolder(dir: string): Promise<FolderResult>;
  quit(): Promise<void>;
  listSaves(): Promise<SaveListEntry[]>;
  readSave(slot: string): Promise<unknown>;
  writeSave(slot: string, data: unknown): Promise<boolean>;
  listLocations(): Promise<LocationListEntry[]>;
  readLocation(base: string, name: string): Promise<unknown>;
  writeLocation(base: string, name: string, data: unknown): Promise<string>;
  readLocationChoice(): Promise<Record<string, string>>;
  writeLocationChoice(choice: Record<string, string>): Promise<Record<string, string>>;
  listBlocks(): Promise<BlockFolderEntry[]>;
  readBlockFile(name: string, file: string): Promise<Uint8Array | null>;
  writeBlockFile(name: string, file: string, bytes: Uint8Array): Promise<string>;
  openBlocksFolder(name?: string): Promise<boolean>;
  packLocation(base: string, name: string): Promise<PackResult>;
  listPacks(): Promise<string[]>;
  unpackLocation(name?: string): Promise<UnpackResult | null>;
  assetBase: string;
  existsBase: string;
}

// globalThis, not window: the module is also read by tests (there is no window outside the browser).
const desktop = (globalThis as unknown as { desktop?: DesktopApi }).desktop;

async function postJson<T>(url: string, value: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  return (await response.json()) as T;
}

export const platform = {
  /** Electron has a folder picker; in the browser the path is typed in by hand. */
  hasFolderDialog: Boolean(desktop),

  getConfig(): Promise<GameConfig> {
    if (desktop) return desktop.getConfig();
    return fetch('/api/config').then((r) => r.json() as Promise<GameConfig>);
  },

  setLang(lang: string): Promise<unknown> {
    if (desktop) return desktop.setLang(lang);
    return postJson('/api/lang', lang);
  },

  /** Saves game settings next to the Fallout folder (config.json). */
  setSettings(settings: object): Promise<unknown> {
    if (desktop) return desktop.setSettings(settings);
    return postJson('/api/settings', settings);
  },

  chooseFolder(): Promise<FolderResult> {
    if (desktop) return desktop.chooseFolder();
    return Promise.resolve({ ok: false, reason: 'cancelled' });
  },

  setFolder(dir: string): Promise<FolderResult> {
    if (desktop) return desktop.setFolder(dir);
    return postJson<FolderResult>('/api/folder', dir);
  },

  /** Close the game. A browser tab can't be closed — the page just reloads. */
  quit(): void {
    if (desktop) {
      void desktop.quit();
      return;
    }
    window.close();
    window.setTimeout(() => window.location.reload(), 150);
  },

  /** Game saves: list (newest first), reading and writing a slot. */
  listSaves(): Promise<SaveListEntry[]> {
    if (desktop) return desktop.listSaves();
    return fetch('/api/saves').then((r) => r.json() as Promise<SaveListEntry[]>);
  },

  readSave(slot: string): Promise<unknown> {
    if (desktop) return desktop.readSave(slot);
    return fetch('/api/saves?slot=' + encodeURIComponent(slot)).then((r) => r.json());
  },

  async writeSave(slot: string, data: unknown): Promise<boolean> {
    if (desktop) return desktop.writeSave(slot, data);
    const response = await fetch('/api/saves?slot=' + encodeURIComponent(slot), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.ok;
  },

  /** Location variants (location editor): list, read, write. Writing returns the file path; an invalid name — an error. */
  listLocations(): Promise<LocationListEntry[]> {
    if (desktop) return desktop.listLocations();
    return fetch('/api/locations').then((r) => r.json() as Promise<LocationListEntry[]>);
  },

  readLocation(base: string, name: string): Promise<unknown> {
    if (desktop) return desktop.readLocation(base, name);
    return fetch(`/api/locations?base=${encodeURIComponent(base)}&name=${encodeURIComponent(name)}`).then((r) => r.json());
  },

  async writeLocation(base: string, name: string, data: unknown): Promise<string> {
    if (desktop) return desktop.writeLocation(base, name, data);
    const response = await fetch(`/api/locations?base=${encodeURIComponent(base)}&name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    const reply = (await response.json()) as { path?: string; error?: string };
    if (!response.ok || !reply.path) throw new Error(reply.error ?? 'Could not save');
    return reply.path;
  },

  /** Custom locations in the game (main menu settings): level → variant name. Unreadable — empty. */
  async readLocationChoice(): Promise<Record<string, string>> {
    try {
      if (desktop) return await desktop.readLocationChoice();
      return (await (await fetch('/api/locations/choice')).json()) as Record<string, string>;
    } catch {
      return {};
    }
  },

  writeLocationChoice(choice: Record<string, string>): Promise<Record<string, string>> {
    if (desktop) return desktop.writeLocationChoice(choice);
    return fetch('/api/locations/choice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(choice) }).then((r) => r.json() as Promise<Record<string, string>>);
  },

  /** The block library (the blocks folder): a list of blocks with files; no folder — empty. */
  async listBlocks(): Promise<BlockFolderEntry[]> {
    try {
      if (desktop) return await desktop.listBlocks();
      return (await (await fetch('/api/blocks')).json()) as BlockFolderEntry[];
    } catch {
      return [];
    }
  },

  /** A block file (bytes); none — null. */
  async readBlockFile(name: string, file: string): Promise<Uint8Array | null> {
    if (desktop) return desktop.readBlockFile(name, file);
    const response = await fetch(`/api/blocks?name=${encodeURIComponent(name)}&file=${encodeURIComponent(file)}`);
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  },

  /** Write a block file (the folder is created). Returns the block folder path; an invalid name — an error. */
  async writeBlockFile(name: string, file: string, bytes: Uint8Array): Promise<string> {
    if (desktop) return desktop.writeBlockFile(name, file, bytes);
    const response = await fetch(`/api/blocks?name=${encodeURIComponent(name)}&file=${encodeURIComponent(file)}`, { method: 'POST', body: bytes as BodyInit });
    const reply = (await response.json()) as { path?: string; error?: string };
    if (!response.ok || !reply.path) throw new Error(reply.error ?? 'Could not write');
    return reply.path;
  },

  /** Open a block folder (or the whole library) in the file explorer; in the browser (development) — impossible: false. */
  async openBlocksFolder(name?: string): Promise<boolean> {
    return desktop ? desktop.openBlocksFolder(name) : false;
  },

  /** Pack a saved location for a friend (the packs/<name> folder; in the game window it opens right away). Error — an exception. */
  async packLocation(base: string, name: string): Promise<PackResult> {
    if (desktop) return desktop.packLocation(base, name);
    const response = await fetch(`/api/packs?action=pack&base=${encodeURIComponent(base)}&name=${encodeURIComponent(name)}`, { method: 'POST' });
    const reply = (await response.json()) as PackResult & { error?: string };
    if (!response.ok) throw new Error(reply.error ?? 'Could not pack');
    return reply;
  },

  /** Packed locations in the packs folder. */
  async listPacks(): Promise<string[]> {
    try {
      if (desktop) return await desktop.listPacks();
      return (await (await fetch('/api/packs')).json()) as string[];
    } catch {
      return [];
    }
  },

  /** Unpack a location: from packs by name or (game window, no name) — a chosen folder. Selection cancelled — null. */
  async unpackLocation(name?: string): Promise<UnpackResult | null> {
    if (desktop) return desktop.unpackLocation(name);
    if (!name) return null;
    const response = await fetch(`/api/packs?action=unpack&name=${encodeURIComponent(name)}`, { method: 'POST' });
    const reply = (await response.json()) as UnpackResult & { error?: string };
    if (!response.ok) throw new Error(reply.error ?? 'Could not unpack');
    return reply;
  },

  /** Whether a folder on disk can be chosen (game window — yes, the browser during development — no). */
  canChooseFolder(): boolean {
    return !!desktop;
  },

  /** Whether a file exists in the game copy. We ask in advance instead of trying to load it: that way there are no extra 404 errors in the console. */
  async gameFileExists(name: string): Promise<boolean> {
    return (await this.gameFileKnown(name)) ?? false;
  },

  /** The same, but null — no one to ask (tests without a game copy): then the caller decides. */
  async gameFileKnown(name: string): Promise<boolean | null> {
    const path = name.split('\\').map(encodeURIComponent).join('/');
    const url = desktop ? desktop.existsBase + path : '/api/exists?path=' + encodeURIComponent(name);
    try {
      return Boolean(((await (await fetch(url)).json()) as { exists?: boolean }).exists);
    } catch {
      return null;
    }
  },

  /** A file from the player's Fallout copy, e.g. "ART\\CRITTERS\\MAMRATAA.FRM". */
  async readGameFile(name: string): Promise<Uint8Array> {
    const base = desktop ? desktop.assetBase : '/game/';
    const response = await fetch(base + name.split('\\').map(encodeURIComponent).join('/'));
    if (!response.ok) throw new Error('No file in the game copy: ' + name);
    return new Uint8Array(await response.arrayBuffer());
  },
};
