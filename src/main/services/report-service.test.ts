import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { AfterSalesService } from './after-sales-service'
import { FulfillmentService } from './fulfillment-service'
import { ReportService } from './report-service'
import { SettlementService } from './settlement-service'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { V2OrderService } from './v2-order-service'

const databases: V2Database[] = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
})

describe('V2 报表服务', () => {
  it('只根据 V2 已落库事实汇总订单核算、履约和已确认工资', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orders = new V2OrderService(new V2OrderRepository(database))
    const fulfillment = new FulfillmentService(new V2FulfillmentRepository(database))
    const settlements = new SettlementService(database)
    const afterSales = new AfterSalesService(database)
    const reports = new ReportService(database)

    const product = orders.createProduct({
      name: '草莓小熊', basePriceCents: 600, materialCostCents: 100, packagingCostCents: 20,
      accessoryCostCents: 30, replacementBagCostCents: 0, internalEdgeCostCents: 0,
      standardMakingMinutes: 10, makingCommissionCents: 40, makingGlueCostCents: 5
    })
    const order = orders.createOrder({
      customer: { name: '客户 A' },
      items: [{ productId: product.id, quantity: 2, unitPriceCents: 500 }]
    })
    orders.recordOrderFund(order.id, { businessType: 'payment', amountCents: 800, occurredOn: '2026-09-02' })
    orders.recordOrderFund(order.id, { businessType: 'refund', amountCents: 100, occurredOn: '2026-09-03' })
    afterSales.createCase({
      orderId: order.id, occurredOn: '2026-09-04', reasonDescription: '客户要求加封边',
      customerRequest: '增加封边', responsibilityDescription: '客户定制变更', handlingDescription: '负责人确认处理',
      accountingCostCents: 80, status: 'processing'
    })
    fulfillment.recordOpeningWip({
      orderItemId: order.items[0].id, targetStage: 'ready_to_ship', quantity: 1,
      occurredOn: '2026-09-05', note: 'V2 上线时已有库存'
    })

    const worker = settlements.createWorker({ name: '小林', hourlyWageCents: 2_000, effectiveOn: '2026-09-01' })
    const assignment = fulfillment.createWorkAssignment({
      workerId: worker.id, assignedOn: '2026-09-06', processType: 'making',
      tasks: [{ orderItemId: order.items[0].id, sourceType: 'normal_production', plannedQuantity: 1 }]
    })
    const result = fulfillment.submitProcessResult(assignment.tasks[0].id, {
      completedQuantity: 1, actualMinutes: 10, submittedOn: '2026-09-06'
    })
    fulfillment.confirmQualityInspection(result.id, {
      qualifiedQuantity: 1, unqualifiedQuantity: 0, inspectedOn: '2026-09-07'
    })
    const confirmedDraft = settlements.createDraft({ workerId: worker.id, periodStartOn: '2026-09-01', periodEndOn: '2026-09-07' })
    settlements.updateDraft(confirmedDraft.id, { finalPaidAmountCents: 300, paidOn: '2026-09-08', managerNote: '负责人确认实发' })
    settlements.confirm(confirmedDraft.id)
    const draftId = 'draft-settlement'
    database.prepare(`INSERT INTO worker_settlements (
      id, worker_id, period_start_on, period_end_on, status, scheduled_minutes, attendance_minutes, attendance_note,
      scheduled_reference_wage_cents, attendance_reference_wage_cents, qualified_commission_cents,
      current_deduction_cents, carried_deduction_cents, actual_deduction_cents, continuing_carryover_cents,
      other_adjustment_cents, final_paid_amount_cents, paid_on, manager_note, financial_entry_id, created_at, updated_at
    ) VALUES (?, ?, '2026-09-08', '2026-09-14', 'draft', 0, NULL, NULL, 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, NULL, NULL, ?, ?)`)
      .run(draftId, worker.id, '2026-09-08T00:00:00.000Z', '2026-09-08T00:00:00.000Z')

    expect(reports.getOrderBusiness()).toMatchObject({
      totalNetReceivedCents: 700,
      totalKnownAccountingCostCents: 180,
      totalKnownMarginCents: 520,
      rows: [expect.objectContaining({
        orderId: order.id, currentAmountCents: 1_000, netReceivedCents: 700, outstandingCents: 300,
        productCostCents: 100, afterSalesCostCents: 80, knownAccountingCostCents: 180, knownMarginCents: 520
      })]
    })
    expect(reports.getFulfillmentProgress()).toMatchObject({
      rows: [expect.objectContaining({
        orderId: order.id, orderItemId: order.items[0].id, confirmedQuantity: 2,
        stages: { making: 0, fluffingBagging: 1, packing: 0, readyToShip: 1, shipped: 0 }
      })]
    })
    expect(reports.listConfirmedSettlements()).toMatchObject({
      totalFinalPaidCents: 300,
      rows: [expect.objectContaining({ id: confirmedDraft.id, workerName: '小林', finalPaidAmountCents: 300, paidOn: '2026-09-08' })]
    })
    expect(reports.listConfirmedSettlements().rows.map((item) => item.id)).not.toContain(draftId)
    expect(reports.getMonthlyOperation('2026-09')).toMatchObject({
      incomeCents: 800,
      operatingExpenseCents: 400,
      operatingResultCents: 400,
      confirmedSettlementPaidCents: 300
    })
  })

  it('按同日履约事件的落库顺序重放，而不是按随机标识排序', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orders = new V2OrderService(new V2OrderRepository(database))
    const reports = new ReportService(database)
    const product = orders.createProduct({
      name: '同日流转测试产品', basePriceCents: 100, materialCostCents: 10, packagingCostCents: 5,
      accessoryCostCents: 0, replacementBagCostCents: 0, internalEdgeCostCents: 0,
      standardMakingMinutes: 10, makingCommissionCents: 10, makingGlueCostCents: 0
    })
    const order = orders.createOrder({
      customer: { name: '客户 B' },
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 100 }]
    })
    const itemId = order.items[0].id
    const insertEvent = database.prepare(`INSERT INTO fulfillment_events (
      id, order_item_id, event_type, quantity, source_stage, target_stage,
      source_record_type, source_record_id, occurred_on, note, created_at
    ) VALUES (?, ?, ?, 1, ?, ?, NULL, NULL, '2026-09-05', NULL, '2026-09-08T00:00:00.000Z')`)
    insertEvent.run('z-making-first', itemId, 'making_qualified', 'making', 'fluffing_bagging')
    insertEvent.run('a-fluffing-second', itemId, 'fluffing_bagging_qualified', 'fluffing_bagging', 'packing')
    insertEvent.run('b-packing-third', itemId, 'packing_completed', 'packing', 'ready_to_ship')

    expect(reports.getFulfillmentProgress().rows).toEqual([
      expect.objectContaining({
        orderItemId: itemId,
        stages: { making: 0, fluffingBagging: 0, packing: 0, readyToShip: 1, shipped: 0 }
      })
    ])
  })

  it('按指定发货批次导出时保留创建当时的订单、客户和数量快照', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orderRepository = new V2OrderRepository(database)
    const orders = new V2OrderService(orderRepository)
    const fulfillment = new FulfillmentService(new V2FulfillmentRepository(database))
    const reports = new ReportService(database)
    const product = orders.createProduct({
      name: '快照云朵', basePriceCents: 1_000, materialCostCents: 100, packagingCostCents: 20,
      accessoryCostCents: 0, replacementBagCostCents: 0, internalEdgeCostCents: 0,
      standardMakingMinutes: 10, makingCommissionCents: 20, makingGlueCostCents: 0
    })
    const order = orders.createOrder({
      customer: { name: '小雨', contact: '微信 yumi', defaultAddress: '上海市静安区' },
      expectedShipDate: '2026-09-12',
      items: [{ productId: product.id, quantity: 3, unitPriceCents: 1_000 }]
    })
    fulfillment.recordOpeningWip({
      orderItemId: order.items[0].id, targetStage: 'ready_to_ship', quantity: 3,
      occurredOn: '2026-09-08', note: '可发货'
    })
    const firstShipment = orders.createShipment(order.id, {
      shippedOn: '2026-09-08', carrier: '顺丰', trackingNumber: 'SF-001',
      items: [{ orderItemId: order.items[0].id, quantity: 1 }]
    })
    orders.createShipment(order.id, {
      shippedOn: '2026-09-09', carrier: '京东', trackingNumber: 'JD-002',
      items: [{ orderItemId: order.items[0].id, quantity: 2 }]
    })

    expect(reports.getShippingList({ shipmentId: firstShipment.id })).toEqual([
      expect.objectContaining({
        orderCode: order.code,
        customerName: '小雨',
        customerContact: '微信 yumi',
        customerAddress: '上海市静安区',
        productName: '快照云朵',
        orderedQuantity: 3,
        thisShipmentQuantity: 1,
        shippedQuantity: 1,
        remainingQuantity: 2,
        latestShippedOn: '2026-09-08',
        carrier: '顺丰',
        trackingNumber: 'SF-001'
      })
    ])
  })
})

