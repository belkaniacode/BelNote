import type { Database } from 'better-sqlite3'
import type { SearchHit } from '@shared/types'
import { mapNote, type NoteRow } from './notes.repo'

type SearchRow = NoteRow & { snippet: string }

/**
 * Full-text search over the notes_fts mirror. The raw user query is tokenised and turned
 * into a prefix MATCH expression so "lav" matches "lavender"; trashed notes are excluded.
 */
export class SearchRepo {
  constructor(private readonly db: Database) {}

  private static toMatch(query: string): string {
    return query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => `"${token.replace(/"/g, '""')}"*`)
      .join(' ')
  }

  search(query: string): SearchHit[] {
    const match = SearchRepo.toMatch(query)
    if (!match) return []

    // eslint-disable-next-line no-console
    console.debug(`[search.repo] query="${query}" match="${match}"`)

    const rows = this.db
      .prepare(
        `SELECT n.*, snippet(notes_fts, 1, '«', '»', '…', 12) AS snippet
         FROM notes_fts
         JOIN notes n ON n.id = notes_fts.rowid
         WHERE notes_fts MATCH ? AND n.deleted_at IS NULL
         ORDER BY rank, n.updated_at DESC
         LIMIT 200`
      )
      .all(match) as SearchRow[]

    return rows.map((row) => ({ ...mapNote(row), snippet: row.snippet }))
  }
}
