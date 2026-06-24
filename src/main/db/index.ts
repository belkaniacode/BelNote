import { app } from 'electron'
import { join } from 'path'
import type { Database } from 'better-sqlite3'
import { openDatabase } from './connection'

/**
 * App-level database singleton. Lives in the user-data directory so a user's notes
 * persist across launches and updates. This module is the only one that touches
 * Electron's `app`; everything else takes a Database instance for testability.
 */
let db: Database | null = null

export function getDb(): Database {
  if (!db) {
    const file = join(app.getPath('userData'), 'belnote.db')
    db = openDatabase(file)
    // eslint-disable-next-line no-console
    console.info(`[db] opened at ${file}`)
  }
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}
