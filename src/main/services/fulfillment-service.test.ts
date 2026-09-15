import { afterEach, describe, expect, it } from 'vitest'
import type { V2Worker } from '@shared/contracts/index'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { FulfillmentService } from './fulfillment-service'
import { ProductInventoryService } from './product-inventory-service'
import { SettlementService } from './settlement-service'
import { V2OrderService } from './v2-order-service'

const databases: V2Database[] = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
})

function createFixture(): {
  database: V2Database
  orderService: V2OrderService
  service: FulfillmentService
  settlements: SettlementService
  inventory: ProductInventoryService
  createWorker(name: string): V2Worker
} {
  const database = createV2Database(':memory:')
  databases.push(database)
  const settlementService = new SettlementService(database)
  return {
    database,
    orderService: new V2OrderService(new V2OrderRepository(database), undefined, {
      get: () => ({
        materialPriceMicroYuanPerGram: 3_400,
        orderReservedDays: 2,
        fluffingBaggingExpectedHourlyWageCents: 0,
        edgeSewingExpectedHourlyWageCents: 0,
        packingExpectedHourlyWageCents: 0,
        updatedAt: null
      })
    }),
    service: new FulfillmentService(
      new V2FulfillmentRepository(database),
      undefined,
      settlementService
    ),
    settlements: settlementService,
    inventory: new ProductInventoryService(database),
    createWorker: (name) =>
      settlementService.createWorker({
        name,
        hourlyWageCents: 2_000,
        effectiveOn: '2026-09-01'
      })
  }
}

function createOrder(orderService: V2OrderService, edge = false, quantity = 10) {
  const product = orderService.createProduct({
    name: '奶油小熊',
    basePriceCents: 6_000,
    packagingCostCents: 100,
    accessoryCostCents: 0,
    replacementBagCostCents: 0,
    edgeConsumableCostCents: 0,
    unitWeightMilligrams: 25_000,
    standardMakingMinutes: 12,
    makingCommissionCents: 300,
    fluffingBaggingCommissionCents: 85
  })
  return orderService.createOrder({
    customer: { name: '小雨' },
    items: [
      {
        productId: product.id,
        quantity,
        unitPriceCents: 6_000,
        edge: edge ? { enabled: true, quantity: 4, unitPriceCents: 300 } : undefined
      }
    ]
  })
}

