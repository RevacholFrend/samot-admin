// =====================================================
//  SAMOT — Админ-панель (мультипроектная)
//  Проекты • Новости • Настройки • Команда • Превью
// =====================================================
'use strict';

const CFG = window.APP_CONFIG;
const { createClient } = window.supabase;
const sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: { flowType: 'pkce' },
});

const NEWS_TAGS = ['Анонс', 'Патчнот', 'Ивент', 'Турнир', 'Прочее'];
(function fillTagSelect() {
  const sel = document.getElementById('nf-tag');
  if (sel) sel.innerHTML = NEWS_TAGS.map((tag) => `<option value="${tag}">${tag}</option>`).join('');
})();

const SETTINGS_KEYS = [
  'game_name', 'game_version', 'download_url', 'update_notes',
  'maintenance', 'min_launcher_version', 'download_available',
  'game_image_url', 'media_banner', 'media_thumbnail', 'media_card', 'media_news', 'media_screenshots',
  'media_release_date', 'media_languages', 'media_developer', 'media_developer_contact', 'media_long_description',
  'game_owner', 'game_repo', 'game_tag', 'game_enabled', 'game_manifest',
];

const CURRENT_PROJECT_KEY = 'samot_admin_current_project';

// ---------- Демо-режим (?demo=admin) ----------
const DEMO_ADMIN = new URLSearchParams(window.location.search).get('demo') === 'admin';
const DEMO_NEWS = [
  { id: 3, project_id: 1, title: 'Турнир к запуску', tag: 'Турнир', excerpt: 'Фонд 50 000 ₽. Регистрация открыта.', body: 'Формат: 5×5, single elimination.', image_url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=1600&q=80', published_at: new Date(Date.now() - 86400000).toISOString(), active: true },
  { id: 2, project_id: 1, title: 'Патч 0.9.4 «Буря»', tag: 'Патчнот', excerpt: 'Краш исправили, загрузка быстрее.', body: 'Исправлен краш рейда; загрузка локаций на 30% быстрее.', image_url: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=1600&q=80', published_at: new Date(Date.now() - 3 * 86400000).toISOString(), active: true },
  { id: 1, project_id: 1, title: 'Закрытая бета', tag: 'Анонс', excerpt: 'Бета начнётся 15 ноября.', body: 'Следите за новостями.', image_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&q=80', published_at: new Date(Date.now() - 5 * 86400000).toISOString(), active: false },
];
const DEMO_PROJECTS = [{ id: 1, name: 'SAMOT game', slug: 'samot', is_hidden: false, tagline: 'Твой мир. Твоя игра.', logo: '🎮', color: '#7c5cff', role: 'owner' }];
const DEMO_SETTINGS = {
  game_name: 'SAMOT game', game_version: '0.9.4',
  download_url: 'https://github.com/example/samot/releases/download/v0.9.4/GameSetup.exe',
  update_notes: '— Новый рейд «Башня»\n— Ускорена загрузка локаций на 30%\n— Исправлен краш при входе в рейд',
  maintenance: 'false', min_launcher_version: '1.0.0',
};
const DEMO_MEMBERS = [{ email: 'owner@example.com', role: 'owner' }];

// ---------- Утилиты ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer = null;
function toast(msg, isError = false) {
  const el = $('#admin-toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4500);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function friendlyError(message) {
  const m = String(message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Неверный email или пароль.';
  if (m.includes('email not confirmed')) return 'Email не подтверждён.';
  if (m.includes('row-level security') || m.includes('rls') || m.includes('permission') || m.includes('violates')) return 'Недостаточно прав на этот проект (вы — editor?).';
  if (m.includes('duplicate') && m.includes('slug')) return 'Такой слаг уже занят. Введите другой.';
  if (m.includes('network') || m.includes('fetch')) return 'Нет связи с Supabase. Проверьте config.js.';
  return message || 'Ошибка.';
}

// =====================================================
//  МОДАЛКИ — замена prompt()/confirm() (в Electron они не работают)
// =====================================================
function uiConfirm(opts) {
  const { title = 'Подтвердите действие', message = '', okLabel = 'ОК', danger = false } = opts || {};
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'ui-modal-backdrop';
    back.innerHTML =
      '<div class="ui-modal" role="dialog" aria-modal="true">' +
        '<div class="ui-modal-title' + (danger ? ' danger' : '') + '">' + escapeHtml(title) + '</div>' +
        (message ? '<div class="ui-modal-msg">' + escapeHtml(message) + '</div>' : '') +
        '<div class="ui-modal-actions">' +
          '<button class="btn btn-ghost" data-act="cancel" type="button">Отмена</button>' +
          '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-act="ok" type="button">' + escapeHtml(okLabel) + '</button>' +
        '</div>' +
      '</div>';
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

function uiPrompt(opts) {
  const { title = 'Введите значение', label = '', value = '', placeholder = '', okLabel = 'Сохранить', danger = false, validate } = opts || {};
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'ui-modal-backdrop';
    back.innerHTML =
      '<div class="ui-modal" role="dialog" aria-modal="true">' +
        '<div class="ui-modal-title' + (danger ? ' danger' : '') + '">' + escapeHtml(title) + '</div>' +
        (label ? '<label class="ui-modal-msg">' + escapeHtml(label) + '</label>' : '') +
        '<input class="ui-modal-input" type="text" autocomplete="off" spellcheck="false" />' +
        '<div class="ui-modal-error" hidden></div>' +
        '<div class="ui-modal-actions">' +
          '<button class="btn btn-ghost" data-act="cancel" type="button">Отмена</button>' +
          '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-act="ok" type="button">' + escapeHtml(okLabel) + '</button>' +
        '</div>' +
      '</div>';
    const done = (v) => { back.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const input = back.querySelector('.ui-modal-input');
    const errEl = back.querySelector('.ui-modal-error');
    input.value = value;
    input.placeholder = placeholder || '';
    const tryAccept = () => {
      const v = input.value;
      if (typeof validate === 'function') {
        const e2 = validate(v);
        if (e2) { errEl.textContent = e2; errEl.hidden = false; return; }
      }
      done(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } else if (e.key === 'Enter') { e.preventDefault(); tryAccept(); } };
    back.addEventListener('mousedown', (e) => { if (e.target === back) done(null); });
    back.querySelector('[data-act="cancel"]').addEventListener('click', () => done(null));
    back.querySelector('[data-act="ok"]').addEventListener('click', tryAccept);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    input.focus();
    input.select();
  });
}


// =====================================================
//  СОСТОЯНИЕ
// =====================================================
const state = {
  user: null,
  projects: [],
  membershipsByProject: {},   // project_id → role
  currentProjectId: null,
  isSuper: false,
};

const currentProject = () => state.projects.find((p) => p.id === state.currentProjectId) || state.projects[0] || null;

function demoNotice() {
  toast('Демо-режим: изменения НЕ сохраняются в базу данных.');
}

// =====================================================
//  ВХОД
// =====================================================
async function getSuperAdminRow(uid) {
  const { data } = await sb.from('admins').select('user_id').eq('user_id', uid).maybeSingle();
  return !!data;
}

async function getMyMemberships(uid) {
  const { data, error } = await sb.from('project_members').select('project_id, role').eq('user_id', uid);
  if (error) return { data: [], error };
  return { data: data || [], error: null };
}

async function getMyProjects() {
  // Главный админ видит ВСЕ проекты, независимо от своего членства
  if (state.isSuper) {
    const { data, error } = await sb.from('projects').select('*').order('id', { ascending: true });
    return { projects: data || [], error };
  }
  const { data: myMemberships, error: memErr } = await getMyMemberships(state.user.id);
  if (memErr) return { projects: [], error: memErr };

  state.membershipsByProject = Object.fromEntries(myMemberships.map((m) => [m.project_id, m.role]));
  const ids = myMemberships.map((m) => m.project_id);
  if (!ids.length) return { projects: [], error: null };

  const { data, error } = await sb.from('projects').select('*').in('id', ids).order('id', { ascending: true });
  return { projects: data || [], error };
}


// ---------- Кольцевой буфер логов (для баг-репорта) ----------
const ADMIN_LOG_BUFFER = [];
function adminLogLine(level, parts) {
  try {
    const msg = parts.map((a) => (a == null ? String(a) : (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()))).join(' ');
    ADMIN_LOG_BUFFER.push(new Date().toISOString() + ' [' + level + '] ' + msg);
    if (ADMIN_LOG_BUFFER.length > 120) ADMIN_LOG_BUFFER.shift();
  } catch { /* logging must never break the app */ }
}
const _origAdminConsoleError = console.error.bind(console);
const _origAdminConsoleWarn = console.warn.bind(console);
console.error = (...a) => { adminLogLine('ERROR', a); _origAdminConsoleError(...a); };
console.warn = (...a) => { adminLogLine('WARN', a); _origAdminConsoleWarn(...a); };
const _origAdminConsoleLog = console.log.bind(console);
console.log = (...a) => { adminLogLine('INFO', a); _origAdminConsoleLog(...a); };
window.addEventListener('error', (e) => adminLogLine('ERROR', [(e && e.message) || 'window error']));
window.addEventListener('unhandledrejection', (e) => {
  const r = e && e.reason;
  adminLogLine('ERROR', ['unhandledrejection:', (r && (r.stack || r.message)) || String(r)]);
});

function cmpSemver(a, b) {
  const pa = String(a || '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

// ---------- Авто-обновление админки ----------
state.adminUpdate = null;

async function checkForAdminUpdate() {
  if (DEMO_ADMIN) return;
  try {
    const current = window.adminEnv?.getAppVersion ? await window.adminEnv.getAppVersion() : '0.0.0';
    const { data, error } = await sb.from('app_updates').select('latest_version, download_url, sha256').eq('tool', 'admin').maybeSingle();
    if (error || !data) return;
    const latest = String(data.latest_version || '').trim();
    const url = String(data.download_url || '').trim();
    if (!latest || !/^https?:\/\//i.test(url)) return;
    if (cmpSemver(latest, current) <= 0) return;
    state.adminUpdate = { latest, url, sha256: data.sha256 || '' };
    renderAdminUpdateBanner();
    // Полностью автоматический режим: приложение само скачивает и ставит обновление
    try { await adminUpdateNow(); } catch { /* оставим кнопку на случай ошибки */ }
  } catch { /* офлайн или ранняя ошибка — молчим */ }
}

function renderAdminUpdateBanner() {
  let banner = document.getElementById('admin-update-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'admin-update-banner';
    banner.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:80;display:flex;align-items:center;gap:10px;background:#141a2c;border:1px solid rgba(0,164,255,.5);color:#bfe6ff;padding:10px 12px;border-radius:12px;font-size:.82rem;box-shadow:0 12px 34px rgba(0,0,0,.5)';
    banner.innerHTML = '<span>⬆️ Доступна новая версия админки <b></b></span><button class="btn btn-primary btn-sm" id="admin-update-now">Обновить</button><button class="icon-btn" id="admin-update-later" title="Позже">✕</button>';
    document.body.appendChild(banner);
    banner.querySelector('#admin-update-later').addEventListener('click', () => banner.remove());
    banner.querySelector('#admin-update-now').addEventListener('click', adminUpdateNow);
  }
  banner.querySelector('b').textContent = 'v' + state.adminUpdate.latest;
}

async function adminUpdateNow() {
  const info = state.adminUpdate;
  if (!info) return;
  const btn = document.getElementById('admin-update-now');
  btn.disabled = true;
  btn.textContent = 'Скачиваем…';
  try {
    if (window.adminEnv?.downloadAndRunUpdate) await window.adminEnv.downloadAndRunUpdate(info.url, info.sha256);
    else window.adminEnv?.openExternal?.(info.url);
  } catch (err) {
    toast('Не удалось скачать обновление: ' + friendlyError(err?.message), true);
    window.adminEnv?.openExternal?.(info.url);
    btn.disabled = false;
    btn.textContent = 'Обновить';
  }
}

async function enterPanel(user, demo = false) {
  state.user = user;
  adminLogLine('INFO', ['admin boot', 'user=' + (user?.email || 'unknown'), 'demo=' + (demo ? 'yes' : 'no')]);
  $('#admin-auth').classList.add('hidden');
  $('#admin-denied').classList.add('hidden');

  if (demo) {
    const brand = $('.side-brand span');
    if (brand) brand.textContent = 'ДЕМО-режим';
    state.projects = DEMO_PROJECTS.map((p) => ({ ...p, approved: true }));
    state.membershipsByProject = { 1: 'owner' };
    state.isSuper = false;
    state.currentProjectId = 1;
    renderProjectSelect();
    applyUnpublishedState();
    renderAdminNewsList(DEMO_NEWS);
    applySettingsToForm(DEMO_SETTINGS);
    renderMembersList(DEMO_MEMBERS);
    showTabs('tab-news');
    return;
  }

  state.isSuper = await getSuperAdminRow(user.id);
  if (state.isSuper) syncSuperOnly();
  const { projects, error } = await getMyProjects();
  if (error) { toast('Не удалось загрузить проекты: ' + friendlyError(error.message), true); return; }

  state.projects = projects.map((p) => ({ ...p, role: state.membershipsByProject[p.id] || (state.isSuper ? 'owner' : 'editor') }));

  if (!state.projects.length) {
    state.currentProjectId = 0;
    $('#admin-noproj').classList.add('hidden');
    $('#admin-panel').classList.remove('hidden');
    $('#side-user-email').textContent = (user.email || '');
    renderProjectSelect();
    showEmptyState();
    return;
  }

  const savedId = parseInt(localStorage.getItem(CURRENT_PROJECT_KEY) || '0', 10);
  const ep = state.projects.find((p) => p.id === savedId) || state.projects[0];
  state.currentProjectId = ep.id;

  $('#side-user-email').textContent = (user.email || '');
  renderProjectSelect();
  applyUnpublishedState();
  showTabs(state.isSuper ? 'tab-home' : 'tab-news');
  await reloadCurrentProject();
  try { checkForAdminUpdate(); } catch {}
}

// Показывает пустой экран «Проектов нет» внутри панели
function showEmptyState() {
  $('#admin-panel').classList.remove('hidden');
  $$('.tab-page').forEach((p) => p.classList.add('hidden'));
  $('#panel-empty-state').classList.remove('hidden');
  $('.side-projects')?.classList?.add('is-empty');
  const sel = $('#project-select');
  sel.innerHTML = '<option disabled selected>Проектов нет</option>';
}

// Показывает обычные вкладки, скрывает empty state
function showTabs(activeTabId) {
  if (!state.isSuper && activeTabId === 'tab-home') activeTabId = 'tab-news';
  $('#admin-panel').classList.remove('hidden');
  $('#panel-empty-state').classList.add('hidden');
  $$('.tab-page').forEach((p) => p.classList.toggle('hidden', p.id !== activeTabId));
  $$('.side-link').forEach((b) => b.classList.toggle('active', b.dataset.tab === activeTabId));
  const contentEl = document.querySelector('.content');
  if (contentEl) contentEl.scrollTop = 0;
  if (activeTabId === 'tab-home') loadHomeAdmin();
  if (activeTabId === 'tab-dev') renderDevTemplates();
  if (activeTabId === 'tab-admins') loadAdmins();
  if (activeTabId === 'tab-audit') loadAuditLog();
  if (activeTabId === 'tab-devices') loadUsers();
}

function syncSuperOnly() {
  $$('.super-only').forEach((el) => el.classList.toggle('hidden', !state.isSuper));
}

function renderProjectSelect() {
  const sel = $('#project-select');
  sel.innerHTML = state.projects.map((p) =>
    `<option value="${p.id}" ${p.id === state.currentProjectId ? 'selected' : ''}>${escapeHtml(p.logo || '🎮')} ${escapeHtml(p.name)}${p.role ? ' · ' + p.role : ''}${p.is_hidden ? ' [скрыт]' : ''}${p.approved === false ? ' [не опубликован]' : ''}</option>`
  ).join('');
}

$('#project-select').addEventListener('change', async (e) => {
  applyUnpublishedState();

  state.currentProjectId = parseInt(e.target.value, 10);
  localStorage.setItem(CURRENT_PROJECT_KEY, String(state.currentProjectId));
  if ($('#danger-hide')) {
    const proj = state.projects.find((p) => p.id === state.currentProjectId);
    if (proj) {
      if ($('#danger-hide')) $('#danger-hide').value = proj.is_hidden ? 'true' : 'false';
      if ($('#sf-download-available')) $('#sf-download-available').value = proj.download_available ? 'true' : 'false';
    }
  }
  await reloadCurrentProject();
  toast(`Проект: ${currentProject()?.name || ''}`);
});

async function reloadCurrentProject() {
  const pid = state.currentProjectId;
  if (!pid) return;
  applyUnpublishedState();
  const ep = (state.projects || []).find((p) => p.id === pid);
  if (ep) refreshDangerZone(ep);
  await Promise.all([loadAdminNews(pid), loadSettingsForm(pid), loadMembers(pid), loadBans()]);
}

$('#btn-denied-logout').addEventListener('click', () => location.reload());
$('#btn-admin-logout').addEventListener('click', async () => {
  if (DEMO_ADMIN) { toast('Это предпросмотр. Закройте окно — откроется вид игрока.'); return; }
  await sb.auth.signOut();
  location.reload();
});

$('#admin-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#admin-login-submit');
  const errEl = $('#admin-login-error');
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Проверяем…';

  const { data, error } = await sb.auth.signInWithPassword({
    email: $('#admin-email').value.trim(),
    password: $('#admin-password').value,
  });

  if (error) {
    errEl.textContent = friendlyError(error.message);
    btn.disabled = false;
    btn.textContent = 'Войти';
    return;
  }

  try {
    const sup = await getSuperAdminRow(data.user.id);
    const { data: mem } = await getMyMemberships(data.user.id);
    if (!sup && !(mem && mem.length)) {
      $('#admin-auth').classList.add('hidden');
      $('#admin-denied').classList.remove('hidden');
      $('#admin-denied-text').textContent = `${data.user.email} не является участником ни одного проекта. Попросите owner'а добавить вас в свой.`;
      await sb.auth.signOut();
      return;
    }
    if (!(await ensureConsentThen())) { btn.disabled = false; btn.textContent = 'Войти'; return; }
    await enterPanel(data.user);
  } catch (err) {
    errEl.textContent = friendlyError(err?.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Войти';
  }
});

$('#admin-google-btn').addEventListener('click', async () => {
  const btn = $('#admin-google-btn');
  btn.disabled = true;

  try {
    if (window.adminEnv && window.adminEnv.googleSignInStart) {
      const { port } = await window.adminEnv.googleSignInStart();
      const redirectTo = `http://127.0.0.1:${port}/callback`;

      const { data, error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;

      const off = window.adminEnv.onGoogleCode(async ({ code }) => {
        off();
        try {
          const { error: exErr } = await sb.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
          location.reload();
        } catch (err) {
          toast(friendlyError(err?.message), true);
          btn.disabled = false;
        }
      });
      await window.adminEnv.googleSignInOpen(data.url);
    } else {
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) throw error;
    }
  } catch (err) {
    toast(friendlyError(err?.message), true);
    btn.disabled = false;
  }
});

// Разделы, которые работают без привязки к проекту — доступны и при нуле проектов
const PROJECT_FREE_TABS = new Set(['tab-home', 'tab-updates', 'tab-admins', 'tab-audit', 'tab-analytics', 'tab-devices', 'tab-bugreport', 'tab-dev', 'tab-wiki', 'tab-docs']);

// =====================================================
//  ТАБЫ
// =====================================================
$$('.side-link').forEach((btn) =>
  btn.addEventListener('click', () => {
    $$('.side-link').forEach((b) => b.classList.toggle('active', b === btn));
    if (!state.projects.length && !PROJECT_FREE_TABS.has(btn.dataset.tab)) { showEmptyState(); return; }
    $$('.tab-page').forEach((p) => p.classList.toggle('hidden', p.id !== btn.dataset.tab));
    const contentEl = document.querySelector('.content');
    if (contentEl) contentEl.scrollTop = 0;
    if (btn.dataset.tab === 'tab-members') loadMembers(state.currentProjectId);
    if (btn.dataset.tab === 'tab-home') loadHomeAdmin();
    if (btn.dataset.tab === 'tab-updates') loadUpdatesForm();
    if (btn.dataset.tab === 'tab-game') loadGameForm(state.currentProjectId);
    if (btn.dataset.tab === 'tab-devices') { /* форма загрузится по нажатию Поиск */ }
    if (btn.dataset.tab === 'tab-analytics') loadAnalytics();
    if (btn.dataset.tab === 'tab-dev') renderDevTemplates();
    if (btn.dataset.tab === 'tab-admins') loadAdmins();
    if (btn.dataset.tab === 'tab-devices') loadUsers();
    if (btn.dataset.tab === 'tab-bans') loadBans();
    if (btn.dataset.tab === 'tab-audit') loadAuditLog();
  })
);

// =====================================================
//  НОВОСТИ
// =====================================================
function demoNoticeIfNeeded() {
  if (!DEMO_ADMIN) return true;
  demoNotice();
  return false;
}

async function loadAdminNews(pid) {
  if (DEMO_ADMIN) return renderAdminNewsList(DEMO_NEWS);
  const { data, error } = await sb.from('news').select('*').eq('project_id', pid).order('published_at', { ascending: false });
  if (error) {
    $('#admin-news-list').innerHTML = `<p class="form-error">${escapeHtml(friendlyError(error.message))}</p>`;
    return;
  }
  renderAdminNewsList(data || []);
}


function showContextMenu(items, x, y) {
  const menu = $('#context-menu');
  if (!menu) return;
  menu.innerHTML = '';
  items.forEach((item) => {
    if (item.divider) { const d = document.createElement('div'); d.className = 'ctx-divider'; menu.appendChild(d); return; }
    const b = document.createElement('button');
    b.className = item.danger ? 'danger' : '';
    const ico = item.icon ? '<span style="opacity:.75; font-size:.95em; width:18px">' + escapeHtml(item.icon) + '</span>' : '';
    const label = '<span>' + escapeHtml(item.label) + '</span>';
    b.innerHTML = ico + label;
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', () => { hideContextMenu(); item.callback && item.callback(); });
    menu.appendChild(b);
  });
  menu.style.left = Math.max(4, Math.min(x, window.innerWidth - 240)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, window.innerHeight - 300)) + 'px';
  menu.classList.remove('hidden');
  const closeOnOutside = (ev) => { if (!menu.contains(ev.target)) hideContextMenu(); document.removeEventListener('mousedown', closeOnOutside, true); document.removeEventListener('contextmenu', closeOnOutside, true); document.removeEventListener('keydown', closeOnEsc, true); };
  const closeOnEsc = (ev) => { if (ev.key === 'Escape') { hideContextMenu(); document.removeEventListener('mousedown', closeOnOutside, true); document.removeEventListener('contextmenu', closeOnOutside, true); document.removeEventListener('keydown', closeOnEsc, true); } };
  setTimeout(() => {
    document.addEventListener('mousedown', closeOnOutside, true);
    document.addEventListener('contextmenu', closeOnOutside, true);
    document.addEventListener('keydown', closeOnEsc, true);
  }, 0);
}

function hideContextMenu() {
  const menu = $('#context-menu');
  if (menu) menu.classList.add('hidden');
}

function renderAdminNewsList(data) {
  const list = $('#admin-news-list');
  list.innerHTML = data.map((n) => `
    <div class="admin-news-item ${n.active ? '' : 'inactive'}" data-id="${n.id}" data-ctx="news-item">
      ${n.image_url
        ? `<img class="admin-news-thumb" src="${escapeHtml(n.image_url)}" alt="" onerror="this.style.visibility='hidden'" />`
        : '<div class="admin-news-thumb">📰</div>'}
      <div class="admin-news-meta">
        <b title="${escapeHtml(n.title)}">${n.pinned ? '<span class="pin-badge">📌 Закреплено</span>' : ''}${escapeHtml(n.title)}
          <span class="badge ${n.active ? 'on' : 'off'}">${n.active ? 'Видна' : 'Скрыта'}</span></b>
        <span>${escapeHtml(n.tag)}${n.carousel ? ' · 📺 карусель' : ''} · ${new Date(n.published_at).toLocaleDateString('ru-RU')}</span>
      </div>
      <div class="admin-news-actions">
        <button class="icon-btn" data-act="toggle" title="${n.active ? 'Спрятать' : 'Опубликовать'}">${n.active ? '🙈' : '👁️'}</button>
        <button class="icon-btn" data-act="edit" title="Редактировать">✏️</button>
        <button class="icon-btn${n.pinned ? ' active-pin' : ''}" data-act="pin" title="Закрепить/открепить">📌</button>
        <button class="icon-btn del" data-act="delete" title="Удалить">🗑️</button>
      </div>
    </div>`).join('') || '<p class="news-list-head">Новостей пока нет — создайте первую слева!</p>';

  $$('.admin-news-item', list).forEach((row) => {
    const id = Number(row.dataset.id);
    row.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      const item = data.find((n) => n.id === id);
      if (act === 'edit') fillNewsForm(item);
      if (act === 'toggle') DEMO_ADMIN ? demoNotice() : await toggleNewsActive(item);
      if (act === 'delete') DEMO_ADMIN ? demoNotice() : await deleteNews(item);
      if (act === 'pin')   DEMO_ADMIN ? demoNotice() : await pinNews(item);
    });
    row.addEventListener('contextmenu', (e) => {
      if (!state.isSuper) return;
      e.preventDefault();
      const item = data.find((n) => n.id === id);
      if (!item) return;
      showContextMenu([
        { label: 'Редактировать', icon: '✏️', callback: () => fillNewsForm(item) },
        { label: item.home ? 'Убрать с «Последних новостей»' : 'В «Последние новости» на Главной', icon: '⭐', callback: () => DEMO_ADMIN ? demoNotice() : toggleNewsHome(item) },
        { label: item.carousel ? 'Убрать из карусели «Главной»' : 'В карусель «Главной»', icon: '📺', callback: () => DEMO_ADMIN ? demoNotice() : toggleNewsCarousel(item) },
        { label: item.pinned ? 'Открепить' : 'Закрепить', icon: '📌', callback: () => DEMO_ADMIN ? demoNotice() : pinNews(item) },
        { divider: true },
        { label: 'Удалить', icon: '🗑️', danger: true, callback: () => DEMO_ADMIN ? demoNotice() : deleteNews(item) },
      ], e.clientX, e.clientY);
    });
  });
}

async function toggleNewsActive(item) {
  const { error } = await sb.from('news').update({ active: !item.active }).eq('id', item.id);
  if (error) return toast(friendlyError(error.message), true);
  toast(item.active ? 'Новость скрыта от игроков.' : 'Новость опубликована.');
  await loadAdminNews(state.currentProjectId);
}

async function toggleNewsHome(item) {
  const next = !item.home;
  const { error } = await sb.from('news').update({ home: next }).eq('id', item.id);
  if (error) return toast(friendlyError(error.message), true);
  toast(next ? 'Новость показана на «Главной».' : 'Новость убрана с «Главной».');
  logAdminAction(next ? 'news_home_add' : 'news_home_remove', { id: item.id, title: item.title });
  await loadAdminNews(state.currentProjectId);
  if (typeof loadHomeAdmin === 'function') loadHomeAdmin();
}

async function toggleNewsCarousel(item) {
  const next = !item.carousel;
  const { error } = await sb.from('news').update({ carousel: next }).eq('id', item.id);
  if (error) return toast(friendlyError(error.message), true);
  toast(next ? 'Новость в карусели «Главной».' : 'Новость убрана из карусели.');
  logAdminAction(next ? 'news_carousel_add' : 'news_carousel_remove', { id: item.id, title: item.title });
  await loadAdminNews(state.currentProjectId);
  if (typeof loadHomeAdmin === 'function') loadHomeAdmin();
}

async function pinNews(item) {
  const next = !item.pinned;
  const { error } = await sb.from('news').update({ pinned: next }).eq('id', item.id);
  if (error) return toast(friendlyError(error.message), true);
  toast(next ? 'Новость закреплена.' : 'Новость откреплена.');
  await loadAdminNews(state.currentProjectId);
}

async function deleteNews(item) {
  if (!(await uiConfirm({ title: 'Удалить новость', message: 'Удалить «' + (item.title || '') + '» навсегда?', okLabel: 'Удалить', danger: true }))) return;
  const { error } = await sb.from('news').delete().eq('id', item.id);
  if (error) return toast(friendlyError(error.message), true);
  toast('Новость удалена.');
  await loadAdminNews(state.currentProjectId);
}

// форма
const nf = { id: $('#nf-id'), title: $('#nf-title'), tag: $('#nf-tag'), active: $('#nf-active'), excerpt: $('#nf-excerpt'), body: $('#nf-body'), imageUrl: $('#nf-image-url'), home: $('#nf-home'), carousel: $('#nf-carousel'), ctaUrl: $('#nf-cta-url'), schedule: $('#nf-schedule'), withRelease: $('#nf-with-release'), relVersion: $('#nf-rel-version'), relUrl: $('#nf-rel-download-url'), relNotes: $('#nf-rel-notes') };

$('#btn-new-news').addEventListener('click', () => { clearNewsForm(); $('#nf-title').focus(); });
$('#btn-news-clear').addEventListener('click', clearNewsForm);

function toLocalInputValue(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function toggleReleaseFields(on) {
  ['nf-rel-version-wrap', 'nf-rel-url-wrap', 'nf-rel-notes-wrap'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = on ? '' : 'none';
  });
}
$('#nf-with-release')?.addEventListener('change', (e) => toggleReleaseFields(e.target.checked));

function clearNewsForm() {
  $('#news-form-title').textContent = 'Новая новость';
  nf.id.value = '';
  nf.title.value = '';
  nf.tag.value = 'Анонс';
  nf.active.value = 'true';
  nf.excerpt.value = '';
  nf.body.value = '';
  nf.imageUrl.value = '';
  if (nf.home) nf.home.checked = false;
  if (nf.carousel) nf.carousel.checked = false;
  if (nf.ctaUrl) nf.ctaUrl.value = '';
  if (nf.schedule) nf.schedule.value = '';
  if (nf.withRelease) nf.withRelease.checked = false;
  toggleReleaseFields(false);
  if (nf.relVersion) nf.relVersion.value = '';
  if (nf.relUrl) nf.relUrl.value = '';
  if (nf.relNotes) nf.relNotes.value = '';
}

function fillNewsForm(n) {
  $('#news-form-title').textContent = 'Редактирование новости';
  nf.id.value = n.id;
  nf.title.value = n.title || '';
  nf.tag.value = n.tag || 'Анонс';
  nf.active.value = String(!!n.active);
  nf.excerpt.value = n.excerpt || '';
  nf.body.value = n.body || '';
  nf.imageUrl.value = n.image_url || '';
  if (nf.home) nf.home.checked = !!n.home;
  if (nf.carousel) nf.carousel.checked = !!n.carousel;
  if (nf.ctaUrl) nf.ctaUrl.value = n.cta_url || '';
  if (nf.schedule) nf.schedule.value = n.published_at ? toLocalInputValue(n.published_at) : '';
  if (nf.withRelease) nf.withRelease.checked = false;
  toggleReleaseFields(false);
}

async function uploadNewsImageIfAny() {
  // файлы картинок в Storage не храним — только внешняя ссылка
  return nf.imageUrl.value.trim() || null;
}

$('#news-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (DEMO_ADMIN) {
    if (!nf.title.value.trim()) return toast('Заголовок обязателен.', true);
    clearNewsForm();
    demoNotice();
    return;
  }

  const btn = $('#btn-news-save');
  btn.disabled = true;
  btn.textContent = 'Сохраняем…';

  try {
    const image_url = await uploadNewsImageIfAny();
    const pid = state.currentProjectId;
    const scheduledISO = nf.schedule?.value ? new Date(nf.schedule.value).toISOString() : null;
    const publishedAt = scheduledISO || new Date().toISOString();
    const withRelease = !!(nf.withRelease && nf.withRelease.checked);
    const payload = {
      project_id: pid,
      title: nf.title.value.trim(),
      tag: nf.tag.value,
      active: nf.active.value === 'true',
      excerpt: nf.excerpt.value.trim(),
      body: nf.body.value.trim(),
      image_url,
      published_at: publishedAt,
      home: nf.home ? nf.home.checked : false,
      carousel: nf.carousel ? nf.carousel.checked : false,
      cta_url: nf.ctaUrl ? nf.ctaUrl.value.trim() : '',
    };

    if (nf.id.value) {
      const { error } = await sb.from('news').update(payload).eq('id', Number(nf.id.value));
      if (error) throw error;
      toast('Новость обновлена.');
    } else {
      const { error } = await sb.from('news').insert(payload);
      if (error) throw error;
      toast('Новость опубликована!');
    }
    if (withRelease && pid) {
      const rows = [
        { project_id: pid, key: 'game_version', value: (nf.relVersion?.value || '').trim() },
        { project_id: pid, key: 'download_url', value: (nf.relUrl?.value || '').trim() },
        { project_id: pid, key: 'update_notes', value: (nf.relNotes?.value || '').trim() },
        { project_id: pid, key: 'release_activate_at', value: publishedAt },
      ].filter((r) => r.key === 'update_notes' || r.key === 'release_activate_at' || r.value);
      const { error: relErr } = await sb.from('settings').upsert(rows, { onConflict: 'project_id,key' });
      if (relErr) toast('Релиз сохранён с предупреждением: ' + friendlyError(relErr.message), true);
    }
    clearNewsForm();
    await loadAdminNews(pid);
  } catch (err) {
    toast(friendlyError(err?.message), true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить';
  }
});

// =====================================================
//  НАСТРОЙКИ
// =====================================================
function applySettingsToForm(map) {
  $('#sf-game-name').value = map.game_name || '';
  $('#sf-game-version').value = map.game_version || '';
  $('#sf-download-url').value = map.download_url || '';
  $('#sf-update-notes').value = map.update_notes || '';
  $('#sf-maintenance').value = map.maintenance || 'false';
  $('#sf-min-launcher').value = map.min_launcher_version || '1.0.0';
  if ($('#sf-download-available')) $('#sf-download-available').value = map.download_available || 'true';
  if ($('#sf-game-image-url')) $('#sf-game-image-url').value = map.game_image_url || '';
  if ($('#media-banner')) $('#media-banner').value = map.media_banner || '';
  if ($('#media-thumbnail')) $('#media-thumbnail').value = map.media_thumbnail || '';
  if ($('#media-card')) $('#media-card').value = map.media_card || '';
  if ($('#media-news')) $('#media-news').value = map.media_news || '';
  if ($('#media-screenshots')) {
    try { $('#media-screenshots').value = Array.isArray(map.media_screenshots) ? map.media_screenshots.join('\n') : (JSON.parse(map.media_screenshots || '[]').map((s) => s.url || s).join('\n')); } catch { $('#media-screenshots').value = map.media_screenshots || ''; }
  }
  if ($('#media-show-home')) $('#media-show-home').checked = String(map.media_show_home || 'false').toLowerCase() === 'true' || map.media_show_home === true;
  if ($('#media-home-sort')) $('#media-home-sort').value = String(map.media_home_sort || '10');
  if ($('#media-release')) $('#media-release').value = map.media_release_date || '';
  if ($('#media-langs')) $('#media-langs').value = map.media_languages || '';
  if ($('#media-developer')) $('#media-developer').value = map.media_developer || '';
  if ($('#media-developer-contact')) $('#media-developer-contact').value = map.media_developer_contact || '';
  if ($('#media-long-description')) $('#media-long-description').value = map.media_long_description || '';
  const proj = state.projects.find((p) => p.id === state.currentProjectId);
  if (proj) refreshDangerZone(proj);
}

async function loadSettingsForm(pid) {
  if (!pid) return;
  if (DEMO_ADMIN) return applySettingsToForm(DEMO_SETTINGS);
  const { data, error } = await sb.from('settings').select('key,value').eq('project_id', pid);
  if (error) return toast(friendlyError(error.message), true);
  applySettingsToForm(Object.fromEntries((data || []).map((r) => [r.key, r.value])));
}

$('#btn-settings-save').addEventListener('click', async () => {
  if (DEMO_ADMIN) { demoNotice(); return; }
  const btn = $('#btn-settings-save');
  btn.disabled = true;
  btn.textContent = 'Сохраняем…';

  const pid = state.currentProjectId;
  const values = {
    game_name: $('#sf-game-name').value.trim(),
    game_version: $('#sf-game-version').value.trim(),
    download_url: $('#sf-download-url').value.trim(),
    update_notes: $('#sf-update-notes').value.trim(),
    maintenance: $('#sf-maintenance').value,
    min_launcher_version: $('#sf-min-launcher').value.trim(),
    download_available: $('#sf-download-available').value === 'true',
    game_image_url: $('#sf-game-image-url').value.trim(),
    game_owner: $('#sf-game-owner').value.trim(),
    game_repo: $('#sf-game-repo').value.trim(),
    game_tag: $('#sf-game-tag').value.trim(),
    game_enabled: $('#sf-game-enabled').value,
    game_manifest: $('#sf-game-manifest').value,
    media_banner: $('#media-banner').value.trim(),
    media_thumbnail: $('#media-thumbnail').value.trim(),
    media_card: $('#media-card').value.trim(),
    media_news: $('#media-news').value.trim(),
    media_screenshots: JSON.stringify(($('#media-screenshots').value || '').split('\n').map((s) => s.trim()).filter(Boolean)),
    media_release_date: $('#media-release').value.trim(),
    media_languages: $('#media-langs').value.trim(),
    media_developer: $('#media-developer').value.trim(),
    media_developer_contact: $('#media-developer-contact').value.trim(),
    media_long_description: $('#media-long-description').value.trim(),
  };

  try {
    const rows = SETTINGS_KEYS.map((key) => ({
      project_id: pid,
      key,
      value: values[key],
      updated_at: new Date().toISOString(),
    }));
    const { error } = await sb.from('settings').upsert(rows, { onConflict: 'project_id,key' });
    if (error) throw error;
    toast('Настройки сохранены.');
  } catch (err) {
    toast(friendlyError(err?.message), true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Сохранить все настройки';
  }
});


// =====================================================
//  УЧАСТНИКИ (КОМАНДА)
// =====================================================
async function loadMembers(pid) {
  const list = $('#members-list');
  const empty = $('#members-empty');

  if (DEMO_ADMIN) { renderMembersList(DEMO_MEMBERS); return; }

  const { data, error } = await sb.from('project_members').select('user_id, email, role').eq('project_id', pid).order('created_at', { ascending: true });
  if (error) { list.innerHTML = `<p class="form-error">${escapeHtml(friendlyError(error.message))}</p>`; empty.style.display = 'none'; return; }
  renderMembersList(data || []);
}

function renderMembersList(data) {
  const list = $('#members-list');
  const empty = $('#members-empty');
  const myEmail = (state.user?.email || '').toLowerCase();
  data = data.filter((m) => (m.email || '').toLowerCase() !== myEmail);

  empty.style.display = data.length ? 'none' : 'block';

  list.innerHTML = data.map((m) => {
    const isMe = myEmail && (m.email || '').toLowerCase() === myEmail;
    return `
      <div class="member-row">
        <div class="member-avatar">${escapeHtml((m.email || '?').charAt(0).toUpperCase())}</div>
        <div class="member-meta">
          <b>${escapeHtml(m.email || 'Без email')}${isMe ? ' <span class="badge on" style="margin-left:6px">Вы</span>' : ''}</b>
          <span>ID: ${escapeHtml((m.user_id || '').slice(0, 8))}…</span>
        </div>
        <span class="member-role ${m.role === 'owner' ? 'owner' : ''}">${escapeHtml(m.role)}</span>
        ${isMe ? '' : `<button class="icon-btn del" data-remove="${m.user_id}" title="Удалить участника">🗑️</button>`}
      </div>`;
  }).join('');

  $$('[data-remove]', list).forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (DEMO_ADMIN) return demoNotice();
      const uid = btn.dataset.remove;
      if (!(await uiConfirm({ title: 'Удалить участника', message: 'Удалить участника из проекта?', okLabel: 'Удалить', danger: true }))) return;
      const { error } = await sb.from('project_members').delete().eq('project_id', state.currentProjectId).eq('user_id', uid);
      if (error) return toast(friendlyError(error.message), true);
      toast('Участник удалён.');
      await loadMembers(state.currentProjectId);
    })
  );
}

$('#add-member-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (DEMO_ADMIN) { demoNotice(); return; }
  const myRole = currentProject()?.role || (state.isSuper ? 'owner' : 'editor');
  if (myRole !== 'owner') { toast('Звать людей в команду может только владелец проекта.', true); return; }

  const errEl = $('#am-error');
  errEl.textContent = '';
  const email = $('#am-email').value.trim().toLowerCase();
  if (!email) return;

  const btn = $('#btn-am-add');
  btn.disabled = true;

  try {
    // найти пользователя по email (функция find_user_by_email)
    const { data: found, error: rpcErr } = await sb.rpc('find_user_by_email', { email });
    if (rpcErr) throw rpcErr;
    const row = Array.isArray(found) ? found[0] : found;
    if (!row || !row.user_id) throw new Error('Пользователь с таким email не найден. Он должен сначала зарегистрироваться в лаунчере.');

    const { error } = await sb.from('project_members').insert({
      project_id: state.currentProjectId,
      user_id: row.user_id,
      email: row.email,
      role: ($('#am-role')?.value || 'editor'),
    });
    if (error) {
      if ((error.message || '').toLowerCase().includes('duplicate')) throw new Error('Этот пользователь уже участник проекта.');
      throw error;
    }

    $('#am-email').value = '';
    toast(`Приглашение отправлено: ${row.email} (роль «editor»)`);
    await loadMembers(state.currentProjectId);
  } catch (err) {
    errEl.textContent = friendlyError(err?.message);
  } finally {
    btn.disabled = false;
  }
});

