import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Note } from '@shared/types'
import { useNotesStore } from '../notes'

/**
 * Store-level tests for the selection + batch-delete logic added to fix keyboard delete and
 * multi-select. The store is DOM-free — it only talks to window.api — so we stub that and drive
 * the reactive state directly (no component mount needed).
 */

function note(id: number, over: Partial<Note> = {}): Note {
  return {
    id,
    folderId: 1,
    title: `n${id}`,
    contentHtml: '',
    contentText: `n${id}`,
    pinned: false,
    createdAt: id,
    updatedAt: id,
    deletedAt: null,
    ...over
  }
}

const api = {
  notes: {
    listAll: vi.fn().mockResolvedValue([]),
    listByFolder: vi.fn().mockResolvedValue([]),
    listDeleted: vi.fn().mockResolvedValue([]),
    counts: vi.fn().mockResolvedValue({ all: 0, trash: 0, byFolder: {} }),
    trash: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    hardDelete: vi.fn().mockResolvedValue(undefined)
  },
  folders: { list: vi.fn().mockResolvedValue([]) },
  search: { query: vi.fn().mockResolvedValue([]) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { api })
  setActivePinia(createPinia())
})

describe('selection', () => {
  it('selectSingle selects exactly one note and sets the anchor', () => {
    const store = useNotesStore()
    store.notes = [note(1), note(2), note(3)]
    store.selectSingle(2)
    expect(store.selectedNoteIds).toEqual([2])
    expect(store.selectedNoteId).toBe(2)
  })

  it('toggleSelect adds then removes a note (Ctrl/Cmd-click)', () => {
    const store = useNotesStore()
    store.notes = [note(1), note(2), note(3)]
    store.selectSingle(1)
    store.toggleSelect(2)
    expect([...store.selectedNoteIds].sort()).toEqual([1, 2])
    store.toggleSelect(1)
    expect(store.selectedNoteIds).toEqual([2])
  })

  it('selectRange selects the inclusive range in visible order (Shift-click)', () => {
    const store = useNotesStore()
    store.notes = [note(1), note(2), note(3), note(4)]
    store.selectSingle(1) // anchor = 1
    store.selectRange(3)
    expect(store.selectedNoteIds).toEqual([1, 2, 3])
    expect(store.selectedNoteId).toBe(3)
  })
})

describe('batch delete', () => {
  it('trashSelected trashes every selected note and reselects a survivor', async () => {
    const store = useNotesStore()
    store.notes = [note(1), note(2), note(3)]
    store.selectSingle(1)
    store.toggleSelect(2)

    await store.trashSelected()

    expect(api.notes.trash).toHaveBeenCalledTimes(2)
    expect(api.notes.trash).toHaveBeenCalledWith(1)
    expect(api.notes.trash).toHaveBeenCalledWith(2)
    expect(store.notes.map((n) => n.id)).toEqual([3])
    expect(store.selectedNoteIds).toEqual([3]) // ensureSelection picks the survivor
  })

  it('hardDeleteSelected permanently removes the selected notes', async () => {
    const store = useNotesStore()
    store.notes = [note(1), note(2)]
    store.selectSingle(1)

    await store.hardDeleteSelected()

    expect(api.notes.hardDelete).toHaveBeenCalledWith(1)
    expect(store.notes.map((n) => n.id)).toEqual([2])
  })

  it('trashSelected is a no-op when nothing is selected', async () => {
    const store = useNotesStore()
    store.notes = [note(1)]
    await store.trashSelected()
    expect(api.notes.trash).not.toHaveBeenCalled()
    expect(store.notes.map((n) => n.id)).toEqual([1])
  })
})

describe('loading flag + session restore', () => {
  function memStorage(): Storage {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: () => null,
      length: 0
    } as unknown as Storage
  }

  it('selectView ends with loading=false and the first note selected (no empty flash)', async () => {
    const store = useNotesStore()
    api.notes.listByFolder.mockResolvedValueOnce([note(10), note(11)])
    await store.selectView(5)
    expect(store.loading).toBe(false)
    expect(store.selectedNoteId).toBe(10)
  })

  it('init restores the saved view and the saved note', async () => {
    vi.stubGlobal('localStorage', memStorage())
    localStorage.setItem('belnote.session', JSON.stringify({ view: 5, noteId: 11 }))
    api.folders.list.mockResolvedValueOnce([{ id: 5, name: 'F' } as never])
    api.notes.listByFolder.mockResolvedValueOnce([note(10), note(11)])
    const store = useNotesStore()
    await store.init()
    expect(store.selectedView).toBe(5)
    expect(store.selectedNoteId).toBe(11)
    expect(store.initializing).toBe(false)
  })

  it('init falls back to the first note when the saved note no longer exists', async () => {
    vi.stubGlobal('localStorage', memStorage())
    localStorage.setItem('belnote.session', JSON.stringify({ view: 5, noteId: 999 }))
    api.folders.list.mockResolvedValueOnce([{ id: 5, name: 'F' } as never])
    api.notes.listByFolder.mockResolvedValueOnce([note(10), note(11)])
    const store = useNotesStore()
    await store.init()
    expect(store.selectedView).toBe(5)
    expect(store.selectedNoteId).toBe(10)
  })
})
