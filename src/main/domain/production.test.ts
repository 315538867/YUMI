import { describe, expect, it } from 'vitest'
import { calculateActualProductionCost, calculateProductionProgress } from './production'

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

describe('订单排产进度汇总', () => {
  it('按合格数量和有效排班数量计算已排、未排和排产状态', () => {
    expect(
      calculateProductionProgress({
        orderedQuantity: 10,
        qualifiedQuantity: 2,
        unqualifiedQuantity: 1,
        scheduledQuantity: 5,
        hasReleasedQuantity: false
      })
    ).toEqual({
      orderedQuantity: 10,
      qualifiedQuantity: 2,
      unqualifiedQuantity: 1,
      scheduledQuantity: 5,
      coveredQuantity: 7,
      unplannedQuantity: 3,
      excessQuantity: 0,
      status: 'partially_scheduled'
    })
  })

  it('有效排班只统计待执行排班，离岗、缺勤和取消数量由释放后的未排数量体现', () => {
    expect(
      calculateProductionProgress({
        orderedQuantity: 10,
        qualifiedQuantity: 0,
        unqualifiedQuantity: 0,
        scheduledQuantity: 0,
        hasReleasedQuantity: true
      })
    ).toMatchObject({ status: 'pending_replenishment', unplannedQuantity: 10 })
  })

  it('制作完成按合格数量判断，不把返工、报废或计划数量当作合格数量', () => {
    expect(
      calculateProductionProgress({
        orderedQuantity: 10,
        qualifiedQuantity: 10,
        unqualifiedQuantity: 3,
        scheduledQuantity: 0,
        hasReleasedQuantity: true
      })
    ).toMatchObject({ status: 'production_completed', coveredQuantity: 10, unplannedQuantity: 0 })
  })

  it('排产覆盖量超出订单数量时返回超排数量，未排数量不出现负数', () => {
    expect(
      calculateProductionProgress({
        orderedQuantity: 10,
        qualifiedQuantity: 2,
        unqualifiedQuantity: 4,
        scheduledQuantity: 9,
        hasReleasedQuantity: false
      })
    ).toMatchObject({ coveredQuantity: 11, unplannedQuantity: 0, excessQuantity: 1 })
  })
})