// =====================================================
//  СОЗДАНИЕ ПРОЕКТА
// =====================================================
function openProjectModal() {
  $('#project-modal-wrap').hidden = false;
  $('#np-error').textContent = '';
  $('#np-name').focus();
}
function closeProjectModal() { $('#project-modal-wrap').hidden = true; }

$('#btn-new-project').addEventListener('click', openProjectModal);
$('#empty-create-btn')?.addEventListener('click', openProjectModal);
$('#empty-logout-btn')?.addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
$('#btn-first-project').addEventListener('click', () => {
  $('#admin-noproj').classList.add('hidden');
  $('#admin-panel').classList.remove('hidden');
  openProjectModal();
});
$('#btn-noproj-logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
$('#btn-np-cancel').addEventListener('click', closeProjectModal);

// авто-слаг из названия
$('#np-name').addEventListener('input', (e) => {
  const name = e.target.value.trim();
  const slugInput = $('#np-slug');
  if (slugInput.value.trim()) return; // не перезаписываем, если пользователь вписал сам
  const map = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
  const slug = name.toLowerCase().split('').map((ch) => map[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  slugInput.value = slug;
});

$('#new-project-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (DEMO_ADMIN) { demoNotice(); return; }

  const err = $('#np-error');
  err.textContent = '';
  const btn = $('#btn-np-create');
  btn.disabled = true;
  btn.textContent = 'Создаём…';

  try {
    const { data, error } = await sb.from('projects').insert({
      name: $('#np-name').value.trim(),
      slug: $('#np-slug').value.trim().toLowerCase(),
      tagline: $('#np-tagline').value.trim(),
      logo: $('#np-logo').value.trim() || '🎮',
        approved: false,
      color: $('#np-color').value,
      created_by: state.user.id,
    }).select('*').single();
    if (error) throw error;

    // создадим участника-владельца сразу (триггер делает то же, но на всякий)
    state.membershipsByProject = {}; // тише перезагрузим всё

    state.projects = [...state.projects, { ...data, role: 'owner' }];
    state.membershipsByProject[data.id] = 'owner';
    state.currentProjectId = data.id;
    localStorage.setItem(CURRENT_PROJECT_KEY, String(data.id));

    $('#np-name').value = '';
    $('#np-slug').value = '';
    $('#np-tagline').value = '';
    $('#np-logo').value = '';
    closeProjectModal();
    renderProjectSelect();
    showTabs('tab-news');
    toast(`Проект «${data.name}» создан!`);
    await reloadCurrentProject();
  } catch (e) {
    err.textContent = friendlyError(e?.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Создать';
  }
});


// =====================================================
//  BАНЫ / СКРЫТИЕ / УДАЛЕНИЕ ПРОЕКТА
// =====================================================

async function toggleApprove() {
  const pid = state.currentProjectId;
  if (!pid) return;
  const select = document.getElementById('danger-approve');
  const now = select && select.value === 'true';
  try {
    const { error } = await sb.from('projects').update({ approved: now }).eq('id', pid);
    if (error) {
      if (/approved/i.test(String(error.message))) {
        toast('Примените в SQL Editor migration-v7.sql, чтобы включить «Публикацию».', true);
        return;
      }
      throw error;
    }
    state.projects = state.projects.map((p) => p.id === pid ? { ...p, approved: now } : p);
    toast(now ? 'Проект опубликован — игроки его увидят.' : 'Проект скрыт от игроков (не опубликован).');
    renderProjectSelect();
    applyUnpublishedState();
  } catch (err) {
    toast(friendlyError(err?.message), true);
  }
}


function refreshDangerZone(proj) {
  if (!proj) return;
  if ($('#danger-hide')) $('#danger-hide').value = proj.is_hidden ? 'true' : 'false';
  if ($('#danger-approve')) $('#danger-approve').value = proj.approved ? 'true' : 'false';
}

function applyUnpublishedState() {
  const proj = currentProject();
  const banner = document.getElementById('unpublished-banner');
  if (!banner) return;
  const hidden = !!(proj && proj.approved === false);
  banner.classList.toggle('hidden', !hidden);
}

async function toggleHide() {
  const pid = state.currentProjectId;
  if (!pid) return;
  const select = document.getElementById('danger-hide');
  const hideNow = select && select.value === 'true';
  try {
    const { error } = await sb.from('projects').update({ is_hidden: hideNow }).eq('id', pid);
    if (error) throw error;
    state.projects = state.projects.map((p) => p.id === pid ? { ...p, is_hidden: hideNow } : p);
    toast(hideNow ? 'Проект скрыт от игроков.' : 'Проект снова виден игрокам.');
    renderProjectSelect();
  } catch (err) {
    toast(friendlyError(err?.message), true);
  }
}

async function deleteProject() {
  const pid = state.currentProjectId;
  const proj = currentProject();
  if (!pid) return;
  const name = proj?.name || 'project';
  if (!(await uiConfirm({ title: 'УДАЛИТЬ ПРОЕКТ', message: 'Удалить проект «' + name + '» НАВСЕГДА? Все новости, настройки, участники и баны будут удалены.', okLabel: 'Продолжить', danger: true }))) return;
  if (!(await uiConfirm({ title: 'Последнее подтверждение', message: 'Проект «' + name + '» будет удалён БЕЗВОЗВРАТНО. Восстановить невозможно.', okLabel: 'УДАЛИТЬ', danger: true }))) return;

  try {
    const { error } = await sb.rpc('delete_project_admin', { pid });
    if (error) throw error;
    toast('Проект удалён.');
    state.projects = state.projects.filter((p) => p.id !== pid);
    if (state.projects.length) {
      state.currentProjectId = state.projects[0].id;
      localStorage.setItem(CURRENT_PROJECT_KEY, String(state.currentProjectId));
    } else {
      state.currentProjectId = 0;
      localStorage.removeItem(CURRENT_PROJECT_KEY);
    }
    renderProjectSelect();
    applyUnpublishedState();
    if (!state.projects.length) { showEmptyState(); return; }
    await reloadCurrentProject();
  } catch (err) {
    toast(friendlyError(err?.message), true);
  }
}

async function loadBans() {
  if (typeof loadWarningsList === 'function') { try { await loadWarningsList(); } catch (e) { adminLogLine('WARN', ['warnings load failed:', e?.message]); } }
  const list = document.getElementById('bans-list');
  const emptyEl = document.getElementById('bans-empty');
  if (!list) return;
  const filter = currentBanFilter;
  const q = (document.getElementById('ban-search')?.value || '').trim();
  if (DEMO_ADMIN) {
    list.innerHTML = '<p class="page-sub">Демо-режим: список банов — имитация.</p>';
    return;
  }
  const { data, error } = await sb.rpc('list_all_bans', { p_search: q || null, p_state: filter, p_limit: 200 });
  if (error) {
    list.innerHTML = '<p class="form-error">' + escapeHtml(friendlyError(error.message)) + '</p>';
    if (emptyEl) emptyEl.style.display = 'none';
    return;
  }
  const rows = data || [];
  if (!rows.length) {
    list.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  list.innerHTML = rows.map((b) =>
    '<div class="member-row">' +
      '<div class="member-avatar">' + escapeHtml((b.email || '?').charAt(0).toUpperCase()) + '</div>' +
      '<div class="member-meta">' +
        '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">' +
          '<b>' + escapeHtml(b.email || '?') + '</b>' +
          '<span class="badge ' + (b.is_active ? 'on' : 'off') + '">' + (b.is_active ? 'Активен' : 'Истёк') + '</span>' +
        '</div>' +
        '<span>до ' + new Date(b.banned_until).toLocaleString('ru-RU') + ' · Причина: ' + escapeHtml(b.reason || '—') + (b.banned_by_email ? ' · пример' : '') + '</span>' +
      '</div>' +
      (b.is_active
        ? '<button class="icon-btn" data-unban="' + b.user_id + '" title="Разбанить">✅</button>'
        : '<span class="page-sub" style="font-size:.8rem; white-space:nowrap; padding:0 8px">—</span>'
      ) +
    '</div>'
  ).join('');

  list.querySelectorAll('[data-unban]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const uid = btn.getAttribute('data-unban');
      const row = btn.closest('.member-row');
      if (!row) return;
      if (row.querySelector('.unban-inline')) return;
      const form = document.createElement('div');
      form.className = 'unban-inline';
      form.style.cssText = 'display:flex; gap:8px; margin-top:8px; flex-basis:100%;';
      form.innerHTML = '<input type="text" class="unban-reason" placeholder="Причина разбана" maxlength="200" style="flex:1; min-width:0; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.04); color:#e6e7ee; font:inherit; font-size:.82rem;" />' +
        '<button class="btn btn-primary btn-sm unban-confirm" type="button">Снять</button>' +
        '<button class="btn btn-ghost btn-sm unban-cancel" type="button">✕</button>';
      row.appendChild(form);
      const input = form.querySelector('.unban-reason');
      input.focus();
      form.querySelector('.unban-cancel').addEventListener('click', () => form.remove());
      form.querySelector('.unban-confirm').addEventListener('click', async () => {
        const reason = input.value.trim() || 'manual_unban';
        const { error } = await sb.rpc('ban_user', { target: uid, ban_until: null, reason });
        if (error) return toast(friendlyError(error.message), true);
        toast('Бан снят.');
        await loadBans();
      });
    })
  );
}

let currentBanFilter = 'all';

$('#ban-search')?.addEventListener('input', () => { clearTimeout(window.__banSearchTimer); window.__banSearchTimer = setTimeout(loadBans, 250); });
document.querySelectorAll('#ban-filter-toggle .seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentBanFilter = btn.dataset.filter || 'all';
    document.querySelectorAll('#ban-filter-toggle .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    loadBans();
  });
});

