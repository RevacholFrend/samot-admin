#!/usr/bin/env node
// Собирает папку для GitHub Release из готовой игры.
// Пример: node tools/build-game.js "C:/Games/MyGame/build"              → ../game-dist
//         node tools/build-game.js "C:/Games/MyGame/build" . v1.2.3 --packs
//
// Тонкая обёртка над tools/packager/packager-core.cjs (общая логика с GUI «SAMOT Packager»).
//
// Результат:
//   game-dist/
//     manifest.json          ← манифест с SHA-256 / size / паками
//     pack-001.zip ...       ← паки для загрузки как ассеты релиза
//     RELEASE-INSTRUCTIONS.txt

'use strict';

const path = require('path');
const { buildGame, DEFAULT_PACK_SIZE_MB } = require('./packager/packager-core.cjs');

const argv = process.argv.slice(2);
const hasFlag = (n) => argv.includes(n) || argv.some((a) => a.startsWith(n + '='));
const getOpt = (n, def) => {
  const i = argv.findIndex((a) => a === n || a.startsWith(n + '='));
  if (i === -1) return def;
  const eq = argv[i].indexOf('=');
  return eq !== -1 ? argv[i].slice(eq + 1) : def;
};
const positional = argv.filter((a) => !a.startsWith('--'));
const src = positional[0];
const target = positional[1] || null;
const tag = positional[2] || null;
const packSizeMB = Number(getOpt('--packs', String(DEFAULT_PACK_SIZE_MB))) || DEFAULT_PACK_SIZE_MB;
const entryArg = getOpt('--entry', null);

if (!src) {
  console.error('Usage: node tools/build-game.js <gameDir> [targetDir] [vTag] [--packs[=MB]] [--entry path]');
  process.exit(1);
}
const version = process.env.GAME_VERSION || (tag ? tag.replace(/^v/, '') : '0.0.0');

buildGame({
  src,
  target: target && target !== '.' ? target : undefined,
  version,
  tag: tag || undefined,
  packSizeMB,
  entryPoint: entryArg || undefined,
  onLog: (l) => console.log(l),
}).then((r) => process.exit(r.ok ? 0 : 1))
  .catch((e) => { console.error('Ошибка:', e.message); process.exit(1); });
