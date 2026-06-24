<script setup lang="ts">
/**
 * NoteEditor — the always-editable TipTap surface.
 *
 *  - URLs become real <a> links: styled AND editable in place; clicking opens the system
 *    browser (handled in the Electron main process via setWindowOpenHandler).
 *  - code blocks render as syntax-highlighted code (lowlight);
 *  - task lists (checkboxes) are interactive.
 *
 * Emits both the HTML (stored verbatim) and the plain text (used for the title + FTS).
 * The parent gives each note a unique :key so switching notes remounts with fresh content.
 */
import { onBeforeUnmount } from 'vue'
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

const props = withDefaults(defineProps<{ content: string; editable?: boolean }>(), {
  editable: true
})
const emit = defineEmits<{ change: [payload: { html: string; text: string }] }>()

const editor = useEditor({
  content: props.content,
  editable: props.editable,
  extensions: [
    StarterKit.configure({ codeBlock: false }),
    CodeBlockLowlight.configure({ lowlight }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: () => t('editor.placeholder') }),
    Link.configure({
      openOnClick: true,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { rel: 'noopener noreferrer' }
    })
  ],
  autofocus: props.editable ? 'end' : false,
  onUpdate: ({ editor }) => emit('change', { html: editor.getHTML(), text: editor.getText() })
})

onBeforeUnmount(() => editor.value?.destroy())

function toggle(cmd: 'bold' | 'italic' | 'heading' | 'code' | 'codeBlock' | 'taskList' | 'bulletList'): void {
  const chain = editor.value?.chain().focus()
  if (!chain) return
  ;({
    bold: () => chain.toggleBold().run(),
    italic: () => chain.toggleItalic().run(),
    heading: () => chain.toggleHeading({ level: 1 }).run(),
    code: () => chain.toggleCode().run(),
    codeBlock: () => chain.toggleCodeBlock().run(),
    taskList: () => chain.toggleTaskList().run(),
    bulletList: () => chain.toggleBulletList().run()
  })[cmd]()
}
</script>

<template>
  <div v-if="editor" class="note-editor">
    <div v-if="editable" class="note-editor__toolbar">
      <button class="tb" :class="{ on: editor.isActive('heading', { level: 1 }) }" :title="t('toolbar.heading')" @click="toggle('heading')"><b>H</b></button>
      <button class="tb" :class="{ on: editor.isActive('bold') }" :title="t('toolbar.bold')" @click="toggle('bold')"><b>B</b></button>
      <button class="tb" :class="{ on: editor.isActive('italic') }" :title="t('toolbar.italic')" @click="toggle('italic')"><i>I</i></button>
      <span class="tb__sep" />
      <button class="tb" :class="{ on: editor.isActive('bulletList') }" :title="t('toolbar.bullet_list')" @click="toggle('bulletList')">•</button>
      <button class="tb" :class="{ on: editor.isActive('taskList') }" :title="t('toolbar.task_list')" @click="toggle('taskList')">☑</button>
      <span class="tb__sep" />
      <button class="tb" :class="{ on: editor.isActive('code') }" :title="t('toolbar.code')" @click="toggle('code')">&lt;&gt;</button>
      <button class="tb" :class="{ on: editor.isActive('codeBlock') }" :title="t('toolbar.code_block')" @click="toggle('codeBlock')">{ }</button>
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
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 0 10px;
}
.tb {
  min-width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--bn-text-muted);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all var(--bn-transition);
}
.tb:hover {
  background: var(--bn-hover);
  color: var(--bn-text);
}
.tb.on {
  background: var(--bn-selection);
  color: var(--bn-accent-strong);
}
.tb__sep {
  width: 1px;
  height: 16px;
  background: var(--bn-divider);
  margin: 0 4px;
}
.note-editor__content {
  flex: 1;
  overflow-y: auto;
}
:deep(.ProseMirror) {
  outline: none;
  line-height: 1.55;
  font-size: 15px;
  color: var(--bn-text);
}
:deep(.ProseMirror h1) {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 0.3em 0 0.4em;
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
  background: var(--bn-code-bg);
  border: 1px solid var(--bn-divider);
  border-radius: 8px;
  padding: 12px 14px;
  font-family: var(--bn-font-mono);
  font-size: 13px;
  overflow-x: auto;
}
:deep(.ProseMirror code) {
  background: var(--bn-code-bg);
  border-radius: 4px;
  padding: 1px 5px;
  font-family: var(--bn-font-mono);
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
  margin-top: 3px;
}
</style>
