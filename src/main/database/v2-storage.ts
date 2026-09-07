import { join } from 'node:path'

export const V2_DATABASE_FILE_NAME = 'yumi-studio-v2.sqlite'
export const V2_ATTACHMENT_DIRECTORY_NAME = 'attachments-v2'
export const V2_BACKUP_DIRECTORY_NAME = 'backups-v2'

export interface V2StoragePaths {
  userDataDirectory: string
  databasePath: string
  attachmentDirectory: string
  backupDirectory: string
}

/**
 * V2 与 V1 物理隔离：所有正式业务事实只能由这一组路径派生。
 */
export function resolveV2StoragePaths(userDataDirectory: string): V2StoragePaths {
  return {
    userDataDirectory,
    databasePath: join(userDataDirectory, V2_DATABASE_FILE_NAME),
    attachmentDirectory: join(userDataDirectory, V2_ATTACHMENT_DIRECTORY_NAME),
    backupDirectory: join(userDataDirectory, V2_BACKUP_DIRECTORY_NAME)
  }
}
