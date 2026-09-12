import type { BusinessDate, Cents, IsoDateTime } from './common'

export type V2FinanceDirection = 'income' | 'expense'
export type V2FinanceEntrySourceType =
  'order_fund' | 'worker_settlement' | 'manual_income' | 'manual_expense' | 'reimbursement'
export type V2ExpensePaymentSource = 'business_account' | 'private_advance'

export interface V2FinanceCategory {
  id: string
  direction: V2FinanceDirection
  name: string
  enabled: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2FinanceCategoryCreateInput {
  direction: V2FinanceDirection
  name: string
}

export interface V2FinanceCategoryUpdateInput {
  name?: string
  enabled?: boolean
}

export interface V2AdvancePayer {
  id: string
  name: string
  enabled: boolean
  note: string | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface V2AdvancePayerCreateInput {
  name: string
  note?: string | null
}

export interface V2AdvancePayerUpdateInput {
  name?: string
  enabled?: boolean
  note?: string | null
}

/** 所有现金事实统一读取；手工日常收支没有订单关联。 */
export interface V2FinancialEntry {
  id: string
  sourceType: V2FinanceEntrySourceType
  direction: V2FinanceDirection
  businessType: string
  amountCents: Cents
  occurredOn: BusinessDate
  paymentMethod: string | null
  paymentSource: V2ExpensePaymentSource | null
  categoryId: string | null
  categoryName: string | null
  advancePayerId: string | null
  advancePayerName: string | null
  orderId: string | null
  attachmentId: string | null
  reversalOfEntryId: string | null
  note: string | null
  createdAt: IsoDateTime
}

export interface V2FinanceEntryQuery {
  direction?: V2FinanceDirection
  sourceType?: V2FinanceEntrySourceType
  fromOn?: BusinessDate
  toOn?: BusinessDate
}

export interface V2ManualIncomeInput {
  amountCents: Cents
  occurredOn: BusinessDate
  categoryId: string
  paymentMethod?: string | null
  note?: string | null
}

export interface V2ManualExpenseInput {
  amountCents: Cents
  occurredOn: BusinessDate
  categoryId: string
  paymentSource: V2ExpensePaymentSource
  advancePayerId?: string | null
  paymentMethod?: string | null
  note?: string | null
}

export interface V2ReimbursementInput {
  advanceFinancialEntryId: string
  reimbursedOn: BusinessDate
  paymentMethod?: string | null
  note?: string | null
}

/** 一次确认多笔私人垫付；服务必须先完成全量校验，再以单一事务写入。 */
export interface V2BatchReimbursementInput {
  advanceFinancialEntryIds: string[]
  reimbursedOn: BusinessDate
  paymentMethod?: string | null
  note?: string | null
}

export interface V2BatchReimbursementResult {
  entries: V2FinancialEntry[]
  totalAmountCents: Cents
}

export interface V2PendingReimbursement {
  financialEntryId: string
  amountCents: Cents
  occurredOn: BusinessDate
  categoryId: string | null
  categoryName: string | null
  advancePayerId: string
  advancePayerName: string | null
  note: string | null
}

export interface V2MonthlyFinanceSummary {
  incomeCents: Cents
  operatingExpenseCents: Cents
  operatingResultCents: Cents
}
