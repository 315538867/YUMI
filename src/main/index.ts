import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { createDatabase } from '@main/database/connection'
import { registerIpc } from '@main/ipc/register-ipc'
import { StudioRepository } from '@main/repositories/studio-repository'
import { AttachmentService } from '@main/services/attachment-service'
import { BackupService } from '@main/services/backup-service'
import { StudioService } from '@main/services/studio-service'
import type { BackupRestoreInput, BackupRestoreResult } from '@shared/contracts'

let mainWindow: BrowserWindow | null = null

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
  const userDataDirectory = app.getPath('userData')
  const databasePath = join(userDataDirectory, 'yumi-studio.sqlite')
  const attachmentDirectory = join(userDataDirectory, 'attachments')
  const database = createDatabase(databasePath)
  const repository = new StudioRepository(database)
  const attachments = new AttachmentService(repository, attachmentDirectory)
  const backup = new BackupService({
    databasePath,
    attachmentDirectory,
    backupDirectory: join(userDataDirectory, 'backups'),
    applicationVersion: app.getVersion(),
    createDatabaseSnapshot: async (destinationPath) => {
      await database.backup(destinationPath)
    }
  })

  const restoreBackup = async (input: BackupRestoreInput): Promise<BackupRestoreResult> => {
    const plan = await backup.prepareRestore(input.backupPath, input.confirmed)
    database.pragma('wal_checkpoint(TRUNCATE)')
    database.close()
    try {
      await backup.applyRestore(plan)
      const restoredDatabase = createDatabase(databasePath)
      try {
        new StudioRepository(restoredDatabase).recordAudit({
          action: 'backup.restored',
          entityType: 'backup',
          entityId: plan.sourceBackup.id,
          before: { currentBackupId: plan.safetyBackup.id },
          after: { restoredBackupId: plan.sourceBackup.id },
          metadata: {
            sourceBackupPath: plan.sourceBackup.backupPath,
            safetyBackupPath: plan.safetyBackup.backupPath
          }
        })
      } finally {
        restoredDatabase.close()
      }
    } catch (error) {
      app.relaunch()
      setImmediate(() => app.exit(1))
      throw error
    }

    const result: BackupRestoreResult = {
      restoredBackup: plan.sourceBackup,
      safetyBackup: plan.safetyBackup
    }
    await backup.recordRestore(result)
    app.relaunch()
    setImmediate(() => app.exit(0))
    return result
  }

  registerIpc(new StudioService(repository, attachments), attachments, {
    service: backup,
    restore: restoreBackup
  })
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
