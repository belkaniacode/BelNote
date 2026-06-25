/**
 * Last-position session persistence: which view (folder / All / Trash) and which note the
 * user was on, so reopening the app lands exactly where they left off. Mirrors the
 * localStorage pattern in composables/useLayout.ts. Kept deliberately tiny and tolerant —
 * a corrupt/absent value just means "no saved session".
 */
const STORAGE_KEY = 'belnote.session'

export interface SessionState {
  /** A ViewId: a folder id (number) or the ALL_NOTES / RECENTLY_DELETED sentinels (strings). */
  view: number | string
  noteId: number | null
}

export function loadSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionState
    if (parsed && (typeof parsed.view === 'number' || typeof parsed.view === 'string')) {
      return { view: parsed.view, noteId: typeof parsed.noteId === 'number' ? parsed.noteId : null }
    }
  } catch {
    /* ignore corrupt value */
  }
  return null
}

export function saveSession(state: SessionState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}
