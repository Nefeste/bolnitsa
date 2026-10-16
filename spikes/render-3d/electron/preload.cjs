// из spikes/map-render: electron/preload.cjs (+ saveShot)
// Мостик страницы к оболочке: только то, что нужно пробе (память, сведения, запись итога и снимков).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('probe', {
  save: json => ipcRenderer.invoke('probe:save', json),
  saveShot: (name, dataUrl) => ipcRenderer.invoke('probe:shot', name, dataUrl),
  metrics: () => ipcRenderer.invoke('probe:metrics'),
  info: () => ipcRenderer.invoke('probe:info'),
  firstFrame: ms => ipcRenderer.send('probe:first-frame', ms),
});
