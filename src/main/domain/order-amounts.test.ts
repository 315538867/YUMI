import { describe, expect, it } from 'vitest'
import { calculateOrderAmountSummary } from './order-amounts'


describe('V2 订单金额', () => {
  it('以初始确认金额加金额调整得到当前金额，全部使用整数分', () => {
    expect(
      calculateOrderAmountSummary({
        initialConfirmedAmountCents: 100_000,
        adjustmentsCents: [8_000, -3_000]
      })
    ).toEqual({
      initialConfirmedAmountCents: 100_000,
      adjustmentsCents: 5_000,
      currentAmountCents: 105_000
    })
  })

  it('拒绝零金额调整和非整数分', () => {
    expect(() => calculateOrderAmountSummary({ initialConfirmedAmountCents: 100, adjustmentsCents: [0] })).toThrow(
      '金额调整不能为零'
    )
    expect(() => calculateOrderAmountSummary({ initialConfirmedAmountCents: 100.5 })).toThrow(
      '初始确认金额必须使用整数分'
    )
  })
})
