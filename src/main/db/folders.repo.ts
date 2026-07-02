import type { Database } from 'better-sqlite3'
import type { Folder } from '@shared/types'

interface FolderRow {
  id: number
  name: string
  sort_order: number
  created_at: number
}

function mapFolder(row: FolderRow): Folder {
  return { id: row.id, name: row.name, sortOrder: row.sort_order, createdAt: row.created_at }
}

/** CRUD for folders. Deleting a folder cascades to its notes (FK ON DELETE CASCADE). */
export class FoldersRepo {
  constructor(private readonly db: Database) {}

  list(): Folder[] {
    const rows = this.db
      .prepare('SELECT * FROM folders ORDER BY sort_order, created_at')
      .all() as FolderRow[]
    return rows.map(mapFolder)
  }

  get(id: number): Folder | null {
    const row = this.db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as
      | FolderRow
      | undefined
    return row ? mapFolder(row) : null
  }

  create(name: string): Folder {
    const now = Date.now()
    const order =
      (this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM folders').get() as {
        n: number
      }).n
    const info = this.db
      .prepare('INSERT INTO folders (name, sort_order, created_at) VALUES (?, ?, ?)')
      .run(name.trim() || 'Untitled', order, now)
    // eslint-disable-next-line no-console
    console.info(`[folders.repo] create id=${info.lastInsertRowid} name="${name}"`)
    return this.get(Number(info.lastInsertRowid))!
  }

  /**
   * Insert a folder from an imported backup, preserving its name/order/timestamp but letting
   * SQLite assign a fresh id (the caller maps old→new ids). Used by restoreBackup (merge).
   */
  insertImported(f: { name: string; sortOrder: number; createdAt: number }): number {
    const info = this.db
      .prepare('INSERT INTO folders (name, sort_order, created_at) VALUES (?, ?, ?)')
      .run(f.name, f.sortOrder, f.createdAt)
    return Number(info.lastInsertRowid)
  }

  rename(id: number, name: string): void {
    this.db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name.trim() || 'Untitled', id)
    // eslint-disable-next-line no-console
    console.info(`[folders.repo] rename id=${id} -> "${name}"`)
  }

  /**
   * Delete a folder, sending its notes to Recently Deleted instead of destroying them.
   * The folder_id FK is ON DELETE CASCADE, so notes still referencing the folder would be
   * permanently removed. To preserve them we first soft-delete the still-live notes
   * (deleted_at = now) and detach every note from the folder (folder_id = NULL); already-trashed
   * notes are merely detached so they stay in the trash. One transaction.
   */
  delete(id: number): void {
    const run = this.db.transaction((folderId: number) => {
      const now = Date.now()
      const trashed = this.db
        .prepare(
          'UPDATE notes SET deleted_at = ?, folder_id = NULL WHERE folder_id = ? AND deleted_at IS NULL'
        )
        .run(now, folderId).changes
      // Detach any remaining (already-trashed) notes so the cascade can't remove them.
      this.db.prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ?').run(folderId)
      this.db.prepare('DELETE FROM folders WHERE id = ?').run(folderId)
      return trashed
    })
    const trashed = run(id)
    // eslint-disable-next-line no-console
    console.info(`[folders.repo] delete id=${id} -> ${trashed} note(s) moved to Recently Deleted`)
  }
}
