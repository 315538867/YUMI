import { afterEach, describe, expect, it } from 'vitest'
import { createV2Database, type V2Database } from '@main/database/v2-connection'
import { V2OrderRepository } from '@main/repositories/v2-order-repository'
import { V2OrderService } from './v2-order-service'
import { AfterSalesService } from './after-sales-service'

const databases: V2Database[] = []

afterEach(() => {
  databases.splice(0).forEach((database) => database.close())
})

describe('AfterSalesService', () => {
  it('只记录负责人填写的售后事实和核算成本，客户收费须显式关联订单资金流水', () => {
    const database = createV2Database(':memory:')
    databases.push(database)
    const orderService = new V2OrderService(new V2OrderRepository(database))
    const afterSales = new AfterSalesService(database)
    const product = orderService.createProduct({
      name: '奶油小熊', basePriceCents: 6_000, materialCostCents: 1_000,
      packagingCostCents: 100, accessoryCostCents: 0, replacementBagCostCents: 0,
      edgeCostCents: 0, standardMakingMinutes: 12, makingCommissionCents: 300, makingGlueCostCents: 50
    })
    const order = orderService.createOrder({
      customer: { name: '小雨' }, items: [{ productId: product.id, quantity: 1, unitPriceCents: 6_000 }],
      initialConfirmedAmountCents: 6_000
    })

    const caseRecord = afterSales.createCase({
      orderId: order.id, shipmentId: null, occurredOn: '2026-09-05',
      reasonDescription: '客户希望包装袋加封边', customerRequest: '换袋并加封边',
      responsibilityDescription: '客户定制需求变更', handlingDescription: '负责人确认后重新包装',
      status: 'processing', customerChargeNote: '本次免收客户费用', accountingCostCents: 260, note: '少量免费处理'
    })
    expect(caseRecord).toMatchObject({ orderId: order.id, accountingCostCents: 260, status: 'processing' })
    expect(database.prepare('SELECT COUNT(*) AS count FROM financial_entries').get()).toEqual({ count: 0 })

    const charge = orderService.recordOrderFund(order.id, {
      businessType: 'after_sales_charge', amountCents: 500, occurredOn: '2026-09-06',
      paymentMethod: '微信', note: '加封边收费'
    })
    const link = afterSales.linkCharge(caseRecord.id, charge.id)
    expect(link).toMatchObject({ afterSalesCaseId: caseRecord.id, financialEntryId: charge.id })
    expect(afterSales.listCases({ orderId: order.id })[0]).toMatchObject({
      id: caseRecord.id, chargeFinancialEntryIds: [charge.id]
    })
    expect(database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'after_sales.charge_linked'").get())
      .toEqual({ count: 1 })
  })
})
