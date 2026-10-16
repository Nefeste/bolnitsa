// Мостик страницы к оболочке: только то, что нужно пробе (память, сведения, запись итога).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('probe', {
  save: json => ipcRenderer.invoke('probe:save', json),
  metrics: () => ipcRenderer.invoke('probe:metrics'),
  info: () => ipcRenderer.invoke('probe:info'),
  firstFrame: ms => ipcRenderer.send('probe:first-frame', ms),
});
