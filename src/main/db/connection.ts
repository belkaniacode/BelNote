import Database from 'better-sqlite3'
import { runMigrations } from './migrations'

/**
 * Open a database at `filename` (use ':memory:' in tests), enable the pragmas BelNote
 * relies on, and bring the schema up to date. Pure: no Electron imports, so the data
 * layer and its tests can run outside the Electron runtime.
 */
export function openDatabase(filename: string): Database.Database {
  const db = new Database(filename)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  seedDefaults(db)
  return db
}

/** Ensure there is always at least one folder so the UI has somewhere to put notes. */
export function seedDefaults(db: Database.Database): void {
  const count = db.prepare('SELECT COUNT(*) AS n FROM folders').get() as { n: number }
  if (count.n === 0) {
    db.prepare('INSERT INTO folders (name, sort_order, created_at) VALUES (?, 0, ?)').run(
      'Notes',
      Date.now()
    )
    // eslint-disable-next-line no-console
    console.info('[db] seeded default "Notes" folder')
  }
}
