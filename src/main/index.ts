import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'

// Open http(s)/mailto links from the renderer in the user's real browser / mail client,
// never inside the app window. This is what makes editor links "open like other apps".
function isExternal(url: string): boolean {
  return /^(https?:|mailto:)/i.test(url)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 640,
    minHeight: 420,
    show: false,
    backgroundColor: '#1b1a1f',
    autoHideMenuBar: true,
    title: 'BelNote',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())

  // Any window.open / target=_blank → external browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  // Block in-app navigation to external URLs; open them externally instead.
  win.webContents.on('will-navigate', (event, url) => {
    if (isExternal(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Renderer can also ask the main process to open a URL explicitly (used by the editor).
ipcMain.handle('open-external', (_e, url: string) => {
  if (isExternal(url)) return shell.openExternal(url)
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
