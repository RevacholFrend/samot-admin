// SAMOT Packager — логика GUI (рендерер)
'use strict';

const $ = (sel) => document.querySelector(sel);

const srcInput = $('#src');
const targetInput = $('#target');
const versionInput = $('#version');
const tagInput = $('#tag');
const packSizeInput = $('#pack-size');
const entrySelect = $('#entry');
const entryHint = $('#entry-hint');
const buildBtn = $('#btn-build');
const openBtn = $('#btn-open');
const copyBtn = $('#btn-copy');
const logEl = $('#log');
const statusEl = $('#status');
const warnEl = $('#warn');

let tagDirty = false;   // пользователь правил тег вручную — не перезаписывать
let lastTarget = null;  // папка результата после успешной сборки

const fmtBytes = (n) => {
  if (!Number.isFinite(n)) return '?';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + ' ' + units[i];
};

const setStatus = (text, cls) => {
  statusEl.textContent = text;
  statusEl.className = 'status ' + (cls || 'idle');
};

const appendLog = (line) => {
  if (!logEl) return;
  if (logEl.dataset.fresh !== '0') { logEl.textContent = ''; logEl.dataset.fresh = '0'; }
  logEl.textContent += line + '\n';
  logEl.scrollTop = logEl.scrollHeight;
};

const defaultTarget = () => {
  const src = srcInput.value.trim();
  if (!src) return '';
  const normalized = src.replace(/[\\/]+$/, '');
  const parent = normalized.replace(/[\\/][^\\/]+$/, '');
  return parent + '\\game-dist';
};

const refreshTargetPlaceholder = () => {
  targetInput.placeholder = defaultTarget() ? 'По умолчанию: ' + defaultTarget() : 'Сначала выберите папку с игрой…';
};

const showWarnings = (warnings) => {
  if (!warnings || !warnings.length) { warnEl.classList.add('hidden'); warnEl.textContent = ''; return; }
  warnEl.textContent = warnings.map((w) => '⚠ ' + w).join('\n');
  warnEl.classList.remove('hidden');
};

const scanExes = async () => {
  const src = srcInput.value.trim();
  entrySelect.innerHTML = '<option>Сканирую .exe…</option>';
  entrySelect.disabled = true;
  if (!src) { entrySelect.innerHTML = '<option>Сначала выберите папку с игрой…</option>'; entryHint.textContent = ''; return []; }
  const found = await window.packager.listExe(src);
  entrySelect.innerHTML = '';
  if (!found.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(.exe не найдены — укажите точку входа сами в сборке игры)';
    entrySelect.appendChild(opt);
    entrySelect.disabled = true;
    entryHint.textContent = 'В папке нет .exe — проверьте, что выбрана собранная игра, а не исходники.';
    return [];
  }
  found.forEach((exe) => {
    const opt = document.createElement('option');
    opt.value = exe.rel;
    opt.textContent = exe.rel + '  (' + fmtBytes(exe.size) + ')';
    entrySelect.appendChild(opt);
  });
  entrySelect.disabled = false;
  entryHint.textContent = found.length === 1
    ? 'Найден единственный .exe — выбран автоматически.'
    : 'Найдено .exe: ' + found.length + '. Выбран самый большой; при необходимости переключите ниже.';
  return found;
};

const ghCommand = (target) => {
  const tag = tagInput.value.trim() || 'v1.0.0';
  const cd = target ? ('cd "' + target + '" && ') : '';
  return cd + 'gh release create ' + tag + ' pack-*.zip manifest.json --repo <owner>/<repo> --title "' + tag + '" --notes "Релиз игры"';
};

$('#btn-src').addEventListener('click', async () => {
  const picked = await window.packager.pickSrc();
  if (!picked) return;
  srcInput.value = picked;
  if (!targetInput.value) targetInput.value = defaultTarget();
  refreshTargetPlaceholder();
  await scanExes();
});

$('#btn-target').addEventListener('click', async () => {
  const picked = await window.packager.pickTarget();
  if (picked) targetInput.value = picked;
});

versionInput.addEventListener('input', () => {
  if (!tagDirty) tagInput.value = 'v' + versionInput.value.trim();
});
tagInput.addEventListener('input', () => { tagDirty = true; });

$('#btn-build').addEventListener('click', async () => {
  const src = srcInput.value.trim();
  if (!src) { appendLog('Сначала выберите папку с игрой (шаг 1).'); return; }
  const version = versionInput.value.trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) { appendLog('Версия должна быть в формате 1.2.3.'); return; }
  const tag = tagInput.value.trim() || ('v' + version);
  const packSizeMB = Number(packSizeInput.value) > 0 ? Number(packSizeInput.value) : 200;
  const entryPoint = entrySelect.disabled ? undefined : (entrySelect.value || undefined);
  const target = targetInput.value.trim() || defaultTarget();

  logEl.textContent = '';
  logEl.dataset.fresh = '0';
  showWarnings(null);
  buildBtn.disabled = true;
  openBtn.classList.add('hidden');
  copyBtn.classList.add('hidden');
  setStatus('сборка…', 'running');

  window.packager.onLog(({ line }) => appendLog(line));
  window.packager.onDone((data) => {
    buildBtn.disabled = false;
    if (data && data.ok) {
      lastTarget = data.target || target;
      setStatus('готово', 'done');
      appendLog('');
      appendLog('============================================');
      appendLog('Сборка завершена. Папка: ' + lastTarget);
      const stats = data.stats || {};
      appendLog('Файлов: ' + (stats.files ?? '?') + ' | Паков: ' + (stats.packs ?? '?') + ' | Сумма: ' + fmtBytes(stats.totalBytes || 0));
      if (stats.warnings && stats.warnings.length) {
        showWarnings(stats.warnings);
      } else {
        appendLog('Точка входа: ' + (stats.entryPoint || 'не указана (кнопка «Играть» не заработает)'));
      }
      openBtn.classList.remove('hidden');
      copyBtn.classList.remove('hidden');
    } else {
      setStatus('ошибка', 'error');
      appendLog('Сборка не удалась: ' + ((data && data.error) || 'неизвестная ошибка'));
    }
  });

  await window.packager.build({ src, target, version, tag, packSizeMB, entryPoint });
});

openBtn.addEventListener('click', () => { if (lastTarget) window.packager.openFolder(lastTarget); });
copyBtn.addEventListener('click', async () => {
  await window.packager.copyText(ghCommand(lastTarget));
  copyBtn.textContent = 'Скопировано ✓';
  setTimeout(() => { copyBtn.textContent = 'Скопировать команду публикации'; }, 1500);
});

refreshTargetPlaceholder();
