// =====================================================
//  SAMOT — Редактор проекта (отдельное окно)
//  Манипуляции с базой через Supabase (та же сессия в shared partition).
//  Пока окно открыто — изменения стоят в памяти; «Сохранить» — отправляем все.
// =====================================================
const cfg = window.APP_CONFIG || { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' };
const url = new URL(location.href);
const pid = Number(url.searchParams.get('project') || 0);
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: true },
});
async function ensureSession() {
  try {
    const { data, error } = await sb.auth.getSession();
    if (error || !data?.session) {
      $('#editor-root').innerHTML = '<p class="empty-state">Нет сессии. Сначала войдите в админку.</p>';
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

const pending = {};      // { table: fieldname: value } — отложенные изменения
let project = null;       // row из projects
let settingsMap = {};     // { key: value }
let news = [];            // последние новости
let saving = false;

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function markPending(table, key, value) {
  if (!pending[table]) pending[table] = {};
  pending[table][key] = value;
  const badge = $('.pending-badge');
  if (badge) badge.style.display = 'block';
}

// =====================================================
//  Загрузка данных проекта
// =====================================================
async function loadProject() {
  if (!pid) { $('#editor-root').innerHTML = '<p class="empty-state">Не выбран проект. Вернитесь в админку и нажмите «✏️ Редактировать» на карточке проекта.</p>'; return; }
  const { data: p, error: pErr } = await sb.from('projects').select('*').eq('id', pid).maybeSingle();
  if (pErr || !p) { $('#editor-root').innerHTML = '<p class="empty-state">Проект не найден.</p>'; return; }
  project = p;

  const { data: settings, error: sErr } = await sb.from('settings').select('key,value').eq('project_id', pid);
  if (sErr) { $('#editor-root').innerHTML = '<p class="empty-state">Не удалось загрузить настройки.</p>'; return; }
  settingsMap = Object.fromEntries((settings || []).map((r) => [r.key, r.value]));

  const { data: n, error: nErr } = await sb.from('news').select('*').eq('project_id', pid).order('published_at', { ascending: false }).limit(6);
  if (nErr) { console.warn('news load failed', nErr.message); news = []; } else { news = n || []; }

  render();
}

// =====================================================
//  Рендеринг (макет как в клиенте, но редактируемо)
// =====================================================
function render() {
  $('#header-project-name').textContent = project.name || 'Проект';

  const s = settingsMap;
  const gameName = s.game_name || project.name;
  const version = s.game_version || '—';
  const tagline = project.tagline || '';
  const logoUrl = s.media_thumbnail || s.game_image_url || project.logo || '';
  const coverUrl = s.game_image_url || s.media_card || '';
  const bannerUrl = s.media_banner || '';
  const screenshots = parseJSON(s.media_screenshots, []);
  const downloadAvailable = String(s.download_available || 'true').toLowerCase() === 'true';
  const downloadUrl = s.download_url || '';
  const updateNotes = s.update_notes || '';
  const description = s.media_long_description || '';
  const relDate = s.media_release_date || '—';
  const langs = s.media_languages || '—';
  const dev = s.media_developer || '—';
  const devContact = s.media_developer_contact || '—';

  const galleryHtml = [...(screenshots.length ? screenshots : (coverUrl ? [coverUrl] : []))].map((u, i) =>
    '<img src="' + escapeHtml(u) + '" alt="" loading="lazy" data-i="' + i + '" />'
  ).join('');

  $('#editor-root').innerHTML = [
    // === Колонка слева: баннер и галерея
    '<div class="editor-layout">',
      '<div class="col-left">',
        '<section class="card" id="card-banner">',
          '<div class="section-head"><span class="section-title">Баннер на Главной (1920×975)</span>',
            '<button class="edit-btn" data-edit="banner">✏️ Изменить</button>',
          '</div>',
          bannerUrl
            ? '<img src="' + escapeHtml(bannerUrl) + '" style="width:100%; aspect-ratio:1920/975; object-fit:cover; display:block;" alt="Баннер" />'
            : '<p class="empty-state">Баннер не задан.</p>',
        '</section>',

        '<section class="card gallery" id="card-gallery">',
          '<div class="section-head"><span class="section-title">Галерея скриншотов</span>',
            '<button class="edit-btn" data-edit="screenshots">✏️ Править список</button>',
          '</div>',
          '<div class="gallery-stage"><img id="gallery-main" alt="" src="' + escapeHtml((screenshots[0] || coverUrl || bannerUrl || '')) + '" ' + ((screenshots[0] || coverUrl || bannerUrl) ? '' : 'style="visibility:hidden"') + ' />',
            screenshots.length === 0 ? '<div class="gallery-empty">Скриншотов пока нет</div>' : '',
          '</div>',
          screenshots.length > 1 ? '<div class="gallery-thumbs">' + screenshots.map((u, i) => '<button class="thumb' + (i === 0 ? ' active' : '') + '" data-thumb="' + i + '"><img src="' + escapeHtml(u) + '" alt="" /></button>').join('') + '</div>' : '',
        '</section>',
      '</div>',

      // === Колонка справа: инфо + кнопка + заметки + описание
      '<div class="col-right">',
        '<section class="card info-card" id="card-info">',
          '<img class="card-art" id="card-art-img" alt="Обложка" src="' + escapeHtml(s.media_card || s.game_image_url || project.logo || '') + '" onerror="this.style.visibility=\'hidden\'" />',
          '<div class="info-text">',
            '<span class="info-name" id="info-name">' + escapeHtml(gameName) + '</span>',
            '<span class="info-tagline" id="info-tagline">' + escapeHtml(tagline || '…') + '</span>',
            '<dl class="info-row"><dt>Версия</dt><dd><b id="info-version">' + escapeHtml(version) + '</b> <button class="icon-btn-small" data-edit="game_version">✏️</button></dd></dl>',
            '<dl class="info-row"><dt>Дата выхода</dt><dd><span id="info-release">' + escapeHtml(relDate) + '</span> <button class="icon-btn-small" data-edit="media_release_date">✏️</button></dd></dl>',
            '<dl class="info-row"><dt>Языки</dt><dd><span id="info-langs">' + escapeHtml(langs) + '</span> <button class="icon-btn-small" data-edit="media_languages">✏️</button></dd></dl>',
            '<dl class="info-row"><dt>Разработчик</dt><dd><span id="info-dev">' + escapeHtml(dev) + '</span> <button class="icon-btn-small" data-edit="media_developer">✏️</button></dd></dl>',
            '<dl class="info-row"><dt>Контакты</dt><dd><span id="info-contact">' + escapeHtml(devContact) + '</span> <button class="icon-btn-small" data-edit="media_developer_contact">✏️</button></dd></dl>',
          '</div>',
        '</section>',

        '<section class="card" id="card-action">',
          '<button class="button-action" id="btn-action" disabled>' + (downloadAvailable ? 'Скачать игру' : 'Нет скачивания') + '</button>',
          (downloadAvailable
            ? '<p class="hint">URL: ' + escapeHtml(downloadUrl || 'не задан') + ' <button class="icon-btn-small" data-edit="download_url">✏️</button></p>'
            : '<p class="hint">«Игра доступна для скачивания» выключена в настройках проекта. <button class="icon-btn-small" data-edit="download_available">✏️</button></p>'),
        '</section>',

        '<section class="card" id="card-notes">',
          '<div class="section-head"><span class="section-title">Заметки к обновлению</span>',
            '<button class="edit-btn" data-edit="update_notes">✏️ Изменить</button>',
          '</div>',
          '<div class="notes-view" id="notes-view">' + escapeHtml(updateNotes || 'Заметки не добавлены.') + '</div>',
        '</section>',

        '<section class="card" id="card-desc">',
          '<div class="section-head"><span class="section-title">Описание (полное)</span>',
            '<button class="edit-btn" data-edit="media_long_description">✏️ Изменить</button>',
          '</div>',
          '<div class="desc" id="desc-view">' + escapeHtml(description || 'Описание не добавлено.') + '</div>',
        '</section>',
      '</div>',

      '</div>',

      // === Новости — на всю ширину под двумя колонками
      '<section class="card" id="card-news" style="margin-top: 4px">',
        '<div class="section-head"><span class="section-title">Последние новости</span></div>',
        '<div class="news-list" id="editor-news-list">',
          news.length ? news.map((n) =>
            '<div class="news-item" data-id="' + n.id + '">' +
              (n.image_url ? '<img class="news-thumb" src="' + escapeHtml(n.image_url) + '" alt="" />' : '<div class="news-thumb">📰</div>') +
              '<div class="news-meta"><b>' + escapeHtml(n.title || '') + '</b>' +
                '<span>' + escapeHtml(n.tag || '') + ' · ' + escapeHtml(new Date(n.published_at).toLocaleDateString('ru-RU')) + '</span></div>' +
              '<button class="icon-btn-small" data-delete-news="' + n.id + '" title="Удалить новость">🗑️</button>' +
            '</div>'
          ).join('') : '<p class="empty-state" style="padding:16px">Новостей нет.</p>',
        '</div>',
      '</section>',

      '<div class="pending-badge" style="display:none">⚠ Изменения не сохранены</div>',
    ].join('');

  // мини-галерея
  $$('#card-gallery .thumb').forEach((t) => t.addEventListener('click', () => {
    $$('#card-gallery .thumb').forEach((x) => x.classList.toggle('active', x === t));
    const img = $('#gallery-main');
    if (img) img.src = screenshots[Number(t.dataset.thumb)] || '';
  }));

  // события клика по ✎
  $('#editor-root').addEventListener('click', onEditorClick);
}
function parseJSON(raw, fallback) {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : fallback; } catch { return fallback; }
}

// =====================================================
//  Открытие модалки редактирования поля
// =====================================================
function onEditorClick(e) {
  const btn = e.target.closest('[data-edit], [data-delete-news]');
  if (!btn) return;
  if (btn.dataset.deleteNews) return deleteNews(btn.dataset.deleteNews);
  const key = btn.dataset.edit;
  const currentValue = readCurrentValue(key);
  openModal(key, currentValue);
}

function readCurrentValue(key) {
  const s = settingsMap;
  switch (key) {
    case 'banner': return s.media_banner || '';
    case 'screenshots': return (parseJSON(s.media_screenshots, []).join('\n'));
    case 'game_version': return s.game_version || '';
    case 'media_release_date': return s.media_release_date || '';
    case 'media_languages': return s.media_languages || '';
    case 'media_developer': return s.media_developer || '';
    case 'media_developer_contact': return s.media_developer_contact || '';
    case 'download_url': return s.download_url || '';
    case 'download_available': return String(s.download_available || 'true');
    case 'update_notes': return s.update_notes || '';
    case 'media_long_description': return s.media_long_description || '';
    default: return '';
  }
}

function openModal(key, value) {
  const modal = $('#edit-modal');
  const title = $('#edit-modal-title');
  const fieldWrap = $('#edit-modal-field');
  const saveBtn = $('#edit-modal-save');
  const cancelBtn = $('#edit-modal-cancel');

  const labels = {
    banner: 'Баннер на Главной (1920×975)',
    screenshots: 'Скриншоты (по одному URL на строку)',
    game_version: 'Версия игры',
    media_release_date: 'Дата выхода',
    media_languages: 'Языки интерфейса',
    media_developer: 'Разработчик',
    media_developer_contact: 'Контакты разработчика',
    download_url: 'download_url (прямая ссылка на установщик)',
    download_available: 'Скачивание доступно',
    update_notes: 'Заметки к обновлению',
    media_long_description: 'Полное описание',
  };
  title.textContent = 'Редактирование: ' + (labels[key] || key);

  fieldWrap.innerHTML = '';
  let inputEl;
  if (key === 'screenshots' || key === 'update_notes' || key === 'media_long_description' || key === 'media_developer_contact') {
    inputEl = document.createElement('textarea');
    inputEl.style.width = '100%';
    inputEl.rows = key === 'screenshots' ? 8 : 6;
    inputEl.className = 'notes-edit';
  } else if (key === 'download_available') {
    inputEl = document.createElement('select');
    inputEl.innerHTML = '<option value="true">Да</option><option value="false">Нет</option>';
  } else if (key === 'banner' || key === 'download_url') {
    inputEl = document.createElement('input');
    inputEl.type = 'url';
    inputEl.placeholder = 'https://…';
    inputEl.style.width = '100%';
  } else {
    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.style.width = '100%';
  }
  inputEl.value = value;
  inputEl.style.background = 'var(--bg)';
  inputEl.style.color = 'var(--text)';
  fieldWrap.appendChild(inputEl);
  inputEl.focus();

  const cleanup = () => { modal.classList.add('hidden'); modal.removeEventListener('click', onBack); };
  const onBack = (ev) => { if (ev.target === modal) cleanup(); };
  modal.addEventListener('click', onBack);
  const onKey = (ev) => { if (ev.key === 'Escape') { modal.classList.add('hidden'); cleanup(); window.removeEventListener('keydown', onKey); } };
  window.addEventListener('keydown', onKey, { once: true });

  saveBtn.onclick = () => {
    applyEdit(key, inputEl.value);
    cleanup();
  };
  cancelBtn.onclick = cleanup;
  modal.classList.remove('hidden');
}

function applyEdit(key, value) {
  const s = settingsMap;
  // всё хранится в таблице settings как key/value
  if (key === 'screenshots') {
    const arr = String(value).split('\n').map((x) => x.trim()).filter((x) => /^https?:\/\//i.test(x));
    s.media_screenshots = JSON.stringify(arr);
    markPending('settings', 'media_screenshots', s.media_screenshots);
  } else {
    s[key] = value;
    markPending('settings', key, value);
  }
  // визуальное обновление
  updateElement(key, value);
}

function updateElement(key, value) {
  // минимальный интерфейс «перезагрузки» view
  render();
}

// =====================================================
//  МОДАЛКА — замена confirm() (в Electron он не поддерживается)
// =====================================================
function uiConfirm(opts) {
  const { title = 'Подтвердите действие', message = '', okLabel = 'ОК', danger = false } = opts || {};
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'ui-modal-backdrop';
    back.innerHTML = '<div class="ui-modal" role="dialog" aria-modal="true">'
      + '<div class="ui-modal-title' + (danger ? ' danger' : '') + '">' + escapeHtml(title) + '</div>'
      + (message ? '<div class="ui-modal-msg">' + escapeHtml(message) + '</div>' : '')
      + '<div class="ui-modal-actions">'
      + '<button class="btn btn-ghost" data-act="cancel" type="button">Отмена</button>'
      + '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-act="ok" type="button">' + escapeHtml(okLabel) + '</button>'
      + '</div></div>';
    const done = (v) => { back.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(false); } if (e.key === 'Enter') { e.preventDefault(); done(true); } };
    back.addEventListener('mousedown', (e) => { if (e.target === back) done(false); });
    back.querySelector('[data-act="cancel"]').addEventListener('click', () => done(false));
    back.querySelector('[data-act="ok"]').addEventListener('click', () => done(true));
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    back.querySelector('[data-act="ok"]').focus();
  });
}

