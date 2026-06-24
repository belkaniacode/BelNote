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

// Global Delete/Backspace: remove the selected notes (or the focused folder). Ignored while
// editing text, and never fires while a confirmation dialog is open.
async function onKeydown(e: KeyboardEvent): Promise<void> {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return
  const el = document.activeElement
  if (isTypingTarget(el)) return
  if (document.querySelector('.el-overlay')) return // a dialog is open

  // 1) A focused sidebar folder → delete that folder (with confirm).
  const folderEl = el?.closest<HTMLElement>('.sidebar__folder')
  if (folderEl?.dataset.folderId) {
    e.preventDefault()
    const id = Number(folderEl.dataset.folderId)
    try {
      await ElMessageBox.confirm(t('sidebar.delete_folder_confirm'), t('sidebar.delete'), {
        type: 'warning',
        confirmButtonText: t('sidebar.delete'),
        cancelButtonText: t('common.cancel')
      })
      await store.deleteFolder(id)
    } catch {
      /* cancelled */
    }
    return
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
