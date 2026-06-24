# BelNote — Electron + Vue 3 + TypeScript

A rewrite of BelNote on web tech so the note editor can do what the flet version cannot:
an **always-editable** body where **links are real clickable links inline**, plus code
blocks (rendered as code) and task lists.

- **Shell:** Electron + electron-vite
- **UI:** Vue 3 + Element Plus (MIT) — dark theme
- **Editor:** TipTap / ProseMirror (MIT) — inline editable links, code blocks, task lists
- **i18n:** vue-i18n with JSON locales in `src/renderer/src/i18n/locales/` (ru/en; add a JSON to add a language)

## Develop

```bash
npm install
npm run dev        # launches the Electron app with hot reload
```

## Build

```bash
npm run build      # type-check + bundle
npm run dist       # package with electron-builder
npm test           # Vitest
```

## Status

Phase 1 (editor prototype) scaffolded — see `.ai-factory/plans/electron-vue-rewrite.md`
for the full roadmap (data layer, UI parity, transfer, packaging).

The original flet app remains in `/home/zura/Проекты/My/BelNote`.
