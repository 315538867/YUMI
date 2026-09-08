import type { V2Database } from '@main/database/v2-connection'
import type { V2StoragePaths } from '@main/database/v2-storage'
import {
  V2_ATTACHMENT_DIRECTORY_NAME,
  V2_DATABASE_FILE_NAME
} from '@main/database/v2-storage'
import {
  V2BackupArchiveService,
  type V2BackupRestorePlan
} from '@main/services/v2-backup-archive-service'
import type {
  V2BackupRestoreInput,
  V2BackupSummary
} from '@shared/contracts/index'

/**
 * V2 备份的唯一入口：显式绑定 V2 数据库和 V2 附件目录，避免任何调用误落到 V1 文件。
 */
export class V2BackupService {
  private readonly backup: V2BackupArchiveService

  constructor(storage: V2StoragePaths, applicationVersion: string, database: V2Database) {
    this.backup = new V2BackupArchiveService({
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

  prepareRestore(input: V2BackupRestoreInput): Promise<V2BackupRestorePlan> {
    return this.backup.prepareRestore(input.backupPath, input.confirmed)
  }

  applyRestore(plan: V2BackupRestorePlan): Promise<void> {
    return this.backup.applyRestore(plan)
  }
}
