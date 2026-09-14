import { describe, expect, it } from 'vitest'
import { calculateProductProfit, type ProductProfitInput } from './product-profit'

const baseInput: ProductProfitInput = {
  basePriceCents: 3_500,
  unitWeightMilligrams: 25_000,
  materialPriceMicroYuanPerGram: 3_400,
  packagingCostCents: 20,
  accessoryCostCents: 5,
  replacementBagCostCents: 8,
  fixedCostCents: 120,
  makingCommissionCents: 80,
  fluffingBaggingCommissionCents: 50,
  expectedFluffingBaggingMinutes: 20,
  expectedEdgeSewingMinutes: 10,
  expectedPackingMinutes: 18,
  fluffingBaggingExpectedHourlyWageCents: 3_000,
  edgeSewingExpectedHourlyWageCents: 3_000,
  packingExpectedHourlyWageCents: 3_000,
  edgeConsumableCostCents: 30,
  edgeSewingCommissionCents: 40
}

describe('商品预计盈利公式', () => {
  it('按材料、直接成本、提成和预计计时人工计算预计单件成本与利润', () => {
    const calculation = calculateProductProfit(baseInput)

    // 材料 9 + 包装 20 + 配饰 5 + 替换袋 8 + 固定 120 + 制作提成 80 + 捏毛提成 50
    // + 捏毛计时 1000 + 打包计时 900 = 2192
    expect(calculation.materialCost.amountCents).toBe(9)
    expect(calculation.fluffingBaggingLaborCost.amountCents).toBe(1_000)
    expect(calculation.packingLaborCost.amountCents).toBe(900)
    expect(calculation.unitCost.amountCents).toBe(2_192)
    expect(calculation.unitProfit.amountCents).toBe(1_308)
    expect(calculation.profitRate.basisPoints).toBe(3_737)
    expect(calculation.profitRate.display).toBe('37.37%')
    expect(calculation.edgeIncrementalCost.amountCents).toBe(570)
  })

  it('成本公式主干包含全部不缝边组成项且不含制作时薪', () => {
    const calculation = calculateProductProfit(baseInput)
    expect(calculation.unitCost.expression).toBe(
      '预计单件材料成本 + 包装成本 + 配饰成本 + 替换袋成本 + 单件固定成本 + 制作提成 + 捏毛装袋提成 + 预计捏毛装袋计时工资 + 预计打包发货计时工资'
    )
    expect(calculation.unitProfit.expression).toBe('默认售价 − 预计单件成本')
    expect(calculation.unitProfit.substitutedExpression).toBe('35.00 − 21.92 = 13.08')
    expect(calculation.profitRate.expression).toBe('预计单件利润 ÷ 默认售价')
    expect(calculation.materialCost.expression).toBe('全局材料克单价 × 单件材料重量')
    expect(calculation.fluffingBaggingLaborCost.expression).toBe(
      '预计单件捏毛装袋分钟 ÷ 60 × 捏毛装袋预计基准时薪'
    )
  })

  it('制作参数与缝边成本不进入不缝边商品的预计成本与利润', () => {
    const calculation = calculateProductProfit(baseInput)
    const withExpensiveEdge = calculateProductProfit({
      ...baseInput,
      edgeConsumableCostCents: 999,
      edgeSewingCommissionCents: 888,
      edgeSewingExpectedHourlyWageCents: 9_999,
      expectedEdgeSewingMinutes: 60
    })
    expect(withExpensiveEdge.unitCost.amountCents).toBe(calculation.unitCost.amountCents)
    expect(withExpensiveEdge.unitProfit.amountCents).toBe(calculation.unitProfit.amountCents)
    expect(withExpensiveEdge.edgeIncrementalCost.amountCents).toBe(999 + 888 + 9_999)
    expect(withExpensiveEdge.edgeSewingLaborCost.amountCents).toBe(9_999)
    expect(withExpensiveEdge.edgeIncrementalCost.expression).toBe(
      '缝边耗材成本 + 缝边提成 + 预计缝边计时工资'
    )
  })

  it('修改单件材料重量时材料成本、预计成本与预计利润同步变化', () => {
    const lighter = calculateProductProfit({ ...baseInput, unitWeightMilligrams: 0 })
    const heavier = calculateProductProfit({ ...baseInput, unitWeightMilligrams: 20_000 })
    expect(lighter.materialCost.amountCents).toBe(0)
    expect(heavier.materialCost.amountCents).toBe(7)
    expect(heavier.unitCost.amountCents - lighter.unitCost.amountCents).toBe(7)
    expect(lighter.unitProfit.amountCents - heavier.unitProfit.amountCents).toBe(7)
  })

  it('修改捏毛装袋预计时长时预计计时工资与预计利润同步变化', () => {
    const shorter = calculateProductProfit({ ...baseInput, expectedFluffingBaggingMinutes: 15 })
    const longer = calculateProductProfit({ ...baseInput, expectedFluffingBaggingMinutes: 20 })
    expect(
      longer.fluffingBaggingLaborCost.amountCents - shorter.fluffingBaggingLaborCost.amountCents
    ).toBe(250)
    expect(shorter.unitProfit.amountCents - longer.unitProfit.amountCents).toBe(250)
  })

  it('默认售价为零时仍可显示预计成本与利润，利润率不可计算', () => {
    const calculation = calculateProductProfit({ ...baseInput, basePriceCents: 0 })
    expect(calculation.unitCost.amountCents).toBe(2_192)
    expect(calculation.unitProfit.amountCents).toBe(-2_192)
    expect(calculation.profitRate.status).toBe('not_computable')
    expect(calculation.profitRate.basisPoints).toBeNull()
    expect(calculation.profitRate.display).toBe('—')
    expect(calculation.profitRate.notes).toEqual(['默认售价为零，无法计算利润率'])
  })

  it('负利润时利润率保持负号与不可计算保护', () => {
    const calculation = calculateProductProfit({ ...baseInput, basePriceCents: 1_000 })
    expect(calculation.unitProfit.amountCents).toBe(-1_192)
    expect(calculation.profitRate.basisPoints).toBe(-11_920)
    expect(calculation.profitRate.display).toBe('-119.20%')
  })

  it('拒绝负数输入', () => {
    expect(() => calculateProductProfit({ ...baseInput, unitWeightMilligrams: -1 })).toThrow(
      '单件材料重量必须是非负安全整数'
    )
  })
})
