import type { V2Database } from '@main/database/v2-connection'
import type { V2StoragePaths } from '@main/database/v2-storage'
import {
  V2_ATTACHMENT_DIRECTORY_NAME,
  V2_DATABASE_FILE_NAME
} from '@main/database/v2-storage'
import {
  BackupService,
  type BackupRestorePlan
} from '@main/services/backup-service'
import type { V2BackupRestoreInput, V2BackupRestoreResult, V2BackupSummary } from '@shared/contracts'

/**
 * V2 备份的唯一入口：显式绑定 V2 数据库和 V2 附件目录，避免任何调用误落到 V1 文件。
 */
export class V2BackupService {
  private readonly backup: BackupService

  constructor(storage: V2StoragePaths, applicationVersion: string, database: V2Database) {
    this.backup = new BackupService({
      databasePath: storage.databasePath,
      attachmentDirectory: storage.attachmentDirectory,
      backupDirectory: storage.backupDirectory,
      applicationVersion,
      databaseFileName: V2_DATABASE_FILE_NAME,
      attachmentDirectoryName: V2_ATTACHMENT_DIRECTORY_NAME,
      createDatabaseSnapshot: (destinationPath) => database.backup(destinationPath)
    })
  }

  createBackup(): Promise<V2BackupSummary> {
    return this.backup.createBackup()
  }

  listBackups(): Promise<V2BackupSummary[]> {
    return this.backup.listBackups()
  }

  getActivity() {
    return this.backup.getActivity()
  }

  inspectBackup(backupPath: string): Promise<V2BackupSummary> {
    return this.backup.inspectBackup(backupPath)
  }

  prepareRestore(input: V2BackupRestoreInput): Promise<BackupRestorePlan> {
    return this.backup.prepareRestore(input.backupPath, input.confirmed)
  }

  applyRestore(plan: BackupRestorePlan): Promise<V2BackupRestoreResult> {
    return this.backup.applyRestore(plan)
  }

}