describe('FulfillmentService', () => {
  it('制作任务默认冻结订单商品快照中的计件提成与材料用量', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('小王')
    const order = createOrder(orderService)

    const assignment = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-07',
      processType: 'making',
      tasks: [
        {
          orderItemId: order.items[0].id,
          sourceType: 'normal_production',
          plannedQuantity: 2
        }
      ]
    })

    expect(assignment.tasks[0]).toMatchObject({
      pieceRateCents: 300,
      materialPriceMicroYuanPerGram: 3_400,
      glueWeightMilligrams: 25_000
    })
  })

  /** 迁移前的计时任务不再由新流程创建，历史数据仍需保持可读与可流转。 */
  function seedLegacyTimedTask(
    database: V2Database,
    input: {
      id: string
      workerId: string
      assignedOn: string
      processType: 'fluffing_bagging' | 'edge_sewing' | 'packing'
      orderItemId: string
      plannedQuantity: number
      pieceRateCents?: number | null
    }
  ): string {
    database
      .prepare(
        `INSERT INTO work_assignments (
          id, worker_id, assigned_on, process_type, status, schedule_mode, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'scheduled', 'legacy_task', '2026-09-07T00:00:00.000Z', '2026-09-07T00:00:00.000Z')`
      )
      .run(input.id, input.workerId, input.assignedOn, input.processType)
    const taskId = `${input.id}-task`
    database
      .prepare(
        `INSERT INTO process_tasks (
          id, work_assignment_id, order_item_id, process_type, source_type, planned_quantity,
          planned_minutes, extra_minutes, status, piece_rate_cents, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'normal_production', ?, 0, 0, 'pending', ?, '2026-09-07T00:00:00.000Z', '2026-09-07T00:00:00.000Z')`
      )
      .run(
        taskId,
        input.id,
        input.orderItemId,
        input.processType,
        input.plannedQuantity,
        input.pieceRateCents ?? null
      )
    return taskId
  }

  it('制作完成后确认质检，并让合格数量进入待捏毛装袋', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('小王')
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id

    const assignment = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-08',
      processType: 'making',
      tasks: [
        { orderItemId, sourceType: 'normal_production', plannedQuantity: 10, extraMinutes: 5 }
      ]
    })
    expect(assignment.tasks[0]).toMatchObject({
      plannedMinutes: 120,
      extraMinutes: 5,
      scheduledMinutes: 125
    })

    const result = service.submitProcessResult(assignment.tasks[0].id, {
      completedQuantity: 10,
      actualMinutes: 118,
      submittedOn: '2026-09-08'
    })
    expect(service.getWorkAssignment(assignment.id)?.tasks[0].status).toBe('pending_inspection')
    expect(() =>
      service.confirmQualityInspection(result.id, {
        qualifiedQuantity: 11,
        unqualifiedQuantity: 0,
        inspectedOn: '2026-09-09'
      })
    ).toThrow('必须等于')

    service.confirmQualityInspection(result.id, {
      qualifiedQuantity: 7,
      unqualifiedQuantity: 3,
      inspectedOn: '2026-09-09',
      requiresRework: true
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toEqual({
      making: 3,
      fluffingBagging: 7,
      edgeSewing: 0,
      packing: 0,
      readyToShip: 0,
      shipped: 0,
      edgeSewingRouted: 0
    })
    expect(() =>
      service.confirmQualityInspection(result.id, {
        qualifiedQuantity: 7,
        unqualifiedQuantity: 3,
        inspectedOn: '2026-09-09'
      })
    ).toThrow('已质检')

    const rework = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'rework', plannedQuantity: 3 }]
    })
    expect(rework.tasks[0]).toMatchObject({
      sourceType: 'rework',
      plannedQuantity: 3,
      plannedMinutes: 36,
      scheduledMinutes: 36,
      pieceRateCents: 300
    })
    const reworkResult = service.submitProcessResult(rework.tasks[0].id, {
      completedQuantity: 3,
      submittedOn: '2026-09-10'
    })
    service.confirmQualityInspection(reworkResult.id, {
      qualifiedQuantity: 3,
      unqualifiedQuantity: 0,
      inspectedOn: '2026-09-11'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      making: 0,
      fluffingBagging: 10
    })
  })

  it('历史计时任务完成按剩余缝边需求分流，缝边与打包完成后进入待发货', () => {
    const { createWorker, orderService, service, database } = createFixture()
    const worker = createWorker('捏毛人员')
    const order = createOrder(orderService, true)
    const orderItemId = order.items[0].id

    const making = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-07',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 10 }]
    })
    const makingResult = service.submitProcessResult(making.tasks[0].id, {
      completedQuantity: 10,
      submittedOn: '2026-09-07'
    })
    service.confirmQualityInspection(makingResult.id, {
      qualifiedQuantity: 10,
      unqualifiedQuantity: 0,
      inspectedOn: '2026-09-08'
    })

    const fluffingTaskId = seedLegacyTimedTask(database, {
      id: 'legacy-fluffing',
      workerId: worker.id,
      assignedOn: '2026-09-08',
      processType: 'fluffing_bagging',
      orderItemId,
      plannedQuantity: 10,
      pieceRateCents: 85
    })
    service.submitProcessResult(fluffingTaskId, {
      completedQuantity: 10,
      submittedOn: '2026-09-08'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      fluffingBagging: 0,
      edgeSewing: 4,
      packing: 6,
      edgeSewingRouted: 4
    })

    const edgeTaskId = seedLegacyTimedTask(database, {
      id: 'legacy-edge',
      workerId: worker.id,
      assignedOn: '2026-09-09',
      processType: 'edge_sewing',
      orderItemId,
      plannedQuantity: 4
    })
    service.submitProcessResult(edgeTaskId, {
      completedQuantity: 4,
      submittedOn: '2026-09-09'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      edgeSewing: 0,
      packing: 10
    })

    const packingTaskId = seedLegacyTimedTask(database, {
      id: 'legacy-packing',
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'packing',
      orderItemId,
      plannedQuantity: 10
    })
    service.submitProcessResult(packingTaskId, {
      completedQuantity: 10,
      submittedOn: '2026-09-10'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toEqual({
      making: 0,
      fluffingBagging: 0,
      edgeSewing: 0,
      packing: 0,
      readyToShip: 10,
      shipped: 0,
      edgeSewingRouted: 4
    })
  })

  it('商品存量投入订单、售后补发和负责人带原因的数量调整都保留可追溯事实', () => {
    const { createWorker, database, orderService, service, inventory } = createFixture()
    const worker = createWorker('补发人员')
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id
    const productId = order.items[0].productId!

    inventory.recordOpening({
      productId,
      stage: 'packed',
      quantity: 2,
      occurredOn: '2026-09-08',
      note: '系统启用前已打包'
    })
    inventory.allocateToOrder({
      productId,
      stage: 'packed',
      orderItemId,
      quantity: 2,
      occurredOn: '2026-09-08'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      making: 8,
      readyToShip: 2
    })
    expect(service.listWorkAssignments({ orderItemId })).toEqual([])
    expect(database.prepare('SELECT COUNT(*) AS count FROM process_results').get()).toEqual({
      count: 0
    })
    expect(database.prepare('SELECT COUNT(*) AS count FROM quality_inspections').get()).toEqual({
      count: 0
    })

    const replacement = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-09',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'after_sales_replacement', plannedQuantity: 1 }]
    })
    const result = service.submitProcessResult(replacement.tasks[0].id, {
      completedQuantity: 1,
      submittedOn: '2026-09-09'
    })
    service.confirmQualityInspection(result.id, {
      qualifiedQuantity: 1,
      unqualifiedQuantity: 0,
      inspectedOn: '2026-09-10'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      making: 8,
      fluffingBagging: 1,
      readyToShip: 2
    })

    service.adjustStageQuantity({
      orderItemId,
      targetStage: 'packing',
      quantity: 2,
      occurredOn: '2026-09-10',
      note: '客户退回待重新包装'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({ packing: 2 })
    expect(() =>
      service.adjustStageQuantity({
        orderItemId,
        quantity: 1,
        occurredOn: '2026-09-10',
        note: '缺少目标和来源'
      })
    ).toThrow('至少指定来源阶段或目标阶段')
  })

  it('负责人调整仅转派待处理的制作任务，保留原任务与冻结费率', () => {
    const { createWorker, orderService, service } = createFixture()
    const originalWorker = createWorker('原负责人')
    const replacementWorker = createWorker('新负责人')
    const thirdWorker = createWorker('第三位负责人')
    const order = createOrder(orderService)
    const original = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: originalWorker.id,
      assignedOn: '2026-09-08',
      processType: 'making',
      note: '原始派工备注',
      tasks: [
        {
          orderItemId: order.items[0].id,
          sourceType: 'normal_production',
          plannedQuantity: 6,
          note: '原始任务备注'
        }
      ]
    })

    const replacement = service.reassignProcessTask(original.tasks[0].id, {
      workerId: replacementWorker.id,
      effectiveOn: '2026-09-10',
      reason: '原负责人临时请假'
    })

    expect(service.getWorkAssignment(original.id)).toMatchObject({
      status: 'completed',
      tasks: [{ id: original.tasks[0].id, status: 'cancelled', note: '原始任务备注' }]
    })
    expect(replacement).toMatchObject({
      workerId: replacementWorker.id,
      assignedOn: '2026-09-10',
      processType: 'making',
      scheduleMode: 'making_task',
      status: 'scheduled',
      note: '原负责人临时请假',
      tasks: [
        {
          orderItemId: order.items[0].id,
          sourceType: 'normal_production',
          plannedQuantity: 6,
          status: 'pending',
          pieceRateCents: original.tasks[0].pieceRateCents,
          note: '原始任务备注'
        }
      ]
    })
    expect(() =>
      service.reassignProcessTask(original.tasks[0].id, {
        workerId: thirdWorker.id,
        effectiveOn: '2026-09-11',
        reason: '重复调整'
      })
    ).toThrow('只有待处理任务可以调整负责人')
  })

  it('拒绝为不存在的兼职人员创建工作安排', () => {
    const { orderService, service } = createFixture()
    const order = createOrder(orderService)

    expect(() =>
      service.createWorkAssignment({
        scheduleMode: 'making_task',
        workerId: 'missing-worker',
        assignedOn: '2026-09-07',
        processType: 'making',
        tasks: [
          {
            orderItemId: order.items[0].id,
            sourceType: 'normal_production',
            plannedQuantity: 1
          }
        ]
      })
    ).toThrow('兼职人员不存在')
  })
})

