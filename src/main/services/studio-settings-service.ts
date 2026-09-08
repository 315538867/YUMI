import { randomUUID } from 'node:crypto'
import type { V2Database } from '@main/database/v2-connection'
import { DomainValidationError } from '@main/domain/errors'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import type { V2StudioSettings, V2StudioSettingsUpdateInput } from '@shared/contracts/index'

const GLUE_PRICE_KEY = 'studio.glue-price-micro-yuan-per-gram'

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负安全整数`)
  }
  return value
}

function parseGluePrice(valueJson: string | null | undefined): number {
  if (!valueJson) return 0
  try {
    const value = JSON.parse(valueJson) as { gluePriceMicroYuanPerGram?: unknown }
    const gluePrice = value.gluePriceMicroYuanPerGram
    return typeof gluePrice === 'number' && Number.isSafeInteger(gluePrice) && gluePrice >= 0 ? gluePrice : 0
  } catch {
    return 0
  }
}

/**
 * 工作室级别参数。商品只保留胶水用量；新建订单时再将当前单价冻结到订单快照。
 */
export class StudioSettingsService {
  constructor(
    private readonly database: V2Database,
    private readonly repository: V2OrderRepository,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  get(): V2StudioSettings {
    const row = this.database.prepare(
      'SELECT value_json, updated_at FROM app_settings WHERE key = ?'
    ).get(GLUE_PRICE_KEY) as { value_json?: string; updated_at?: string } | undefined
    return {
      gluePriceMicroYuanPerGram: parseGluePrice(row?.value_json),
      updatedAt: row?.updated_at ?? null
    }
  }

  update(input: V2StudioSettingsUpdateInput): V2StudioSettings {
    const gluePriceMicroYuanPerGram = requireNonNegativeInteger(input.gluePriceMicroYuanPerGram, '工作室胶水单价')
    return this.repository.transaction(() => {
      const before = this.get()
      const updatedAt = this.now()
      const next: V2StudioSettings = { gluePriceMicroYuanPerGram, updatedAt }
      this.database.prepare(
        `INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      ).run(GLUE_PRICE_KEY, JSON.stringify({ gluePriceMicroYuanPerGram }), updatedAt)
      this.repository.insertAudit({
        id: randomUUID(),
        action: 'studio_settings.glue_price_updated',
        entityType: 'studio_settings',
        entityId: GLUE_PRICE_KEY,
        before,
        after: next,
        createdAt: updatedAt
      })
      return next
    })
  }
}
