#!/usr/bin/env node
/**
 * SAMOT Packager — ядро сборки релиза игры.
 * Используется и GUI (packager-main.cjs), и CLI.
 *
 * Вход:
 *   src        — папка с готовой игрой
 *   target     — куда собрать (default: <parent>/game-dist)
 *   version    — версия игры (например, '1.2.3')
 *   tag        — тег релиза (по умолчанию 'v' + version)
 *   packSizeMB — лимит размера пака (default: 200)
 *   entryPoint — путь к .exe внутри src (опционально; авто: единственный .exe, иначе largest .exe + warning)
 *
 * Выход:
 *   { ok, target, manifestPath, manifest, stats: { files, packs, totalBytes, entryPoint, warnings } }
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const DEFAULT_PACK_SIZE_MB = 200;

const ignores = [
  /\.git($|[\\/])/,
  /\.DS_Store$/,
  /\.tmp$/,
  /\.pdb$/,
  /\.manifest$/,
  /node_modules/,
  /game-dist/,
];

function walk(dir, relBase = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = relBase ? relBase + '/' + entry.name : entry.name;
    if (ignores.some((re) => re.test(rel))) continue;
    if (entry.isDirectory()) out.push(...walk(abs, rel));
    else if (entry.isFile()) out.push({ abs, rel });
  }
  return out;
}

const sha256File = (abs) => crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');

const splitPacks = (collected, target, packSizeBytes, onLog) => {
  const sorted = [...collected].sort((a, b) => fs.statSync(b.abs).size - fs.statSync(a.abs).size);
  const packs = [];
  const fileToPack = new Map();
  let current = [];
  let currentBytes = 0;

  const flushPack = () => {
    if (!current.length) return;
    const id = 'pack-' + String(packs.length + 1).padStart(3, '0') + '.zip';
    const zip = new AdmZip();
    for (const f of current) {
      const rel = f.rel.replace(/\\/g, '/');
      zip.addFile(rel, fs.readFileSync(f.abs));
    }
    const packPath = path.join(target, id);
    zip.writeZip(packPath);
    const stat = fs.statSync(packPath);
    packs.push({ id, size: stat.size, sha256: sha256File(packPath), files: current.length });
    for (const f of current) fileToPack.set(f.rel.replace(/\\/g, '/'), id);
    onLog('  + ' + id + ' (' + current.length + ' файлов, ' + (stat.size / 1048576).toFixed(1) + ' MB)');
    current = [];
    currentBytes = 0;
  };

  for (const file of sorted) {
    const stat = fs.statSync(file.abs);
    if (currentBytes + stat.size > packSizeBytes && current.length) flushPack();
    current.push(file);
    currentBytes += stat.size;
  }
  flushPack();
  return { packs, fileToPack };
};

const RELEASE_INSTRUCTIONS = (version, tag) => `SAMOT Packager — релиз готов
=============================================

Содержимое этой папки готово к загрузке в GitHub Release.

Шаг 1. Создайте релиз на GitHub
   Тег:    ${tag}
   Пример: gh release create ${tag} pack-*.zip manifest.json --repo <owner>/<repo> --title "${tag}"

   Либо через веб-интерфейс: Releases → Create a new release → выберите тег ${tag} →
   прикрепите ВСЕ файлы из этой папки (pack-*.zip и manifest.json).

Шаг 2. Админка → «📦 Релиз и манифест»
   Владелец репозитория:    <owner>              (например, RevacholFrend)
   Имя репозитория:         <repo>               (например, SAMOT-releases)
   Тег релиза:              ${tag}
   Версия игры:             ${version}
   Манифест:                вставьте содержимое manifest.json целиком
   «Игра доступна для загрузки»: Включить

Шаг 3. Проверка
   В лаунчере под тестовым аккаунтом: «Скачать игру» —
   скачиваются только недостающие/сбитые файлы.

Обновление игры в дальнейшем
   Та же сборка с новым тегом. Игроки получат только изменённые файлы.

`;

async function buildGame(options) {
  const onLog = typeof options.onLog === 'function' ? options.onLog : () => {};
  const src = path.resolve(String(options.src || ''));
  const version = String(options.version || '0.0.0').trim();
  const tag = String(options.tag || 'v' + version).trim();
  const target = path.resolve(options.target || path.join(path.dirname(src), 'game-dist'));
  const packSizeMB = Number(options.packSizeMB) > 0 ? Number(options.packSizeMB) : DEFAULT_PACK_SIZE_MB;
  const entryArg = options.entryPoint ? String(options.entryPoint).replace(/\\/g, '/').replace(/^\.\//, '') : null;

  const warnings = [];

  if (!src || !fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
    throw new Error('Папка с игрой не найдена: ' + src);
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Версия должна быть в формате 1.2.3 (получено: ' + version + ')');
  }

  onLog('Исходная папка: ' + src);
  onLog('Целевая папка:  ' + target);

  const collected = walk(src);
  if (!collected.length) throw new Error('В папке нет файлов игры (пусто или всё отфильтровано).');
  const totalBytes = collected.reduce((a, f) => a + fs.statSync(f.abs).size, 0);
  onLog('Файлов: ' + collected.length + '; сумма: ' + (totalBytes / 1048576).toFixed(1) + ' MB');

  // Точка входа: аргумент → единственный .exe → самый большой .exe (warning)
  const exes = collected.filter((f) => /\.exe$/i.test(f.rel));
  let entryPoint = entryArg;
  if (!entryPoint) {
    if (exes.length === 1) entryPoint = exes[0].rel.replace(/\\/g, '/');
    else if (exes.length > 1) {
      entryPoint = [...exes].sort((a, b) => fs.statSync(b.abs).size - fs.statSync(a.abs).size)[0].rel.replace(/\\/g, '/');
      warnings.push('Найдено несколько .exe (' + exes.length + '); точкой входа выбран «' + entryPoint + '» (самый большой). Если это неверно — укажите её вручную.');
    } else {
      warnings.push('В папке не найдено ни одного .exe — точка входа не определена. В лаунчере кнопка «Играть» не заработает, пока она не будет указана.');
    }
  }
  if (entryPoint) onLog('Точка входа: ' + entryPoint);

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  const { packs, fileToPack } = splitPacks(collected, target, packSizeMB * 1024 * 1024, onLog);
  for (const p of packs) {
    if (p.size > 1900 * 1024 * 1024) {
      warnings.push('Пак ' + p.id + ' весит больше 1.9 GB — близко к лимиту GitHub Release (2 GB на файл). Уменьшите размер пака.');
    }
  }

  onLog('Хэширую файлы игры (SHA-256)…');
  const files = [];
  for (const { abs, rel } of collected) {
    const rel2 = rel.replace(/\\/g, '/');
    files.push({ path: rel2, pack: fileToPack.get(rel2), size: fs.statSync(abs).size, sha256: sha256File(abs) });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));

  const manifest = {
    version,
    tag,
    createdAt: new Date().toISOString(),
    entryPoint: entryPoint || null,
    packs,
    files,
  };

  const manifestPath = path.join(target, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  // BOM, чтобы Windows Блокнот корректно показывал кириллицу
  fs.writeFileSync(path.join(target, 'RELEASE-INSTRUCTIONS.txt'), '﻿' + RELEASE_INSTRUCTIONS(version, tag), 'utf8');

  onLog('');
  onLog('OK (pack-режим). Паков: ' + packs.length + '; файлов: ' + files.length);
  onLog('Папка готова для GitHub Release: ' + target);

  return {
    ok: true,
    target,
    manifestPath,
    manifest,
    stats: { files: files.length, packs: packs.length, totalBytes, entryPoint: entryPoint || null, warnings },
  };
}

module.exports = { buildGame, walk, sha256File, DEFAULT_PACK_SIZE_MB };

// ---------- CLI ----------
if (require.main === module) {
  const argv = process.argv.slice(2);
  const src = argv[0];
  const target = argv[1] || null;
  const tag = argv[2] || null;
  const getOpt = (n) => {
    const i = argv.findIndex((a) => a === n || a.startsWith(n + '='));
    if (i === -1) return null;
    const eq = argv[i].indexOf('=');
    return eq !== -1 ? argv[i].slice(eq + 1) : '1';
  };
  const version = (getOpt('--version') || (tag || 'v0.0.0').replace(/^v/, '')) || '0.0.0';
  const packSizeMB = Number(getOpt('--packs') || DEFAULT_PACK_SIZE_MB);
  const entryPoint = getOpt('--entry');
  if (!src) {
    console.error('Usage: node packager-core.cjs <gameDir> [targetDir] [vTag] [--packs=MB] [--entry <relpath>]');
    process.exit(1);
  }
  buildGame({ src, target, version, tag: tag || undefined, packSizeMB, entryPoint, onLog: (l) => console.log(l) })
    .then((r) => {
      for (const w of (r.stats?.warnings || [])) console.warn('⚠ ' + w);
      process.exit(r.ok ? 0 : 1);
    })
    .catch((e) => { console.error('Ошибка:', e.message); process.exit(1); });
}
