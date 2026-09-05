import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { copyFile, mkdir, rm, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, resolve, sep } from 'node:path'
import type { AttachmentKind, AttachmentSummary } from '@shared/contracts'
import { DomainValidationError } from '@main/domain/errors'
import { StudioRepository } from '@main/repositories/studio-repository'

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024
const mimeTypes: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

function isWithinDirectory(filePath: string, directory: string): boolean {
  const root = resolve(directory) + sep
  return resolve(filePath).startsWith(root)
}

export class AttachmentService {
  constructor(
    private readonly repository: StudioRepository,
    private readonly storageDirectory: string
  ) {}

  async importFile(sourcePath: string, kind: AttachmentKind): Promise<AttachmentSummary> {
    if (!['payment_receipt', 'product_image'].includes(kind))
      throw new DomainValidationError('附件类型无效')
    if (!isAbsolute(sourcePath)) throw new DomainValidationError('附件路径无效')
    let file
    try {
      file = await stat(sourcePath)
    } catch {
      throw new DomainValidationError('附件文件不存在或无法读取')
    }
    if (!file.isFile()) throw new DomainValidationError('附件必须是文件')
    if (file.size > MAX_ATTACHMENT_SIZE) throw new DomainValidationError('附件不能超过 25 MB')
    const extension = extname(sourcePath).toLowerCase()
    const mimeType = mimeTypes[extension]
    if (!mimeType || (kind === 'product_image' && !mimeType.startsWith('image/')))
      throw new DomainValidationError('附件文件类型不支持')

    await mkdir(this.storageDirectory, { recursive: true })
    const id = randomUUID()
    const storagePath = resolve(this.storageDirectory, `${id}${extension}`)
    await copyFile(sourcePath, storagePath)
    const attachment: AttachmentSummary = {
      id,
      kind,
      originalName: basename(sourcePath),
      storagePath,
      mimeType,
      sizeBytes: file.size,
      createdAt: new Date().toISOString()
    }
    try {
      this.repository.createAttachment(attachment)
      this.repository.recordAudit({
        action: 'attachment.imported',
        entityType: 'attachment',
        entityId: id,
        before: null,
        after: {
          kind: attachment.kind,
          originalName: attachment.originalName,
          sizeBytes: attachment.sizeBytes
        },
        metadata: { storagePath: attachment.storagePath }
      })
    } catch (error) {
      await rm(storagePath, { force: true })
      throw error
    }
    return attachment
  }

  async delete(id: string): Promise<boolean> {
    const attachment = this.repository.getAttachment(id)
    return attachment ? this.deleteStoredAttachment(attachment) : false
  }

  deleteProductImageByStoragePath(storagePath: string): boolean {
    const attachment = this.repository.getAttachmentByStoragePath(storagePath)
    if (!attachment || attachment.kind !== 'product_image') return false
    return this.deleteStoredAttachment(attachment)
  }

  private deleteStoredAttachment(attachment: AttachmentSummary): boolean {
    if (!isWithinDirectory(attachment.storagePath, this.storageDirectory))
      throw new DomainValidationError('附件存储路径不在受控目录内')
    rmSync(attachment.storagePath, { force: true })
    const deleted = this.repository.deleteAttachment(attachment.id)
    if (deleted) {
      this.repository.recordAudit({
        action: 'attachment.deleted',
        entityType: 'attachment',
        entityId: attachment.id,
        before: {
          kind: deleted.kind,
          originalName: deleted.originalName,
          sizeBytes: deleted.sizeBytes
        },
        after: null,
        metadata: { storagePath: deleted.storagePath }
      })
    }
    return Boolean(deleted)
  }
}
