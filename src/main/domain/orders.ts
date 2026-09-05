import { addDays, format, isValid, parseISO } from 'date-fns'
import { requirePositive } from './errors'

export type FinancialStatus = 'unpaid' | 'partial' | 'paid' | 'refunding' | 'refunded' | 'overpaid'

export interface PaymentSummaryInput {
  receivable: number
  receipts: number[]
  refunds: number[]
}

export interface PaymentSummary {
  receivable: number
  received: number
  refunded: number
  receivedNet: number
  outstanding: number
  status: FinancialStatus
}

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

export function calculatePaymentSummary(input: PaymentSummaryInput): PaymentSummary {
  requirePositive(input.receivable, '订单应收', true)
  input.receipts.forEach((amount) => requirePositive(amount, '收款金额'))
  input.refunds.forEach((amount) => requirePositive(amount, '退款金额'))

  const received = roundMoney(input.receipts.reduce((total, value) => total + value, 0))
  const refunded = roundMoney(input.refunds.reduce((total, value) => total + value, 0))
  const receivedNet = roundMoney(received - refunded)
  const outstanding = roundMoney(input.receivable - receivedNet)

  let status: FinancialStatus
  if (received === 0 && refunded === 0) status = 'unpaid'
  else if (receivedNet <= 0 && refunded > 0) status = 'refunded'
  else if (receivedNet > input.receivable) status = 'overpaid'
  else if (receivedNet === input.receivable) status = 'paid'
  else if (refunded > 0) status = 'refunding'
  else status = 'partial'

  return { receivable: input.receivable, received, refunded, receivedNet, outstanding, status }
}

export function calculateProductionDeadline(expectedShipDate: string, reserveDays: number): string {
  requirePositive(reserveDays, '预留天数', true)
  const date = parseISO(expectedShipDate)
  if (!isValid(date) || !/^\d{4}-\d{2}-\d{2}$/.test(expectedShipDate)) {
    throw new Error('预计发货日期格式必须为 YYYY-MM-DD')
  }
  return format(addDays(date, -reserveDays), 'yyyy-MM-dd')
}

export type ProductionStatus =
  | 'pending_confirmation'
  | 'pending_schedule'
  | 'in_production'
  | 'pending_shipment'
  | 'completed'
  | 'cancelled'

const productionStatusTransitions: Record<ProductionStatus, ProductionStatus[]> = {
  pending_confirmation: ['pending_schedule', 'cancelled'],
  pending_schedule: ['in_production', 'cancelled'],
  in_production: ['pending_shipment', 'cancelled'],
  pending_shipment: ['in_production', 'completed', 'cancelled'],
  completed: [],
  cancelled: []
}

export function assertProductionStatusTransition(
  current: ProductionStatus,
  next: ProductionStatus
): void {
  if (current === next) return
  if (!productionStatusTransitions[current].includes(next)) {
    throw new Error(`订单制作状态不允许从 ${current} 变更为 ${next}`)
  }
}
