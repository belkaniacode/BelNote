<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import NoteEditor from './components/NoteEditor.vue'
import { setLocale, SUPPORTED_LOCALES, type Locale } from './i18n'

const { t, locale } = useI18n()

// Phase-1 prototype: a single in-memory note (no DB yet). Seeded with content that
// exercises the editor — an inline link, a code block, and a task list.
const noteHtml = ref(
  `<h1>${t('demo.note_title')}</h1>` +
    '<p>Документация: <a href="https://dev.profsalon.org/CRM/demo/">https://dev.profsalon.org/CRM/demo/</a></p>' +
    '<p>Почта: <a href="mailto:support@profsalon.org">support@profsalon.org</a> — кликабельна и редактируема.</p>' +
    '<pre><code class="language-bash">make run   # запуск\nmake test  # тесты</code></pre>' +
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">Проверить ссылки</li>' +
    '<li data-type="taskItem" data-checked="true">Создать проект</li></ul>'
)

function onLangChange(value: Locale): void {
  setLocale(value)
}
</script>

<template>
  <div class="app">
    <aside class="app__sidebar">
      <div class="app__brand">BelNote</div>
      <el-select
        :model-value="(locale as Locale)"
        size="small"
        class="app__lang"
        @update:model-value="onLangChange"
      >
        <el-option v-for="l in SUPPORTED_LOCALES" :key="l" :label="l.toUpperCase()" :value="l" />
      </el-select>
    </aside>

    <main class="app__main">
      <NoteEditor v-model="noteHtml" />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-columns: 220px 1fr;
  height: 100vh;
  background: var(--bn-bg);
  color: var(--bn-text);
}
.app__sidebar {
  background: var(--bn-sidebar);
  border-right: 1px solid var(--bn-divider);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.app__brand {
  font-size: 18px;
  font-weight: 700;
}
.app__main {
  padding: 24px 28px;
  overflow: hidden;
}
</style>
