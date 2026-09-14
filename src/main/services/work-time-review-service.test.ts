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
    const clock = { createId: () => randomUUID(), now: () => '2026-09-15T08:00:00.000Z' }
    const orderService = new V2OrderService(new V2OrderRepository(database), clock)
    const fulfillmentService = new FulfillmentService(new V2FulfillmentRepository(database), clock)
    const settlementService = new SettlementService(database)
    const reviews = new WorkTimeReviewService(database, clock)
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
      standardMakingMinutes: 10,
      makingCommissionCents: 100,
      fluffingBaggingCommissionCents: 85
    })
    const order = orderService.createOrder({
      customer: { name: '小雨' },
      items: [
        { productId: product.id, quantity: 20, unitPriceCents: 6_000 },
        { productId: product.id, quantity: 10, unitPriceCents: 6_000 }
      ]
    })
    const [itemA, itemB] = order.items
    // 制作完成 30 件合格，进入待捏毛装袋，为计时工序准备可处理数量。
    const making = fulfillmentService.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-14',
      processType: 'making',
      tasks: [
        {
          orderItemId: itemA!.id,
          sourceType: 'normal_production',
          plannedQuantity: 20
        },
        {
          orderItemId: itemB!.id,
          sourceType: 'normal_production',
          plannedQuantity: 10
        }
      ]
    })
    for (const task of making.tasks) {
      const result = fulfillmentService.submitProcessResult(task.id, {
        completedQuantity: task.plannedQuantity!,
        submittedOn: '2026-09-14'
      })
      fulfillmentService.confirmQualityInspection(result.id, {
        qualifiedQuantity: task.plannedQuantity!,
        unqualifiedQuantity: 0,
        inspectedOn: '2026-09-14'
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
      itemA: itemA!,
      itemB: itemB!
    }
  }

  function createFluffingAssignment(
    fulfillmentService: FulfillmentService,
    workerId: string,
    orderItemId: string,
    quantity: number,
    assignedOn = '2026-09-14'
  ) {
    return fulfillmentService.createWorkAssignment({
      workerId,
      assignedOn,
      processType: 'fluffing_bagging',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: quantity }]
    })
  }

  it('创建草稿：制作不能创建工时，工作安排必须人员、日期和工序一致', () => {
    const { reviews, worker } = createFixture()

    expect(() =>
      reviews.createDraft({
        workerId: worker.id,
        workedOn: '2026-09-14',
        processType: 'making' as never,
        approvedMinutes: 60,
        assignmentIds: ['assignment-1'],
        items: [{ processTaskId: 'task-1', completedQuantity: 1 }]
      })
    ).toThrow('工时核算只适用于捏毛装袋、缝边和打包发货工序')
  })

  it('一段工时登记多个商品完成明细，确认时冻结个人时薪并提交完成结果', () => {
    const { reviews, fulfillmentService, worker, itemA, itemB } = createFixture()
    const assignment = fulfillmentService.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-14',
      processType: 'fluffing_bagging',
      tasks: [
        { orderItemId: itemA.id, sourceType: 'normal_production', plannedQuantity: 20 },
        { orderItemId: itemB.id, sourceType: 'normal_production', plannedQuantity: 10 }
      ]
    })
    const taskByItem = new Map(assignment.tasks.map((task) => [task.orderItemId, task]))
    const taskA = taskByItem.get(itemA.id)!
    const taskB = taskByItem.get(itemB.id)!

    const draft = reviews.createDraft({
      workerId: worker.id,
      workedOn: '2026-09-14',
      processType: 'fluffing_bagging',
      approvedMinutes: 180,
      assignmentIds: [assignment.id],
      items: [
        { processTaskId: taskA.id, completedQuantity: 20 },
        { processTaskId: taskB.id, completedQuantity: 10 }
      ],
      reviewNote: '按打卡核算'
    })
    expect(draft).toMatchObject({
      status: 'draft',
      approvedMinutes: 180,
      hourlyWageCentsSnapshot: null,
      sourceType: 'manual_review',
      assignmentIds: [assignment.id]
    })
    expect(draft.items).toHaveLength(2)
    expect(draft.items.map((item) => item.orderItemId).sort()).toEqual([itemA.id, itemB.id].sort())

    expect(() => reviews.confirm('missing-review')).toThrow('工时核算不存在')

    const confirmed = reviews.confirm(draft.id)
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      hourlyWageCentsSnapshot: 3_000
    })
    // 完成结果已在确认事务中提交：两条订单商品都进入待打包发货。
    expect(fulfillmentService.getOrderItemFulfillment(itemA.id).stages).toMatchObject({
      fluffingBagging: 0,
      packing: 20
    })
    expect(fulfillmentService.getOrderItemFulfillment(itemB.id).stages).toMatchObject({
      fluffingBagging: 0,
      packing: 10
    })

    // 重复确认幂等：返回原结果且不重复增加完成数量。
    const again = reviews.confirm(draft.id)
    expect(again.status).toBe('confirmed')
    expect(fulfillmentService.getOrderItemFulfillment(itemA.id).stages.packing).toBe(20)

    expect(() =>
      reviews.updateDraft({
        id: draft.id,
        workerId: worker.id,
        workedOn: '2026-09-14',
        processType: 'fluffing_bagging',
        approvedMinutes: 200,
        assignmentIds: [assignment.id],
        items: [{ processTaskId: taskA.id, completedQuantity: 20 }]
      })
    ).toThrow('只有草稿工时核算可以修改')
  })

  it('同一工作安排不能重复核算，完成明细必须来自所关联工作安排', () => {
    const { reviews, fulfillmentService, worker, itemA, itemB } = createFixture()
    const assignment = createFluffingAssignment(fulfillmentService, worker.id, itemA.id, 20)
    const otherAssignment = createFluffingAssignment(
      fulfillmentService,
      worker.id,
      itemB.id,
      10,
      '2026-09-13'
    )

    expect(() =>
      reviews.createDraft({
        workerId: worker.id,
        workedOn: '2026-09-14',
        processType: 'fluffing_bagging',
        approvedMinutes: 60,
        assignmentIds: [assignment.id],
        items: [{ processTaskId: otherAssignment.tasks[0]!.id, completedQuantity: 1 }]
      })
    ).toThrow('完成明细必须来自所关联工作安排的工序任务')

    const draft = reviews.createDraft({
      workerId: worker.id,
      workedOn: '2026-09-14',
      processType: 'fluffing_bagging',
      approvedMinutes: 60,
      assignmentIds: [assignment.id],
      items: [{ processTaskId: assignment.tasks[0]!.id, completedQuantity: 20 }]
    })
    expect(() =>
      reviews.createDraft({
        workerId: worker.id,
        workedOn: '2026-09-14',
        processType: 'fluffing_bagging',
        approvedMinutes: 45,
        assignmentIds: [assignment.id],
        items: [{ processTaskId: assignment.tasks[0]!.id, completedQuantity: 20 }]
      })
    ).toThrow('该工作安排已存在未作废的工时核算')

    const otherWorkerDraft = reviews.createDraft({
      workerId: worker.id,
      workedOn: '2026-09-13',
      processType: 'fluffing_bagging',
      approvedMinutes: 30,
      assignmentIds: [otherAssignment.id],
      items: [{ processTaskId: otherAssignment.tasks[0]!.id, completedQuantity: 10 }]
    })
    expect(otherWorkerDraft.status).toBe('draft')

    // 作废未确认的草稿不允许：只有已确认工时可以作废。
    expect(() => reviews.void(draft.id, { reason: '录错' })).toThrow('只有已确认工时核算可以作废')
  })

  it('被下游消耗的已确认工时不能直接作废，未被消耗时可原子作废并重新核算', () => {
    const { reviews, fulfillmentService, worker, itemA } = createFixture()
    const assignment = createFluffingAssignment(fulfillmentService, worker.id, itemA.id, 20)
    const draft = reviews.createDraft({
      workerId: worker.id,
      workedOn: '2026-09-14',
      processType: 'fluffing_bagging',
      approvedMinutes: 120,
      assignmentIds: [assignment.id],
      items: [{ processTaskId: assignment.tasks[0]!.id, completedQuantity: 20 }]
    })
    const confirmed = reviews.confirm(draft.id)
    expect(confirmed.status).toBe('confirmed')

    // 先直接作废一次：结果尚未被下游消耗，作废后任务回到待完成并可重新核算。
    const voided = reviews.void(confirmed.id, { reason: '时长录错，需要重新核算' })
    expect(voided.status).toBe('voided')
    expect(fulfillmentService.getOrderItemFulfillment(itemA.id).stages).toMatchObject({
      fluffingBagging: 20,
      packing: 0
    })
    expect(fulfillmentService.getWorkAssignment(assignment.id)?.tasks[0]?.status).toBe('pending')

    const redo = reviews.createDraft({
      workerId: worker.id,
      workedOn: '2026-09-14',
      processType: 'fluffing_bagging',
      approvedMinutes: 150,
      assignmentIds: [assignment.id],
      items: [{ processTaskId: assignment.tasks[0]!.id, completedQuantity: 20 }]
    })
    reviews.confirm(redo.id)

    // 打包工序消耗待打包发货数量后，该工时不能再被作废。
    const packing = fulfillmentService.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-15',
      processType: 'packing',
      tasks: [{ orderItemId: itemA.id, sourceType: 'normal_production', plannedQuantity: 20 }]
    })
    fulfillmentService.submitProcessResult(packing.tasks[0]!.id, {
      completedQuantity: 20,
      submittedOn: '2026-09-15'
    })
    expect(() => reviews.void(redo.id, { reason: '再次更正' })).toThrow(
      '关联完成结果已被下游工序或发货消耗'
    )
  })
})