describe('订单与发货单导出事实', () => {
  it('从订单快照生成金额、订单级缝边和全量发货行，而不暴露初始确认金额', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orders = new V2OrderService(new V2OrderRepository(database))
    const fulfillment = new FulfillmentService(new V2FulfillmentRepository(database))
    const reports = new ReportService(database)
    const product = orders.createProduct({
      name: '导出云朵', basePriceCents: 1_990, materialCostCents: 100, packagingCostCents: 0,
      accessoryCostCents: 0, replacementBagCostCents: 0, internalEdgeCostCents: 0,
      standardMakingMinutes: 10, makingCommissionCents: 0, makingGlueCostCents: 0,
      imageAttachmentId: 'image-1', notes: '奶油白'
    })
    const order = orders.createOrder({
      customer: { name: '小雨', contact: '微信 yumi', defaultAddress: '上海市静安区' },
      expectedShipDate: '2026-09-12', orderDiscountCents: 100, notes: '礼品包装',
      items: [{
        productId: product.id, quantity: 2, unitPriceCents: 1_990, itemDiscountCents: 180,
        edge: { enabled: true, quantity: 2, unitPriceCents: 300 }
      }]
    })
    fulfillment.recordOpeningWip({
      orderItemId: order.items[0].id, targetStage: 'ready_to_ship', quantity: 2,
      occurredOn: '2026-09-09', note: '可发货'
    })
    const shipment = orders.createShipment(order.id, {
      shippedOn: '2026-09-09', carrier: '顺丰', trackingNumber: 'SF-001',
      items: [{ orderItemId: order.items[0].id, quantity: 1 }]
    })

    expect(reports.getOrderTableDocuments({ orderId: order.id })).toEqual([
      expect.objectContaining({
        orderCode: order.code, customerName: '小雨', customerContact: '微信 yumi', customerAddress: '上海市静安区',
        totals: expect.objectContaining({
          itemAmountCents: 3_980, edgeAmountCents: 600, itemDiscountCents: 180,
          orderDiscountCents: 100, orderAmountCents: 4_300
        }),
        items: [expect.objectContaining({
          productName: '导出云朵', imageAttachmentId: 'image-1', notes: '奶油白',
          edgeEnabled: true, edgeQuantity: 2, edgeUnitPriceCents: 300, edgeAmountCents: 600,
          itemDiscountCents: 180, lineAmountCents: 4_400
        })]
      })
    ])
    expect(reports.getShippingListDocuments({ orderId: order.id, shipmentId: shipment.id })).toEqual([
      expect.objectContaining({
        orderCode: order.code, customerName: '小雨', shippedOn: '2026-09-09', carrier: '顺丰', trackingNumber: 'SF-001',
        items: [expect.objectContaining({
          productName: '导出云朵', imageAttachmentId: 'image-1', notes: '奶油白',
          orderedQuantity: 2, thisShipmentQuantity: 1, shippedQuantity: 1, remainingQuantity: 1
        })]
      })
    ])
  })

  it('按客户隔离订单历史和资金统计，并保留订单详情深链标识', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orders = new V2OrderService(new V2OrderRepository(database))
    const reports = new ReportService(database)
    const product = orders.createProduct({
      name: '客户统计产品', basePriceCents: 1_000, materialCostCents: 0, packagingCostCents: 0,
      accessoryCostCents: 0, replacementBagCostCents: 0, internalEdgeCostCents: 0,
      standardMakingMinutes: 10, makingCommissionCents: 0, makingGlueCostCents: 0
    })
    const customerA = orders.createCustomer({ name: '客户 A' })
    const customerB = orders.createCustomer({ name: '客户 B' })
    const orderA = orders.createOrder({
      customerId: customerA.id, customer: { name: '不会写入快照的客户' },
      items: [{ productId: product.id, quantity: 2, unitPriceCents: 500 }]
    })
    orders.createOrder({
      customerId: customerB.id, customer: { name: '不会写入快照的客户' },
      items: [{ productId: product.id, quantity: 3, unitPriceCents: 400 }]
    })
    orders.recordOrderFund(orderA.id, { businessType: 'payment', amountCents: 700, occurredOn: '2026-09-08' })
    orders.recordOrderFund(orderA.id, { businessType: 'refund', amountCents: 200, occurredOn: '2026-09-09' })

    expect(reports.getCustomerOrderInsights(customerA.id)).toEqual(expect.objectContaining({
      customerId: customerA.id,
      customerName: '客户 A',
      orderCount: 1,
      totalCurrentAmountCents: 1_000,
      totalNetReceivedCents: 500,
      totalOutstandingCents: 500,
      latestOrderDate: orderA.createdAt.slice(0, 10),
      orders: [expect.objectContaining({
        orderId: orderA.id,
        orderCode: orderA.code,
        currentAmountCents: 1_000,
        netReceivedCents: 500,
        outstandingCents: 500,
        shipmentStatus: '未发货',
        orderStatus: '履约中'
      })]
    }))
    expect(reports.getCustomerOrderInsights(customerA.id).orders).toHaveLength(1)
    expect(reports.listCustomerOrderInsights().map((item) => item.customerId)).toEqual(
      expect.arrayContaining([customerA.id, customerB.id])
    )
  })

})