// =====================================================
//  BАНЫ / СКРЫТИЕ / УДАЛЕНИЕ ПРОЕКТА
// =====================================================
// =====================================================
//  ПРЕВЬЮ «ГЛАЗАМИ ИГРОКА»
// =====================================================

// ---------- ЗАБАНИТЬ пользователя ----------
const banForm = document.getElementById('ban-form');
if (banForm) {
  // защитный сброс ошибок при повторном открытии формы
  banForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (DEMO_ADMIN) { toast('Демо-режим: бан не отправляется.', true); return; }
    const errEl = document.getElementById('ban-error');
    if (errEl) errEl.textContent = '';
    const emailInput = document.getElementById('ban-email');
    const email = emailInput.value.trim().toLowerCase();
    const minutesInput = document.getElementById('ban-minutes');
    const minutes = Number(minutesInput?.value) || 1440;
    const reason = (document.getElementById('ban-reason')?.value || '').trim() || 'manual';

    if (!email) { if (errEl) errEl.textContent = 'Введите email.'; return; }
    if (!state.isSuper) { if (errEl) errEl.textContent = 'Только супер-администратор может банить глобально.'; return; }

    try {
      const { data: found, error: rpcErr } = await sb.rpc('find_user_by_email', { email });
      if (rpcErr) throw rpcErr;
      const row = Array.isArray(found) ? found[0] : found;
      if (!row || !row.user_id) throw new Error('Пользователь не найден. Он должен зарегистрироваться в лаунчере.');
      const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      const { error } = await sb.rpc('ban_user', { target: row.user_id, ban_until: until, reason });
      if (error) throw error;
      if (errEl) errEl.textContent = '';
      emailInput.value = '';
      const reasonInput = document.getElementById('ban-reason');
      if (reasonInput) reasonInput.value = '';
      toast('Пользователь ' + email + ' забанен до ' + new Date(until).toLocaleString('ru-RU') + '.');
      await loadBans();
    } catch (err) {
      if (errEl) errEl.textContent = friendlyError(err?.message);
      toast('Не удалось забанить: ' + friendlyError(err?.message), true);
    }
  });
}

