import { describe, expect, it } from 'vitest'
import {
  calculateOrderAmountSummary,
  calculateOrderItemAmounts,
  createOrderAmountCalculation,
  normalizeOrderEdge
} from './order-amount'

describe('共享订单金额公式', () => {
  it('按商品金额、缝边金额、明细优惠和订单优惠计算订单金额', () => {
    expect(
      calculateOrderAmountSummary({
        items: [
          {
            quantity: 10,
            unitPriceCents: 100,
            edge: { enabled: true, unitPriceCents: 15 },
            itemDiscountCents: 40
          },
          { quantity: 2, unitPriceCents: 200 }
        ],
        orderDiscountCents: 50,
        adjustmentsCents: [800, -300]
      })
    ).toEqual({
      itemAmountCents: 1_400,
      edgeAmountCents: 150,
      itemDiscountCents: 40,
      orderDiscountCents: 50,
      orderAmountCents: 1_460,
      adjustmentsCents: 500,
      currentAmountCents: 1_960
    })
  })

  it('勾选缝边默认全量且允许部分数量，未勾选时归零', () => {
    expect(
      calculateOrderItemAmounts({
        quantity: 10,
        unitPriceCents: 100,
        edge: { enabled: true, unitPriceCents: 15 }
      }).edge
    ).toEqual({ enabled: true, quantity: 10, unitPriceCents: 15 })
    expect(normalizeOrderEdge({ enabled: true, quantity: 6, unitPriceCents: 15 }, 10)).toEqual({
      enabled: true,
      quantity: 6,
      unitPriceCents: 15
    })
    expect(normalizeOrderEdge({ enabled: false, quantity: 10, unitPriceCents: 999 }, 10)).toEqual({
      enabled: false,
      quantity: 0,
      unitPriceCents: 0
    })
  })

  it('拒绝超量缝边与超过明细的优惠', () => {
    expect(() =>
      calculateOrderItemAmounts({
        quantity: 1,
        unitPriceCents: 100,
        edge: { enabled: true, quantity: 2, unitPriceCents: 1 }
      })
    ).toThrow('缝边数量不能超过商品数量')
    expect(() =>
      calculateOrderItemAmounts({ quantity: 1, unitPriceCents: 100, itemDiscountCents: 101 })
    ).toThrow('明细优惠不能超过明细金额')
  })

  it('生成商品与缝边小计、优惠与预计订单金额的公式展示', () => {
    const calculation = createOrderAmountCalculation({
      items: [
        {
          quantity: 10,
          unitPriceCents: 100,
          edge: { enabled: true, unitPriceCents: 15 },
          itemDiscountCents: 40
        },
        { quantity: 2, unitPriceCents: 200 }
      ],
      orderDiscountCents: 50
    })

    expect(calculation.summary.orderAmountCents).toBe(1_460)
    expect(calculation.itemAndEdge.amountCents).toBe(1_550)
    expect(calculation.itemAndEdge.label).toBe('商品与缝边小计')
    expect(calculation.itemAndEdge.expression).toBe('商品金额合计 + 缝边金额合计')
    expect(calculation.itemAndEdge.substitutedExpression).toBe('14.00 + 1.50 = 15.50')
    expect(calculation.itemDiscount.amountCents).toBe(40)
    expect(calculation.orderDiscount.amountCents).toBe(50)
    expect(calculation.orderAmount.label).toBe('预计订单金额')
    expect(calculation.orderAmount.expression).toBe('商品与缝边小计 − 明细优惠合计 − 订单优惠')
    expect(calculation.orderAmount.substitutedExpression).toBe('15.50 − 0.40 − 0.50 = 14.60')
  })

  it('未勾选缝边时缝边金额合计为零且公式代入稳定', () => {
    const calculation = createOrderAmountCalculation({
      items: [{ quantity: 3, unitPriceCents: 500 }]
    })
    expect(calculation.itemAndEdge.amountCents).toBe(1_500)
    expect(calculation.itemAndEdge.substitutedExpression).toBe('15.00 + 0.00 = 15.00')
    expect(calculation.orderAmount.amountCents).toBe(1_500)
  })
})
