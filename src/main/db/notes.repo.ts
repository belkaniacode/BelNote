import type { Database } from 'better-sqlite3'
import type { Note } from '@shared/types'
import { deriveTitle } from '@shared/noteText'

export interface NoteRow {
  id: number
  folder_id: number | null
  title: string
  content_html: string
  content_text: string
  pinned: number
  created_at: number
  updated_at: number
  deleted_at: number | null
}

export function mapNote(row: NoteRow): Note {
  return {
    id: row.id,
    folderId: row.folder_id,
    title: row.title,
    contentHtml: row.content_html,
    contentText: row.content_text,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  }
}

export interface FolderCounts {
  all: number
  trash: number
  byFolder: Record<number, number>
}

/**
 * Notes lifecycle: create → edit (autosave) → pin/move → trash (soft delete) →
 * restore or hard-delete. Live queries always exclude trashed rows (deleted_at IS NULL);
 * the trash view queries the complement.
 */
export class NotesRepo {
  constructor(private readonly db: Database) {}

  // id DESC is a deterministic tiebreaker when two notes share an updated_at millisecond
  // (newest-created wins) — keeps list order stable.
  private static readonly ORDER = 'pinned DESC, updated_at DESC, id DESC'

  listByFolder(folderId: number): Note[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM notes WHERE folder_id = ? AND deleted_at IS NULL ORDER BY ${NotesRepo.ORDER}`
      )
      .all(folderId) as NoteRow[]
    return rows.map(mapNote)
  }

  listAll(): Note[] {
    const rows = this.db
      .prepare(`SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY ${NotesRepo.ORDER}`)
      .all() as NoteRow[]
    return rows.map(mapNote)
  }

  listDeleted(): Note[] {
    const rows = this.db
      .prepare('SELECT * FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
      .all() as NoteRow[]
    return rows.map(mapNote)
  }

  get(id: number): Note | null {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined
    return row ? mapNote(row) : null
  }

  /** Every note (including trashed ones) — used to build a full backup export. */
  allForExport(): Note[] {
    const rows = this.db.prepare('SELECT * FROM notes ORDER BY id').all() as NoteRow[]
    return rows.map(mapNote)
  }

  /**
   * Insert a note from an imported backup, preserving all its fields (incl. pinned/deleted_at)
   * but letting SQLite assign a fresh id and taking a remapped folderId. Used by restoreBackup.
   */
  insertImported(n: {
    folderId: number | null
    title: string
    contentHtml: string
    contentText: string
    pinned: boolean
    createdAt: number
    updatedAt: number
    deletedAt: number | null
  }): number {
    const info = this.db
      .prepare(
        `INSERT INTO notes
           (folder_id, title, content_html, content_text, pinned, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        n.folderId,
        n.title,
        n.contentHtml,
        n.contentText,
        n.pinned ? 1 : 0,
        n.createdAt,
        n.updatedAt,
        n.deletedAt
      )
    return Number(info.lastInsertRowid)
  }

  create(folderId: number): Note {
    const now = Date.now()
    const info = this.db
      .prepare(
        `INSERT INTO notes (folder_id, title, content_html, content_text, pinned, created_at, updated_at)
         VALUES (?, '', '', '', 0, ?, ?)`
      )
      .run(folderId, now, now)
    // eslint-disable-next-line no-console
    console.info(`[notes.repo] create id=${info.lastInsertRowid} folder=${folderId}`)
    return this.get(Number(info.lastInsertRowid))!
  }

  /** Persist editor output. Title is re-derived from the plain text on every save. */
  updateContent(id: number, html: string, text: string): Note {
    const title = deriveTitle(text)
    this.db
      .prepare(
        'UPDATE notes SET content_html = ?, content_text = ?, title = ?, updated_at = ? WHERE id = ?'
      )
      .run(html, text, title, Date.now(), id)
    return this.get(id)!
  }

  setPinned(id: number, pinned: boolean): void {
    this.db.prepare('UPDATE notes SET pinned = ? WHERE id = ?').run(pinned ? 1 : 0, id)
    // eslint-disable-next-line no-console
    console.info(`[notes.repo] pin id=${id} -> ${pinned}`)
  }

  move(id: number, folderId: number): void {
    this.db.prepare('UPDATE notes SET folder_id = ? WHERE id = ?').run(folderId, id)
    // eslint-disable-next-line no-console
    console.info(`[notes.repo] move id=${id} -> folder=${folderId}`)
  }

  trash(id: number): void {
    this.db.prepare('UPDATE notes SET deleted_at = ? WHERE id = ?').run(Date.now(), id)
    // eslint-disable-next-line no-console
    console.info(`[notes.repo] trash id=${id}`)
  }

  restore(id: number): void {
    this.db.prepare('UPDATE notes SET deleted_at = NULL WHERE id = ?').run(id)
    // eslint-disable-next-line no-console
    console.info(`[notes.repo] restore id=${id}`)
  }

  hardDelete(id: number): void {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    // eslint-disable-next-line no-console
    console.info(`[notes.repo] hardDelete id=${id}`)
  }

  emptyTrash(): void {
    const info = this.db.prepare('DELETE FROM notes WHERE deleted_at IS NOT NULL').run()
    // eslint-disable-next-line no-console
    console.info(`[notes.repo] emptyTrash removed=${info.changes}`)
  }

  /** Counts for the sidebar badges. */
  counts(): FolderCounts {
    const all = (this.db
      .prepare('SELECT COUNT(*) AS n FROM notes WHERE deleted_at IS NULL')
      .get() as { n: number }).n
    const trash = (this.db
      .prepare('SELECT COUNT(*) AS n FROM notes WHERE deleted_at IS NOT NULL')
      .get() as { n: number }).n
    const rows = this.db
      .prepare(
        'SELECT folder_id AS fid, COUNT(*) AS n FROM notes WHERE deleted_at IS NULL GROUP BY folder_id'
      )
      .all() as { fid: number | null; n: number }[]
    const byFolder: Record<number, number> = {}
    for (const r of rows) if (r.fid != null) byFolder[r.fid] = r.n
    return { all, trash, byFolder }
  }
}
