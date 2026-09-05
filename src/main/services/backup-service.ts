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
import type {
  BackupReason,
  BackupRestoreResult,
  BackupSummary,
  LastExportResult,
  LastRestoreResult,
  LocalDataActivity,
  ReportExportKind
} from '@shared/contracts'

const BACKUP_FORMAT_VERSION = 1
const DATABASE_FILE_NAME = 'yumi-studio.sqlite'
const ATTACHMENTS_DIRECTORY_NAME = 'attachments'
const MANIFEST_FILE_NAME = 'manifest.json'
const ACTIVITY_FILE_NAME = 'activity.json'

export interface BackupFileIntegrity {
  path: string
  sizeBytes: number
  sha256: string
}

export interface BackupManifest {
  id: string
  formatVersion: number
  applicationVersion: string
  createdAt: string
  reason: BackupReason
  database: BackupFileIntegrity
  attachments: {
    directory: string
    files: BackupFileIntegrity[]
  }
}

export interface BackupRestorePlan {
  sourceBackup: BackupSummary
  safetyBackup: BackupSummary
}

export interface BackupServiceOptions {
  databasePath: string
  attachmentDirectory: string
  backupDirectory: string
  applicationVersion: string
  createDatabaseSnapshot(destinationPath: string): Promise<void>
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

async function collectFiles(root: string, baseDirectory = root): Promise<BackupFileIntegrity[]> {
  if (!(await exists(root))) return []
  const files: BackupFileIntegrity[] = []
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

function assertManifest(value: unknown): asserts value is BackupManifest {
  if (!value || typeof value !== 'object') throw new DomainValidationError('备份元数据无效')
  const manifest = value as Partial<BackupManifest>
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
    manifest.database.path !== DATABASE_FILE_NAME ||
    typeof manifest.database.sha256 !== 'string' ||
    typeof manifest.database.sizeBytes !== 'number'
  ) {
    throw new DomainValidationError('备份数据库校验信息无效')
  }
  if (
    !manifest.attachments ||
    manifest.attachments.directory !== ATTACHMENTS_DIRECTORY_NAME ||
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

export class BackupService {
  private readonly databasePath: string
  private readonly attachmentDirectory: string
  private readonly backupDirectory: string

  constructor(private readonly options: BackupServiceOptions) {
    this.databasePath = resolve(options.databasePath)
    this.attachmentDirectory = resolve(options.attachmentDirectory)
    this.backupDirectory = resolve(options.backupDirectory)
  }

  async createBackup(reason: BackupReason = 'manual'): Promise<BackupSummary> {
    await mkdir(this.backupDirectory, { recursive: true })
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    const backupPath = join(
      this.backupDirectory,
      `yumi-backup-${formatBackupTimestamp(new Date())}-${id}`
    )
    const backupDatabasePath = join(backupPath, DATABASE_FILE_NAME)
    const backupAttachmentsPath = join(backupPath, ATTACHMENTS_DIRECTORY_NAME)
    await mkdir(backupPath, { recursive: true })

    try {
      await this.options.createDatabaseSnapshot(backupDatabasePath)
      await mkdir(backupAttachmentsPath, { recursive: true })
      if (await exists(this.attachmentDirectory)) {
        await cp(this.attachmentDirectory, backupAttachmentsPath, { recursive: true, force: true })
      }
      const databaseStat = await stat(backupDatabasePath)
      const attachmentFiles = await collectFiles(backupAttachmentsPath)
      const manifest: BackupManifest = {
        id,
        formatVersion: BACKUP_FORMAT_VERSION,
        applicationVersion: this.options.applicationVersion,
        createdAt,
        reason,
        database: {
          path: DATABASE_FILE_NAME,
          sizeBytes: databaseStat.size,
          sha256: await hashFile(backupDatabasePath)
        },
        attachments: {
          directory: ATTACHMENTS_DIRECTORY_NAME,
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

  async getActivity(): Promise<LocalDataActivity> {
    const activity = await this.readActivity()
    const [lastBackup] = await this.listBackups()
    return {
      lastBackup: lastBackup ?? null,
      lastRestore: activity.lastRestore ?? null,
      lastExport: activity.lastExport ?? null
    }
  }

  async recordExport(input: { kind: ReportExportKind; savedPath: string }): Promise<void> {
    const activity = await this.readActivity()
    await this.writeActivity({
      ...activity,
      lastExport: { ...input, exportedAt: new Date().toISOString() }
    })
  }

  async recordRestore(input: BackupRestoreResult): Promise<void> {
    const activity = await this.readActivity()
    await this.writeActivity({
      ...activity,
      lastRestore: { ...input, restoredAt: new Date().toISOString() }
    })
  }

  async listBackups(): Promise<BackupSummary[]> {
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
      .filter((backup): backup is BackupSummary => backup !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async inspectBackup(backupPath: string): Promise<BackupSummary> {
    const resolvedBackupPath = resolve(backupPath)
    let manifest: unknown
    try {
      manifest = JSON.parse(await readFile(join(resolvedBackupPath, MANIFEST_FILE_NAME), 'utf8'))
    } catch {
      throw new DomainValidationError('备份包不存在或元数据无法读取')
    }
    assertManifest(manifest)
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

  async prepareRestore(backupPath: string, confirmed: boolean): Promise<BackupRestorePlan> {
    if (!confirmed) throw new DomainValidationError('恢复会覆盖当前数据，请完成二次确认后再继续')
    const sourceBackup = await this.inspectBackup(backupPath)
    const safetyBackup = await this.createBackup('pre_restore')
    return { sourceBackup, safetyBackup }
  }

  async applyRestore(plan: BackupRestorePlan): Promise<void> {
    const sourceBackup = await this.inspectBackup(plan.sourceBackup.backupPath)
    const sourceDatabasePath = join(sourceBackup.backupPath, DATABASE_FILE_NAME)
    const sourceAttachmentsPath = join(sourceBackup.backupPath, ATTACHMENTS_DIRECTORY_NAME)
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

  private async readActivity(): Promise<{
    lastRestore?: LastRestoreResult
    lastExport?: LastExportResult
  }> {
    try {
      const content = await readFile(join(this.backupDirectory, ACTIVITY_FILE_NAME), 'utf8')
      const activity = JSON.parse(content) as {
        lastRestore?: LastRestoreResult
        lastExport?: LastExportResult
      }
      return activity && typeof activity === 'object' ? activity : {}
    } catch {
      return {}
    }
  }

  private async writeActivity(activity: {
    lastRestore?: LastRestoreResult
    lastExport?: LastExportResult
  }): Promise<void> {
    await mkdir(this.backupDirectory, { recursive: true })
    await writeFile(
      join(this.backupDirectory, ACTIVITY_FILE_NAME),
      JSON.stringify(activity, null, 2),
      'utf8'
    )
  }

  private toSummary(backupPath: string, manifest: BackupManifest): BackupSummary {
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
