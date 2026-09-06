import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'
import { createOrderCustomer } from './test-order-customer'

describe('月度完成制作重量', () => {
  const databases: StudioDatabase[] = []
  afterEach(() => databases.splice(0).forEach((database) => database.close()))

  it('仅汇总已完成排班的实际完成数量，并按订单商品快照重量计算', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const service = new StudioService(new StudioRepository(database))
    const product = service.createProduct({
      name: '重量测试商品', basePriceCents: 1000, edgePriceCents: 0, weightGrams: 12.5, lossRate: 0,
      standardMinutesPerUnit: 10, packagingCostCents: 0, commissionCentsPerUnit: 0,
      moldCount: 10, outputPerMoldPerBatch: 1, maxBatchesPerDay: 2
    })
    const worker = service.createWorker({ name: '小林', hourlyWageCents: 2800 })
    const order = service.createOrder({ customer: createOrderCustomer(service, { name: '小雨' }), expectedShipDate: '2026-09-30', items: [{ productId: product.id, quantity: 8 }] })
    const completed = service.saveShift({ workerId: worker.id, shiftDate: '2026-09-10', tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }] })
    const task = service.getShiftDetail(completed.id)!.tasks[0]!
    service.updateShiftStatus({ shiftId: completed.id, status: 'completed', taskCompletions: [{ shiftTaskId: task.id, qualifiedQuantity: 3, unqualifiedQuantity: 1 }] })
    const historical = service.saveShift({ workerId: worker.id, shiftDate: '2026-09-11', tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 2 }] })
    // 模拟迁移前已完成但没有质量明细的历史记录，不应纳入新口径。
    database.prepare("UPDATE shifts SET status = 'completed' WHERE id = ?").run(historical.id)

    expect(service.queryMonthlyProductionWeight({ month: '2026-09' })).toEqual({
      month: '2026-09', completedQuantity: 4, qualifiedQuantity: 3, unqualifiedQuantity: 1,
      totalWeightGrams: 50, totalWeightKilograms: 0.05
    })
    expect(() => service.queryMonthlyProductionWeight({ month: '2026-9' })).toThrow('月份必须为 YYYY-MM')
  })
})
