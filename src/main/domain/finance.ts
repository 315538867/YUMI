import type { Cents } from '@shared/contracts'
import { DomainValidationError } from './errors'

export const financeEntrySourceTypes = [
  'order_fund',
  'worker_settlement',
  'manual_income',
  'manual_expense',
  'reimbursement'
] as const

export type FinanceEntrySourceType = (typeof financeEntrySourceTypes)[number]
export type FinanceEntryDirection = 'income' | 'expense'
export type ExpensePaymentSource = 'business_account' | 'private_advance'

export interface FinanceEntryForSummary {
  id: string
  sourceType: FinanceEntrySourceType
  direction: FinanceEntryDirection
  amountCents: Cents
  occurredOn: string
}

export interface ManualFinanceEntryValidationInput {
  sourceType: 'manual_income' | 'manual_expense'
  direction: FinanceEntryDirection
  amountCents: Cents
  occurredOn: string
  categoryDirection: FinanceEntryDirection
  categoryEnabled: boolean
  paymentSource: ExpensePaymentSource | null
  advancePayerId: string | null
  advancePayerEnabled: boolean | null
  orderId: string | null
}

export interface PrivateAdvanceForReimbursement extends FinanceEntryForSummary {
  sourceType: 'manual_expense'
  direction: 'expense'
  paymentSource: 'private_advance'
  advancePayerId: string
}

export interface ReimbursementValidationInput {
  advance: PrivateAdvanceForReimbursement
  reimbursedOn: string
  reimbursementAmountCents: Cents
  alreadyReimbursed: boolean
}

export interface ReimbursementReference {
  advanceFinancialEntryId: string
  reimbursedOn: string
}

export interface PendingReimbursementInput {
  asOf: string
  advances: PrivateAdvanceForReimbursement[]
  reimbursements: ReimbursementReference[]
}

export interface MonthlyFinanceSummaryInput {
  month: string
  entries: FinanceEntryForSummary[]
}

export interface MonthlyFinanceSummary {
  incomeCents: Cents
  operatingExpenseCents: Cents
  operatingResultCents: Cents
}

function requireNonBlank(value: string | null | undefined, label: string): string {
  if (!value?.trim()) throw new DomainValidationError(`${label}不能为空`)
  return value.trim()
}

function requirePositiveCents(value: Cents, label: string): Cents {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DomainValidationError(`${label}必须是正整数分`)
  }
  return value
}

function requireBusinessDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new DomainValidationError(`${label}必须是有效日期`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DomainValidationError(`${label}必须是有效日期`)
  }
  return value
}

function requireMonth(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new DomainValidationError('财务月份必须是 YYYY-MM')
  const month = Number(value.slice(5, 7))
  if (month < 1 || month > 12) throw new DomainValidationError('财务月份必须是 YYYY-MM')
  return value
}

function requirePrivateAdvance(advance: PrivateAdvanceForReimbursement): void {
  if (advance.sourceType !== 'manual_expense' || advance.direction !== 'expense') {
    throw new DomainValidationError('报销对象必须是私人垫付日常支出')
  }
  if (advance.paymentSource !== 'private_advance' || !advance.advancePayerId.trim()) {
    throw new DomainValidationError('报销对象必须是私人垫付日常支出')
  }
  requirePositiveCents(advance.amountCents, '原私人垫付金额')
  requireBusinessDate(advance.occurredOn, '原私人垫付日期')
}

/** 校验负责人创建的手工日常收入或支出；订单资金和工资流水不经过本规则。 */
export function validateManualFinanceEntry(input: ManualFinanceEntryValidationInput): void {
  requirePositiveCents(input.amountCents, '金额')
  requireBusinessDate(input.occurredOn, '实际收付款日期')
  if (!input.categoryEnabled) throw new DomainValidationError('收支类目已停用，不能用于新流水')
  if (input.sourceType === 'manual_income') {
    if (input.direction !== 'income' || input.categoryDirection !== 'income') {
      throw new DomainValidationError('日常收入必须使用收入方向类目')
    }
    if (input.paymentSource !== null || input.advancePayerId !== null) {
      throw new DomainValidationError('日常收入不得填写付款来源')
    }
  } else {
    if (input.direction !== 'expense' || input.categoryDirection !== 'expense') {
      throw new DomainValidationError('日常支出必须使用支出方向类目')
    }
    if (input.paymentSource === 'private_advance') {
      if (!input.advancePayerId?.trim() || input.advancePayerEnabled !== true) {
        throw new DomainValidationError('私人垫付必须选择已启用的垫付人')
      }
    } else if (input.paymentSource === 'business_account') {
      if (input.advancePayerId !== null) {
        throw new DomainValidationError('公账支出不得关联垫付人')
      }
    } else {
      throw new DomainValidationError('日常支出必须选择公账支出或私人垫付')
    }
  }
  if (input.orderId !== null) {
    throw new DomainValidationError(input.sourceType === 'manual_expense' ? '日常支出不得关联订单' : '日常收入不得关联订单')
  }
}

