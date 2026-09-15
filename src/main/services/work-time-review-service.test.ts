import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { FulfillmentService } from '@main/services/fulfillment-service'
import { SettlementService } from '@main/services/settlement-service'
import { V2OrderService } from '@main/services/v2-order-service'
import { WorkTimeReviewService } from '@main/services/work-time-review-service'

describe('WorkTimeReviewService', () => {
  const databases: V2Database[] = []

  afterEach(() => {
    databases.splice(0).forEach((database) => database.close())
  })

  function createFixture() {
    const database = createV2Database(':memory:')
    databases.push(database)
    const clock = {
      createId: () => randomUUID(),
      now: () => new Date(2026, 8, 15, 12, 0).toISOString()
    }
    const orderService = new V2OrderService(new V2OrderRepository(database), clock)
    const settlementService = new SettlementService(database, clock)
    const fulfillmentService = new FulfillmentService(
      new V2FulfillmentRepository(database),
      clock,
      settlementService
    )
    const reviews = new WorkTimeReviewService(database, clock, settlementService)
    const worker = settlementService.createWorker({
      name: '小林',
      hourlyWageCents: 3_000,
      effectiveOn: '2026-09-01'
    })
    const product = orderService.createProduct({
      name: '奶油小熊',
      basePriceCents: 6_000,
      packagingCostCents: 0,
      accessoryCostCents: 0,
      replacementBagCostCents: 0,
      edgeConsumableCostCents: 0,
      unitWeightMilligrams: 0,
      standardMakingMinutes: 10,
      makingCommissionCents: 100,
      fluffingBaggingCommissionCents: 85,
      edgeSewingCommissionCents: 40,
      expectedFluffingBaggingMinutes: 3,
      expectedEdgeSewingMinutes: 5,
      expectedPackingMinutes: 2
    })

    function createMakingReview(orderItemId: string, quantity: number, reviewedOn: string): void {
      const assignment = fulfillmentService.createWorkAssignment({
        scheduleMode: 'making_task',
        workerId: worker.id,
        assignedOn: reviewedOn,
        processType: 'making',
        tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: quantity }]
      })
      fulfillmentService.reviewMaking({
        processTaskId: assignment.tasks[0]!.id,
        completedQuantity: quantity,
        qualifiedQuantity: quantity,
        reviewedOn
      })
    }

    return {
      database,
      clock,
      orderService,
      fulfillmentService,
      settlementService,
      reviews,
      worker,
      product,
      createMakingReview
    }
  }

  function seedMakingFixture() {
    const fixture = createFixture()
    const order = fixture.orderService.createOrder({
      customer: { name: '小雨' },
      items: [
        { productId: fixture.product.id, quantity: 20, unitPriceCents: 6_000 },
        { productId: fixture.product.id, quantity: 10, unitPriceCents: 6_000 }
      ]
    })
    const itemA = order.items[0]!
    const itemB = order.items[1]!
    fixture.createMakingReview(itemA.id, 20, '2026-09-13')
    fixture.createMakingReview(itemB.id, 10, '2026-09-13')
    return { ...fixture, order, itemA, itemB }
  }

  function createTimedAssignment(
    fulfillmentService: FulfillmentService,
    workerId: string,
    processType: 'fluffing_bagging' | 'edge_sewing' | 'packing',
    assignedOn = '2026-09-14'
  ) {
    return fulfillmentService.createWorkAssignment({
      scheduleMode: 'timed_shift',
      workerId,
      assignedOn,
      processType
    })
  }

  const range = { startedAt: '2026-09-14T09:00', endedAt: '2026-09-14T12:00' }

  it('候选按逾期优先、交期与订单时间排序，并携带客户与快照', () => {
    const fixture = createFixture()
    const { orderService, product, createMakingReview, reviews, worker } = fixture
    const overdueOrder = orderService.createOrder({
      customer: { name: '逾期客户' },
      expectedShipDate: '2026-09-10',
      items: [{ productId: product.id, quantity: 5, unitPriceCents: 6_000 }]
    })
    const soonOrder = orderService.createOrder({
      customer: { name: '近期客户' },
      expectedShipDate: '2026-09-20',
      items: [{ productId: product.id, quantity: 5, unitPriceCents: 6_000 }]
    })
    const noDateOrder = orderService.createOrder({
      customer: { name: '无交期客户' },
      items: [{ productId: product.id, quantity: 5, unitPriceCents: 6_000 }]
    })
    createMakingReview(overdueOrder.items[0]!.id, 5, '2026-09-13')
    createMakingReview(soonOrder.items[0]!.id, 5, '2026-09-13')
    createMakingReview(noDateOrder.items[0]!.id, 5, '2026-09-13')

    const assignment = createTimedAssignment(
      fixture.fulfillmentService,
      worker.id,
      'fluffing_bagging'
    )
    const candidates = reviews.listCandidates(assignment.id)

    expect(candidates.map((candidate) => candidate.customerName)).toEqual([
      '逾期客户',
      '近期客户',
      '无交期客户'
    ])
    expect(candidates[0]).toMatchObject({
      orderCode: overdueOrder.code,
      customerName: '逾期客户',
      productName: '奶油小熊',
      deliveryDate: '2026-09-10',
      processableQuantity: 5,
      expectedUnitMinutes: 3,
      pieceRateCents: 85
    })
    expect(candidates[1]!.deliveryDate).toBe('2026-09-20')
    expect(candidates[2]!.deliveryDate).toBeNull()

    const searched = reviews.listCandidates(assignment.id, { search: '近期' })
    expect(searched.map((candidate) => candidate.customerName)).toEqual(['近期客户'])
    const byOrderCode = reviews.listCandidates(assignment.id, { search: overdueOrder.code })
    expect(byOrderCode).toHaveLength(1)
  })

  it('缝边候选受剩余缝边需求约束，打包候选来自待打包数量', () => {
    const fixture = createFixture()
    const { orderService, fulfillmentService, reviews, worker, product, createMakingReview } =
      fixture
    const order = orderService.createOrder({
      customer: { name: '缝边客户' },
      items: [
        {
          productId: product.id,
          quantity: 10,
          unitPriceCents: 6_000,
          edge: { enabled: true, quantity: 4, unitPriceCents: 300 }
        }
      ]
    })
    const orderItemId = order.items[0]!.id
    createMakingReview(orderItemId, 10, '2026-09-13')

    const fluffing = createTimedAssignment(fulfillmentService, worker.id, 'fluffing_bagging')
    const fluffingCandidates = reviews.listCandidates(fluffing.id)
    expect(fluffingCandidates[0]).toMatchObject({ processableQuantity: 10 })

    const fluffingReview = reviews.review({
      workAssignmentId: fluffing.id,
      ...range,
      items: [{ orderItemId, completedQuantity: 10 }]
    })
    expect(fluffingReview.approvedMinutes).toBe(180)
    expect(fluffingReview.items[0]).toMatchObject({
      orderItemId,
      completedQuantity: 10,
      pieceRateCentsSnapshot: 85,
      expectedUnitMinutesSnapshot: 3
    })

    const edge = createTimedAssignment(fulfillmentService, worker.id, 'edge_sewing')
    const edgeCandidate = reviews.listCandidates(edge.id)[0]!
    expect(edgeCandidate).toMatchObject({
      processableQuantity: 4,
      expectedUnitMinutes: 5,
      pieceRateCents: 40
    })

    reviews.review({
      workAssignmentId: edge.id,
      ...range,
      items: [{ orderItemId, completedQuantity: 1 }]
    })
    const edgeAfter = createTimedAssignment(
      fulfillmentService,
      worker.id,
      'edge_sewing',
      '2026-09-15'
    )
    expect(reviews.listCandidates(edgeAfter.id)[0]).toMatchObject({ processableQuantity: 3 })

    const packing = createTimedAssignment(fulfillmentService, worker.id, 'packing')
    const packingCandidate = reviews.listCandidates(packing.id)[0]!
    // 缝边完成后 1 件进入待打包：6 件免缝边 + 1 件缝边完成 = 7
    expect(packingCandidate).toMatchObject({
      processableQuantity: 7,
      pieceRateCents: 0,
      expectedUnitMinutes: 2
    })
  })

  it('时间范围必须分钟精度、开始日期等于排班日期且结束不晚于当前时间', () => {
    const { fulfillmentService, reviews, worker } = seedMakingFixture()
    const assignment = createTimedAssignment(fulfillmentService, worker.id, 'fluffing_bagging')
    const item = reviews.listCandidates(assignment.id)[0]!

    expect(() =>
      reviews.review({
        workAssignmentId: assignment.id,
        startedAt: '2026-09-14T09:00:30',
        endedAt: '2026-09-14T12:00',
        items: [{ orderItemId: item.orderItemId, completedQuantity: 5 }]
      })
    ).toThrow('必须精确到分钟')
    expect(() =>
      reviews.review({
        workAssignmentId: assignment.id,
        startedAt: '2026-09-15T09:00',
        endedAt: '2026-09-15T12:00',
        items: [{ orderItemId: item.orderItemId, completedQuantity: 5 }]
      })
    ).toThrow('必须与排班日期一致')

    // 当天班次：结束时间晚于当前时间（本地 2026-09-15 12:00）时不能确认。
    const sameDay = createTimedAssignment(
      fulfillmentService,
      worker.id,
      'fluffing_bagging',
      '2026-09-15'
    )
    expect(() =>
      reviews.review({
        workAssignmentId: sameDay.id,
        startedAt: '2026-09-15T09:00',
        endedAt: '2026-09-15T20:00',
        items: [{ orderItemId: item.orderItemId, completedQuantity: 5 }]
      })
    ).toThrow('尚未到达')
    expect(() =>
      reviews.review({
        workAssignmentId: assignment.id,
        startedAt: '2026-09-14T12:00',
        endedAt: '2026-09-14T09:00',
        items: [{ orderItemId: item.orderItemId, completedQuantity: 5 }]
      })
    ).toThrow('必须晚于实际开始时间')
  })

  it('跨日核算按开始日期归属且不拆单', () => {
    const { fulfillmentService, reviews, worker } = seedMakingFixture()
    const assignment = createTimedAssignment(fulfillmentService, worker.id, 'fluffing_bagging')
    const item = reviews.listCandidates(assignment.id)[0]!

    const review = reviews.review({
      workAssignmentId: assignment.id,
      startedAt: '2026-09-14T22:00',
      endedAt: '2026-09-15T02:00',
      items: [{ orderItemId: item.orderItemId, completedQuantity: 5 }]
    })
    expect(review).toMatchObject({
      workedOn: '2026-09-14',
      approvedMinutes: 240,
      rawStartedAt: '2026-09-14T22:00',
      rawEndedAt: '2026-09-15T02:00',
      status: 'confirmed',
      workAssignmentId: assignment.id,
      hourlyWageCentsSnapshot: 3_000
    })
  })

  it('确认时复算可处理数量并拒绝超量或不可处理的商品', () => {
    const { reviews, fulfillmentService, worker, orderService, product, createMakingReview } =
      seedMakingFixture()
    const order = orderService.createOrder({
      customer: { name: '超量客户' },
      items: [{ productId: product.id, quantity: 7, unitPriceCents: 6_000 }]
    })
    createMakingReview(order.items[0]!.id, 7, '2026-09-13')
    const assignment = createTimedAssignment(fulfillmentService, worker.id, 'fluffing_bagging')
    const candidates = reviews.listCandidates(assignment.id)
    const small = candidates.find((candidate) => candidate.processableQuantity === 7)!

    expect(() =>
      reviews.review({
        workAssignmentId: assignment.id,
        ...range,
        items: [{ orderItemId: small.orderItemId, completedQuantity: 8 }]
      })
    ).toThrow('超过当前可处理数量')
    expect(() =>
      reviews.review({
        workAssignmentId: assignment.id,
        ...range,
        items: [{ orderItemId: 'missing-item', completedQuantity: 1 }]
      })
    ).toThrow('不可处理的订单商品')

    // 模拟并发窗口：候选加载后其他窗口先消耗了可处理量。
    const candidate = candidates[0]!
    fulfillmentService.adjustStageQuantity({
      orderItemId: candidate.orderItemId,
      sourceStage: 'fluffing_bagging',
      targetStage: 'packing',
      quantity: candidate.processableQuantity,
      occurredOn: '2026-09-14',
      note: '并发窗口消耗'
    })
    expect(() =>
      reviews.review({
        workAssignmentId: assignment.id,
        ...range,
        items: [
          { orderItemId: candidate.orderItemId, completedQuantity: candidate.processableQuantity }
        ]
      })
    ).toThrow('不可处理的订单商品')
  })

  it('重复提交不重复生成履约事件与工资来源，捏毛装袋分流两条合法事件', () => {
    const fixture = createFixture()
    const {
      orderService,
      fulfillmentService,
      reviews,
      worker,
      product,
      database,
      createMakingReview
    } = fixture
    const order = orderService.createOrder({
      customer: { name: '分流客户' },
      items: [
        {
          productId: product.id,
          quantity: 10,
          unitPriceCents: 6_000,
          edge: { enabled: true, quantity: 4, unitPriceCents: 300 }
        }
      ]
    })
    const orderItemId = order.items[0]!.id
    createMakingReview(orderItemId, 10, '2026-09-13')

    const assignment = createTimedAssignment(fulfillmentService, worker.id, 'fluffing_bagging')
    const review = reviews.review({
      workAssignmentId: assignment.id,
      ...range,
      items: [{ orderItemId, completedQuantity: 10 }]
    })

    const events = database
      .prepare(
        "SELECT source_event_key, target_stage FROM fulfillment_events WHERE source_record_type = 'work_time_review_item' ORDER BY rowid"
      )
      .all() as Array<{ source_event_key: string; target_stage: string }>
    expect(events).toHaveLength(2)
    expect(events.map((event) => event.target_stage)).toEqual(['edge_sewing', 'packing'])
    expect(new Set(events.map((event) => event.source_event_key)).size).toBe(2)
    expect(events[0]!.source_event_key).toContain('to_edge_sewing')
    expect(events[1]!.source_event_key).toContain('to_packing')

    expect(() =>
      reviews.review({
        workAssignmentId: assignment.id,
        ...range,
        items: [{ orderItemId, completedQuantity: 10 }]
      })
    ).toThrow('已完成核算，不能重复核算')
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM fulfillment_events WHERE source_record_type = 'work_time_review_item'"
        )
        .get()
    ).toEqual({ count: 2 })

    const settlement = fixture.settlementService.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-13',
      periodEndOn: '2026-09-19'
    })
    expect(settlement.timedWageCents).toBe(9_000)
    expect(settlement.commissionCents).toBe(10 * 100 + 10 * 85)
    expect(review.id).toBeTruthy()
  })

  it('更正未锁定核算：替换草稿来源并保留版本链', () => {
    const fixture = createFixture()
    const {
      orderService,
      fulfillmentService,
      settlementService,
      reviews,
      worker,
      product,
      createMakingReview
    } = fixture
    const order = orderService.createOrder({
      customer: { name: '更正客户' },
      items: [{ productId: product.id, quantity: 10, unitPriceCents: 6_000 }]
    })
    const orderItemId = order.items[0]!.id
    createMakingReview(orderItemId, 10, '2026-09-13')

    const assignment = createTimedAssignment(fulfillmentService, worker.id, 'fluffing_bagging')
    const review = reviews.review({
      workAssignmentId: assignment.id,
      ...range,
      items: [{ orderItemId, completedQuantity: 6 }]
    })
    const draft = settlementService.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-13',
      periodEndOn: '2026-09-19'
    })
    expect(draft.timedWageCents).toBe(9_000)
    expect(draft.commissionCents).toBe(10 * 100 + 6 * 85)

    const corrected = reviews.correct({
      id: review.id,
      startedAt: '2026-09-14T09:00',
      endedAt: '2026-09-14T10:30',
      items: [{ orderItemId, completedQuantity: 6 }],
      reason: '实际提前收工'
    })

    expect(corrected.supersedesReviewId).toBe(review.id)
    expect(corrected.approvedMinutes).toBe(90)
    expect(corrected.status).toBe('confirmed')
    const history = reviews.getReview(review.id)!
    expect(history).toMatchObject({ status: 'voided', voidReason: '实际提前收工' })
    expect(fulfillmentService.getWorkAssignment(assignment.id)!.timedReview).toMatchObject({
      reviewId: corrected.id,
      approvedMinutes: 90
    })
    // 履约只反映新版本一次
    expect(fulfillmentService.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      packing: 6,
      readyToShip: 0
    })
    // 草稿结算替换来源并重算：计时工资按新分钟，提成数量不变
    const recalculated = settlementService.getSettlement(draft.id)!
    expect(recalculated.timedWageCents).toBe(4_500)
    expect(recalculated.commissionCents).toBe(10 * 100 + 6 * 85)
  })

  it('作废未锁定核算：回退履约、释放班次并取消草稿来源', () => {
    const fixture = createFixture()
    const {
      orderService,
      fulfillmentService,
      settlementService,
      reviews,
      worker,
      product,
      createMakingReview
    } = fixture
    const order = orderService.createOrder({
      customer: { name: '作废客户' },
      items: [{ productId: product.id, quantity: 10, unitPriceCents: 6_000 }]
    })
    const orderItemId = order.items[0]!.id
    createMakingReview(orderItemId, 10, '2026-09-13')

    const assignment = createTimedAssignment(fulfillmentService, worker.id, 'fluffing_bagging')
    const review = reviews.review({
      workAssignmentId: assignment.id,
      ...range,
      items: [{ orderItemId, completedQuantity: 6 }]
    })
    const draft = settlementService.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-13',
      periodEndOn: '2026-09-19'
    })

    const voided = reviews.void(review.id, { reason: '录错人员班次' })
    expect(voided).toMatchObject({ status: 'voided', voidReason: '录错人员班次' })
    expect(voided.voidedAt).not.toBeNull()
    expect(fulfillmentService.getWorkAssignment(assignment.id)).toMatchObject({
      status: 'scheduled',
      timedReview: null
    })
    expect(fulfillmentService.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      packing: 0,
      readyToShip: 0
    })
    expect(settlementService.getSettlement(draft.id)!.timedWageCents).toBe(0)

    // 作废后可重新核算同一班次
    const redo = reviews.review({
      workAssignmentId: assignment.id,
      ...range,
      items: [{ orderItemId, completedQuantity: 6 }]
    })
    expect(redo.status).toBe('confirmed')
    expect(redo.supersedesReviewId).toBeNull()
  })

  it('下游消耗或已确认结算后拒绝更正与作废，历史聚合核算只读', () => {
    const fixture = createFixture()
    const {
      orderService,
      fulfillmentService,
      settlementService,
      reviews,
      worker,
      product,
      database,
      createMakingReview
    } = fixture
    const order = orderService.createOrder({
      customer: { name: '锁定客户' },
      items: [
        {
          productId: product.id,
          quantity: 10,
          unitPriceCents: 6_000,
          edge: { enabled: true, quantity: 10, unitPriceCents: 300 }
        }
      ]
    })
    const orderItemId = order.items[0]!.id
    createMakingReview(orderItemId, 10, '2026-09-13')

    const fluffing = createTimedAssignment(fulfillmentService, worker.id, 'fluffing_bagging')
    const fluffingReview = reviews.review({
      workAssignmentId: fluffing.id,
      ...range,
      items: [{ orderItemId, completedQuantity: 10 }]
    })
    // 下游缝边消耗待缝边数量后锁定
    const edge = createTimedAssignment(fulfillmentService, worker.id, 'edge_sewing', '2026-09-15')
    reviews.review({
      workAssignmentId: edge.id,
      startedAt: '2026-09-15T09:00',
      endedAt: '2026-09-15T10:00',
      items: [{ orderItemId, completedQuantity: 4 }]
    })
    expect(() => reviews.void(fluffingReview.id, { reason: '试图回退' })).toThrow(
      '已被下游工序或发货消耗'
    )
    expect(() =>
      reviews.correct({
        id: fluffingReview.id,
        ...range,
        items: [{ orderItemId, completedQuantity: 8 }],
        reason: '试图改写'
      })
    ).toThrow('已被下游工序或发货消耗')

    // 已确认结算锁定
    const packing = createTimedAssignment(fulfillmentService, worker.id, 'packing', '2026-09-15')
    const packingReview = reviews.review({
      workAssignmentId: packing.id,
      startedAt: '2026-09-15T09:00',
      endedAt: '2026-09-15T11:00',
      items: [{ orderItemId, completedQuantity: 3 }]
    })
    const draft = settlementService.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-13',
      periodEndOn: '2026-09-19'
    })
    settlementService.updateDraft(draft.id, {
      finalPaidAmountCents: draft.candidateWageCents,
      paidOn: '2026-09-20'
    })
    settlementService.confirm(draft.id)
    expect(() => reviews.void(packingReview.id, { reason: '试图作废' })).toThrow(
      '已进入已确认工资结算'
    )

    // 历史聚合核算（无直接安排关联）只读
    database
      .prepare(
        `INSERT INTO work_time_reviews (
          id, worker_id, worked_on, process_type, approved_minutes, hourly_wage_cents_snapshot,
          source_type, status, raw_started_at, raw_ended_at, review_note, created_at, updated_at
        ) VALUES ('legacy-review', ?, '2026-09-12', 'packing', 120, 3_000,
          'manual_review', 'confirmed', NULL, NULL, '历史聚合', '2026-09-12T00:00:00.000Z', '2026-09-12T00:00:00.000Z')`
      )
      .run(worker.id)
    expect(() =>
      reviews.correct({
        id: 'legacy-review',
        ...range,
        items: [{ orderItemId, completedQuantity: 1 }],
        reason: '试图更正历史'
      })
    ).toThrow('历史聚合核算不支持直接更正')
    expect(() => reviews.void('legacy-review', { reason: '试图作废历史' })).toThrow(
      '历史聚合核算不支持直接作废'
    )
    expect(reviews.getReview('legacy-review')).toMatchObject({
      status: 'confirmed',
      workAssignmentId: null,
      approvedMinutes: 120
    })
  })

  it('取消或缺勤的班次不能核算，制作排班不能创建计时核算', () => {
    const fixture = createFixture()
    const { fulfillmentService, reviews, worker, orderService, product } = fixture
    const cancelled = createTimedAssignment(fulfillmentService, worker.id, 'fluffing_bagging')
    fulfillmentService.setWorkAssignmentStatus(cancelled.id, { status: 'cancelled' })
    expect(() => reviews.listCandidates(cancelled.id)).toThrow('已取消或缺勤')

    const order = orderService.createOrder({
      customer: { name: '制作客户' },
      items: [{ productId: product.id, quantity: 3, unitPriceCents: 6_000 }]
    })
    const makingAssignment = fulfillmentService.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-14',
      processType: 'making',
      tasks: [
        {
          orderItemId: order.items[0]!.id,
          sourceType: 'normal_production',
          plannedQuantity: 3
        }
      ]
    })
    expect(() => reviews.listCandidates(makingAssignment.id)).toThrow('制作排班在制作任务上核算')
    expect(() =>
      reviews.review({
        workAssignmentId: makingAssignment.id,
        ...range,
        items: [{ orderItemId: order.items[0]!.id, completedQuantity: 1 }]
      })
    ).toThrow('制作排班在制作任务上核算')
  })
})
