import { describe, expect, it } from 'vitest'
import { calculateProductSnapshotCostCents } from './product-costing'

const modernSnapshot = {
  productId: 'product-1',
  name: '草莓蛋糕',
  code: null,
  category: '捏捏',
  basePriceCents: 8_000,
  materialCostCents: 0,
  packagingCostCents: 20,
  accessoryCostCents: 5,
  replacementBagCostCents: 0,
  internalEdgeCostCents: 0,
  standardMakingMinutes: 20,
  makingCommissionCents: 80,
  makingGlueCostCents: 0,
  glueWeightMilligrams: 25_000,
  gluePriceMicroYuanPerGram: 3_400
} as const

describe('calculateProductSnapshotCostCents', () => {
  it('按冻结的胶水单价、克重和订单批量计算，最后才折算为分', () => {
    expect(calculateProductSnapshotCostCents(modernSnapshot, 100)).toBe(3_350)
  })

  it('优先按冻结的单件材料重量和损耗率计算新商品材料成本', () => {
    expect(
      calculateProductSnapshotCostCents(
        {
          ...modernSnapshot,
          unitWeightMilligrams: 20_000,
          materialLossRateBasisPoints: 1_000,
          glueWeightMilligrams: 0,
          gluePriceMicroYuanPerGram: 500_000
        },
        10
      )
    ).toBe(11_250)
  })

  it('产品成本不计入运费、制作提成或捏毛装袋提成', () => {
    expect(
      calculateProductSnapshotCostCents(
        {
          ...modernSnapshot,
          makingCommissionCents: 9_999,
          fluffingBaggingCommissionCents: 8_888
        },
        2
      )
    ).toBe(67)
  })

  it('缺少新字段的历史快照仍沿用旧成本字段', () => {
    const legacySnapshot = {
      ...modernSnapshot,
      materialCostCents: 125,
      glueWeightMilligrams: undefined,
      gluePriceMicroYuanPerGram: undefined
    }
    expect(calculateProductSnapshotCostCents(legacySnapshot, 2)).toBe(300)
  })

  it('兼容仅保存旧 edgeCostCents 的历史订单快照，未选缝边时不产生无效金额', () => {
    const legacySnapshot = {
      ...modernSnapshot,
      internalEdgeCostCents: undefined,
      edgeCostCents: 100
    }

    expect(calculateProductSnapshotCostCents(legacySnapshot as typeof modernSnapshot, 2, 0)).toBe(
      67
    )
  })
})
