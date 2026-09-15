import { describe, expect, it } from 'vitest'
import {
  applyFulfillmentEvent,
  calculateMakingReviewQuantities,
  calculateTaskPlannedMinutes,
  createEdgeSewingCompletedEvent,
  createFluffingBaggingCompletedEvents,
  createFulfillmentState,
  createFulfillmentEventKey,
  createInventoryAllocationEvent,
  createMakingQualifiedEvent,
  createPackingCompletedEvent,
  getShippableQuantity,
  processTaskSources,
  routeFluffingBaggingCompletion,
  validateQualityInspection,
  validateProcessResult
} from './fulfillment'

describe('固定四工序计划规则', () => {
  it('制作计划分钟由标准分钟乘数量加额外预留，其他工序不要求计划数量', () => {
    expect(
      calculateTaskPlannedMinutes({
        processType: 'making',
        plannedQuantity: 12,
        standardMakingMinutes: 15,
        extraMinutes: 20
      })
    ).toBe(200)
    expect(calculateTaskPlannedMinutes({ processType: 'edge_sewing', plannedMinutes: 35 })).toBe(35)
    expect(calculateTaskPlannedMinutes({ processType: 'packing' })).toBe(0)
    expect(processTaskSources).toEqual([
      'normal_production',
      'rework',
      'after_sales_replacement',
      'manager_arrangement'
    ])
  })

  it('拒绝缺少数量或不合法分钟的计划、完成申报', () => {
    expect(() =>
      calculateTaskPlannedMinutes({
        processType: 'making',
        plannedQuantity: 0,
        standardMakingMinutes: 10
      })
    ).toThrow('计划数量')
    expect(() =>
      calculateTaskPlannedMinutes({
        processType: 'packing',
        plannedMinutes: -1
      })
    ).toThrow('计划分钟')
    expect(() =>
      calculateTaskPlannedMinutes({
        processType: 'packing',
        plannedMinutes: 20,
        extraMinutes: 1
      })
    ).toThrow('额外预留分钟仅适用于制作任务')
    expect(() => validateProcessResult({ completedQuantity: 0 })).toThrow('完成数量')
    expect(() => validateProcessResult({ completedQuantity: 3, actualMinutes: -1 })).toThrow(
      '实际分钟'
    )
  })
})

