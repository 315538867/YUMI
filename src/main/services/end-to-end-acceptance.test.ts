import { afterEach, describe, expect, it } from 'vitest'
import { addDays, format } from 'date-fns'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'

describe('端到端验收流程', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('从成本设置、订单收款到风险排班、实际完成和报表核对可完整闭环', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const service = new StudioService(repository)
    const today = new Date()
    const todayText = format(today, 'yyyy-MM-dd')

    service.updateCostSettings({
      gluePriceMilliYuanPerGram: 200,
      effectiveFrom: todayText
    })
    const product = service.createProduct({
      name: '验收云朵',
      basePriceCents: 5200,
      edgePriceCents: 500,
      weightGrams: 24,
      lossRate: 0.1,
      standardMinutesPerUnit: 30,
      packagingCostCents: 150,
      commissionCentsPerUnit: 300,
      moldCount: 10,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2
    })
    const worker = service.createWorker({
      name: '验收小林',
      hourlyWageCents: 3000,
      defaultWorkStart: '09:00',
      defaultWorkEnd: '18:00'
    })
    const order = service.createOrder({
      customer: { name: '验收客户' },
      expectedShipDate: format(addDays(today, 3), 'yyyy-MM-dd'),
      reserveDays: 1,
      items: [{ productId: product.id, quantity: 4, edgeEnabled: true, edgeQuantity: 2 }]
    })

    service.recordPayment({
      orderId: order.id,
      type: 'receipt',
      amountCents: 8000,
      paymentMethod: '微信',
      paidAt: todayText,
      note: '验收首款'
    })
    const paidOrder = service.recordPayment({
      orderId: order.id,
      type: 'receipt',
      amountCents: 13000,
      paymentMethod: '支付宝',
      paidAt: todayText,
      note: '验收尾款'
    })
    expect(paidOrder.payments).toHaveLength(2)
    expect(paidOrder.financial.receivedCents).toBe(21000)

    const shiftInput = {
      workerId: worker.id,
      shiftDate: todayText,
      startTime: '09:00',
      endTime: '12:00',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }]
    }
    const preview = service.previewShift(shiftInput)
    expect(preview.risks).toEqual([])
    const shift = service.saveShift({
      ...shiftInput,
      confirmedWarningCodes: preview.risks.map((risk) => risk.code)
    })
    expect(shift.confirmedRisks).toEqual([])

    const production = service.recordProduction({
      shiftTaskId: service.getShiftDetail(shift.id)!.tasks[0]!.id,
      actualMinutes: 120,
      qualifiedQuantity: 4,
      reworkQuantity: 0,
      scrapQuantity: 0
    })
    expect(production).toMatchObject({ actualLaborCostCents: 6000, commissionCostCents: 1200 })
    service.updateShiftStatus({
      shiftId: shift.id,
      status: 'completed',
      taskCompletions: [{ shiftTaskId: service.getShiftDetail(shift.id)!.tasks[0]!.id, qualifiedQuantity: 4, unqualifiedQuantity: 0 }]
    })
    expect(service.getOrderDetail(order.id)).toMatchObject({
      schedulingStatus: 'production_completed',
      progress: { qualifiedQuantity: 4, scheduledQuantity: 0, unplannedQuantity: 0 }
    })
    expect(service.getWorkerDetail(worker.id)?.orderTasks).toEqual(
      expect.arrayContaining([expect.objectContaining({ orderId: order.id, qualifiedQuantity: 4 })])
    )

    expect(
      service.queryOrderProfitReport({
        fromDate: todayText,
        toDate: format(addDays(today, 3), 'yyyy-MM-dd')
      }).rows
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: order.id, actualCostCents: 7200, receivedNetCents: 21000 })
      ])
    )
    expect(
      service.queryWorkerSettlementReport({ fromDate: todayText, toDate: todayText }).rows
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workerId: worker.id,
          actualMinutes: 120,
          commissionCostCents: 1200
        })
      ])
    )
  })

  it('多商品订单在不同兼职人员排班、完成和缺勤取消后保持订单与人员任务汇总一致', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const service = new StudioService(repository)
    const productA = service.createProduct({
      name: '联动星星', basePriceCents: 3000, edgePriceCents: 0, weightGrams: 10,
      lossRate: 0, standardMinutesPerUnit: 10, packagingCostCents: 0,
      commissionCentsPerUnit: 100, moldCount: 10, outputPerMoldPerBatch: 1, maxBatchesPerDay: 2
    })
    const productB = service.createProduct({
      name: '联动月亮', basePriceCents: 3200, edgePriceCents: 0, weightGrams: 12,
      lossRate: 0, standardMinutesPerUnit: 12, packagingCostCents: 0,
      commissionCentsPerUnit: 100, moldCount: 10, outputPerMoldPerBatch: 1, maxBatchesPerDay: 2
    })
    const workerA = service.createWorker({ name: '联动小林', hourlyWageCents: 2800 })
    const workerB = service.createWorker({ name: '联动小周', hourlyWageCents: 3000 })
    const order = service.createOrder({
      customer: { name: '联动客户' }, expectedShipDate: '2026-09-20',
      items: [
        { productId: productA.id, quantity: 5 },
        { productId: productB.id, quantity: 3 }
      ]
    })
    const [starItem, moonItem] = order.items
    const completedShift = service.saveShift({
      workerId: workerA.id, shiftDate: '2026-09-10',
      tasks: [{ orderItemId: starItem!.id, plannedQuantity: 3 }]
    })
    const absentShift = service.saveShift({
      workerId: workerB.id, shiftDate: '2026-09-11',
      tasks: [{ orderItemId: starItem!.id, plannedQuantity: 2 }]
    })
    const cancelledShift = service.saveShift({
      workerId: workerB.id, shiftDate: '2026-09-12',
      tasks: [{ orderItemId: moonItem!.id, plannedQuantity: 3 }]
    })
    const completedTask = service.getShiftDetail(completedShift.id)!.tasks[0]!
    service.updateShiftStatus({
      shiftId: completedShift.id,
      status: 'completed',
      taskCompletions: [{ shiftTaskId: completedTask.id, qualifiedQuantity: 2, unqualifiedQuantity: 1 }]
    })
    service.updateShiftStatus({ shiftId: absentShift.id, status: 'absent' })
    service.updateShiftStatus({ shiftId: cancelledShift.id, status: 'cancelled' })

    expect(service.getOrderDetail(order.id)).toMatchObject({
      schedulingStatus: 'pending_replenishment',
      progress: {
        orderedQuantity: 8,
        qualifiedQuantity: 2,
        unqualifiedQuantity: 1,
        scheduledQuantity: 0,
        unplannedQuantity: 6
      },
      items: [
        { progress: { orderedQuantity: 5, qualifiedQuantity: 2, unqualifiedQuantity: 1, unplannedQuantity: 3 } },
        { progress: { orderedQuantity: 3, qualifiedQuantity: 0, unplannedQuantity: 3 } }
      ],
      relatedSchedules: expect.arrayContaining([
        expect.objectContaining({ id: completedShift.id, qualifiedQuantity: 2, unqualifiedQuantity: 1, unfinishedQuantity: 0 }),
        expect.objectContaining({ id: absentShift.id, status: 'absent', unfinishedQuantity: 2 }),
        expect.objectContaining({ id: cancelledShift.id, status: 'cancelled', unfinishedQuantity: 3 })
      ])
    })
    expect(service.getWorkerDetail(workerA.id)?.orderTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ shiftId: completedShift.id, orderId: order.id, qualifiedQuantity: 2, unqualifiedQuantity: 1, unfinishedQuantity: 0 })
      ])
    )
    expect(service.getWorkerDetail(workerB.id)?.orderTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ shiftId: absentShift.id, orderId: order.id, shiftStatus: 'absent', unfinishedQuantity: 2 }),
        expect.objectContaining({ shiftId: cancelledShift.id, orderId: order.id, shiftStatus: 'cancelled', unfinishedQuantity: 3 })
      ])
    )
  })

})
