import { afterEach, describe, expect, it } from 'vitest'
import type { V2Worker } from '@shared/contracts/index'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { FulfillmentService } from './fulfillment-service'
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
  createWorker(name: string): V2Worker
} {
  const database = createV2Database(':memory:')
  databases.push(database)
  const settlementService = new SettlementService(database)
  return {
    database,
    orderService: new V2OrderService(new V2OrderRepository(database)),
    service: new FulfillmentService(new V2FulfillmentRepository(database)),
    createWorker: (name) =>
      settlementService.createWorker({
        name,
        hourlyWageCents: 2_000,
        effectiveOn: '2026-09-01'
      })
  }
}

function createOrder(orderService: V2OrderService) {
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
    makingGlueCostCents: 50,
    fluffingBaggingCommissionCents: 85
  } as Parameters<typeof orderService.createProduct>[0] & {
    fluffingBaggingCommissionCents: number
  })
  return orderService.createOrder({
    customer: { name: '小雨' },
    items: [{ productId: product.id, quantity: 10, unitPriceCents: 6_000 }]
  })
}

describe('FulfillmentService', () => {
  it('捏毛装袋任务默认冻结订单商品快照中的计件提成', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('小王')
    const order = createOrder(orderService)

    const assignment = service.createWorkAssignment({
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

    expect(assignment.tasks[0]).toMatchObject({
      pieceRateCents: 85,
      rateSnapshot: { fluffingBaggingCommissionCents: 85 }
    })
  })

  it('读取升级前缺少捏毛装袋提成的订单快照时，默认按 0 冻结', () => {
    const { createWorker, database, orderService, service } = createFixture()
    const worker = createWorker('小王')
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id
    const legacySnapshot = { ...order.items[0].productSnapshot }
    delete (legacySnapshot as { fluffingBaggingCommissionCents?: number })
      .fluffingBaggingCommissionCents
    database
      .prepare('UPDATE order_items SET product_snapshot_json = ? WHERE id = ?')
      .run(JSON.stringify(legacySnapshot), orderItemId)

    const assignment = service.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-07',
      processType: 'fluffing_bagging',
      tasks: [
        {
          orderItemId,
          sourceType: 'normal_production',
          plannedQuantity: 1,
          plannedMinutes: 10
        }
      ]
    })

    expect(assignment.tasks[0]).toMatchObject({
      pieceRateCents: 0,
      rateSnapshot: { fluffingBaggingCommissionCents: 0 }
    })
  })

  it('在同一事务内安排任务、提交完成、确认质检并以事件推进阶段数量', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('小王')
    const reworkWorker = createWorker('小李')
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id

    const assignment = service.createWorkAssignment({
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
    expect(result.completedQuantity).toBe(10)
    expect(service.getProcessResultForTask(assignment.tasks[0].id)?.id).toBe(result.id)
    expect(service.getWorkAssignment(assignment.id)?.tasks[0].status).toBe('pending_inspection')

    service.confirmQualityInspection(result.id, {
      qualifiedQuantity: 7,
      unqualifiedQuantity: 3,
      inspectedOn: '2026-09-09',
      requiresRework: true
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toEqual({
      making: 3,
      fluffingBagging: 7,
      packing: 0,
      readyToShip: 0,
      shipped: 0
    })
    expect(() =>
      service.confirmQualityInspection(result.id, {
        qualifiedQuantity: 7,
        unqualifiedQuantity: 3,
        inspectedOn: '2026-09-09'
      })
    ).toThrow('已质检')

    const rework = service.createWorkAssignment({
      workerId: reworkWorker.id,
      assignedOn: '2026-09-10',
      processType: 'making',
      tasks: [{ orderItemId, sourceType: 'rework', plannedQuantity: 3 }]
    })
    expect(rework.tasks[0]).toMatchObject({
      sourceType: 'rework',
      plannedQuantity: 3,
      plannedMinutes: 36,
      scheduledMinutes: 36,
      pieceRateCents: 300,
      glueCostCents: null,
      gluePriceMicroYuanPerGram: 0,
      glueWeightMilligrams: 0
    })
    expect(service.listWorkAssignments({ orderItemId }).map((item) => item.id)).toEqual([
      rework.id,
      assignment.id
    ])
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

  it('按固定工序处理捏毛不合格返工，并将打包完成数量推进到待发货', () => {
    const { createWorker, orderService, service } = createFixture()
    const makingWorker = createWorker('制作人员')
    const fluffingWorker = createWorker('捏毛人员')
    const reworkWorker = createWorker('返工人员')
    const packingWorker = createWorker('打包人员')
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id

    const making = service.createWorkAssignment({
      workerId: makingWorker.id,
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

    const fluffing = service.createWorkAssignment({
      workerId: fluffingWorker.id,
      assignedOn: '2026-09-08',
      processType: 'fluffing_bagging',
      tasks: [
        { orderItemId, sourceType: 'normal_production', plannedQuantity: 10, plannedMinutes: 80 }
      ]
    })
    const fluffingResult = service.submitProcessResult(fluffing.tasks[0].id, {
      completedQuantity: 10,
      submittedOn: '2026-09-08'
    })
    service.confirmQualityInspection(fluffingResult.id, {
      qualifiedQuantity: 7,
      unqualifiedQuantity: 3,
      inspectedOn: '2026-09-09',
      requiresRework: true
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      fluffingBagging: 3,
      packing: 7
    })

    const rework = service.createWorkAssignment({
      workerId: reworkWorker.id,
      assignedOn: '2026-09-09',
      processType: 'fluffing_bagging',
      tasks: [{ orderItemId, sourceType: 'rework', plannedQuantity: 3, plannedMinutes: 30 }]
    })
    const reworkResult = service.submitProcessResult(rework.tasks[0].id, {
      completedQuantity: 3,
      submittedOn: '2026-09-09'
    })
    service.confirmQualityInspection(reworkResult.id, {
      qualifiedQuantity: 3,
      unqualifiedQuantity: 0,
      inspectedOn: '2026-09-10'
    })

    const packing = service.createWorkAssignment({
      workerId: packingWorker.id,
      assignedOn: '2026-09-10',
      processType: 'packing',
      tasks: [
        { orderItemId, sourceType: 'normal_production', plannedQuantity: 10, plannedMinutes: 45 }
      ]
    })
    service.submitProcessResult(packing.tasks[0].id, {
      completedQuantity: 10,
      actualMinutes: 42,
      submittedOn: '2026-09-10'
    })

    expect(service.getWorkAssignment(packing.id)?.tasks[0]).toMatchObject({
      status: 'confirmed',
      scheduledMinutes: 45
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toEqual({
      making: 0,
      fluffingBagging: 0,
      packing: 0,
      readyToShip: 10,
      shipped: 0
    })
  })

  it('负责人调整仅转派待处理任务，保留原任务与冻结费率', () => {
    const { createWorker, orderService, service } = createFixture()
    const originalWorker = createWorker('原负责人')
    const replacementWorker = createWorker('新负责人')
    const thirdWorker = createWorker('第三位负责人')
    const order = createOrder(orderService)
    const original = service.createWorkAssignment({
      workerId: originalWorker.id,
      assignedOn: '2026-09-08',
      processType: 'fluffing_bagging',
      note: '原始派工备注',
      tasks: [
        {
          orderItemId: order.items[0].id,
          sourceType: 'normal_production',
          plannedQuantity: 6,
          plannedMinutes: 45,
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
      processType: 'fluffing_bagging',
      status: 'scheduled',
      note: '原负责人临时请假',
      tasks: [
        {
          orderItemId: order.items[0].id,
          sourceType: 'normal_production',
          plannedQuantity: 6,
          plannedMinutes: 45,
          scheduledMinutes: 45,
          status: 'pending',
          pieceRateCents: original.tasks[0].pieceRateCents,
          rateSnapshot: original.tasks[0].rateSnapshot,
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

  it('支持期初在制品、售后补发和负责人带原因的数量调整，并拒绝来源数量不足', () => {
    const { createWorker, database, orderService, service } = createFixture()
    const worker = createWorker('补发人员')
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id

    service.recordOpeningWip({
      orderItemId,
      targetStage: 'ready_to_ship',
      quantity: 2,
      occurredOn: '2026-09-08',
      note: '系统启用前已打包'
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
    expect(() =>
      service.recordOpeningWip({
        orderItemId,
        targetStage: 'packing',
        quantity: 9,
        occurredOn: '2026-09-08'
      })
    ).toThrow('来源阶段可用数量不足')

    const replacement = service.createWorkAssignment({
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

  it('拒绝为不存在的兼职人员创建工作安排', () => {
    const { orderService, service } = createFixture()
    const order = createOrder(orderService)

    expect(() =>
      service.createWorkAssignment({
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
