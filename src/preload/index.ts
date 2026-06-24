import { contextBridge, ipcRenderer } from 'electron'
import type { Folder, Note, SearchHit } from '@shared/types'

/**
 * Typed, minimal bridge exposed to the renderer as window.api. Each method is a thin
 * ipcRenderer.invoke; all real work happens in the main-process repositories (src/main/db).
 */
const api = {
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),

  folders: {
    list: (): Promise<Folder[]> => ipcRenderer.invoke('folders:list'),
    create: (name: string): Promise<Folder> => ipcRenderer.invoke('folders:create', name),
    rename: (id: number, name: string): Promise<void> =>
      ipcRenderer.invoke('folders:rename', id, name),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('folders:delete', id)
  },

  notes: {
    listByFolder: (folderId: number): Promise<Note[]> =>
      ipcRenderer.invoke('notes:listByFolder', folderId),
    listAll: (): Promise<Note[]> => ipcRenderer.invoke('notes:listAll'),
    listDeleted: (): Promise<Note[]> => ipcRenderer.invoke('notes:listDeleted'),
    get: (id: number): Promise<Note | null> => ipcRenderer.invoke('notes:get', id),
    create: (folderId: number): Promise<Note> => ipcRenderer.invoke('notes:create', folderId),
    update: (id: number, html: string, text: string): Promise<Note> =>
      ipcRenderer.invoke('notes:update', id, html, text),
    setPinned: (id: number, pinned: boolean): Promise<void> =>
      ipcRenderer.invoke('notes:setPinned', id, pinned),
    move: (id: number, folderId: number): Promise<void> =>
      ipcRenderer.invoke('notes:move', id, folderId),
    trash: (id: number): Promise<void> => ipcRenderer.invoke('notes:trash', id),
    restore: (id: number): Promise<void> => ipcRenderer.invoke('notes:restore', id),
    hardDelete: (id: number): Promise<void> => ipcRenderer.invoke('notes:hardDelete', id),
    emptyTrash: (): Promise<void> => ipcRenderer.invoke('notes:emptyTrash'),
    counts: (): Promise<{ all: number; trash: number; byFolder: Record<number, number> }> =>
      ipcRenderer.invoke('notes:counts')
  },

  search: {
    query: (query: string): Promise<SearchHit[]> => ipcRenderer.invoke('search:query', query)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
