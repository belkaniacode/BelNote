/**
 * DTOs shared across the process boundary (main repositories ↔ preload ↔ renderer).
 * Keep this file type-only so it can be imported from any process without side effects.
 */

export interface Folder {
  id: number
  name: string
  sortOrder: number
  createdAt: number
}

export interface Note {
  id: number
  folderId: number | null
  title: string
  contentHtml: string
  contentText: string
  pinned: boolean
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/** A note plus its FTS snippet, returned by search. */
export interface SearchHit extends Note {
  snippet: string
}

/** Sentinel folder ids used by the UI for the virtual "All Notes" / "Recently Deleted" views. */
export const ALL_NOTES = 'all' as const
export const RECENTLY_DELETED = 'trash' as const
