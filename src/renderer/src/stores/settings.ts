import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useTheme, setThemeMode, type ThemeMode } from '../composables/useTheme'
import { setLocale, i18n, type Locale } from '../i18n'

/**
 * UI preferences: theme mode and language. Thin wrapper over the theme composable and the
 * i18n helper so components have a single reactive place to read/set both.
 */
export const useSettingsStore = defineStore('settings', () => {
  const { mode, effective } = useTheme()
  const locale = ref<Locale>(i18n.global.locale.value as Locale)

  function setTheme(next: ThemeMode): void {
    setThemeMode(next)
  }

  function setLanguage(next: Locale): void {
    setLocale(next)
    locale.value = next
    // eslint-disable-next-line no-console
    console.info(`[settings.store] locale -> ${next}`)
  }

  return { themeMode: mode, effectiveTheme: effective, locale, setTheme, setLanguage }
})
