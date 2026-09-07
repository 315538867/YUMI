import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2FulfillmentRepository } from '@main/repositories/fulfillment-repository'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { FulfillmentService } from './fulfillment-service'
import { V2OrderService } from './v2-order-service'

const databases: V2Database[] = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
})

function createFixture(): { orderService: V2OrderService; service: FulfillmentService } {
  const database = createV2Database(':memory:')
  databases.push(database)
  return {
    orderService: new V2OrderService(new V2OrderRepository(database)),
    service: new FulfillmentService(new V2FulfillmentRepository(database))
  }
}

function createOrder(orderService: V2OrderService) {
  const product = orderService.createProduct({
    name: '奶油小熊', basePriceCents: 6_000, materialCostCents: 1_000,
    packagingCostCents: 100, accessoryCostCents: 0, replacementBagCostCents: 0,
    edgeCostCents: 0, standardMakingMinutes: 12, makingCommissionCents: 300,
    makingGlueCostCents: 50
  })
  return orderService.createOrder({
    customer: { name: '小雨' },
    items: [{ productId: product.id, quantity: 10, unitPriceCents: 6_000 }],
    initialConfirmedAmountCents: 60_000
  })
}

describe('FulfillmentService', () => {
  it('在同一事务内安排任务、提交完成、确认质检并以事件推进阶段数量', () => {
    const { orderService, service } = createFixture()
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id

    const assignment = service.createWorkAssignment({
      workerId: 'worker-1', assignedOn: '2026-09-08', processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 10, extraMinutes: 5 }]
    })
    expect(assignment.tasks[0]).toMatchObject({ plannedMinutes: 120, extraMinutes: 5, scheduledMinutes: 125 })

    const result = service.submitProcessResult(assignment.tasks[0].id, {
      completedQuantity: 10, actualMinutes: 118, submittedOn: '2026-09-08'
    })
    expect(result.completedQuantity).toBe(10)
    expect(service.getProcessResultForTask(assignment.tasks[0].id)?.id).toBe(result.id)
    expect(service.getWorkAssignment(assignment.id)?.tasks[0].status).toBe('pending_inspection')

    service.confirmQualityInspection(result.id, {
      qualifiedQuantity: 7, unqualifiedQuantity: 3, inspectedOn: '2026-09-09', requiresRework: true
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toEqual({
      making: 3, fluffingBagging: 7, packing: 0, readyToShip: 0, shipped: 0
    })
    expect(() => service.confirmQualityInspection(result.id, {
      qualifiedQuantity: 7, unqualifiedQuantity: 3, inspectedOn: '2026-09-09'
    })).toThrow('已质检')

    const rework = service.createWorkAssignment({
      workerId: 'worker-2', assignedOn: '2026-09-10', processType: 'making',
      tasks: [{ orderItemId, sourceType: 'rework', plannedQuantity: 3 }]
    })
    const reworkResult = service.submitProcessResult(rework.tasks[0].id, {
      completedQuantity: 3, submittedOn: '2026-09-10'
    })
    service.confirmQualityInspection(reworkResult.id, {
      qualifiedQuantity: 3, unqualifiedQuantity: 0, inspectedOn: '2026-09-11'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({ making: 0, fluffingBagging: 10 })
  })


  it('按固定工序处理捏毛不合格返工，并将打包完成数量推进到待发货', () => {
    const { orderService, service } = createFixture()
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id

    const making = service.createWorkAssignment({
      workerId: 'worker-making', assignedOn: '2026-09-07', processType: 'making',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 10 }]
    })
    const makingResult = service.submitProcessResult(making.tasks[0].id, {
      completedQuantity: 10, submittedOn: '2026-09-07'
    })
    service.confirmQualityInspection(makingResult.id, {
      qualifiedQuantity: 10, unqualifiedQuantity: 0, inspectedOn: '2026-09-08'
    })

    const fluffing = service.createWorkAssignment({
      workerId: 'worker-fluffing', assignedOn: '2026-09-08', processType: 'fluffing_bagging',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 10, plannedMinutes: 80 }]
    })
    const fluffingResult = service.submitProcessResult(fluffing.tasks[0].id, {
      completedQuantity: 10, submittedOn: '2026-09-08'
    })
    service.confirmQualityInspection(fluffingResult.id, {
      qualifiedQuantity: 7, unqualifiedQuantity: 3, inspectedOn: '2026-09-09', requiresRework: true
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({ fluffingBagging: 3, packing: 7 })

    const rework = service.createWorkAssignment({
      workerId: 'worker-rework', assignedOn: '2026-09-09', processType: 'fluffing_bagging',
      tasks: [{ orderItemId, sourceType: 'rework', plannedQuantity: 3, plannedMinutes: 30 }]
    })
    const reworkResult = service.submitProcessResult(rework.tasks[0].id, {
      completedQuantity: 3, submittedOn: '2026-09-09'
    })
    service.confirmQualityInspection(reworkResult.id, {
      qualifiedQuantity: 3, unqualifiedQuantity: 0, inspectedOn: '2026-09-10'
    })

    const packing = service.createWorkAssignment({
      workerId: 'worker-packing', assignedOn: '2026-09-10', processType: 'packing',
      tasks: [{ orderItemId, sourceType: 'normal_production', plannedQuantity: 10, plannedMinutes: 45 }]
    })
    service.submitProcessResult(packing.tasks[0].id, {
      completedQuantity: 10, actualMinutes: 42, submittedOn: '2026-09-10'
    })

    expect(service.getWorkAssignment(packing.id)?.tasks[0]).toMatchObject({ status: 'confirmed', scheduledMinutes: 45 })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toEqual({
      making: 0, fluffingBagging: 0, packing: 0, readyToShip: 10, shipped: 0
    })
  })

  it('支持期初在制品、售后补发和负责人带原因的数量调整，并拒绝来源数量不足', () => {
    const { orderService, service } = createFixture()
    const order = createOrder(orderService)
    const orderItemId = order.items[0].id

    service.recordOpeningWip({
      orderItemId, targetStage: 'ready_to_ship', quantity: 2, occurredOn: '2026-09-08', note: '系统启用前已打包'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({ making: 8, readyToShip: 2 })
    expect(() => service.recordOpeningWip({
      orderItemId, targetStage: 'packing', quantity: 9, occurredOn: '2026-09-08'
    })).toThrow('来源阶段可用数量不足')

    const replacement = service.createWorkAssignment({
      workerId: 'worker-3', assignedOn: '2026-09-09', processType: 'making',
      tasks: [{ orderItemId, sourceType: 'after_sales_replacement', plannedQuantity: 1 }]
    })
    const result = service.submitProcessResult(replacement.tasks[0].id, {
      completedQuantity: 1, submittedOn: '2026-09-09'
    })
    service.confirmQualityInspection(result.id, {
      qualifiedQuantity: 1, unqualifiedQuantity: 0, inspectedOn: '2026-09-10'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({ making: 8, fluffingBagging: 1, readyToShip: 2 })

    service.adjustStageQuantity({
      orderItemId, targetStage: 'packing', quantity: 2, occurredOn: '2026-09-10', note: '客户退回待重新包装'
    })
    expect(service.getOrderItemFulfillment(orderItemId).stages).toMatchObject({ packing: 2 })
    expect(() => service.adjustStageQuantity({
      orderItemId, quantity: 1, occurredOn: '2026-09-10', note: '缺少目标和来源'
    })).toThrow('至少指定来源阶段或目标阶段')
  })
})
