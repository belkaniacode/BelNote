import { i18n } from '../i18n'

/**
 * macOS Notes-style relative date for list rows and the editor meta:
 *  - today      → time (09:42)
 *  - yesterday  → "Yesterday"
 *  - this week  → weekday (Tuesday)
 *  - older      → short date (12 Mar 2026)
 * Localised via the active i18n locale.
 */
export function relativeDate(ts: number): string {
  const locale = i18n.global.locale.value
  const t = i18n.global.t
  const date = new Date(ts)
  const now = new Date()

  const startOfDay = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)

  if (dayDiff <= 0) {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
  }
  if (dayDiff === 1) return t('date.yesterday')
  if (dayDiff < 7) return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date)
}
