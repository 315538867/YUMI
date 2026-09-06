import { afterEach, describe, expect, it } from 'vitest'
import { addDays, format } from 'date-fns'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'

describe('风险确认与输入拒绝验收', () => {
  const databases: StudioDatabase[] = []
  afterEach(() => databases.splice(0).forEach((database) => database.close()))

  it('模具日产能与交期风险会先提示，确认后才允许保存', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const service = new StudioService(new StudioRepository(database))
    const today = new Date()
    const todayText = format(today, 'yyyy-MM-dd')
    const tomorrowText = format(addDays(today, 1), 'yyyy-MM-dd')
    const product = service.createProduct({
      name: '风险验收商品', basePriceCents: 3000, edgePriceCents: 300, weightGrams: 20,
      lossRate: 0.1, standardMinutesPerUnit: 30, packagingCostCents: 100,
      commissionCentsPerUnit: 200, moldCount: 2, outputPerMoldPerBatch: 1, maxBatchesPerDay: 1
    })
    const worker = service.createWorker({ name: '风险验收人员', hourlyWageCents: 2800 })
    const order = service.createOrder({
      customer: { name: '风险验收客户' }, expectedShipDate: todayText, reserveDays: 0,
      items: [{ productId: product.id, quantity: 8 }]
    })
    const input = { workerId: worker.id, shiftDate: tomorrowText, tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 3 }] }
    const preview = service.previewShift(input)
    expect(preview.risks.map((risk) => risk.code)).toEqual(['MOLD_DAILY_CAPACITY_EXCEEDED', 'DEADLINE_RISK'])
    expect(() => service.saveShift(input)).toThrow('请先确认以下风险：MOLD_DAILY_CAPACITY_EXCEEDED、DEADLINE_RISK')
    expect(service.saveShift({ ...input, confirmedWarningCodes: preview.risks.map((risk) => risk.code) }).confirmedRisks).toEqual(['MOLD_DAILY_CAPACITY_EXCEEDED', 'DEADLINE_RISK'])
  })

  it('无效额外时长、金额、数量和关联 ID 始终被拒绝写入', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const service = new StudioService(new StudioRepository(database))
    const todayText = format(new Date(), 'yyyy-MM-dd')
    const product = service.createProduct({
      name: '输入验收商品', basePriceCents: 3000, edgePriceCents: 300, weightGrams: 20,
      lossRate: 0.1, standardMinutesPerUnit: 30, packagingCostCents: 100,
      commissionCentsPerUnit: 200, moldCount: 5, outputPerMoldPerBatch: 1, maxBatchesPerDay: 1
    })
    const worker = service.createWorker({ name: '输入验收人员', hourlyWageCents: 2800 })
    const order = service.createOrder({ customer: { name: '输入验收客户' }, expectedShipDate: format(addDays(new Date(), 5), 'yyyy-MM-dd'), items: [{ productId: product.id, quantity: 2 }] })
    expect(() => service.saveShift({ workerId: worker.id, shiftDate: todayText, extraMinutes: -1, tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 1 }] })).toThrow('金额或数量不能为负数')
    expect(() => service.recordPayment({ orderId: order.id, type: 'receipt', amountCents: 0, paymentMethod: '微信', paidAt: todayText })).toThrow('数值必须大于 0')
    expect(() => service.createOrder({ customer: { name: '数量验收客户' }, expectedShipDate: todayText, items: [{ productId: product.id, quantity: 0 }] })).toThrow('数值必须大于 0')
    expect(() => service.createOrder({ customer: { name: '关联验收客户' }, expectedShipDate: todayText, items: [{ productId: '00000000-0000-4000-8000-000000000001', quantity: 1 }] })).toThrow('商品不存在')
  })

  it('订单数量超排在预览中明确提示，未确认不可保存，确认后留下风险记录', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const service = new StudioService(new StudioRepository(database))
    const product = service.createProduct({
      name: '超排验收商品', basePriceCents: 3000, edgePriceCents: 0, weightGrams: 20,
      lossRate: 0, standardMinutesPerUnit: 10, packagingCostCents: 0,
      commissionCentsPerUnit: 100, moldCount: 20, outputPerMoldPerBatch: 1, maxBatchesPerDay: 2
    })
    const worker = service.createWorker({ name: '超排验收人员', hourlyWageCents: 2800 })
    const order = service.createOrder({
      customer: { name: '超排验收客户' }, expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 3 }]
    })
    const input = {
      workerId: worker.id,
      shiftDate: '2026-09-10',
      tasks: [{ orderItemId: order.items[0]!.id, plannedQuantity: 4 }]
    }
    const preview = service.previewShift(input)
    expect(preview.risks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'ORDER_QUANTITY_EXCEEDED',
        orderCode: order.code,
        orderedQuantity: 3,
        requestedQuantity: 4,
        excessQuantity: 1
      })
    ]))
    expect(() => service.saveShift(input)).toThrow('请先确认以下风险：ORDER_QUANTITY_EXCEEDED')
    expect(service.saveShift({ ...input, confirmedWarningCodes: ['ORDER_QUANTITY_EXCEEDED'] })).toMatchObject({
      confirmedRisks: ['ORDER_QUANTITY_EXCEEDED']
    })
  })

})
