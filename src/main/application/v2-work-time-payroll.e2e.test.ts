import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  calculateMakingMaterialDeductionCents,
  calculateQualifiedCommissionCents,
  calculateTimedWageCents
} from '@main/domain/settlement'
import { calculateWorkTimeComparison } from '@shared/calculations'
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
    effectiveOn: '2026-09-01'
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

describe('V2 工时核算与工资端到端验收', () => {
  it('订单到工资流水：四工序条件缝边、同一时段两个商品、数量守恒与工资公式一致', async () => {
    const { orders, fulfillment, settlements, reviews, reports, worker, order } =
      await createFixture()
    const edgedItem = order.items[0]!
    const plainItem = order.items[1]!

    // 1. 制作：一个工作安排安排两个商品，确认 9 件合格 1 件不合格与 6 件合格。
    const making = fulfillment.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-07',
      processType: 'making',
      tasks: [
        {
          orderItemId: edgedItem.id,
          sourceType: 'normal_production',
          plannedQuantity: 10
        },
        { orderItemId: plainItem.id, sourceType: 'normal_production', plannedQuantity: 6 }
      ]
    })
    const makingTaskByItem = new Map(making.tasks.map((task) => [task.orderItemId, task]))
    const edgedMakingResult = fulfillment.submitProcessResult(
      makingTaskByItem.get(edgedItem.id)!.id,
      { completedQuantity: 10, submittedOn: '2026-09-07' }
    )
    fulfillment.confirmQualityInspection(edgedMakingResult.id, {
      qualifiedQuantity: 9,
      unqualifiedQuantity: 1,
      inspectedOn: '2026-09-07'
    })
    const plainMakingResult = fulfillment.submitProcessResult(
      makingTaskByItem.get(plainItem.id)!.id,
      { completedQuantity: 6, submittedOn: '2026-09-07' }
    )
    fulfillment.confirmQualityInspection(plainMakingResult.id, {
      qualifiedQuantity: 6,
      unqualifiedQuantity: 0,
      inspectedOn: '2026-09-07'
    })
    expect(fulfillment.getOrderItemFulfillment(edgedItem.id).stages).toMatchObject({
      making: 1,
      fluffingBagging: 9
    })

    // 2. 捏毛装袋：同一段 240 分钟工时登记两个商品完成明细；缝边需求 4 件分流到待缝边。
    const fluffing = fulfillment.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-08',
      processType: 'fluffing_bagging',
      tasks: [
        { orderItemId: edgedItem.id, sourceType: 'normal_production', plannedQuantity: 9 },
        { orderItemId: plainItem.id, sourceType: 'normal_production', plannedQuantity: 6 }
      ]
    })
    const fluffingTaskByItem = new Map(fluffing.tasks.map((task) => [task.orderItemId, task]))
    const fluffingReview = reviews.createDraft({
      workerId: worker.id,
      workedOn: '2026-09-08',
      processType: 'fluffing_bagging',
      approvedMinutes: 240,
      assignmentIds: [fluffing.id],
      items: [
        { processTaskId: fluffingTaskByItem.get(edgedItem.id)!.id, completedQuantity: 9 },
        { processTaskId: fluffingTaskByItem.get(plainItem.id)!.id, completedQuantity: 6 }
      ]
    })
    reviews.confirm(fluffingReview.id)
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

    // 3. 缝边：只处理已选择缝边的订单商品，4 件完成后进入待打包发货。
    const edgeSewing = fulfillment.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-09',
      processType: 'edge_sewing',
      tasks: [{ orderItemId: edgedItem.id, sourceType: 'normal_production', plannedQuantity: 4 }]
    })
    const edgeReview = reviews.createDraft({
      workerId: worker.id,
      workedOn: '2026-09-09',
      processType: 'edge_sewing',
      approvedMinutes: 60,
      assignmentIds: [edgeSewing.id],
      items: [{ processTaskId: edgeSewing.tasks[0]!.id, completedQuantity: 4 }]
    })
    reviews.confirm(edgeReview.id)
    expect(fulfillment.getOrderItemFulfillment(edgedItem.id).stages).toMatchObject({
      edgeSewing: 0,
      packing: 9
    })

    // 4. 打包发货：只登记完成数量；实际用时高于预计时只提示核对。
    const packing = fulfillment.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'packing',
      tasks: [
        { orderItemId: edgedItem.id, sourceType: 'normal_production', plannedQuantity: 9 },
        { orderItemId: plainItem.id, sourceType: 'normal_production', plannedQuantity: 6 }
      ]
    })
    const packingTaskByItem = new Map(packing.tasks.map((task) => [task.orderItemId, task]))
    const packingReview = reviews.createDraft({
      workerId: worker.id,
      workedOn: '2026-09-10',
      processType: 'packing',
      approvedMinutes: 120,
      assignmentIds: [packing.id],
      items: [
        { processTaskId: packingTaskByItem.get(edgedItem.id)!.id, completedQuantity: 9 },
        { processTaskId: packingTaskByItem.get(plainItem.id)!.id, completedQuantity: 6 }
      ]
    })
    // 预计总分钟 = (9 + 6) × 5 = 75，实际 120 分钟 → 时间差 45，预计效率 62.5%。
    const packingComparison = calculateWorkTimeComparison({
      approvedMinutes: 120,
      items: [
        { label: '奶油小熊', completedQuantity: 9, expectedMinutesPerUnit: 5 },
        { label: '奶油小熊', completedQuantity: 6, expectedMinutesPerUnit: 5 }
      ]
    })
    expect(packingComparison.expectedMinutes.minutes).toBe(75)
    expect(packingComparison.differenceMinutes).toBe(45)
    expect(packingComparison.efficiency.basisPoints).toBe(6_250)
    expect(packingComparison.needsAttention).toBe(true)
    expect(packingComparison.attentionMessage).toBe('实际用时高于预计，请核对')
    reviews.confirm(packingReview.id)
    expect(fulfillment.getOrderItemFulfillment(edgedItem.id).stages).toMatchObject({
      packing: 0,
      readyToShip: 9
    })

    // 5. 分批发货：数量守恒，累计不超过已打包待发货。
    orders.createShipment(order.id, {
      shippedOn: '2026-09-11',
      items: [
        { orderItemId: edgedItem.id, quantity: 5 },
        { orderItemId: plainItem.id, quantity: 3 }
      ]
    })
    orders.createShipment(order.id, {
      shippedOn: '2026-09-12',
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

    // 6. 工资结算：工作日期 2026-09-07 至 09-12 全部归属同一周期。
    const draft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-07',
      periodEndOn: '2026-09-12'
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
    expect(draft.timedWageCents).toBe(expectedTimedWageCents)
    expect(draft.commissionCents).toBe(expectedCommissionCents)
    expect(draft.materialDeductionCents).toBe(expectedMaterialDeductionCents)
    expect(draft.candidateWageCents).toBe(
      expectedTimedWageCents + expectedCommissionCents - expectedMaterialDeductionCents
    )
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
      paidOn: '2026-09-13',
      managerNote: '负责人确认实发'
    })
    const confirmed = settlements.confirm(draft.id)
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      finalPaidAmountCents: 26_900,
      paidOn: '2026-09-13'
    })
    expect(confirmed.financialEntryId).not.toBeNull()
    expect(reports.getMonthlyOperation('2026-09')).toMatchObject({
      confirmedSettlementPaidCents: 26_900
    })
  })

  it('核算与结算约束：重复核算、重复确认、重复结算、作废重录、下游消耗与来源调整', async () => {
    const { orders, fulfillment, settlements, reviews, worker, order } = await createFixture()
    const item = order.items[1]!

    // 制作 6 件全部合格，为计时工序准备可处理数量。
    const making = fulfillment.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-13',
      processType: 'making',
      tasks: [{ orderItemId: item.id, sourceType: 'normal_production', plannedQuantity: 6 }]
    })
    const makingResult = fulfillment.submitProcessResult(making.tasks[0]!.id, {
      completedQuantity: 6,
      submittedOn: '2026-09-13'
    })
    fulfillment.confirmQualityInspection(makingResult.id, {
      qualifiedQuantity: 6,
      unqualifiedQuantity: 0,
      inspectedOn: '2026-09-13'
    })

    const fluffing = fulfillment.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-13',
      processType: 'fluffing_bagging',
      tasks: [{ orderItemId: item.id, sourceType: 'normal_production', plannedQuantity: 6 }]
    })
    const reviewDraft = reviews.createDraft({
      workerId: worker.id,
      workedOn: '2026-09-13',
      processType: 'fluffing_bagging',
      approvedMinutes: 120,
      assignmentIds: [fluffing.id],
      items: [{ processTaskId: fluffing.tasks[0]!.id, completedQuantity: 6 }]
    })

    // 同一工作安排不能重复核算。
    expect(() =>
      reviews.createDraft({
        workerId: worker.id,
        workedOn: '2026-09-13',
        processType: 'fluffing_bagging',
        approvedMinutes: 90,
        assignmentIds: [fluffing.id],
        items: [{ processTaskId: fluffing.tasks[0]!.id, completedQuantity: 6 }]
      })
    ).toThrow('该工作安排已存在未作废的工时核算')

    // 重复确认幂等：完成数量不重复增加。
    reviews.confirm(reviewDraft.id)
    const repeated = reviews.confirm(reviewDraft.id)
    expect(repeated).toMatchObject({ status: 'confirmed', approvedMinutes: 120 })
    expect(fulfillment.getOrderItemFulfillment(item.id).stages.packing).toBe(6)

    // 未被下游消耗的已确认工时可以原子作废并重新核算。
    const voided = reviews.void(reviewDraft.id, { reason: '时长录错，重新核算' })
    expect(voided.status).toBe('voided')
    expect(fulfillment.getOrderItemFulfillment(item.id).stages).toMatchObject({
      fluffingBagging: 6,
      packing: 0
    })
    expect(fulfillment.getWorkAssignment(fluffing.id)?.tasks[0]?.status).toBe('pending')
    const redoDraft = reviews.createDraft({
      workerId: worker.id,
      workedOn: '2026-09-13',
      processType: 'fluffing_bagging',
      approvedMinutes: 105,
      assignmentIds: [fluffing.id],
      items: [{ processTaskId: fluffing.tasks[0]!.id, completedQuantity: 6 }]
    })
    const confirmedReview = reviews.confirm(redoDraft.id)
    expect(confirmedReview).toMatchObject({ status: 'confirmed', approvedMinutes: 105 })

    // 跨周归属：工作日期 2026-09-13 属于 09-07 至 09-13 的工资期间。
    const weekDraft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-07',
      periodEndOn: '2026-09-13'
    })
    expect(weekDraft.timedSources.map((source) => source.workTimeReviewId)).toEqual([
      confirmedReview.id
    ])
    expect(weekDraft.timedSources[0]!.timedWageCents).toBe(5_250)
    settlements.updateDraft(weekDraft.id, {
      finalPaidAmountCents: 700,
      paidOn: '2026-09-14',
      managerNote: '按工作日期归属'
    })
    settlements.confirm(weekDraft.id)

    // 已进入确认结算的工时不能直接作废；同一期间的工时不能重复结算。
    expect(() => reviews.void(confirmedReview.id, { reason: '录错' })).toThrow(
      '该工时已进入已确认结算，不能直接作废'
    )
    expect(() =>
      settlements.createDraft({
        workerId: worker.id,
        periodStartOn: '2026-09-07',
        periodEndOn: '2026-09-13'
      })
    ).toThrow('不能重复纳入')

    // 后续期间的打包发货核算：确认后被发货消耗，作废被拒绝。
    const packingAssignment = fulfillment.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-14',
      processType: 'packing',
      tasks: [{ orderItemId: item.id, sourceType: 'normal_production', plannedQuantity: 6 }]
    })
    const packingDraft = reviews.createDraft({
      workerId: worker.id,
      workedOn: '2026-09-14',
      processType: 'packing',
      approvedMinutes: 60,
      assignmentIds: [packingAssignment.id],
      items: [{ processTaskId: packingAssignment.tasks[0]!.id, completedQuantity: 6 }]
    })
    const packingReview = reviews.confirm(packingDraft.id)
    expect(fulfillment.getOrderItemFulfillment(item.id).stages).toMatchObject({
      packing: 0,
      readyToShip: 6
    })
    orders.createShipment(order.id, {
      shippedOn: '2026-09-15',
      items: [{ orderItemId: item.id, quantity: 6 }]
    })
    expect(() => reviews.void(packingReview.id, { reason: '再次更正' })).toThrow(
      '关联完成结果已被下游工序或发货消耗'
    )

    // 已结算工时差异：后续草稿结算建立来源关联调整（105 → 90 分钟，冻结时薪 3000 分/时）。
    const laterDraft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-14',
      periodEndOn: '2026-09-19'
    })
    const adjusted = settlements.addWorkTimeAdjustment(laterDraft.id, {
      workTimeReviewId: confirmedReview.id,
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
    expect(adjusted.candidateWageCents).toBe(3_000 - 750)
    expect(() =>
      settlements.addWorkTimeAdjustment(laterDraft.id, {
        workTimeReviewId: confirmedReview.id,
        correctedMinutes: 80,
        reason: '重复调整'
      })
    ).toThrow()
  })
})
