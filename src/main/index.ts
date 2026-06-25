import { app, shell, BrowserWindow, nativeTheme, screen } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { closeDb } from './db'
// Bundled at build time by electron-vite (?asset → emitted file path). Used as the window
// icon on Linux: the taskbar/dock shows the WINDOW's _NET_WM_ICON, which Electron would
// otherwise leave as its default — the .desktop icon only covers the app-menu entry.
import appIcon from '../../build/icon.png?asset'

// Open http(s)/mailto links from the renderer in the user's real browser / mail client,
// never inside the app window. This is what makes editor links "open like other apps".
function isExternal(url: string): boolean {
  return /^(https?:|mailto:)/i.test(url)
}

function createWindow(): void {
  const width = 1100
  const height = 720
  // Open centered on the monitor the user is actually working on (the one under the cursor),
  // not always the primary display. Without an explicit x/y Electron centers on the primary
  // monitor, so on a multi-monitor setup the window kept appearing on the left screen.
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const x = Math.round(workArea.x + (workArea.width - width) / 2)
  const y = Math.round(workArea.y + (workArea.height - height) / 2)

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 640,
    minHeight: 420,
    show: false,
    // Pre-paint background that matches the OS theme so there's no flash before the
    // renderer applies the user's chosen theme. Tokens: dark #1b1a1f / light #fbfaff.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1a1f' : '#fbfaff',
    autoHideMenuBar: true,
    title: 'BelNote',
    // Linux: set the window icon so the taskbar/dock shows the BelNote icon (not Electron's
    // default). macOS/Windows take their icon from the packaged bundle instead.
    ...(process.platform === 'linux' ? { icon: appIcon } : {}),
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

app.whenReady().then(() => {
  registerIpc() // opens the DB (first getDb) and wires all data + open-external channels
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => closeDb())
