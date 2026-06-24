import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Folder, Note, SearchHit } from '@shared/types'
import { ALL_NOTES, RECENTLY_DELETED } from '@shared/types'

export type ViewId = number | typeof ALL_NOTES | typeof RECENTLY_DELETED

const AUTOSAVE_MS = 600

/**
 * The renderer's single source of truth. Mirrors the SQLite data via window.api.
 *
 * IMPORTANT (anti-flicker): note mutations update the in-memory list IN PLACE — they never
 * reload the whole list from the DB on each op. Reloading replaces every Note object with a
 * fresh instance, which forces every list row (and its Element Plus dropdown) to re-render and
 * resets scroll — the visible "jerk/redraw". Keeping object identity stable means Vue only
 * patches the one row that changed. Counts are refreshed by merging fields into the existing
 * `counts` object rather than replacing it, so the sidebar only updates the changed numbers.
 */
export const useNotesStore = defineStore('notes', () => {
  const folders = ref<Folder[]>([])
  const notes = ref<Note[]>([])
  const searchHits = ref<SearchHit[]>([])
  const counts = ref<{ all: number; trash: number; byFolder: Record<number, number> }>({
    all: 0,
    trash: 0,
    byFolder: {}
  })

  const selectedView = ref<ViewId>(ALL_NOTES)
  // Bumped only when a note is freshly created, to tell the editor to grab focus for typing.
  // (Plain selection must NOT focus the editor, or the list loses the Delete-key shortcut.)
  const editorFocusTick = ref(0)
  // Multi-selection: `selectedNoteIds` is the full set (for batch delete); `selectedNoteId`
  // is the active/anchor note shown in the editor. `selectionAnchor` drives shift-range select.
  const selectedNoteIds = ref<number[]>([])
  const selectedNoteId = ref<number | null>(null)
  const selectionAnchor = ref<number | null>(null)
  const searchQuery = ref('')
  // Notes currently being dragged (note rows → sidebar folder). Lets the sidebar know a
  // note-move drag is in progress so only folders highlight as drop targets. Empty when idle.
  const draggingNoteIds = ref<number[]>([])

  const isTrashView = computed(() => selectedView.value === RECENTLY_DELETED)
  const isSearching = computed(() => searchQuery.value.trim().length > 0)

  /** What the notes list actually renders: search results when searching, else the view. */
  const visibleNotes = computed<Note[]>(() => (isSearching.value ? searchHits.value : notes.value))

  const selectedNote = computed<Note | null>(
    () => visibleNotes.value.find((n) => n.id === selectedNoteId.value) ?? null
  )

  /** Folder a new note should land in: the selected folder, or the first folder otherwise. */
  const targetFolderId = computed<number | null>(() => {
    if (typeof selectedView.value === 'number') return selectedView.value
    return folders.value[0]?.id ?? null
  })

  // ---- helpers ----

  function sortNotes(): void {
    notes.value.sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt || b.id - a.id
    )
  }

  /** Remove notes from the in-memory lists by id (keeps remaining objects' identity). */
  function removeLocal(ids: number[]): void {
    const set = new Set(ids)
    notes.value = notes.value.filter((n) => !set.has(n.id))
    searchHits.value = searchHits.value.filter((n) => !set.has(n.id))
  }

  /** Set the single active selection. */
  function setActive(id: number | null): void {
    selectedNoteId.value = id
    selectedNoteIds.value = id == null ? [] : [id]
    selectionAnchor.value = id
  }

  /** After removals, drop stale ids and keep a valid active note (falls back to the first). */
  function ensureSelection(): void {
    const visible = visibleNotes.value
    selectedNoteIds.value = selectedNoteIds.value.filter((id) => visible.some((n) => n.id === id))
    if (!selectedNoteIds.value.length) {
      setActive(visible[0]?.id ?? null)
    } else if (!visible.some((n) => n.id === selectedNoteId.value)) {
      selectedNoteId.value = selectedNoteIds.value[selectedNoteIds.value.length - 1]
    }
  }

  // ---- loaders ----

  async function loadFolders(): Promise<void> {
    folders.value = await window.api.folders.list()
  }

  /** Merge fresh counts into the existing object (no top-level replacement → less re-render). */
  async function loadCounts(): Promise<void> {
    const c = await window.api.notes.counts()
    counts.value.all = c.all
    counts.value.trash = c.trash
    counts.value.byFolder = c.byFolder
  }

  async function loadNotes(): Promise<void> {
    if (selectedView.value === ALL_NOTES) notes.value = await window.api.notes.listAll()
    else if (selectedView.value === RECENTLY_DELETED)
      notes.value = await window.api.notes.listDeleted()
    else notes.value = await window.api.notes.listByFolder(selectedView.value)
  }

  /** Full reload — used only on view change, where the whole pane changes anyway. */
  async function refresh(): Promise<void> {
    await Promise.all([loadNotes(), loadCounts()])
    ensureSelection()
  }

  async function init(): Promise<void> {
    await loadFolders()
    await refresh()
    // eslint-disable-next-line no-console
    console.info('[notes.store] initialised')
  }

  // ---- navigation ----

  async function selectView(view: ViewId): Promise<void> {
    flushPending()
    selectedView.value = view
    searchQuery.value = ''
    searchHits.value = []
    setActive(null)
    await refresh()
    // eslint-disable-next-line no-console
    console.info(`[notes.store] view -> ${String(view)}`)
  }

  // ---- selection (single / ctrl-toggle / shift-range) ----

  function selectSingle(id: number): void {
    flushPending() // save the note we're leaving
    setActive(id)
  }

  function toggleSelect(id: number): void {
    flushPending()
    const i = selectedNoteIds.value.indexOf(id)
    selectedNoteIds.value =
      i === -1 ? [...selectedNoteIds.value, id] : selectedNoteIds.value.filter((x) => x !== id)
    selectedNoteId.value = selectedNoteIds.value.length ? id : null
    selectionAnchor.value = id
    // eslint-disable-next-line no-console
    console.info(`[FIX] toggle-select note=${id} -> ${selectedNoteIds.value.length} selected`)
  }

  function selectRange(id: number): void {
    flushPending()
    const ids = visibleNotes.value.map((n) => n.id)
    const a = ids.indexOf(selectionAnchor.value ?? id)
    const b = ids.indexOf(id)
    if (a === -1 || b === -1) return setActive(id)
    const [lo, hi] = a < b ? [a, b] : [b, a]
    selectedNoteIds.value = ids.slice(lo, hi + 1)
    selectedNoteId.value = id
    // eslint-disable-next-line no-console
    console.info(`[FIX] range-select -> ${selectedNoteIds.value.length} selected`)
  }

  // ---- search ----

  async function setSearch(query: string): Promise<void> {
    searchQuery.value = query
    if (!query.trim()) {
      searchHits.value = []
      ensureSelection()
      return
    }
    searchHits.value = await window.api.search.query(query)
    ensureSelection()
  }

  // ---- note mutations (in-place) ----

  async function createNote(): Promise<void> {
    const folderId = targetFolderId.value
    if (folderId == null) return
    const note = await window.api.notes.create(folderId)
    searchQuery.value = ''
    searchHits.value = []
    notes.value.unshift(note)
    sortNotes()
    setActive(note.id)
    editorFocusTick.value++ // new note → focus the editor for immediate typing
    await loadCounts()
    // eslint-disable-next-line no-console
    console.info(`[notes.store] create note=${note.id}`)
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let pending: { id: number; html: string; text: string } | null = null

  async function persist(p: { id: number; html: string; text: string }): Promise<void> {
    try {
      patchLocal(await window.api.notes.update(p.id, p.html, p.text))
      // eslint-disable-next-line no-console
      console.info(`[notes.store] autosave note=${p.id} len=${p.text.length}`)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[notes.store] autosave failed note=${p.id}`, err)
    }
  }

  /** Persist any pending edit immediately (called when switching notes / before quit). */
  function flushPending(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    if (pending) {
      const p = pending
      pending = null
      void persist(p)
    }
  }

  /**
   * Debounced autosave. The editor calls this on every change; we persist after a pause.
   * If a different note is still pending, flush it first so fast note-switching never drops
   * the previous note's edits.
   */
  function saveNoteContent(id: number, html: string, text: string): void {
    if (pending && pending.id !== id) flushPending()
    pending = { id, html, text }
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const p = pending
      pending = null
      saveTimer = null
      if (p) void persist(p)
    }, AUTOSAVE_MS)
  }

  /** Replace a note's fields in-place and re-sort so title/snippet/order update live. */
  function patchLocal(updated: Note): void {
    const target = notes.value.find((n) => n.id === updated.id)
    if (target) Object.assign(target, updated)
    const hit = searchHits.value.find((n) => n.id === updated.id)
    if (hit) Object.assign(hit, updated)
    sortNotes()
  }

  async function setPinned(id: number, pinned: boolean): Promise<void> {
    await window.api.notes.setPinned(id, pinned)
    const n = notes.value.find((x) => x.id === id)
    if (n) n.pinned = pinned
    const h = searchHits.value.find((x) => x.id === id)
    if (h) h.pinned = pinned
    sortNotes()
  }

  // Move one or more notes into a folder (used by drag-and-drop onto a sidebar folder).
  async function moveNotes(ids: number[], folderId: number): Promise<void> {
    const moved = ids.filter((id) => {
      const n = notes.value.find((x) => x.id === id)
      return n && n.folderId !== folderId
    })
    if (!moved.length) return
    for (const id of moved) {
      await window.api.notes.move(id, folderId)
      const n = notes.value.find((x) => x.id === id)
      if (n) n.folderId = folderId
    }
    // Leaving a specific-folder view? Those notes no longer belong in this list.
    if (typeof selectedView.value === 'number' && selectedView.value !== folderId) {
      removeLocal(moved)
      ensureSelection()
    }
    await loadCounts()
    // eslint-disable-next-line no-console
    console.info(`[FIX] moved ${moved.length} note(s) -> folder ${folderId}: ${moved.join(',')}`)
  }

  async function moveNote(id: number, folderId: number): Promise<void> {
    await moveNotes([id], folderId)
  }

  // ---- Drag-and-drop state (note rows → sidebar folders) ----
  function startDraggingNotes(ids: number[]): void {
    draggingNoteIds.value = [...ids]
  }
  function endDraggingNotes(): void {
    draggingNoteIds.value = []
  }

  // single-item wrappers delegate to the batch versions

  async function trashSelected(): Promise<void> {
    const ids = [...selectedNoteIds.value]
    if (!ids.length) return
    for (const id of ids) await window.api.notes.trash(id)
    removeLocal(ids)
    ensureSelection()
    await loadCounts()
    // eslint-disable-next-line no-console
    console.info(`[FIX] trashed ${ids.length} note(s): ${ids.join(',')}`)
  }

  async function hardDeleteSelected(): Promise<void> {
    const ids = [...selectedNoteIds.value]
    if (!ids.length) return
    for (const id of ids) await window.api.notes.hardDelete(id)
    removeLocal(ids)
    ensureSelection()
    await loadCounts()
    // eslint-disable-next-line no-console
    console.info(`[FIX] permanently deleted ${ids.length} note(s)`)
  }

  async function trashNote(id: number): Promise<void> {
    await window.api.notes.trash(id)
    removeLocal([id])
    ensureSelection()
    await loadCounts()
  }

  async function restoreNote(id: number): Promise<void> {
    await window.api.notes.restore(id)
    removeLocal([id])
    ensureSelection()
    await loadCounts()
  }

  async function hardDeleteNote(id: number): Promise<void> {
    await window.api.notes.hardDelete(id)
    removeLocal([id])
    ensureSelection()
    await loadCounts()
  }

  async function emptyTrash(): Promise<void> {
    await window.api.notes.emptyTrash()
    notes.value = []
    searchHits.value = []
    setActive(null)
    await loadCounts()
  }

  // ---- folder mutations ----

  async function createFolder(name: string): Promise<void> {
    const folder = await window.api.folders.create(name)
    await loadFolders()
    await selectView(folder.id)
  }

  async function renameFolder(id: number, name: string): Promise<void> {
    await window.api.folders.rename(id, name)
    await loadFolders()
  }

  async function deleteFolder(id: number): Promise<void> {
    await window.api.folders.delete(id)
    await loadFolders()
    if (selectedView.value === id) await selectView(ALL_NOTES)
    else await loadCounts()
  }

  return {
    // state
    folders,
    notes,
    counts,
    selectedView,
    selectedNoteId,
    selectedNoteIds,
    searchQuery,
    editorFocusTick,
    draggingNoteIds,
    // getters
    isTrashView,
    isSearching,
    visibleNotes,
    selectedNote,
    targetFolderId,
    // actions
    init,
    selectView,
    selectSingle,
    toggleSelect,
    selectRange,
    setSearch,
    createNote,
    saveNoteContent,
    flushPending,
    setPinned,
    moveNote,
    moveNotes,
    startDraggingNotes,
    endDraggingNotes,
    trashNote,
    trashSelected,
    restoreNote,
    hardDeleteNote,
    hardDeleteSelected,
    emptyTrash,
    createFolder,
    renameFolder,
    deleteFolder
  }
})
