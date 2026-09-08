import { randomUUID } from 'node:crypto'
import type { V2Database } from '@main/database/v2-connection'
import {
  calculatePendingReimbursementCents,
  summarizeMonthlyFinance,
  validateManualFinanceEntry,
  validateReimbursement
} from '@main/domain/finance'
import { DomainValidationError } from '@main/domain/errors'
import { FinanceRepository, type FinanceEntryInsert } from '@main/repositories/finance-repository'
import type {
  V2AdvancePayer,
  V2AdvancePayerCreateInput,
  V2AdvancePayerUpdateInput,
  V2FinanceCategory,
  V2FinanceCategoryCreateInput,
  V2FinanceCategoryUpdateInput,
  V2FinanceDirection,
  V2FinanceEntryQuery,
  V2FinancialEntry,
  V2ManualExpenseInput,
  V2ManualIncomeInput,
  V2MonthlyFinanceSummary,
  V2PendingReimbursement,
  V2ReimbursementInput
} from '@shared/contracts'

interface FinanceClock {
  createId(): string
  now(): string
}

const defaultClock: FinanceClock = { createId: randomUUID, now: () => new Date().toISOString() }
const financeDirections: readonly V2FinanceDirection[] = ['income', 'expense']

function requireText(value: string | null | undefined, label: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new DomainValidationError(`${label}不能为空`)
  return normalized
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized || null
}

function requireId(value: string, label: string): string {
  return requireText(value, label)
}

function requireDirection(value: V2FinanceDirection): V2FinanceDirection {
  if (!financeDirections.includes(value)) throw new DomainValidationError('收支方向不合法')
  return value
}

function toEntry(insert: FinanceEntryInsert): V2FinancialEntry {
  return { ...insert, categoryName: null, advancePayerName: null }
}

export class FinanceService {
  private readonly repository: FinanceRepository

  constructor(database: V2Database, private readonly clock: FinanceClock = defaultClock) {
    this.repository = new FinanceRepository(database)
  }

  listCategories(direction?: V2FinanceDirection, includeDisabled = false): V2FinanceCategory[] {
    if (direction !== undefined) requireDirection(direction)
    return this.repository.listCategories(direction, includeDisabled)
  }

  createCategory(input: V2FinanceCategoryCreateInput): V2FinanceCategory {
    const direction = requireDirection(input.direction)
    const name = requireText(input.name, '类目名称')
    return this.repository.transaction(() => {
      const now = this.clock.now()
      const category: V2FinanceCategory = { id: this.clock.createId(), direction, name, enabled: true, createdAt: now, updatedAt: now }
      this.repository.insertCategory(category)
      this.audit('finance.category_created', 'finance_category', category.id, undefined, category, now)
      return category
    })
  }

  updateCategory(id: string, input: V2FinanceCategoryUpdateInput): V2FinanceCategory {
    return this.repository.transaction(() => {
      const before = this.requireCategory(id)
      const category = {
        ...before,
        name: input.name === undefined ? before.name : requireText(input.name, '类目名称'),
        enabled: input.enabled === undefined ? before.enabled : Boolean(input.enabled),
        updatedAt: this.clock.now()
      }
      this.repository.updateCategory(category)
      this.audit('finance.category_updated', 'finance_category', category.id, before, category, category.updatedAt)
      return category
    })
  }

  deleteCategory(id: string): void {
    this.repository.transaction(() => {
      const before = this.requireCategory(id)
      if (this.repository.isCategoryReferenced(before.id)) throw new DomainValidationError('收支类目已被财务流水引用，不能删除')
      this.repository.deleteCategory(before.id)
      this.audit('finance.category_deleted', 'finance_category', before.id, before, undefined, this.clock.now())
    })
  }

  listAdvancePayers(includeDisabled = false): V2AdvancePayer[] {
    return this.repository.listAdvancePayers(includeDisabled)
  }

  createAdvancePayer(input: V2AdvancePayerCreateInput): V2AdvancePayer {
    const name = requireText(input.name, '垫付人名称')
    return this.repository.transaction(() => {
      const now = this.clock.now()
      const payer: V2AdvancePayer = {
        id: this.clock.createId(), name, enabled: true, note: nullableText(input.note), createdAt: now, updatedAt: now
      }
      this.repository.insertAdvancePayer(payer)
      this.audit('finance.advance_payer_created', 'advance_payer', payer.id, undefined, payer, now)
      return payer
    })
  }

