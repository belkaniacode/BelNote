# Plan: BelNote — Electron + Vue 3 + TypeScript rewrite

**Project:** /home/zura/Проекты/My/BelNote-Electron (separate from the flet app)
**Created:** 2026-06-24

## Settings

- **Testing:** Yes — Vitest (backend repos/services + editor logic)
- **Logging:** Standard (key events INFO; WARN/ERROR on failure)
- **Docs:** Warn-only
- **UI framework:** Element Plus (MIT, commercial-OK)
- **Editor:** TipTap / ProseMirror (MIT)
- **i18n:** vue-i18n with standalone JSON locale files (ru/en, extensible)

## Why this rewrite

flet (Linux desktop) cannot provide an always-editable field with inline clickable links.
Web tech can (this is how Joplin does it). Electron + Vue + TipTap gives the required
editor natively, plus easy code blocks and task lists later.

## Stack decisions

- **Shell:** Electron 32, `electron-vite` (Vite + Vue + TS) build.
- **UI:** Vue 3 `<script setup>` + Element Plus (dark theme) to match the current look.
- **Editor:** TipTap — `StarterKit` + `Link` (clickable+editable, autolink) +
  `CodeBlockLowlight` (syntax-highlighted code) + `TaskList`/`TaskItem` (checklists).
- **External links:** opened in the real browser via the main process
  (`setWindowOpenHandler` + `will-navigate` → `shell.openExternal`).
- **i18n:** `src/renderer/src/i18n/locales/*.json`; add a language = add a JSON + register it.
- **Backend (later phases):** Node `better-sqlite3` (MIT) for SQLite + FTS5, reimplementing
  the Python `repositories`/`services` (notes, notebooks, tags, search, autosave, .blnt).

## Phase 1 — Editor prototype (DONE in scaffold, verify by running)

Goal: see the editor working on mock data before building the rest.

1. [x] Scaffold Electron + Vue 3 + TS via electron-vite (main/preload/renderer).
2. [x] Element Plus + dark theme wired (`main.ts`, `theme.css`).
3. [x] vue-i18n with ru/en JSON locales + a language switcher in `App.vue`.
4. [x] `NoteEditor.vue` — TipTap with inline clickable+editable links, code blocks, task lists.
5. [x] Main process routes external links to the system browser.
6. [ ] `npm install` && `npm run dev` — confirm: type freely, URL becomes a styled clickable
   link that opens the browser, code block renders as code, checklist toggles.
7. [ ] Vitest smoke test for the editor's link/auto-link + serialization (HTML round-trip).

## Phase 2 — Data layer (port from Python)

8. [ ] `better-sqlite3` DB module + migrations mirroring `belnote/data/migrations`.
9. [ ] Repositories (notes, notebooks, tags, search/FTS5) as TS modules in the main process,
   exposed to the renderer via typed IPC (preload `window.api`).
10. [ ] Services: note CRUD, notebooks, tags, debounced autosave, full-text search.
11. [ ] Vitest coverage for repositories/services (parity with the Python tests).

## Phase 3 — UI parity

12. [ ] Sidebar (notebooks/tags/trash), notes list pane, toolbar/search bar — Element Plus.
13. [ ] Wire editor to real notes + autosave; "Edited <when>" meta.
14. [ ] Settings dialog (theme, language) matching current behavior.

## Phase 4 — Transfer + packaging

15. [ ] `.blnt` encoded export/import ported (gzip + obfuscation container; same format intent).
16. [ ] `electron-builder` packaging (AppImage/deb), app icon, Linux `.desktop` integration.

## Phase 5 — Later (explicitly deferred by user)

17. [ ] Richer code-block UX (language picker), more block types.
18. [ ] Task-list polish / keyboard shortcuts.

## Risks & Considerations

- Full rewrite — reaching parity takes Phases 2–4; Phase 1 is the de-risking prototype.
- Data layer must match the existing SQLite schema so a user's library/`.blnt` stays compatible
  (or provide a one-time import from the flet DB).
- Electron bundle is larger/heavier than flet — acceptable for the required features.
- Keep the flet version on the original repo's `main` as the fallback.

## Commit Plan

- Commit 1 (this scaffold): `chore: scaffold Electron + Vue 3 + TS app with TipTap editor prototype`
- Then per-phase commits as tasks complete.

## Test Coverage

- Editor: autolink turns a typed URL into a link; getHTML round-trips links/code/tasks.
- Data layer (Phase 2): repository/service tests mirroring the Python suite.
