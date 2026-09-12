import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { V2OrderService } from './v2-order-service'
import { AfterSalesService } from './after-sales-service'
import { FulfillmentService } from './fulfillment-service'

const databases: V2Database[] = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
})

describe('AfterSalesService', () => {
  it('只记录负责人填写的售后事实和核算成本，客户收费须显式关联订单资金流水', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orderService = new V2OrderService(new V2OrderRepository(database))
    const afterSales = new AfterSalesService(database)
    const product = orderService.createProduct({
      name: '奶油小熊',
      basePriceCents: 6_000,
      materialCostCents: 1_000,
      packagingCostCents: 100,
      accessoryCostCents: 0,
      replacementBagCostCents: 0,
      internalEdgeCostCents: 0,
      standardMakingMinutes: 12,
      makingCommissionCents: 300,
      makingGlueCostCents: 50
    })
    const order = orderService.createOrder({
      customer: { name: '小雨' },
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 6_000 }]
    })

    const caseRecord = afterSales.createCase({
      orderId: order.id,
      shipmentId: null,
      occurredOn: '2026-09-05',
      reasonDescription: '客户希望包装袋加封边',
      customerRequest: '换袋并加封边',
      responsibilityDescription: '客户定制需求变更',
      handlingDescription: '负责人确认后重新包装',
      status: 'processing',
      customerChargeNote: '本次免收客户费用',
      accountingCostCents: 260,
      note: '少量免费处理'
    })
    expect(caseRecord).toMatchObject({
      orderId: order.id,
      accountingCostCents: 260,
      status: 'processing'
    })
    expect(database.prepare('SELECT COUNT(*) AS count FROM financial_entries').get()).toEqual({
      count: 0
    })

    const charge = orderService.recordOrderFund(order.id, {
      businessType: 'after_sales_charge',
      amountCents: 500,
      occurredOn: '2026-09-06',
      paymentMethod: '微信',
      note: '加封边收费'
    })
    const link = afterSales.linkCharge(caseRecord.id, charge.id)
    expect(link).toMatchObject({ afterSalesCaseId: caseRecord.id, financialEntryId: charge.id })
    expect(afterSales.listCases({ orderId: order.id })[0]).toMatchObject({
      id: caseRecord.id,
      chargeFinancialEntryIds: [charge.id]
    })
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'after_sales.charge_linked'"
        )
        .get()
    ).toEqual({ count: 1 })
  })

  it('从原发货建立售后时保留批次上下文，负责人显式确认只保存售后事实，后续履约和收费仍须另行创建', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orderService = new V2OrderService(new V2OrderRepository(database))
    const fulfillment = new FulfillmentService(new V2FulfillmentRepository(database))
    const afterSales = new AfterSalesService(database)
    const product = orderService.createProduct({
      name: '海盐小熊',
      basePriceCents: 6_000,
      materialCostCents: 1_000,
      packagingCostCents: 100,
      accessoryCostCents: 0,
      replacementBagCostCents: 0,
      internalEdgeCostCents: 0,
      standardMakingMinutes: 12,
      makingCommissionCents: 300,
      makingGlueCostCents: 50
    })
    const order = orderService.createOrder({
      customer: { name: '小叶' },
      items: [{ productId: product.id, quantity: 3, unitPriceCents: 6_000 }]
    })
    const orderItemId = order.items[0].id
    fulfillment.recordOpeningWip({
      orderItemId,
      targetStage: 'ready_to_ship',
      quantity: 2,
      occurredOn: '2026-09-06',
      note: '系统启用前已完成打包'
    })
    const originalShipment = orderService.createShipment(order.id, {
      shippedOn: '2026-09-06',
      carrier: '顺丰',
      trackingNo: 'SF-ORIGINAL-001',
      items: [{ orderItemId, quantity: 2 }]
    })

    const caseRecord = afterSales.createCase({
      orderId: order.id,
      shipmentId: originalShipment.id,
      occurredOn: '2026-09-08',
      reasonDescription: '客户认为包装袋封边不足',
      customerRequest: '加封边并更换包装袋',
      responsibilityDescription: '负责人确认由工作室承担重新包装成本',
      handlingDescription: '负责人确认后另行安排重新包装',
      status: 'processing',
      customerChargeNote: '本次不向客户收费',
      accountingCostCents: 260,
      note: '少量免费处理'
    })

    expect(caseRecord).toMatchObject({
      orderId: order.id,
      shipmentId: originalShipment.id,
      status: 'processing',
      responsibilityDescription: '负责人确认由工作室承担重新包装成本'
    })
    expect(afterSales.getCase(caseRecord.id)?.shipmentId).toBe(originalShipment.id)

    const unrelatedOrder = orderService.createOrder({
      customer: { name: '小陈' },
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 6_000 }]
    })
    expect(() =>
      afterSales.createCase({
        orderId: unrelatedOrder.id,
        shipmentId: originalShipment.id,
        occurredOn: '2026-09-08',
        reasonDescription: '不应关联其他订单的发货批次',
        customerRequest: null,
        responsibilityDescription: '负责人判断',
        handlingDescription: '负责人处理',
        status: 'open',
        customerChargeNote: null,
        accountingCostCents: 0,
        note: null
      })
    ).toThrow('发货批次不存在或不属于当前订单')
    expect(afterSales.listCases({ orderId: unrelatedOrder.id })).toEqual([])

    expect(database.prepare('SELECT COUNT(*) AS count FROM process_tasks').get()).toEqual({
      count: 0
    })
    expect(database.prepare('SELECT COUNT(*) AS count FROM financial_entries').get()).toEqual({
      count: 0
    })
    expect(fulfillment.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      making: 1,
      readyToShip: 0,
      shipped: 2
    })
  })
})
