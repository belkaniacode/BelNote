<script setup lang="ts">
import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Search, EditPen, More, Delete, RefreshLeft, Fold, Expand } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useNotesStore } from '../stores/notes'
import { useLayout } from '../composables/useLayout'
import { deriveSnippet } from '@shared/noteText'
import { relativeDate } from '../utils/relativeDate'
import type { Note } from '@shared/types'

const { t } = useI18n()
const store = useNotesStore()
// Sidebar collapse toggle lives here (left of the list header) so it's reachable even when the
// sidebar is hidden. Fold icon when expanded, Expand icon when collapsed.
const { collapsed, toggleSidebar } = useLayout()

const searchModel = computed({
  get: () => store.searchQuery,
  set: (v: string) => store.setSearch(v)
})

const headerTitle = computed(() => {
  if (store.isTrashView) return t('sidebar.recently_deleted')
  if (typeof store.selectedView === 'number') {
    return store.folders.find((f) => f.id === store.selectedView)?.name ?? t('sidebar.all_notes')
  }
  return t('sidebar.all_notes')
})

// macOS-style selection: plain click = single, Cmd/Ctrl+click = toggle, Shift+click = range.
function onRowClick(e: MouseEvent, id: number): void {
  if (e.shiftKey) store.selectRange(id)
  else if (e.ctrlKey || e.metaKey) store.toggleSelect(id)
  else store.selectSingle(id)
}

function titleOf(note: Note): string {
  return note.title || t('list.untitled')
}
function snippetOf(note: Note): string {
  // SearchHit carries a highlighted snippet; otherwise derive from the body text.
  return (note as { snippet?: string }).snippet || deriveSnippet(note.contentText)
}

async function onAction(command: string, note: Note): Promise<void> {
  if (command === 'pin') await store.setPinned(note.id, !note.pinned)
  else if (command === 'delete') await store.trashNote(note.id)
}

// Drag a note (or the whole multi-selection) onto a sidebar folder to move it — macOS Notes
// style. If the dragged note isn't part of the current selection, drag just that one.
function onDragStart(e: DragEvent, id: number): void {
  if (!store.selectedNoteIds.includes(id)) store.selectSingle(id)
  const ids = store.selectedNoteIds.length ? [...store.selectedNoteIds] : [id]
  store.startDraggingNotes(ids)
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', ids.join(','))
  }
  // eslint-disable-next-line no-console
  console.info(`[FIX] drag-start notes: ${ids.join(',')}`)
}

async function deleteForever(note: Note): Promise<void> {
  try {
    await ElMessageBox.confirm(t('list.delete_forever_confirm'), t('list.delete_forever'), {
      type: 'warning',
      confirmButtonText: t('list.delete_forever'),
      cancelButtonText: t('common.cancel')
    })
    await store.hardDeleteNote(note.id)
  } catch {
    /* cancelled */
  }
}

async function emptyTrash(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('list.empty_trash_confirm'), t('list.empty_trash'), {
      type: 'warning',
      confirmButtonText: t('list.empty_trash'),
      cancelButtonText: t('common.cancel')
    })
    await store.emptyTrash()
  } catch {
    /* cancelled */
  }
}
</script>

