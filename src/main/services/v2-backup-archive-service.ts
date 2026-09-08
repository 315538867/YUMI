import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { DomainValidationError } from '@main/domain/errors'
import {
  V2_ATTACHMENT_DIRECTORY_NAME,
  V2_DATABASE_FILE_NAME
} from '@main/database/v2-storage'
import type { V2BackupSummary } from '@shared/contracts/index'

const BACKUP_FORMAT_VERSION = 1
const DATABASE_FILE_NAME = V2_DATABASE_FILE_NAME
const ATTACHMENTS_DIRECTORY_NAME = V2_ATTACHMENT_DIRECTORY_NAME
const MANIFEST_FILE_NAME = 'manifest.json'

export interface V2BackupFileIntegrity {
  path: string
  sizeBytes: number
  sha256: string
}

export interface V2BackupManifest {
  id: string
  formatVersion: number
  applicationVersion: string
  createdAt: string
  reason: V2BackupSummary['reason']
  database: V2BackupFileIntegrity
  attachments: {
    directory: string
    files: V2BackupFileIntegrity[]
  }
}

export interface V2BackupRestorePlan {
  sourceBackup: V2BackupSummary
  safetyBackup: V2BackupSummary
}

export interface V2BackupArchiveServiceOptions {
  databasePath: string
  attachmentDirectory: string
  backupDirectory: string
  applicationVersion: string
  createDatabaseSnapshot(destinationPath: string): Promise<void>
  databaseFileName?: string
  attachmentDirectoryName?: string
}

function formatBackupTimestamp(date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    '-',
    pad(date.getMilliseconds(), 3)
  ].join('')
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function hashFile(path: string): Promise<string> {
  const content = await readFile(path)
  return createHash('sha256').update(content).digest('hex')
}

function toPortableRelativePath(root: string, filePath: string): string {
  return relative(root, filePath).split(sep).join('/')
}

function isSafeRelativePath(path: string): boolean {
  return path !== '' && !path.startsWith('/') && !path.includes('..') && !path.includes('\\')
}

async function collectFiles(root: string, baseDirectory = root): Promise<V2BackupFileIntegrity[]> {
  if (!(await exists(root))) return []
  const files: V2BackupFileIntegrity[] = []
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, baseDirectory)))
      continue
    }
    if (!entry.isFile()) continue
    const file = await stat(fullPath)
    files.push({
      path: toPortableRelativePath(baseDirectory, fullPath),
      sizeBytes: file.size,
      sha256: await hashFile(fullPath)
    })
  }
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

function assertManifest(
  value: unknown,
  databaseFileName: string,
  attachmentDirectoryName: string
): asserts value is V2BackupManifest {
  if (!value || typeof value !== 'object') throw new DomainValidationError('备份元数据无效')
  const manifest = value as Partial<V2BackupManifest>
  if (typeof manifest.id !== 'string' || !manifest.id)
    throw new DomainValidationError('备份标识无效')
  if (manifest.formatVersion !== BACKUP_FORMAT_VERSION)
    throw new DomainValidationError('不支持的备份格式版本')
  if (typeof manifest.applicationVersion !== 'string' || !manifest.applicationVersion)
    throw new DomainValidationError('备份缺少应用版本信息')
  if (typeof manifest.createdAt !== 'string' || !manifest.createdAt)
    throw new DomainValidationError('备份创建时间无效')
  if (manifest.reason !== 'manual' && manifest.reason !== 'pre_restore')
    throw new DomainValidationError('备份类型无效')
  if (
    !manifest.database ||
    manifest.database.path !== databaseFileName ||
    typeof manifest.database.sha256 !== 'string' ||
    typeof manifest.database.sizeBytes !== 'number'
  ) {
    throw new DomainValidationError('备份数据库校验信息无效')
  }
  if (
    !manifest.attachments ||
    manifest.attachments.directory !== attachmentDirectoryName ||
    !Array.isArray(manifest.attachments.files)
  ) {
    throw new DomainValidationError('备份附件校验信息无效')
  }
  for (const file of manifest.attachments.files) {
    if (
      !file ||
      !isSafeRelativePath(file.path) ||
      typeof file.sizeBytes !== 'number' ||
      typeof file.sha256 !== 'string'
    ) {
      throw new DomainValidationError('备份附件校验信息无效')
    }
  }
}