describe('排班模式校验与计时公共班次', () => {
  it('制作排班仍要求制作工序与至少一条任务', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('制作人员')
    const order = createOrder(orderService)

    expect(() =>
      service.createWorkAssignment({
        scheduleMode: 'making_task',
        workerId: worker.id,
        assignedOn: '2026-09-10',
        processType: 'making',
        tasks: []
      })
    ).toThrow('制作排班至少需要一条工序任务')

    expect(() =>
      service.createWorkAssignment({
        scheduleMode: 'making_task',
        workerId: worker.id,
        assignedOn: '2026-09-10',
        processType: 'edge_sewing',
        tasks: [
          { orderItemId: order.items[0].id, sourceType: 'normal_production', plannedQuantity: 1 }
        ]
      } as never)
    ).toThrow('制作排班只能选择制作工序')

    expect(() =>
      service.createWorkAssignment({
        scheduleMode: 'making_task',
        workerId: worker.id,
        assignedOn: '2026-09-10',
        processType: 'making',
        tasks: [{ orderItemId: '', sourceType: 'normal_production', plannedQuantity: 1 }]
      })
    ).toThrow('必须关联订单产品')
  })

  it('计时排班只保存人员、日期、工序与备注，不创建工序任务', () => {
    const { createWorker, service, database } = createFixture()
    const worker = createWorker('计时人员')
    const assignment = service.createWorkAssignment({
      scheduleMode: 'timed_shift',
      workerId: worker.id,
      assignedOn: '2026-09-01',
      processType: 'fluffing_bagging',
      note: '下午补排'
    })

    expect(assignment).toMatchObject({
      scheduleMode: 'timed_shift',
      processType: 'fluffing_bagging',
      status: 'scheduled',
      note: '下午补排',
      tasks: [],
      timedReview: null
    })
    expect(
      database
        .prepare('SELECT COUNT(*) AS count FROM process_tasks WHERE work_assignment_id = ?')
        .get(assignment.id)
    ).toEqual({ count: 0 })
  })

  it('计时排班拒绝夹带任务、数量或预计分钟', () => {
    const { createWorker, service } = createFixture()
    const worker = createWorker('计时人员')
    const base = {
      scheduleMode: 'timed_shift' as const,
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'edge_sewing' as const
    }

    expect(() =>
      service.createWorkAssignment({
        ...base,
        tasks: [{ orderItemId: 'item-x', sourceType: 'rework', plannedQuantity: 1 }]
      } as never)
    ).toThrow('计时排班不能携带工序任务')
    expect(() => service.createWorkAssignment({ ...base, plannedQuantity: 3 } as never)).toThrow(
      '计时排班不能填写数量或预计分钟'
    )
    expect(() => service.createWorkAssignment({ ...base, plannedMinutes: 30 } as never)).toThrow(
      '计时排班不能填写数量或预计分钟'
    )
    expect(() => service.createWorkAssignment({ ...base, extraMinutes: 5 } as never)).toThrow(
      '计时排班不能填写数量或预计分钟'
    )
    expect(() => service.createWorkAssignment({ ...base, processType: 'making' } as never)).toThrow(
      '计时排班只能选择捏毛装袋、缝边或打包发货工序'
    )
  })

  it('计时排班允许过去、当天与未来任意日期并拒绝重复安排', () => {
    const { createWorker, service } = createFixture()
    const worker = createWorker('计时人员')
    const input = {
      scheduleMode: 'timed_shift' as const,
      workerId: worker.id,
      assignedOn: '2026-08-01',
      processType: 'packing' as const
    }

    const past = service.createWorkAssignment(input)
    expect(past.assignedOn).toBe('2026-08-01')
    expect(() => service.createWorkAssignment(input)).toThrow('同一人员同一天已有该工序的计时安排')
    service.createWorkAssignment({ ...input, processType: 'edge_sewing' })
    service.createWorkAssignment({ ...input, assignedOn: '2026-09-20' })

    service.setWorkAssignmentStatus(past.id, { status: 'cancelled', reason: '临时取消' })
    const recreated = service.createWorkAssignment(input)
    expect(recreated.status).toBe('scheduled')
    expect(recreated.id).not.toBe(past.id)
  })

  it('返工与售后补发来源仅适用于制作任务', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('制作人员')
    const order = createOrder(orderService)

    const rework = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'making',
      tasks: [
        {
          orderItemId: order.items[0].id,
          sourceType: 'rework',
          plannedQuantity: 2
        }
      ]
    })
    expect(rework.tasks[0].sourceType).toBe('rework')

    expect(() =>
      service.createWorkAssignment({
        scheduleMode: 'timed_shift',
        workerId: worker.id,
        assignedOn: '2026-09-10',
        processType: 'edge_sewing',
        tasks: [{ sourceType: 'after_sales_replacement' }]
      } as never)
    ).toThrow('计时排班不能携带工序任务')
  })

  it('缺勤或取消制作安排释放未核算计划数量且不改变订单履约进度', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('制作人员')
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id

    const assignment = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 10 }]
    })

    const absent = service.setWorkAssignmentStatus(assignment.id, {
      status: 'absent',
      reason: '临时缺勤'
    })
    expect(absent.status).toBe('absent')
    expect(absent.tasks[0].status).toBe('cancelled')
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({ making: 10 })

    expect(() => service.setWorkAssignmentStatus(assignment.id, { status: 'cancelled' })).toThrow(
      '只有进行中的排班可以标记缺勤或取消'
    )
  })

  it('取消计时安排不改变订单履约，已有有效核算不能静默撤销', () => {
    const { createWorker, orderService, service, database } = createFixture()
    const worker = createWorker('计时人员')
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id

    const timed = service.createWorkAssignment({
      scheduleMode: 'timed_shift',
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'fluffing_bagging'
    })
    const cancelled = service.setWorkAssignmentStatus(timed.id, { status: 'cancelled' })
    expect(cancelled.status).toBe('cancelled')
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      making: 10,
      fluffingBagging: 0
    })

    const reviewed = service.createWorkAssignment({
      scheduleMode: 'timed_shift',
      workerId: worker.id,
      assignedOn: '2026-09-11',
      processType: 'edge_sewing'
    })
    database
      .prepare(
        `INSERT INTO work_time_reviews (
          id, worker_id, worked_on, process_type, approved_minutes, hourly_wage_cents_snapshot,
          source_type, status, work_assignment_id, created_at, updated_at
        ) VALUES ('review-guard', ?, '2026-09-11', 'edge_sewing', 120, 2_000,
          'manual_review', 'confirmed', ?, '2026-09-11T00:00:00.000Z', '2026-09-11T00:00:00.000Z')`
      )
      .run(worker.id, reviewed.id)

    expect(() => service.setWorkAssignmentStatus(reviewed.id, { status: 'cancelled' })).toThrow(
      '已有有效核算，不能通过状态更新撤销'
    )
  })
})

