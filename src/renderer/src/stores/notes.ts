import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Folder, Note, SearchHit } from '@shared/types'
import { ALL_NOTES, RECENTLY_DELETED } from '@shared/types'
import { loadSession, saveSession } from '../utils/session'

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
  // Async-load state. `loading` is true while a view's notes are (re)loaded; `initializing`
  // is true only during the very first hydrate on launch. `slowLoading` becomes true ONLY if a
  // load actually takes a while (> SLOW_MS) — SQLite reads are usually instant, so binding
  // skeletons to raw `loading` made them flash for a single frame on every folder switch (the
  // "jerk"). Skeletons bind to `slowLoading`, so a fast switch shows no skeleton at all.
  const loading = ref(false)
  const slowLoading = ref(false)
  const initializing = ref(true)
  const SLOW_MS = 150
  let slowTimer: ReturnType<typeof setTimeout> | null = null

  function beginLoading(): void {
    loading.value = true
    if (slowTimer) clearTimeout(slowTimer)
    slowTimer = setTimeout(() => {
      slowLoading.value = true
    }, SLOW_MS)
  }
  function endLoading(): void {
    loading.value = false
    if (slowTimer) clearTimeout(slowTimer)
    slowTimer = null
    slowLoading.value = false
  }
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
  // Multi-selected folders (Ctrl/Shift-click in the sidebar) for batch delete — independent of
  // `selectedView` (which folder's notes are shown). `folderAnchor` drives shift-range select.
  const selectedFolderIds = ref<number[]>([])
  const folderAnchor = ref<number | null>(null)

  // Undo/redo command stack for destructive actions (note trash, folder delete). Each entry
  // knows how to reverse itself and re-apply itself; keyboard-only (see App.vue). "Delete
  // forever" and emptying the trash are intentionally NOT undoable.
  type UndoEntry = { undo: () => Promise<void>; redo: () => Promise<void> }
  const undoStack = ref<UndoEntry[]>([])
  const redoStack = ref<UndoEntry[]>([])

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

  /** Is a persisted/raw view id still valid (a known folder, or one of the sentinels)? */
  function isValidView(view: number | string): view is ViewId {
    if (view === ALL_NOTES || view === RECENTLY_DELETED) return true
    return typeof view === 'number' && folders.value.some((f) => f.id === view)
  }

  async function init(): Promise<void> {
    initializing.value = true
    beginLoading()
    try {
      await loadFolders()
      // Restore the last view BEFORE loading notes so the first paint is the right pane.
      const saved = loadSession()
      if (saved && isValidView(saved.view)) selectedView.value = saved.view
      await refresh() // ensureSelection() picks the first note as a default
      // Then prefer the exact note the user left on, if it still exists in this view.
      if (saved && saved.noteId != null && visibleNotes.value.some((n) => n.id === saved.noteId)) {
        setActive(saved.noteId)
      }
      // eslint-disable-next-line no-console
      console.info(`[notes.store] initialised view=${String(selectedView.value)} note=${selectedNoteId.value}`)
    } finally {
      endLoading()
      initializing.value = false
    }
  }

  /** Re-hydrate folders + current view from the DB (e.g. after an import merged new data). */
  async function reload(): Promise<void> {
    beginLoading()
    try {
      await loadFolders()
      await refresh()
    } finally {
      endLoading()
    }
    // eslint-disable-next-line no-console
    console.info(`[notes.store] reloaded (folders=${folders.value.length})`)
  }

  // Persist "where I am" (view + active note) on any change, so a relaunch restores it.
  watch([selectedView, selectedNoteId], () => {
    saveSession({ view: selectedView.value as number | string, noteId: selectedNoteId.value })
  })

  // ---- navigation ----

  async function selectView(view: ViewId): Promise<void> {
    flushPending()
    clearFolderSelection() // navigating away drops any folder multi-selection
    beginLoading()
    selectedView.value = view
    searchQuery.value = ''
    searchHits.value = []
    setActive(null) // editor goes blank (no empty-state, no skeleton) until the load resolves
    try {
      await refresh() // loads the new view's notes, then ensureSelection() picks the first
    } finally {
      endLoading()
    }
    // eslint-disable-next-line no-console
    console.info(`[notes.store] view -> ${String(view)} (loaded ${visibleNotes.value.length})`)
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
    pushUndo({
      undo: async () => {
        for (const id of ids) await window.api.notes.restore(id)
        await refresh()
      },
      redo: async () => {
        for (const id of ids) await window.api.notes.trash(id)
        await refresh()
      }
    })
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
    pushUndo({
      undo: async () => {
        await window.api.notes.restore(id)
        await refresh()
      },
      redo: async () => {
        await window.api.notes.trash(id)
        await refresh()
      }
    })
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

  // ---- undo / redo ----

  function pushUndo(entry: UndoEntry): void {
    undoStack.value.push(entry)
    redoStack.value = [] // a new action invalidates the redo history
    if (undoStack.value.length > 50) undoStack.value.shift()
  }

  async function undo(): Promise<void> {
    const entry = undoStack.value.pop()
    if (!entry) return
    await entry.undo()
    redoStack.value.push(entry)
    // eslint-disable-next-line no-console
    console.info(`[FIX] undo (stack: ${undoStack.value.length} undo / ${redoStack.value.length} redo)`)
  }

  async function redo(): Promise<void> {
    const entry = redoStack.value.pop()
    if (!entry) return
    await entry.redo()
    undoStack.value.push(entry)
    // eslint-disable-next-line no-console
    console.info(`[FIX] redo (stack: ${undoStack.value.length} undo / ${redoStack.value.length} redo)`)
  }

  // ---- folder selection (Ctrl-toggle / Shift-range; plain navigation clears it) ----

  function clearFolderSelection(): void {
    selectedFolderIds.value = []
    folderAnchor.value = null
  }

  function toggleSelectFolder(id: number): void {
    const i = selectedFolderIds.value.indexOf(id)
    selectedFolderIds.value =
      i === -1 ? [...selectedFolderIds.value, id] : selectedFolderIds.value.filter((x) => x !== id)
    folderAnchor.value = id
    // eslint-disable-next-line no-console
    console.info(`[FIX] toggle-select folder=${id} -> ${selectedFolderIds.value.length} selected`)
  }

  function selectFolderRange(id: number): void {
    const ids = folders.value.map((f) => f.id)
    // Anchor on the last toggled folder, else the currently-viewed folder (so a plain click
    // followed by Shift+click extends a range), else the clicked folder itself.
    const anchor =
      folderAnchor.value ?? (typeof selectedView.value === 'number' ? selectedView.value : id)
    const a = ids.indexOf(anchor)
    const b = ids.indexOf(id)
    if (a === -1 || b === -1) {
      selectedFolderIds.value = [id]
      folderAnchor.value = id
      return
    }
    const [lo, hi] = a < b ? [a, b] : [b, a]
    selectedFolderIds.value = ids.slice(lo, hi + 1)
    // eslint-disable-next-line no-console
    console.info(`[FIX] range-select folders -> ${selectedFolderIds.value.length} selected`)
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

  // Delete one or more folders. The backend moves each folder's notes to Recently Deleted
  // (soft-delete + detach) rather than destroying them, so deletion is recoverable. Undoable:
  // undo recreates the folder and re-attaches + restores its (still-existing, trashed) notes by
  // id — keeping their content/pins/ids intact.
  async function deleteFolders(ids: number[]): Promise<void> {
    const present = ids.filter((id) => folders.value.some((f) => f.id === id))
    if (!present.length) return
    // Snapshot each folder name + the ids of its live notes (the ones that will be trashed).
    const snaps: { name: string; noteIds: number[] }[] = []
    for (const id of present) {
      const f = folders.value.find((x) => x.id === id)!
      const folderNotes = await window.api.notes.listByFolder(id)
      snaps.push({ name: f.name, noteIds: folderNotes.map((n) => n.id) })
    }
    let liveIds = [...present]
    const doDelete = async (): Promise<void> => {
      for (const id of liveIds) await window.api.folders.delete(id)
      await loadFolders()
      // Re-fetch the current view + counts so trashed notes show up in Recently Deleted.
      if (typeof selectedView.value === 'number' && liveIds.includes(selectedView.value)) {
        await selectView(ALL_NOTES)
      } else {
        await refresh()
      }
      clearFolderSelection()
    }
    const restore = async (): Promise<void> => {
      const newIds: number[] = []
      for (const s of snaps) {
        const f = await window.api.folders.create(s.name)
        newIds.push(f.id)
        for (const noteId of s.noteIds) {
          await window.api.notes.move(noteId, f.id) // re-attach to the recreated folder
          await window.api.notes.restore(noteId) // bring it back from Recently Deleted
        }
      }
      liveIds = newIds // redo must target the recreated folders
      await loadFolders()
      await refresh()
    }
    await doDelete()
    pushUndo({ undo: restore, redo: doDelete })
    // eslint-disable-next-line no-console
    console.info(`[FIX] deleted ${present.length} folder(s); their notes -> Recently Deleted`)
  }

  async function deleteFolder(id: number): Promise<void> {
    await deleteFolders([id])
  }

  return {
    // state
    folders,
    notes,
    counts,
    selectedView,
    loading,
    slowLoading,
    initializing,
    selectedNoteId,
    selectedNoteIds,
    searchQuery,
    editorFocusTick,
    draggingNoteIds,
    selectedFolderIds,
    // getters
    isTrashView,
    isSearching,
    visibleNotes,
    selectedNote,
    targetFolderId,
    // actions
    init,
    reload,
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
    undo,
    redo,
    toggleSelectFolder,
    selectFolderRange,
    clearFolderSelection,
    deleteFolders,
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
