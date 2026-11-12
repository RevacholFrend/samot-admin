// Мост между GUI и главным процессом SAMOT Packager.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('packager', {
  pickSrc: () => ipcRenderer.invoke('pkg:pick-src'),
  pickTarget: () => ipcRenderer.invoke('pkg:pick-target'),
  listExe: (src) => ipcRenderer.invoke('pkg:list-exe', src),
  build: (args) => ipcRenderer.invoke('pkg:build', args),
  openFolder: (target) => ipcRenderer.invoke('pkg:open-folder', target),
  copyText: (text) => ipcRenderer.invoke('pkg:copy-text', text),

  onLog: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('pkg:log', listener);
    return () => ipcRenderer.removeListener('pkg:log', listener);
  },
  onDone: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('pkg:done', listener);
    return () => ipcRenderer.removeListener('pkg:done', listener);
  },
});
