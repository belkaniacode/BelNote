<script setup lang="ts">
import { ref } from 'vue'
import { Setting } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import SettingsModal from './SettingsModal.vue'

// Sidebar footer: a single gear button that opens the Settings modal (theme, language, and
// encrypted data export/import all live inside the modal now).
const { t } = useI18n()
const open = ref(false)
</script>

<template>
  <div class="controls">
    <button class="controls__gear" :title="t('settings.open')" @click="open = true">
      <el-icon><Setting /></el-icon>
      <span class="controls__gear-label">{{ t('settings.title') }}</span>
    </button>

    <SettingsModal v-model="open" />
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  align-items: center;
  padding: 4px 6px;
}
.controls__gear {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: var(--bn-text-muted);
  border-radius: var(--bn-radius-sm);
  cursor: pointer;
  font-size: 13px;
  transition: all var(--bn-transition);
}
.controls__gear:hover {
  background: var(--bn-hover);
  color: var(--bn-text);
}
.controls__gear-label {
  font-weight: 500;
}
</style>
