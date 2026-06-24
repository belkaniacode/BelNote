import { ref, readonly } from 'vue'

/**
 * Three-pane layout controller for BelNote.
 *
 * Holds the sidebar/list pane widths and the sidebar collapsed flag. State is loaded
 * synchronously from localStorage at module init (mirroring useTheme) so the very first paint
 * already has the user's sizes — no width flash. Widths are clamped to sane bounds; the editor
 * pane takes the remaining space (1fr) and is kept above EDITOR_MIN by the resize logic.
 */

// Pane width bounds (px) and the resize-handle track width.
export const SIDEBAR_MIN = 170
export const SIDEBAR_MAX = 360
export const LIST_MIN = 220
export const LIST_MAX = 520
export const EDITOR_MIN = 320
export const HANDLE = 6

const STORAGE_KEY = 'belnote.layout'

interface LayoutState {
  sidebarWidth: number
  listWidth: number
  collapsed: boolean
}

const DEFAULTS: LayoutState = { sidebarWidth: 230, listWidth: 300, collapsed: false }

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

function load(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const p = JSON.parse(raw) as Partial<LayoutState>
    return {
      sidebarWidth: clamp(Number(p.sidebarWidth) || DEFAULTS.sidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX),
      listWidth: clamp(Number(p.listWidth) || DEFAULTS.listWidth, LIST_MIN, LIST_MAX),
      collapsed: Boolean(p.collapsed)
    }
  } catch {
    return { ...DEFAULTS }
  }
}

const initial = load()
const sidebarWidth = ref(initial.sidebarWidth)
const listWidth = ref(initial.listWidth)
const collapsed = ref(initial.collapsed)

/** Persist the current layout to localStorage. */
function persist(): void {
  const state: LayoutState = {
    sidebarWidth: sidebarWidth.value,
    listWidth: listWidth.value,
    collapsed: collapsed.value
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  // eslint-disable-next-line no-console
  console.info(
    `[layout] persist sidebar=${state.sidebarWidth} list=${state.listWidth} collapsed=${state.collapsed}`
  )
}

/** Set the sidebar width (clamped). Does not persist — call persist() at drag end. */
function setSidebarWidth(px: number): void {
  sidebarWidth.value = clamp(px, SIDEBAR_MIN, SIDEBAR_MAX)
}

/**
 * Set the list width, clamped to [LIST_MIN, LIST_MAX] and additionally capped so the editor
 * keeps at least EDITOR_MIN given the available width. Does not persist.
 */
function setListWidth(px: number, available: number): void {
  // available = innerWidth minus the (visible) sidebar track + handle tracks.
  const dynamicMax = Math.max(LIST_MIN, Math.min(LIST_MAX, available - EDITOR_MIN))
  listWidth.value = clamp(px, LIST_MIN, dynamicMax)
}

function toggleSidebar(): void {
  collapsed.value = !collapsed.value
  // eslint-disable-next-line no-console
  console.info(`[layout] sidebar ${collapsed.value ? 'collapsed' : 'expanded'}`)
  persist()
}

export function useLayout() {
  return {
    sidebarWidth: readonly(sidebarWidth),
    listWidth: readonly(listWidth),
    collapsed: readonly(collapsed),
    setSidebarWidth,
    setListWidth,
    toggleSidebar,
    persist
  }
}
