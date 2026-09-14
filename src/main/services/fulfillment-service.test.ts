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
  inventory: ProductInventoryService
  createWorker(name: string): V2Worker
} {
  const database = createV2Database(':memory:')
  databases.push(database)
  const settlementService = new SettlementService(database)
  return {
    database,
    orderService: new V2OrderService(new V2OrderRepository(database)),
    service: new FulfillmentService(new V2FulfillmentRepository(database)),
    inventory: new ProductInventoryService(database),
    createWorker: (name) =>
      settlementService.createWorker({
        name,
        hourlyWageCents: 2_000,
        effectiveOn: '2026-09-01'
      })
  }
}

function createOrder(orderService: V2OrderService, edge = false) {
  const product = orderService.createProduct({
    name: '奶油小熊',
    basePriceCents: 6_000,
    packagingCostCents: 100,
    accessoryCostCents: 0,
    replacementBagCostCents: 0,
    edgeConsumableCostCents: 0,
    standardMakingMinutes: 12,
    makingCommissionCents: 300,
    fluffingBaggingCommissionCents: 85
  })
  return orderService.createOrder({
    customer: { name: '小雨' },
    items: [
      {
        productId: product.id,
        quantity: 10,
        unitPriceCents: 6_000,
        edge: edge ? { enabled: true, quantity: 4, unitPriceCents: 300 } : undefined
      }
    ]
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
          plannedQuantity: 2
        }
      ]
    })

    expect(assignment.tasks[0]).toMatchObject({
      pieceRateCents: 85,
      rateSnapshot: { fluffingBaggingCommissionCents: 85 }
    })
  })

  it('制作完成后确认质检，并让合格数量进入待捏毛装袋', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('小王')
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

  it('捏毛装袋完成按剩余缝边需求分流，缝边与打包完成后进入待发货', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('捏毛人员')
    const order = createOrder(orderService, true)
    const orderItemId = order.items[0].id

    const making = service.createWorkAssignment({
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

    const fluffing = service.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-08',
      processType: 'fluffing_bagging',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 10 }]
    })
    service.submitProcessResult(fluffing.tasks[0].id, {
      completedQuantity: 10,
      submittedOn: '2026-09-08'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      fluffingBagging: 0,
      edgeSewing: 4,
      packing: 6,
      edgeSewingRouted: 4
    })

    const edgeSewing = service.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-09',
      processType: 'edge_sewing',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 4 }]
    })
    service.submitProcessResult(edgeSewing.tasks[0].id, {
      completedQuantity: 4,
      submittedOn: '2026-09-09'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({
      edgeSewing: 0,
      packing: 10
    })

    const packing = service.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'packing',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 10 }]
    })
    service.submitProcessResult(packing.tasks[0].id, {
      completedQuantity: 10,
      submittedOn: '2026-09-10'
    })
    expect(service.getWorkAssignment(packing.id)?.tasks[0].status).toBe('confirmed')
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

  it('未选择缝边或无剩余缝边需求时拒绝安排缝边任务', () => {
    const { createWorker, orderService, service } = createFixture()
    const worker = createWorker('缝边人员')
    const plainOrder = createOrder(orderService, false)
    const edgedOrder = createOrder(orderService, true)

    expect(() =>
      service.createWorkAssignment({
        workerId: worker.id,
        assignedOn: '2026-09-09',
        processType: 'edge_sewing',
        tasks: [
          {
            orderItemId: plainOrder.items[0].id,
            sourceType: 'normal_production',
            plannedQuantity: 1
          }
        ]
      })
    ).toThrow('该订单商品未选择缝边，不能安排缝边任务')

    const edgedItemId = edgedOrder.items[0].id
    const making = service.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-09',
      processType: 'making',
      tasks: [{ orderItemId: edgedItemId, sourceType: 'normal_production', plannedQuantity: 10 }]
    })
    const makingResult = service.submitProcessResult(making.tasks[0].id, {
      completedQuantity: 10,
      submittedOn: '2026-09-09'
    })
    service.confirmQualityInspection(makingResult.id, {
      qualifiedQuantity: 10,
      unqualifiedQuantity: 0,
      inspectedOn: '2026-09-09'
    })
    const fluffing = service.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-10',
      processType: 'fluffing_bagging',
      tasks: [{ orderItemId: edgedItemId, sourceType: 'normal_production', plannedQuantity: 10 }]
    })
    service.submitProcessResult(fluffing.tasks[0].id, {
      completedQuantity: 10,
      submittedOn: '2026-09-10'
    })

    const edgeSewing = service.createWorkAssignment({
      workerId: worker.id,
      assignedOn: '2026-09-11',
      processType: 'edge_sewing',
      tasks: [{ orderItemId: edgedItemId, sourceType: 'normal_production', plannedQuantity: 4 }]
    })
    service.submitProcessResult(edgeSewing.tasks[0].id, {
      completedQuantity: 4,
      submittedOn: '2026-09-11'
    })
    expect(() =>
      service.createWorkAssignment({
        workerId: worker.id,
        assignedOn: '2026-09-12',
        processType: 'edge_sewing',
        tasks: [{ orderItemId: edgedItemId, sourceType: 'normal_production', plannedQuantity: 1 }]
      })
    ).toThrow('该订单商品已无剩余缝边需求，不能安排缝边任务')
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
