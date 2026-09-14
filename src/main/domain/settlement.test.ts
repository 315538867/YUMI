import { describe, expect, it } from 'vitest'
import {
  allocateDeductionsInOccurrenceOrder,
  calculateDefaultDeductionCapCents,
  calculateMakingMaterialDeductionCents,
  calculatePreDeductionWageCents,
  calculateQualifiedCommissionCents,
  calculateTimedWageCents,
  calculateWorkTimeAdjustmentCents,
  validateFinalPaidCents
} from './settlement'

describe('V2 兼职工资结算领域规则', () => {
  it('制作按合格数量计件、捏毛装袋与缝边按完成数量计件，打包发货不计提成', () => {
    expect(
      calculateQualifiedCommissionCents([
        { processType: 'making', qualifiedQuantity: 18, pieceRateCents: 300 },
        { processType: 'fluffing_bagging', qualifiedQuantity: 20, pieceRateCents: 85 },
        { processType: 'edge_sewing', qualifiedQuantity: 12, pieceRateCents: 100 },
        { processType: 'packing', qualifiedQuantity: 30, pieceRateCents: 500 }
      ])
    ).toBe(18 * 300 + 20 * 85 + 12 * 100)
  })

  it('制作不合格只按冻结材料成本扣款，不含提成扣回或制作时薪', () => {
    expect(
      calculateMakingMaterialDeductionCents({
        unqualifiedQuantity: 3,
        materialPriceMicroYuanPerGram: 3_400,
        unitWeightMilligrams: 25_000
      })
    ).toBe(26)
    expect(() =>
      calculateMakingMaterialDeductionCents({
        unqualifiedQuantity: 0,
        materialPriceMicroYuanPerGram: 3_400,
        unitWeightMilligrams: 25_000
      })
    ).toThrow('不合格数量必须是正整数')
  })

  it('计时工资按整段核算分钟和冻结时薪在分边界计算', () => {
    expect(calculateTimedWageCents({ minutes: 240, hourlyWageCents: 3_000 })).toBe(12_000)
    expect(calculateTimedWageCents({ minutes: 30, hourlyWageCents: 1_001 })).toBe(501)
  })

  it('已结算工时差异调整使用原工时冻结时薪计算正负金额', () => {
    expect(
      calculateWorkTimeAdjustmentCents({
        originalMinutes: 240,
        correctedMinutes: 210,
        hourlyWageCentsSnapshot: 3_000
      })
    ).toBe(-1_500)
    expect(
      calculateWorkTimeAdjustmentCents({
        originalMinutes: 240,
        correctedMinutes: 260,
        hourlyWageCentsSnapshot: 1_001
      })
    ).toBe(334)
    expect(() =>
      calculateWorkTimeAdjustmentCents({
        originalMinutes: 240,
        correctedMinutes: 240,
        hourlyWageCentsSnapshot: 3_000
      })
    ).toThrow('更正核算分钟必须与原核算分钟不同')
  })

  it('唯一候选应发为计时工资加计件提成与调整，且不为负', () => {
    expect(
      calculatePreDeductionWageCents({
        timedWageCents: 12_000,
        commissionCents: 1_700,
        adjustmentCents: -1_500,
        otherAdjustmentCents: 200
      })
    ).toBe(12_400)
    expect(
      calculatePreDeductionWageCents({
        timedWageCents: 0,
        commissionCents: 0,
        adjustmentCents: -1_500,
        otherAdjustmentCents: 0
      })
    ).toBe(0)
  })

  it('按发生顺序抵扣待抵扣扣款，未抵完部分原样顺延且不留负工资', () => {
    const result = allocateDeductionsInOccurrenceOrder({
      preDeductionWageCents: 1_000,
      deductions: [
        { id: 'later', occurredAt: '2026-09-10T00:00:00.000Z', remainingCents: 400 },
        { id: 'earlier', occurredAt: '2026-09-08T00:00:00.000Z', remainingCents: 900 }
      ]
    })
    expect(result.allocations).toEqual([
      { deductionRecordId: 'earlier', appliedCents: 900, carryoverCents: 0 },
      { deductionRecordId: 'later', appliedCents: 100, carryoverCents: 300 }
    ])
    expect(result.appliedDeductionCents).toBe(1_000)
    expect(result.carryoverDeductionCents).toBe(300)
    expect(calculateDefaultDeductionCapCents(1_000)).toBe(1_000)
    expect(() => validateFinalPaidCents(-1)).toThrow('最终实发金额必须是非负整数分')
    expect(() => validateFinalPaidCents(0)).not.toThrow()
  })
})
