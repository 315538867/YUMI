import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { FulfillmentService } from './fulfillment-service'
import { SettlementService } from './settlement-service'
import { V2OrderService } from './v2-order-service'

const databases: V2Database[] = []

afterEach(() => databases.splice(0).forEach((database) => database.close()))

describe('SettlementService', () => {
  it('从已确认任务与不合格质检创建工资草稿，填写考勤和最终实发后确认任务及扣款归属', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orderService = new V2OrderService(new V2OrderRepository(database))
    const fulfillmentService = new FulfillmentService(new V2FulfillmentRepository(database))
    const settlementService = new SettlementService(database)
    const worker = settlementService.createWorker({
      name: '小林',
      hourlyWageCents: 2_000,
      effectiveOn: '2026-09-01'
    })
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
      items: [{ productId: product.id, quantity: 3, unitPriceCents: 6_000 }]
    })
    const assignment = fulfillmentService.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-07',
      processType: 'making',
      tasks: [
        { orderItemId: order.items[0].id, sourceType: 'normal_production', plannedQuantity: 3 }
      ]
    })
    const result = fulfillmentService.submitProcessResult(assignment.tasks[0].id, {
      completedQuantity: 3,
      submittedOn: '2026-09-07'
    })
    fulfillmentService.confirmQualityInspection(result.id, {
      qualifiedQuantity: 2,
      unqualifiedQuantity: 1,
      inspectedOn: '2026-09-08'
    })

    const beforeInspectionDraft = settlementService.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-07',
      periodEndOn: '2026-09-07'
    })
    expect(beforeInspectionDraft).toMatchObject({
      currentDeductionCents: 0,
      actualDeductionCents: 0
    })
    expect(beforeInspectionDraft.deductionAllocations).toHaveLength(0)

    const draft = settlementService.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-07',
      periodEndOn: '2026-09-08'
    })
    expect(draft).toMatchObject({
      status: 'draft',
      scheduledMinutes: 36,
      qualifiedCommissionCents: 600,
      currentDeductionCents: 700,
      actualDeductionCents: 700,
      scheduledReferenceWageCents: 1_100,
      continuingCarryoverCents: 0
    })
    expect(draft.tasks).toHaveLength(1)
    expect(draft.deductions).toHaveLength(1)
    expect(draft.deductions[0]).toMatchObject({
      occurredOn: '2026-09-08',
      totalDeductionCents: 700
    })

    settlementService.updateDraft(draft.id, {
      finalPaidAmountCents: 0,
      paidOn: '2026-09-09'
    })
    expect(() => settlementService.confirm(draft.id)).toThrow('最终实发金额必须大于零')
    expect(database.prepare('SELECT COUNT(*) AS count FROM financial_entries').get()).toEqual({
      count: 0
    })

    const updated = settlementService.updateDraft(draft.id, {
      attendanceMinutes: 60,
      attendanceNote: '打卡汇总',
      actualDeductionCents: 500,
      finalPaidAmountCents: 1_800,
      paidOn: '2026-09-09',
      managerNote: '负责人确认'
    })
    expect(updated).toMatchObject({
      attendanceReferenceWageCents: 2_100,
      actualDeductionCents: 500,
      continuingCarryoverCents: 200
    })
    expect(updated.deductionAllocations).toHaveLength(1)
    expect(updated.deductionAllocations[0].allocatedCents).toBe(500)

    const confirmed = settlementService.confirm(draft.id)
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      finalPaidAmountCents: 1_800,
      paidOn: '2026-09-09',
      scheduledReferenceWageCents: 1_300,
      attendanceReferenceWageCents: 2_100,
      actualDeductionCents: 500,
      continuingCarryoverCents: 200
    })
    expect(confirmed.financialEntryId).toEqual(expect.any(String))
    expect(
      database
        .prepare(
          `
      SELECT id, source_type, direction, business_type, amount_cents, occurred_on, order_id, note
      FROM financial_entries
    `
        )
        .all()
    ).toEqual([
      {
        id: confirmed.financialEntryId,
        source_type: 'worker_settlement',
        direction: 'expense',
        business_type: 'wage_payment',
        amount_cents: 1_800,
        occurred_on: '2026-09-09',
        order_id: null,
        note: '负责人确认'
      }
    ])
    expect(() => settlementService.confirm(draft.id)).toThrow('只有草稿结算单可以编辑或确认')
    expect(
      database.prepare('SELECT remaining_cents, status FROM worker_deduction_balances').all()
    ).toEqual([{ remaining_cents: 200, status: 'open' }])
    expect(settlementService.listWorkers()).toMatchObject([{ id: worker.id, name: '小林' }])
    expect(settlementService.listWageHistory(worker.id)).toMatchObject([{ hourlyWageCents: 2_000 }])
    expect(settlementService.listSettlements({ workerId: worker.id })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: draft.id, status: 'confirmed' })])
    )
    expect(() =>
      settlementService.createDraft({
        workerId: worker.id,
        periodStartOn: '2026-09-07',
        periodEndOn: '2026-09-08'
      })
    ).toThrow('已确认结算')
  })

  it('结算捏毛装袋时始终使用任务冻结的计件提成，不受商品后续改价影响', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orders = new V2OrderService(new V2OrderRepository(database))
    const fulfillment = new FulfillmentService(new V2FulfillmentRepository(database))
    const settlements = new SettlementService(database)
    const worker = settlements.createWorker({
      name: '小夏',
      hourlyWageCents: 2_000,
      effectiveOn: '2026-09-01'
    })
    const product = orders.createProduct({
      name: '捏毛提成冻结商品',
      basePriceCents: 6_000,
      materialCostCents: 1_000,
      packagingCostCents: 100,
      accessoryCostCents: 0,
      replacementBagCostCents: 0,
      internalEdgeCostCents: 0,
      standardMakingMinutes: 12,
      makingCommissionCents: 300,
      makingGlueCostCents: 50,
      fluffingBaggingCommissionCents: 85
    })
    const order = orders.createOrder({
      customer: { name: '小雨' },
      items: [{ productId: product.id, quantity: 2, unitPriceCents: 6_000 }]
    })
    const assignment = fulfillment.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-07',
      processType: 'fluffing_bagging',
      tasks: [
        {
          orderItemId: order.items[0].id,
          sourceType: 'normal_production',
          plannedQuantity: 2,
          plannedMinutes: 20
        }
      ]
    })
    expect(assignment.tasks[0].pieceRateCents).toBe(85)
    fulfillment.recordOpeningWip({
      orderItemId: order.items[0].id,
      targetStage: 'fluffing_bagging',
      quantity: 2,
      occurredOn: '2026-09-07'
    })

    orders.updateProduct({ ...product, fluffingBaggingCommissionCents: 120 })
    const result = fulfillment.submitProcessResult(assignment.tasks[0].id, {
      completedQuantity: 2,
      submittedOn: '2026-09-07'
    })
    fulfillment.confirmQualityInspection(result.id, {
      qualifiedQuantity: 2,
      unqualifiedQuantity: 0,
      inspectedOn: '2026-09-07'
    })

    const draft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-07',
      periodEndOn: '2026-09-07'
    })
    expect(draft.tasks).toMatchObject([{ qualifiedCommissionCents: 170 }])
    expect(draft.qualifiedCommissionCents).toBe(170)
  })

  it('分别汇总制作、捏毛装袋、打包和发货任务，参考工资只按单一口径计算且捏毛不合格不扣胶水', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orderService = new V2OrderService(new V2OrderRepository(database))
    const fulfillmentService = new FulfillmentService(new V2FulfillmentRepository(database))
    const settlementService = new SettlementService(database)
    const worker = settlementService.createWorker({
      name: '小夏',
      hourlyWageCents: 2_000,
      effectiveOn: '2026-09-01'
    })
    const product = orderService.createProduct({
      name: '栗子小熊',
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
      items: [{ productId: product.id, quantity: 2, unitPriceCents: 6_000 }]
    })
    const orderItemId = order.items[0].id

    const making = fulfillmentService.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-07',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 2, extraMinutes: 6 }]
    })
    const makingResult = fulfillmentService.submitProcessResult(making.tasks[0].id, {
      completedQuantity: 2,
      submittedOn: '2026-09-07'
    })
    fulfillmentService.confirmQualityInspection(makingResult.id, {
      qualifiedQuantity: 1,
      unqualifiedQuantity: 1,
      inspectedOn: '2026-09-07'
    })

    const rework = fulfillmentService.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-07',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'rework', plannedQuantity: 1 }]
    })
    const reworkResult = fulfillmentService.submitProcessResult(rework.tasks[0].id, {
      completedQuantity: 1,
      submittedOn: '2026-09-07'
    })
    fulfillmentService.confirmQualityInspection(reworkResult.id, {
      qualifiedQuantity: 1,
      unqualifiedQuantity: 0,
      inspectedOn: '2026-09-07'
    })

    const fluffing = fulfillmentService.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-07',
      processType: 'fluffing_bagging',
      tasks: [
        {
          orderItemId,
          sourceType: 'normal_production',
          plannedQuantity: 2,
          plannedMinutes: 20,
          pieceRateCents: 100
        }
      ]
    })
    const fluffingResult = fulfillmentService.submitProcessResult(fluffing.tasks[0].id, {
      completedQuantity: 2,
      submittedOn: '2026-09-07'
    })
    fulfillmentService.confirmQualityInspection(fluffingResult.id, {
      qualifiedQuantity: 1,
      unqualifiedQuantity: 1,
      inspectedOn: '2026-09-07'
    })

    const packing = fulfillmentService.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-07',
      processType: 'packing',
      tasks: [
        { orderItemId, sourceType: 'normal_production', plannedQuantity: 1, plannedMinutes: 10 }
      ]
    })
    fulfillmentService.submitProcessResult(packing.tasks[0].id, {
      completedQuantity: 1,
      submittedOn: '2026-09-07'
    })

    const shipping = fulfillmentService.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-07',
      processType: 'shipping',
      tasks: [
        { orderItemId, sourceType: 'normal_production', plannedQuantity: 1, plannedMinutes: 15 }
      ]
    })
    fulfillmentService.submitProcessResult(shipping.tasks[0].id, {
      completedQuantity: 1,
      submittedOn: '2026-09-07'
    })

    const draft = settlementService.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-07',
      periodEndOn: '2026-09-07',
      attendanceMinutes: 90
    })

    expect(draft.tasks).toHaveLength(5)
    expect(draft.scheduledMinutes).toBe(87)
    expect(draft.qualifiedCommissionCents).toBe(700)
    expect(draft.deductions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          commissionDeductionCents: 300,
          wageDeductionCents: 400,
          glueDeductionCents: 0,
          totalDeductionCents: 700
        }),
        expect.objectContaining({
          commissionDeductionCents: 100,
          wageDeductionCents: 333,
          glueDeductionCents: 0,
          totalDeductionCents: 433
        })
      ])
    )
    expect(draft.scheduledReferenceWageCents).toBe(2_467)
    expect(draft.attendanceReferenceWageCents).toBe(2_567)
    expect(draft.attendanceReferenceWageCents).not.toBe(
      draft.scheduledReferenceWageCents + draft.attendanceReferenceWageCents
    )
  })

  it('已确认工资在后续发现制作不合格时保留历史实发并转为待退款，负责人可登记退款结果', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orderService = new V2OrderService(new V2OrderRepository(database))
    const fulfillmentService = new FulfillmentService(new V2FulfillmentRepository(database))
    const settlementService = new SettlementService(database)
    const worker = settlementService.createWorker({
      name: '小林',
      hourlyWageCents: 2_000,
      effectiveOn: '2026-09-01'
    })
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
      items: [{ productId: product.id, quantity: 3, unitPriceCents: 6_000 }]
    })
    const makingAssignment = fulfillmentService.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-07',
      processType: 'making',
      tasks: [
        { orderItemId: order.items[0].id, sourceType: 'normal_production', plannedQuantity: 3 }
      ]
    })
    const makingResult = fulfillmentService.submitProcessResult(makingAssignment.tasks[0].id, {
      completedQuantity: 3,
      submittedOn: '2026-09-07'
    })
    fulfillmentService.confirmQualityInspection(makingResult.id, {
      qualifiedQuantity: 3,
      unqualifiedQuantity: 0,
      inspectedOn: '2026-09-08'
    })
    const settled = settlementService.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-07',
      periodEndOn: '2026-09-08'
    })
    settlementService.updateDraft(settled.id, {
      finalPaidAmountCents: 1_800,
      paidOn: '2026-09-09',
      managerNote: '已实际发放'
    })
    const confirmed = settlementService.confirm(settled.id)

    // 模拟付款后复核发现制作不合格：历史工资不允许回写。
    database
      .prepare(
        'UPDATE quality_inspections SET qualified_quantity = 2, unqualified_quantity = 1, inspected_on = ? WHERE process_result_id = ?'
      )
      .run('2026-09-10', makingResult.id)
    const shippingAssignment = fulfillmentService.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'shipping',
      tasks: [
        {
          orderItemId: order.items[0].id,
          sourceType: 'normal_production',
          plannedQuantity: 1,
          plannedMinutes: 30
        }
      ]
    })
    fulfillmentService.submitProcessResult(shippingAssignment.tasks[0].id, {
      completedQuantity: 1,
      submittedOn: '2026-09-10'
    })
    settlementService.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-10',
      periodEndOn: '2026-09-10'
    })

    const pendingRefunds = settlementService.listPendingRefunds(worker.id)
    expect(pendingRefunds).toEqual([
      expect.objectContaining({
        workerId: worker.id,
        originalSettlementId: confirmed.id,
        requestedRefundCents: 700,
        status: 'pending',
        actualRefundCents: null,
        refundedOn: null
      })
    ])
    expect(settlementService.getSettlement(confirmed.id)).toMatchObject({
      status: 'confirmed',
      finalPaidAmountCents: 1_800,
      paidOn: '2026-09-09'
    })

    const resolved = settlementService.resolveRefund(pendingRefunds[0].id, {
      actualRefundCents: 700,
      refundedOn: '2026-09-11',
      managerNote: '已退回'
    })
    expect(resolved).toMatchObject({
      status: 'refunded',
      actualRefundCents: 700,
      refundedOn: '2026-09-11',
      managerNote: '已退回'
    })
    expect(settlementService.listPendingRefunds(worker.id)).toEqual([])
    expect(() =>
      settlementService.resolveRefund(resolved.id, {
        actualRefundCents: 700,
        refundedOn: '2026-09-11'
      })
    ).toThrow('只有待退款记录可以处理')
  })
})
