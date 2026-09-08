import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { FinanceService } from './finance-service'

const databases: V2Database[] = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
})

describe('FinanceService', () => {
  it('登记私人垫付并整笔报销：保留现金付款事实但不重复计入经营支出', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const service = new FinanceService(database)
    const category = service.createCategory({ direction: 'expense', name: '房租水电' })
    const payer = service.createAdvancePayer({ name: '小雨', note: '负责人' })

    const advance = service.createManualExpense({
      amountCents: 12_500,
      occurredOn: '2026-09-02',
      categoryId: category.id,
      paymentSource: 'private_advance',
      advancePayerId: payer.id,
      paymentMethod: '微信',
      note: '9 月房租'
    })
    expect(advance).toMatchObject({
      sourceType: 'manual_expense', direction: 'expense', businessType: 'daily_expense',
      paymentSource: 'private_advance', advancePayerId: payer.id, categoryId: category.id
    })
    expect(service.listPendingReimbursements('2026-09-03')).toMatchObject([{
      financialEntryId: advance.id, amountCents: 12_500, advancePayerId: payer.id
    }])

    const reimbursement = service.reimburse({
      advanceFinancialEntryId: advance.id,
      reimbursedOn: '2026-09-05',
      paymentMethod: '公账转账',
      note: '一次性报销'
    })
    expect(reimbursement).toMatchObject({
      sourceType: 'reimbursement', direction: 'expense', businessType: 'advance_reimbursement',
      amountCents: 12_500, paymentSource: 'business_account', advancePayerId: null
    })
    expect(service.listPendingReimbursements('2026-09-05')).toEqual([])
    expect(service.getMonthlySummary('2026-09')).toEqual({
      incomeCents: 0, operatingExpenseCents: 12_500, operatingResultCents: -12_500
    })
    expect(database.prepare(`
      SELECT source_type, direction, business_type, amount_cents, payment_source, advance_payer_id
      FROM financial_entries ORDER BY occurred_on, created_at
    `).all()).toEqual([
      {
        source_type: 'manual_expense', direction: 'expense', business_type: 'daily_expense',
        amount_cents: 12_500, payment_source: 'private_advance', advance_payer_id: payer.id
      },
      {
        source_type: 'reimbursement', direction: 'expense', business_type: 'advance_reimbursement',
        amount_cents: 12_500, payment_source: 'business_account', advance_payer_id: null
      }
    ])
    expect(database.prepare('SELECT COUNT(*) AS count FROM advance_reimbursements').get()).toEqual({ count: 1 })
    expect(() => service.deleteCategory(category.id)).toThrow('已被财务流水引用，不能删除')
    expect(() => service.deleteAdvancePayer(payer.id)).toThrow('已被财务流水引用，不能删除')
    expect(database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'finance.reimbursement_created'").get())
      .toEqual({ count: 1 })
  })

  it('拒绝使用停用类目或垫付人登记新的日常流水', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const service = new FinanceService(database)
    const incomeCategory = service.createCategory({ direction: 'income', name: '其他收入' })
    const expenseCategory = service.createCategory({ direction: 'expense', name: '快递费' })
    const payer = service.createAdvancePayer({ name: '小林' })
    service.updateCategory(incomeCategory.id, { enabled: false })
    service.updateAdvancePayer(payer.id, { enabled: false })

    expect(() => service.createManualIncome({
      amountCents: 100, occurredOn: '2026-09-03', categoryId: incomeCategory.id
    })).toThrow('收支类目已停用')
    expect(() => service.createManualExpense({
      amountCents: 100, occurredOn: '2026-09-03', categoryId: expenseCategory.id,
      paymentSource: 'private_advance', advancePayerId: payer.id
    })).toThrow('私人垫付必须选择已启用的垫付人')
  })

  it('批量报销会先完整校验，成功时分别建流水，任何无效选择均不产生部分报销', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const service = new FinanceService(database)
    const category = service.createCategory({ direction: 'expense', name: '日常支出' })
    const payer = service.createAdvancePayer({ name: '小雨' })
    const firstAdvance = service.createManualExpense({
      amountCents: 8_800, occurredOn: '2026-09-01', categoryId: category.id,
      paymentSource: 'private_advance', advancePayerId: payer.id
    })
    const secondAdvance = service.createManualExpense({
      amountCents: 12_600, occurredOn: '2026-09-02', categoryId: category.id,
      paymentSource: 'private_advance', advancePayerId: payer.id
    })
    const businessExpense = service.createManualExpense({
      amountCents: 5_000, occurredOn: '2026-09-02', categoryId: category.id,
      paymentSource: 'business_account'
    })

    const result = service.reimburseBatch({
      advanceFinancialEntryIds: [firstAdvance.id, secondAdvance.id],
      reimbursedOn: '2026-09-05',
      paymentMethod: '公账转账',
      note: '9 月第一批报销'
    })
    expect(result).toMatchObject({ totalAmountCents: 21_400 })
    expect(result.entries).toHaveLength(2)
    expect(service.listPendingReimbursements('2026-09-05')).toEqual([])
    expect(database.prepare("SELECT COUNT(*) AS count FROM advance_reimbursements").get()).toEqual({ count: 2 })

    const reimbursementCount = database.prepare("SELECT COUNT(*) AS count FROM financial_entries WHERE source_type = 'reimbursement'").get()
    expect(() => service.reimburseBatch({
      advanceFinancialEntryIds: [firstAdvance.id, firstAdvance.id], reimbursedOn: '2026-09-06'
    })).toThrow('不能重复选择同一私人垫付')
    expect(() => service.reimburseBatch({
      advanceFinancialEntryIds: [businessExpense.id, secondAdvance.id], reimbursedOn: '2026-09-06'
    })).toThrow('报销对象必须是私人垫付日常支出')
    expect(() => service.reimburseBatch({
      advanceFinancialEntryIds: [firstAdvance.id, businessExpense.id], reimbursedOn: '2026-09-06'
    })).toThrow('该私人垫付已报销，不能重复报销')
    expect(database.prepare("SELECT COUNT(*) AS count FROM financial_entries WHERE source_type = 'reimbursement'").get())
      .toEqual(reimbursementCount)
  })

})
