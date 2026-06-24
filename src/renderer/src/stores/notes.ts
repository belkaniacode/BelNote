import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Folder, Note, SearchHit } from '@shared/types'
import { ALL_NOTES, RECENTLY_DELETED } from '@shared/types'

export type ViewId = number | typeof ALL_NOTES | typeof RECENTLY_DELETED

const AUTOSAVE_MS = 600

/**
 * The renderer's single source of truth. Mirrors the SQLite data via window.api and keeps
 * the selected view / note in sync. List ordering and trashing rules live in the main-process
 * repositories; this store just reflects and re-fetches.
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
  const selectedNoteId = ref<number | null>(null)
  const searchQuery = ref('')

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

  // ---- loaders ----

  async function loadFolders(): Promise<void> {
    folders.value = await window.api.folders.list()
  }

  async function loadCounts(): Promise<void> {
    counts.value = await window.api.notes.counts()
  }

  async function loadNotes(): Promise<void> {
    if (selectedView.value === ALL_NOTES) notes.value = await window.api.notes.listAll()
    else if (selectedView.value === RECENTLY_DELETED)
      notes.value = await window.api.notes.listDeleted()
    else notes.value = await window.api.notes.listByFolder(selectedView.value)
  }

  /** Reload the visible list + counts, preserving selection when the note still exists. */
  async function refresh(): Promise<void> {
    await Promise.all([loadNotes(), loadCounts()])
    if (!visibleNotes.value.some((n) => n.id === selectedNoteId.value)) {
      selectedNoteId.value = visibleNotes.value[0]?.id ?? null
    }
  }

  async function init(): Promise<void> {
    await loadFolders()
    await refresh()
    // eslint-disable-next-line no-console
    console.info('[notes.store] initialised')
  }

  // ---- navigation ----

  async function selectView(view: ViewId): Promise<void> {
    selectedView.value = view
    searchQuery.value = ''
    searchHits.value = []
    selectedNoteId.value = null
    await refresh()
    // eslint-disable-next-line no-console
    console.info(`[notes.store] view -> ${String(view)}`)
  }

  function selectNote(id: number): void {
    if (id !== selectedNoteId.value) flushPending() // save the note we're leaving
    selectedNoteId.value = id
  }

  // ---- search ----

  async function setSearch(query: string): Promise<void> {
    searchQuery.value = query
    if (!query.trim()) {
      searchHits.value = []
      return
    }
    searchHits.value = await window.api.search.query(query)
    if (!searchHits.value.some((n) => n.id === selectedNoteId.value)) {
      selectedNoteId.value = searchHits.value[0]?.id ?? null
    }
  }

  // ---- note mutations ----

  async function createNote(): Promise<void> {
    const folderId = targetFolderId.value
    if (folderId == null) return
    const note = await window.api.notes.create(folderId)
    // Creating from "All Notes" / search should land us in that note's view context.
    if (typeof selectedView.value !== 'number') selectedView.value = folderId
    searchQuery.value = ''
    searchHits.value = []
    await refresh()
    selectedNoteId.value = note.id
    // eslint-disable-next-line no-console
    console.info(`[notes.store] create note=${note.id}`)
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let pending: { id: number; html: string; text: string } | null = null

  async function persist(p: { id: number; html: string; text: string }): Promise<void> {
    try {
      patchLocal(await window.api.notes.update(p.id, p.html, p.text))
      await loadCounts()
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

  /** Replace a note in-place and re-sort the live list so title/snippet/order update live. */
  function patchLocal(updated: Note): void {
    const idx = notes.value.findIndex((n) => n.id === updated.id)
    if (idx !== -1) notes.value[idx] = updated
    const sidx = searchHits.value.findIndex((n) => n.id === updated.id)
    if (sidx !== -1) searchHits.value[sidx] = { ...searchHits.value[sidx], ...updated }
    notes.value.sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt || b.id - a.id
    )
  }

  async function setPinned(id: number, pinned: boolean): Promise<void> {
    await window.api.notes.setPinned(id, pinned)
    await refresh()
  }

  async function moveNote(id: number, folderId: number): Promise<void> {
    await window.api.notes.move(id, folderId)
    await refresh()
  }

  async function trashNote(id: number): Promise<void> {
    await window.api.notes.trash(id)
    await refresh()
  }

  async function restoreNote(id: number): Promise<void> {
    await window.api.notes.restore(id)
    await refresh()
  }

  async function hardDeleteNote(id: number): Promise<void> {
    await window.api.notes.hardDelete(id)
    await refresh()
  }

  async function emptyTrash(): Promise<void> {
    await window.api.notes.emptyTrash()
    await refresh()
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
    searchQuery,
    // getters
    isTrashView,
    isSearching,
    visibleNotes,
    selectedNote,
    targetFolderId,
    // actions
    init,
    selectView,
    selectNote,
    setSearch,
    createNote,
    saveNoteContent,
    flushPending,
    setPinned,
    moveNote,
    trashNote,
    restoreNote,
    hardDeleteNote,
    emptyTrash,
    createFolder,
    renameFolder,
    deleteFolder
  }
})
