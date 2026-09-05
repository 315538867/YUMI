import { describe, expect, it } from 'vitest'
import {
  assertProductionStatusTransition,
  calculatePaymentSummary,
  calculateProductionDeadline
} from './orders'

describe('订单资金和交期计算', () => {
  it('支持分次收款、退款，并计算净收款和待收金额', () => {
    const summary = calculatePaymentSummary({
      receivable: 1280,
      receipts: [500, 780],
      refunds: [100]
    })

    expect(summary.receivedNet).toBe(1180)
    expect(summary.refunded).toBe(100)
    expect(summary.outstanding).toBe(100)
    expect(summary.status).toBe('refunding')
  })

  it('覆盖未收款、部分收款、已结清、退款中、已退款和超收状态', () => {
    expect(calculatePaymentSummary({ receivable: 100, receipts: [], refunds: [] }).status).toBe(
      'unpaid'
    )
    expect(calculatePaymentSummary({ receivable: 100, receipts: [40], refunds: [] }).status).toBe(
      'partial'
    )
    expect(calculatePaymentSummary({ receivable: 100, receipts: [100], refunds: [] }).status).toBe(
      'paid'
    )
    expect(
      calculatePaymentSummary({ receivable: 100, receipts: [100], refunds: [30] }).status
    ).toBe('refunding')
    expect(
      calculatePaymentSummary({ receivable: 100, receipts: [100], refunds: [100] }).status
    ).toBe('refunded')
    expect(calculatePaymentSummary({ receivable: 100, receipts: [101], refunds: [] }).status).toBe(
      'overpaid'
    )
  })

  it('仅允许按制作流程变更订单状态', () => {
    expect(() => assertProductionStatusTransition('pending_confirmation', 'in_production')).toThrow(
      '订单制作状态不允许从 pending_confirmation 变更为 in_production'
    )
    expect(() =>
      assertProductionStatusTransition('pending_confirmation', 'pending_schedule')
    ).not.toThrow()
    expect(() => assertProductionStatusTransition('pending_shipment', 'completed')).not.toThrow()
  })

  it('根据预计发货日减去预留天数计算制作截止日期', () => {
    expect(calculateProductionDeadline('2026-09-15', 2)).toBe('2026-09-13')
  })
})
