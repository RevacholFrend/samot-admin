// Мост для админского Electron-окна: вход через Google (loopback 53100)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adminEnv', {
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  googleSignInStart: () => ipcRenderer.invoke('auth:google-start'),
  googleSignInOpen: (url) => ipcRenderer.invoke('auth:google-open', url),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  downloadAndRunUpdate: (url, sha256) => ipcRenderer.invoke('update:download-and-run', url, sha256),
  onUpdateProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },
  onGoogleCode: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('auth:google-code', listener);
    return () => ipcRenderer.removeListener('auth:google-code', listener);
  },
  openProjectEditor: (pid) => ipcRenderer.invoke('admin:open-project-editor', Number(pid) || 0),
  closeWindow: () => ipcRenderer.send('editor:close-window'),
});
