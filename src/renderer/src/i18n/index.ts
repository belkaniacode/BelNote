import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import ru from './locales/ru.json'

// Locales live in standalone JSON files (./locales/*.json). To add a new language,
// drop a <lang>.json next to en.json/ru.json and register it in `messages` below —
// no other code changes needed.
export const SUPPORTED_LOCALES = ['ru', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

const STORAGE_KEY = 'belnote.locale'

function initialLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
  if (saved && SUPPORTED_LOCALES.includes(saved)) return saved
  const sys = navigator.language.slice(0, 2)
  return (SUPPORTED_LOCALES as readonly string[]).includes(sys) ? (sys as Locale) : 'ru'
}

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { en, ru }
})

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
}
