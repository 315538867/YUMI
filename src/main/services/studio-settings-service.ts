import { randomUUID } from 'node:crypto'
import type { V2Database } from '@main/database/v2-connection'
import { DomainValidationError } from '@main/domain/errors'
import { DEFAULT_ORDER_RESERVED_DAYS } from '@main/domain/order-schedule'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import type { V2StudioSettings, V2StudioSettingsUpdateInput } from '@shared/contracts/index'

const MATERIAL_PRICE_KEY = 'studio.material-price-micro-yuan-per-gram'
const ORDER_RESERVED_DAYS_KEY = 'studio.order-reserved-days'
const FLUFFING_BAGGING_EXPECTED_WAGE_KEY = 'studio.fluffing-bagging-expected-hourly-wage-cents'
const EDGE_SEWING_EXPECTED_WAGE_KEY = 'studio.edge-sewing-expected-hourly-wage-cents'
const PACKING_EXPECTED_WAGE_KEY = 'studio.packing-expected-hourly-wage-cents'

const settingKeys = [
  MATERIAL_PRICE_KEY,
  ORDER_RESERVED_DAYS_KEY,
  FLUFFING_BAGGING_EXPECTED_WAGE_KEY,
  EDGE_SEWING_EXPECTED_WAGE_KEY,
  PACKING_EXPECTED_WAGE_KEY
] as const

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainValidationError(`${label}必须是非负安全整数`)
  }
  return value
}

function parseNonNegativeInteger(valueJson: string | null | undefined, fallback: number): number {
  if (!valueJson) return fallback
  try {
    const value = JSON.parse(valueJson)
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback
  } catch {
    return fallback
  }
}

/**
 * 工作室级别参数。全局材料克单价与三道计时工序预计基准时薪只在这里维护；
 * 商品页面只读展示，新建订单时再把当前材料克单价冻结到订单快照。
 */
export class StudioSettingsService {
  constructor(
    private readonly database: V2Database,
    private readonly repository: V2OrderRepository,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  get(): V2StudioSettings {
    const rows = this.database
      .prepare(
        `SELECT key, value_json, updated_at FROM app_settings WHERE key IN (${settingKeys.map(() => '?').join(', ')})`
      )
      .all(...settingKeys) as Array<{
      key: string
      value_json?: string
      updated_at?: string
    }>
    const valueOf = (key: string): string | undefined =>
      rows.find((row) => row.key === key)?.value_json
    const updatedAt =
      rows
        .map((row) => row.updated_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null
    return {
      materialPriceMicroYuanPerGram: parseNonNegativeInteger(valueOf(MATERIAL_PRICE_KEY), 0),
      orderReservedDays: parseNonNegativeInteger(
        valueOf(ORDER_RESERVED_DAYS_KEY),
        DEFAULT_ORDER_RESERVED_DAYS
      ),
      fluffingBaggingExpectedHourlyWageCents: parseNonNegativeInteger(
        valueOf(FLUFFING_BAGGING_EXPECTED_WAGE_KEY),
        0
      ),
      edgeSewingExpectedHourlyWageCents: parseNonNegativeInteger(
        valueOf(EDGE_SEWING_EXPECTED_WAGE_KEY),
        0
      ),
      packingExpectedHourlyWageCents: parseNonNegativeInteger(
        valueOf(PACKING_EXPECTED_WAGE_KEY),
        0
      ),
      updatedAt
    }
  }

  update(input: V2StudioSettingsUpdateInput): V2StudioSettings {
    const current = this.get()
    const materialPriceMicroYuanPerGram = requireNonNegativeInteger(
      input.materialPriceMicroYuanPerGram,
      '工作室材料克单价'
    )
    const orderReservedDays = requireNonNegativeInteger(
      input.orderReservedDays ?? current.orderReservedDays,
      '工作室默认预留天数'
    )
    const fluffingBaggingExpectedHourlyWageCents = requireNonNegativeInteger(
      input.fluffingBaggingExpectedHourlyWageCents ??
        current.fluffingBaggingExpectedHourlyWageCents,
      '捏毛装袋预计基准时薪'
    )
    const edgeSewingExpectedHourlyWageCents = requireNonNegativeInteger(
      input.edgeSewingExpectedHourlyWageCents ?? current.edgeSewingExpectedHourlyWageCents,
      '缝边预计基准时薪'
    )
    const packingExpectedHourlyWageCents = requireNonNegativeInteger(
      input.packingExpectedHourlyWageCents ?? current.packingExpectedHourlyWageCents,
      '打包发货预计基准时薪'
    )
    return this.repository.transaction(() => {
      const before = current
      const updatedAt = this.now()
      const next: V2StudioSettings = {
        materialPriceMicroYuanPerGram,
        orderReservedDays,
        fluffingBaggingExpectedHourlyWageCents,
        edgeSewingExpectedHourlyWageCents,
        packingExpectedHourlyWageCents,
        updatedAt
      }
      const upsert = this.database.prepare(
        `INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      upsert.run(MATERIAL_PRICE_KEY, JSON.stringify(materialPriceMicroYuanPerGram), updatedAt)
      upsert.run(ORDER_RESERVED_DAYS_KEY, JSON.stringify(orderReservedDays), updatedAt)
      upsert.run(
        FLUFFING_BAGGING_EXPECTED_WAGE_KEY,
        JSON.stringify(fluffingBaggingExpectedHourlyWageCents),
        updatedAt
      )
      upsert.run(
        EDGE_SEWING_EXPECTED_WAGE_KEY,
        JSON.stringify(edgeSewingExpectedHourlyWageCents),
        updatedAt
      )
      upsert.run(
        PACKING_EXPECTED_WAGE_KEY,
        JSON.stringify(packingExpectedHourlyWageCents),
        updatedAt
      )
      this.repository.insertAudit({
        id: randomUUID(),
        action: 'studio_settings.updated',
        entityType: 'studio_settings',
        entityId: MATERIAL_PRICE_KEY,
        before,
        after: next,
        createdAt: updatedAt
      })
      return next
    })
  }
}