// =====================================================
//  Удаление новости
// =====================================================
async function deleteNews(id) {
  if (!(await uiConfirm({ title: 'Удалить новость', message: 'Удалить новость?', okLabel: 'Удалить', danger: true }))) return;
  const { error } = await sb.from('news').delete().eq('id', Number(id));
  if (error) return toast('Не удалось удалить: ' + friendlyError(error.message), true);
  news = news.filter((n) => n.id !== Number(id));
  render();
}

const toast = (msg, error) => {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;bottom:20px;right:20px;background:' + (error ? '#3a1a22' : '#1d2a22') + ';color:' + (error ? '#ffbac6' : '#92eec4') + ';border:1px solid ' + (error ? '#ff5c7a' : '#2ee6a8') + ';padding:10px 14px;z-index:500;';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
};
const friendlyError = (m) => m;

// =====================================================
//  Сохранение
// =====================================================
$('#btn-save').addEventListener('click', async () => {
  if (saving) return;
  saving = true;
  $('#btn-save').disabled = true;
  $('#btn-save').textContent = 'Сохраняем…';

  const pid_ = project.id;
  const settingsRows = Object.entries(pending.settings || {}).map(([key, value]) => ({ project_id: pid_, key, value: String(value ?? '') }));
  if (settingsRows.length) {
    const { error } = await sb.from('settings').upsert(settingsRows, { onConflict: 'project_id,key' });
    if (error) { toast('Ошибка сохранения: ' + friendlyError(error.message), true); saving = false; $('#btn-save').disabled = false; $('#btn-save').textContent = '✓ Сохранить'; return; }
  }

  toast('Сохранено (' + settingsRows.length + ' полей).');
  $('#btn-save').disabled = false;
  $('#btn-save').textContent = '✓ Сохранить';
  saving = false;

  // Сброс pending и перерендер
  pending.settings = {};
  $('.pending-badge').style.display = 'none';
});

$('#btn-exit').addEventListener('click', async () => {
  const touched = Object.values(pending.settings || {}).length > 0;
  if (touched && !(await uiConfirm({ title: 'Несохранённые изменения', message: 'Есть несохранённые изменения. Выйти без сохранения?', okLabel: 'Выйти', danger: true }))) return;
  try { window.adminEnv && window.adminEnv.closeWindow && window.adminEnv.closeWindow(); } catch {}
});

async function init() {
  $('#editor-root').innerHTML = '<p class="empty-state">Загрузка… cfg=' + (cfg.SUPABASE_URL ? 'ok' : 'EMPTY') + ', pid=' + pid + '</p>';
  const ok = await ensureSession();
  if (!ok) return;
  await loadProject();
}
init();
