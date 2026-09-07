import type { Cents, V2OrderFundBusinessType, V2OrderFundDirection } from '@shared/contracts'
import { DomainValidationError } from './errors'

export type OrderFundDirection = V2OrderFundDirection
export type OrderFundBusinessType = V2OrderFundBusinessType

export interface OrderFundInput {
  direction: OrderFundDirection
  businessType: OrderFundBusinessType
  amountCents: Cents
  occurredOn: string
}

export interface OrderFundSummaryInput {
  currentAmountCents: Cents
  entries: Array<Pick<OrderFundInput, 'direction' | 'businessType' | 'amountCents'>>
}

export interface OrderFundSummary {
  receivedCents: Cents
  refundedCents: Cents
  netReceivedCents: Cents
  outstandingCents: Cents
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function assertIntegerCents(amountCents: Cents): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new DomainValidationError('资金金额必须是大于零的整数分')
  }
}

function assertDate(occurredOn: string): void {
  if (!DATE_PATTERN.test(occurredOn)) throw new DomainValidationError('实际发生日期格式必须为 YYYY-MM-DD')
  const date = new Date(`${occurredOn}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== occurredOn) {
    throw new DomainValidationError('实际发生日期无效')
  }
}

export function validateOrderFundInput(input: OrderFundInput): void {
  assertIntegerCents(input.amountCents)
  assertDate(input.occurredOn)
  const expectedDirection: OrderFundDirection = input.businessType === 'refund' ? 'expense' : 'income'
  if (input.direction !== expectedDirection) {
    throw new DomainValidationError(
      `${input.businessType === 'refund' ? '退款' : '收款/售后收费'}资金方向必须为${expectedDirection === 'income' ? '收入' : '支出'}`
    )
  }
}

export function calculateOrderFundSummary(input: OrderFundSummaryInput): OrderFundSummary {
  if (!Number.isInteger(input.currentAmountCents)) {
    throw new DomainValidationError('当前订单金额必须使用整数分')
  }
  let receivedCents = 0
  let refundedCents = 0
  for (const entry of input.entries) {
    validateOrderFundInput({ ...entry, occurredOn: '2026-01-01' })
    if (entry.direction === 'income') receivedCents += entry.amountCents
    else refundedCents += entry.amountCents
  }
  const netReceivedCents = receivedCents - refundedCents
  return {
    receivedCents,
    refundedCents,
    netReceivedCents,
    outstandingCents: input.currentAmountCents - netReceivedCents
  }
}

export interface OrderFundReversalInput {
  originalEntryId: string
  replacement: OrderFundInput
}

export function validateOrderFundReversal(input: OrderFundReversalInput): void {
  if (!input.originalEntryId.trim()) throw new DomainValidationError('冲正原资金记录不能为空')
  validateOrderFundInput(input.replacement)
}
