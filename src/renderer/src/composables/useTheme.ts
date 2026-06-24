import { ref, computed, readonly } from 'vue'

/**
 * Theme controller for BelNote.
 *
 * Three user choices — 'light' | 'dark' | 'system'. In 'system' mode the effective
 * theme follows the OS via matchMedia and updates live when the OS preference flips.
 * The chosen mode is persisted; the <html> element carries the resolved 'light'/'dark'
 * class so all CSS tokens (and Element Plus's dark vars) switch in one place.
 */
export type ThemeMode = 'light' | 'dark' | 'system'
export type EffectiveTheme = 'light' | 'dark'

const STORAGE_KEY = 'belnote.theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')

function loadMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
}

const mode = ref<ThemeMode>(loadMode())
const systemDark = ref(media.matches)

const effective = computed<EffectiveTheme>(() => {
  if (mode.value === 'system') return systemDark.value ? 'dark' : 'light'
  return mode.value
})

function apply(): void {
  const theme = effective.value
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
  // eslint-disable-next-line no-console
  console.info(`[theme] -> ${theme}${mode.value === 'system' ? ' (system)' : ''}`)
}

// React to OS changes only while in 'system' mode.
media.addEventListener('change', (e) => {
  systemDark.value = e.matches
  if (mode.value === 'system') apply()
})

export function setThemeMode(next: ThemeMode): void {
  mode.value = next
  localStorage.setItem(STORAGE_KEY, next)
  apply()
}

/** Call once at startup, before mount, to paint the correct theme immediately. */
export function initTheme(): void {
  apply()
}

export function useTheme() {
  return {
    mode: readonly(mode),
    effective: readonly(effective),
    setThemeMode
  }
}
