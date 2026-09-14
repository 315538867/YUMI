import { describe, expect, it } from 'vitest'
import { calculateExpectedWorkMinutes, calculateWorkTimeComparison } from './work-time'

describe('工时核对公式', () => {
  it('预计总分钟按完成数量与预计单件分钟求和', () => {
    const result = calculateExpectedWorkMinutes([
      { label: '商品 A', completedQuantity: 40, expectedMinutesPerUnit: 2 },
      { label: '商品 B', completedQuantity: 30, expectedMinutesPerUnit: 3 }
    ])
    expect(result.minutes).toBe(170)
    expect(result.expression).toBe(
      'Σ（商品 A完成数量 × 预计单件分钟 + 商品 B完成数量 × 预计单件分钟）'
    )
    expect(result.substitutedExpression).toBe('40 × 2 + 30 × 3 = 170')
  })

  it('时间差与预计效率按核算分钟计算，实际高于预计时只提示核对', () => {
    const comparison = calculateWorkTimeComparison({
      approvedMinutes: 240,
      items: [{ label: '商品 A', completedQuantity: 30, expectedMinutesPerUnit: 6 }]
    })
    expect(comparison.expectedMinutes.minutes).toBe(180)
    expect(comparison.differenceMinutes).toBe(60)
    expect(comparison.efficiency.basisPoints).toBe(7_500)
    expect(comparison.efficiency.display).toBe('75.00%')
    expect(comparison.needsAttention).toBe(true)
    expect(comparison.attentionMessage).toBe('实际用时高于预计，请核对')
  })

  it('实际低于预计时不提示核对，核算分钟为零时效率不可计算', () => {
    const faster = calculateWorkTimeComparison({
      approvedMinutes: 150,
      items: [{ label: '商品 A', completedQuantity: 30, expectedMinutesPerUnit: 6 }]
    })
    expect(faster.differenceMinutes).toBe(-30)
    expect(faster.needsAttention).toBe(false)
    expect(faster.attentionMessage).toBeNull()

    const zero = calculateWorkTimeComparison({ approvedMinutes: 0, items: [] })
    expect(zero.expectedMinutes.minutes).toBe(0)
    expect(zero.efficiency.status).toBe('not_computable')
    expect(zero.efficiency.display).toBe('—')
    expect(zero.differenceMinutes).toBe(0)
    expect(zero.needsAttention).toBe(false)
  })

  it('拒绝负数输入', () => {
    expect(() =>
      calculateExpectedWorkMinutes([
        { label: '商品 A', completedQuantity: -1, expectedMinutesPerUnit: 1 }
      ])
    ).toThrow('完成数量必须是非负整数')
    expect(() => calculateWorkTimeComparison({ approvedMinutes: -1, items: [] })).toThrow(
      '核算分钟必须是非负整数'
    )
  })
})
