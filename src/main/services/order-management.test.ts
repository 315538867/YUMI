import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type StudioDatabase } from '@main/database/connection'
import { StudioRepository } from '@main/repositories/studio-repository'
import { StudioService } from './studio-service'

const bearInput = {
  name: '奶油小熊',
  code: 'YUMI-BEAR',
  category: '动物',
  basePriceCents: 3900,
  edgePriceCents: 300,
  weightGrams: 20,
  lossRate: 0.1,
  standardMinutesPerUnit: 30,
  packagingCostCents: 100,
  accessoryCostCents: 250,
  replacementBagCostCents: 80,
  commissionCentsPerUnit: 200,
  moldCount: 20,
  outputPerMoldPerBatch: 1,
  maxBatchesPerDay: 2
}

const cloudInput = {
  ...bearInput,
  name: '云朵捏捏',
  code: 'YUMI-CLOUD',
  basePriceCents: 2000,
  edgePriceCents: 0,
  weightGrams: 0,
  lossRate: 0,
  standardMinutesPerUnit: 10,
  packagingCostCents: 50,
  commissionCentsPerUnit: 100
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

describe('客户、订单与收退款管理', () => {
  const databases: StudioDatabase[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  it('保存多商品订单的客户、售价、成本和制作参数快照，并使用默认预留天数', () => {
    const context = createService()
    databases.push(context.database)
    context.service.updateCostSettings({
      gluePriceCentsPerGram: 50,
      monthlyFixedCostCents: 480000,
      targetEffectiveMinutes: 9600,
      effectiveFrom: '2026-09-01'
    })
    context.service.updateOrderDefaults({ defaultReserveDays: 3 })
    const bear = context.service.createProduct(bearInput)
    const cloud = context.service.createProduct(cloudInput)

    const order = context.service.createOrder({
      customer: {
        name: '小雨',
        contact: '13800000000',
        defaultAddress: '上海市静安区',
        notes: '周末收货'
      },
      expectedShipDate: '2026-09-15',
      discountCents: 500,
      notes: '礼盒包装',
      items: [
        { productId: bear.id, quantity: 2, edgeEnabled: true, edgeQuantity: 2, discountCents: 400 },
        { productId: cloud.id, quantity: 3 }
      ]
    })

    expect(order).toMatchObject({
      customer: { name: '小雨', contact: '13800000000' },
      expectedShipDate: '2026-09-15',
      reserveDays: 3,
      productionDeadline: '2026-09-12',
      productionStatus: 'pending_confirmation',
      receivableCents: 13500,
      estimatedCostCents: 9400,
      financial: { status: 'unpaid', outstandingCents: 13500 }
    })
    expect(order.items).toEqual([
      expect.objectContaining({
        productId: bear.id,
        quantity: 2,
        unitPriceCents: 3900,
        edgeEnabled: true,
        edgeQuantity: 2,
        edgePriceCents: 300,
        discountCents: 400,
        estimatedCostCents: 6460,
        productSnapshot: expect.objectContaining({
          basePriceCents: 3900,
          accessoryCostCents: 250,
          replacementBagCostCents: 80,
          gluePriceCentsPerGram: 50,
          fixedOverheadHourlyRateCents: 3000,
          standardMinutesPerUnit: 30
        })
      }),
      expect.objectContaining({ productId: cloud.id, quantity: 3, estimatedCostCents: 2940 })
    ])

    context.service.updateProduct({
      ...bear,
      basePriceCents: 9999,
      accessoryCostCents: 999,
      replacementBagCostCents: 777,
      enabled: true
    })
    const restored = context.service.getOrderDetail(order.id)
    expect(restored?.items[0]?.productSnapshot).toMatchObject({
      basePriceCents: 3900,
      accessoryCostCents: 250,
      replacementBagCostCents: 80
    })
    expect(context.service.listCustomerOrderHistory(order.customer.id)).toEqual([
      expect.objectContaining({ id: order.id, code: order.code })
    ])
  })

  it('支持编辑多商品订单并刷新售价、缝边、优惠、交期与成本快照', () => {
    const context = createService()
    databases.push(context.database)
    const bear = context.service.createProduct(bearInput)
    const cloud = context.service.createProduct(cloudInput)
    const order = context.service.createOrder({
      customer: { name: '小雨', contact: '13800000000' },
      expectedShipDate: '2026-09-15',
      reserveDays: 2,
      items: [{ productId: bear.id, quantity: 2, edgeEnabled: true, edgeQuantity: 2 }]
    })

    const updated = context.service.updateOrder({
      id: order.id,
      customer: { id: order.customer.id, name: '小雨', contact: '13900000000' },
      expectedShipDate: '2026-09-20',
      reserveDays: 4,
      discountCents: 300,
      notes: '改为周末发货',
      items: [
        {
          id: order.items[0]!.id,
          productId: bear.id,
          quantity: 3,
          unitPriceCents: 4200,
          edgeEnabled: true,
          edgeQuantity: 1,
          edgePriceCents: 350,
          discountCents: 100
        },
        { productId: cloud.id, quantity: 2, unitPriceCents: 1800 }
      ]
    })

    expect(updated).toMatchObject({
      id: order.id,
      expectedShipDate: '2026-09-20',
      reserveDays: 4,
      productionDeadline: '2026-09-16',
      discountCents: 300,
      notes: '改为周末发货',
      receivableCents: 16150,
      customer: { contact: '13900000000' }
    })
    expect(updated.items).toHaveLength(2)
    expect(updated.items[0]).toMatchObject({
      id: order.items[0]!.id,
      quantity: 3,
      unitPriceCents: 4200,
      edgeQuantity: 1,
      edgePriceCents: 350,
      discountCents: 100
    })
    expect(updated.items[1]).toMatchObject({ productId: cloud.id, quantity: 2 })
    expect(context.service.getOrderDetail(order.id)?.payments).toEqual([])
  })

  it('支持分次收款和退款，并保持资金状态与制作状态独立', () => {
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct(bearInput)
    const order = context.service.createOrder({
      customer: { name: '小雨' },
      expectedShipDate: '2026-09-15',
      reserveDays: 2,
      items: [{ productId: product.id, quantity: 3 }]
    })

    context.service.recordPayment({
      orderId: order.id,
      type: 'receipt',
      amountCents: 7000,
      paymentMethod: '微信',
      paidAt: '2026-09-04'
    })
    const refunding = context.service.recordPayment({
      orderId: order.id,
      type: 'refund',
      amountCents: 1000,
      paymentMethod: '微信',
      paidAt: '2026-09-05',
      note: '客户改价'
    })

    expect(refunding.financial).toMatchObject({
      receivableCents: 11700,
      receivedCents: 7000,
      refundedCents: 1000,
      receivedNetCents: 6000,
      outstandingCents: 5700,
      status: 'refunding'
    })
    expect(refunding.productionStatus).toBe('pending_confirmation')

    const settled = context.service.recordPayment({
      orderId: order.id,
      type: 'receipt',
      amountCents: 5700,
      paymentMethod: '支付宝',
      paidAt: '2026-09-06'
    })
    expect(settled.financial.status).toBe('paid')
    expect(() =>
      context.service.updateOrderProductionStatus({
        orderId: order.id,
        productionStatus: 'in_production'
      })
    ).toThrow('订单制作状态不允许从 pending_confirmation 变更为 in_production')
    context.service.updateOrderProductionStatus({
      orderId: order.id,
      productionStatus: 'pending_schedule'
    })
    const inProduction = context.service.updateOrderProductionStatus({
      orderId: order.id,
      productionStatus: 'in_production'
    })
    expect(inProduction).toMatchObject({
      productionStatus: 'in_production',
      financial: { status: 'paid' }
    })
    expect(context.repository.listAuditLogs('payment')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'payment.recorded',
          entityId: order.id,
          actorName: '本机管理员'
        })
      ])
    )
  })

  it('拒绝停用商品、无效缝边数量和不存在的订单收退款', () => {
    const context = createService()
    databases.push(context.database)
    const product = context.service.createProduct(bearInput)
    const activeProduct = context.service.createProduct(cloudInput)
    context.service.updateProduct({ ...product, enabled: false })

    expect(() =>
      context.service.createOrder({
        customer: { name: '小雨' },
        expectedShipDate: '2026-09-15',
        items: [{ productId: product.id, quantity: 1 }]
      })
    ).toThrow('商品未启用，不能创建订单')
    expect(() =>
      context.service.createOrder({
        customer: { name: '小雨' },
        expectedShipDate: '2026-09-15',
        items: [{ productId: activeProduct.id, quantity: 1, edgeEnabled: true, edgeQuantity: 2 }]
      })
    ).toThrow('缝边数量不能超过商品数量')
    expect(context.repository.listCustomers()).toHaveLength(0)
    expect(() =>
      context.service.recordPayment({
        orderId: '01800000-0000-7000-8000-000000000001',
        type: 'receipt',
        amountCents: 1,
        paymentMethod: '微信',
        paidAt: '2026-09-04'
      })
    ).toThrow('订单不存在')
  })
})
