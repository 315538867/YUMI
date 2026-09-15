import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  calculateMakingMaterialDeductionCents,
  calculateQualifiedCommissionCents,
  calculateTimedWageCents
} from '@main/domain/settlement'
import type { FulfillmentService } from '@main/services/fulfillment-service'
import { calculateWorkTimeComparison } from '@shared/calculations'
import type { V2TimedProcessType } from '@shared/contracts/fulfillment'
import { V2ApplicationRuntime } from './v2-runtime'

const runtimes: V2ApplicationRuntime[] = []

afterEach(() => {
  runtimes.splice(0).forEach((runtime) => runtime.close())
})

/** 建立一条完整链路所需的商品、订单、人员和工作室参数。 */
async function createFixture() {
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'yumi-v2-payroll-e2e-'))
  const runtime = new V2ApplicationRuntime(userDataDirectory, '2.0.0')
  runtimes.push(runtime)
  runtime.start()
  const orders = runtime.orderService
  const fulfillment = runtime.fulfillmentService
  const settlements = runtime.settlementService
  const reviews = runtime.workTimeReviewService
  const reports = runtime.reportService
  runtime.studioSettingsService.update({
    materialPriceMicroYuanPerGram: 3_400,
    orderReservedDays: 2,
    fluffingBaggingExpectedHourlyWageCents: 3_000,
    edgeSewingExpectedHourlyWageCents: 3_000,
    packingExpectedHourlyWageCents: 3_000
  })
  const worker = settlements.createWorker({
    name: '小林',
    hourlyWageCents: 3_000,
    effectiveOn: '2026-08-01'
  })
  const product = orders.createProduct({
    name: '奶油小熊',
    basePriceCents: 6_000,
    packagingCostCents: 100,
    accessoryCostCents: 50,
    replacementBagCostCents: 50,
    edgeConsumableCostCents: 80,
    edgeSewingCommissionCents: 40,
    fixedCostCents: 60,
    unitWeightMilligrams: 25_000,
    standardMakingMinutes: 12,
    expectedFluffingBaggingMinutes: 20,
    expectedEdgeSewingMinutes: 10,
    expectedPackingMinutes: 5,
    makingCommissionCents: 300,
    fluffingBaggingCommissionCents: 85
  })
  const order = orders.createOrder({
    customer: { name: '小雨' },
    items: [
      {
        productId: product.id,
        quantity: 10,
        unitPriceCents: 6_000,
        edge: { enabled: true, quantity: 4, unitPriceCents: 300 }
      },
      { productId: product.id, quantity: 6, unitPriceCents: 6_000 }
    ]
  })
  return { runtime, orders, fulfillment, settlements, reviews, reports, worker, order }
}

/** 补排一个无任务计时班次；计时排班只登记人员、日期、工序与备注。 */
function createTimedShift(
  fulfillment: FulfillmentService,
  workerId: string,
  processType: V2TimedProcessType,
  assignedOn: string
) {
  return fulfillment.createWorkAssignment({
    scheduleMode: 'timed_shift',
    workerId,
    assignedOn,
    processType
  })
}

/** 制作一次核算全部合格，为后续计时工序准备可处理数量。 */
function makeAllQualified(
  fulfillment: FulfillmentService,
  workerId: string,
  orderItemId: string,
  quantity: number,
  reviewedOn: string
) {
  const assignment = fulfillment.createWorkAssignment({
    scheduleMode: 'making_task',
    workerId,
    assignedOn: reviewedOn,
    processType: 'making',
    tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: quantity }]
  })
  return fulfillment.reviewMaking({
    processTaskId: assignment.tasks[0]!.id,
    completedQuantity: quantity,
    qualifiedQuantity: quantity,
    reviewedOn
  })
}

