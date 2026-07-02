import { ipcMain, shell, dialog, BrowserWindow, app } from 'electron'
import { writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import { getDb } from './db'
import { FoldersRepo } from './db/folders.repo'
import { NotesRepo } from './db/notes.repo'
import { SearchRepo } from './db/search.repo'
import { collectBackup, restoreBackup, assertValidPayload } from './transfer/backup'
import { encrypt, decrypt, BadPassphraseError, CorruptFileError } from './transfer/crypto'
import type { ExportResult, ImportResult } from '@shared/types'

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

  // Encrypted data transfer (full backup export / merge import).
  // These are async and return structured results ({ok|canceled|error}) rather than throwing
  // for expected outcomes (user cancels the dialog, wrong passphrase, corrupt file), so the
  // renderer can show a friendly toast. SECURITY: the passphrase is never logged.
  handle('data:export', async (passphrase) => {
    const pass = passphrase as string
    const date = new Date().toISOString().slice(0, 10)
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const dlg = await dialog.showSaveDialog(win!, {
      title: 'BelNote — Export',
      defaultPath: join(app.getPath('documents'), `BelNote-backup-${date}.blnt`),
      filters: [{ name: 'BelNote backup', extensions: ['blnt'] }]
    })
    if (dlg.canceled || !dlg.filePath) return { canceled: true } as ExportResult

    const payload = collectBackup(db)
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
    const file = encrypt(plaintext, pass)
    await writeFile(dlg.filePath, file)
    // eslint-disable-next-line no-console
    console.info(`[ipc] data:export wrote ${file.length}B -> ${dlg.filePath}`)
    return {
      ok: true,
      path: dlg.filePath,
      counts: { folders: payload.folders.length, notes: payload.notes.length }
    } as ExportResult
  })

  handle('data:import', async (passphrase, mode) => {
    const pass = passphrase as string
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const dlg = await dialog.showOpenDialog(win!, {
      title: 'BelNote — Import',
      properties: ['openFile'],
      filters: [{ name: 'BelNote backup', extensions: ['blnt'] }]
    })
    if (dlg.canceled || !dlg.filePaths[0]) return { canceled: true } as ImportResult

    let payload
    try {
      const file = await readFile(dlg.filePaths[0])
      const plaintext = decrypt(file, pass)
      payload = JSON.parse(plaintext.toString('utf8'))
      assertValidPayload(payload)
    } catch (err) {
      if (err instanceof BadPassphraseError) return { ok: false, error: 'bad_password' } as ImportResult
      if (err instanceof CorruptFileError || err instanceof SyntaxError) {
        return { ok: false, error: 'corrupt_file' } as ImportResult
      }
      throw err
    }

    const counts = restoreBackup(db, payload, (mode as 'merge') ?? 'merge')
    // eslint-disable-next-line no-console
    console.info(`[ipc] data:import merged +${counts.folders} folder(s) +${counts.notes} note(s)`)
    return { ok: true, counts } as ImportResult
  })

  // External links (kept here so all IPC lives in one module)
  handle('open-external', (url) => {
    const u = url as string
    if (/^(https?:|mailto:)/i.test(u)) return shell.openExternal(u)
    return undefined
  })

  // eslint-disable-next-line no-console
  console.info('[ipc] handlers registered')
}
