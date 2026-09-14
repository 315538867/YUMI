import { describe, expect, it } from 'vitest'
import { orderAmountFormulaIds } from './order-amount'
import { formulaCatalog, productFormulaIds } from './catalog'
import { wageFormulaIds } from './wage'

describe('统一公式目录', () => {
  it('每项都包含公式标识、业务名称、适用范围、展示表达式、输入来源与口径边界', () => {
    expect(formulaCatalog.length).toBeGreaterThan(0)
    for (const entry of formulaCatalog) {
      expect(entry.id.trim()).not.toBe('')
      expect(entry.scope.trim()).not.toBe('')
      expect(entry.name.trim()).not.toBe('')
      expect(entry.expression.trim()).not.toBe('')
      expect(entry.input.trim()).not.toBe('')
      expect(entry.boundary.trim()).not.toBe('')
    }
  })

  it('公式标识唯一且稳定', () => {
    const ids = formulaCatalog.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('登记共享公式中心已经实现的订单、商品与计时工资公式标识', () => {
    const ids = new Set(formulaCatalog.map((entry) => entry.id))
    expect(ids.has(orderAmountFormulaIds.orderAmount)).toBe(true)
    expect(ids.has(productFormulaIds.directCost)).toBe(true)
    expect(ids.has(wageFormulaIds.timedWage)).toBe(true)
  })

  it('订单金额公式与共享公式的展示主干一致', () => {
    const entry = formulaCatalog.find((item) => item.id === orderAmountFormulaIds.orderAmount)
    expect(entry?.expression).toBe('所有商品行应收之和 − 订单优惠')
  })
})
