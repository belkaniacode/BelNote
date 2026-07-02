import { describe, it, expect } from 'vitest'
import { openDatabase } from '../../db/connection'
import { FoldersRepo } from '../../db/folders.repo'
import { NotesRepo } from '../../db/notes.repo'
import { collectBackup, restoreBackup, assertValidPayload } from '../backup'
import { CorruptFileError } from '../crypto'

describe('transfer/backup', () => {
  it('collect → restore (merge) remaps folder ids and preserves notes', () => {
    // Source DB with two folders and notes referencing them.
    const src = openDatabase(':memory:')
    const sf = new FoldersRepo(src)
    const sn = new NotesRepo(src)
    const a = sf.create('Work')
    const b = sf.create('Personal')
    const n1 = sn.create(a.id)
    sn.updateContent(n1.id, '<p>hello</p>', 'hello')
    sn.create(b.id)

    const payload = collectBackup(src)
    // openDatabase seeds a default "Notes" folder, so 1 seeded + 2 created = 3 folders.
    expect(payload.folders.length).toBe(3)
    expect(payload.notes.length).toBe(2)

    // Fresh destination DB (also has its own seeded folder). Import merges on top.
    const dst = openDatabase(':memory:')
    const foldersBefore = new FoldersRepo(dst).list().length
    const result = restoreBackup(dst, payload, 'merge')

    expect(result.folders).toBe(3)
    expect(result.notes).toBe(2)

    const df = new FoldersRepo(dst)
    const dn = new NotesRepo(dst)
    expect(df.list().length).toBe(foldersBefore + 3) // nothing overwritten — merged
    const notes = dn.allForExport()
    expect(notes.length).toBe(2)

    // Every imported note points at a folder that exists in the destination (id remapped).
    const validFolderIds = new Set(df.list().map((f) => f.id))
    for (const note of notes) {
      expect(note.folderId != null && validFolderIds.has(note.folderId)).toBe(true)
    }
    // Content survived the round trip.
    expect(notes.some((n) => n.contentText === 'hello')).toBe(true)
  })

  it('assertValidPayload rejects a non-BelNote object', () => {
    expect(() => assertValidPayload({ app: 'Other', schema: 1, folders: [], notes: [] })).toThrow(
      CorruptFileError
    )
    expect(() => assertValidPayload(null)).toThrow(CorruptFileError)
  })
})
