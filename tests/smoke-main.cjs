// Electron-дым для SAMOT Admin: открывает демо-админку offscreen, считает console errors.
const { app, BrowserWindow } = require('electron');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const report = { admin: [], failed: [] };

function wire(win, bucket) {
  win.webContents.on('console-message', (_e, level, message) => {
    const text = String(message);
    if (text.includes('Security Warning') || text.includes('sandbox_bundle')) return;
    if (level >= 2) bucket.push(text);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    report.failed.push(`crashed: ${JSON.stringify(details)}`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    report.failed.push(`did-fail-load: ${code} ${desc}`);
  });
  win.webContents.on('did-finish-load', () => {
    setTimeout(() => finish(), 3500);
  });
}

function finish() {
  console.log('=== SMOKE REPORT (SAMOT Admin) ===');
  const real = report.admin.filter((m) => !/partytown|site\.(js|css)/.test(m));
  console.log(`[ADMIN] console errors: ${real.length}`);
  real.forEach((m) => console.log('  - ' + m));
  const failed = report.failed.length || real.length;
  console.log(failed ? '\nSMOKE: FAIL' : '\nSMOKE: OK');
  app.exit(failed ? 1 : 0);
}

app.whenReady().then(() => {
  const admin = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, partition: 'persist:smoke-admin', preload: path.join(ROOT, 'admin-preload.js') },
  });
  wire(admin, report.admin);
  admin.loadFile(path.join(ROOT, 'src', 'admin', 'admin.html'), { query: { demo: 'admin' } });
});

setTimeout(() => { console.log('SMOKE: TIMEOUT'); app.exit(2); }, 30000);