$('#btn-toggle-approve')?.addEventListener('click', toggleApprove);
$('#btn-toggle-hide')?.addEventListener('click', toggleHide);
$('#btn-delete-project')?.addEventListener('click', deleteProject);

async function readImageForReport() {
  const input = document.getElementById('bug-image');
  const file = input?.files?.[0];
  if (!file) return null;
  try {
    const img = await new Promise((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = rej;
      el.src = URL.createObjectURL(file);
    });
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(img.src);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    const base64 = (dataUrl.split(',')[1]) || '';
    if (!base64 || base64.length > 4000000) return null;
    const filename = (file.name || 'screenshot.jpg').replace(/\.[^.]+$/, '') + '.jpg';
    return { filename, content: base64, contentType: 'image/jpeg' };
  } catch (err) {
    adminLogLine('WARN', ['bug report image skipped:', err?.message || err]);
    return null;
  }
}




// =====================================================
//  TAB УСТРОЙСТВА (admin)
// =====================================================
//  TAB ИГРОКИ (поиск / проекты / бан / устройства)
// =====================================================
async function loadPlayersFor(q) {
  const q0 = String(q || '').trim();
  const el = $('#dev-devices-list');
  const metaEl = $('#dev-meta');
  const summaryEl = $('#dev-summary');
  const errEl = $('#dev-find-error');
  const projectsEl = $('#dev-projects-list');
  const bannedRow = $('#dev-banned-row');
  const emptyEl = $('#dev-empty');
  if (!el || !errEl || !metaEl || !summaryEl) return;
  errEl.textContent = '';
  metaEl.innerHTML = '';
  summaryEl.classList.add('hidden');
  projectsEl.innerHTML = '';
  el.innerHTML = '';
  if (bannedRow) bannedRow.innerHTML = '';
  errEl.textContent = '';
  if (emptyEl) emptyEl.style.display = 'none';

  if (!state.isSuper) { errEl.textContent = 'Только супер-администратор.'; return; }
  if (!q0) { errEl.textContent = 'Введите email или UUID.'; return; }

  try {
    // 1) найти пользователя
    const { data: found, error: rpcErr } = await sb.rpc('find_user_any', { p_search: q0 });
    if (rpcErr) throw rpcErr;
    const row = (Array.isArray(found) ? found : [found])[0];
    if (!row || !row.user_id) throw new Error('Пользователь не найден.');
    window.__targetUserId = row.user_id;

    // 2) сводка (admin_user_overview) — только если функция существует; иначе fallback вручную
    let ov = null;
    try {
      const { data: ovData, error: ovErr } = await sb.rpc('admin_user_overview', { target: row.user_id });
      if (!ovErr) ov = ovData;
    } catch { /* можеh не существовать — fallback */ }
    // fallback: собрать вручную
    if (!ov) {
      ov = { id: row.user_id, email: row.email || q0, projects: [], banned: false, ban_reason: null, ban_until: null };
    }
    // 2.5) список проектов через RPC — best-effort (если функция отсутствует, сквозной .projects запрос)
    let projects = [];
    try {
      const { data: pj, error: pjErr } = await sb.rpc('admin_user_overview', { target: row.user_id });
      if (!pjErr && pj && Array.isArray(pj.projects)) projects = pj.projects;
    } catch { /* fallback below */ }
    if (!projects.length) {
      // Fallback: членства из project_members
      const { data: membs } = await sb.from('project_members').select('project_id, role').eq('user_id', row.user_id);
      if (membs && membs.length) {
        const ids = membs.map((m) => m.project_id);
        const { data: prjs } = await sb.from('projects').select('id, name, slug, approved, is_hidden').in('id', ids);
        projects = (prjs || []).map((p) => ({ ...p, role: membs.find((m) => m.project_id === p.id)?.role || 'member' }));
      }
    }

    metaEl.innerHTML =
      '<b>' + escapeHtml(ov.email || row.email || q0) + '</b><br>' +
      '<span class="page-sub" style="font-size:.82rem">uid: ' + escapeHtml(row.user_id) + '</span>' +
      (ov.created_at ? '<br><span class="page-sub" style="font-size:.82rem">аккаунт создан: ' + new Date(ov.created_at).toLocaleString('ru-RU') + '</span>' : '');

    if (bannedRow) {
      const b = ov.banned === true || ov.banned === 'true' || !!(ov.ban_reason);
      if (b) {
        const whenTxt = ov.ban_until ? ' до ' + new Date(ov.ban_until).toLocaleString('ru-RU') : '';
        bannedRow.innerHTML = '<div style="padding:8px 10px; border:1px solid rgba(255,92,122,.55); background:rgba(255,92,122,.10); border-radius:10px; font-size:.84rem; color:#ffb5c0;"><b>⛔ ЗАБАНЕН</b>' + (ov.ban_reason ? ' · ' + escapeHtml(ov.ban_reason) : '') + whenTxt + '</div>';
      } else {
        bannedRow.innerHTML = '<div style="padding:6px 10px; border:1px solid rgba(0,214,160,.45); background:rgba(0,214,160,.08); border-radius:10px; font-size:.82rem; color:#7de6b2;">✓ Не забанен</div>';
      }
    }

    if (projectsEl) {
      if (!projects.length) {
        projectsEl.innerHTML = '<p class="page-sub">Проектов нет.</p>';
      } else {
        projectsEl.innerHTML = projects.map((p) =>
          '<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:6px 10px; border:1px solid var(--border); border-radius:8px;">' +
            '<div style="min-width:0"><b>' + escapeHtml(p.name) + '</b>' +
              '<div class="page-sub" style="font-size:.78rem">' + escapeHtml(p.slug) + '</div>' +
            '</div>' +
            '<div class="page-sub" style="font-size:.78rem; text-align:right">роль: ' + escapeHtml(p.role || 'member') + (p.approved === false ? '<br>не опубл.' : '') + '</div>' +
          '</div>'
        ).join('');
      }
    }

    // 3) устройства
    const { data, error } = await sb.rpc('list_user_devices', { target_user: row.user_id });
    if (error) throw error;
    const list = data || [];
    if (!list.length) { if (emptyEl) emptyEl.style.display = 'block'; }
    else {
      el.innerHTML = list.map((d) =>
        '<div style="display:flex; justify-content:space-between; gap:12px; align-items:center; padding:8px 10px; border:1px solid var(--border); border-radius:10px;">' +
          '<div style="min-width:0"><b style="font-size:.84rem">' + escapeHtml(d.device_name || 'Unknown') + '</b><br><span class="page-sub" style="font-size:.78rem">' + escapeHtml(d.platform || '') + ' · v' + escapeHtml(d.app_version || '') + (state.isSuper ? ' · IP ' + escapeHtml(d.ip_address || '—') : '') + ' · seen ' + new Date(d.last_seen).toLocaleString('ru-RU') + '</span></div>' +
          '<button class="btn btn-ghost btn-sm" data-remove-android="' + d.id + '">Удалить</button>' +
        '</div>'
      ).join('');
    }

    summaryEl.classList.remove('hidden');
    return row.user_id;
  } catch (err) {
    errEl.textContent = friendlyError(err?.message);
    return null;
  }
}

$('#dev-find-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#dev-find-email')?.value || '';
  await loadPlayersFor(q);
});

$('#dev-devices-list')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-remove-android]');
  if (!btn) return;
  const id = btn.getAttribute('data-remove-android');
  const { error } = await sb.rpc('remove_user_device', { target_device: id });
  if (error) return toast(friendlyError(error.message), true);
  toast('Устройство удалено.');
  await loadPlayersFor($('#dev-find-email')?.value || '');
});

$('#btn-cleanup-old-data')?.addEventListener('click', async () => {
  if (!state.isSuper) return toast('Только супер-администратор.', true);
  if (!(await uiConfirm({ title: 'Очистить архив', message: 'Удалить устаревшие устройства (>90 дней) и записи админ-лога (>180 дней)? Действие необратимо.', okLabel: 'Очистить', danger: true }))) return;
  try {
    const { data, error } = await sb.rpc('cleanup_old_data', { device_days: 90, audit_days: 180 });
    if (error) throw error;
    const devices = data?.devices_deleted ?? 0;
    const audits = data?.audit_deleted ?? 0;
    toast('Очищено: устройств ' + devices + ', записей лога ' + audits);
    logAdminAction('cleanup_old_data', { devices_deleted: devices, audit_deleted: audits });
  } catch (err) {
    toast('Ошибка: ' + friendlyError(err?.message), true);
  }
});

