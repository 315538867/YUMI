/** V2 所有金额均以整数分表示，禁止在 IPC 契约中传递浮点元。 */
export type Cents = number

/** 材料单价以每克的微元保存：1 元 = 1,000,000 微元。 */
export type MaterialPriceMicroYuanPerGram = number

/** 重量以毫克保存：1 克 = 1,000 毫克。 */
export type WeightMilligrams = number

/** 业务日期采用本地日历日期 YYYY-MM-DD；审计时间采用 ISO 8601 时间字符串。 */
export type BusinessDate = string
export type IsoDateTime = string

export interface V2DomainError {
  code:
    'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'QUANTITY_EXCEEDED' | 'FUND_REVERSAL_CONFLICT'
  message: string
  details?: Record<string, unknown>
}

export interface V2MutationResult<T> {
  value: T
  auditLogId: string
}

export type V2AttachmentStatus = 'available' | 'missing'

export interface V2AttachmentReference {
  id: string
  originalName: string
  storageKey: string
  mimeType: string | null
  sizeBytes: number
  createdAt: IsoDateTime
}

export interface V2OrderFundProof extends V2AttachmentReference {
  status: V2AttachmentStatus
}

export interface V2OrderFundProofOpenResult {
  status: 'opened' | 'missing' | 'none' | 'failed'
  message?: string
}

export interface V2BackupSummary {
  id: string
  backupPath: string
  createdAt: IsoDateTime
  reason: 'manual' | 'pre_restore'
  applicationVersion: string
  attachmentCount: number
}

export interface V2BackupRestoreInput {
  backupPath: string
  confirmed: boolean
}

export interface V2BackupRestoreResult {
  restoredBackup: V2BackupSummary
  safetyBackup: V2BackupSummary
}
