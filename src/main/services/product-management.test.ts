import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'

const productInput = {
  name: '奶油小熊',
  code: 'YUMI-BEAR',
  category: '动物',
  basePriceCents: 3900,
  edgePriceCents: 300,
  weightGrams: 20,
  lossRate: 0.1,
  standardMinutesPerUnit: 30,
  packagingCostCents: 100,
  commissionCentsPerUnit: 200,
  moldCount: 20,
  outputPerMoldPerBatch: 1,
  maxBatchesPerDay: 2
}

function createService(): {
  database: StudioDatabase
  repository: StudioRepository
  service: StudioService
} {
  const database = createDatabase(':memory:')
  const repository = new StudioRepository(database)
  return { database, repository, service: new StudioService(repository) }
}

describe('商品资料与系统成本设置', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('可维护商品完整资料、停用状态与模具日产能', () => {
    const context = createService()
    databases.push(context.database)
    const created = context.service.createProduct(productInput)

    const updated = context.service.updateProduct({
      ...productInput,
      id: created.id,
      name: '奶油小熊（秋季）',
      basePriceCents: 4200,
      edgePriceCents: 500,
      accessoryCostCents: 250,
      replacementBagCostCents: 80,
      enabled: false,
      imagePath: '/tmp/cream-bear.png',
      notes: '仅用于秋季限定订单'
    })

    expect(updated).toMatchObject({
      id: created.id,
      name: '奶油小熊（秋季）',
      basePriceCents: 4200,
      edgePriceCents: 500,
      accessoryCostCents: 250,
      replacementBagCostCents: 80,
      enabled: false,
      imagePath: '/tmp/cream-bear.png',
      notes: '仅用于秋季限定订单',
      dailyCapacity: 40
    })
    expect(context.repository.listProducts()[0]?.enabled).toBe(false)
  })

  it('保存按生效时间版本化的成本设置，并写入变更审计', () => {
    const context = createService()
    databases.push(context.database)

    const saved = context.service.updateCostSettings({
      gluePriceCentsPerGram: 50,
      monthlyFixedCostCents: 480000,
      targetEffectiveMinutes: 9600,
      effectiveFrom: '2026-09-01'
    })

    expect(saved).toMatchObject({
      gluePriceCentsPerGram: 50,
      monthlyFixedCostCents: 480000,
      targetEffectiveMinutes: 9600,
      fixedOverheadHourlyRateCents: 3000,
      effectiveFrom: '2026-09-01'
    })
    expect(context.repository.getCostSettingsHistory()).toHaveLength(1)
    expect(context.repository.listAuditLogs('system_cost_settings')).toEqual([
      expect.objectContaining({
        action: 'cost-settings.updated',
        entityId: saved.id,
        actorName: '本机管理员'
      })
    ])
  })

  it('拒绝无效的损耗率与目标有效工时', () => {
    const context = createService()
    databases.push(context.database)

    expect(() => context.service.createProduct({ ...productInput, lossRate: 1 })).toThrow(
      '损耗率必须小于 100%'
    )
    expect(() =>
      context.service.updateCostSettings({
        gluePriceCentsPerGram: 50,
        monthlyFixedCostCents: 480000,
        targetEffectiveMinutes: 0,
        effectiveFrom: '2026-09-01'
      })
    ).toThrow('目标有效工时必须大于 0')
  })
})

describe('商品成本预览', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('结合当前系统成本设置返回成本拆分、缝边收入与模具日产能', () => {
    const context = createService()
    databases.push(context.database)
    context.service.updateCostSettings({
      gluePriceCentsPerGram: 50,
      monthlyFixedCostCents: 480000,
      targetEffectiveMinutes: 9600,
      effectiveFrom: '2026-09-01'
    })

    expect(
      context.service.previewProductCost({
        ...productInput,
        quantity: 10,
        hourlyLaborCostCents: 3000,
        edgeEnabled: true,
        edgeQuantity: 10,
        accessoryCostCents: 250,
        replacementBagCostCents: 80
      })
    ).toEqual({
      glueGrams: 220,
      glueCostCents: 11000,
      packagingCostCents: 1000,
      accessoryCostCents: 2500,
      replacementBagCostCents: 800,
      laborMinutes: 300,
      laborCostCents: 15000,
      commissionCostCents: 2000,
      fixedOverheadCostCents: 15000,
      edgeRevenueCents: 3000,
      totalCostCents: 47300,
      dailyCapacity: 40
    })
  })
})
