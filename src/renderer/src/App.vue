<script setup lang="ts">
import { onMounted } from 'vue'
import { useNotesStore } from './stores/notes'
import SidebarPane from './components/SidebarPane.vue'
import NotesListPane from './components/NotesListPane.vue'
import EditorPane from './components/EditorPane.vue'

// macOS Notes three-pane shell: Sidebar │ Notes list │ Editor.
// All data flows through the Pinia store, hydrated from SQLite on mount.
const store = useNotesStore()

onMounted(() => {
  store.init()
  // eslint-disable-next-line no-console
  console.info('[app] layout mounted')
})
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
