// Bridge for the start / activation window only.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sc', {
  activate: (key, centralUrl) => ipcRenderer.invoke('activate', { key, centralUrl }),
  onStatus: (fn) => ipcRenderer.on('status', (event, status) => fn(status)),
  changeKey: () => ipcRenderer.invoke('change-key'),
})
