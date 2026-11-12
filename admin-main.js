// Главный процесс приложения «SAMOT — Админка»: отдельное окно + Google OAuth loopback
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { createServer } = require('http');

app.disableHardwareAcceleration();

const OAUTH_PORT = 53100; // фиксированный порт возврата после входа через Google админки
// Chromium кэш — в свою папку userData (стабильно пишет, нет конфликтов)
app.setPath('cache', path.join(app.getPath('userData'), 'chromium-cache'));
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

let oauthServer = null;

function closeOauthServer() {
  try { oauthServer?.close(); } catch { /* уже закрыт */ }
  oauthServer = null;
}

const { spawn } = require('child_process');

function downloadWithRedirects(url, destPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 6) return reject(new Error('Слишком много редиректов'));
    const client = url.startsWith('https://') ? https : http;
    client
      .get(url, (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          return resolve(downloadWithRedirects(next, destPath, redirectCount + 1));
        }
        if (status !== 200) {
          res.resume();
          return reject(new Error(`Сервер ответил ${status}`));
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        const out = fs.createWriteStream(destPath);
        res.on('data', (chunk) => { received += chunk.length; /* прогресс не показываем */ });
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve(destPath)));
        out.on('error', reject);
      })
      .on('error', reject);
  });
}

function createAdminWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    title: 'SAMOT — Админка',
    backgroundColor: '#0b0e17',
    icon: path.join(__dirname, 'assets', 'iconAdmin.png'),
    webPreferences: {
      preload: path.join(__dirname, 'admin-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:admin',
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'admin', 'admin.html'));
}

// ---------- Отдельное окно ПРОЕКТ-РЕДАКТОРА (как у клиента) ----------
function createEditorWindow(pid) {
  const win = new BrowserWindow({
    width: 1180,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    title: 'SAMOT — Редактирование проекта',
    backgroundColor: '#0b0e17',
    icon: path.join(__dirname, 'assets', 'iconAdmin.png'),
    webPreferences: {
      preload: path.join(__dirname, 'admin-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:admin',
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'admin', 'editor.html'), { query: { project: String(pid) } });
  return win;
}

ipcMain.handle('admin:open-project-editor', (_event, pid) => {
  if (!pid) return { ok: false };
  createEditorWindow(Number(pid));
  return { ok: true };
});

ipcMain.on('editor:close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

// ---------- Вход через Google (OAuth в системном браузере + локальный callback) ----------
ipcMain.handle('auth:google-start', async (event) => {
  closeOauthServer();
  const sender = event.sender;

  oauthServer = createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${OAUTH_PORT}`);
      if (url.pathname === '/callback' && url.searchParams.get('code')) {
        const code = url.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Вход выполнен</title><style>body{font-family:sans-serif;color:#111;display:grid;place-items:center;min-height:100vh;background:#f4f4f6;text-align:center}</style></head><body><div><h1 style="color:#0b8e3f; font-size:2.4rem; margin:0 0 12px">Вход выполнен! ✅</h1><p style="color:#444">Можно закрыть эту вкладку и вернуться в админку.</p></div><script>setTimeout(function(){try{window.close();}catch(e){}},700);</script></body></html>');
        sender.send('auth:google-code', { code });
        closeOauthServer();
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
    } catch {
      res.writeHead(500);
      res.end();
    }
  });

  await new Promise((resolve, reject) => {
    oauthServer.once('error', reject);
    oauthServer.listen(OAUTH_PORT, '127.0.0.1', resolve);
  });

  setTimeout(closeOauthServer, 5 * 60 * 1000);
  return { port: OAUTH_PORT };
});

ipcMain.handle('auth:google-open', (_event, url) => shell.openExternal(url));

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('open-external', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

// Авто-обновление админки: скачать Setup.exe и поставить молча (NSIS /S)
ipcMain.handle('update:download-and-run', async (_event, url, expectedSha256) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Некорректный URL обновления');
  const tmp = path.join(app.getPath('temp'), `samot-admin-update-${Date.now()}.exe`);
  await downloadWithRedirects(url, tmp);
  if (expectedSha256 && String(expectedSha256).trim()) {
    const actual = await new Promise((resolve, reject) => {
      const hash = require('crypto').createHash('sha256');
      const stream = fs.createReadStream(tmp);
      stream.on('error', reject);
      stream.on('data', (d) => hash.update(d));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
    if (String(actual).toLowerCase() !== String(expectedSha256).trim().toLowerCase()) {
      try { fs.unlinkSync(tmp); } catch {}
      throw new Error('SHA-256 обновления не совпадает — установка отменена');
    }
  }
  // Ждём завершения тихой установки и открываем приложение снова, чтобы окно
  // админки «вернулось» само после обновления.
  const exePath = app.getPath('exe');
  const escPs = (s) => String(s).replace(/'/g, "''");
  const script = [
    `$installer = '${escPs(tmp)}'`,
    `$exe = '${escPs(exePath)}'`,
    `# Установка в Program Files требует прав администратора — иначе тихая NSIS молча проигрывает и версия не меняется`,
    `$elevate = $exe -match 'Program Files'`,
    `try { if ($elevate) { Start-Process -FilePath $installer -ArgumentList '/S' -Verb RunAs -Wait } else { Start-Process -FilePath $installer -ArgumentList '/S' -Wait } } catch { exit 1 }`,
    'Start-Sleep -Milliseconds 800',
    `if (Test-Path $exe) { try { Start-Process -FilePath $exe } catch {} }`,
  ].join('; ');
  const ps = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], {
    detached: true,
    stdio: 'ignore',
  });
  ps.unref();
  setTimeout(() => app.exit(0), 700);
  return { ok: true };
});

app.whenReady().then(createAdminWindow);
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createAdminWindow();
});
