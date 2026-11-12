/**
 * Интегральные тесты SAMOT Admin (панель администратора/разработчика).
 * Запуск: npm test
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const has = (name) => fs.existsSync(path.join(ROOT, name));

test('все нужные файлы на месте', () => {
  for (const p of [
    'admin-main.js', 'admin-preload.js',
    'src/admin/admin.html', 'src/admin/admin.js', 'src/admin/admin.css',
    'src/admin/editor.html', 'src/admin/editor.js',
    'src/config.js', 'src/documents.js',
    'assets/logoAdmin.svg', 'assets/iconAdmin.ico',
  ]) {
    assert.ok(has(p), `нет файла: ${p}`);
  }
});

test('все JS-файлы компилируются (vm.compileFunction)', () => {
  for (const p of ['admin-main.js', 'admin-preload.js', 'src/admin/admin.js', 'src/admin/editor.js', 'src/config.js', 'src/documents.js']) {
    const src = read(p);
    assert.doesNotThrow(() => new vm.Script(src, { filename: p }), `синтаксическая ошибка в ${p}`);
  }
});

test('HTML id, которые читает JS (unguarded binds), существуют в admin.html', () => {
  const html = read('src/admin/admin.html');
  const js = read('src/admin/admin.js');
  const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const direct = [...new Set([...js.matchAll(/\$\(\s*'#([A-Za-z0-9_-]+)'\)\.addEventListener/g)].map((m) => m[1]))];
  const missing = direct.filter((id) => !htmlIds.has(id));
  assert.deepStrictEqual(missing, [], `в HTML отсутствуют id: ${missing.join(', ')}`);
});

test('SETTINGS_KEYS имеют соответствующие values (upsert без undefined)', () => {
  const js = read('src/admin/admin.js');
  const keysBlock = js.match(/const SETTINGS_KEYS = \[([\s\S]*?)\];/);
  assert.ok(keysBlock, 'SETTINGS_KEYS не найден');
  const keys = [...keysBlock[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const valuesMatch = js.match(/const values = \{([\s\S]*?)\};/);
  assert.ok(valuesMatch, 'блок values не найден');
  const valKeys = new Set([...valuesMatch[1].matchAll(/([a-z_]+)\s*:/g)].map((m) => m[1]));
  const missing = keys.filter((k) => !valKeys.has(k));
  assert.deepStrictEqual(missing, [], `SETTINGS_KEYS без values: ${missing.join(', ')}`);
});

test('bare prompt()/confirm() в админке нет (Electron их не показывает)', () => {
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const p of ['src/admin/admin.js', 'src/admin/editor.js']) {
    const js = stripComments(read(p));
    const prompts = (js.match(/[^a-zA-Z_.]prompt\s*\(/g) || []).filter((s) => !s.includes('uiPrompt'));
    const confirms = (js.match(/[^a-zA-Z_.]confirm\s*\(/g) || []).filter((s) => !s.includes('uiConfirm'));
    assert.strictEqual(prompts.length, 0, `голый prompt() в ${p}`);
    assert.strictEqual(confirms.length, 0, `голый confirm() в ${p}`);
  }
});

test('отладочные метки [samot-admin] отсутствуют', () => {
  const js = read('src/admin/admin.js');
  assert.ok(!js.includes('[samot-admin]'), 'найдена отладочная метка');
});

test('бренд-новости: каркас формы на месте в admin.html', () => {
  const html = read('src/admin/admin.html');
  for (const id of ['brand-news-list', 'brand-news-form', 'bn-title', 'bn-kind', 'bn-carousel', 'bn-home', 'bn-active', 'bn-image', 'bn-cta-url', 'bn-save', 'btn-add-brand-news', 'nf-carousel', 'nf-cta-url']) {
    assert.ok(html.includes(`id="${id}"`), `нет #${id} в admin.html`);
  }
});

test('фича packager на месте: packager-core генерирует pack-режим и манифест', () => {
  const core = read('tools/packager/packager-core.cjs');
  assert.ok(core.includes('pack-'), 'packager-core.cjs: pack-режим не найден');
  assert.ok(core.includes('manifest'), 'packager-core.cjs: генерация манифеста не найдена');
  assert.ok(core.includes('sha256'), 'packager-core.cjs: SHA-256 верификация не найдена');
});
