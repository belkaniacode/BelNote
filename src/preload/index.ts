import { contextBridge, ipcRenderer } from 'electron'

// Minimal, safe bridge exposed to the renderer as window.api.
const api = {
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
