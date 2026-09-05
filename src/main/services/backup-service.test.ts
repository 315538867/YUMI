import { randomUUID } from 'node:crypto'
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { BackupService } from './backup-service'
import { StudioService } from './studio-service'

describe('本地备份与恢复', () => {
  const cleanupPaths: string[] = []
  const databases: StudioDatabase[] = []

  afterEach(async () => {
    databases.splice(0).forEach((database) => database.close())
    await Promise.all(
      cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
    )
  })

  it('生成包含数据库、附件与版本元数据的备份，并在恢复前保护当前数据', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'yumi-backup-'))
    cleanupPaths.push(workspace)
    const dataDirectory = join(workspace, 'data')
    const databasePath = join(dataDirectory, 'yumi-studio.sqlite')
    const attachmentDirectory = join(dataDirectory, 'attachments')
    const backupDirectory = join(workspace, 'backups')
    const database = createDatabase(databasePath)
    databases.push(database)
    const repository = new StudioRepository(database)
    const service = new StudioService(repository)
    const originalProduct = service.createProduct({
      name: '初始云朵',
      basePriceCents: 3000,
      edgePriceCents: 200,
      weightGrams: 12,
      lossRate: 0.1,
      standardMinutesPerUnit: 15,
      packagingCostCents: 50,
      commissionCentsPerUnit: 100,
      moldCount: 10,
      outputPerMoldPerBatch: 2,
      maxBatchesPerDay: 2,
      imagePath: null,
      notes: null
    })
    await mkdir(attachmentDirectory, { recursive: true })
    const receiptFile = join(attachmentDirectory, 'receipt.pdf')
    await writeFile(receiptFile, '原始凭证')
    await mkdir(join(attachmentDirectory, 'nested'), { recursive: true })
    await writeFile(join(attachmentDirectory, 'nested', 'proof.txt'), '嵌套附件')
    repository.createAttachment({
      id: randomUUID(),
      kind: 'payment_receipt',
      originalName: 'receipt.pdf',
      storagePath: receiptFile,
      mimeType: 'application/pdf',
      sizeBytes: Buffer.byteLength('原始凭证'),
      createdAt: new Date().toISOString()
    })

    const backups = new BackupService({
      databasePath,
      attachmentDirectory,
      backupDirectory,
      applicationVersion: '0.1.0',
      createDatabaseSnapshot: async (destination) => {
        await database.backup(destination)
      }
    })

    const originalBackup = await backups.createBackup()
    const manifest = JSON.parse(
      await readFile(join(originalBackup.backupPath, 'manifest.json'), 'utf8')
    ) as {
      applicationVersion: string
      database: { sha256: string }
      attachments: { files: unknown[] }
    }
    expect(manifest.applicationVersion).toBe('0.1.0')
    expect(manifest.database.sha256).toHaveLength(64)
    expect(manifest.attachments.files).toHaveLength(2)
    expect(manifest.attachments.files).toContainEqual(
      expect.objectContaining({ path: 'nested/proof.txt' })
    )
    expect(
      await readFile(join(originalBackup.backupPath, 'attachments', 'receipt.pdf'), 'utf8')
    ).toBe('原始凭证')
    const corruptedBackupPath = join(backupDirectory, 'tampered-backup')
    await cp(originalBackup.backupPath, corruptedBackupPath, { recursive: true })
    await writeFile(join(corruptedBackupPath, 'attachments', 'receipt.pdf'), '已篡改')
    await expect(backups.inspectBackup(corruptedBackupPath)).rejects.toThrow('备份附件校验失败')

    service.createProduct({
      name: '恢复前新增商品',
      basePriceCents: 2800,
      edgePriceCents: 0,
      weightGrams: 10,
      lossRate: 0,
      standardMinutesPerUnit: 10,
      packagingCostCents: 30,
      commissionCentsPerUnit: 0,
      moldCount: 1,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 1,
      imagePath: null,
      notes: null
    })
    await writeFile(join(attachmentDirectory, 'new.txt'), '恢复前新增附件')

    await expect(backups.prepareRestore(originalBackup.backupPath, false)).rejects.toThrow(
      '二次确认'
    )
    const restorePlan = await backups.prepareRestore(originalBackup.backupPath, true)
    expect(restorePlan.safetyBackup.reason).toBe('pre_restore')
    expect(restorePlan.safetyBackup.backupPath).not.toBe(originalBackup.backupPath)

    database.close()
    databases.splice(databases.indexOf(database), 1)
    await backups.applyRestore(restorePlan)

    const restoredDatabase = createDatabase(databasePath)
    databases.push(restoredDatabase)
    const restoredRepository = new StudioRepository(restoredDatabase)
    expect(restoredRepository.listProducts().map((product) => product.id)).toEqual([
      originalProduct.id
    ])
    expect(await readFile(receiptFile, 'utf8')).toBe('原始凭证')
    expect(await readFile(join(attachmentDirectory, 'nested', 'proof.txt'), 'utf8')).toBe(
      '嵌套附件'
    )
    await expect(readFile(join(attachmentDirectory, 'new.txt'), 'utf8')).rejects.toThrow()

    restoredRepository.recordAudit({
      action: 'backup.restored',
      entityType: 'backup',
      entityId: originalBackup.id,
      before: { currentBackupId: restorePlan.safetyBackup.id },
      after: { restoredBackupId: originalBackup.id },
      metadata: { sourceBackupPath: originalBackup.backupPath }
    })
    expect(restoredRepository.listAuditLogs('backup')[0]?.action).toBe('backup.restored')

    await backups.recordExport({ kind: 'orders', savedPath: '/tmp/yumi-orders.xlsx' })
    await backups.recordRestore({
      restoredBackup: originalBackup,
      safetyBackup: restorePlan.safetyBackup
    })
    const activity = await backups.getActivity()
    expect(activity.lastBackup?.id).toBe(restorePlan.safetyBackup.id)
    expect(activity.lastExport?.savedPath).toBe('/tmp/yumi-orders.xlsx')
    expect(activity.lastRestore?.restoredBackup.id).toBe(originalBackup.id)
  })
})
