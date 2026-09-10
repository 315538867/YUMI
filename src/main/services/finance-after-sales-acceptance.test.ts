import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { AfterSalesService } from './after-sales-service'
import { FinanceService } from './finance-service'
import { V2OrderService } from './v2-order-service'

const databases: V2Database[] = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
})

describe('V2 财务与售后验收', () => {
  it('以动态资料、实际日期、私人垫付和负责人显式售后动作形成可追溯闭环', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const finance = new FinanceService(database)
    const orderService = new V2OrderService(new V2OrderRepository(database))
    const afterSales = new AfterSalesService(database)
    const incomeCategory = finance.createCategory({ direction: 'income', name: '其他收入' })
    const expenseCategory = finance.createCategory({ direction: 'expense', name: '包装耗材' })
    finance.updateCategory(incomeCategory.id, { name: '临时收入' })
    const payer = finance.createAdvancePayer({ name: '小雨', note: '负责人垫付' })

    finance.createManualIncome({
      amountCents: 1_000, occurredOn: '2026-09-02', categoryId: incomeCategory.id,
      paymentMethod: '微信', note: '无需区分收款账户'
    })
    const advance = finance.createManualExpense({
      amountCents: 500, occurredOn: '2026-09-03', categoryId: expenseCategory.id,
      paymentSource: 'private_advance', advancePayerId: payer.id, paymentMethod: '微信', note: '加封边耗材'
    })
    expect(finance.listCategories('income', true)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: incomeCategory.id, name: '临时收入', enabled: true })
    ]))
    expect(finance.listPendingReimbursements('2026-09-04')).toEqual([
      expect.objectContaining({ financialEntryId: advance.id, amountCents: 500, advancePayerId: payer.id })
    ])

    const product = orderService.createProduct({
      name: '奶油小熊', basePriceCents: 6_000, materialCostCents: 1_000,
      packagingCostCents: 100, accessoryCostCents: 0, replacementBagCostCents: 0,
      internalEdgeCostCents: 0, standardMakingMinutes: 12, makingCommissionCents: 300, makingGlueCostCents: 50
    })
    const order = orderService.createOrder({
      customer: { name: '客户 A' }, items: [{ productId: product.id, quantity: 1, unitPriceCents: 6_000 }],
    })
    const beforeFreeCaseCashCount = Number((database.prepare('SELECT COUNT(*) AS count FROM financial_entries').get() as { count: number }).count)
    const freeCase = afterSales.createCase({
      orderId: order.id, occurredOn: '2026-09-04', reasonDescription: '客户希望更换包装袋',
      customerRequest: '换袋并加封边', responsibilityDescription: '负责人决定少量免费处理',
      handlingDescription: '重新包装', status: 'processing', customerChargeNote: '本次不收费',
      accountingCostCents: 260, note: '售后成本只用于订单核算'
    })
    expect(Number((database.prepare('SELECT COUNT(*) AS count FROM financial_entries').get() as { count: number }).count)).toBe(beforeFreeCaseCashCount)
    expect(database.prepare('SELECT COUNT(*) AS count FROM process_tasks').get()).toEqual({ count: 0 })

    const paidCase = afterSales.createCase({
      orderId: order.id, occurredOn: '2026-09-05', reasonDescription: '客户追加加封边',
      customerRequest: '加封边', responsibilityDescription: '客户定制需求变更',
      handlingDescription: '负责人确认后处理', status: 'resolved', customerChargeNote: '已协商收费',
      accountingCostCents: 180
    })
    const charge = orderService.recordOrderFund(order.id, {
      businessType: 'after_sales_charge', amountCents: 300, occurredOn: '2026-09-05', paymentMethod: '微信', note: '加封边收费'
    })
    afterSales.linkCharge(paidCase.id, charge.id)
    expect(afterSales.listCases({ orderId: order.id })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: freeCase.id, accountingCostCents: 260, chargeFinancialEntryIds: [] }),
      expect.objectContaining({ id: paidCase.id, accountingCostCents: 180, chargeFinancialEntryIds: [charge.id] })
    ]))

    const reimbursement = finance.reimburse({
      advanceFinancialEntryId: advance.id, reimbursedOn: '2026-09-06', paymentMethod: '公账转账', note: '整笔报销'
    })
    expect(reimbursement).toMatchObject({ sourceType: 'reimbursement', paymentSource: 'business_account', amountCents: 500 })
    expect(finance.listPendingReimbursements('2026-09-06')).toEqual([])
    expect(finance.getMonthlySummary('2026-09')).toEqual({
      incomeCents: 1_300, operatingExpenseCents: 500, operatingResultCents: 800
    })
    expect(finance.listEntries({ fromOn: '2026-09-01', toOn: '2026-09-30' })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: advance.id, paymentSource: 'private_advance', advancePayerName: '小雨' }),
      expect.objectContaining({ id: reimbursement.id, sourceType: 'reimbursement', paymentSource: 'business_account' }),
      expect.objectContaining({ id: charge.id, sourceType: 'order_fund', businessType: 'after_sales_charge' })
    ]))
    expect(() => finance.deleteCategory(expenseCategory.id)).toThrow('已被财务流水引用，不能删除')
    expect(() => finance.deleteAdvancePayer(payer.id)).toThrow('已被财务流水引用，不能删除')
  })
})
