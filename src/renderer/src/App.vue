<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useNotesStore } from './stores/notes'
import SidebarPane from './components/SidebarPane.vue'
import NotesListPane from './components/NotesListPane.vue'
import EditorPane from './components/EditorPane.vue'

// macOS Notes three-pane shell: Sidebar │ Notes list │ Editor.
// All data flows through the Pinia store, hydrated from SQLite on mount.
const { t } = useI18n()
const store = useNotesStore()

/** Should the Delete key be ignored because the user is typing? */
function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return (
    (el as HTMLElement).isContentEditable ||
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    !!el.closest('.ProseMirror')
  )
}

// Global keyboard shortcuts. All ignored while editing text (the editor owns its own text
// undo/redo and the Delete key) and while a confirmation dialog is open.
async function onKeydown(e: KeyboardEvent): Promise<void> {
  const el = document.activeElement
  const mod = e.ctrlKey || e.metaKey

  // Undo / redo for deletions — keyboard only, no buttons. Ctrl/Cmd+Z = undo,
  // Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y = redo. Skipped inside the editor so text undo still works.
  if (mod && ['z', 'y'].includes(e.key.toLowerCase())) {
    if (isTypingTarget(el)) return
    if (document.querySelector('.el-overlay')) return
    e.preventDefault()
    const isRedo = e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)
    if (isRedo) await store.redo()
    else await store.undo()
    return
  }

  if (e.key !== 'Delete' && e.key !== 'Backspace') return
  if (isTypingTarget(el)) return
  if (document.querySelector('.el-overlay')) return // a dialog is open

  // 1) Focus in the sidebar → delete the multi-selected folders, or the focused one (with confirm).
  if (el?.closest('.sidebar')) {
    const focused = el.closest<HTMLElement>('.sidebar__folder')?.dataset.folderId
    const ids = store.selectedFolderIds.length
      ? [...store.selectedFolderIds]
      : focused
        ? [Number(focused)]
        : []
    if (ids.length) {
      e.preventDefault()
      try {
        const message =
          ids.length > 1
            ? t('sidebar.delete_folders_confirm', { count: ids.length })
            : t('sidebar.delete_folder_confirm')
        await ElMessageBox.confirm(message, t('sidebar.delete'), {
          type: 'warning',
          confirmButtonText: t('sidebar.delete'),
          cancelButtonText: t('common.cancel')
        })
        await store.deleteFolders(ids)
      } catch {
        /* cancelled */
      }
      return
    }
  }

  // 2) Selected notes → trash them (or permanently delete in the trash view, with confirm).
  if (!store.selectedNoteIds.length) return
  e.preventDefault()
  if (store.isTrashView) {
    try {
      await ElMessageBox.confirm(t('list.delete_forever_confirm'), t('list.delete_forever'), {
        type: 'warning',
        confirmButtonText: t('list.delete_forever'),
        cancelButtonText: t('common.cancel')
      })
      await store.hardDeleteSelected()
    } catch {
      /* cancelled */
    }
  } else {
    await store.trashSelected()
  }
}

onMounted(() => {
  store.init()
  window.addEventListener('keydown', onKeydown)
  // eslint-disable-next-line no-console
  console.info('[app] layout mounted')
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="app">
    <SidebarPane class="app__sidebar" />
    <NotesListPane class="app__list" />
    <EditorPane class="app__editor" />
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-columns: 230px 300px 1fr;
  /* Cap the single row at the viewport. Without an explicit row track the implicit row is
     `auto`, which grows to CONTENT height — so a tall sidebar/list pushes past 100vh and is
     just clipped by body{overflow:hidden}, and the panes' own overflow:auto never engages.
     minmax(0, 1fr) pins the row to the viewport so panes scroll internally instead. */
  grid-template-rows: minmax(0, 1fr);
  height: 100vh;
  background: var(--bn-bg);
  color: var(--bn-text);
}
.app__sidebar {
  background: var(--bn-sidebar);
  border-right: 1px solid var(--bn-divider);
  min-width: 0;
}
.app__list {
  background: var(--bn-list);
  border-right: 1px solid var(--bn-divider);
  min-width: 0;
}
.app__editor {
  background: var(--bn-bg);
  min-width: 0;
}

@media (max-width: 820px) {
  .app {
    grid-template-columns: 200px 1fr;
  }
  .app__editor {
    display: none;
  }
}
</style>
