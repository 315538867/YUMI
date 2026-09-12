import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { basename, extname, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { V2Database } from '@main/database/v2-connection'
import { DomainValidationError } from '@main/domain/errors'
import type { V2AttachmentReference, V2OrderFundProof } from '@shared/contracts/index'

interface AttachmentClock {
  createId(): string
  now(): string
}

const defaultClock: AttachmentClock = {
  createId: randomUUID,
  now: () => new Date().toISOString()
}

interface AttachmentRow {
  id: string
  original_name: string
  storage_key: string
  mime_type: string | null
  size_bytes: number
  created_at: string
}

function inferMimeType(filePath: string): string | null {
  switch (extname(filePath).toLowerCase()) {
    case '.pdf':
      return 'application/pdf'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.txt':
      return 'text/plain'
    default:
      return null
  }
}

function mapReference(row: AttachmentRow): V2AttachmentReference {
  return {
    id: row.id,
    originalName: row.original_name,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at
  }
}

/**
 * 订单收款凭证以独立附件保存，再以 attachment_id 关联到既有资金流水。
 * 附件替换只变更关联字段，资金金额、日期、支付方式和业务类型始终不可覆盖。
 */
export class OrderFundAttachmentService {
  private readonly rootDirectory: string

  constructor(
    private readonly database: V2Database,
    attachmentDirectory: string,
    private readonly clock: AttachmentClock = defaultClock
  ) {
    this.rootDirectory = resolve(attachmentDirectory)
  }

  prepareFromFile(filePath: string): V2AttachmentReference {
    const source = resolve(filePath)
    if (!existsSync(source) || !statSync(source).isFile()) {
      throw new DomainValidationError('收款凭证文件不存在或不可读取')
    }
    const id = this.clock.createId()
    const storageKey = `${id}${extname(source).toLowerCase()}`
    mkdirSync(this.rootDirectory, { recursive: true })
    const target = this.resolveStoragePath(storageKey)
    const now = this.clock.now()
    const row: AttachmentRow = {
      id,
      original_name: basename(source),
      storage_key: storageKey,
      mime_type: inferMimeType(source),
      size_bytes: statSync(source).size,
      created_at: now
    }
    copyFileSync(source, target)
    try {
      this.database
        .prepare(
          `
        INSERT INTO attachments (id, kind, original_name, storage_key, mime_type, size_bytes, created_at)
        VALUES (?, 'order_fund_proof', ?, ?, ?, ?, ?)
      `
        )
        .run(
          row.id,
          row.original_name,
          row.storage_key,
          row.mime_type,
          row.size_bytes,
          row.created_at
        )
    } catch (error) {
      rmSync(target, { force: true })
      throw error
    }
    return mapReference(row)
  }

  discardPrepared(attachmentId: string): void {
    const attachment = this.getAttachment(attachmentId)
    if (!attachment || !this.isOrderFundProof(attachmentId)) return
    const inUse = this.database
      .prepare('SELECT 1 FROM financial_entries WHERE attachment_id = ? LIMIT 1')
      .get(attachmentId)
    if (inUse) throw new DomainValidationError('已关联资金流水的凭证不能移除')
    this.database.prepare('DELETE FROM attachments WHERE id = ?').run(attachmentId)
    rmSync(this.resolveStoragePath(attachment.storage_key), { force: true })
  }

  attachToFund(fundId: string, attachmentId: string): void {
    this.database.transaction(() => {
      const fund = this.database
        .prepare(
          `
        SELECT id, order_id, amount_cents, occurred_on, payment_method, business_type, attachment_id
        FROM financial_entries
        WHERE id = ? AND source_type = 'order_fund' AND direction = 'income'
      `
        )
        .get(fundId) as
        | {
            id: string
            order_id: string
            amount_cents: number
            occurred_on: string
            payment_method: string | null
            business_type: string
            attachment_id: string | null
          }
        | undefined
      if (!fund) throw new DomainValidationError('只能为订单收款流水关联凭证')
      if (!this.isOrderFundProof(attachmentId))
        throw new DomainValidationError('收款凭证不存在或类型不正确')

      this.database
        .prepare('UPDATE financial_entries SET attachment_id = ? WHERE id = ?')
        .run(attachmentId, fundId)
      const action = fund.attachment_id ? 'order_fund.proof_replaced' : 'order_fund.proof_attached'
      this.database
        .prepare(
          `
        INSERT INTO audit_logs (id, action, entity_type, entity_id, before_json, after_json, metadata_json, created_at)
        VALUES (?, ?, 'financial_entry', ?, ?, ?, ?, ?)
      `
        )
        .run(
          this.clock.createId(),
          action,
          fundId,
          JSON.stringify({ attachmentId: fund.attachment_id }),
          JSON.stringify({ attachmentId }),
          JSON.stringify({ orderId: fund.order_id }),
          this.clock.now()
        )
    })()
  }

  getFundProof(fundId: string): V2OrderFundProof | null {
    const row = this.database
      .prepare(
        `
      SELECT a.id, a.original_name, a.storage_key, a.mime_type, a.size_bytes, a.created_at
      FROM financial_entries entry
      JOIN attachments a ON a.id = entry.attachment_id
      WHERE entry.id = ? AND entry.source_type = 'order_fund'
    `
      )
      .get(fundId) as AttachmentRow | undefined
    if (!row) return null
    return {
      ...mapReference(row),
      status: existsSync(this.resolveStoragePath(row.storage_key)) ? 'available' : 'missing'
    }
  }

  getFundProofPath(fundId: string): string | null {
    const proof = this.getFundProof(fundId)
    if (!proof || proof.status === 'missing') return null
    return this.resolveStoragePath(proof.storageKey)
  }

  private getAttachment(attachmentId: string): AttachmentRow | null {
    return (
      (this.database
        .prepare(
          `
      SELECT id, original_name, storage_key, mime_type, size_bytes, created_at
      FROM attachments WHERE id = ?
    `
        )
        .get(attachmentId) as AttachmentRow | undefined) ?? null
    )
  }

  private isOrderFundProof(attachmentId: string): boolean {
    return Boolean(
      this.database
        .prepare(
          `
      SELECT 1 FROM attachments WHERE id = ? AND kind = 'order_fund_proof'
    `
        )
        .get(attachmentId)
    )
  }

  private resolveStoragePath(storageKey: string): string {
    const filePath = resolve(this.rootDirectory, storageKey)
    const withinRoot = relative(this.rootDirectory, filePath)
    if (withinRoot.startsWith('..') || withinRoot === '') {
      throw new DomainValidationError('收款凭证存储路径无效')
    }
    return filePath
  }
}
