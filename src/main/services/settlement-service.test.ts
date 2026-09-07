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
      name: '小林', hourlyWageCents: 2_000, effectiveOn: '2026-09-01'
    })
    const product = orderService.createProduct({
      name: '奶油小熊', basePriceCents: 6_000, materialCostCents: 1_000,
      packagingCostCents: 100, accessoryCostCents: 0, replacementBagCostCents: 0,
      edgeCostCents: 0, standardMakingMinutes: 12, makingCommissionCents: 300,
      makingGlueCostCents: 50
    })
    const order = orderService.createOrder({
      customer: { name: '小雨' },
      items: [{ productId: product.id, quantity: 3, unitPriceCents: 6_000 }],
      initialConfirmedAmountCents: 18_000
    })
    const assignment = fulfillmentService.createWorkAssignment({
      workerId: worker.id, assignedOn: '2026-09-07', processType: 'making',
      tasks: [{ orderItemId: order.items[0].id, sourceType: 'normal_production', plannedQuantity: 3 }]
    })
    const result = fulfillmentService.submitProcessResult(assignment.tasks[0].id, {
      completedQuantity: 3, submittedOn: '2026-09-07'
    })
    fulfillmentService.confirmQualityInspection(result.id, {
      qualifiedQuantity: 2, unqualifiedQuantity: 1, inspectedOn: '2026-09-08'
    })

    const beforeInspectionDraft = settlementService.createDraft({
      workerId: worker.id, periodStartOn: '2026-09-07', periodEndOn: '2026-09-07'
    })
    expect(beforeInspectionDraft).toMatchObject({ currentDeductionCents: 0, actualDeductionCents: 0 })
    expect(beforeInspectionDraft.deductionAllocations).toHaveLength(0)

    const draft = settlementService.createDraft({
      workerId: worker.id, periodStartOn: '2026-09-07', periodEndOn: '2026-09-08'
    })
    expect(draft).toMatchObject({
      status: 'draft', scheduledMinutes: 36, qualifiedCommissionCents: 600,
      currentDeductionCents: 750, actualDeductionCents: 750,
      scheduledReferenceWageCents: 1_050, continuingCarryoverCents: 0
    })
    expect(draft.tasks).toHaveLength(1)
    expect(draft.deductions).toHaveLength(1)
    expect(draft.deductions[0]).toMatchObject({ occurredOn: '2026-09-08', totalDeductionCents: 750 })

    settlementService.updateDraft(draft.id, {
      finalPaidAmountCents: 0, paidOn: '2026-09-09'
    })
    expect(() => settlementService.confirm(draft.id)).toThrow('最终实发金额必须大于零')
    expect(database.prepare('SELECT COUNT(*) AS count FROM financial_entries').get()).toEqual({ count: 0 })

    const updated = settlementService.updateDraft(draft.id, {
      attendanceMinutes: 60, attendanceNote: '打卡汇总', actualDeductionCents: 500, finalPaidAmountCents: 1_800,
      paidOn: '2026-09-09', managerNote: '负责人确认'
    })
    expect(updated).toMatchObject({ attendanceReferenceWageCents: 2_100, actualDeductionCents: 500, continuingCarryoverCents: 250 })
    expect(updated.deductionAllocations).toHaveLength(1)
    expect(updated.deductionAllocations[0].allocatedCents).toBe(500)

    const confirmed = settlementService.confirm(draft.id)
    expect(confirmed).toMatchObject({
      status: 'confirmed', finalPaidAmountCents: 1_800, paidOn: '2026-09-09',
      scheduledReferenceWageCents: 1_300, attendanceReferenceWageCents: 2_100,
      actualDeductionCents: 500, continuingCarryoverCents: 250
    })
    expect(confirmed.financialEntryId).toEqual(expect.any(String))
    expect(database.prepare(`
      SELECT id, source_type, direction, business_type, amount_cents, occurred_on, order_id, note
      FROM financial_entries
    `).all()).toEqual([{
      id: confirmed.financialEntryId, source_type: 'worker_settlement', direction: 'expense',
      business_type: 'wage_payment', amount_cents: 1_800, occurred_on: '2026-09-09',
      order_id: null, note: '负责人确认'
    }])
    expect(() => settlementService.confirm(draft.id)).toThrow('只有草稿结算单可以编辑或确认')
    expect(database.prepare('SELECT remaining_cents, status FROM worker_deduction_balances').all()).toEqual([
      { remaining_cents: 250, status: 'open' }
    ])
    expect(settlementService.listWorkers()).toMatchObject([{ id: worker.id, name: '小林' }])
    expect(settlementService.listWageHistory(worker.id)).toMatchObject([{ hourlyWageCents: 2_000 }])
    expect(settlementService.listSettlements({ workerId: worker.id })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: draft.id, status: 'confirmed' })
    ]))
    expect(() => settlementService.createDraft({
      workerId: worker.id, periodStartOn: '2026-09-07', periodEndOn: '2026-09-08'
    })).toThrow('已确认结算')
  })
})
