import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { FulfillmentService } from '@main/services/fulfillment-service'
import { ProductInventoryService } from '@main/services/product-inventory-service'
import { V2OrderService } from '@main/services/v2-order-service'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'

describe('ProductInventoryService', () => {
  const databases: V2Database[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  function createServices() {
    const database = createV2Database(':memory:')
    databases.push(database)
    const clock = { createId: () => randomUUID(), now: () => '2026-09-14T08:00:00.000Z' }
    const repository = new V2OrderRepository(database)
    const orderService = new V2OrderService(repository, clock, {
      get: () => ({
        materialPriceMicroYuanPerGram: 3_400,
        orderReservedDays: 2,
        fluffingBaggingExpectedHourlyWageCents: 0,
        edgeSewingExpectedHourlyWageCents: 0,
        packingExpectedHourlyWageCents: 0,
        updatedAt: null
      })
    })
    const fulfillmentRepository = new V2FulfillmentRepository(database)
    return {
      database,
      orderService,
      inventory: new ProductInventoryService(database, clock),
      fulfillment: new FulfillmentService(fulfillmentRepository, clock),
      fulfillmentRepository
    }
  }

  function createProduct(orderService: V2OrderService, name: string) {
    return orderService.createProduct({
      name,
      basePriceCents: 5_000,
      packagingCostCents: 100,
      accessoryCostCents: 50,
      replacementBagCostCents: 0,
      edgeConsumableCostCents: 0,
      standardMakingMinutes: 10,
      makingCommissionCents: 100
    })
  }

  it('期初重录与负责人调整都保留可追溯流水，余额不能为负', () => {
    const { orderService, inventory } = createServices()
    const product = createProduct(orderService, '存量商品')

    inventory.recordOpening({
      productId: product.id,
      stage: 'made',
      quantity: 100,
      occurredOn: '2026-09-14'
    })
    inventory.recordOpening({
      productId: product.id,
      stage: 'fluffing_bagging_done',
      quantity: 30,
      occurredOn: '2026-09-14',
      note: '现场盘点'
    })
    const afterAdjust = inventory.adjust({
      productId: product.id,
      stage: 'made',
      quantityDelta: -10,
      occurredOn: '2026-09-14',
      note: '盘点差异'
    })

    expect(afterAdjust.stages).toEqual({
      made: 90,
      fluffing_bagging_done: 30,
      edge_sewing_done: 0,
      packed: 0
    })
    expect(inventory.listEvents(product.id).map((event) => event.sourceType)).toEqual([
      'opening',
      'opening',
      'manager_adjustment'
    ])
    expect(() =>
      inventory.adjust({
        productId: product.id,
        stage: 'made',
        quantityDelta: -91,
        occurredOn: '2026-09-14',
        note: '超量减少'
      })
    ).toThrow('商品存量余额不能为负')
    expect(inventory.getSummary(product.id).stages.made).toBe(90)
  })

  it('已捏毛未缝边存量投入无缝边订单时进入待打包发货', () => {
    const { orderService, inventory, fulfillmentRepository } = createServices()
    const product = createProduct(orderService, '无缝边存量商品')
    const order = orderService.createOrder({
      customer: { name: '客户' },
      items: [{ productId: product.id, quantity: 50, unitPriceCents: 5_000 }]
    })
    const item = order.items[0]!
    inventory.recordOpening({
      productId: product.id,
      stage: 'fluffing_bagging_done',
      quantity: 50,
      occurredOn: '2026-09-14'
    })

    const result = inventory.allocateToOrder({
      productId: product.id,
      stage: 'fluffing_bagging_done',
      orderItemId: item.id,
      quantity: 20,
      occurredOn: '2026-09-14'
    })

    expect(result.targetStage).toBe('packing')
    expect(result.summary.stages.fluffing_bagging_done).toBe(30)
    const events = fulfillmentRepository.listFulfillmentEvents(item.id)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventType: 'inventory_allocation',
      quantity: 20,
      sourceStage: 'making',
      targetStage: 'packing'
    })
  })

  it('已捏毛未缝边存量按订单缝边需求拆分到待缝边与待打包发货', () => {
    const { orderService, inventory, fulfillmentRepository } = createServices()
    const product = createProduct(orderService, '缝边存量商品')
    const order = orderService.createOrder({
      customer: { name: '客户' },
      items: [
        {
          productId: product.id,
          quantity: 50,
          unitPriceCents: 5_000,
          edge: { enabled: true, quantity: 30, unitPriceCents: 300 }
        }
      ]
    })
    const item = order.items[0]!
    inventory.recordOpening({
      productId: product.id,
      stage: 'fluffing_bagging_done',
      quantity: 50,
      occurredOn: '2026-09-14'
    })

    inventory.allocateToOrder({
      productId: product.id,
      stage: 'fluffing_bagging_done',
      orderItemId: item.id,
      quantity: 40,
      occurredOn: '2026-09-14'
    })

    const events = fulfillmentRepository.listFulfillmentEvents(item.id)
    expect(events.map((event) => [event.targetStage, event.quantity])).toEqual([
      ['edge_sewing', 30],
      ['packing', 10]
    ])
  })

  it('投入数量超过商品余额时整体失败且订单履约不变', () => {
    const { orderService, inventory, fulfillmentRepository } = createServices()
    const product = createProduct(orderService, '余额不足商品')
    const order = orderService.createOrder({
      customer: { name: '客户' },
      items: [{ productId: product.id, quantity: 50, unitPriceCents: 5_000 }]
    })
    const item = order.items[0]!
    inventory.recordOpening({
      productId: product.id,
      stage: 'made',
      quantity: 10,
      occurredOn: '2026-09-14'
    })

    expect(() =>
      inventory.allocateToOrder({
        productId: product.id,
        stage: 'made',
        orderItemId: item.id,
        quantity: 12,
        occurredOn: '2026-09-14'
      })
    ).toThrow('商品存量余额不能为负')
    expect(inventory.getSummary(product.id).stages.made).toBe(10)
    expect(fulfillmentRepository.listFulfillmentEvents(item.id)).toHaveLength(0)
  })

  it('已缝边存量只可满足仍有缝边需求的订单', () => {
    const { orderService, inventory, fulfillmentRepository } = createServices()
    const product = createProduct(orderService, '已缝边存量商品')
    const edgedOrder = orderService.createOrder({
      customer: { name: '客户' },
      items: [
        {
          productId: product.id,
          quantity: 50,
          unitPriceCents: 5_000,
          edge: { enabled: true, quantity: 20, unitPriceCents: 300 }
        }
      ]
    })
    const plainOrder = orderService.createOrder({
      customer: { name: '客户' },
      items: [{ productId: product.id, quantity: 50, unitPriceCents: 5_000 }]
    })
    inventory.recordOpening({
      productId: product.id,
      stage: 'edge_sewing_done',
      quantity: 20,
      occurredOn: '2026-09-14'
    })

    expect(() =>
      inventory.allocateToOrder({
        productId: product.id,
        stage: 'edge_sewing_done',
        orderItemId: plainOrder.items[0]!.id,
        quantity: 5,
        occurredOn: '2026-09-14'
      })
    ).toThrow('已缝边存量只可满足订单的缝边需求')

    const result = inventory.allocateToOrder({
      productId: product.id,
      stage: 'edge_sewing_done',
      orderItemId: edgedOrder.items[0]!.id,
      quantity: 20,
      occurredOn: '2026-09-14'
    })
    expect(result.targetStage).toBe('packing')
    const events = fulfillmentRepository.listFulfillmentEvents(edgedOrder.items[0]!.id)
    expect(events.map((event) => [event.targetStage, event.quantity])).toEqual([
      ['edge_sewing', 20],
      ['packing', 20]
    ])
    expect(inventory.getSummary(product.id).stages.edge_sewing_done).toBe(0)
  })

  it('商品与订单商品不一致时拒绝投入', () => {
    const { orderService, inventory } = createServices()
    const productA = createProduct(orderService, '商品 A')
    const productB = createProduct(orderService, '商品 B')
    const order = orderService.createOrder({
      customer: { name: '客户' },
      items: [{ productId: productB.id, quantity: 5, unitPriceCents: 5_000 }]
    })
    inventory.recordOpening({
      productId: productA.id,
      stage: 'made',
      quantity: 10,
      occurredOn: '2026-09-14'
    })

    expect(() =>
      inventory.allocateToOrder({
        productId: productA.id,
        stage: 'made',
        orderItemId: order.items[0]!.id,
        quantity: 1,
        occurredOn: '2026-09-14'
      })
    ).toThrow('商品存量只能投入相同商品的订单商品')
  })
})