<template>
  <section class="list">
    <header class="list__header">
      <div class="list__top">
        <button
          class="list__sidebar-toggle"
          :title="t('list.toggle_sidebar')"
          @click="toggleSidebar"
        >
          <el-icon><component :is="collapsed ? Expand : Fold" /></el-icon>
        </button>
        <h2 class="list__title">{{ headerTitle }}</h2>
        <button
          v-if="store.isTrashView && store.counts.trash"
          class="list__empty-btn"
          @click="emptyTrash"
        >
          {{ t('list.empty_trash') }}
        </button>
        <button
          v-else-if="!store.isTrashView"
          class="list__new"
          :title="t('list.new_note')"
          @click="store.createNote()"
        >
          <el-icon><EditPen /></el-icon>
        </button>
      </div>

      <el-input
        v-if="!store.isTrashView"
        v-model="searchModel"
        :placeholder="t('list.search')"
        size="default"
        clearable
        class="list__search"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
    </header>

    <div class="list__scroll">
      <!-- Skeleton rows only on the first DB hydrate or a genuinely slow load (> ~150ms), never
           on instant folder switches — otherwise they flash for a frame and look jerky. -->
      <template v-if="store.initializing || store.slowLoading">
        <div v-for="i in 7" :key="`sk-${i}`" class="row row--skeleton">
          <el-skeleton animated>
            <template #template>
              <el-skeleton-item variant="text" style="width: 60%; height: 14px" />
              <el-skeleton-item variant="text" style="width: 85%; height: 11px; margin-top: 6px" />
            </template>
          </el-skeleton>
        </div>
      </template>

      <template v-else>
      <p v-if="!store.visibleNotes.length" class="list__empty">
        <span class="list__empty-title">
          {{ store.isSearching ? t('list.no_results') : t('list.no_notes') }}
        </span>
        <span v-if="!store.isSearching && !store.isTrashView" class="list__empty-hint">
          {{ t('list.no_notes_hint') }}
        </span>
      </p>

      <button
        v-for="note in store.visibleNotes"
        :key="note.id"
        class="row"
        :class="{
          'is-active': store.selectedNoteIds.includes(note.id),
          'is-focused': note.id === store.selectedNoteId
        }"
        :draggable="!store.isTrashView"
        @click="onRowClick($event, note.id)"
        @dragstart="onDragStart($event, note.id)"
        @dragend="store.endDraggingNotes()"
      >
        <div class="row__head">
          <span v-if="note.pinned" class="row__pin">📌</span>
          <span class="row__title">{{ titleOf(note) }}</span>
        </div>
        <div class="row__meta">
          <span class="row__date">
            {{ relativeDate(store.isTrashView ? (note.deletedAt ?? note.updatedAt) : note.updatedAt) }}
          </span>
          <span class="row__snippet">{{ snippetOf(note) || ' ' }}</span>
        </div>

        <!-- Live folder actions -->
        <el-dropdown
          v-if="!store.isTrashView"
          trigger="click"
          class="row__actions"
          @command="(c: string) => onAction(c, note)"
        >
          <el-icon class="row__more" @click.stop><More /></el-icon>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="pin">
                {{ note.pinned ? t('list.unpin') : t('list.pin') }}
              </el-dropdown-item>
              <el-dropdown-item command="delete" divided>{{ t('list.delete') }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <!-- Trash actions -->
        <span v-else class="row__trash-actions">
          <el-icon class="row__trash-action" :title="t('list.restore')" @click.stop="store.restoreNote(note.id)">
            <RefreshLeft />
          </el-icon>
          <el-icon class="row__trash-action danger" :title="t('list.delete_forever')" @click.stop="deleteForever(note)">
            <Delete />
          </el-icon>
        </span>
      </button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.list__header {
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--bn-divider);
}
.list__top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.list__title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.list__new,
.list__empty-btn {
  border: none;
  background: transparent;
  color: var(--bn-accent);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  padding: 4px 8px;
  font-size: 13px;
}
.list__new:hover,
.list__empty-btn:hover {
  background: var(--bn-hover);
}
/* Sidebar show/hide toggle — sits at the far left of the list header, always visible. */
.list__sidebar-toggle {
  border: none;
  background: transparent;
  color: var(--bn-text-muted);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  padding: 4px 6px;
  margin-right: 2px;
  font-size: 15px;
}
.list__sidebar-toggle:hover {
  background: var(--bn-hover);
  color: var(--bn-text);
}
.list__search :deep(.el-input__wrapper) {
  border-radius: 8px;
  background: var(--bn-hover);
  box-shadow: none;
}
.list__scroll {
  flex: 1;
  overflow-y: auto;
  /* min-height:0 lets this flex child shrink below content and scroll instead of overflowing. */
  min-height: 0;
  /* gap separates rows so adjacent selected notes don't merge into one block;
     extra bottom padding gives breathing room after the last note. */
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 6px 16px;
}
.list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-top: 48px;
  color: var(--bn-text-muted);
}
.list__empty-title {
  font-size: 15px;
  font-weight: 600;
}
.list__empty-hint {
  font-size: 12.5px;
  color: var(--bn-text-faint);
}
.row {
  position: relative;
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: inherit;
  padding: 9px 12px;
  border-radius: var(--bn-radius);
  cursor: pointer;
  transition: background var(--bn-transition);
}
.row:hover {
  background: var(--bn-hover);
}
.row--skeleton {
  cursor: default;
  pointer-events: none;
  opacity: 0.7;
}
.row--skeleton:hover {
  background: transparent;
}
.row.is-active {
  background: var(--bn-selection);
}
.row.is-focused {
  background: var(--bn-selection-strong);
}
.row__head {
  display: flex;
  align-items: center;
  gap: 5px;
}
.row__pin {
  font-size: 11px;
}
.row__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--bn-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__meta {
  display: flex;
  gap: 6px;
  margin-top: 2px;
  font-size: 12px;
  color: var(--bn-text-muted);
  overflow: hidden;
}
.row__date {
  flex-shrink: 0;
}
.row__snippet {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-height: 1em;
}
.row__actions {
  position: absolute;
  top: 8px;
  right: 8px;
  /* Keep the dropdown trigger in layout (just invisible) instead of display:none. The trigger
     anchors the Element Plus dropdown popper. With display:none, the instant you click "Pin"
     the note re-sorts and slides out from under the cursor → the row loses :hover → the trigger
     collapses to a 0×0 rect → Floating-UI repositions the (closing) popper to the viewport
     origin, painting a full-size menu in the TOP-LEFT corner for a frame. visibility:hidden
     keeps a valid bounding rect at all times, so the popper can never anchor to the origin.
     (position:absolute, so staying laid out costs no row layout; visibility:hidden also drops
     pointer events, so clicks still pass through to the row.) */
  visibility: hidden;
  opacity: 0;
  transition: opacity var(--bn-transition);
}
.row:hover .row__actions {
  visibility: visible;
  opacity: 1;
}
.row__more {
  color: var(--bn-text-muted);
  padding: 2px;
  border-radius: 4px;
}
.row__more:hover {
  background: var(--bn-selection-strong);
  color: var(--bn-text);
}
.row__trash-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: none;
  gap: 8px;
}
.row:hover .row__trash-actions {
  display: flex;
}
.row__trash-action {
  color: var(--bn-text-muted);
  cursor: pointer;
}
.row__trash-action:hover {
  color: var(--bn-accent-strong);
}
.row__trash-action.danger:hover {
  color: #e0698a;
}
</style>
