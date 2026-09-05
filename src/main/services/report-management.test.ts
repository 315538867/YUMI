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

function createContext() {
  const database = createDatabase(':memory:')
  const repository = new StudioRepository(database)
  return { database, service: new StudioService(repository) }
}

describe('订单资金与利润报表', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('按预计发货日期和待收条件筛选，并区分预计与实际利润', () => {
    const context = createContext()
    databases.push(context.database)
    context.service.updateCostSettings({
      gluePriceCentsPerGram: 50,
      monthlyFixedCostCents: 480000,
      targetEffectiveMinutes: 9600,
      effectiveFrom: '2026-09-01'
    })
    const product = context.service.createProduct(productInput)
    const order = context.service.createOrder({
      customer: { name: '小雨' },
      expectedShipDate: '2026-09-15',
      items: [{ productId: product.id, quantity: 2 }]
    })
    context.service.recordPayment({
      orderId: order.id,
      type: 'receipt',
      amountCents: 3000,
      paymentMethod: '微信',
      paidAt: '2026-09-06'
    })
    context.service.createOrder({
      customer: { name: '小雪' },
      expectedShipDate: '2026-10-01',
      items: [{ productId: product.id, quantity: 1 }]
    })

    const report = context.service.queryOrderProfitReport({
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      productionStatus: 'all',
      outstandingOnly: true
    })

    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]).toMatchObject({
      id: order.id,
      customerName: '小雨',
      receivableCents: 7800,
      receivedNetCents: 3000,
      outstandingCents: 4800,
      estimatedCostCents: 5800,
      actualCostCents: 0,
      estimatedProfitCents: 2000,
      actualProfitCents: 3000,
      financialStatus: 'partial'
    })
    expect(report.totals).toMatchObject({
      orderCount: 1,
      receivableCents: 7800,
      outstandingCents: 4800,
      estimatedProfitCents: 2000,
      actualProfitCents: 3000
    })
  })

  it('拒绝开始日期晚于结束日期的报表查询', () => {
    const context = createContext()
    databases.push(context.database)

    expect(() =>
      context.service.queryOrderProfitReport({
        fromDate: '2026-09-30',
        toDate: '2026-09-01'
      })
    ).toThrow('报表开始日期不能晚于结束日期')
  })
})
