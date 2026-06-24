<script setup lang="ts">
import { Sunny, Moon, Monitor } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings'
import { SUPPORTED_LOCALES, type Locale } from '../i18n'
import type { ThemeMode } from '../composables/useTheme'

// Footer controls: theme (Light / Dark / System) + language. Both persist via the store.
const { t } = useI18n()
const settings = useSettingsStore()

const themes: { mode: ThemeMode; icon: unknown; label: string }[] = [
  { mode: 'light', icon: Sunny, label: t('settings.theme_light') },
  { mode: 'dark', icon: Moon, label: t('settings.theme_dark') },
  { mode: 'system', icon: Monitor, label: t('settings.theme_system') }
]
</script>

<template>
  <div class="controls">
    <div class="controls__themes">
      <button
        v-for="opt in themes"
        :key="opt.mode"
        class="controls__theme"
        :class="{ 'is-active': settings.themeMode === opt.mode }"
        :title="opt.label"
        @click="settings.setTheme(opt.mode)"
      >
        <el-icon><component :is="opt.icon" /></el-icon>
      </button>
    </div>

    <el-select
      :model-value="settings.locale"
      size="small"
      class="controls__lang"
      @update:model-value="(v: Locale) => settings.setLanguage(v)"
    >
      <el-option v-for="l in SUPPORTED_LOCALES" :key="l" :label="l.toUpperCase()" :value="l" />
    </el-select>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
}
.controls__themes {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--bn-hover);
  border-radius: var(--bn-radius-sm);
}
.controls__theme {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--bn-text-muted);
  border-radius: 5px;
  cursor: pointer;
  transition: all var(--bn-transition);
}
.controls__theme:hover {
  color: var(--bn-text);
}
.controls__theme.is-active {
  background: var(--bn-surface);
  color: var(--bn-accent-strong);
  box-shadow: var(--bn-shadow);
}
.controls__lang {
  width: 74px;
  margin-left: auto;
}
</style>
