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

const props = withDefaults(
  defineProps<{ content: string; editable?: boolean; focusSignal?: number }>(),
  { editable: true, focusSignal: 0 }
)
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
  // Never auto-focus on selection — that would pull keyboard focus into the editor and the
  // list would lose the global Delete shortcut. Focus is requested explicitly via focusSignal.
  autofocus: false,
  onUpdate: ({ editor }) => emit('change', { html: editor.getHTML(), text: editor.getText() })
})

// Switch notes by reusing this single editor instance (NOT a :key remount): re-creating
// ProseMirror on every selection is heavy and causes the visible flash/jank. setContent with
// emitUpdate=false swaps the document without triggering a spurious autosave.
watch(
  () => props.content,
  (val) => {
    if (!editor.value || val === editor.value.getHTML()) return
    editor.value.commands.setContent(val, false)
  }
)
watch(
  () => props.editable,
  (v) => editor.value?.setEditable(v)
)
// Focus only when the parent bumps the signal (i.e. a note was just created), so a brand-new
// note is ready to type without stealing focus on ordinary selection.
watch(
  () => props.focusSignal,
  () => {
    if (props.editable) editor.value?.commands.focus('end')
  }
)

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
  /* min-height:0 lets a long note scroll inside this pane instead of expanding it. */
  min-height: 0;
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
:deep(.ProseMirror h2) {
  font-size: 18px;
  font-weight: 700;
  margin: 0.3em 0 0.3em;
}
:deep(.ProseMirror p) {
  margin: 0.45em 0;
}
/* Regular bullet/ordered lists (NOT the task list, which is styled separately). */
:deep(.ProseMirror ul:not([data-type='taskList'])),
:deep(.ProseMirror ol) {
  padding-left: 1.4em;
  margin: 0.45em 0;
}
:deep(.ProseMirror ul:not([data-type='taskList'])) {
  list-style: disc;
}
:deep(.ProseMirror ol) {
  list-style: decimal;
}
:deep(.ProseMirror li > p) {
  margin: 0.15em 0;
}
:deep(.ProseMirror blockquote) {
  border-left: 3px solid var(--bn-accent);
  margin: 0.5em 0;
  padding-left: 12px;
  color: var(--bn-text-muted);
}
:deep(.ProseMirror strong) {
  font-weight: 700;
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
/* The inline-code chrome above also matches the <code> inside a code block (<pre><code>).
   Because <code> is inline, its left padding only applies to the START of the inline box —
   the first line — so the first line gets indented while the rest sit flush. Reset the inner
   <code> entirely; the <pre> owns the code block's background/padding. */
:deep(.ProseMirror pre code) {
  background: none;
  border-radius: 0;
  padding: 0;
  font-size: inherit;
  color: inherit;
}
:deep(.ProseMirror ul[data-type='taskList']) {
  list-style: none;
  padding-left: 0;
  margin: 0.4em 0;
}
:deep(.ProseMirror ul[data-type='taskList'] li) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 2px 0;
}
/* Checkbox stays a fixed box on the left; the text fills the rest and sits inline with it.
   The inner <div>/<p> margins must be zeroed or the text drops below the checkbox. The label is
   given the same height as one text line and centers the checkbox in it, so the box lines up with
   the middle of the first line instead of sitting at the top. */
:deep(.ProseMirror ul[data-type='taskList'] li > label) {
  flex: 0 0 auto;
  margin: 0;
  user-select: none;
  display: inline-flex;
  align-items: center;
  height: 1.55em; /* matches .ProseMirror line-height so the checkbox aligns with the text */
}
:deep(.ProseMirror ul[data-type='taskList'] li > div) {
  flex: 1 1 auto;
  min-width: 0;
}
:deep(.ProseMirror ul[data-type='taskList'] li > div > p) {
  margin: 0;
}
/* A checked task is done → strike through and dim its text (macOS Notes behaviour). */
:deep(.ProseMirror ul[data-type='taskList'] li[data-checked='true'] > div) {
  text-decoration: line-through;
  color: var(--bn-text-muted);
}
:deep(.ProseMirror ul[data-type='taskList'] input[type='checkbox']) {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--bn-accent-strong);
  cursor: pointer;
}
</style>
