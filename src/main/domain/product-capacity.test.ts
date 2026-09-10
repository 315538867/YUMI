import { describe, expect, it } from 'vitest'
import {
  calculateDailyMoldCapacity,
  calculateMaterialRequirementMilligrams,
  validateProductMaterialAndCapacity
} from './product-capacity'

describe('商品材料与模具产能规则', () => {
  it('按单件重量和损耗率计算预计材料用量', () => {
    expect(calculateMaterialRequirementMilligrams({
      quantity: 10,
      unitWeightMilligrams: 20_000,
      materialLossRateBasisPoints: 1_000
    })).toBe(220_000)
  })

  it('按模具数量、单模每批产出和每日批次数计算日产能', () => {
    expect(calculateDailyMoldCapacity({
      moldCount: 20,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2
    })).toBe(40)
  })

  it('拒绝越过边界的材料和产能参数', () => {
    expect(() => validateProductMaterialAndCapacity({
      unitWeightMilligrams: 20_000,
      materialLossRateBasisPoints: 10_001,
      moldCount: 20,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2
    })).toThrow('损耗率必须小于 100%')

    expect(() => validateProductMaterialAndCapacity({
      unitWeightMilligrams: 20_000,
      materialLossRateBasisPoints: 1_000,
      moldCount: 0,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2
    })).toThrow('模具数量必须是正整数')

    expect(() => validateProductMaterialAndCapacity({
      unitWeightMilligrams: 20_000,
      materialLossRateBasisPoints: 1_000,
      moldCount: 20,
      outputPerMoldPerBatch: 1,
      maxBatchesPerDay: 2.5
    })).toThrow('每日批次数必须是正整数')
  })
})