export class V2BackupArchiveService {
  private readonly databasePath: string
  private readonly attachmentDirectory: string
  private readonly backupDirectory: string
  private readonly databaseFileName: string
  private readonly attachmentDirectoryName: string

  constructor(private readonly options: V2BackupArchiveServiceOptions) {
    this.databasePath = resolve(options.databasePath)
    this.attachmentDirectory = resolve(options.attachmentDirectory)
    this.backupDirectory = resolve(options.backupDirectory)
    this.databaseFileName = this.assertBackupEntryName(
      options.databaseFileName ?? DATABASE_FILE_NAME,
      '数据库文件名'
    )
    this.attachmentDirectoryName = this.assertBackupEntryName(
      options.attachmentDirectoryName ?? ATTACHMENTS_DIRECTORY_NAME,
      '附件目录名'
    )
  }

  async createBackup(reason: V2BackupSummary['reason'] = 'manual'): Promise<V2BackupSummary> {
    await mkdir(this.backupDirectory, { recursive: true })
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    const backupPath = join(
      this.backupDirectory,
      `yumi-backup-${formatBackupTimestamp(new Date())}-${id}`
    )
    const backupDatabasePath = join(backupPath, this.databaseFileName)
    const backupAttachmentsPath = join(backupPath, this.attachmentDirectoryName)
    await mkdir(backupPath, { recursive: true })

    try {
      await this.options.createDatabaseSnapshot(backupDatabasePath)
      await mkdir(backupAttachmentsPath, { recursive: true })
      if (await exists(this.attachmentDirectory)) {
        await cp(this.attachmentDirectory, backupAttachmentsPath, { recursive: true, force: true })
      }
      const databaseStat = await stat(backupDatabasePath)
      const attachmentFiles = await collectFiles(backupAttachmentsPath)
      const manifest: V2BackupManifest = {
        id,
        formatVersion: BACKUP_FORMAT_VERSION,
        applicationVersion: this.options.applicationVersion,
        createdAt,
        reason,
        database: {
          path: this.databaseFileName,
          sizeBytes: databaseStat.size,
          sha256: await hashFile(backupDatabasePath)
        },
        attachments: {
          directory: this.attachmentDirectoryName,
          files: attachmentFiles
        }
      }
      await writeFile(
        join(backupPath, MANIFEST_FILE_NAME),
        JSON.stringify(manifest, null, 2),
        'utf8'
      )
      return this.toSummary(backupPath, manifest)
    } catch (error) {
      await rm(backupPath, { recursive: true, force: true })
      throw error
    }
  }

