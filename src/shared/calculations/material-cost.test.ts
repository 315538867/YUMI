import { describe, expect, it } from 'vitest'
import { calculateMaterialCostCents, createMaterialCostCalculation } from './material-cost'

describe('共享材料成本公式', () => {
  it('按克单价、毫克重量和数量一次性舍入到分', () => {
    expect(
      calculateMaterialCostCents({
        materialPriceMicroYuanPerGram: 3_400,
        weightMilligrams: 25_000,
        quantity: 100
      })
    ).toBe(850)
    expect(
      calculateMaterialCostCents({
        materialPriceMicroYuanPerGram: 3_400,
        weightMilligrams: 25_000
      })
    ).toBe(9)
  })

  it('未提供数量时按单件材料成本生成公式展示', () => {
    const result = createMaterialCostCalculation({
      label: '预计单件材料成本',
      materialPriceMicroYuanPerGram: 3_400,
      weightMilligrams: 25_000
    })
    expect(result.amountCents).toBe(9)
    expect(result.label).toBe('预计单件材料成本')
    expect(result.expression).toBe('全局材料克单价 × 单件材料重量')
    expect(result.substitutedExpression).toBe('0.0034 × 25 = 0.09')
  })

  it('提供数量时按整批材料成本生成公式展示', () => {
    const result = createMaterialCostCalculation({
      label: '制作材料扣款',
      materialPriceMicroYuanPerGram: 3_400,
      weightMilligrams: 25_000,
      quantity: 3,
      quantityLabel: '不合格数量'
    })
    expect(result.amountCents).toBe(26)
    expect(result.expression).toBe('全局材料克单价 × 单件材料重量 × 不合格数量')
    expect(result.substitutedExpression).toBe('0.0034 × 25 × 3 = 0.26')
  })

  it('拒绝负数输入', () => {
    expect(() =>
      calculateMaterialCostCents({ materialPriceMicroYuanPerGram: -1, weightMilligrams: 1_000 })
    ).toThrow('材料克单价必须是非负安全整数')
  })
})
