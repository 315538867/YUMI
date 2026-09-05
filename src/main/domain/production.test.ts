import { describe, expect, it } from 'vitest'
import { calculateActualProductionCost } from './production'

describe('实际制作成本与提成', () => {
  it('使用本次时薪和合格数量计算人工及按件提成', () => {
    expect(
      calculateActualProductionCost({
        actualMinutes: 240,
        qualifiedQuantity: 8,
        reworkQuantity: 1,
        scrapQuantity: 1,
        plannedQuantity: 10,
        hourlyWageCents: 2800,
        commissionCentsPerUnit: 200
      })
    ).toEqual({
      actualLaborCostCents: 11200,
      commissionCostCents: 1600,
      totalActualCostCents: 12800
    })
  })

  it('返工和报废不计入按件提成，且总数量不能超过计划', () => {
    expect(
      calculateActualProductionCost({
        actualMinutes: 30,
        qualifiedQuantity: 1,
        reworkQuantity: 1,
        scrapQuantity: 1,
        plannedQuantity: 3,
        hourlyWageCents: 2400,
        commissionCentsPerUnit: 300
      }).commissionCostCents
    ).toBe(300)
    expect(() =>
      calculateActualProductionCost({
        actualMinutes: 30,
        qualifiedQuantity: 2,
        reworkQuantity: 1,
        scrapQuantity: 1,
        plannedQuantity: 3,
        hourlyWageCents: 2400,
        commissionCentsPerUnit: 300
      })
    ).toThrow('合格、返工和报废数量不能超过计划制作数量')
  })
})
