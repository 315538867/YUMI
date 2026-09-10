import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { StudioSettingsService } from './studio-settings-service'

describe('StudioSettingsService', () => {
  const databases: V2Database[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('未配置时使用默认预留天数，更新后可供新订单读取', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const service = new StudioSettingsService(database, new V2OrderRepository(database), () => '2026-09-09T00:00:00.000Z')

    expect(service.get()).toMatchObject({ gluePriceMicroYuanPerGram: 0, orderReservedDays: 2 })
    expect(service.update({ gluePriceMicroYuanPerGram: 3_400, orderReservedDays: 4 })).toMatchObject({
      gluePriceMicroYuanPerGram: 3_400,
      orderReservedDays: 4,
      updatedAt: '2026-09-09T00:00:00.000Z'
    })
    expect(service.get()).toMatchObject({ gluePriceMicroYuanPerGram: 3_400, orderReservedDays: 4 })
  })

  it('拒绝负数或小数的工作室默认预留天数', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const service = new StudioSettingsService(database, new V2OrderRepository(database))

    expect(() => service.update({ gluePriceMicroYuanPerGram: 0, orderReservedDays: -1 })).toThrow('工作室默认预留天数必须是非负安全整数')
    expect(() => service.update({ gluePriceMicroYuanPerGram: 0, orderReservedDays: 1.5 })).toThrow('工作室默认预留天数必须是非负安全整数')
  })
})
