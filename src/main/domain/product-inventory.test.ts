import { describe, expect, it } from 'vitest'
import {
  applyProductInventoryEvent,
  createAdjustmentEventDraft,
  createAllocationEventDraft,
  createEmptyProductStageBalances,
  createOpeningEventDraft
} from './product-inventory'

describe('商品阶段存量流水', () => {
  it('空余额从零开始，期初与调整按流水累加', () => {
    let balances = createEmptyProductStageBalances()
    balances = applyProductInventoryEvent(
      balances,
      createOpeningEventDraft({ stage: 'made', quantity: 100, occurredOn: '2026-09-14' })
    )
    balances = applyProductInventoryEvent(
      balances,
      createOpeningEventDraft({
        stage: 'fluffing_bagging_done',
        quantity: 30,
        occurredOn: '2026-09-14'
      })
    )
    balances = applyProductInventoryEvent(
      balances,
      createAdjustmentEventDraft({
        stage: 'made',
        quantityDelta: -10,
        occurredOn: '2026-09-14',
        note: '现场校正'
      })
    )
    expect(balances).toEqual({
      made: 90,
      fluffing_bagging_done: 30,
      edge_sewing_done: 0,
      packed: 0
    })
  })

  it('减少超过当前余额时拒绝并保持原余额', () => {
    const balances = applyProductInventoryEvent(
      createEmptyProductStageBalances(),
      createOpeningEventDraft({ stage: 'packed', quantity: 20, occurredOn: '2026-09-14' })
    )
    expect(() =>
      applyProductInventoryEvent(
        balances,
        createAdjustmentEventDraft({
          stage: 'packed',
          quantityDelta: -21,
          occurredOn: '2026-09-14',
          note: '减少超过余额'
        })
      )
    ).toThrow('商品存量余额不能为负')
    expect(balances.packed).toBe(20)
  })

  it('投入订单产生负向流水并保留订单商品关联', () => {
    const allocation = createAllocationEventDraft({
      stage: 'edge_sewing_done',
      quantity: 12,
      orderItemId: 'item-1',
      occurredOn: '2026-09-14'
    })
    expect(allocation).toMatchObject({
      stage: 'edge_sewing_done',
      quantityDelta: -12,
      sourceType: 'order_allocation',
      orderItemId: 'item-1'
    })
  })

  it('拒绝零增减、非法阶段和空调整原因', () => {
    expect(() =>
      applyProductInventoryEvent(createEmptyProductStageBalances(), {
        stage: 'made',
        quantityDelta: 0,
        sourceType: 'opening',
        occurredOn: '2026-09-14'
      })
    ).toThrow('必须是非零整数')
    expect(() =>
      applyProductInventoryEvent(createEmptyProductStageBalances(), {
        stage: 'unknown' as never,
        quantityDelta: 1,
        sourceType: 'opening',
        occurredOn: '2026-09-14'
      })
    ).toThrow('商品存量阶段不合法')
    expect(() =>
      createAdjustmentEventDraft({
        stage: 'made',
        quantityDelta: 1,
        occurredOn: '2026-09-14',
        note: '   '
      })
    ).toThrow('调整原因不能为空')
    expect(() =>
      createOpeningEventDraft({ stage: 'made', quantity: -1, occurredOn: '2026-09-14' })
    ).toThrow('必须是正整数')
  })
})