$('#btn-signout-all-admin')?.addEventListener('click', async () => {

  if (!state.isSuper) return toast('Только супер-администратор.', true);
  const target = window.__targetUserId;
  if (!target) return toast('Сначала найдите пользователя.', true);
  if (!(await uiConfirm({ title: 'Выкинуть из всех сессий', message: 'Пользователь будет немедленно выведен из ВСЕХ сессий.', okLabel: 'Выкинуть', danger: true }))) return;
  try {
    const { data, error } = await sb.functions.invoke('admin-signout', { body: { target_user_id: target } });
    if (error) throw error;
    toast('Все сессии завершены.');
    await loadPlayersFor($('#dev-find-email')?.value || '');
  } catch (err) {
    toast('Ошибка: ' + friendlyError(err?.message), true);
  }
});

$('#btn-clear-devices-admin')?.addEventListener('click', async () => {
  if (!state.isSuper) return toast('Только супер-администратор.', true);
  const target = window.__targetUserId;
  if (!target) return toast('Сначала найдите пользователя.', true);
  if (!(await uiConfirm({ title: 'Очистить устройства', message: 'Удалить ВСЕ записи об устройствах пользователя?', okLabel: 'Удалить', danger: true }))) return;
  try {
    const { data, error } = await sb.rpc('clear_user_devices', { target_user: target });
    if (error) {
      // fallback — удалил вручную
      const { data: devs } = await sb.rpc('list_user_devices', { target_user: target });
      for (const d of (devs || [])) {
        await sb.rpc('remove_user_device', { target_device: d.id });
      }
    }
    toast('Устройства очищены.');
    await loadPlayersFor($('#dev-find-email')?.value || '');
  } catch (err) {
    toast('Ошибка: ' + friendlyError(err?.message), true);
  }
});

$('#btn-delete-user-admin')?.addEventListener('click', async () => {
  if (!state.isSuper) return toast('Только супер-администратор.', true);
  const target = window.__targetUserId;
  const email = $('#dev-find-email')?.value || '';
  if (!target) return toast('Сначала найдите пользователя.', true);
  const typed = await uiPrompt({ title: 'Удалить аккаунт', label: 'Удалить аккаунт ' + email + '? Действие НЕОБРАТИМО. Введите email для подтверждения:', okLabel: 'Продолжить', danger: true, validate: (v) => (String(v).trim().toLowerCase() === String(email || '').trim().toLowerCase()) ? null : 'Email не совпадает' });
  if (typed === null) return;
  if (!(await uiConfirm({ title: 'Удалить аккаунт навсегда', message: 'Точно удалить ' + email + ' из базы? Все его данные будут удалены/обезличены.', okLabel: 'УДАЛИТЬ', danger: true }))) return;
  try {
    const { data, error } = await sb.functions.invoke('delete-account', { body: { targetUserId: target } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    toast('Аккаунт удалён.');
    logAdminAction('delete_user', { target, email });
    $('#dev-find-email').value = '';
    $('#dev-summary').classList.add('hidden');
  } catch (err) {
    toast('Ошибка: ' + friendlyError(err?.message || String(err)), true);
  }
});

$('#btn-ban-player')?.addEventListener('click', () => {

  const email = $('#dev-find-email')?.value || '';
  const target = window.__targetUserId;
  if (!target) return toast('Сначала найдите пользователя.', true);
  const card = $('#dev-ban-inline');
  if (card) { card.remove(); return; }
  const parent = summaryBlock();
  if (!parent) return;
  const div = document.createElement('div');
  div.id = 'dev-ban-inline';
  div.className = 'settings-card';
  div.style.cssText = 'margin-top:12px';
  div.innerHTML =
    '<div class="sp-title" style="margin-bottom:8px">Бан пользователя</div>' +
    '<div style="display:flex; gap:10px; flex-wrap:wrap">' +
      '<input type="text" id="dev-ban-reason" placeholder="Причина бана" maxlength="200" style="flex:1;min-width:220px" />' +
      '<select id="dev-ban-minutes" style="min-width:150px"><option value="1440">1 день</option><option value="10080">7 дней</option><option value="43200">30 дней</option><option value="525600">1 год</option><option value="99999999">Навсегда</option></select>' +
      '<button class="btn btn-danger" id="dev-ban-confirm" type="button">Забанить</button>' +
      '<button class="btn btn-ghost" id="dev-ban-cancel" type="button">Отмена</button>' +
    '</div>';
  parent.appendChild(div);
  $('#dev-ban-reason')?.focus();
  $('#dev-ban-cancel')?.addEventListener('click', () => div.remove());
  $('#dev-ban-confirm')?.addEventListener('click', async () => {
    const reason = $('#dev-ban-reason').value.trim() || 'manual';
    const minutes = Number($('#dev-ban-minutes').value) || 1440;
    const infinity = minutes > 525600 * 2;
    const until = infinity ? new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString() : new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const { error } = await sb.rpc('ban_user', { target, ban_until: until, reason });
    if (error) return toast(friendlyError(error.message), true);
    toast(infinity ? 'Пользователь забанен навсегда.' : 'Пользователь забанен до ' + new Date(until).toLocaleString('ru-RU') + '.');
    div.remove();
    await loadPlayersFor(email);
  });
});

function summaryBlock() {
  const summary = $('#dev-summary');
  return summary ? summary.querySelector('.settings-card') : null;
}

$('#btn-unban-player')?.addEventListener('click', () => {
  const target = window.__targetUserId;
  if (!target) return toast('Сначала найдите пользователя.', true);
  const parent = summaryBlock();
  if (!parent) return;
  const existing = $('#dev-unban-inline');
  if (existing) { existing.remove(); return; }
  const div = document.createElement('div');
  div.id = 'dev-unban-inline';
  div.className = 'settings-card';
  div.style.cssText = 'margin-top:10px; border-color: rgba(0,214,160,.45); background:rgba(0,214,160,.06);';
  div.innerHTML =
    '<div class="sp-title" style="margin-bottom:8px; color:#7de6b2">Разбан</div>' +
    '<div style="display:flex; gap:10px; flex-wrap:wrap">' +
      '<input type="text" id="dev-unban-reason" placeholder="Причина разбана" maxlength="200" style="flex:1;min-width:220px" />' +
      '<button class="btn btn-primary" id="dev-unban-confirm" type="button">Разбанить</button>' +
      '<button class="btn btn-ghost" id="dev-unban-cancel" type="button">Отмена</button>' +
    '</div>';
  parent.appendChild(div);
  $('#dev-unban-reason')?.focus();
  $('#dev-unban-cancel')?.addEventListener('click', () => div.remove());
  $('#dev-unban-confirm')?.addEventListener('click', async () => {
    const reason = ($('#dev-unban-reason')?.value || '').trim() || 'not_a_cheat';
    const { error } = await sb.rpc('ban_user', { target, ban_until: null, reason });
    if (error) return toast(friendlyError(error.message), true);
    toast('Бан снят.');
    div.remove();
    await loadPlayersFor($('#dev-find-email')?.value || '');
  });
});


// =====================================================
//  TAB АНАЛИТИКА
// =====================================================
let usersCache = [];
async function loadUsers() {
  const list = $('#users-list');
  if (!list) return;
  list.innerHTML = '<p class="page-sub">Загружаю…</p>';
  const { data, error } = await sb.rpc('list_all_users', { max_rows: 2000 });
  if (error) { list.innerHTML = '<p class="form-error">' + escapeHtml(friendlyError(error.message)) + '</p>'; return; }
  usersCache = data || [];
  syncUsersDatalist();
  renderUsers(usersCache, $('#users-search')?.value || '');
}
function renderUsers(rows, filter) {
  const list = $('#users-list');
  const empty = $('#users-empty');
  const q = String(filter || '').trim().toLowerCase();
  const shown = q ? rows.filter((r) => (r.email || '').toLowerCase().includes(q) || (r.nickname || '').toLowerCase().includes(q)) : rows;
  if (empty) empty.style.display = shown.length ? 'none' : 'block';
  list.innerHTML = shown.map((r) => {
    const created = r.created_at ? new Date(r.created_at).toLocaleDateString('ru-RU') : '';
    const ban = r.active_ban ? ' · <span class="user-ban">⛔ ' + escapeHtml(r.ban_reason || 'бан') + '</span>' : '';
    return '<div class="user-row"><b title="' + escapeHtml(r.email || '') + '">' + escapeHtml(r.email || '—') + '</b>' +
      '<span class="user-meta">' + escapeHtml(r.nickname || '—') + ' · ' + (r.devices ?? 0) + ' устр. · проектов: ' + (r.project_count ?? 0) + ban + ' · ' + escapeHtml(created) + '</span></div>';
  }).join('');
}
$('#users-search')?.addEventListener('input', (e) => renderUsers(usersCache, e.target.value));

async function loadAdmins() {
  const list = $('#admins-list');
  if (!list) return;
  const grantBtn = $('#btn-grant-admin');
  if (grantBtn && !grantBtn.dataset.bound) { grantBtn.dataset.bound = '1'; grantBtn.addEventListener('click', grantSuperByEmail); }
  const { data, error } = await sb.rpc('list_admins');
  if (error) { list.innerHTML = '<p class="form-error">' + escapeHtml(friendlyError(error.message)) + '</p>'; }
  else if (!data || !data.length) list.innerHTML = '<p class="page-sub">Никого не найдено.</p>';
  else {
    list.innerHTML = data.map((a) => {
      const email = a.email || '—';
      const nick = a.nickname || '';
      const projects = (a.project_names || []).filter(Boolean).join(', ') || '—';
      const badge = a.is_super ? '<span class="badge on">super</span>' : '<span class="badge off">проект</span>';
      const toggle = (state.isSuper && a.id !== state.user.id)
        ? '<button class="btn btn-ghost btn-sm admin-toggle-super">' + (a.is_super ? 'Снять super' : '⚡ Сделать super') + '</button>' : '';
      return '<div class="admin-row" data-id="' + a.id + '">' +
        '<div class="admin-avatar">' + escapeHtml(String(email).charAt(0).toUpperCase()) + '</div>' +
        '<div class="admin-meta"><b>' + escapeHtml(email) + '</b>' +
          (nick ? '<span class="page-sub">' + escapeHtml(nick) + '</span>' : '') +
          '<span class="page-sub">Проекты: ' + escapeHtml(projects) + '</span></div>' +
        badge + toggle +
      '</div>';
    }).join('');
    list.querySelectorAll('.admin-toggle-super').forEach((btn) => btn.addEventListener('click', async () => {
      const row = btn.closest('.admin-row');
      const uid = row.dataset.id;
      const make = btn.textContent.includes('Сделать');
      const { error } = await sb.rpc('set_super', { target: uid, make });
      if (error) return toast(friendlyError(error.message), true);
      toast(make ? 'Права super выданы.' : 'Права super сняты.');
      logAdminAction(make ? 'set_super_grant' : 'set_super_revoke', { target: uid });
      loadAdmins();
    }));
  }
  await renderProjectsCards();
}

async function grantSuperByEmail() {
  if (!state.isSuper) return toast('Только супер-администратор.', true);
  const email = await uiPrompt({ title: 'Выдать доступ', label: 'Email пользователя (он должен быть зарегистрирован в лаунчере):', placeholder: 'someone@example.com', okLabel: 'Выдать' });
  if (email === null) return;
  const trimmed = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return toast('Похоже, это не email.', true);
  const { data: found, error: findErr } = await sb.rpc('find_user_by_email', { email: trimmed });
  if (findErr) return toast(friendlyError(findErr.message), true);
  const row = Array.isArray(found) ? found[0] : found;
  if (!row || !row.user_id) return toast('Пользователь не найден.', true);
  const { error } = await sb.rpc('set_super', { target: row.user_id, make: true });
  if (error) return toast(friendlyError(error.message), true);
  toast('Доступ к админке выдан: ' + trimmed);
  logAdminAction('set_super_grant', { email: trimmed });
  loadAdmins();
}

async function renderProjectsCards() {
  const wrap = $('#projects-cards');
  if (!wrap) return;
  wrap.innerHTML = '<p class="page-sub">Загружаю проекты…</p>';

  const { data: projects, error: pErr } = await sb
    .from('projects')
    .select('id, name, slug, logo, approved, is_hidden, created_at')
    .order('id', { ascending: true });
  if (pErr) { wrap.innerHTML = '<p class="form-error">' + escapeHtml(friendlyError(pErr.message)) + '</p>'; return; }

  const ids = (projects || []).map((p) => p.id);
  const membersByProj = {};
  if (ids.length) {
    const { data: members, error: mErr } = await sb
      .from('project_members')
      .select('project_id, user_id, role, email')
      .in('project_id', ids);
    if (!mErr && Array.isArray(members)) {
      for (const m of members) (membersByProj[m.project_id] = membersByProj[m.project_id] || []).push(m);
    }
  }

  if (!projects || !projects.length) { wrap.innerHTML = '<p class="page-sub">Проектов пока нет.</p>'; return; }

  wrap.innerHTML = projects.map((p) => {
    const members = membersByProj[p.id] || [];
    const flags = (p.is_hidden ? '🚫 скрыт ' : '') + (p.approved === false ? '🛑 не одобрен' : '');
    const roleOf = (m) => (String(m.role).toLowerCase() === 'owner' ? 'owner' : 'editor');
    const membersHtml = members.length
      ? members.map((m) =>
          '<div class="member-row"><div class="member-avatar">' + escapeHtml(String(m.email || '?').charAt(0).toUpperCase()) + '</div>' +
          '<div class="member-meta"><b>' + escapeHtml(m.email || 'unknown') + '</b><span>' + escapeHtml(String(m.user_id).slice(0, 8)) + '…</span></div>' +
          '<span class="member-role ' + escapeHtml(roleOf(m)) + '">' + escapeHtml(roleOf(m)) + '</span>' +
          '</div>').join('')
      : '<p class="page-sub" style="margin:6px">Команды нет.</p>';
    const logoHtml = p.logo && /^https?:/i.test(p.logo)
      ? '<img src="' + escapeHtml(p.logo) + '" alt="" />'
      : '<span>' + escapeHtml(p.logo || '🎮') + '</span>';
    return '<details class="project-card" data-id="' + p.id + '">' +
      '<summary class="project-card-head">' +
        '<span class="project-card-logo">' + logoHtml + '</span>' +
        '<span class="project-card-meta"><b>' + escapeHtml(p.name) + '</b><span class="page-sub">#' + p.id + ' · ' + escapeHtml(p.slug) + ' · ' + members.length + ' чел. ' + escapeHtml(flags) + '</span></span>' +
        '<button type="button" class="icon-btn project-edit-btn" data-id="' + p.id + '" title="Редактировать проект">✏️</button>' +
        '<button type="button" class="icon-btn del project-delete-btn" data-id="' + p.id + '" title="Удалить проект навсегда">🗑️</button>' +
      '</summary>' +
      '<div class="project-card-body">' + membersHtml + '</div>' +
    '</details>';
  }).join('');

  wrap.querySelectorAll('.project-edit-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pid = Number(btn.dataset.id);
      try {
        const result = await window.adminEnv?.openProjectEditor?.(pid);
        if (result?.ok) toast('Окно редактирования открыто.');
        else toast('Не удалось открыть редактор.', true);
      } catch (err) {
        toast('Ошибка: ' + friendlyError(err?.message || String(err)), true);
      }
    });
  });

  wrap.querySelectorAll('.project-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pid = Number(btn.dataset.id);
      const target = projects.find((p) => p.id === pid);
      const name = target?.name || ('проект #' + pid);
      const typed = await uiPrompt({ title: 'Удалить проект', label: 'Удалить «' + name + '» навсегда вместе с новостями и настройками. Введите название проекта для подтверждения:', okLabel: 'УДАЛИТЬ', danger: true, validate: (v) => (v === name) ? null : 'Название не совпало — удаление отменено' });
      if (typed === null) return;
      const { error } = await sb.rpc('delete_project_admin', { pid });
      if (error) return toast(friendlyError(error.message), true);
      state.projects = state.projects.filter((p) => p.id !== pid);
      if (state.currentProjectId === pid) {
        state.currentProjectId = state.projects[0]?.id || 0;
        if (!state.currentProjectId) { renderProjectSelect(); showEmptyState(); return; }
        localStorage.setItem(CURRENT_PROJECT_KEY, String(state.currentProjectId));
        await reloadCurrentProject();
      }
      toast('Проект удалён.');
      logAdminAction('project_delete_from_admins', { pid, name });
      renderProjectSelect();
      renderProjectsCards();
    });
  });
}

