import { describe, expect, it } from 'vitest'
import {
  calculateOrderFundSummary,
  validateOrderFundInput,
  validateOrderFundReversal
} from './order-funds'

describe('V2 订单资金', () => {
  it('计算收款、退款和净收款，不使用预计收款计划', () => {
    expect(
      calculateOrderFundSummary({
        currentAmountCents: 128_000,
        entries: [
          { direction: 'income', businessType: 'payment', amountCents: 80_000 },
          { direction: 'expense', businessType: 'refund', amountCents: 10_000 }
        ]
      })
    ).toEqual({
      receivedCents: 80_000,
      refundedCents: 10_000,
      netReceivedCents: 70_000,
      outstandingCents: 58_000
    })
  })

  it('校验金额、日期和资金方向', () => {
    expect(() =>
      validateOrderFundInput({
        direction: 'expense',
        businessType: 'refund',
        amountCents: 0,
        occurredOn: '2026-09-07'
      })
    ).toThrow('大于零')
    expect(() =>
      validateOrderFundInput({
        direction: 'income',
        businessType: 'refund',
        amountCents: 100,
        occurredOn: '2026-09-07'
      })
    ).toThrow('资金方向')
    expect(() =>
      validateOrderFundInput({
        direction: 'income',
        businessType: 'payment',
        amountCents: 100,
        occurredOn: '2026-02-30'
      })
    ).toThrow('日期无效')
  })

  it('冲正必须保留原记录标识并校验替代记录', () => {
    expect(() =>
      validateOrderFundReversal({
        originalEntryId: ' ',
        replacement: {
          direction: 'income',
          businessType: 'payment',
          amountCents: 100,
          occurredOn: '2026-09-07'
        }
      })
    ).toThrow('原资金记录')
    expect(() =>
      validateOrderFundReversal({
        originalEntryId: 'payment-1',
        replacement: {
          direction: 'income',
          businessType: 'payment',
          amountCents: 100,
          occurredOn: '2026-09-07'
        }
      })
    ).not.toThrow()
  })
})
