import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'

const productInput = {
  name: '奶油小熊',
  basePriceCents: 3900,
  edgePriceCents: 300,
  weightGrams: 20,
  lossRate: 0.1,
  standardMinutesPerUnit: 14.2,
  packagingCostCents: 100,
  commissionCentsPerUnit: 200,
  moldCount: 20,
  outputPerMoldPerBatch: 1,
  maxBatchesPerDay: 2
}

function createService(): { database: StudioDatabase; repository: StudioRepository; service: StudioService } {
  const database = createDatabase(':memory:')
  const repository = new StudioRepository(database)
  return { database, repository, service: new StudioService(repository) }
}

describe('排班时长与完成数量', () => {
  const databases: StudioDatabase[] = []
  afterEach(() => databases.splice(0).forEach((database) => database.close()))

  it('按任务基础时长与本次全局额外时长计算最终总时长', () => {
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct(productInput)
    const worker = context.service.createWorker({ name: '小林', hourlyWageCents: 2800 })
    const order = context.service.createOrder({
      customer: { name: '小雨' },
      expectedShipDate: '2026-09-15',
      reserveDays: 2,
      items: [{ productId: product.id, quantity: 8 }]
    })

    const input = {
      workerId: worker.id,
      shiftDate: '2026-09-10',
      extraMinutes: 75,
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 2 }]
    }
    const preview = context.service.previewShift(input)
    expect(preview).toMatchObject({
      taskBaseMinutes: [{ orderItemId: order.items[0]!.id, baseMinutes: 29 }],
      baseTaskMinutes: 29,
      extraMinutes: 75,
      totalMinutes: 104,
      risks: []
    })

    const shift = context.service.saveShift(input)
    expect(shift).toMatchObject({ startTime: null, endTime: null, baseTaskMinutes: 29, extraMinutes: 75, totalMinutes: 104 })
    expect(context.service.getShiftDetail(shift.id)?.tasks[0]).toMatchObject({ baseMinutes: 29, estimatedMinutes: 29 })
  })

  it('标记已完成时必须完整填写每项任务的合格与不合格数量，并原子保存', () => {
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct({ ...productInput, standardMinutesPerUnit: 10 })
    const worker = context.service.createWorker({ name: '小林', hourlyWageCents: 2800 })
    const order = context.service.createOrder({
      customer: { name: '小雨' },
      expectedShipDate: '2026-09-15',
      items: [{ productId: product.id, quantity: 6 }]
    })
    const shift = context.service.saveShift({
      workerId: worker.id,
      shiftDate: '2026-09-10',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }]
    })
    const task = context.service.getShiftDetail(shift.id)!.tasks[0]!

    expect(() => context.service.updateShiftStatus({ shiftId: shift.id, status: 'completed' })).toThrow('标记已完成时必须填写每个任务的合格与不合格数量')
    expect(() => context.service.updateShiftStatus({
      shiftId: shift.id,
      status: 'completed',
      taskCompletions: []
    })).toThrow('标记已完成时必须填写每个任务的合格与不合格数量')
    expect(context.service.getShiftDetail(shift.id)?.tasks[0]).toMatchObject({ completedQuantity: null, qualifiedQuantity: 0, unqualifiedQuantity: null })

    expect(context.service.updateShiftStatus({
      shiftId: shift.id,
      status: 'completed',
      taskCompletions: [{ shiftTaskId: task.id, qualifiedQuantity: 3, unqualifiedQuantity: 1 }]
    })).toMatchObject({ status: 'completed' })
    expect(context.service.getShiftDetail(shift.id)?.tasks[0]).toMatchObject({ completedQuantity: 4, qualifiedQuantity: 3, unqualifiedQuantity: 1 })
    expect(context.service.previewShift({
      workerId: worker.id,
      shiftDate: '2026-09-11',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 3 }]
    }).baseTaskMinutes).toBe(30)
    const overScheduled = context.service.previewShift({
      workerId: worker.id,
      shiftDate: '2026-09-11',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }]
    })
    expect(overScheduled.risks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'ORDER_QUANTITY_EXCEEDED',
          orderCode: order.code,
          orderedQuantity: 6,
          qualifiedQuantity: 3,
          requestedQuantity: 4,
          excessQuantity: 1
        })
      ])
    )
    expect(() => context.service.saveShift({
      workerId: worker.id,
      shiftDate: '2026-09-11',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }]
    })).toThrow('请先确认以下风险：ORDER_QUANTITY_EXCEEDED')
    expect(context.service.saveShift({
      workerId: worker.id,
      shiftDate: '2026-09-11',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }],
      confirmedWarningCodes: ['ORDER_QUANTITY_EXCEEDED']
    }).confirmedRisks).toEqual(['ORDER_QUANTITY_EXCEEDED'])
  })

  it('同一排班内拒绝同一订单下重复产品，但允许不同订单安排同一产品', () => {
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct({ ...productInput, standardMinutesPerUnit: 10 })
    const worker = context.service.createWorker({ name: '小林', hourlyWageCents: 2800 })
    const firstOrder = context.service.createOrder({
      customer: { name: '小雨' },
      expectedShipDate: '2026-09-15',
      items: [
        { productId: product.id, quantity: 2 },
        { productId: product.id, quantity: 3 }
      ]
    })
    const secondOrder = context.service.createOrder({
      customer: { name: '小晴' },
      expectedShipDate: '2026-09-15',
      items: [{ productId: product.id, quantity: 2 }]
    })
    const base = { workerId: worker.id, shiftDate: '2026-09-10' }

    expect(() =>
      context.service.saveShift({
        ...base,
        tasks: [
          { orderItemId: firstOrder.items[0]!.id, plannedQuantity: 1 },
          { orderItemId: firstOrder.items[1]!.id, plannedQuantity: 1 }
        ]
      })
    ).toThrow('同一订单下同一产品只能选择一次')

    expect(
      context.service.saveShift({
        ...base,
        tasks: [
          { orderItemId: firstOrder.items[0]!.id, plannedQuantity: 1 },
          { orderItemId: secondOrder.items[0]!.id, plannedQuantity: 1 }
        ]
      }).taskCount
    ).toBe(2)
  })

  it('不合格数量仅记录实际完成数据，不在完成状态写入工资或提成', () => {
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct({ ...productInput, standardMinutesPerUnit: 10 })
    const worker = context.service.createWorker({ name: '小林', hourlyWageCents: 2800 })
    const order = context.service.createOrder({
      customer: { name: '小雨' },
      expectedShipDate: '2026-09-15',
      items: [{ productId: product.id, quantity: 2 }]
    })
    const shift = context.service.saveShift({ workerId: worker.id, shiftDate: '2026-09-10', tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 2 }] })
    const task = context.service.getShiftDetail(shift.id)!.tasks[0]!
    context.service.updateShiftStatus({
      shiftId: shift.id,
      status: 'completed',
      taskCompletions: [{ shiftTaskId: task.id, qualifiedQuantity: 1, unqualifiedQuantity: 1 }]
    })
    const completed = context.service.getShiftDetail(shift.id)!.tasks[0]!
    expect(completed.actualLaborCostCents).toBe(0)
    expect(completed.commissionCostCents).toBe(0)
  })
})
