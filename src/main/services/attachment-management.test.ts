import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { DomainValidationError } from '@main/domain/errors'
import { StudioRepository } from '@main/repositories/studio-repository'
import { AttachmentService } from './attachment-service'
import { StudioService } from './studio-service'

describe('附件安全存储与索引', () => {
  const databases: StudioDatabase[] = []
  const directories: string[] = []

  afterEach(async () => {
    databases.splice(0).forEach((database) => database.close())
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('将商品图片和收款凭证复制到受控目录并写入索引', async () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const sourceDirectory = await mkdtemp(join(tmpdir(), 'yumi-source-'))
    const storageDirectory = await mkdtemp(join(tmpdir(), 'yumi-storage-'))
    directories.push(sourceDirectory, storageDirectory)
    const sourcePath = join(sourceDirectory, 'payment-proof.png')
    await writeFile(sourcePath, 'fake image content')
    const repository = new StudioRepository(database)
    const service = new AttachmentService(repository, storageDirectory)

    const attachment = await service.importFile(sourcePath, 'payment_receipt')
    expect(attachment).toMatchObject({
      kind: 'payment_receipt',
      originalName: 'payment-proof.png',
      mimeType: 'image/png',
      sizeBytes: 18
    })
    expect(attachment.storagePath.startsWith(storageDirectory)).toBe(true)
    expect(await readFile(attachment.storagePath, 'utf8')).toBe('fake image content')
    expect(repository.getAttachment(attachment.id)).toEqual(attachment)
    expect(repository.listAuditLogs('attachment')).toEqual([
      expect.objectContaining({ action: 'attachment.imported', entityId: attachment.id })
    ])

    expect(await service.delete(attachment.id)).toBe(true)
    await expect(stat(attachment.storagePath)).rejects.toThrow()
    expect(repository.getAttachment(attachment.id)).toBeNull()
    expect(repository.listAuditLogs('attachment')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'attachment.deleted', entityId: attachment.id })
      ])
    )
  })

  it('商品图片替换时可按受控存储路径删除旧文件及其索引', async () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const sourceDirectory = await mkdtemp(join(tmpdir(), 'yumi-source-'))
    const storageDirectory = await mkdtemp(join(tmpdir(), 'yumi-storage-'))
    directories.push(sourceDirectory, storageDirectory)
    const sourcePath = join(sourceDirectory, 'old-product-image.png')
    await writeFile(sourcePath, 'old product image')
    const repository = new StudioRepository(database)
    const service = new AttachmentService(repository, storageDirectory)
    const attachment = await service.importFile(sourcePath, 'product_image')

    expect(
      (
        service as unknown as {
          deleteProductImageByStoragePath(storagePath: string): boolean
        }
      ).deleteProductImageByStoragePath(attachment.storagePath)
    ).toBe(true)
    await expect(stat(attachment.storagePath)).rejects.toThrow()
    expect(repository.getAttachment(attachment.id)).toBeNull()
  })

  it('商品更新替换或移除图片时同步清理旧附件文件与索引', async () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const sourceDirectory = await mkdtemp(join(tmpdir(), 'yumi-source-'))
    const storageDirectory = await mkdtemp(join(tmpdir(), 'yumi-storage-'))
    directories.push(sourceDirectory, storageDirectory)
    const oldSourcePath = join(sourceDirectory, 'old-product-image.png')
    const newSourcePath = join(sourceDirectory, 'new-product-image.png')
    await Promise.all([
      writeFile(oldSourcePath, 'old image'),
      writeFile(newSourcePath, 'new image')
    ])
    const repository = new StudioRepository(database)
    const attachments = new AttachmentService(repository, storageDirectory)
    const service = new (
      StudioService as unknown as new (
        repository: StudioRepository,
        attachmentService: AttachmentService
      ) => StudioService
    )(repository, attachments)
    const oldAttachment = await attachments.importFile(oldSourcePath, 'product_image')
    const newAttachment = await attachments.importFile(newSourcePath, 'product_image')
    const product = service.createProduct({
      name: '奶油小熊',
      basePriceCents: 3900,
      edgePriceCents: 300,
      weightGrams: 20,
      lossRate: 0.1,
      standardMinutesPerUnit: 30,
      packagingCostCents: 100,
      commissionCentsPerUnit: 200,
      moldCount: 20,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2,
      imagePath: oldAttachment.storagePath
    })

    const updated = service.updateProduct({ ...product, imagePath: newAttachment.storagePath })
    expect(updated.imagePath).toBe(newAttachment.storagePath)
    expect(repository.getAttachment(oldAttachment.id)).toBeNull()
    await expect(stat(oldAttachment.storagePath)).rejects.toThrow()
    expect(repository.getAttachment(newAttachment.id)).toEqual(newAttachment)

    service.updateProduct({ ...updated, imagePath: null })
    expect(repository.getAttachment(newAttachment.id)).toBeNull()
    await expect(stat(newAttachment.storagePath)).rejects.toThrow()
  })

  it('拒绝不存在、超大或不受控的附件文件', async () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const storageDirectory = await mkdtemp(join(tmpdir(), 'yumi-storage-'))
    directories.push(storageDirectory)
    const service = new AttachmentService(new StudioRepository(database), storageDirectory)

    await expect(service.importFile('/tmp/yumi-not-found.png', 'product_image')).rejects.toThrow(
      '附件文件不存在或无法读取'
    )
    await expect(
      service.importFile('/tmp/yumi-not-found.png', 'invalid' as never)
    ).rejects.toBeInstanceOf(DomainValidationError)

    const sourceDirectory = await mkdtemp(join(tmpdir(), 'yumi-source-'))
    directories.push(sourceDirectory)
    const unsupportedFile = join(sourceDirectory, 'receipt.txt')
    await writeFile(unsupportedFile, 'not an allowed receipt')
    await expect(service.importFile(unsupportedFile, 'payment_receipt')).rejects.toThrow(
      '附件文件类型不支持'
    )
  })
})
