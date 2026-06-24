<script setup lang="ts">
import { computed } from 'vue'
import { Document } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useNotesStore } from '../stores/notes'
import { relativeDate } from '../utils/relativeDate'
import NoteEditor from './NoteEditor.vue'

// Right pane: shows the selected note (read-only in the trash view) with autosave + an
// "Edited <when>" meta line, or a centred empty state when nothing is selected.
const { t } = useI18n()
const store = useNotesStore()

const note = computed(() => store.selectedNote)
const editable = computed(() => !store.isTrashView)

function onChange(payload: { html: string; text: string }): void {
  if (note.value) store.saveNoteContent(note.value.id, payload.html, payload.text)
}
</script>

<template>
  <section class="editor-pane">
    <template v-if="note">
      <div class="editor-pane__meta">{{ t('editor.edited', { when: relativeDate(note.updatedAt) }) }}</div>
      <div class="editor-pane__body">
        <!-- :key remounts the editor with fresh content when the selected note changes. -->
        <NoteEditor
          :key="note.id"
          :content="note.contentHtml"
          :editable="editable"
          @change="onChange"
        />
      </div>
    </template>

    <div v-else class="editor-pane__empty">
      <el-icon class="editor-pane__empty-icon"><Document /></el-icon>
      <span class="editor-pane__empty-title">{{ t('editor.empty_title') }}</span>
      <span class="editor-pane__empty-hint">{{ t('editor.empty_hint') }}</span>
    </div>
  </section>
</template>

<style scoped>
.editor-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.editor-pane__meta {
  text-align: center;
  font-size: 11.5px;
  color: var(--bn-text-faint);
  padding: 10px 0 4px;
}
.editor-pane__body {
  flex: 1;
  overflow: hidden;
  padding: 4px 48px 24px;
  max-width: 820px;
  width: 100%;
  margin: 0 auto;
}
.editor-pane__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--bn-text-muted);
}
.editor-pane__empty-icon {
  font-size: 40px;
  color: var(--bn-text-faint);
  margin-bottom: 4px;
}
.editor-pane__empty-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--bn-text);
}
.editor-pane__empty-hint {
  font-size: 13px;
  color: var(--bn-text-faint);
  max-width: 260px;
  text-align: center;
}
</style>
