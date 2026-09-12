import { describe, expect, it } from 'vitest'
import {
  applyFulfillmentEvent,
  calculateTaskPlannedMinutes,
  createFulfillmentState,
  createOpeningWipEvent,
  createPackingCompletedEvent,
  createQualityQualifiedEvent,
  getShippableQuantity,
  processTaskSources,
  validateQualityInspection,
  validateProcessResult
} from './fulfillment'

describe('固定工序计划规则', () => {
  it('制作计划分钟由标准分钟乘数量加负责人额外预留，其他工序使用负责人填写分钟', () => {
    expect(
      calculateTaskPlannedMinutes({
        processType: 'making',
        plannedQuantity: 12,
        standardMakingMinutes: 15,
        extraMinutes: 20
      })
    ).toBe(200)
    expect(
      calculateTaskPlannedMinutes({
        processType: 'fluffing_bagging',
        plannedQuantity: 12,
        plannedMinutes: 90
      })
    ).toBe(90)
    expect(calculateTaskPlannedMinutes({ processType: 'shipping', plannedMinutes: 35 })).toBe(35)
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
        plannedQuantity: 3,
        plannedMinutes: -1
      })
    ).toThrow('计划分钟')
    expect(() =>
      calculateTaskPlannedMinutes({
        processType: 'packing',
        plannedQuantity: 3,
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

describe('完成、质检与履约数量流转', () => {
  it('质检必须一次确认完成申报的全部数量，制作和捏毛合格才进入下一阶段', () => {
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
    expect(createQualityQualifiedEvent('making', 8)).toMatchObject({
      eventType: 'making_qualified',
      sourceStage: 'making',
      targetStage: 'fluffing_bagging',
      quantity: 8
    })
    expect(createQualityQualifiedEvent('fluffing_bagging', 8)).toMatchObject({
      eventType: 'fluffing_bagging_qualified',
      sourceStage: 'fluffing_bagging',
      targetStage: 'packing',
      quantity: 8
    })
    expect(createPackingCompletedEvent(8)).toMatchObject({
      sourceStage: 'packing',
      targetStage: 'ready_to_ship'
    })
  })

  it('期初在制品和事件累计形成可发货量，且不允许任一来源阶段被扣成负数', () => {
    let state = createFulfillmentState(20)
    state = applyFulfillmentEvent(state, createOpeningWipEvent('packing', 4))
    state = applyFulfillmentEvent(state, createQualityQualifiedEvent('making', 10))
    state = applyFulfillmentEvent(state, createQualityQualifiedEvent('fluffing_bagging', 10))
    state = applyFulfillmentEvent(state, createPackingCompletedEvent(10))
    expect(getShippableQuantity(state)).toBe(10)
    state = applyFulfillmentEvent(state, {
      eventType: 'shipment',
      quantity: 6,
      sourceStage: 'ready_to_ship',
      targetStage: 'shipped'
    })
    expect(state).toMatchObject({ making: 6, packing: 4, readyToShip: 4, shipped: 6 })
    expect(() =>
      applyFulfillmentEvent(state, {
        eventType: 'shipment',
        quantity: 5,
        sourceStage: 'ready_to_ship',
        targetStage: 'shipped'
      })
    ).toThrow('可用数量不足')
  })
})