describe('制作一次核算', () => {
  it('一次提交实际产出与合格数量并直接已核算', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('制作人员')
    const order = createOrder(orderService, false, 25)
    const orderItemId = order.items[0].id

    const assignment = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 25 }]
    })
    const taskId = assignment.tasks[0].id

    const result = service.reviewMaking({
      processTaskId: taskId,
      completedQuantity: 20,
      qualifiedQuantity: 18,
      reviewedOn: '2026-09-11'
    })

    expect(result).toMatchObject({
      processTaskId: taskId,
      completedQuantity: 20,
      status: 'confirmed',
      supersedesResultId: null
    })
    const reviewed = service.getWorkAssignment(assignment.id)!
    expect(reviewed.status).toBe('completed')
    expect(reviewed.tasks[0].status).toBe('confirmed')
    expect(reviewed.tasks[0].reviewSummary).toMatchObject({
      completedQuantity: 20,
      qualifiedQuantity: 18,
      unqualifiedQuantity: 2,
      unfinishedQuantity: 5,
      reviewedOn: '2026-09-11',
      supersedesResultId: null,
      lock: { locked: false, reason: null }
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      making: 7,
      fluffingBagging: 18
    })
  })

  it('允许零产出与零合格，零产出不生成履约数量', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('制作人员')
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id

    const zeroOutput = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 10 }]
    })
    service.reviewMaking({
      processTaskId: zeroOutput.tasks[0].id,
      completedQuantity: 0,
      qualifiedQuantity: 0,
      reviewedOn: '2026-09-10'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      making: 10,
      fluffingBagging: 0
    })
    expect(service.getWorkAssignment(zeroOutput.id)!.tasks[0].reviewSummary).toMatchObject({
      completedQuantity: 0,
      unqualifiedQuantity: 0,
      unfinishedQuantity: 10
    })

    const zeroQualified = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-11',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 4 }]
    })
    service.reviewMaking({
      processTaskId: zeroQualified.tasks[0].id,
      completedQuantity: 4,
      qualifiedQuantity: 0,
      reviewedOn: '2026-09-11'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      making: 10,
      fluffingBagging: 0
    })
    expect(service.getWorkAssignment(zeroQualified.id)!.tasks[0].reviewSummary).toMatchObject({
      unqualifiedQuantity: 4,
      unfinishedQuantity: 0
    })
  })

  it('拒绝超过本次计划、合格超过实际产出与重复核算', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('制作人员')
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id

    const assignment = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 10 }]
    })
    const taskId = assignment.tasks[0].id

    expect(() =>
      service.reviewMaking({
        processTaskId: taskId,
        completedQuantity: 11,
        qualifiedQuantity: 1,
        reviewedOn: '2026-09-10'
      })
    ).toThrow('实际产出不能超过本次制作计划')
    expect(() =>
      service.reviewMaking({
        processTaskId: taskId,
        completedQuantity: 10,
        qualifiedQuantity: 11,
        reviewedOn: '2026-09-10'
      })
    ).toThrow('合格数量不能超过实际产出')

    service.reviewMaking({
      processTaskId: taskId,
      completedQuantity: 10,
      qualifiedQuantity: 9,
      reviewedOn: '2026-09-10'
    })
    expect(() =>
      service.reviewMaking({
        processTaskId: taskId,
        completedQuantity: 10,
        qualifiedQuantity: 9,
        reviewedOn: '2026-09-10'
      })
    ).toThrow('已完成核算')
    expect(() =>
      service.reviewMaking({
        processTaskId: taskId,
        completedQuantity: 5,
        qualifiedQuantity: 5,
        reviewedOn: '2026-09-11'
      })
    ).toThrow('已完成核算')
  })

  it('任务取消或不是制作任务时拒绝核算', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('制作人员')
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id

    const assignment = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 5 }]
    })
    service.setWorkAssignmentStatus(assignment.id, { status: 'cancelled' })
    expect(() =>
      service.reviewMaking({
        processTaskId: assignment.tasks[0].id,
        completedQuantity: 5,
        qualifiedQuantity: 5,
        reviewedOn: '2026-09-10'
      })
    ).toThrow('已取消')

    expect(() =>
      service.reviewMaking({
        processTaskId: 'missing-task',
        completedQuantity: 1,
        qualifiedQuantity: 1,
        reviewedOn: '2026-09-10'
      })
    ).toThrow('工序任务不存在')
  })

  it('核算失败时不产生任何结果、质量或履约事实', () => {
    const { createWorker, orderService, service, database } = createFixture()
    const worker = createWorker('制作人员')
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id

    const first = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 10 }]
    })
    const second = service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-11',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 10 }]
    })
    service.reviewMaking({
      processTaskId: first.tasks[0].id,
      completedQuantity: 10,
      qualifiedQuantity: 10,
      reviewedOn: '2026-09-10'
    })

    // 订单只有 10 件：第二次核算会超出订单待制作数量，整个事务回滚。
    expect(() =>
      service.reviewMaking({
        processTaskId: second.tasks[0].id,
        completedQuantity: 10,
        qualifiedQuantity: 5,
        reviewedOn: '2026-09-11'
      })
    ).toThrow('合格数量超过订单商品当前待制作数量')
    expect(service.getWorkAssignment(second.id)!.tasks[0].status).toBe('pending')
    expect(service.getWorkAssignment(second.id)!.tasks[0].reviewSummary).toBeNull()
    expect(
      database
        .prepare('SELECT COUNT(*) AS count FROM process_results WHERE process_task_id = ?')
        .get(second.tasks[0].id)
    ).toEqual({ count: 0 })
    expect(
      database
        .prepare('SELECT COUNT(*) AS count FROM quality_inspections WHERE process_task_id = ?')
        .get(second.tasks[0].id)
    ).toEqual({ count: 0 })
    expect(
      database
        .prepare('SELECT COUNT(*) AS count FROM fulfillment_events WHERE order_item_id = ?')
        .get(orderItemId)
    ).toEqual({ count: 1 })
  })
})

