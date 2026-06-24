<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useNotesStore } from './stores/notes'
import { useLayout, HANDLE } from './composables/useLayout'
import SidebarPane from './components/SidebarPane.vue'
import NotesListPane from './components/NotesListPane.vue'
import EditorPane from './components/EditorPane.vue'

// macOS Notes three-pane shell: Sidebar │ Notes list │ Editor.
// All data flows through the Pinia store, hydrated from SQLite on mount.
const { t } = useI18n()
const store = useNotesStore()

// ---- Resizable / collapsible layout ----
const { sidebarWidth, listWidth, collapsed, setSidebarWidth, setListWidth, toggleSidebar, persist } =
  useLayout()

// Column template: fixed sidebar + handle + fixed list + handle + flexible editor. When the
// sidebar is collapsed its track and handle drop out entirely so the list starts at the edge.
const gridStyle = computed(() => ({
  gridTemplateColumns: collapsed.value
    ? `${listWidth.value}px ${HANDLE}px 1fr`
    : `${sidebarWidth.value}px ${HANDLE}px ${listWidth.value}px ${HANDLE}px 1fr`
}))

const resizing = ref<null | 'sidebar' | 'list'>(null)

// Drag a seam to resize. Pointer events on window keep the drag alive even when the cursor
// outruns the thin handle; body cursor/selection are locked so it reads as a clean resize.
function startResize(which: 'sidebar' | 'list', e: PointerEvent): void {
  e.preventDefault()
  resizing.value = which
  const startX = e.clientX
  const startSidebar = sidebarWidth.value
  const startList = listWidth.value

  const onMove = (ev: PointerEvent): void => {
    const dx = ev.clientX - startX
    if (which === 'sidebar') {
      setSidebarWidth(startSidebar + dx)
    } else {
      // Cap the list so the editor keeps EDITOR_MIN: available = window − sidebar track − handles.
      const sidebarSpace = collapsed.value ? 0 : sidebarWidth.value + HANDLE
      setListWidth(startList + dx, window.innerWidth - sidebarSpace - HANDLE)
    }
  }
  const onUp = (): void => {
    resizing.value = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    persist()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

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

  // Toggle the sidebar — Ctrl/Cmd+\ . A window-level command, so it works even while typing;
  // only suppressed while a dialog is open.
  if (mod && e.key === '\\') {
    if (document.querySelector('.el-overlay')) return
    e.preventDefault()
    toggleSidebar()
    return
  }

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
  <div class="app" :class="{ 'is-resizing': resizing !== null }" :style="gridStyle">
    <template v-if="!collapsed">
      <SidebarPane class="app__sidebar" />
      <div
        class="app__resizer"
        :class="{ 'is-active': resizing === 'sidebar' }"
        @pointerdown="startResize('sidebar', $event)"
      />
    </template>
    <NotesListPane class="app__list" />
    <div
      class="app__resizer"
      :class="{ 'is-active': resizing === 'list' }"
      @pointerdown="startResize('list', $event)"
    />
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
  min-width: 0;
}
.app__list {
  background: var(--bn-list);
  min-width: 0;
}
.app__editor {
  background: var(--bn-bg);
  min-width: 0;
}

/* Resize handle: a thin grab strip occupying its own 6px grid track. It draws the 1px divider
   line in its centre (replacing the panes' border-right), so the seam looks like a hairline but
   has a comfortable hit area and a col-resize cursor. */
.app__resizer {
  position: relative;
  cursor: col-resize;
  background: transparent;
  /* don't let the strip get squeezed away */
  min-width: 0;
}
.app__resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  transform: translateX(-0.5px);
  background: var(--bn-divider);
  transition: background var(--bn-transition);
}
.app__resizer:hover::before,
.app__resizer.is-active::before {
  background: var(--bn-accent);
  width: 2px;
}
</style>