describe('V2 工时核算与工资端到端验收', () => {
  it('订单到工资流水：四工序一次核算、同一时段两个商品、条件缝边分流与工资公式一致', async () => {
    const { orders, fulfillment, settlements, reviews, reports, worker, order } =
      await createFixture()
    const edgedItem = order.items[0]!
    const plainItem = order.items[1]!

    // 1. 制作一次核算：一个工作安排安排两个商品，一次提交实际产出与合格数量并直接确认任务。
    const making = fulfillment.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-08-07',
      processType: 'making',
      tasks: [
        { orderItemId: edgedItem.id, sourceType: 'normal_production', plannedQuantity: 10 },
        { orderItemId: plainItem.id, sourceType: 'normal_production', plannedQuantity: 6 }
      ]
    })
    const edgedTask = making.tasks.find((task) => task.orderItemId === edgedItem.id)!
    const plainTask = making.tasks.find((task) => task.orderItemId === plainItem.id)!
    const edgedMaking = fulfillment.reviewMaking({
      processTaskId: edgedTask.id,
      completedQuantity: 10,
      qualifiedQuantity: 9,
      reviewedOn: '2026-08-07'
    })
    fulfillment.reviewMaking({
      processTaskId: plainTask.id,
      completedQuantity: 6,
      qualifiedQuantity: 6,
      reviewedOn: '2026-08-07'
    })
    expect(edgedMaking).toMatchObject({ status: 'confirmed', completedQuantity: 10 })
    const makingDetail = fulfillment.getWorkAssignment(making.id)!
    expect(makingDetail.status).toBe('completed')
    // 不合格 = 实际产出 − 合格，未完成 = 计划 − 实际产出，均由系统计算；只有合格数量离开待制作。
    expect(
      makingDetail.tasks.find((task) => task.id === edgedTask.id)!.reviewSummary
    ).toMatchObject({
      completedQuantity: 10,
      qualifiedQuantity: 9,
      unqualifiedQuantity: 1,
      unfinishedQuantity: 0
    })
    expect(fulfillment.getOrderItemFulfillment(edgedItem.id).stages).toMatchObject({
      making: 1,
      fluffingBagging: 9
    })

    // 2. 捏毛装袋：同一段 240 分钟工时登记两个商品完成明细；缝边需求 4 件分流到待缝边。
    const fluffing = createTimedShift(fulfillment, worker.id, 'fluffing_bagging', '2026-08-09')
    const fluffingCandidates = new Map(
      reviews.listCandidates(fluffing.id).map((candidate) => [candidate.orderItemId, candidate])
    )
    expect(fluffingCandidates.get(edgedItem.id)).toMatchObject({
      processableQuantity: 9,
      expectedUnitMinutes: 20,
      pieceRateCents: 85
    })
    expect(fluffingCandidates.get(plainItem.id)).toMatchObject({ processableQuantity: 6 })
    const fluffingReview = reviews.review({
      workAssignmentId: fluffing.id,
      startedAt: '2026-08-09T09:00',
      endedAt: '2026-08-09T13:00',
      items: [
        { orderItemId: edgedItem.id, completedQuantity: 9 },
        { orderItemId: plainItem.id, completedQuantity: 6 }
      ]
    })
    expect(fluffingReview).toMatchObject({
      workedOn: '2026-08-09',
      approvedMinutes: 240,
      hourlyWageCentsSnapshot: 3_000,
      status: 'confirmed'
    })
    expect(fulfillment.getOrderItemFulfillment(edgedItem.id).stages).toMatchObject({
      fluffingBagging: 0,
      edgeSewing: 4,
      packing: 5,
      edgeSewingRouted: 4
    })
    expect(fulfillment.getOrderItemFulfillment(plainItem.id).stages).toMatchObject({
      fluffingBagging: 0,
      edgeSewing: 0,
      packing: 6
    })

    // 3. 缝边：候选受剩余缝边需求约束，4 件完成后进入待打包发货。
    const edgeSewing = createTimedShift(fulfillment, worker.id, 'edge_sewing', '2026-08-10')
    const edgeCandidates = reviews.listCandidates(edgeSewing.id)
    expect(edgeCandidates).toHaveLength(1)
    expect(edgeCandidates[0]).toMatchObject({
      orderItemId: edgedItem.id,
      processableQuantity: 4,
      expectedUnitMinutes: 10,
      pieceRateCents: 40
    })
    reviews.review({
      workAssignmentId: edgeSewing.id,
      startedAt: '2026-08-10T09:00',
      endedAt: '2026-08-10T10:00',
      items: [{ orderItemId: edgedItem.id, completedQuantity: 4 }]
    })
    expect(fulfillment.getOrderItemFulfillment(edgedItem.id).stages).toMatchObject({
      edgeSewing: 0,
      packing: 9
    })

    // 4. 打包发货：只登记完成数量；实际用时高于预计时只提示核对。
    const packing = createTimedShift(fulfillment, worker.id, 'packing', '2026-08-11')
    const packingCandidates = new Map(
      reviews.listCandidates(packing.id).map((candidate) => [candidate.orderItemId, candidate])
    )
    expect(packingCandidates.get(edgedItem.id)).toMatchObject({
      processableQuantity: 9,
      expectedUnitMinutes: 5,
      pieceRateCents: 0
    })
    expect(packingCandidates.get(plainItem.id)).toMatchObject({
      processableQuantity: 6,
      pieceRateCents: 0
    })
    const packingReview = reviews.review({
      workAssignmentId: packing.id,
      startedAt: '2026-08-11T09:00',
      endedAt: '2026-08-11T11:00',
      items: [
        { orderItemId: edgedItem.id, completedQuantity: 9 },
        { orderItemId: plainItem.id, completedQuantity: 6 }
      ]
    })
    // 预计总分钟 = (9 + 6) × 5 = 75，实际 120 分钟 → 时间差 45，预计效率 62.5%。
    const packingComparison = calculateWorkTimeComparison({
      approvedMinutes: packingReview.approvedMinutes,
      items: [
        { label: '奶油小熊', completedQuantity: 9, expectedMinutesPerUnit: 5 },
        { label: '奶油小熊', completedQuantity: 6, expectedMinutesPerUnit: 5 }
      ]
    })
    expect(packingReview.approvedMinutes).toBe(120)
    expect(packingComparison.expectedMinutes.minutes).toBe(75)
    expect(packingComparison.differenceMinutes).toBe(45)
    expect(packingComparison.efficiency.basisPoints).toBe(6_250)
    expect(packingComparison.needsAttention).toBe(true)
    expect(packingComparison.attentionMessage).toBe('实际用时高于预计，请核对')
    expect(fulfillment.getOrderItemFulfillment(edgedItem.id).stages).toMatchObject({
      packing: 0,
      readyToShip: 9
    })

    // 5. 分批发货：数量守恒，累计不超过已打包待发货。
    orders.createShipment(order.id, {
      shippedOn: '2026-08-12',
      items: [
        { orderItemId: edgedItem.id, quantity: 5 },
        { orderItemId: plainItem.id, quantity: 3 }
      ]
    })
    orders.createShipment(order.id, {
      shippedOn: '2026-08-13',
      items: [
        { orderItemId: edgedItem.id, quantity: 4 },
        { orderItemId: plainItem.id, quantity: 3 }
      ]
    })
    expect(fulfillment.getOrderItemFulfillment(edgedItem.id).stages).toMatchObject({
      readyToShip: 0,
      shipped: 9
    })
    expect(fulfillment.getOrderItemFulfillment(plainItem.id).stages).toMatchObject({
      readyToShip: 0,
      shipped: 6
    })

    // 6. 工资结算：工作日期 2026-08-07 至 08-13 全部归属同一周期。
    const draft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-08-07',
      periodEndOn: '2026-08-13'
    })
    const expectedTimedWageCents =
      calculateTimedWageCents({ minutes: 240, hourlyWageCents: 3_000 }) +
      calculateTimedWageCents({ minutes: 60, hourlyWageCents: 3_000 }) +
      calculateTimedWageCents({ minutes: 120, hourlyWageCents: 3_000 })
    const expectedCommissionCents = calculateQualifiedCommissionCents([
      { processType: 'making', qualifiedQuantity: 9, pieceRateCents: 300 },
      { processType: 'making', qualifiedQuantity: 6, pieceRateCents: 300 },
      { processType: 'fluffing_bagging', qualifiedQuantity: 9, pieceRateCents: 85 },
      { processType: 'fluffing_bagging', qualifiedQuantity: 6, pieceRateCents: 85 },
      { processType: 'edge_sewing', qualifiedQuantity: 4, pieceRateCents: 40 },
      { processType: 'packing', qualifiedQuantity: 15, pieceRateCents: 9_999 }
    ])
    const expectedMaterialDeductionCents = calculateMakingMaterialDeductionCents({
      unqualifiedQuantity: 1,
      materialPriceMicroYuanPerGram: 3_400,
      unitWeightMilligrams: 25_000
    })
    expect(expectedTimedWageCents).toBe(21_000)
    expect(expectedCommissionCents).toBe(4_500 + 1_275 + 160)
    expect(expectedMaterialDeductionCents).toBe(9)
    // 结算保存的来源汇总与共享公式逐项一致（页面展示的就是同一份定义）。
    expect(draft).toMatchObject({
      timedWageCents: expectedTimedWageCents,
      commissionCents: expectedCommissionCents,
      materialDeductionCents: expectedMaterialDeductionCents,
      candidateWageCents:
        expectedTimedWageCents + expectedCommissionCents - expectedMaterialDeductionCents,
      actualDeductionCents: expectedMaterialDeductionCents
    })
    expect(draft.timedSources).toHaveLength(3)
    expect(
      draft.timedSources.map((source) => source.approvedMinutes).sort((a, b) => a - b)
    ).toEqual([60, 120, 240])
    expect(
      draft.timedSources.find((source) => source.processType === 'packing')!.commissionCents
    ).toBe(0)
    expect(draft.makingSources).toHaveLength(2)

    settlements.updateDraft(draft.id, {
      finalPaidAmountCents: 26_900,
      paidOn: '2026-08-14',
      managerNote: '负责人确认实发'
    })
    const confirmed = settlements.confirm(draft.id)
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      finalPaidAmountCents: 26_900,
      paidOn: '2026-08-14'
    })
    expect(confirmed.financialEntryId).not.toBeNull()
    expect(reports.getMonthlyOperation('2026-08')).toMatchObject({
      confirmedSettlementPaidCents: 26_900
    })
  })

  it('核算与结算约束：重复核算拒绝、作废重录、重复结算、下游消耗与来源调整', async () => {
    const { orders, fulfillment, settlements, reviews, worker, order } = await createFixture()
    const item = order.items[1]!

    // 制作 6 件全部合格，为计时工序准备可处理数量。
    makeAllQualified(fulfillment, worker.id, item.id, 6, '2026-08-14')

    const fluffing = createTimedShift(fulfillment, worker.id, 'fluffing_bagging', '2026-08-14')
    const firstReview = reviews.review({
      workAssignmentId: fluffing.id,
      startedAt: '2026-08-14T09:00',
      endedAt: '2026-08-14T11:00',
      items: [{ orderItemId: item.id, completedQuantity: 6 }]
    })
    expect(firstReview.approvedMinutes).toBe(120)

    // 同一工作安排不能重复核算，重试不重复生成履约数量。
    expect(() =>
      reviews.review({
        workAssignmentId: fluffing.id,
        startedAt: '2026-08-14T13:00',
        endedAt: '2026-08-14T14:30',
        items: [{ orderItemId: item.id, completedQuantity: 6 }]
      })
    ).toThrow('该排班已完成核算，不能重复核算')
    expect(fulfillment.getOrderItemFulfillment(item.id).stages.packing).toBe(6)

    // 未被下游消耗的已确认工时可以原子作废并重新核算。
    const voided = reviews.void(firstReview.id, { reason: '时长录错，重新核算' })
    expect(voided).toMatchObject({ status: 'voided', voidReason: '时长录错，重新核算' })
    expect(fulfillment.getWorkAssignment(fluffing.id)).toMatchObject({
      status: 'scheduled',
      timedReview: null
    })
    expect(fulfillment.getOrderItemFulfillment(item.id).stages).toMatchObject({
      fluffingBagging: 6,
      packing: 0
    })
    const redoReview = reviews.review({
      workAssignmentId: fluffing.id,
      startedAt: '2026-08-14T09:00',
      endedAt: '2026-08-14T10:45',
      items: [{ orderItemId: item.id, completedQuantity: 6 }]
    })
    expect(redoReview).toMatchObject({ approvedMinutes: 105, supersedesReviewId: null })

    // 跨周归属：工作日期 2026-08-14 属于 08-14 至 08-14 的工资期间。
    const weekDraft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-08-14',
      periodEndOn: '2026-08-14'
    })
    expect(weekDraft.timedSources.map((source) => source.workTimeReviewId)).toEqual([redoReview.id])
    expect(weekDraft.timedWageCents).toBe(5_250)
    expect(weekDraft.commissionCents).toBe(6 * 300 + 6 * 85)
    settlements.updateDraft(weekDraft.id, {
      finalPaidAmountCents: 700,
      paidOn: '2026-08-15',
      managerNote: '按工作日期归属'
    })
    settlements.confirm(weekDraft.id)

    // 已进入确认结算的工时不能直接作废；同一期间的工时不能重复结算。
    expect(() => reviews.void(redoReview.id, { reason: '录错' })).toThrow('已进入已确认工资结算')
    expect(() =>
      settlements.createDraft({
        workerId: worker.id,
        periodStartOn: '2026-08-14',
        periodEndOn: '2026-08-14'
      })
    ).toThrow('不能重复纳入')

    // 后续期间的打包发货核算：确认后被发货消耗，作废被拒绝。
    const packing = createTimedShift(fulfillment, worker.id, 'packing', '2026-08-15')
    const packingReview = reviews.review({
      workAssignmentId: packing.id,
      startedAt: '2026-08-15T09:00',
      endedAt: '2026-08-15T10:00',
      items: [{ orderItemId: item.id, completedQuantity: 6 }]
    })
    expect(fulfillment.getOrderItemFulfillment(item.id).stages).toMatchObject({
      packing: 0,
      readyToShip: 6
    })
    orders.createShipment(order.id, {
      shippedOn: '2026-08-16',
      items: [{ orderItemId: item.id, quantity: 6 }]
    })
    expect(() => reviews.void(packingReview.id, { reason: '再次更正' })).toThrow(
      '已被下游工序或发货消耗'
    )

    // 已结算工时差异：后续草稿结算建立来源关联调整（105 → 90 分钟，冻结时薪 3000 分/时）。
    const laterDraft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-08-15',
      periodEndOn: '2026-08-19'
    })
    const adjusted = settlements.addWorkTimeAdjustment(laterDraft.id, {
      workTimeReviewId: redoReview.id,
      correctedMinutes: 90,
      reason: '打卡更正'
    })
    expect(adjusted.adjustments[0]).toMatchObject({
      originalMinutes: 105,
      correctedMinutes: 90,
      hourlyWageCentsSnapshot: 3_000,
      amountCents: -750,
      reason: '打卡更正'
    })
    expect(adjusted.adjustmentCents).toBe(-750)
    expect(adjusted.timedWageCents).toBe(3_000)
    expect(adjusted.candidateWageCents).toBe(3_000 - 750)
    expect(() =>
      settlements.addWorkTimeAdjustment(laterDraft.id, {
        workTimeReviewId: redoReview.id,
        correctedMinutes: 80,
        reason: '重复调整'
      })
    ).toThrow()
  })

  it('跨日计时核算：补排后一次核算跨订单商品，开始日期归属、分钟工资、提成、效率与发货可用量', async () => {
    const { orders, fulfillment, settlements, reviews, worker, order } = await createFixture()
    const firstItem = order.items[1]!
    const productId = firstItem.productId!
    const secondOrder = orders.createOrder({
      customer: { name: '夜班客户' },
      items: [{ productId, quantity: 5, unitPriceCents: 6_000 }]
    })
    const secondItem = secondOrder.items[0]!
    makeAllQualified(fulfillment, worker.id, firstItem.id, 6, '2026-08-06')
    makeAllQualified(fulfillment, worker.id, secondItem.id, 5, '2026-08-06')

    // 人员周历补排一个计时班次，结束后一次核算两个订单商品。
    const shift = createTimedShift(fulfillment, worker.id, 'fluffing_bagging', '2026-08-07')
    const candidates = new Map(
      reviews.listCandidates(shift.id).map((candidate) => [candidate.orderItemId, candidate])
    )
    expect(candidates.get(firstItem.id)).toMatchObject({ processableQuantity: 6 })
    expect(candidates.get(secondItem.id)).toMatchObject({
      orderCode: secondOrder.code,
      processableQuantity: 5,
      pieceRateCents: 85
    })

    // 跨日 22:00 → 次日 02:00 = 240 分钟，归属开始日期 2026-08-07。
    const crossDayReview = reviews.review({
      workAssignmentId: shift.id,
      startedAt: '2026-08-07T22:00',
      endedAt: '2026-08-08T02:00',
      items: [
        { orderItemId: firstItem.id, completedQuantity: 6 },
        { orderItemId: secondItem.id, completedQuantity: 5 }
      ],
      reviewNote: '跨日连续作业'
    })
    expect(crossDayReview).toMatchObject({
      workedOn: '2026-08-07',
      approvedMinutes: 240,
      rawStartedAt: '2026-08-07T22:00',
      rawEndedAt: '2026-08-08T02:00',
      hourlyWageCentsSnapshot: 3_000
    })
    expect(crossDayReview.items.map((item) => item.pieceRateCentsSnapshot)).toEqual([85, 85])
    expect(fulfillment.getOrderItemFulfillment(firstItem.id).stages).toMatchObject({
      fluffingBagging: 0,
      packing: 6
    })
    expect(fulfillment.getOrderItemFulfillment(secondItem.id).stages).toMatchObject({
      fluffingBagging: 0,
      packing: 5
    })

    // 预计效率用共享公式重算一致：11 × 20 = 220 分钟，实际 240 分钟，时间差 20。
    const comparison = calculateWorkTimeComparison({
      approvedMinutes: crossDayReview.approvedMinutes,
      items: [
        { label: '奶油小熊', completedQuantity: 6, expectedMinutesPerUnit: 20 },
        { label: '奶油小熊', completedQuantity: 5, expectedMinutesPerUnit: 20 }
      ]
    })
    expect(comparison.expectedMinutes.minutes).toBe(220)
    expect(comparison.differenceMinutes).toBe(20)
    expect(comparison.efficiency.basisPoints).toBe(9_167)
    expect(comparison.needsAttention).toBe(true)

    // 打包进入待发货后满足发货可用量并完成发货。
    const packing = createTimedShift(fulfillment, worker.id, 'packing', '2026-08-08')
    reviews.review({
      workAssignmentId: packing.id,
      startedAt: '2026-08-08T09:00',
      endedAt: '2026-08-08T10:00',
      items: [
        { orderItemId: firstItem.id, completedQuantity: 6 },
        { orderItemId: secondItem.id, completedQuantity: 5 }
      ]
    })
    expect(fulfillment.getOrderItemFulfillment(firstItem.id).stages).toMatchObject({
      packing: 0,
      readyToShip: 6
    })
    expect(fulfillment.getOrderItemFulfillment(secondItem.id).stages).toMatchObject({
      packing: 0,
      readyToShip: 5
    })
    orders.createShipment(order.id, {
      shippedOn: '2026-08-09',
      items: [{ orderItemId: firstItem.id, quantity: 6 }]
    })
    orders.createShipment(secondOrder.id, {
      shippedOn: '2026-08-09',
      items: [{ orderItemId: secondItem.id, quantity: 5 }]
    })
    expect(fulfillment.getOrderItemFulfillment(firstItem.id).stages).toMatchObject({
      readyToShip: 0,
      shipped: 6
    })
    expect(fulfillment.getOrderItemFulfillment(secondItem.id).stages).toMatchObject({
      readyToShip: 0,
      shipped: 5
    })

    // 工资归属开始日期：跨日核算的 timedSource.occurredOn 为 08-07，归入 08-07 起算的周期。
    const draft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-08-07',
      periodEndOn: '2026-08-09'
    })
    expect(draft.timedWageCents).toBe(
      calculateTimedWageCents({ minutes: 240 + 60, hourlyWageCents: 3_000 })
    )
    expect(draft.timedWageCents).toBe(15_000)
    expect(draft.commissionCents).toBe(11 * 85)
    expect(draft.makingSources).toHaveLength(0)
    expect(draft.timedSources.map((source) => source.occurredOn)).toEqual([
      '2026-08-07',
      '2026-08-08'
    ])
  })

  it('制作更正与作废：未锁定原子替换或回退、草稿来源同步、锁定拒绝与审计链完整', async () => {
    const { orders, fulfillment, settlements, reviews, worker, order } = await createFixture()
    const item = order.items[1]!

    const making = fulfillment.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-08-05',
      processType: 'making',
      tasks: [{ orderItemId: item.id, sourceType: 'normal_production', plannedQuantity: 6 }]
    })
    const firstResult = fulfillment.reviewMaking({
      processTaskId: making.tasks[0]!.id,
      completedQuantity: 6,
      qualifiedQuantity: 6,
      reviewedOn: '2026-08-05'
    })
    const firstDraft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-08-05',
      periodEndOn: '2026-08-05'
    })
    expect(firstDraft).toMatchObject({
      commissionCents: 1_800,
      materialDeductionCents: 0,
      candidateWageCents: 1_800
    })
    expect(firstDraft.makingSources).toHaveLength(1)

    // 复核发现 2 件不合格：未锁定的制作核算原子更正，新版本替代旧版本。
    const corrected = fulfillment.correctMakingReview({
      resultId: firstResult.id,
      completedQuantity: 6,
      qualifiedQuantity: 4,
      reviewedOn: '2026-08-05',
      reason: '复核发现 2 件不合格'
    })
    expect(corrected.supersedesResultId).toBe(firstResult.id)
    expect(fulfillment.getWorkAssignment(making.id)!.tasks[0]!.reviewSummary).toMatchObject({
      resultId: corrected.id,
      qualifiedQuantity: 4,
      unqualifiedQuantity: 2,
      unfinishedQuantity: 0,
      supersedesResultId: firstResult.id
    })
    // 履约与工资只反映新版本一次。
    expect(fulfillment.getOrderItemFulfillment(item.id).stages).toMatchObject({
      making: 2,
      fluffingBagging: 4
    })
    const recalculated = settlements.getSettlement(firstDraft.id)!
    expect(recalculated).toMatchObject({
      commissionCents: 1_200,
      materialDeductionCents: 17,
      candidateWageCents: 1_183
    })
    expect(
      recalculated.makingSources.filter((source) => source.status !== 'cancelled')
    ).toHaveLength(1)

    // 作废：安排回到待核算，旧版本状态与原因可读，草稿来源取消并重算为零。
    const voided = fulfillment.voidMakingReview({
      resultId: corrected.id,
      reason: '数量录错，整单重做'
    })
    expect(voided).toMatchObject({ status: 'voided', voidReason: '数量录错，整单重做' })
    const resetAssignment = fulfillment.getWorkAssignment(making.id)!
    expect(resetAssignment.status).toBe('scheduled')
    expect(resetAssignment.tasks[0]!.status).toBe('pending')
    expect(resetAssignment.tasks[0]!.reviewSummary).toBeNull()
    expect(fulfillment.getOrderItemFulfillment(item.id).stages).toMatchObject({
      making: 6,
      fluffingBagging: 0
    })
    const zeroed = settlements.getSettlement(firstDraft.id)!
    expect(zeroed).toMatchObject({
      commissionCents: 0,
      materialDeductionCents: 0,
      candidateWageCents: 0
    })
    expect(zeroed.makingSources.every((source) => source.status === 'cancelled')).toBe(true)

    // 作废后重新核算：新版本链从零开始。
    const redone = fulfillment.reviewMaking({
      processTaskId: making.tasks[0]!.id,
      completedQuantity: 6,
      qualifiedQuantity: 5,
      reviewedOn: '2026-08-06'
    })
    expect(redone.supersedesResultId).toBeNull()
    // 下游捏毛装袋消耗 5 件后，制作核算不能再更正或作废。
    const fluffing = createTimedShift(fulfillment, worker.id, 'fluffing_bagging', '2026-08-06')
    const fluffingReview = reviews.review({
      workAssignmentId: fluffing.id,
      startedAt: '2026-08-06T09:00',
      endedAt: '2026-08-06T10:00',
      items: [{ orderItemId: item.id, completedQuantity: 5 }]
    })
    expect(() =>
      fulfillment.correctMakingReview({
        resultId: redone.id,
        completedQuantity: 6,
        qualifiedQuantity: 6,
        reviewedOn: '2026-08-06',
        reason: '试图更正'
      })
    ).toThrow('已被下游工序或发货消耗')
    expect(() => fulfillment.voidMakingReview({ resultId: redone.id, reason: '试图作废' })).toThrow(
      '已被下游工序或发货消耗'
    )

    // 进入确认结算后同样被拒绝。
    const lockedDraft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-08-06',
      periodEndOn: '2026-08-06'
    })
    settlements.updateDraft(lockedDraft.id, {
      finalPaidAmountCents: 100,
      paidOn: '2026-08-07',
      managerNote: '先确认结算'
    })
    settlements.confirm(lockedDraft.id)
    expect(() => fulfillment.voidMakingReview({ resultId: redone.id, reason: '再次尝试' })).toThrow(
      '已进入已确认工资结算'
    )
    expect(() => reviews.void(fluffingReview.id, { reason: '试图作废工时' })).toThrow(
      '已进入已确认工资结算'
    )

    // 审计链：更正与作废都保留可读的旧版本与原因。
    const audits = orders.listAuditLogs()
    const correctedAudit = audits.find(
      (audit) => audit.action === 'fulfillment.making_review_corrected'
    )!
    expect(correctedAudit).toMatchObject({
      entityType: 'quality_inspection',
      metadata: { processTaskId: making.tasks[0]!.id, reason: '复核发现 2 件不合格' }
    })
    const voidAudit = audits.find((audit) => audit.action === 'fulfillment.making_review_voided')!
    expect(voidAudit.before).toMatchObject({
      inspection: { qualifiedQuantity: 4 },
      result: { supersedesResultId: firstResult.id }
    })
    expect(voidAudit.after).toMatchObject({
      status: 'voided',
      voidReason: '数量录错，整单重做'
    })
  })

  it('计时更正与作废：版本替换与回退、草稿来源取消重算、下游消耗与已确认结算锁定', async () => {
    const { orders, fulfillment, settlements, reviews, worker, order } = await createFixture()
    const item = order.items[1]!
    makeAllQualified(fulfillment, worker.id, item.id, 6, '2026-08-05')

    const shift = createTimedShift(fulfillment, worker.id, 'fluffing_bagging', '2026-08-06')
    const firstReview = reviews.review({
      workAssignmentId: shift.id,
      startedAt: '2026-08-06T09:00',
      endedAt: '2026-08-06T11:00',
      items: [{ orderItemId: item.id, completedQuantity: 6 }]
    })
    const draft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-08-06',
      periodEndOn: '2026-08-06'
    })
    expect(draft).toMatchObject({ timedWageCents: 6_000, commissionCents: 510 })

    // 未锁定更正：新版本替代旧版本，履约与工资只反映一次。
    const corrected = reviews.correct({
      id: firstReview.id,
      startedAt: '2026-08-06T09:00',
      endedAt: '2026-08-06T10:00',
      items: [{ orderItemId: item.id, completedQuantity: 4 }],
      reason: '核对后实为 4 件'
    })
    expect(corrected).toMatchObject({ supersedesReviewId: firstReview.id, approvedMinutes: 60 })
    expect(reviews.getReview(firstReview.id)).toMatchObject({
      status: 'voided',
      voidReason: '核对后实为 4 件'
    })
    expect(fulfillment.getOrderItemFulfillment(item.id).stages).toMatchObject({
      fluffingBagging: 2,
      packing: 4
    })
    const recalculated = settlements.getSettlement(draft.id)!
    expect(recalculated).toMatchObject({ timedWageCents: 3_000, commissionCents: 4 * 85 })
    expect(
      recalculated.timedSources.filter((source) => source.status !== 'cancelled')
    ).toHaveLength(1)

    // 作废：履约回退、班次回到待核算、草稿来源取消并重算。
    const voided = reviews.void(corrected.id, { reason: '班次人员录错' })
    expect(voided).toMatchObject({ status: 'voided', voidReason: '班次人员录错' })
    expect(voided.voidedAt).not.toBeNull()
    expect(fulfillment.getWorkAssignment(shift.id)).toMatchObject({
      status: 'scheduled',
      timedReview: null
    })
    expect(fulfillment.getOrderItemFulfillment(item.id).stages).toMatchObject({
      fluffingBagging: 6,
      packing: 0
    })
    expect(settlements.getSettlement(draft.id)).toMatchObject({
      timedWageCents: 0,
      commissionCents: 0,
      candidateWageCents: 0
    })

    // 重新核算后被下游打包消耗，更正与作废被拒绝。
    const redo = reviews.review({
      workAssignmentId: shift.id,
      startedAt: '2026-08-06T09:00',
      endedAt: '2026-08-06T11:00',
      items: [{ orderItemId: item.id, completedQuantity: 6 }]
    })
    const packing = createTimedShift(fulfillment, worker.id, 'packing', '2026-08-07')
    const packingReview = reviews.review({
      workAssignmentId: packing.id,
      startedAt: '2026-08-07T09:00',
      endedAt: '2026-08-07T10:00',
      items: [{ orderItemId: item.id, completedQuantity: 6 }]
    })
    expect(fulfillment.getOrderItemFulfillment(item.id).stages).toMatchObject({
      packing: 0,
      readyToShip: 6
    })
    expect(() => reviews.void(redo.id, { reason: '试图作废' })).toThrow('已被下游工序或发货消耗')
    expect(() =>
      reviews.correct({
        id: redo.id,
        startedAt: '2026-08-06T09:00',
        endedAt: '2026-08-06T10:30',
        items: [{ orderItemId: item.id, completedQuantity: 6 }],
        reason: '试图更正'
      })
    ).toThrow('已被下游工序或发货消耗')

    // 已确认结算锁定。
    const lockedDraft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-08-07',
      periodEndOn: '2026-08-07'
    })
    settlements.updateDraft(lockedDraft.id, {
      finalPaidAmountCents: 3_000,
      paidOn: '2026-08-08',
      managerNote: '确认打包工资'
    })
    settlements.confirm(lockedDraft.id)
    expect(() => reviews.void(packingReview.id, { reason: '试图作废' })).toThrow(
      '已进入已确认工资结算'
    )

    // 审计链完整：更正与作废记录可读。
    const audits = orders.listAuditLogs()
    expect(audits.filter((audit) => audit.action === 'work_time.review_corrected')).toHaveLength(1)
    const voidAudit = audits.find((audit) => audit.action === 'work_time.review_voided')!
    expect(voidAudit.metadata).toMatchObject({ reason: '班次人员录错' })
    expect(voidAudit.before).toMatchObject({ workAssignmentId: shift.id, approvedMinutes: 60 })
  })

  it('工作台与捏毛装袋分流：无任务计时班次产生待核算事项，两条事件键分流且重试不重复', async () => {
    const { runtime, fulfillment, reviews, worker, order } = await createFixture()
    const item = order.items[0]!
    const workbench = runtime.workbenchService

    // 排班日期不晚于今天且尚无有效核算的制作任务与无任务计时班次都进入待核算决定事项。
    const making = fulfillment.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-08-03',
      processType: 'making',
      tasks: [{ orderItemId: item.id, sourceType: 'normal_production', plannedQuantity: 10 }]
    })
    const timedShift = createTimedShift(fulfillment, worker.id, 'fluffing_bagging', '2026-08-04')
    const futureShift = createTimedShift(fulfillment, worker.id, 'packing', '2099-12-31')

    const snapshot = workbench.getSnapshot()
    const makingItem = snapshot.decisionItems.find(
      (entry) => entry.id === `making-review:${making.tasks[0]!.id}`
    )
    expect(makingItem).toMatchObject({
      kind: 'work_time_review',
      bucket: 'decision',
      priority: 'high',
      navigationTarget: {
        view: 'fulfillment',
        processTaskId: making.tasks[0]!.id,
        workAssignmentId: making.id,
        focus: 'reviews'
      }
    })
    const timedItem = snapshot.decisionItems.find(
      (entry) => entry.id === `timed-review:${timedShift.id}`
    )
    expect(timedItem).toMatchObject({
      kind: 'work_time_review',
      bucket: 'decision',
      subject: { title: '核算捏毛装袋工时' },
      navigationTarget: {
        view: 'fulfillment',
        workAssignmentId: timedShift.id,
        focus: 'reviews'
      }
    })
    expect(
      snapshot.decisionItems.some((entry) => entry.id === `timed-review:${futureShift.id}`)
    ).toBe(false)

    // 制作一次核算后，待核算事项消失。
    fulfillment.reviewMaking({
      processTaskId: making.tasks[0]!.id,
      completedQuantity: 10,
      qualifiedQuantity: 10,
      reviewedOn: '2026-08-03'
    })
    expect(
      workbench
        .getSnapshot()
        .decisionItems.some((entry) => entry.id === `making-review:${making.tasks[0]!.id}`)
    ).toBe(false)

    // 一次核算 10 件：缝边需求 4 件分流到待缝边，其余 6 件进入待打包。
    const fluffingReview = reviews.review({
      workAssignmentId: timedShift.id,
      startedAt: '2026-08-04T09:00',
      endedAt: '2026-08-04T12:00',
      items: [{ orderItemId: item.id, completedQuantity: 10 }]
    })
    expect(fluffingReview.approvedMinutes).toBe(180)
    const routedEvents = fulfillment
      .getOrderItemFulfillment(item.id)
      .events.filter((event) => event.sourceRecordType === 'work_time_review_item')
    expect(routedEvents.map((event) => event.targetStage).sort()).toEqual([
      'edge_sewing',
      'packing'
    ])
    const toEdgeSewing = routedEvents.find((event) => event.targetStage === 'edge_sewing')!
    const toPacking = routedEvents.find((event) => event.targetStage === 'packing')!
    expect(new Set(routedEvents.map((event) => event.sourceEventKey)).size).toBe(2)
    expect(toEdgeSewing.sourceEventKey).toContain('to_edge_sewing')
    expect(toPacking.sourceEventKey).toContain('to_packing')
    expect(fulfillment.getOrderItemFulfillment(item.id).stages).toMatchObject({
      fluffingBagging: 0,
      edgeSewing: 4,
      packing: 6,
      edgeSewingRouted: 4
    })

    // 重试（重复提交）不重复写入事件。
    expect(() =>
      reviews.review({
        workAssignmentId: timedShift.id,
        startedAt: '2026-08-04T09:00',
        endedAt: '2026-08-04T12:00',
        items: [{ orderItemId: item.id, completedQuantity: 10 }]
      })
    ).toThrow('该排班已完成核算，不能重复核算')
    expect(
      fulfillment
        .getOrderItemFulfillment(item.id)
        .events.filter((event) => event.sourceRecordType === 'work_time_review_item')
    ).toHaveLength(2)
    // 核算后计时待核算事项消失。
    expect(
      workbench
        .getSnapshot()
        .decisionItems.some((entry) => entry.id === `timed-review:${timedShift.id}`)
    ).toBe(false)
    expect(fulfillment.getWorkAssignment(timedShift.id)!.timedReview).toMatchObject({
      reviewId: fluffingReview.id,
      approvedMinutes: 180
    })
  })
})
