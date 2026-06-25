import type { Folder, Note, SearchHit } from '@shared/types'

/**
 * DEV-ONLY in-memory stand-in for window.api, used when the renderer runs in a plain browser
 * (e.g. for UI testing/inspection) where the Electron preload bridge is absent. Never active in
 * the real app: Electron always injects window.api, and this is gated on import.meta.env.DEV.
 */
export function installDevApiMock(): void {
  // Seeded with enough folders and notes to overflow every pane, so scroll/layout behaviour
  // can be exercised in the browser. The long note (last) overflows the editor pane too.
  let folders: Folder[] = [
    { id: 1, name: 'Notes', sortOrder: 0, createdAt: 1 },
    { id: 2, name: 'Доступ', sortOrder: 1, createdAt: 2 },
    ...Array.from({ length: 14 }, (_, i) => ({
      id: i + 3,
      name: `Папка ${i + 1}`,
      sortOrder: i + 2,
      createdAt: i + 3
    }))
  ]
  let seq = 100
  const longBody = Array.from(
    { length: 120 },
    (_, i) => `<p>Строка ${i} — длинный текст заметки для проверки скролла редактора.</p>`
  ).join('')
  let notes: Note[] = Array.from({ length: 30 }, (_, i) => {
    const last = i === 29
    return {
      id: i + 1,
      folderId: 1,
      title: last ? 'Длинная заметка' : `Заметка ${i + 1}`,
      contentHtml: last ? longBody : `<h1>Заметка ${i + 1}</h1><p>Тело заметки</p>`,
      contentText: last ? 'Длинная заметка\n' + 'строка '.repeat(200) : `Заметка ${i + 1}\nТело заметки`,
      pinned: false,
      createdAt: i + 1,
      updatedAt: i + 1,
      deletedAt: null
    }
  })

  const live = (): Note[] =>
    [...notes]
      .filter((n) => n.deletedAt == null)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt || b.id - a.id)

  const api = {
    openExternal: async () => {},
    folders: {
      list: async (): Promise<Folder[]> => [...folders],
      create: async (name: string): Promise<Folder> => {
        const f = { id: ++seq, name, sortOrder: folders.length, createdAt: seq }
        folders.push(f)
        return f
      },
      rename: async (id: number, name: string) => {
        const f = folders.find((x) => x.id === id)
        if (f) f.name = name
      },
      delete: async (id: number) => {
        // Mirror FoldersRepo.delete: the folder's notes go to Recently Deleted (soft-delete +
        // detach), they are NOT destroyed.
        const now = ++seq
        notes.forEach((n) => {
          if (n.folderId === id) {
            if (n.deletedAt == null) n.deletedAt = now
            n.folderId = null
          }
        })
        folders = folders.filter((x) => x.id !== id)
      }
    },
    notes: {
      listByFolder: async (fid: number) => live().filter((n) => n.folderId === fid),
      listAll: async () => live(),
      listDeleted: async () => notes.filter((n) => n.deletedAt != null),
      get: async (id: number) => notes.find((n) => n.id === id) ?? null,
      create: async (fid: number): Promise<Note> => {
        const n: Note = {
          id: ++seq,
          folderId: fid,
          title: '',
          contentHtml: '',
          contentText: '',
          pinned: false,
          createdAt: seq,
          updatedAt: seq,
          deletedAt: null
        }
        notes.push(n)
        return n
      },
      update: async (id: number, html: string, text: string): Promise<Note> => {
        const n = notes.find((x) => x.id === id)!
        n.contentHtml = html
        n.contentText = text
        n.title = text.split('\n')[0] ?? ''
        n.updatedAt = ++seq
        return { ...n }
      },
      setPinned: async (id: number, pinned: boolean) => {
        const n = notes.find((x) => x.id === id)
        if (n) n.pinned = pinned
      },
      move: async (id: number, fid: number) => {
        const n = notes.find((x) => x.id === id)
        if (n) n.folderId = fid
      },
      trash: async (id: number) => {
        const n = notes.find((x) => x.id === id)
        if (n) n.deletedAt = ++seq
      },
      restore: async (id: number) => {
        const n = notes.find((x) => x.id === id)
        if (n) n.deletedAt = null
      },
      hardDelete: async (id: number) => {
        notes = notes.filter((n) => n.id !== id)
      },
      emptyTrash: async () => {
        notes = notes.filter((n) => n.deletedAt == null)
      },
      counts: async () => ({
        all: notes.filter((n) => n.deletedAt == null).length,
        trash: notes.filter((n) => n.deletedAt != null).length,
        byFolder: folders.reduce<Record<number, number>>((acc, f) => {
          acc[f.id] = notes.filter((n) => n.deletedAt == null && n.folderId === f.id).length
          return acc
        }, {})
      })
    },
    search: {
      query: async (q: string): Promise<SearchHit[]> =>
        live()
          .filter((n) => n.contentText.toLowerCase().includes(q.toLowerCase()))
          .map((n) => ({ ...n, snippet: n.contentText }))
    }
  }
  ;(window as unknown as { api: typeof api }).api = api
  // eslint-disable-next-line no-console
  console.info('[devApiMock] installed (browser context, no Electron preload)')
}
