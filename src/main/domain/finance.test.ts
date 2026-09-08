import { describe, expect, it } from 'vitest'
import {
  calculatePendingReimbursementCents,
  summarizeMonthlyFinance,
  validateManualFinanceEntry,
  validateReimbursement
} from './finance'

describe('V2 日常财务领域规则', () => {
  it('严格按实际收付款日期归属自然月，并将报销付款排除在经营支出外', () => {
    const summary = summarizeMonthlyFinance({
      month: '2026-10',
      entries: [
        { id: 'rent', sourceType: 'manual_expense', direction: 'expense', amountCents: 3_000, occurredOn: '2026-10-03' },
        { id: 'september-income', sourceType: 'manual_income', direction: 'income', amountCents: 5_000, occurredOn: '2026-09-30' },
        { id: 'october-income', sourceType: 'order_fund', direction: 'income', amountCents: 8_000, occurredOn: '2026-10-05' },
        { id: 'reimbursement', sourceType: 'reimbursement', direction: 'expense', amountCents: 1_000, occurredOn: '2026-10-06' },
        { id: 'wage', sourceType: 'worker_settlement', direction: 'expense', amountCents: 2_000, occurredOn: '2026-10-07' }
      ]
    })

    expect(summary).toEqual({
      incomeCents: 8_000,
      operatingExpenseCents: 5_000,
      operatingResultCents: 3_000
    })
  })

  it('私人垫付原支出按原日期计入经营支出，整笔报销只产生一次且金额必须相等', () => {
    const advance = {
      id: 'advance-1',
      sourceType: 'manual_expense' as const,
      direction: 'expense' as const,
      amountCents: 3_000,
      occurredOn: '2026-09-30',
      paymentSource: 'private_advance' as const,
      advancePayerId: 'payer-1'
    }

    expect(() => validateReimbursement({
      advance,
      reimbursedOn: '2026-10-03',
      reimbursementAmountCents: 2_999,
      alreadyReimbursed: false
    })).toThrow('报销金额必须等于原私人垫付金额')
    expect(() => validateReimbursement({
      advance,
      reimbursedOn: '2026-10-03',
      reimbursementAmountCents: 3_000,
      alreadyReimbursed: true
    })).toThrow('该私人垫付已报销，不能重复报销')
    expect(() => validateReimbursement({
      advance,
      reimbursedOn: '2026-10-03',
      reimbursementAmountCents: 3_000,
      alreadyReimbursed: false
    })).not.toThrow()

    expect(calculatePendingReimbursementCents({
      asOf: '2026-10-02',
      advances: [advance],
      reimbursements: [{ advanceFinancialEntryId: 'advance-1', reimbursedOn: '2026-10-03' }]
    })).toBe(3_000)
    expect(calculatePendingReimbursementCents({
      asOf: '2026-10-03',
      advances: [advance],
      reimbursements: [{ advanceFinancialEntryId: 'advance-1', reimbursedOn: '2026-10-03' }]
    })).toBe(0)
  })

  it('日常支出不得关联订单，私人垫付必须选择启用垫付人，收入不携带付款来源', () => {
    expect(() => validateManualFinanceEntry({
      sourceType: 'manual_expense',
      direction: 'expense',
      amountCents: 500,
      occurredOn: '2026-10-03',
      categoryDirection: 'expense',
      categoryEnabled: true,
      paymentSource: 'private_advance',
      advancePayerId: null,
      advancePayerEnabled: null,
      orderId: null
    })).toThrow('私人垫付必须选择已启用的垫付人')
    expect(() => validateManualFinanceEntry({
      sourceType: 'manual_expense',
      direction: 'expense',
      amountCents: 500,
      occurredOn: '2026-10-03',
      categoryDirection: 'expense',
      categoryEnabled: true,
      paymentSource: 'business_account',
      advancePayerId: null,
      advancePayerEnabled: null,
      orderId: 'order-1'
    })).toThrow('日常支出不得关联订单')
    expect(() => validateManualFinanceEntry({
      sourceType: 'manual_income',
      direction: 'income',
      amountCents: 500,
      occurredOn: '2026-10-03',
      categoryDirection: 'income',
      categoryEnabled: true,
      paymentSource: 'business_account',
      advancePayerId: null,
      advancePayerEnabled: null,
      orderId: null
    })).toThrow('日常收入不得填写付款来源')
  })
})
