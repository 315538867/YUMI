import { describe, expectTypeOf, it } from 'vitest'
import type {
  V2CustomerInput,
  V2OrderCreateInput,
  V2OrderFundInput,
  V2ProductInput,
  V2ShipmentInput
} from './index'

describe('V2 共享契约', () => {
  it('订单、商品、客户、资金和发货输入只使用 V2 契约来源', () => {
    expectTypeOf<V2CustomerInput>().toMatchTypeOf<{ name: string }>()
    expectTypeOf<V2ProductInput>().toMatchTypeOf<{ makingGlueCostCents: number }>()
    expectTypeOf<V2OrderCreateInput>().toMatchTypeOf<{ initialConfirmedAmountCents: number }>()
    expectTypeOf<V2OrderFundInput>().toMatchTypeOf<{ businessType: 'payment' | 'refund' | 'after_sales_charge' }>()
    expectTypeOf<V2ShipmentInput>().toMatchTypeOf<{ items: Array<{ orderItemId: string; quantity: number }> }>()
  })
})
