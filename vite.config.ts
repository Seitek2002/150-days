/// <reference types="vitest/config" />
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const require = createRequire(import.meta.url);
const { openGame, checkGameFolder } = require('./electron/gamefiles.cjs');
const { listSaves, readSave, writeSave } = require('./electron/saves.cjs');
const { listLocations, readLocation, writeLocation, readChoice, writeChoice } = require('./electron/locations.cjs');
const { listBlocks, readBlockFile, writeBlockFile } = require('./electron/blocks.cjs');
const { packLocation, listPacks, unpackLocation } = require('./electron/packs.cjs');

// For development in the browser: the same access to the Fallout copy as in Electron,
// but through the /game/<path> and /api/* addresses. Settings are in .local/config.json.
function gameFilesForDev(): Plugin {
  const configFile = path.resolve('.local/config.json');
  let config: { gameDir?: string; lang?: string; settings?: Record<string, number | boolean> } = {};
  try {
    config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    config = {};
  }
  const save = () => {
    fs.mkdirSync(path.dirname(configFile), { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  };
  let game = config.gameDir && checkGameFolder(config.gameDir).ok ? openGame(config.gameDir) : null;

  /** Game settings: keep only known fields of the right type (the game itself checks the ranges). */
  const pickSettings = (raw: unknown): Record<string, number | boolean> => {
    const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const out: Record<string, number | boolean> = {};
    for (const key of ['sfx', 'music', 'sensitivity']) {
      const v = input[key];
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    }
    if (typeof input.invertY === 'boolean') out.invertY = input.invertY;
    if (typeof input.fastGraphics === 'boolean') out.fastGraphics = input.fastGraphics;
    return out;
  };

  return {
    name: 'game-files-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://local');
        if (url.pathname.startsWith('/game/')) {
          const data = game?.read(decodeURIComponent(url.pathname.slice('/game/'.length)));
          if (!data) {
            res.statusCode = 404;
            res.end('not found');
            return;
          }
          res.setHeader('content-type', 'application/octet-stream');
          res.end(data);
          return;
        }
        // Whether the file is in the game copy: a 200 reply with JSON, so the console shows no 404 errors from "try and see".
        if (url.pathname === '/api/exists' && req.method === 'GET') {
          const name = url.searchParams.get('path') ?? '';
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ exists: Boolean(name && game?.read(name)) }));
          return;
        }
        // Saves: GET /api/saves — the list, GET /api/saves?slot=… — one, POST /api/saves?slot=… — write.
        if (url.pathname === '/api/saves') {
          const savesDir = path.resolve('.local/saves');
          const slot = url.searchParams.get('slot');
          const reply = (value: unknown) => {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(value));
          };
          if (req.method === 'GET') {
            reply(slot ? readSave(savesDir, slot) : listSaves(savesDir));
            return;
          }
          if (req.method === 'POST' && slot) {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
              try {
                reply(writeSave(savesDir, slot, JSON.parse(body || 'null')));
              } catch (e) {
                res.statusCode = 400;
                reply({ error: String(e) });
              }
            });
            return;
          }
        }
        // Location variants (location editor), the project's locations folder: GET /api/locations — the list, GET ?base=…&name=… —
        // one, POST ?base=…&name=… — write (the reply is the file path).
        // The choice of own locations (main menu settings): GET — read, POST — write.
        // Packed locations (the project's packs folder): GET /api/packs — the list, POST /api/packs?action=pack&base=…&name=… —
        // pack, POST /api/packs?action=unpack&name=… — unpack a folder from packs (the browser has no folder picker).
        if (url.pathname === '/api/packs') {
          const dirs = { locations: path.resolve('locations'), blocks: path.resolve('blocks'), packs: path.resolve('packs') };
          res.setHeader('content-type', 'application/json');
          try {
            const action = url.searchParams.get('action');
            const name = url.searchParams.get('name') ?? '';
            if (req.method === 'GET') res.end(JSON.stringify(listPacks(dirs.packs)));
            else if (action === 'pack') res.end(JSON.stringify(packLocation(dirs, url.searchParams.get('base') ?? '', name)));
            else if (action === 'unpack' && listPacks(dirs.packs).includes(name)) res.end(JSON.stringify(unpackLocation(dirs, path.join(dirs.packs, name))));
            else throw new Error('Invalid request');
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
          }
          return;
        }
        // The block library, the project's blocks folder: GET /api/blocks — the list, GET ?name=…&file=… — a file (bytes),
        // POST ?name=…&file=… — write a file (the body is the bytes).
        if (url.pathname === '/api/blocks') {
          const dir = path.resolve('blocks');
          const name = url.searchParams.get('name');
          const file = url.searchParams.get('file');
          const fail = (e: unknown) => {
            res.statusCode = 400;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: String(e) }));
          };
          if (req.method === 'GET') {
            try {
              if (!name || !file) {
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify(listBlocks(dir)));
                return;
              }
              const bytes = readBlockFile(dir, name, file);
              if (!bytes) {
                res.statusCode = 404;
                res.end();
                return;
              }
              res.setHeader('content-type', 'application/octet-stream');
              res.end(bytes);
            } catch (e) {
              fail(e);
            }
            return;
          }
          if (req.method === 'POST' && name && file) {
            const chunks: Buffer[] = [];
            req.on('data', (chunk: Buffer) => chunks.push(chunk));
            req.on('end', () => {
              try {
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify({ path: writeBlockFile(dir, name, file, Buffer.concat(chunks)) }));
              } catch (e) {
                fail(e);
              }
            });
            return;
          }
        }
        if (url.pathname === '/api/locations/choice') {
          const dir = path.resolve('locations');
          res.setHeader('content-type', 'application/json');
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
              try {
                res.end(JSON.stringify(writeChoice(dir, JSON.parse(body || '{}'))));
              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: String(e) }));
              }
            });
            return;
          }
          res.end(JSON.stringify(readChoice(dir)));
          return;
        }
        if (url.pathname === '/api/locations') {
          const dir = path.resolve('locations');
          const base = url.searchParams.get('base');
          const name = url.searchParams.get('name');
          const reply = (value: unknown, status = 200) => {
            res.statusCode = status;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(value));
          };
          if (req.method === 'GET') {
            try {
              reply(base && name ? readLocation(dir, base, name) : listLocations(dir));
            } catch (e) {
              reply({ error: String(e) }, 400);
            }
            return;
          }
          if (req.method === 'POST' && base && name) {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
              try {
                reply({ path: writeLocation(dir, base, name, JSON.parse(body || 'null')) });
              } catch (e) {
                reply({ error: String(e) }, 400);
              }
            });
            return;
          }
        }
        if (url.pathname === '/api/config' && req.method === 'GET') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ gameDir: config.gameDir ?? '', gameOk: Boolean(game), lang: config.lang ?? '', settings: config.settings ?? null }));
          return;
        }
        if (url.pathname === '/api/settings' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', () => {
            try {
              config.settings = pickSettings(JSON.parse(body || '{}').value);
              save();
            } catch {
              res.statusCode = 400;
            }
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: res.statusCode === 200 }));
          });
          return;
        }
        if ((url.pathname === '/api/folder' || url.pathname === '/api/lang') && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', () => {
            const value = String(JSON.parse(body || '{}').value ?? '');
            let result: object = { ok: true };
            if (url.pathname === '/api/lang') {
              config.lang = value === 'en' ? 'en' : 'ru';
              save();
            } else {
              const check = checkGameFolder(value);
              if (check.ok) {
                game?.close();
                game = openGame(value);
                config.gameDir = value;
                save();
              }
              result = { ...check, gameDir: value };
            }
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(result));
          });
          return;
        }
        next();
      });
    },
  };
}

// base: './' — so that the built game opens from a folder inside Electron.
export default defineConfig({
  base: './',
  // The version number from package.json — at the bottom of the main menu (which version a friend has).
  define: { __APP_VERSION__: JSON.stringify(require('./package.json').version) },
  plugins: [gameFilesForDev()],
  server: { port: 5174, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
  test: { include: ['tests/**/*.test.ts'] },
});