  updateAdvancePayer(id: string, input: V2AdvancePayerUpdateInput): V2AdvancePayer {
    return this.repository.transaction(() => {
      const before = this.requireAdvancePayer(id)
      const payer: V2AdvancePayer = {
        ...before,
        name: input.name === undefined ? before.name : requireText(input.name, '垫付人名称'),
        enabled: input.enabled === undefined ? before.enabled : Boolean(input.enabled),
        note: input.note === undefined ? before.note : nullableText(input.note), updatedAt: this.clock.now()
      }
      this.repository.updateAdvancePayer(payer)
      this.audit('finance.advance_payer_updated', 'advance_payer', payer.id, before, payer, payer.updatedAt)
      return payer
    })
  }

  deleteAdvancePayer(id: string): void {
    this.repository.transaction(() => {
      const before = this.requireAdvancePayer(id)
      if (this.repository.isAdvancePayerReferenced(before.id)) throw new DomainValidationError('垫付人已被财务流水引用，不能删除')
      this.repository.deleteAdvancePayer(before.id)
      this.audit('finance.advance_payer_deleted', 'advance_payer', before.id, before, undefined, this.clock.now())
    })
  }

  listEntries(query?: V2FinanceEntryQuery): V2FinancialEntry[] {
    return this.repository.listFinancialEntries(query)
  }

  createManualIncome(input: V2ManualIncomeInput): V2FinancialEntry {
    return this.createManualEntry('manual_income', {
      amountCents: input.amountCents, occurredOn: input.occurredOn, categoryId: input.categoryId,
      paymentSource: null, advancePayerId: null, paymentMethod: input.paymentMethod, note: input.note
    })
  }

  createManualExpense(input: V2ManualExpenseInput): V2FinancialEntry {
    return this.createManualEntry('manual_expense', input)
  }

  listPendingReimbursements(asOf: string): V2PendingReimbursement[] {
    const entries = this.repository.listFinancialEntries({ sourceType: 'manual_expense' })
    const advances = entries.filter((entry) => entry.paymentSource === 'private_advance' && entry.advancePayerId)
    calculatePendingReimbursementCents({
      asOf,
      advances: advances.map((entry) => ({
        id: entry.id, sourceType: 'manual_expense' as const, direction: 'expense' as const,
        amountCents: entry.amountCents, occurredOn: entry.occurredOn, paymentSource: 'private_advance' as const,
        advancePayerId: entry.advancePayerId!
      })),
      reimbursements: this.repository.listReimbursementReferences()
    })
    const reimbursedIds = new Set(
      this.repository.listReimbursementReferences().filter((item) => item.reimbursedOn <= asOf).map((item) => item.advanceFinancialEntryId)
    )
    return advances
      .filter((entry) => entry.occurredOn <= asOf && !reimbursedIds.has(entry.id))
      .map((entry) => ({
        financialEntryId: entry.id, amountCents: entry.amountCents, occurredOn: entry.occurredOn,
        categoryId: entry.categoryId, categoryName: entry.categoryName, advancePayerId: entry.advancePayerId!,
        advancePayerName: entry.advancePayerName, note: entry.note
      }))
  }

