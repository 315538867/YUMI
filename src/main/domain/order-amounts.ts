import type { Cents } from '@shared/contracts/index'
import { DomainValidationError } from './errors'

export interface OrderAmountSummaryInput {
  initialConfirmedAmountCents: Cents
  adjustmentsCents?: Cents[]
}

export interface OrderAmountSummary {
  initialConfirmedAmountCents: Cents
  adjustmentsCents: Cents
  currentAmountCents: Cents
}

function assertIntegerCents(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new DomainValidationError(`${label}必须使用整数分`) 
}

export function calculateOrderAmountSummary(input: OrderAmountSummaryInput): OrderAmountSummary {
  assertIntegerCents(input.initialConfirmedAmountCents, '初始确认金额')
  if (input.initialConfirmedAmountCents < 0) {
    throw new DomainValidationError('初始确认金额不能为负数')
  }
  const adjustmentsCents = (input.adjustmentsCents ?? []).reduce((total, amount, index) => {
    assertIntegerCents(amount, `第 ${index + 1} 笔金额调整`)
    if (amount === 0) throw new DomainValidationError('金额调整不能为零')
    return total + amount
  }, 0)
  return {
    initialConfirmedAmountCents: input.initialConfirmedAmountCents,
    adjustmentsCents,
    currentAmountCents: input.initialConfirmedAmountCents + adjustmentsCents
  }
}