// 产能与交期风险使用订单、排产和履约三类已落库事实；不依赖页面派生状态。
describe('V2 产能与交期风险报表', () => {
  it('按商品和周期汇总未完成需求、有效日产能与已排产数量，并识别产能缺口', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orders = new V2OrderService(new V2OrderRepository(database))
    const fulfillment = new FulfillmentService(new V2FulfillmentRepository(database))
    const settlements = new SettlementService(database)
    const reports = new ReportService(database)
    const product = orders.createProduct({
      name: '产能风险产品', basePriceCents: 1_000, materialCostCents: 0, packagingCostCents: 0,
      accessoryCostCents: 0, replacementBagCostCents: 0, internalEdgeCostCents: 0,
      standardMakingMinutes: 10, makingCommissionCents: 0, makingGlueCostCents: 0,
      unitWeightMilligrams: 100, materialLossRateBasisPoints: 0,
      moldCount: 1, outputPerMoldPerBatch: 10, maxBatchesPerDay: 1
    })
    const order = orders.createOrder({
      customer: { name: '产能客户' }, expectedShipDate: '2026-09-12', reservedDays: 1,
      items: [{ productId: product.id, quantity: 40, unitPriceCents: 1_000 }]
    })
    const worker = settlements.createWorker({ name: '排产兼职', hourlyWageCents: 2_000, effectiveOn: '2026-09-09' })
    fulfillment.createWorkAssignment({
      workerId: worker.id, assignedOn: '2026-09-11', processType: 'making',
      tasks: [{ orderItemId: order.items[0].id, sourceType: 'normal_production', plannedQuantity: 8 }]
    })
    const cancelledAssignment = fulfillment.createWorkAssignment({
      workerId: worker.id, assignedOn: '2026-09-11', processType: 'making',
      tasks: [{ orderItemId: order.items[0].id, sourceType: 'normal_production', plannedQuantity: 30 }]
    })
    database.prepare("UPDATE process_tasks SET status = 'cancelled' WHERE work_assignment_id = ?")
      .run(cancelledAssignment.id)

    expect(reports.getCapacityRiskReport({
      startOn: '2026-09-10', endOn: '2026-09-12', utilizationWarningBasisPoints: 8_000
    }).rows).toEqual([
      expect.objectContaining({
        productId: product.id,
        productName: '产能风险产品',
        demandQuantity: 40,
        scheduledQuantity: 8,
        dailyCapacity: 10,
        availableCapacityQuantity: 30,
        gapQuantity: 10,
        utilizationBasisPoints: 13_334,
        level: 'critical',
        riskSources: expect.arrayContaining(['订单需求超过周期产能'])
      })
    ])
  })

  it('按制作截止日期和未完成履约数量识别交期风险，保留订单深链并排除已完成订单', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orders = new V2OrderService(new V2OrderRepository(database))
    const fulfillment = new FulfillmentService(new V2FulfillmentRepository(database))
    const reports = new ReportService(database)
    const product = orders.createProduct({
      name: '交期风险产品', basePriceCents: 1_000, materialCostCents: 0, packagingCostCents: 0,
      accessoryCostCents: 0, replacementBagCostCents: 0, internalEdgeCostCents: 0,
      standardMakingMinutes: 10, makingCommissionCents: 0, makingGlueCostCents: 0
    })
    const overdue = orders.createOrder({
      customer: { name: '逾期客户' }, expectedShipDate: '2026-09-10', reservedDays: 2,
      items: [{ productId: product.id, quantity: 3, unitPriceCents: 1_000 }]
    })
    const warning = orders.createOrder({
      customer: { name: '预警客户' }, expectedShipDate: '2026-09-12', reservedDays: 1,
      items: [{ productId: product.id, quantity: 2, unitPriceCents: 1_000 }]
    })
    const noDate = orders.createOrder({
      customer: { name: '缺日期客户' },
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 1_000 }]
    })
    const completed = orders.createOrder({
      customer: { name: '已完成客户' }, expectedShipDate: '2026-09-10', reservedDays: 2,
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 1_000 }]
    })
    fulfillment.recordOpeningWip({
      orderItemId: completed.items[0].id, targetStage: 'ready_to_ship', quantity: 1,
      occurredOn: '2026-09-08', note: '已制作完成'
    })
    orders.createShipment(completed.id, {
      shippedOn: '2026-09-08', items: [{ orderItemId: completed.items[0].id, quantity: 1 }]
    })

    const rows = reports.getDeliveryRiskReport({ asOf: '2026-09-09', warningDays: 2 }).rows
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        orderId: overdue.id,
        productionDeadline: '2026-09-08',
        remainingQuantity: 3,
        level: 'critical',
        fulfillmentRoute: { orderId: overdue.id }
      }),
      expect.objectContaining({
        orderId: warning.id,
        productionDeadline: '2026-09-11',
        remainingQuantity: 2,
        level: 'warning'
      }),
      expect.objectContaining({
        orderId: noDate.id,
        expectedShipDate: null,
        productionDeadline: null,
        remainingQuantity: 1,
        level: 'unplanned',
        riskSources: expect.arrayContaining(['缺少预计发货日期'])
      })
    ]))
    expect(rows.map((row) => row.orderId)).not.toContain(completed.id)
  })
})
