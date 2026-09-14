import { describe, expect, it } from 'vitest'
import { calculateProductSnapshotCostCents } from './product-costing'

const modernSnapshot = {
  productId: 'product-1',
  name: '草莓蛋糕',
  code: null,
  category: '捏捏',
  basePriceCents: 8_000,
  packagingCostCents: 20,
  accessoryCostCents: 5,
  replacementBagCostCents: 0,
  edgeConsumableCostCents: 0,
  fixedCostCents: 0,
  unitWeightMilligrams: 25_000,
  materialPriceMicroYuanPerGram: 3_400,
  standardMakingMinutes: 20,
  expectedFluffingBaggingMinutes: 5,
  expectedEdgeSewingMinutes: 0,
  expectedPackingMinutes: 3,
  makingCommissionCents: 80,
  fluffingBaggingCommissionCents: 0,
  edgeSewingCommissionCents: 0,
  moldCount: 0,
  outputPerMoldPerBatch: 0,
  maxBatchesPerDay: 0,
  dailyCapacity: 0
} as const

describe('calculateProductSnapshotCostCents', () => {
  it('按冻结的材料单价、单件材料重量和订单批量计算，最后才折算为分', () => {
    expect(calculateProductSnapshotCostCents(modernSnapshot, 100)).toBe(3_350)
  })

  it('单件固定成本按数量进入商品直接成本', () => {
    expect(
      calculateProductSnapshotCostCents(
        {
          ...modernSnapshot,
          unitWeightMilligrams: 0,
          fixedCostCents: 120
        },
        10
      )
    ).toBe(1_450)
  })

  it('缝边耗材成本只按缝边数量进入成本，未选缝边时不产生金额', () => {
    const base = {
      ...modernSnapshot,
      unitWeightMilligrams: 0,
      packagingCostCents: 0,
      accessoryCostCents: 0,
      replacementBagCostCents: 0,
      fixedCostCents: 0,
      edgeConsumableCostCents: 100
    }
    expect(calculateProductSnapshotCostCents(base, 2, 1)).toBe(100)
    expect(calculateProductSnapshotCostCents(base, 2, 0)).toBe(0)
  })

  it('产品成本不计入运费、制作提成或捏毛装袋提成', () => {
    expect(
      calculateProductSnapshotCostCents(
        {
          ...modernSnapshot,
          unitWeightMilligrams: 0,
          makingCommissionCents: 9_999,
          fluffingBaggingCommissionCents: 8_888
        },
        2
      )
    ).toBe(50)
  })

  it('拒绝负数量和非整数输入', () => {
    expect(() => calculateProductSnapshotCostCents(modernSnapshot, -1)).toThrow(
      '商品数量必须是非负整数'
    )
    expect(() => calculateProductSnapshotCostCents(modernSnapshot, 2, 1.5)).toThrow(
      '缝边数量必须是非负整数'
    )
  })
})