let currentAnaData = null;
function syncUsersDatalist() {
  const dl = document.getElementById('users-datalist');
  if (!dl) return;
  const seen = new Set();
  const opts = [];
  for (const u of usersCache) {
    const email = u.email;
    if (!email || seen.has(email)) continue;
    seen.add(email);
    opts.push('<option value="' + escapeHtml(email) + '"></option>');
  }
  dl.innerHTML = opts.join('');
}

// =====================================================
//  ПРЕДУПРЕЖДЕНИЯ (warnings) — владелец/super
// =====================================================
async function loadWarningsList() {
  const list = $('#warnings-list');
  if (!list) return;
  const pid = state.currentProjectId;
  list.innerHTML = '<p class="page-sub">Загружаю…</p>';
  const { data, error } = await sb.rpc('list_project_warnings', { p_project_id: pid });
  if (error) { list.innerHTML = '<p class="form-error">' + escapeHtml(friendlyError(error.message)) + '</p>'; return; }
  const rows = data || [];
  if (!rows.length) { list.innerHTML = '<p class="page-sub">Предупреждений нет.</p>'; return; }
  list.innerHTML = rows.map((w) => {
    const until = w.warned_until ? new Date(w.warned_until) : null;
    const expired = until && until < new Date();
    const revoked = !!w.revoked_at;
    const badge = revoked ? '<span class="badge off">отозвано</span>' : (expired ? '<span class="badge off">истекло</span>' : '<span class="badge on">активно</span>');
    const email = w.user_email || String(w.user_id).slice(0, 8);
    return '<div class="member-row" data-id="' + w.id + '">' +
      '<div class="member-avatar">' + escapeHtml(String(email).charAt(0).toUpperCase()) + '</div>' +
      '<div class="member-meta"><b>' + escapeHtml(email) + '</b><span>' + escapeHtml(w.reason || '—') + '</span><span>до ' + (until ? until.toLocaleDateString('ru-RU') : '—') + '</span></div>' +
      badge +
      (revoked ? '' : '<button class="icon-btn warn-revoke-btn" title="Отозвать предупреждение">✅</button>') +
    '</div>';
  }).join('');
  list.querySelectorAll('.warn-revoke-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.member-row');
      const id = Number(row.dataset.id);
      if (!(await uiConfirm({ title: 'Отозвать предупреждение', message: 'Игрок снова сможет нормально играть.', okLabel: 'Отозвать' }))) return;
      const { error } = await sb.rpc('revoke_warning', { p_id: id });
      if (error) return toast(friendlyError(error.message), true);
      toast('Предупреждение отозвано.');
      loadWarningsList();
    });
  });
}

$('#warn-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btn-warn');
  const email = ($('#warn-email')?.value || '').trim().toLowerCase();
  const reason = ($('#warn-reason')?.value || '').trim();
  const days = Number($('#warn-days')?.value || 3);
  const errEl = $('#warn-error');
  if (errEl) errEl.textContent = '';
  if (!email || !reason) { if (errEl) errEl.textContent = 'Email и причина обязательны.'; return; }
  if (btn) btn.disabled = true;
  try {
    const { error } = await sb.rpc('warn_user', { p_user_email: email, p_project_id: state.currentProjectId, p_reason: reason, p_days: days });
    if (error) throw error;
    toast('Предупреждение отправлено.');
    logAdminAction('warning_create', { email, reason, days, project_id: state.currentProjectId });
    $('#warn-email').value = '';
    $('#warn-reason').value = '';
    await loadWarningsList();
  } catch (err) {
    if (errEl) errEl.textContent = friendlyError(err?.message || String(err));
  } finally {
    if (btn) btn.disabled = false;
  }
});

