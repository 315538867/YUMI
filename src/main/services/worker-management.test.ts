import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'

describe('兼职人员资料与时薪历史', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('维护人员默认工作时间和停用状态，并保留时薪历史', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const service = new StudioService(repository)
    const worker = service.createWorker({
      name: '小林',
      phone: '13800000000',
      hourlyWageCents: 2800,
      defaultWorkStart: '09:00',
      defaultWorkEnd: '18:00'
    })

    const updated = service.updateWorker({
      id: worker.id,
      name: '小林（晚班）',
      phone: '13900000000',
      hourlyWageCents: 3200,
      defaultWorkStart: '12:00',
      defaultWorkEnd: '21:00',
      active: false,
      effectiveFrom: '2026-09-10'
    })

    expect(updated).toMatchObject({
      id: worker.id,
      name: '小林（晚班）',
      hourlyWageCents: 3200,
      defaultWorkStart: '12:00',
      defaultWorkEnd: '21:00',
      active: false
    })
    expect(repository.getWorkerWageHistory(worker.id)).toEqual([
      expect.objectContaining({ hourlyWageCents: 3200, effectiveFrom: '2026-09-10' }),
      expect.objectContaining({ hourlyWageCents: 2800 })
    ])
    expect(repository.listAuditLogs('worker')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'worker.updated', entityId: worker.id })
      ])
    )
  })

  it('返回人员历史排班、实际工时、合格数量和按件提成汇总', () => {
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
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2
    })
    const worker = service.createWorker({
      name: '小林',
      hourlyWageCents: 2800,
      defaultWorkStart: '09:00',
      defaultWorkEnd: '18:00'
    })
    const order = service.createOrder({
      customer: { name: '小雨' },
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
      actualMinutes: 90,
      qualifiedQuantity: 3,
      reworkQuantity: 1,
      scrapQuantity: 0
    })

    expect(service.getWorkerDetail(worker.id)).toMatchObject({
      id: worker.id,
      phone: null,
      totalActualMinutes: 90,
      totalQualifiedQuantity: 3,
      totalCommissionCostCents: 450,
      absenceCount: 0,
      wageHistory: [expect.objectContaining({ hourlyWageCents: 2800 })],
      shifts: [
        expect.objectContaining({
          id: shift.id,
          actualMinutes: 90,
          qualifiedQuantity: 3,
          commissionCostCents: 450
        })
      ]
    })
  })
})
