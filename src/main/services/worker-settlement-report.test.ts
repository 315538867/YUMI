import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'
import { createOrderCustomer } from './test-order-customer'

describe('兼职人员结算报表', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('按人员和日期范围汇总实际工时、合格数量、时薪成本、提成与缺勤', () => {
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
    const completedShift = service.saveShift({
      workerId: worker.id,
      shiftDate: '2026-09-10',
      startTime: '09:00',
      endTime: '14:00',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 6 }],
      confirmedWarningCodes: []
    })
    service.recordProduction({
      shiftTaskId: repository.getShiftDetail(completedShift.id)!.tasks[0]!.id,
      actualMinutes: 240,
      qualifiedQuantity: 4,
      reworkQuantity: 1,
      scrapQuantity: 1
    })
    const absentOrder = service.createOrder({
      customer: createOrderCustomer(service, { name: '小雪' }),
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 6 }]
    })
    const absentShift = service.saveShift({
      workerId: worker.id,
      shiftDate: '2026-09-11',
      startTime: '09:00',
      endTime: '12:00',
      tasks: [{ orderItemId: absentOrder.items[0]!.id, plannedQuantity: 6 }],
      confirmedWarningCodes: []
    })
    service.updateShiftStatus({ shiftId: absentShift.id, status: 'absent' })

    const report = service.queryWorkerSettlementReport({
      fromDate: '2026-09-01',
      toDate: '2026-09-30'
    })

    expect(report.rows).toEqual([
      expect.objectContaining({
        workerId: worker.id,
        workerName: '小林',
        actualMinutes: 240,
        qualifiedQuantity: 4,
        laborCostCents: 11200,
        commissionCostCents: 600,
        absenceCount: 1
      })
    ])
    expect(report.totals).toMatchObject({
      workerCount: 1,
      actualMinutes: 240,
      qualifiedQuantity: 4,
      laborCostCents: 11200,
      commissionCostCents: 600,
      absenceCount: 1
    })
  })

  it('拒绝开始日期晚于结束日期的结算报表查询', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const service = new StudioService(new StudioRepository(database))

    expect(() =>
      service.queryWorkerSettlementReport({
        fromDate: '2026-09-30',
        toDate: '2026-09-01'
      })
    ).toThrow('结算报表开始日期不能晚于结束日期')
  })
})
