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
  edgeCostCents: 0,
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

  it('缺少新字段的历史快照仍沿用旧成本字段', () => {
    const legacySnapshot = {
      ...modernSnapshot,
      materialCostCents: 125,
      glueWeightMilligrams: undefined,
      gluePriceMicroYuanPerGram: undefined
    }
    expect(calculateProductSnapshotCostCents(legacySnapshot, 2)).toBe(300)
  })
})