describe('完成、质检与四阶段数量流转', () => {
  it('只有制作需要质检，合格数量一次确认完成申报的全部数量', () => {
    expect(() =>
      validateQualityInspection({
        completedQuantity: 10,
        qualifiedQuantity: 7,
        unqualifiedQuantity: 2,
        alreadyInspected: false
      })
    ).toThrow('必须等于')
    expect(() =>
      validateQualityInspection({
        completedQuantity: 10,
        qualifiedQuantity: 10,
        unqualifiedQuantity: 0,
        alreadyInspected: true
      })
    ).toThrow('已质检')
    expect(createMakingQualifiedEvent(8)).toMatchObject({
      eventType: 'making_qualified',
      sourceStage: 'making',
      targetStage: 'fluffing_bagging',
      quantity: 8
    })
  })

  it('捏毛装袋完成按订单剩余缝边需求分流到待缝边与待打包发货', () => {
    expect(
      routeFluffingBaggingCompletion({
        completedQuantity: 60,
        edgeQuantity: 40,
        edgeSewingRouted: 0
      })
    ).toEqual({ toEdgeSewing: 40, toPacking: 20 })
    expect(
      routeFluffingBaggingCompletion({
        completedQuantity: 30,
        edgeQuantity: 40,
        edgeSewingRouted: 20
      })
    ).toEqual({ toEdgeSewing: 20, toPacking: 10 })
    expect(
      routeFluffingBaggingCompletion({
        completedQuantity: 30,
        edgeQuantity: 40,
        edgeSewingRouted: 40
      })
    ).toEqual({ toEdgeSewing: 0, toPacking: 30 })
    expect(
      routeFluffingBaggingCompletion({
        completedQuantity: 30,
        edgeQuantity: 0,
        edgeSewingRouted: 0
      })
    ).toEqual({ toEdgeSewing: 0, toPacking: 30 })
  })

  it('捏毛装袋完成事件按分流拆分，缝边完成后进入待打包发货', () => {
    expect(
      createFluffingBaggingCompletedEvents({
        completedQuantity: 60,
        edgeQuantity: 40,
        edgeSewingRouted: 0
      })
    ).toEqual([
      {
        eventType: 'fluffing_bagging_completed',
        quantity: 40,
        sourceStage: 'fluffing_bagging',
        targetStage: 'edge_sewing'
      },
      {
        eventType: 'fluffing_bagging_completed',
        quantity: 20,
        sourceStage: 'fluffing_bagging',
        targetStage: 'packing'
      }
    ])
    expect(createEdgeSewingCompletedEvent(8)).toMatchObject({
      eventType: 'edge_sewing_completed',
      sourceStage: 'edge_sewing',
      targetStage: 'packing'
    })
    expect(createPackingCompletedEvent(8)).toMatchObject({
      eventType: 'packing_completed',
      sourceStage: 'packing',
      targetStage: 'ready_to_ship'
    })
  })

  it('累计保留已分流到缝边的数量，用于后续捏毛完成继续按需求路由', () => {
    let state = createFulfillmentState(100)
    state = applyFulfillmentEvent(state, createMakingQualifiedEvent(60))
    for (const event of createFluffingBaggingCompletedEvents({
      completedQuantity: 60,
      edgeQuantity: 40,
      edgeSewingRouted: state.edgeSewingRouted
    })) {
      state = applyFulfillmentEvent(state, event)
    }
    expect(state.edgeSewingRouted).toBe(40)
    expect(
      createFluffingBaggingCompletedEvents({
        completedQuantity: 40,
        edgeQuantity: 40,
        edgeSewingRouted: state.edgeSewingRouted
      })
    ).toEqual([
      {
        eventType: 'fluffing_bagging_completed',
        quantity: 40,
        sourceStage: 'fluffing_bagging',
        targetStage: 'packing'
      }
    ])
  })

  it('事件累计形成可发货量，且不允许任一来源阶段被扣成负数', () => {
    let state = createFulfillmentState(20)
    state = applyFulfillmentEvent(state, createMakingQualifiedEvent(10))
    state = applyFulfillmentEvent(
      state,
      createFluffingBaggingCompletedEvents({
        completedQuantity: 10,
        edgeQuantity: 4,
        edgeSewingRouted: 0
      })[0]!
    )
    state = applyFulfillmentEvent(
      state,
      createFluffingBaggingCompletedEvents({
        completedQuantity: 10,
        edgeQuantity: 4,
        edgeSewingRouted: 0
      })[1]!
    )
    expect(state).toMatchObject({
      making: 10,
      fluffingBagging: 0,
      edgeSewing: 4,
      packing: 6,
      edgeSewingRouted: 4
    })
    state = applyFulfillmentEvent(state, createEdgeSewingCompletedEvent(4))
    state = applyFulfillmentEvent(state, createPackingCompletedEvent(10))
    expect(getShippableQuantity(state)).toBe(10)
    state = applyFulfillmentEvent(state, {
      eventType: 'shipment',
      quantity: 6,
      sourceStage: 'ready_to_ship',
      targetStage: 'shipped'
    })
    expect(state).toMatchObject({ making: 10, readyToShip: 4, shipped: 6 })
    expect(() =>
      applyFulfillmentEvent(state, {
        eventType: 'shipment',
        quantity: 5,
        sourceStage: 'ready_to_ship',
        targetStage: 'shipped'
      })
    ).toThrow('可用数量不足')
  })

  it('商品存量投入订单扣减待制作数量并增加目标阶段，同时累计缝边分流', () => {
    const state = createFulfillmentState(50)
    const toEdge = applyFulfillmentEvent(state, createInventoryAllocationEvent('edge_sewing', 20))
    expect(toEdge).toMatchObject({ making: 30, edgeSewing: 20, edgeSewingRouted: 20 })
    const toPacking = applyFulfillmentEvent(state, createInventoryAllocationEvent('packing', 20))
    expect(toPacking).toMatchObject({ making: 30, packing: 20, edgeSewingRouted: 0 })
    expect(() => createInventoryAllocationEvent('making', 20)).toThrow('不能直接投入')
    expect(() => createInventoryAllocationEvent('shipped', 20)).toThrow('不能直接投入')
  })
})