  async listBackups(): Promise<V2BackupSummary[]> {
    if (!(await exists(this.backupDirectory))) return []
    const entries = await readdir(this.backupDirectory, { withFileTypes: true })
    const backups = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('yumi-backup-'))
        .map(async (entry) => {
          try {
            return await this.inspectBackup(join(this.backupDirectory, entry.name))
          } catch {
            return null
          }
        })
    )
    return backups
      .filter((backup): backup is V2BackupSummary => backup !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async inspectBackup(backupPath: string): Promise<V2BackupSummary> {
    const resolvedBackupPath = resolve(backupPath)
    let manifest: unknown
    try {
      manifest = JSON.parse(await readFile(join(resolvedBackupPath, MANIFEST_FILE_NAME), 'utf8'))
    } catch {
      throw new DomainValidationError('备份包不存在或元数据无法读取')
    }
    assertManifest(manifest, this.databaseFileName, this.attachmentDirectoryName)
    const databasePath = join(resolvedBackupPath, manifest.database.path)
    if (!(await exists(databasePath))) throw new DomainValidationError('备份数据库文件不存在')
    const databaseStat = await stat(databasePath)
    if (
      databaseStat.size !== manifest.database.sizeBytes ||
      (await hashFile(databasePath)) !== manifest.database.sha256
    ) {
      throw new DomainValidationError('备份数据库校验失败')
    }

    const attachmentsPath = join(resolvedBackupPath, manifest.attachments.directory)
    if (!(await exists(attachmentsPath))) throw new DomainValidationError('备份附件目录不存在')
    const actualAttachments = await collectFiles(attachmentsPath)
    if (JSON.stringify(actualAttachments) !== JSON.stringify(manifest.attachments.files))
      throw new DomainValidationError('备份附件校验失败')

    return this.toSummary(resolvedBackupPath, manifest)
  }

  async prepareRestore(backupPath: string, confirmed: boolean): Promise<V2BackupRestorePlan> {
    if (!confirmed) throw new DomainValidationError('恢复会覆盖当前数据，请完成二次确认后再继续')
    const sourceBackup = await this.inspectBackup(backupPath)
    const safetyBackup = await this.createBackup('pre_restore')
    return { sourceBackup, safetyBackup }
  }

  async applyRestore(plan: V2BackupRestorePlan): Promise<void> {
    const sourceBackup = await this.inspectBackup(plan.sourceBackup.backupPath)
    const sourceDatabasePath = join(sourceBackup.backupPath, this.databaseFileName)
    const sourceAttachmentsPath = join(sourceBackup.backupPath, this.attachmentDirectoryName)
    const restoreId = randomUUID()
    const stagedDatabasePath = join(
      dirname(this.databasePath),
      `.${basename(this.databasePath)}.restore-${restoreId}`
    )
    const stagedAttachmentsPath = join(
      dirname(this.attachmentDirectory),
      `.${basename(this.attachmentDirectory)}.restore-${restoreId}`
    )
    const previousDatabasePath = `${this.databasePath}.previous-${restoreId}`
    const previousAttachmentsPath = `${this.attachmentDirectory}.previous-${restoreId}`
    let previousDatabaseMoved = false
    let previousAttachmentsMoved = false
    let restoredDatabaseMoved = false
    let restoredAttachmentsMoved = false

    await mkdir(dirname(this.databasePath), { recursive: true })
    await mkdir(dirname(this.attachmentDirectory), { recursive: true })
    try {
      await copyFile(sourceDatabasePath, stagedDatabasePath)
      await cp(sourceAttachmentsPath, stagedAttachmentsPath, { recursive: true, force: true })

      if (await exists(this.databasePath)) {
        await rename(this.databasePath, previousDatabasePath)
        previousDatabaseMoved = true
      }
      if (await exists(this.attachmentDirectory)) {
        await rename(this.attachmentDirectory, previousAttachmentsPath)
        previousAttachmentsMoved = true
      }

      await rename(stagedDatabasePath, this.databasePath)
      restoredDatabaseMoved = true
      await rename(stagedAttachmentsPath, this.attachmentDirectory)
      restoredAttachmentsMoved = true
      await rm(`${this.databasePath}-wal`, { force: true })
      await rm(`${this.databasePath}-shm`, { force: true })
      await rm(previousDatabasePath, { force: true })
      await rm(previousAttachmentsPath, { recursive: true, force: true })
    } catch (error) {
      if (restoredAttachmentsMoved)
        await rm(this.attachmentDirectory, { recursive: true, force: true })
      if (restoredDatabaseMoved) await rm(this.databasePath, { force: true })
      if (previousAttachmentsMoved) await rename(previousAttachmentsPath, this.attachmentDirectory)
      if (previousDatabaseMoved) await rename(previousDatabasePath, this.databasePath)
      throw error
    } finally {
      await rm(stagedDatabasePath, { force: true })
      await rm(stagedAttachmentsPath, { recursive: true, force: true })
      await rm(previousDatabasePath, { force: true })
      await rm(previousAttachmentsPath, { recursive: true, force: true })
    }
  }

  private assertBackupEntryName(value: string, label: string): string {
    if (!value || basename(value) !== value || value === '.' || value === '..') {
      throw new DomainValidationError(`${label}无效`)
    }
    return value
  }

  private toSummary(backupPath: string, manifest: V2BackupManifest): V2BackupSummary {
    return {
      id: manifest.id,
      backupPath,
      createdAt: manifest.createdAt,
      reason: manifest.reason,
      applicationVersion: manifest.applicationVersion,
      attachmentCount: manifest.attachments.files.length
    }
  }
}
