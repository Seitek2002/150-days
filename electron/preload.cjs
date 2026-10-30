// The bridge between the window and Electron: settings, choosing the Fallout folder and quitting the game.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setLang: (lang) => ipcRenderer.invoke('config:set-lang', lang),
  setSettings: (settings) => ipcRenderer.invoke('config:set-settings', settings),
  chooseFolder: () => ipcRenderer.invoke('game:choose-folder'),
  setFolder: (dir) => ipcRenderer.invoke('game:set-folder', dir),
  quit: () => ipcRenderer.invoke('app:quit'),
  listSaves: () => ipcRenderer.invoke('saves:list'),
  readSave: (slot) => ipcRenderer.invoke('saves:read', slot),
  writeSave: (slot, data) => ipcRenderer.invoke('saves:write', slot, data),
  listLocations: () => ipcRenderer.invoke('locations:list'),
  readLocation: (base, name) => ipcRenderer.invoke('locations:read', base, name),
  writeLocation: (base, name, data) => ipcRenderer.invoke('locations:write', base, name, data),
  readLocationChoice: () => ipcRenderer.invoke('locations:choice-get'),
  writeLocationChoice: (choice) => ipcRenderer.invoke('locations:choice-set', choice),
  listBlocks: () => ipcRenderer.invoke('blocks:list'),
  readBlockFile: (name, file) => ipcRenderer.invoke('blocks:read', name, file),
  writeBlockFile: (name, file, bytes) => ipcRenderer.invoke('blocks:write', name, file, bytes),
  openBlocksFolder: (name) => ipcRenderer.invoke('blocks:open', name),
  packLocation: (base, name) => ipcRenderer.invoke('packs:pack', base, name),
  listPacks: () => ipcRenderer.invoke('packs:list'),
  unpackLocation: (name) => ipcRenderer.invoke('packs:unpack', name),
  assetBase: 'game://asset/',
  existsBase: 'game://exists/',
});
