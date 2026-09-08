import { describe, expect, it } from 'vitest'
import {
  createAfterSalesAccountingSnapshot,
  validateAfterSalesChargeLink,
  validateAfterSalesCase
} from './after-sales'

describe('V2 售后领域规则', () => {
  it('免费换包装仍保留售后核算成本，但不会自动创建经营支出或客户收费', () => {
    const input = {
      orderId: 'order-1',
      shipmentId: 'shipment-1',
      occurredOn: '2026-10-03',
      reasonDescription: '客户不满意包装袋',
      customerRequest: '换袋并加封边',
      responsibilityDescription: '负责人协商后免费处理',
      handlingDescription: '重新包装并加封边',
      status: 'processing' as const,
      customerChargeNote: '小额免费',
      accountingCostCents: 2_000,
      note: '不自动安排补发'
    }

    expect(() => validateAfterSalesCase(input)).not.toThrow()
    expect(createAfterSalesAccountingSnapshot(input)).toEqual({
      accountingCostCents: 2_000,
      createsOperatingExpense: false,
      createsCustomerCharge: false
    })
  })

  it('售后收费必须由负责人另行登记同一订单的售后收费流水', () => {
    expect(() => validateAfterSalesChargeLink({
      afterSalesOrderId: 'order-1',
      financialEntry: {
        orderId: 'order-2',
        sourceType: 'order_fund',
        direction: 'income',
        businessType: 'after_sales_charge'
      }
    })).toThrow('售后收费流水必须关联同一订单')
    expect(() => validateAfterSalesChargeLink({
      afterSalesOrderId: 'order-1',
      financialEntry: {
        orderId: 'order-1',
        sourceType: 'manual_income',
        direction: 'income',
        businessType: 'daily_income'
      }
    })).toThrow('售后收费必须关联订单售后收费流水')
    expect(() => validateAfterSalesChargeLink({
      afterSalesOrderId: 'order-1',
      financialEntry: {
        orderId: 'order-1',
        sourceType: 'order_fund',
        direction: 'income',
        businessType: 'after_sales_charge'
      }
    })).not.toThrow()
  })

  it('售后处理单的核心说明和核算成本必须有效', () => {
    expect(() => validateAfterSalesCase({
      orderId: 'order-1',
      shipmentId: null,
      occurredOn: '2026-10-03',
      reasonDescription: ' ',
      customerRequest: null,
      responsibilityDescription: '待定',
      handlingDescription: '重新包装',
      status: 'open',
      customerChargeNote: null,
      accountingCostCents: 0,
      note: null
    })).toThrow('售后原因说明不能为空')
    expect(() => validateAfterSalesCase({
      orderId: 'order-1',
      shipmentId: null,
      occurredOn: '2026-10-03',
      reasonDescription: '换包装',
      customerRequest: null,
      responsibilityDescription: '待定',
      handlingDescription: '重新包装',
      status: 'open',
      customerChargeNote: null,
      accountingCostCents: -1,
      note: null
    })).toThrow('售后核算成本必须是非负整数分')
  })
})
