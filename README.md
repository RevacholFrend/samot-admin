<p align="center">
  <img src="assets/samot_phone_1440x2560_negate.png" alt="SAMOT Admin" width="240">
</p>

<h1 align="center">SAMOT Admin</h1>

<p align="center"><b>Панель администратора и разработчика для SAMOT Launcher</b></p>

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.0.7-ff6b1a">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-2ea3f2">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-39d98a">
  <img alt="Stack" src="https://img.shields.io/badge/stack-Electron.%2B.Supabase-7c5cff">
</p>

---

## Что это

**SAMOT Admin** — рабочее место разработчика игры внутри SAMOT Launcher. Всё управление проектом — без SQL и кода: проект создаётся и выпускается из самого приложения.

## Возможности

### Управление проектом
- 🚀 **Проекты и роли**: создание проекта, владелец (`owner`) и редакторы (`editor`), приглашения по email
- 📰 **Новости и баннеры**: публикация, карусель на главной лаунчера, галерея скриншотов
- ⚙️ **Настройки проекта**: версии, тег релиза, «показывать на Главной»
- 📊 **Аналитика**: активные устройства, запуски, новости за период, экспорт CSV
- ⛔ **Баны и разбаны** игроков + предупреждения проекта
- 📜 **Админ-лог**: кто и что делал в панели

### Выпуск игры
- 📦 **«📦 Релиз и манифест»**: тег и версия в одном поле, вставка `manifest.json` с автозаполнением из него
- 📎 **«Материалы для разработчиков»**: шаблоны изображений, инструкция по выпуску, кнопка «Скачать SAMOT Packager»
- 🧭 **Вики** прямо в приложении — справка по каждому разделу

### Автообновления
- 🔄 **Раздел «Обновления»**: публикация новой версии лаунчера и админки (версия, ссылка, SHA-256)

## Скачать

| Что | Файл |
|---|---|
| **SAMOT Admin** | [SAMOT Admin Setup.exe](https://github.com/RevacholFrend/samot-admin/releases/latest/download/SAMOT-Admin-Setup.exe) |
| **SAMOT Launcher** (для игроков) | [SAMOT Launcher Setup.exe](https://github.com/RevacholFrend/samot-launcher/releases/latest/download/SAMOT-Launcher-Setup.exe) |
| **SAMOT Packager** (утилита сборки игры) | [SAMOT-Packager-1.0.0.exe](https://github.com/RevacholFrend/samot-tools/releases/latest/download/SAMOT-Packager.exe) |

> ℹ При первом запуске Windows SmartScreen может предупредить: сертификат самоподписанный.

## Скриншоты

Демонстрационные экраны — проект «SuperTuxKart» в демо-режиме (свободный kart-гонщик, GPLv3).

<p align="center">
  <img src="docs/screenshots/admin-panel.png" alt="SAMOT Admin: новости и баннеры" width="49%">
  <img src="docs/screenshots/packager.png" alt="SAMOT Packager" width="49%">
</p>
<p align="center">
  <img src="docs/screenshots/launcher-main.png" alt="Что видит игрок: главная лаунчера" width="49%">
  <img src="docs/screenshots/launcher-download.png" alt="Скачивание: прогресс, скорость, пауза" width="49%">
</p>

## Как выпустить свою игру

1. Попросите администратора добавить вас в проект (роль `owner` или `editor`).
2. Скачайте **SAMOT Packager** по ссылке выше → выберите папку игры → «Собрать релиз».
3. Прикрепите содержимое `game-dist/` к релизу на GitHub с тегом `vX.Y.Z`.
4. В этой админке → «📦 Релиз и манифест»: владелец, репозиторий, тег, версия, `manifest.json` → «Игра доступна для загрузки: Да».
5. Игроки получат игру по кнопке «Скачать игру» в лаунчере. Обновления — только изменённые файлы (SHA-256 + паки).

## Сборка из исходников

```bash
npm install
npm start          # запустить админку
npm test           # тесты
npm run dist       # собрать установщик (dist/SAMOT Admin Setup <version>.exe)
```

Требования: Windows 10+, Node.js LTS. Бэкенд — Supabase (схема и миграции — в репозитории [samot-launcher](https://github.com/RevacholFrend/samot-launcher)).

## Лицензия

MIT — см. [LICENSE](LICENSE).
