import { describe, expect, it } from 'vitest'
import {
  calculateOrderAmountSummary,
  calculateOrderItemAmounts,
  normalizeOrderEdge
} from './order-amounts'

describe('V2 订单金额', () => {
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
      itemAmountCents: 1400,
      edgeAmountCents: 150,
      itemDiscountCents: 40,
      orderDiscountCents: 50,
      orderAmountCents: 1460,
      adjustmentsCents: 500,
      currentAmountCents: 1960
    })
  })

  it('勾选缝边默认全量，且可以改成不超过商品数量的数量', () => {
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
  })

  it('未勾选缝边时强制归零，不读取商品缝边价格', () => {
    expect(normalizeOrderEdge({ enabled: false, quantity: 10, unitPriceCents: 999 }, 10)).toEqual({
      enabled: false,
      quantity: 0,
      unitPriceCents: 0
    })
  })

  it('拒绝负数、超量缝边和超过明细的优惠', () => {
    expect(() => calculateOrderItemAmounts({ quantity: 1, unitPriceCents: -1 })).toThrow(
      '成交单价不能为负数'
    )
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
    expect(() =>
      calculateOrderAmountSummary({
        items: [{ quantity: 1, unitPriceCents: 100 }],
        orderDiscountCents: 101
      })
    ).toThrow('订单优惠不能超过订单金额')
  })

  it('拒绝零金额调整和非整数分', () => {
    expect(() =>
      calculateOrderAmountSummary({
        items: [{ quantity: 1, unitPriceCents: 100 }],
        adjustmentsCents: [0]
      })
    ).toThrow('金额调整不能为零')
    expect(() =>
      calculateOrderAmountSummary({ items: [{ quantity: 1, unitPriceCents: 100.5 }] })
    ).toThrow('成交单价必须使用整数分')
  })
})
