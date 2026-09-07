import { describe, expect, it } from 'vitest'
import {
  allocateDeductionsInOccurrenceOrder,
  calculateFluffingDefectDeduction,
  calculateMakingDefectDeduction,
  calculateQualifiedCommissionCents,
  calculateSettlementReferenceWages,
  validateFinalPaidCents
} from './settlement'

describe('V2 兼职工资结算领域规则', () => {
  it('两套工资参考只因工作分钟不同而产生时薪差异', () => {
    expect(calculateSettlementReferenceWages({
      scheduledMinutes: 360,
      attendanceMinutes: 480,
      hourlyWageCents: 2_000,
      qualifiedCommissionCents: 3_000,
      deductionCents: 1_500,
      otherAdjustmentCents: 200
    })).toEqual({
      scheduledHourlyWageCents: 12_000,
      attendanceHourlyWageCents: 16_000,
      scheduledPreDeductionWageCents: 15_200,
      attendancePreDeductionWageCents: 19_200,
      scheduledReferenceWageCents: 13_700,
      attendanceReferenceWageCents: 17_700
    })
  })

  it('制作不合格扣除提成、标准分钟时薪和胶水成本', () => {
    expect(calculateMakingDefectDeduction({
      unqualifiedQuantity: 3,
      pieceRateCents: 300,
      standardMakingMinutes: 12,
      hourlyWageCents: 2_000,
      glueDeductionCentsPerUnit: 50
    })).toEqual({
      unqualifiedQuantity: 3,
      commissionDeductionCents: 900,
      hourlyWageDeductionCents: 1_200,
      glueDeductionCents: 150,
      totalDeductionCents: 2_250
    })
  })

  it('捏毛装袋不合格按计划分钟比例扣除提成和时薪', () => {
    expect(calculateFluffingDefectDeduction({
      unqualifiedQuantity: 2,
      plannedQuantity: 6,
      plannedMinutes: 90,
      pieceRateCents: 100,
      hourlyWageCents: 2_000
    })).toEqual({
      unqualifiedQuantity: 2,
      deductedMinutes: 30,
      commissionDeductionCents: 200,
      hourlyWageDeductionCents: 1_000,
      glueDeductionCents: 0,
      totalDeductionCents: 1_200
    })
  })

  it('制作、捏毛装袋的返工或补发合格结果按新任务正常计提成，打包和发货不计提成', () => {
    expect(calculateQualifiedCommissionCents([
      { processType: 'making', qualifiedQuantity: 2, pieceRateCents: 300 },
      { processType: 'fluffing_bagging', qualifiedQuantity: 3, pieceRateCents: 100 },
      { processType: 'packing', qualifiedQuantity: 5, pieceRateCents: 500 },
      { processType: 'shipping', qualifiedQuantity: 5, pieceRateCents: 500 }
    ])).toBe(900)
  })

  it('默认抵扣上限取排班口径的扣前应发，按发生顺序扣除并将不足部分顺延', () => {
    const allocation = allocateDeductionsInOccurrenceOrder({
      scheduledPreDeductionWageCents: 1_000,
      deductions: [
        { id: 'deduction-2', occurredAt: '2026-09-07T10:00:00.000Z', remainingCents: 700 },
        { id: 'deduction-1', occurredAt: '2026-09-07T09:00:00.000Z', remainingCents: 700 }
      ]
    })

    expect(allocation).toEqual({
      totalRemainingDeductionCents: 1_400,
      deductionCapCents: 1_000,
      appliedDeductionCents: 1_000,
      carryoverDeductionCents: 400,
      allocations: [
        { deductionRecordId: 'deduction-1', appliedCents: 700, carryoverCents: 0 },
        { deductionRecordId: 'deduction-2', appliedCents: 300, carryoverCents: 400 }
      ]
    })
  })

  it('任何工资参考与最终实发都不允许为负数', () => {
    expect(calculateSettlementReferenceWages({
      scheduledMinutes: 30,
      attendanceMinutes: 0,
      hourlyWageCents: 2_000,
      qualifiedCommissionCents: 0,
      deductionCents: 9_999,
      otherAdjustmentCents: -3_000
    })).toMatchObject({
      scheduledReferenceWageCents: 0,
      attendanceReferenceWageCents: 0
    })
    expect(() => validateFinalPaidCents(-1)).toThrow('最终实发金额必须是非负整数分')
    expect(() => validateFinalPaidCents(0)).not.toThrow()
  })
})
