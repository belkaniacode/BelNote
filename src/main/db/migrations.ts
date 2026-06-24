import type { Database } from 'better-sqlite3'

/**
 * Versioned, forward-only migrations driven by SQLite's `user_version` pragma.
 * Each entry's `sql` runs exactly once, in order; the runner is idempotent —
 * re-running against an up-to-date database is a no-op.
 */
interface Migration {
  version: number
  sql: string
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE folders (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE notes (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id    INTEGER REFERENCES folders(id) ON DELETE CASCADE,
        title        TEXT    NOT NULL DEFAULT '',
        content_html TEXT    NOT NULL DEFAULT '',
        content_text TEXT    NOT NULL DEFAULT '',
        pinned       INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        deleted_at   INTEGER
      );

      CREATE INDEX idx_notes_folder  ON notes(folder_id);
      CREATE INDEX idx_notes_deleted ON notes(deleted_at);
      CREATE INDEX idx_notes_updated ON notes(updated_at);

      -- Full-text search mirror of notes (external-content FTS5 keeps storage lean).
      CREATE VIRTUAL TABLE notes_fts USING fts5(
        title,
        content_text,
        content='notes',
        content_rowid='id'
      );

      CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts(rowid, title, content_text)
        VALUES (new.id, new.title, new.content_text);
      END;

      CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, title, content_text)
        VALUES ('delete', old.id, old.title, old.content_text);
      END;

      CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, title, content_text)
        VALUES ('delete', old.id, old.title, old.content_text);
        INSERT INTO notes_fts(rowid, title, content_text)
        VALUES (new.id, new.title, new.content_text);
      END;
    `
  }
]

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0

/** Apply any pending migrations. Safe to call on every startup. */
export function runMigrations(db: Database): void {
  const current = db.pragma('user_version', { simple: true }) as number

  for (const { version, sql } of MIGRATIONS) {
    if (version <= current) continue
    db.transaction(() => {
      db.exec(sql)
      db.pragma(`user_version = ${version}`)
    })()
    // eslint-disable-next-line no-console
    console.info(`[db.migrate] v${version} applied`)
  }
}
