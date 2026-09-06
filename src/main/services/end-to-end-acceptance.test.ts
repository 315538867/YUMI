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
      gluePriceCentsPerGram: 20,
      monthlyFixedCostCents: 240000,
      targetEffectiveMinutes: 12000,
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
})
