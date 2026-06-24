<script setup lang="ts">
/**
 * NoteEditor — the whole point of the Electron/Vue rewrite.
 *
 * TipTap (ProseMirror) gives a single ALWAYS-EDITABLE surface where:
 *  - URLs become real <a> links: styled as links AND editable in place, click opens the
 *    system browser (handled in the Electron main process via setWindowOpenHandler).
 *  - code blocks render as code (syntax highlighted via lowlight), not plain text;
 *  - task lists (checkboxes) are interactive.
 * This is exactly the behaviour flet could not provide.
 */
import { onBeforeUnmount, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const lowlight = createLowlight(common)

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [html: string] }>()

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit.configure({ codeBlock: false }),
    CodeBlockLowlight.configure({ lowlight }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: () => t('editor.placeholder') }),
    Link.configure({
      openOnClick: true, // clicking a link opens it (routed to the real browser by main)
      autolink: true, // typing a bare URL turns it into a link automatically
      linkOnPaste: true,
      HTMLAttributes: { rel: 'noopener noreferrer' }
    })
  ],
  autofocus: true, // always-editable: the caret is ready immediately, no click needed
  onUpdate: ({ editor }) => emit('update:modelValue', editor.getHTML())
})

// Keep external content changes (e.g. switching notes) in sync without clobbering edits.
watch(
  () => props.modelValue,
  (value) => {
    if (editor.value && value !== editor.value.getHTML()) {
      editor.value.commands.setContent(value, false)
    }
  }
)

onBeforeUnmount(() => editor.value?.destroy())

function toggle(cmd: 'bold' | 'italic' | 'code' | 'codeBlock' | 'taskList'): void {
  const chain = editor.value?.chain().focus()
  if (!chain) return
  ;({
    bold: () => chain.toggleBold().run(),
    italic: () => chain.toggleItalic().run(),
    code: () => chain.toggleCode().run(),
    codeBlock: () => chain.toggleCodeBlock().run(),
    taskList: () => chain.toggleTaskList().run()
  })[cmd]()
}
</script>

<template>
  <div v-if="editor" class="note-editor">
    <div class="note-editor__toolbar">
      <el-button-group>
        <el-button size="small" :type="editor.isActive('bold') ? 'primary' : ''" @click="toggle('bold')">B</el-button>
        <el-button size="small" :type="editor.isActive('italic') ? 'primary' : ''" @click="toggle('italic')"><i>I</i></el-button>
        <el-button size="small" :type="editor.isActive('code') ? 'primary' : ''" @click="toggle('code')">&lt;/&gt;</el-button>
        <el-button size="small" :type="editor.isActive('codeBlock') ? 'primary' : ''" @click="toggle('codeBlock')">{{ t('toolbar.code_block') }}</el-button>
        <el-button size="small" :type="editor.isActive('taskList') ? 'primary' : ''" @click="toggle('taskList')">{{ t('toolbar.task_list') }}</el-button>
      </el-button-group>
    </div>
    <editor-content class="note-editor__content" :editor="editor" />
  </div>
</template>

<style scoped>
.note-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.note-editor__toolbar {
  padding: 8px 0 12px;
}
.note-editor__content {
  flex: 1;
  overflow-y: auto;
}
:deep(.ProseMirror) {
  outline: none;
  line-height: 1.5;
  font-size: 15px;
  color: var(--bn-text);
}
:deep(.ProseMirror a) {
  color: var(--bn-accent);
  text-decoration: underline;
  cursor: pointer;
}
:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--bn-text-muted);
  float: left;
  height: 0;
  pointer-events: none;
}
:deep(.ProseMirror pre) {
  background: #14131a;
  border: 1px solid var(--bn-divider);
  border-radius: 8px;
  padding: 12px 14px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px;
  overflow-x: auto;
}
:deep(.ProseMirror code) {
  background: #14131a;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: ui-monospace, monospace;
  font-size: 0.92em;
}
:deep(.ProseMirror ul[data-type='taskList']) {
  list-style: none;
  padding-left: 0;
}
:deep(.ProseMirror ul[data-type='taskList'] li) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
:deep(.ProseMirror ul[data-type='taskList'] li > label) {
  margin-top: 2px;
}
</style>