// =====================================================
//  АДМИН-ЛОГ (audit) — только super
// =====================================================
let auditCache = [];
function auditEmailOf(id) {
  const u = (usersCache || []).find((x) => x.user_id === id || x.id === id);
  return u?.email || String(id || '').slice(0, 8);
}
function auditDetailShort(r) {
  const parts = [];
  parts.push(r.table_name || 'table');
  if (r.record_id) parts.push('#' + r.record_id);
  if (r.project_id) parts.push('проект ' + r.project_id);
  const d = r.details || {};
  const keys = Object.keys(d);
  if (keys.length) {
    const kv = keys.slice(0, 3).map((k) => k + '=' + String(d[k]).slice(0, 40)).join(', ');
    parts.push(kv);
  }
  return parts.join(' · ');
}
function renderAuditLog() {
  const list = $('#audit-list');
  if (!list) return;
  const q = ($('#audit-search')?.value || '').trim().toLowerCase();
  const rows = auditCache.filter((r) => {
    if (!q) return true;
    const hay = [r.action, r.table_name, r.record_id, r.project_id, auditEmailOf(r.actor_id), JSON.stringify(r.details || {})].join(' ').toLowerCase();
    return hay.includes(q);
  });
  const empty = $('#audit-empty');
  if (empty) empty.style.display = rows.length ? 'none' : 'block';
  list.innerHTML = rows.map((r) =>
    '<div class="audit-row">' +
      '<span class="audit-time">' + escapeHtml(new Date(r.created_at).toLocaleString('ru-RU')) + '</span>' +
      '<span class="audit-action" title="' + escapeHtml(r.action) + '">' + escapeHtml(r.action) + '</span>' +
      '<span class="audit-detail" title="' + escapeHtml(JSON.stringify(r.details || {})) + '">' + escapeHtml(auditDetailShort(r)) + '</span>' +
      '<span class="audit-actor">' + escapeHtml(auditEmailOf(r.actor_id)) + '</span>' +
    '</div>'
  ).join('');
}
async function loadAuditLog() {
  const list = $('#audit-list');
  if (!list) return;
  if (!state.isSuper) { list.innerHTML = '<p class="form-error">Только супер-администратор.</p>'; return; }
  list.innerHTML = '<p class="page-sub">Загружаю…</p>';
  if (!usersCache || !usersCache.length) { try { await loadUsers(); } catch {} }
  const { data, error } = await sb.from('admin_audit_log')
    .select('id, actor_id, action, table_name, record_id, project_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) { list.innerHTML = '<p class="form-error">' + escapeHtml(friendlyError(error.message)) + '</p>'; return; }
  auditCache = data || [];
  renderAuditLog();
}
$('#audit-refresh')?.addEventListener('click', loadAuditLog);
$('#audit-search')?.addEventListener('input', () => { clearTimeout(window.__auditSearchTimer); window.__auditSearchTimer = setTimeout(renderAuditLog, 250); });

// =====================================================
//  ОФИЦИАЛЬНЫЕ ПОСТЕРЫ (featured slides) — супер-админ
// =====================================================
async function loadFeaturedAdmin() {
  const list = $('#featured-list');
  if (!list) return;
  list.innerHTML = '<p class="page-sub">Загружаю…</p>';
  const { data, error } = await sb.rpc('list_featured_admin');
  if (error) { list.innerHTML = '<p class="form-error">' + escapeHtml(friendlyError(error.message)) + '</p>'; return; }
  if (!data || !data.length) { list.innerHTML = '<p class="page-sub">Официальных постеров нет. Добавьте первый.</p>'; return; }
  list.innerHTML = data.map((f) => {
    const expired = f.expires_at && new Date(f.expires_at) < new Date();
    const status = expired ? 'истёк' : (f.published ? 'виден' : 'скрыт');
    const statusClass = expired || !f.published ? 'off' : 'on';
    const sort = f.sort ?? 0;
    return '<div class="home-news-admin-row" data-id="' + f.id + '">' +
      '<div class="home-news-admin-meta"><b>' + escapeHtml(f.title) + '</b>' +
        '<span class="page-sub">sort ' + sort + ' · ' + (f.cta_label || 'Смотреть') + ' → ' + escapeHtml(f.cta_url || '—') + '</span></div>' +
      '<div style="display:flex; gap:6px; align-items:center">' +
        '<span class="badge ' + statusClass + '">' + status + '</span>' +
        '<button type="button" class="icon-btn featured-edit-btn" title="✏️ Редактировать">✏️</button>' +
        '<button type="button" class="icon-btn featured-toggle-btn" title="Виден/скрыт">👁️</button>' +
        '<button type="button" class="icon-btn del featured-delete-btn" title="Удалить">🗑️</button>' +
      '</div>' +
    '</div>';
  }).join('');
  list.querySelectorAll('.home-news-admin-row').forEach((row) => {
    const id = Number(row.dataset.id);
    const f = (data || []).find((x) => x.id === id);
    row.querySelector('.featured-edit-btn')?.addEventListener('click', () => openFeaturedForm(f));
    row.querySelector('.featured-toggle-btn')?.addEventListener('click', async () => {
      if (!f) return;
      const { error } = await sb.rpc('upsert_featured', {
        p_id: f.id, p_title: f.title, p_tagline: f.tagline,
        p_image_url: f.image_url, p_cta_label: f.cta_label, p_cta_url: f.cta_url,
        p_sort: f.sort, p_published: !f.published, p_expires_at: f.expires_at,
      });
      if (error) return toast(friendlyError(error.message), true);
      toast(f.published ? 'Скрыт.' : 'Опубликован.');
      loadFeaturedAdmin();
  if (typeof loadBrandNewsAdmin === 'function') loadBrandNewsAdmin();
    });
    row.querySelector('.featured-delete-btn')?.addEventListener('click', async () => {
      if (!(await uiConfirm({ title: 'Удалить постер', message: 'Удалить постер «' + (f?.title || ('#' + id)) + '»?', okLabel: 'Удалить', danger: true }))) return;
      const { error } = await sb.rpc('delete_featured', { p_id: id });
      if (error) return toast(friendlyError(error.message), true);
      toast('Постер удалён.');
      loadFeaturedAdmin();
    });
  });
}

function openFeaturedForm(f) {
  const form = $('#featured-form');
  if (!form) return;
  $('#sf-featured-id').value = f?.id || '';
  $('#sf-featured-title').value = f?.title || '';
  $('#sf-featured-tagline').value = f?.tagline || '';
  $('#sf-featured-image').value = f?.image_url || '';
  $('#sf-featured-cta-label').value = f?.cta_label || 'Смотреть';
  $('#sf-featured-cta-url').value = f?.cta_url || '';
  $('#sf-featured-sort').value = String(f?.sort ?? 10);
  $('#sf-featured-published').checked = f ? !!f.published : true;
  $('#sf-featured-expires').value = f?.expires_at
    ? new Date(new Date(f.expires_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : '';
  $('#featured-form-title').textContent = f ? 'Редактировать постер' : 'Новый постер';
  form.classList.remove('hidden');
}

function closeFeaturedForm() {
  $('#featured-form')?.classList.add('hidden');
}

async function saveFeatured() {
  const id = $('#sf-featured-id').value ? Number($('#sf-featured-id').value) : null;
  const title = $('#sf-featured-title').value.trim();
  if (!title) return toast('Заголовок обязателен.', true);
  const image = $('#sf-featured-image').value.trim();
  if (!/^https?:\/\//i.test(image)) return toast('Картинка должна начинаться с http(s)://', true);
  const expiresRaw = $('#sf-featured-expires').value;
  const expiresISO = expiresRaw ? new Date(expiresRaw).toISOString() : null;
  const payload = {
    p_id: id, p_title: title,
    p_tagline: $('#sf-featured-tagline').value.trim(),
    p_image_url: image,
    p_cta_label: $('#sf-featured-cta-label').value.trim() || 'Смотреть',
    p_cta_url: $('#sf-featured-cta-url').value.trim(),
    p_sort: Number($('#sf-featured-sort').value) || 10,
    p_published: $('#sf-featured-published').checked,
    p_expires_at: expiresISO,
  };
  const { error } = await sb.rpc('upsert_featured', payload);
  if (error) return toast(friendlyError(error.message), true);
  toast(id ? 'Постер обновлён.' : 'Постер добавлен.');
  closeFeaturedForm();
  loadFeaturedAdmin();
}

$('#btn-add-featured')?.addEventListener('click', () => openFeaturedForm(null));
$('#btn-save-featured')?.addEventListener('click', saveFeatured);
$('#btn-cancel-featured')?.addEventListener('click', closeFeaturedForm);

// =====================================================
//  НОВОСТИ SAMOT — бренд / события (только super)
// =====================================================
async function loadBrandNewsAdmin() {
  const list = $('#brand-news-list');
  if (!list) return;
  if (!state.isSuper) { list.innerHTML = '<p class="page-sub">Только супер-администратор.</p>'; return; }
  list.innerHTML = '<p class="page-sub">Загружаю…</p>';
  const { data, error } = await sb.from('news').select('*').in('kind', ['samot', 'event']).order('published_at', { ascending: false });
  if (error) { list.innerHTML = '<p class="form-error">' + escapeHtml(friendlyError(error.message)) + '</p>'; return; }
  const rows = data || [];
  if (!rows.length) { list.innerHTML = '<p class="page-sub">Новостей SAMOT пока нет. Создайте первую.</p>'; return; }
  list.innerHTML = rows.map((n) => {
    const kindLabel = n.kind === 'event' ? 'Событие' : 'SAMOT';
    const statusBadge = n.active ? '<span class="badge on">видна</span>' : '<span class="badge off">скрыта</span>';
    const carouselBadge = n.carousel ? '<span class="badge on">📺 карусель</span>' : '';
    const homeBadge = n.home ? '<span class="badge on">⭐ последние</span>' : '';
    return '<div class="home-news-admin-row" data-id="' + n.id + '">' +
      '<div class="home-news-admin-meta"><b>' + escapeHtml(n.title) + '</b>' +
        '<span class="page-sub">' + kindLabel + ' · ' + new Date(n.published_at).toLocaleDateString('ru-RU') + '</span></div>' +
      '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap">' +
        statusBadge + homeBadge + carouselBadge +
        '<button type="button" class="icon-btn brand-edit-btn" title="✏️ Редактировать">✏️</button>' +
        '<button type="button" class="icon-btn brand-toggle-btn" title="Видна/скрыта">👁️</button>' +
        '<button type="button" class="icon-btn brand-del-btn" title="Удалить">🗑️</button>' +
      '</div>' +
    '</div>';
  }).join('');

  list.querySelectorAll('.home-news-admin-row').forEach((row) => {
    const id = Number(row.dataset.id);
    const n = rows.find((x) => x.id === id);
    row.querySelector('.brand-edit-btn')?.addEventListener('click', () => openBrandForm(n));
    row.querySelector('.brand-toggle-btn')?.addEventListener('click', async () => {
      if (!n) return;
      const { error } = await sb.from('news').update({ active: !n.active }).eq('id', id);
      if (error) return toast(friendlyError(error.message), true);
      toast(n.active ? 'Скрыта.' : 'Опубликована.');
      loadBrandNewsAdmin();
    });
    row.querySelector('.brand-del-btn')?.addEventListener('click', async () => {
      if (!(await uiConfirm({ title: 'Удалить новость SAMOT', message: 'Удалить «' + (n?.title || '') + '» навсегда?', okLabel: 'Удалить', danger: true }))) return;
      const { error } = await sb.from('news').delete().eq('id', id);
      if (error) return toast(friendlyError(error.message), true);
      toast('Новость удалена.');
      logAdminAction('brand_news_delete', { id });
      loadBrandNewsAdmin();
      loadHomeAdmin();
    });
  });
}

function openBrandForm(n) {
  const form = $('#brand-news-form');
  if (!form) return;
  $('#brand-news-form-title').textContent = n ? 'Редактировать новость SAMOT' : 'Новая новость SAMOT';
  $('#bn-id').value = n?.id || '';
  $('#bn-title').value = n?.title || '';
  $('#bn-kind').value = n?.kind || 'samot';
  $('#bn-excerpt').value = n?.excerpt || '';
  $('#bn-body').value = n?.body || '';
  $('#bn-image').value = n?.image_url || '';
  $('#bn-cta-url').value = n?.cta_url || '';
  $('#bn-published').value = n?.published_at ? toLocalInputValue(n.published_at) : '';
  $('#bn-carousel').checked = !!n?.carousel;
  $('#bn-home').checked = n ? !!n.home : true;
  $('#bn-active').checked = n ? !!n.active : true;
  form.classList.remove('hidden');
}

function closeBrandForm() {
  $('#brand-news-form')?.classList.add('hidden');
}

async function saveBrandNews() {
  if (!state.isSuper) return toast('Только супер-администратор.', true);
  const id = $('#bn-id').value ? Number($('#bn-id').value) : null;
  const title = $('#bn-title').value.trim();
  if (!title) return toast('Заголовок обязателен.', true);
  const image = $('#bn-image').value.trim();
  if (image && !/^https?:\/\//i.test(image)) return toast('Картинка — ссылка, начинающаяся с http(s)://', true);
  const cta = $('#bn-cta-url').value.trim();
  if (cta && !/^https?:\/\//i.test(cta)) return toast('Ссылка кнопки должна начинаться с http(s)://', true);
  const publishedRaw = $('#bn-published').value;
  const publishedISO = publishedRaw ? new Date(publishedRaw).toISOString() : new Date().toISOString();
  const payload = {
    project_id: null,
    kind: $('#bn-kind').value,
    title,
    tag: $('#bn-kind').value === 'event' ? 'Событие' : 'SAMOT',
    excerpt: $('#bn-excerpt').value.trim(),
    body: $('#bn-body').value.trim(),
    image_url: image,
    cta_url: cta,
    carousel: $('#bn-carousel').checked,
    home: $('#bn-home').checked,
    active: $('#bn-active').checked,
    published_at: publishedISO,
  };
  if (id) {
    const { error } = await sb.from('news').update(payload).eq('id', id);
    if (error) return toast(friendlyError(error.message), true);
    logAdminAction('brand_news_update', { id, title });
  } else {
    const { data, error } = await sb.from('news').insert(payload).select('id').single();
    if (error) return toast(friendlyError(error.message), true);
    logAdminAction('brand_news_create', { id: data?.id, title });
  }
  toast(id ? 'Новость обновлена.' : 'Новость опубликована.');
  closeBrandForm();
  loadBrandNewsAdmin();
  loadHomeAdmin();
}

$('#btn-add-brand-news')?.addEventListener('click', () => openBrandForm(null));
$('#bn-save')?.addEventListener('click', saveBrandNews);
$('#bn-cancel')?.addEventListener('click', closeBrandForm);

async function loadAnalytics() {
  const el = $('#tab-analytics');
  if (!el) return;
  const days = Number($('#ana-period')?.value || 30);
  const set = (id, v) => { const e = $('#' + id); if (e) e.textContent = String(v); };
  if (DEMO_ADMIN) {
    currentAnaData = { period_days: days, new_users: 154, active_devices: 988, launches: 4021, new_bans: 1, news_published: 5, total_users: 1284, total_devices: 1592, total_bans: 1, active_bans: 1, projects: 2, projects_approved: 2, news_total: 12 };
    set('ana-total-users', currentAnaData.total_users);
    set('ana-total-devices', currentAnaData.total_devices);
    set('ana-active', currentAnaData.active_devices);
    set('ana-launches', currentAnaData.launches);
    set('ana-new', currentAnaData.new_users);
    set('ana-news-period', currentAnaData.news_published);
    set('ana-bans-total', currentAnaData.total_bans);
    set('ana-bans-active', currentAnaData.active_bans);
    set('ana-new-bans', currentAnaData.new_bans);
    set('ana-projects', currentAnaData.projects_approved);
    renderAnaBars([]);
    return;
  }
  try {
    const { data, error } = await sb.rpc('analytics_overview_range', { period_days: days });
    if (error) throw error;
    const d = data || {};
    currentAnaData = d;
    set('ana-total-users', d.total_users ?? '—');
    set('ana-total-devices', d.total_devices ?? '—');
    set('ana-active', d.active_devices ?? '—');
    set('ana-launches', d.launches ?? '—');
    set('ana-new', d.new_users ?? '—');
    set('ana-news-period', d.news_published ?? '—');
    set('ana-bans-total', d.total_bans ?? '—');
    set('ana-bans-active', d.active_bans ?? '—');
    set('ana-new-bans', d.new_bans ?? '—');
    set('ana-projects', d.projects_approved ?? d.projects ?? '—');
    const { data: rows, error: e2 } = await sb.rpc('analytics_launch_log');
    if (!e2) renderAnaBars(rows || []);
  } catch (err) {
    toast('Не удалось загрузить аналитику: ' + friendlyError(err?.message), true);
  }
}
$('#ana-period')?.addEventListener('change', loadAnalytics);
$('#btn-ana-csv')?.addEventListener('click', () => {
  const d = currentAnaData || {};
  const rows = [
    ['period_days', d.period_days ?? ''], ['new_users', d.new_users ?? ''], ['active_devices', d.active_devices ?? ''],
    ['launches', d.launches ?? ''], ['new_bans', d.new_bans ?? ''], ['news_published', d.news_published ?? ''],
    ['total_users', d.total_users ?? ''], ['total_devices', d.total_devices ?? ''], ['total_bans', d.total_bans ?? ''],
    ['active_bans', d.active_bans ?? ''], ['projects', d.projects ?? ''], ['projects_approved', d.projects_approved ?? ''], ['news_total', d.news_total ?? ''],
  ];
  const csv = ['metric;value', ...rows.map(([k, v]) => k + ';' + String(v))].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'samot-analytics-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV скачан.');
});

function renderAnaBars(rows) {
  const barsEl = $('#ana-bars');
  const labelsEl = $('#ana-bars-labels');
  if (!barsEl || !labelsEl) return;
  const max = Math.max(1, ...(rows || []).map((r) => Number(r.devices || 0)));
  barsEl.innerHTML = (rows || []).map((r) => {
    const v = Number(r.devices || 0);
    const h = Math.round((v / max) * 100);
    return '<div class="ana-bar-wrap" title="' + escapeHtml(String(r.day)) + ': ' + v + '">' +
      '<div class="ana-bar" style="height:' + Math.max(h, 2) + '%"></div>' +
      '<span class="ana-bar-count">' + (v || '') + '</span>' +
    '</div>';
  }).join('');
  labelsEl.innerHTML = (rows || []).map((r) => '<span>' + (new Date(r.day)).toLocaleDateString('ru', { day: '2-digit', month: '2-digit' }) + '</span>').join('');
}

// =====================================================
//  TAB ИГРА (GitHub Releases)
// =====================================================
function manifestUrl(owner, repo, tag) {
  return 'https://github.com/' + owner + '/' + repo + '/releases/download/' + tag + '/manifest.json';
}

async function loadGameForm(pid) {
  if (!pid) return;
  if (DEMO_ADMIN) {
    if ($('#sf-game-enabled')) $('#sf-game-enabled').value = 'true';
    if ($('#sf-game-owner')) $('#sf-game-owner').value = 'example-owner';
    if ($('#sf-game-repo')) $('#sf-game-repo').value = 'example-repo';
    if ($('#sf-game-tag')) $('#sf-game-tag').value = 'v1.0.0';
    updateManifestUrlPreview();
    renderGameStatus({ ok: true, note: 'Демо-режим', version: '1.0.0', files: 3, totalBytes: 131072 });
    return;
  }
  const { data, error } = await sb.from('settings').select('key,value').eq('project_id', pid);
  if (error) { toast(friendlyError(error.message), true); return; }
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  $('#sf-game-enabled').value = map.game_enabled || 'false';
  $('#sf-game-owner').value = map.game_owner || '';
  $('#sf-game-repo').value = map.game_repo || '';
  $('#sf-game-tag').value = map.game_tag || '';
  $('#sf-game-manifest').value = map.game_manifest || '';
  updateManifestUrlPreview();
  renderGameStatus({ ok: true, note: 'Манифест из настроек (' + (map.game_manifest ? 'есть' : 'нет') + ')' });
}

function updateManifestUrlPreview() {
  const owner = ($('#sf-game-owner')?.value || '').trim() || 'Owner';
  const repo = ($('#sf-game-repo')?.value || '').trim() || 'Repo';
  const tag = ($('#sf-game-tag')?.value || '').trim() || 'TAG';
  const previewEl = $('#sf-game-manifest-url');
  if (previewEl) previewEl.value = manifestUrl(owner, repo, tag);
}

async function isReleaseAlive(owner, repo, tag) {
  try {
    const res = await fetch(manifestUrl(owner, repo, tag), { method: 'GET', cache: 'no-store' });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const json = await res.json();
    if (!json || !Array.isArray(json.files)) return { ok: false, error: 'Манифест без files[]' };
    const totalBytes = json.files.reduce((a, f) => a + Number(f.size || 0), 0);
    return { ok: true, files: json.files.length, version: json.version || '—', totalBytes };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function renderGameStatus(info) {
  const el = $('#game-status');
  if (!el) return;
  if (!info.ok) { el.innerHTML = '<span style="color:#ffadc0">❌ ' + escapeHtml(info.error || 'ошибка') + '</span>'; return; }
  const sizeStr = info.totalBytes != null ? ', ' + (info.totalBytes / 1048576).toFixed(1) + ' MB' : '';
  el.innerHTML = '<span style="color:#7de6b2">✓ ' +
    escapeHtml(info.note || 'Готово') +
    (info.version ? ' · v' + escapeHtml(String(info.version)) : '') +
    (info.files != null ? ' · ' + info.files + ' файлов' + sizeStr : '') +
    '</span>';
}

$$('#sf-game-owner, #sf-game-repo, #sf-game-tag').forEach((el) => el.addEventListener('input', updateManifestUrlPreview));
$('#btn-game-save')?.addEventListener('click', async () => {
  if (DEMO_ADMIN) { demoNotice(); return; }
  const pid = state.currentProjectId;
  if (!pid) return toast('Нет проекта.', true);
  const rows = [
    { project_id: pid, key: 'game_enabled', value: $('#sf-game-enabled').value },
    { project_id: pid, key: 'game_owner', value: $('#sf-game-owner').value.trim() },
    { project_id: pid, key: 'game_repo', value: $('#sf-game-repo').value.trim() },
    { project_id: pid, key: 'game_tag', value: $('#sf-game-tag').value.trim() },
    { project_id: pid, key: 'game_manifest', value: $('#sf-game-manifest').value },
  ];
  const { error } = await sb.from('settings').upsert(rows, { onConflict: 'project_id,key' });
  if (error) return toast(friendlyError(error.message), true);
  toast('Параметры игры сохранены.');
});
$('#btn-game-validate')?.addEventListener('click', async () => {
  const owner = ($('#sf-game-owner')?.value || '').trim();
  const repo = ($('#sf-game-repo')?.value || '').trim();
  const tag = ($('#sf-game-tag')?.value || '').trim();
  if (!owner || !repo || !tag) return toast('Заполните owner/repo/tag.', true);
  renderGameStatus({ ok: true, note: 'Проверяю…' });
  const alive = await isReleaseAlive(owner, repo, tag);
  renderGameStatus(alive);
  if (alive.ok) toast('Релиз доступен. Файлов: ' + alive.files);
  else toast('Релиз не найден: ' + (alive.error || ''), true);
});

// =====================================================
//  UPDATES & BUG REPORTS
// =====================================================
const UPDATE_TOOLS = ['launcher', 'admin'];

async function loadUpdatesForm() {
  if (DEMO_ADMIN) {
    if ($('#upd-launcher-version')) $('#upd-launcher-version').value = '0.9.5';
    if ($('#upd-launcher-url')) $('#upd-launcher-url').value = 'https://github.com/example/releases/download/v0.9.5/GameSetup.exe';
    if ($('#upd-launcher-sha256')) $('#upd-launcher-sha256').value = '';
    if ($('#upd-admin-version')) $('#upd-admin-version').value = '0.9.5';
    if ($('#upd-admin-url')) $('#upd-admin-url').value = 'https://github.com/example/releases/download/v0.9.5/AdminPanel.exe';
    if ($('#upd-admin-sha256')) $('#upd-admin-sha256').value = '';
    return;
  }
  const { data, error } = await sb.from('app_updates').select('tool, latest_version, download_url, sha256');
  if (error) return toast('Cannot read app_updates: ' + friendlyError(error.message), true);
  const map = Object.fromEntries((data || []).map((r) => [r.tool, r]));
  if ($('#upd-launcher-version')) $('#upd-launcher-version').value = map.launcher?.latest_version || '';
  if ($('#upd-launcher-url')) $('#upd-launcher-url').value = map.launcher?.download_url || '';
  if ($('#upd-launcher-sha256')) $('#upd-launcher-sha256').value = map.launcher?.sha256 || '';
  if ($('#upd-admin-version')) $('#upd-admin-version').value = map.admin?.latest_version || '';
  if ($('#upd-admin-url')) $('#upd-admin-url').value = map.admin?.download_url || '';
  if ($('#upd-admin-sha256')) $('#upd-admin-sha256').value = map.admin?.sha256 || '';
}

$('#btn-updates-save')?.addEventListener('click', async () => {
  if (DEMO_ADMIN) { demoNotice(); return; }
  const sha = (id) => ($(id)?.value || '').trim().toLowerCase();
  if (sha('#upd-launcher-sha256') && !/^[0-9a-f]{64}$/.test(sha('#upd-launcher-sha256'))) return toast('SHA-256 клиента должен быть 64 hex-символа.', true);
  if (sha('#upd-admin-sha256') && !/^[0-9a-f]{64}$/.test(sha('#upd-admin-sha256'))) return toast('SHA-256 админки должен быть 64 hex-символа.', true);
  const rows = [
    { tool: 'launcher', latest_version: $('#upd-launcher-version').value.trim(), download_url: $('#upd-launcher-url').value.trim(), sha256: sha('#upd-launcher-sha256'), updated_at: new Date().toISOString() },
    { tool: 'admin',    latest_version: $('#upd-admin-version').value.trim(),    download_url: $('#upd-admin-url').value.trim(),    sha256: sha('#upd-admin-sha256'),    updated_at: new Date().toISOString() },
  ];
  const { error } = await sb.from('app_updates').upsert(rows, { onConflict: 'tool' });
  if (error) return toast('Cannot save: ' + friendlyError(error.message), true);
  toast('Версии сохранены.');
});

$('#btn-updates-check')?.addEventListener('click', async () => {
  await loadUpdatesForm();
  toast('Обновлено.');
});

$('#btn-bug-send')?.addEventListener('click', async () => {
  const btn = $('#btn-bug-send');
  const message = $('#bug-message').value.trim();
  const contact = $('#bug-contact').value.trim();
  if (!message) return toast('Напишите что-нибудь в сообщение.', true);
  btn.disabled = true;
  btn.textContent = 'Отправляем…';
  const image = await readImageForReport();

  const systemInfo = [
    'userAgent: ' + navigator.userAgent,
    'platform: ' + navigator.platform,
    'language: ' + navigator.language,
    'URL: ' + window.location.href,
  ].join(' | ');

  try {
    const { data, error } = await sb.functions.invoke('send_report', {
      body: {
        tool: 'admin',
        kind: 'bug',
        subject: 'Баг Админ Панели',
        message,
        contact,
        userEmail: state.user?.email || null,
        systemInfo,
        logs: ADMIN_LOG_BUFFER.slice(-40).join('\n'),
        image,
        extra: {
          project: (typeof CURRENT_PROJECT_KEY !== 'undefined' ? localStorage.getItem(CURRENT_PROJECT_KEY) : '') || '',
        },
      },
    });
    if (error) {
      // Friendly instructions if function not deployed yet
      toast('send_report не развёрнута. Разверните Edge Function — см. BUG-REPORTING.md или сводку в презентации — инструкция в README.', true);
      return;
    }
    toast('Баг-репорт отправлен на почту.');
    $('#bug-message').value = '';
    $('#bug-contact').value = '';
  } catch (err) {
    toast('Ошибка отправки: ' + friendlyError(err?.message), true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Отправить сейчас';
  }
});

$('.side-link[data-tab="tab-updates"]')?.addEventListener('click', loadUpdatesForm);

function ensureConsentThen() {
  const CONSENT_KEY = 'samot_admin_consent_v2';
  let granted = false;
  try { granted = localStorage.getItem(CONSENT_KEY) === '1'; } catch { granted = true; }
  if (granted) return Promise.resolve(true);
  return new Promise((resolve) => {
    const modal = $('#consent-modal');
    if (!modal) return resolve(true);
    const rulesEl = $('#consent-agree-rules');
    const dataEl = $('#consent-agree-data');
    const serviceEl = $('#consent-agree-service');
    const acceptBtn = $('#consent-accept');
    const declineBtn = $('#consent-decline');
    const sync = () => { if (acceptBtn) acceptBtn.disabled = !(rulesEl?.checked && dataEl?.checked && serviceEl?.checked); };
    if (rulesEl) rulesEl.onchange = sync;
    if (dataEl) dataEl.onchange = sync;
    if (serviceEl) serviceEl.onchange = sync;
    if (acceptBtn) acceptBtn.onclick = () => {
      try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* ignore */ }
      modal.classList.add('hidden');
      resolve(true);
    };
    if (declineBtn) declineBtn.onclick = async () => {
      modal.classList.add('hidden');
      try { await sb.auth.signOut(); } catch { /* ignore */ }
      $('#admin-auth').classList.remove('hidden');
      $('#admin-panel')?.classList.add('hidden');
      resolve(false);
    };
    $('#admin-auth').classList.add('hidden');
    $('#admin-denied').classList.add('hidden');
    modal.classList.remove('hidden');
    sync();
  });
}

// =====================================================
//  СТАРТ
// =====================================================
(async function init() {
  // Показываем версию в шапке сайдбара (как в лаунчере)
  try {
    const v = window.adminEnv?.getAppVersion ? await window.adminEnv.getAppVersion() : null;
    if (v) $('#admin-tb-version').textContent = 'v' + v;
  } catch { /* версия необязательна */ }
  // Наполняем тексты документов (модал согласия + вкладка «Документы»)
  window.SAMOT_DOCS_ADMIN = true;
  try { window.SAMOT_DOCS_FILL && window.SAMOT_DOCS_FILL(); } catch (e) { console.warn('docs fill failed', e); }
  // если вернулись с Google OAuth — доигрываем PKCE
  const url = new URL(window.location.href);
  if (url.searchParams.get('code')) {
    const code = url.searchParams.get('code');
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    try { window.history.replaceState({}, '', url.pathname + (url.search || '')); } catch { /* ignore */ }
    await sb.auth.exchangeCodeForSession(code);
  }

  if (DEMO_ADMIN) {
    if (!(await ensureConsentThen())) return;
    await enterPanel({ email: 'owner@example.com' }, true);
    return;
  }

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const sup = await getSuperAdminRow(session.user.id);
    const { data: mem } = await getMyMemberships(session.user.id);
    if (!sup && !(mem && mem.length)) {
      $('#admin-auth').classList.add('hidden');
      $('#admin-denied').classList.remove('hidden');
      await sb.auth.signOut();
      return;
    }
    if (!(await ensureConsentThen())) return;
    await enterPanel(session.user);
  } catch {
    /* остаёмся на экране входа */
  }
})();


// =====================================================
//  Вставка картинки в тело новости
// =====================================================
function insertSnippetIntoBody(snippet) {
  const bodyEl = $('#nf-body');
  if (!bodyEl) return;
  const start = bodyEl.selectionStart ?? bodyEl.value.length;
  const val = bodyEl.value || '';
  const before = val.substring(0, start);
  const after = val.substring(start);
  bodyEl.value = before + '\n' + snippet + '\n' + after;
  bodyEl.focus();
  const caret = start + snippet.length + 2;
  bodyEl.selectionStart = bodyEl.selectionEnd = caret;
}

$('#btn-insert-img')?.addEventListener('click', async () => {
  const url = await uiPrompt({ title: 'Вставить картинку', label: 'Ссылка на картинку (https://…jpg/png/webp):', placeholder: 'https://…', okLabel: 'Вставить' });
  if (!url) return;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) { toast('Ссылка должна начинаться с http(s)://', true); return; }
  const caption = (await uiPrompt({ title: 'Подпись', label: 'Подпись (необязательно):', okLabel: 'Готово' })) || '';
  const snippet = '![' + String(caption).replace(/]/g, '').replace(/|/g, '/') + '](' + trimmed + ')';
  insertSnippetIntoBody(snippet);
});

// =====================================================
//  ГЛАВНАЯ — super-only управление каруселью и новостями
// =====================================================
async function loadHomeAdmin() {
  const carousel = $('#home-carousel-list');
  const allList = $('#home-all-list');
  const newsList = $('#home-news-admin-list');
  if (!carousel || !allList || !newsList) return;
  carousel.innerHTML = '<p class="page-sub">Загружаю…</p>';
  allList.innerHTML = '<p class="page-sub">Загружаю…</p>';
  newsList.innerHTML = '<p class="page-sub">Загружаю…</p>';
  loadFeaturedAdmin();

  const rows = await Promise.all(state.projects.map(async (p) => {
    const { data } = await sb.from('settings').select('key,value').eq('project_id', p.id).in('key', ['media_banner', 'media_show_home', 'media_home_sort']);
    const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    return { p, banner: map.media_banner || '', show: String(map.media_show_home || 'false').toLowerCase() === 'true', sort: Number(map.media_home_sort) || 10 };
  }));
  const inCarousel = rows.filter((r) => r.show).sort((a, b) => a.sort - b.sort || a.p.id - b.p.id);
  const notIn = rows.filter((r) => !r.show).sort((a, b) => a.p.id - b.p.id);

  const renderRow = (r, inCar) => {
    const p = r.p;
    const media = r.banner ? '<img src="' + escapeHtml(r.banner) + '" alt="" loading="lazy" />' : '<span title="нет баннера">🖼️</span>';
    return '<div class="home-carousel-row" draggable="true" data-id="' + p.id + '" data-in="' + (inCar ? '1' : '0') + '">' +
      '<div class="home-drag-handle" title="Потяните">⠿</div>' +
      '<div class="home-carousel-thumb">' + media + '</div>' +
      '<div class="home-carousel-meta"><b>' + escapeHtml(p.name) + '</b><span class="page-sub">#' + p.id + ' · ' + escapeHtml(p.slug) + '</span></div>' +
      (inCar ? '<button type="button" class="icon-btn home-remove-btn" title="Убрать из карусели">✕</button>' : '<span class="badge off">не в карусели</span>') +
    '</div>';
  };

  carousel.innerHTML = inCarousel.length ? inCarousel.map((r) => renderRow(r, true)).join('') : '<p class="page-sub">Карусель пуста. Перетащите проект из нижнего списка.</p>';
  allList.innerHTML = notIn.length ? notIn.map((r) => renderRow(r, false)).join('') : '<p class="page-sub">Все проекты уже в карусели.</p>';

  const upsertKeys = async (pid, keys) => {
    const { error } = await sb.from('settings').upsert(keys.map(([k, v]) => ({ project_id: pid, key: k, value: v })), { onConflict: 'project_id,key' });
    if (error) toast(friendlyError(error.message), true);
    else toast('Карусель обновлена.');
  };
  const saveCarouselOrder = async () => {
    const rows2 = [...carousel.querySelectorAll('.home-carousel-row')];
    await Promise.all(rows2.map((row, i) => upsertKeys(Number(row.dataset.id), [
      ['media_show_home', 'true'],
      ['media_home_sort', String(i + 1)],
    ])));
    loadHomeAdmin();
  };
  const toggleShow = async (pid, show) => {
    if (show) {
      // добавить в конец карусели
      const rows2 = [...carousel.querySelectorAll('.home-carousel-row')];
      const nextSort = rows2.length + 1;
      await upsertKeys(pid, [
        ['media_show_home', 'true'],
        ['media_home_sort', String(nextSort)],
      ]);
    } else {
      await upsertKeys(pid, [
        ['media_show_home', 'false'],
      ]);
    }
    loadHomeAdmin();
  };

  // drag & drop
  const bindDnd = () => {
    const allRows = [...document.querySelectorAll('.home-carousel-row')];
    allRows.forEach((row) => {
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(row.dataset.id));
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('dragover'); });
      row.addEventListener('dragleave', () => row.classList.remove('dragover'));
      row.addEventListener('drop', async (e) => {
        e.preventDefault();
        row.classList.remove('dragover');
        const draggedId = Number(e.dataTransfer.getData('text/plain'));
        const targetRow = e.currentTarget;
        const targetId = Number(targetRow.dataset.id);
        if (!draggedId || draggedId === targetId) return;
        const dragged = document.querySelector('.home-carousel-row[data-id="' + draggedId + '"]');
        if (!dragged) return;
        const intoCarousel = targetRow.closest('#home-carousel-list') !== null;
        if (intoCarousel) {
          // вставить до/после целевой строки
          const rect = targetRow.getBoundingClientRect();
          const before = e.clientY < rect.top + rect.height / 2;
          targetRow.parentNode.insertBefore(dragged, before ? targetRow : targetRow.nextSibling);
          if (dragged.dataset.in !== '1') {
            dragged.dataset.in = '1';
            await upsertKeys(draggedId, [['media_show_home', 'true']]);
          }
          await saveCarouselOrder();
        } else {
          // бросили обратно в нижний список — убрать из карусели
          await toggleShow(draggedId, false);
        }
      });
    });
  };
  bindDnd();
  carousel.addEventListener('dragover', (e) => e.preventDefault());
  allList.addEventListener('dragover', (e) => e.preventDefault());
  carousel.addEventListener('drop', async (e) => {
    e.preventDefault();
    const draggedId = Number(e.dataTransfer.getData('text/plain'));
    if (!draggedId) return;
    const dragged = document.querySelector('.home-carousel-row[data-id="' + draggedId + '"]');
    if (dragged && dragged.dataset.in === '1') {
      carousel.appendChild(dragged);
      await saveCarouselOrder();
    } else if (dragged) {
      await toggleShow(draggedId, true);
    }
  });
  allList.addEventListener('drop', async (e) => {
    e.preventDefault();
    const draggedId = Number(e.dataTransfer.getData('text/plain'));
    if (!draggedId) return;
    await toggleShow(draggedId, false);
  });

  // кнопка «убрать из карусели»
  carousel.querySelectorAll('.home-remove-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.home-carousel-row');
      await toggleShow(Number(row.dataset.id), false);
    });
  });

  // новости на Главной
  const nameById = Object.fromEntries(state.projects.map((p) => [p.id, p.name]));
  const { data: news, error: nErr } = await sb.from('news').select('*').eq('home', true).order('published_at', { ascending: false });
  if (nErr) { newsList.innerHTML = '<p class="form-error">' + escapeHtml(friendlyError(nErr.message)) + '</p>'; return; }
  if (!news || !news.length) { newsList.innerHTML = '<p class="page-sub">Пусто. Отметьте «Показывать в «Последних новостях» на Главной» в редакторе новости.</p>'; return; }
  newsList.innerHTML = news.map((n) =>
    '<div class="home-news-admin-row" data-id="' + n.id + '">' +
      '<div class="home-news-admin-meta"><b>' + escapeHtml(n.title) + '</b>' +
        '<span class="page-sub">' + escapeHtml(n.tag || '') + ' · ' + escapeHtml(nameById[n.project_id] || ('Проект #' + n.project_id)) + ' · ' + new Date(n.published_at).toLocaleDateString('ru-RU') + '</span></div>' +
      '<button class="btn btn-ghost btn-sm home-news-unpin">Снять с Главной</button>' +
    '</div>').join('');
  newsList.querySelectorAll('.home-news-admin-row').forEach((row) => {
    row.querySelector('.home-news-unpin').addEventListener('click', async () => {
      const { error } = await sb.from('news').update({ home: false }).eq('id', Number(row.dataset.id));
      if (error) return toast(friendlyError(error.message), true);
      toast('Новость снята с Главной.');
      loadHomeAdmin();
    });
  });
}



