import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { FulfillmentService } from '@main/services/fulfillment-service'
import { V2OrderService } from '@main/services/v2-order-service'

describe('V2OrderService', () => {
  const databases: V2Database[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  function createServices(orderReservedDays = 2): {
    orderService: V2OrderService
    fulfillmentService: FulfillmentService
    repository: V2OrderRepository
  } {
    const database = createV2Database(':memory:')
    databases.push(database)
    const clock = {
      createId: () => randomUUID(),
      now: () => '2026-09-07T08:00:00.000Z'
    }
    const repository = new V2OrderRepository(database)
    return {
      orderService: new V2OrderService(repository, clock, {
        get: () => ({ gluePriceMicroYuanPerGram: 0, orderReservedDays, updatedAt: null })
      }),
      fulfillmentService: new FulfillmentService(new V2FulfillmentRepository(database), clock),
      repository
    }
  }

  function createService(orderReservedDays = 2): V2OrderService {
    return createServices(orderReservedDays).orderService
  }

  function createProduct(service: V2OrderService, name: string) {
    return service.createProduct({
      name,
      code: `${name}-CODE`,
      category: '捏捏',
      basePriceCents: 5_000,
      materialCostCents: 1_200,
      packagingCostCents: 200,
      accessoryCostCents: 100,
      replacementBagCostCents: 50,
      internalEdgeCostCents: 80,
      standardMakingMinutes: 20,
      makingCommissionCents: 500,
      makingGlueCostCents: 30
    })
  }

  it('将客户、商品快照、订单和审计记录作为同一业务闭环保存', () => {
    const service = createService()
    const customer = service.createCustomer({ name: '小雨', contact: '微信：xiaoyu' })
    const productA = createProduct(service, '草莓蛋糕')
    const productB = createProduct(service, '云朵')

    const order = service.createOrder({
      code: 'YUMI-20260907-001',
      customerId: customer.id,
      customer: { name: '不应覆盖已有客户快照' },
      items: [
        { productId: productA.id, quantity: 3, unitPriceCents: 6_800 },
        { productId: productB.id, quantity: 2, unitPriceCents: 5_900 }
      ],
      expectedShipDate: '2026-09-20'
    })

    expect(order.customer?.name).toBe('小雨')
    expect(order.items.map((item) => item.productSnapshot.name)).toEqual(['草莓蛋糕', '云朵'])
    expect(order.amount.currentAmountCents).toBe(32_200)
    expect(order.funds).toMatchObject({ netReceivedCents: 0, outstandingCents: 32_200 })
    expect(service.listAuditLogs(order.id).map((log) => log.action)).toEqual(['order.created'])
  })

  it('在同一事务内记录内容变更和可选金额调整，并保留变更前后快照', () => {
    const service = createService()
    const product = createProduct(service, '奶油兔')
    const order = service.createOrder({
      customer: { name: '小林' },
      items: [{ productId: product.id, quantity: 2, unitPriceCents: 5_000 }],
    })

    const changed = service.changeOrderContent(order.id, {
      occurredOn: '2026-09-08',
      description: '客户改为加封边',
      items: [{ productId: product.id, quantity: 2, unitPriceCents: 5_000 }],
      amountAdjustment: { amountCents: 600, occurredOn: '2026-09-08', reason: '加封边' }
    })

    expect(changed.amount.currentAmountCents).toBe(10_600)
    expect(service.listContentChanges(order.id)).toHaveLength(1)
    expect(service.listContentChanges(order.id)[0]).toMatchObject({
      beforeItems: [{ quantity: 2 }],
      afterItems: [{ quantity: 2 }]
    })
    expect(service.listAuditLogs(order.id).map((log) => log.action)).toEqual([
      'order.created',
      'order.content_changed'
    ])
  })

  it('将订单资金、冲正和替代记录作为不可覆盖的资金流水保存', () => {
    const service = createService()
    const product = createProduct(service, '小熊')
    const order = service.createOrder({
      customer: { name: '阿月' },
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 10_000 }],
    })
    const payment = service.recordOrderFund(order.id, {
      businessType: 'payment',
      amountCents: 8_000,
      occurredOn: '2026-09-07',
      paymentMethod: '微信'
    })

    const corrected = service.correctOrderFund(order.id, {
      originalEntryId: payment.id,
      reversalOccurredOn: '2026-09-08',
      replacement: {
        businessType: 'payment',
        amountCents: 7_500,
        occurredOn: '2026-09-08',
        paymentMethod: '微信',
        note: '核对后更正'
      }
    })

    expect(corrected.reversal.reversalOfEntryId).toBe(payment.id)
    expect(corrected.replacement.amountCents).toBe(7_500)
    expect(service.listOrderFunds(order.id)).toHaveLength(3)
    expect(service.getOrder(order.id)?.funds).toMatchObject({
      receivedCents: 7_500,
      refundedCents: 0,
      netReceivedCents: 7_500,
      outstandingCents: 2_500
    })
    expect(() => service.correctOrderFund(order.id, {
      originalEntryId: payment.id,
      reversalOccurredOn: '2026-09-08',
      replacement: {
        businessType: 'payment', amountCents: 7_500, occurredOn: '2026-09-08'
      }
    })).toThrow('已被冲正')
    const freshOrder = service.createOrder({
      customer: { name: '待校验凭证' },
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 10_000 }]
    })
    const freshPayment = service.recordOrderFund(freshOrder.id, {
      businessType: 'payment', amountCents: 8_000, occurredOn: '2026-09-07'
    })
    expect(() => service.correctOrderFund(freshOrder.id, {
      originalEntryId: freshPayment.id,
      reversalOccurredOn: '2026-09-08',
      replacement: {
        businessType: 'payment', amountCents: 7_500, occurredOn: '2026-09-08', attachmentId: 'missing-proof'
      }
    })).toThrow('收款凭证不存在或类型不正确')
  })

  it('允许同一批次并行发出多个商品，并分别保留每个商品的剩余可发数量', () => {
    const { orderService: service, fulfillmentService } = createServices()
    const strawberry = createProduct(service, '草莓蛋糕')
    const cloud = createProduct(service, '云朵')
    const order = service.createOrder({
      customer: { name: '小苏' },
      items: [
        { productId: strawberry.id, quantity: 5, unitPriceCents: 2_000 },
        { productId: cloud.id, quantity: 4, unitPriceCents: 2_500 }
      ],
    })

    fulfillmentService.recordOpeningWip({
      orderItemId: order.items[0].id, targetStage: 'ready_to_ship', quantity: 5,
      occurredOn: '2026-09-07', note: '系统启用前已打包'
    })
    fulfillmentService.recordOpeningWip({
      orderItemId: order.items[1].id, targetStage: 'ready_to_ship', quantity: 4,
      occurredOn: '2026-09-07', note: '系统启用前已打包'
    })

    const shipment = service.createShipment(order.id, {
      shippedOn: '2026-09-08', carrier: '顺丰', trackingNo: 'SF-001',
      items: [
        { orderItemId: order.items[0].id, quantity: 3 },
        { orderItemId: order.items[1].id, quantity: 2 }
      ]
    })

    expect(shipment.items).toEqual([
      expect.objectContaining({ orderItemId: order.items[0].id, quantity: 3 }),
      expect.objectContaining({ orderItemId: order.items[1].id, quantity: 2 })
    ])
    expect(fulfillmentService.getOrderItemFulfillment(order.items[0].id).stages)
      .toMatchObject({ readyToShip: 2, shipped: 3 })
    expect(fulfillmentService.getOrderItemFulfillment(order.items[1].id).stages)
      .toMatchObject({ readyToShip: 2, shipped: 2 })

    expect(() => service.createShipment(order.id, {
      shippedOn: '2026-09-08',
      items: [
        { orderItemId: order.items[0].id, quantity: 3 },
        { orderItemId: order.items[1].id, quantity: 1 }
      ]
    })).toThrow('本次发货数量超过待发货可用数量')
    expect(service.listShipments(order.id)).toHaveLength(1)
  })

  it('为每个发货批次冻结全订单商品、客户和数量快照', () => {
    const { orderService: service, fulfillmentService, repository } = createServices()
    const strawberry = createProduct(service, '草莓蛋糕')
    const cloud = createProduct(service, '云朵')
    const order = service.createOrder({
      customer: { name: '小苏', contact: '微信 xiaosu', defaultAddress: '上海市静安区' },
      expectedShipDate: '2026-09-12',
      items: [
        { productId: strawberry.id, quantity: 5, unitPriceCents: 2_000 },
        { productId: cloud.id, quantity: 4, unitPriceCents: 2_500 }
      ]
    })
    order.items.forEach((item) => fulfillmentService.recordOpeningWip({
      orderItemId: item.id, targetStage: 'ready_to_ship', quantity: item.quantity,
      occurredOn: '2026-09-07', note: '可发货库存'
    }))

    const firstShipment = service.createShipment(order.id, {
      shippedOn: '2026-09-08', carrier: '顺丰', trackingNumber: 'SF-001',
      items: [{ orderItemId: order.items[0].id, quantity: 2 }]
    })
    service.createShipment(order.id, {
      shippedOn: '2026-09-09', carrier: '京东', trackingNumber: 'JD-002',
      items: [{ orderItemId: order.items[0].id, quantity: 1 }, { orderItemId: order.items[1].id, quantity: 4 }]
    })

    expect(repository.getShipmentDocumentSnapshot(order.id, firstShipment.id)).toMatchObject({
      shipment: { shippedOn: '2026-09-08', carrier: '顺丰', trackingNumber: 'SF-001' },
      order: {
        code: order.code,
        customerSnapshot: { name: '小苏', contact: '微信 xiaosu', defaultAddress: '上海市静安区' },
        expectedShipDate: '2026-09-12'
      },
      items: [
        expect.objectContaining({
          orderItemId: order.items[0].id, orderedQuantity: 5, thisShipmentQuantity: 2,
          shippedQuantity: 2, remainingQuantity: 3
        }),
        expect.objectContaining({
          orderItemId: order.items[1].id, orderedQuantity: 4, thisShipmentQuantity: 0,
          shippedQuantity: 0, remainingQuantity: 4
        })
      ]
    })
  })

  it('仅允许从待发货可用量分批发货，失败时不写入半条发货或审计记录', () => {
    const { orderService: service, fulfillmentService } = createServices()
    const product = createProduct(service, '葡萄')
    const order = service.createOrder({
      customer: { name: '小苏' },
      items: [{ productId: product.id, quantity: 10, unitPriceCents: 2_000 }],
    })

    expect(() => service.createShipment(order.id, {
      shippedOn: '2026-09-07',
      items: [{ orderItemId: order.items[0].id, quantity: 1 }]
    })).toThrow('待发货可用数量')

    fulfillmentService.recordOpeningWip({
      orderItemId: order.items[0].id,
      targetStage: 'ready_to_ship',
      quantity: 10,
      occurredOn: '2026-09-07',
      note: 'V2 上线时已完成打包'
    })
    const firstShipment = service.createShipment(order.id, {
      shippedOn: '2026-09-07',
      items: [{ orderItemId: order.items[0].id, quantity: 6 }],
      carrier: '顺丰'
    })
    expect(firstShipment.items).toEqual([expect.objectContaining({ orderItemId: order.items[0].id, quantity: 6 })])
    expect(fulfillmentService.getOrderItemFulfillment(order.items[0].id).stages).toMatchObject({
      readyToShip: 4,
      shipped: 6
    })

    expect(() => service.createShipment(order.id, {
      shippedOn: '2026-09-07',
      items: [{ orderItemId: order.items[0].id, quantity: 5 }]
    })).toThrow('本次发货数量超过待发货可用数量')

    expect(service.listShipments(order.id)).toHaveLength(1)
    expect(service.listAuditLogs(order.id).map((log) => log.action)).toEqual([
      'order.created',
      'shipment.created'
    ])
  })
  it('保存商品材料损耗与模具参数，并冻结到订单商品快照', () => {
    const service = createService()
    const product = service.createProduct({
      name: '材料快照商品',
      basePriceCents: 5_000,
      materialCostCents: 0,
      packagingCostCents: 200,
      accessoryCostCents: 100,
      replacementBagCostCents: 50,
      internalEdgeCostCents: 80,
      standardMakingMinutes: 20,
      makingCommissionCents: 500,
      makingGlueCostCents: 30,
      unitWeightMilligrams: 20_000,
      materialLossRateBasisPoints: 1_000,
      moldCount: 20,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2
    })

    expect(product).toMatchObject({
      unitWeightMilligrams: 20_000,
      materialLossRateBasisPoints: 1_000,
      moldCount: 20,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2,
      dailyCapacity: 40
    })

    const order = service.createOrder({
      customer: { name: '快照客户' },
      items: [{ productId: product.id, quantity: 10, unitPriceCents: 5_000 }]
    })
    expect(order.items[0]?.productSnapshot).toMatchObject({
      unitWeightMilligrams: 20_000,
      materialLossRateBasisPoints: 1_000,
      moldCount: 20,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2,
      dailyCapacity: 40
    })

    service.updateProduct({
      ...product,
      unitWeightMilligrams: 30_000,
      materialLossRateBasisPoints: 2_000,
      moldCount: 10,
      outputPerMoldPerBatch: 2,
      maxBatchesPerDay: 3
    })

    const reloaded = service.getOrder(order.id)
    expect(reloaded?.items[0]?.productSnapshot).toMatchObject({
      unitWeightMilligrams: 20_000,
      materialLossRateBasisPoints: 1_000,
      moldCount: 20,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2,
      dailyCapacity: 40
    })
  })

  it('拒绝超出边界的商品材料和模具产能参数', () => {
    const service = createService()
    expect(() => service.createProduct({
      name: '非法商品',
      basePriceCents: 5_000,
      packagingCostCents: 200,
      accessoryCostCents: 100,
      replacementBagCostCents: 50,
      internalEdgeCostCents: 80,
      standardMakingMinutes: 20,
      makingCommissionCents: 500,
      unitWeightMilligrams: 20_000,
      materialLossRateBasisPoints: 10_001,
      moldCount: 20,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2
    })).toThrow('损耗率必须小于 100%')
  })

  it('保存订单预留天数并派生制作截止日期，订单优惠继续按非负金额校验', () => {
    const service = createService(2)
    const product = createProduct(service, '预留测试商品')
    const order = service.createOrder({
      customer: { name: '小周' },
      expectedShipDate: '2026-09-15',
      reservedDays: 3,
      orderDiscountCents: 500,
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 2_000 }]
    })

    expect(order).toMatchObject({ reservedDays: 3, productionDeadline: '2026-09-12' })
    const defaultOrder = service.createOrder({
      customer: { name: '小周' },
      expectedShipDate: '2026-09-15',
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 2_000 }]
    })
    expect(defaultOrder).toMatchObject({ reservedDays: 2, productionDeadline: '2026-09-13' })
    expect(order.amount.orderDiscountCents).toBe(500)
    expect(() => service.createOrder({
      customer: { name: '小周' },
      expectedShipDate: '2026-09-15',
      reservedDays: -1,
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 2_000 }]
    })).toThrow('预留天数必须是非负整数')
    expect(() => service.createOrder({
      customer: { name: '小周' },
      expectedShipDate: '2026-09-15',
      orderDiscountCents: -1,
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 2_000 }]
    })).toThrow('订单优惠不能为负数')
  })
})
