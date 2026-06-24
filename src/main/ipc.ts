import { ipcMain, shell } from 'electron'
import { getDb } from './db'
import { FoldersRepo } from './db/folders.repo'
import { NotesRepo } from './db/notes.repo'
import { SearchRepo } from './db/search.repo'

/**
 * The single place that maps IPC channels to repository operations. Every handler is
 * wrapped so the channel name and failures are logged consistently and errors propagate
 * back to the renderer as rejected promises (never crash the main process).
 */
function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (_event, ...args) => {
    // eslint-disable-next-line no-console
    console.debug(`[ipc] ${channel}`)
    try {
      return fn(...args)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[ipc] ${channel} failed`, err)
      throw err
    }
  })
}

export function registerIpc(): void {
  const db = getDb()
  const folders = new FoldersRepo(db)
  const notes = new NotesRepo(db)
  const search = new SearchRepo(db)

  // Folders
  handle('folders:list', () => folders.list())
  handle('folders:create', (name) => folders.create(name as string))
  handle('folders:rename', (id, name) => folders.rename(id as number, name as string))
  handle('folders:delete', (id) => folders.delete(id as number))

  // Notes
  handle('notes:listByFolder', (folderId) => notes.listByFolder(folderId as number))
  handle('notes:listAll', () => notes.listAll())
  handle('notes:listDeleted', () => notes.listDeleted())
  handle('notes:get', (id) => notes.get(id as number))
  handle('notes:create', (folderId) => notes.create(folderId as number))
  handle('notes:update', (id, html, text) =>
    notes.updateContent(id as number, html as string, text as string)
  )
  handle('notes:setPinned', (id, pinned) => notes.setPinned(id as number, pinned as boolean))
  handle('notes:move', (id, folderId) => notes.move(id as number, folderId as number))
  handle('notes:trash', (id) => notes.trash(id as number))
  handle('notes:restore', (id) => notes.restore(id as number))
  handle('notes:hardDelete', (id) => notes.hardDelete(id as number))
  handle('notes:emptyTrash', () => notes.emptyTrash())
  handle('notes:counts', () => notes.counts())

  // Search
  handle('search:query', (query) => search.search(query as string))

  // External links (kept here so all IPC lives in one module)
  handle('open-external', (url) => {
    const u = url as string
    if (/^(https?:|mailto:)/i.test(u)) return shell.openExternal(u)
    return undefined
  })

  // eslint-disable-next-line no-console
  console.info('[ipc] handlers registered')
}
