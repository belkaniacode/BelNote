<script setup lang="ts">
import { ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Document, Folder, Delete, Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useNotesStore } from '../stores/notes'
import { ALL_NOTES, RECENTLY_DELETED } from '@shared/types'
import AppControls from './AppControls.vue'

const { t } = useI18n()
const store = useNotesStore()

// Folder currently highlighted as a drop target during a note drag (see NotesListPane).
const dropTargetId = ref<number | null>(null)

function onFolderDragOver(e: DragEvent, folderId: number): void {
  if (!store.draggingNoteIds.length) return // not a note drag — ignore
  e.preventDefault() // allow the drop
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropTargetId.value = folderId
}

function onFolderDragLeave(e: DragEvent, folderId: number): void {
  // Ignore leaves into child elements of the same button; only clear when truly leaving it.
  const related = e.relatedTarget as Node | null
  if ((e.currentTarget as HTMLElement).contains(related)) return
  if (dropTargetId.value === folderId) dropTargetId.value = null
}

async function onFolderDrop(folderId: number): Promise<void> {
  dropTargetId.value = null
  const ids = [...store.draggingNoteIds]
  store.endDraggingNotes()
  if (ids.length) await store.moveNotes(ids, folderId)
}

async function newFolder(): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt(t('sidebar.new_folder_name'), t('sidebar.new_folder'), {
      confirmButtonText: t('common.create'),
      cancelButtonText: t('common.cancel'),
      inputPattern: /\S+/,
      inputErrorMessage: t('sidebar.new_folder_name')
    })
    await store.createFolder(value)
  } catch {
    /* cancelled */
  }
}

async function renameFolder(id: number, current: string): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt(t('sidebar.rename'), t('sidebar.rename'), {
      confirmButtonText: t('common.ok'),
      cancelButtonText: t('common.cancel'),
      inputValue: current,
      inputPattern: /\S+/
    })
    await store.renameFolder(id, value)
  } catch {
    /* cancelled */
  }
}

async function deleteFolder(id: number): Promise<void> {
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
}
</script>

<template>
  <aside class="sidebar">
    <nav class="sidebar__nav">
      <button
        class="sidebar__item"
        :class="{ 'is-active': store.selectedView === ALL_NOTES }"
        @click="store.selectView(ALL_NOTES)"
      >
        <el-icon class="sidebar__icon"><Document /></el-icon>
        <span class="sidebar__label">{{ t('sidebar.all_notes') }}</span>
        <span class="sidebar__count">{{ store.counts.all || '' }}</span>
      </button>

      <div class="sidebar__section">
        <span class="sidebar__section-title">{{ t('sidebar.folders') }}</span>
        <button class="sidebar__add" :title="t('sidebar.new_folder')" @click="newFolder">
          <el-icon><Plus /></el-icon>
        </button>
      </div>

      <button
        v-for="folder in store.folders"
        :key="folder.id"
        class="sidebar__item sidebar__folder"
        :data-folder-id="folder.id"
        :class="{ 'is-active': store.selectedView === folder.id, 'is-drop-target': dropTargetId === folder.id }"
        @click="store.selectView(folder.id)"
        @dblclick="renameFolder(folder.id, folder.name)"
        @dragover="onFolderDragOver($event, folder.id)"
        @dragleave="onFolderDragLeave($event, folder.id)"
        @drop="onFolderDrop(folder.id)"
      >
        <el-icon class="sidebar__icon"><Folder /></el-icon>
        <span class="sidebar__label">{{ folder.name }}</span>
        <span class="sidebar__count">{{ store.counts.byFolder[folder.id] || '' }}</span>
        <span class="sidebar__actions">
          <el-icon class="sidebar__action" @click.stop="deleteFolder(folder.id)"><Delete /></el-icon>
        </span>
      </button>

      <div class="sidebar__spacer" />

      <button
        class="sidebar__item"
        :class="{ 'is-active': store.selectedView === RECENTLY_DELETED }"
        @click="store.selectView(RECENTLY_DELETED)"
      >
        <el-icon class="sidebar__icon"><Delete /></el-icon>
        <span class="sidebar__label">{{ t('sidebar.recently_deleted') }}</span>
        <span class="sidebar__count">{{ store.counts.trash || '' }}</span>
      </button>
    </nav>

    <AppControls class="sidebar__controls" />
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 14px 8px 8px;
}
.sidebar__nav {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 1px;
  overflow-y: auto;
  /* Required so this flex child can shrink below its content height and actually scroll
     (default min-height:auto would let it grow and overflow instead). */
  min-height: 0;
}
.sidebar__item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: var(--bn-radius-sm);
  background: transparent;
  color: var(--bn-text);
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;
  transition: background var(--bn-transition);
}
.sidebar__item:hover {
  background: var(--bn-hover);
}
.sidebar__item.is-active {
  background: var(--bn-selection);
  color: var(--bn-accent-strong);
}
/* Highlight a folder while a dragged note hovers over it (macOS Notes-style move target). */
.sidebar__folder.is-drop-target {
  background: var(--bn-selection-strong);
  color: var(--bn-accent-strong);
  box-shadow: inset 0 0 0 2px var(--bn-accent);
}
.sidebar__icon {
  color: var(--bn-accent);
  font-size: 15px;
  flex-shrink: 0;
}
.sidebar__item.is-active .sidebar__icon {
  color: var(--bn-accent-strong);
}
.sidebar__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar__count {
  font-size: 12px;
  color: var(--bn-text-muted);
  font-variant-numeric: tabular-nums;
}
.sidebar__actions {
  display: none;
  align-items: center;
}
.sidebar__item:hover .sidebar__actions {
  display: flex;
}
.sidebar__item:hover .sidebar__count {
  display: none;
}
.sidebar__action {
  color: var(--bn-text-muted);
  font-size: 14px;
}
.sidebar__action:hover {
  color: #e0698a;
}
.sidebar__section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 10px 4px;
}
.sidebar__section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--bn-text-faint);
}
.sidebar__add {
  border: none;
  background: transparent;
  color: var(--bn-accent);
  cursor: pointer;
  display: flex;
  padding: 2px;
  border-radius: 5px;
}
.sidebar__add:hover {
  background: var(--bn-hover);
}
.sidebar__spacer {
  flex: 1;
}
.sidebar__controls {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--bn-divider);
}
</style>
