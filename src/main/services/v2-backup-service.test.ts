import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createV2Database } from '@main/database/v2-connection'
import {
  V2_ATTACHMENT_DIRECTORY_NAME,
  V2_DATABASE_FILE_NAME,
  resolveV2StoragePaths
} from '@main/database/v2-storage'
import { V2BackupService } from './v2-backup-service'

describe('V2 备份与恢复', () => {
  it('备份和恢复始终使用 V2 数据库与附件目录，且不影响 V1 文件', async () => {
    const userDataDirectory = await mkdtemp(join(tmpdir(), 'yumi-v2-backup-'))
    const v1DatabasePath = join(userDataDirectory, 'yumi-studio.sqlite')
    const v1AttachmentsDirectory = join(userDataDirectory, 'attachments')
    await writeFile(v1DatabasePath, 'v1-data')
    await mkdir(v1AttachmentsDirectory)
    await writeFile(join(v1AttachmentsDirectory, 'legacy.txt'), 'v1-attachment')

    const storage = resolveV2StoragePaths(userDataDirectory)
    const database = createV2Database(storage.databasePath)
    database.prepare("INSERT INTO customers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      'customer-original',
      '恢复前的初始客户',
      '2026-09-07T00:00:00.000Z',
      '2026-09-07T00:00:00.000Z'
    )
    await mkdir(storage.attachmentDirectory)
    await writeFile(join(storage.attachmentDirectory, 'receipt.txt'), 'v2-original-attachment')

    const backup = new V2BackupService(storage, '2.0.0', database)
    const sourceBackup = await backup.createBackup()
    expect(await readFile(join(sourceBackup.backupPath, 'manifest.json'), 'utf8')).toContain(
      V2_DATABASE_FILE_NAME
    )
    expect(await readFile(join(sourceBackup.backupPath, 'manifest.json'), 'utf8')).toContain(
      V2_ATTACHMENT_DIRECTORY_NAME
    )

    database
      .prepare("INSERT INTO customers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(
        'customer-later',
        '恢复前新增客户',
        '2026-09-07T00:00:00.000Z',
        '2026-09-07T00:00:00.000Z'
      )
    await writeFile(join(storage.attachmentDirectory, 'later.txt'), 'v2-later-attachment')
    // prepareRestore 会先创建当前状态的安全备份，因此连接仍需保持打开。
    const restorePlan = await backup.prepareRestore({ backupPath: sourceBackup.backupPath, confirmed: true })
    database.close()
    await backup.applyRestore(restorePlan)

    const restored = createV2Database(storage.databasePath)
    expect(restored.prepare('SELECT id FROM customers ORDER BY id').all()).toEqual([
      { id: 'customer-original' }
    ])
    restored.close()
    await expect(readFile(join(storage.attachmentDirectory, 'receipt.txt'), 'utf8')).resolves.toBe(
      'v2-original-attachment'
    )
    await expect(readFile(join(storage.attachmentDirectory, 'later.txt'), 'utf8')).rejects.toThrow()
    await expect(readFile(v1DatabasePath, 'utf8')).resolves.toBe('v1-data')
    await expect(readFile(join(v1AttachmentsDirectory, 'legacy.txt'), 'utf8')).resolves.toBe(
      'v1-attachment'
    )
  })
})