describe('制作一次核算数量守恒', () => {
  it('不合格与未完成数量由系统计算', () => {
    expect(
      calculateMakingReviewQuantities({
        plannedQuantity: 25,
        completedQuantity: 20,
        qualifiedQuantity: 18
      })
    ).toEqual({
      completedQuantity: 20,
      qualifiedQuantity: 18,
      unqualifiedQuantity: 2,
      unfinishedQuantity: 5
    })
  })

  it('允许零产出与零合格，未完成回填排产缺口', () => {
    expect(
      calculateMakingReviewQuantities({
        plannedQuantity: 10,
        completedQuantity: 0,
        qualifiedQuantity: 0
      })
    ).toEqual({
      completedQuantity: 0,
      qualifiedQuantity: 0,
      unqualifiedQuantity: 0,
      unfinishedQuantity: 10
    })
    const zeroQualified = calculateMakingReviewQuantities({
      plannedQuantity: 10,
      completedQuantity: 4,
      qualifiedQuantity: 0
    })
    expect(zeroQualified.unqualifiedQuantity).toBe(4)
    expect(zeroQualified.unfinishedQuantity).toBe(6)
  })

  it('合格不超过实际产出，实际产出不超过本次计划', () => {
    expect(() =>
      calculateMakingReviewQuantities({
        plannedQuantity: 10,
        completedQuantity: 4,
        qualifiedQuantity: 5
      })
    ).toThrow('合格数量不能超过实际产出')
    expect(() =>
      calculateMakingReviewQuantities({
        plannedQuantity: 10,
        completedQuantity: 11,
        qualifiedQuantity: 1
      })
    ).toThrow('实际产出不能超过本次制作计划')
    expect(() =>
      calculateMakingReviewQuantities({
        plannedQuantity: 10,
        completedQuantity: -1,
        qualifiedQuantity: 0
      })
    ).toThrow('实际产出必须是非负整数')
    expect(() =>
      calculateMakingReviewQuantities({
        plannedQuantity: 10,
        completedQuantity: 1.5,
        qualifiedQuantity: 1
      })
    ).toThrow('实际产出必须是非负整数')
    expect(() =>
      calculateMakingReviewQuantities({
        plannedQuantity: 0,
        completedQuantity: 0,
        qualifiedQuantity: 0
      })
    ).toThrow('计划数量')
  })

  it('零合格不产生履约事件，零数量不产生工资或扣款依据', () => {
    expect(() => createMakingQualifiedEvent(0)).toThrow('合格数量必须是正整数')
    const zero = calculateMakingReviewQuantities({
      plannedQuantity: 10,
      completedQuantity: 0,
      qualifiedQuantity: 0
    })
    expect(zero.qualifiedQuantity * 300).toBe(0)
    expect(zero.unqualifiedQuantity).toBe(0)
  })
})

describe('履约事件级幂等键', () => {
  it('同一明细分流两条事件使用不同键且重试稳定', () => {
    const drafts = createFluffingBaggingCompletedEvents({
      completedQuantity: 10,
      edgeQuantity: 4,
      edgeSewingRouted: 0
    })
    expect(drafts).toHaveLength(2)
    const keysOf = (items: typeof drafts) =>
      items.map((draft) =>
        createFulfillmentEventKey({
          sourceRecordType: 'work_time_review_item',
          sourceRecordId: 'review-item-1',
          eventType: draft.eventType,
          targetStage: draft.targetStage ?? null
        })
      )
    const keys = keysOf(drafts)
    expect(new Set(keys).size).toBe(2)
    expect(keysOf(drafts)).toEqual(keys)
    expect(keys[0]).toContain('review-item-1')
    expect(keys[0]).toContain('to_edge_sewing')
    expect(keys[1]).toContain('to_packing')
  })

  it('不同来源记录之间键不会碰撞', () => {
    const first = createFulfillmentEventKey({
      sourceRecordType: 'work_time_review_item',
      sourceRecordId: 'review-item-1',
      eventType: 'edge_sewing_completed',
      targetStage: 'packing'
    })
    const second = createFulfillmentEventKey({
      sourceRecordType: 'work_time_review_item',
      sourceRecordId: 'review-item-2',
      eventType: 'edge_sewing_completed',
      targetStage: 'packing'
    })
    expect(first).not.toBe(second)
  })
})
