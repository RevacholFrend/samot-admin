// Главный процесс «SAMOT Packager»: собирает папку для GitHub Release из папки игры.
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { buildGame } = require('./packager-core.cjs');

function createWindow() {
  const win = new BrowserWindow({
    width: 880,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    title: 'SAMOT Packager',
    backgroundColor: '#14171c',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'packager-preload.cjs'),
    },
  });
  win.loadFile(path.join(__dirname, 'packager.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

ipcMain.handle('pkg:pick-src', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Выберите папку с готовой игрой' });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle('pkg:pick-target', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: 'Куда сохранить результат' });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle('pkg:list-exe', (_e, src) => {
  if (!src || !fs.existsSync(src)) return [];
  const found = [];
  const walk = (dir, relBase = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = relBase ? relBase + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        if (/node_modules|\.git/i.test(entry.name)) continue;
        walk(abs, rel);
      } else if (/\.exe$/i.test(entry.name)) {
        try { found.push({ rel: rel.replace(/\\/g, '/'), size: fs.statSync(abs).size }); } catch { /* skip */ }
      }
    }
  };
  try { walk(src); } catch { return []; }
  return found.sort((a, b) => b.size - a.size).slice(0, 50);
});

let building = false;
ipcMain.handle('pkg:build', async (event, args) => {
  if (building) return { ok: false, error: 'Сборка уже идёт' };
  building = true;
  const send = (channel, payload) => { try { event.sender.send(channel, payload); } catch { /* окно закрыто */ } };
  try {
    const result = await buildGame({
      src: args?.src,
      target: args?.target || undefined,
      version: args?.version,
      tag: args?.tag,
      packSizeMB: args?.packSizeMB,
      entryPoint: args?.entryPoint || undefined,
      onLog: (line) => send('pkg:log', { line }),
    });
    send('pkg:done', { ok: true, target: result.target, stats: result.stats });
    return { ok: true };
  } catch (e) {
    const msg = String((e && e.message) || e);
    send('pkg:log', { line: 'ОШИБКА: ' + msg });
    send('pkg:done', { ok: false, error: msg });
    return { ok: false, error: msg };
  } finally {
    building = false;
  }
});

ipcMain.handle('pkg:open-folder', (_e, target) => {
  if (target && fs.existsSync(target)) shell.openPath(target);
  return true;
});

ipcMain.handle('pkg:copy-text', (_e, text) => {
  clipboard.writeText(String(text || ''));
  return true;
});
