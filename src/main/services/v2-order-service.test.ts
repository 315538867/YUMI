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

  function createServices(
    orderReservedDays = 2,
    settingsOverrides: Partial<{
      materialPriceMicroYuanPerGram: number
      fluffingBaggingExpectedHourlyWageCents: number
      edgeSewingExpectedHourlyWageCents: number
      packingExpectedHourlyWageCents: number
    }> = {}
  ): {
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
        get: () => ({
          materialPriceMicroYuanPerGram: 0,
          orderReservedDays,
          fluffingBaggingExpectedHourlyWageCents: 0,
          edgeSewingExpectedHourlyWageCents: 0,
          packingExpectedHourlyWageCents: 0,
          updatedAt: null,
          ...settingsOverrides
        })
      }),
      fulfillmentService: new FulfillmentService(new V2FulfillmentRepository(database), clock),
      repository
    }
  }

  function createService(
    orderReservedDays = 2,
    settingsOverrides: Parameters<typeof createServices>[1] = {}
  ): V2OrderService {
    return createServices(orderReservedDays, settingsOverrides).orderService
  }

  function createProduct(service: V2OrderService, name: string) {
    return service.createProduct({
      name,
      basePriceCents: 5_000,
      packagingCostCents: 200,
      accessoryCostCents: 100,
      replacementBagCostCents: 50,
      edgeConsumableCostCents: 80,
      standardMakingMinutes: 20,
      makingCommissionCents: 500
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

  it('创建商品时由系统分配 SP 序号编码，编辑不改写编码且快照携带该编码', () => {
    const service = createService()
    const baseInput = {
      basePriceCents: 5_000,
      packagingCostCents: 200,
      accessoryCostCents: 100,
      replacementBagCostCents: 50,
      edgeConsumableCostCents: 80,
      standardMakingMinutes: 20,
      makingCommissionCents: 500
    }
    const first = service.createProduct({ name: '编码商品一', ...baseInput })
    const second = service.createProduct({ name: '编码商品二', ...baseInput })
    expect(first.code).toBe('SP0001')
    expect(second.code).toBe('SP0002')

    const renamed = service.updateProduct({ id: first.id, name: '编码商品一改', ...baseInput })
    expect(renamed.code).toBe('SP0001')

    const order = service.createOrder({
      customer: { name: '编码客户' },
      items: [{ productId: first.id, quantity: 1, unitPriceCents: 6_000 }]
    })
    expect(order.items[0].productSnapshot.code).toBe('SP0001')
  })

  it('冻结商品的捏毛装袋提成，并让后续商品改价只作用于新订单快照', () => {
    const service = createService()
    const product = service.createProduct({
      name: '捏毛提成测试商品',
      basePriceCents: 5_000,
      packagingCostCents: 100,
      accessoryCostCents: 0,
      replacementBagCostCents: 0,
      edgeConsumableCostCents: 0,
      standardMakingMinutes: 12,
      makingCommissionCents: 300,
      fluffingBaggingCommissionCents: 85
    } as Parameters<typeof service.createProduct>[0] & { fluffingBaggingCommissionCents: number })

    const firstOrder = service.createOrder({
      customer: { name: '小雨' },
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 5_000 }]
    })
    expect(firstOrder.items[0].productSnapshot).toMatchObject({
      fluffingBaggingCommissionCents: 85
    })

    const updatedProduct = service.updateProduct({
      ...product,
      fluffingBaggingCommissionCents: 120
    } as Parameters<typeof service.updateProduct>[0] & { fluffingBaggingCommissionCents: number })
    expect(updatedProduct).toMatchObject({ fluffingBaggingCommissionCents: 120 })
    expect(service.getOrder(firstOrder.id)?.items[0].productSnapshot).toMatchObject({
      fluffingBaggingCommissionCents: 85
    })

    const secondOrder = service.createOrder({
      customer: { name: '小雨' },
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 5_000 }]
    })
    expect(secondOrder.items[0].productSnapshot).toMatchObject({
      fluffingBaggingCommissionCents: 120
    })
  })

  it('读取商品权威预计盈利，并使用全局预计基准时薪而不是排班或实际工资', () => {
    const { orderService } = createServices(2, {
      materialPriceMicroYuanPerGram: 3_400,
      fluffingBaggingExpectedHourlyWageCents: 3_000,
      edgeSewingExpectedHourlyWageCents: 3_000,
      packingExpectedHourlyWageCents: 3_000
    })
    const product = orderService.createProduct({
      name: '预计盈利商品',
      basePriceCents: 3_500,
      packagingCostCents: 20,
      accessoryCostCents: 5,
      replacementBagCostCents: 8,
      edgeConsumableCostCents: 30,
      fixedCostCents: 120,
      unitWeightMilligrams: 25_000,
      standardMakingMinutes: 20,
      makingCommissionCents: 80,
      fluffingBaggingCommissionCents: 50,
      edgeSewingCommissionCents: 40,
      expectedFluffingBaggingMinutes: 20,
      expectedEdgeSewingMinutes: 10,
      expectedPackingMinutes: 18
    })

    const profit = orderService.getProductExpectedProfit(product.id)
    expect(profit?.materialCost.amountCents).toBe(9)
    expect(profit?.fluffingBaggingLaborCost.amountCents).toBe(1_000)
    expect(profit?.packingLaborCost.amountCents).toBe(900)
    expect(profit?.unitCost.amountCents).toBe(2_192)
    expect(profit?.unitProfit.amountCents).toBe(1_308)
    expect(profit?.profitRate.display).toBe('37.37%')
    expect(profit?.edgeIncrementalCost.amountCents).toBe(570)
    expect(orderService.getProductExpectedProfit('missing-product')).toBeNull()
  })

  it('忽略 renderer 附带的派生金额，保存边界只按原始字段重新计算', () => {
    const service = createService()
    const product = createProduct(service, '篡改金额')
    const order = service.createOrder({
      customer: { name: '小雨' },
      items: [
        {
          productId: product.id,
          quantity: 2,
          unitPriceCents: 5_000,
          itemAmountCents: 999_999,
          lineAmountCents: 999_999
        }
      ],
      orderAmountCents: 999_999,
      currentAmountCents: 999_999
    } as never)

    expect(order.items[0].itemAmountCents).toBe(10_000)
    expect(order.items[0].lineAmountCents).toBe(10_000)
    expect(order.amount.orderAmountCents).toBe(10_000)
    expect(order.amount.currentAmountCents).toBe(10_000)
  })

  it('在同一事务内记录内容变更和可选金额调整，并保留变更前后快照', () => {
    const service = createService()
    const product = createProduct(service, '奶油兔')
    const order = service.createOrder({
      customer: { name: '小林' },
      items: [{ productId: product.id, quantity: 2, unitPriceCents: 5_000 }]
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
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 10_000 }]
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
    expect(() =>
      service.correctOrderFund(order.id, {
        originalEntryId: payment.id,
        reversalOccurredOn: '2026-09-08',
        replacement: {
          businessType: 'payment',
          amountCents: 7_500,
          occurredOn: '2026-09-08'
        }
      })
    ).toThrow('已被冲正')
    const freshOrder = service.createOrder({
      customer: { name: '待校验凭证' },
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 10_000 }]
    })
    const freshPayment = service.recordOrderFund(freshOrder.id, {
      businessType: 'payment',
      amountCents: 8_000,
      occurredOn: '2026-09-07'
    })
    expect(() =>
      service.correctOrderFund(freshOrder.id, {
        originalEntryId: freshPayment.id,
        reversalOccurredOn: '2026-09-08',
        replacement: {
          businessType: 'payment',
          amountCents: 7_500,
          occurredOn: '2026-09-08',
          attachmentId: 'missing-proof'
        }
      })
    ).toThrow('收款凭证不存在或类型不正确')
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
      ]
    })

    fulfillmentService.adjustStageQuantity({
      orderItemId: order.items[0].id,
      targetStage: 'ready_to_ship',
      quantity: 5,
      occurredOn: '2026-09-07',
      note: '系统启用前已打包'
    })
    fulfillmentService.adjustStageQuantity({
      orderItemId: order.items[1].id,
      targetStage: 'ready_to_ship',
      quantity: 4,
      occurredOn: '2026-09-07',
      note: '系统启用前已打包'
    })

    const shipment = service.createShipment(order.id, {
      shippedOn: '2026-09-08',
      carrier: '顺丰',
      trackingNo: 'SF-001',
      items: [
        { orderItemId: order.items[0].id, quantity: 3 },
        { orderItemId: order.items[1].id, quantity: 2 }
      ]
    })

    expect(shipment.items).toEqual([
      expect.objectContaining({ orderItemId: order.items[0].id, quantity: 3 }),
      expect.objectContaining({ orderItemId: order.items[1].id, quantity: 2 })
    ])
    expect(fulfillmentService.getOrderItemFulfillment(order.items[0].id).stages).toMatchObject({
      readyToShip: 2,
      shipped: 3
    })
    expect(fulfillmentService.getOrderItemFulfillment(order.items[1].id).stages).toMatchObject({
      readyToShip: 2,
      shipped: 2
    })

    expect(() =>
      service.createShipment(order.id, {
        shippedOn: '2026-09-08',
        items: [
          { orderItemId: order.items[0].id, quantity: 3 },
          { orderItemId: order.items[1].id, quantity: 1 }
        ]
      })
    ).toThrow('本次发货数量超过待发货可用数量')
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
    order.items.forEach((item) =>
      fulfillmentService.adjustStageQuantity({
        orderItemId: item.id,
        targetStage: 'ready_to_ship',
        quantity: item.quantity,
        occurredOn: '2026-09-07',
        note: '可发货库存'
      })
    )

    const firstShipment = service.createShipment(order.id, {
      shippedOn: '2026-09-08',
      carrier: '顺丰',
      trackingNumber: 'SF-001',
      items: [{ orderItemId: order.items[0].id, quantity: 2 }]
    })
    service.createShipment(order.id, {
      shippedOn: '2026-09-09',
      carrier: '京东',
      trackingNumber: 'JD-002',
      items: [
        { orderItemId: order.items[0].id, quantity: 1 },
        { orderItemId: order.items[1].id, quantity: 4 }
      ]
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
          orderItemId: order.items[0].id,
          orderedQuantity: 5,
          thisShipmentQuantity: 2,
          shippedQuantity: 2,
          remainingQuantity: 3
        }),
        expect.objectContaining({
          orderItemId: order.items[1].id,
          orderedQuantity: 4,
          thisShipmentQuantity: 0,
          shippedQuantity: 0,
          remainingQuantity: 4
        })
      ]
    })
  })

  it('仅允许从待发货可用量分批发货，失败时不写入半条发货或审计记录', () => {
    const { orderService: service, fulfillmentService } = createServices()
    const product = createProduct(service, '葡萄')
    const order = service.createOrder({
      customer: { name: '小苏' },
      items: [{ productId: product.id, quantity: 10, unitPriceCents: 2_000 }]
    })

    expect(() =>
      service.createShipment(order.id, {
        shippedOn: '2026-09-07',
        items: [{ orderItemId: order.items[0].id, quantity: 1 }]
      })
    ).toThrow('待发货可用数量')

    fulfillmentService.adjustStageQuantity({
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
    expect(firstShipment.items).toEqual([
      expect.objectContaining({ orderItemId: order.items[0].id, quantity: 6 })
    ])
    expect(fulfillmentService.getOrderItemFulfillment(order.items[0].id).stages).toMatchObject({
      readyToShip: 4,
      shipped: 6
    })

    expect(() =>
      service.createShipment(order.id, {
        shippedOn: '2026-09-07',
        items: [{ orderItemId: order.items[0].id, quantity: 5 }]
      })
    ).toThrow('本次发货数量超过待发货可用数量')

    expect(service.listShipments(order.id)).toHaveLength(1)
    expect(service.listAuditLogs(order.id).map((log) => log.action)).toEqual([
      'order.created',
      'shipment.created'
    ])
  })
  it('作废批次时保留历史、恢复可发数量并记录逆向履约事件', () => {
    const { orderService: service, fulfillmentService } = createServices()
    const product = createProduct(service, '可作废发货商品')
    const order = service.createOrder({
      customer: { name: '小周' },
      items: [{ productId: product.id, quantity: 10, unitPriceCents: 2_000 }]
    })
    fulfillmentService.adjustStageQuantity({
      orderItemId: order.items[0].id,
      targetStage: 'ready_to_ship',
      quantity: 10,
      occurredOn: '2026-09-07',
      note: '待发货库存'
    })
    const shipment = service.createShipment(order.id, {
      shippedOn: '2026-09-08',
      items: [{ orderItemId: order.items[0].id, quantity: 4 }]
    })

    const voided = service.voidShipment(order.id, shipment.id, {
      voidedOn: '2026-09-09',
      reason: '物流揽收前取消'
    })

    expect(voided).toMatchObject({
      id: shipment.id,
      status: 'voided',
      voidedOn: '2026-09-09',
      voidReason: '物流揽收前取消'
    })
    expect(service.listShipments(order.id)).toEqual([
      expect.objectContaining({ id: shipment.id, status: 'voided', voidedOn: '2026-09-09' })
    ])
    expect(fulfillmentService.getOrderItemFulfillment(order.items[0].id).stages).toMatchObject({
      readyToShip: 10,
      shipped: 0
    })
    expect(() =>
      service.voidShipment(order.id, shipment.id, {
        voidedOn: '2026-09-09',
        reason: '重复操作'
      })
    ).toThrow('已作废')
    expect(
      service.createShipment(order.id, {
        shippedOn: '2026-09-10',
        items: [{ orderItemId: order.items[0].id, quantity: 10 }]
      })
    ).toMatchObject({ status: 'active' })
    expect(service.listAuditLogs(order.id).map((log) => log.action)).toContain('shipment.voided')
  })

  it('保存商品材料、成本与预计时长，并冻结到订单商品快照', () => {
    const service = createService(2, { materialPriceMicroYuanPerGram: 3_400 })
    const product = service.createProduct({
      name: '材料快照商品',
      basePriceCents: 5_000,
      packagingCostCents: 200,
      accessoryCostCents: 100,
      replacementBagCostCents: 50,
      edgeConsumableCostCents: 80,
      fixedCostCents: 120,
      standardMakingMinutes: 20,
      makingCommissionCents: 500,
      fluffingBaggingCommissionCents: 60,
      edgeSewingCommissionCents: 40,
      expectedFluffingBaggingMinutes: 10,
      expectedEdgeSewingMinutes: 8,
      expectedPackingMinutes: 5,
      unitWeightMilligrams: 20_000,
      moldCount: 20,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2
    })

    expect(product).toMatchObject({
      unitWeightMilligrams: 20_000,
      fixedCostCents: 120,
      expectedFluffingBaggingMinutes: 10,
      expectedEdgeSewingMinutes: 8,
      expectedPackingMinutes: 5,
      edgeSewingCommissionCents: 40,
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
      materialPriceMicroYuanPerGram: 3_400,
      fixedCostCents: 120,
      expectedFluffingBaggingMinutes: 10,
      expectedEdgeSewingMinutes: 8,
      expectedPackingMinutes: 5,
      edgeSewingCommissionCents: 40,
      dailyCapacity: 40
    })

    service.updateProduct({
      ...product,
      unitWeightMilligrams: 30_000,
      fixedCostCents: 999,
      expectedPackingMinutes: 30,
      moldCount: 10,
      outputPerMoldPerBatch: 2,
      maxBatchesPerDay: 3
    })

    const reloaded = service.getOrder(order.id)
    expect(reloaded?.items[0]?.productSnapshot).toMatchObject({
      unitWeightMilligrams: 20_000,
      fixedCostCents: 120,
      expectedPackingMinutes: 5,
      moldCount: 20,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2,
      dailyCapacity: 40
    })
  })

  it('拒绝超出边界的商品材料和模具产能参数', () => {
    const service = createService()
    expect(() =>
      service.createProduct({
        name: '非法商品',
        basePriceCents: 5_000,
        packagingCostCents: 200,
        accessoryCostCents: 100,
        replacementBagCostCents: 50,
        edgeConsumableCostCents: 80,
        standardMakingMinutes: 20,
        makingCommissionCents: 500,
        unitWeightMilligrams: -1,
        moldCount: 20,
        outputPerMoldPerBatch: 1,
        maxBatchesPerDay: 2
      })
    ).toThrow('单件材料重量必须是非负整数')
    expect(() =>
      service.createProduct({
        name: '非法商品',
        basePriceCents: 5_000,
        packagingCostCents: 200,
        accessoryCostCents: 100,
        replacementBagCostCents: 50,
        edgeConsumableCostCents: 80,
        standardMakingMinutes: 20,
        makingCommissionCents: 500,
        unitWeightMilligrams: 20_000,
        moldCount: 20,
        outputPerMoldPerBatch: 0,
        maxBatchesPerDay: 2
      })
    ).toThrow('每模每批产出必须是正整数')
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
    expect(() =>
      service.createOrder({
        customer: { name: '小周' },
        expectedShipDate: '2026-09-15',
        reservedDays: -1,
        items: [{ productId: product.id, quantity: 1, unitPriceCents: 2_000 }]
      })
    ).toThrow('预留天数必须是非负整数')
    expect(() =>
      service.createOrder({
        customer: { name: '小周' },
        expectedShipDate: '2026-09-15',
        orderDiscountCents: -1,
        items: [{ productId: product.id, quantity: 1, unitPriceCents: 2_000 }]
      })
    ).toThrow('订单优惠不能为负数')
  })
})
