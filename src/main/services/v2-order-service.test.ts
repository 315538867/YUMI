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

  function createServices(): { orderService: V2OrderService; fulfillmentService: FulfillmentService } {
    const database = createV2Database(':memory:')
    databases.push(database)
    const clock = {
      createId: () => randomUUID(),
      now: () => '2026-09-07T08:00:00.000Z'
    }
    return {
      orderService: new V2OrderService(new V2OrderRepository(database), clock),
      fulfillmentService: new FulfillmentService(new V2FulfillmentRepository(database), clock)
    }
  }

  function createService(): V2OrderService {
    return createServices().orderService
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
      edgeCostCents: 80,
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
      initialConfirmedAmountCents: 32_200,
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
      initialConfirmedAmountCents: 10_000
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
      initialConfirmedAmountCents: 10_000
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
  })

  it('仅允许从待发货可用量分批发货，失败时不写入半条发货或审计记录', () => {
    const { orderService: service, fulfillmentService } = createServices()
    const product = createProduct(service, '葡萄')
    const order = service.createOrder({
      customer: { name: '小苏' },
      items: [{ productId: product.id, quantity: 10, unitPriceCents: 2_000 }],
      initialConfirmedAmountCents: 20_000
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
})
