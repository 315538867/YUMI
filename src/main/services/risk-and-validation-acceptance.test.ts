import { afterEach, describe, expect, it } from 'vitest'
import { addDays, format } from 'date-fns'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import type { ShiftInput } from '@shared/contracts'
import { StudioService } from './studio-service'

describe('风险确认与输入拒绝验收', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('所有排班风险均先提示、确认后允许保存，而非直接阻断', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const service = new StudioService(repository)
    const today = new Date()
    const todayText = format(today, 'yyyy-MM-dd')
    const tomorrowText = format(addDays(today, 1), 'yyyy-MM-dd')
    const product = service.createProduct({
      name: '风险验收商品',
      basePriceCents: 3000,
      edgePriceCents: 300,
      weightGrams: 20,
      lossRate: 0.1,
      standardMinutesPerUnit: 30,
      packagingCostCents: 100,
      commissionCentsPerUnit: 200,
      moldCount: 2,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 1
    })
    const worker = service.createWorker({ name: '风险验收人员', hourlyWageCents: 2800 })
    const order = service.createOrder({
      customer: { name: '风险验收客户' },
      expectedShipDate: tomorrowText,
      reserveDays: 1,
      items: [{ productId: product.id, quantity: 8 }]
    })
    const riskCodes = new Set<string>()

    const saveAfterConfirmingRisks = (input: ShiftInput) => {
      const preview = service.previewShift(input)
      preview.risks.forEach((risk) => riskCodes.add(risk.code))
      expect(() => service.saveShift(input)).toThrow('请先确认以下风险')
      const shift = service.saveShift({
        ...input,
        confirmedWarningCodes: preview.risks.map((risk) => risk.code)
      })
      expect(shift.confirmedRisks).toEqual(preview.risks.map((risk) => risk.code))
      return shift
    }

    saveAfterConfirmingRisks({
      workerId: worker.id,
      shiftDate: todayText,
      startTime: '09:00',
      endTime: '10:00',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 1 }]
    })
    saveAfterConfirmingRisks({
      workerId: worker.id,
      shiftDate: todayText,
      startTime: '09:30',
      endTime: '10:30',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 3 }]
    })
    saveAfterConfirmingRisks({
      workerId: worker.id,
      shiftDate: tomorrowText,
      startTime: '13:00',
      endTime: '14:00',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 1 }]
    })

    expect(riskCodes).toEqual(
      new Set([
        'WORKER_TIME_OVERLAP',
        'SHIFT_OVER_CAPACITY',
        'SHIFT_UNDER_CAPACITY',
        'MOLD_DAILY_CAPACITY_EXCEEDED',
        'DEADLINE_RISK'
      ])
    )
  })

  it('无效时间、金额、数量和关联 ID 始终被拒绝写入', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const service = new StudioService(new StudioRepository(database))
    const todayText = format(new Date(), 'yyyy-MM-dd')
    const product = service.createProduct({
      name: '输入验收商品',
      basePriceCents: 3000,
      edgePriceCents: 300,
      weightGrams: 20,
      lossRate: 0.1,
      standardMinutesPerUnit: 30,
      packagingCostCents: 100,
      commissionCentsPerUnit: 200,
      moldCount: 5,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 1
    })
    const worker = service.createWorker({ name: '输入验收人员', hourlyWageCents: 2800 })
    const order = service.createOrder({
      customer: { name: '输入验收客户' },
      expectedShipDate: format(addDays(new Date(), 5), 'yyyy-MM-dd'),
      items: [{ productId: product.id, quantity: 2 }]
    })

    expect(() =>
      service.saveShift({
        workerId: worker.id,
        shiftDate: todayText,
        startTime: '18:00',
        endTime: '09:00',
        tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 1 }]
      })
    ).toThrow('结束时间必须晚于开始时间')
    expect(() =>
      service.recordPayment({
        orderId: order.id,
        type: 'receipt',
        amountCents: 0,
        paymentMethod: '微信',
        paidAt: todayText
      })
    ).toThrow('数值必须大于 0')
    expect(() =>
      service.createOrder({
        customer: { name: '数量验收客户' },
        expectedShipDate: todayText,
        items: [{ productId: product.id, quantity: 0 }]
      })
    ).toThrow('数值必须大于 0')
    expect(() =>
      service.createOrder({
        customer: { name: '关联验收客户' },
        expectedShipDate: todayText,
        items: [{ productId: '00000000-0000-4000-8000-000000000001', quantity: 1 }]
      })
    ).toThrow('商品不存在')
  })
})
