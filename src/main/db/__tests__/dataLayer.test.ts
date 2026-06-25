import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import { openDatabase } from '../connection'
import { runMigrations, LATEST_VERSION } from '../migrations'
import { FoldersRepo } from '../folders.repo'
import { NotesRepo } from '../notes.repo'
import { SearchRepo } from '../search.repo'
import { deriveTitle, deriveSnippet } from '@shared/noteText'

let db: Database

beforeEach(() => {
  // Fresh in-memory DB per test → full isolation.
  db = openDatabase(':memory:')
})

afterEach(() => {
  db.close()
})

describe('migrations', () => {
  it('brings a new DB to the latest version', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION)
  })

  it('is idempotent (re-running applies nothing)', () => {
    const before = db.pragma('user_version', { simple: true })
    runMigrations(db)
    runMigrations(db)
    expect(db.pragma('user_version', { simple: true })).toBe(before)
  })

  it('seeds a default folder on first open', () => {
    expect(new FoldersRepo(db).list()).toHaveLength(1)
    expect(new FoldersRepo(db).list()[0].name).toBe('Notes')
  })
})

describe('FoldersRepo', () => {
  it('creates, renames and deletes folders', () => {
    const repo = new FoldersRepo(db)
    const f = repo.create('Work')
    expect(f.id).toBeGreaterThan(0)
    expect(f.name).toBe('Work')

    repo.rename(f.id, 'Projects')
    expect(repo.get(f.id)?.name).toBe('Projects')

    repo.delete(f.id)
    expect(repo.get(f.id)).toBeNull()
  })

  it('deleting a folder moves its notes to Recently Deleted (not destroyed)', () => {
    const folders = new FoldersRepo(db)
    const notes = new NotesRepo(db)
    const f = folders.create('Temp')
    const n = notes.create(f.id)

    folders.delete(f.id)

    // The note survives — soft-deleted (in the trash) and detached from the now-gone folder.
    const after = notes.get(n.id)
    expect(after).not.toBeNull()
    expect(after?.deletedAt).not.toBeNull()
    expect(after?.folderId).toBeNull()
    expect(notes.listDeleted().some((x) => x.id === n.id)).toBe(true)
  })

  it('deleting a folder leaves its already-trashed notes in the trash', () => {
    const folders = new FoldersRepo(db)
    const notes = new NotesRepo(db)
    const f = folders.create('Temp')
    const n = notes.create(f.id)
    notes.trash(n.id)

    folders.delete(f.id)

    const after = notes.get(n.id)
    expect(after).not.toBeNull()
    expect(after?.folderId).toBeNull()
    expect(notes.listDeleted().some((x) => x.id === n.id)).toBe(true)
  })
})

describe('NotesRepo', () => {
  let folderId: number
  let folders: FoldersRepo
  let notes: NotesRepo

  beforeEach(() => {
    folders = new FoldersRepo(db)
    notes = new NotesRepo(db)
    folderId = folders.list()[0].id
  })

  it('creates an empty note and derives the title from the first line on update', () => {
    const n = notes.create(folderId)
    expect(n.title).toBe('')

    const updated = notes.updateContent(n.id, '<h1>Hello</h1><p>world</p>', 'Hello\nworld')
    expect(updated.title).toBe('Hello')
    expect(updated.contentText).toBe('Hello\nworld')
  })

  it('lists pinned notes first, then by recency', () => {
    const a = notes.create(folderId)
    const b = notes.create(folderId)
    const c = notes.create(folderId)
    notes.updateContent(a.id, '', 'A')
    notes.updateContent(b.id, '', 'B')
    notes.updateContent(c.id, '', 'C') // c is most recently updated
    notes.setPinned(a.id, true)

    const list = notes.listByFolder(folderId)
    expect(list[0].id).toBe(a.id) // pinned wins
    expect(list[1].id).toBe(c.id) // then most recent
  })

  it('moves a note between folders', () => {
    const other = folders.create('Other')
    const n = notes.create(folderId)
    notes.move(n.id, other.id)
    expect(notes.get(n.id)?.folderId).toBe(other.id)
    expect(notes.listByFolder(folderId)).toHaveLength(0)
    expect(notes.listByFolder(other.id)).toHaveLength(1)
  })

  it('supports the trash → restore → hard-delete lifecycle', () => {
    const n = notes.create(folderId)

    notes.trash(n.id)
    expect(notes.listByFolder(folderId)).toHaveLength(0)
    expect(notes.listDeleted().map((x) => x.id)).toContain(n.id)

    notes.restore(n.id)
    expect(notes.listDeleted()).toHaveLength(0)
    expect(notes.listByFolder(folderId).map((x) => x.id)).toContain(n.id)

    notes.trash(n.id)
    notes.hardDelete(n.id)
    expect(notes.get(n.id)).toBeNull()
    expect(notes.listDeleted()).toHaveLength(0)
  })

  it('emptyTrash removes only trashed notes', () => {
    const keep = notes.create(folderId)
    const drop = notes.create(folderId)
    notes.trash(drop.id)
    notes.emptyTrash()
    expect(notes.get(keep.id)).not.toBeNull()
    expect(notes.get(drop.id)).toBeNull()
  })

  it('reports counts for sidebar badges', () => {
    const a = notes.create(folderId)
    notes.create(folderId)
    notes.trash(a.id)
    const counts = notes.counts()
    expect(counts.all).toBe(1)
    expect(counts.trash).toBe(1)
    expect(counts.byFolder[folderId]).toBe(1)
  })
})

describe('SearchRepo', () => {
  it('finds notes by prefix and excludes trashed ones', () => {
    const folders = new FoldersRepo(db)
    const notes = new NotesRepo(db)
    const search = new SearchRepo(db)
    const folderId = folders.list()[0].id

    const a = notes.create(folderId)
    const b = notes.create(folderId)
    notes.updateContent(a.id, '', 'Lavender design system')
    notes.updateContent(b.id, '', 'Grocery list')

    const hits = search.search('lav')
    expect(hits.map((h) => h.id)).toEqual([a.id])
    expect(hits[0].snippet).toContain('Lavender')

    notes.trash(a.id)
    expect(search.search('lav')).toHaveLength(0)
  })

  it('returns nothing for an empty query', () => {
    expect(new SearchRepo(db).search('   ')).toHaveLength(0)
  })
})

describe('note text helpers', () => {
  it('deriveTitle returns the first non-empty line', () => {
    expect(deriveTitle('\n\n  Title here \nbody')).toBe('Title here')
    expect(deriveTitle('   ')).toBe('')
  })

  it('deriveSnippet returns the text after the title line', () => {
    expect(deriveSnippet('Title\nfirst body\nsecond')).toBe('first body second')
    expect(deriveSnippet('OnlyTitle')).toBe('')
  })
})

describe('logging hygiene', () => {
  it('repositories do not emit warnings/errors on the happy path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const folders = new FoldersRepo(db)
    const notes = new NotesRepo(db)
    const f = folders.create('X')
    const n = notes.create(f.id)
    notes.updateContent(n.id, '', 'hi')
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    warn.mockRestore()
    error.mockRestore()
  })
})
