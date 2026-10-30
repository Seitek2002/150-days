// The "150 Days" game window. Shows the built page from dist,
// serves it files from the player's Fallout copy at game://asset/<path> and stores the settings.
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { openGame, checkGameFolder } = require('./gamefiles.cjs');
const { listSaves, readSave, writeSave } = require('./saves.cjs');
const { listLocations, readLocation, writeLocation, readChoice, writeChoice } = require('./locations.cjs');
const { listBlocks, readBlockFile, writeBlockFile, folderOf } = require('./blocks.cjs');
const { packLocation, listPacks, unpackLocation } = require('./packs.cjs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'game', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const configPath = () => path.join(app.getPath('userData'), 'config.json');
const savesDir = () => path.join(app.getPath('userData'), 'saves');
/**
 * The folder of location variants (location editor): next to the game — easy to find and give to a friend; on Mac — in the app data
 * (writing inside the .app is not allowed); when run from the project (electron .) — in the project folder.
 */
const locationsDir = () => {
  if (!app.isPackaged) return path.join(app.getAppPath(), 'locations');
  if (process.platform === 'darwin') return path.join(app.getPath('userData'), 'locations');
  return path.join(path.dirname(process.execPath), 'locations');
};
/** The block library folder — in the same place as locations: inside the game folder (on Mac — in the app data). */
const blocksDir = () => {
  if (!app.isPackaged) return path.join(app.getAppPath(), 'blocks');
  if (process.platform === 'darwin') return path.join(app.getPath('userData'), 'blocks');
  return path.join(path.dirname(process.execPath), 'blocks');
};
/** The folder of packed locations ("Share" in the location editor) — in the same place. */
const packsDir = () => {
  if (!app.isPackaged) return path.join(app.getAppPath(), 'packs');
  if (process.platform === 'darwin') return path.join(app.getPath('userData'), 'packs');
  return path.join(path.dirname(process.execPath), 'packs');
};
const packDirs = () => ({ locations: locationsDir(), blocks: blocksDir(), packs: packsDir() });

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
}

/** Game settings: keep only known fields of the right type (the game itself checks the ranges). */
function pickSettings(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of ['sfx', 'music', 'sensitivity']) {
    if (typeof input[key] === 'number' && Number.isFinite(input[key])) out[key] = input[key];
  }
  if (typeof input.invertY === 'boolean') out.invertY = input.invertY;
  if (typeof input.fastGraphics === 'boolean') out.fastGraphics = input.fastGraphics;
  return out;
}

let config = {};
let game = null;

function useGameFolder(dir) {
  const check = checkGameFolder(dir);
  if (!check.ok) return check;
  if (game) game.close();
  game = openGame(dir);
  config.gameDir = dir;
  saveConfig(config);
  return check;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 960,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#000000',
    title: '150 Days',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  config = loadConfig();
  if (config.gameDir && checkGameFolder(config.gameDir).ok) game = openGame(config.gameDir);

  protocol.handle('game', (request) => {
    const url = new URL(request.url);
    const name = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    // game://exists/<path> — whether the file is in the game copy: a 200 reply with JSON, so the console shows no 404 errors.
    if (url.hostname === 'exists') return Response.json({ exists: Boolean(name && game && game.read(name)) });
    const data = game ? game.read(name) : null;
    if (!data) return new Response('not found', { status: 404 });
    return new Response(data, { headers: { 'content-type': 'application/octet-stream' } });
  });

  ipcMain.handle('config:get', () => ({
    gameDir: config.gameDir ?? '',
    gameOk: Boolean(game),
    lang: config.lang ?? '',
    settings: config.settings ?? null,
  }));
  ipcMain.handle('config:set-lang', (_event, lang) => {
    config.lang = lang === 'en' ? 'en' : 'ru';
    saveConfig(config);
  });
  ipcMain.handle('config:set-settings', (_event, settings) => {
    config.settings = pickSettings(settings);
    saveConfig(config);
  });
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('saves:list', () => listSaves(savesDir()));
  ipcMain.handle('saves:read', (_event, slot) => readSave(savesDir(), String(slot)));
  ipcMain.handle('saves:write', (_event, slot, data) => writeSave(savesDir(), String(slot), data));
  ipcMain.handle('locations:list', () => listLocations(locationsDir()));
  ipcMain.handle('locations:read', (_event, base, name) => readLocation(locationsDir(), String(base), String(name)));
  ipcMain.handle('locations:write', (_event, base, name, data) => writeLocation(locationsDir(), String(base), String(name), data));
  ipcMain.handle('locations:choice-get', () => readChoice(locationsDir()));
  ipcMain.handle('locations:choice-set', (_event, choice) => writeChoice(locationsDir(), choice));
  ipcMain.handle('blocks:list', () => listBlocks(blocksDir()));
  ipcMain.handle('blocks:read', (_event, name, file) => {
    const bytes = readBlockFile(blocksDir(), String(name), String(file));
    return bytes ? new Uint8Array(bytes) : null;
  });
  ipcMain.handle('blocks:write', (_event, name, file, bytes) => writeBlockFile(blocksDir(), String(name), String(file), bytes));
  // Pack a location: a folder in packs; open it right away in the file manager — that is what is given to the friend.
  ipcMain.handle('packs:pack', async (_event, base, name) => {
    const result = packLocation(packDirs(), String(base), String(name));
    await shell.openPath(result.path);
    return result;
  });
  ipcMain.handle('packs:list', () => listPacks(packsDir()));
  // Unpack: a folder from packs by name or one chosen by the player (cancel — null).
  ipcMain.handle('packs:unpack', async (event, name) => {
    let dir;
    if (name) {
      if (!listPacks(packsDir()).includes(String(name))) throw new Error('No such folder: ' + name);
      dir = path.join(packsDir(), String(name));
    } else {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
      if (result.canceled || !result.filePaths[0]) return null;
      dir = result.filePaths[0];
    }
    return unpackLocation(packDirs(), dir);
  });
  // Open a block folder (or the whole library) in the file manager — pictures are changed there.
  ipcMain.handle('blocks:open', async (_event, name) => {
    const dir = name ? folderOf(blocksDir(), String(name)) : blocksDir();
    fs.mkdirSync(dir, { recursive: true });
    return (await shell.openPath(dir)) === '';
  });
  ipcMain.handle('game:choose-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return { ok: false, reason: 'cancelled' };
    return { ...useGameFolder(result.filePaths[0]), gameDir: result.filePaths[0] };
  });
  ipcMain.handle('game:set-folder', (_event, dir) => ({ ...useGameFolder(String(dir)), gameDir: dir }));

  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