  reimburse(input: V2ReimbursementInput): V2FinancialEntry {
    return this.repository.transaction(() => {
      const advance = this.repository.getFinancialEntry(requireId(input.advanceFinancialEntryId, '原私人垫付标识'))
      if (!advance) throw new DomainValidationError('原私人垫付不存在')
      const existing = this.repository.getReimbursementForAdvance(advance.id)
      validateReimbursement({
        advance: {
          id: advance.id, sourceType: advance.sourceType === 'manual_expense' ? 'manual_expense' : 'manual_expense',
          direction: advance.direction === 'expense' ? 'expense' : 'expense', amountCents: advance.amountCents,
          occurredOn: advance.occurredOn, paymentSource: advance.paymentSource === 'private_advance' ? 'private_advance' : 'business_account',
          advancePayerId: advance.advancePayerId ?? ''
        },
        reimbursedOn: input.reimbursedOn, reimbursementAmountCents: advance.amountCents, alreadyReimbursed: existing !== null
      })
      const now = this.clock.now()
      const entryInsert: FinanceEntryInsert = {
        id: this.clock.createId(), sourceType: 'reimbursement', direction: 'expense', businessType: 'advance_reimbursement',
        amountCents: advance.amountCents, occurredOn: input.reimbursedOn, paymentMethod: nullableText(input.paymentMethod),
        paymentSource: 'business_account', categoryId: null, advancePayerId: null, orderId: null, attachmentId: null,
        reversalOfEntryId: null, note: nullableText(input.note), createdAt: now
      }
      this.repository.insertFinancialEntry(entryInsert)
      this.repository.insertReimbursementLink(this.clock.createId(), advance.id, entryInsert.id, now)
      const result = toEntry(entryInsert)
      this.audit('finance.reimbursement_created', 'financial_entry', result.id, undefined, result, now, { advanceFinancialEntryId: advance.id })
      return result
    })
  }

  getMonthlySummary(month: string): V2MonthlyFinanceSummary {
    const entries = this.repository.listFinancialEntries()
    return summarizeMonthlyFinance({
      month,
      entries: entries.map((entry) => ({
        id: entry.id, sourceType: entry.sourceType, direction: entry.direction,
        amountCents: entry.amountCents, occurredOn: entry.occurredOn
      }))
    })
  }

  private createManualEntry(
    sourceType: 'manual_income' | 'manual_expense',
    input: Pick<V2ManualExpenseInput, 'amountCents' | 'occurredOn' | 'categoryId' | 'paymentSource' | 'advancePayerId' | 'paymentMethod' | 'note'>
  ): V2FinancialEntry {
    return this.repository.transaction(() => {
      const category = this.requireCategory(input.categoryId)
      const payer = input.advancePayerId ? this.repository.getAdvancePayer(requireId(input.advancePayerId, '垫付人标识')) : null
      validateManualFinanceEntry({
        sourceType, direction: sourceType === 'manual_income' ? 'income' : 'expense', amountCents: input.amountCents,
        occurredOn: input.occurredOn, categoryDirection: category.direction, categoryEnabled: category.enabled,
        paymentSource: input.paymentSource, advancePayerId: input.advancePayerId ?? null,
        advancePayerEnabled: payer?.enabled ?? null, orderId: null
      })
      const now = this.clock.now()
      const entryInsert: FinanceEntryInsert = {
        id: this.clock.createId(), sourceType, direction: sourceType === 'manual_income' ? 'income' : 'expense',
        businessType: sourceType === 'manual_income' ? 'daily_income' : 'daily_expense', amountCents: input.amountCents,
        occurredOn: input.occurredOn, paymentMethod: nullableText(input.paymentMethod), paymentSource: input.paymentSource,
        categoryId: category.id, advancePayerId: input.advancePayerId ?? null, orderId: null, attachmentId: null,
        reversalOfEntryId: null, note: nullableText(input.note), createdAt: now
      }
      this.repository.insertFinancialEntry(entryInsert)
      const result = { ...toEntry(entryInsert), categoryName: category.name, advancePayerName: payer?.name ?? null }
      this.audit('finance.manual_entry_created', 'financial_entry', result.id, undefined, result, now)
      return result
    })
  }

  private requireCategory(id: string): V2FinanceCategory {
    const category = this.repository.getCategory(requireId(id, '收支类目标识'))
    if (!category) throw new DomainValidationError('收支类目不存在')
    return category
  }

  private requireAdvancePayer(id: string): V2AdvancePayer {
    const payer = this.repository.getAdvancePayer(requireId(id, '垫付人标识'))
    if (!payer) throw new DomainValidationError('垫付人不存在')
    return payer
  }

  private audit(action: string, entityType: string, entityId: string, before: unknown, after: unknown, createdAt: string, metadata?: unknown): void {
    this.repository.insertAudit({
      id: this.clock.createId(), action, entityType, entityId, before, after, metadata, createdAt
    })
  }
}
