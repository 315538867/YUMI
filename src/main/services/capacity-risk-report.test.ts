import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'
import { createOrderCustomer } from './test-order-customer'

describe('商品成本、产能与交期风险报表', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('展示商品单位成本、日期计划与未完成订单待排风险', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const service = new StudioService(repository)
    const product = service.createProduct({
      name: '云朵',
      basePriceCents: 3000,
      edgePriceCents: 200,
      weightGrams: 10,
      lossRate: 0.1,
      standardMinutesPerUnit: 30,
      packagingCostCents: 50,
      commissionCentsPerUnit: 150,
      moldCount: 10,
      outputPerMoldPerBatch: 2,
      maxBatchesPerDay: 2
    })
    const worker = service.createWorker({ name: '小林', hourlyWageCents: 2800 })
    const order = service.createOrder({
      customer: createOrderCustomer(service, { name: '小雨' }),
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 6 }]
    })
    const shift = service.saveShift({
      workerId: worker.id,
      shiftDate: '2026-09-10',
      startTime: '09:00',
      endTime: '12:00',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }],
      confirmedWarningCodes: []
    })
    const taskId = repository.getShiftDetail(shift.id)!.tasks[0]!.id
    service.recordProduction({
      shiftTaskId: taskId,
      actualMinutes: 90,
      qualifiedQuantity: 3,
      reworkQuantity: 1,
      scrapQuantity: 0
    })

    const report = service.queryCapacityRiskReport({
      fromDate: '2026-09-01',
      toDate: '2026-09-30'
    })

    expect(report.products).toEqual([
      expect.objectContaining({
        productId: product.id,
        productName: '云朵',
        dailyCapacity: 40,
        plannedQuantity: 4,
        qualifiedQuantity: 3,
        estimatedCostPerUnitCents: 200
      })
    ])
    expect(report.daily).toEqual([
      expect.objectContaining({
        date: '2026-09-10',
        productId: product.id,
        plannedQuantity: 4,
        dailyCapacity: 40,
        pendingScheduleQuantity: 0
      })
    ])
    expect(report.risks).toEqual([
      expect.objectContaining({
        orderId: order.id,
        riskReasons: expect.arrayContaining([expect.stringContaining('待排')]),
        remainingQuantity: 3
      })
    ])
  })

  it('拒绝开始日期晚于结束日期的产能风险报表查询', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const service = new StudioService(new StudioRepository(database))

    expect(() =>
      service.queryCapacityRiskReport({ fromDate: '2026-09-30', toDate: '2026-09-01' })
    ).toThrow('产能风险报表开始日期不能晚于结束日期')
  })
})