/** 报销只能覆盖一笔尚未报销的私人垫付，金额与原垫付完全相同。 */
export function validateReimbursement(input: ReimbursementValidationInput): void {
  requirePrivateAdvance(input.advance)
  requireBusinessDate(input.reimbursedOn, '报销日期')
  requirePositiveCents(input.reimbursementAmountCents, '报销金额')
  if (input.reimbursedOn < input.advance.occurredOn) {
    throw new DomainValidationError('报销日期不能早于原私人垫付日期')
  }
  if (input.alreadyReimbursed) throw new DomainValidationError('该私人垫付已报销，不能重复报销')
  if (input.reimbursementAmountCents !== input.advance.amountCents) {
    throw new DomainValidationError('报销金额必须等于原私人垫付金额')
  }
}

/** 报销是一笔现金付款，但不能重复记为经营支出。 */
export function isOperatingExpense(entry: FinanceEntryForSummary): boolean {
  return entry.direction === 'expense' && entry.sourceType !== 'reimbursement'
}

/** 所有收入按实际收款日期计入经营收入。 */
export function isOperatingIncome(entry: FinanceEntryForSummary): boolean {
  return entry.direction === 'income'
}

export function summarizeMonthlyFinance(input: MonthlyFinanceSummaryInput): MonthlyFinanceSummary {
  const month = requireMonth(input.month)
  return input.entries.reduce<MonthlyFinanceSummary>((summary, entry) => {
    requireNonBlank(entry.id, '财务流水标识')
    requirePositiveCents(entry.amountCents, '财务流水金额')
    const occurredOn = requireBusinessDate(entry.occurredOn, '财务流水实际日期')
    if (!occurredOn.startsWith(`${month}-`)) return summary
    if (isOperatingIncome(entry)) summary.incomeCents += entry.amountCents
    if (isOperatingExpense(entry)) summary.operatingExpenseCents += entry.amountCents
    summary.operatingResultCents = summary.incomeCents - summary.operatingExpenseCents
    return summary
  }, { incomeCents: 0, operatingExpenseCents: 0, operatingResultCents: 0 })
}

/** 截至查询日，原垫付发生且尚无当日或更早完整报销的金额即为待报销。 */
export function calculatePendingReimbursementCents(input: PendingReimbursementInput): Cents {
  const asOf = requireBusinessDate(input.asOf, '查询截至日期')
  const reimbursementByAdvance = new Map<string, ReimbursementReference>()
  for (const reimbursement of input.reimbursements) {
    requireNonBlank(reimbursement.advanceFinancialEntryId, '报销关联的私人垫付标识')
    requireBusinessDate(reimbursement.reimbursedOn, '报销日期')
    if (reimbursementByAdvance.has(reimbursement.advanceFinancialEntryId)) {
      throw new DomainValidationError('同一私人垫付只能对应一笔报销')
    }
    reimbursementByAdvance.set(reimbursement.advanceFinancialEntryId, reimbursement)
  }

  return input.advances.reduce<Cents>((total, advance) => {
    requirePrivateAdvance(advance)
    if (advance.occurredOn > asOf) return total
    const reimbursement = reimbursementByAdvance.get(advance.id)
    if (!reimbursement || reimbursement.reimbursedOn > asOf) return total + advance.amountCents
    if (reimbursement.reimbursedOn < advance.occurredOn) {
      throw new DomainValidationError('报销日期不能早于原私人垫付日期')
    }
    return total
  }, 0)
}
