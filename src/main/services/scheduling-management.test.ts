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

describe('日历排班与风险确认', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('在日历时间段中预览风险，确认后才保存排班和订单任务', () => {
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct(productInput)
    const worker = context.service.createWorker({
      name: '小林',
      hourlyWageCents: 2800,
      defaultWorkStart: '09:00',
      defaultWorkEnd: '18:00'
    })
    const order = context.service.createOrder({
      customer: { name: '小雨' },
      expectedShipDate: '2026-09-15',
      reserveDays: 2,
      items: [{ productId: product.id, quantity: 8 }]
    })

    const firstPreview = context.service.previewShift({
      workerId: worker.id,
      shiftDate: '2026-09-14',
      startTime: '09:00',
      endTime: '11:00',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }]
    })
    expect(firstPreview.risks.map((risk) => risk.code)).toEqual(['DEADLINE_RISK'])
    expect(() =>
      context.service.saveShift({
        workerId: worker.id,
        shiftDate: '2026-09-14',
        startTime: '09:00',
        endTime: '11:00',
        tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }],
        confirmedWarningCodes: []
      })
    ).toThrow('请先确认以下风险：DEADLINE_RISK')
    const firstShift = context.service.saveShift({
      workerId: worker.id,
      shiftDate: '2026-09-14',
      startTime: '09:00',
      endTime: '11:00',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }],
      confirmedWarningCodes: ['DEADLINE_RISK']
    })
    expect(firstShift).toMatchObject({
      workerId: worker.id,
      status: 'scheduled',
      taskCount: 1,
      confirmedRisks: ['DEADLINE_RISK']
    })

    const overlappingPreview = context.service.previewShift({
      workerId: worker.id,
      shiftDate: '2026-09-14',
      startTime: '10:00',
      endTime: '12:00',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }]
    })
    expect(overlappingPreview.risks.map((risk) => risk.code)).toEqual([
      'WORKER_TIME_OVERLAP',
      'DEADLINE_RISK'
    ])
    const secondShift = context.service.saveShift({
      workerId: worker.id,
      shiftDate: '2026-09-14',
      startTime: '10:00',
      endTime: '12:00',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }],
      confirmedWarningCodes: ['WORKER_TIME_OVERLAP', 'DEADLINE_RISK']
    })

    context.service.updateShiftStatus({ shiftId: secondShift.id, status: 'absent' })
    expect(context.repository.getDashboard()).toMatchObject({
      rescheduleTaskCount: 4,
      riskShiftCount: 2
    })
    expect(context.repository.listAuditLogs('shift')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'shift.saved', entityId: firstShift.id }),
        expect.objectContaining({ action: 'shift.status.updated', entityId: secondShift.id })
      ])
    )
  })

  it('按同商品跨订单汇总模具日产能，并提示工时超载或未排满', () => {
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct({ ...productInput, moldCount: 5 })
    const worker = context.service.createWorker({ name: '小林', hourlyWageCents: 2800 })
    const firstOrder = context.service.createOrder({
      customer: { name: '甲' },
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 8 }]
    })
    const secondOrder = context.service.createOrder({
      customer: { name: '乙' },
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 9 }]
    })
    context.service.saveShift({
      workerId: worker.id,
      shiftDate: '2026-09-10',
      startTime: '09:00',
      endTime: '13:00',
      tasks: [{ orderItemId: firstOrder.items[0]!.id, plannedQuantity: 8 }]
    })

    const preview = context.service.previewShift({
      workerId: worker.id,
      shiftDate: '2026-09-10',
      startTime: '14:00',
      endTime: '18:00',
      tasks: [{ orderItemId: secondOrder.items[0]!.id, plannedQuantity: 9 }]
    })
    expect(preview.risks.map((risk) => risk.code)).toEqual([
      'SHIFT_OVER_CAPACITY',
      'MOLD_DAILY_CAPACITY_EXCEEDED'
    ])

    const underCapacity = context.service.previewShift({
      workerId: worker.id,
      shiftDate: '2026-09-11',
      startTime: '09:00',
      endTime: '12:00',
      tasks: [{ orderItemId: firstOrder.items[0]!.id, plannedQuantity: 2 }]
    })
    expect(underCapacity.risks.map((risk) => risk.code)).toEqual(['SHIFT_UNDER_CAPACITY'])
  })

  it('编辑未开始排班时排除自身风险、重新确认风险并拒绝改写已有实际制作', () => {
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct(productInput)
    const worker = context.service.createWorker({ name: '小林', hourlyWageCents: 2800 })
    const order = context.service.createOrder({
      customer: { name: '编辑排班客户' },
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 8 }]
    })
    const shift = context.service.saveShift({
      workerId: worker.id,
      shiftDate: '2026-09-10',
      startTime: '09:00',
      endTime: '11:00',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }]
    })

    const editableService = context.service as typeof context.service & {
      updateShift(input: {
        id: string
        workerId: string
        shiftDate: string
        startTime: string
        endTime: string
        tasks: Array<{ orderItemId: string; plannedQuantity: number }>
        confirmedWarningCodes?: Array<'SHIFT_UNDER_CAPACITY'>
      }): { id: string; taskCount: number; confirmedRisks: string[] }
    }

    expect(() =>
      editableService.updateShift({
        id: shift.id,
        workerId: worker.id,
        shiftDate: '2026-09-10',
        startTime: '09:00',
        endTime: '11:00',
        tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 3 }],
        confirmedWarningCodes: []
      })
    ).toThrow('请先确认以下风险：SHIFT_UNDER_CAPACITY')

    const updated = editableService.updateShift({
      id: shift.id,
      workerId: worker.id,
      shiftDate: '2026-09-10',
      startTime: '09:00',
      endTime: '11:00',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 3 }],
      confirmedWarningCodes: ['SHIFT_UNDER_CAPACITY']
    })
    expect(updated).toMatchObject({
      id: shift.id,
      taskCount: 1,
      confirmedRisks: ['SHIFT_UNDER_CAPACITY']
    })
    const detail = context.repository.getShiftDetail(shift.id)!
    expect(detail.tasks[0]).toMatchObject({ plannedQuantity: 3, estimatedMinutes: 90 })
    expect(context.repository.listAuditLogs('shift')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'shift.updated', entityId: shift.id })
      ])
    )

    context.service.recordProduction({
      shiftTaskId: detail.tasks[0]!.id,
      actualMinutes: 90,
      qualifiedQuantity: 3,
      reworkQuantity: 0,
      scrapQuantity: 0
    })
    expect(() =>
      editableService.updateShift({
        id: shift.id,
        workerId: worker.id,
        shiftDate: '2026-09-10',
        startTime: '09:00',
        endTime: '11:00',
        tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 2 }]
      })
    ).toThrow('已登记实际制作结果的排班不能编辑')
  })
})
