<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Sunny, Moon, Monitor } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings'
import { useNotesStore } from '../stores/notes'
import { SUPPORTED_LOCALES, type Locale } from '../i18n'
import type { ThemeMode } from '../composables/useTheme'

/**
 * Settings dialog: Appearance (theme + language, moved out of the sidebar footer) and Data
 * (encrypted export / merge import). All crypto + file I/O happens in the main process; here we
 * only collect the passphrase and show the outcome. The passphrase is never logged.
 */
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const { t } = useI18n()
const settings = useSettingsStore()
const notes = useNotesStore()

const themes: { mode: ThemeMode; icon: unknown; label: string }[] = [
  { mode: 'light', icon: Sunny, label: t('settings.theme_light') },
  { mode: 'dark', icon: Moon, label: t('settings.theme_dark') },
  { mode: 'system', icon: Monitor, label: t('settings.theme_system') }
]

const MIN_PASSWORD = 8
type Panel = 'none' | 'export' | 'import'
const panel = ref<Panel>('none')
const busy = ref(false)
const exportPass = ref('')
const exportConfirm = ref('')
const importPass = ref('')

function close(): void {
  emit('update:modelValue', false)
}
function resetPanels(): void {
  panel.value = 'none'
  exportPass.value = ''
  exportConfirm.value = ''
  importPass.value = ''
}
function togglePanel(next: Panel): void {
  panel.value = panel.value === next ? 'none' : next
}

async function doExport(): Promise<void> {
  if (exportPass.value.length < MIN_PASSWORD) {
    ElMessage.error(t('errors.password_short'))
    return
  }
  if (exportPass.value !== exportConfirm.value) {
    ElMessage.error(t('errors.password_mismatch'))
    return
  }
  busy.value = true
  try {
    const res = await window.api.data.export(exportPass.value)
    if ('canceled' in res) return // user dismissed the save dialog — no toast
    ElMessage.success(
      t('settings.export_success', { folders: res.counts.folders, notes: res.counts.notes })
    )
    resetPanels()
    // eslint-disable-next-line no-console
    console.info('[settings] export ok', res.counts)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[settings] export failed', err)
    ElMessage.error(t('errors.generic'))
  } finally {
    busy.value = false
  }
}

async function doImport(): Promise<void> {
  if (importPass.value.length < 1) {
    ElMessage.error(t('errors.password_short'))
    return
  }
  busy.value = true
  try {
    const res = await window.api.data.import(importPass.value, 'merge')
    if ('canceled' in res) return
    if (res.ok) {
      ElMessage.success(
        t('settings.import_success', { folders: res.counts.folders, notes: res.counts.notes })
      )
      await notes.reload() // surface the merged folders/notes without a restart
      resetPanels()
      close()
      // eslint-disable-next-line no-console
      console.info('[settings] import ok', res.counts)
    } else {
      ElMessage.error(t(`errors.${res.error}`))
      // eslint-disable-next-line no-console
      console.warn('[settings] import rejected:', res.error)
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[settings] import failed', err)
    ElMessage.error(t('errors.generic'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    :title="t('settings.title')"
    width="460"
    align-center
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @closed="resetPanels"
  >
    <!-- Appearance -->
    <section class="sec">
      <h4 class="sec__title">{{ t('settings.appearance') }}</h4>
      <div class="sec__row">
        <span class="sec__label">{{ t('settings.theme') }}</span>
        <div class="themes">
          <button
            v-for="opt in themes"
            :key="opt.mode"
            class="theme"
            :class="{ 'is-active': settings.themeMode === opt.mode }"
            :title="opt.label"
            @click="settings.setTheme(opt.mode)"
          >
            <el-icon><component :is="opt.icon" /></el-icon>
          </button>
        </div>
      </div>
      <div class="sec__row">
        <span class="sec__label">{{ t('settings.language') }}</span>
        <el-select
          :model-value="settings.locale"
          size="small"
          class="lang"
          @update:model-value="(v: Locale) => settings.setLanguage(v)"
        >
          <el-option v-for="l in SUPPORTED_LOCALES" :key="l" :label="l.toUpperCase()" :value="l" />
        </el-select>
      </div>
    </section>

    <el-divider />

    <!-- Data (encrypted export / import) -->
    <section class="sec">
      <h4 class="sec__title">{{ t('settings.data') }}</h4>
      <p class="sec__hint">{{ t('settings.data_hint') }}</p>
      <div class="data__actions">
        <el-button :type="panel === 'export' ? 'primary' : 'default'" @click="togglePanel('export')">
          {{ t('settings.export') }}
        </el-button>
        <el-button :type="panel === 'import' ? 'primary' : 'default'" @click="togglePanel('import')">
          {{ t('settings.import') }}
        </el-button>
      </div>

      <div v-if="panel === 'export'" class="panel">
        <el-input
          v-model="exportPass"
          type="password"
          show-password
          size="small"
          :placeholder="t('settings.password')"
        />
        <el-input
          v-model="exportConfirm"
          type="password"
          show-password
          size="small"
          :placeholder="t('settings.password_confirm')"
          @keyup.enter="doExport"
        />
        <p class="panel__hint">{{ t('settings.password_hint') }}</p>
        <el-button type="primary" :loading="busy" @click="doExport">
          {{ t('settings.encrypt_save') }}
        </el-button>
      </div>

      <div v-if="panel === 'import'" class="panel">
        <el-input
          v-model="importPass"
          type="password"
          show-password
          size="small"
          :placeholder="t('settings.password')"
          @keyup.enter="doImport"
        />
        <p class="panel__hint">{{ t('settings.import_password_hint') }}</p>
        <el-button type="primary" :loading="busy" @click="doImport">
          {{ t('settings.decrypt_import') }}
        </el-button>
      </div>
    </section>
  </el-dialog>
</template>

<style scoped>
.sec {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sec__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--bn-text);
}
.sec__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--bn-text-muted);
}
.sec__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sec__label {
  font-size: 13px;
  color: var(--bn-text-muted);
}
.themes {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--bn-hover);
  border-radius: var(--bn-radius-sm);
}
.theme {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--bn-text-muted);
  border-radius: 5px;
  cursor: pointer;
  transition: all var(--bn-transition);
}
.theme:hover {
  color: var(--bn-text);
}
.theme.is-active {
  background: var(--bn-surface);
  color: var(--bn-accent-strong);
  box-shadow: var(--bn-shadow);
}
.lang {
  width: 96px;
}
.data__actions {
  display: flex;
  gap: 8px;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  margin-top: 4px;
  background: var(--bn-hover);
  border-radius: var(--bn-radius-sm);
}
.panel__hint {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--bn-text-faint);
}
</style>
