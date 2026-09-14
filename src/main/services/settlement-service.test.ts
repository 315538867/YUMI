import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { FulfillmentService } from '@main/services/fulfillment-service'
import { SettlementService } from '@main/services/settlement-service'
import { V2OrderService } from '@main/services/v2-order-service'
import { WorkTimeReviewService } from '@main/services/work-time-review-service'

describe('SettlementService', () => {
  const databases: V2Database[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  function createFixture() {
    const database = createV2Database(':memory:')
    databases.push(database)
    const clock = { createId: () => randomUUID(), now: () => '2026-09-15T08:00:00.000Z' }
    const orderService = new V2OrderService(new V2OrderRepository(database), clock, {
      get: () => ({
        materialPriceMicroYuanPerGram: 3_400,
        orderReservedDays: 2,
        fluffingBaggingExpectedHourlyWageCents: 0,
        edgeSewingExpectedHourlyWageCents: 0,
        packingExpectedHourlyWageCents: 0,
        updatedAt: null
      })
    })
    const fulfillmentService = new FulfillmentService(new V2FulfillmentRepository(database), clock)
    const settlements = new SettlementService(database, clock)
    const reviews = new WorkTimeReviewService(database, clock)
    const worker = settlements.createWorker({
      name: '小林',
      hourlyWageCents: 3_000,
      effectiveOn: '2026-09-01'
    })
    const product = orderService.createProduct({
      name: '奶油小熊',
      basePriceCents: 6_000,
      packagingCostCents: 100,
      accessoryCostCents: 0,
      replacementBagCostCents: 0,
      edgeConsumableCostCents: 0,
      fixedCostCents: 0,
      unitWeightMilligrams: 25_000,
      standardMakingMinutes: 12,
      makingCommissionCents: 300,
      fluffingBaggingCommissionCents: 85
    })
    const order = orderService.createOrder({
      customer: { name: '小雨' },
      items: [{ productId: product.id, quantity: 30, unitPriceCents: 6_000 }]
    })
    return {
      database,
      clock,
      orderService,
      fulfillmentService,
      settlements,
      reviews,
      worker,
      orderItem: order.items[0]!
    }
  }

  /** 制作完成 22 件：20 合格进入待捏毛装袋，2 件不合格只扣材料成本。 */
  function completeMakingWithDefects(
    fulfillmentService: FulfillmentService,
    workerId: string,
    orderItemId: string,
    assignedOn = '2026-09-13'
  ) {
    const assignment = fulfillmentService.createWorkAssignment({
      workerId,
      assignedOn,
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 22 }]
    })
    const result = fulfillmentService.submitProcessResult(assignment.tasks[0]!.id, {
      completedQuantity: 22,
      submittedOn: assignedOn
    })
    fulfillmentService.confirmQualityInspection(result.id, {
      qualifiedQuantity: 20,
      unqualifiedQuantity: 2,
      inspectedOn: assignedOn
    })
    return { assignment, result }
  }

  /** 制作完成 20 件全部合格，用于已结算后更正为不合格的待退款场景。 */
  function completeMakingAllQualified(
    fulfillmentService: FulfillmentService,
    workerId: string,
    orderItemId: string
  ) {
    const assignment = fulfillmentService.createWorkAssignment({
      workerId,
      assignedOn: '2026-09-13',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 20 }]
    })
    const result = fulfillmentService.submitProcessResult(assignment.tasks[0]!.id, {
      completedQuantity: 20,
      submittedOn: '2026-09-13'
    })
    fulfillmentService.confirmQualityInspection(result.id, {
      qualifiedQuantity: 20,
      unqualifiedQuantity: 0,
      inspectedOn: '2026-09-13'
    })
    return { assignment, result }
  }

  /** 2026-09-14 完成 20 件捏毛装袋并由负责人次日核算 240 分钟。 */
  function completeFluffingWithReview(
    fulfillmentService: FulfillmentService,
    reviews: WorkTimeReviewService,
    workerId: string,
    orderItemId: string
  ) {
    const assignment = fulfillmentService.createWorkAssignment({
      workerId,
      assignedOn: '2026-09-14',
      processType: 'fluffing_bagging',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 20 }]
    })
    const draft = reviews.createDraft({
      workerId,
      workedOn: '2026-09-14',
      processType: 'fluffing_bagging',
      approvedMinutes: 240,
      assignmentIds: [assignment.id],
      items: [{ processTaskId: assignment.tasks[0]!.id, completedQuantity: 20 }]
    })
    reviews.confirm(draft.id)
    return { assignment, review: draft }
  }

  /** 完成 10 件打包发货并由负责人核算 60 分钟，用于后续期间的来源。 */
  function completePackingWithReview(
    fulfillmentService: FulfillmentService,
    reviews: WorkTimeReviewService,
    workerId: string,
    orderItemId: string,
    workedOn = '2026-09-16'
  ) {
    const assignment = fulfillmentService.createWorkAssignment({
      workerId,
      assignedOn: workedOn,
      processType: 'packing',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 10 }]
    })
    const draft = reviews.createDraft({
      workerId,
      workedOn,
      processType: 'packing',
      approvedMinutes: 60,
      assignmentIds: [assignment.id],
      items: [{ processTaskId: assignment.tasks[0]!.id, completedQuantity: 10 }]
    })
    reviews.confirm(draft.id)
    return { assignment, review: draft }
  }

  it('制作按合格提成减材料扣款、捏毛装袋按确认工时加完成提成汇总唯一候选应发', () => {
    const { fulfillmentService, settlements, reviews, worker, orderItem } = createFixture()
    completeMakingWithDefects(fulfillmentService, worker.id, orderItem.id)
    completeFluffingWithReview(fulfillmentService, reviews, worker.id, orderItem.id)

    const draft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-13',
      periodEndOn: '2026-09-14'
    })

    // 计时：240 分钟 × 3000 分/时 = 12,000 分
    // 计件：制作 20 × 300 = 6,000；捏毛装袋 20 × 85 = 1,700
    // 材料扣款：不合格 2 × (3400 微元/克 × 25000 毫克) 在整批边界 = 17 分
    expect(draft).toMatchObject({
      status: 'draft',
      timedWageCents: 12_000,
      commissionCents: 6_000 + 1_700,
      materialDeductionCents: 17,
      adjustmentCents: 0,
      candidateWageCents: 12_000 + 6_000 + 1_700 - 17,
      actualDeductionCents: 17
    })
    expect(draft.makingSources).toHaveLength(1)
    expect(draft.makingSources[0]).toMatchObject({
      occurredOn: '2026-09-13',
      qualifiedQuantity: 20,
      unqualifiedQuantity: 2,
      qualifiedCommissionCents: 6_000,
      materialDeductionCents: 17
    })
    expect(draft.timedSources).toHaveLength(1)
    expect(draft.timedSources[0]).toMatchObject({
      occurredOn: '2026-09-14',
      processType: 'fluffing_bagging',
      approvedMinutes: 240,
      hourlyWageCentsSnapshot: 3_000,
      timedWageCents: 12_000,
      commissionCents: 1_700
    })
    expect(draft.timedSources[0]!.items).toEqual([
      expect.objectContaining({ completedQuantity: 20, pieceRateCents: 85, commissionCents: 1_700 })
    ])
  })

  it('工资期间按工作日期归属，草稿工时核算不进入结算', () => {
    const { fulfillmentService, settlements, reviews, worker, orderItem } = createFixture()
    completeMakingWithDefects(fulfillmentService, worker.id, orderItem.id)
    const confirmedReview = completeFluffingWithReview(
      fulfillmentService,
      reviews,
      worker.id,
      orderItem.id
    )
    const draftAssignment = fulfillmentService.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-15',
      processType: 'packing',
      tasks: [{ orderItemId: orderItem.id, sourceType: 'normal_production', plannedQuantity: 5 }]
    })
    const draftReview = reviews.createDraft({
      workerId: worker.id,
      workedOn: '2026-09-15',
      processType: 'packing',
      approvedMinutes: 60,
      assignmentIds: [draftAssignment.id],
      items: [{ processTaskId: draftAssignment.tasks[0]!.id, completedQuantity: 5 }]
    })

    const makingOnly = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-13',
      periodEndOn: '2026-09-13'
    })
    expect(makingOnly.timedWageCents).toBe(0)
    expect(makingOnly.commissionCents).toBe(6_000)
    expect(() =>
      settlements.createDraft({
        workerId: worker.id,
        periodStartOn: '2026-09-13',
        periodEndOn: '2026-09-13'
      })
    ).toThrow('结算周期内没有可结算的已确认制作结果或工时核算')

    const timedDeposit = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-14',
      periodEndOn: '2026-09-15'
    })
    expect(timedDeposit.timedWageCents).toBe(12_000)
    expect(timedDeposit.timedSources.map((source) => source.workTimeReviewId)).toEqual([
      confirmedReview.review.id
    ])
    expect(timedDeposit.timedSources[0]!.workTimeReviewId).not.toBe(draftReview.id)
  })

  it('一条已确认工时最多进入一个有效结算', () => {
    const { fulfillmentService, settlements, reviews, worker, orderItem } = createFixture()
    completeMakingWithDefects(fulfillmentService, worker.id, orderItem.id)
    completeFluffingWithReview(fulfillmentService, reviews, worker.id, orderItem.id)
    const deposit = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-14',
      periodEndOn: '2026-09-14'
    })
    settlements.updateDraft(deposit.id, {
      finalPaidAmountCents: 12_000,
      paidOn: '2026-09-15',
      managerNote: '已发放'
    })
    settlements.confirm(deposit.id)

    expect(() =>
      settlements.createDraft({
        workerId: worker.id,
        periodStartOn: '2026-09-14',
        periodEndOn: '2026-09-14'
      })
    ).toThrow('不能重复纳入')
  })

  it('已确认结算后的制作质量更正只形成材料成本待退款，不改写历史实发', () => {
    const { database, fulfillmentService, settlements, reviews, worker, orderItem } =
      createFixture()
    const making = completeMakingAllQualified(fulfillmentService, worker.id, orderItem.id)
    const deposit = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-13',
      periodEndOn: '2026-09-13'
    })
    settlements.updateDraft(deposit.id, {
      finalPaidAmountCents: 6_000,
      paidOn: '2026-09-15',
      managerNote: '已发放'
    })
    settlements.confirm(deposit.id)

    // 复核发现 1 件不合格：历史实发不变，只形成材料成本待退款。
    database
      .prepare(
        'UPDATE quality_inspections SET qualified_quantity = 19, unqualified_quantity = 1 WHERE process_result_id = ?'
      )
      .run(making.result.id)
    completeFluffingWithReview(fulfillmentService, reviews, worker.id, orderItem.id)
    completePackingWithReview(fulfillmentService, reviews, worker.id, orderItem.id)
    settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-16',
      periodEndOn: '2026-09-16'
    })

    const pendingRefunds = settlements.listPendingRefunds(worker.id)
    expect(pendingRefunds).toHaveLength(1)
    expect(pendingRefunds[0]).toMatchObject({
      originalSettlementId: deposit.id,
      unqualifiedQuantity: 1,
      materialRefundCents: 9,
      status: 'pending'
    })
    expect(settlements.getSettlement(deposit.id)).toMatchObject({
      status: 'confirmed',
      finalPaidAmountCents: 6_000
    })

    const resolved = settlements.resolveRefund(pendingRefunds[0]!.id, {
      actualRefundCents: 9,
      refundedOn: '2026-09-16',
      managerNote: '已退回材料成本'
    })
    expect(resolved).toMatchObject({ status: 'refunded', actualRefundCents: 9 })
  })

  it('已结算工时差异在后续草稿结算中建立关联原工时的负向调整', () => {
    const { fulfillmentService, settlements, reviews, worker, orderItem } = createFixture()
    completeMakingWithDefects(fulfillmentService, worker.id, orderItem.id)
    const fluffing = completeFluffingWithReview(
      fulfillmentService,
      reviews,
      worker.id,
      orderItem.id
    )
    const firstDeposit = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-14',
      periodEndOn: '2026-09-14'
    })
    settlements.updateDraft(firstDeposit.id, {
      finalPaidAmountCents: 12_000,
      paidOn: '2026-09-15',
      managerNote: '已发放'
    })
    settlements.confirm(firstDeposit.id)

    // 后续期间：一条尚未进入结算的已确认工时，用于验证“必须先进入确认结算”的约束。
    const packing = completePackingWithReview(fulfillmentService, reviews, worker.id, orderItem.id)
    const later = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-16',
      periodEndOn: '2026-09-16'
    })
    expect(() =>
      settlements.addWorkTimeAdjustment(later.id, {
        workTimeReviewId: packing.review.id,
        correctedMinutes: 45,
        reason: '尚未结算'
      })
    ).toThrow('该工时尚未进入已确认结算')

    // 已结算工时（240 → 210 分钟，冻结时薪 3000 分/时）产生 -1,500 分调整。
    const adjusted = settlements.addWorkTimeAdjustment(later.id, {
      workTimeReviewId: fluffing.review.id,
      correctedMinutes: 210,
      reason: '时长录错',
      note: '按打卡更正'
    })
    expect(adjusted.adjustments).toHaveLength(1)
    expect(adjusted.adjustments[0]).toMatchObject({
      workTimeReviewId: fluffing.review.id,
      originalSettlementId: firstDeposit.id,
      originalMinutes: 240,
      correctedMinutes: 210,
      hourlyWageCentsSnapshot: 3_000,
      amountCents: -1_500,
      reason: '时长录错'
    })
    expect(adjusted.adjustmentCents).toBe(-1_500)
    // 本期来源：打包发货 60 分钟 × 3000 分/时 = 3,000 分；无提成。
    expect(adjusted.timedWageCents).toBe(3_000)
    expect(adjusted.candidateWageCents).toBe(3_000 - 1_500)
    expect(() =>
      settlements.addWorkTimeAdjustment(later.id, {
        workTimeReviewId: fluffing.review.id,
        correctedMinutes: 200,
        reason: '重复调整'
      })
    ).toThrow()
  })

  it('制作材料扣款按发生顺序抵扣、确认后写入财务流水且重复确认被拒绝', () => {
    const { database, fulfillmentService, settlements, worker, orderItem } = createFixture()
    completeMakingWithDefects(fulfillmentService, worker.id, orderItem.id)

    const draft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-13',
      periodEndOn: '2026-09-13'
    })
    // 材料扣款 17 分 < 候选应发 6000 分，全部本期抵扣。
    expect(draft.deductions).toHaveLength(1)
    expect(draft.deductions[0]).toMatchObject({
      materialDeductionCents: 17,
      totalDeductionCents: 17,
      occurredOn: '2026-09-13'
    })
    expect(draft.actualDeductionCents).toBe(17)
    expect(draft.candidateWageCents).toBe(6_000 - 17)

    settlements.updateDraft(draft.id, {
      finalPaidAmountCents: 5_900,
      paidOn: '2026-09-15',
      managerNote: '负责人确认实发'
    })
    const confirmed = settlements.confirm(draft.id)
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      finalPaidAmountCents: 5_900,
      paidOn: '2026-09-15'
    })
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM financial_entries WHERE source_type = 'worker_settlement'"
        )
        .get()
    ).toEqual({ count: 1 })
    expect(() => settlements.confirm(draft.id)).toThrow('只有草稿结算单可以编辑或确认')
    expect(settlements.getSettlement(draft.id)?.makingSources[0]?.status).toBe('confirmed')
  })
})