describe('制作核算更正与作废', () => {
  function reviewedFixture() {
    const fixture = createFixture()
    const worker = fixture.createWorker('制作人员')
    const order = createOrder(fixture.orderService, false, 30)
    const orderItemId = order.items[0].id
    const assignment = fixture.service.createWorkAssignment({
      scheduleMode: 'making_task',
      workerId: worker.id,
      assignedOn: '2026-09-13',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 22 }]
    })
    const result = fixture.service.reviewMaking({
      processTaskId: assignment.tasks[0].id,
      completedQuantity: 22,
      qualifiedQuantity: 20,
      reviewedOn: '2026-09-13'
    })
    return { ...fixture, worker, orderItemId, assignment, result }
  }

  it('更正未锁定核算：保留旧版本并只反映新版本一次', () => {
    const { database, service, settlements, worker, orderItemId, assignment, result } =
      reviewedFixture()
    const draft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-13',
      periodEndOn: '2026-09-19'
    })
    expect(draft.commissionCents).toBe(20 * 300)
    expect(draft.materialDeductionCents).toBeGreaterThan(0)
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      making: 10,
      fluffingBagging: 20
    })

    const corrected = service.correctMakingReview({
      resultId: result.id,
      completedQuantity: 22,
      qualifiedQuantity: 22,
      reviewedOn: '2026-09-13',
      reason: '现场复核后补记'
    })

    expect(corrected.supersedesResultId).toBe(result.id)
    expect(service.getProcessResultForTask(assignment.tasks[0].id)!.id).toBe(corrected.id)
    expect(service.getProcessResultForTask(assignment.tasks[0].id)!.status).toBe('confirmed')
    const history = database
      .prepare('SELECT status, void_reason FROM process_results WHERE id = ?')
      .get(result.id)
    expect(history).toEqual({ status: 'voided', void_reason: '现场复核后补记' })

    // 履约只反映新版本一次
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      making: 8,
      fluffingBagging: 22
    })
    const reviewed = service.getWorkAssignment(assignment.id)!
    expect(reviewed.tasks[0].reviewSummary).toMatchObject({
      qualifiedQuantity: 22,
      unqualifiedQuantity: 0,
      supersedesResultId: result.id
    })
    // 草稿结算取消旧来源并重算
    const recalculated = settlements.getSettlement(draft.id)!
    expect(recalculated.commissionCents).toBe(22 * 300)
    expect(recalculated.materialDeductionCents).toBe(0)
  })

  it('作废未锁定核算：安排回到待核算且草稿结算来源被取消', () => {
    const { service, settlements, worker, orderItemId, assignment, result } = reviewedFixture()
    const draft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-13',
      periodEndOn: '2026-09-19'
    })

    const voided = service.voidMakingReview({ resultId: result.id, reason: '核算对象选错' })

    expect(voided.status).toBe('voided')
    expect(voided.voidReason).toBe('核算对象选错')
    const backToPending = service.getWorkAssignment(assignment.id)!
    expect(backToPending.status).toBe('scheduled')
    expect(backToPending.tasks[0].status).toBe('pending')
    expect(backToPending.tasks[0].reviewSummary).toBeNull()
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      making: 30,
      fluffingBagging: 0
    })
    const recalculated = settlements.getSettlement(draft.id)!
    expect(recalculated.commissionCents).toBe(0)
    expect(recalculated.materialDeductionCents).toBe(0)
  })

  it('产出被下游消耗后拒绝直接更正或作废', () => {
    const { service, orderItemId, result } = reviewedFixture()
    // 把合格产出的 20 件推到打包，制造不可逆的下游消耗
    service.adjustStageQuantity({
      orderItemId,
      sourceStage: 'fluffing_bagging',
      targetStage: 'packing',
      quantity: 20,
      occurredOn: '2026-09-14',
      note: '测试下游消耗'
    })

    expect(() =>
      service.correctMakingReview({
        resultId: result.id,
        completedQuantity: 22,
        qualifiedQuantity: 22,
        reviewedOn: '2026-09-13',
        reason: '试图改写'
      })
    ).toThrow('已被下游工序或发货消耗')
    expect(() => service.voidMakingReview({ resultId: result.id, reason: '试图回退' })).toThrow(
      '已被下游工序或发货消耗'
    )
  })

  it('已进入确认结算后拒绝直接更正或作废', () => {
    const { service, settlements, worker, result } = reviewedFixture()
    const draft = settlements.createDraft({
      workerId: worker.id,
      periodStartOn: '2026-09-13',
      periodEndOn: '2026-09-19'
    })
    settlements.updateDraft(draft.id, {
      finalPaidAmountCents: draft.candidateWageCents,
      paidOn: '2026-09-20'
    })
    settlements.confirm(draft.id)

    expect(() =>
      service.correctMakingReview({
        resultId: result.id,
        completedQuantity: 22,
        qualifiedQuantity: 21,
        reviewedOn: '2026-09-13',
        reason: '试图改写'
      })
    ).toThrow('已进入已确认工资结算')
    expect(() => service.voidMakingReview({ resultId: result.id, reason: '试图作废' })).toThrow(
      '已进入已确认工资结算'
    )
  })
})
