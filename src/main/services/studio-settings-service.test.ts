import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { StudioSettingsService } from './studio-settings-service'

describe('StudioSettingsService', () => {
  const databases: V2Database[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('未配置时使用默认值，更新后可供新订单读取', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const service = new StudioSettingsService(
      database,
      new V2OrderRepository(database),
      () => '2026-09-09T00:00:00.000Z'
    )

    expect(service.get()).toMatchObject({
      materialPriceMicroYuanPerGram: 0,
      orderReservedDays: 2,
      fluffingBaggingExpectedHourlyWageCents: 0,
      edgeSewingExpectedHourlyWageCents: 0,
      packingExpectedHourlyWageCents: 0
    })
    expect(
      service.update({ materialPriceMicroYuanPerGram: 3_400, orderReservedDays: 4 })
    ).toMatchObject({
      materialPriceMicroYuanPerGram: 3_400,
      orderReservedDays: 4,
      updatedAt: '2026-09-09T00:00:00.000Z'
    })
    expect(service.get()).toMatchObject({
      materialPriceMicroYuanPerGram: 3_400,
      orderReservedDays: 4
    })
  })

  it('维护三道计时工序的预计基准时薪，并能与材料克单价一起更新', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const service = new StudioSettingsService(
      database,
      new V2OrderRepository(database),
      () => '2026-09-09T00:00:00.000Z'
    )

    const updated = service.update({
      materialPriceMicroYuanPerGram: 3_400,
      orderReservedDays: 2,
      fluffingBaggingExpectedHourlyWageCents: 3_000,
      edgeSewingExpectedHourlyWageCents: 3_600,
      packingExpectedHourlyWageCents: 2_400
    })
    expect(updated).toMatchObject({
      fluffingBaggingExpectedHourlyWageCents: 3_000,
      edgeSewingExpectedHourlyWageCents: 3_600,
      packingExpectedHourlyWageCents: 2_400
    })
    expect(service.get()).toMatchObject({
      materialPriceMicroYuanPerGram: 3_400,
      fluffingBaggingExpectedHourlyWageCents: 3_000,
      edgeSewingExpectedHourlyWageCents: 3_600,
      packingExpectedHourlyWageCents: 2_400
    })

    expect(() =>
      service.update({ materialPriceMicroYuanPerGram: 3_400, packingExpectedHourlyWageCents: -1 })
    ).toThrow('打包发货预计基准时薪必须是非负安全整数')
  })

  it('拒绝负数或小数的工作室默认预留天数', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const service = new StudioSettingsService(database, new V2OrderRepository(database))

    expect(() =>
      service.update({ materialPriceMicroYuanPerGram: 0, orderReservedDays: -1 })
    ).toThrow('工作室默认预留天数必须是非负安全整数')
    expect(() =>
      service.update({ materialPriceMicroYuanPerGram: 0, orderReservedDays: 1.5 })
    ).toThrow('工作室默认预留天数必须是非负安全整数')
  })
})
