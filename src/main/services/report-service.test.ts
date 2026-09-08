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
      accessoryCostCents: 30, replacementBagCostCents: 0, edgeCostCents: 0,
      standardMakingMinutes: 10, makingCommissionCents: 40, makingGlueCostCents: 5
    })
    const order = orders.createOrder({
      customer: { name: '客户 A' }, initialConfirmedAmountCents: 1_000,
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
      totalKnownAccountingCostCents: 380,
      totalKnownMarginCents: 320,
      rows: [expect.objectContaining({
        orderId: order.id, currentAmountCents: 1_000, netReceivedCents: 700, outstandingCents: 300,
        productCostCents: 300, afterSalesCostCents: 80, knownAccountingCostCents: 380, knownMarginCents: 320
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
  })
})