// =====================================================
//  АДМИН-ЛОГ — helper
// =====================================================
async function logAdminAction(action, details) {
  try {
    await sb.rpc('audit_log', {
      p_action: action,
      p_table_name: 'admin_action',
      p_record_id: '',
      p_project_id: state.currentProjectId || null,
      p_details: details || {},
    });
  } catch (e) { adminLogLine('WARN', ['audit log failed:', e?.message]); }
}

// =====================================================
//  РАЗРАБОТЧИКУ — шаблоны и скрипт сборки
// =====================================================
function renderDevTemplates() {
  const wrap = $('#dev-templates');
  if (!wrap || !Array.isArray(window.SAMOT_TEMPLATES)) return;
  wrap.innerHTML = window.SAMOT_TEMPLATES.map((t) =>
    '<div class="dev-template">' +
      '<div class="dev-template-name">' + escapeHtml(t.label) + '</div>' +
      '<div class="page-sub" style="font-size:.78rem">' + escapeHtml(t.sub) + '</div>' +
      '<a class="btn btn-ghost btn-sm dev-template-dl" href="' + t.dataUri + '" download="samot-' + escapeHtml(t.file) + '-template.png">⬇️ Скачать</a>' +
    '</div>').join('');
}

const PACKAGER_URL = 'https://github.com/RevacholFrend/SAMOT-releases/releases/download/tools-v1.0.0/SAMOT-Packager-1.0.0.exe';
$('#btn-download-packager')?.addEventListener('click', () => {
  if (window.adminEnv?.openExternal) window.adminEnv.openExternal(PACKAGER_URL);
  else window.open(PACKAGER_URL, '_blank');
  toast('Скачивание SAMOT Packager начато…');
});
