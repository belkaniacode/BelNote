import type { Database } from 'better-sqlite3'
import { FoldersRepo } from '../db/folders.repo'
import { NotesRepo } from '../db/notes.repo'
import { CorruptFileError } from './crypto'

/**
 * Serialize the whole library to a plain object and restore it back. This is the plaintext
 * payload that crypto.ts encrypts/decrypts — it never touches files or passphrases itself.
 *
 * Every folder carries its old id so notes can reference it; on restore we insert folders with
 * fresh ids and remap each note's folderId through an old→new map. A full backup includes
 * trashed notes (deleted_at preserved).
 */

const APP = 'BelNote'
const SCHEMA = 1

export interface BackupFolder {
  oldId: number
  name: string
  sortOrder: number
  createdAt: number
}

export interface BackupNote {
  oldFolderId: number | null
  title: string
  contentHtml: string
  contentText: string
  pinned: boolean
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface BackupPayload {
  app: typeof APP
  schema: number
  exportedAt: number
  folders: BackupFolder[]
  notes: BackupNote[]
}

export interface RestoreResult {
  folders: number
  notes: number
}

/** Read all folders + all notes (incl. trashed) into a portable payload. */
export function collectBackup(db: Database): BackupPayload {
  const folders = new FoldersRepo(db).list()
  const notes = new NotesRepo(db).allForExport()

  const payload: BackupPayload = {
    app: APP,
    schema: SCHEMA,
    exportedAt: Date.now(),
    folders: folders.map((f) => ({
      oldId: f.id,
      name: f.name,
      sortOrder: f.sortOrder,
      createdAt: f.createdAt
    })),
    notes: notes.map((n) => ({
      oldFolderId: n.folderId,
      title: n.title,
      contentHtml: n.contentHtml,
      contentText: n.contentText,
      pinned: n.pinned,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      deletedAt: n.deletedAt
    }))
  }
  // eslint-disable-next-line no-console
  console.info(
    `[transfer] collectBackup: ${payload.folders.length} folder(s), ${payload.notes.length} note(s)`
  )
  return payload
}

/** Validate that a parsed object is a BelNote backup we can restore. Throws CorruptFileError. */
export function assertValidPayload(data: unknown): asserts data is BackupPayload {
  const p = data as Partial<BackupPayload> | null
  if (!p || typeof p !== 'object') throw new CorruptFileError('payload is not an object')
  if (p.app !== APP) throw new CorruptFileError('not a BelNote backup')
  if (p.schema !== SCHEMA) throw new CorruptFileError(`unsupported schema ${String(p.schema)}`)
  if (!Array.isArray(p.folders) || !Array.isArray(p.notes)) {
    throw new CorruptFileError('missing folders/notes')
  }
}

/**
 * Restore a backup by MERGING it into the current database: folders and notes are inserted with
 * new ids (nothing is overwritten). Runs in a single transaction so a failure leaves the DB
 * untouched. The existing FTS triggers keep the search index in sync automatically.
 */
export function restoreBackup(
  db: Database,
  payload: BackupPayload,
  mode: 'merge' = 'merge'
): RestoreResult {
  assertValidPayload(payload)
  const folders = new FoldersRepo(db)
  const notes = new NotesRepo(db)

  const run = db.transaction((): RestoreResult => {
    const idMap = new Map<number, number>()
    for (const f of payload.folders) {
      const newId = folders.insertImported({
        name: f.name,
        sortOrder: f.sortOrder,
        createdAt: f.createdAt
      })
      idMap.set(f.oldId, newId)
    }
    for (const n of payload.notes) {
      const folderId = n.oldFolderId == null ? null : idMap.get(n.oldFolderId) ?? null
      notes.insertImported({
        folderId,
        title: n.title,
        contentHtml: n.contentHtml,
        contentText: n.contentText,
        pinned: n.pinned,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        deletedAt: n.deletedAt
      })
    }
    return { folders: payload.folders.length, notes: payload.notes.length }
  })

  const result = run()
  // eslint-disable-next-line no-console
  console.info(
    `[transfer] restoreBackup (${mode}): +${result.folders} folder(s), +${result.notes} note(s)`
  )
  return result
}
