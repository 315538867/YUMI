import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { V2ApplicationRuntime } from '@main/application/v2-runtime'
import { registerV2Ipc } from '@main/ipc/register-v2-ipc'
import type { V2BackupRestoreInput, V2BackupRestoreResult } from '@shared/contracts'

let mainWindow: BrowserWindow | null = null
let runtime: V2ApplicationRuntime | null = null

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f6f5f2',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  runtime = new V2ApplicationRuntime(app.getPath('userData'), app.getVersion())
  runtime.start()
  const currentRuntime = runtime
  const restore = async (input: V2BackupRestoreInput): Promise<V2BackupRestoreResult> => {
    const result = await currentRuntime.restore(input)
    app.relaunch()
    setImmediate(() => app.exit(0))
    return result
  }
  registerV2Ipc(currentRuntime.orderService, {
    service: currentRuntime.backupService,
    restore
  })
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => runtime?.close())
