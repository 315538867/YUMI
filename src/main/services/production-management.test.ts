import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'
import { createOrderCustomer } from './test-order-customer'

const productInput = {
  name: '奶油小熊',
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

describe('实际制作、人工成本与提成结算', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('完成排班后按基础工时与预留时长计算订单实际人工成本', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const service = new StudioService(repository)
    const product = service.createProduct(productInput)
    const worker = service.createWorker({ name: '小林', hourlyWageCents: 2800 })
    const order = service.createOrder({
      customer: createOrderCustomer(service, { name: '小雨' }),
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 10 }]
    })
    const shift = service.saveShift({
      workerId: worker.id,
      shiftDate: '2026-09-10',
      startTime: '09:00',
      endTime: '14:00',
      extraMinutes: 20,
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 10 }]
    })

    const result = service.recordProduction({
      shiftTaskId: repository.getShiftDetail(shift.id)!.tasks[0]!.id,
      actualMinutes: 240,
      qualifiedQuantity: 8,
      reworkQuantity: 1,
      scrapQuantity: 1
    })

    expect(result).toMatchObject({
      actualMinutes: 240,
      qualifiedQuantity: 8,
      reworkQuantity: 1,
      scrapQuantity: 1,
      actualLaborCostCents: 11200,
      commissionCostCents: 1600
    })
    expect(repository.getOrderDetail(order.id)).toMatchObject({
      actualCostCents: 3000,
      productionStatus: 'in_production'
    })
    service.updateShiftStatus({
      shiftId: shift.id,
      status: 'completed',
      taskCompletions: [{ shiftTaskId: result.id, qualifiedQuantity: 8, unqualifiedQuantity: 2 }]
    })
    expect(service.getOrderCostDetail(order.id)).toMatchObject({
      estimatedCostCents: 3000,
      actualCostCents: 17933,
      items: [
        expect.objectContaining({
          estimatedLaborMinutes: 300,
          actualLaborMinutes: 320,
          actualLaborCostCents: 14933,
          actualCostCents: 17933
        })
      ]
    })
    expect(repository.getOrderDetail(order.id)).toMatchObject({ actualCostCents: 17933 })
    expect(repository.listAuditLogs('production')).toEqual([
      expect.objectContaining({ action: 'production.recorded', entityId: result.id })
    ])
  })

  it('为排班检查器返回订单、商品、实际成本和待补排数量', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const service = new StudioService(repository)
    const product = service.createProduct(productInput)
    const worker = service.createWorker({ name: '小林', hourlyWageCents: 2800 })
    const order = service.createOrder({
      customer: createOrderCustomer(service, { name: '小雨' }),
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 4 }]
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
      actualMinutes: 60,
      qualifiedQuantity: 2,
      reworkQuantity: 1,
      scrapQuantity: 0
    })

    expect(repository.getShiftDetail(shift.id)!.tasks[0]).toMatchObject({
      orderId: order.id,
      orderCode: order.code,
      productId: product.id,
      productName: product.name,
      plannedQuantity: 4,
      actualMinutes: 60,
      qualifiedQuantity: 2,
      reworkQuantity: 1,
      scrapQuantity: 0,
      actualLaborCostCents: 2800,
      commissionCostCents: 400,
      unfinishedQuantity: 1
    })
  })

  it('拒绝超过计划数量的实际结果', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const service = new StudioService(repository)
    const product = service.createProduct(productInput)
    const worker = service.createWorker({ name: '小林', hourlyWageCents: 2800 })
    const order = service.createOrder({
      customer: createOrderCustomer(service, { name: '小雨' }),
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 2 }]
    })
    const shift = service.saveShift({
      workerId: worker.id,
      shiftDate: '2026-09-10',
      startTime: '09:00',
      endTime: '10:00',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 2 }]
    })
    const taskId = repository.getShiftDetail(shift.id)!.tasks[0]!.id

    expect(() =>
      service.recordProduction({
        shiftTaskId: taskId,
        actualMinutes: 30,
        qualifiedQuantity: 2,
        reworkQuantity: 1,
        scrapQuantity: 0
      })
    ).toThrow('合格、返工和报废数量不能超过计划制作数量')
  })
})
