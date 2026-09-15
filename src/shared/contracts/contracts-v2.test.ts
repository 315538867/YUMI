import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  V2CustomerInput,
  V2FulfillmentEvent,
  V2MakingReviewCorrectionInput,
  V2MakingReviewInput,
  V2OrderFundInput,
  V2ProductInput,
  V2ShipmentInput,
  V2BatchReimbursementInput,
  V2NavigationTarget,
  V2TimedWorkAssignmentCreateInput,
  V2WorkAssignmentCreateInput,
  V2WorkTimeReviewCorrectionInput,
  V2WorkTimeReviewItemInput,
  V2WorkTimeReviewInput,
  V2WorkbenchItem
} from './index'

describe('V2 共享契约', () => {
  it('批量报销输入会原样保留空选择与重复标识，交由服务层统一校验', () => {
    const emptySelection = {
      advanceFinancialEntryIds: [],
      reimbursedOn: '2026-09-08',
      paymentMethod: null,
      note: null
    } satisfies V2BatchReimbursementInput
    const duplicateSelection = {
      advanceFinancialEntryIds: ['advance-1', 'advance-1'],
      reimbursedOn: '2026-09-08',
      paymentMethod: '公账转账',
      note: '同一笔重复选择'
    } satisfies V2BatchReimbursementInput

    expect(emptySelection.advanceFinancialEntryIds).toEqual([])
    expect(duplicateSelection.advanceFinancialEntryIds).toEqual(['advance-1', 'advance-1'])
  })

  it('工作台事项携带可定位的应用导航目标，而非写入业务状态的命令', () => {
    const fulfillmentTarget = {
      view: 'fulfillment',
      orderId: 'order-1',
      orderItemId: 'item-1',
      processTaskId: 'task-1',
      focus: 'inspection'
    } satisfies V2NavigationTarget
    const settlementTarget = {
      view: 'settlements',
      settlementId: 'settlement-1',
      focus: 'refund'
    } satisfies V2NavigationTarget
    const financeTarget = {
      view: 'finance',
      financeView: 'reimbursements',
      financialEntryId: 'entry-1'
    } satisfies V2NavigationTarget

    expect(fulfillmentTarget).toMatchObject({
      view: 'fulfillment',
      processTaskId: 'task-1',
      focus: 'inspection'
    })
    expect(settlementTarget).toMatchObject({ view: 'settlements', focus: 'refund' })
    expect(financeTarget).toMatchObject({ view: 'finance', financeView: 'reimbursements' })
  })

  it('履约事件携带事件级幂等键，允许历史事件为空', () => {
    expectTypeOf<V2FulfillmentEvent>().toMatchTypeOf<{
      sourceRecordType: string | null
      sourceRecordId: string | null
      sourceEventKey: string | null
    }>()
  })

  it('订单、商品、客户、资金和发货输入只使用 V2 契约来源', () => {
    expectTypeOf<V2CustomerInput>().toMatchTypeOf<{ name: string }>()
    expectTypeOf<V2ProductInput>().toMatchTypeOf<{
      edgeConsumableCostCents: number
      makingCommissionCents: number
    }>()
    expectTypeOf<V2ProductInput>().not.toHaveProperty('makingGlueCostCents')
    expectTypeOf<V2OrderFundInput>().toMatchTypeOf<{
      businessType: 'payment' | 'refund' | 'after_sales_charge'
    }>()
    expectTypeOf<V2ShipmentInput>().toMatchTypeOf<{
      items: Array<{ orderItemId: string; quantity: number }>
    }>()
    expectTypeOf<V2BatchReimbursementInput>().toMatchTypeOf<{
      advanceFinancialEntryIds: string[]
    }>()
    expectTypeOf<V2NavigationTarget>().toMatchTypeOf<{ view: string }>()
    expectTypeOf<V2WorkbenchItem>().toMatchTypeOf<{
      id: string
      navigationTarget: V2NavigationTarget
    }>()
  })
})

describe('V2 单次核算契约', () => {
  it('工作安排创建输入按排班模式区分为制作与计时两类', () => {
    const making = {
      scheduleMode: 'making_task',
      workerId: 'worker-1',
      assignedOn: '2026-09-10',
      processType: 'making',
      tasks: [{ orderItemId: 'item-1', sourceType: 'normal_production', plannedQuantity: 20 }]
    } satisfies V2WorkAssignmentCreateInput
    const timed = {
      scheduleMode: 'timed_shift',
      workerId: 'worker-1',
      assignedOn: '2026-09-10',
      processType: 'edge_sewing',
      note: '下午补排'
    } satisfies V2WorkAssignmentCreateInput

    expectTypeOf(making).toMatchTypeOf<{ scheduleMode: 'making_task'; tasks: unknown[] }>()
    expectTypeOf<V2TimedWorkAssignmentCreateInput>().not.toHaveProperty('tasks')
    expect(timed.processType).toBe('edge_sewing')
    expect(timed.scheduleMode).toBe('timed_shift')
  })

  it('制作一次核算只接受实际产出与合格数量', () => {
    const review = {
      processTaskId: 'task-1',
      completedQuantity: 20,
      qualifiedQuantity: 18,
      reviewedOn: '2026-09-11'
    } satisfies V2MakingReviewInput
    const correction = {
      resultId: 'result-1',
      completedQuantity: 21,
      qualifiedQuantity: 20,
      reviewedOn: '2026-09-11',
      reason: '现场复核'
    } satisfies V2MakingReviewCorrectionInput

    expect(review.completedQuantity - review.qualifiedQuantity).toBe(2)
    expectTypeOf<V2MakingReviewInput>().not.toHaveProperty('unqualifiedQuantity')
    expectTypeOf<V2MakingReviewInput>().not.toHaveProperty('plannedMinutes')
    expectTypeOf(correction).toMatchTypeOf<{ resultId: string; reason: string }>()
  })

  it('计时一次核算使用单个安排与分钟精度时间范围，明细直接关联订单商品', () => {
    const input = {
      workAssignmentId: 'assignment-1',
      startedAt: '2026-09-10T09:00:00',
      endedAt: '2026-09-10T17:30:00',
      items: [{ orderItemId: 'item-1', completedQuantity: 12 }]
    } satisfies V2WorkTimeReviewInput
    const correction = {
      id: 'review-1',
      startedAt: '2026-09-10T09:00:00',
      endedAt: '2026-09-10T17:00:00',
      reason: '提前收工',
      items: [{ orderItemId: 'item-1', completedQuantity: 12 }]
    } satisfies V2WorkTimeReviewCorrectionInput

    expect(input.items[0].completedQuantity).toBe(12)
    expectTypeOf<V2WorkTimeReviewInput>().not.toHaveProperty('approvedMinutes')
    expectTypeOf<V2WorkTimeReviewInput>().not.toHaveProperty('assignmentIds')
    expectTypeOf<V2WorkTimeReviewInput>().not.toHaveProperty('workerId')
    expectTypeOf<V2WorkTimeReviewItemInput>().not.toHaveProperty('processTaskId')
    expectTypeOf(correction).toMatchTypeOf<{ id: string; reason: string }>()
  })
})
