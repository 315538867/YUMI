import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'

describe('关键写操作事务边界', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('订单写入失败时回滚自动创建的客户和订单明细', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const service = new StudioService(repository)
    const product = service.createProduct({
      name: '事务测试商品',
      basePriceCents: 3000,
      edgePriceCents: 200,
      weightGrams: 10,
      lossRate: 0.05,
      standardMinutesPerUnit: 20,
      packagingCostCents: 50,
      commissionCentsPerUnit: 100,
      moldCount: 2,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2
    })

    expect(() =>
      service.createOrder({
        customer: { name: '不应留下的客户', contact: '000' },
        expectedShipDate: '2026-09-20',
        items: [
          { productId: product.id, quantity: 1 },
          { productId: '00000000-0000-4000-8000-000000000000', quantity: 1 }
        ]
      })
    ).toThrow('商品不存在')

    expect(repository.listCustomers()).toHaveLength(0)
    expect(repository.listOrders()).toHaveLength(0)
  })

  it('收款凭证外键失败时不留下半条收款流水', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const service = new StudioService(repository)
    const product = service.createProduct({
      name: '收款事务商品',
      basePriceCents: 3000,
      edgePriceCents: 0,
      weightGrams: 10,
      lossRate: 0,
      standardMinutesPerUnit: 20,
      packagingCostCents: 0,
      commissionCentsPerUnit: 0,
      moldCount: 2,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2
    })
    const order = service.createOrder({
      customer: { name: '收款客户' },
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 1 }]
    })

    expect(() =>
      service.recordPayment({
        orderId: order.id,
        type: 'receipt',
        amountCents: 1000,
        paymentMethod: '转账',
        paidAt: '2026-09-05',
        receiptAttachmentId: '00000000-0000-4000-8000-000000000000'
      })
    ).toThrow('收款凭证不存在')
    expect(service.getOrderDetail(order.id)?.payments).toHaveLength(0)
    expect(service.getOrderDetail(order.id)?.financial.receivedCents).toBe(0)
  })

  it('排班任务引用无效时不保存班次和任何任务', () => {
    const database = createDatabase(':memory:')
    databases.push(database)
    const repository = new StudioRepository(database)
    const service = new StudioService(repository)
    const product = service.createProduct({
      name: '排班事务商品',
      basePriceCents: 3000,
      edgePriceCents: 0,
      weightGrams: 10,
      lossRate: 0,
      standardMinutesPerUnit: 20,
      packagingCostCents: 0,
      commissionCentsPerUnit: 0,
      moldCount: 2,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2
    })
    const worker = service.createWorker({ name: '排班人员', hourlyWageCents: 2800 })
    const order = service.createOrder({
      customer: { name: '排班事务客户' },
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 2 }]
    })

    expect(() =>
      service.saveShift({
        workerId: worker.id,
        shiftDate: '2026-09-10',
        startTime: '09:00',
        endTime: '10:00',
        tasks: [
          { orderItemId: order.items[0]!.id, plannedQuantity: 1 },
          {
            orderItemId: '00000000-0000-4000-8000-000000000000',
            plannedQuantity: 1
          }
        ]
      })
    ).toThrow('订单商品明细不存在')

    expect(repository.listShifts('2026-09-10', '2026-09-10')).toHaveLength(0)
  })
})
