import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  V2CustomerInput,
  V2OrderCreateInput,
  V2OrderFundInput,
  V2ProductInput,
  V2ShipmentInput,
  V2BatchReimbursementInput,
  V2NavigationTarget,
  V2WorkbenchItem
} from './index'

describe('V2 共享契约', () => {
  it('批量报销输入会原样保留空选择与重复标识，交由服务层统一校验', () => {
    const emptySelection = {
      advanceFinancialEntryIds: [], reimbursedOn: '2026-09-08', paymentMethod: null, note: null
    } satisfies V2BatchReimbursementInput
    const duplicateSelection = {
      advanceFinancialEntryIds: ['advance-1', 'advance-1'], reimbursedOn: '2026-09-08', paymentMethod: '公账转账', note: '同一笔重复选择'
    } satisfies V2BatchReimbursementInput

    expect(emptySelection.advanceFinancialEntryIds).toEqual([])
    expect(duplicateSelection.advanceFinancialEntryIds).toEqual(['advance-1', 'advance-1'])
  })

  it('工作台事项携带可定位的应用导航目标，而非写入业务状态的命令', () => {
    const fulfillmentTarget = {
      view: 'fulfillment', orderId: 'order-1', orderItemId: 'item-1', processTaskId: 'task-1', focus: 'inspection'
    } satisfies V2NavigationTarget
    const settlementTarget = { view: 'settlements', settlementId: 'settlement-1', focus: 'refund' } satisfies V2NavigationTarget
    const financeTarget = { view: 'finance', financeView: 'reimbursements', financialEntryId: 'entry-1' } satisfies V2NavigationTarget

    expect(fulfillmentTarget).toMatchObject({ view: 'fulfillment', processTaskId: 'task-1', focus: 'inspection' })
    expect(settlementTarget).toMatchObject({ view: 'settlements', focus: 'refund' })
    expect(financeTarget).toMatchObject({ view: 'finance', financeView: 'reimbursements' })
  })

  it('订单、商品、客户、资金和发货输入只使用 V2 契约来源', () => {
    expectTypeOf<V2CustomerInput>().toMatchTypeOf<{ name: string }>()
    expectTypeOf<V2ProductInput>().toMatchTypeOf<{ makingGlueCostCents: number }>()
    expectTypeOf<V2OrderCreateInput>().toMatchTypeOf<{ initialConfirmedAmountCents: number }>()
    expectTypeOf<V2OrderFundInput>().toMatchTypeOf<{ businessType: 'payment' | 'refund' | 'after_sales_charge' }>()
    expectTypeOf<V2ShipmentInput>().toMatchTypeOf<{ items: Array<{ orderItemId: string; quantity: number }> }>()
    expectTypeOf<V2BatchReimbursementInput>().toMatchTypeOf<{ advanceFinancialEntryIds: string[] }>()
    expectTypeOf<V2NavigationTarget>().toMatchTypeOf<{ view: string }>()
    expectTypeOf<V2WorkbenchItem>().toMatchTypeOf<{ id: string; navigationTarget: V2NavigationTarget }>()
  })
})
