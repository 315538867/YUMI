/**
 * 财务域夹具工厂：收支类目、私人垫付人、财务流水、待报销（任务 1.6）。
 */
import type {
  V2AdvancePayer,
  V2FinanceCategory,
  V2FinancialEntry,
  V2PendingReimbursement
} from '@shared/contracts/index'
import { EXTREME_AMOUNTS, LONG_TEXT, NULL_TEXT_SAMPLES } from './edge-values'
import { atFixedHour, shiftDate } from './determinism'
import type { FactoryContext } from './context'

const INCOME_CATEGORY_NAMES = ['订单收款', '售后收费', '手工体验课收入', '线上零售收入'] as const
const EXPENSE_CATEGORY_NAMES = [
  '原材料采购',
  LONG_TEXT.categoryName,
  '快递与包材',
  '场地与水电'
] as const
const PAYER_NAMES = ['陈老板', '赵姐', '孙哥'] as const

/** 前四个是收入类目，后四个是支出类目；索引 3 刻意停用。 */
export const buildFinanceCategoryFixtures = (
  context: FactoryContext,
  total: number
): V2FinanceCategory[] =>
  Array.from({ length: total }, (_, index) => {
    const { nextId, today } = context
    const direction = index < total / 2 ? 'income' : 'expense'
    const names = direction === 'income' ? INCOME_CATEGORY_NAMES : EXPENSE_CATEGORY_NAMES
    const createdAt = atFixedHour(shiftDate(today, -(index + 5)), 9)
    return {
      id: nextId('category'),
      direction,
      name: names[index % names.length] ?? `类目${index}`,
      enabled: index % 7 !== 3,
      createdAt,
      updatedAt: createdAt
    }
  })

/** 索引 2 刻意停用，索引 0 使用长备注。 */
export const buildAdvancePayerFixtures = (
  context: FactoryContext,
  total: number
): V2AdvancePayer[] =>
  Array.from({ length: total }, (_, index) => {
    const { nextId, today } = context
    const createdAt = atFixedHour(shiftDate(today, -(index + 8)), 9)
    return {
      id: nextId('payer'),
      name: PAYER_NAMES[index % PAYER_NAMES.length] ?? `垫付人${index}`,
      enabled: index !== 2,
      note: index === 0 ? LONG_TEXT.payerNote : NULL_TEXT_SAMPLES.notes,
      createdAt,
      updatedAt: createdAt
    }
  })

/** 索引 1 用极大金额，每隔四条产生一笔私人垫付，每隔九条产生一笔冲正。 */
export const buildFinancialEntryFixtures = (
  context: FactoryContext,
  total: number,
  categories: V2FinanceCategory[],
  payers: V2AdvancePayer[]
): V2FinancialEntry[] =>
  Array.from({ length: total }, (_, index) => {
    const { nextId, today } = context
    const direction = index % 3 === 0 ? 'income' : 'expense'
    const category =
      categories.find((item) => item.direction === direction) ?? categories[0] ?? null
    const privateAdvance = direction === 'expense' && index % 3 === 1
    const payer = payers[index % payers.length] ?? null
    const occurredOn = shiftDate(today, -(index % 20))
    return {
      id: nextId('finance-entry'),
      sourceType: direction === 'income' ? 'manual_income' : 'manual_expense',
      direction,
      businessType: direction === 'income' ? 'manual_income' : 'manual_expense',
      amountCents: index === 1 ? EXTREME_AMOUNTS.huge : 1500 + index * 260,
      occurredOn,
      paymentMethod: index % 2 === 0 ? '微信' : '银行转账',
      paymentSource:
        direction === 'expense' ? (privateAdvance ? 'private_advance' : 'business_account') : null,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      advancePayerId: privateAdvance ? (payer?.id ?? null) : null,
      advancePayerName: privateAdvance ? (payer?.name ?? null) : null,
      orderId: null,
      attachmentId: null,
      reversalOfEntryId: index % 9 === 8 ? 'finance-entry-0001' : null,
      note: index % 5 === 0 ? LONG_TEXT.payerNote : null,
      createdAt: atFixedHour(occurredOn, 17)
    }
  })

/** 待报销只取私人垫付的支出流水，保证与流水一一对应。 */
export const buildPendingReimbursementFixtures = (
  entries: V2FinancialEntry[],
  total: number
): V2PendingReimbursement[] =>
  entries
    .filter((entry) => entry.paymentSource === 'private_advance')
    .slice(0, total)
    .map((entry) => ({
      financialEntryId: entry.id,
      amountCents: entry.amountCents,
      occurredOn: entry.occurredOn,
      categoryId: entry.categoryId,
      categoryName: entry.categoryName,
      advancePayerId: entry.advancePayerId ?? 'payer-missing',
      advancePayerName: entry.advancePayerName,
      note: entry.note
    }))
